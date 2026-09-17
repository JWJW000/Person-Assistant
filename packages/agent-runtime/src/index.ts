import { EventEmitter } from 'events';
import {
  TicketQuery,
  TicketResult,
  RunEnvelopeEvent,
  TicketQuerySchema
} from '@assistant/contracts';
import { TrainService } from '@assistant/train-domain';

export interface AgentRunOptions {
  runId: string;
  userMessage: string;
  currentDate?: string; // 注入服务器当前日期 YYYY-MM-DD
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  baseQuery?: TicketQuery;
}

export interface AgentRuntimeConfig {
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
  api?: string;
}

export class AgentRuntime {
  constructor(
    private trainService: TrainService,
    private config: AgentRuntimeConfig = {}
  ) {}

  /**
   * 执行一次 Run，向外部输出标准化事件流
   */
  public async executeRun(
    options: AgentRunOptions,
    onEvent: (event: RunEnvelopeEvent) => Promise<void> | void
  ): Promise<void> {
    const { runId, userMessage } = options;
    let seq = 1;

    const emit = async (type: string, payload: Record<string, any>) => {
      const event: RunEnvelopeEvent = {
        v: 1,
        runId,
        seq: seq++,
        type,
        occurredAt: new Date().toISOString(),
        payload
      };
      await onEvent(event);
    };

    await emit('run.started', { runId });

    // 检查是否包含查票意图
    const isTrainQuery = this.detectTrainIntent(userMessage);

    if (isTrainQuery) {
      const toolCallId = `call_${Date.now()}`;
      await emit('tool.started', {
        toolCallId,
        toolName: 'train_search',
        argumentsSummary: '正在解析目的地并查询 12306 车次...'
      });

      try {
        const query = this.parseQueryFromText(userMessage, options.currentDate || '2026-09-30', options.baseQuery);
        const result = await this.trainService.search(query, runId);

        await emit('tool.completed', {
          toolCallId,
          toolName: 'train_search',
          status: 'success'
        });

        // 推送结果就绪事件
        await emit('result.ready', {
          resultId: result.id,
          kind: 'train.tickets'
        });

        // 简要文字总结
        const count = result.tickets.length;
        const summaryText = count > 0
          ? `为您查询到 ${query.date} 从 ${query.from.name} 到 ${query.to.name} 的车次共 ${count} 趟。已生成车票卡片供您查看与筛选。`
          : `抱歉，在 ${query.date} 从 ${query.from.name} 到 ${query.to.name} 未查询到符合条件的车次。`;

        await emit('message.completed', {
          messageId: `msg_${Date.now()}`,
          fullText: summaryText
        });

        await emit('run.completed', {
          runId,
          warnings: result.warnings
        });
      } catch (err: any) {
        await emit('tool.completed', {
          toolCallId,
          toolName: 'train_search',
          status: 'error',
          error: err?.message || String(err)
        });

        await emit('message.completed', {
          messageId: `msg_${Date.now()}`,
          fullText: `查询车次时遇到错误：${err?.message || '未知错误'}`
        });

        await emit('run.failed', {
          runId,
          code: 'UPSTREAM_BLOCKED',
          message: err?.message || String(err)
        });
      }
    } else {
      // 普通文本问答
      const reply = `收到您的消息："${userMessage}"。我是您的个人助理，支持火车票查询、条件筛选及车次收藏等功能。`;
      await emit('message.completed', {
        messageId: `msg_${Date.now()}`,
        fullText: reply
      });
      await emit('run.completed', {
        runId,
        warnings: []
      });
    }
  }

  public detectTrainIntent(text: string): boolean {
    const keywords = ['查票', '火车', '高铁', '动车', '车票', '去', '到', '票'];
    return keywords.some((k) => text.includes(k)) && (text.includes('到') || text.includes('去'));
  }

  public parseQueryFromText(text: string, defaultDate: string, base?: TicketQuery): TicketQuery {
    let date = defaultDate;
    const dateMatch = text.match(/(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})日?/);
    if (dateMatch) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, '0');
      const d = dateMatch[3].padStart(2, '0');
      date = `${y}-${m}-${d}`;
    } else {
      const shortMatch = text.match(/(\d{1,2})[月\-](\d{1,2})日?/);
      if (shortMatch) {
        const y = new Date().getFullYear();
        const m = shortMatch[1].padStart(2, '0');
        const d = shortMatch[2].padStart(2, '0');
        date = `${y}-${m}-${d}`;
      }
    }

    let fromName = base?.from.name || '北京';
    let toName = base?.to.name || '上海';

    // 匹配 "从 X 到 Y" 或 "X 到 Y"，过滤掉开头的标点/连接词及后缀修饰
    const routeMatch = text.match(/(?:从)?([\u4e00-\u9fa5]{2,6})(?:到|至|去)([\u4e00-\u9fa5]{2,6})/);
    if (routeMatch) {
      fromName = routeMatch[1].replace(/^(?:从|日从|日)/, '').replace(/站|市/, '');
      toName = routeMatch[2].replace(/(?:的高铁|的高客|的动车|的火车|火车|高铁|动车|车票|票|站|市)$/, '');
    }

    const isHighSpeedOnly = text.includes('高铁') || text.includes('动车');

    return TicketQuerySchema.parse({
      date,
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: fromName },
      to: { kind: 'city', name: toName },
      trainTypes: isHighSpeedOnly ? ['G', 'D', 'C'] : (base?.trainTypes || []),
      departMinutes: base?.departMinutes || [0, 1440],
      onlyAvailable: text.includes('有票') || (base?.onlyAvailable ?? false),
      sort: base?.sort || 'departure'
    });
  }
}
