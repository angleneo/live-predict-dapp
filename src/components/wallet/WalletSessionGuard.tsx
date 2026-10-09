'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { demoMode } from '@/lib/contracts/addresses';
import { usePositionStore } from '@/store/positionStore';
import { flushSchedule } from '@/lib/realtime';

/**
 * 钱包会话守门人
 * ---------------------------------------------------------------------------
 * 负责「断连 → 重连 → 切账户」这三种最容易出现脏数据的时刻：
 * - 断开：把持仓标记 stale，清掉链上查询缓存，避免展示过期价格；
 * - 重连：失效所有链上查询强制重取，并 flush 一次被限流的更新；
 * - 切账户：本地乐观持仓属于旧账户，必须整体重置（Demo 模式下重新播种）。
 */
export function WalletSessionGuard() {
  const { status, address } = useAccount();
  const queryClient = useQueryClient();
  const markStale = usePositionStore((state) => state.markStale);
  const seedDemoPositions = usePositionStore((state) => state.seedDemoPositions);
  const reset = usePositionStore((state) => state.reset);

  const prevStatus = useRef(status);
  const prevAddress = useRef<string | undefined>(address);

  // Demo 模式：首次进入播种演示持仓，让持仓页不是空的
  useEffect(() => {
    if (demoMode) seedDemoPositions();
  }, [seedDemoPositions]);

  useEffect(() => {
    const previousStatus = prevStatus.current;
    const previousAddress = prevAddress.current;

    // 账户切换：旧账户的乐观状态必须丢弃
    if (previousAddress && address && previousAddress.toLowerCase() !== address.toLowerCase()) {
      reset();
      if (demoMode) seedDemoPositions();
      queryClient.clear();
      toast.info('已切换账户，本地持仓已重新同步');
    }

    if (previousStatus !== status) {
      if (status === 'disconnected' && previousStatus === 'connected') {
        markStale(true);
        queryClient.removeQueries({ queryKey: ['positions'] });
      }

      if (status === 'connected' && (previousStatus === 'disconnected' || previousStatus === 'reconnecting')) {
        markStale(false);
        void queryClient.invalidateQueries();
        // 重连瞬间把积压的行情更新一次性提交，避免逐帧抖动
        flushSchedule();
      }
    }

    prevStatus.current = status;
    prevAddress.current = address;
  }, [address, markStale, queryClient, reset, seedDemoPositions, status]);

  return null;
}
