'use client';

import { useUiStore } from '@/store/uiStore';

/** 直播目标帧率（来源：低端机模式 / 环境变量），单独抽出来避免组件订阅整个 UI store */
export function useLiveStoreFps() {
  return useUiStore((state) => state.liveFpsTarget);
}
