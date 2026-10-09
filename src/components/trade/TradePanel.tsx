'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Info, Loader2, Settings2, XCircle } from 'lucide-react';
import { cn, formatCents, formatShares, formatSignedUsd, formatUsd, shortAddress, toCents } from '@/lib/utils';
import { quoteFromAmount, quoteTrade, DEFAULT_SLIPPAGE } from '@/lib/trade/math';
import { useOdds, useOrderBook, useMarketMid } from '@/hooks/useMarketFeed';
import { usePositionFor } from '@/hooks/usePositions';
import { useCollateralBalance } from '@/hooks/useBalances';
import { useTradeActions } from '@/hooks/useTradeActions';
import { defaultTradeForm, useTradeStore, isStageBusy, type TradeForm } from '@/store/tradeStore';
import { explorerTxUrl } from '@/lib/contracts/addresses';
import { Segmented } from '@/components/common/Panel';
import type { Market, OutcomeKey, TradeIntent, TradeSide } from '@/types';

/**
 * 交易面板
 * ---------------------------------------------------------------------------
 * 这里集中处理下单前中后的所有状态：
 * - 报价：用 AMM 近似模型预估均价、价格影响、手续费与滑点保护边界；
 * - 提交：交给 useTradeActions，内部完成链切换、授权、签名、等待回执；
 * - 状态机：idle → awaiting_signature → pending → confirming → success / rejected / failed；
 * - 边界：取消签名只提示不清空表单；失败回滚乐观持仓；状态未知则交由对账逻辑处理。
 */
export function TradePanel({ market, className }: { market: Market; className?: string }) {
  const storedForm = useTradeStore((state) => state.forms[market.id]);
  const form: TradeForm = { ...defaultTradeForm, ...storedForm };
  const setForm = useTradeStore((state) => state.setForm);
  const intent = useTradeStore((state) => state.intents.find((item) => item.marketId === market.id));
  const [showSettings, setShowSettings] = useState(false);

  const odds = useOdds(market.id);
  const book = useOrderBook(market.id, form.outcome);
  const mid = useMarketMid(market, form.outcome);
  const position = usePositionFor(market.id, form.outcome);
  const balance = useCollateralBalance();
  const actions = useTradeActions(market);

  const price = form.orderType === 'limit' && form.limitPrice ? Number(form.limitPrice) : mid;
  const amount = Number(form.amount) || 0;
  const inputShares = Number(form.shares) || 0;

  const quote = useMemo(() => {
    const params = { side: form.side, price, liquidity: market.liquidity };
    if (form.side === 'buy' && form.sizeMode === 'amount') {
      return quoteFromAmount(amount, params, form.slippage);
    }
    return quoteTrade({ ...params, shares: inputShares }, form.slippage);
  }, [amount, form.side, form.sizeMode, form.slippage, inputShares, market.liquidity, price]);

  const payout = quote.shares * 1;
  const profit = payout - quote.net;
  const busy = isStageBusy(intent?.status);

  const submitLabel = (() => {
    switch (intent?.status) {
      case 'awaiting_signature':
        return '等待钱包签名…';
      case 'pending':
        return '交易打包中…';
      case 'confirming':
        return '等待链上确认…';
      default:
        return form.side === 'buy' ? '买入' : '卖出';
    }
  })();

  const setOutcome = (outcome: OutcomeKey) => setForm(market.id, { outcome });
  const setSide = (side: TradeSide) => setForm(market.id, { side, sizeMode: side === 'sell' ? 'shares' : form.sizeMode });

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-3 p-3">
        {/* 方向选择 */}
        <div className="grid grid-cols-2 gap-2">
          {market.outcomes.map((outcome) => {
            const active = form.outcome === outcome.key;
            const priceValue = outcome.key === 'yes' ? odds.yes : odds.no;
            return (
              <button
                key={outcome.key}
                type="button"
                onClick={() => setOutcome(outcome.key)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition',
                  active
                    ? outcome.key === 'yes'
                      ? 'border-bull/60 bg-bull/10'
                      : 'border-bear/60 bg-bear/10'
                    : 'border-line bg-bg-soft hover:bg-bg-hover',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-medium', outcome.key === 'yes' ? 'text-bull' : 'text-bear')}>
                    {outcome.label}
                  </span>
                  <span className={cn('num text-sm', outcome.key === 'yes' ? 'text-bull' : 'text-bear')}>
                    {formatCents(priceValue)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <Segmented
          className="w-full [&>button]:flex-1"
          value={form.side}
          onChange={setSide}
          options={[
            { value: 'buy', label: '买入' },
            { value: 'sell', label: '卖出' },
          ]}
        />

        {/* 下单输入 */}
        <div className="space-y-1.5">
          {form.side === 'buy' ? (
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                value={form.sizeMode}
                onChange={(mode) => setForm(market.id, { sizeMode: mode })}
                options={[
                  { value: 'amount', label: '按金额' },
                  { value: 'shares', label: '按份额' },
                ]}
              />
              <span className="ml-auto text-[11px] text-muted">
                余额 {balance.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>卖出份额</span>
              <span>
                可卖 <span className="num text-slate-300">{formatShares(position?.shares ?? 0)}</span>
              </span>
            </div>
          )}

          {form.side === 'buy' && form.sizeMode === 'amount' ? (
            <label className="block">
              <span className="text-[11px] text-muted">支付金额（USDC）</span>
              <input
                className="input num mt-1 text-lg"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm(market.id, { amount: sanitizeNumber(event.target.value) })}
                placeholder="0.00"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-[11px] text-muted">份额</span>
              <input
                className="input num mt-1 text-lg"
                inputMode="decimal"
                value={form.shares}
                onChange={(event) => setForm(market.id, { shares: sanitizeNumber(event.target.value) })}
                placeholder="0.00"
              />
            </label>
          )}

          <div className="flex flex-wrap gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((ratio) => (
              <button
                key={ratio}
                type="button"
                className="chip hover:border-brand/40 hover:text-slate-200"
                onClick={() =>
                  form.side === 'buy'
                    ? setForm(market.id, { amount: (balance.value * ratio).toFixed(2), sizeMode: 'amount' })
                    : setForm(market.id, { shares: Math.floor((position?.shares ?? 0) * ratio).toString() })
                }
              >
                {ratio === 1 ? 'MAX' : `${ratio * 100}%`}
              </button>
            ))}
            {book.bestAsk ? (
              <button
                type="button"
                className="chip hover:border-brand/40 hover:text-slate-200"
                onClick={() => setForm(market.id, { orderType: 'limit', limitPrice: book.bestAsk.toFixed(2) })}
              >
                卖一 {formatCents(book.bestAsk)}
              </button>
            ) : null}
            {book.bestBid ? (
              <button
                type="button"
                className="chip hover:border-brand/40 hover:text-slate-200"
                onClick={() => setForm(market.id, { orderType: 'limit', limitPrice: book.bestBid.toFixed(2) })}
              >
                买一 {formatCents(book.bestBid)}
              </button>
            ) : null}
          </div>
        </div>

        {/* 报价明细 */}
        <div className="space-y-1 rounded-lg border border-line bg-bg-soft p-2.5 text-[11px]">
          <QuoteRow label="预计成交均价" value={formatCents(quote.avgPrice, 2)} />
          <QuoteRow
            label="价格影响"
            value={`${(quote.priceImpact * 100).toFixed(2)}%`}
            tone={quote.priceImpact > 0.05 ? 'warn' : 'default'}
          />
          <QuoteRow label="手续费 (0.20%)" value={formatUsd(quote.fee, 3)} />
          {form.side === 'buy' ? (
            <>
              <QuoteRow label="预计获得份额" value={formatShares(quote.shares)} />
              <QuoteRow label="最大成本（含滑点）" value={formatUsd(quote.net, 2)} />
              <QuoteRow label="若判断正确收益" value={`+${formatUsd(Math.max(0, profit), 2)}`} tone="up" />
            </>
          ) : (
            <>
              <QuoteRow label="预计到账" value={formatUsd(Math.max(0, quote.net), 2)} />
              <QuoteRow
                label="预计盈亏"
                value={formatSignedUsd(quote.shares * (quote.avgPrice - (position?.avgPrice ?? 0)))}
                tone={(quote.avgPrice - (position?.avgPrice ?? 0)) >= 0 ? 'up' : 'down'}
              />
            </>
          )}

          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between text-muted hover:text-slate-200"
            onClick={() => setShowSettings((prev) => !prev)}
          >
            <span className="flex items-center gap-1">
              <Settings2 className="h-3 w-3" />
              滑点保护 / 高级设置
            </span>
            <span className="num flex items-center gap-1">
              {(form.slippage * 100).toFixed(2)}%
              <ChevronDown className={cn('h-3 w-3 transition', showSettings && 'rotate-180')} />
            </span>
          </button>

          {showSettings ? (
            <div className="space-y-2 rounded-lg border border-line bg-bg-card p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted">最大滑点</span>
                <Segmented
                  size="sm"
                  value={String(form.slippage)}
                  onChange={(value) => setForm(market.id, { slippage: Number(value) })}
                  options={[
                    { value: '0.001', label: '0.1%' },
                    { value: '0.005', label: '0.5%' },
                    { value: '0.01', label: '1%' },
                    { value: String(DEFAULT_SLIPPAGE), label: '默认' },
                  ]}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">委托类型</span>
                <Segmented
                  size="sm"
                  value={form.orderType}
                  onChange={(value) => setForm(market.id, { orderType: value })}
                  options={[
                    { value: 'market', label: '市价' },
                    { value: 'limit', label: '限价' },
                  ]}
                />
              </div>
              {form.orderType === 'limit' ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">限价（美分）</span>
                  <input
                    className="input num h-7 w-20 py-0 text-right text-xs"
                    inputMode="decimal"
                    value={form.limitPrice}
                    placeholder={toCents(mid).toFixed(1)}
                    onChange={(event) => setForm(market.id, { limitPrice: sanitizeNumber(event.target.value) })}
                  />
                </div>
              ) : null}
              <QuoteRow
                label="滑点保护边界"
                value={formatCents(quote.limitPrice, 2)}
                tone="default"
              />
              {actions.isDemo ? (
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-muted">Demo 结果</span>
                  <Segmented
                    size="sm"
                    value={form.demoOutcome}
                    onChange={(value) => setForm(market.id, { demoOutcome: value })}
                    options={[
                      { value: 'success', label: '成功' },
                      { value: 'revert', label: '失败' },
                      { value: 'reject', label: '拒签' },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!actions.isConnected && actions.isDemo ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-brand/30 bg-brand/10 p-2 text-[11px] leading-relaxed text-brand-soft">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            未连接钱包：当前为本地体验模式，交易走完整的模拟生命周期（不会上链）。连接钱包后自动切换为链上读写。
          </p>
        ) : null}

        {/* 提交 */}
        <button
          type="button"
          disabled={busy || quote.shares <= 0}
          onClick={() =>
            actions.submit({
              side: form.side,
              outcome: form.outcome,
              shares: quote.shares,
              price,
              slippage: form.slippage,
              demoOutcome: form.demoOutcome,
            })
          }
          className={cn(
            'w-full py-2.5 text-sm',
            form.side === 'buy' ? 'btn-bull' : 'btn-bear',
            quote.shares <= 0 && 'opacity-60',
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
          {!busy && quote.shares > 0 ? (
            <span className="num text-[11px] opacity-80">
              {form.side === 'buy' ? formatUsd(quote.net, 2) : `${formatShares(quote.shares)} 份`}
            </span>
          ) : null}
        </button>

        {intent && intent.status !== 'idle' ? <TxStatus intent={intent} /> : null}
      </div>

      {/* 当前市场持仓 */}
      <div className="mt-auto border-t border-line p-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>我的持仓（{market.outcomes.find((o) => o.key === form.outcome)?.label}）</span>
          {position?.pending ? <span className="text-amber-300">待确认</span> : null}
        </div>
        {position && position.shares > 0 ? (
          <div className="flex items-end justify-between">
            <div className="space-y-0.5 text-[11px]">
              <div className="num text-sm text-slate-100">{formatShares(position.shares)} 份</div>
              <div className="num text-muted">
                均价 {formatCents(position.avgPrice, 2)} · 现值 {formatUsd(position.shares * price)}
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  'num text-sm font-medium',
                  position.shares * price - position.shares * position.avgPrice >= 0 ? 'text-bull' : 'text-bear',
                )}
              >
                {formatSignedUsd(position.shares * price - position.shares * position.avgPrice)}
              </div>
              <button
                type="button"
                className="text-[11px] text-brand-soft hover:underline"
                onClick={() =>
                  setForm(market.id, {
                    side: 'sell',
                    sizeMode: 'shares',
                    shares: position.shares.toFixed(2),
                    outcome: form.outcome,
                  })
                }
              >
                一键平仓
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted">当前方向暂无持仓</p>
        )}
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted">
          <Info className="h-3 w-3" />
          结算价 1.00 USDC / 份 · 未配置合约时以本地 Demo 生命周期模拟
        </p>
      </div>
    </div>
  );
}

function QuoteRow({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'up' | 'down' | 'warn' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          'num',
          tone === 'up' && 'text-bull',
          tone === 'down' && 'text-bear',
          tone === 'warn' && 'text-amber-300',
          tone === 'default' && 'text-slate-200',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** 交易状态条：把状态机可视化，并给出可操作的下一步 */
function TxStatus({ intent }: { intent: TradeIntent }) {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);
  const link = explorerTxUrl(chainId, intent.txHash);

  if (intent.status === 'success') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-bull/30 bg-bull/10 p-2 text-[11px] text-bull">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0">
          <p>交易已确认，持仓已更新</p>
          {link ? (
            <a className="underline" href={link} target="_blank" rel="noreferrer">
              {shortAddress(intent.txHash, 8)}
            </a>
          ) : (
            <span className="num text-bull/80">{shortAddress(intent.txHash, 8)}</span>
          )}
        </div>
      </div>
    );
  }

  if (intent.status === 'rejected') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-200">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p>{intent.error ?? '已取消签名'}</p>
          <p className="text-amber-200/70">表单内容已保留，可直接再次提交。</p>
        </div>
      </div>
    );
  }

  if (intent.status === 'failed') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-bear/30 bg-bear/10 p-2 text-[11px] text-bear">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p>{intent.error ?? '交易失败'}</p>
          <p className="text-bear/70">乐观持仓已回滚，可调整参数后重试。</p>
        </div>
      </div>
    );
  }

  if (intent.status === 'unknown') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-200">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p>状态待确认：连接中断或回执超时</p>
          <p className="text-amber-200/70">
            已保留 txHash，重连后自动与链上核对，不做盲目回滚。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-soft p-2 text-[11px] text-slate-300">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-soft" />
      <span>
        {intent.status === 'awaiting_signature' ? '等待钱包签名' : intent.status === 'confirming' ? '等待链上确认' : '交易打包中'}
      </span>
      {intent.txHash ? <span className="num text-muted">{shortAddress(intent.txHash, 6)}</span> : null}
    </div>
  );
}

function sanitizeNumber(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}
