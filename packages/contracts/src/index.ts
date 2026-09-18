import { z } from 'zod';

// ==========================================
// 1. 基础公共类型 & 错误类型
// ==========================================

export const ApiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'DEVICE_REVOKED',
  'CONFIG_MISSING',
  'RELAY_AUTH_FAILED',
  'RELAY_PROTOCOL_ERROR',
  'TOOL_SCHEMA_INVALID',
  'MCP_UNAVAILABLE',
  'UPSTREAM_BLOCKED',
  'MCP_SCHEMA_MISMATCH',
  'INVALID_QUERY',
  'RUN_CONFLICT',
  'RUN_TIMEOUT',
  'RUN_CANCELLED',
  'RUN_INTERRUPTED',
  'CURSOR_EXPIRED',
  'INTERNAL_ERROR'
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    traceId: z.string(),
    details: z.record(z.any()).optional()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ==========================================
// 2. 查票业务契约 (Ticket, Query, Result)
// ==========================================

export const LocationRefSchema = z.object({
  kind: z.enum(['city', 'station']),
  name: z.string(),
  code: z.string().optional(),
  selectedStationCodes: z.array(z.string()).optional()
});
export type LocationRef = z.infer<typeof LocationRefSchema>;

export const TicketQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD 格式'),
  timezone: z.literal('Asia/Shanghai'),
  from: LocationRefSchema,
  to: LocationRefSchema,
  trainTypes: z.array(z.string()).default([]),
  departMinutes: z.tuple([z.number().min(0).max(1440), z.number().min(0).max(1440)]),
  arriveBefore: z.string().optional(), // RFC3339 含 +08:00
  seatPreference: z.string().optional(),
  onlyAvailable: z.boolean().default(false),
  sort: z.enum(['departure', 'arrival', 'duration']).default('departure')
});
export type TicketQuery = z.infer<typeof TicketQuerySchema>;

export const SeatAvailabilitySchema = z.enum([
  'available',
  'sold_out',
  'waitlist',
  'not_applicable',
  'unknown'
]);
export type SeatAvailability = z.infer<typeof SeatAvailabilitySchema>;

export const SeatSchema = z.object({
  kind: z.string(),
  availability: SeatAvailabilitySchema,
  count: z.number().nullable(),
  priceMinor: z.number().nullable(), // 整数分
  currency: z.literal('CNY').default('CNY'),
  rawLabel: z.string().optional()
});
export type Seat = z.infer<typeof SeatSchema>;

export const TrainTicketSchema = z.object({
  id: z.string(),
  trainCode: z.string(),
  trainNo: z.string(), // 内部 12306 标识，用于经停站查询
  from: z.object({ name: z.string(), code: z.string() }),
  to: z.object({ name: z.string(), code: z.string() }),
  departureAt: z.string(), // ISO 或标准时间字符串
  arrivalAt: z.string(),
  durationMinutes: z.number(),
  dayDiff: z.number().default(0), // 0: 当日到达, 1: 次日到达
  seats: z.array(SeatSchema),
  matchLabels: z.array(z.string()).optional(),
  scheduleReference: z.boolean().optional(),
  referenceDate: z.string().optional()
});
export type TrainTicket = z.infer<typeof TrainTicketSchema>;

export const CoverageSchema = z.object({
  status: z.enum(['complete', 'partial', 'failed']),
  requestedPairs: z.number(),
  succeededPairs: z.number(),
  failedPairs: z.number(),
  stationDetails: z.array(z.object({
    from: z.string(),
    to: z.string(),
    status: z.enum(['ok', 'failed', 'empty']),
    message: z.string().optional()
  })).default([])
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const TicketResultSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string(),
  runId: z.string(),
  query: TicketQuerySchema,
  tickets: z.array(TrainTicketSchema),
  fetchedAt: z.string(), // ISO8601
  queryStartedAt: z.string(),
  source: z.string().default('mcp:12306'),
  coverage: CoverageSchema,
  origin: z.enum(['live', 'cache', 'fixture']),
  warnings: z.array(z.string()).default([]),
  parentResultId: z.string().nullable().default(null),
  planning: z
    .object({
      mode: z.enum(['live', 'schedule_reference']),
      requestedDate: z.string(),
      searchedDate: z.string(),
      saleOpensOn: z.string().optional(),
      matchSummary: z.string().optional()
    })
    .optional()
});
export type TicketResult = z.infer<typeof TicketResultSchema>;

// ==========================================
// 3. 执行状态机与事件契约 (Runs, Events, SSE)
// ==========================================

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelling',
  'cancelled',
  'interrupted'
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunKindSchema = z.enum([
  'chat',
  'ticket_search',
  'train_route',
  'diagnostic'
]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.accepted'),
    runId: z.string()
  }),
  z.object({
    type: z.literal('run.started'),
    runId: z.string()
  }),
  z.object({
    type: z.literal('message.delta'),
    messageId: z.string(),
    textDelta: z.string()
  }),
  z.object({
    type: z.literal('message.completed'),
    messageId: z.string(),
    fullText: z.string()
  }),
  z.object({
    type: z.literal('tool.started'),
    toolCallId: z.string(),
    toolName: z.string(),
    argumentsSummary: z.string().optional()
  }),
  z.object({
    type: z.literal('tool.completed'),
    toolCallId: z.string(),
    toolName: z.string(),
    status: z.enum(['success', 'error']),
    error: z.string().optional()
  }),
  z.object({
    type: z.literal('result.ready'),
    resultId: z.string(),
    kind: z.literal('train.tickets')
  }),
  z.object({
    type: z.literal('input.required'),
    prompt: z.string(),
    choices: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal('run.completed'),
    runId: z.string(),
    warnings: z.array(z.string()).default([])
  }),
  z.object({
    type: z.literal('run.failed'),
    runId: z.string(),
    code: ApiErrorCodeSchema,
    message: z.string()
  }),
  z.object({
    type: z.literal('run.cancelled'),
    runId: z.string()
  }),
  z.object({
    type: z.literal('run.interrupted'),
    runId: z.string()
  })
]);

export const RunEnvelopeEventSchema = z.object({
  v: z.literal(1).default(1),
  runId: z.string(),
  seq: z.number(),
  type: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.any())
});
export type RunEnvelopeEvent = z.infer<typeof RunEnvelopeEventSchema>;

// ==========================================
// 4. API 请求与响应规范
// ==========================================

export const PairRequestSchema = z.object({
  pairingCode: z.string().min(6).max(32),
  deviceName: z.string().min(1).max(64)
});
export const PairResponseSchema = z.object({
  deviceId: z.string(),
  deviceToken: z.string(),
  expiresAt: z.string()
});

export const CreateConversationSchema = z.object({
  title: z.string().optional()
});

export const CreateRunRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  kind: RunKindSchema,
  input: z.object({
    text: z.string().max(8000).optional(),
    baseResultId: z.string().nullable().optional(),
    query: TicketQuerySchema.optional(),
    ticketId: z.string().optional(),
    trainNo: z.string().optional()
  })
});
export const CreateRunResponseSchema = z.object({
  runId: z.string(),
  status: RunStatusSchema,
  eventsUrl: z.string()
});

export const ModelProfileSettingsSchema = z.object({
  id: z.string().default('default'),
  baseUrl: z.string().url(),
  api: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages']),
  modelId: z.string(),
  apiKey: z.string().optional(), // 写入时接收，读取时脱敏
  hasKey: z.boolean().optional(),
  enabled: z.boolean().default(true)
});
