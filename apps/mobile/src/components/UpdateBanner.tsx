import React, { useCallback, useEffect, useState } from 'react';
import { Download, X, RefreshCw, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { useAppStore } from '../store';
import {
  UpdateManifest,
  DownloadProgress,
  downloadAndInstall,
  fetchUpdateManifest,
  getInstalledVersion,
  isAndroidApp,
  isInstallPermissionError,
  isNewer
} from '../updater';

type Phase = 'idle' | 'ready' | 'downloading' | 'installing' | 'needPermission' | 'error' | 'upToDate';

export const UpdateBanner: React.FC<{ autoCheck?: boolean }> = ({ autoCheck = true }) => {
  const { serverUrl, deviceToken } = useAppStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(
    async (silent: boolean) => {
      if (!isAndroidApp()) return;
      try {
        const installed = await getInstalledVersion();
        const remote = await fetchUpdateManifest(serverUrl);
        if (!remote) {
          if (!silent) {
            setPhase('error');
            setMessage('无法获取更新信息');
          }
          return;
        }
        if (isNewer(remote, installed)) {
          setManifest(remote);
          setPhase('ready');
          setDismissed(false);
        } else if (!silent) {
          setPhase('upToDate');
          setMessage(
            `当前 v${installed?.versionName || '?'} (${installed?.versionCode ?? '?'})，远端 v${remote.version}${
              remote.versionCode ? ` (${remote.versionCode})` : ''
            }`
          );
        }
      } catch (err: any) {
        if (!silent) {
          setPhase('error');
          setMessage(err?.message || '检查更新失败');
        }
      }
    },
    [serverUrl]
  );

  useEffect(() => {
    if (!autoCheck || !deviceToken) return;
    const timer = setTimeout(() => check(true), 1500);
    return () => clearTimeout(timer);
  }, [autoCheck, deviceToken, check]);

  // 允许设置页手动触发检查
  useEffect(() => {
    const handler = () => {
      setDismissed(false);
      setPhase('idle');
      void check(false);
    };
    window.addEventListener('assistant:check-update', handler);
    return () => window.removeEventListener('assistant:check-update', handler);
  }, [check]);

  const handleUpdate = async () => {
    if (!manifest) return;
    setPhase('downloading');
    setProgress({ downloaded: 0, total: 0 });

    try {
      await downloadAndInstall(manifest, (p: DownloadProgress) => {
        if (p.event === 'progress') {
          setProgress({ downloaded: p.downloaded || 0, total: p.total || 0 });
        } else if (p.event === 'finished') {
          setProgress({ downloaded: p.downloaded || 0, total: p.total || p.downloaded || 0 });
          setPhase('installing');
        } else if (p.event === 'error') {
          setPhase('error');
          setMessage(p.message || '下载失败');
        }
      });
    } catch (err: any) {
      if (isInstallPermissionError(err)) {
        setPhase('needPermission');
        setMessage('请先允许本应用「安装未知应用」，返回后点击重试');
      } else {
        setPhase('error');
        setMessage(String(err?.message || err));
      }
    }
  };

  if (!isAndroidApp()) return null;
  if (dismissed) return null;
  if (phase === 'idle') return null;

  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : 0;

  const shell =
    'mx-3 mt-2 rounded-2xl border px-3 py-2.5 flex items-start gap-2.5 text-xs shadow-sm';
  const tone =
    phase === 'error' || phase === 'needPermission'
      ? 'bg-rose-50 border-rose-100 text-rose-700'
      : phase === 'upToDate'
        ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
        : 'bg-blue-50 border-blue-100 text-blue-700';

  const Icon =
    phase === 'error' || phase === 'needPermission'
      ? AlertCircle
      : phase === 'upToDate'
        ? CheckCircle2
        : Sparkles;

  return (
    <div className={`${shell} ${tone}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {(phase === 'ready' || phase === 'downloading' || phase === 'installing' || phase === 'needPermission') && manifest && (
          <>
            <div className="font-semibold">发现新版本 v{manifest.version}</div>
            {manifest.notes && <div className="mt-0.5 text-[11px] opacity-80">{manifest.notes}</div>}
          </>
        )}

        {phase === 'ready' && (
          <button
            onClick={handleUpdate}
            className="mt-2 inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform"
          >
            <Download className="w-3.5 h-3.5" />
            立即更新
          </button>
        )}

        {phase === 'downloading' && (
          <div className="mt-1.5">
            <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] opacity-80">
              正在下载 {percent}% ({formatBytes(progress.downloaded)}
              {progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ''})
            </div>
          </div>
        )}

        {phase === 'installing' && <div className="mt-1 text-[11px] opacity-80">下载完成，正在唤起系统安装器…</div>}

        {phase === 'needPermission' && (
          <>
            <div className="mt-0.5 text-[11px]">{message}</div>
            <button
              onClick={handleUpdate}
              className="mt-2 inline-flex items-center gap-1 bg-rose-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重试
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="font-semibold">更新失败</div>
            <div className="mt-0.5 text-[11px]">{message}</div>
            <button
              onClick={() => check(false)}
              className="mt-2 inline-flex items-center gap-1 bg-rose-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重新检查
            </button>
          </>
        )}

        {phase === 'upToDate' && <div className="text-[11px]">{message}</div>}
      </div>

      {phase !== 'downloading' && phase !== 'installing' && (
        <button
          onClick={() => setDismissed(true)}
          className="p-1 opacity-60 active:scale-90 transition-transform"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
