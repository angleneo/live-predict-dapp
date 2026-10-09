'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { LogOut, Wallet, AlertTriangle, Copy, Check, ChevronDown } from 'lucide-react';
import { cn, shortAddress } from '@/lib/utils';
import { chainMeta, targetChainId } from '@/lib/contracts/addresses';
import { hasWalletConnect } from '@/lib/wagmi';
import { useCollateralBalance } from '@/hooks/useBalances';
import { useHydrated } from '@/store/storage';
import { Pill } from '@/components/common/Panel';

export function ConnectButton() {
  const hydrated = useHydrated();
  const { address, isConnected, chainId, status } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const balance = useCollateralBalance();

  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!error) return;
    const message = error.message.includes('rejected') || error.message.includes('User rejected')
      ? '已取消连接'
      : error.message;
    toast.error('连接钱包失败', { description: message });
    reset();
  }, [error, reset]);

  const wrongChain = isConnected && chainId !== targetChainId;

  if (!hydrated) {
    return <div className="h-9 w-32 animate-pulse rounded-lg bg-bg-soft" />;
  }

  if (!isConnected) {
    return (
      <>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Wallet className="h-4 w-4" />
          连接钱包
        </button>
        {open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
            <div className="w-full max-w-sm rounded-xl border border-line bg-bg-card p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-200">选择钱包</h2>
                <button className="text-xs text-muted hover:text-slate-200" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="space-y-2">
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      connect(
                        { connector },
                        {
                          onSuccess: () => {
                            toast.success('钱包已连接');
                            setOpen(false);
                          },
                        },
                      )
                    }
                    className="btn-ghost w-full justify-start"
                  >
                    <span className="truncate">{connector.name}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                连接即表示同意本地保存钱包地址与交易意图，用于断线重连后的状态恢复。
              </p>
              {!hasWalletConnect ? (
                <p className="mt-2 rounded-lg border border-line bg-bg-soft p-2 text-[11px] leading-relaxed text-muted">
                  未配置 <span className="num">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>，当前仅启用浏览器插件钱包。
                  填入 projectId 后会自动出现 WalletConnect 扫码连接入口。
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {wrongChain ? (
        <button
          type="button"
          className="btn-ghost border-amber-400/40 text-amber-300"
          disabled={switching}
          onClick={async () => {
            try {
              await switchChainAsync({ chainId: targetChainId });
            } catch {
              toast.error('切换网络失败，请在钱包中手动切换');
            }
          }}
        >
          <AlertTriangle className="h-4 w-4" />
          {switching ? '切换中…' : '网络不匹配'}
        </button>
      ) : null}

      <div className="relative">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
        >
          <span className="num text-xs text-slate-200">
            {status === 'reconnecting' ? '同步中…' : shortAddress(address)}
          </span>
          <span className="hidden text-[11px] text-muted sm:inline">
            {balance.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-bg-card p-2 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted">
              <span>{chainMeta[chainId ?? targetChainId]?.name ?? '未知网络'}</span>
              <Pill tone={wrongChain ? 'warn' : 'up'}>{wrongChain ? '待切换' : '已连接'}</Pill>
            </div>
            <button
              type="button"
              className={cn('btn-ghost w-full justify-start border-0 bg-transparent text-xs')}
              onClick={async () => {
                if (!address) return;
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制地址' : '复制钱包地址'}
            </button>
            <button
              type="button"
              className="btn-ghost w-full justify-start border-0 bg-transparent text-xs text-bear"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
                toast.info('钱包已断开，持仓状态已标记为待同步');
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              断开连接
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
