import React, { useState } from 'react';
import { useAppStore } from '../store';
import { loginWithRuoYi } from '../lib/auth';
import { RefreshCw, ArrowRight, User, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onSwitchToPairing?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onSwitchToPairing }) => {
  const { serverUrl, setAccessToken, setCurrentUser } = useAppStore();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loginWithRuoYi(serverUrl, {
        username: username.trim(),
        password: password,
        tenantId: '000000',
      });

      setAccessToken(result.access_token);
      setCurrentUser(username.trim());
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || '账号或密码错误，请核对');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 bg-[#F8FAFC] text-slate-900 selection:bg-slate-900 selection:text-white">
      {/* 极简高质感卡片容器 */}
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-7 shadow-[0_4px_24px_rgba(15,23,42,0.04)] flex flex-col gap-6">
        {/* 中心应用专属图标与品牌标题 */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="relative group">
            <img
              src="/app-logo.png"
              alt="App Logo"
              className="w-16 h-16 rounded-2xl shadow-sm border border-slate-200/80 object-cover"
            />
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              个人 AI 助手
            </h1>
            <p className="text-xs text-slate-500">
              企业知识库与多模型工作台
            </p>
          </div>
        </div>

        {/* 精简登录表单 (仅账号与密码) */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {/* 账号 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">
              账号
            </label>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="用户名"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/5 transition-all font-medium"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">
              密码
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="登录密码"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/5 transition-all font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs text-center font-medium leading-relaxed animate-in fade-in">
              {error}
            </div>
          )}

          {/* 深黑曜石实体登录主按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 h-11 px-5 rounded-xl bg-slate-900 hover:bg-black text-white text-sm font-semibold transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>正在登录...</span>
              </>
            ) : (
              <>
                <span>登录</span>
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
              切换为设备配对码模式 &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
