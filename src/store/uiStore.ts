'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeJSONStorage } from './storage';

export type ChartRange = '1H' | '4H' | '1D' | 'ALL';
export type BoardTab = 'orderbook' | 'trades' | 'positions';

interface UiState {
  chartRange: ChartRange;
  bookDepth: number;
  boardTab: BoardTab;
  /** 弱网/低端机模式：降低推送帧率与动画开销 */
  liteMode: boolean;
  showDiagnostics: boolean;
  liveFpsTarget: number;

  setChartRange: (range: ChartRange) => void;
  setBookDepth: (depth: number) => void;
  setBoardTab: (tab: BoardTab) => void;
  setLiteMode: (lite: boolean) => void;
  toggleDiagnostics: () => void;
  setLiveFpsTarget: (fps: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      chartRange: '1H',
      bookDepth: 11,
      boardTab: 'orderbook',
      liteMode: false,
      showDiagnostics: false,
      liveFpsTarget: Number(process.env.NEXT_PUBLIC_LIVE_TARGET_FPS || 24),

      // 低端机模式：帧率与深度一起降，优先保证交易面板的响应
      setLiteMode: (lite) =>
        set((state) => ({
          liteMode: lite,
          bookDepth: lite ? 8 : 11,
          liveFpsTarget: lite ? 12 : Number(process.env.NEXT_PUBLIC_LIVE_TARGET_FPS || 24),
          chartRange: state.chartRange,
        })),
      setChartRange: (chartRange) => set({ chartRange }),
      setBookDepth: (bookDepth) => set({ bookDepth }),
      setBoardTab: (boardTab) => set({ boardTab }),
      toggleDiagnostics: () => set((state) => ({ showDiagnostics: !state.showDiagnostics })),
      setLiveFpsTarget: (liveFpsTarget) => set({ liveFpsTarget }),
    }),
    {
      name: 'livepredict.ui',
      storage: createSafeJSONStorage<UiState>(),
      partialize: (state) =>
        ({
          chartRange: state.chartRange,
          bookDepth: state.bookDepth,
          boardTab: state.boardTab,
          liteMode: state.liteMode,
          showDiagnostics: state.showDiagnostics,
          liveFpsTarget: state.liveFpsTarget,
        }) as UiState,
      version: 1,
    },
  ),
);
