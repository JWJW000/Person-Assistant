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
  Copy,
  Layers,
  Sparkles,
  Bot,
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

// 行内代码/Key 小胶囊 (框内精准可复制)
const InlineCodeChip: React.FC<{ children: any }> = ({ children }) => {
  const [copied, setCopied] = useState(false);

  const extractText = (node: any): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) return extractText(node.props.children);
    return '';
  };

  const text = extractText(children);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <span
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 my-0.5 mx-0.5 px-1.5 py-0.5 rounded-md font-mono text-xs break-all cursor-pointer transition-colors border select-none active:scale-[0.98] ${
        copied
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
          : 'bg-slate-100/90 hover:bg-slate-200 text-slate-900 border-slate-200'
      }`}
      title="点击直接复制此内容"
    >
      <span className="break-all">{children}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-600 shrink-0 inline" />
      ) : (
        <Copy className="w-3 h-3 text-slate-400 hover:text-slate-700 shrink-0 inline opacity-70 hover:opacity-100" />
      )}
    </span>
  );
};

// 多行代码块 (带独立复制按钮)
const MarkdownCodeBlock: React.FC<{ children: any }> = ({ children }) => {
  const [copied, setCopied] = useState(false);

  const extractText = (node: any): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) return extractText(node.props.children);
    return '';
  };

  const text = extractText(children);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-2.5 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/80 border-b border-slate-200 text-[10px] font-mono text-slate-500">
        <span>CODE / DATA</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制' : '复制代码'}</span>
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-slate-900 overflow-x-auto max-w-full leading-normal whitespace-pre">
        {children}
      </pre>
    </div>
  );
};

const PROMPT_SUGGESTIONS = [
  {
    title: '模型架构对比评测',
    desc: '请详细分析 DeepSeek V4 Pro 与 Claude Sonnet 4.6 的架构特点与适用场景',
  },
  {
    title: 'pgvector 向量检索原理',
    desc: '若依系统如何使用 pgvector 与 HNSW 进行高维余弦召回？',
  },
  {
    title: '企业知识库配置',
    desc: '当前知识库挂载了哪些切片与向量规则？',
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
  const [copiedMsgId, setCopiedMsgId] = useState<string | number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // 1. 获取模型列表 (绝不为空，稳定依赖)
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

  // 2. 获取知识库列表 (绝不为空，稳定依赖)
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
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-900 antialiased">
      {/* 顶部科技感控制 Header */}
      <header className="safe-top bg-white/90 backdrop-blur-xl border-b border-slate-200/80 px-4 py-2.5 flex flex-col gap-2 z-20 sticky top-0 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
              title="会话列表"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                AI 智能助理
              </span>
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                {conversations.find((c) => c.id === activeConversationId)?.title || '默认会话'}
              </span>
            </div>
          </div>

          <button
            onClick={handleCreateSession}
            className="flex items-center gap-1 h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
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
              className="flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Cpu className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {selectedModel ? selectedModel.name : '选择大模型'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* 模型选择面板 */}
            {modelDropdownOpen && (
              <div className="absolute top-full left-0 right-[-100%] sm:right-0 mt-1 p-1 bg-white rounded-2xl border border-slate-200 shadow-2xl z-30 max-h-72 overflow-y-auto flex flex-col gap-0.5 ring-1 ring-black/[0.04]">
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-100 flex items-center justify-between">
                  <span>中转站模型 ({chatModels.length})</span>
                  <span className="text-[9px]">newapi.5wjw.cn</span>
                </div>

                {chatModels.map((m) => {
                  const isSelected = activeModelId === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSelectModel(m)}
                      className={`px-3 py-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-semibold">{m.name}</span>
                        <span className={`text-[10px] font-mono truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
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
              className="flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {selectedKb ? selectedKb.name : '无知识库'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* 知识库选择面板 */}
            {kbDropdownOpen && (
              <div className="absolute top-full left-[-100%] sm:left-0 right-0 mt-1 p-1 bg-white rounded-2xl border border-slate-200 shadow-2xl z-30 flex flex-col gap-0.5 ring-1 ring-black/[0.04]">
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-100">
                  选择知识底座 (pgvector 混合检索)
                </div>

                <div
                  onClick={() => {
                    setActiveKbId(null);
                    setKbDropdownOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition-colors ${
                    activeKbId === null
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex flex-col">
                    <span>全能通用模式</span>
                    <span className={`text-[10px] ${activeKbId === null ? 'text-slate-300' : 'text-slate-400'}`}>
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
                      className={`px-3 py-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-semibold">{kb.name}</span>
                        <span className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
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

      {/* 消息流区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {messages.length === 0 ? (
          /* 空状态引导与推荐提问 */
          <div className="flex flex-col justify-center min-h-[55vh] gap-5 max-w-md mx-auto text-left py-6">
            <div className="flex flex-col gap-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>ACTIVE MODEL: {selectedModel?.modelName || 'deepseek-v4-pro'}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {selectedKb ? `已挂载知识库「${selectedKb.name}」` : '智能 AI 问答平台'}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                {selectedKb
                  ? '已启用阿里百炼 1536 维向量模型与 PostgreSQL pgvector 混合检索算法（0.8+高精度召回）。'
                  : '支持随时切换 Claude 4.6、DeepSeek V4 Pro、Gemini 3.8、Grok 4.6 等全量模型。'}
              </p>
            </div>

            {/* 推荐问题 Bento 卡片 */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider px-1">
                SUGGESTED PROMPTS
              </div>
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSendMessage(item.desc)}
                  className="p-3.5 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group active:scale-[0.99]"
                >
                  <div className="flex flex-col pr-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                      {item.title}
                    </span>
                    <span className="text-xs text-slate-500 truncate mt-0.5">
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
            const isRagAnswer = !isUser && msg.content.includes('【AI 知识库 RAG 检索命中】');

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full min-w-0`}>
                {/* 角色与时间标识 */}
                <div className="text-[10px] font-mono text-slate-400 mb-1 px-1 flex items-center gap-1.5">
                  {isUser ? (
                    <span>YOU</span>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-slate-500" />
                      <span>{msg.content ? (selectedModel?.name || 'ASSISTANT') : 'GENERATING...'}</span>
                    </>
                  )}
                </div>

                {/* 气泡容器 (防溢出 + 完整折行保护) */}
                <div
                  className={`max-w-[92%] sm:max-w-[85%] min-w-0 text-sm leading-relaxed break-words [word-break:break-word] overflow-hidden ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-2xl px-4 py-2.5 shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-900 rounded-2xl p-4 shadow-xs'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words [word-break:break-word] font-medium">{msg.content}</div>
                  ) : (
                    <div className="min-w-0 overflow-hidden relative">
                      {/* 消息框内右上角轻量复制按钮 */}
                      <button
                        onClick={() => handleCopyMessage(msg.content, msg.id)}
                        className="float-right ml-2 mb-1 p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="复制整段回答"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isRagAnswer && (
                        <div className="mb-2.5 pb-2 border-b border-slate-100 flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-semibold text-slate-800">pgvector 混合检索命中</span>
                        </div>
                      )}

                      <div className="prose prose-sm max-w-full overflow-hidden text-slate-900 break-words [word-break:break-word] prose-p:my-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            pre({ children }) {
                              return <MarkdownCodeBlock>{children}</MarkdownCodeBlock>;
                            },
                            code({ inline, children, ...props }: any) {
                              if (inline) {
                                return <InlineCodeChip>{children}</InlineCodeChip>;
                              }
                              return <code className="font-mono text-xs break-all" {...props}>{children}</code>;
                            },
                            table({ children, ...props }) {
                              return (
                                <div className="overflow-x-auto my-2 max-w-full border border-slate-200 rounded-xl">
                                  <table className="w-full text-xs text-left divide-y divide-slate-200" {...props}>
                                    {children}
                                  </table>
                                </div>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-slate-900 animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 消息气泡底部工具栏 */}
                {!isUser && msg.content && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      onClick={() => handleCopyMessage(msg.content, msg.id)}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 py-0.5 px-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      title="复制回答"
                    >
                      {copiedMsgId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600 font-medium">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>复制回答</span>
                        </>
                      )}
                    </button>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {msg.content.length} 字符
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 悬浮岛式输入框 (Floating Dock Input) */}
      <div className="fixed bottom-20 inset-x-0 px-4 pointer-events-none z-20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="pointer-events-auto max-w-lg mx-auto bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-[0_12px_40px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.03)] rounded-full p-1.5 pl-4 flex items-center gap-2 ring-1 ring-slate-900/[0.03]"
        >
          <input
            type="text"
            placeholder={
              selectedModel
                ? `向 ${selectedModel.name} 提问...`
                : '输入您的问题...'
            }
            className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none font-medium"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="w-9 h-9 rounded-full bg-slate-900 hover:bg-black text-white flex items-center justify-center disabled:opacity-40 hover:shadow-md hover:shadow-slate-900/20 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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
