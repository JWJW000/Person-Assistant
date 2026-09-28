import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useAppStore } from '../store';
import { ackTicketWatch, listTicketWatches, type TicketWatch } from '../lib/ticketWatch';

const POLL_MS = 20_000;

export const TicketWatchBanner: React.FC = () => {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const deviceToken = useAppStore((s) => s.deviceToken);
  const [hits, setHits] = useState<TicketWatch[]>([]);

  const refresh = useCallback(async () => {
    if (!serverUrl || !deviceToken) return;
    try {
      const data = await listTicketWatches(serverUrl, deviceToken);
      setHits(data.items.filter((item) => item.status === 'hit' && item.hit));
    } catch {
      // 轮询失败保持上一屏，避免把已看到的放票提醒清掉。
    }
  }, [serverUrl, deviceToken]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (!hits.length) return null;

  const dismiss = async (watch: TicketWatch) => {
    setHits((current) => current.filter((item) => item.id !== watch.id));
    if (!serverUrl || !deviceToken) return;
    try {
      await ackTicketWatch(serverUrl, deviceToken, watch.id);
    } catch {
      void refresh();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex flex-col gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]">
      {hits.map((watch) => {
        const hit = watch.hit!;
        const count = hit.count != null ? `${hit.count}张` : '有票';
        const price = hit.priceMinor != null ? ` ¥${(hit.priceMinor / 100).toFixed(hit.priceMinor % 100 ? 1 : 0)}` : '';
        return (
          <div
            key={watch.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 shadow-lg"
          >
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-emerald-900">
                {hit.trainCode} {hit.seatKind} {count}
                {price}
              </div>
              <div className="mt-0.5 text-xs text-emerald-800">
                {hit.from} → {hit.to} · {hit.departureAt.slice(11, 16)} 出发。仅提醒，不会自动下单。
              </div>
            </div>
            <button
              type="button"
              onClick={() => void dismiss(watch)}
              className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100"
              aria-label="知道了"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
