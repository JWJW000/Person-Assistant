import React, { useState } from 'react';
import { useAppStore } from '../store';

export const PairingPage: React.FC<{ onPaired: () => void }> = ({ onPaired }) => {
  const { serverUrl, setServerUrl, setDeviceToken } = useAppStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async () => {
    if (!code) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/v1/auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingCode: code.trim(),
          deviceName: 'Android Client'
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || '配对失败');
      }

      setDeviceToken(json.deviceToken);
      onPaired();
    } catch (err: any) {
      setError(err?.message || '连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="safe-top safe-bottom flex flex-col items-center justify-center min-h-screen px-6 bg-[#F2F2F7]">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-slate-800 text-center">设备配对</h1>
        <p className="text-xs text-slate-400 text-center mb-2">
          请输入服务器控制台生成的 6 位配对码
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">服务器地址</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">配对码</label>
          <input
            type="text"
            maxLength={12}
            placeholder="6 位数字配对码"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-lg text-center tracking-widest font-mono text-slate-800 focus:outline-none focus:border-blue-500"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        {error && <div className="text-xs text-rose-500 text-center">{error}</div>}

        <button
          disabled={loading || !code}
          onClick={handlePair}
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all mt-2 active:scale-95"
        >
          {loading ? '配对中...' : '确认连接'}
        </button>
      </div>
    </div>
  );
};
