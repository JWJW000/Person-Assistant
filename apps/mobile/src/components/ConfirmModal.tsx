import React from 'react';
import { AlertTriangle, LogOut, Trash2, RotateCcw } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  iconType?: 'logout' | 'delete' | 'reset' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  content,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  iconType = 'warning',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const renderIcon = () => {
    switch (iconType) {
      case 'logout':
        return (
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <LogOut className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'delete':
        return (
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'reset':
        return (
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <RotateCcw className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
    }
  };

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
      : variant === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white font-bold'
      : 'bg-slate-900 hover:bg-black text-white font-bold';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[280px] bg-white rounded-3xl p-5 shadow-2xl border border-black/[0.06] text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {renderIcon()}

        <h3 className="text-base font-bold text-slate-900 tracking-tight mb-1.5">
          {title}
        </h3>

        <p className="text-xs text-slate-500 leading-relaxed mb-5 px-1">
          {content}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onCancel}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`w-full py-2.5 px-3 rounded-xl text-xs shadow-xs active:scale-95 transition-all cursor-pointer ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
