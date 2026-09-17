import { describe, it, expect, vi } from 'vitest';
import { AgentRuntime } from '../src/index.js';
import { RunEnvelopeEvent } from '@assistant/contracts';

describe('AgentRuntime', () => {
  it('detects train intent and parses destination & date', () => {
    const mockTrainService: any = {
      search: vi.fn()
    };
    const runtime = new AgentRuntime(mockTrainService);
    const query = runtime.parseQueryFromText('查询2026年9月30日从北京到洛阳的高铁', '2026-09-30');

    expect(query.date).toBe('2026-09-30');
    expect(query.from.name).toBe('北京');
    expect(query.to.name).toBe('洛阳');
    expect(query.trainTypes).toEqual(['G', 'D', 'C']);
  });

  it('executes run, searches tickets, and emits events', async () => {
    const mockResult = {
      id: 'res_123',
      runId: 'run_1',
      tickets: [
        {
          id: 't_1',
          trainCode: 'G123',
          from: { name: '北京南', code: 'VNP' },
          to: { name: '洛阳龙门', code: 'LLF' },
          departureAt: '2026-09-30T08:00:00+08:00',
          arrivalAt: '2026-09-30T12:00:00+08:00',
          durationMinutes: 240,
          dayDiff: 0,
          seats: []
        }
      ],
      warnings: []
    };

    const mockTrainService: any = {
      search: vi.fn().mockResolvedValue(mockResult)
    };

    const runtime = new AgentRuntime(mockTrainService);
    const emittedEvents: RunEnvelopeEvent[] = [];

    await runtime.executeRun(
      {
        runId: 'run_1',
        userMessage: '帮我查一下北京到洛阳的高铁',
        currentDate: '2026-09-30'
      },
      (e) => {
        emittedEvents.push(e);
      }
    );

    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain('run.started');
    expect(eventTypes).toContain('tool.started');
    expect(eventTypes).toContain('tool.completed');
    expect(eventTypes).toContain('result.ready');
    expect(eventTypes).toContain('message.completed');
    expect(eventTypes).toContain('run.completed');
  });
});
