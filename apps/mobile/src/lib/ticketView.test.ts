import { describe, expect, it } from 'vitest';
import type { TrainTicket } from '@assistant/contracts';
import { compareTickets, hasAvailableSeat, seatLabel } from './ticketView';

function ticket(id: string, departure: string, duration: number, price: number | null, availability: TrainTicket['seats'][number]['availability']): TrainTicket {
  return {
    id,
    trainCode: id,
    trainNo: id,
    from: { name: '北京南', code: 'VNP' },
    to: { name: '上海虹桥', code: 'AOH' },
    departureAt: departure,
    arrivalAt: departure,
    durationMinutes: duration,
    dayDiff: 0,
    seats: [{ kind: '二等座', availability, count: availability === 'available' ? 2 : null, priceMinor: price, currency: 'CNY' }]
  };
}

describe('ticket view', () => {
  it('does not call unknown availability sold out', () => {
    expect(seatLabel({ kind: '二等', availability: 'unknown', count: null, priceMinor: null, currency: 'CNY' })).toBe('未知');
    expect(seatLabel({ kind: '二等', availability: 'available', count: null, priceMinor: 100, currency: 'CNY' })).toBe('有');
    expect(seatLabel({ kind: '二等', availability: 'sold_out', count: 0, priceMinor: 100, currency: 'CNY' })).toBe('无');
  });

  it('filters sold-out trains and sorts by the cheapest available price', () => {
    const tickets = [
      ticket('late', '2026-09-30T18:00:00+08:00', 300, 40000, 'available'),
      ticket('cheap', '2026-09-30T12:00:00+08:00', 400, 20000, 'available'),
      ticket('gone', '2026-09-30T08:00:00+08:00', 100, 10000, 'sold_out')
    ];
    expect(tickets.filter(hasAvailableSeat).map((item) => item.id)).toEqual(['late', 'cheap']);
    expect([...tickets].sort(compareTickets('price')).map((item) => item.id)).toEqual(['cheap', 'late', 'gone']);
    expect([...tickets].sort(compareTickets('duration')).map((item) => item.id)[0]).toBe('gone');
  });
});
