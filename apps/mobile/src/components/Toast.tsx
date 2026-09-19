import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
  };

  return (
    <div className="fixed top-4 inset-x-0 flex justify-center z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="pointer-events-auto max-w-sm mx-4 bg-[#151515] text-white rounded-xl px-3.5 py-2.5 border border-[#262626] shadow-2xl flex items-center gap-2.5 text-xs font-medium">
        {icons[toast.type]}
        <span className="flex-1 leading-normal break-words">{toast.text}</span>
        <button
          onClick={onClose}
          className="p-1 text-[#757575] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
