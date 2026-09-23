import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Archive, Bot, Link2, Monitor, Plus, Server, Trash2, ChevronRight, FolderOpen, RefreshCw, ArrowDown, Wrench, Settings2, Copy, Check } from 'lucide-react';
import { useAppStore } from '../store';
import {
  archivePiTask, createPiPairingCode, createPiTask, getPiRunEvents, getPiTask, listPiHosts, listPiModels, listPiProjects, listPiSessions, listPiTasks, revokePiHost,
  sendPiCommand, subscribePiRun, type PiHost, type PiModel, type PiProject, type PiSession, type PiTask
} from '../lib/piApi';
import type { RunStreamEvent } from '../lib/runStream';
import { piContentText, piDisplayItems, type PiDisplayItem } from '../lib/piEvents';
import { getPiOutput } from '../lib/piApi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PiPicker, PiSheet } from '../components/PiSheet';
import { cn } from '../lib/utils';
import { PiComposer } from '../components/PiComposer';
import { copyToClipboard } from '../lib/clipboard';

export const PiTasksPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { serverUrl, accessToken, selectedPiHostId, selectedPiTaskId, setSelectedPiHostId, setSelectedPiTaskId, piEventCursors, setPiEventCursor } = useAppStore();
  const token = accessToken || '';
  const [hosts, setHosts] = useState<PiHost[]>([]);
  const [projects, setProjects] = useState<PiProject[]>([]);
  const [tasks, setTasks] = useState<PiTask[]>([]);
  const [task, setTask] = useState<PiTask | null>(null);
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [models, setModels] = useState<PiModel[]>([]);
  const [sessions, setSessions] = useState<PiSession[]>([]);
  const [projectId, setProjectId] = useState('');
  const [modelKey, setModelKey] = useState('');
  const [sessionRef, setSessionRef] = useState('');
  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [text, setText] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const loadVersion = useRef(0);
  const scrollArea = useRef<HTMLElement | null>(null);
  const followOutput = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inputResponse, setInputResponse] = useState('');
  const [answeredRequests, setAnsweredRequests] = useState<string[]>([]);
  const runCursors = useRef<Record<string, number>>({ ...piEventCursors });

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const hostResult = await listPiHosts(serverUrl, token);
      if (version !== loadVersion.current) return;
      setHosts(hostResult.items);
      const hostId = hostResult.items.some((host) => host.id === selectedPiHostId) ? selectedPiHostId! : hostResult.items[0]?.id || '';
      if (hostId !== selectedPiHostId) setSelectedPiHostId(hostId || null);
      const [projectResult, taskResult] = await Promise.all([hostId ? listPiProjects(serverUrl, token, hostId) : { items: [] }, listPiTasks(serverUrl, token, hostId)]);
      if (version !== loadVersion.current) return;
      setProjects(projectResult.items); setTasks(taskResult.items);
      setProjectId((current) => projectResult.items.some((project) => project.id === current) ? current : (projectResult.items[0]?.id || ''));
    } catch (e) { if (version === loadVersion.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [serverUrl, token, selectedPiHostId, setSelectedPiHostId]);

  const chooseHost = (id: string) => {
    if (id === selectedPiHostId) return;
    loadVersion.current++; setSelectedPiHostId(id); setSelectedPiTaskId(null);
    setProjects([]); setTasks([]); setProjectId(''); setModels([]); setSessions([]); setModelKey(''); setSessionRef(''); setSessionConfirmed(false);
  };
  const selectedHost = hosts.find((host) => host.id === selectedPiHostId);
  const hostOptions = hosts.map((host) => ({ value: host.id, label: host.name, description: host.platform === 'darwin' ? '在 Mac 上执行任务' : '在服务器上执行任务', badge: host.online ? '在线' : '离线', icon: host.platform === 'darwin' ? <Monitor className="size-5" /> : <Server className="size-5" /> }));

  useEffect(() => { void load(); return () => { loadVersion.current++; }; }, [load]);
  useEffect(() => {
    let cancelled = false;
    setModels([]); setSessions([]); setModelKey(''); setSessionRef(''); setSessionConfirmed(false);
    if (!projectId) { setLoadingOptions(false); return; }
    setLoadingOptions(true);
    void Promise.all([listPiModels(serverUrl, token, projectId), listPiSessions(serverUrl, token, projectId)]).then(([m, s]) => {
      if (cancelled) return;
      setModels(m.items); setSessions(s.items); setModelKey(m.items[0] ? `${m.items[0].provider}/${m.items[0].modelId}` : '');
    }).catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [projectId, serverUrl, token]);
  useEffect(() => {
    let cancelled = false;
    setTask(null); setEvents([]); setAnsweredRequests([]); followOutput.current = true; setShowLatest(false);
    if (!selectedPiTaskId) return () => { cancelled = true; };
    void getPiTask(serverUrl, token, selectedPiTaskId).then(async (loaded) => {
      const histories = await Promise.all((loaded.runs || []).map((run) => getPiRunEvents(serverUrl, token, run.id)));
      if (cancelled) return;
      const restored = histories.flatMap((history) => history.items).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || Number(a.seq) - Number(b.seq));
      for (const run of loaded.runs || []) {
        let cursor = 0;
        for (const event of restored.filter((item) => item.runId === run.id).sort((a, b) => Number(a.seq) - Number(b.seq))) {
          if (Number(event.seq) !== cursor + 1) break;
          cursor = Number(event.seq);
        }
        runCursors.current[run.id] = cursor; setPiEventCursor(run.id, cursor);
      }
      setEvents(restored); setTask(loaded);
    }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [selectedPiTaskId, serverUrl, token, setPiEventCursor]);

  const displayItems = useMemo(() => piDisplayItems(events), [events]);
  useEffect(() => {
    if (followOutput.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [displayItems]);
  const activeRun = useMemo(() => task?.runs?.find((run) => ['running','cancelling'].includes(run.status)) || task?.runs?.find((run) => run.status === 'queued'), [task]);
  const pendingInput = useMemo(() => [...events].reverse().find((event) => event.type === 'input.required' && event.payload?.id && !answeredRequests.includes(event.payload.id)), [events, answeredRequests]);
  useEffect(() => {
    if (!activeRun) return;
    const controller = new AbortController();
    void subscribePiRun(serverUrl, token, activeRun.id, runCursors.current[activeRun.id] || 0, (event) => {
      if (controller.signal.aborted) return;
      setEvents((current) => current.some((item) => item.seq === event.seq && item.runId === event.runId) ? current : [...current, event]);
      if (event.seq) { runCursors.current[activeRun.id] = event.seq; setPiEventCursor(activeRun.id, event.seq); }
      if (event.type.startsWith('run.')) void getPiTask(serverUrl, token, task!.id).then((loaded) => { if (!controller.signal.aborted) setTask(loaded); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    }, controller.signal).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [activeRun?.id, serverUrl, token, task?.id, setPiEventCursor]);

  const create = async () => {
    if (busy || !projectId || !text.trim() || !selectedHost?.online || loading || loadingOptions || (sessionRef && !sessionConfirmed)) return;
    const prompt = text.trim();
    setBusy(true); setError(''); setText('');
    let created: PiTask | undefined;
    try {
      created = await createPiTask(serverUrl, token, { projectId, title: [...prompt.split('\n')[0]].slice(0, 40).join(''), sessionRef: sessionRef || undefined, terminalExitedConfirmed: sessionRef ? sessionConfirmed : undefined });
      const model = models.find((item) => `${item.provider}/${item.modelId}` === modelKey);
      const command = await sendPiCommand(serverUrl, token, created.id, { kind: 'prompt', payload: { text: prompt, ...(model || {}) } });
      setSelectedPiTaskId(created.id); setTask({ ...created, runs: command.runId ? [{ id: command.runId, status: 'running', created_at: new Date().toISOString() }] : [] } as PiTask);
      setNewOpen(false); setSessionRef(''); setSessionConfirmed(false); void load();
    } catch (e) {
      if (created) { setSelectedPiTaskId(created.id); setNewOpen(false); }
      else setText(prompt);
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const send = async (kind: 'prompt' | 'steer' | 'follow_up' | 'stop') => {
    if (!task || busy || !task.online || activeRun?.status === 'cancelling' || (kind === 'stop' ? !activeRun : !text.trim())) return;
    const prompt = text.trim();
    setBusy(true); setError('');
    if (kind !== 'stop') { setText(''); followOutput.current = true; }
    try {
      const body: Record<string, unknown> = { kind, payload: kind === 'stop' ? {} : { text: prompt } };
      if (kind === 'steer' || kind === 'stop') body.runId = activeRun?.id;
      await sendPiCommand(serverUrl, token, task.id, body);
      setTask(await getPiTask(serverUrl, token, task.id));
    } catch (e) {
      if (kind !== 'stop') setText(prompt);
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const answerInput = async (response: Record<string, unknown>) => {
    if (!task || !activeRun || !pendingInput) return;
    const payload = pendingInput.payload;
    try { await sendPiCommand(serverUrl, token, task.id, { kind: 'input_response', runId: activeRun.id, payload: { processInstanceId: payload.processInstanceId, requestId: payload.id, response } });
    setAnsweredRequests((current) => [...current, payload.id]); setInputResponse('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (newOpen) return <div className="flex h-full min-h-0 flex-col bg-white">
    <header className="safe-top flex shrink-0 items-center gap-2 px-3 py-2">
      <button aria-label="返回对话列表" disabled={busy} onClick={() => setNewOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full"><ArrowLeft className="size-5" /></button>
      <div className="min-w-0 flex-1"><h1 className="font-semibold text-slate-900">Pi</h1><p className="truncate text-xs text-slate-500">{selectedHost?.name || '选择机器'} · {projects.find((project) => project.id === projectId)?.name || '选择项目'}</p></div>
      <button aria-label="选择机器、项目和模型" disabled={busy} onClick={() => setConfigOpen(true)} className="flex size-11 items-center justify-center rounded-full text-slate-600"><Settings2 className="size-5" /></button>
    </header>
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <h2 className="text-balance text-2xl font-semibold text-slate-900">有什么可以帮你？</h2>
      <p className="mt-3 text-center text-pretty text-sm leading-relaxed text-slate-500">直接描述目标，Pi 会在所选机器上执行。</p>
      <div className="mt-6 w-full max-w-sm space-y-2">{['检查项目并提出改进建议', '帮我实现一个新功能', selectedHost?.platform === 'linux' ? '检查云服务器的运行状态' : '梳理项目结构和启动方式'].map((prompt) => <button key={prompt} onClick={() => setText(prompt)} className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-600">{prompt}</button>)}</div>
      <button onClick={() => setConfigOpen(true)} className="mt-4 flex min-h-11 max-w-full items-center gap-2 rounded-full bg-slate-100 px-4 text-xs text-slate-600"><Settings2 className="size-4 shrink-0" /><span className="truncate">{models.find((model) => `${model.provider}/${model.modelId}` === modelKey)?.name || modelKey.split('/').at(-1) || '选择执行配置'}</span></button>
    </main>
    <PiComposer value={text} onChange={setText} onSend={() => void create()} busy={busy} online={Boolean(selectedHost?.online)} sendDisabled={loading || loadingOptions || !projectId || Boolean(sessionRef && !sessionConfirmed)} error={error} />
    <PiSheet open={configOpen} onOpenChange={setConfigOpen} title="执行配置" description="选择 Pi 使用的机器、项目和模型" footer={<button onClick={() => setConfigOpen(false)} className="mb-3 min-h-11 w-full rounded-xl bg-slate-900 text-sm font-medium text-white">完成</button>}>
      <div className="space-y-4">
        <section className="space-y-2"><h3 className="mb-3 text-xs font-medium text-slate-500">执行配置</h3>
          <PiPicker label="机器" value={selectedPiHostId || ''} options={hostOptions} onChange={chooseHost} disabled={busy} />
          <PiPicker label="项目" value={projectId} options={projects.map((p) => ({ value: p.id, label: p.name, description: p.display_path, icon: <FolderOpen className="size-5" /> }))} onChange={setProjectId} disabled={loading || busy} placeholder={loading ? '正在加载项目…' : '暂无项目'} />
          <PiPicker label="模型" value={modelKey} options={models.map((m) => ({ value: `${m.provider}/${m.modelId}`, label: m.name || m.modelId, description: m.provider, icon: <Bot className="size-5" /> }))} onChange={setModelKey} searchable disabled={loadingOptions || busy || !models.length} placeholder={loadingOptions ? '正在加载模型…' : '使用机器默认模型'} />
          <PiPicker label="历史会话" value={sessionRef} options={[{ value: '', label: '新会话', description: '从一个全新的上下文开始' }, ...sessions.map((session) => ({ value: session.sessionRef, label: session.name, description: new Date(session.updatedAt).toLocaleString() }))]} onChange={(value) => { setSessionRef(value); setSessionConfirmed(false); }} searchable={sessions.length > 8} disabled={loadingOptions || busy} />
        </section>
        {sessionRef && <label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"><input type="checkbox" checked={sessionConfirmed} onChange={(e) => setSessionConfirmed(e.target.checked)} className="mt-1 size-4 shrink-0" /><span>我已退出终端中使用该会话的 Pi，允许 App 接管。</span></label>}
        {selectedHost && !selectedHost.online && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">这台机器已离线，请等待它上线或选择其他机器。</p>}
      </div>
    </PiSheet>
  </div>;

  if (task) return (
    <div className="relative h-full min-h-0 flex flex-col bg-white">
      <header className="safe-top shrink-0 px-3 py-2 flex items-center gap-2">
        <button aria-label="返回对话列表" onClick={() => setSelectedPiTaskId(null)} className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1"><h1 className="font-semibold truncate">{task.title}</h1><p className="text-xs text-slate-500 truncate">{task.host_name} · {task.project_name} · {task.online ? (activeRun ? '执行中' : runStatus(task.runs?.[0]?.status)) : '离线'}</p></div>
        <button aria-label="归档任务" onClick={() => void archivePiTask(serverUrl, token, task.id).then(() => { setSelectedPiTaskId(null); void load(); })} className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100"><Archive className="w-4 h-4" /></button>
      </header>

      <main ref={scrollArea} onScroll={(e) => { const el = e.currentTarget; followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; setShowLatest(!followOutput.current); }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {displayItems.map((item) => <EventCard key={item.id} item={item} serverUrl={serverUrl} token={token} />)}
        {pendingInput && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3"><p className="text-sm font-medium">{pendingInput.payload?.title || pendingInput.payload?.message || 'Pi 需要输入'}</p>{pendingInput.payload?.method === 'select' ? <div className="flex flex-wrap gap-2">{(pendingInput.payload.options || []).map((option: string) => <button key={option} onClick={() => void answerInput({ value: option })} className="rounded-xl bg-white border px-3 py-2 text-sm">{option}</button>)}</div> : pendingInput.payload?.method === 'confirm' ? <div className="flex gap-2"><button onClick={() => void answerInput({ confirmed: true })} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">确认</button><button onClick={() => void answerInput({ confirmed: false })} className="rounded-xl bg-white border px-4 py-2 text-sm">拒绝</button></div> : <div className="flex gap-2"><input aria-label="Pi 请求的输入" value={inputResponse} onChange={(e) => setInputResponse(e.target.value)} className="flex-1 rounded-xl border px-3 py-2 text-sm" /><button onClick={() => void answerInput({ value: inputResponse })} className="rounded-xl bg-slate-900 text-white px-4 text-sm">提交</button></div>}</div>}
        {activeRun && !displayItems.some((item) => item.streaming) && <p role="status" className="flex items-center gap-2 py-2 text-sm text-slate-500"><span className="size-2 rounded-full bg-slate-800" />{activeRun.status === 'cancelling' ? '正在停止…' : activeRun.status === 'queued' ? '等待执行…' : 'Pi 正在处理…'}</p>}
        {!activeRun && !displayItems.length && <p className="py-12 text-center text-sm text-slate-400">发送消息开始对话</p>}
      </main>
      {showLatest && <button aria-label="滚动到最新消息" onClick={() => { followOutput.current = true; if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight; setShowLatest(false); }} className="mx-auto mb-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm"><ArrowDown className="size-4" />最新消息</button>}
      <PiComposer key={task.id} value={text} onChange={setText} onSend={(kind) => void send(kind)} activeStatus={activeRun?.status} busy={busy} online={task.online} error={error} />
    </div>
  );

  return <div className="h-full min-h-0 flex flex-col bg-slate-50">
    <header className="safe-top shrink-0 px-3 py-3 bg-white border-b border-slate-100 flex items-center gap-2">
      <button aria-label="返回聊天" onClick={onBack} className="flex size-11 items-center justify-center rounded-xl"><ArrowLeft className="size-5" /></button>
      <div className="flex-1"><h1 className="text-lg font-semibold text-slate-900">Pi 对话</h1><p className="text-xs text-slate-500">把想法交给你的机器</p></div>
      <button disabled={loading} onClick={() => void load()} aria-label="刷新机器与任务" className="flex size-11 items-center justify-center rounded-xl text-slate-500 disabled:opacity-40"><RefreshCw className="size-4" /></button>
      <button onClick={() => { setPairOpen(true); setPairingCode(''); }} className="flex size-11 items-center justify-center rounded-xl text-slate-500" aria-label="配对或管理机器"><Link2 className="size-5" /></button>
    </header>
    <div className="shrink-0 p-4"><PiPicker label="机器" value={selectedPiHostId || ''} options={hostOptions} onChange={chooseHost} placeholder={loading ? '正在连接…' : '选择执行机器'} /></div>
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-700">对话记录 <span className="ml-1 font-normal tabular-nums text-slate-400">{tasks.length}</span></h2><button onClick={() => { setError(''); setText(''); setNewOpen(true); }} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-blue-600"><Plus className="size-4" />新对话</button></div>
      <div className="space-y-3">{tasks.map((item) => <button key={item.id} onClick={() => setSelectedPiTaskId(item.id)} className="w-full text-left p-4 bg-white rounded-2xl border border-slate-100"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><Bot className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-medium text-sm text-slate-900 truncate">{item.title}</p><p className="text-xs text-slate-500 mt-1 truncate">{item.project_name}</p></div><ChevronRight className="size-4 text-slate-300" /></div><p className="mt-3 border-t border-slate-50 pt-3 text-xs tabular-nums text-slate-400">{new Date(item.updated_at).toLocaleString()}</p></button>)}</div>
      {loading && !tasks.length ? <div role="status" className="py-16 text-center text-sm text-slate-500">正在加载任务…</div> : !tasks.length && <div className="py-14 text-center"><div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white text-slate-400"><Bot className="size-7" /></div><h2 className="text-base font-medium text-slate-800">{hosts.length ? '开始一段新对话' : '连接一台机器'}</h2><p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{hosts.length ? '选择项目，描述你想完成的事，Pi 会在这台机器上执行。' : '配对 Mac 或服务器后，就能在这里远程安排任务。'}</p><button onClick={() => hosts.length ? setNewOpen(true) : setPairOpen(true)} className="mt-5 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white">{hosts.length ? '新对话' : '配对机器'}</button></div>}
    </main>
    {error && <p role="alert" className="shrink-0 p-3 text-sm text-red-600 bg-red-50">{error}</p>}
    <PiSheet open={pairOpen} onOpenChange={setPairOpen} title="机器配对" description="把 Mac 或服务器连接到当前账号" footer={<button onClick={() => setPairOpen(false)} className="mb-3 w-full min-h-11 rounded-xl bg-slate-100 text-sm font-medium">完成</button>}>
      {pairingCode ? <div className="rounded-2xl bg-slate-50 p-5 text-center"><p className="text-xs text-slate-500">5 分钟内在 Runner 输入</p><p className="text-3xl font-mono tabular-nums mt-3 text-slate-900">{pairingCode}</p></div> : <button onClick={() => void createPiPairingCode(serverUrl, token).then((result) => setPairingCode(result.code)).catch((e) => setError(e.message))} className="w-full min-h-12 rounded-xl bg-blue-600 text-white text-sm">生成一次性配对码</button>}
      <div className="mt-4 space-y-2">{hosts.map((host) => <div key={host.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{host.name}</p><p className="mt-1 text-xs text-slate-500">{host.online ? '在线' : '离线'}</p></div><button aria-label={`撤销 ${host.name}`} onClick={() => void revokePiHost(serverUrl, token, host.id).then(load).catch((e) => setError(e.message))} className="flex size-11 items-center justify-center rounded-xl text-red-600"><Trash2 className="size-4" /></button></div>)}</div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </PiSheet>

  </div>;
};

const runStatus = (status?: string) => ({ succeeded: '已完成', failed: '执行失败', interrupted: '执行已中断', cancelled: '已停止', queued: '等待执行', running: '执行中', cancelling: '正在停止' }[status || ''] || '准备就绪');

const EventCard: React.FC<{ item: PiDisplayItem; serverUrl: string; token: string }> = ({ item, serverUrl, token }) => {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loadOutput = async () => {
    setLoading(true); setError('');
    try { setOutput(piContentText(await getPiOutput(serverUrl, token, item.runId, item.outputId!))); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  if (item.kind === 'tool') return <details className="min-w-0 text-sm"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-slate-500"><Wrench className="size-4 shrink-0" /><span className="truncate">{({ bash: '执行命令', read: '读取文件', write: '写入文件', edit: '修改文件', ls: '浏览目录', grep: '搜索内容', find: '查找文件' } as Record<string, string>)[item.title || ''] || item.title}</span><span className={cn('text-xs', item.status === '失败' ? 'text-red-600' : 'text-slate-400')}>{item.status}</span><ChevronRight className="ml-auto size-4 shrink-0" /></summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-relaxed">{output ?? item.text}</pre>{item.outputId && output === null && <button disabled={loading} onClick={() => void loadOutput()} className="min-h-11 text-xs underline">{loading ? '加载中…' : '查看完整输出'}</button>}{error && <p role="alert" className="text-red-600">{error}</p>}</details>;
  if (item.kind === 'error') return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{item.text}</p>;
  if (item.role === 'user') return <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-slate-100 px-4 py-2.5 text-base leading-relaxed text-slate-900">{item.text}</p></div>;
  if (item.streaming) {
    return <article aria-label="Pi 回复" className="min-w-0 text-base text-slate-900">
      <div className="whitespace-pre-wrap break-words leading-7">{item.text || ''}<span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-900 align-middle" /></div>
      <span role="status" className="text-xs text-slate-400">正在回复…</span>
    </article>;
  }
  return <article aria-label="Pi 回复" className="min-w-0 text-base text-slate-900">
    <div className="prose prose-slate max-w-none break-words text-base leading-7 prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-pre:m-0 prose-pre:rounded-none prose-pre:bg-transparent prose-pre:p-3 prose-pre:text-slate-800 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        pre({ children }) {
          const code = React.isValidElement<{ children?: React.ReactNode; className?: string }>(children) ? children.props : {};
          const text = String(code.children ?? '');
          return <div className="not-prose my-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><div className="flex min-h-11 items-center justify-between border-b border-slate-200 px-3 text-xs text-slate-500"><span>{code.className?.replace('language-', '') || '代码'}</span><CopyButton text={text} label="复制代码" /></div><pre className="overflow-x-auto p-3 text-sm leading-6">{children}</pre></div>;
        },
        table({ children }) { return <div className="my-4 overflow-x-auto"><table>{children}</table></div>; },
        a({ children, ...props }) { return <a {...props} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>; },
      }}>{item.text}</ReactMarkdown>
    </div>
    <CopyButton text={item.text} label="复制回复" />
  </article>;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <span className="inline-flex items-center gap-2"><button aria-label={copied ? '已复制' : label} onClick={async () => { const ok = await copyToClipboard(text); setCopied(ok); setError(!ok); }} className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}<span>{copied ? '已复制' : label}</span></button>{error && <span role="alert" className="text-xs text-red-600">复制失败，请长按选择文字</span>}</span>;
}
