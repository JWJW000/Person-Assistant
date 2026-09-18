import React from 'react';
import { TrainTicket } from '@assistant/contracts';
import { ArrowRight, Bookmark, Clock } from 'lucide-react';

interface TicketCardProps {
  ticket: TrainTicket;
  onFavorite?: (ticket: TrainTicket) => void;
  onViewRoute?: (ticket: TrainTicket) => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, onFavorite, onViewRoute }) => {
  const formatTime = (iso: string) => {
    try {
      return iso.slice(11, 16);
    } catch {
      return '--:--';
    }
  };

  const hours = Math.floor(ticket.durationMinutes / 60);
  const minutes = ticket.durationMinutes % 60;

  return (
    <div
      onClick={() => onViewRoute && onViewRoute(ticket)}
      className="bg-white rounded-2xl p-4 my-2.5 shadow-sm border border-slate-200/70 hover:border-blue-200 flex flex-col gap-3.5 cursor-pointer active:scale-[0.99] transition-all relative overflow-hidden group"
    >
      {/* 顶部微亮条装饰 */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500/0 via-blue-500/40 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* 头部：车次与历时 */}
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-lg text-blue-600 tracking-tight">{ticket.trainCode}</span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
              ticket.scheduleReference
                ? 'bg-amber-50 text-amber-700 border-amber-100'
                : 'bg-blue-50 text-blue-600 border-blue-100/60'
            }`}
          >
            {ticket.scheduleReference ? '时刻参考' : '时刻表'}
          </span>
          {(ticket.matchLabels || []).slice(0, 2).map((label) => (
            <span
              key={label}
              className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100"
            >
              {label}
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
          <Clock className="w-3 h-3" />
          <span>{hours > 0 ? `${hours}小时` : ''}{minutes}分</span>
        </div>

        {onFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(ticket);
            }}
            className="text-slate-300 hover:text-amber-500 transition-colors p-1"
            title="收藏此车次"
          >
            <Bookmark size={16} />
          </button>
        )}
      </div>

      {/* 站点与时刻：更对称的视觉排版 */}
      <div className="flex justify-between items-center py-0.5">
        {/* 出发 */}
        <div className="flex flex-col min-w-[70px]">
          <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatTime(ticket.departureAt)}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-600 font-semibold">{ticket.from.name}</span>
          </div>
        </div>

        {/* 历时线与箭头 */}
        <div className="flex flex-col items-center flex-1 px-3">
          <div className="w-full flex items-center gap-1">
            <div className="h-[1px] flex-1 bg-slate-200" />
            <ArrowRight className="text-blue-500 w-3.5 h-3.5 flex-shrink-0" />
            <div className="h-[1px] flex-1 bg-slate-200" />
          </div>
          {ticket.dayDiff > 0 && (
            <span className="text-[10px] text-amber-600 font-bold mt-1 bg-amber-50 px-1.5 py-0.2 rounded">
              +{ticket.dayDiff}天
            </span>
          )}
        </div>

        {/* 到达 */}
        <div className="flex flex-col items-end min-w-[70px]">
          <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatTime(ticket.arrivalAt)}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-600 font-semibold">{ticket.to.name}</span>
          </div>
        </div>
      </div>

      {/* 席别与余票网格 */}
      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100/90">
        {ticket.seats.map((seat, i) => {
          const isAvail = seat.availability === 'available';
          const isWait = seat.availability === 'waitlist';
          return (
            <div
              key={i}
              className={`flex flex-col items-center rounded-xl py-1.5 px-1 transition-colors ${
                isAvail ? 'bg-emerald-50/50 border border-emerald-100/40' : 'bg-slate-50/80 border border-transparent'
              }`}
            >
              <span className="text-[11px] text-slate-500 font-medium">{seat.kind}</span>
              <span
                className={`text-xs font-bold mt-0.5 ${
                  isAvail ? 'text-emerald-600' : isWait ? 'text-amber-600' : 'text-slate-300'
                }`}
              >
                {isAvail ? (seat.count ? `${seat.count}张` : '有票') : isWait ? '候补' : '无票'}
              </span>
              {seat.priceMinor !== null && (
                <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                  ¥{(seat.priceMinor / 100).toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
