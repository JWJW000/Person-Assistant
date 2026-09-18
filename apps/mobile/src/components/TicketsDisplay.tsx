import { FC, useState } from 'react';
import { TrainTicket } from '@assistant/contracts';
import { TicketCard } from './TicketCard';
import { ChevronDown, ChevronUp, Train } from 'lucide-react';

interface TicketsDisplayProps {
  tickets: TrainTicket[];
  onViewRoute?: (ticket: TrainTicket) => void;
  defaultVisibleCount?: number;
}

export const TicketsDisplay: FC<TicketsDisplayProps> = ({
  tickets,
  onViewRoute,
  defaultVisibleCount = 3
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!tickets || tickets.length === 0) return null;

  const total = tickets.length;
  const visibleTickets = expanded ? tickets : tickets.slice(0, defaultVisibleCount);
  const remainingCount = total - defaultVisibleCount;
  const isReference = tickets.some((t) => t.scheduleReference);

  return (
    <div className="mt-3 space-y-2 w-full">
      {/* 头部微标签提示 */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-1.5">
          <Train className="w-3.5 h-3.5 text-blue-600" />
          <span>{isReference ? `时刻参考 ${total} 趟（该日期尚未开售）` : `共找到 ${total} 趟车次`}</span>
        </div>
        {!expanded && remainingCount > 0 && (
          <span className="text-[11px] text-slate-400">已按需求精选前 {defaultVisibleCount} 趟</span>
        )}
      </div>

      {/* 车票卡片列表 */}
      <div className="space-y-2">
        {visibleTickets.map((t) => (
          <TicketCard key={t.id} ticket={t} onViewRoute={onViewRoute} />
        ))}
      </div>

      {/* 折叠/展开控制胶囊 */}
      {remainingCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 px-3 bg-white hover:bg-slate-50 active:scale-[0.99] border border-slate-200/80 rounded-xl text-xs font-semibold text-blue-600 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>收起车次列表（仅显示前 {defaultVisibleCount} 趟）</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>展开查看其余 {remainingCount} 趟车次时刻与票价</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
