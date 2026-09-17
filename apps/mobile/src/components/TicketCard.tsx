import React from 'react';
import { TrainTicket } from '@assistant/contracts';
import { ArrowRight, Bookmark } from 'lucide-react';

interface TicketCardProps {
  ticket: TrainTicket;
  onFavorite?: (ticket: TrainTicket) => void;
  onViewRoute?: (ticket: TrainTicket) => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, onFavorite, onViewRoute }) => {
  return (
    <div
      onClick={() => onViewRoute && onViewRoute(ticket)}
      className="bg-white rounded-2xl p-4 my-2 shadow-sm border border-slate-100 flex flex-col gap-3 cursor-pointer active:scale-98 transition-transform"
    >
      {/* 头部：车次与历时 */}
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-blue-600 tracking-wide">{ticket.trainCode}</span>
          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-sm">点击看经停</span>
        </div>
        <span className="text-slate-400 text-xs">历时 {Math.floor(ticket.durationMinutes / 60)}小时{ticket.durationMinutes % 60}分</span>
        {onFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(ticket);
            }}
            className="text-slate-400 hover:text-amber-500 transition-colors p-1"
          >
            <Bookmark size={18} />
          </button>
        )}
      </div>

      {/* 站点与时刻 */}
      <div className="flex justify-between items-center py-1">
        <div className="flex flex-col">
          <span className="text-xl font-bold text-slate-800">{ticket.departureAt.slice(11, 16)}</span>
          <span className="text-xs text-slate-500 font-medium mt-0.5">{ticket.from.name}</span>
        </div>

        <div className="flex flex-col items-center px-4">
          <ArrowRight className="text-slate-300 w-5 h-5" />
          {ticket.dayDiff > 0 && (
            <span className="text-[10px] text-amber-600 font-semibold mt-1">+{ticket.dayDiff}天</span>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="text-xl font-bold text-slate-800">{ticket.arrivalAt.slice(11, 16)}</span>
          <span className="text-xs text-slate-500 font-medium mt-0.5">{ticket.to.name}</span>
        </div>
      </div>

      {/* 席别与余票 */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-50">
        {ticket.seats.map((seat, i) => {
          const isAvail = seat.availability === 'available';
          const isWait = seat.availability === 'waitlist';
          return (
            <div key={i} className="flex flex-col items-center bg-slate-50 rounded-lg py-1.5 px-1">
              <span className="text-xs text-slate-600">{seat.kind}</span>
              <span
                className={`text-xs font-bold mt-0.5 ${
                  isAvail ? 'text-emerald-600' : isWait ? 'text-amber-600' : 'text-slate-400'
                }`}
              >
                {isAvail ? (seat.count ? `${seat.count}张` : '有票') : isWait ? '候补' : '无票'}
              </span>
              {seat.priceMinor !== null && (
                <span className="text-[10px] text-slate-400 mt-0.5">¥{(seat.priceMinor / 100).toFixed(0)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
