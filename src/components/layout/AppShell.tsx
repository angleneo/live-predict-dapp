'use client';

import { Header } from './Header';
import { PerformanceMonitor } from '@/components/diagnostics/PerformanceMonitor';
import { useRealtimeState } from '@/hooks/useMarketFeed';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const realtime = useRealtimeState();
  const degraded = realtime.status === 'offline' || realtime.status === 'reconnecting';

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {degraded ? (
        <div
          className={cn(
            'border-b px-4 py-1.5 text-center text-xs',
            realtime.status === 'offline'
              ? 'border-bear/30 bg-bear/10 text-bear'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-200',
          )}
        >
          {realtime.status === 'offline'
            ? '实时行情已断开，当前展示最后一次快照，价格可能已过期。'
            : `行情通道重连中（第 ${realtime.attempt} 次）…`}
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">{children}</main>
      <footer className="border-t border-line px-4 py-4 text-center text-[11px] text-muted">
        LivePredict MVP · 直播内容 × Prediction Market · 前端基于合约 ABI 直连链上读写
      </footer>
      <PerformanceMonitor />
    </div>
  );
}
