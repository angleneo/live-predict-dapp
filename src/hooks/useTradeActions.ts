'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from 'wagmi';
import type { Address, Hash } from 'viem';
import { erc20Abi, OUTCOME_INDEX, predictionMarketAbi } from '@/lib/contracts/abi';
import { collateralDecimals, contracts, demoMode, explorerTxUrl, isContractConfigured, targetChainId } from '@/lib/contracts/addresses';
import { toCollateralUnits } from '@/lib/contracts/ethersAdapter';
import { humanizeError } from '@/lib/errors';
import { simulateTradeLifecycle } from '@/lib/trade/demoEngine';
import { quoteTrade } from '@/lib/trade/math';
import { usePositionStore } from '@/store/positionStore';
import { useTradeStore } from '@/store/tradeStore';
import type { Market, OutcomeKey, TradeIntent, TradeSide, TxStage } from '@/types';

export interface SubmitTradeParams {
  side: TradeSide;
  outcome: OutcomeKey;
  shares: number;
  price: number;
  slippage: number;
  demoOutcome?: 'success' | 'revert' | 'reject';
}

const CONFIRM_TIMEOUT_MS = 3 * 60_000;

/**
 * 交易执行 Hook
 * ---------------------------------------------------------------------------
 * 顺序：校验钱包 → 校验链 → 报价 → 授权（如需要）→ 下单 → 等待回执 → 提交/回滚
 * 每个环节失败都保证：状态机不卡死、乐观持仓可回滚、可恢复的失败进入对账队列。
 */
export function useTradeActions(market: Market | undefined) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const createIntent = useTradeStore((state) => state.createIntent);
  const updateIntent = useTradeStore((state) => state.updateIntent);
  const applyOptimistic = usePositionStore((state) => state.applyOptimistic);
  const commit = usePositionStore((state) => state.commit);
  const rollback = usePositionStore((state) => state.rollback);

  // 闭包里拿到的是提交时刻的 status；用 ref 跟踪最新值，才能识别「提交后钱包被断开」
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const { data: allowance } = useReadContract({
    address: contracts.collateral,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contracts.predictionMarket] : undefined,
    query: { enabled: Boolean(address) && isContractConfigured, staleTime: 8_000 },
  });

  const collateralBalance = useReadContract({
    address: contracts.collateral,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && isContractConfigured, refetchInterval: 20_000 },
  });

  const spendable = useMemo(() => {
    if (!isContractConfigured) return 12_450.32; // Demo 余额
    if (collateralBalance.data === undefined) return 0;
    return Number(collateralBalance.data) / 10 ** collateralDecimals;
  }, [collateralBalance.data]);

  const approveAllowance = useCallback(
    async (amount: number) => {
      if (!market || !writeContractAsync) return false;
      const toastId = toast.loading('正在授权结算资产…');
      try {
        const hash = await writeContractAsync({
          address: contracts.collateral,
          abi: erc20Abi,
          functionName: 'approve',
          args: [contracts.predictionMarket, toCollateralUnits(amount)],
        });
        toast.loading('授权交易已提交，等待确认…', { id: toastId });
        await publicClient?.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS });
        toast.success('授权成功', { id: toastId });
        return true;
      } catch (error) {
        const classified = humanizeError(error);
        toast[classified.benign ? 'info' : 'error'](classified.message, { id: toastId });
        return false;
      }
    },
    [market, publicClient, writeContractAsync],
  );

  const submit = useCallback(
    async (params: SubmitTradeParams) => {
      if (!market) return;
      const chainTarget = targetChainId;

      // 1) 钱包连接校验
      //   真实链路必须连钱包；Demo 模式（未配置合约地址）允许在本地体验完整流程，
      //   否则在没有部署合约时连"看一眼交易链路"都做不到。
      if (!isConnected && !demoMode) {
        toast.error('请先连接钱包');
        return;
      }
      const connectedAtSubmit = isConnected;

      const intentId = `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const quote = quoteTrade(
        { side: params.side, shares: params.shares, price: params.price, liquidity: market.liquidity },
        params.slippage,
      );

      const intent: TradeIntent = {
        id: intentId,
        marketId: market.id,
        onChainId: market.onChainId,
        outcome: params.outcome,
        side: params.side,
        shares: params.shares,
        price: quote.avgPrice,
        slippage: params.slippage,
        status: 'reviewing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        optimisticApplied: false,
        demoOutcome: params.demoOutcome,
        kind: 'trade',
      };
      createIntent(intent);

      const setStage = (stage: TxStage, detail?: string) => {
        updateIntent(intentId, { status: stage, ...(detail && stage === 'pending' ? { txHash: detail } : {}) });
      };

      // 2) 乐观更新：先本地生效，让用户立即看到持仓变化
      applyOptimistic(intent);
      updateIntent(intentId, { optimisticApplied: true });

      try {
        // 3) 网络校验：链不对先切链，用户拒绝切链按「取消签名」处理
        if (isContractConfigured && chainId !== chainTarget) {
          toast.info('正在切换到目标网络…');
          await switchChainAsync({ chainId: chainTarget });
        }

        const isBuy = params.side === 'buy';
        const required = isBuy ? quote.net : 0;
        const currentAllowance = Number(allowance ?? 0n) / 10 ** collateralDecimals;

        // 4) 授权不足则先授权（幂等：只有真的不够才走这一步）
        if (isContractConfigured && isBuy && currentAllowance < required) {
          const approved = await approveAllowance(required * 1.2);
          if (!approved) {
            rollback(intentId);
            updateIntent(intentId, { status: 'rejected', optimisticApplied: false, error: '授权未完成' });
            return;
          }
        }

        // 5) 下单
        if (demoMode || !walletClient) {
          const result = await simulateTradeLifecycle({
            mode: params.demoOutcome ?? 'success',
            onStage: (stage, detail) => setStage(stage, detail),
            // 只有「提交时确实连着钱包」的情况才把断连视为中断
            shouldAbort: () => connectedAtSubmit && statusRef.current !== 'connected',
          });
          updateIntent(intentId, { status: 'success', txHash: result.hash, error: undefined });
          commit(intentId);
          toast.success(`${isBuy ? '买入' : '卖出'}成功`, {
            description: `${params.shares.toFixed(2)} 份 @ ${quote.avgPrice.toFixed(4)}（Demo 网络）`,
          });
          return result.hash as Hash;
        }

        const maxCost = toCollateralUnits(quote.limitPrice * params.shares * 1.05);
        const minProceeds = toCollateralUnits(quote.limitPrice * params.shares * 0.95);

        setStage('awaiting_signature');
        const hash = isBuy
          ? await writeContractAsync({
              address: contracts.predictionMarket,
              abi: predictionMarketAbi,
              functionName: 'buy',
              args: [BigInt(market.onChainId), OUTCOME_INDEX[params.outcome], toCollateralUnits(params.shares), maxCost],
            })
          : await writeContractAsync({
              address: contracts.predictionMarket,
              abi: predictionMarketAbi,
              functionName: 'sell',
              args: [
                BigInt(market.onChainId),
                OUTCOME_INDEX[params.outcome],
                toCollateralUnits(params.shares),
                minProceeds,
              ],
            });

        setStage('pending', hash);
        const receipt = await publicClient?.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS });

        if (!receipt || receipt.status !== 'success') {
          throw new Error('execution reverted: transaction failed on chain');
        }

        updateIntent(intentId, { status: 'success', txHash: hash, error: undefined });
        commit(intentId);
        toast.success(`${isBuy ? '买入' : '卖出'}成功`, {
          description: `${params.shares.toFixed(2)} 份 @ ${quote.avgPrice.toFixed(4)}`,
          action: explorerTxUrl(chainId, hash)
            ? { label: '查看交易', onClick: () => window.open(explorerTxUrl(chainId, hash), '_blank') }
            : undefined,
        });
        return hash;
      } catch (error) {
        const classified = humanizeError(error);

        if (classified.kind === 'user_rejected') {
          // 用户取消签名：静默回滚，不清空表单，不做任何重试
          rollback(intentId);
          updateIntent(intentId, { status: 'rejected', optimisticApplied: false, error: classified.message });
          toast.info('已取消签名，本次下单未提交');
          return undefined;
        }

        if (classified.kind === 'disconnected' || classified.kind === 'timeout') {
          // 状态未知：绝不盲目回滚，交给 TxRecovery 在钱包恢复后用 hash 对账
          updateIntent(intentId, { status: 'unknown', error: classified.message });
          toast.warning('交易状态待确认', {
            description: '钱包连接中断或回执超时，重连后会自动核对链上结果',
          });
          return undefined;
        }

        rollback(intentId);
        updateIntent(intentId, { status: 'failed', optimisticApplied: false, error: classified.message });
        toast.error(classified.kind === 'insufficient_funds' ? '余额不足' : '交易失败', {
          description: classified.message,
        });
        return undefined;
      }
    },
    [
      allowance,
      approveAllowance,
      chainId,
      commit,
      createIntent,
      isConnected,
      market,
      publicClient,
      rollback,
      status,
      switchChainAsync,
      updateIntent,
      walletClient,
      writeContractAsync,
    ],
  );

  /** 结算领取：已结算市场赢家可领取 */
  const claim = useCallback(
    async (marketId: string, onChainId: number) => {
      if (!isConnected && !demoMode) {
        toast.error('请先连接钱包');
        return;
      }
      const intentId = `claim-${Date.now()}`;
      createIntent({
        id: intentId,
        marketId,
        onChainId,
        outcome: 'yes',
        side: 'sell',
        shares: 0,
        price: 0,
        slippage: 0,
        status: 'reviewing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        optimisticApplied: false,
        kind: 'claim',
      });

      try {
        if (demoMode || !walletClient) {
          const result = await simulateTradeLifecycle({
            mode: 'success',
            onStage: (stage, detail) => useTradeStore.getState().updateIntent(intentId, { status: stage, txHash: detail }),
          });
          useTradeStore.getState().updateIntent(intentId, { status: 'success', txHash: result.hash });
          toast.success('领取成功', { description: '收益已转入钱包' });
          return;
        }

        const hash = await writeContractAsync({
          address: contracts.predictionMarket,
          abi: predictionMarketAbi,
          functionName: 'claim',
          args: [BigInt(onChainId)],
        });
        useTradeStore.getState().updateIntent(intentId, { status: 'pending', txHash: hash });
        await publicClient?.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS });
        useTradeStore.getState().updateIntent(intentId, { status: 'success' });
        toast.success('领取成功');
      } catch (error) {
        const classified = humanizeError(error);
        useTradeStore.getState().updateIntent(intentId, { status: 'failed', error: classified.message });
        toast[classified.benign ? 'info' : 'error'](classified.message);
      }
    },
    [createIntent, isConnected, publicClient, walletClient, writeContractAsync],
  );

  return {
    submit,
    claim,
    approveAllowance,
    spendable,
    isDemo: demoMode,
    isConnected,
    address: address as Address | undefined,
    chainId,
    targetChainId,
  };
}
