import { channel } from '@/lib/realtime/hub';
import { oddsChannel } from '@/lib/realtime/topics';
import { scheduleWrite } from '@/lib/realtime/scheduler';
import { computeMetrics, positionKey } from '@/lib/trade/math';
import type { Position } from '@/types';

/**
 * 组合聚合器
 * ---------------------------------------------------------------------------
 * 持仓页需要一个「总市值 / 总盈亏」的数字，它依赖所有持仓市场的实时价格。
 * 如果让组件自己订阅 N 个市场，任何市场跳动都会让整张表重渲染。
 * 这里把聚合逻辑放到 React 之外的模块级订阅者里，对外只暴露一个频道：
 * 组件只订阅 portfolio:summary，每 100ms 最多更新一次。
 */

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  pnlPercent: number;
  positionCount: number;
  marketCount: number;
  pendingCount: number;
  updatedAt: number;
}

const EMPTY: PortfolioSummary = {
  totalValue: 0,
  totalCost: 0,
  unrealizedPnl: 0,
  realizedPnl: 0,
  pnlPercent: 0,
  positionCount: 0,
  marketCount: 0,
  pendingCount: 0,
  updatedAt: 0,
};

export const portfolioSummaryChannel = channel<PortfolioSummary>('portfolio:summary', EMPTY);

interface Tracked {
  key: string;
  position: Position;
  price: number;
  unsubscribe: () => void;
}

const tracked = new Map<string, Tracked>();
let recomputeScheduled = false;

function recompute() {
  recomputeScheduled = false;
  let totalValue = 0;
  let totalCost = 0;
  let realizedPnl = 0;
  let pendingCount = 0;
  const marketIds = new Set<string>();

  for (const entry of tracked.values()) {
    const { position, price } = entry;
    const metrics = computeMetrics(position, price, false, null);
    totalValue += metrics.value;
    totalCost += metrics.cost;
    realizedPnl += position.realizedPnl;
    if (position.pending) pendingCount += 1;
    marketIds.add(position.marketId);
  }

  const unrealizedPnl = totalValue - totalCost;
  portfolioSummaryChannel.set({
    totalValue,
    totalCost,
    unrealizedPnl,
    realizedPnl,
    pnlPercent: totalCost > 0 ? unrealizedPnl / totalCost : 0,
    positionCount: tracked.size,
    marketCount: marketIds.size,
    pendingCount,
    updatedAt: Date.now(),
  });
}

function queueRecompute() {
  if (recomputeScheduled) return;
  recomputeScheduled = true;
  scheduleWrite('portfolio:summary', recompute);
}

/**
 * 用最新持仓列表同步订阅集合：
 * - 新增持仓 → 订阅该市场行情
 * - 移除持仓 → 退订，避免「幽灵订阅」持续消耗主线程
 */
export function syncPortfolio(positions: Position[]) {
  const nextKeys = new Set(positions.map((position) => positionKey(position.marketId, position.outcome)));

  for (const [key, entry] of Array.from(tracked.entries())) {
    if (!nextKeys.has(key)) {
      entry.unsubscribe();
      tracked.delete(key);
    }
  }

  for (const position of positions) {
    const key = positionKey(position.marketId, position.outcome);
    const existing = tracked.get(key);
    if (existing) {
      existing.position = position;
      continue;
    }

    const odds = oddsChannel(position.marketId);
    const price = position.outcome === 'yes' ? odds.getSnapshot().yes : odds.getSnapshot().no;
    const unsubscribe = odds.subscribe(() => {
      const entry = tracked.get(key);
      if (!entry) return;
      const snapshot = odds.getSnapshot();
      entry.price = position.outcome === 'yes' ? snapshot.yes : snapshot.no;
      queueRecompute();
    });
    tracked.set(key, { key, position, price, unsubscribe });
  }

  queueRecompute();
}

export function disposePortfolio() {
  for (const entry of tracked.values()) entry.unsubscribe();
  tracked.clear();
  portfolioSummaryChannel.set(EMPTY);
}

export function usePortfolioSummary() {
  return portfolioSummaryChannel;
}
