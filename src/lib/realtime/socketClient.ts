import { dispatchRemoteMessage, markRealtimeState, subscribedChannelKeys } from './topics';

/**
 * WebSocket 客户端（可用于行情 / 订单簿 / 成交流 / 弹幕多通道）
 * ---------------------------------------------------------------------------
 * 关注的边界场景：
 * 1. 断线重连：指数退避 + 抖动，避免服务端抖动时被客户端放大成雪崩；
 * 2. 半开连接：心跳 ping/pong + 静默超时判定，主动 kill 后重连；
 * 3. 重连后数据一致：自动重新订阅，并请求一次 snapshot 覆盖本地增量状态（resync）；
 * 4. 切换前后台：由 bootstrap 层在 visibilitychange / online 事件时主动 ensureConnected。
 */

export type ServerMessage =
  | { op: 'snapshot' | 'delta'; channel: string; payload: unknown; seq?: number; ts?: number }
  | { op: 'pong'; ts?: number }
  | { op: 'error'; message: string };

export interface RealtimeClientOptions {
  /** 最大重连次数（超过后进入 offline，等待外部/网络事件唤醒） */
  maxAttempts?: number;
  /** 心跳间隔 */
  heartbeatMs?: number;
  /** 静默超时：超过该时间没收到任何消息则判定为半开连接 */
  staleMs?: number;
  /** 重连成功后的回调（用于重新拉取链上数据 / 让 UI 提示） */
  onReconnect?: (attempt: number) => void;
}

const defaultOptions: Required<Omit<RealtimeClientOptions, 'onReconnect'>> = {
  maxAttempts: 8,
  heartbeatMs: 15_000,
  staleMs: 45_000,
};

type Resync = () => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private options: Required<Omit<RealtimeClientOptions, 'onReconnect'>> & RealtimeClientOptions;
  private attempt = 0;
  private stopped = false;
  private lastMessageAt = 0;
  private pingSentAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 期望订阅的频道 → 重连后重新请求快照的回调 */
  private desired = new Map<string, Set<Resync>>();
  private outbox: string[] = [];

  constructor(private readonly url: string, options: RealtimeClientOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    if (typeof window === 'undefined' || this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    markRealtimeState({
      status: this.attempt > 0 ? 'reconnecting' : 'connecting',
      source: 'websocket',
      attempt: this.attempt,
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (error) {
      this.scheduleReconnect(error instanceof Error ? error.message : 'WebSocket 构造失败');
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      const wasReconnect = this.attempt > 0;
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      markRealtimeState({ status: 'connected', source: 'websocket', attempt: 0, lastError: undefined });
      this.startHeartbeat();

      // 1) 重新订阅所有期望频道 2) 请求快照，用服务端权威数据覆盖本地增量
      for (const channelKey of this.desired.keys()) this.sendRaw({ op: 'subscribe', channel: channelKey });
      this.outbox.forEach((raw) => this.sendRawRaw(raw));
      this.outbox = [];
      for (const [channelKey, callbacks] of this.desired) {
        this.sendRaw({ op: 'resync', channel: channelKey });
        callbacks.forEach((fn) => fn());
      }

      if (wasReconnect) this.options.onReconnect?.(this.attempt);
    };

    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        console.warn('[realtime] 无法解析的服务端消息', event.data);
        return;
      }

      if (message.op === 'pong') {
        const latency = this.pingSentAt ? Date.now() - this.pingSentAt : undefined;
        markRealtimeState({ latencyMs: latency, lastMessageAt: Date.now() });
        return;
      }
      if (message.op === 'error') {
        console.error('[realtime] 服务端返回错误', message.message);
        return;
      }

      markRealtimeState({ lastMessageAt: Date.now() });
      dispatchRemoteMessage(message.channel, message.payload, message.op === 'snapshot' ? 'snapshot' : 'delta');
    };

    socket.onerror = () => {
      // onerror 之后浏览器一定会触发 onclose，重连逻辑统一放在 onclose 里
      markRealtimeState({ lastError: '连接异常' });
    };

    socket.onclose = (event) => {
      this.stopHeartbeat();
      this.ws = null;
      if (this.stopped) return;
      this.scheduleReconnect(event.reason || `连接关闭(code=${event.code})`);
    };
  }

  /** 从后台/离线恢复时调用，可立即发起重连而不等待退避计时器 */
  ensureConnected() {
    if (this.connected) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
    this.connect();
  }

  disconnect() {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    markRealtimeState({ status: 'idle' });
  }

  /**
   * 声明式订阅：同频道的多个组件共享一个订阅，
   * 全部取消后才会真正发 unsubscribe，避免重复收发。
   */
  subscribe(channelKey: string, resync?: Resync) {
    let callbacks = this.desired.get(channelKey);
    const isNew = !callbacks;
    if (!callbacks) {
      callbacks = new Set();
      this.desired.set(channelKey, callbacks);
    }
    if (resync) callbacks.add(resync);

    if (isNew) {
      if (this.connected) this.sendRaw({ op: 'subscribe', channel: channelKey });
      else this.sendRaw({ op: 'subscribe', channel: channelKey }); // 未连接时进入 outbox，连接后补发
    }

    return () => {
      const set = this.desired.get(channelKey);
      if (!set) return;
      if (resync) set.delete(resync);
      if (set.size === 0) {
        this.desired.delete(channelKey);
        this.sendRaw({ op: 'unsubscribe', channel: channelKey });
      }
    };
  }

  /** 页面卸载前批量退订 */
  unsubscribeAll() {
    for (const channelKey of this.desired.keys()) this.sendRaw({ op: 'unsubscribe', channel: channelKey });
    this.desired.clear();
  }

  /** 网络恢复 / 重连后，请求所有「当前真的有订阅者」的频道快照 */
  resyncAll() {
    const keys = subscribedChannelKeys();
    for (const channelKey of keys) {
      this.sendRaw({ op: 'resync', channel: channelKey });
      this.desired.get(channelKey)?.forEach((fn) => fn());
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      this.pingSentAt = Date.now();
      this.sendRaw({ op: 'ping', ts: this.pingSentAt });

      // 半开连接：TCP 还在但服务端已经不回消息，靠静默超时主动重连
      if (Date.now() - this.lastMessageAt > this.options.staleMs) {
        markRealtimeState({ lastError: '心跳超时，正在重连' });
        this.ws?.close(4000, 'heartbeat timeout');
      }
    }, this.options.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect(reason: string) {
    if (this.stopped) return;
    this.attempt += 1;

    if (this.attempt > this.options.maxAttempts) {
      markRealtimeState({ status: 'offline', attempt: this.attempt, lastError: reason });
      return;
    }

    // 指数退避 + 抖动：1s → 2s → 4s …（上限 20s），抖动 ±30%
    const base = Math.min(1000 * 2 ** (this.attempt - 1), 20_000);
    const jitter = base * 0.3 * (Math.random() * 2 - 1);
    const delay = Math.max(500, Math.round(base + jitter));

    markRealtimeState({ status: 'reconnecting', attempt: this.attempt, lastError: reason });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private sendRaw(payload: Record<string, unknown>) {
    const raw = JSON.stringify(payload);
    if (!this.connected) {
      if (this.outbox.length < 100) this.outbox.push(raw);
      return;
    }
    this.sendRawRaw(raw);
  }

  private sendRawRaw(raw: string) {
    try {
      this.ws?.send(raw);
    } catch (error) {
      console.warn('[realtime] 发送失败', error);
    }
  }
}
