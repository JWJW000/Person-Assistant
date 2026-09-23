import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export function PiSheet({ open, onOpenChange, title, description, children, footer }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; footer?: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
      <Dialog.Content ref={content} tabIndex={-1} onOpenAutoFocus={(e) => { e.preventDefault(); previousFocus.current = document.activeElement as HTMLElement; content.current?.focus(); }} onCloseAutoFocus={(e) => { e.preventDefault(); previousFocus.current?.focus(); }} className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(var(--app-height,100dvh)-env(safe-area-inset-top)-16px)] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl outline-none">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" />
        <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-4">
          <div className="min-w-0 flex-1"><Dialog.Title className="text-lg font-semibold text-slate-900 text-balance">{title}</Dialog.Title><Dialog.Description className="mt-1 text-sm leading-relaxed text-slate-500 text-pretty">{description}</Dialog.Description></div>
          <Dialog.Close aria-label={`关闭${title}`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><X className="size-5" /></Dialog.Close>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        <footer className="safe-bottom shrink-0 border-t border-slate-100 px-5 pt-3">{footer}</footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export type PiOption = { value: string; label: string; description?: string; icon?: ReactNode; badge?: string; disabled?: boolean };
export function PiPicker({ label, value, options, onChange, placeholder = '请选择', searchable = false, disabled = false }: {
  label: string; value: string; options: PiOption[]; onChange: (value: string) => void; placeholder?: string; searchable?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => `${option.label} ${option.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <button type="button" aria-label={`选择${label}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => { setQuery(''); setOpen(true); }} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">
      {selected?.icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{selected.icon}</span>}
      <span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">{label}</span><span className="mt-1 block truncate text-sm font-medium text-slate-900">{selected?.label || placeholder}</span></span>
      {selected?.badge && <span className="text-xs text-slate-500">{selected.badge}</span>}<ChevronRight className="size-4 shrink-0 text-slate-400" />
    </button>
    <PiSheet open={open} onOpenChange={setOpen} title={`选择${label}`} description={searchable ? `共 ${options.length} 项，支持按名称搜索` : '选择后立即应用'}>
      {searchable && <div className="sticky top-0 z-10 bg-white pb-3"><label className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3"><Search className="size-4 shrink-0 text-slate-400" /><input aria-label={`搜索${label}`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`搜索${label}…`} className="min-w-0 flex-1 bg-transparent py-3 text-base text-slate-900 outline-none" /></label></div>}
      <div className="space-y-2">
        {filtered.map((option) => <button type="button" key={option.value} aria-pressed={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); }} className={cn('flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40', option.value === value ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white')}>
          {option.icon && <span className="text-slate-500">{option.icon}</span>}<span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-slate-900">{option.label}</span>{option.description && <span className="mt-1 block break-all text-xs leading-relaxed text-slate-500">{option.description}</span>}</span>{option.badge && <span className="shrink-0 text-xs text-slate-500">{option.badge}</span>}{option.value === value && <Check className="size-5 shrink-0 text-blue-600" />}
        </button>)}
        {!filtered.length && <p className="py-10 text-center text-sm text-slate-500">{options.length ? '没有找到匹配项，试试其他关键词' : '暂无可选项'}</p>}
      </div>
    </PiSheet>
  </>;
}
