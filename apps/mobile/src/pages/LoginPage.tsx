import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { fetchCaptcha, loginWithRuoYi, CaptchaData } from '../lib/auth';
import { RefreshCw, ArrowRight, User, Lock, ShieldCheck, Server, Sparkles, Terminal } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onSwitchToPairing?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onSwitchToPairing }) => {
  const { serverUrl, setServerUrl, setAccessToken, setCurrentUser } = useAppStore();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [code, setCode] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCaptcha = async () => {
    if (!serverUrl) return;
    setLoadingCaptcha(true);
    try {
      const data = await fetchCaptcha(serverUrl);
      setCaptchaData(data);
      setCode('');
    } catch (err: any) {
      console.warn('获取验证码失败:', err);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, [serverUrl]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名与密码');
      return;
    }
    if (captchaData?.captchaEnabled && !code.trim()) {
      setError('请输入图形验证码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loginWithRuoYi(serverUrl, {
        username: username.trim(),
        password: password.trim(),
        code: code.trim(),
        uuid: captchaData?.uuid || '',
        tenantId: '000000',
      });

      setAccessToken(result.access_token);
      setCurrentUser(username.trim());
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || '登录失败，请核对信息');
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 bg-[#F8FAFC] bg-dot-grid text-slate-900 relative selection:bg-slate-900 selection:text-white">
      {/* 科技硬件级双层边框卡片容器 */}
      <div className="w-full max-w-sm p-2 rounded-3xl bg-white/70 backdrop-blur-xl border border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.03)] ring-1 ring-slate-900/[0.03]">
        <div className="p-6 rounded-[calc(1.5rem-0.25rem)] bg-white flex flex-col gap-5 border border-slate-100">
          {/* 头部品牌与科技 Logo */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative group">
              <div className="w-13 h-13 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg shadow-slate-900/15 transition-transform duration-200 group-hover:scale-105">
                <Sparkles className="w-6 h-6 text-slate-100" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <div className="inline-flex items-center justify-center gap-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                <Terminal className="w-3 h-3 text-slate-500" />
                <span>AI Workspace Enterprise</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                个人智能工作台
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                基于 RuoYi-Vue-Plus 与 PostgreSQL pgvector
              </p>
            </div>
          </div>

          {/* 状态徽章条 */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200/60 text-center font-mono text-[10px]">
            <div className="py-1 px-1 rounded-lg bg-white border border-slate-200/50 text-slate-700 font-medium">
              Sa-Token
            </div>
            <div className="py-1 px-1 rounded-lg bg-white border border-slate-200/50 text-slate-700 font-medium">
              1536维 RAG
            </div>
            <div className="py-1 px-1 rounded-lg bg-white border border-slate-200/50 text-slate-700 font-medium">
              中转站 27核
            </div>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            {/* 账号 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                登录账号
              </label>
              <input
                type="text"
                placeholder="请输入用户名 (如 admin)"
                className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 transition-all font-medium"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            {/* 密码 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                安全密码
              </label>
              <input
                type="password"
                placeholder="请输入登录密码"
                className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 transition-all font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {/* 算术验证码 */}
            {captchaData?.captchaEnabled && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    图形算术验证
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">计算结果</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="输入计算值"
                    className="flex-1 bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 transition-all font-medium"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                  />
                  <div
                    onClick={loadCaptcha}
                    className="h-9.5 px-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center cursor-pointer hover:bg-slate-100 active:scale-95 transition-all overflow-hidden"
                    title="点击刷新验证码"
                  >
                    {loadingCaptcha ? (
                      <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : captchaData.img ? (
                      <img
                        src={`data:image/png;base64,${captchaData.img}`}
                        alt="captcha"
                        className="h-7.5 max-w-[90px] object-contain rounded"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">刷新</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 服务器网关地址 */}
            <div className="flex flex-col gap-1 pt-1">
              <label className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Server className="w-3 h-3 text-slate-400" />
                  API Gateway
                </span>
                <span className="text-[9px] text-slate-500 font-mono">HTTPS SSL</span>
              </label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-slate-900 transition-colors"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-relaxed font-medium">
                {error}
              </div>
            )}

            {/* 深黑曜石实体主按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1.5 h-11 px-5 rounded-xl bg-slate-900 hover:bg-black text-white text-sm font-semibold transition-all duration-200 shadow-md shadow-slate-900/20 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>正在验证并登录...</span>
                </>
              ) : (
                <>
                  <span>登录工作台</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {onSwitchToPairing && (
            <div className="pt-2 text-center border-t border-slate-100">
              <button
                type="button"
                onClick={onSwitchToPairing}
                className="text-xs text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                切换为 6 位设备配对码连接 &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
