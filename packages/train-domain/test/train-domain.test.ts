import { describe, it, expect, vi } from 'vitest';
import { TrainService } from '../src/index.js';
import { TrainTicket, TicketQuery } from '@assistant/contracts';

describe('TrainDomain Service', () => {
  const sampleTickets: TrainTicket[] = [
    {
      id: '1',
      trainCode: 'G101',
      trainNo: '240000G10100',
      from: { name: '北京南', code: 'VNP' },
      to: { name: '上海虹桥', code: 'AOH' },
      departureAt: '2026-09-30T07:00:00+08:00',
      arrivalAt: '2026-09-30T12:00:00+08:00',
      durationMinutes: 300,
      dayDiff: 0,
      seats: [
        { kind: '二等座', availability: 'available', count: 10, priceMinor: 55000, currency: 'CNY' }
      ]
    },
    {
      id: '2',
      trainCode: 'D202',
      trainNo: '240000D20200',
      from: { name: '北京南', code: 'VNP' },
      to: { name: '上海虹桥', code: 'AOH' },
      departureAt: '2026-09-30T14:00:00+08:00',
      arrivalAt: '2026-09-30T21:00:00+08:00',
      durationMinutes: 420,
      dayDiff: 0,
      seats: [
        { kind: '二等座', availability: 'sold_out', count: 0, priceMinor: 40000, currency: 'CNY' }
      ]
    }
  ];

  it('filters by train types and onlyAvailable', () => {
    const mockMcp: any = {
      getTickets: vi.fn().mockResolvedValue(sampleTickets)
    };
    const service = new TrainService(mockMcp);

    const query: TicketQuery = {
      date: '2026-09-30',
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: '北京' },
      to: { kind: 'city', name: '上海' },
      trainTypes: ['G'],
      departMinutes: [0, 1440],
      onlyAvailable: true,
      sort: 'departure'
    };

    const filtered = service.filterAndSort(sampleTickets, query);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trainCode).toBe('G101');
  });

  it('resolves city stations properly', () => {
    const service = new TrainService({} as any);
    const stations = service.resolveStations('洛阳');
    expect(stations).toContain('洛阳');
    expect(stations).toContain('洛阳龙门');
  });
});
