import { TicketQuery, TrainTicket, TicketResult, Coverage } from '@assistant/contracts';
import { McpBridge } from '@assistant/mcp-bridge';

// 常用城市车站映射字典 (当用户输入城市名时展开站对)
export const CITY_STATION_MAP: Record<string, string[]> = {
  '北京': ['北京', '北京南', '北京西', '北京朝阳', '北京丰台'],
  '上海': ['上海', '上海虹桥', '上海南'],
  '广州': ['广州', '广州南', '广州东', '广州白云'],
  '深圳': ['深圳', '深圳北'],
  '洛阳': ['洛阳', '洛阳龙门'],
  '郑州': ['郑州', '郑州东'],
  '杭州': ['杭州', '杭州东', '杭州西'],
  '南京': ['南京', '南京南'],
  '武汉': ['武汉', '汉口', '武昌'],
  '成都': ['成都东', '成都南', '成都西'],
  '西安': ['西安', '西安北'],
  '重庆': ['重庆北', '重庆西', '沙坪坝']
};

export interface TrainServiceOptions {
  maxStationPairs?: number;
  cacheTtlSeconds?: number;
}

export class TrainService {
  private cache = new Map<string, { result: TicketResult; expiresAt: number }>();

  constructor(
    private mcpBridge: McpBridge,
    private options: TrainServiceOptions = {}
  ) {}

  public resolveStations(name: string): string[] {
    const trimmed = name.trim();
    if (CITY_STATION_MAP[trimmed]) {
      return CITY_STATION_MAP[trimmed];
    }
    // 如果是单个车站或未在字典中，作为单个站点返回
    return [trimmed];
  }

  public generateStationPairs(
    fromNames: string[],
    toNames: string[]
  ): Array<{ from: string; to: string }> {
    const pairs: Array<{ from: string; to: string }> = [];
    for (const f of fromNames) {
      for (const t of toNames) {
        if (f !== t) {
          pairs.push({ from: f, to: t });
        }
      }
    }
    return pairs;
  }

  public async search(
    query: TicketQuery,
    runId: string,
    options: { bypassCache?: boolean; origin?: 'live' | 'fixture' } = {}
  ): Promise<TicketResult> {
    const maxPairs = this.options.maxStationPairs ?? 12;
    const cacheTtl = (this.options.cacheTtlSeconds ?? 30) * 1000;

    // 缓存 Key: date + from + to + timezone
    const cacheKey = `${query.date}_${query.from.name}_${query.to.name}`;
    if (!options.bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.result,
          runId,
          origin: 'cache'
        };
      }
    }

    const queryStartedAt = new Date().toISOString();
    const fromStations = query.from.selectedStationCodes && query.from.selectedStationCodes.length > 0
      ? query.from.selectedStationCodes
      : this.resolveStations(query.from.name);

    const toStations = query.to.selectedStationCodes && query.to.selectedStationCodes.length > 0
      ? query.to.selectedStationCodes
      : this.resolveStations(query.to.name);

    const pairs = this.generateStationPairs(fromStations, toStations);
    if (pairs.length > maxPairs) {
      throw new Error(`车站组合过多 (${pairs.length} > ${maxPairs})，请指定具体车站`);
    }

    const allTickets: TrainTicket[] = [];
    const stationDetails: Coverage['stationDetails'] = [];
    let succeededPairs = 0;
    let failedPairs = 0;

    // 串行查询站对
    for (const pair of pairs) {
      try {
        const tickets = await this.mcpBridge.getTickets(pair.from, pair.to, query.date);
        allTickets.push(...tickets);
        succeededPairs++;
        stationDetails.push({
          from: pair.from,
          to: pair.to,
          status: tickets.length > 0 ? 'ok' : 'empty'
        });
      } catch (err: any) {
        failedPairs++;
        stationDetails.push({
          from: pair.from,
          to: pair.to,
          status: 'failed',
          message: err?.message || String(err)
        });
      }
    }

    if (succeededPairs === 0 && pairs.length > 0) {
      throw new Error('所有站对查询均失败，未能获取任何车次数据');
    }

    // 去重: 按 日期 + trainCode + from + to
    const uniqueMap = new Map<string, TrainTicket>();
    for (const t of allTickets) {
      const uKey = `${t.departureAt}_${t.trainCode}_${t.from.name}_${t.to.name}`;
      if (!uniqueMap.has(uKey)) {
        uniqueMap.set(uKey, t);
      }
    }

    // 过滤与排序
    const filteredTickets = this.filterAndSort(Array.from(uniqueMap.values()), query);

    const coverageStatus: Coverage['status'] =
      failedPairs === 0 ? 'complete' : succeededPairs > 0 ? 'partial' : 'failed';

    const result: TicketResult = {
      schemaVersion: 1,
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      runId,
      query,
      tickets: filteredTickets,
      fetchedAt: new Date().toISOString(),
      queryStartedAt,
      source: 'mcp:12306',
      coverage: {
        status: coverageStatus,
        requestedPairs: pairs.length,
        succeededPairs,
        failedPairs,
        stationDetails
      },
      origin: options.origin || 'live',
      warnings: failedPairs > 0 ? [`部分站对查询遇到问题 (${failedPairs}/${pairs.length})`] : [],
      parentResultId: null
    };

    // 存入短期内存缓存
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + cacheTtl
    });

    return result;
  }

  public filterAndSort(tickets: TrainTicket[], query: TicketQuery): TrainTicket[] {
    const [minDepart, maxDepart] = query.departMinutes;

    return tickets
      .filter((t) => {
        // 车次类型筛选 (如 G, D, C, Z, T, K)
        if (query.trainTypes && query.trainTypes.length > 0) {
          const typeCode = t.trainCode.charAt(0).toUpperCase();
          if (!query.trainTypes.includes(typeCode)) {
            return false;
          }
        }

        // 出发时间范围分钟筛选
        const depTime = new Date(t.departureAt);
        // 基于 +08:00 提取出发分钟
        const hours = depTime.getUTCHours() + 8; // 时区调整
        const depMin = (hours % 24) * 60 + depTime.getUTCMinutes();
        if (depMin < minDepart || depMin > maxDepart) {
          return false;
        }

        // 仅有票过滤
        if (query.onlyAvailable) {
          const hasAvailable = t.seats.some((s) => s.availability === 'available');
          if (!hasAvailable) return false;
        }

        // 特定席别有票偏好过滤 (如 seatPreference = '二等座')
        if (query.seatPreference) {
          const targetSeat = t.seats.find((s) => s.kind.includes(query.seatPreference!));
          if (targetSeat && targetSeat.availability !== 'available') {
            // 如果指定了仅看该席别有票，则过滤
            if (query.onlyAvailable) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (query.sort === 'departure') {
          return new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime();
        }
        if (query.sort === 'arrival') {
          return new Date(a.arrivalAt).getTime() - new Date(b.arrivalAt).getTime();
        }
        if (query.sort === 'duration') {
          return a.durationMinutes - b.durationMinutes;
        }
        return 0;
      });
  }
}
