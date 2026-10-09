'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Info, Users } from 'lucide-react';
import { LivePlayer } from '@/components/live/LivePlayer';
import { LiveChat } from '@/components/live/LiveChat';
import { OddsStrip } from '@/components/market/OddsStrip';
import { PriceChart } from '@/components/market/PriceChart';
import { TradePanel } from '@/components/trade/TradePanel';
import { OrderBookPanel } from '@/components/trade/OrderBookPanel';
import { Panel, Pill, Stat } from '@/components/common/Panel';
import { Countdown } from '@/components/common/Countdown';
import { MarketCard } from '@/components/market/MarketCard';
import { useCatalogLive, useMarketsOfLive } from '@/hooks/useMarkets';
import { useLiveStats, useOdds, useTrades } from '@/hooks/useMarketFeed';
import { useTradeStore } from '@/store/tradeStore';
import { cn, formatCompact, formatShares, formatUsd, toCents } from '@/lib/utils';
import type { Market, OutcomeKey } from '@/types';

/**
 * 直播间 —— 直播内容与交易终端同屏
 * ---------------------------------------------------------------------------
 * 布局按「更新频率」分区而不是按视觉分区：
 * - 左列：直播流 + 弹幕（高频、独立调度，播放器自带跳帧绘制）
 * - 中列：K 线 + 事件信息（中低频，2s 采样）
 * - 右列：交易面板 + 订单簿（高频，但只有这一个面板订阅订单簿频道）
 * 因此弹幕刷屏不会引起交易面板重渲染，反之亦然。
 *
 * 注：本组件保持为客户端组件，外层路由页（page.tsx）负责 generateStaticParams
 *    与 Suspense 边界，这样既能静态导出，也能保留 useSearchParams。
 */
export function LiveRoom({ liveId }: { liveId: string }) {
  const searchParams = useSearchParams();
  const live = useCatalogLive(liveId);
  const liveMarkets = useMarketsOfLive(liveId);
  const stats = useLiveStats(liveId);

  const initialMarketId = searchParams.get('market');
  const [marketId, setMarketId] = useState<string | undefined>(initialMarketId ?? liveMarkets[0]?.id);

  useEffect(() => {
    if (initialMarketId && initialMarketId !== marketId) setMarketId(initialMarketId);
    // 只在 URL 明确指定时同步，避免与用户手动切换冲突
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMarketId]);

  const market: Market | undefined = useMemo(
    () => liveMarkets.find((item) => item.id === marketId) ?? liveMarkets[0],
    [liveMarkets, marketId],
  );

  if (!live || !market) {
    return (
      <div className="py-20 text-center text-xs text-muted">
        未找到该直播间。
        <Link href="/" className="ml-1 text-brand-soft hover:underline">
          返回广场
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost h-8 px-2 py-1 text-[11px]">
          <ArrowLeft className="h-3.5 w-3.5" />
          直播间列表
        </Link>
        <div className="min-w-0">
          <h1 className="line-clamp-1 text-sm font-medium text-slate-100">{live.title}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            <span>{live.streamer}</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="num">{formatCompact(stats.viewers)}</span>
            </span>
            <Pill tone="live">直播中</Pill>
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_360px]">
        {/* 左列：直播 + 弹幕 */}
        <div className="flex min-w-0 flex-col gap-4">
          <LivePlayer live={live} className="aspect-video w-full" />
          <Panel
            title="事件现场"
            extra={<span className="text-[11px] text-muted">{liveMarkets.length} 个市场</span>}
            bodyClassName="space-y-3"
          >
            <p className="text-sm leading-relaxed text-slate-200">{market.question}</p>
            <OddsStrip market={market} />
            <div className="flex flex-wrap gap-2">
              {liveMarkets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMarketId(item.id)}
                  className={cn(
                    'chip max-w-full truncate',
                    item.id === market.id ? 'border-brand/50 text-slate-100' : 'hover:text-slate-200',
                  )}
                >
                  {item.question}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="实时弹幕" bodyClassName="" className="min-h-[360px]">
            <LiveChat liveId={liveId} className="h-[360px]" />
          </Panel>
        </div>

        {/* 中列：走势 + 事件信息 */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="赔率走势" extra={<span className="text-[11px] text-muted">YES / NO 概率</span>}>
            <PriceChart market={market} height={230} />
          </Panel>

          <Panel title="事件信息" bodyClassName="grid grid-cols-2 gap-4">
            <Stat label="市场状态" value={market.status === 'live' ? '进行中' : '未开始'} />
            <Stat label="剩余时间" value={<Countdown endsAt={market.endsAt} />} />
            <Stat label="流动性" value={formatUsd(market.liquidity)} />
            <Stat label="24h 成交量" value={formatUsd(market.volume24h)} />
            <div className="col-span-2 flex items-start gap-1.5 rounded-lg border border-line bg-bg-soft p-2 text-[11px] leading-relaxed text-muted">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                结算价：判断正确 1.00 USDC / 份，错误 0.00。结算依据直播画面与官方回放，争议以平台公告为准。
              </span>
            </div>
          </Panel>

          <TradesBrief market={market} />

          <Panel title="同场其他事件" bodyClassName="grid gap-3 sm:grid-cols-2">
            {liveMarkets
              .filter((item) => item.id !== market.id)
              .map((item) => (
                <MarketCard key={item.id} market={item} compact />
              ))}
            {liveMarkets.length <= 1 ? (
              <p className="text-[11px] text-muted">本场直播目前只有 1 个在售事件。</p>
            ) : null}
          </Panel>
        </div>

        {/* 右列：交易 + 订单簿 */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="买入 / 卖出" bodyClassName="" className="shrink-0">
            <TradePanel market={market} />
          </Panel>
          <Panel title="订单簿" bodyClassName="" extra={<span className="text-[11px] text-muted">点击价位填入限价</span>}>
            <OrderBookPanel
              market={market}
              className="h-[520px]"
              onPickPrice={(outcome: OutcomeKey, price: number) =>
                useTradeStore.getState().setForm(market.id, {
                  outcome,
                  orderType: 'limit',
                  limitPrice: price.toFixed(2),
                })
              }
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** 最近成交摘要（订阅 trades 版本号频道） */
function TradesBrief({ market }: { market: Market }) {
  const odds = useOdds(market.id);
  const { items } = useTrades(market.id);
  const recent = items.slice(-6).reverse();

  return (
    <Panel
      title="最近成交"
      extra={
        <span className="num text-[11px] text-muted">
          中间价 {toCents((odds.yes + odds.no) / 2).toFixed(1)}¢
        </span>
      }
      bodyClassName="space-y-1"
    >
      {recent.length === 0 ? <p className="text-[11px] text-muted">等待成交…</p> : null}
      {recent.map((tick) => (
        <div key={tick.id} className="flex items-center justify-between text-[11px]">
          <span className={cn('num', tick.side === 'buy' ? 'text-bull' : 'text-bear')}>
            {tick.side === 'buy' ? '买入' : '卖出'} {tick.outcome === 'yes' ? 'YES' : 'NO'}
          </span>
          <span className="num text-slate-300">{toCents(tick.price).toFixed(1)}¢</span>
          <span className="num text-muted">{formatShares(tick.size, 0)} 份</span>
          <span className="num text-muted">
            {new Date(tick.ts).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
        </div>
      ))}
    </Panel>
  );
}
