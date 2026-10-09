'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, formatCents, formatSignedPercent } from '@/lib/utils';
import { useOdds } from '@/hooks/useMarketFeed';
import type { Market, OutcomeKey } from '@/types';

/**
 * 赔率 / 概率条
 * ---------------------------------------------------------------------------
 * 只订阅该市场的 odds 频道：价格跳动时仅这一小块重渲染；
 * 涨跌用短暂的闪烁动画表达，动画本身走 CSS keyframes（合成层），不占用主线程。
 */
export function OddsStrip({ market, className }: { market: Market; className?: string }) {
  const odds = useOdds(market.id);
  const [flash, setFlash] = useState<{ outcome: OutcomeKey; dir: 'up' | 'down' } | null>(null);
  const prevRef = useRef({ yes: odds.yes, no: odds.no });

  useEffect(() => {
    const prev = prevRef.current;
    let next: { outcome: OutcomeKey; dir: 'up' | 'down' } | null = null;
    if (odds.yes !== prev.yes) next = { outcome: 'yes', dir: odds.yes > prev.yes ? 'up' : 'down' };
    else if (odds.no !== prev.no) next = { outcome: 'no', dir: odds.no > prev.no ? 'up' : 'down' };
    prevRef.current = { yes: odds.yes, no: odds.no };
    if (!next) return;
    setFlash(next);
    const timer = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(timer);
  }, [odds.no, odds.yes]);

  const yesPercent = Math.round(odds.yes * 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-9 overflow-hidden rounded-lg border border-line">
        <div
          className="flex items-center justify-between bg-bull/15 px-3 transition-[width] duration-300 ease-out"
          style={{ width: `${yesPercent}%` }}
        >
          <span className="text-xs font-semibold text-bull">{market.outcomes[0]?.label ?? 'YES'}</span>
          <span className="num text-xs text-bull">{yesPercent}%</span>
        </div>
        <div className="flex flex-1 items-center justify-between bg-bear/15 px-3">
          <span className="num text-xs text-bear">{100 - yesPercent}%</span>
          <span className="text-xs font-semibold text-bear">{market.outcomes[1]?.label ?? 'NO'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PriceBox
          label={`${market.outcomes[0]?.label ?? 'YES'} 现价`}
          price={odds.yes}
          delta={odds.dYes}
          tone="bull"
          flash={flash?.outcome === 'yes' ? flash.dir : null}
        />
        <PriceBox
          label={`${market.outcomes[1]?.label ?? 'NO'} 现价`}
          price={odds.no}
          delta={odds.dNo}
          tone="bear"
          flash={flash?.outcome === 'no' ? flash.dir : null}
        />
      </div>
    </div>
  );
}

function PriceBox({
  label,
  price,
  delta,
  tone,
  flash,
}: {
  label: string;
  price: number;
  delta: number;
  tone: 'bull' | 'bear';
  flash: 'up' | 'down' | null;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-bg-soft px-3 py-2',
        flash === 'up' && 'animate-flash-up',
        flash === 'down' && 'animate-flash-down',
      )}
    >
      <div className="text-[11px] text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={cn('num text-lg font-semibold', tone === 'bull' ? 'text-bull' : 'text-bear')}>
          {formatCents(price)}
        </span>
        <span className={cn('num text-[11px]', delta >= 0 ? 'text-bull' : 'text-bear')}>
          {delta === 0 ? '—' : formatSignedPercent(delta, 2)}
        </span>
      </div>
    </div>
  );
}
