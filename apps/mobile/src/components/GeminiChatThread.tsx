import React, { FC, useRef, useEffect } from 'react';
import { FormattedMarkdown } from './assistant-ui/FormattedMarkdown';
import { TicketsDisplay } from './TicketsDisplay';
import { ErrorCard } from './ErrorCard';
import { TrainTicket } from '@assistant/contracts';
import {
  ArrowUp,
  Sparkles,
  Copy,
  Check,
  Square
} from 'lucide-react';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  tickets?: TrainTicket[];
  error?: { code: string; message: string };
  isStreaming?: boolean;
}

interface GeminiChatThreadProps {
  messages: ChatMessageItem[];
  loading: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onViewRoute: (ticket: TrainTicket) => void;
  quickPrompts?: string[];
}

export const GeminiChatThread: FC<GeminiChatThreadProps> = ({
  messages,
  loading,
  onSend,
  onCancel,
  onViewRoute,
  quickPrompts = []
}) => {
  const [inputText, setInputText] = React.useState('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 随消息增量实时滚动触底
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim() && !loading) {
        const t = inputText.trim();
        setInputText('');
        onSend(t);
      }
    }
  };

  const submit = () => {
    if (inputText.trim() && !loading) {
      const t = inputText.trim();
      setInputText('');
      onSend(t);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFAFC]">
      {/* 滚动消息区 */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            {/* Gemini 标志性彩色流光微渐变 */}
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-500 p-0.5 shadow-lg shadow-indigo-500/15 mb-4">
              <div className="w-full h-full bg-white rounded-[22px] flex items-center justify-center text-blue-600">
                <Sparkles className="w-8 h-8 text-blue-600 fill-blue-50" />
              </div>
            </div>

            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
              您好，今天想聊点什么？
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mb-8 leading-relaxed">
              基于 Gemini 高速大模型驱动。支持百科常识、探讨想法、编写代码，以及 12306 实时火车票调度。
            </p>

            {quickPrompts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSend(p)}
                    className="p-3 bg-white rounded-2xl text-xs font-medium text-slate-700 shadow-2xs border border-slate-200/80 hover:border-blue-300 hover:shadow-xs hover:text-blue-600 active:scale-[0.98] transition-all text-left flex items-center justify-between group"
                  >
                    <span className="truncate pr-2">{p}</span>
                    <Sparkles className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex justify-end my-3">
                  <div className="bg-[#E9EEF6] text-slate-900 rounded-3xl rounded-br-sm px-5 py-3 max-w-[85%] text-sm leading-relaxed shadow-2xs">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              );
            }

            // Assistant Message (Gemini 对标质感：左侧标志星光图标 + 纯白内容卡片)
            return (
              <div key={m.id} className="flex items-start gap-3 my-4 group">
                {/* Gemini 极光图标 */}
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs shadow-indigo-500/10 mt-0.5">
                  <Sparkles className="w-4 h-4 fill-white/20" />
                </div>

                <div className="flex-1 min-w-0 max-w-[94%] space-y-2">
                  {m.error ? (
                    <ErrorCard title="服务提醒" code={m.error.code} message={m.error.message} />
                  ) : (
                    <div className="text-slate-800 text-sm leading-relaxed py-1">
                      {m.content ? (
                        <FormattedMarkdown content={m.content} isStreaming={m.isStreaming} />
                      ) : m.isStreaming ? (
                        <div className="flex items-center gap-1.5 py-1 text-slate-400 text-xs">
                          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 animate-pulse" />
                          <span className="font-medium bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent animate-pulse">
                            思考中...
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* 结构化车票卡片挂载：默认精选前 3 趟，支持展开全部 */}
                  {m.tickets && m.tickets.length > 0 && (
                    <TicketsDisplay tickets={m.tickets} onViewRoute={onViewRoute} defaultVisibleCount={3} />
                  )}

                  {/* 操作栏（仅当有回复且非流式阶段显示） */}
                  {m.content && !m.isStreaming && (
                    <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(m.id, m.content)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-xs flex items-center gap-1 transition-all"
                        title="复制"
                      >
                        {copiedId === m.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* 底部 Gemini 风格独立浮动输入框 */}
      <div className="safe-bottom bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-3 pt-2">
        <div className="max-w-3xl mx-auto relative bg-[#F0F4F9] rounded-3xl p-2 border border-slate-200/80 focus-within:bg-white focus-within:shadow-md focus-within:border-blue-400/80 transition-all flex flex-col">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? '大模型正在响应中...' : '向 Gemini 提问，或查火车票（如：明天北京到洛阳）...'}
            disabled={loading}
            className="w-full bg-transparent px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 resize-none outline-none max-h-32 leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1 px-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Gemini 3.8 · 12306 互联</span>
            </div>

            <div className="flex items-center gap-1">
              {loading ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all shadow-xs"
                  title="停止生成"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!inputText.trim()}
                  className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30 active:scale-95 transition-all shadow-xs"
                  title="发送"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
