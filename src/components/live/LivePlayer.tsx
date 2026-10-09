'use client';

import { useEffect, useRef, useState } from 'react';
import { Radio, Users, Sparkles } from 'lucide-react';
import { cn, formatCompact, formatClock } from '@/lib/utils';
import { useLiveStats } from '@/hooks/useMarketFeed';
import { useLiveStoreFps } from '@/hooks/useLiveFps';
import type { LiveStream } from '@/types';

/**
 * 直播播放器
 * ---------------------------------------------------------------------------
 * 性能约束：直播流本身会持续占用主线程（解码 / 绘制），而行情与订单簿也在高频推送。
 * 这里做「帧率控制」：
 * 1. 绘制循环用 rAF 驱动，但按 targetFps 主动跳帧（默认 24，低端机 12），把主线程让给交易面板；
 * 2. 未进入视口 / 页面隐藏时暂停绘制（IntersectionObserver + visibilitychange）；
 * 3. 人气等高频数字通过独立的频道订阅，只在 HUD 内部重渲染，不触碰页面其余部分。
 * 未配置 NEXT_PUBLIC_LIVE_STREAM_URL 时用 Canvas 绘制模拟推流画面。
 */
export function LivePlayer({ live, className }: { live: LiveStream; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stats = useLiveStats(live.id);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const targetFps = useLiveStoreFps();
  const visibleRef = useRef(true);
  /** 真实绘制帧率（不是页面 rAF 帧率）：用来验证跳帧策略确实生效 */
  const [drawFps, setDrawFps] = useState(0);
  const drawCountRef = useRef(0);
  const lastReportRef = useRef(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || live.streamUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastDraw = 0;
    let phase = 0;
    const interval = 1000 / Math.max(1, targetFps);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);

      // 跳帧：距离上一帧不足目标间隔就直接返回，不产生任何绘制开销
      if (ts - lastDraw < interval) return;
      // 不可见 / 标签页隐藏时暂停绘制
      if (!visibleRef.current || document.hidden) {
        lastDraw = ts;
        return;
      }
      lastDraw = ts;
      phase += 0.045;
      drawCountRef.current += 1;

      // 每秒汇报一次真实绘制帧率（只影响 HUD 自身的重渲染）
      if (lastReportRef.current === 0) lastReportRef.current = ts;
      const elapsed = ts - lastReportRef.current;
      if (elapsed >= 1000) {
        setDrawFps(Math.round((drawCountRef.current * 1000) / elapsed));
        drawCountRef.current = 0;
        lastReportRef.current = ts;
      }

      const width = canvas.width;
      const height = canvas.height;

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#12172a');
      gradient.addColorStop(0.5, '#1b1630');
      gradient.addColorStop(1, '#0b1220');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // 移动光带，模拟画面变化
      const bandX = ((phase * 60) % (width + 400)) - 400;
      const bandGradient = ctx.createLinearGradient(bandX, 0, bandX + 400, height);
      bandGradient.addColorStop(0, 'rgba(124,92,255,0)');
      bandGradient.addColorStop(0.5, 'rgba(124,92,255,0.22)');
      bandGradient.addColorStop(1, 'rgba(14,203,129,0)');
      ctx.fillStyle = bandGradient;
      ctx.fillRect(bandX, 0, 400, height);

      // 波形：用主播人气驱动振幅，体现「直播数据 × 行情」的联动
      const amplitude = height * 0.09 + (statsRef.current.viewers % 500) * 0.02;
      ctx.beginPath();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(157,134,255,0.85)';
      for (let x = 0; x <= width; x += 6 * dpr) {
        const y = height * 0.62 + Math.sin(x * 0.008 + phase * 2) * amplitude * Math.sin(phase * 0.7);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 直播画面占位信息
      ctx.fillStyle = 'rgba(226,232,240,0.92)';
      ctx.font = `${Math.round(26 * dpr)}px ui-sans-serif, system-ui`;
      ctx.fillText(live.streamer, 24 * dpr, height - 56 * dpr);
      ctx.fillStyle = 'rgba(139,147,167,0.9)';
      ctx.font = `${Math.round(14 * dpr)}px ui-monospace, monospace`;
      ctx.fillText(`${formatClock(ts)} · ${targetFps}FPS 模拟推流`, 24 * dpr, height - 28 * dpr);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [live.streamer, live.streamUrl, targetFps]);

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden rounded-xl border border-line bg-black', className)}>
      {live.streamUrl ? (
        <video
          className="h-full w-full object-cover"
          src={live.streamUrl}
          autoPlay
          muted
          playsInline
          controls={false}
        />
      ) : (
        <canvas ref={canvasRef} className="h-full w-full" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-md border border-bear/50 bg-bear/15 px-2 py-0.5 text-[11px] font-semibold text-bear backdrop-blur">
            <Radio className="h-3 w-3 animate-pulse-live" />
            LIVE
          </span>
          <span className="rounded-md border border-line bg-black/40 px-2 py-0.5 text-[11px] text-slate-200 backdrop-blur">
            {live.category}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-md border border-line bg-black/40 px-2 py-0.5 text-slate-200 backdrop-blur">
            <Users className="h-3 w-3" />
            <span className="num">{formatCompact(stats.viewers)}</span>
          </span>
          <span className="flex items-center gap-1 rounded-md border border-line bg-black/40 px-2 py-0.5 text-slate-200 backdrop-blur">
            <Sparkles className="h-3 w-3 text-brand-soft" />
            <span className="num">{formatCompact(stats.likes)}</span>
          </span>
          <span className="num rounded-md border border-line bg-black/40 px-2 py-0.5 text-slate-200 backdrop-blur">
            {drawFps} / {targetFps} FPS
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
        <p className="truncate text-xs text-slate-200">{live.title}</p>
        <span className="chip shrink-0 border-line bg-black/50 text-[11px]">
          跳帧绘制 · 目标 {targetFps}FPS
        </span>
      </div>
    </div>
  );
}
