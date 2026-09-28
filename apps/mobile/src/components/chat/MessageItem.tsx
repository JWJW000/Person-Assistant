import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { TicketCard } from '../TicketCard';
import type { TrainTicket } from '@assistant/contracts';
import { compareTickets, hasAvailableSeat, type TicketSort } from '../../lib/ticketView';
import { cleanDisplayContent } from '../../hooks/useTrainTicketParser';

export interface DisplayMessage {
  id: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tickets?: TrainTicket[];
  isStreaming?: boolean;
  statusText?: string;
  createTime?: string;
  /** true = 历史消息加载，跳过入场动画 */
  skipAnimation?: boolean;
}

export interface MessageItemProps {
  msg: DisplayMessage;
  activeKbId: number | null;
  isExpanded: boolean;
  isCopied: boolean;
  onCopyText: (text: string) => void;
  onCopyMessage: (text: string, id: string | number) => void;
  onRegenerate: (id: string | number) => void;
  onToggleExpanded: (id: string | number) => void;
  onViewRoute: (ticket: TrainTicket) => void;
  onWatch?: (ticket: TrainTicket, seatKind: string) => void;
}

export const MessageItem = React.memo<MessageItemProps>(
  ({
    msg,
    activeKbId,
    isExpanded,
    isCopied,
    onCopyText,
    onCopyMessage,
    onRegenerate,
    onToggleExpanded,
    onViewRoute,
    onWatch,
  }) => {
    const [onlyAvailable, setOnlyAvailable] = React.useState(false);
    const [sort, setSort] = React.useState<TicketSort>('departure');
    const isUser = msg.role === 'user';
    const visibleTickets = React.useMemo(() => {
      const source = msg.tickets || [];
      const filtered = onlyAvailable ? source.filter(hasAvailableSeat) : source;
      return [...filtered].sort(compareTickets(sort));
    }, [msg.tickets, onlyAvailable, sort]);

    return (
      <div className={`${msg.skipAnimation ? '' : 'chat-message-enter'} flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full min-w-0`}>
        {isUser ? (
          <div className="max-w-[82%] sm:max-w-[75%] bg-[#F4F4F4] text-[#0D0D0D] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed select-text font-normal shadow-none">
            {msg.content}
          </div>
        ) : (
          <div className="w-full max-w-full min-w-0 text-[15px] leading-[1.7] text-[#0D0D0D] select-text">
            {msg.isStreaming && !msg.content ? (
              <div className="flex items-center gap-2 py-2 select-none">
                <div className="flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-3" />
                </div>
                <span className="font-mono text-xs text-slate-400">
                  {msg.statusText || (activeKbId ? '正在检索知识库并思考...' : '正在深度思考并组织回答...')}
                </span>
              </div>
            ) : (
              <div className="prose prose-slate max-w-full overflow-hidden text-[#0D0D0D] break-words [word-break:break-word] prose-p:my-2 prose-headings:my-2.5 prose-pre:my-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeText = String(children).replace(/\n$/, '');
                      const isBlock = match || codeText.includes('\n');

                      if (isBlock) {
                        return (
                          <div className="relative my-2.5 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-[#1E1E1E] text-slate-100">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#2D2D2D] border-b border-[#3D3D3D] text-[10px] font-mono text-slate-300">
                              <span>{match ? match[1].toUpperCase() : 'CODE'}</span>
                              <button
                                onClick={() => onCopyText(codeText)}
                                className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>复制代码</span>
                              </button>
                            </div>
                            <pre className="p-3 text-xs font-mono text-slate-100 overflow-x-auto max-w-full leading-normal whitespace-pre">
                              {children}
                            </pre>
                          </div>
                        );
                      }

                      return (
                        <code
                          className="inline-flex items-center mx-0.5 px-1.5 py-0.5 rounded-md font-mono text-xs bg-slate-100 text-slate-800 border border-slate-200"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {cleanDisplayContent(msg.content)}
                </ReactMarkdown>

                {msg.isStreaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-slate-900 animate-pulse align-middle" />
                )}
              </div>
            )}

            {/* 12306 车票富卡片 */}
            {visibleTickets.length > 0 && (() => {
              const displayTickets = isExpanded ? visibleTickets : visibleTickets.slice(0, 3);
              const hasMore = visibleTickets.length > 3;

              return (
                <div className="w-full mt-3 flex flex-col gap-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-mono px-1">
                    <span>12306 车次 ({displayTickets.length}/{visibleTickets.length})</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setOnlyAvailable((value) => !value)} className={`rounded-full px-2 py-0.5 ${onlyAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>只看有票</button>
                      {(['departure', 'duration', 'price'] as TicketSort[]).map((key) => (
                        <button key={key} type="button" onClick={() => setSort(key)} className={`rounded-full px-2 py-0.5 ${sort === key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {key === 'departure' ? '出发' : key === 'duration' ? '耗时' : '价格'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {displayTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onViewRoute={onViewRoute}
                      onWatch={onWatch}
                    />
                  ))}

                  {hasMore && (
                    <button
                      onClick={() => onToggleExpanded(msg.id)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-[0.99] text-xs font-semibold text-slate-600 flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200/60"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                          <span>收起备选车次</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                          <span>查看其余 {visibleTickets.length - 3} 趟备选车次</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* AI 消息底部微操作行 */}
            {!isUser && msg.content && !msg.isStreaming && (
              <div className="flex items-center gap-1.5 mt-2 select-none">
                <button
                  onClick={() => onCopyMessage(msg.content, msg.id)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="复制回答"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600 text-[10px]">已复制</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  onClick={() => onRegenerate(msg.id)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="重新生成"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.msg.content === next.msg.content &&
      prev.msg.isStreaming === next.msg.isStreaming &&
      prev.msg.statusText === next.msg.statusText &&
      prev.msg.tickets === next.msg.tickets &&
      prev.isExpanded === next.isExpanded &&
      prev.isCopied === next.isCopied &&
      prev.activeKbId === next.activeKbId &&
      prev.onCopyText === next.onCopyText &&
      prev.onCopyMessage === next.onCopyMessage &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onToggleExpanded === next.onToggleExpanded &&
      prev.onViewRoute === next.onViewRoute &&
      prev.onWatch === next.onWatch
    );
  }
);
