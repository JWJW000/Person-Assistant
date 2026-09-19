import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import {
  Settings,
  RefreshCw,
  LogOut,
  User,
  Server,
  DownloadCloud,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { getInstalledVersion, isAndroidApp } from '../updater';

export const SettingsPage: React.FC = () => {
  const { serverUrl, setServerUrl, currentUser, activeKbId, knowledgeBases, logout } =
    useAppStore();
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if (isAndroidApp()) {
      getInstalledVersion().then((info) => {
        if (info) setAppVersion(`v${info.versionName} (${info.versionCode})`);
      });
    }
  }, []);

  const selectedKb = knowledgeBases.find((kb) => kb.id === activeKbId);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] overflow-y-auto">
      {/* 顶部标题栏 */}
      <div className="safe-top bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sticky top-0 z-10">
        <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          系统与账号设置
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 账号信息卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <User className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">{currentUser || '未登录用户'}</span>
                <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sa-Token 认证有效
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm('确定退出当前登录账号吗？')) {
                  logout();
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 active:scale-95 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>退出登录</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">服务网关:</span>
              <span className="font-mono text-slate-700 truncate max-w-[200px]">{serverUrl}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">向量检索底座:</span>
              <span className="text-blue-600 font-medium">PostgreSQL 16 pgvector (1536维)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">默认向量模型:</span>
              <span className="text-slate-700 font-medium">阿里百炼 text-embedding-v2</span>
            </div>
          </div>
        </div>

        {/* 知识库状态卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
              <Database className="w-4 h-4 text-blue-600" />
              <span>当前绑定知识库</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              共 {knowledgeBases.length} 个知识库
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl flex flex-col gap-1 border border-slate-200/60">
            <span className="text-xs font-bold text-slate-800">
              {selectedKb ? selectedKb.name : '🌐 全能通用对话模式 (无指定知识库)'}
            </span>
            <span className="text-[11px] text-slate-400 leading-relaxed">
              {selectedKb
                ? selectedKb.description || `切片大小 ${selectedKb.chunkSize || 500} 字，滑动重叠 ${selectedKb.chunkOverlap || 50} 字`
                : '可在对话界面顶部随时自由切换知识库，开启针对性文档语义问答。'}
            </span>
          </div>
        </div>

        {/* 服务器设置卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <Server className="w-4 h-4 text-blue-600" />
            <span>网关连接配置</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">后端 API 基础地址</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 应用更新与版本 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <DownloadCloud className="w-4 h-4 text-blue-600" />
            <span>客户端版本</span>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl flex items-center justify-between">
            <span>当前客户端版本</span>
            <span className="font-mono text-slate-700">{appVersion || 'v0.9.3 (Web/Tauri)'}</span>
          </div>
          {isAndroidApp() && (
            <button
              onClick={() => window.dispatchEvent(new Event('assistant:check-update'))}
              className="w-full py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl active:scale-98 transition-transform flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              检查更新
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
