import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { TicketCard } from '../components/TicketCard';
import { ErrorCard } from '../components/ErrorCard';
import { RouteModal, RouteStation } from '../components/RouteModal';
import { FilterSheet } from '../components/FilterSheet';
import { Send, Train, SlidersHorizontal } from 'lucide-react';
import { TrainTicket, TicketQuery } from '@assistant/contracts';

interface ChatMessage {
  id: string;
  role: string;
  text: string;
  tickets?: TrainTicket[];
  error?: {
    code: string;
    message: string;
  };
}

export const ChatPage: React.FC = () => {
  const { serverUrl, deviceToken } = useAppStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TrainTicket | null>(null);
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<Partial<TicketQuery>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleViewRoute = (ticket: TrainTicket) => {
    setSelectedTicket(ticket);
    // 构造或展示经停站路线信息
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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMsgId = `msg_${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    try {
      // 1. 发起 Run
      const res = await fetch(`${serverUrl}/v1/conversations/default/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deviceToken}`
        },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          kind: 'chat',
          input: { text: userText }
        })
      });

      const { runId } = await res.json();

      // 2. 监听可恢复的 SSE 事件流
      const eventSource = new EventSource(`${serverUrl}/v1/runs/${runId}/events?after=0`);
      let assistantText = '';
      let ticketsList: TrainTicket[] = [];

      eventSource.addEventListener('message.completed', (e: any) => {
        const data = JSON.parse(e.data);
        assistantText = data.payload.fullText;
        updateAssistantMessage(assistantText, ticketsList);
      });

      eventSource.addEventListener('result.ready', async (e: any) => {
        const data = JSON.parse(e.data);
        const resId = data.payload.resultId;
        // 获取结构化车票
        const ticketRes = await fetch(`${serverUrl}/v1/results/${resId}`, {
          headers: { 'Authorization': `Bearer ${deviceToken}` }
        });
        const ticketData = await ticketRes.json();
        if (ticketData?.tickets) {
          ticketsList = ticketData.tickets;
          updateAssistantMessage(assistantText, ticketsList);
        }
      });

      eventSource.addEventListener('run.failed', (e: any) => {
        let code = 'UPSTREAM_BLOCKED';
        let msg = '12306 上游服务受限或网络开小差，请稍后再试';
        try {
          const payload = JSON.parse(e.data)?.payload;
          if (payload?.code) code = payload.code;
          if (payload?.message) msg = payload.message;
        } catch {}

        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            text: '',
            error: {
              code,
              message: `上游 12306 接口响应异常：${msg}。系统已为您保留当前操作，无需重复尝试突破风控。`
            }
          }
        ]);
        eventSource.close();
        setLoading(false);
      });

      eventSource.addEventListener('run.completed', () => {
        eventSource.close();
        setLoading(false);
      });
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: '',
          error: {
            code: 'CONNECTION_FAILED',
            message: `与服务器通信遇到问题：${err?.message || '无法连接'}`
          }
        }
      ]);
      setLoading(false);
    }
  };

  const updateAssistantMessage = (text: string, tickets: TrainTicket[]) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === 'assistant') {
        last.text = text;
        last.tickets = tickets;
        return [...copy];
      } else {
        return [...copy, { id: `asst_${Date.now()}`, role: 'assistant', text, tickets }];
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7]">
      {/* 头部标题栏 */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Train className="text-blue-600 w-5 h-5" />
          <span className="font-bold text-base text-slate-800">火车票智能助理</span>
        </div>
        <button
          onClick={() => setFilterSheetOpen(true)}
          className="p-1.5 text-slate-500 hover:text-blue-600 active:scale-95 transition-all"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* 消息滚动区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <span className="text-sm">试着对我说：</span>
            <span className="bg-white rounded-full px-4 py-1.5 text-xs shadow-sm text-blue-600">
              “查询9月30日北京到洛阳的高铁”
            </span>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {m.text && (
              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white text-slate-800 shadow-sm border border-slate-100 rounded-bl-none'
                }`}
              >
                {m.text}
              </div>
            )}

            {/* 异常卡片展示 (上游风控或接口异常) */}
            {m.error && (
              <div className="w-full mt-1">
                <ErrorCard
                  title="12306 状态提醒"
                  code={m.error.code}
                  message={m.error.message}
                />
              </div>
            )}

            {/* 结构化车次卡片列表 */}
            {m.tickets && m.tickets.length > 0 && (
              <div className="w-full mt-2 space-y-2">
                {m.tickets.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    onViewRoute={handleViewRoute}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* 经停站时刻表弹层 */}
      <RouteModal
        isOpen={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        trainCode={selectedTicket?.trainCode || ''}
        stations={routeStations}
      />

      {/* 筛选过滤弹层 */}
      <FilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        query={currentQuery}
        onApply={(updated) => {
          setCurrentQuery((prev) => ({ ...prev, ...updated }));
        }}
      />

      {/* 底部输入框 */}
      <div className="bg-white border-t border-slate-100 p-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="输入您的出行需求..."
          className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white rounded-full p-2.5 disabled:opacity-40 transition-transform active:scale-95"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

