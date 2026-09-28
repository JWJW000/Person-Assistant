import { copyToClipboard } from '../lib/clipboard';
import { triggerHaptic } from '../lib/ripple';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, type AiModelItem } from '../store';
import { ConversationDrawer } from '../components/ConversationDrawer';
import { RouteModal, type RouteStation } from '../components/RouteModal';
import type { TrainTicket } from '@assistant/contracts';
import {
  fetchKnowledgeBases,
  fetchChatModels,
  setDefaultModel,
  fetchAiSessions,
  deleteAiSession,
} from '../lib/aiApi';
import {
  ArrowUp,
  Square,
  PanelLeft,
  SquarePen,
  ChevronDown,
  Plus,
  BookOpen,
  ArrowUpRight,
  Database,
  Train,
  CheckCircle2,
  X,
} from 'lucide-react';
import { MessageItem } from '../components/chat/MessageItem';
import { useAiChat } from '../hooks/useAiChat';

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
  onOpenMemory?: () => void;
  onOpenPi?: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenKnowledge, onOpenSettings, onOpenMemory, onOpenPi }) => {
  // 严格使用 Zustand Selector 读取切片状态，杜绝全局事件触发主界面无谓重绘
  const serverUrl = useAppStore((s) => s.serverUrl);
  const accessToken = useAppStore((s) => s.accessToken);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversationId = useAppStore((s) => s.setActiveConversationId);
  const setConversations = useAppStore((s) => s.setConversations);
  const activeKbId = useAppStore((s) => s.activeKbId);
  const setActiveKbId = useAppStore((s) => s.setActiveKbId);
  const knowledgeBases = useAppStore((s) => s.knowledgeBases);
  const setKnowledgeBases = useAppStore((s) => s.setKnowledgeBases);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const setActiveModelId = useAppStore((s) => s.setActiveModelId);
  const chatModels = useAppStore((s) => s.chatModels);
  const setChatModels = useAppStore((s) => s.setChatModels);
  const logout = useAppStore((s) => s.logout);

  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | number | null>(null);
  const [expandedTicketsMap, setExpandedTicketsMap] = useState<Record<string | number, boolean>>({});

  const [selectedTicket, setSelectedTicket] = useState<TrainTicket | null>(null);
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputTextRef = useRef('');

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  const handleCopyMessage = useCallback(async (content: string, id: string | number) => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleViewRoute = useCallback((ticket: TrainTicket) => {
    setSelectedTicket(ticket);
    const candidateStations = (ticket as unknown as { routeStations?: RouteStation[] }).routeStations;
    if (Array.isArray(candidateStations) && candidateStations.length > 0) {
      setRouteStations(candidateStations);
    } else {
      setRouteStations([
        {
          stationNo: 1,
          stationName: ticket.from.name,
          arriveTime: '始发',
          departureTime: ticket.departureAt ? ticket.departureAt.slice(11, 16) : '09:00',
          stopoverTime: '----',
        },
        {
          stationNo: 2,
          stationName: ticket.to.name,
          arriveTime: ticket.arrivalAt ? ticket.arrivalAt.slice(11, 16) : '13:30',
          departureTime: '终到',
          stopoverTime: '----',
        },
      ]);
    }
    setRouteModalOpen(true);
  }, []);

  const handleToggleExpanded = useCallback((id: string | number) => {
    setExpandedTicketsMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 1. 获取会话列表
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

  // 2. 挂载 useAiChat 核心状态与流式响应逻辑
  const {
    messages,
    setMessages,
    loading,
    loadMessages,
    handleSendMessage: sendChatMessage,
    handleStopGeneration,
    handleRegenerate,
  } = useAiChat({
    serverUrl,
    accessToken,
    activeConversationId,
    activeKbId,
    activeModelId,
    setActiveConversationId,
    loadSessions,
    logout,
    onScrollToBottom: scrollToBottom,
  });

  // 3. 获取模型列表
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

  // 4. 获取知识库列表
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

  useEffect(() => {
    loadModels();
    loadKnowledgeBases();
    loadSessions();
  }, [loadModels, loadKnowledgeBases, loadSessions]);

  useEffect(() => {
    if (activeConversationId && activeConversationId !== 'default') {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages, setMessages]);

  // 切换大模型
  const handleSelectModel = async (model: AiModelItem) => {
    setActiveModelId(model.id);
    setModelSheetOpen(false);
    if (serverUrl && accessToken) {
      setDefaultModel(serverUrl, accessToken, model.id).catch(() => {});
    }
  };

  // 新建会话
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
      loadSessions().catch(() => {});
    } catch (err: unknown) {
      console.warn('删除失败:', err);
    }
  };

  // 发送消息
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend || inputTextRef.current).trim();
      if (!text) return;
      setInputText('');
      inputTextRef.current = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await sendChatMessage(text);
    },
    [sendChatMessage]
  );

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);
  const selectedModel = chatModels.find((m) => m.id === activeModelId);

  return (
    <div className="flex flex-col h-full bg-white text-[#0D0D0D] antialiased overflow-hidden relative selection:bg-slate-900 selection:text-white">
      {/* ChatGPT 标志性顶部导航栏 (三段式极简架构) */}
      <header className="safe-top bg-white px-3 py-2 flex items-center justify-between z-20 sticky top-0 border-b border-black/[0.04]">
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
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F4F4F4] hover:bg-[#EBEBEB] text-[#0D0D0D] active:scale-92 transition-all cursor-pointer max-w-[210px] shadow-2xs"
        >
          <span className="text-[13px] font-semibold tracking-tight truncate">
            {selectedModel ? selectedModel.name : 'DeepSeek V4 Pro'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
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
      <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
        {messages.length === 0 ? (
          /* ChatGPT 极简居中欢迎状态 */
          <div className="flex flex-col items-center justify-center min-h-[62vh] max-w-sm mx-auto text-center px-2">
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
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              activeKbId={activeKbId}
              isExpanded={Boolean(expandedTicketsMap[msg.id])}
              isCopied={copiedMsgId === msg.id}
              onCopyText={copyToClipboard}
              onCopyMessage={handleCopyMessage}
              onRegenerate={handleRegenerate}
              onToggleExpanded={handleToggleExpanded}
              onViewRoute={handleViewRoute}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入岛 */}
      <div className="shrink-0 px-3 pt-1.5 pb-2.5 bg-white z-20">
        <div className="chat-composer max-w-lg mx-auto bg-[#F4F4F4] rounded-[30px] p-1.5 pl-2 flex items-end gap-1.5 border border-black/[0.04]">
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
              inputTextRef.current = e.target.value;
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

          {/* 右侧：ChatGPT 经典圆形向上发送键 / 停止键 */}
          {loading ? (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                triggerHaptic(30);
              }}
              onClick={handleStopGeneration}
              className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0 cursor-pointer active:bg-zinc-800 transition-all mb-0.5 shadow-xs"
              title="停止生成"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!inputText.trim()}
              onPointerDown={(e) => {
                if (inputText.trim()) {
                  e.preventDefault();
                  triggerHaptic(25);
                }
              }}
              onClick={() => handleSendMessage()}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 mb-0.5 shadow-xs ${
                inputText.trim()
                  ? 'bg-black text-white cursor-pointer active:bg-zinc-800'
                  : 'bg-black/[0.08] text-black/25 cursor-not-allowed'
              }`}
              title="发送"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.8]" />
            </button>
          )}
        </div>
      </div>

      {/* 模型切换 Action Sheet */}
      {modelSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-in fade-in duration-200">
          <div
            onClick={() => setModelSheetOpen(false)}
            className="fixed inset-0"
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl border border-slate-200/80 shadow-2xl p-5 pb-8 flex flex-col gap-2 z-10 animate-in slide-in-from-bottom duration-200 max-h-[80vh] overflow-y-auto">
            <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto -mt-1 mb-2" />
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 animate-in fade-in duration-150">
          <div
            onClick={() => setToolsSheetOpen(false)}
            className="fixed inset-0"
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[32px] border border-slate-200/80 shadow-2xl p-5 pb-8 flex flex-col gap-3 z-10 animate-in slide-in-from-bottom duration-150">
            <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto -mt-1 mb-2" />
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
        onOpenMemory={onOpenMemory}
        onOpenSettings={onOpenSettings}
        onOpenPi={onOpenPi}
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
