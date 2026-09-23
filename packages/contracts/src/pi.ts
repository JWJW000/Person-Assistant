import { z } from 'zod';

export const PiProtocolVersion = 1 as const;
export const PiRunStatusSchema = z.enum([
  'queued', 'running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'interrupted'
]);
export const PiActivitySchema = z.enum(['generating', 'tool_running', 'waiting_input', 'retrying']).nullable();
export const PiCommandKindSchema = z.enum([
  'prompt', 'steer', 'follow_up', 'stop', 'set_model', 'input_response'
]);
export const PiModelSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  name: z.string().optional()
});

const TextPayloadSchema = z.object({ text: z.string().min(1).max(65_536) });
export const PiCommandRequestSchema = z.discriminatedUnion('kind', [
  z.object({ clientRequestId: z.string().uuid(), kind: z.literal('prompt'), payload: TextPayloadSchema.extend({ provider: z.string().optional(), modelId: z.string().optional() }) }),
  z.object({ clientRequestId: z.string().uuid(), kind: z.literal('steer'), runId: z.string().uuid(), payload: TextPayloadSchema }),
  z.object({ clientRequestId: z.string().uuid(), kind: z.literal('follow_up'), payload: TextPayloadSchema }),
  z.object({ clientRequestId: z.string().uuid(), kind: z.literal('stop'), runId: z.string().uuid(), payload: z.object({}).default({}) }),
  z.object({ clientRequestId: z.string().uuid(), kind: z.literal('set_model'), payload: PiModelSchema }),
  z.object({
    clientRequestId: z.string().uuid(),
    kind: z.literal('input_response'),
    runId: z.string().uuid(),
    payload: z.object({
      processInstanceId: z.string().uuid(),
      requestId: z.string().min(1),
      response: z.object({ value: z.unknown().optional(), confirmed: z.boolean().optional(), cancelled: z.boolean().optional() })
        .refine((value) => value.value !== undefined || value.confirmed !== undefined || value.cancelled === true)
    })
  })
]);

export const CreatePiTaskSchema = z.object({
  clientRequestId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  sessionRef: z.string().max(2048).optional(),
  terminalExitedConfirmed: z.boolean().optional()
}).refine((value) => !value.sessionRef || value.terminalExitedConfirmed === true, { message: '导入会话前必须确认终端 Pi 已退出' });

export const PiRunnerProjectSchema = z.object({
  key: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  displayPath: z.string().min(1)
});
export const PiRunnerHelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.literal(PiProtocolVersion),
  piVersion: z.string(),
  platform: z.enum(['darwin', 'linux']),
  capabilities: z.array(z.string()),
  projects: z.array(PiRunnerProjectSchema),
  models: z.array(PiModelSchema).default([]),
  sessions: z.array(z.object({
    projectKey: z.string(),
    sessionRef: z.string(),
    name: z.string(),
    updatedAt: z.string().datetime()
  })).default([]),
  processInstanceId: z.string().uuid(),
  eventCursors: z.record(z.number().int().nonnegative()).default({})
});

export const PiRunnerCommandSchema = z.object({
  type: z.literal('command'),
  commandId: z.string().uuid(),
  taskId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  projectKey: z.string(),
  sessionRef: z.string().nullable(),
  kind: PiCommandKindSchema,
  payload: z.record(z.unknown()),
  requestHash: z.string()
});
export const PiRunnerEventSchema = z.object({
  type: z.literal('event'),
  runId: z.string().uuid(),
  seq: z.number().int().positive(),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown())
});
export const PiRunnerInboundSchema = z.discriminatedUnion('type', [
  PiRunnerHelloSchema,
  z.object({ type: z.literal('pong'), at: z.string().optional() }),
  z.object({ type: z.literal('command_ack'), commandId: z.string().uuid() }),
  z.object({ type: z.literal('command_result'), commandId: z.string().uuid(), status: z.enum(['accepted', 'rejected', 'unknown']), response: z.record(z.unknown()).optional() }),
  PiRunnerEventSchema
]);

export type PiRunStatus = z.infer<typeof PiRunStatusSchema>;
export type PiCommandRequest = z.infer<typeof PiCommandRequestSchema>;
export type PiRunnerHello = z.infer<typeof PiRunnerHelloSchema>;
export type PiRunnerCommand = z.infer<typeof PiRunnerCommandSchema>;
export type PiRunnerEvent = z.infer<typeof PiRunnerEventSchema>;
