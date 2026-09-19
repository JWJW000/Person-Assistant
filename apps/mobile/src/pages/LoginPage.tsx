import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { fetchCaptcha, loginWithRuoYi, CaptchaData } from '../lib/auth';
import { Sparkles, Shield, RefreshCw, User, Lock, Server } from 'lucide-react';

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
    <div className="safe-top safe-bottom flex flex-col items-center justify-center min-h-screen px-6 bg-[#F2F2F7]">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4 border border-slate-200/60">
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">AI 智能助手与知识库</h1>
          <p className="text-xs text-slate-400 text-center">
            支持 RuoYi-Vue-Plus 账号登录与 pgvector 语义检索
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3 mt-1">
          {/* 用户名 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              账号
            </label>
            <input
              type="text"
              placeholder="请输入用户名"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              密码
            </label>
            <input
              type="password"
              placeholder="请输入密码"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {/* 图形验证码 */}
          {captchaData?.captchaEnabled && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                验证码
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="计算结果"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                />
                <div
                  onClick={loadCaptcha}
                  className="h-10 px-2 rounded-xl bg-slate-100 flex items-center justify-center cursor-pointer border border-slate-200 hover:bg-slate-200/70 transition-colors overflow-hidden relative"
                  title="点击刷新验证码"
                >
                  {loadingCaptcha ? (
                    <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : captchaData.img ? (
                    <img
                      src={`data:image/png;base64,${captchaData.img}`}
                      alt="captcha"
                      className="h-8 max-w-[100px] object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">刷新</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 服务器地址 */}
          <div className="flex flex-col gap-1 pt-1">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Server className="w-3 h-3 text-slate-400" />
              服务器地址
            </label>
            <input
              type="text"
              className="w-full bg-slate-50/70 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-600 font-mono focus:outline-none focus:border-blue-500"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/70 text-rose-600 text-xs text-center font-medium leading-tight">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all mt-2 shadow-sm shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                正在登录...
              </>
            ) : (
              '登录账号'
            )}
          </button>
        </form>

        {onSwitchToPairing && (
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onSwitchToPairing}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              使用设备配对码登录 &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
