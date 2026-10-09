'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Channel } from '@/lib/realtime/hub';
import { subscribeChannel } from '@/lib/realtime';

/**
 * 订阅单个频道。
 * 只订阅自己关心的 key —— 这是「局部订阅、避免整页 diff」的落点：
 * 行情变了只重渲染行情组件，弹幕刷屏不会影响交易面板。
 */
export function useChannel<T>(ch: Channel<T>): T {
  return useSyncExternalStore(ch.subscribe, ch.getSnapshot, ch.getSnapshot);
}

/** 向实时层登记订阅（WebSocket 模式下才真正下发 subscribe / resync 指令） */
export function useTopicSubscription(channelKey: string, resync?: () => void) {
  const resyncRef = useRef(resync);
  resyncRef.current = resync;

  useEffect(() => {
    const dispose = subscribeChannel(channelKey, () => resyncRef.current?.());
    return () => dispose();
  }, [channelKey]);
}
