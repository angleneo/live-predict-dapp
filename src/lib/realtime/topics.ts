import { channel, peekChannel, RingBuffer, type Channel } from './hub';
import { scheduleWrite } from './scheduler';
import { buildInitialChat, buildInitialSeries, findLive, findMarket } from '@/lib/mock/catalog';
import { mulberry32 } from '@/lib/utils';
import type {
  ChatMessage,
  Market,
  OddsSnapshot,
  OrderBookLevel,
  OrderBookSnapshot,
  OutcomeKey,
  PricePoint,
  RealtimeState,
  TradeTick,
} from '@/types';

/**
 * Topic 层
 * ---------------------------------------------------------------------------
 * 统一管理「频道 key ↔ 数据形态 ↔ 写入策略」，真实 WebSocket 与本地 Mock 源
 * 都通过这里的 ingest 函数写入，保证两条链路的更新语义完全一致。
 */

export const TOPIC = {
  realtimeState: 'sys:realtime',
  odds: (marketId: string) => `market:${marketId}:odds`,
  book: (marketId: string, outcome: OutcomeKey) => `market:${marketId}:book:${outcome}`,
  series: (marketId: string) => `market:${marketId}:series`,
  tradesVersion: (marketId: string) => `market:${marketId}:trades:v`,
  chatVersion: (liveId: string) => `live:${liveId}:chat:v`,
  liveStats: (liveId: string) => `live:${liveId}:stats`,
} as const;

export interface LiveStats {
  liveId: string;
  viewers: number;
  likes: number;
  tips: number;
  ts: number;
}

type Applier = (payload: unknown, op: 'snapshot' | 'delta') => void;

const appliers = new Map<string, Applier>();

/** 频道 + 远端消息应用器 的注册入口 */
function topic<T>(key: string, initial: T, applier?: Applier): Channel<T> {
  const ch = channel(key, initial);
  if (applier && !appliers.has(key)) appliers.set(key, applier);
  return ch;
}

// ---------------------------------------------------------------------------
// 纯函数：价格 / 订单簿生成
// ---------------------------------------------------------------------------

export function outcomePrice(market: Market, outcome: OutcomeKey) {
  const yes = market.outcomes.find((o) => o.key === 'yes')?.price ?? 0.5;
  const base = outcome === 'yes' ? yes : 1 - yes;
  return Number(Math.min(0.98, Math.max(0.02, base)).toFixed(4));
}

export const TICK_SIZE = 0.01;

export function buildOrderBookLevels(mid: number, random: () => number, depth = 11) {
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  let bidCum = 0;
  let askCum = 0;
  for (let i = 0; i < depth; i += 1) {
    const bidPrice = Math.max(TICK_SIZE, mid - TICK_SIZE * (i + 1));
    const askPrice = Math.min(1 - TICK_SIZE, mid + TICK_SIZE * (i + 1));

    const bidSize = Number((80 + random() * 900 * (1 + i * 0.24)).toFixed(1));
    const askSize = Number((80 + random() * 900 * (1 + i * 0.24)).toFixed(1));

    bidCum += bidSize;
    askCum += askSize;

    bids.push({ price: Number(bidPrice.toFixed(4)), size: bidSize, cumulative: Number(bidCum.toFixed(1)) });
    asks.push({ price: Number(askPrice.toFixed(4)), size: askSize, cumulative: Number(askCum.toFixed(1)) });
  }
  return { bids, asks };
}

export function buildInitialBook(market: Market, outcome: OutcomeKey): OrderBookSnapshot {
  const mid = outcomePrice(market, outcome);
  const random = mulberry32(market.onChainId * 31 + (outcome === 'yes' ? 7 : 13));
  const { bids, asks } = buildOrderBookLevels(mid, random);
  return {
    marketId: market.id,
    outcome,
    bids,
    asks,
    bestBid: bids[0]?.price ?? mid,
    bestAsk: asks[0]?.price ?? mid,
    spread: Number(((asks[0]?.price ?? mid) - (bids[0]?.price ?? mid)).toFixed(4)),
    mid: Math.round(mid * 100) / 100,
    ts: Date.now(),
    seq: 0,
  };
}

export function buildInitialOdds(market: Market): OddsSnapshot {
  const yes = outcomePrice(market, 'yes');
  return {
    marketId: market.id,
    yes,
    no: Number((1 - yes).toFixed(4)),
    dYes: 0,
    dNo: 0,
    ts: Date.now(),
    seq: 0,
  };
}

// ---------------------------------------------------------------------------
// 频道：系统状态
// ---------------------------------------------------------------------------

export const realtimeStateChannel = topic<RealtimeState>(TOPIC.realtimeState, {
  status: 'idle',
  source: 'mock',
  attempt: 0,
});

export function markRealtimeState(patch: Partial<RealtimeState>) {
  realtimeStateChannel.update((prev) => ({ ...prev, ...patch }));
}

// ---------------------------------------------------------------------------
// 频道：行情 / 订单簿 / 价格序列
// ---------------------------------------------------------------------------

export function oddsChannel(marketId: string) {
  const market = findMarket(marketId);
  const initial: OddsSnapshot = market
    ? buildInitialOdds(market)
    : { marketId, yes: 0.5, no: 0.5, dYes: 0, dNo: 0, ts: 0, seq: 0 };

  return topic<OddsSnapshot>(TOPIC.odds(marketId), initial, (payload, op) => {
    ingestOdds(marketId, payload as Partial<OddsSnapshot>, op);
  });
}

export function bookChannel(marketId: string, outcome: OutcomeKey) {
  const market = findMarket(marketId);
  const initial: OrderBookSnapshot = market
    ? buildInitialBook(market, outcome)
    : {
        marketId,
        outcome,
        bids: [],
        asks: [],
        bestBid: 0.5,
        bestAsk: 0.5,
        spread: 0,
        mid: 0.5,
        ts: 0,
        seq: 0,
      };

  return topic<OrderBookSnapshot>(TOPIC.book(marketId, outcome), initial, (payload, op) => {
    ingestBook(marketId, outcome, payload as Partial<OrderBookSnapshot>, op);
  });
}

export function seriesChannel(marketId: string) {
  const initial = buildInitialSeries(marketId);
  return topic<PricePoint[]>(TOPIC.series(marketId), initial, (payload) => {
    if (Array.isArray(payload)) {
      seriesChannel(marketId).set(payload as PricePoint[]);
    }
  });
}

// ---------------------------------------------------------------------------
// 频道：成交流 / 聊天（环形缓冲 + 版本号，避免每次追加都重建数组）
// ---------------------------------------------------------------------------

const tradesBuffers = new Map<string, RingBuffer<TradeTick>>();
const tradesVersionChannels = new Map<string, Channel<number>>();

export function tradesBuffer(marketId: string) {
  let buffer = tradesBuffers.get(marketId);
  if (!buffer) {
    buffer = new RingBuffer<TradeTick>(80);
    tradesBuffers.set(marketId, buffer);
  }
  return buffer;
}

export function tradesVersionChannel(marketId: string) {
  let ch = tradesVersionChannels.get(marketId);
  if (!ch) {
    ch = topic<number>(TOPIC.tradesVersion(marketId), 0, (payload) => {
      if (typeof payload === 'number') {
        tradesVersionChannels.get(marketId)?.set(payload);
      }
    });
    tradesVersionChannels.set(marketId, ch);
  }
  return ch;
}

const chatBuffers = new Map<string, RingBuffer<ChatMessage>>();
const chatVersionChannels = new Map<string, Channel<number>>();

export function chatBuffer(liveId: string) {
  let buffer = chatBuffers.get(liveId);
  if (!buffer) {
    buffer = new RingBuffer<ChatMessage>(300);
    for (const message of buildInitialChat(liveId)) buffer.push(message);
    chatBuffers.set(liveId, buffer);
  }
  return buffer;
}

export function chatVersionChannel(liveId: string) {
  let ch = chatVersionChannels.get(liveId);
  if (!ch) {
    ch = topic<number>(TOPIC.chatVersion(liveId), 0, (payload) => {
      if (typeof payload === 'number') {
        chatVersionChannels.get(liveId)?.set(payload);
      }
    });
    chatVersionChannels.set(liveId, ch);
  }
  return ch;
}

export function liveStatsChannel(liveId: string) {
  const live = findLive(liveId);
  const initial: LiveStats = {
    liveId,
    viewers: live?.viewers ?? 0,
    likes: Math.round((live?.viewers ?? 0) * 0.12),
    tips: 0,
    ts: Date.now(),
  };
  return topic<LiveStats>(TOPIC.liveStats(liveId), initial, (payload) => {
    const patch = payload as Partial<LiveStats>;
    ingestLiveStats({ liveId, ...patch });
  });
}

// ---------------------------------------------------------------------------
// Ingest：所有写入都经过「合并 + 限流」，这是掉帧治理的第一道闸门
// ---------------------------------------------------------------------------

let seqCounter = 0;

export function ingestOdds(
  marketId: string,
  patch: Partial<OddsSnapshot>,
  op: 'snapshot' | 'delta' = 'delta',
) {
  const ch = oddsChannel(marketId);
  const key = ch.key;

  scheduleWrite(key, () => {
    ch.update((prev) => {
      const yes = patch.yes ?? prev.yes;
      const no = op === 'snapshot' ? (patch.no ?? 1 - yes) : (patch.no ?? prev.no);
      return {
        marketId,
        yes,
        no,
        dYes: Number((yes - prev.yes).toFixed(4)),
        dNo: Number((no - prev.no).toFixed(4)),
        ts: patch.ts ?? Date.now(),
        seq: patch.seq ?? ++seqCounter,
      };
    });
  });

  // 价格序列：最多每 2 秒补一个点，避免图表数据源被高频刷新
  const seriesCh = seriesChannel(marketId);
  const seriesKey = seriesCh.key;
  const current = seriesCh.getSnapshot();
  const last = current[current.length - 1];
  const ts = patch.ts ?? Date.now();
  if (!last || ts - last.ts >= 2000) {
    scheduleWrite(seriesKey, () => {
      const prev = seriesCh.getSnapshot();
      const next = prev.length >= 600 ? prev.slice(-599) : prev.slice();
      next.push({ ts, yes: patch.yes ?? last?.yes ?? 0.5, no: patch.no ?? last?.no ?? 0.5 });
      seriesCh.set(next);
    });
  }
}

export function ingestBook(
  marketId: string,
  outcome: OutcomeKey,
  payload: Partial<OrderBookSnapshot>,
  op: 'snapshot' | 'delta' = 'snapshot',
) {
  const ch = bookChannel(marketId, outcome);
  const key = ch.key;

  scheduleWrite(key, () => {
    ch.update((prev) => {
      const bids = op === 'snapshot' ? (payload.bids ?? prev.bids) : mergeLevels(prev.bids, payload.bids, 'bid');
      const asks = op === 'snapshot' ? (payload.asks ?? prev.asks) : mergeLevels(prev.asks, payload.asks, 'ask');
      const bestBid = bids[0]?.price ?? prev.bestBid;
      const bestAsk = asks[0]?.price ?? prev.bestAsk;
      return {
        marketId,
        outcome,
        bids,
        asks,
        bestBid,
        bestAsk,
        spread: Number((bestAsk - bestBid).toFixed(4)),
        mid: payload.mid ?? Number(((bestBid + bestAsk) / 2).toFixed(4)),
        ts: payload.ts ?? Date.now(),
        seq: payload.seq ?? ++seqCounter,
      };
    });
  });
}

function mergeLevels(prev: OrderBookLevel[], next: OrderBookLevel[] | undefined, side: 'bid' | 'ask') {
  if (!next) return prev;
  const map = new Map<number, number>();
  for (const level of prev) map.set(level.price, level.size);
  for (const level of next) map.set(level.price, level.size);
  const merged = Array.from(map.entries())
    .map(([price, size]) => ({ price, size, cumulative: 0 }))
    .filter((level) => level.size > 0.5)
    .sort((a, b) => (side === 'bid' ? b.price - a.price : a.price - b.price))
    .slice(0, 12);
  let cumulative = 0;
  return merged.map((level) => {
    cumulative += level.size;
    return { ...level, cumulative: Number(cumulative.toFixed(1)) };
  });
}

export function ingestTrade(tick: TradeTick) {
  tradesBuffer(tick.marketId).push(tick);
  const key = TOPIC.tradesVersion(tick.marketId);
  const ch = tradesVersionChannel(tick.marketId);
  scheduleWrite(key, () => ch.update((prev) => prev + 1));
}

export function ingestChat(message: ChatMessage) {
  chatBuffer(message.liveId).push(message);
  const key = TOPIC.chatVersion(message.liveId);
  const ch = chatVersionChannel(message.liveId);
  scheduleWrite(key, () => ch.update((prev) => prev + 1));
}

export function ingestLiveStats(stats: Partial<LiveStats> & { liveId: string }) {
  const key = TOPIC.liveStats(stats.liveId);
  const ch = liveStatsChannel(stats.liveId);
  scheduleWrite(key, () => ch.update((prev) => ({ ...prev, ...stats })));
}

// ---------------------------------------------------------------------------
// 远端消息分发（WebSocket → 频道）
// ---------------------------------------------------------------------------

export function dispatchRemoteMessage(
  channelKey: string,
  payload: unknown,
  op: 'snapshot' | 'delta' = 'delta',
) {
  const applier = appliers.get(channelKey);
  if (!applier) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[realtime] 收到未订阅频道 "${channelKey}" 的消息，已丢弃`);
    }
    return;
  }
  applier(payload, op);
}

/** 重连后需要重新拉取的频道：只针对当前真正有订阅者的频道（局部订阅） */
export function subscribedChannelKeys() {
  return Array.from(appliers.keys()).filter((key) => {
    const ch = peekChannel(key);
    return ch ? ch.hasSubscribers() : false;
  });
}
