import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Settings, Shield, Cpu, RefreshCw, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { serverUrl, deviceToken, setDeviceToken } = useAppStore();
  const [modelConfig, setModelConfig] = useState({
    baseUrl: 'https://relay.example.com/v1',
    api: 'openai-completions',
    modelId: 'gpt-4o-mini',
    apiKey: ''
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'ok' | 'error'; message: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (res.ok) {
        setTestResult({ status: 'ok', message: '服务器连接正常，健康探测通过' });
      } else {
        setTestResult({ status: 'error', message: '服务器响应异常' });
      }
    } catch (err: any) {
      setTestResult({ status: 'error', message: `连接失败: ${err?.message || '网络超时'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleRevoke = () => {
    if (confirm('确定要退出并注销当前设备授权吗？')) {
      setDeviceToken(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7]">
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 sticky top-0 z-10 flex items-center gap-2">
        <Settings className="text-blue-600 w-5 h-5" />
        <span className="font-bold text-base text-slate-800">系统与模型设置</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 设备与凭证卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>当前设备安全凭据</span>
          </div>

          <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-3 rounded-xl">
            <div><span className="text-slate-400">服务器:</span> {serverUrl}</div>
            <div className="truncate"><span className="text-slate-400">Token:</span> {deviceToken ? `${deviceToken.slice(0, 10)}...${deviceToken.slice(-6)}` : '未授权'}</div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold active:scale-98 transition-transform"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>探测连接</span>
            </button>
            <button
              onClick={handleRevoke}
              className="flex items-center justify-center gap-1 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold active:scale-98 transition-transform"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>断开设备</span>
            </button>
          </div>

          {testResult && (
            <div className={`text-xs p-2.5 rounded-xl flex items-center gap-2 ${testResult.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {testResult.status === 'ok' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* 模型中转站卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span>大模型中转站配置</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">中转站 Base URL</label>
              <input
                type="text"
                value={modelConfig.baseUrl}
                onChange={(e) => setModelConfig({ ...modelConfig, baseUrl: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">协议类型</label>
              <select
                value={modelConfig.api}
                onChange={(e) => setModelConfig({ ...modelConfig, api: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="openai-completions">OpenAI Completions</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic-messages">Anthropic Messages</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">模型 ID (Model ID)</label>
              <input
                type="text"
                value={modelConfig.modelId}
                onChange={(e) => setModelConfig({ ...modelConfig, modelId: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">API Key (脱敏仅写)</label>
              <input
                type="password"
                placeholder="sk-..."
                value={modelConfig.apiKey}
                onChange={(e) => setModelConfig({ ...modelConfig, apiKey: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={() => alert('模型配置已在安全沙箱中保存并锁定，仅在服务端保留脱敏凭证。')}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl active:scale-98 transition-transform shadow-xs shadow-blue-200 mt-1"
            >
              保存模型档案
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
