import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Bookmark, Calendar, ArrowRight } from 'lucide-react';
import { TicketQuery } from '@assistant/contracts';

interface FavoriteItem {
  id: string;
  name: string;
  query: TicketQuery;
  snapshot_result_id: string | null;
  created_at: string;
}

export const FavoritesPage: React.FC<{ onSelectQuery?: (q: TicketQuery) => void }> = ({
  onSelectQuery
}) => {
  const { serverUrl, deviceToken } = useAppStore();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/v1/favorites`, {
        headers: { Authorization: `Bearer ${deviceToken}` }
      });
      const data = await res.json();
      if (data?.items) {
        setFavorites(data.items);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F2F2F7]">
      <div className="safe-top bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 sticky top-0 z-10 flex items-center gap-2">
        <Bookmark className="text-blue-600 w-5 h-5" />
        <span className="font-bold text-base text-slate-800">我的收藏与快照</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {favorites.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <span className="text-sm">暂无收藏的查询路线</span>
            <span className="text-xs text-slate-400">在车票列表中点击书签图标即可收藏路线</span>
          </div>
        )}

        {favorites.map((fav) => (
          <div
            key={fav.id}
            onClick={() => onSelectQuery && onSelectQuery(fav.query)}
            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-2 cursor-pointer active:scale-98 transition-transform"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800 text-sm">{fav.name}</span>
              <span className="text-slate-400">{fav.created_at.slice(0, 10)}</span>
            </div>

            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 py-1">
              <span>{fav.query.from.name}</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <span>{fav.query.to.name}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>{fav.query.date}</span>
              {fav.query.trainTypes.length > 0 && (
                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                  {fav.query.trainTypes.join('/')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
