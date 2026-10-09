import { RealtimeClient } from './socketClient';
import { MockRealtimeSource } from './mockSource';
import { markRealtimeState } from './topics';
import { flushSchedule } from './scheduler';
import { channelKeys, peekChannel } from './hub';

/**
 * 实时层启动入口
 * ---------------------------------------------------------------------------
 * 有 NEXT_PUBLIC_WS_URL → 走真实 WebSocket（自动重连 / 心跳 / 重订阅 / resync）
 * 没有 → 自动降级到内置 Mock 数据源，保证无后端也能完整跑通交互。
 */

let client: RealtimeClient | null = null;
let mockSource: MockRealtimeSource | null = null;
let booted = false;

export function getRealtimeClient() {
  return client;
}

export function subscribeChannel(channelKey: string, resync?: () => void) {
  if (!client) return () => {};
  return client.subscribe(channelKey, resync);
}

export function bootstrapRealtime() {
  if (booted || typeof window === 'undefined') return () => {};
  booted = true;

  const url = (process.env.NEXT_PUBLIC_WS_URL || '').trim();
  const onOnline = () => client?.ensureConnected();
  const onVisible = () => {
    if (document.visibilityState === 'visible') client?.ensureConnected();
  };

  if (url) {
    client = new RealtimeClient(url, {
      onReconnect: () => {
        // 重连成功后：本地增量状态可能已经过期，用服务端快照覆盖
        client?.resyncAll();
        flushSchedule();
      },
    });
    client.connect();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    document.addEventListener('visibilitychange', onVisible);
  } else {
    mockSource = new MockRealtimeSource();
    mockSource.start();
    markRealtimeState({ status: 'connected', source: 'mock', attempt: 0 });
  }

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    client?.unsubscribeAll();
    client?.disconnect();
    client = null;
    mockSource?.stop();
    mockSource = null;
    booted = false;
  };
}

/**
 * 主动模拟一次连接中断，用于验证断线重连 / 快照重放链路。
 * - WebSocket 模式：直接关闭连接，触发退避重连 → 重订阅 → resync
 * - Mock 模式：暂停数据源并标记 offline，恢复时重新推送
 */
export function simulateConnectionLoss(durationMs = 4000) {
  if (client) {
    client.disconnect();
    markRealtimeState({ status: 'reconnecting', attempt: 1, lastError: '手动模拟断连' });
    setTimeout(() => client?.ensureConnected(), durationMs);
    return;
  }

  if (mockSource) {
    mockSource.stop();
    markRealtimeState({ status: 'offline', source: 'mock', lastError: '手动模拟断连' });
    setTimeout(() => {
      mockSource?.start();
      markRealtimeState({ status: 'connected', source: 'mock', lastError: undefined });
    }, durationMs);
  }
}

/** 诊断用：各频道订阅人数与最新序号（验证「只订阅可视区域」确实生效） */
export function getChannelStats() {
  return channelKeys()
    .map((key) => {
      const ch = peekChannel<unknown>(key);
      const snapshot = ch?.getSnapshot();
      const meta = (snapshot ?? {}) as { seq?: number; ts?: number; marketId?: string };
      return {
        key,
        subscribers: ch?.subscriberCount() ?? 0,
        seq: meta.seq,
        ts: meta.ts,
      };
    })
    .sort((a, b) => b.subscribers - a.subscribers);
}

export * from './topics';
export { flushSchedule, setScheduleFps, getScheduleFps } from './scheduler';
