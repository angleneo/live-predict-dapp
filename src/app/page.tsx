'use client';

import Link from 'next/link';
import { Activity, ArrowRight, Gauge, Layers, ShieldCheck, Zap } from 'lucide-react';
import { LiveCard } from '@/components/live/LiveCard';
import { MarketCard } from '@/components/market/MarketCard';
import { Panel, Pill } from '@/components/common/Panel';
import { useHotMarkets, useLiveList, useMarkets } from '@/hooks/useMarkets';
import { useRealtimeState } from '@/hooks/useMarketFeed';
import { demoMode } from '@/lib/contracts/addresses';
import { getScheduleFps } from '@/lib/realtime';
import { formatUsd } from '@/lib/utils';

const HIGHLIGHTS = [
  {
    icon: Layers,
    title: '多通道并发下的渲染治理',
    desc: '直播流 / 行情 / 订单簿 / 弹幕各自独立调度，按频道合并 + 帧率限流，局部订阅避免整页 diff。',
  },
  {
    icon: ShieldCheck,
    title: '边界场景的数据一致性',
    desc: '取消签名不清空表单、失败回滚乐观持仓、断连重连后用 txHash 与链上对账。',
  },
  {
    icon: Zap,
    title: '合约 ABI 直连链上读写',
    desc: 'wagmi/viem 负责交互式读写，ethers.js 负责批量只读与精度换算，无中间层即可迭代。',
  },
];

export default function HomePage() {
  const lives = useLiveList();
  const markets = useMarkets();
  const hot = useHotMarkets(6);
  const realtime = useRealtimeState();

  const totalVolume = markets.reduce((sum, market) => sum + market.volume24h, 0);

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="brand">MVP · Prototype → Production</Pill>
              <Pill tone={realtime.status === 'connected' ? 'up' : 'warn'}>
                <Activity className="h-3 w-3" />
                {realtime.source === 'mock' ? '内置 Mock 实时源' : 'WebSocket 实时源'} · {getScheduleFps()} FPS
              </Pill>
              {demoMode ? <Pill tone="warn">未配置合约地址 · 交易走 Demo 生命周期</Pill> : null}
            </div>

            <h1 className="text-2xl font-semibold leading-tight text-slate-100 sm:text-3xl">
              边看直播，边对「下一秒会发生什么」定价
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted">
              直播内容页 × 事件行情 × 链上买卖。前端直接基于合约 ABI 完成读写，直播间里的每个悬念都是一个可交易市场：
              实时赔率、订单簿深度、买卖面板与个人持仓在同一屏内完成闭环。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/live/${lives[0]?.id ?? 'l-1'}`} className="btn-primary">
                进入直播间
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/portfolio" className="btn-ghost">
                <Gauge className="h-4 w-4" />
                我的持仓
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
              <Metric label="在售事件" value={String(markets.length)} />
              <Metric label="24h 成交" value={formatUsd(totalVolume)} />
              <Metric label="在线直播" value={String(lives.length)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="rounded-xl border border-line bg-bg-soft p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <item.icon className="h-4 w-4 text-brand-soft" />
                  {item.title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-200">正在直播</h2>
          <span className="text-[11px] text-muted">每个直播间内可切换多个事件市场</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {lives.map((live) => (
            <LiveCard
              key={live.id}
              live={live}
              markets={markets.filter((market) => market.liveId === live.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="热门事件市场" extra={<Link href="/markets" className="text-[11px] text-brand-soft hover:underline">查看全部</Link>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {hot.slice(0, 4).map((market) => (
              <MarketCard key={market.id} market={market} compact />
            ))}
          </div>
        </Panel>

        <Panel title="工程化取舍" extra={<span className="text-[11px] text-muted">MVP 阶段</span>}>
          <ul className="space-y-2.5 text-[11px] leading-relaxed text-muted">
            <li>
              <span className="text-slate-200">状态分层：</span>
              行情 / 订单簿 / 弹幕放在 React 之外的外部状态里，组件通过 useSyncExternalStore 按需订阅，避免把高频数据塞进 Context。
            </li>
            <li>
              <span className="text-slate-200">写入合并：</span>
              120ms 一跳的订单簿不会直接触发渲染，而是按频道合并、限定在目标帧率内落地。
            </li>
            <li>
              <span className="text-slate-200">乐观更新 + 对账：</span>
              提交即更新持仓，失败回滚用快照而非反向计算；状态未知的交易保留 txHash，重连后与链上核对。
            </li>
            <li>
              <span className="text-slate-200">可观测：</span>
              右上角诊断面板可实时查看 FPS、长帧数、频道订阅人数，并一键模拟断线验证重连链路。
            </li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="num text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
