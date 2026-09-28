import { describe, it, expect } from 'vitest';
import { tryParseTicketsFromText, cleanDisplayContent } from './useTrainTicketParser';

describe('useTrainTicketParser', () => {
  it('parses tickets from text regex without hardcoded prices or dates', () => {
    const text = '推荐车次：G123 北京 08:30 到 上海 13:45';
    const tickets = tryParseTicketsFromText(text);

    expect(tickets.length).toBe(1);
    const ticket = tickets[0];
    expect(ticket.trainCode).toBe('G123');
    expect(ticket.from.name).toBe('北京');
    expect(ticket.to.name).toBe('上海');

    // 不包含旧版的硬编码日期 2026-09-20 (除非今天刚好是该日期)
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    expect(ticket.departureAt).toContain(today);

    // 席别为待查，无假模拟票价
    expect(ticket.seats).toHaveLength(1);
    expect(ticket.seats[0].kind).toBe('席别待查');
    expect(ticket.seats[0].availability).toBe('unknown');
    expect(ticket.seats[0].priceMinor).toBeNull();
    expect(ticket.seats[0].rawLabel).toBe('请以 12306 实时页面为准');
  });

  it('parses json tickets block directly when present', () => {
    const jsonBlock = '```json\n{"tickets": [{"id": "t1", "trainCode": "G1", "trainNo": "G1", "from": {"name": "北京", "code": "BJP"}, "to": {"name": "上海", "code": "SHH"}, "departureAt": "2026-10-01T09:00:00+08:00", "arrivalAt": "2026-10-01T13:30:00+08:00", "durationMinutes": 270, "dayDiff": 0, "seats": []}]}\n```';
    const tickets = tryParseTicketsFromText(jsonBlock);
    expect(tickets.length).toBe(1);
    expect(tickets[0].id).toBe('t1');
    expect(tickets[0].trainCode).toBe('G1');
  });

  it('cleans raw JSON ticket blocks from natural language markdown', () => {
    const raw = '为您查询到以下车次：\n```json\n[{"trainCode": "G1"}]\n```\n祝您旅途愉快！';
    const cleaned = cleanDisplayContent(raw);
    expect(cleaned).toBe('为您查询到以下车次：\n\n祝您旅途愉快！');
  });
});
