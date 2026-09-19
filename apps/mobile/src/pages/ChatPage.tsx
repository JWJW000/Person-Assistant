import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, KnowledgeBaseItem } from '../store';
import { ConversationDrawer } from '../components/ConversationDrawer';
import {
  fetchKnowledgeBases,
  fetchAiSessions,
  createAiSession,
  fetchAiMessages,
  deleteAiSession,
  streamAiChat,
} from '../lib/aiApi';
import {
  Sparkles,
  Send,
  Plus,
  Menu,
  Check,
  ChevronDown,
  Bot,
  User as UserIcon,
  RefreshCw,
  Database,
  Layers,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DisplayMessage {
  id: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  createTime?: string;
}

export const ChatPage: React.FC = () => {
  const {
    serverUrl,
    accessToken,
    activeConversationId,
    setActiveConversationId,
    conversations,
    setConversations,
    activeKbId,
    setActiveKbId,
    knowledgeBases,
    setKnowledgeBases,
  } = useAppStore();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. 拉取知识库列表
  const loadKnowledgeBases = useCallback(async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const bases = await fetchKnowledgeBases(serverUrl, accessToken);
      setKnowledgeBases(bases);
      // 如果本地没有选中的知识库，但服务端有公开可用的知识库，默认选中第一个
      if (activeKbId === null && bases.length > 0) {
        setActiveKbId(bases[0].id);
      }
    } catch (err) {
      console.warn('加载知识库列表失败:', err);
    }
  }, [serverUrl, accessToken, activeKbId, setActiveKbId, setKnowledgeBases]);

  // 2. 拉取会话列表
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

      // 如果当前没有选中的会话ID，选第一个或创建
      if (convs.length > 0 && (!activeConversationId || activeConversationId === 'default')) {
        setActiveConversationId(convs[0].id);
      }
    } catch (err) {
      console.warn('获取会话列表失败:', err);
    }
  }, [serverUrl, accessToken, activeConversationId, setActiveConversationId, setConversations]);

  // 3. 切换会话并拉取历史记录
  const loadMessages = useCallback(
    async (sessionId: string) => {
      if (!serverUrl || !accessToken || !sessionId || sessionId === 'default') return;
      try {
        const msgs = await fetchAiMessages(serverUrl, accessToken, sessionId);
        const mapped: DisplayMessage[] = msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createTime: m.createTime,
        }));
        setMessages(mapped);
        setTimeout(() => scrollToBottom(false), 50);
      } catch (err) {
        console.warn('获取历史消息失败:', err);
      }
    },
    [serverUrl, accessToken, scrollToBottom],
  );

  useEffect(() => {
    loadKnowledgeBases();
    loadSessions();
  }, [loadKnowledgeBases, loadSessions]);

  useEffect(() => {
    if (activeConversationId && activeConversationId !== 'default') {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 新建会话
  const handleCreateSession = async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const newSession = await createAiSession(serverUrl, accessToken, '新对话');
      setActiveConversationId(newSession.id);
      setMessages([]);
      loadSessions();
    } catch (err: any) {
      alert(err.message || '新建会话失败');
    }
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
      console.warn('删除会话失败:', err);
    }
  };

  // 发送提问并流式响应
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;
    if (!serverUrl || !accessToken) return;

    let targetSessionId = activeConversationId;
    if (!targetSessionId || targetSessionId === 'default') {
      try {
        const newSession = await createAiSession(serverUrl, accessToken, text.slice(0, 15) || '新对话');
        targetSessionId = newSession.id;
        setActiveConversationId(targetSessionId);
        loadSessions();
      } catch (err: any) {
        alert(err.message || '创建会话失败');
        return;
      }
    }

    // 添加用户消息
    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createTime: new Date().toISOString(),
    };

    // 预置助手流式占位消息
    const asstMsgId = `asst-${Date.now()}`;
    const asstMsg: DisplayMessage = {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      createTime: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInputText('');
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedContent = '';

    await streamAiChat({
      serverUrl,
      token: accessToken,
      sessionId: targetSessionId,
      message: text,
      kbId: activeKbId,
      signal: controller.signal,
      onChunk: (chunk) => {
        accumulatedContent += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === asstMsgId ? { ...m, content: accumulatedContent, isStreaming: true } : m)),
        );
      },
      onDone: () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === asstMsgId ? { ...m, isStreaming: false } : m)),
        );
        setLoading(false);
        abortControllerRef.current = null;
        loadSessions();
      },
      onError: (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: accumulatedContent ? `${accumulatedContent}\n\n*(连接中断: ${err.message})*` : `*(请求异常: ${err.message})*`,
                  isStreaming: false,
                }
              : m,
          ),
        );
        setLoading(false);
        abortControllerRef.current = null;
      },
    });
  };

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] relative">
      {/* 顶部导航与知识库状态栏 */}
      <div className="safe-top bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-2.5 flex flex-col gap-2 z-10 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 active:scale-95 transition-all"
              title="历史会话"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                AI 知识助手
              </span>
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                {conversations.find((c) => c.id === activeConversationId)?.title || '新对话'}
              </span>
            </div>
          </div>

          <button
            onClick={handleCreateSession}
            className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-100 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新对话</span>
          </button>
        </div>

        {/* 📚 知识库快速选择胶囊条 */}
        <div className="relative flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">知识库:</span>
            <button
              onClick={() => setKbDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1 text-xs text-slate-800 font-medium truncate hover:text-blue-600 transition-colors"
            >
              <span className="truncate">{selectedKb ? selectedKb.name : '🌐 全能通用对话 (无知识库)'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
          </div>

          {selectedKb && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100/70 text-blue-700 font-mono shrink-0 ml-1">
              pgvector RAG
            </span>
          )}

          {/* 下拉选择弹出层 */}
          {kbDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 flex items-center justify-between">
                <span>选择检索知识底座</span>
                <span className="text-[9px]">PostgreSQL 16 pgvector</span>
              </div>

              {/* 选项：无知识库 */}
              <div
                onClick={() => {
                  setActiveKbId(null);
                  setKbDropdownOpen(false);
                }}
                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  activeKbId === null ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex flex-col">
                  <span>🌐 全能通用对话</span>
                  <span className="text-[10px] text-slate-400">不绑定知识库，由大模型自由回答</span>
                </div>
                {activeKbId === null && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
              </div>

              {/* 选项列表：知识库 */}
              {knowledgeBases.map((kb: KnowledgeBaseItem) => {
                const isSelected = activeKbId === kb.id;
                return (
                  <div
                    key={kb.id}
                    onClick={() => {
                      setActiveKbId(kb.id);
                      setKbDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate font-medium flex items-center gap-1">
                        📖 {kb.name}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {kb.description || `切片大小 ${kb.chunkSize || 500} 字`}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 消息滚动区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-3 text-slate-400">
            <div className="w-14 h-14 rounded-3xl bg-blue-100/60 flex items-center justify-center text-blue-600 shadow-sm">
              <Bot className="w-7 h-7" />
            </div>
            <div className="text-sm font-semibold text-slate-700">有什么我可以帮您的？</div>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              {selectedKb
                ? `当前已挂载「${selectedKb.name}」，输入问题将通过 pgvector 余弦检索匹配切片并生成解答。`
                : '当前为通用大模型对话模式。您也可以在上方切换具体的企业知识库以启用精准 RAG 检索。'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isRagAnswer = !isUser && msg.content.includes('【AI 知识库 RAG 检索命中】');

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* 头像 */}
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                    isUser ? 'bg-blue-600' : 'bg-indigo-600'
                  }`}
                >
                  {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* 气泡 */}
                <div className="flex flex-col max-w-[85%] space-y-1">
                  {/* RAG 标签提示 */}
                  {isRagAnswer && (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold px-1">
                      <Layers className="w-3 h-3" />
                      <span>pgvector 知识库增强回答</span>
                    </div>
                  )}

                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-xs ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-200/70 rounded-tl-none'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="prose prose-xs max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3 ml-1 bg-blue-600 animate-pulse align-middle" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入栏 */}
      <div className="bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-3 safe-bottom z-10">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={
              selectedKb ? `向「${selectedKb.name}」提问...` : '输入您的问题...'
            }
            className="flex-1 bg-slate-100/80 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/20 shrink-0 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* 历史会话抽屉 */}
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
      />
    </div>
  );
};
