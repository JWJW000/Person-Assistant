import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, KnowledgeBaseItem } from '../store';
import {
  fetchKnowledgeBases,
  fetchKnowledgeChunks,
  chunkTextAndSave,
  deleteKnowledgeChunk,
  KnowledgeChunkItem,
} from '../lib/aiApi';
import { loginWithRuoYi } from '../lib/auth';
import { Toast, ToastMessage } from '../components/Toast';
import {
  ArrowLeft,
  Database,
  Plus,
  Upload,
  RefreshCw,
  Trash2,
  ChevronDown,
  Check,
  FileText,
  X,
  Layers,
  ArrowRight,
  LogIn,
  BookOpen,
  MessageSquareQuote,
  Search,
} from 'lucide-react';

interface KnowledgePageProps {
  onBack?: () => void;
}

export const KnowledgePage: React.FC<KnowledgePageProps> = ({ onBack }) => {
  const {
    serverUrl,
    accessToken,
    setAccessToken,
    setCurrentUser,
    activeKbId,
    setActiveKbId,
    knowledgeBases,
    setKnowledgeBases,
  } = useAppStore();

  const [chunks, setChunks] = useState<KnowledgeChunkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'qa' | 'text'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Toast 统一轻量消息提示 (无阻塞)
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: String(Date.now()), type, text });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // 弹窗状态
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [quickLoginOpen, setQuickLoginOpen] = useState(false);

  // 快捷登录表单
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('admin123');
  const [loggingIn, setLoggingIn] = useState(false);

  // 新建词条表单 (支持普通切片与 QA 问答对)
  const [entryMode, setEntryMode] = useState<'qa' | 'text'>('qa');
  const [qaQuestion, setQaQuestion] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [submittingText, setSubmittingText] = useState(false);

  // 导入文档状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileTitle, setFileTitle] = useState('');
  const [submittingFile, setSubmittingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [expandedChunkId, setExpandedChunkId] = useState<number | null>(null);

  const handleQuickLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoggingIn(true);
    try {
      const res = await loginWithRuoYi(serverUrl, {
        username: loginUser.trim(),
        password: loginPass.trim(),
        tenantId: '000000',
      });
      setAccessToken(res.access_token);
      setCurrentUser(loginUser.trim());
      setQuickLoginOpen(false);
      showToast('success', '账号登录成功');
      loadChunks();
    } catch (err: any) {
      showToast('error', err.message || '登录失败，请核对账号密码');
    } finally {
      setLoggingIn(false);
    }
  };

  // 1. 加载知识库列表
  const loadBases = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const bases = await fetchKnowledgeBases(serverUrl, accessToken);
      setKnowledgeBases(bases);
      if (activeKbId === null && bases.length > 0) {
        setActiveKbId(bases[0].id);
      }
    } catch (err) {
      console.warn('获取知识库列表失败:', err);
    }
  }, [serverUrl, accessToken, activeKbId, setActiveKbId, setKnowledgeBases]);

  // 2. 加载切片明细列表
  const loadChunks = useCallback(async () => {
    if (!serverUrl || !activeKbId) return;
    setLoading(true);
    try {
      const res = await fetchKnowledgeChunks(serverUrl, accessToken, activeKbId, 1, 100);
      setChunks(res.rows);
      setTotal(res.total);
    } catch (err) {
      console.warn('获取知识库内容失败:', err);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken, activeKbId]);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  useEffect(() => {
    loadChunks();
  }, [loadChunks]);

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);

  // 提交新建词条切片
  const handleSaveTextEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeKbId) {
      showToast('info', '请先在上方选择一个知识库');
      return;
    }
    if (!accessToken) {
      setQuickLoginOpen(true);
      showToast('info', '录入内容需要先登录账号');
      return;
    }
    if (entryMode === 'qa' && !qaQuestion.trim()) {
      showToast('info', '请输入标准问题');
      return;
    }
    if (!entryContent.trim()) {
      showToast('info', '请输入回答或内容');
      return;
    }

    setSubmittingText(true);
    try {
      const res = await chunkTextAndSave(serverUrl, accessToken, {
        kbId: activeKbId,
        chunkType: entryMode,
        question: entryMode === 'qa' ? qaQuestion.trim() : undefined,
        title: entryTitle.trim() || (entryMode === 'qa' ? qaQuestion.trim() : '录入内容'),
        content: entryContent.trim(),
        chunkSize: selectedKb?.chunkSize || 500,
        chunkOverlap: selectedKb?.chunkOverlap || 50,
      });

      showToast('success', entryMode === 'qa' ? '问答对录入成功' : `录入成功，已生成 ${res.chunkCount} 条切片`);
      setTextModalOpen(false);
      setQaQuestion('');
      setEntryTitle('');
      setEntryContent('');
      loadChunks();
    } catch (err: any) {
      if (err.message?.includes('登录') || err.message?.includes('401')) {
        setQuickLoginOpen(true);
        showToast('error', '登录状态已失效，请重新登录');
      } else {
        showToast('error', err.message || '录入失败，请稍后重试');
      }
    } finally {
      setSubmittingText(false);
    }
  };

  // 选择本地文件
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setFileTitle(cleanName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setFileContent(text);
      showToast('info', `已读取文档「${file.name}」`);
    };
    reader.onerror = () => {
      showToast('error', '读取文件失败，请确保文件编码为 UTF-8');
    };
    reader.readAsText(file);
  };

  // 提交文件切片入库
  const handleSaveFileEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeKbId) {
      showToast('info', '请先在上方选择一个知识库');
      return;
    }
    if (!accessToken) {
      setQuickLoginOpen(true);
      showToast('info', '导入文档需要先登录账号');
      return;
    }
    if (!fileContent.trim()) {
      showToast('info', '文档内容为空或尚未读取完成');
      return;
    }

    setSubmittingFile(true);
    try {
      const res = await chunkTextAndSave(serverUrl, accessToken, {
        kbId: activeKbId,
        chunkType: 'text',
        title: fileTitle.trim() || selectedFile?.name || '导入文档',
        content: fileContent.trim(),
        chunkSize: selectedKb?.chunkSize || 500,
        chunkOverlap: selectedKb?.chunkOverlap || 50,
      });

      showToast('success', `导入完成，已生成 ${res.chunkCount} 条切片`);
      setFileModalOpen(false);
      setSelectedFile(null);
      setFileTitle('');
      setFileContent('');
      loadChunks();
    } catch (err: any) {
      if (err.message?.includes('登录') || err.message?.includes('401')) {
        setQuickLoginOpen(true);
        showToast('error', '登录凭据已失效，请重新登录');
      } else {
        showToast('error', err.message || '文档导入失败');
      }
    } finally {
      setSubmittingFile(false);
    }
  };

  // 删除切片
  const handleDeleteChunk = async (id: number) => {
    if (!confirm('确定删除该内容吗？删除后将不再参与智能问答检索。')) return;
    try {
      await deleteKnowledgeChunk(serverUrl, accessToken, id);
      showToast('success', '内容已删除');
      loadChunks();
    } catch (err: any) {
      showToast('error', '删除失败');
    }
  };

  // 过滤显示
  const filteredChunks = chunks.filter((c) => {
    if (activeFilter === 'qa' && c.chunkType !== 'qa') return false;
    if (activeFilter === 'text' && c.chunkType === 'qa') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchQ = c.question?.toLowerCase().includes(q);
      const matchC = c.content?.toLowerCase().includes(q);
      return matchQ || matchC;
    }
    return true;
  });

  const qaCount = chunks.filter((c) => c.chunkType === 'qa').length;
  const textCount = chunks.filter((c) => c.chunkType !== 'qa').length;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-900 antialiased overflow-hidden relative">
      {/* 全局轻量 Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 顶部标题栏与切换 */}
      <header className="safe-top bg-white/95 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 flex flex-col gap-2.5 z-20 sticky top-0 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1 rounded-xl text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                title="返回问答"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Database className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold tracking-tight text-slate-900">
                知识库
              </h1>
              <span className="text-[11px] text-slate-400">
                管理 AI 问答与检索文档
              </span>
            </div>
          </div>

          {/* 快捷操作按钮群 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTextModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 text-slate-700" />
              <span>新建问答</span>
            </button>

            <button
              onClick={() => setFileModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入文档</span>
            </button>
          </div>
        </div>

        {/* 知识库切换选择胶囊 */}
        <div className="relative">
          <div
            onClick={() => setKbDropdownOpen((prev) => !prev)}
            className="flex items-center justify-between px-3.5 py-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/90 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-800 truncate">
                {selectedKb ? selectedKb.name : '请选择知识库'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-medium">
                {total} 条内容
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* 知识库下拉列表 */}
          {kbDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white rounded-2xl border border-slate-200 shadow-xl z-30 flex flex-col gap-1 ring-1 ring-black/[0.04] animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-100 flex items-center justify-between">
                <span>选择知识库</span>
                <span>共 {knowledgeBases.length} 个</span>
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
                    className={`px-3 py-2.5 rounded-xl text-xs cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="truncate font-semibold">{kb.name}</span>
                      
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* 核心内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 pb-28">
        {/* 未登录轻提醒 */}
        {!accessToken && (
          <div className="p-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 flex items-center justify-between text-xs text-amber-900">
            <span className="text-amber-800 font-medium">当前为离线只读状态，录入与修改需登录</span>
            <button
              onClick={() => setQuickLoginOpen(true)}
              className="text-xs font-bold text-amber-900 underline ml-2 shrink-0 cursor-pointer"
            >
              登录账号
            </button>
          </div>
        )}

        {/* 知识库概览卡片 (极简优雅，无多余技术术语) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                {selectedKb ? selectedKb.name : '知识库概览'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                已就绪
              </span>
            </div>

            <button
              onClick={loadChunks}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              title="刷新列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-slate-900' : ''}`} />
              <span>刷新</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">问答对 (QA)</span>
              <span className="font-semibold text-slate-900 text-sm mt-0.5">{qaCount} 组</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">文档切片</span>
              <span className="font-semibold text-slate-900 text-sm mt-0.5">{textCount} 条</span>
            </div>
          </div>
        </div>

        {/* 筛选与搜索工具条 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* 分类筛选 Pills */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              全部 ({chunks.length})
            </button>
            <button
              onClick={() => setActiveFilter('qa')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'qa'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              问答 ({qaCount})
            </button>
            <button
              onClick={() => setActiveFilter('text')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'text'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              文档 ({textCount})
            </button>
          </div>

          {/* 实时快搜 */}
          <div className="relative flex-1 max-w-[150px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* 内容卡片列表 */}
        {filteredChunks.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              <Layers className="w-6 h-6" />
            </div>
            <span className="text-xs text-slate-500">
              {searchQuery ? '没有找到匹配的内容' : '当前知识库暂无内容'}
            </span>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setTextModalOpen(true)}
                className="text-xs text-slate-900 underline font-semibold cursor-pointer"
              >
                新建问答对
              </button>
              <span className="text-xs text-slate-300">或</span>
              <button
                onClick={() => setFileModalOpen(true)}
                className="text-xs text-slate-900 underline font-semibold cursor-pointer"
              >
                导入本地文档
              </button>
            </div>
          </div>
        ) : (
          filteredChunks.map((chunk) => {
            const isExpanded = expandedChunkId === chunk.id;
            const isQa = chunk.chunkType === 'qa';

            return (
              <div
                key={chunk.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col gap-2.5 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isQa ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <MessageSquareQuote className="w-3 h-3 text-indigo-500" />
                        问答对
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60">
                        <FileText className="w-3 h-3 text-slate-500" />
                        文档切片
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-slate-400">
                      {chunk.tokenCount} 字
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteChunk(chunk.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* QA 模式的问题高亮 */}
                {isQa && chunk.question && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs font-semibold text-slate-900 flex items-start gap-2">
                    <span className="w-4 h-4 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                      Q
                    </span>
                    <span className="leading-snug">{chunk.question}</span>
                  </div>
                )}

                {/* 正文或回答 */}
                <div
                  onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                  className={`text-xs text-slate-700 leading-relaxed whitespace-pre-wrap cursor-pointer ${
                    isExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  {isQa && (
                    <span className="inline-block w-4 h-4 rounded-md bg-slate-200 text-slate-700 text-center text-[10px] mr-1.5 font-bold align-middle">
                      A
                    </span>
                  )}
                  {chunk.content}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                  <span className="font-mono">
                    {chunk.createTime ? chunk.createTime.slice(0, 16).replace('T', ' ') : '已保存'}
                  </span>
                  <button
                    onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    {isExpanded ? '收起' : '展开全文'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 弹窗 A：录入问答或长文本 */}
      {textModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">新建知识内容</span>
                <span className="text-xs text-slate-400">添加问答对或文本片段供 AI 参考</span>
              </div>
              <button
                onClick={() => setTextModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 模式选择切换 */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold text-center">
              <button
                type="button"
                onClick={() => setEntryMode('qa')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  entryMode === 'qa'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                问答对 (QA)
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('text')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  entryMode === 'text'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                文本片段
              </button>
            </div>

            <form onSubmit={handleSaveTextEntry} className="flex flex-col gap-3">
              {entryMode === 'qa' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700">标准问题</label>
                    <input
                      type="text"
                      placeholder="例如：公司的作息时间是什么？"
                      value={qaQuestion}
                      onChange={(e) => setQaQuestion(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all font-medium"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700">标准回答</label>
                    <textarea
                      rows={4}
                      placeholder="例如：工作日 9:00 - 18:00，午休时间 12:00 - 13:30。"
                      value={entryContent}
                      onChange={(e) => setEntryContent(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all leading-relaxed"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700">标题 (可选)</label>
                    <input
                      type="text"
                      placeholder="例如：服务使用规范"
                      value={entryTitle}
                      onChange={(e) => setEntryTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700">内容正文</label>
                    <textarea
                      rows={5}
                      placeholder="粘贴需要让 AI 学习的文档段落..."
                      value={entryContent}
                      onChange={(e) => setEntryContent(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all leading-relaxed"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTextModalOpen(false)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingText || (entryMode === 'qa' ? !qaQuestion.trim() : !entryContent.trim())}
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  {submittingText ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>保存内容</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 B：导入文档 */}
      {fileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">导入本地文档</span>
                <span className="text-xs text-slate-400">支持 .txt, .md, .markdown 等格式</span>
              </div>
              <button
                onClick={() => setFileModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFileEntry} className="flex flex-col gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.json,.csv,.text"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-400 bg-slate-50/70 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs">
                  <FileText className="w-5 h-5 text-slate-600" />
                </div>
                <span className="text-xs font-semibold text-slate-800">
                  {selectedFile ? selectedFile.name : '点击选择本地文档'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : '支持 Markdown 与纯文本文件'}
                </span>
              </div>

              {selectedFile && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">文档名称</label>
                  <input
                    type="text"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400 font-medium"
                  />
                </div>
              )}

              {fileContent && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>文档预览</span>
                    <span className="font-mono text-[10px]">{fileContent.length} 字符</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {fileContent}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setFileModalOpen(false);
                    setSelectedFile(null);
                    setFileContent('');
                  }}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingFile || !fileContent.trim()}
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  {submittingFile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在导入...</span>
                    </>
                  ) : (
                    <>
                      <span>确认导入</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 C：快捷登录 */}
      {quickLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-slate-100 text-slate-800">
                  <LogIn className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-900">登录系统账号</span>
              </div>
              <button
                onClick={() => setQuickLoginOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickLogin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">账号</label>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">密码</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400 font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full mt-2 h-10 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95 transition-all"
              >
                {loggingIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>登录账号</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
