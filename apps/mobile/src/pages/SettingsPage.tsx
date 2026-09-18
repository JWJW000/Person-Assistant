import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Settings, Shield, Cpu, RefreshCw, LogOut, CheckCircle2, AlertCircle, ChevronDown, ListFilter, DownloadCloud } from 'lucide-react';
import { getInstalledVersion, isAndroidApp } from '../updater';

export const SettingsPage: React.FC = () => {
  const { serverUrl, deviceToken, setDeviceToken } = useAppStore();
  const [appVersion, setAppVersion] = useState<string>('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [modelConfig, setModelConfig] = useState({
    baseUrl: '',
    api: 'openai-completions',
    modelId: '',
    apiKey: '',
    hasKey: false
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'ok' | 'error'; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchCurrentConfig();
    if (isAndroidApp()) {
      getInstalledVersion().then((info) => {
        if (info) setAppVersion(`v${info.versionName} (${info.versionCode})`);
      });
    }
  }, []);

  const fetchCurrentConfig = async () => {
    try {
      const res = await fetch(`${serverUrl}/v1/settings/model`, {
        headers: { Authorization: `Bearer ${deviceToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setModelConfig((prev) => ({
          ...prev,
          baseUrl: data.baseUrl || prev.baseUrl,
          api: data.api || prev.api,
          modelId: data.modelId || prev.modelId,
          hasKey: Boolean(data.hasKey)
        }));
      }
    } catch {
    } finally {
      setConfigLoaded(true);
    }
  };

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch(`${serverUrl}/v1/models/available`, {
        headers: { Authorization: `Bearer ${deviceToken}` }
      });
      const data = await res.json();
      if (data?.items && data.items.length > 0) {
        setAvailableModels(data.items);
      }
    } catch (err: any) {
      alert(`获取模型列表失败: ${err?.message || '网络异常'}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaveSuccess(false);
    try {
      const res = await fetch(`${serverUrl}/v1/settings/model`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`
        },
        body: JSON.stringify({
          baseUrl: modelConfig.baseUrl,
          api: modelConfig.api,
          modelId: modelConfig.modelId,
          apiKey: modelConfig.apiKey || undefined
        })
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('保存失败，请检查参数');
      }
    } catch {
      alert('保存失败，网络异常');
    }
  };

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
    <div className="flex flex-col h-full min-h-0 bg-[#F2F2F7]">
      <div className="safe-top bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 sticky top-0 z-10 flex items-center gap-2">
        <Settings className="text-blue-600 w-5 h-5" />
        <span className="font-bold text-base text-slate-800">系统与模型设置</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 设备与凭据卡片 */}
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

        {/* 模型中转站与自由切换卡片 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>大模型自由切换</span>
            </div>
            <button
              onClick={handleFetchModels}
              disabled={loadingModels}
              className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <ListFilter className="w-3 h-3" />
              <span>{loadingModels ? '拉取中...' : '读取中转站模型'}</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {!configLoaded ? (
              <div className="text-xs text-slate-400 py-6 text-center">正在读取服务器模型配置...</div>
            ) : (
              <>
            {/* 当前选用模型 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">当前活跃模型 (Model ID)</label>
              {availableModels.length > 0 ? (
                <div className="relative">
                  <select
                    value={modelConfig.modelId}
                    onChange={(e) => setModelConfig({ ...modelConfig, modelId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 appearance-none focus:outline-none focus:border-blue-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="手动输入模型名 (如 gpt-4o-mini)"
                  value={modelConfig.modelId}
                  onChange={(e) => setModelConfig({ ...modelConfig, modelId: e.target.value })}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 font-medium">中转站 Base URL</label>
              <input
                type="text"
                placeholder="https://your-relay.example.com/v1"
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
                <option value="openai-completions">OpenAI Completions (/v1/chat/completions)</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic-messages">Anthropic Messages (/v1/messages)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-500 font-medium">API Key (脱敏仅写)</label>
                {modelConfig.hasKey && (
                  <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                    服务器已保存 Key
                  </span>
                )}
              </div>
              <input
                type="password"
                placeholder={modelConfig.hasKey ? '如需修改请输入新 Key，否则留空' : 'sk-...'}
                value={modelConfig.apiKey}
                onChange={(e) => setModelConfig({ ...modelConfig, apiKey: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            {saveSuccess && (
              <div className="text-xs text-emerald-600 bg-emerald-50 p-2 rounded-xl text-center">
                模型配置已成功切换并更新！
              </div>
            )}

            <button
              onClick={handleSaveConfig}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl active:scale-98 transition-transform shadow-xs shadow-blue-200 mt-1"
            >
              保存并应用当前模型
            </button>
              </>
            )}
          </div>
        </div>

        {/* 应用更新卡片 */}
        {isAndroidApp() && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
              <DownloadCloud className="w-4 h-4 text-blue-600" />
              <span>应用更新</span>
            </div>
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">
              当前版本：{appVersion || '读取中...'}
            </div>
            <button
              onClick={() => window.dispatchEvent(new Event('assistant:check-update'))}
              className="w-full py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl active:scale-98 transition-transform flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              检查更新
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
