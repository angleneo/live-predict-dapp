'use client';

import { useEffect } from 'react';
import { useChannel } from '@/hooks/useChannel';
import { useLocalPositions } from '@/hooks/usePositions';
import { portfolioSummaryChannel, syncPortfolio } from '@/lib/portfolio/aggregator';

/** 组合汇总：整页只订阅一个频道，价格高频跳动不会引发整表重渲染 */
export function usePortfolio() {
  const positions = useLocalPositions();
  const summary = useChannel(portfolioSummaryChannel);

  useEffect(() => {
    syncPortfolio(positions);
  }, [positions]);

  return { positions, summary };
}
