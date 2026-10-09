'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Gauge, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { RealtimeStatusPill } from './RealtimeStatusPill';
import { PerformanceMonitor } from '@/components/diagnostics/PerformanceMonitor';
import { useUiStore } from '@/store/uiStore';
import { demoMode } from '@/lib/contracts/addresses';
import { Pill } from '@/components/common/Panel';

const NAV = [
  { href: '/', label: '直播广场', icon: Radio },
  { href: '/markets', label: '行情总览', icon: BarChart3 },
  { href: '/portfolio', label: '我的持仓', icon: Gauge },
];

export function Header() {
  const pathname = usePathname();
  const toggleDiagnostics = useUiStore((state) => state.toggleDiagnostics);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">P</span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:block">
            LivePredict
          </span>
          {demoMode ? (
            <Pill tone="brand" className="hidden md:inline-flex">
              内测版
            </Pill>
          ) : null}
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                  active ? 'bg-bg-hover text-slate-100' : 'text-muted hover:bg-bg-soft hover:text-slate-200',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <RealtimeStatusPill />
          <button
            type="button"
            onClick={toggleDiagnostics}
            title="性能与链路诊断"
            className="btn-ghost hidden h-9 w-9 p-0 sm:inline-flex"
          >
            <Activity className="h-4 w-4" />
          </button>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
