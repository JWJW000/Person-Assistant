import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { Seat, TicketQuery, TrainTicket } from '@assistant/contracts';
import type { TrainService } from '@assistant/train-domain';

export const WATCH_MIN_INTERVAL_MS = 60_000;
export const WATCH_MAX_ACTIVE = 20;
export const WATCH_DEFAULT_INTERVAL_MS = 180_000;

export type WatchStatus = 'active' | 'paused' | 'hit' | 'expired' | 'stopped';

export interface WatchRecord {
  id: string;
  device_id: string;
  train_code: string;
  from_name: string;
  to_name: string;
  seat_kind: string;
  query_json: string;
  interval_ms: number;
  status: WatchStatus;
  baseline: string;
  last_availability: string | null;
  last_count: number | null;
  hit_json: string | null;
  last_error: string | null;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchHit {
  trainCode: string;
  from: string;
  to: string;
  departureAt: string;
  seatKind: string;
  availability: Seat['availability'];
  count: number | null;
  priceMinor: number | null;
  checkedAt: string;
}

export interface CreateWatchInput {
  deviceId: string;
  trainCode: string;
  query: TicketQuery;
  seatKind?: string;
  intervalMs?: number;
}

interface Searcher {
  search(query: TicketQuery, runId: string, options?: { bypassCache?: boolean }): Promise<{ tickets: TrainTicket[] }>;
}



export function findSeat(ticket: TrainTicket, seatKind?: string): Seat | undefined {
  if (seatKind) {
    return ticket.seats.find((seat) => seat.kind.includes(seatKind));
  }
  return ticket.seats.find((seat) => seat.availability === 'available') ?? ticket.seats[0];
}

/** 只把「无票/未知 → 有票」或候补张数变正当成放票。已有票的车次不重复命中。 */
export function isRelease(previous: Seat['availability'] | null, seat: Seat | undefined): boolean {
  if (!seat || seat.availability !== 'available') return false;
  if (seat.count != null && seat.count <= 0) return false;
  return previous == null || previous === 'sold_out' || previous === 'unknown' || previous === 'waitlist' || previous === 'not_applicable';
}

export function matchWatchedTicket(tickets: TrainTicket[], watch: Pick<WatchRecord, 'train_code' | 'from_name' | 'to_name'>): TrainTicket | undefined {
  return tickets.find(
    (ticket) =>
      ticket.trainCode === watch.train_code &&
      ticket.from.name === watch.from_name &&
      ticket.to.name === watch.to_name &&
      !ticket.scheduleReference
  );
}

function rowToPublic(row: WatchRecord) {
  return {
    id: row.id,
    trainCode: row.train_code,
    from: row.from_name,
    to: row.to_name,
    seatKind: row.seat_kind,
    query: JSON.parse(row.query_json) as TicketQuery,
    intervalMs: row.interval_ms,
    status: row.status,
    baseline: row.baseline,
    lastAvailability: row.last_availability,
    lastCount: row.last_count,
    hit: row.hit_json ? (JSON.parse(row.hit_json) as WatchHit) : null,
    lastError: row.last_error,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TicketWatchService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private db: Database.Database,
    private trains: Searcher,
    private options: { intervalMs?: number; now?: () => number } = {}
  ) {}

  start(): void {
    if (this.timer) return;
    const every = this.options.intervalMs ?? 15_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, every);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(deviceId: string) {
    const rows = this.db
      .prepare('SELECT * FROM ticket_watches WHERE device_id = ? ORDER BY created_at DESC')
      .all(deviceId) as WatchRecord[];
    return rows.map(rowToPublic);
  }

  create(input: CreateWatchInput) {
    const trainCode = input.trainCode.trim();
    const seatKind = (input.seatKind || '').trim();
    if (!trainCode) {
      throw Object.assign(new Error('需要车次号'), { statusCode: 400, code: 'INVALID_QUERY' });
    }
    if (!input.query?.date || !input.query.from?.name || !input.query.to?.name) {
      throw Object.assign(new Error('盯票需要完整的日期和车站'), { statusCode: 400, code: 'INVALID_QUERY' });
    }
    const today = shanghaiDate(this.options.now?.() ?? Date.now());
    if (input.query.date < today) {
      throw Object.assign(new Error('出发日期已过，不能盯票'), { statusCode: 400, code: 'INVALID_QUERY' });
    }

    const active = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ticket_watches WHERE device_id = ? AND status = 'active'`)
      .get(input.deviceId) as { n: number };
    if (active.n >= WATCH_MAX_ACTIVE) {
      throw Object.assign(new Error(`同时最多盯 ${WATCH_MAX_ACTIVE} 趟`), { statusCode: 409, code: 'WATCH_LIMIT' });
    }

    const intervalMs = Math.max(WATCH_MIN_INTERVAL_MS, input.intervalMs ?? WATCH_DEFAULT_INTERVAL_MS);
    const nowIso = new Date(this.options.now?.() ?? Date.now()).toISOString();
    const id = `watch_${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO ticket_watches (
          id, device_id, train_code, from_name, to_name, seat_kind, query_json, interval_ms,
          status, baseline, next_run_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'unknown', ?, ?, ?)`
      )
      .run(
        id,
        input.deviceId,
        trainCode,
        input.query.from.name,
        input.query.to.name,
        seatKind,
        JSON.stringify(input.query),
        intervalMs,
        nowIso,
        nowIso,
        nowIso
      );
    return this.getOwned(input.deviceId, id);
  }

  remove(deviceId: string, id: string): boolean {
    const result = this.db.prepare('DELETE FROM ticket_watches WHERE id = ? AND device_id = ?').run(id, deviceId);
    return result.changes > 0;
  }

  /** 把已放票的任务标成已读，避免横幅反复弹出。 */
  ack(deviceId: string, id: string) {
    const row = this.requireOwned(deviceId, id);
    if (row.status !== 'hit') return rowToPublic(row);
    const nowIso = new Date(this.options.now?.() ?? Date.now()).toISOString();
    this.db
      .prepare(`UPDATE ticket_watches SET status = 'stopped', updated_at = ? WHERE id = ? AND device_id = ?`)
      .run(nowIso, id, deviceId);
    return rowToPublic(this.requireOwned(deviceId, id));
  }

  async tick(now = this.options.now?.() ?? Date.now()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = this.db
        .prepare(
          `SELECT * FROM ticket_watches WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 1`
        )
        .get(new Date(now).toISOString()) as WatchRecord | undefined;
      if (!due) return 0;
      await this.checkOne(due, now);
      return 1;
    } finally {
      this.running = false;
    }
  }

  private async checkOne(watch: WatchRecord, now: number): Promise<void> {
    const query = JSON.parse(watch.query_json) as TicketQuery;
    const today = shanghaiDate(now);
    const nowIso = new Date(now).toISOString();
    if (query.date < today) {
      this.db
        .prepare(`UPDATE ticket_watches SET status = 'expired', last_run_at = ?, updated_at = ? WHERE id = ? AND status = 'active'`)
        .run(nowIso, nowIso, watch.id);
      return;
    }

    const nextRunAt = new Date(now + watch.interval_ms).toISOString();
    try {
      const result = await this.trains.search(
        { ...query, departMinutes: [0, 1440], trainTypes: [], seatPreference: undefined, onlyAvailable: false },
        `watch_${watch.id}`,
        { bypassCache: true }
      );
      const ticket = matchWatchedTicket(result.tickets, watch);
      const seat = ticket ? findSeat(ticket, watch.seat_kind || undefined) : undefined;
      const availability = seat?.availability ?? null;
      const count = seat?.count ?? null;
      const released = isRelease(watch.last_availability as Seat['availability'] | null, seat);

      if (released && ticket && seat) {
        const hit: WatchHit = {
          trainCode: ticket.trainCode,
          from: ticket.from.name,
          to: ticket.to.name,
          departureAt: ticket.departureAt,
          seatKind: seat.kind,
          availability: seat.availability,
          count: seat.count,
          priceMinor: seat.priceMinor,
          checkedAt: nowIso
        };
        this.db
          .prepare(
            `UPDATE ticket_watches
             SET status = 'hit', last_availability = ?, last_count = ?, hit_json = ?, last_error = NULL,
                 last_run_at = ?, updated_at = ?
             WHERE id = ? AND status = 'active'`
          )
          .run(seat.availability, count, JSON.stringify(hit), nowIso, nowIso, watch.id);
        return;
      }

      this.db
        .prepare(
          `UPDATE ticket_watches
           SET baseline = 'seen', last_availability = ?, last_count = ?, last_error = NULL,
               next_run_at = ?, last_run_at = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`
        )
        .run(availability, count, nextRunAt, nowIso, nowIso, watch.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db
        .prepare(
          `UPDATE ticket_watches
           SET last_error = ?, next_run_at = ?, last_run_at = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`
        )
        .run(message.slice(0, 300), nextRunAt, nowIso, nowIso, watch.id);
    }
  }

  private getOwned(deviceId: string, id: string) {
    const row = this.db.prepare('SELECT * FROM ticket_watches WHERE id = ? AND device_id = ?').get(id, deviceId) as WatchRecord | undefined;
    return row ? rowToPublic(row) : null;
  }

  private requireOwned(deviceId: string, id: string): WatchRecord {
    const row = this.db.prepare('SELECT * FROM ticket_watches WHERE id = ? AND device_id = ?').get(id, deviceId) as WatchRecord | undefined;
    if (!row) throw Object.assign(new Error('盯票任务不存在'), { statusCode: 404, code: 'NOT_FOUND' });
    return row;
  }
}

function shanghaiDate(epochMs: number): string {
  return new Date(epochMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export type { TrainService };
