/**
 * Channel —— 极轻量的外部状态容器
 * ---------------------------------------------------------------------------
 * 设计目标（对应「局部订阅、避免整页 diff」）：
 * 1. 数据存放在 React 之外，高频写入不触发 Provider 树更新；
 * 2. 组件通过 useSyncExternalStore 只订阅自己关心的 key；
 * 3. 只有引用发生变化的频道才会让对应组件重渲染，其他区域完全不动。
 */
export type Unsubscribe = () => void;

export interface Channel<T> {
  readonly key: string;
  getSnapshot: () => T;
  subscribe: (listener: () => void) => Unsubscribe;
  set: (next: T) => void;
  update: (reducer: (prev: T) => T) => void;
  hasSubscribers: () => boolean;
  subscriberCount: () => number;
}

const registry = new Map<string, Channel<never>>();

export function createChannel<T>(key: string, initial: T): Channel<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  const emit = () => {
    // 复制一份，避免监听器在回调里 unsubscribe 造成迭代异常
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (error) {
        console.error(`[channel] "${key}" listener failed`, error);
      }
    }
  };

  return {
    key,
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      emit();
    },
    update: (reducer) => {
      const next = reducer(value);
      if (Object.is(next, value)) return;
      value = next;
      emit();
    },
    hasSubscribers: () => listeners.size > 0,
    subscriberCount: () => listeners.size,
  };
}

/** 全局频道注册表：同一个 key 永远拿到同一个实例（频道单例） */
export function channel<T>(key: string, initial: T): Channel<T> {
  const found = registry.get(key);
  if (found) return found as unknown as Channel<T>;
  const created = createChannel(key, initial);
  registry.set(key, created as unknown as Channel<never>);
  return created;
}

export function peekChannel<T>(key: string): Channel<T> | undefined {
  return registry.get(key) as unknown as Channel<T> | undefined;
}

export function channelKeys() {
  return Array.from(registry.keys());
}

/**
 * 可变环形缓冲：聊天 / 成交这类只增不改的高频列表，
 * 用「数据在 React 之外 + 版本号频道」的方式驱动列表，避免每次追加都重建数组。
 */
export class RingBuffer<T> {
  private store: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T) {
    this.store.push(item);
    const overflow = this.store.length - this.capacity;
    if (overflow > 0) this.store.splice(0, overflow);
  }

  pushMany(items: T[]) {
    for (const item of items) this.push(item);
  }

  /** 稳定引用（内容原地变更），列表渲染需配合版本号频道使用 */
  get items(): readonly T[] {
    return this.store;
  }

  get length() {
    return this.store.length;
  }

  at(index: number): T | undefined {
    return this.store[index];
  }

  /** 需要不可变快照时使用（例如导出、测试） */
  toArray(): T[] {
    return this.store.slice();
  }

  clear() {
    this.store = [];
  }
}
