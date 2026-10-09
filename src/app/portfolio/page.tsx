'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCcw, Wallet } from 'lucide-react';
import { Panel, Pill, Stat } from '@/components/common/Panel';
import { PositionsTable } from '@/components/portfolio/PositionsTable';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { useChainPositions } from '@/hooks/usePositions';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useMarkets } from '@/hooks/useMarkets';
import { useTradeStore } from '@/store/tradeStore';
import { usePositionStore } from '@/store/positionStore';
import { demoMode, isContractConfigured } from '@/lib/contracts/addresses';
import { cn, formatSignedUsd, formatUsd, shortHash } from '@/lib/utils';
import type { TxStage } from '@/types';

const STAGE_LABEL: Record<TxStage, string> = {
  idle: '未开始',
  reviewing: '校验中',
  awaiting_signature: '等待签名',
  pending: '打包中',
  confirming: '确认中',
  success: '成功',
  rejected: '已取消签名',
  failed: '失败',
  unknown: '状态待确认',
};

const STAGE_TONE: Record<TxStage, 'neutral' | 'up' | 'down' | 'warn' | 'brand'> = {
  idle: 'neutral',
  reviewing: 'brand',
  awaiting_signature: 'warn',
  pending: 'warn',
  confirming: 'warn',
  success: 'up',
  rejected: 'neutral',
  failed: 'down',
  unknown: 'warn',
};

/**
 * 个人持仓页
 * ---------------------------------------------------------------------------
 * 承载三类数据：
 * 1. 组合汇总（单一频道订阅，价格高频跳动也不会整页重渲染）
 * 2. 持仓明细（每行独立订阅自己的市场）
 * 3. 交易意图流水（含被中断、待对账的记录 —— 这是数据一致性的可见证据）
 */
export default function PortfolioPage() {
  const { positions, summary } = usePortfolio();
  const markets = useMarkets();
  const chainPositions = useChainPositions();
  const stale = usePositionStore((state) => state.stale);
  const reset = usePositionStore((state) => state.reset);
  const seedDemoPositions = usePositionStore((state) => state.seedDemoPositions);
  const intents = useTradeStore((state) => state.intents);
  const unsettledCount = intents.filter((intent) => ['pending', 'confirming', 'unknown'].includes(intent.status)).length;

  const rows = useMemo(
    () =>
      positions
        .map((position) => ({
          position,
          market: markets.find((market) => market.id === position.marketId),
        }))
        .filter((row): row is { position: typeof row.position; market: NonNullable<typeof row.market> } =>
          Boolean(row.market),
        )
        .sort((a, b) => a.market.endsAt - b.market.endsAt),
    [markets, positions],
  );

  return (
    <div className="space-y-4">
      {stale ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          钱包已断开，持仓展示为断开前的快照，价格可能已过期。重新连接后将自动与链上对齐。
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel bodyClassName="pt-2">
          <Stat
            label="持仓总市值"
            value={formatUsd(summary.totalValue)}
            hint={`成本 ${formatUsd(summary.totalCost)}`}
          />
        </Panel>
        <Panel bodyClassName="pt-2">
          <Stat
            label="未实现盈亏"
            value={formatSignedUsd(summary.unrealizedPnl)}
            tone={summary.unrealizedPnl >= 0 ? 'up' : 'down'}
            hint={`${(summary.pnlPercent * 100).toFixed(2)}%`}
          />
        </Panel>
        <Panel bodyClassName="pt-2">
          <Stat label="已实现盈亏" value={formatSignedUsd(summary.realizedPnl)} tone={summary.realizedPnl >= 0 ? 'up' : 'down'} />
        </Panel>
        <Panel bodyClassName="pt-2">
          <Stat
            label="持仓 / 待确认"
            value={`${summary.positionCount} / ${summary.pendingCount}`}
            hint={`覆盖 ${summary.marketCount} 个市场`}
          />
        </Panel>
      </div>

      <Panel
        title="持仓明细"
        extra={
          <div className="flex items-center gap-2">
            {chainPositions.isFetching ? <span className="text-[11px] text-muted">同步中…</span> : null}
            <span className="text-[11px] text-muted">
              {isContractConfigured ? '链上批量只读（ethers.js）' : 'Demo 本地持仓'}
            </span>
          </div>
        }
        bodyClassName=""
      >
        <PositionsTable rows={rows} loading={chainPositions.isLoading && rows.length === 0} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="交易意图流水"
          extra={<span className="text-[11px] text-muted">本地持久化 · 断线后用于对账</span>}
          bodyClassName=""
        >
          {intents.length === 0 ? (
            <p className="p-4 text-[11px] text-muted">还没有交易记录。</p>
          ) : (
            <div className="scroll-thin max-h-[320px] divide-y divide-line overflow-y-auto">
              {intents.slice(0, 30).map((intent) => (
                <div key={intent.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span
                        className={cn(
                          'font-medium',
                          intent.side === 'buy' ? 'text-bull' : 'text-bear',
                        )}
                      >
                        {intent.kind === 'claim' ? '领取' : intent.side === 'buy' ? '买入' : '卖出'}
                      </span>
                      <span className="text-slate-300">
                        {intent.outcome === 'yes' ? 'YES' : 'NO'} · {intent.shares.toFixed(2)} 份
                      </span>
                      <span className="num text-muted">{intent.price ? `${(intent.price * 100).toFixed(1)}¢` : '—'}</span>
                    </div>
                    <div className="num mt-0.5 text-[10px] text-muted">
                      {new Date(intent.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      {intent.txHash ? ` · ${shortHash(intent.txHash)}` : ''}
                      {intent.error ? ` · ${intent.error}` : ''}
                    </div>
                  </div>
                  <Pill tone={STAGE_TONE[intent.status]}>{STAGE_LABEL[intent.status]}</Pill>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="本地状态与恢复" bodyClassName="space-y-3">
          <div className="space-y-1.5 text-[11px] text-muted">
            <p className="flex items-center justify-between">
              <span>待对账交易</span>
              <span className={cn('num', unsettledCount > 0 && 'text-amber-300')}>{unsettledCount}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>未结算意图</span>
              <span className="num">{intents.filter((intent) => intent.status === 'failed' || intent.status === 'rejected').length}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>数据来源</span>
              <span>{demoMode ? 'Demo 本地生命周期' : '链上 + 本地乐观层'}</span>
            </p>
          </div>

          <p className="rounded-lg border border-line bg-bg-soft p-2 text-[11px] leading-relaxed text-muted">
            断连或回执超时的交易不会被直接丢弃：它们保留 txHash 并以「状态待确认」持久化，
            钱包恢复连接后由对账逻辑读取链上回执决定提交还是回滚乐观持仓。
          </p>

          <div className="flex flex-wrap gap-2">
            {!isContractConfigured ? (
              <button
                type="button"
                className="btn-ghost text-[11px]"
                onClick={() => {
                  reset();
                  seedDemoPositions();
                }}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                重置演示持仓
              </button>
            ) : (
              <button type="button" className="btn-ghost text-[11px]" onClick={() => chainPositions.refetch()}>
                <RefreshCcw className="h-3.5 w-3.5" />
                重新同步链上持仓
              </button>
            )}
            <ConnectButton />
          </div>

          <Link href="/" className="flex items-center gap-1 text-[11px] text-brand-soft hover:underline">
            <Wallet className="h-3 w-3" />
            回到直播广场挑选事件
          </Link>
        </Panel>
      </div>
    </div>
  );
}
