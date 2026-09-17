import { describe, it, expect } from 'vitest';
import { TicketQuerySchema, TrainTicketSchema, RunEnvelopeEventSchema } from '../src/index.js';

describe('Contracts Validation', () => {
  it('validates a correct TicketQuery', () => {
    const query = {
      date: '2026-09-30',
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: '北京' },
      to: { kind: 'city', name: '洛阳' },
      trainTypes: ['G', 'D'],
      departMinutes: [360, 720],
      onlyAvailable: true,
      sort: 'departure'
    };
    const parsed = TicketQuerySchema.parse(query);
    expect(parsed.date).toBe('2026-09-30');
    expect(parsed.departMinutes).toEqual([360, 720]);
  });

  it('rejects invalid date format', () => {
    const query = {
      date: '2026/09/30',
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: '北京' },
      to: { kind: 'city', name: '洛阳' },
      trainTypes: [],
      departMinutes: [0, 1440],
      onlyAvailable: false,
      sort: 'departure'
    };
    expect(() => TicketQuerySchema.parse(query)).toThrow();
  });

  it('validates a TrainTicket and Seats', () => {
    const ticket = {
      id: 't-123',
      trainCode: 'G123',
      trainNo: '240000G12300',
      from: { name: '北京西', code: 'BXP' },
      to: { name: '洛阳龙门', code: 'LLF' },
      departureAt: '2026-09-30T08:00:00+08:00',
      arrivalAt: '2026-09-30T12:00:00+08:00',
      durationMinutes: 240,
      dayDiff: 0,
      seats: [
        {
          kind: '二等座',
          availability: 'available',
          count: 15,
          priceMinor: 38000,
          currency: 'CNY'
        }
      ]
    };
    const parsed = TrainTicketSchema.parse(ticket);
    expect(parsed.trainCode).toBe('G123');
    expect(parsed.seats[0].priceMinor).toBe(38000);
  });

  it('validates RunEnvelopeEvent', () => {
    const event = {
      v: 1,
      runId: 'r-001',
      seq: 1,
      type: 'run.started',
      occurredAt: '2026-09-16T10:00:00Z',
      payload: { runId: 'r-001' }
    };
    const parsed = RunEnvelopeEventSchema.parse(event);
    expect(parsed.seq).toBe(1);
    expect(parsed.type).toBe('run.started');
  });
});
