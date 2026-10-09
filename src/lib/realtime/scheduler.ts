import type { Channel } from './hub';

/**
 * 帧率调度器
 * ---------------------------------------------------------------------------
 * 问题：直播流 + 行情 + 订单簿 + 成交流多通道并发时，每个 WebSocket 消息都直接 setState
 *      会造成每帧多次渲染、甚至整页 diff，掉帧严重。
 * 方案：按「频道 key」对更新做合并（只保留最后一次）并按目标 FPS 限流，
 *      同一 key 在一个时间片内最多触发一次 React 更新。
 */
type Task = { fn: () => void; due: number };

const tasks = new Map<string, Task>();
const lastRun = new Map<string, number>();

let targetFps = Number(process.env.NEXT_PUBLIC_LIVE_TARGET_FPS || 30);
let minInterval = 1000 / targetFps;

let rafId: number | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function setScheduleFps(fps: number) {
  targetFps = Math.max(1, Math.min(120, Math.floor(fps)));
  minInterval = 1000 / targetFps;
}

export function getScheduleFps() {
  return targetFps;
}

function pump() {
  rafId = null;
  timeoutId = null;

  const current = now();
  let earliest = Infinity;

  // 先收集：fn 执行过程中可能又 schedule 新任务，不能在遍历中直接改 map
  for (const key of Array.from(tasks.keys())) {
    const task = tasks.get(key);
    if (!task) continue;

    const elapsed = current - (lastRun.get(key) ?? -Infinity);
    if (elapsed >= minInterval) {
      tasks.delete(key);
      lastRun.set(key, current);
      try {
        task.fn();
      } catch (error) {
        // 单个频道的异常不能拖垮整条更新链路
        console.error(`[scheduler] channel "${key}" failed`, error);
      }
    } else {
      earliest = Math.min(earliest, minInterval - elapsed);
    }
  }

  if (tasks.size > 0) {
    if (earliest <= 20) {
      rafId = requestAnimationFrame(pump);
    } else {
      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(pump);
      }, Math.max(1, earliest));
    }
  }
}

/** 合并 + 限流地提交一次更新 */
export function scheduleWrite(key: string, fn: () => void) {
  tasks.set(key, { fn, due: now() + minInterval });
  if (rafId == null && timeoutId == null) {
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(pump);
    } else {
      timeoutId = setTimeout(pump, minInterval);
    }
  }
}

/** 立即执行所有挂起任务（断连重连、快照覆盖、页面卸载前使用） */
export function flushSchedule() {
  if (rafId != null) cancelAnimationFrame(rafId);
  if (timeoutId != null) clearTimeout(timeoutId);
  rafId = null;
  timeoutId = null;
  const current = now();
  for (const [key, task] of Array.from(tasks.entries())) {
    tasks.delete(key);
    lastRun.set(key, current);
    try {
      task.fn();
    } catch (error) {
      console.error(`[scheduler] flush "${key}" failed`, error);
    }
  }
}

export function dropSchedule(key: string) {
  tasks.delete(key);
  lastRun.delete(key);
}

/**
 * 把高频写入绑定到频道：同 key 的多次写入在一个时间片内只落地最后一次。
 */
export function bindChannel<T>(channelKey: string, ch: Channel<T>, reduce: () => (prev: T) => T) {
  scheduleWrite(channelKey, () => ch.update(reduce()));
}
