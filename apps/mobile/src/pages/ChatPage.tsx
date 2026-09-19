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
  Send,
  Plus,
  Menu,
  Check,
  ChevronDown,
  RefreshCw,
  Database,
  ArrowUpRight,
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

const PROMPT_SUGGESTIONS = [
  {
    title: 'pgvector 向量检索原理',
    desc: '若依系统如何使用 pgvector 与 HNSW 进行高维余弦召回？',
  },
  {
    title: '阿里百炼向量模型',
    desc: '当前挂载的百炼 text-embedding-v2 具备哪些特性？',
  },
  {
    title: '智能出行查票',
    desc: '帮我查询明天从北京南站到上海虹桥的高铁车次',
  },
];

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

  // 1. 获取知识库列表
  const loadKnowledgeBases = useCallback(async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const bases = await fetchKnowledgeBases(serverUrl, accessToken);
      setKnowledgeBases(bases);
      if (activeKbId === null && bases.length > 0) {
        setActiveKbId(bases[0].id);
      }
    } catch (err) {
      console.warn('加载知识库失败:', err);
    }
  }, [serverUrl, accessToken, activeKbId, setActiveKbId, setKnowledgeBases]);

  // 2. 获取会话列表
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

      if (convs.length > 0 && (!activeConversationId || activeConversationId === 'default')) {
        setActiveConversationId(convs[0].id);
      }
    } catch (err) {
      console.warn('获取会话失败:', err);
    }
  }, [serverUrl, accessToken, activeConversationId, setActiveConversationId, setConversations]);

  // 3. 拉取历史记录
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
        console.warn('获取历史记录失败:', err);
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
      alert(err.message || '新建失败');
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
      console.warn('删除失败:', err);
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
      signal: controller.signal,
      onChunk: (chunk) => {
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === asstMsgId ? { ...m, content: accumulated, isStreaming: true } : m)),
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
                  content: accumulated ? `${accumulated}\n\n*(请求中断: ${err.message})*` : `*(请求异常: ${err.message})*`,
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
    <div className="flex flex-col h-full bg-white text-[#151515] antialiased">
      {/* 顶部简明导航栏 (Quiet Header) */}
      <header className="safe-top bg-white border-b border-[#EDEDED] px-4 py-2.5 flex flex-col gap-2 z-20 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 rounded-lg border border-[#EDEDED] hover:bg-[#F5F5F5] text-[#151515] transition-colors cursor-pointer"
              title="会话列表"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-[#151515]">
                AI 知识中台
              </span>
              <span className="text-xs text-[#757575] font-mono truncate max-w-[160px]">
                {conversations.find((c) => c.id === activeConversationId)?.title || '默认会话'}
              </span>
            </div>
          </div>

          <button
            onClick={handleCreateSession}
            className="flex items-center gap-1 h-8 px-3 rounded-lg border border-[#EDEDED] bg-white hover:bg-[#F5F5F5] text-[#151515] text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新对话</span>
          </button>
        </div>

        {/* 知识库选择器 (Clean Selector) */}
        <div className="relative">
          <div
            onClick={() => setKbDropdownOpen((prev) => !prev)}
            className="flex items-center justify-between px-3 py-1.5 bg-[#FAFAFA] hover:bg-[#F5F5F5] rounded-lg border border-[#EDEDED] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Database className="w-3.5 h-3.5 text-[#757575] shrink-0" />
              <span className="text-xs text-[#757575] shrink-0 font-medium">知识底座:</span>
              <span className="text-xs font-medium text-[#151515] truncate">
                {selectedKb ? selectedKb.name : '全能通用对话 (无挂载)'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              {selectedKb && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#EDEDED] text-[#151515]">
                  1536维
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-[#757575] transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* 下拉面板 */}
          {kbDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white rounded-xl border border-[#EDEDED] shadow-lg z-30 flex flex-col gap-0.5">
              <div className="px-2.5 py-1 text-[11px] text-[#A5A5A5] font-mono border-b border-[#EDEDED]">
                选择要挂载的知识库
              </div>

              {/* 无知识库 */}
              <div
                onClick={() => {
                  setActiveKbId(null);
                  setKbDropdownOpen(false);
                }}
                className={`px-2.5 py-2 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                  activeKbId === null
                    ? 'bg-[#151515] text-white font-medium'
                    : 'hover:bg-[#F5F5F5] text-[#151515]'
                }`}
              >
                <div className="flex flex-col">
                  <span>全能通用对话</span>
                  <span className={`text-[10px] ${activeKbId === null ? 'text-[#A5A5A5]' : 'text-[#757575]'}`}>
                    不限制知识范围，由模型直接回答
                  </span>
                </div>
                {activeKbId === null && <Check className="w-4 h-4 text-white" />}
              </div>

              {/* 知识库项 */}
              {knowledgeBases.map((kb: KnowledgeBaseItem) => {
                const isSelected = activeKbId === kb.id;
                return (
                  <div
                    key={kb.id}
                    onClick={() => {
                      setActiveKbId(kb.id);
                      setKbDropdownOpen(false);
                    }}
                    className={`px-2.5 py-2 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#151515] text-white font-medium'
                        : 'hover:bg-[#F5F5F5] text-[#151515]'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate font-medium">{kb.name}</span>
                      <span className={`text-[10px] truncate ${isSelected ? 'text-[#A5A5A5]' : 'text-[#757575]'}`}>
                        {kb.description || `切片大小 ${kb.chunkSize || 500} 字`}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* 消息滚动流 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          /* 空状态引导 */
          <div className="flex flex-col justify-center min-h-[55vh] gap-5 max-w-md mx-auto text-left py-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#151515] tracking-tight">
                {selectedKb ? `已关联知识库：${selectedKb.name}` : 'AI 智能问答'}
              </h2>
              <p className="text-xs text-[#757575] leading-normal">
                {selectedKb
                  ? '提问时系统将通过阿里百炼 text-embedding-v2 生成 1536 维向量，并通过 pgvector 执行余弦相似度检索匹配。'
                  : '随时在上方挂载企业知识库，或者直接提问开始对话。'}
              </p>
            </div>

            {/* 推荐问题 */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="text-xs font-mono text-[#A5A5A5]">
                SUGGESTED QUESTIONS
              </div>
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSendMessage(item.desc)}
                  className="p-3 rounded-lg border border-[#EDEDED] bg-white hover:bg-[#FAFAFA] hover:border-[#151515] transition-colors cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex flex-col pr-2">
                    <span className="text-xs font-medium text-[#151515]">
                      {item.title}
                    </span>
                    <span className="text-xs text-[#757575] truncate">
                      {item.desc}
                    </span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[#A5A5A5] group-hover:text-[#151515] shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isRagAnswer = !isUser && msg.content.includes('【AI 知识库 RAG 检索命中】');

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {/* 角色标识与时间 */}
                <div className="text-[10px] font-mono text-[#A5A5A5] mb-1 px-1">
                  {isUser ? 'YOU' : 'ASSISTANT'}
                </div>

                {/* 气泡 */}
                <div
                  className={`max-w-[88%] text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[#151515] text-white rounded-xl px-3.5 py-2.5'
                      : 'bg-white border border-[#EDEDED] text-[#151515] rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div>
                      {isRagAnswer && (
                        <div className="mb-2 pb-2 border-b border-[#EDEDED] flex items-center gap-1.5 text-xs text-[#757575] font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#151515]" />
                          <span>pgvector 知识检索命中</span>
                        </div>
                      )}
                      <div className="prose prose-sm max-w-none text-[#151515] prose-p:my-1 prose-pre:my-2 prose-pre:p-3 prose-pre:rounded-lg prose-pre:bg-[#F5F5F5] prose-pre:text-[#151515] prose-pre:border prose-pre:border-[#EDEDED]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-[#151515] animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入框 */}
      <div className="border-t border-[#EDEDED] bg-white p-3 safe-bottom z-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 max-w-2xl mx-auto"
        >
          <input
            type="text"
            placeholder={
              selectedKb ? `向「${selectedKb.name}」提问...` : '输入您的问题...'
            }
            className="flex-1 bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3.5 py-2 text-sm text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] transition-colors"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="h-9 px-4 rounded-lg bg-[#151515] hover:bg-black text-white text-sm font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>发送</span>
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
