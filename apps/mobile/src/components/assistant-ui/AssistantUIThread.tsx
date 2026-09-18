import { FC } from 'react';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  AuiIf
} from '@assistant-ui/react';
import { TooltipIconButton } from './TooltipIconButton';
import { FormattedMarkdown } from './FormattedMarkdown';
import { TicketCard } from '../TicketCard';
import { ErrorCard } from '../ErrorCard';
import { TrainTicket } from '@assistant/contracts';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  RotateCw,
  Sparkles,
  Train
} from 'lucide-react';

export interface AssistantUIThreadProps {
  customMessagesMap: Map<string, { content?: string; tickets?: TrainTicket[]; error?: { code: string; message: string } }>;
  onViewRoute: (ticket: TrainTicket) => void;
  quickPrompts?: string[];
  onSelectPrompt?: (prompt: string) => void;
}

export const AssistantUIThread: FC<AssistantUIThreadProps> = ({
  customMessagesMap,
  onViewRoute,
  quickPrompts = [],
  onSelectPrompt
}) => {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full bg-slate-50/50">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs border border-blue-100 mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">有什么我可以帮您的？</h2>
            <p className="text-xs text-slate-500 max-w-sm mb-6 leading-relaxed">
              我是您的全能个人 AI 助理。您可以和我自由探讨任何话题、解决疑问，或者随时查询 12306 实时列车车次：
            </p>

            {quickPrompts.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectPrompt?.(p)}
                    className="px-3.5 py-2 bg-white rounded-xl text-xs font-medium text-slate-700 shadow-2xs border border-slate-200/80 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all text-left"
                  >
                    ✨ {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            const extra = customMessagesMap.get(message.id);

            if (message.role === 'user') {
              const userText = extra?.content || (message.content?.[0] as any)?.text || '';
              return (
                <MessagePrimitive.Root className="flex flex-col items-end my-2 group">
                  <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-xs px-4 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-xs shadow-blue-600/10">
                    <p className="whitespace-pre-wrap">{userText}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </MessagePrimitive.Root>
              );
            }

            // Assistant Message
            const isRunning = message.status?.type === 'running';
            const displayText = extra?.content || (message.content?.[0] as any)?.text || '';

            return (
              <MessagePrimitive.Root className="flex flex-col items-start my-2 w-full group">
                <div className="flex items-start gap-2.5 w-full">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                    <Train className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0 max-w-[92%]">
                    {extra?.error ? (
                      <ErrorCard title="服务状态提醒" code={extra.error.code} message={extra.error.message} />
                    ) : (
                      <div className="bg-white text-slate-800 border border-slate-200/70 rounded-2xl rounded-tl-xs px-4 py-3 text-sm leading-relaxed shadow-2xs">
                        {displayText ? (
                          <FormattedMarkdown content={displayText} isStreaming={isRunning} />
                        ) : isRunning ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="text-xs text-slate-400 font-medium ml-1">思考中...</span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* 车票卡片挂载 */}
                    {extra?.tickets && extra.tickets.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {extra.tickets.map((t) => (
                          <TicketCard key={t.id} ticket={t} onViewRoute={onViewRoute} />
                        ))}
                      </div>
                    )}

                    {/* 底部操作栏 */}
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <ActionBarPrimitive.Root
                        hideWhenRunning
                        autohide="not-last"
                        className="flex items-center gap-1 text-slate-400"
                      >
                        <ActionBarPrimitive.Copy asChild>
                          <TooltipIconButton tooltip="复制内容" size="sm">
                            <AuiIf condition={(s) => s.message.isCopied}>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            </AuiIf>
                            <AuiIf condition={(s) => !s.message.isCopied}>
                              <Copy className="w-3.5 h-3.5" />
                            </AuiIf>
                          </TooltipIconButton>
                        </ActionBarPrimitive.Copy>

                        <ActionBarPrimitive.Reload asChild>
                          <TooltipIconButton tooltip="重新回答" size="sm">
                            <RotateCw className="w-3.5 h-3.5" />
                          </TooltipIconButton>
                        </ActionBarPrimitive.Reload>
                      </ActionBarPrimitive.Root>

                      <BranchPicker />
                    </div>
                  </div>
                </div>
              </MessagePrimitive.Root>
            );
          }}
        </ThreadPrimitive.Messages>

        <ThreadScrollToBottom />
      </ThreadPrimitive.Viewport>

      {/* 底部官方 Composer 交互容器 */}
      <div className="safe-bottom bg-white/90 backdrop-blur-xl border-t border-slate-200/80 px-4 py-3">
        <ComposerPrimitive.Root className="relative flex flex-col bg-slate-100/90 rounded-2xl p-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 border border-slate-200/80 transition-all">
          <ComposerPrimitive.Input
            placeholder="问我任何问题，或查火车票（如：查明天北京到洛阳）..."
            rows={1}
            autoFocus
            className="w-full resize-none bg-transparent px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />
              12306 实时互联
            </div>

            <div className="flex items-center gap-1.5">
              <AuiIf condition={(s) => !s.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <TooltipIconButton
                    tooltip="发送消息 (Enter)"
                    variant="default"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </TooltipIconButton>
                </ComposerPrimitive.Send>
              </AuiIf>

              <AuiIf condition={(s) => s.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-xl bg-slate-900 text-white flex items-center justify-center active:scale-95 transition-transform"
                    title="停止生成"
                  >
                    <span className="w-2.5 h-2.5 bg-white rounded-xs" />
                  </button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
};

const BranchPicker: FC = () => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center gap-1 text-slate-400 text-xs ml-auto"
    >
      <BranchPickerPrimitive.Previous asChild>
        <button type="button" className="p-1 hover:text-slate-600 active:scale-90">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </BranchPickerPrimitive.Previous>
      <span className="text-[10px] font-mono">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <button type="button" className="p-1 hover:text-slate-600 active:scale-90">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <button
        type="button"
        className="fixed bottom-24 right-6 w-9 h-9 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all active:scale-95 disabled:hidden z-30"
        title="回到底部"
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </ThreadPrimitive.ScrollToBottom>
  );
};
