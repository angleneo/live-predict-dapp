'use client';

import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { PricePoint } from '@/types';

/**
 * 轻量迷你走势图（纯 SVG）
 * 相比 ECharts 实例，首页列表里几十个卡片用它更划算：无 canvas、无实例开销。
 */
export const MiniSparkline = memo(function MiniSparkline({
  points,
  outcome = 'yes',
  className,
  width = 120,
  height = 34,
}: {
  points: readonly PricePoint[];
  outcome?: 'yes' | 'no';
  className?: string;
  width?: number;
  height?: number;
}) {
  const { path, area, up } = useMemo(() => {
    if (points.length < 2) return { path: '', area: '', up: true };
    const values = points.map((point) => (outcome === 'yes' ? point.yes : point.no));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 0.01;
    const stepX = width / (values.length - 1);

    const coords = values.map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const line = `M${coords.join(' L')}`;
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    return {
      path: line,
      area: `${line} L${width},${height} L0,${height} Z`,
      up: last >= first,
    };
  }, [height, outcome, points, width]);

  const stroke = up ? '#0ecb81' : '#f6465d';

  return (
    <svg width={width} height={height} className={cn('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`spark-${outcome}-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#spark-${outcome}-${up ? 'u' : 'd'})`} /> : null}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
});
