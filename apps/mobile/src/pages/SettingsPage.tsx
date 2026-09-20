import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import {
  ArrowLeft,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  BookOpen,
  Smartphone,
  Server,
} from 'lucide-react';
import {
  getInstalledVersion,
  isAndroidApp,
  fetchUpdateManifest,
  isNewer,
} from '../updater';

interface SettingsPageProps {
  onBack?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
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

    window.dispatchEvent(new Event('assistant:check-update'));

    try {
      const [installed, remote] = await Promise.all([
        getInstalledVersion(),
        fetchUpdateManifest(serverUrl),
      ]);

      if (!remote) {
        setUpdateStatusType('error');
        setUpdateStatusText('无法连接到更新服务器，请检查网络后重试');
        return;
      }

      if (isNewer(remote, installed)) {
        setUpdateStatusType('success');
        setUpdateStatusText(`发现新版本 v${remote.version}，请在顶部横幅下载更新`);
      } else {
        setUpdateStatusType('success');
        const currentVerStr = installed?.versionName ? `v${installed.versionName}` : appVersion || 'v0.9.8';
        setUpdateStatusText(`当前已是最新版本 (${currentVerStr})`);
      }
    } catch (err: any) {
      setUpdateStatusType('error');
      setUpdateStatusText(err?.message || '检查更新失败，请稍后重试');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const userInitial = (currentUser || 'A').slice(0, 1).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-900 antialiased overflow-hidden relative">
      {/* 顶部标题栏 */}
      <header className="safe-top bg-white/95 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 flex-shrink-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1 rounded-xl text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                title="返回问答"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              系统设置
            </h1>
          </div>
      </header>

      {/* 核心滚动区域 */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-36 overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="space-y-4 max-w-lg mx-auto w-full">
          {/* 分组 1：当前账号信息 */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                {userInitial}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">
                  {currentUser || 'admin'}
                </span>
                <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  已登录
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm('确定退出当前登录账号吗？')) {
                  logout();
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 text-xs text-slate-600 font-medium transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>退出登录</span>
            </button>
          </div>

          {/* 分组 2：AI 引擎与知识底座 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 px-2 tracking-wide">
              AI 助手配置
            </span>
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs divide-y divide-slate-100 overflow-hidden">
              {/* 当前默认模型 */}
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">当前对话模型</span>
                    <span className="text-[11px] text-slate-400">可在对话界面随时快速切换</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    {selectedModel ? selectedModel.name : 'DeepSeek V4 Pro'}
                  </span>
                </div>
              </div>

              {/* 关联知识库 */}
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">默认知识底座</span>
                    <span className="text-[11px] text-slate-400">智能问答时优先召回匹配</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    {selectedKb ? selectedKb.name : '全能通用对话'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 分组 3：应用与系统 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 px-2 tracking-wide">
              系统与更新
            </span>
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs divide-y divide-slate-100 overflow-hidden">
              {/* 客户端版本 */}
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">客户端版本</span>
                    <span className="text-[11px] text-slate-400">支持安卓与桌面热更新</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-900">
                  {appVersion || 'v0.9.8'}
                </span>
              </div>

              {/* 服务端连接 */}
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">服务接口连接</span>
                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
                      {serverUrl}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  正常
                </span>
              </div>

              {/* 检查更新操作区 */}
              <div className="p-3.5 flex flex-col gap-2.5">
                <button
                  onClick={handleManualCheckUpdate}
                  disabled={checkingUpdate}
                  className="w-full h-10 px-4 rounded-xl bg-slate-900 hover:bg-black active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? '正在检查最新版本…' : '检查新版本'}</span>
                </button>

                {updateStatusText && (
                  <div className={`text-xs p-3 rounded-xl border leading-relaxed flex items-start gap-2 ${
                    updateStatusType === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                    updateStatusType === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {updateStatusType === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : updateStatusType === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                    ) : null}
                    <span className="font-medium">{updateStatusText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
