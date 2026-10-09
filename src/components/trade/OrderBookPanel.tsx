'use client';

import { memo, useMemo, useState } from 'react';
import { cn, formatCents, formatShares, toCents } from '@/lib/utils';
import { VirtualList } from '@/components/common/VirtualList';
import { Segmented } from '@/components/common/Panel';
import { useOrderBook, useTrades } from '@/hooks/useMarketFeed';
import { useUiStore } from '@/store/uiStore';
import type { Market, OrderBookLevel, OutcomeKey, TradeTick } from '@/types';

/**
 * 订单簿面板
 * ---------------------------------------------------------------------------
 * 高频通道（Mock 源 120ms 一次推送）→ scheduler 合并到目标帧率 → 只重渲染本面板。
 * 价格档位是「只改数值、不改结构」的场景，行组件 memo 后仅数字变化的行重渲染。
 */
export function OrderBookPanel({
  market,
  onPickPrice,
  className,
}: {
  market: Market;
  onPickPrice?: (outcome: OutcomeKey, price: number) => void;
  className?: string;
}) {
  const [outcome, setOutcome] = useState<OutcomeKey>('yes');
  const depth = useUiStore((state) => state.bookDepth);
  const book = useOrderBook(market.id, outcome);
  const { items: trades } = useTrades(market.id);

  const maxCumulative = useMemo(
    () => Math.max(book.bids.at(-1)?.cumulative ?? 1, book.asks.at(-1)?.cumulative ?? 1),
    [book.asks, book.bids],
  );

  const visibleAsks = useMemo(() => book.asks.slice(0, depth).reverse(), [book.asks, depth]);
  const visibleBids = useMemo(() => book.bids.slice(0, depth), [book.bids, depth]);
  const recentTrades = useMemo(() => trades.slice(-12).reverse(), [trades]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Segmented
          size="sm"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'yes', label: market.outcomes[0]?.label ?? 'YES' },
            { value: 'no', label: market.outcomes[1]?.label ?? 'NO' },
          ]}
        />
        <span className="num text-[11px] text-muted">
          价差 {(book.spread * 100).toFixed(1)}¢ · #{book.seq}
        </span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
        <span>价格</span>
        <span className="text-right">数量</span>
        <span className="text-right">累计</span>
      </div>

      <VirtualList
        items={visibleAsks}
        estimateSize={20}
        overscan={4}
        className="h-[152px] shrink-0 px-1"
        getKey={(level) => `ask-${outcome}-${level.price}`}
        emptyText=""
        renderRow={(level) => (
          <BookRow level={level} side="ask" max={maxCumulative} onPick={() => onPickPrice?.(outcome, level.price)} />
        )}
      />

      <div className="flex items-center justify-between border-y border-line bg-bg-soft px-3 py-1.5">
        <span className="num text-sm font-semibold text-slate-100">{formatCents(book.mid)}</span>
        <span className="text-[10px] text-muted">中间价</span>
        <span className="num text-[11px] text-muted">
          买 {formatCents(book.bestBid)} / 卖 {formatCents(book.bestAsk)}
        </span>
      </div>

      <VirtualList
        items={visibleBids}
        estimateSize={20}
        overscan={4}
        className="h-[152px] shrink-0 px-1"
        getKey={(level) => `bid-${outcome}-${level.price}`}
        emptyText=""
        renderRow={(level) => (
          <BookRow level={level} side="bid" max={maxCumulative} onPick={() => onPickPrice?.(outcome, level.price)} />
        )}
      />

      <div className="border-t border-line px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">最近成交</div>
      <VirtualList
        items={recentTrades}
        estimateSize={18}
        overscan={4}
        className="min-h-0 flex-1 px-1 pb-2"
        getKey={(tick) => tick.id}
        emptyText="等待成交…"
        renderRow={(tick) => <TradeRow tick={tick} />}
      />
    </div>
  );
}

const BookRow = memo(
  function BookRow({
    level,
    side,
    max,
    onPick,
  }: {
    level: OrderBookLevel;
    side: 'bid' | 'ask';
    max: number;
    onPick: () => void;
  }) {
    const ratio = Math.min(1, level.cumulative / Math.max(1, max));
    return (
      <button
        type="button"
        onClick={onPick}
        className="relative grid w-full grid-cols-3 px-2 py-[3px] text-left text-[11px] leading-4 hover:bg-bg-hover"
      >
        <span
          className={cn('absolute inset-y-0 right-0 rounded-sm', side === 'bid' ? 'bg-bull/12' : 'bg-bear/12')}
          style={{ width: `${ratio * 100}%` }}
        />
        <span className={cn('num relative z-10', side === 'bid' ? 'text-bull' : 'text-bear')}>
          {toCents(level.price).toFixed(1)}
        </span>
        <span className="num relative z-10 text-right text-slate-300">{formatShares(level.size, 0)}</span>
        <span className="num relative z-10 text-right text-muted">{formatShares(level.cumulative, 0)}</span>
      </button>
    );
  },
  (prev, next) => prev.level.price === next.level.price && prev.level.size === next.level.size && prev.max === next.max,
);

const TradeRow = memo(
  function TradeRow({ tick }: { tick: TradeTick }) {
    return (
      <div className="grid grid-cols-3 gap-1 px-2 py-[2px] text-[11px] leading-4">
        <span className={cn('num', tick.side === 'buy' ? 'text-bull' : 'text-bear')}>{toCents(tick.price).toFixed(1)}</span>
        <span className="num text-right text-slate-300">{formatShares(tick.size, 0)}</span>
        <span className="num text-right text-muted">
          {new Date(tick.ts).toLocaleTimeString('zh-CN', { hour12: false })}
        </span>
      </div>
    );
  },
  (prev, next) => prev.tick.id === next.tick.id,
);
