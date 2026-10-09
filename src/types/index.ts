// ---------------------------------------------------------------------------
// 领域模型：直播 / 市场 / 行情 / 订单 / 持仓
// ---------------------------------------------------------------------------

export type OutcomeKey = 'yes' | 'no';
export type TradeSide = 'buy' | 'sell';
export type MarketStatus = 'live' | 'upcoming' | 'closed' | 'resolved';

export interface MarketOutcome {
  key: OutcomeKey;
  label: string;
  /** 概率价格，0~1（= 隐含概率） */
  price: number;
}

export interface Market {
  id: string;
  /** 链上 marketId（uint256 十进制字符串），Mock 模式下与 id 数值部分一致 */
  onChainId: number;
  question: string;
  category: string;
  status: MarketStatus;
  /** 结算时间戳（ms） */
  endsAt: number;
  volume24h: number;
  liquidity: number;
  /** 关联直播间 */
  liveId: string;
  outcomes: MarketOutcome[];
  winningOutcome?: OutcomeKey | null;
}

export interface OddsSnapshot {
  marketId: string;
  yes: number;
  no: number;
  /** 相对上一快照的变化量，用于闪烁动画 */
  dYes: number;
  dNo: number;
  ts: number;
  seq: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface OrderBookSnapshot {
  marketId: string;
  outcome: OutcomeKey;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  mid: number;
  ts: number;
  seq: number;
}

export interface TradeTick {
  id: string;
  marketId: string;
  outcome: OutcomeKey;
  side: TradeSide;
  price: number;
  size: number;
  ts: number;
  /** 链上成交 hash（真实模式）*/
  txHash?: string;
}

export interface PricePoint {
  ts: number;
  yes: number;
  no: number;
}

export interface ChatMessage {
  id: string;
  liveId: string;
  user: string;
  avatarSeed: number;
  text: string;
  ts: number;
  /** 打赏金额，非空时高亮 */
  tip?: number;
}

export interface LiveStream {
  id: string;
  title: string;
  streamer: string;
  category: string;
  viewers: number;
  startedAt: number;
  online: boolean;
  /** 直播流地址（HLS/mp4），空则使用 Canvas 模拟推流 */
  streamUrl?: string;
  marketIds: string[];
}

export interface Position {
  marketId: string;
  outcome: OutcomeKey;
  shares: number;
  avgPrice: number;
  realizedPnl: number;
  /** 乐观更新产生、尚未确认的仓位 */
  pending?: boolean;
}

export interface PositionView extends Position {
  market: Market | undefined;
  price: number;
  value: number;
  unrealizedPnl: number;
  pnlPercent: number;
  claimable: boolean;
}

export interface TradeIntent {
  id: string;
  marketId: string;
  onChainId: number;
  outcome: OutcomeKey;
  side: TradeSide;
  shares: number;
  price: number;
  /** 0~1，例如 0.005 = 0.5% */
  slippage: number;
  status: TxStage;
  txHash?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  /** 乐观锁：失败时用于回滚 */
  optimisticApplied: boolean;
  /** 仅 Demo 模式使用：指定本次交易的模拟结果，用于验证失败/拒签链路 */
  demoOutcome?: 'success' | 'revert' | 'reject';
  /** 交易类型，claim 与买入卖出共用一张 intent 表 */
  kind?: 'trade' | 'approve' | 'claim';
}

export type TxStage =
  | 'idle'
  | 'reviewing'
  | 'awaiting_signature'
  | 'pending'
  | 'confirming'
  | 'success'
  | 'rejected'
  | 'failed'
  | 'unknown';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface RealtimeState {
  status: RealtimeStatus;
  source: 'websocket' | 'mock';
  attempt: number;
  lastError?: string;
  lastMessageAt?: number;
  latencyMs?: number;
}
