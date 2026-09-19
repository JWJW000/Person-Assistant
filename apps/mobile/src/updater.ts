import { Channel, invoke } from '@tauri-apps/api/core';

export interface UpdateManifest {
  version: string;
  versionCode?: number;
  url: string;
  sha256?: string;
  notes?: string;
  pubDate?: string;
  force?: boolean;
}

export interface InstalledVersionInfo {
  versionName: string;
  versionCode: number;
  packageName: string;
  canInstallPackages: boolean;
}

export interface DownloadProgress {
  event: 'progress' | 'finished' | 'error';
  downloaded?: number;
  total?: number;
  fileName?: string;
  message?: string;
}

const PLUGIN = 'plugin:android-updater';

/**
 * 是否运行在 Android 原生容器内（Web 预览/桌面端不提供应用内更新）
 */
export function isAndroidApp(): boolean {
  const internals = (window as any).__TAURI_INTERNALS__;
  if (!internals) return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

export async function getInstalledVersion(): Promise<InstalledVersionInfo | null> {
  if (!isAndroidApp()) return null;
  try {
    return await invoke<InstalledVersionInfo>('plugin:android-updater|get_version_info');
  } catch {
    return null;
  }
}

export async function fetchUpdateManifest(serverUrl: string): Promise<UpdateManifest | null> {
  const cleanServer = serverUrl.replace(/\/+$/, '');
  const candidates = [
    `${cleanServer}/updates/latest.json?t=${Date.now()}`,
    `https://ai.5wjw.cn/updates/latest.json?t=${Date.now()}`,
    `https://train.5wjw.cn/updates/latest.json?t=${Date.now()}`,
  ];

  for (const u of candidates) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith('{')) {
          const data = JSON.parse(text) as UpdateManifest;
          if (data && data.version && data.url) {
            return data;
          }
        }
      }
    } catch (e) {
      console.warn('尝试拉取更新清单失败:', u, e);
    }
  }
  return null;
}

function toVersionCode(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 远端 versionCode 更大，或版本号更高，都算有更新。
 * 读不到本地版本时也提示更新，避免插件失败时误报「已是最新」。
 */
export function isNewer(manifest: UpdateManifest, installed: InstalledVersionInfo | null): boolean {
  if (manifest.force) return true;
  if (!installed) return Boolean(manifest.version && manifest.url);
  const remoteCode = toVersionCode(manifest.versionCode);
  const localCode = toVersionCode(installed.versionCode);
  if (remoteCode > 0 && localCode > 0 && remoteCode > localCode) return true;
  return compareSemver(manifest.version, installed.versionName || '0.0.0') > 0;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function fileNameFromUrl(url: string): string {
  const raw = url.split('/').pop()?.split('?')[0] || 'update.apk';
  return raw.endsWith('.apk') ? raw : `${raw}.apk`;
}

/**
 * 下载 APK 并唤起系统安装器。进度通过 Channel 回传。
 */
export async function downloadAndInstall(
  manifest: UpdateManifest,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) {
    channel.onmessage = (payload) => onProgress(payload);
  }

  await invoke(`${PLUGIN}|download_and_install`, {
    url: manifest.url,
    fileName: fileNameFromUrl(manifest.url),
    sha256: manifest.sha256 || null,
    versionName: manifest.version,
    onEvent: channel
  });
}

/**
 * 用户授予「安装未知应用」权限后，直接安装已下载的 APK
 */
export async function installDownloadedApk(fileName: string): Promise<void> {
  await invoke(`${PLUGIN}|install_downloaded_apk`, { fileName });
}

export function isInstallPermissionError(err: unknown): boolean {
  const message = typeof err === 'string' ? err : (err as any)?.message || '';
  return String(message).includes('INSTALL_PERMISSION_REQUIRED') || String(message).includes('安装未知应用');
}
