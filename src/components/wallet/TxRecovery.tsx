'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAccount, usePublicClient } from 'wagmi';
import { demoMode } from '@/lib/contracts/addresses';
import { usePositionStore } from '@/store/positionStore';
import { useTradeStore } from '@/store/tradeStore';
import type { TradeIntent } from '@/types';

const UNSETTLED = new Set(['pending', 'confirming', 'unknown']);
/** 超过这个时间还没有 hash / 回执，就认为本次意图已经失效 */
const SIGNATURE_EXPIRY_MS = 2 * 60_000;
const RECEIPT_WAIT_MS = 3 * 60_000;

/**
 * 交易对账（TxRecovery）
 * ---------------------------------------------------------------------------
 * 这是「数据一致性」的最后一公里：
 * 用户可能在签名阶段断开钱包、可能在等待回执时刷新页面、也可能网络抖动导致
 * 前端根本没拿到回执。这些 intent 会以 pending / unknown 状态持久化在本地，
 * 等钱包恢复连接后，用 txHash 去链上核对真实结果：
 *   - 成功 → 提交乐观持仓
 *   - revert → 回滚乐观持仓
 *   - 查不到且已超时 → 判定为未上链，回滚
 * 原则：状态未知时绝不抢先回滚，宁可多等一轮。
 */
export function TxRecovery() {
  const { status, address } = useAccount();
  const publicClient = usePublicClient();
  const intents = useTradeStore((state) => state.intents);
  const updateIntent = useTradeStore((state) => state.updateIntent);
  const pruneIntents = useTradeStore((state) => state.pruneIntents);
  const commit = usePositionStore((state) => state.commit);
  const rollback = usePositionStore((state) => state.rollback);
  const running = useRef(false);

  useEffect(() => {
    pruneIntents();
  }, [pruneIntents]);

  useEffect(() => {
    if (status !== 'connected' || !address) return;

    const unsettled = intents.filter((intent) => UNSETTLED.has(intent.status));
    if (!unsettled.length || running.current) return;

    running.current = true;
    let cancelled = false;

    const reconcile = async (intent: TradeIntent) => {
      if (cancelled) return;
      const age = Date.now() - intent.createdAt;

      if (demoMode) {
        // Demo：等模拟生命周期跑完（或超时）后按预期结果落账
        if (age < 4000) return;
        if (intent.demoOutcome === 'revert') {
          rollback(intent.id);
          updateIntent(intent.id, { status: 'failed', error: '模拟链上 revert：滑点超出保护范围' });
          toast.warning('已恢复：交易失败', { description: '乐观持仓已回滚' });
          return;
        }
        if (intent.demoOutcome === 'reject') {
          rollback(intent.id);
          updateIntent(intent.id, { status: 'rejected', error: '用户取消了签名' });
          toast.info('已恢复：订单未提交');
          return;
        }
        commit(intent.id);
        updateIntent(intent.id, { status: 'success' });
        toast.success('已恢复：交易在链上确认成功');
        return;
      }

      if (!intent.txHash) {
        if (age > SIGNATURE_EXPIRY_MS) {
          rollback(intent.id);
          updateIntent(intent.id, { status: 'failed', error: '签名超时未完成' });
          toast.info('已恢复：未收到签名，订单已取消');
        }
        return;
      }

      try {
        const receipt = await publicClient?.getTransactionReceipt({ hash: intent.txHash as `0x${string}` });
        if (!receipt) return;
        if (receipt.status === 'success') {
          commit(intent.id);
          updateIntent(intent.id, { status: 'success' });
          toast.success('已恢复：链上交易成功');
        } else {
          rollback(intent.id);
          updateIntent(intent.id, { status: 'failed', error: '交易回执为失败' });
          toast.error('已恢复：链上交易失败，持仓已回滚');
        }
      } catch (error) {
        if (age > RECEIPT_WAIT_MS) {
          rollback(intent.id);
          updateIntent(intent.id, { status: 'failed', error: '超过等待时间仍未上链' });
          toast.error('已恢复：交易长时间未上链，持仓已回滚');
        } else if (process.env.NODE_ENV !== 'production') {
          console.warn('[tx-recovery] 回执暂不可用，稍后重试', error);
        }
      }
    };

    void (async () => {
      for (const intent of unsettled) await reconcile(intent);
      running.current = false;
    })();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [address, commit, intents, publicClient, rollback, status, updateIntent]);

  return null;
}
