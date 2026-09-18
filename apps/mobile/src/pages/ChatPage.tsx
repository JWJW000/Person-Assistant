import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeminiChatThread, ChatMessageItem } from '../components/GeminiChatThread';
import { ConversationDrawer } from '../components/ConversationDrawer';
import { useAppStore } from '../store';
import { RouteModal, RouteStation } from '../components/RouteModal';
import { FilterSheet } from '../components/FilterSheet';
import { SlidersHorizontal, Plus, Menu, Sparkles } from 'lucide-react';
import { TrainTicket, TicketQuery } from '@assistant/contracts';
import { readSseStream, RunStreamEvent } from '../lib/runStream';

export const ChatPage: React.FC = () => {
  const {
    serverUrl,
    deviceToken,
    activeConversationId,
    setActiveConversationId,
    conversations,
    setConversations
  } = useAppStore();

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 经停站和筛选弹窗状态
  const [selectedTicket, setSelectedTicket] = useState<TrainTicket | null>(null);
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<Partial<TicketQuery>>({});

  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. 获取会话列表
  const fetchConversations = useCallback(async () => {
    if (!serverUrl || !deviceToken) return;
    try {
      const res = await fetch(`${serverUrl}/v1/conversations`, {
        headers: { Authorization: `Bearer ${deviceToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setConversations(data.items);
        }
      }
    } catch (err) {
      console.error('获取会话列表失败:', err);
    }
  }, [serverUrl, deviceToken, setConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // 2. 根据 activeConversationId 切换并拉取对话历史
  useEffect(() => {
    let active = true;
    const fetchMessages = async () => {
      if (!serverUrl || !deviceToken || !activeConversationId) return;
      try {
        const res = await fetch(`${serverUrl}/v1/conversations/${activeConversationId}/messages`, {
          headers: { Authorization: `Bearer ${deviceToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.items)) {
            const formatted: ChatMessageItem[] = data.items.map((m: any) => {
              const textPart = m.parts?.find((p: any) => p.type === 'text')?.text || '';
              const ticketsPart = m.parts?.find((p: any) => p.type === 'tickets');
              const tickets = Array.isArray(m.tickets) && m.tickets.length
                ? m.tickets
                : ticketsPart?.tickets;
              return {
                id: m.id,
                role: m.role,
                content: textPart,
                createdAt: m.created_at,
                tickets: Array.isArray(tickets) && tickets.length ? tickets : undefined,
                isStreaming: false
              };
            });
            setMessages(formatted);
          }
        }
      } catch (err) {
        console.error('加载会话消息失败:', err);
      }
    };

    fetchMessages();
    return () => {
      active = false;
    };
  }, [serverUrl, deviceToken, activeConversationId]);

  // 3. 创建新会话
  const handleCreateNewConversation = async () => {
    if (!serverUrl || !deviceToken) return;
    try {
      const res = await fetch(`${serverUrl}/v1/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify({ title: '新会话' })
      });
      if (res.ok) {
        const newConv = await res.json();
        setMessages([]);
        setActiveConversationId(newConv.id);
        fetchConversations();
      }
    } catch (err) {
      console.error('新建会话失败:', err);
    }
  };

  // 4. 删除会话
  const handleDeleteConversation = async (id: string) => {
    if (!serverUrl || !deviceToken) return;
    try {
      const res = await fetch(`${serverUrl}/v1/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${deviceToken}` }
      });
      if (res.ok) {
        if (activeConversationId === id) {
          setActiveConversationId('default');
        }
        fetchConversations();
      }
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  // 5. 重命名会话
  const handleRenameConversation = async (id: string, newTitle: string) => {
    if (!serverUrl || !deviceToken) return;
    try {
      const res = await fetch(`${serverUrl}/v1/conversations/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) {
        fetchConversations();
      }
    } catch (err) {
      console.error('重命名会话失败:', err);
    }
  };

  const handleViewRoute = (ticket: TrainTicket) => {
    setSelectedTicket(ticket);
    setRouteStations([
      {
        stationNo: 1,
        stationName: ticket.from.name,
        arriveTime: '--:--',
        departureTime: ticket.departureAt.slice(11, 16),
        stopoverTime: '始发'
      },
      {
        stationNo: 2,
        stationName: ticket.to.name,
        arriveTime: ticket.arrivalAt.slice(11, 16),
        departureTime: '--:--',
        stopoverTime: '终到'
      }
    ]);
    setRouteModalOpen(true);
  };

  const stopStream = useCallback(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const handleCancel = useCallback(() => {
    stopStream();
    setLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, [stopStream]);

  // 6. 发送与流式处理
  const handleSend = useCallback(
    async (userText: string) => {
      if (!userText.trim() || loading) return;

      const userMsgId = `msg_${Date.now()}`;
      const asstMsgId = `asst_${Date.now() + 1}`;

      // Gemini 式双端即时渲染：直接插入 User 提问 + 处于 isStreaming 状态的 Assistant 气泡
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          content: userText,
          createdAt: new Date().toISOString()
        },
        {
          id: asstMsgId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true
        }
      ]);
      setLoading(true);

      // 如果当前会话还是初始名称，根据第一句话自动改名
      const currentConv = conversations.find((c) => c.id === activeConversationId);
      if (currentConv && (currentConv.title === '新会话' || currentConv.title === '新的查询与会话')) {
        handleRenameConversation(activeConversationId, userText.slice(0, 16));
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        stopStream();
        setLoading(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === asstMsgId ? { ...m, isStreaming: false } : m))
        );
      };

      try {
        const res = await fetch(`${serverUrl}/v1/conversations/${activeConversationId}/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deviceToken}`
          },
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            kind: 'chat',
            input: { text: userText }
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `服务器响应异常 HTTP ${res.status}`);
        }

        const { runId } = await res.json();
        const abort = new AbortController();
        abortRef.current = abort;
        safetyTimeoutRef.current = setTimeout(cleanup, 180000);

        let accumulatedText = '';
        let fetchedTickets: TrainTicket[] = [];
        let lastSeq = 0;
        const seenSeq = new Set<number>();

        const updateRunStatus = (fullText?: string, tickets?: TrainTicket[], isFinal?: boolean) => {
          if (fullText !== undefined) accumulatedText = fullText;
          if (tickets && tickets.length) fetchedTickets = tickets;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId
                ? {
                    ...m,
                    content: accumulatedText,
                    tickets: fetchedTickets.length ? fetchedTickets : m.tickets,
                    isStreaming: !isFinal
                  }
                : m
            )
          );
        };

        const handleEvent = (event: RunStreamEvent) => {
          const seq = Number(event?.seq);
          if (Number.isFinite(seq)) {
            if (seenSeq.has(seq)) return;
            seenSeq.add(seq);
            if (seq > lastSeq) lastSeq = seq;
          }

          const payload = event?.payload || {};
          if (event.type === 'message.delta' && payload.fullText) {
            updateRunStatus(payload.fullText);
          } else if (event.type === 'message.completed' && payload.fullText) {
            updateRunStatus(payload.fullText);
          } else if (event.type === 'result.ready') {
            if (payload.result?.tickets) {
              updateRunStatus(undefined, payload.result.tickets);
            } else if (payload.resultId) {
              fetch(`${serverUrl}/v1/results/${payload.resultId}`, {
                headers: { Authorization: `Bearer ${deviceToken}` }
              })
                .then((ticketRes) => (ticketRes.ok ? ticketRes.json() : null))
                .then((ticketData) => {
                  if (ticketData?.tickets) updateRunStatus(undefined, ticketData.tickets);
                })
                .catch(() => {});
            }
          } else if (event.type === 'run.completed') {
            updateRunStatus(undefined, undefined, true);
            cleanup();
          } else if (event.type === 'run.failed') {
            const msg = payload.message || '服务开小差了，请稍后再试';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstMsgId
                  ? { ...m, isStreaming: false, error: { code: 'RUN_FAILED', message: msg } }
                  : m
              )
            );
            cleanup();
          }
        };

        pollTimerRef.current = setInterval(async () => {
          if (cleaned || abort.signal.aborted) return;
          try {
            const pollRes = await fetch(
              `${serverUrl}/v1/runs/${runId}/events?format=json&after=${lastSeq}`,
              {
                headers: {
                  Authorization: `Bearer ${deviceToken}`,
                  Accept: 'application/json'
                },
                cache: 'no-store',
                signal: abort.signal
              }
            );
            if (!pollRes.ok) return;
            const data = await pollRes.json();
            if (Array.isArray(data.items)) {
              for (const item of data.items) handleEvent(item);
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
          }
        }, 280);

        try {
          const sseRes = await fetch(`${serverUrl}/v1/runs/${runId}/events?after=0`, {
            headers: {
              Authorization: `Bearer ${deviceToken}`,
              Accept: 'text/event-stream'
            },
            cache: 'no-store',
            signal: abort.signal
          });
          if (sseRes.ok && sseRes.body) {
            await readSseStream(sseRes.body, handleEvent, abort.signal);
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            console.error('SSE 流读取失败，已回退 JSON 轮询:', err);
          }
        }
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  error: {
                    code: 'CONNECTION_FAILED',
                    message: err?.message || '连接服务器失败'
                  }
                }
              : m
          )
        );
        cleanup();
      }
    },
    [serverUrl, deviceToken, activeConversationId, conversations, loading, stopStream]
  );

  const quickPrompts = [
    '查一下明天北京到洛阳的高铁',
    '今天从杭州东到南京南有票吗',
    '量子力学到底是什么原理？',
    '推荐几部高分科幻电影'
  ];

  const currentTitle = conversations.find((c) => c.id === activeConversationId)?.title || '新的对话';

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* 顶栏：Gemini 简洁毛玻璃风格 */}
      <div className="safe-top bg-white/80 backdrop-blur-xl border-b border-slate-100 px-3 py-2.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-2xl active:scale-95 transition-all"
            title="会话列表"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-800 truncate tracking-tight">{currentTitle}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 text-indigo-700 border border-indigo-100">
                <Sparkles className="w-3 h-3 text-indigo-500 fill-indigo-200" />
                Gemini 3.8
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateNewConversation}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-2xl active:scale-95 transition-all"
            title="开启新对话"
          >
            <Plus className="w-5 h-5" />
          </button>

          <button
            onClick={() => setFilterSheetOpen(true)}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-2xl active:scale-95 transition-all"
            title="车次筛选"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 对话主体区 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <GeminiChatThread
          messages={messages}
          loading={loading}
          onSend={handleSend}
          onCancel={handleCancel}
          onViewRoute={handleViewRoute}
          quickPrompts={quickPrompts}
        />
      </div>

      {/* 侧边历史会话抽屉 */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={(id) => {
          setActiveConversationId(id);
          setDrawerOpen(false);
        }}
        onNew={handleCreateNewConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* 经停站与筛选弹窗 */}
      <RouteModal
        isOpen={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        trainCode={selectedTicket?.trainCode || ''}
        stations={routeStations}
      />
      <FilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        query={currentQuery}
        onApply={(updated) => {
          setCurrentQuery((prev) => ({ ...prev, ...updated }));
        }}
      />
    </div>
  );
};
