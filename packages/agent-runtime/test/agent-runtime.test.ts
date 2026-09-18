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

  it('inherits stations from history when follow-up only changes the date', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    const inherited = runtime.inheritQueryFromHistory(
      '30 号的呢',
      '2026-09-17',
      [
        { role: 'user', text: '查一下明天北京到洛阳的高铁' },
        { role: 'assistant', text: '已查到明天北京到洛阳的高铁 20 趟。' }
      ]
    );

    expect(inherited).not.toBeNull();
    expect(inherited?.from.name).toBe('北京');
    expect(inherited?.to.name).toBe('洛阳');
    expect(inherited?.date).toBe('2026-09-30');
    expect(inherited?.trainTypes).toEqual(['G', 'D', 'C']);
    expect(inherited?.onlyAvailable).toBe(false);
  });

  it('does not treat 有票吗 as an onlyAvailable filter', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    const asking = runtime.parseQueryFromText('30号的有票吗', '2026-09-17', {
      date: '2026-09-18',
      timezone: 'Asia/Shanghai',
      from: { kind: 'city', name: '北京' },
      to: { kind: 'city', name: '洛阳' },
      trainTypes: ['G', 'D', 'C'],
      departMinutes: [0, 1440],
      onlyAvailable: false,
      sort: 'departure'
    } as any);
    expect(asking.onlyAvailable).toBe(false);

    const filtered = runtime.parseQueryFromText('只要有票的高铁', '2026-09-17');
    expect(filtered.onlyAvailable).toBe(true);
  });

  it('parses 日号 dates against the current month', () => {
    expect(AgentRuntime.resolveDayOfMonth('30号的呢', '2026-09-17')).toBe('2026-09-30');
    expect(AgentRuntime.resolveDayOfMonth('1号呢', '2026-09-17')).toBe('2026-10-01');
  });

  it('treats transfer-plan follow-ups as train queries and extracts the via station', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    const history = [
      { role: 'user' as const, text: '查一下明天北京到洛阳的高铁' },
      {
        role: 'assistant' as const,
        text: '直达没票的话可以中转。**方案一：北京 → 郑州东 → 洛阳龙门（最顺）**\n- 同站换乘。'
      }
    ];
    const inherited = runtime.inheritQueryFromHistory('方案一给我具体的方案', '2026-09-17', history);
    expect(inherited).not.toBeNull();
    expect(inherited?.from.name).toBe('北京');
    expect(inherited?.to.name).toBe('洛阳');
    expect(runtime.extractTransferVia('方案一给我具体的方案', history)).toBe('郑州东');
  });

  it('keeps a later follow-up date when inheriting a transfer request', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    const inherited = runtime.inheritQueryFromHistory(
      '方案一给我具体的方案',
      '2026-09-17',
      [
        { role: 'user', text: '查一下明天北京到洛阳的高铁' },
        { role: 'assistant', text: '查到 20 趟。' },
        { role: 'user', text: '30 号的有票吗' },
        { role: 'assistant', text: '**方案一：北京 → 郑州东 → 洛阳龙门**' }
      ]
    );
    expect(inherited?.date).toBe('2026-09-30');
    expect(inherited?.from.name).toBe('北京');
    expect(inherited?.to.name).toBe('洛阳');
  });

  it('stays on train search for scheme follow-ups and skips search for off-topic chat', async () => {
    const mockTrainService: any = {
      search: vi.fn().mockResolvedValue({
        id: 'res_x',
        runId: 'run_x',
        tickets: [],
        warnings: [],
        coverage: { status: 'complete', requestedPairs: 1, succeededPairs: 1, failedPairs: 0, stationDetails: [] }
      })
    };
    const runtime = new AgentRuntime(mockTrainService);
    const history = [
      { role: 'user' as const, text: '查一下明天北京到洛阳的高铁' },
      { role: 'assistant' as const, text: '**方案一：北京 → 郑州东 → 洛阳龙门**' }
    ];

    await runtime.executeRun(
      { runId: 'run_scheme', userMessage: '方案一给我具体的方案', currentDate: '2026-09-17', history },
      () => {}
    );
    expect(mockTrainService.search).toHaveBeenCalled();

    mockTrainService.search.mockClear();
    await runtime.executeRun(
      { runId: 'run_chat', userMessage: '量子力学到底是什么原理？', currentDate: '2026-09-17', history },
      () => {}
    );
    expect(mockTrainService.search).not.toHaveBeenCalled();
  });

  it('detects fabricated timetables vs off-topic chat', () => {
    const runtime = new AgentRuntime({ search: vi.fn() } as any);
    expect(runtime.looksLikeInventedTimetable('第一程：G87 北京西 07:00 → 郑州东 09:22，二等座约 309元')).toBe(true);
    expect(runtime.isClearlyOffTopic('量子力学到底是什么原理？')).toBe(true);
    expect(runtime.isClearlyOffTopic('方案一给我具体的方案')).toBe(false);
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

  it('falls back to inherited train search when follow-up has no local route words', async () => {
    const mockResult = {
      id: 'res_follow',
      runId: 'run_2',
      tickets: [],
      warnings: []
    };
    const mockTrainService: any = {
      search: vi.fn().mockResolvedValue(mockResult)
    };
    const runtime = new AgentRuntime(mockTrainService);
    await runtime.executeRun(
      {
        runId: 'run_2',
        userMessage: '30 号的呢',
        currentDate: '2026-09-17',
        history: [
          { role: 'user', text: '查一下明天北京到洛阳的高铁' },
          { role: 'assistant', text: '已查到 20 趟。' }
        ]
      },
      () => {}
    );

    expect(mockTrainService.search).toHaveBeenCalledTimes(1);
    const query = mockTrainService.search.mock.calls[0][0];
    expect(query.from.name).toBe('北京');
    expect(query.to.name).toBe('洛阳');
    expect(query.date).toBe('2026-09-30');
  });
});
