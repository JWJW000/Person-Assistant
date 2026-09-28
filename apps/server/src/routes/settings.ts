import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { AuthenticateFn } from './auth.js';

export interface RelayConfig {
  baseUrl: string;
  api: 'openai-completions' | 'openai-responses' | 'anthropic-messages';
  modelId: string;
  apiKey: string;
  enabled: boolean;
  timeoutMs: number;
  maxSummaryTickets: number;
}

export function resolveRelayConfig(db: Database.Database): RelayConfig {
  let baseUrl = process.env.RELAY_BASE_URL || '';
  let api = (process.env.RELAY_API || 'openai-completions') as RelayConfig['api'];
  let modelId = process.env.RELAY_MODEL_ID || '';
  let apiKey = process.env.RELAY_API_KEY || '';
  let enabled = true;

  const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as
    | {
        base_url?: string;
        api?: RelayConfig['api'];
        model_id?: string;
        secret_ciphertext?: string;
        enabled?: number;
      }
    | undefined;

  if (row) {
    baseUrl = row.base_url || baseUrl;
    api = row.api || api;
    modelId = row.model_id || modelId;
    if (row.secret_ciphertext) {
      apiKey = Buffer.from(row.secret_ciphertext, 'base64').toString('utf-8');
    }
    enabled = Boolean(row.enabled);
  }

  if (!baseUrl || !modelId) enabled = false;
  if (process.env.AGENT_LLM_ENABLED === 'false') enabled = false;

  return {
    baseUrl,
    api,
    modelId,
    apiKey,
    enabled,
    timeoutMs: parseInt(process.env.RELAY_TIMEOUT_MS || '30000', 10),
    maxSummaryTickets: parseInt(process.env.MODEL_SUMMARY_MAX_TICKETS || '20', 10)
  };
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  db: Database.Database,
  authenticate: AuthenticateFn
): void {
  // 7. 模型配置与中转站模型拉取
  app.get('/v1/settings/model', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as
      | {
          id: string;
          base_url: string;
          api: string;
          model_id: string;
          secret_ciphertext?: string;
          enabled?: number;
        }
      | undefined;

    if (!row) {
      return {
        id: 'default',
        baseUrl: process.env.RELAY_BASE_URL || 'https://api.openai.com/v1',
        api: process.env.RELAY_API || 'openai-completions',
        modelId: process.env.RELAY_MODEL_ID || 'gpt-4o-mini',
        hasKey: Boolean(process.env.RELAY_API_KEY || process.env.RELAY_API_KEY_FILE),
        enabled: true
      };
    }
    return {
      id: row.id,
      baseUrl: row.base_url,
      api: row.api,
      modelId: row.model_id,
      hasKey: Boolean(row.secret_ciphertext),
      enabled: Boolean(row.enabled)
    };
  });

  app.put('/v1/settings/model', async (req: FastifyRequest<{ Body: { baseUrl?: string; api?: string; modelId?: string; apiKey?: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { baseUrl, api, modelId, apiKey } = req.body || {};
    if (!baseUrl || !modelId) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '缺少必须的模型参数' } });
    }

    const existing = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as
      | { secret_ciphertext?: string }
      | undefined;
    let secret = existing ? existing.secret_ciphertext || '' : '';
    if (apiKey && apiKey.trim()) {
      secret = Buffer.from(apiKey.trim()).toString('base64');
    }

    db.prepare(`
      INSERT OR REPLACE INTO model_profiles (id, base_url, api, model_id, secret_ciphertext, enabled)
      VALUES ('default', ?, ?, ?, ?, 1)
    `).run(baseUrl, api || 'openai-completions', modelId, secret);

    return { success: true, modelId };
  });

  // 从中转站动态获取其所有可用模型列表 (/v1/models)
  app.get('/v1/models/available', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;

    const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as
      | { base_url?: string; secret_ciphertext?: string }
      | undefined;
    const baseUrl = row ? row.base_url || 'https://api.openai.com/v1' : process.env.RELAY_BASE_URL || 'https://api.openai.com/v1';
    let apiKey = '';
    if (row && row.secret_ciphertext) {
      apiKey = Buffer.from(row.secret_ciphertext, 'base64').toString('utf-8');
    } else {
      apiKey = process.env.RELAY_API_KEY || '';
    }

    try {
      const targetUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const fetchRes = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!fetchRes.ok) {
        throw new Error(`上游返回 HTTP ${fetchRes.status}`);
      }

      const data = (await fetchRes.json()) as { data?: Array<{ id?: string; name?: string }> } | Array<{ id?: string; name?: string }>;
      let models: string[] = [];
      if (Array.isArray(data)) {
        models = data.map((m) => m.id || m.name || String(m));
      } else if (data && Array.isArray(data.data)) {
        models = data.data.map((m) => m.id || m.name || String(m));
      }

      return { items: models.filter(Boolean) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '无法直接拉取上游模型列表';
      return {
        items: [
          'gpt-4o',
          'gpt-4o-mini',
          'claude-3-5-sonnet',
          'claude-3-5-haiku',
          'deepseek-chat',
          'deepseek-reasoner',
          'grok-4.7',
          'qwen-plus',
          'qwen-max'
        ],
        fallback: true,
        message
      };
    }
  });
}
