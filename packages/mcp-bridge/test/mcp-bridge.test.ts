import { describe, it, expect } from 'vitest';
import { McpBridge, McpBridgeError } from '../src/index.js';

describe('MCP Bridge Normalization & Error Parsing', () => {
  it('parses valid 12306 JSON response wrapped in content[].text', () => {
    const rawResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              train_no: '240000G12300',
              start_train_code: 'G123',
              from_station_name: '北京南',
              to_station_name: '上海虹桥',
              start_time: '08:00',
              arrive_time: '12:30',
              lishi: '04:30',
              prices: [
                { seat_type: '二等座', price: 553, num: '有' },
                { seat_type: '一等座', price: 930, num: 0 },
                { seat_type: '商务座', price: 1748, num: '候补' },
                { seat_type: '无座', price: 553, num: '--' }
              ]
            }
          ])
        }
      ]
    };

    const tickets = McpBridge.parseTicketsResponse(rawResponse, '2026-09-30');
    expect(tickets).toHaveLength(1);
    const t = tickets[0];
    expect(t.trainCode).toBe('G123');
    expect(t.durationMinutes).toBe(270);
    expect(t.departureAt).toBe('2026-09-30T08:00:00+08:00');
    expect(t.arrivalAt).toBe('2026-09-30T12:30:00+08:00');
    expect(t.dayDiff).toBe(0);

    const [second, first, biz, noSeat] = t.seats;
    expect(second.availability).toBe('available');
    expect(second.priceMinor).toBe(55300);

    expect(first.availability).toBe('sold_out');
    expect(biz.availability).toBe('waitlist');
    expect(noSeat.availability).toBe('not_applicable');
  });

  it('handles cross-day tickets correctly', () => {
    const rawResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              train_no: '240000Z12300',
              start_train_code: 'Z123',
              from_station_name: '北京西',
              to_station_name: '广州',
              start_time: '23:30',
              arrive_time: '07:30',
              lishi: '08:00',
              prices: []
            }
          ])
        }
      ]
    };

    const tickets = McpBridge.parseTicketsResponse(rawResponse, '2026-09-30');
    expect(tickets[0].dayDiff).toBe(1);
    expect(tickets[0].arrivalAt).toBe('2026-10-01T07:30:00+08:00');
  });

  it('detects Error: text even when isError is not true', () => {
    const rawResponse = {
      content: [
        {
          type: 'text',
          text: 'Error: 当前查询车站过多或操作过于频繁，请稍后再试'
        }
      ]
    };

    expect(() => McpBridge.parseTicketsResponse(rawResponse, '2026-09-30')).toThrowError(
      McpBridgeError
    );
  });

  it('throws MCP_SCHEMA_MISMATCH on corrupt JSON text', () => {
    const rawResponse = {
      content: [
        {
          type: 'text',
          text: 'Not A Valid JSON Content'
        }
      ]
    };

    expect(() => McpBridge.parseTicketsResponse(rawResponse, '2026-09-30')).toThrowError(
      McpBridgeError
    );
  });
});
