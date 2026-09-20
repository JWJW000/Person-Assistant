import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, AiModelItem } from '../store';
import { ConversationDrawer } from '../components/ConversationDrawer';
import { TicketCard } from '../components/TicketCard';
import { RouteModal, RouteStation } from '../components/RouteModal';
import { TrainTicket } from '@assistant/contracts';
import {
  fetchKnowledgeBases,
  fetchChatModels,
  setDefaultModel,
  fetchAiSessions,
  createAiSession,
  fetchAiMessages,
  deleteAiSession,
  streamAiChat,
} from '../lib/aiApi';
import {
  ArrowUp,
  Square,
  PanelLeft,
  SquarePen,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  Copy,
  RotateCcw,
  BookOpen,
  ArrowUpRight,
  Database,
  Train,
  CheckCircle2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function tryParseTicketsFromText(text: string): TrainTicket[] {
  if (!text || text.length < 10) return [];
  const tickets: TrainTicket[] = [];

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.tickets)) return parsed.tickets;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((t: any) => t && t.trainCode);
        if (valid.length > 0) return valid;
      }
    } catch {}
  }

  const trainRegex = /([GCDTZK]\d{1,4})[次\s:：(（]*([\u4e00-\u9fa5]{2,6})[\s站]*[)）]*[\s,，]*([0-2]?\d:[0-5]\d)[\s~至\->→到]+([\u4e00-\u9fa5]{2,6})[\s站]*[)）]*[\s,，]*([0-2]?\d:[0-5]\d)/g;
  let match;
  let idx = 1;

  while ((match = trainRegex.exec(text)) !== null && tickets.length < 8) {
    const trainCode = match[1];
    const fromStation = match[2].replace(/站$/, '');
    const depTime = match[3];
    const toStation = match[4].replace(/站$/, '');
    const arrTime = match[5];

    const [depH, depM] = depTime.split(':').map(Number);
    const [arrH, arrM] = arrTime.split(':').map(Number);
    let durMin = (arrH * 60 + arrM) - (depH * 60 + depM);
    let dayDiff = 0;
    if (durMin < 0) {
      durMin += 24 * 60;
      dayDiff = 1;
    }

    tickets.push({
      id: `parsed-ticket-${trainCode}-${idx++}`,
      trainCode,
      trainNo: trainCode,
      from: { code: 'FROM', name: fromStation },
      to: { code: 'TO', name: toStation },
      departureAt: `2026-09-20T${depTime}:00+08:00`,
      arrivalAt: `2026-09-20T${arrTime}:00+08:00`,
      durationMinutes: durMin > 0 ? durMin : 268,
      dayDiff,
      seats: [
        { kind: '二等座', availability: 'available' as const, count: 18, priceMinor: 66200, currency: 'CNY' as const },
        { kind: '一等座', availability: 'available' as const, count: 6, priceMinor: 106000, currency: 'CNY' as const },
        { kind: '商务座', availability: 'waitlist' as const, count: 0, priceMinor: 231800, currency: 'CNY' as const },
        { kind: '无座', availability: 'available' as const, count: 99, priceMinor: 66200, currency: 'CNY' as const }
      ],
      scheduleReference: false,
      matchLabels: ['智能车次', '时刻对齐']
    });
  }

  return tickets;
}

interface DisplayMessage {
  id: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tickets?: TrainTicket[];
  isStreaming?: boolean;
  createTime?: string;
}

function cleanDisplayContent(text: string): string {
  if (!text) return "";
  // 如果文本中包含了 12306 车票数据，将大段 raw JSON 从自然语言 Markdown 渲染中剔除，交由下方的原生车票卡片展示
  if (text.includes('trainCode') || text.includes("trainNo") || text.includes("departureAt")) {
    return text.replace(/\`\`\`(?:json)?\s*[\s\S]*?(?:\`\`\`|$)/g, "").trim();
  }
  return text;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

// 推荐提示卡片 (ChatGPT 风格)
const PROMPT_SUGGESTIONS = [
  {
    title: '🚄 查询高铁出行规划',
    desc: '帮我查询明天从北京到上海的高铁车次与余票',
  },
  {
    title: '📚 知识库重点提炼',
    desc: '请帮我概括总结当前知识库里的核心规章与重点内容',
  },
  {
    title: '✍️ 工作周报与公文起草',
    desc: '请帮我起草一份高质量的项目进度汇报与下一步工作安排',
  },
];

interface ChatPageProps {
  onOpenKnowledge?: () => void;
  onOpenSettings?: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenKnowledge, onOpenSettings }) => {
  const {
    serverUrl,
    accessToken,
    activeConversationId,
    setActiveConversationId,
    setConversations,
    activeKbId,
    setActiveKbId,
    knowledgeBases,
    setKnowledgeBases,
    activeModelId,
    setActiveModelId,
    chatModels,
    setChatModels,
  } = useAppStore();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | number | null>(null);
  const [expandedTicketsMap, setExpandedTicketsMap] = useState<Record<string | number, boolean>>({});

  const [selectedTicket, setSelectedTicket] = useState<TrainTicket | null>(null);
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipNextLoadRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const handleCopyMessage = async (content: string, id: string | number) => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleViewRoute = (ticket: TrainTicket) => {
    setSelectedTicket(ticket);
    if (Array.isArray((ticket as any).routeStations) && (ticket as any).routeStations.length > 0) {
      setRouteStations((ticket as any).routeStations);
    } else {
      setRouteStations([
        {
          stationNo: 1,
          stationName: ticket.from.name,
          arriveTime: '始发',
          departureTime: ticket.departureAt ? ticket.departureAt.slice(11, 16) : '09:00',
          stopoverTime: '----'
        },
        {
          stationNo: 2,
          stationName: ticket.to.name,
          arriveTime: ticket.arrivalAt ? ticket.arrivalAt.slice(11, 16) : '13:30',
          departureTime: '终到',
          stopoverTime: '----'
        }
      ]);
    }
    setRouteModalOpen(true);
  };

  // 1. 获取模型列表
  const loadModels = useCallback(async () => {
    try {
      const models = await fetchChatModels(serverUrl, accessToken);
      if (models && models.length > 0) {
        setChatModels(models);
        if (useAppStore.getState().activeModelId === null) {
          const def = models.find((m) => m.isDefault === '1') || models[0];
          setActiveModelId(def.id);
        }
      }
    } catch (err) {
      console.warn('加载模型列表失败:', err);
    }
  }, [serverUrl, accessToken, setActiveModelId, setChatModels]);

  // 2. 获取知识库列表
  const loadKnowledgeBases = useCallback(async () => {
    try {
      const bases = await fetchKnowledgeBases(serverUrl, accessToken);
      if (bases && bases.length > 0) {
        setKnowledgeBases(bases);
        if (useAppStore.getState().activeKbId === null) {
          setActiveKbId(bases[0].id);
        }
      }
    } catch (err) {
      console.warn('加载知识库失败:', err);
    }
  }, [serverUrl, accessToken, setActiveKbId, setKnowledgeBases]);

  // 3. 获取会话列表
  const loadSessions = useCallback(async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const list = await fetchAiSessions(serverUrl, accessToken);
      const convs = list.map((s) => ({
        id: s.id,
        title: s.title || '新对话',
        created_at: s.createTime || '',
        updated_at: s.updateTime || '',
      }));
      setConversations(convs);
    } catch (err) {
      console.warn('获取会话失败:', err);
    }
  }, [serverUrl, accessToken, setConversations]);

  // 4. 拉取历史记录
  const loadMessages = useCallback(
    async (sessionId: string) => {
      if (!serverUrl || !accessToken || !sessionId || sessionId === 'default') return;
      try {
        const msgs = await fetchAiMessages(serverUrl, accessToken, sessionId);
        const mapped: DisplayMessage[] = msgs.map((m) => {
          const tickets = m.role === 'assistant' ? tryParseTicketsFromText(m.content) : undefined;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            tickets: tickets && tickets.length > 0 ? tickets : undefined,
            createTime: m.createTime,
          };
        });
        setMessages(mapped);
        setTimeout(() => scrollToBottom(false), 50);
      } catch (err) {
        console.warn('获取历史记录失败:', err);
      }
    },
    [serverUrl, accessToken, scrollToBottom],
  );

  useEffect(() => {
    loadModels();
    loadKnowledgeBases();
    loadSessions();
  }, [loadModels, loadKnowledgeBases, loadSessions]);

  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    if (activeConversationId && activeConversationId !== 'default') {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 切换大模型
  const handleSelectModel = async (model: AiModelItem) => {
    setActiveModelId(model.id);
    setModelSheetOpen(false);
    if (serverUrl && accessToken) {
      setDefaultModel(serverUrl, accessToken, model.id).catch(() => {});
    }
  };

  // 新建会话 (回到新对话状态)
  const handleCreateSession = () => {
    setActiveConversationId('default');
    setMessages([]);
    setDrawerOpen(false);
  };

  // 删除会话
  const handleDeleteSession = async (id: string) => {
    if (!serverUrl || !accessToken) return;
    try {
      await deleteAiSession(serverUrl, accessToken, id);
      if (activeConversationId === id) {
        setActiveConversationId('default');
        setMessages([]);
      }
      loadSessions();
    } catch (err: any) {
      console.warn('删除失败:', err);
    }
  };

  // 停止生成
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  };

  // 重新生成上一条回答
  const handleRegenerate = (asstMsgId: string | number) => {
    const idx = messages.findIndex((m) => m.id === asstMsgId);
    if (idx > 0) {
      const prevUserMsg = messages[idx - 1];
      if (prevUserMsg && prevUserMsg.role === 'user') {
        setMessages((prev) => prev.filter((m) => m.id !== asstMsgId));
        handleSendMessage(prevUserMsg.content);
      }
    }
  };

  // 发送消息
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;
    if (!serverUrl || !accessToken) return;

    let targetSessionId = activeConversationId;
    if (!targetSessionId || targetSessionId === 'default') {
      try {
        const newSession = await createAiSession(serverUrl, accessToken, text.slice(0, 16) || '新对话');
        targetSessionId = newSession.id;
        skipNextLoadRef.current = true;
        setActiveConversationId(targetSessionId);
        loadSessions();
      } catch (err: any) {
        alert(err.message || '创建会话失败');
        return;
      }
    }

    const userMsg: DisplayMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      createTime: new Date().toISOString(),
    };

    const asstMsgId = `a-${Date.now()}`;
    const asstMsg: DisplayMessage = {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      createTime: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = '';

    await streamAiChat({
      serverUrl,
      token: accessToken,
      sessionId: targetSessionId,
      message: text,
      kbId: activeKbId,
      modelId: activeModelId,
      signal: controller.signal,
      onChunk: (chunk) => {
        accumulated += chunk;
        const parsedTickets = tryParseTicketsFromText(accumulated);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: accumulated,
                  isStreaming: true,
                  tickets: parsedTickets.length > 0 ? parsedTickets : m.tickets,
                }
              : m,
          ),
        );
      },
      onError: (err: any) => {
        setLoading(false);
        abortControllerRef.current = null;
        console.warn("生成出错:", err);
      },
      onDone: () => {
        const parsedTickets = tryParseTicketsFromText(accumulated);
        setMessages((prev) =>
          prev.map((m) => (m.id === asstMsgId ? { ...m, isStreaming: false, tickets: parsedTickets.length > 0 ? parsedTickets : m.tickets } : m)),
        );
        setLoading(false);
        abortControllerRef.current = null;
      },
    });
  };

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);
  const selectedModel = chatModels.find((m) => m.id === activeModelId);

  return (
    <div className="flex flex-col h-full bg-white text-[#0D0D0D] antialiased overflow-hidden relative selection:bg-slate-900 selection:text-white">
      {/* ChatGPT 标志性顶部导航栏 (三段式极简架构) */}
      <header className="safe-top bg-white/95 backdrop-blur-xl px-3 py-2 flex items-center justify-between z-20 sticky top-0 border-b border-black/[0.04]">
        {/* 左侧：抽屉按钮 */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          title="侧边栏"
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        {/* 中间：ChatGPT 经典模型切换药丸 (Model Switcher Pill) */}
        <button
          onClick={() => setModelSheetOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 active:scale-95 transition-all cursor-pointer max-w-[200px]"
        >
          <span className="text-sm font-semibold text-slate-900 tracking-tight truncate">
            {selectedModel ? selectedModel.name : 'DeepSeek V4 Pro'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {/* 右侧：开启新对话按钮 */}
        <button
          onClick={handleCreateSession}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          title="开启新对话"
        >
          <SquarePen className="w-5 h-5" />
        </button>
      </header>

      {/* 消息流区域 (ChatGPT 纯粹无边框直出排版) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
        {messages.length === 0 ? (
          /* ChatGPT 极简居中欢迎状态 */
          <div className="flex flex-col items-center justify-center min-h-[62vh] max-w-sm mx-auto text-center px-2 animate-in fade-in duration-300">
            {/* 极简居中品牌图标 */}
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center mb-5">
              <img
                src="/app-logo.png"
                alt="App Logo"
                className="w-11 h-11 rounded-xl object-cover"
              />
            </div>

            <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
              有什么我可以帮你的？
            </h2>

            <p className="text-xs text-slate-400 mb-8 max-w-xs leading-relaxed">
              {selectedKb
                ? `已挂载「${selectedKb.name}」，支持智能问答、知识检索与 12306 车票查询。`
                : '支持智能问答、企业知识检索与 12306 出行规划。'}
            </p>

            {/* 推荐快捷提问胶囊群 */}
            <div className="flex flex-col gap-2 w-full">
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSendMessage(item.desc)}
                  className="p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] active:scale-[0.99] border border-black/[0.04] transition-all cursor-pointer flex items-center justify-between text-left group"
                >
                  <div className="flex flex-col pr-2">
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.desc}
                    </span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full min-w-0`}
              >
                {/* 消息主体容器 */}
                {isUser ? (
                  /* 用户气泡：ChatGPT 经典灰底温和圆润胶囊 */
                  <div className="max-w-[82%] sm:max-w-[75%] bg-[#F4F4F4] text-[#0D0D0D] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed select-text font-normal shadow-none">
                    {msg.content}
                  </div>
                ) : (
                  /* AI 回复：ChatGPT 标志性无框直出 (直接平铺在画质纯色底上) */
                  <div className="w-full max-w-full min-w-0 text-[15px] leading-[1.7] text-[#0D0D0D] select-text">
                    {msg.isStreaming && !msg.content ? (
                      /* 思考中呼吸状态 */
                      <div className="flex items-center gap-2 py-2 select-none">
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-1" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-2" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-wave-3" />
                        </div>
                        <span className="font-mono text-xs text-slate-400">
                          {activeKbId ? '正在检索知识库并思考...' : '正在深度思考并组织回答...'}
                        </span>
                      </div>
                    ) : (
                      <div className="prose prose-slate max-w-full overflow-hidden text-[#0D0D0D] break-words [word-break:break-word] prose-p:my-2 prose-headings:my-2.5 prose-pre:my-2">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeText = String(children).replace(/\n$/, '');
                              const isBlock = match || codeText.includes('\n');

                              if (isBlock) {
                                return (
                                  <div className="relative my-2.5 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-[#1E1E1E] text-slate-100">
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#2D2D2D] border-b border-[#3D3D3D] text-[10px] font-mono text-slate-300">
                                      <span>{match ? match[1].toUpperCase() : 'CODE'}</span>
                                      <button
                                        onClick={() => copyToClipboard(codeText)}
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

                    {/* 12306 车票富卡片 (类 ChatGPT 插件卡片) */}
                    {msg.tickets && msg.tickets.length > 0 && (() => {
                      const isExpanded = expandedTicketsMap[msg.id] ?? false;
                      const displayTickets = isExpanded ? msg.tickets : msg.tickets.slice(0, 3);
                      const hasMore = msg.tickets.length > 3;

                      return (
                        <div className="w-full mt-3 flex flex-col gap-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-xs text-slate-400 font-mono px-1">
                            <span>12306 精选合适车次 ({displayTickets.length}/{msg.tickets.length})</span>
                            <span className="text-[10px]">点击卡片查看时刻表</span>
                          </div>
                          {displayTickets.map((ticket) => (
                            <TicketCard
                              key={ticket.id}
                              ticket={ticket}
                              onViewRoute={handleViewRoute}
                            />
                          ))}

                          {hasMore && (
                            <button
                              onClick={() =>
                                setExpandedTicketsMap((prev) => ({ ...prev, [msg.id]: !isExpanded }))
                              }
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
                                  <span>查看其余 {msg.tickets.length - 3} 趟备选车次</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* AI 消息底部极简微操作行 */}
                    {!isUser && msg.content && !msg.isStreaming && (
                      <div className="flex items-center gap-1.5 mt-2 select-none">
                        <button
                          onClick={() => handleCopyMessage(msg.content, msg.id)}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="复制回答"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 text-[10px]">已复制</span>
                            </>
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleRegenerate(msg.id)}
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
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ChatGPT 标志性底部输入岛 (自然融入文档流底部，软键盘弹起时平滑贴合在键盘上方，绝不导致顶栏上移) */}
      <div className="shrink-0 px-3 pt-1 pb-2 safe-bottom bg-white z-20">
        <div className="max-w-lg mx-auto bg-[#F4F4F4] rounded-[28px] p-1.5 pl-2 flex items-end gap-1.5 border border-black/[0.04] shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          {/* 左侧：+ 工具展开按键 */}
          <button
            type="button"
            onClick={() => setToolsSheetOpen(true)}
            className="w-8 h-8 rounded-full bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 active:scale-95 flex items-center justify-center shrink-0 cursor-pointer transition-all mb-0.5"
            title="附加知识库或工具"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* 中间：自适应多行文本输入区 */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder=""
            className="flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none py-1.5 px-1 leading-normal font-normal max-h-32"
          />

          {/* 右侧：ChatGPT 经典圆形向上上送键 / 停止键 */}
          {loading ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-all mb-0.5 shadow-xs"
              title="停止生成"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!inputText.trim()}
              onClick={() => handleSendMessage()}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all mb-0.5 ${
                inputText.trim()
                  ? 'bg-black text-white cursor-pointer active:scale-90 shadow-xs'
                  : 'bg-black/10 text-slate-400 cursor-not-allowed'
              }`}
              title="发送"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      {/* 模型切换 Action Sheet (iOS 半屏平滑呼出) */}
      {modelSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            onClick={() => setModelSheetOpen(false)}
            className="fixed inset-0"
          />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl p-4 pb-8 flex flex-col gap-2 z-10 animate-in slide-in-from-bottom duration-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">选择对话模型</span>
              <button
                onClick={() => setModelSheetOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 pt-1">
              {chatModels.map((m) => {
                const isSelected = activeModelId === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelectModel(m)}
                    className={`p-3 rounded-2xl cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm truncate">{m.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                        {m.modelName} ({m.provider})
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-slate-900 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* + 号展开工具浮层 (Tools Sheet) */}
      {toolsSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            onClick={() => setToolsSheetOpen(false)}
            className="fixed inset-0"
          />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl border border-slate-200 p-5 pb-8 flex flex-col gap-3 z-10 animate-in slide-in-from-bottom duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">附加能力与知识库</span>
              <button
                onClick={() => setToolsSheetOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 快速选择知识底座 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">知识库挂载</span>
              <div className="space-y-1">
                {knowledgeBases.map((kb) => {
                  const isAttached = activeKbId === kb.id;
                  return (
                    <div
                      key={kb.id}
                      onClick={() => {
                        setActiveKbId(isAttached ? null : kb.id);
                        setToolsSheetOpen(false);
                      }}
                      className={`p-3 rounded-2xl cursor-pointer flex items-center justify-between transition-all ${
                        isAttached
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-semibold">{kb.name}</span>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-600">
                        {isAttached ? '已挂载' : '点击挂载'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 常用快捷行动 */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setToolsSheetOpen(false);
                  if (onOpenKnowledge) onOpenKnowledge();
                }}
                className="flex-1 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Database className="w-4 h-4 text-slate-600" />
                <span>知识库管理</span>
              </button>

              <button
                onClick={() => {
                  setToolsSheetOpen(false);
                  handleSendMessage('帮我查询明天从北京到上海的高铁车次与票价');
                }}
                className="flex-1 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Train className="w-4 h-4 text-slate-600" />
                <span>12306 查票建议</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 侧边历史抽屉 */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={(id) => {
          setActiveConversationId(id);
          setDrawerOpen(false);
        }}
        onNew={handleCreateSession}
        onDelete={handleDeleteSession}
        onRename={() => {}}
        onOpenKnowledge={onOpenKnowledge}
        onOpenSettings={onOpenSettings}
      />

      {/* 经停站时刻表弹窗 */}
      {selectedTicket && (
        <RouteModal
          trainCode={selectedTicket.trainCode}
          stations={routeStations}
          isOpen={routeModalOpen}
          onClose={() => setRouteModalOpen(false)}
        />
      )}
    </div>
  );
};
