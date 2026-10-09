'use client';

import Link from 'next/link';
import { Users, Radio } from 'lucide-react';
import { formatCompact, formatUsd } from '@/lib/utils';
import { Countdown } from '@/components/common/Countdown';
import { Pill } from '@/components/common/Panel';
import { useOdds } from '@/hooks/useMarketFeed';
import type { LiveStream, Market } from '@/types';

/** 直播间卡片：只订阅该直播首个市场的赔率做摘要 */
export function LiveCard({ live, markets }: { live: LiveStream; markets: Market[] }) {
  const primary = markets[0];
  const odds = useOdds(primary?.id ?? '__none__');
  const volume = markets.reduce((sum, market) => sum + market.volume24h, 0);
  const yes = Math.round(odds.yes * 100);

  return (
    <Link
      href={`/live/${live.id}`}
      className="card group flex flex-col overflow-hidden transition hover:border-brand/40"
    >
      <div className="relative h-32 overflow-hidden border-b border-line bg-gradient-to-br from-brand/25 via-bg-soft to-bull/15">
        <div className="absolute inset-0 opacity-70 [background:radial-gradient(20rem_10rem_at_20%_0%,rgba(124,92,255,0.35),transparent_60%),radial-gradient(16rem_8rem_at_90%_100%,rgba(14,203,129,0.28),transparent_60%)]" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <Pill tone="live">
            <Radio className="h-3 w-3 animate-pulse-live" />
            直播中
          </Pill>
          <span className="chip border-line bg-black/40">
            <Users className="h-3 w-3" />
            {formatCompact(live.viewers)}
          </span>
        </div>
        <span className="absolute bottom-3 left-3 rounded-md bg-black/45 px-2 py-0.5 text-[11px] text-slate-200 backdrop-blur">
          {live.streamer}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-1 text-sm font-medium text-slate-200 group-hover:text-white">{live.title}</p>

        {primary ? (
          <div className="rounded-lg border border-line bg-bg-soft p-2">
            <p className="line-clamp-1 text-[11px] text-muted">{primary.question}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="num text-lg font-semibold text-bull">{yes}%</span>
              <span className="num text-[11px] text-muted">
                <Countdown endsAt={primary.endsAt} />
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between text-[11px] text-muted">
          <span>{markets.length} 个在售事件</span>
          <span>24h 成交 {formatUsd(volume)}</span>
        </div>
      </div>
    </Link>
  );
}
