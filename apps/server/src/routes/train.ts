import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { McpBridge } from '@assistant/mcp-bridge';
import {
  AgentRuntime,
  isOnSale,
  maxOnSaleDate,
  saleOpensOn,
  sameWeekdayOnOrBefore
} from '@assistant/agent-runtime';
import type { TrainTicket } from '@assistant/contracts';

interface TrainQueryRequestBody {
  userMessage?: string;
  from?: string;
  to?: string;
  date?: string;
  via?: string;
  history?: Array<{ text?: string; content?: string; role?: string }>;
  userProfile?: string;
}

const SAME_STATION_MINUTES = 25;
const CROSS_STATION_MINUTES = 60;
const MAX_LAYOVER_MINUTES = 240;

function stationKey(name: string): string {
  return name.replace(/站$/, '').trim();
}

function cheapestSeat(ticket: TrainTicket) {
  const priced = ticket.seats.filter((seat) => seat.priceMinor != null && seat.availability === 'available');
  const pool = priced.length ? priced : ticket.seats.filter((seat) => seat.priceMinor != null);
  if (!pool.length) return undefined;
  return pool.reduce((best, seat) => ((seat.priceMinor ?? Infinity) < (best.priceMinor ?? Infinity) ? seat : best));
}

/** 只保留接得上的两段真实车次。席别、张数和价格各自保留，不合成一张假票。 */
export function pairTransferLegs(first: TrainTicket[], second: TrainTicket[], hub: string): TrainTicket[] {
  const pairs: TrainTicket[] = [];
  for (const leg1 of first) {
    if (leg1.scheduleReference) continue;
    const arrive = Date.parse(leg1.arrivalAt);
    if (Number.isNaN(arrive)) continue;
    const sameStation = stationKey(leg1.to.name) === stationKey(second[0]?.from.name || hub);
    const minimum = sameStation ? SAME_STATION_MINUTES : CROSS_STATION_MINUTES;
    const next = second
      .filter((leg2) => !leg2.scheduleReference)
      .map((leg2) => ({ leg2, wait: (Date.parse(leg2.departureAt) - arrive) / 60000 }))
      .filter((item) => item.wait >= minimum && item.wait <= MAX_LAYOVER_MINUTES)
      .sort((a, b) => a.wait - b.wait)[0];
    if (!next) continue;
    const waitMinutes = Math.round(next.wait);
    const leg2 = next.leg2;
    const firstSeat = cheapestSeat(leg1);
    const secondSeat = cheapestSeat(leg2);
    const soldOut = [leg1, leg2].some((leg) => !leg.seats.some((seat) => seat.availability === 'available'));
    pairs.push({
      id: `transfer-${leg1.trainCode}-${leg2.trainCode}-${hub}`,
      trainCode: `${leg1.trainCode}→${leg2.trainCode}`,
      trainNo: `${leg1.trainNo}_${leg2.trainNo}`,
      from: leg1.from,
      to: leg2.to,
      departureAt: leg1.departureAt,
      arrivalAt: leg2.arrivalAt,
      durationMinutes: leg1.durationMinutes + leg2.durationMinutes + waitMinutes,
      dayDiff: leg1.dayDiff + leg2.dayDiff,
      seats: [leg1, leg2].map((leg, index) => {
        const seat = index === 0 ? firstSeat : secondSeat;
        return {
          kind: `${leg.trainCode} ${seat?.kind || '席别待查'}`,
          availability: seat?.availability || 'unknown',
          count: seat?.count ?? null,
          priceMinor: seat?.priceMinor ?? null,
          currency: 'CNY' as const
        };
      }),
      matchLabels: [
        `经由${hub}`,
        sameStation ? `同站候${waitMinutes}分` : `跨站候${waitMinutes}分`,
        ...(soldOut ? ['有一段无票'] : [])
      ],
      isTransfer: true,
      transferHub: hub
    });
  }
  return pairs.sort((a, b) => a.durationMinutes - b.durationMinutes).slice(0, 2);
}

export async function findTransferRoutes(
  from: string,
  to: string,
  date: string,
  mcpBridge: McpBridge,
  preferredHub?: string
): Promise<TrainTicket[]> {
  const hubs = preferredHub
    ? [preferredHub]
    : ['郑州东', '武汉', '西安北', '南京南', '徐州东', '石家庄', '合肥南', '南昌西', '长沙南', '成都东'].filter(
        (hub) => hub !== from && hub !== to && !from.includes(hub) && !to.includes(hub)
      );

  for (const hub of hubs.slice(0, preferredHub ? 1 : 2)) {
    try {
      const [first, second] = await Promise.all([
        mcpBridge.getTickets(from, hub, date),
        mcpBridge.getTickets(hub, to, date)
      ]);
      const pairs = pairTransferLegs(first, second, hub);
      if (pairs.length) return pairs;
    } catch (error) {
      console.warn(`中转查询 ${hub} 失败:`, error);
    }
  }
  return [];
}

export function registerTrainRoutes(
  app: FastifyInstance,
  mcpBridge: McpBridge,
  agentRuntime: AgentRuntime
): void {
  app.post('/internal/train/query', async (req: FastifyRequest<{ Body: TrainQueryRequestBody }>, reply: FastifyReply) => {
    try {
      const { userMessage, from, to, date, via, history, userProfile } = req.body || {};
      const currentDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

      let queryFrom = from;
      let queryTo = to;
      let queryDate = date;
      let afterHour: number | undefined = undefined;
      let beforeHour: number | undefined = undefined;
      let preference: string | undefined = undefined;

      // 1. 全面优先由大模型进行自然语言意图理解与参数抽取 (LLM 提取)
      if (!queryFrom || !queryTo || !queryDate) {
        if (userMessage && userMessage.trim()) {
          try {
            const normalizedHistory = history?.map((h) => ({ role: h.role || 'user', text: h.text, content: h.content }));
            const llmExtracted = await agentRuntime.extractQueryWithLlm(userMessage, currentDate, normalizedHistory);
            if (llmExtracted) {
              queryFrom = queryFrom || llmExtracted.from;
              queryTo = queryTo || llmExtracted.to;
              queryDate = queryDate || llmExtracted.date;
              afterHour = llmExtracted.afterHour;
              beforeHour = llmExtracted.beforeHour;
              preference = llmExtracted.preference;
            }
          } catch (e) {
            console.warn('大模型参数抽取异常:', e);
          }
        }
      }

      // 从 history 逆向扫描继承 from, to, date 兜底
      if ((!queryFrom || !queryTo || !queryDate) && history && history.length > 0) {
        for (let i = history.length - 1; i >= 0; i--) {
          const txt = String(history[i]?.text || history[i]?.content || '');
          const m = txt.match(/出发城市[:：]\s*([\u4e00-\u9fa5]{2,6})[，,]\s*到达城市[:：]\s*([\u4e00-\u9fa5]{2,6})(?:[，,]\s*日期[:：]\s*(\d{4}-\d{2}-\d{2}))?/);
          if (m) {
            queryFrom = queryFrom || m[1];
            queryTo = queryTo || m[2];
            queryDate = queryDate || m[3];
            break;
          }
          const m2 = txt.match(/([\u4e00-\u9fa5]{2,6})(?:到|至|去)([\u4e00-\u9fa5]{2,6})/);
          if (m2) {
            queryFrom = queryFrom || m2[1];
            queryTo = queryTo || m2[2];
          }
        }
      }

      // 从 userProfile (USER.md) 继承常驻城市偏好与出发习惯
      if (!queryFrom && userProfile) {
        const cityMatch = userProfile.match(/常用常驻城市[:：]\s*([\u4e00-\u9fa5]{2,6})|常驻(?:城市)?[:：]?\s*([\u4e00-\u9fa5]{2,6})/);
        if (cityMatch) {
          queryFrom = cityMatch[1] || cityMatch[2];
        }
      }
      if (afterHour === undefined && userProfile && !/早上|上午|早班/.test(userMessage || '')) {
        if (/午后|下午|12:00之后|12点之后/.test(userProfile)) {
          afterHour = 12;
        }
      }

      // 2. 本地规则快速兜底
      if (!queryFrom || !queryTo || !queryDate) {
        if (userMessage) {
          const compact = userMessage.replace(/\s+/g, '').replace(/[，,。.；;！!？?、：:（）()【】\[\]"'“”]/g, '');
          const routeText = compact.replace(AgentRuntime.TIME_WORDS, '');
          const routeMatch =
            routeText.match(/从([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6}?)(?:的|高铁|动车|火车|列车|车次|车票|票|班次|时刻|有票|余票|票价|查票|查询|查|与|和|及|$)/) ||
            routeText.match(/([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6}?)(?:的|高铁|动车|火车|列车|车次|车票|票|班次|时刻|有票|余票|票价|查票|查询|查|与|和|及|$)/) ||
            routeText.match(/从([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6})/) ||
            routeText.match(/([\u4e00-\u9fa5]{2,6}?)(?:到|至|去)([\u4e00-\u9fa5]{2,6})/);
          if (routeMatch) {
            queryFrom = queryFrom || routeMatch[1];
            queryTo = queryTo || routeMatch[2];
          } else {
            const fromMatch = routeText.match(/从([\u4e00-\u9fa5]{2,6})/);
            if (fromMatch) queryFrom = queryFrom || fromMatch[1];
            const toMatch = routeText.match(/(?:到|至|去)([\u4e00-\u9fa5]{2,6})/);
            if (toMatch) queryTo = queryTo || toMatch[1];
          }
        }
        const parsedQuery = agentRuntime.parseQueryFromText(userMessage || '', currentDate);
        queryDate = queryDate || parsedQuery?.date || currentDate;
      }

      // 深度清洗站名，去除意外带入的动词、连词及修饰后缀 (如 "上海的高铁车次与" -> "上海")
      const cleanStation = (name?: string) =>
        String(name || '')
          .replace(/(?:的|高铁|动车|火车|列车|车次|车票|余票|票价|班次|时刻|与|和|及).*$/, '')
          .replace(/^[号日从去坐乘坐到至在]+/, '')
          .replace(/[有票吗呢吧了站市县区]+$/, '')
          .trim();

      const cleanedFrom = cleanStation(queryFrom);
      const cleanedTo = cleanStation(queryTo);

      // 若仍无法推导出明确的出发地或到达地，阻断隐式默认北京/上海，向调用方要求澄清
      if (!cleanedFrom || !cleanedTo) {
        return reply.status(200).send({
          success: false,
          requiresClarification: true,
          message: '请说明出发城市与到达城市'
        });
      }

      queryFrom = cleanedFrom;
      queryTo = cleanedTo;

      if (!queryDate) {
        queryDate = currentDate;
      }

      // 规则提取时间偏好兜底
      if (afterHour === undefined && userMessage) {
        const afterMatch = userMessage.match(/(\d{1,2})[点时:：](?:[0-9]{2})?之[后后以]|(\d{1,2})点半之[后后以]/);
        if (afterMatch) {
          afterHour = parseInt(afterMatch[1] || afterMatch[2], 10);
        } else if (/下午/.test(userMessage)) {
          afterHour = 12;
        } else if (/晚上|傍晚/.test(userMessage)) {
          afterHour = 18;
        }
      }

      if (beforeHour === undefined && userMessage) {
        const beforeMatch = userMessage.match(/(\d{1,2})[点时:：](?:[0-9]{2})?之[前前以]|(\d{1,2})点半之[前前以]/);
        if (beforeMatch) {
          beforeHour = parseInt(beforeMatch[1] || beforeMatch[2], 10);
        } else if (/早[上晨]|上午/.test(userMessage)) {
          beforeHour = 12;
        }
      }

      if (!preference && userMessage) {
        if (/最快|耗时最短|短|速度快/.test(userMessage)) {
          preference = 'fastest';
        } else if (/便宜|低价|省钱|经济/.test(userMessage)) {
          preference = 'cheapest';
        }
      }

      // 3. 智能判断是否超出 12306 预售期（预售期通常为 15 天）
      const onSale = isOnSale(queryDate, currentDate);
      let searchedDate = queryDate;
      let isScheduleReference = false;
      let saleOpensDate = '';

      if (!onSale) {
        isScheduleReference = true;
        saleOpensDate = saleOpensOn(queryDate);
        const limit = maxOnSaleDate(currentDate);
        searchedDate = sameWeekdayOnOrBefore(queryDate, limit);
        if (searchedDate < currentDate) searchedDate = currentDate;
      }

      // 4. 执行 12306 MCP 查询
      let tickets = await mcpBridge.getTickets(queryFrom, queryTo, searchedDate);

      // 如果是未开售的推算时刻，将车票时间对齐映射到目标日期
      if (isScheduleReference && tickets.length > 0) {
        tickets = tickets.map((t) => ({
          ...t,
          departureAt: t.departureAt ? queryDate + t.departureAt.slice(10) : t.departureAt,
          arrivalAt: t.arrivalAt ? queryDate + t.arrivalAt.slice(10) : t.arrivalAt,
          scheduleReference: true,
          referenceDate: searchedDate,
          matchLabels: Array.from(new Set([...(t.matchLabels || []), '时刻参考', '同星期几推算']))
        }));
      }

      // 4.1 根据用户的时间偏好或属性偏好对车次进行筛选和重排序
      if (tickets.length > 0) {
        let filtered = tickets;
        if (afterHour !== undefined && !isNaN(afterHour)) {
          const matched = filtered.filter((t) => {
            const depTime = t.departureAt ? t.departureAt.slice(11, 16) : '';
            const h = parseInt(depTime.split(':')[0], 10);
            return !isNaN(h) && h >= afterHour!;
          });
          if (matched.length > 0) filtered = matched;
        }
        if (beforeHour !== undefined && !isNaN(beforeHour)) {
          const matched = filtered.filter((t) => {
            const depTime = t.departureAt ? t.departureAt.slice(11, 16) : '';
            const h = parseInt(depTime.split(':')[0], 10);
            return !isNaN(h) && h < beforeHour!;
          });
          if (matched.length > 0) filtered = matched;
        }

        // 排序偏好
        if (preference === 'fastest') {
          filtered.sort((a, b) => (a.durationMinutes || 0) - (b.durationMinutes || 0));
        } else if (preference === 'cheapest') {
          filtered.sort((a, b) => {
            const minPrice = (t: TrainTicket) => {
              const prices = (t.seats || []).map((s) => s.priceMinor || 999999).filter((p) => p > 0);
              return prices.length > 0 ? Math.min(...prices) : 999999;
            };
            return minPrice(a) - minPrice(b);
          });
        }

        tickets = filtered;
      }

      // 5. 中转方案补充：用户询问中转，或直达车少于 3 趟时，自动组合中转联程方案
      const wantsTransfer = /(?:中转|换乘|转车|经由|怎么转|没直达|无直达)/.test(userMessage || '');
      let transferTickets: TrainTicket[] = [];
      let usedTransferHub: string | undefined = undefined;

      if (wantsTransfer || tickets.length < 3) {
        try {
          transferTickets = await findTransferRoutes(queryFrom, queryTo, searchedDate, mcpBridge);
          if (transferTickets.length > 0) {
            usedTransferHub = transferTickets[0].transferHub;
            if (isScheduleReference) {
              transferTickets = transferTickets.map((t) => ({
                ...t,
                departureAt: t.departureAt ? queryDate + t.departureAt.slice(10) : t.departureAt,
                arrivalAt: t.arrivalAt ? queryDate + t.arrivalAt.slice(10) : t.arrivalAt,
                scheduleReference: true,
                referenceDate: searchedDate
              }));
            }
          }
        } catch (e) {
          console.warn('查找中转方案异常:', e);
        }
      }

      const allMergedTickets = [...tickets, ...transferTickets];

      return {
        success: true,
        from: queryFrom,
        to: queryTo,
        date: queryDate,
        scheduleReference: isScheduleReference,
        referenceDate: searchedDate,
        saleOpensOn: isScheduleReference ? saleOpensDate : undefined,
        isTransfer: transferTickets.length > 0,
        transferHub: usedTransferHub,
        count: allMergedTickets.length,
        tickets: allMergedTickets.slice(0, 15) // 返回前 15 趟最匹配车次
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '12306 MCP 查询失败';
      return reply.status(500).send({
        success: false,
        error: errorMsg
      });
    }
  });
}
