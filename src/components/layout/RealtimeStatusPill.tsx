'use client';

import { useRealtimeState } from '@/hooks/useMarketFeed';
import { cn } from '@/lib/utils';

/** 链路状态胶囊：实时反映 WebSocket 连接质量，异常时给出明确文案 */
export function RealtimeStatusPill() {
  const state = useRealtimeState();

  const label =
    state.status === 'connected'
      ? state.source === 'mock'
        ? 'Mock 实时源'
        : `实时 ${state.latencyMs !== undefined ? `${state.latencyMs}ms` : 'WS'}`
      : state.status === 'reconnecting'
        ? `重连中 (${state.attempt})`
        : state.status === 'offline'
          ? '已离线'
          : state.status === 'connecting'
            ? '连接中'
            : '未连接';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]',
        state.status === 'connected'
          ? 'border-bull/40 bg-bull/10 text-bull'
          : state.status === 'reconnecting' || state.status === 'connecting'
            ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
            : 'border-bear/40 bg-bear/10 text-bear',
      )}
      title={state.lastError}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state.status === 'connected' ? 'animate-pulse-live bg-bull' : 'bg-current',
        )}
      />
      {label}
    </span>
  );
}
