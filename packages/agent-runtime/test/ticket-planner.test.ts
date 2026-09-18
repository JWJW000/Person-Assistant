import { describe, it, expect, vi } from 'vitest';
import { TicketQuery } from '@assistant/contracts';
import {
  addDays,
  extractPreferences,
  isOnSale,
  maxOnSaleDate,
  planTickets,
  rankTickets,
  sameWeekdayOnOrBefore,
  weekdayName
} from '../src/ticket-planner.js';
import { AgentRuntime } from '../src/index.js';

const baseQuery: TicketQuery = {
  date: '2026-10-18',
  timezone: 'Asia/Shanghai',
  from: { kind: 'city', name: '北京' },
  to: { kind: 'city', name: '洛阳' },
  trainTypes: ['G', 'D', 'C'],
  departMinutes: [0, 1440],
  onlyAvailable: false,
  sort: 'departure'
};

function ticket(partial: {
  code: string;
  dep: string;
  duration: number;
  available?: boolean;
  price?: number;
}) {
  return {
    id: partial.code,
    trainCode: partial.code,
    trainNo: partial.code,
    from: { name: '北京西', code: 'BXP' },
    to: { name: '洛阳龙门', code: 'LLF' },
    departureAt: partial.dep,
    arrivalAt: partial.dep,
    durationMinutes: partial.duration,
    dayDiff: 0,
    seats: [
      {
        kind: '二等座',
        availability: partial.available === false ? 'sold_out' : 'available',
        count: partial.available === false ? 0 : 12,
        priceMinor: (partial.price ?? 400) * 100,
        currency: 'CNY' as const
      }
    ]
  };
}

describe('ticket planner', () => {
  it('treats a month-ahead date as not on sale and picks the same weekday in the window', () => {
    expect(isOnSale('2026-10-18', '2026-09-18')).toBe(false);
    expect(maxOnSaleDate('2026-09-18')).toBe('2026-10-02');
    expect(weekdayName('2026-10-18')).toBe('日');
    expect(sameWeekdayOnOrBefore('2026-10-18', '2026-10-02')).toBe('2026-09-27');
  });

  it('ranks morning trains first when the user asks for 上午', () => {
    const prefs = extractPreferences('上午出发的高铁', baseQuery);
    const ranked = rankTickets(
      [
        ticket({ code: 'G1', dep: '2026-09-20T16:00:00+08:00', duration: 180 }),
        ticket({ code: 'G2', dep: '2026-09-20T08:10:00+08:00', duration: 200 }),
        ticket({ code: 'G3', dep: '2026-09-20T21:00:00+08:00', duration: 190 })
      ],
      prefs
    );
    expect(ranked[0].trainCode).toBe('G2');
    expect(ranked[0].matchLabels).toContain('上午');
  });

  it('parses 一个月后 as about 30 days later', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    const query = runtime.parseQueryFromText('查一个月后北京到洛阳的高铁', '2026-09-18');
    expect(query.date).toBe(addDays('2026-09-18', 30));
    expect(query.from.name).toBe('北京');
    expect(query.to.name).toBe('洛阳');
  });

  it('searches a same-weekday proxy date when the requested day is not on sale', async () => {
    const search = vi.fn().mockResolvedValue({
      id: 'res_1',
      runId: 'run_1',
      query: { ...baseQuery, date: '2026-09-27' },
      tickets: [
        ticket({ code: 'G651', dep: '2026-09-27T06:38:00+08:00', duration: 200 })
      ],
      fetchedAt: '2026-09-18T00:00:00Z',
      queryStartedAt: '2026-09-18T00:00:00Z',
      source: 'mcp:12306',
      coverage: { status: 'complete', requestedPairs: 1, succeededPairs: 1, failedPairs: 0, stationDetails: [] },
      origin: 'live',
      warnings: [],
      parentResultId: null
    });

    const result = await planTickets({
      query: baseQuery,
      userMessage: '查一个月后北京到洛阳上午的高铁',
      currentDate: '2026-09-18',
      search
    });

    expect(search).toHaveBeenCalled();
    expect(search.mock.calls[0][0].date).toBe('2026-09-27');
    expect(result.planning?.mode).toBe('schedule_reference');
    expect(result.planning?.requestedDate).toBe('2026-10-18');
    expect(result.tickets[0].scheduleReference).toBe(true);
    expect(result.warnings.join('')).toMatch(/尚未开售/);
  });
});
