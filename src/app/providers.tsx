'use client';

import { useEffect, useState } from 'react';
import { WagmiProvider, type State } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { wagmiConfig } from '@/lib/wagmi';
import { bootstrapRealtime } from '@/lib/realtime';
import { WalletSessionGuard } from '@/components/wallet/WalletSessionGuard';
import { TxRecovery } from '@/components/wallet/TxRecovery';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 链上读多、写少：staleTime 拉长，配合区块号轮询做失效
        staleTime: 12_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    // 启动实时通道：有 WS_URL 走真实 WebSocket，否则自动降级到内置 Mock 数据源
    const dispose = bootstrapRealtime();
    return dispose;
  }, []);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <WalletSessionGuard />
        <TxRecovery />
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          closeButton
          toastOptions={{
            style: {
              background: '#131722',
              border: '1px solid #232a3b',
              color: '#e2e8f0',
            },
          }}
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
