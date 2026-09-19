import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, KnowledgeBaseItem } from '../store';
import {
  fetchKnowledgeBases,
  fetchKnowledgeChunks,
  chunkTextAndSave,
  deleteKnowledgeChunk,
  KnowledgeChunkItem,
} from '../lib/aiApi';
import { loginWithRuoYi, fetchCaptcha, CaptchaData } from '../lib/auth';
import { Toast, ToastMessage } from '../components/Toast';
import {
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
  HelpCircle,
} from 'lucide-react';

export const KnowledgePage: React.FC = () => {
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
  const [loginCode, setLoginCode] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // 新建词条表单 (支持普通切片与 QA 问答对)
  const [entryMode, setEntryMode] = useState<'text' | 'qa'>('qa');
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

  const loadCaptcha = async () => {
    try {
      const c = await fetchCaptcha(serverUrl);
      setCaptchaData(c);
      setLoginCode('');
    } catch {}
  };

  const handleQuickLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoggingIn(true);
    try {
      const res = await loginWithRuoYi(serverUrl, {
        username: loginUser.trim(),
        password: loginPass.trim(),
        code: loginCode.trim(),
        uuid: captchaData?.uuid || '',
        tenantId: '000000',
      });
      setAccessToken(res.access_token);
      setCurrentUser(loginUser.trim());
      setQuickLoginOpen(false);
      showToast('success', '账号登录成功，凭证已刷新');
      loadChunks();
    } catch (err: any) {
      showToast('error', err.message || '登录失败，请检查账号密码');
      loadCaptcha();
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
      console.warn('获取切片失败:', err);
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
      loadCaptcha();
      showToast('info', '写入知识库需要登录系统账号，请先登录');
      return;
    }
    if (entryMode === 'qa' && !qaQuestion.trim()) {
      showToast('info', '请输入 QA 标准问题 (Q)');
      return;
    }
    if (!entryContent.trim()) {
      showToast('info', '请输入答案或词条内容');
      return;
    }

    setSubmittingText(true);
    try {
      const res = await chunkTextAndSave(serverUrl, accessToken, {
        kbId: activeKbId,
        chunkType: entryMode,
        question: entryMode === 'qa' ? qaQuestion.trim() : undefined,
        title: entryTitle.trim() || (entryMode === 'qa' ? qaQuestion.trim() : '手动录入词条'),
        content: entryContent.trim(),
        chunkSize: selectedKb?.chunkSize || 500,
        chunkOverlap: selectedKb?.chunkOverlap || 50,
      });

      showToast('success', entryMode === 'qa' ? 'QA 问答对已入库 (仅对 Q 向量化，得分 0.8+)' : `切片入库成功！共生成 ${res.chunkCount} 个向量切片`);
      setTextModalOpen(false);
      setQaQuestion('');
      setEntryTitle('');
      setEntryContent('');
      loadChunks();
    } catch (err: any) {
      if (err.message?.includes('登录') || err.message?.includes('401')) {
        setQuickLoginOpen(true);
        loadCaptcha();
        showToast('error', '登录凭据已失效，请重新登录');
      } else {
        showToast('error', err.message || '词条切片入库失败');
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
      showToast('info', `已读取文档「${file.name}」，共 ${text.length} 字符`);
    };
    reader.onerror = () => {
      showToast('error', '读取本地文件失败，请确保文件编码为 UTF-8');
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
      loadCaptcha();
      showToast('info', '写入知识库需登录系统账号，请先登录');
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

      showToast('success', `文档切分成功！生成 ${res.chunkCount} 个切片并完成向量化入库`);
      setFileModalOpen(false);
      setSelectedFile(null);
      setFileTitle('');
      setFileContent('');
      loadChunks();
    } catch (err: any) {
      if (err.message?.includes('登录') || err.message?.includes('401')) {
        setQuickLoginOpen(true);
        loadCaptcha();
        showToast('error', '登录凭据已失效，请重新登录');
      } else {
        showToast('error', err.message || '文档切片入库失败');
      }
    } finally {
      setSubmittingFile(false);
    }
  };

  // 删除切片
  const handleDeleteChunk = async (id: number) => {
    if (!confirm('确定删除该切片吗？删除后将无法通过向量余弦检索召回。')) return;
    try {
      await deleteKnowledgeChunk(serverUrl, accessToken, id);
      showToast('success', '切片已删除');
      loadChunks();
    } catch (err: any) {
      showToast('error', '删除切片失败');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-[#151515] antialiased overflow-hidden relative">
      {/* 全局轻量 Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 顶部标题栏与知识库切换 */}
      <header className="safe-top bg-white border-b border-[#EDEDED] px-4 py-2.5 flex flex-col gap-2 z-20 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#F5F5F5] text-[#151515]">
              <Database className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-[#151515]">
                知识库管理
              </span>
              <span className="text-xs text-[#757575] font-mono">
                PostgreSQL pgvector (混合检索 + QA词条)
              </span>
            </div>
          </div>

          {/* 操作按钮群 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTextModalOpen(true)}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#EDEDED] bg-white hover:bg-[#F5F5F5] text-[#151515] text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>录入词条</span>
            </button>

            <button
              onClick={() => setFileModalOpen(true)}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#151515] hover:bg-black text-white text-xs font-medium transition-colors cursor-pointer active:scale-[0.99]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入文档</span>
            </button>
          </div>
        </div>

        {/* 知识库切换下拉条 */}
        <div className="relative">
          <div
            onClick={() => setKbDropdownOpen((prev) => !prev)}
            className="flex items-center justify-between px-3 py-1.5 bg-[#FAFAFA] hover:bg-[#F5F5F5] rounded-lg border border-[#EDEDED] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs text-[#757575] font-medium shrink-0">当前知识库:</span>
              <span className="text-xs font-semibold text-[#151515] truncate">
                {selectedKb ? selectedKb.name : '请选择知识库'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EDEDED] text-[#151515]">
                {total} 切片
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#757575] transition-transform ${kbDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* 知识库下拉列表 */}
          {kbDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white rounded-xl border border-[#EDEDED] shadow-xl z-30 flex flex-col gap-0.5">
              <div className="px-2.5 py-1 text-[11px] text-[#A5A5A5] font-mono border-b border-[#EDEDED]">
                选择要管理的知识库
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
      </header>

      {/* 知识库概览与切片流 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {/* 未登录提醒横条 */}
        {!accessToken && (
          <div className="p-3 rounded-xl border border-[#EDEDED] bg-[#FAFAFA] flex items-center justify-between text-xs">
            <span className="text-[#757575]">当前为离线或只读模式，录入与切片需登录账号</span>
            <button
              onClick={() => {
                setQuickLoginOpen(true);
                loadCaptcha();
              }}
              className="text-xs font-semibold text-[#151515] underline ml-2 shrink-0 cursor-pointer"
            >
              立即登录
            </button>
          </div>
        )}

        {/* Bento 知识库规格卡片 */}
        <div className="bg-white border border-[#EDEDED] rounded-xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-[#A5A5A5] uppercase tracking-wider">
            <span>KNOWLEDGE BASE SPEC</span>
            <button
              onClick={loadChunks}
              className="flex items-center gap-1 text-[10px] text-[#757575] hover:text-[#151515] cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#151515]">
              {selectedKb ? selectedKb.name : '系统知识库'}
            </span>
            <p className="text-xs text-[#757575] leading-normal">
              {selectedKb?.description || '基于阿里百炼 1536 维向量模型与 PostgreSQL pgvector 构建的企业知识底座'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#EDEDED] text-center text-xs">
            <div className="p-2 rounded-lg bg-[#FAFAFA] border border-[#EDEDED] flex flex-col">
              <span className="text-[10px] text-[#A5A5A5]">已存切片</span>
              <span className="font-mono font-semibold text-[#151515] text-sm">{total}</span>
            </div>
            <div className="p-2 rounded-lg bg-[#FAFAFA] border border-[#EDEDED] flex flex-col">
              <span className="text-[10px] text-[#A5A5A5]">检索算法</span>
              <span className="font-mono text-[#151515] text-xs mt-0.5">混合融合 (0.8+)</span>
            </div>
            <div className="p-2 rounded-lg bg-[#FAFAFA] border border-[#EDEDED] flex flex-col">
              <span className="text-[10px] text-[#A5A5A5]">向量模型</span>
              <span className="font-mono text-[#151515] text-xs mt-0.5">百炼 V2 1536维</span>
            </div>
          </div>
        </div>

        {/* 切片列表标题 */}
        <div className="flex items-center justify-between text-xs font-mono text-[#A5A5A5] uppercase tracking-wider px-1">
          <span>CHUNKS & QA ENTRIES ({chunks.length})</span>
          <span>按序号升序</span>
        </div>

        {/* 切片卡片流 */}
        {chunks.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#A5A5A5] text-center">
            <Layers className="w-8 h-8 text-[#EDEDED]" />
            <span className="text-xs">当前知识库暂无切片内容</span>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setTextModalOpen(true)}
                className="text-xs text-[#151515] underline font-medium cursor-pointer"
              >
                录入 QA / 词条
              </button>
              <span className="text-xs text-[#EDEDED]">或</span>
              <button
                onClick={() => setFileModalOpen(true)}
                className="text-xs text-[#151515] underline font-medium cursor-pointer"
              >
                导入本地文档
              </button>
            </div>
          </div>
        ) : (
          chunks.map((chunk) => {
            const isExpanded = expandedChunkId === chunk.id;
            const isQa = chunk.chunkType === 'qa';

            return (
              <div
                key={chunk.id}
                className="bg-white border border-[#EDEDED] rounded-xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-2 hover:border-[#151515] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isQa ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#151515] text-white">
                        QA 问答对
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#F5F5F5] text-[#151515]">
                        #{chunk.chunkOrder} 切片
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-[#757575]">
                      {chunk.tokenCount} 字符
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteChunk(chunk.id)}
                    className="p-1 text-[#A5A5A5] hover:text-[#CF1322] rounded transition-colors cursor-pointer"
                    title="删除该切片"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* QA 专属问题展示 */}
                {isQa && chunk.question && (
                  <div className="p-2 rounded-lg bg-[#FAFAFA] border border-[#EDEDED] text-xs font-medium text-[#151515] flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-[#757575] shrink-0 mt-0.5" />
                    <span>Q: {chunk.question}</span>
                  </div>
                )}

                {/* 切片正文 / QA 答案 */}
                <div
                  onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                  className={`text-xs text-[#151515] leading-relaxed font-mono whitespace-pre-wrap cursor-pointer ${
                    isExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  {isQa && <span className="text-[#757575] font-sans font-medium mr-1">A:</span>}
                  {chunk.content}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#EDEDED] text-[10px] font-mono text-[#A5A5A5]">
                  <span>{chunk.createTime ? chunk.createTime.slice(0, 19).replace('T', ' ') : '已落库'}</span>
                  <button
                    onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                    className="text-[#757575] hover:text-[#151515] cursor-pointer"
                  >
                    {isExpanded ? '收起' : '展开'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 弹窗 A：录入词条 (支持普通文本与 QA 模式) */}
      {textModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#EDEDED] shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#EDEDED] pb-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#151515]">新建知识词条</span>
                <span className="text-xs text-[#757575]">支持 QA 问答对（仅检索 Q）与普通长文</span>
              </div>
              <button
                onClick={() => setTextModalOpen(false)}
                className="p-1 rounded-md text-[#757575] hover:bg-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 模式选择切换胶囊 */}
            <div className="grid grid-cols-2 p-1 bg-[#FAFAFA] border border-[#EDEDED] rounded-lg text-xs font-medium text-center">
              <button
                type="button"
                onClick={() => setEntryMode('qa')}
                className={`py-1 rounded-md transition-colors ${
                  entryMode === 'qa'
                    ? 'bg-[#151515] text-white shadow-xs'
                    : 'text-[#757575] hover:text-[#151515]'
                }`}
              >
                QA 问答对 (推荐 0.8+)
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('text')}
                className={`py-1 rounded-md transition-colors ${
                  entryMode === 'text'
                    ? 'bg-[#151515] text-white shadow-xs'
                    : 'text-[#757575] hover:text-[#151515]'
                }`}
              >
                普通长文本切片
              </button>
            </div>

            <form onSubmit={handleSaveTextEntry} className="flex flex-col gap-3">
              {entryMode === 'qa' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[#757575] flex items-center justify-between">
                      <span>标准问题 (Q) - 仅对此生成向量</span>
                      <span className="text-[10px] text-emerald-600 font-mono">无杂质干扰</span>
                    </label>
                    <input
                      type="text"
                      placeholder="如：小米 API Key 是多少？"
                      value={qaQuestion}
                      onChange={(e) => setQaQuestion(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-2 text-xs text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[#757575]">标准答案 (A) - 召回时注入大模型</label>
                    <textarea
                      rows={5}
                      placeholder="如：小米api：sk-c4xxesvnwni87qrkfgwsudmyx0c2ep4wkeaw0dvhhin48alm"
                      value={entryContent}
                      onChange={(e) => setEntryContent(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg p-3 text-xs text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] font-mono leading-relaxed"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[#757575]">片段标题</label>
                    <input
                      type="text"
                      placeholder="如：系统鉴权架构"
                      value={entryTitle}
                      onChange={(e) => setEntryTitle(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-2 text-xs text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[#757575]">正文内容 (自动滑动窗口分块)</label>
                    <textarea
                      rows={6}
                      placeholder="粘贴长文正文..."
                      value={entryContent}
                      onChange={(e) => setEntryContent(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg p-3 text-xs text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] font-mono leading-relaxed"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EDEDED]">
                <button
                  type="button"
                  onClick={() => setTextModalOpen(false)}
                  className="h-9 px-3 rounded-lg border border-[#EDEDED] text-xs text-[#757575] hover:bg-[#F5F5F5]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingText || (entryMode === 'qa' ? !qaQuestion.trim() : !entryContent.trim())}
                  className="h-9 px-4 rounded-lg bg-[#151515] hover:bg-black text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  {submittingText ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{entryMode === 'qa' ? '保存 QA 词条' : '执行切片入库'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 B：导入本地文档自动切分入库 */}
      {fileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#EDEDED] shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#EDEDED] pb-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#151515]">导入本地文档自动切分</span>
                <span className="text-xs text-[#757575]">支持 .txt, .md, .markdown, .json, .csv 等文档</span>
              </div>
              <button
                onClick={() => setFileModalOpen(false)}
                className="p-1 rounded-md text-[#757575] hover:bg-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFileEntry} className="flex flex-col gap-3">
              {/* 文件选取区域 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.json,.csv,.log,.text"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border border-dashed border-[#EDEDED] hover:border-[#151515] bg-[#FAFAFA] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <FileText className="w-6 h-6 text-[#757575]" />
                <span className="text-xs font-medium text-[#151515]">
                  {selectedFile ? selectedFile.name : '点击选取本地 .md / .txt 文档'}
                </span>
                <span className="text-[10px] text-[#A5A5A5]">
                  {selectedFile
                    ? `大小: ${(selectedFile.size / 1024).toFixed(1)} KB`
                    : '支持 UTF-8 编码的 Markdown 与纯文本'}
                </span>
              </div>

              {/* 文件名作为标题 */}
              {selectedFile && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#757575]">入库标题</label>
                  <input
                    type="text"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-1.5 text-xs text-[#151515] focus:outline-none focus:border-[#151515]"
                  />
                </div>
              )}

              {/* 提取内容预览 */}
              {fileContent && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-[#757575]">
                    <span>内容已读取</span>
                    <span className="font-mono text-[10px]">{fileContent.length} 字符</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto p-2 rounded-lg bg-[#F5F5F5] border border-[#EDEDED] text-[11px] font-mono text-[#757575] leading-relaxed whitespace-pre-wrap">
                    {fileContent}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EDEDED]">
                <button
                  type="button"
                  onClick={() => {
                    setFileModalOpen(false);
                    setSelectedFile(null);
                    setFileContent('');
                  }}
                  className="h-9 px-3 rounded-lg border border-[#EDEDED] text-xs text-[#757575] hover:bg-[#F5F5F5]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingFile || !fileContent.trim()}
                  className="h-9 px-4 rounded-lg bg-[#151515] hover:bg-black text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
                >
                  {submittingFile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在分块向量化...</span>
                    </>
                  ) : (
                    <>
                      <span>执行切分入库</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 C：就地快捷重新登录 (凭证过期时无感补登) */}
      {quickLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#EDEDED] shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#EDEDED] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-[#F5F5F5]">
                  <LogIn className="w-4 h-4 text-[#151515]" />
                </div>
                <span className="text-sm font-semibold text-[#151515]">登录 RuoYi 账号</span>
              </div>
              <button
                onClick={() => setQuickLoginOpen(false)}
                className="p-1 rounded-md text-[#757575] hover:bg-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickLogin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#757575]">账号</label>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-2 text-xs text-[#151515] focus:outline-none focus:border-[#151515]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#757575]">密码</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-2 text-xs text-[#151515] focus:outline-none focus:border-[#151515]"
                />
              </div>

              {captchaData?.captchaEnabled && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#757575]">图形计算验证码</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="结果"
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value)}
                      className="flex-1 bg-[#FAFAFA] border border-[#EDEDED] rounded-lg px-3 py-2 text-xs text-[#151515] focus:outline-none focus:border-[#151515]"
                    />
                    <div
                      onClick={loadCaptcha}
                      className="h-8 px-2 rounded-lg bg-[#F5F5F5] border border-[#EDEDED] flex items-center justify-center cursor-pointer hover:bg-[#EAEAEA]"
                    >
                      {captchaData.img ? (
                        <img
                          src={`data:image/png;base64,${captchaData.img}`}
                          alt="code"
                          className="h-6 max-w-[80px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-[#757575]">刷新</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full mt-2 h-9 rounded-lg bg-[#151515] hover:bg-black text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loggingIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>立即登录并保存凭据</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
