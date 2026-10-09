'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useShallow } from 'zustand/react/shallow';
import { contracts, demoMode, isContractConfigured } from '@/lib/contracts/addresses';
import { fetchPositionsWithEthers } from '@/lib/contracts/ethersAdapter';
import { markets } from '@/lib/mock/catalog';
import { positionKey } from '@/lib/trade/math';
import { selectPositionList, usePositionStore } from '@/store/positionStore';
import { useHydrated } from '@/store/storage';
import type { OutcomeKey, Position } from '@/types';

/**
 * 持仓读取 Hook
 * ---------------------------------------------------------------------------
 * 数据来源优先级：
 * 1. 已配置合约 → ethers.js 批量只读链上持仓（一次 RPC 覆盖所有市场）
 * 2. 已完成 hydration 的本地乐观层 → 立即渲染，避免链上数据回来前的空窗
 * 3. Demo 模式 → 本地种子持仓
 */

export function useLocalPositions(): Position[] {
  const hydrated = useHydrated();
  const positions = usePositionStore(useShallow(selectPositionList));
  return hydrated ? positions : [];
}

export function useChainPositions() {
  const { address } = useAccount();
  const replaceFromChain = usePositionStore((state) => state.replaceFromChain);
  const markStale = usePositionStore((state) => state.markStale);

  const query = useQuery({
    queryKey: ['positions', address, contracts.predictionMarket],
    enabled: Boolean(address) && isContractConfigured,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!address) return [];
      const chainPositions = await fetchPositionsWithEthers(
        address,
        markets.map((market) => market.onChainId),
      );
      return chainPositions;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const flat: Position[] = [];
    for (const chainPosition of query.data) {
      const market = markets.find((item) => item.onChainId === chainPosition.onChainId);
      if (!market) continue;
      const yes = Number(chainPosition.sharesYes) / 10 ** 6;
      const no = Number(chainPosition.sharesNo) / 10 ** 6;
      const realized = Number(chainPosition.realizedPnl) / 10 ** 6;
      if (yes > 0) {
        flat.push({ marketId: market.id, outcome: 'yes', shares: yes, avgPrice: 0, realizedPnl: realized });
      }
      if (no > 0) {
        flat.push({ marketId: market.id, outcome: 'no', shares: no, avgPrice: 0, realizedPnl: realized });
      }
    }
    replaceFromChain(flat);
  }, [query.data, replaceFromChain]);

  useEffect(() => {
    if (query.isError) markStale(true);
  }, [query.isError, markStale]);

  return query;
}

/** 单个市场 + 方向上的持仓（只订阅这一条，避免持仓表整表重渲染） */
export function usePositionFor(marketId: string | undefined, outcome: OutcomeKey): Position | undefined {
  const key = marketId ? positionKey(marketId, outcome) : undefined;
  return usePositionStore((state) => (key ? (state.positions[key] as Position | undefined) : undefined));
}

export function usePositionStoreStatus() {
  return usePositionStore(useShallow((state) => ({ stale: state.stale, hydrated: state.seeded })));
}
