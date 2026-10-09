import { mulberry32 } from '@/lib/utils';
import { markets, randomChatText, randomChatUser } from '@/lib/mock/catalog';
import { peekChannel } from './hub';
import {
  TOPIC,
  buildOrderBookLevels,
  ingestBook,
  ingestChat,
  ingestLiveStats,
  ingestOdds,
  ingestTrade,
  type LiveStats,
} from './topics';
import type { OutcomeKey, TradeTick } from '@/types';

const OUTCOMES: OutcomeKey[] = ['yes', 'no'];

/**
 * Mock 实时数据源
 * ---------------------------------------------------------------------------
 * 用途：在还没有后端推送服务时，本地就能跑通「行情 / 订单簿 / 成交 / 弹幕」四路并发，
 *      用于压测渲染性能与验证断线重连、异常回滚等边界场景。
 *
 * 关键点：只在「有订阅者」的频道上产生数据 —— 这既是局部订阅的验证，
 *        也避免为不可见市场白白消耗主线程。
 */
export class MockRealtimeSource {
  private timers: ReturnType<typeof setInterval>[] = [];
  private random = mulberry32(20241009);
  private midByMarket = new Map<string, number>();
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;

    // 行情：500ms 一次随机游走（模拟盘口驱动）
    this.timers.push(setInterval(() => this.tickOdds(), 500));
    // 订单簿：120ms 一次（高频，靠 scheduler 合并到目标帧率）
    this.timers.push(setInterval(() => this.tickBooks(), 120));
    // 成交流：300ms 一次
    this.timers.push(setInterval(() => this.tickTrades(), 300));
    // 弹幕：700ms 一次
    this.timers.push(setInterval(() => this.tickChat(), 700));
    // 直播人气：2s 一次
    this.timers.push(setInterval(() => this.tickStats(), 2000));
  }

  stop() {
    this.running = false;
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [];
  }

  private isSubscribed(key: string) {
    return peekChannel(key)?.hasSubscribers() ?? false;
  }

  private midFor(marketId: string, outcome: OutcomeKey, fallback: number) {
    const key = `${marketId}:${outcome}`;
    const cached = this.midByMarket.get(key);
    if (cached !== undefined) return cached;
    this.midByMarket.set(key, fallback);
    return fallback;
  }

  private tickOdds() {
    for (const market of markets) {
      if (!this.isSubscribed(TOPIC.odds(market.id))) continue;

      const current = market.outcomes.find((o) => o.key === 'yes')?.price ?? 0.5;
      const drift = (this.random() - 0.5) * 0.012;
      const next = Math.min(0.97, Math.max(0.03, current + drift));
      market.outcomes = market.outcomes.map((o) =>
        o.key === 'yes' ? { ...o, price: Number(next.toFixed(4)) } : { ...o, price: Number((1 - next).toFixed(4)) },
      );

      this.midByMarket.set(`${market.id}:yes`, next);
      this.midByMarket.set(`${market.id}:no`, Number((1 - next).toFixed(4)));

      ingestOdds(market.id, { yes: Number(next.toFixed(4)), no: Number((1 - next).toFixed(4)) });
    }
  }

  private tickBooks() {
    for (const market of markets) {
      for (const outcome of OUTCOMES) {
        if (!this.isSubscribed(TOPIC.book(market.id, outcome))) continue;

        const fallback = outcome === 'yes' ? market.outcomes[0]!.price : market.outcomes[1]!.price;
        const mid = this.midFor(market.id, outcome, fallback);
        const { bids, asks } = buildOrderBookLevels(mid, this.random, 11);
        ingestBook(market.id, outcome, { bids, asks, mid, ts: Date.now() }, 'snapshot');
      }
    }
  }

  private tickTrades() {
    const candidates = markets.filter((market) => this.isSubscribed(TOPIC.tradesVersion(market.id)));
    if (!candidates.length) return;

    const market = candidates[Math.floor(this.random() * candidates.length)]!;
    const outcome: OutcomeKey = this.random() > 0.5 ? 'yes' : 'no';
    const fallback = outcome === 'yes' ? market.outcomes[0]!.price : market.outcomes[1]!.price;
    const mid = this.midFor(market.id, outcome, fallback);

    const tick: TradeTick = {
      id: `tk-${Date.now()}-${Math.floor(this.random() * 1e6)}`,
      marketId: market.id,
      outcome,
      side: this.random() > 0.48 ? 'buy' : 'sell',
      price: Number(Math.min(0.99, Math.max(0.01, mid + (this.random() - 0.5) * 0.01)).toFixed(4)),
      size: Number((5 + this.random() * 480).toFixed(1)),
      ts: Date.now(),
    };
    ingestTrade(tick);
  }

  private tickChat() {
    for (const live of liveIds()) {
      if (!this.isSubscribed(TOPIC.chatVersion(live))) continue;
      ingestChat({
        id: `cm-${Date.now()}-${Math.floor(this.random() * 1e6)}`,
        liveId: live,
        user: randomChatUser(this.random),
        avatarSeed: Math.floor(this.random() * 997),
        text: randomChatText(this.random),
        ts: Date.now(),
        tip: this.random() > 0.94 ? Math.round(this.random() * 50) + 1 : undefined,
      });
    }
  }

  private tickStats() {
    for (const live of liveIds()) {
      if (!this.isSubscribed(TOPIC.liveStats(live))) continue;
      const prev = peekChannel<LiveStats>(TOPIC.liveStats(live))?.getSnapshot();
      const base = prev?.viewers ?? 0;
      const drift = Math.round((this.random() - 0.45) * 900);
      ingestLiveStats({
        liveId: live,
        viewers: Math.max(100, base + drift),
        likes: (prev?.likes ?? 0) + Math.floor(this.random() * 60),
        tips: (prev?.tips ?? 0) + (this.random() > 0.8 ? Math.round(this.random() * 50) : 0),
        ts: Date.now(),
      });
    }
  }

  /** 把四路通道的推送节奏做成可观测的统计，便于在 FPS HUD 里展示 */
  stats() {
    return {
      markets: this.midByMarket.size,
      running: this.running,
      timers: this.timers.length,
    };
  }
}

function liveIds() {
  const ids = new Set<string>();
  for (const market of markets) ids.add(market.liveId);
  return Array.from(ids);
}
