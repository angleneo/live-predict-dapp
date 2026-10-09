'use client';

import Link from 'next/link';
import { memo } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { cn, formatCents, formatShares, formatSignedUsd, formatUsd } from '@/lib/utils';
import { useOdds } from '@/hooks/useMarketFeed';
import { useTradeActions } from '@/hooks/useTradeActions';
import { Countdown } from '@/components/common/Countdown';
import type { Market, Position } from '@/types';

/**
 * 持仓行
 * ---------------------------------------------------------------------------
 * 每行独立订阅自己市场的行情频道：某个市场跳动时，只有那一行重渲染，
 * 而不是整张表跟着刷新（这是持仓页最容易踩的性能坑）。
 */
export const PositionRow = memo(
  function PositionRow({ position, market }: { position: Position; market: Market }) {
    const odds = useOdds(market.id);
    const actions = useTradeActions(market);
    const price = position.outcome === 'yes' ? odds.yes : odds.no;
    const value = position.shares * price;
    const cost = position.shares * position.avgPrice;
    const pnl = value - cost;
    const resolved = market.status === 'resolved' && market.winningOutcome === position.outcome;

    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-bg-hover md:grid-cols-[2.4fr_0.7fr_0.9fr_0.8fr_0.9fr_1fr_auto]">
        <div className="min-w-0">
          <Link
            href={`/live/${market.liveId}?market=${market.id}`}
            className="line-clamp-1 text-xs font-medium text-slate-200 hover:text-brand-soft"
          >
            {market.question}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            <span
              className={cn(
                'rounded px-1.5 py-0.5',
                position.outcome === 'yes' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear',
              )}
            >
              {market.outcomes.find((outcome) => outcome.key === position.outcome)?.label ?? position.outcome}
            </span>
            {position.pending ? <span className="text-amber-300">待确认</span> : null}
            <span className="md:hidden">
              市值 {formatUsd(value)} · 盈亏 {formatSignedUsd(pnl)}
            </span>
          </div>
        </div>

        <div className="hidden text-right md:block">
          <div className="num text-xs text-slate-200">{formatShares(position.shares)}</div>
          <div className="text-[10px] text-muted">份额</div>
        </div>

        <div className="hidden text-right md:block">
          <div className="num text-xs text-slate-200">{formatCents(position.avgPrice, 2)}</div>
          <div className="text-[10px] text-muted">均价</div>
        </div>

        <div className="hidden text-right md:block">
          <div className="num text-xs text-slate-200">{formatCents(price, 2)}</div>
          <div className="text-[10px] text-muted">现价</div>
        </div>

        <div className="hidden text-right md:block">
          <div className="num text-xs text-slate-200">{formatUsd(value)}</div>
          <div className="text-[10px] text-muted">市值</div>
        </div>

        <div className="hidden text-right md:block">
          <div className={cn('num text-xs font-medium', pnl >= 0 ? 'text-bull' : 'text-bear')}>{formatSignedUsd(pnl)}</div>
          <div className="text-[10px] text-muted">
            {cost > 0 ? `${((pnl / cost) * 100).toFixed(2)}%` : '—'}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="hidden text-[10px] text-muted lg:block">
            <Countdown endsAt={market.endsAt} />
          </span>
          {resolved ? (
            <button
              type="button"
              className="btn-primary px-2 py-1 text-[11px]"
              onClick={() => actions.claim(market.id, market.onChainId)}
            >
              领取 {formatUsd(position.shares * (1 - position.avgPrice))}
            </button>
          ) : (
            <Link
              href={`/live/${market.liveId}?market=${market.id}`}
              className="btn-ghost px-2 py-1 text-[11px]"
            >
              平仓
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.position.shares === next.position.shares &&
    prev.position.avgPrice === next.position.avgPrice &&
    prev.position.pending === next.position.pending &&
    prev.market.id === next.market.id,
);

export function PositionsTable({
  rows,
  loading,
}: {
  rows: { position: Position; market: Market }[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在同步链上持仓…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="py-10 text-center text-xs text-muted">
        还没有持仓，去
        <Link href="/" className="mx-1 text-brand-soft hover:underline">
          直播广场
        </Link>
        挑一个事件试试。
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="hidden grid-cols-[2.4fr_0.7fr_0.9fr_0.8fr_0.9fr_1fr_auto] gap-3 border-b border-line px-3 py-2 text-[10px] uppercase tracking-wide text-muted md:grid">
        <span>市场</span>
        <span className="text-right">份额</span>
        <span className="text-right">均价</span>
        <span className="text-right">现价</span>
        <span className="text-right">市值</span>
        <span className="text-right">未实现盈亏</span>
        <span className="text-right">操作</span>
      </div>
      <div className="scroll-thin max-h-[520px] overflow-y-auto">
        {rows.map(({ position, market }) => (
          <PositionRow key={`${position.marketId}-${position.outcome}`} position={position} market={market} />
        ))}
      </div>
    </div>
  );
}
