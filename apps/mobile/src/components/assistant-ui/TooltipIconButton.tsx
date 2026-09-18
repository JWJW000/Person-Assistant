import React, { forwardRef } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

export interface TooltipIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'icon' | 'sm';
}

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = 'top', variant = 'ghost', size = 'default', className, ...props }, ref) => {
    const btn = (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50',
          variant === 'default' && 'bg-blue-600 text-white shadow-xs hover:bg-blue-700',
          variant === 'outline' && 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
          variant === 'ghost' && 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
          size === 'icon' && 'h-8 w-8 p-0',
          size === 'sm' && 'h-7 px-2 text-xs',
          size === 'default' && 'h-9 px-3 text-sm',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip) return btn;

    return (
      <Tooltip.Provider delayDuration={400}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side={side}
              sideOffset={4}
              className="z-50 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-md animate-in fade-in-0 zoom-in-95"
            >
              {tooltip}
              <Tooltip.Arrow className="fill-slate-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }
);

TooltipIconButton.displayName = 'TooltipIconButton';
