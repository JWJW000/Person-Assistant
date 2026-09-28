import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/index.js';
import { TicketWatchService, isRelease } from '../src/services/ticketWatch.js';
import type { TicketQuery, TrainTicket } from '@assistant/contracts';

const query: TicketQuery = {
  date: '2026-09-30',
  timezone: 'Asia/Shanghai',
  from: { kind: 'station', name: '北京南', code: 'VNP' },
  to: { kind: 'station', name: '上海虹桥', code: 'AOH' },
  trainTypes: [],
  departMinutes: [0, 1440],
  onlyAvailable: false,
  sort: 'departure'
};

function ticket(availability: TrainTicket['seats'][number]['availability'], count: number | null = null): TrainTicket {
  return {
    id: 't1',
    trainCode: 'G1',
    trainNo: '24000000G1',
    from: { name: '北京南', code: 'VNP' },
    to: { name: '上海虹桥', code: 'AOH' },
    departureAt: '2026-09-30T09:00:00+08:00',
    arrivalAt: '2026-09-30T13:28:00+08:00',
    durationMinutes: 268,
    dayDiff: 0,
    seats: [{ kind: '二等座', availability, count, priceMinor: 55300, currency: 'CNY' }]
  };
}

function service(tickets: TrainTicket[] | (() => TrainTicket[])) {
  const db = new Database(':memory:');
  migrate(db);
  let now = Date.parse('2026-09-28T02:00:00Z');
  const searches: TicketQuery[] = [];
  const trains = {
    async search(next: TicketQuery) {
      searches.push(next);
      return { tickets: typeof tickets === 'function' ? tickets() : tickets };
    }
  };
  const watches = new TicketWatchService(db, trains, { now: () => now });
  return {
    searches,
    watches,
    advance(ms: number) {
      now += ms;
    }
  };
}

describe('ticket watch release detection', () => {
  it('does not treat an already available seat as a new release', () => {
    expect(isRelease('available', ticket('available', 3).seats[0])).toBe(false);
    expect(isRelease('sold_out', ticket('available', 2).seats[0])).toBe(true);
    expect(isRelease(null, ticket('sold_out').seats[0])).toBe(false);
  });

  it('records a hit only after a sold-out seat becomes available', async () => {
    let soldOut = true;
    const { searches, watches, advance } = service(() => [ticket(soldOut ? 'sold_out' : 'available', soldOut ? 0 : 4)]);
    const created = watches.create({ deviceId: 'dev_1', trainCode: 'G1', query, seatKind: '二等座', intervalMs: 60_000 });
    expect(created?.status).toBe('active');

    expect(await watches.tick()).toBe(1);
    expect(watches.list('dev_1')[0].status).toBe('active');
    expect(watches.list('dev_1')[0].lastAvailability).toBe('sold_out');
    expect(searches[0].onlyAvailable).toBe(false);
    expect(searches[0].departMinutes).toEqual([0, 1440]);

    soldOut = false;
    advance(60_000);
    expect(await watches.tick()).toBe(1);
    const hit = watches.list('dev_1')[0];
    expect(hit.status).toBe('hit');
    expect(hit.hit?.count).toBe(4);
    expect(hit.hit?.seatKind).toBe('二等座');

    expect(await watches.tick()).toBe(0);
    watches.ack('dev_1', hit.id);
    expect(watches.list('dev_1')[0].status).toBe('stopped');
  });

  it('expires a watch once the departure date has passed', async () => {
    const { watches, advance } = service([]);
    watches.create({ deviceId: 'dev_1', trainCode: 'G1', query, seatKind: '二等座' });
    advance(4 * 24 * 3600 * 1000);
    expect(await watches.tick()).toBe(1);
    expect(watches.list('dev_1')[0].status).toBe('expired');
  });
});
