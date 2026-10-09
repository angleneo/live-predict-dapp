'use client';

import { useMemo } from 'react';
import { useChannel, useTopicSubscription } from './useChannel';
import {
  bookChannel,
  chatBuffer,
  chatVersionChannel,
  liveStatsChannel,
  oddsChannel,
  realtimeStateChannel,
  seriesChannel,
  tradesBuffer,
  tradesVersionChannel,
} from '@/lib/realtime';
import { useCatalogMarket } from './useMarkets';
import { outcomePrice } from '@/lib/realtime/topics';
import type { Market, OddsSnapshot, OrderBookSnapshot, OutcomeKey, PricePoint, TradeTick } from '@/types';
import type { LiveStats } from '@/lib/realtime/topics';

export function useRealtimeState() {
  return useChannel(realtimeStateChannel);
}

export function useOdds(marketId: string): OddsSnapshot {
  const ch = useMemo(() => oddsChannel(marketId), [marketId]);
  useTopicSubscription(ch.key);
  return useChannel(ch);
}

export function useOrderBook(marketId: string, outcome: OutcomeKey): OrderBookSnapshot {
  const ch = useMemo(() => bookChannel(marketId, outcome), [marketId, outcome]);
  useTopicSubscription(ch.key);
  return useChannel(ch);
}

export function usePriceSeries(marketId: string): PricePoint[] {
  const ch = useMemo(() => seriesChannel(marketId), [marketId]);
  useTopicSubscription(ch.key);
  return useChannel(ch);
}

export interface TradeFeedState {
  /** 版本号：仅用于驱动重渲染，数据本体在 RingBuffer 里（稳定引用） */
  version: number;
  items: readonly TradeTick[];
}

export function useTrades(marketId: string): TradeFeedState {
  const versionCh = useMemo(() => tradesVersionChannel(marketId), [marketId]);
  useTopicSubscription(versionCh.key);
  const version = useChannel(versionCh);
  const buffer = useMemo(() => tradesBuffer(marketId), [marketId]);
  return { version, items: buffer.items };
}

export function useChat(liveId: string) {
  const versionCh = useMemo(() => chatVersionChannel(liveId), [liveId]);
  useTopicSubscription(versionCh.key);
  const version = useChannel(versionCh);
  const buffer = useMemo(() => chatBuffer(liveId), [liveId]);
  return { version, items: buffer.items };
}

export function useLiveStats(liveId: string): LiveStats {
  const ch = useMemo(() => liveStatsChannel(liveId), [liveId]);
  useTopicSubscription(ch.key);
  return useChannel(ch);
}

/** 某个市场的实时中间价（订单簿中值），用于交易面板的默认价格 */
export function useMarketMid(market: Market | undefined, outcome: OutcomeKey) {
  const odds = useOdds(market?.id ?? '__none__');
  const book = useOrderBook(market?.id ?? '__none__', outcome);
  return useMemo(() => {
    if (!market) return 0.5;
    if (book.mid > 0 && book.mid < 1) return book.mid;
    const base = outcomePrice(market, outcome);
    return outcome === 'yes' ? odds.yes || base : odds.no || base;
  }, [book.mid, market, odds.no, odds.yes, outcome]);
}

/** 挂载时才创建（但未订阅）的市场目录访问，保持 SSR 一致 */
export function useMarket(id: string | undefined) {
  return useCatalogMarket(id);
}
