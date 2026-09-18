import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  TrainTicket,
  Seat,
  SeatAvailability
} from '@assistant/contracts';

export interface McpBridgeOptions {
  command?: string;
  args?: string[];
  entrypoint?: string;
  callTimeoutMs?: number;
  minIntervalMs?: number;
}

// 原始 12306 MCP 返回的数据结构定义 (JWJW000/12306-mcp)
export interface Raw12306Price {
  seat_type?: string;
  seat_name?: string;
  price?: number | string;
  num?: string | number;
}

export interface Raw12306TicketInfo {
  train_no: string;
  start_train_code: string;
  from_station_name?: string;
  from_station?: string;
  from_station_telecode?: string;
  to_station_name?: string;
  to_station?: string;
  to_station_telecode?: string;
  start_time: string; // HH:mm
  arrive_time: string; // HH:mm
  lishi: string; // HH:mm
  start_train_date?: string; // yyyyMMdd
  prices?: Raw12306Price[];
}

export class McpBridgeError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'McpBridgeError';
  }
}

export class McpBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private lastCallTime = 0;
  private connecting: Promise<void> | null = null;

  constructor(private options: McpBridgeOptions = {}) {}

  public async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async doConnect(): Promise<void> {
    const command = this.options.command || 'node';
    const args = this.options.args || (this.options.entrypoint ? [this.options.entrypoint] : []);

    try {
      this.transport = new StdioClientTransport({
        command,
        args,
        env: {
          // 仅传递安全的受控环境变量
          NODE_ENV: 'production',
          PATH: process.env.PATH || ''
        }
      });

      this.client = new Client(
        {
          name: 'assistant-12306-bridge',
          version: '0.1.0'
        },
        {
          capabilities: {}
        }
      );

      await this.client.connect(this.transport);
    } catch (err: any) {
      throw new McpBridgeError('MCP_UNAVAILABLE', `无法启动或连接 MCP 进程: ${err?.message || err}`);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
      }
    } finally {
      this.transport = null;
      this.client = null;
    }
  }

  public async listTools(): Promise<string[]> {
    if (!this.client) {
      throw new McpBridgeError('MCP_UNAVAILABLE', 'MCP 桥接尚未连接');
    }
    const res = await this.client.listTools();
    return res.tools.map((t) => t.name);
  }

  public async getTickets(
    fromStation: string,
    toStation: string,
    date: string
  ): Promise<TrainTicket[]> {
    // 速率控制
    const minInterval = this.options.minIntervalMs ?? 1000;
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < minInterval) {
      await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
    }
    this.lastCallTime = Date.now();

    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new McpBridgeError('MCP_UNAVAILABLE', 'MCP 桥接尚未连接');
    }

    let response: any;
    try {
      response = await this.callGetTickets(fromStation, toStation, date);
    } catch (err: any) {
      // MCP 子进程可能已崩溃或 stdio 已失效，重建连接后重试一次
      await this.disconnect();
      try {
        await this.connect();
        response = await this.callGetTickets(fromStation, toStation, date);
      } catch (retryErr: any) {
        await this.disconnect();
        throw new McpBridgeError('MCP_UNAVAILABLE', `调用 MCP 失败: ${retryErr?.message || retryErr}`, true);
      }
    }

    return McpBridge.parseTicketsResponse(response, date);
  }

  private async callGetTickets(fromStation: string, toStation: string, date: string): Promise<any> {
    if (!this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new McpBridgeError('MCP_UNAVAILABLE', 'MCP 桥接尚未连接');
    }
    return this.client.callTool({
      name: 'get-tickets',
      arguments: {
        fromStation,
        toStation,
        date,
        format: 'json',
        limitedNum: 0
      }
    });
  }

  /**
   * 静态解析方法：解析 12306-mcp 工具返回，包含规范化与容错
   */
  public static parseTicketsResponse(response: any, queryDate: string): TrainTicket[] {
    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new McpBridgeError('MCP_SCHEMA_MISMATCH', 'MCP 返回内容格式无效');
    }

    // 检查是否有错误
    if (response.isError) {
      const errText = response.content.map((c: any) => c.text || '').join('\n');
      if (errText.includes("reading 'result'") || errText.includes('data failed')) {
        throw new McpBridgeError('UPSTREAM_BLOCKED', `12306 暂未开放 ${queryDate} 的车票预售或该日期无开行计划（全国火车票最长预售期通常为 15 天）`);
      }
      throw new McpBridgeError('UPSTREAM_BLOCKED', `12306-mcp 上游返回错误: ${errText}`);
    }

    // 检查 content[].text 中的直接错误文本
    const combinedText = response.content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => c.text)
      .join('\n');

    if (combinedText.includes("reading 'result'") || combinedText.includes('data failed')) {
      throw new McpBridgeError('UPSTREAM_BLOCKED', `12306 暂未开放 ${queryDate} 的车票预售或该日期无开行计划（全国火车票最长预售期通常为 15 天）`);
    }

    if (combinedText.startsWith('Error:') || combinedText.includes('网络忙') || combinedText.includes('操作过于频繁')) {
      throw new McpBridgeError('UPSTREAM_BLOCKED', `12306 上游错误提示: ${combinedText}`);
    }

    let rawList: Raw12306TicketInfo[] = [];
    try {
      const parsed = JSON.parse(combinedText);
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed && Array.isArray(parsed.data)) {
        rawList = parsed.data;
      } else {
        throw new Error('未包含车次列表数组');
      }
    } catch (err: any) {
      throw new McpBridgeError(
        'MCP_SCHEMA_MISMATCH',
        `无法将 MCP 返回解析为 JSON: ${err?.message || err}\n文本预览: ${combinedText.slice(0, 200)}`
      );
    }

    return rawList.map((item, index) => McpBridge.normalizeTicket(item, queryDate, index));
  }

  public static normalizeTicket(raw: Raw12306TicketInfo, queryDate: string, index: number): TrainTicket {
    const seats: Seat[] = (raw.prices || []).map((p) => {
      const availability = McpBridge.parseSeatAvailability(p.num);
      const count = typeof p.num === 'number' ? p.num : /^\d+$/.test(String(p.num)) ? parseInt(String(p.num), 10) : null;
      const priceMinor = McpBridge.parsePriceMinor(p.price);

      return {
        kind: p.seat_name || p.seat_type || '其他',
        availability,
        count,
        priceMinor,
        currency: 'CNY',
        rawLabel: String(p.num ?? '')
      };
    });

    const [startH = 0, startM = 0] = (raw.start_time || '00:00').split(':').map(Number);
    const [arriveH = 0, arriveM = 0] = (raw.arrive_time || '00:00').split(':').map(Number);
    const [lishiH = 0, lishiM = 0] = (raw.lishi || '00:00').split(':').map(Number);

    const durationMinutes = lishiH * 60 + lishiM;

    // 始发与到达 ISO 计算 (以 Asia/Shanghai 时区固定计算)
    const departureAt = `${queryDate}T${raw.start_time}:00+08:00`;

    // 跨天判断: 历时或到站小时数计算
    let dayDiff = 0;
    const depTotalMin = startH * 60 + startM;
    const arrTotalMin = arriveH * 60 + arriveM;
    if (depTotalMin + durationMinutes >= 1440 || arrTotalMin < depTotalMin) {
      dayDiff = Math.floor((depTotalMin + durationMinutes) / 1440) || 1;
    }

    // 计算到达日期
    const [year, month, day] = queryDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    dateObj.setUTCDate(dateObj.getUTCDate() + dayDiff);
    const arrYear = dateObj.getUTCFullYear();
    const arrMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const arrDay = String(dateObj.getUTCDate()).padStart(2, '0');
    const arrivalAt = `${arrYear}-${arrMonth}-${arrDay}T${raw.arrive_time}:00+08:00`;

    return {
      id: `${raw.train_no || raw.start_train_code}_${index}`,
      trainCode: raw.start_train_code,
      trainNo: raw.train_no,
      from: {
        name: raw.from_station_name || raw.from_station || '',
        code: raw.from_station_telecode || ''
      },
      to: {
        name: raw.to_station_name || raw.to_station || '',
        code: raw.to_station_telecode || ''
      },
      departureAt,
      arrivalAt,
      durationMinutes,
      dayDiff,
      seats
    };
  }

  public static parseSeatAvailability(num: string | number | undefined): SeatAvailability {
    if (num === undefined || num === null) return 'unknown';
    const s = String(num).trim();
    if (s === '有' || s === '充足') return 'available';
    if (/^\d+$/.test(s)) {
      return parseInt(s, 10) > 0 ? 'available' : 'sold_out';
    }
    if (s === '无' || s === '0') return 'sold_out';
    if (s === '候补' || s === '*') return 'waitlist';
    if (s === '--' || s === '无此席别') return 'not_applicable';
    return 'unknown';
  }

  public static parsePriceMinor(price: string | number | undefined): number | null {
    if (price === undefined || price === null) return null;
    const n = typeof price === 'number' ? price : parseFloat(String(price).replace(/[¥￥,]/g, ''));
    if (isNaN(n) || n < 0) return null;
    return Math.round(n * 100);
  }
}
