'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePriceSeries } from '@/hooks/useMarketFeed';
import { useUiStore, type ChartRange } from '@/store/uiStore';
import { Segmented } from '@/components/common/Panel';
import { formatCents } from '@/lib/utils';
import type { Market } from '@/types';

// echarts-for-react 只在客户端加载：避免 SSR 阶段把 canvas 相关代码打进服务端 bundle
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const RANGE_MS: Record<ChartRange, number> = {
  '1H': 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
  ALL: Number.MAX_SAFE_INTEGER,
};

/**
 * 价格走势图
 * ---------------------------------------------------------------------------
 * - 独立订阅 series 频道，图表更新不会触发交易面板/订单簿重渲染；
 * - animation 关闭 + 只保留必要组件，降低高频 setOption 的开销；
 * - 数据源按 2 秒一个点节流（在 ingest 层完成），避免图表被逐帧刷新。
 */
export function PriceChart({ market, height = 260 }: { market: Market; height?: number }) {
  const series = usePriceSeries(market.id);
  const chartRange = useUiStore((state) => state.chartRange);
  const setChartRange = useUiStore((state) => state.setChartRange);

  const option = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[chartRange];
    const points = series.filter((point) => point.ts >= cutoff);
    const times = points.map((point) => new Date(point.ts).toLocaleTimeString('zh-CN', { hour12: false }));

    return {
      animation: false,
      grid: { left: 10, right: 12, top: 24, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(19,23,34,0.95)',
        borderColor: '#232a3b',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        valueFormatter: (value: number) => formatCents(value, 1),
      },
      legend: {
        right: 0,
        top: 0,
        icon: 'roundRect',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#8b93a7', fontSize: 11 },
        data: ['YES', 'NO'],
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#232a3b' } },
        axisLabel: { color: '#8b93a7', fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: (value: { min: number }) => Math.max(0, Math.floor((value.min - 0.03) * 100) / 100),
        max: (value: { max: number }) => Math.min(1, Math.ceil((value.max + 0.03) * 100) / 100),
        axisLabel: { color: '#8b93a7', fontSize: 10, formatter: (value: number) => `${(value * 100).toFixed(0)}¢` },
        splitLine: { lineStyle: { color: 'rgba(35,42,59,0.7)' } },
      },
      series: [
        {
          name: 'YES',
          type: 'line',
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.6, color: '#0ecb81' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(14,203,129,0.28)' },
                { offset: 1, color: 'rgba(14,203,129,0)' },
              ],
            },
          },
          data: points.map((point) => point.yes),
        },
        {
          name: 'NO',
          type: 'line',
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.4, color: '#f6465d', type: 'dashed' },
          data: points.map((point) => point.no),
        },
      ],
    };
  }, [chartRange, series]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-muted">
          共 {series.length} 个采样点 · 2s 采样 · 本地限流合并
        </span>
        <Segmented
          size="sm"
          value={chartRange}
          onChange={setChartRange}
          options={[
            { value: '1H', label: '1H' },
            { value: '4H', label: '4H' },
            { value: '1D', label: '1D' },
            { value: 'ALL', label: 'ALL' },
          ]}
        />
      </div>
      <ReactECharts
        option={option}
        style={{ height, width: '100%' }}
        notMerge={false}
        lazyUpdate
        opts={{ renderer: 'canvas' }}
      />
      <p className="mt-1 line-clamp-1 text-[11px] text-muted">{market.question}</p>
    </div>
  );
}
