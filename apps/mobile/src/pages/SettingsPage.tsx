import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import {
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getInstalledVersion,
  isAndroidApp,
  fetchUpdateManifest,
  isNewer,
} from '../updater';

export const SettingsPage: React.FC = () => {
  const { serverUrl, currentUser, activeKbId, knowledgeBases, activeModelId, chatModels, logout } =
    useAppStore();
  const [appVersion, setAppVersion] = useState<string>('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState('');
  const [updateStatusType, setUpdateStatusType] = useState<'info' | 'success' | 'error' | ''>('');

  useEffect(() => {
    if (isAndroidApp()) {
      getInstalledVersion().then((info) => {
        if (info) setAppVersion(`v${info.versionName} (${info.versionCode})`);
      });
    }
  }, []);

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);
  const selectedModel = chatModels.find((m) => m.id === activeModelId);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatusText('');
    setUpdateStatusType('info');

    // 优先通过事件通知 UpdateBanner 处理原生安装流程
    window.dispatchEvent(new Event('assistant:check-update'));

    try {
      const [installed, remote] = await Promise.all([
        getInstalledVersion(),
        fetchUpdateManifest(serverUrl),
      ]);

      if (!remote) {
        setUpdateStatusType('error');
        setUpdateStatusText('无法连接到更新服务器，请检查网络或稍后重试');
        return;
      }

      if (isNewer(remote, installed)) {
        setUpdateStatusType('success');
        setUpdateStatusText(`发现新版本 v${remote.version}！请查看顶部提示进行更新`);
      } else {
        setUpdateStatusType('success');
        const currentVerStr = installed?.versionName ? `v${installed.versionName}` : appVersion || '当前版本';
        setUpdateStatusText(`当前已是最新版本 (${currentVerStr})，无需更新`);
      }
    } catch (err: any) {
      setUpdateStatusType('error');
      setUpdateStatusText(err?.message || '检查更新失败，请稍后重试');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-[#151515] antialiased overflow-hidden relative">
      {/* 顶部标题栏 (固定在顶部，不随内容滚动) */}
      <header className="safe-top bg-white border-b border-[#EDEDED] px-4 py-3 flex-shrink-0 z-20">
        <h1 className="text-base font-semibold text-[#151515] tracking-tight">
          系统与账号配置
        </h1>
      </header>

      {/* 核心滚动区域 (独占剩余高度，支持触控平滑惯性滚动，底部留足 pb-36 间距确保更新按钮完全高于底栏) */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-36 overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="space-y-4 max-w-lg mx-auto w-full">
          {/* 账号卡片 */}
          <div className="bg-white border border-[#EDEDED] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#151515]">
                  {currentUser || 'admin'}
                </span>
                <span className="text-xs text-[#757575] flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#151515]" />
                  Sa-Token 凭据有效
                </span>
              </div>

              <button
                onClick={() => {
                  if (confirm('确定退出当前登录账号吗？')) {
                    logout();
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#EDEDED] hover:border-[#FFCCC7] hover:bg-[#FFF1F0] hover:text-[#CF1322] text-xs text-[#757575] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>退出登录</span>
              </button>
            </div>
          </div>

          {/* 当前活跃大模型与中转站 */}
          <div className="bg-white border border-[#EDEDED] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono text-[#A5A5A5] uppercase tracking-wider">
              <span>ACTIVE LLM & RELAY</span>
              <span>{chatModels.length} 个模型已接入</span>
            </div>

            <div className="p-3 bg-[#FAFAFA] border border-[#EDEDED] rounded-lg flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#151515]">
                  {selectedModel ? selectedModel.name : 'DeepSeek V4 Pro'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EDEDED] text-[#151515]">
                  newapi.5wjw.cn
                </span>
              </div>
              <span className="text-xs font-mono text-[#757575]">
                模型标识: {selectedModel ? selectedModel.modelName : 'deepseek-v4-pro'}
              </span>
            </div>
          </div>

          {/* 知识底座状态 */}
          <div className="bg-white border border-[#EDEDED] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#A5A5A5] uppercase tracking-wider">
              <span>ACTIVE KNOWLEDGE BASE</span>
              <span>{knowledgeBases.length} 个可用</span>
            </div>

            <div className="p-3 bg-[#FAFAFA] border border-[#EDEDED] rounded-lg flex flex-col gap-1">
              <span className="text-xs font-medium text-[#151515]">
                {selectedKb ? selectedKb.name : '全能通用对话 (无挂载)'}
              </span>
              <span className="text-xs text-[#757575] leading-normal">
                {selectedKb
                  ? selectedKb.description || `切片大小 ${selectedKb.chunkSize || 500} 字符`
                  : '可在对话页面的顶部下拉框中随时关联具体的知识库。'}
              </span>
            </div>
          </div>

          {/* 基础设施与向量规格 */}
          <div className="bg-white border border-[#EDEDED] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-3">
            <div className="text-xs font-mono text-[#A5A5A5] uppercase tracking-wider">
              INFRASTRUCTURE SPEC
            </div>

            <div className="flex flex-col gap-2 divide-y divide-[#EDEDED] text-xs">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#757575]">向量数据库</span>
                <span className="font-mono font-medium text-[#151515]">PostgreSQL 16 (pgvector)</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#757575]">向量嵌入模型</span>
                <span className="font-mono font-medium text-[#151515]">阿里百炼 text-embedding-v2</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#757575]">向量维度</span>
                <span className="font-mono text-[#151515]">1536 维 (L2 归一化)</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#757575]">API 网关</span>
                <span className="font-mono text-[#757575] truncate max-w-[200px]">{serverUrl}</span>
              </div>
            </div>
          </div>

          {/* 客户端更新 */}
          <div className="bg-white border border-[#EDEDED] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#A5A5A5] uppercase tracking-wider">
              <span>CLIENT VERSION</span>
              <span className="text-xs font-mono text-[#151515] font-medium">{appVersion || 'v0.9.8'}</span>
            </div>

            <button
              onClick={handleManualCheckUpdate}
              disabled={checkingUpdate}
              className="w-full h-10 px-4 rounded-lg bg-[#FAFAFA] active:bg-[#EDEDED] hover:bg-[#F5F5F5] border border-[#EDEDED] text-xs font-medium text-[#151515] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#757575] ${checkingUpdate ? 'animate-spin text-blue-600' : ''}`} />
              <span>{checkingUpdate ? '正在检查最新版本…' : '检查最新版本'}</span>
            </button>

            {updateStatusText && (
              <div className={`text-xs p-2.5 rounded-lg border leading-relaxed flex items-start gap-2 ${
                updateStatusType === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                updateStatusType === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                'bg-[#F5F5F5] text-[#757575] border-[#EDEDED]'
              }`}>
                {updateStatusType === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : updateStatusType === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                ) : null}
                <span>{updateStatusText}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
