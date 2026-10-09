'use client';

import { useAccount, useReadContract } from 'wagmi';
import { erc20Abi } from '@/lib/contracts/abi';
import { collateralDecimals, contracts, isContractConfigured } from '@/lib/contracts/addresses';

const DEMO_BALANCE = 12_450.32;

/** 结算资产余额（Demo 模式下返回演示余额，保证交互可完整走通） */
export function useCollateralBalance() {
  const { address } = useAccount();
  const query = useReadContract({
    address: contracts.collateral,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && isContractConfigured,
      refetchInterval: 20_000,
      staleTime: 10_000,
    },
  });

  if (!isContractConfigured) {
    return { value: DEMO_BALANCE, isLoading: false, isDemo: true as const };
  }

  return {
    value: query.data === undefined ? 0 : Number(query.data) / 10 ** collateralDecimals,
    isLoading: query.isLoading,
    isDemo: false as const,
  };
}
