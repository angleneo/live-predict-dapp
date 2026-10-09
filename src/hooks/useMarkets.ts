'use client';

import { useMemo } from 'react';
import { CATEGORIES, findLive, findMarket, lives, markets, marketsOfLive } from '@/lib/mock/catalog';
import type { LiveStream, Market } from '@/types';

export { CATEGORIES };

/** 市场目录（静态元数据；实时价格请用 useOdds / useOrderBook） */
export function useMarkets(): Market[] {
  return useMemo(() => markets, []);
}

export function useMarketList(): Market[] {
  return markets;
}

export function useLiveList(): LiveStream[] {
  return lives;
}

export function useCatalogMarket(id: string | number | undefined): Market | undefined {
  return useMemo(() => (id === undefined ? undefined : findMarket(id)), [id]);
}

export function useCatalogLive(id: string | number | undefined): LiveStream | undefined {
  return useMemo(() => (id === undefined ? undefined : findLive(id)), [id]);
}

export function useMarketsOfLive(liveId: string | undefined): Market[] {
  return useMemo(() => (liveId ? marketsOfLive(liveId) : []), [liveId]);
}

/** 首页热榜：按 24h 成交量排序 */
export function useHotMarkets(limit = 5): Market[] {
  return useMemo(() => [...markets].sort((a, b) => b.volume24h - a.volume24h).slice(0, limit), [limit]);
}
