import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ListPlus, SlidersHorizontal, Square } from 'lucide-react';
import { PiSheet } from './PiSheet';
import { cn } from '../lib/utils';

export function PiComposer({ value, onChange, onSend, activeStatus, busy, online, error, sendDisabled = false }: {
  value: string; onChange: (value: string) => void;
  onSend: (kind: 'prompt' | 'steer' | 'follow_up' | 'stop') => void;
  activeStatus?: string; busy: boolean; online: boolean; error: string; sendDisabled?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'steer' | 'follow_up'>('steer');
  const [modeOpen, setModeOpen] = useState(false);
  const active = Boolean(activeStatus);
  const stopping = activeStatus === 'cancelling';
  const disabled = busy || !online || stopping || sendDisabled;
  const hasText = Boolean(value.trim());
  const modeLabel = mode === 'steer' ? '调整当前' : '排队追加';
  const submit = () => { if (!disabled && hasText) onSend(active ? mode : 'prompt'); };

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return <footer className="safe-bottom shrink-0 bg-white px-3 pt-2">
    <div className="mx-auto max-w-3xl">
      {error && <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-600">{error}</p>}
      {!online && <p role="status" className="mb-2 px-2 text-xs text-slate-500">机器已离线，输入会保留，上线后可发送。</p>}
      <div className="flex items-end gap-1 rounded-3xl border border-slate-200 bg-slate-100 p-1.5 focus-within:border-slate-400">
        {active && <button type="button" disabled={disabled} aria-label={`选择消息发送方式：${modeLabel}`} aria-haspopup="dialog" aria-expanded={modeOpen} onClick={() => setModeOpen(true)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900 disabled:opacity-40">
          {mode === 'steer' ? <SlidersHorizontal className="size-5" /> : <ListPlus className="size-5" />}<span className="sr-only">{modeLabel}</span>
        </button>}
        <textarea ref={textarea} aria-label="发送给 Pi 的消息" value={value} onChange={(e) => onChange(e.target.value)} readOnly={busy} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          placeholder={stopping ? '正在停止…' : active ? (mode === 'steer' ? '告诉 Pi 需要怎样调整…' : '接下来还需要做什么？') : '向 Pi 发送消息'}
          className="block max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400" />
        {busy && <span role="status" className="sr-only">正在提交…</span>}
        {active && <button type="button" aria-label={stopping ? '正在停止执行' : '停止执行'} disabled={disabled} onClick={() => onSend('stop')} className={cn('flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40', hasText ? 'bg-white text-slate-700' : 'bg-slate-900 text-white')}><Square className="size-4 fill-current" /></button>}
        {(!active || hasText) && <button type="button" aria-label={active ? `发送并${modeLabel}` : '发送消息'} disabled={disabled || !hasText} onClick={submit} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:bg-slate-200 disabled:text-slate-400"><ArrowUp className="size-5" strokeWidth={2.5} /></button>}
      </div>
    </div>
    <PiSheet open={modeOpen} onOpenChange={setModeOpen} title="消息发送方式" description="选择这条消息如何交给正在运行的 Pi">
      <div className="space-y-2">{([
        { value: 'steer', label: '调整当前', description: '让 Pi 在当前执行过程中调整方向', icon: SlidersHorizontal },
        { value: 'follow_up', label: '排队追加', description: '等当前执行完成后，再处理这条消息', icon: ListPlus },
      ] as const).map((option) => <button type="button" key={option.value} aria-pressed={mode === option.value} onClick={() => { setMode(option.value); setModeOpen(false); }} className={cn('flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900', mode === option.value ? 'border-slate-300 bg-slate-100' : 'border-slate-100 bg-white')}><option.icon className="size-5 shrink-0 text-slate-600" /><span className="flex-1"><span className="block text-sm font-medium text-slate-900">{option.label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{option.description}</span></span>{mode === option.value && <Check className="size-5 shrink-0 text-slate-700" />}</button>)}</div>
    </PiSheet>
  </footer>;
}
