import { describe, expect, it } from 'vitest';
import { pairTransferLegs } from '../src/routes/train.js';
import type { TrainTicket } from '@assistant/contracts';

function leg(partial: Partial<TrainTicket> & Pick<TrainTicket, 'trainCode' | 'departureAt' | 'arrivalAt'>): TrainTicket {
  return {
    id: partial.trainCode,
    trainNo: partial.trainCode,
    from: { name: '北京南', code: 'VNP' },
    to: { name: '郑州东', code: 'ZAF' },
    durationMinutes: 120,
    dayDiff: 0,
    seats: [{ kind: '二等座', availability: 'sold_out', count: 0, priceMinor: 30000, currency: 'CNY' }],
    ...partial
  };
}

describe('pairTransferLegs', () => {
  it('keeps each leg seat instead of inventing one available ticket', () => {
    const first = [
      leg({
        trainCode: 'G1',
        to: { name: '郑州东', code: 'ZAF' },
        departureAt: '2026-09-30T08:00:00+08:00',
        arrivalAt: '2026-09-30T10:00:00+08:00',
        seats: [{ kind: '二等座', availability: 'sold_out', count: 0, priceMinor: 30000, currency: 'CNY' }]
      })
    ];
    const second = [
      leg({
        trainCode: 'G2',
        from: { name: '郑州东', code: 'ZAF' },
        to: { name: '洛阳龙门', code: 'LLF' },
        departureAt: '2026-09-30T10:40:00+08:00',
        arrivalAt: '2026-09-30T11:30:00+08:00',
        durationMinutes: 50,
        seats: [{ kind: '二等座', availability: 'available', count: 4, priceMinor: 8000, currency: 'CNY' }]
      })
    ];

    const [plan] = pairTransferLegs(first, second, '郑州东');
    expect(plan.seats.map((seat) => seat.availability)).toEqual(['sold_out', 'available']);
    expect(plan.seats[0].count).toBe(0);
    expect(plan.seats[1].count).toBe(4);
    expect(plan.seats[0].priceMinor).toBe(30000);
    expect(plan.matchLabels).toContain('有一段无票');
    expect(plan.matchLabels).toContain('同站候40分');
    expect(plan.durationMinutes).toBe(210);
  });

  it('drops a cross-station connection that leaves less than an hour', () => {
    const first = [
      leg({
        trainCode: 'G1',
        to: { name: '郑州', code: 'ZZF' },
        departureAt: '2026-09-30T08:00:00+08:00',
        arrivalAt: '2026-09-30T10:00:00+08:00'
      })
    ];
    const second = [
      leg({
        trainCode: 'G2',
        from: { name: '郑州东', code: 'ZAF' },
        to: { name: '洛阳龙门', code: 'LLF' },
        departureAt: '2026-09-30T10:40:00+08:00',
        arrivalAt: '2026-09-30T11:30:00+08:00'
      })
    ];
    expect(pairTransferLegs(first, second, '郑州东')).toEqual([]);
  });

  it('labels a viable cross-station transfer without pretending it is the same station', () => {
    const first = [
      leg({
        trainCode: 'G1',
        to: { name: '郑州', code: 'ZZF' },
        departureAt: '2026-09-30T08:00:00+08:00',
        arrivalAt: '2026-09-30T10:00:00+08:00'
      })
    ];
    const second = [
      leg({
        trainCode: 'G2',
        from: { name: '郑州东', code: 'ZAF' },
        to: { name: '洛阳龙门', code: 'LLF' },
        departureAt: '2026-09-30T11:10:00+08:00',
        arrivalAt: '2026-09-30T12:00:00+08:00',
        durationMinutes: 50,
        seats: [{ kind: '二等座', availability: 'available', count: 2, priceMinor: 8000, currency: 'CNY' }]
      })
    ];
    const [plan] = pairTransferLegs(first, second, '郑州东');
    expect(plan.matchLabels).toContain('跨站候70分');
    expect(plan.matchLabels?.join(' ')).not.toContain('同站');
  });
});
