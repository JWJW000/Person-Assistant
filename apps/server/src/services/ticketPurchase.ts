import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { TicketQuery } from '@assistant/contracts';

export const OFFICIAL_PAY_URL = 'https://kyfw.12306.cn/otn/leftTicket/init';

export type PurchasePhase = 'searching' | 'awaiting_hold' | 'user_pay' | 'pay_ready' | 'unpaid' | 'blocked';

export interface PurchaseRecord {
  id: string;
  device_id: string;
  train_code: string;
  from_name: string;
  to_name: string;
  seat_kind: string;
  query_json: string;
  phase: PurchasePhase;
  account_ref: string;
  order_no: string | null;
  pay_url: string | null;
  detail: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePurchaseInput {
  deviceId: string;
  trainCode: string;
  query: TicketQuery;
  seatKind?: string;
  accountRef?: string;
  passengerName?: string;
}

const ORDER_NO = /^[A-Z0-9]{8,32}$/;

/** 占座接口未接通。禁止把查到余票写成已经占座或已经出票。 */
export function holdSeat(): { ok: false; phase: 'blocked'; detail: string } {
  return {
    ok: false,
    phase: 'blocked',
    detail: '12306 没有公开的第三方占座接口，当前登录态也未跑通。不能占座，不能生成取票号。'
  };
}

export function officialPayLink(orderNo: string | null | undefined): string | null {
  if (!orderNo || !ORDER_NO.test(orderNo)) return null;
  return OFFICIAL_PAY_URL;
}

export class TicketPurchaseService {
  constructor(private db: Database.Database) {}

  create(input: CreatePurchaseInput) {
    const trainCode = input.trainCode.trim();
    if (!trainCode || !input.query?.date || !input.query.from?.name || !input.query.to?.name) {
      throw Object.assign(new Error('购票需要车次、日期和车站'), { statusCode: 400, code: 'INVALID_QUERY' });
    }
    const accountRef = (input.accountRef || '').trim();
    if (!accountRef) {
      throw Object.assign(new Error('只能使用本人 12306 账号，不能用别人的号'), { statusCode: 400, code: 'ACCOUNT_REQUIRED' });
    }
    const now = new Date().toISOString();
    const id = `buy_${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO ticket_purchases (
          id, device_id, train_code, from_name, to_name, seat_kind, query_json,
          phase, account_ref, detail, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?)`
      )
      .run(
        id,
        input.deviceId,
        trainCode,
        input.query.from.name,
        input.query.to.name,
        (input.seatKind || '').trim(),
        JSON.stringify(input.query),
        accountRef,
        '正在循环查票。查到余票后仍需本人账号占座，本应用不收款。',
        now,
        now
      );
    return this.getOwned(input.deviceId, id);
  }

  /** 应用只确认车次、席别和本人乘车人。付款留在 12306。 */
  confirmForUserPay(deviceId: string, id: string, passengerName: string) {
    const row = this.requireOwned(deviceId, id);
    const passenger = passengerName.trim();
    if (passenger.length < 2) {
      throw Object.assign(new Error('需要本人乘车人姓名'), { statusCode: 400, code: 'PASSENGER_REQUIRED' });
    }
    if (row.phase === 'blocked' || row.phase === 'pay_ready' || row.phase === 'unpaid') return this.public(row);
    const now = new Date().toISOString();
    const detail = `已确认 ${row.train_code} ${row.seat_kind || '席别待定'}，乘车人 ${passenger}。请在 12306 官方页自行支付，本应用不收款、不代付。`;
    this.db
      .prepare(`UPDATE ticket_purchases SET phase = 'user_pay', detail = ?, updated_at = ? WHERE id = ?`)
      .run(detail, now, id);
    return this.public(this.requireOwned(deviceId, id));
  }
  /** 余票出现后只进入待占座，不提交订单。 */
  markTicketFound(deviceId: string, id: string) {
    const row = this.requireOwned(deviceId, id);
    if (row.phase !== 'searching' && row.phase !== 'awaiting_hold') return this.public(row);
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE ticket_purchases SET phase = 'awaiting_hold', detail = ?, updated_at = ? WHERE id = ?`)
      .run('余票已查到。占座未执行：没有跑通的 12306 登录态。', now, id);
    return this.public(this.requireOwned(deviceId, id));
  }

  attemptHold(deviceId: string, id: string) {
    this.requireOwned(deviceId, id);
    const blocked = holdSeat();
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE ticket_purchases SET phase = 'blocked', pay_url = NULL, order_no = NULL, detail = ?, updated_at = ? WHERE id = ?`)
      .run(blocked.detail, now, id);
    return this.public(this.requireOwned(deviceId, id));
  }

  /** 只有外部回传的真实订单号才能打开官方支付页。不代付，不写出票。 */
  attachOfficialOrder(deviceId: string, id: string, orderNo: string) {
    this.requireOwned(deviceId, id);
    const payUrl = officialPayLink(orderNo.trim());
    if (!payUrl) {
      throw Object.assign(new Error('没有真实 12306 订单号，不能打开支付页'), { statusCode: 400, code: 'ORDER_REQUIRED' });
    }
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE ticket_purchases SET phase = 'pay_ready', order_no = ?, pay_url = ?, detail = ?, updated_at = ? WHERE id = ?`)
      .run(orderNo.trim(), payUrl, '打开 12306 官方收银台。票款不进本应用。尚未确认出票。', now, id);
    return this.public(this.requireOwned(deviceId, id));
  }

  /** 回查没有成功支付样例时保持未支付，不能标已出票。 */
  refreshOrder(deviceId: string, id: string) {
    const row = this.requireOwned(deviceId, id);
    if (!row.order_no) return this.public(row);
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE ticket_purchases SET phase = 'unpaid', detail = ?, updated_at = ? WHERE id = ?`)
      .run('已回查订单。没有成功支付样例，不能显示已支付或已出票。', now, id);
    return this.public(this.requireOwned(deviceId, id));
  }

  getOwned(deviceId: string, id: string) {
    const row = this.db.prepare('SELECT * FROM ticket_purchases WHERE id = ? AND device_id = ?').get(id, deviceId) as PurchaseRecord | undefined;
    return row ? this.public(row) : null;
  }

  private requireOwned(deviceId: string, id: string): PurchaseRecord {
    const row = this.db.prepare('SELECT * FROM ticket_purchases WHERE id = ? AND device_id = ?').get(id, deviceId) as PurchaseRecord | undefined;
    if (!row) throw Object.assign(new Error('购票单不存在'), { statusCode: 404, code: 'NOT_FOUND' });
    return row;
  }

  private public(row: PurchaseRecord) {
    return {
      id: row.id,
      trainCode: row.train_code,
      from: row.from_name,
      to: row.to_name,
      seatKind: row.seat_kind,
      query: JSON.parse(row.query_json) as TicketQuery,
      phase: row.phase,
      accountRef: row.account_ref,
      orderNo: row.order_no,
      payUrl: row.pay_url,
      issued: false,
      detail: row.detail
    };
  }
}
