import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorCardProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = '上游服务提示',
  message,
  code,
  onRetry
}) => {
  return (
    <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 my-2 flex flex-col gap-2.5 text-slate-800 shadow-sm">
      <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
        <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600" />
        <span>{title}</span>
        {code && (
          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-mono">
            {code}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-600 leading-relaxed pl-7">
        {message}
      </p>

      {onRetry && (
        <div className="flex justify-end pt-1">
          <button
            onClick={onRetry}
            className="flex items-center gap-1 bg-white border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-medium text-amber-800 hover:bg-amber-100/50 active:scale-95 transition-all shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新查询</span>
          </button>
        </div>
      )}
    </div>
  );
};
