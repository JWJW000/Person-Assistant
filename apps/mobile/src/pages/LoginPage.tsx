import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { fetchCaptcha, loginWithRuoYi, CaptchaData } from '../lib/auth';
import { RefreshCw, ArrowRight } from 'lucide-react';

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
      setError('请输入计算验证码');
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
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 bg-[#FAFAFA] text-[#151515]">
      {/* 极简规范卡片容器 (ui-skills style) */}
      <div className="w-full max-w-sm bg-white border border-[#EDEDED] rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col gap-5">
        {/* 头部标题与说明 */}
        <div className="flex flex-col gap-1 text-left">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#757575] mb-1">
            <span className="w-2 h-2 rounded-full bg-[#151515]" />
            <span>AI Assistant Workspace</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[#151515]">
            账号安全登录
          </h1>
          <p className="text-xs text-[#757575] leading-normal">
            基于 RuoYi-Vue-Plus 与 PostgreSQL pgvector 架构
          </p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          {/* 用户名 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#757575]">
              账号
            </label>
            <input
              type="text"
              placeholder="请输入用户名"
              className="w-full bg-white border border-[#EDEDED] rounded-lg px-3 py-2 text-sm text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#757575]">
              密码
            </label>
            <input
              type="password"
              placeholder="请输入密码"
              className="w-full bg-white border border-[#EDEDED] rounded-lg px-3 py-2 text-sm text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {/* 验证码 */}
          {captchaData?.captchaEnabled && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#757575] flex items-center justify-between">
                <span>验证码</span>
                <span className="text-[10px] text-[#A5A5A5]">算术计算题</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="计算结果"
                  className="flex-1 bg-white border border-[#EDEDED] rounded-lg px-3 py-2 text-sm text-[#151515] placeholder:text-[#A5A5A5] focus:outline-none focus:border-[#151515] transition-colors"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                />
                <div
                  onClick={loadCaptcha}
                  className="h-9 px-2 rounded-lg bg-[#F5F5F5] border border-[#EDEDED] flex items-center justify-center cursor-pointer hover:bg-[#EAEAEA] active:scale-95 transition-all overflow-hidden"
                  title="点击刷新验证码"
                >
                  {loadingCaptcha ? (
                    <RefreshCw className="w-3.5 h-3.5 text-[#757575] animate-spin" />
                  ) : captchaData.img ? (
                    <img
                      src={`data:image/png;base64,${captchaData.img}`}
                      alt="captcha"
                      className="h-7 max-w-[90px] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[#757575]">刷新</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 服务器网关 */}
          <div className="flex flex-col gap-1 pt-1">
            <label className="text-[11px] font-mono text-[#A5A5A5]">
              网关 Base URL
            </label>
            <input
              type="text"
              className="w-full bg-[#F5F5F5] border border-[#EDEDED] rounded-lg px-2.5 py-1 text-xs text-[#757575] font-mono focus:outline-none focus:border-[#151515]"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-[#FFF1F0] border border-[#FFCCC7] text-[#CF1322] text-xs leading-normal">
              {error}
            </div>
          )}

          {/* 纯黑实体主按钮 (Primary Inverse Button) */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 h-10 px-4 rounded-lg bg-[#151515] hover:bg-black text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>正在验证...</span>
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
          <div className="pt-2 text-center border-t border-[#EDEDED]">
            <button
              type="button"
              onClick={onSwitchToPairing}
              className="text-xs text-[#757575] hover:text-[#151515] transition-colors"
            >
              使用设备配对码连接 &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
