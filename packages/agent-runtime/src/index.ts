import { EventEmitter } from 'events';
import {
  TicketQuery,
  TicketResult,
  RunEnvelopeEvent,
  TicketQuerySchema
} from '@assistant/contracts';
import { TrainService } from '@assistant/train-domain';
import { LlmClient, LlmError, LlmMessage } from './llm.js';
import { addDays, extractPreferences, planTickets } from './ticket-planner.js';

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
  enabled?: boolean;
  timeoutMs?: number;
  temperature?: number;
  maxSummaryTickets?: number;
}

export type AgentRuntimeConfigProvider = () => AgentRuntimeConfig | Promise<AgentRuntimeConfig>;

interface LlmPlan {
  intent: 'train' | 'chat';
  query?: TicketQuery;
  via?: string;
  reply?: string;
}

export class AgentRuntime {
  constructor(
    private trainService: TrainService,
    private config: AgentRuntimeConfig | AgentRuntimeConfigProvider = {}
  ) {}

  private async resolveConfig(): Promise<AgentRuntimeConfig & { enabled: boolean }> {
    let raw: AgentRuntimeConfig = {};
    try {
      raw = typeof this.config === 'function' ? await this.config() : this.config;
    } catch {
      raw = {};
    }
    const configured = Boolean(raw.baseUrl && raw.apiKey && raw.modelId);
    return { ...raw, enabled: raw.enabled !== false && configured };
  }

  private buildClient(cfg: AgentRuntimeConfig): LlmClient {
    return new LlmClient({
      baseUrl: cfg.baseUrl as string,
      apiKey: cfg.apiKey as string,
      modelId: cfg.modelId as string,
      api: cfg.api || 'openai-completions',
      timeoutMs: cfg.timeoutMs ?? 30000,
      temperature: cfg.temperature ?? 0.2
    });
  }

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

    const cfg = await this.resolveConfig();
    const llm = cfg.enabled ? this.buildClient(cfg) : null;
    const warnings: string[] = [];
    const currentDate = options.currentDate || '2026-09-30';

    const inherited = this.inheritQueryFromHistory(
      userMessage,
      currentDate,
      options.history,
      options.baseQuery
    );
    const hasTrainHistory = Boolean(
      options.history?.some((h) => h.role === 'user' && this.detectTrainIntent(h.text))
    );
    // 会话里已经在查票时，默认继续查 12306；只有明显换话题才走闲聊。
    const shouldSearch =
      this.detectTrainIntent(userMessage) ||
      this.looksLikeTrainFollowup(userMessage, options.history) ||
      (hasTrainHistory && !this.isClearlyOffTopic(userMessage));

    let plan: LlmPlan | null = null;
    if (llm && shouldSearch) {
      try {
        plan = await this.llmPlan(llm, userMessage, currentDate, options.history, options.baseQuery);
      } catch (err: any) {
        plan = null;
        warnings.push(`模型解析失败，已回退本地规则解析 (${err?.message || err})`);
      }
    }

    const isTrainQuery =
      plan?.intent === 'train' || (shouldSearch && !this.isClearlyOffTopic(userMessage));

    if (isTrainQuery) {
      const toolCallId = `call_${Date.now()}`;
      await emit('tool.started', {
        toolCallId,
        toolName: 'train_search',
        argumentsSummary: '正在解析目的地并查询 12306 车次...'
      });

      try {
        const query =
          plan?.query ||
          inherited ||
          this.parseQueryFromText(userMessage, currentDate, options.baseQuery);
        const via =
          plan?.via || this.extractTransferVia(userMessage, options.history);
        const result = await planTickets({
          query,
          userMessage,
          currentDate,
          search: (q) => this.searchTickets(q, runId, via)
        });

        await emit('tool.completed', {
          toolCallId,
          toolName: 'train_search',
          status: 'success'
        });

        // 推送结果就绪事件
        await emit('result.ready', {
          resultId: result.id,
          kind: 'train.tickets',
          result
        });

        const count = result.tickets.length;
        const routeLabel = via
          ? `${query.from.name} → ${via} → ${query.to.name}`
          : `${query.from.name} 到 ${query.to.name}`;
        const planning = result.planning;
        let templateText: string;
        if (planning?.mode === 'schedule_reference') {
          templateText = count > 0
            ? `${planning.requestedDate} 的车票尚未开售（12306 通常提前 15 天，预计 ${planning.saleOpensOn} 起可买）。已按近期 ${planning.searchedDate}（同星期几）给出时刻参考，${routeLabel} 共 ${count} 趟。${planning.matchSummary || ''}卡片按您的需求排序，开售余票以 12306 为准。`
            : `${planning.requestedDate} 尚未开售，且近期同星期几也未查到 ${routeLabel} 的车次。`;
        } else {
          templateText = count > 0
            ? `为您查询到 ${query.date} ${routeLabel} 的车次共 ${count} 趟。${planning?.matchSummary ? planning.matchSummary + '。' : ''}已生成车票卡片供您查看与筛选。`
            : `抱歉，在 ${query.date} ${routeLabel} 未查询到符合条件的车次。`;
        }

        let summaryText = templateText;
        if (llm && count > 0) {
          try {
            summaryText = (await this.llmSummarizeStream(llm, cfg, userMessage, query, result, async (delta, acc) => {
              await emit('message.delta', {
                delta,
                fullText: acc
              });
            })) || templateText;
          } catch (err: any) {
            warnings.push(`模型总结失败，已使用默认文案 (${err?.message || err})`);
          }
        }

        await emit('message.completed', {
          messageId: `msg_${Date.now()}`,
          fullText: summaryText
        });

        await emit('run.completed', {
          runId,
          warnings: [...result.warnings, ...warnings]
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
      // 自由对话：启用实时流式输出
      let reply = '';
      if (llm) {
        try {
          reply = await this.llmChatStream(llm, userMessage, async (delta, acc) => {
            await emit('message.delta', {
              delta,
              fullText: acc
            });
          }, options.history);
        } catch (err: any) {
          warnings.push(`模型流式应答失败，尝试回退普通应答 (${err?.message || err})`);
          reply = plan?.reply || '';
        }
      } else {
        reply = plan?.reply || '';
      }

      if (!reply) {
        reply = `收到您的消息："${userMessage}"。我是您的个人助理，支持自由探讨、知识问答以及 12306 火车票查询。`;
      }

      const groundedQuery = inherited || this.inheritQueryFromHistory(
        userMessage,
        currentDate,
        options.history,
        options.baseQuery
      );
      if (groundedQuery && this.looksLikeInventedTimetable(reply)) {
        warnings.push('闲聊回复疑似编造车次时刻，已改为 12306 实时查询');
        const via = this.extractTransferVia(userMessage, options.history);
        const toolCallId = `call_${Date.now()}`;
        await emit('tool.started', {
          toolCallId,
          toolName: 'train_search',
          argumentsSummary: '检测到具体车次描述，改为查询 12306...'
        });
        try {
          const result = await this.searchTickets(groundedQuery, runId, via);
          await emit('tool.completed', { toolCallId, toolName: 'train_search', status: 'success' });
          await emit('result.ready', { resultId: result.id, kind: 'train.tickets', result });
          const count = result.tickets.length;
          const routeLabel = via
            ? `${groundedQuery.from.name} → ${via} → ${groundedQuery.to.name}`
            : `${groundedQuery.from.name} 到 ${groundedQuery.to.name}`;
          const fullText = count > 0
            ? `为您查询到 ${groundedQuery.date} ${routeLabel} 的车次共 ${count} 趟。已生成车票卡片供您查看与筛选。`
            : `抱歉，在 ${groundedQuery.date} ${routeLabel} 未查询到符合条件的车次。`;
          await emit('message.completed', { messageId: `msg_${Date.now()}`, fullText });
          await emit('run.completed', { runId, warnings: [...result.warnings, ...warnings] });
          return;
        } catch (err: any) {
          await emit('tool.completed', {
            toolCallId,
            toolName: 'train_search',
            status: 'error',
            error: err?.message || String(err)
          });
        }
      }

      await emit('message.completed', {
        messageId: `msg_${Date.now()}`,
        fullText: reply
      });
      await emit('run.completed', {
        runId,
        warnings
      });
    }
  }

  private static readonly PLAN_SYSTEM_PROMPT = `你是一个博学、亲切、全能的个人 AI 助理。你可以和用户自由畅聊任何话题（包括生活问答、天气建议、情感日常等）。
同时你内置了官方 12306 实时火车票查询引擎，查票是你的专业工具能力。

【多轮对话与上下文记忆规则（非常重要）】：
- 结合【前序对话历史】，理解用户指代。
- 如果前序对话中用户提到过出发地或目的地（例如“查明天北京到洛阳”），而当前提问省略了地名（例如“30号的呢”、“那后天呢”、“改查高铁”、“有硬卧吗”、“有其他方案吗”、“方案一给我具体的”），你必须【自动继承】上文的出发地、目的地和日期！不要重新问用户去哪里！
- 【重要时间规则】：如果用户指定了具体日期（含一个月后、下个月、国庆等），必须输出该真实日期，即使超过 12306 预售 15 天。系统会自动改查近期同星期几的时刻作为参考。只有用户说“往后什么时候有票”这类模糊时间时，才选今天往后 1~7 天内的日期。
- 只有在全流程完全没有提过地名、无法推导时，才要求用户提供。

【判断输出要求】：
1. 如果判断用户需要查火车/高铁（包含多轮继承过来的查票需求、中转方案、具体车次），输出 intent="train"，并解析出出发地、目的地、换算后的具体日期等。
2. 如果用户要中转/换乘/“不一定直达”/“方案一具体车次”，intent 仍为 train。若能确定中转站（如郑州东、石家庄），在 via 字段填写中转站名；不要编造车次号和票价。
3. 如果是日常闲聊、探讨问题，输出 intent="chat"。不要在 JSON 里写长回复，reply 可省略或留空。

只输出一个合法的 JSON 对象，不要输出任何代码块标签或多余文字。

JSON 结构规范：
{
  "intent": "train" 或 "chat",
  "date": "YYYY-MM-DD（结合历史推导）",
  "from": "出发站或城市名（结合历史推导）",
  "to": "到达站或城市名（结合历史推导）",
  "trainTypes": ["G","D","C"],
  "onlyAvailable": false,
  "via": "中转站名，直达时省略",
  "reply": "当 intent=chat 时给用户的完整、自然回复"
}

注意：用户问“有票吗 / 还有票吗”只是在询问余票情况，onlyAvailable 必须为 false，把有票和售罄的车次都查出来。只有用户明确说“只要有票 / 仅看有票”时才设 onlyAvailable=true。`;

  private async llmPlan(
    llm: LlmClient,
    userMessage: string,
    currentDate: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>,
    base?: TicketQuery
  ): Promise<LlmPlan> {
    const historyText = history && history.length > 0
      ? '【前序对话历史】\n' + history.map((h) => `${h.role === 'user' ? '用户' : '助理'}: ${h.text.slice(0, 400)}`).join('\n') + '\n\n'
      : '';

    const messages: LlmMessage[] = [
      { role: 'system', content: AgentRuntime.PLAN_SYSTEM_PROMPT },
      { role: 'user', content: `${historyText}【今天基准日期】${currentDate}\n【当前用户输入】${userMessage}` }
    ];

    const text = await llm.chat(messages, { temperature: 0 });
    const parsed = LlmClient.extractJson<any>(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new LlmError('RELAY_PROTOCOL_ERROR', `模型未返回可解析的 JSON: ${String(text).slice(0, 160)}`);
    }

    if (parsed.intent !== 'train') {
      const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
        ? parsed.reply.trim()
        : `收到您的消息："${userMessage}"。我是您的个人助理，支持火车票查询、条件筛选及车次收藏等功能。`;
      return { intent: 'chat', reply };
    }

    const from = AgentRuntime.cleanStationName(String(parsed.from || ''));
    const to = AgentRuntime.cleanStationName(String(parsed.to || ''));
    if (!from || !to) {
      throw new LlmError('RELAY_PROTOCOL_ERROR', '模型未能抽取出有效的出发/到达站');
    }

    const types = Array.isArray(parsed.trainTypes)
      ? parsed.trainTypes.map((t: any) => String(t)).filter((t: string) => /^[GDCZTK]$/i.test(t)).map((t: string) => t.toUpperCase())
      : [];

    const query = TicketQuerySchema.parse({
      date: AgentRuntime.normalizeDate(parsed.date, currentDate),
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: from },
      to: { kind: 'city', name: to },
      trainTypes: types,
      departMinutes: base?.departMinutes || [0, 1440],
      onlyAvailable: Boolean(parsed.onlyAvailable) || (base?.onlyAvailable ?? false),
      sort: base?.sort || 'departure'
    });
    const via = AgentRuntime.cleanStationName(String(parsed.via || ''));

    return { intent: 'train', query, via: via || undefined };
  }

  private static normalizeDate(raw: any, fallback: string): string {
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return s;
    }
    return fallback;
  }

  private async llmChat(llm: LlmClient, userMessage: string): Promise<string> {
    return this.llmChatStream(llm, userMessage, () => {});
  }

  private async llmChatStream(
    llm: LlmClient,
    userMessage: string,
    onDelta: (delta: string, accumulated: string) => Promise<void> | void,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): Promise<string> {
    const historyMessages: LlmMessage[] = (history || []).slice(-10).map((h) => ({
      role: h.role,
      content: h.text
    }));
    const text = await llm.chatStream(
      [
        {
          role: 'system',
          content:
            '你是一个智能、温暖、全能的个人 AI 助理。你可以回答用户的任何问题（科学、文学、编程、生活建议、情感问候等）。' +
            '请以自然流畅的中文回答，态度友好亲切。' +
            '严禁编造车次号、开点、到点或票价。如果用户在问出行方案、换乘或具体车次，不要用记忆里的时刻表作答，只说明需要查询 12306 实时余票。'
        },
        ...historyMessages,
        { role: 'user', content: userMessage }
      ],
      (delta, acc) => onDelta(delta, acc)
    );
    return String(text || '').trim();
  }

  private async llmSummarize(
    llm: LlmClient,
    cfg: AgentRuntimeConfig,
    userMessage: string,
    query: TicketQuery,
    result: TicketResult
  ): Promise<string> {
    return this.llmSummarizeStream(llm, cfg, userMessage, query, result, () => {});
  }

  private async llmSummarizeStream(
    llm: LlmClient,
    cfg: AgentRuntimeConfig,
    userMessage: string,
    query: TicketQuery,
    result: TicketResult,
    onDelta: (delta: string, accumulated: string) => Promise<void> | void
  ): Promise<string> {
    const maxTickets = cfg.maxSummaryTickets ?? 20;
    const brief = result.tickets.slice(0, maxTickets).map((t) => ({
      trainCode: t.trainCode,
      from: t.from.name,
      to: t.to.name,
      depart: t.departureAt.slice(11, 16),
      arrive: t.arrivalAt.slice(11, 16),
      durationMinutes: t.durationMinutes,
      seats: t.seats.map((s) => ({
        kind: s.kind,
        status: s.availability,
        left: s.count,
        priceCny: s.priceMinor != null ? Math.round(s.priceMinor / 100) : null
      }))
    }));

    const payload = {
      用户原话: userMessage,
      查询条件: {
        日期: query.date,
        出发: query.from.name,
        到达: query.to.name,
        车次类型: query.trainTypes,
        仅看有票: query.onlyAvailable
      },
      结果总数: result.tickets.length,
      覆盖状态: result.coverage.status,
      规划说明: result.planning || null,
      车次样例: brief
    };

    const text = await llm.chatStream(
      [
        {
          role: 'system',
          content:
            '你是火车票助手。根据给定的车次数据，用 2-3 句简洁的口语化中文向用户概括结果，例如出发/到达城市、日期、共多少趟、最早或最快的车次及其二等座票价。' +
            '只能使用数据中真实存在的信息，不要编造车次、票价或时间，不要输出 Markdown 标题、表格或列表。' +
            '如果结果里同时包含两段行程（出发地到中转站、中转站到目的地），请按两段分别概括，并提示用户查看下方车票卡片。' +
            '如果 warnings 或 planning.mode=schedule_reference，必须明确告知该日期尚未开售，卡片只是近期同星期几的时刻参考。'
        },
        { role: 'user', content: JSON.stringify(payload) }
      ],
      (delta, acc) => onDelta(delta, acc)
    );
    return String(text || '').trim();
  }

  public detectTrainIntent(text: string): boolean {
    const keywords = ['查票', '火车', '高铁', '动车', '车票', '去', '到', '票'];
    return keywords.some((k) => text.includes(k)) && (text.includes('到') || text.includes('去'));
  }

  public isClearlyOffTopic(text: string): boolean {
    const compact = text.replace(/\s+/g, '');
    if (!compact) return true;
    if (/^(谢谢|感谢|好的|嗯嗯?|哦|ok|收到|你好|在吗)[啊呀吧了！!。～~]*$/i.test(compact)) return true;
    if (
      /票|车|高铁|动车|火车|站|出发|到达|中转|换乘|方案|直达|卧|余票|车次|几点|号|明天|后天|今天|有没有|具体|其他|改签|行程/.test(
        text
      )
    ) {
      return false;
    }
    return /电影|小说|量子|物理|代码|编程|python|笑话|翻译|作文|数学|历史|英语/.test(text);
  }

  public looksLikeInventedTimetable(text: string): boolean {
    return /[GDCZTK]\d{2,4}/.test(text) && /(次|出发|到达|二等|一等|历时|高铁|动车)/.test(text);
  }

  private looksLikeTrainFollowup(
    text: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): boolean {
    if (!history || history.length === 0) return false;
    if (!history.some((h) => h.role === 'user' && this.detectTrainIntent(h.text))) return false;
    const compact = text.replace(/\s+/g, '');
    if (!compact || compact.length > 40) return false;
    const hints = [
      '呢', '票', '高铁', '动车', '硬卧', '二等', '一等', '后天', '明天', '今天', '号', '改', '有票', '卧铺',
      '方案', '中转', '换乘', '直达', '具体', '车次', '班次', '其他', '再查', '几点', '上午', '下午'
    ];
    return hints.some((h) => compact.includes(h));
  }

  public extractTransferVia(
    userMessage: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): string | null {
    const assistant = [...(history || [])].reverse().find((h) => h.role === 'assistant')?.text || '';
    const planNo = userMessage.match(/方案\s*([一二三123])/);
    let slice = assistant;
    if (planNo) {
      const idxMap: Record<string, string> = { '1': '一', '2': '二', '3': '三', 一: '一', 二: '二', 三: '三' };
      const label = `方案${idxMap[planNo[1]] || planNo[1]}`;
      const start = assistant.indexOf(label);
      if (start >= 0) {
        const next = assistant.indexOf('方案', start + label.length);
        slice = assistant.slice(start, next > 0 ? next : start + 240);
      }
    }
    const arrow = slice.match(
      /([\u4e00-\u9fa5]{2,8})\s*[→\-—－]\s*([\u4e00-\u9fa5]{2,8})\s*[→\-—－]\s*([\u4e00-\u9fa5]{2,8})/
    );
    if (arrow) {
      const via = AgentRuntime.cleanStationName(arrow[2]);
      if (via) return via;
    }
    const hubs = ['郑州东', '石家庄', '西安北', '济南西', '徐州东', '南京南', '合肥南', '武汉', '郑州'];
    for (const hub of hubs) {
      if (userMessage.includes(hub) || slice.includes(hub)) return hub;
    }
    return null;
  }

  private cloneQuery(query: TicketQuery, patch: Partial<{ from: string; to: string }>): TicketQuery {
    return TicketQuerySchema.parse({
      ...query,
      from: patch.from ? { kind: 'city', name: patch.from } : query.from,
      to: patch.to ? { kind: 'city', name: patch.to } : query.to
    });
  }

  private async searchTickets(query: TicketQuery, runId: string, via?: string | null): Promise<TicketResult> {
    const hub = via ? AgentRuntime.cleanStationName(via) : '';
    if (!hub || hub === query.from.name || hub === query.to.name) {
      return this.trainService.search(query, runId);
    }

    const leg1 = await this.trainService.search(this.cloneQuery(query, { to: hub }), runId);
    const leg2 = await this.trainService.search(this.cloneQuery(query, { from: hub }), runId);
    const tickets = [...leg1.tickets, ...leg2.tickets];
    return {
      ...leg1,
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      runId,
      query,
      tickets,
      warnings: [
        ...leg1.warnings,
        ...leg2.warnings,
        `已按中转站「${hub}」分别查询 ${query.from.name}→${hub} 与 ${hub}→${query.to.name}`
      ],
      coverage: {
        status:
          leg1.coverage.status === 'complete' && leg2.coverage.status === 'complete' ? 'complete' : 'partial',
        requestedPairs: leg1.coverage.requestedPairs + leg2.coverage.requestedPairs,
        succeededPairs: leg1.coverage.succeededPairs + leg2.coverage.succeededPairs,
        failedPairs: leg1.coverage.failedPairs + leg2.coverage.failedPairs,
        stationDetails: [...leg1.coverage.stationDetails, ...leg2.coverage.stationDetails]
      }
    };
  }

  public inheritQueryFromHistory(
    userMessage: string,
    currentDate: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>,
    base?: TicketQuery
  ): TicketQuery | null {
    if (!history || history.length === 0) return null;
    let acc: TicketQuery | null = base || null;
    let seenTrain = false;
    for (const h of history) {
      if (h.role !== 'user') continue;
      if (this.detectTrainIntent(h.text)) {
        acc = this.parseQueryFromText(h.text, acc?.date || currentDate, acc || undefined);
        seenTrain = true;
      } else if (seenTrain && acc) {
        acc = this.parseQueryFromText(h.text, acc.date, acc);
      }
    }
    if (!seenTrain || !acc) return null;
    return this.parseQueryFromText(userMessage, acc.date, acc);
  }

  public static resolveDayOfMonth(text: string, baseDate: string): string | null {
    const compact = text.replace(/\s+/g, '');
    const match = compact.match(/(\d{1,2})[日号]/);
    if (!match) return null;
    const day = Number(match[1]);
    if (day < 1 || day > 31) return null;
    const [y, m, d] = baseDate.split('-').map(Number);
    let year = y;
    let month = m || 1;
    if (day < (d || 1)) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCMonth() !== month - 1) return null;
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  public static resolveRelativeDate(text: string, baseDate: string): string {
    const relatives: Array<[string, number]> = [
      ['大后天', 3],
      ['后天', 2],
      ['明天', 1],
      ['明日', 1],
      ['今天', 0],
      ['今日', 0]
    ];
    const hit = relatives.find(([word]) => text.includes(word));
    if (!hit) return baseDate;

    const [y, m, d] = baseDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + hit[1]);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  // 站名前后常见的意图词/修饰词，需要剔除后再交给 12306 解析
  private static readonly LEAD_WORDS = /^(?:帮我|帮忙|我想|我要|我|麻烦|请问|请|查一下|查一查|查询|查|看看|看一下|看|来|想|要|从|坐|乘坐|去|出|在|号|日|问一下|问问)+/;
  private static readonly TAIL_WORDS = /(?:的高铁|的高客|的动车|的火车|的汽车|的飞机|高铁|动车|火车|汽车|飞机|车票|车次|列车|班次|机票|有余票|有没有票|还有票|有票|没票|无票|余票|票价|时刻表|时刻|车|票|有|站|市|县|区|吗|呢|吧|啊|呀|了|与|及|和|，|,|。|？|\?|！|!|\s)+$/;
  // 时间/日期修饰词 (支持空格分隔如 "30 号")
  private static readonly TIME_WORDS = /(?:\d{4}[年\-\/.]\s*\d{1,2}[月\-\/.]\s*\d{1,2}[日号]?|\d{1,2}[月\-\/.]\s*\d{1,2}[日号]?|\d{1,2}\s*[日号]|\d{1,2}[点时](?:\d{1,2}分?)?|\d{1,3}天后|一个?月后|1个?月后|下个月|大后天|后天|明天|明日|今天|今日|昨天|昨日|周[一二三四五六日天]|这周|下周|周末|上午|中午|下午|晚上|早上|凌晨|清晨|傍晚|白天)/g;

  public static cleanStationName(raw: string): string {
    let s = raw.trim();
    let prev = '';
    while (s && s !== prev) {
      prev = s;
      s = s.replace(AgentRuntime.LEAD_WORDS, '').replace(AgentRuntime.TAIL_WORDS, '');
    }
    s = s.replace(/(?:的|高铁|动车|火车|列车|车次|车票|余票|票价|班次|时刻|与|和|及).*$/, "")
         .replace(/^[号日从去坐乘坐到至在]+/, "")
         .replace(/[有票吗呢吧了站市县区]+$/, "");
    return s.trim();
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
      } else if (/一个?月后|1个?月后/.test(text)) {
        date = addDays(defaultDate, 30);
      } else if (/下个月/.test(text)) {
        const [y, m, d] = defaultDate.split('-').map(Number);
        let nm = (m || 1) + 1;
        let ny = y;
        if (nm > 12) {
          nm = 1;
          ny += 1;
        }
        const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
        date = `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d || 1, last)).padStart(2, '0')}`;
      } else {
        const daysLater = text.match(/(\d{1,3})\s*天后/);
        date = daysLater
          ? addDays(defaultDate, Number(daysLater[1]))
          : AgentRuntime.resolveDayOfMonth(text, defaultDate) ||
            AgentRuntime.resolveRelativeDate(text, defaultDate);
      }
    }

    let fromName = base?.from.name || '北京';
    let toName = base?.to.name || '上海';

    // 用于站名解析的归一化文本：先去除空格标点，再精准剔除时间词
    const compact = text.replace(/\s+/g, '').replace(/[，,。.；;！!？?、：:（）()【】\[\]"'“”]/g, '');
    const routeText = compact.replace(AgentRuntime.TIME_WORDS, '');

    // 匹配 "从X到Y" / "X到Y" / "X去Y"
    const routeMatch =
      routeText.match(/从([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6}?)(?:的|高铁|动车|火车|列车|车次|车票|票|班次|时刻|有票|余票|票价|查票|查询|查|与|和|及|$)/) ||
      routeText.match(/([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6}?)(?:的|高铁|动车|火车|列车|车次|车票|票|班次|时刻|有票|余票|票价|查票|查询|查|与|和|及|$)/) ||
      routeText.match(/从([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6})/) ||
      routeText.match(/([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6})/);
    if (routeMatch) {
      const cleanedFrom = AgentRuntime.cleanStationName(routeMatch[1]);
      const cleanedTo = AgentRuntime.cleanStationName(routeMatch[2]);
      if (cleanedFrom) fromName = cleanedFrom;
      if (cleanedTo) toName = cleanedTo;
    }

    const isHighSpeedOnly = text.includes('高铁') || text.includes('动车');
    // 「有票吗」是在问余票，不是“只显示有票车次”。仅明确筛选口吻才打开 onlyAvailable。
    const askingAvailability = /有票吗|有没有票|还有票吗|有余票吗/.test(text);
    const onlyAvailable = askingAvailability
      ? false
      : /只(看|要|显示)?有票|仅(看|显示)?有票|必须有票/.test(text) || (base?.onlyAvailable ?? false);
    const stub = TicketQuerySchema.parse({
      date,
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: fromName },
      to: { kind: 'city', name: toName },
      trainTypes: isHighSpeedOnly ? ['G', 'D', 'C'] : (base?.trainTypes || []),
      departMinutes: base?.departMinutes || [0, 1440],
      onlyAvailable,
      sort: base?.sort || 'departure'
    });
    const prefs = extractPreferences(text, stub);
    return TicketQuerySchema.parse({
      ...stub,
      departMinutes: prefs.departMinutes,
      seatPreference: prefs.seatPreference,
      sort: prefs.preferFastest ? 'duration' : stub.sort
    });
  }
}
