import React, { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { TicketQuery } from '@assistant/contracts';

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  query: Partial<TicketQuery>;
  onApply: (updated: Partial<TicketQuery>) => void;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({
  isOpen,
  onClose,
  query,
  onApply
}) => {
  const [trainTypes, setTrainTypes] = useState<string[]>(query.trainTypes || []);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(query.onlyAvailable || false);
  const [seatPreference, setSeatPreference] = useState<string>(query.seatPreference || '');
  const [sort, setSort] = useState<'departure' | 'arrival' | 'duration'>(query.sort || 'departure');

  if (!isOpen) return null;

  const toggleType = (t: string) => {
    setTrainTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const handleConfirm = () => {
    onApply({
      trainTypes,
      onlyAvailable,
      seatPreference: seatPreference || undefined,
      sort
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom duration-200">
        {/* 标题 */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-base text-slate-800">车票筛选与排序</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 车型选择 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">车型偏好</span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { code: 'G', label: '高铁(G)' },
              { code: 'D', label: '动车(D)' },
              { code: 'C', label: '城际(C)' },
              { code: 'K', label: '普速(K/Z/T)' }
            ].map((t) => {
              const active = trainTypes.includes(t.code);
              return (
                <button
                  key={t.code}
                  onClick={() => toggleType(t.code)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 席别偏好 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">优先席别</span>
          <div className="grid grid-cols-3 gap-2">
            {['二等座', '一等座', '商务座'].map((seat) => {
              const active = seatPreference === seat;
              return (
                <button
                  key={seat}
                  onClick={() => setSeatPreference(active ? '' : seat)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {seat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 排序方式 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">排序规则</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'departure', label: '出发最早' },
              { id: 'arrival', label: '到达最早' },
              { id: 'duration', label: '历时最短' }
            ].map((s) => {
              const active = sort === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id as any)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 仅看有票开关 */}
        <div className="flex justify-between items-center py-2 px-1 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-700">仅显示有余票的车次</span>
          <button
            onClick={() => setOnlyAvailable(!onlyAvailable)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
              onlyAvailable ? 'bg-blue-600' : 'bg-slate-200'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                onlyAvailable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 确认按钮 */}
        <div className="pt-2 flex gap-3">
          <button
            onClick={() => {
              setTrainTypes([]);
              setOnlyAvailable(false);
              setSeatPreference('');
              setSort('departure');
            }}
            className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-xs active:scale-98 transition-transform"
          >
            重置
          </button>
          <button
            onClick={handleConfirm}
            className="flex-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-xs active:scale-98 transition-transform shadow-sm shadow-blue-200"
          >
            应用筛选
          </button>
        </div>
      </div>
    </div>
  );
};
