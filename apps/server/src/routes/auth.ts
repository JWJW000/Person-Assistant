import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { PairRequestSchema } from '@assistant/contracts';

export interface DeviceRecord {
  id: string;
  name: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
}

export type AuthenticateFn = (
  req: FastifyRequest,
  reply: FastifyReply,
  opts?: { allowQueryToken?: boolean }
) => boolean;

export function createAuthenticator(db: Database.Database): AuthenticateFn {
  return (req: FastifyRequest, reply: FastifyReply, opts = {}): boolean => {
    let authHeader = req.headers['authorization'];
    const query = req.query as Record<string, string | undefined> | undefined;
    if (
      opts.allowQueryToken &&
      (!authHeader || !String(authHeader).startsWith('Bearer ')) &&
      query?.access_token
    ) {
      authHeader = `Bearer ${query.access_token}`;
    }
    if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
      reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '需要有效的设备凭证' } });
      return false;
    }
    const token = String(authHeader).slice(7);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const device = db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(tokenHash) as DeviceRecord | undefined;

    if (!device || device.revoked_at || new Date(device.expires_at).getTime() < Date.now()) {
      reply.status(401).send({ error: { code: 'DEVICE_REVOKED', message: '设备已被注销或凭据已失效' } });
      return false;
    }
    (req as unknown as { device: DeviceRecord }).device = device;
    return true;
  };
}

export function registerAuthRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post('/v1/auth/pair', async (req, reply) => {
    const body = PairRequestSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '请求参数无效' } });
    }

    const { pairingCode, deviceName } = body.data;
    const codeHash = crypto.createHash('sha256').update(pairingCode).digest('hex');

    const row = db.prepare('SELECT * FROM pairing_codes WHERE code_hash = ?').get(codeHash) as
      | { consumed_at?: string | null; expires_at: string }
      | undefined;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      return reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '配对码无效或已过期' } });
    }

    // 消费配对码
    db.prepare('UPDATE pairing_codes SET consumed_at = ? WHERE code_hash = ?').run(new Date().toISOString(), codeHash);

    // 发行设备 Token
    const deviceId = `dev_${crypto.randomUUID()}`;
    const deviceToken = `tok_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO devices (id, name, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(deviceId, deviceName, tokenHash, new Date().toISOString(), expiresAt);

    return {
      deviceId,
      deviceToken,
      expiresAt
    };
  });
}
