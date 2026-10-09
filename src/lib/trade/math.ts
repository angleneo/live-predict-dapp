import { clamp } from '@/lib/utils';
import type { OutcomeKey, Position, TradeIntent, TradeSide } from '@/types';

/**
 * 交易数学
 * ---------------------------------------------------------------------------
 * 预测市场里「1 份 YES + 1 份 NO = 1 元」的结算特性，让定价可以用概率直接表达。
 * 这里实现一个轻量的恒定乘积近似 AMM，用于前端预估价格影响、成本、手续费与滑点保护值，
 * 真实成交价以合约 quoteBuy / quoteSell 为准。
 */

export const FEE_RATE = 0.002;
export const DEFAULT_SLIPPAGE = 0.005;

export interface QuoteParams {
  side: TradeSide;
  shares: number;
  price: number;
  liquidity: number;
}

export interface Quote {
  shares: number;
  /** 考虑价格影响后的平均成交价 */
  avgPrice: number;
  /** 不含手续费的名义金额 */
  gross: number;
  fee: number;
  /** 买入 = 支出总额；卖出 = 到手金额 */
  net: number;
  /** 价格影响（相对中间价的比例） */
  priceImpact: number;
  /** 滑点保护后的边界价格 */
  limitPrice: number;
}

/** 价格影响：份额越大、流动性越薄，成交均价越差 */
export function priceImpactRatio(shares: number, liquidity: number) {
  if (liquidity <= 0) return 1;
  return clamp(shares / (liquidity * 4), 0, 0.25);
}

export function quoteTrade({ side, shares, price, liquidity }: QuoteParams, slippage = DEFAULT_SLIPPAGE): Quote {
  const mid = clamp(price, 0.01, 0.99);
  const safeShares = Math.max(0, shares);
  const impactRatio = priceImpactRatio(safeShares, liquidity);
  const avgPrice = clamp(mid * (1 + impactRatio), 0.01, 0.99);
  const gross = safeShares * avgPrice;
  const fee = gross * FEE_RATE;
  const net = side === 'buy' ? gross + fee : gross - fee;

  return {
    shares: safeShares,
    avgPrice,
    gross,
    fee,
    net,
    priceImpact: impactRatio,
    limitPrice: side === 'buy' ? clamp(mid * (1 + slippage), 0.01, 1) : clamp(mid * (1 - slippage), 0, 0.99),
  };
}

/**
 * 用「金额」反推「份额」：价格影响与份额相关，所以做几步不动点迭代，
 * 保证输入金额时展示的份额与成本自洽（用户不会看到数字对不上）。
 */
export function sharesForAmount(
  amount: number,
  { side, price, liquidity }: Omit<QuoteParams, 'shares'>,
  iterations = 6,
): number {
  const mid = clamp(price, 0.01, 0.99);
  let guess = amount / mid;
  for (let i = 0; i < iterations; i += 1) {
    const quote = quoteTrade({ side, shares: guess, price: mid, liquidity });
    if (quote.net <= 0) break;
    guess = guess * (amount / quote.net);
  }
  return Math.max(0, guess);
}

export function quoteFromAmount(
  amount: number,
  params: Omit<QuoteParams, 'shares'>,
  slippage = DEFAULT_SLIPPAGE,
): Quote {
  const shares = sharesForAmount(amount, params);
  return quoteTrade({ ...params, shares }, slippage);
}

/** 把一次成交应用到持仓上（买入摊薄成本，卖出结转已实现盈亏） */
export function applyFill(
  position: Position | undefined,
  fill: { outcome: OutcomeKey; side: TradeSide; shares: number; price: number; marketId: string },
): Position {
  const base: Position =
    position ?? { marketId: fill.marketId, outcome: fill.outcome, shares: 0, avgPrice: 0, realizedPnl: 0 };

  const fee = fill.shares * fill.price * FEE_RATE;

  if (fill.side === 'buy') {
    const shares = base.shares + fill.shares;
    const cost = base.avgPrice * base.shares + fill.shares * fill.price + fee;
    return {
      ...base,
      marketId: fill.marketId,
      outcome: fill.outcome,
      shares,
      avgPrice: shares > 0 ? cost / shares : 0,
    };
  }

  const shares = Math.max(0, base.shares - fill.shares);
  const realizedPnl = base.realizedPnl + fill.shares * (fill.price - base.avgPrice) - fee;
  return {
    ...base,
    marketId: fill.marketId,
    outcome: fill.outcome,
    shares,
    avgPrice: shares > 0 ? base.avgPrice : 0,
    realizedPnl,
  };
}

export function positionKey(marketId: string, outcome: OutcomeKey) {
  return `${marketId}:${outcome}`;
}

export interface PositionMetrics {
  value: number;
  cost: number;
  unrealizedPnl: number;
  pnlPercent: number;
  claimable: boolean;
}

export function computeMetrics(position: Position, price: number, resolved: boolean, winner?: OutcomeKey | null) {
  const value = resolved ? (winner === position.outcome ? position.shares : 0) : position.shares * price;
  const cost = position.shares * position.avgPrice;
  const unrealizedPnl = value - cost;
  const claimable = resolved && winner === position.outcome && position.shares > 0;
  return {
    value,
    cost,
    unrealizedPnl,
    pnlPercent: cost > 0 ? unrealizedPnl / cost : 0,
    claimable,
  } satisfies PositionMetrics;
}

/** 从 intent 反推乐观持仓（提交时立即生效，失败可回滚） */
export function intentToFill(intent: TradeIntent) {
  return {
    marketId: intent.marketId,
    outcome: intent.outcome,
    side: intent.side,
    shares: intent.shares,
    price: intent.price,
  };
}
