import React from 'react';
import { X } from 'lucide-react';

export interface RouteStation {
  stationNo: number;
  stationName: string;
  arriveTime: string;
  departureTime: string;
  stopoverTime: string;
}

interface RouteModalProps {
  trainCode: string;
  stations: RouteStation[];
  isOpen: boolean;
  onClose: () => void;
}

export const RouteModal: React.FC<RouteModalProps> = ({
  trainCode,
  stations,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs transition-opacity">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        {/* 头部 */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-blue-600 tracking-wide">{trainCode}</span>
            <span className="text-xs text-slate-500 font-medium">经停站时刻表</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 列表区域 */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {stations.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              暂无经停站详细数据
            </div>
          ) : (
            stations.map((s, index) => {
              const isFirst = index === 0;
              const isLast = index === stations.length - 1;

              return (
                <div key={s.stationNo} className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-3 w-1/3">
                    <span className="w-5 text-slate-400 font-mono text-[10px]">{s.stationNo}</span>
                    <span className={`font-semibold ${isFirst || isLast ? 'text-blue-600' : 'text-slate-800'}`}>
                      {s.stationName}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-600">
                    <span className="font-mono">{s.arriveTime} 到</span>
                    <span className="font-mono">{s.departureTime} 发</span>
                  </div>

                  <div className="text-slate-400 text-right w-16">
                    {isFirst ? '始发站' : isLast ? '终点站' : s.stopoverTime}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl active:scale-98 transition-transform"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
