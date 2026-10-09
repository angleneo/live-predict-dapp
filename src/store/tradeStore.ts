'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeJSONStorage } from './storage';
import { DEFAULT_SLIPPAGE } from '@/lib/trade/math';
import type { OutcomeKey, TradeIntent, TradeSide, TxStage } from '@/types';

export interface TradeForm {
  outcome: OutcomeKey;
  side: TradeSide;
  /** 买入支持按金额下单，卖出按份额 */
  sizeMode: 'amount' | 'shares';
  amount: string;
  shares: string;
  orderType: 'market' | 'limit';
  limitPrice: string;
  slippage: number;
  /** 仅 Demo 模式：用于验证「失败 / 拒签」这条边界链路 */
  demoOutcome: 'success' | 'revert' | 'reject';
}

export const defaultTradeForm: TradeForm = {
  outcome: 'yes',
  side: 'buy',
  sizeMode: 'amount',
  amount: '100',
  shares: '100',
  orderType: 'market',
  limitPrice: '',
  slippage: DEFAULT_SLIPPAGE,
  demoOutcome: 'success',
};

interface TradeStoreState {
  forms: Record<string, TradeForm>;
  intents: TradeIntent[];
  activeIntentId: string | null;

  setForm: (marketId: string, patch: Partial<TradeForm>) => void;
  resetForm: (marketId: string) => void;

  createIntent: (intent: TradeIntent) => void;
  updateIntent: (id: string, patch: Partial<TradeIntent>) => void;
  setActiveIntent: (id: string | null) => void;
  /** 保留最近 60 条历史，避免持久化体积无限增长 */
  pruneIntents: () => void;
}

const MAX_INTENTS = 60;

export const useTradeStore = create<TradeStoreState>()(
  persist(
    (set) => ({
      forms: {},
      intents: [],
      activeIntentId: null,

      setForm: (marketId, patch) =>
        set((state) => ({
          forms: {
            ...state.forms,
            [marketId]: { ...defaultTradeForm, ...state.forms[marketId], ...patch },
          },
        })),

      resetForm: (marketId) =>
        set((state) => ({
          forms: { ...state.forms, [marketId]: { ...defaultTradeForm, ...state.forms[marketId] } },
        })),

      createIntent: (intent) =>
        set((state) => ({ intents: [intent, ...state.intents].slice(0, MAX_INTENTS), activeIntentId: intent.id })),

      updateIntent: (id, patch) =>
        set((state) => ({
          intents: state.intents.map((intent) =>
            intent.id === id ? { ...intent, ...patch, updatedAt: Date.now() } : intent,
          ),
        })),

      setActiveIntent: (id) => set({ activeIntentId: id }),

      pruneIntents: () =>
        set((state) => ({
          intents: state.intents
            .filter((intent) => {
              const finished = ['success', 'failed', 'rejected'].includes(intent.status);
              return !finished || Date.now() - intent.updatedAt < 1000 * 60 * 60 * 6;
            })
            .slice(0, MAX_INTENTS),
        })),
    }),
    {
      name: 'livepredict.trade',
      storage: createSafeJSONStorage<TradeStoreState>(),
      partialize: (state) => ({ forms: state.forms, intents: state.intents }) as TradeStoreState,
      version: 1,
    },
  ),
);

// --------------------------- selectors ---------------------------

export const selectTradeForm = (marketId: string) => (state: TradeStoreState): TradeForm =>
  ({ ...defaultTradeForm, ...state.forms[marketId] }) as TradeForm;

export const selectActiveIntent = (marketId: string) => (state: TradeStoreState): TradeIntent | undefined =>
  state.intents.find((intent) => intent.marketId === marketId);

export const selectUnsettledIntents = (state: TradeStoreState): TradeIntent[] =>
  state.intents.filter((intent) => (['awaiting_signature', 'pending', 'confirming'] as TxStage[]).includes(intent.status));

export function isStageBusy(stage: TxStage | undefined) {
  return stage === 'awaiting_signature' || stage === 'pending' || stage === 'confirming' || stage === 'reviewing';
}
