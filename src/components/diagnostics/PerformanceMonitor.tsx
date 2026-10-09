'use client';

import { useEffect, useState } from 'react';
import { Activity, Wifi, WifiOff, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeState } from '@/hooks/useMarketFeed';
import { useFrameRate } from '@/hooks/useFrameRate';
import { useUiStore } from '@/store/uiStore';
import { getChannelStats, getScheduleFps, setScheduleFps, simulateConnectionLoss } from '@/lib/realtime';
import { Pill, Segmented } from '@/components/common/Panel';
import { demoMode } from '@/lib/contracts/addresses';

/**
 * 性能与链路诊断面板
 * ---------------------------------------------------------------------------
 * 用来把「渲染性能优化」变成可观测的数字：
 * - FPS / 最差帧耗时 / 长帧数量：验证帧率控制是否生效；
 * - 频道订阅人数：验证局部订阅（不可见的市场不该有人订阅）；
 * - 实时链路状态：验证断线重连与快照重放。
 */
export function PerformanceMonitor() {
  const show = useUiStore((state) => state.showDiagnostics);
  const toggle = useUiStore((state) => state.toggleDiagnostics);
  const liteMode = useUiStore((state) => state.liteMode);
  const setLiteMode = useUiStore((state) => state.setLiteMode);
  const realtime = useRealtimeState();
  const frames = useFrameRate(show);
  const [fpsTarget, setFpsTarget] = useState(() => getScheduleFps());
  const [channels, setChannels] = useState<ReturnType<typeof getChannelStats>>([]);

  useEffect(() => {
    if (!show) return;
    const timer = setInterval(() => setChannels(getChannelStats()), 1000);
    setChannels(getChannelStats());
    return () => clearInterval(timer);
  }, [show]);

  if (!show) return null;

  const subscribed = channels.filter((channel) => channel.subscribers > 0);

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-bg-card/95 p-3 text-xs shadow-2xl backdrop-blur">
      <header className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-slate-200">
          <Activity className="h-3.5 w-3.5 text-brand-soft" />
          性能与链路诊断
        </span>
        <button className="text-muted hover:text-slate-200" onClick={toggle}>
          收起
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-bg-soft p-2">
        <Metric label="FPS" value={frames.fps.toFixed(1)} tone={frames.fps >= fpsTarget * 0.85 ? 'up' : 'warn'} />
        <Metric label="最差帧" value={`${frames.worstFrameMs}ms`} tone={frames.worstFrameMs > 33 ? 'warn' : 'ok'} />
        <Metric label="长帧数" value={String(frames.longFrames)} tone={frames.longFrames > 3 ? 'warn' : 'ok'} />
      </div>

      <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-bg-soft p-2">
        <Row label="实时通道">
          <span className="flex items-center gap-1">
            {realtime.status === 'connected' ? (
              <Wifi className="h-3 w-3 text-bull" />
            ) : (
              <WifiOff className="h-3 w-3 text-bear" />
            )}
            {realtime.source === 'mock' ? '内置 Mock 源' : 'WebSocket'}
            <span className="text-muted">· {realtime.status}</span>
          </span>
        </Row>
        <Row label="重连次数">
          <span className={cn(realtime.attempt > 0 && 'text-amber-300')}>{realtime.attempt}</span>
        </Row>
        <Row label="往返延迟">
          <span>{realtime.latencyMs !== undefined ? `${realtime.latencyMs}ms` : '—'}</span>
        </Row>
        {realtime.lastError ? (
          <Row label="最近异常">
            <span className="text-amber-300">{realtime.lastError}</span>
          </Row>
        ) : null}
        <Row label="合约模式">
          <Pill tone={demoMode ? 'brand' : 'up'}>{demoMode ? 'Demo（未部署）' : '链上真实读写'}</Pill>
        </Row>
      </div>

      <div className="mt-2 rounded-lg border border-line bg-bg-soft p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-muted">已订阅频道（{subscribed.length}/{channels.length}）</span>
          <span className="text-muted">局部订阅</span>
        </div>
        <div className="scroll-thin max-h-32 space-y-1 overflow-y-auto">
          {subscribed.map((channel) => (
            <div key={channel.key} className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-slate-300">{channel.key}</span>
              <span className="num shrink-0 text-[11px] text-muted">×{channel.subscribers}</span>
            </div>
          ))}
          {subscribed.length === 0 ? <p className="text-[11px] text-muted">当前没有活跃订阅</p> : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted" title="行情/订单簿等数据通道的合并落地帧率">
          数据通道帧率
        </span>
        <Segmented
          size="sm"
          value={String(fpsTarget)}
          onChange={(value) => {
            const fps = Number(value);
            setFpsTarget(fps);
            setScheduleFps(fps);
          }}
          options={[
            { value: '12', label: '12' },
            { value: '24', label: '24' },
            { value: '30', label: '30' },
            { value: '60', label: '60' },
          ]}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn-ghost flex-1 py-1.5 text-[11px]" onClick={() => simulateConnectionLoss()}>
          <Zap className="h-3 w-3" />
          模拟断线 4s
        </button>
        <button
          type="button"
          className={cn('btn-ghost flex-1 py-1.5 text-[11px]', liteMode && 'border-brand/40 text-brand-soft')}
          onClick={() => setLiteMode(!liteMode)}
        >
          {liteMode ? '低端机模式：开' : '低端机模式：关'}
        </button>
      </div>
    </aside>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'up' | 'warn' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          'num text-sm font-semibold',
          tone === 'up' && 'text-bull',
          tone === 'warn' && 'text-amber-300',
          tone === 'ok' && 'text-slate-100',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1 text-slate-200">{children}</span>
    </div>
  );
}
