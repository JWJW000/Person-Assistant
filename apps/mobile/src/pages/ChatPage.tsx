import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, KnowledgeBaseItem, AiModelItem } from '../store';
import { ConversationDrawer } from '../components/ConversationDrawer';
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
  Send,
  Plus,
  Menu,
  Check,
  ChevronDown,
  RefreshCw,
  Database,
  ArrowUpRight,
  Cpu,
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
    title: '模型综合评测',
    desc: '请详细分析 DeepSeek V4 Pro 与 Claude Sonnet 4.6 的架构特点与适用场景',
  },
  {
    title: 'pgvector 向量检索原理',
    desc: '若依系统如何使用 pgvector 与 HNSW 进行高维余弦召回？',
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
    activeModelId,
    setActiveModelId,
    chatModels,
    setChatModels,
  } = useAppStore();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. 获取模型列表 (绝不为空)
  const loadModels = useCallback(async () => {
    try {
      const models = await fetchChatModels(serverUrl, accessToken);
      if (models && models.length > 0) {
        setChatModels(models);
        if (activeModelId === null) {
          const def = models.find((m) => m.isDefault === '1') || models[0];
          setActiveModelId(def.id);
        }
      }
    } catch (err) {
      console.warn('加载模型列表失败:', err);
    }
  }, [serverUrl, accessToken, activeModelId, setActiveModelId, setChatModels]);

  // 2. 获取知识库列表 (绝不为空)
  const loadKnowledgeBases = useCallback(async () => {
    try {
      const bases = await fetchKnowledgeBases(serverUrl, accessToken);
      if (bases && bases.length > 0) {
        setKnowledgeBases(bases);
        if (activeKbId === null) {
          setActiveKbId(bases[0].id);
        }
      }
    } catch (err) {
      console.warn('加载知识库失败:', err);
    }
  }, [serverUrl, accessToken, activeKbId, setActiveKbId, setKnowledgeBases]);

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

      if (convs.length > 0 && (!activeConversationId || activeConversationId === 'default')) {
        setActiveConversationId(convs[0].id);
      }
    } catch (err) {
      console.warn('获取会话失败:', err);
    }
  }, [serverUrl, accessToken, activeConversationId, setActiveConversationId, setConversations]);

  // 4. 拉取历史记录
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
    loadModels();
    loadKnowledgeBases();
    loadSessions();
  }, [loadModels, loadKnowledgeBases, loadSessions]);

  useEffect(() => {
    if (activeConversationId && activeConversationId !== 'default') {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 切换大模型
  const handleSelectModel = async (model: AiModelItem) => {
    setActiveModelId(model.id);
    setModelDropdownOpen(false);
    if (serverUrl && accessToken) {
      setDefaultModel(serverUrl, accessToken, model.id).catch(() => {});
    }
  };

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
      modelId: activeModelId,
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
  const selectedModel = chatModels.find((m) => m.id === activeModelId);

  return (
    <div className="flex flex-col h-full bg-white text-[#151515] antialiased">
      {/* 顶部简明导航栏 */}
      <header className="safe-top bg-white border-b border-[#EDEDED] px-4 py-2 flex flex-col gap-2 z-20 sticky top-0">
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
                AI 智能助理
              </span>
              <span className="text-xs text-[#757575] font-mono truncate max-w-[150px]">
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

        {/* 双控制胶囊：大模型切换 + 知识底座挂载 */}
        <div className="grid grid-cols-2 gap-2 relative">
          {/* 1. 模型切换胶囊 */}
          <div className="relative">
            <div
              onClick={() => {
                setModelDropdownOpen((prev) => !prev);
                setKbDropdownOpen(false);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 bg-[#FAFAFA] hover:bg-[#F5F5F5] rounded-lg border border-[#EDEDED] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Cpu className="w-3.5 h-3.5 text-[#757575] shrink-0" />
                <span className="text-xs font-medium text-[#151515] truncate">
                  {selectedModel ? selectedModel.name : '选择大模型'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#757575] shrink-0 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* 模型选择面板 (中转站模型列表) */}
            {modelDropdownOpen && (
              <div className="absolute top-full left-0 right-[-100%] sm:right-0 mt-1 p-1 bg-white rounded-xl border border-[#EDEDED] shadow-xl z-30 max-h-72 overflow-y-auto flex flex-col gap-0.5">
                <div className="px-2.5 py-1 text-[11px] text-[#A5A5A5] font-mono border-b border-[#EDEDED] flex items-center justify-between">
                  <span>中转站所有可用模型 ({chatModels.length})</span>
                  <span className="text-[9px]">newapi.5wjw.cn</span>
                </div>

                {chatModels.map((m) => {
                  const isSelected = activeModelId === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSelectModel(m)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#151515] text-white font-medium'
                          : 'hover:bg-[#F5F5F5] text-[#151515]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className={`text-[10px] font-mono truncate ${isSelected ? 'text-[#A5A5A5]' : 'text-[#757575]'}`}>
                          {m.modelName} ({m.provider})
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. 知识库切换胶囊 */}
          <div className="relative">
            <div
              onClick={() => {
                setKbDropdownOpen((prev) => !prev);
                setModelDropdownOpen(false);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 bg-[#FAFAFA] hover:bg-[#F5F5F5] rounded-lg border border-[#EDEDED] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Database className="w-3.5 h-3.5 text-[#757575] shrink-0" />
                <span className="text-xs font-medium text-[#151515] truncate">
                  {selectedKb ? selectedKb.name : '无知识库'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#757575] shrink-0 transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* 知识库选择面板 */}
            {kbDropdownOpen && (
              <div className="absolute top-full left-[-100%] sm:left-0 right-0 mt-1 p-1 bg-white rounded-xl border border-[#EDEDED] shadow-xl z-30 flex flex-col gap-0.5">
                <div className="px-2.5 py-1 text-[11px] text-[#A5A5A5] font-mono border-b border-[#EDEDED]">
                  选择知识底座 (PostgreSQL pgvector)
                </div>

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
                    <span>全能通用模式</span>
                    <span className={`text-[10px] ${activeKbId === null ? 'text-[#A5A5A5]' : 'text-[#757575]'}`}>
                      不挂载知识库，纯模型通用回答
                    </span>
                  </div>
                  {activeKbId === null && <Check className="w-4 h-4 text-white" />}
                </div>

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
        </div>
      </header>

      {/* 消息滚动流 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          /* 空状态引导 */
          <div className="flex flex-col justify-center min-h-[55vh] gap-5 max-w-md mx-auto text-left py-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#151515] tracking-tight flex items-center gap-1.5">
                <span>当前模型:</span>
                <span className="font-mono text-sm bg-[#F5F5F5] px-2 py-0.5 rounded border border-[#EDEDED]">
                  {selectedModel ? selectedModel.name : 'DeepSeek V4 Pro'}
                </span>
              </h2>
              <p className="text-xs text-[#757575] leading-normal">
                {selectedKb
                  ? `已关联知识库「${selectedKb.name}」，输入问题将通过百炼 text-embedding-v2 生成 1536 维向量检索。`
                  : '随时在上方下拉切换 Claude 4.6、DeepSeek V4、Gemini 3.8 或 Grok 4.6 等中转站全量模型。'}
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
                {/* 角色标识 */}
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

      {/* 底部输入栏 */}
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
              selectedModel
                ? `向 ${selectedModel.name} 提问...`
                : '输入您的问题...'
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
