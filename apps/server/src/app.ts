import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type Database from 'better-sqlite3';
import { createDatabase, migrate } from './db/index.js';
import { McpBridge } from '@assistant/mcp-bridge';
import { TrainService } from '@assistant/train-domain';
import { AgentRuntime } from '@assistant/agent-runtime';
import { registerPi } from './pi.js';
import { TicketWatchService } from './services/ticketWatch.js';
import { TicketPurchaseService } from './services/ticketPurchase.js';

import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes, createAuthenticator } from './routes/auth.js';
import { registerTrainRoutes } from './routes/train.js';
import { registerConversationsRoutes } from './routes/conversations.js';
import { registerRunsRoutes } from './routes/runs.js';
import { registerSettingsRoutes, resolveRelayConfig } from './routes/settings.js';
import { registerWatchRoutes } from './routes/watches.js';

export function buildServer(): { app: FastifyInstance; db: Database.Database } {
  const app = fastify({ logger: false });
  const db = createDatabase();
  migrate(db);

  // 跨域支持 (为开发和 Tauri WebView 准备)
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Last-Event-ID'],
    exposedHeaders: ['Content-Type']
  });

  const authenticate = createAuthenticator(db);

  const mcpBridge = new McpBridge({
    entrypoint: process.env.MCP_ENTRYPOINT
  });
  const trainService = new TrainService(mcpBridge);
  const agentRuntime = new AgentRuntime(trainService, () => resolveRelayConfig(db));
  const ticketWatches = new TicketWatchService(db, trainService);
  const ticketPurchases = new TicketPurchaseService(db);
  ticketWatches.start();
  app.addHook('onClose', async () => {
    ticketWatches.stop();
  });

  // 注册子路由与插件
  registerPi(app, db);
  registerHealthRoutes(app);
  registerAuthRoutes(app, db);
  registerTrainRoutes(app, mcpBridge, agentRuntime);
  registerConversationsRoutes(app, db, agentRuntime, authenticate);
  registerRunsRoutes(app, db, authenticate);
  registerWatchRoutes(app, ticketWatches, authenticate, ticketPurchases);
  registerSettingsRoutes(app, db, authenticate);


  return { app, db };
}
