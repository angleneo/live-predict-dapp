'use client';

import { useEffect, useRef, useState } from 'react';

export interface FrameStats {
  fps: number;
  /** 采样窗口内最差的一帧耗时（ms），用于发现长任务卡顿 */
  worstFrameMs: number;
  longFrames: number;
}

/**
 * 帧率探针
 * ---------------------------------------------------------------------------
 * 与业务渲染共用同一个 rAF 时间轴，用来验证「帧率控制」策略的实际效果：
 * 多通道高频推送下，如果仍能稳定在目标 FPS，说明合并/限流生效。
 */
export function useFrameRate(active = true, sampleMs = 1000): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ fps: 0, worstFrameMs: 0, longFrames: 0 });
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let worst = 0;
    let longFrames = 0;
    let windowStart = performance.now();
    let last = windowStart;

    const loop = (ts: number) => {
      rafId = requestAnimationFrame(loop);
      if (!activeRef.current) {
        windowStart = ts;
        last = ts;
        frames = 0;
        worst = 0;
        longFrames = 0;
        return;
      }

      const delta = ts - last;
      last = ts;
      frames += 1;
      if (delta > worst) worst = delta;
      // 一帧超过 33ms 视为长帧（低于 30FPS 的体感线）
      if (delta > 33) longFrames += 1;

      if (ts - windowStart >= sampleMs) {
        const fps = (frames * 1000) / (ts - windowStart);
        setStats({
          fps: Math.round(fps * 10) / 10,
          worstFrameMs: Math.round(worst * 10) / 10,
          longFrames,
        });
        frames = 0;
        worst = 0;
        longFrames = 0;
        windowStart = ts;
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [sampleMs]);

  return stats;
}
