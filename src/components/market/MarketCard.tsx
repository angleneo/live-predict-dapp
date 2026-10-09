'use client';

import Link from 'next/link';
import { memo } from 'react';
import { ArrowUpRight, Flame, Timer } from 'lucide-react';
import { cn, formatCompact, formatUsd } from '@/lib/utils';
import { Countdown } from '@/components/common/Countdown';
import { MiniSparkline } from '@/components/common/MiniSparkline';
import { Pill } from '@/components/common/Panel';
import { useOdds, usePriceSeries } from '@/hooks/useMarketFeed';
import type { Market } from '@/types';

/**
 * 市场卡片
 * 只订阅自身市场的 odds / series 频道，列表滚动时其他卡片不会被行情刷屏带动。
 */
export const MarketCard = memo(function MarketCard({
  market,
  compact,
}: {
  market: Market;
  compact?: boolean;
}) {
  const odds = useOdds(market.id);
  const series = usePriceSeries(market.id);
  const yes = Math.round(odds.yes * 100);

  return (
    <Link
      href={`/live/${market.liveId}?market=${market.id}`}
      className={cn(
        'card group flex flex-col gap-3 p-3 transition hover:border-brand/40 hover:bg-bg-hover',
        compact && 'gap-2 p-2.5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-200 group-hover:text-white">
          {market.question}
        </p>
        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted group-hover:text-brand-soft" />
      </div>

      <div className="flex items-center gap-2">
        <Pill tone={market.status === 'live' ? 'live' : 'neutral'}>
          {market.status === 'live' ? '进行中' : market.status === 'resolved' ? '已结算' : '未开始'}
        </Pill>
        <span className="chip">
          <Timer className="h-3 w-3" />
          <Countdown endsAt={market.endsAt} />
        </span>
        {market.volume24h > 500_000 ? (
          <span className="chip border-amber-400/30 text-amber-300">
            <Flame className="h-3 w-3" />
            热门
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="num text-2xl font-semibold text-bull">{yes}%</span>
          <span className="text-[11px] text-muted">{market.outcomes[0]?.label}</span>
        </div>
        <MiniSparkline points={series} width={compact ? 90 : 120} height={compact ? 26 : 34} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>24h 成交 {formatUsd(market.volume24h)}</span>
        <span>流动性 {formatCompact(market.liquidity)}</span>
      </div>
    </Link>
  );
});
