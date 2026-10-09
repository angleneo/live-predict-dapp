'use client';

import { cn } from '@/lib/utils';

/** 通用卡片外框：统一边框 / 背景 / 标题栏 */
export function Panel({
  title,
  extra,
  children,
  className,
  bodyClassName,
  dense,
}: {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn('card flex min-h-0 flex-col overflow-hidden', className)}>
      {title ? (
        <header className="card-title">
          <span className="truncate">{title}</span>
          {extra ? <span className="flex shrink-0 items-center gap-2">{extra}</span> : null}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1', dense ? '' : 'p-3', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-bg-soft p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md font-medium transition',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
            value === option.value ? 'bg-brand/20 text-slate-100' : 'text-muted hover:text-slate-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = 'default',
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'up' | 'down';
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span
        className={cn(
          'num text-lg font-semibold',
          tone === 'up' && 'text-bull',
          tone === 'down' && 'text-bear',
          tone === 'default' && 'text-slate-100',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </div>
  );
}

export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'live' | 'up' | 'down' | 'warn' | 'brand';
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-bg-soft text-muted',
    live: 'border-bear/40 bg-bear/10 text-bear',
    up: 'border-bull/40 bg-bull/10 text-bull',
    down: 'border-bear/40 bg-bear/10 text-bear',
    warn: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    brand: 'border-brand/40 bg-brand/10 text-brand-soft',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
