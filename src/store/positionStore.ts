'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeJSONStorage } from './storage';
import { applyFill, positionKey } from '@/lib/trade/math';
import { markets } from '@/lib/mock/catalog';
import type { Position, TradeIntent } from '@/types';

/**
 * 持仓状态
 * ---------------------------------------------------------------------------
 * 采用「链上权威 + 本地乐观覆盖」的双层结构：
 * - chain 层：由链上读到的真实持仓（query 缓存）
 * - local 层：提交交易后立即生效的乐观持仓 + 回滚快照
 *
 * 关键：回滚用的是快照而不是「反向计算」，避免卖出/买入反复叠加后出现精度漂移。
 */

export interface StoredPosition extends Position {
  /** 乐观更新，等待链上确认 */
  pending?: boolean;
}

interface PositionStoreState {
  positions: Record<string, StoredPosition>;
  /** intentId → 变更前的快照，用于失败回滚 */
  history: Record<string, { key: string; before?: StoredPosition }>;
  /** 断连 / 重连期间标记为 stale，恢复后必须重新与链上对齐 */
  stale: boolean;
  seeded: boolean;

  applyOptimistic: (intent: TradeIntent) => void;
  commit: (intentId: string) => void;
  rollback: (intentId: string) => void;

  /** 用链上数据覆盖（保留 pending 的乐观部分） */
  replaceFromChain: (positions: Position[]) => void;
  markStale: (stale: boolean) => void;
  seedDemoPositions: () => void;
  reset: () => void;
}

export const usePositionStore = create<PositionStoreState>()(
  persist(
    (set, get) => ({
      positions: {},
      history: {},
      stale: false,
      seeded: false,

      applyOptimistic: (intent) => {
        const key = positionKey(intent.marketId, intent.outcome);
        const before = get().positions[key];
        const next = applyFill(before, {
          marketId: intent.marketId,
          outcome: intent.outcome,
          side: intent.side,
          shares: intent.shares,
          price: intent.price,
        });

        set((state) => ({
          positions: { ...state.positions, [key]: { ...next, pending: true } },
          history: { ...state.history, [intent.id]: { key, before } },
        }));
      },

      commit: (intentId) =>
        set((state) => {
          const entry = state.history[intentId];
          if (!entry) return state;
          const current = state.positions[entry.key];
          const history = { ...state.history };
          delete history[intentId];
          return {
            positions: current
              ? { ...state.positions, [entry.key]: { ...current, pending: false } }
              : state.positions,
            history,
          };
        }),

      rollback: (intentId) =>
        set((state) => {
          const entry = state.history[intentId];
          if (!entry) return state;
          const positions = { ...state.positions };
          if (entry.before) positions[entry.key] = { ...entry.before, pending: false };
          else delete positions[entry.key];
          const history = { ...state.history };
          delete history[intentId];
          return { positions, history };
        }),

      replaceFromChain: (list) =>
        set((state) => {
          // 乐观中的仓位先留着，等对应 intent 落地后由 commit/rollback 收敛
          const pendingEntries = Object.entries(state.positions).filter(([, value]) => value.pending);
          const next: Record<string, StoredPosition> = {};
          for (const position of list) {
            const key = positionKey(position.marketId, position.outcome);
            next[key] = { ...position, pending: false };
          }
          for (const [key, value] of pendingEntries) next[key] = value;
          return { positions: next, stale: false };
        }),

      markStale: (stale) => set({ stale }),

      seedDemoPositions: () => {
        if (get().seeded) return;
        const first = markets[0];
        const fourth = markets[3];
        const positions: Record<string, StoredPosition> = {};
        if (first) {
          positions[positionKey(first.id, 'yes')] = {
            marketId: first.id,
            outcome: 'yes',
            shares: 320,
            avgPrice: 0.552,
            realizedPnl: 0,
            pending: false,
          };
        }
        if (fourth) {
          positions[positionKey(fourth.id, 'no')] = {
            marketId: fourth.id,
            outcome: 'no',
            shares: 1500,
            avgPrice: 0.612,
            realizedPnl: 46.2,
            pending: false,
          };
        }
        set({ positions, seeded: true });
      },

      reset: () => set({ positions: {}, history: {}, stale: false, seeded: false }),
    }),
    {
      name: 'livepredict.positions',
      storage: createSafeJSONStorage<PositionStoreState>(),
      partialize: (state) =>
        ({
          positions: state.positions,
          history: state.history,
          seeded: state.seeded,
        }) as PositionStoreState,
      version: 1,
    },
  ),
);

export const selectPositionList = (state: PositionStoreState) => Object.values(state.positions);
