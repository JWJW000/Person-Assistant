import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import { runEventBus } from '../services/eventBus.js';
import type { AuthenticateFn } from './auth.js';

interface RunEventRow {
  run_id: string;
  seq: number;
  type: string;
  created_at: string;
  payload_json: string;
}

export const mapEventRow = (row: RunEventRow) => ({
  v: 1,
  runId: row.run_id,
  seq: row.seq,
  type: row.type,
  occurredAt: row.created_at,
  payload: JSON.parse(row.payload_json)
});

export function registerRunsRoutes(
  app: FastifyInstance,
  db: Database.Database,
  authenticate: AuthenticateFn
): void {
  // 5. SSE 事件流 (可恢复)。format=json 供 WebView/代理缓冲时轮询增量。
  app.get('/v1/runs/:id/events', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { after?: string; format?: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply, { allowQueryToken: true })) return;
    const { id: runId } = req.params;
    const after = parseInt(req.query.after || '0', 10);
    const format = String(req.query.format || '');

    if (format === 'json') {
      const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as { status: string } | undefined;
      const rows = db.prepare(
        'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
      ).all(runId, after) as RunEventRow[];
      const items = rows.map(mapEventRow);
      return {
        status: run?.status || 'unknown',
        lastSeq: items.length ? items[items.length - 1].seq : after,
        items
      };
    }

    // Fastify 5 必须 hijack，否则 async handler 返回后会自动 reply.send() 并关掉 SSE
    reply.hijack();
    const raw = reply.raw;
    try {
      raw.socket?.setNoDelay?.(true);
    } catch {}

    const origin = req.headers.origin;
    raw.statusCode = 200;
    raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
    if (origin) {
      raw.setHeader('Access-Control-Allow-Origin', origin);
      raw.setHeader('Access-Control-Allow-Credentials', 'true');
      raw.setHeader('Vary', 'Origin');
    }
    if (typeof (raw as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
      (raw as unknown as { flushHeaders: () => void }).flushHeaders();
    }

    const seen = new Set<number>();
    let currentSeq = after;
    const sendEvent = (event: { seq?: number; type?: string; [key: string]: unknown }) => {
      const seq = Number(event?.seq);
      if (Number.isFinite(seq)) {
        if (seen.has(seq)) return;
        seen.add(seq);
        if (seq > currentSeq) currentSeq = seq;
      }
      try {
        raw.write(`id: ${event.seq}\n`);
        raw.write(`event: ${event.type}\n`);
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (typeof (raw as unknown as { flush?: () => void }).flush === 'function') {
          (raw as unknown as { flush: () => void }).flush();
        }
      } catch {}
    };

    // 心跳 + 2KB 填充，避免 Cloudflare/nginx 把首包缓冲到结束
    raw.write(': ping\n\n');
    raw.write(`: ${' '.repeat(2048)}\n\n`);

    await new Promise<void>((resolve) => {
      let finished = false;
      let heartbeat: NodeJS.Timeout | undefined;
      let poll: NodeJS.Timeout | undefined;
      let unsub = () => {};
      const finish = () => {
        if (finished) return;
        finished = true;
        unsub();
        if (heartbeat) clearInterval(heartbeat);
        if (poll) clearInterval(poll);
        try {
          raw.end();
        } catch {}
        resolve();
      };

      const pushRow = (row: RunEventRow) => sendEvent(mapEventRow(row));

      unsub = runEventBus.subscribe(runId, (event: unknown) => {
        const ev = event as { type?: string; seq?: number; [key: string]: unknown };
        sendEvent(ev);
        if (ev?.type === 'run.completed' || ev?.type === 'run.failed') {
          finish();
        }
      });

      const pastEvents = db.prepare(
        'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
      ).all(runId, after) as RunEventRow[];
      for (const row of pastEvents) {
        pushRow(row);
      }

      const existing = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as { status: string } | undefined;
      if (existing && (existing.status === 'succeeded' || existing.status === 'failed' || existing.status === 'cancelled')) {
        finish();
        return;
      }

      heartbeat = setInterval(() => {
        try {
          raw.write(': ka\n\n');
        } catch {
          finish();
        }
      }, 15000);

      poll = setInterval(() => {
        const newEvents = db.prepare(
          'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
        ).all(runId, currentSeq) as RunEventRow[];
        for (const row of newEvents) {
          pushRow(row);
        }
        const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as { status: string } | undefined;
        if (run && (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled')) {
          const latest = db.prepare(
            'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
          ).all(runId, currentSeq) as RunEventRow[];
          for (const row of latest) {
            pushRow(row);
          }
          finish();
        }
      }, 400);

      req.raw.on('close', finish);
    });
  });
}
