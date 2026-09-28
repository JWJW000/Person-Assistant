import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TicketQuery } from '@assistant/contracts';
import type { AuthenticateFn, DeviceRecord } from './auth.js';
import { TicketWatchService } from '../services/ticketWatch.js';
import { TicketPurchaseService } from '../services/ticketPurchase.js';

interface RequestWithDevice extends FastifyRequest {
  device?: DeviceRecord;
}

interface CreateWatchBody {
  trainCode?: string;
  query?: TicketQuery;
  seatKind?: string;
  intervalMs?: number;
}

export function registerWatchRoutes(app: FastifyInstance, watches: TicketWatchService, authenticate: AuthenticateFn, purchases?: TicketPurchaseService): void {
  app.get('/v1/ticket-watches', async (req: RequestWithDevice, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    return { items: watches.list(req.device!.id) };
  });

  app.post('/v1/ticket-watches', async (req: RequestWithDevice, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const body = (req.body || {}) as CreateWatchBody;
    try {
      const item = watches.create({
        deviceId: req.device!.id,
        trainCode: body.trainCode || '',
        query: body.query as TicketQuery,
        seatKind: body.seatKind,
        intervalMs: body.intervalMs
      });
      return reply.status(201).send(item);
    } catch (err) {
      return sendWatchError(reply, err);
    }
  });

  app.post('/v1/ticket-watches/:id/ack', async (req: RequestWithDevice, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params as { id: string };
    try {
      return watches.ack(req.device!.id, id);
    } catch (err) {
      return sendWatchError(reply, err);
    }
  });

  app.delete('/v1/ticket-watches/:id', async (req: RequestWithDevice, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!watches.remove(req.device!.id, id)) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '盯票任务不存在' } });
    }
    return { ok: true };
  });

  if (purchases) {
    app.post('/v1/ticket-purchases', async (req: RequestWithDevice, reply: FastifyReply) => {
      if (!authenticate(req, reply)) return;
      const body = (req.body || {}) as { trainCode?: string; query?: TicketQuery; seatKind?: string; accountRef?: string };
      try {
        const item = purchases.create({
          deviceId: req.device!.id,
          trainCode: body.trainCode || '',
          query: body.query as TicketQuery,
          seatKind: body.seatKind,
          accountRef: body.accountRef
        });
        return reply.status(201).send(item);
      } catch (err) {
        return sendWatchError(reply, err);
      }
    });

    app.post('/v1/ticket-purchases/:id/confirm', async (req: RequestWithDevice, reply: FastifyReply) => {
      if (!authenticate(req, reply)) return;
      const { id } = req.params as { id: string };
      const body = (req.body || {}) as { passengerName?: string };
      try {
        return purchases.confirmForUserPay(req.device!.id, id, body.passengerName || '');
      } catch (err) {
        return sendWatchError(reply, err);
      }
    });
    app.post('/v1/ticket-purchases/:id/hold', async (req: RequestWithDevice, reply: FastifyReply) => {
      if (!authenticate(req, reply)) return;
      const { id } = req.params as { id: string };
      try {
        return purchases.attemptHold(req.device!.id, id);
      } catch (err) {
        return sendWatchError(reply, err);
      }
    });

    app.post('/v1/ticket-purchases/:id/order', async (req: RequestWithDevice, reply: FastifyReply) => {
      if (!authenticate(req, reply)) return;
      const { id } = req.params as { id: string };
      const body = (req.body || {}) as { orderNo?: string };
      try {
        return purchases.attachOfficialOrder(req.device!.id, id, body.orderNo || '');
      } catch (err) {
        return sendWatchError(reply, err);
      }
    });

    app.post('/v1/ticket-purchases/:id/refresh', async (req: RequestWithDevice, reply: FastifyReply) => {
      if (!authenticate(req, reply)) return;
      const { id } = req.params as { id: string };
      try {
        return purchases.refreshOrder(req.device!.id, id);
      } catch (err) {
        return sendWatchError(reply, err);
      }
    });
  }
}

function sendWatchError(reply: FastifyReply, err: unknown) {
  const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode: number }).statusCode) : 500;
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : 'INTERNAL';
  const message = err instanceof Error ? err.message : '盯票失败';
  return reply.status(statusCode).send({ error: { code, message } });
}
