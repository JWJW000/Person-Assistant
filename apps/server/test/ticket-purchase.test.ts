import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/index.js';
import { OFFICIAL_PAY_URL, TicketPurchaseService, officialPayLink } from '../src/services/ticketPurchase.js';
import type { TicketQuery } from '@assistant/contracts';

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

function service() {
  const db = new Database(':memory:');
  migrate(db);
  return new TicketPurchaseService(db);
}

describe('ticket purchase', () => {
  it('stops at awaiting hold when a ticket is found and never claims it was issued', () => {
    const purchases = service();
    const created = purchases.create({
      deviceId: 'dev_1',
      trainCode: 'G1',
      query,
      seatKind: '二等座',
      accountRef: 'self'
    });
    expect(created?.phase).toBe('searching');
    const found = purchases.markTicketFound('dev_1', created!.id);
    expect(found.phase).toBe('awaiting_hold');
    expect(found.payUrl).toBeNull();
    expect(found.issued).toBe(false);

    const held = purchases.attemptHold('dev_1', created!.id);
    expect(held.phase).toBe('blocked');
    expect(held.detail).toContain('不能占座');

    const confirmed = purchases.confirmForUserPay('dev_1', created!.id, '张三');
    expect(confirmed.phase).toBe('blocked');
    expect(confirmed.payUrl).toBeNull();
  });

  it('confirms the passenger and leaves payment on the official page', () => {
    const purchases = service();
    const created = purchases.create({ deviceId: 'dev_1', trainCode: 'G1', query, seatKind: '二等座', accountRef: 'self' })!;
    const confirmed = purchases.confirmForUserPay('dev_1', created.id, '张三');
    expect(confirmed.phase).toBe('user_pay');
    expect(confirmed.payUrl).toBeNull();
    expect(confirmed.issued).toBe(false);
    expect(confirmed.detail).toContain('不收款');
  });

  it('opens only the official 12306 pay page after a real order number', () => {
    const purchases = service();
    const created = purchases.create({ deviceId: 'dev_1', trainCode: 'G1', query, accountRef: 'self' })!;
    expect(() => purchases.attachOfficialOrder('dev_1', created.id, 'fake')).toThrow(/订单号/);
    expect(officialPayLink('')).toBeNull();

    const ready = purchases.attachOfficialOrder('dev_1', created.id, 'E123456789');
    expect(ready.phase).toBe('pay_ready');
    expect(ready.payUrl).toBe(OFFICIAL_PAY_URL);
    expect(ready.issued).toBe(false);

    const checked = purchases.refreshOrder('dev_1', created.id);
    expect(checked.phase).toBe('unpaid');
    expect(checked.issued).toBe(false);
    expect(checked.detail).toContain('不能显示已支付');
  });
});
