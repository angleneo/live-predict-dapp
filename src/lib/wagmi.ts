import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const SUPPORTED_CHAINS = [sepolia, mainnet, hardhat] as const;

/** 未配置时不做占位值兜底：WalletConnect/AppKit 会带着无效 projectId 去请求远端配置 */
export const WC_PROJECT_ID = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '').trim();
export const hasWalletConnect = WC_PROJECT_ID.length > 0;

export const APP_NAME = 'LivePredict';
export const APP_DESCRIPTION = '直播 × Prediction Market 链上交易终端';

/**
 * wagmi v2 配置
 * - cookieStorage + ssr：首屏直接拿到已连接状态，避免「先显示未连接再闪回已连接」
 * - injected 覆盖浏览器插件钱包；WalletConnect 覆盖手机端扫码 / 深度链接
 *   WalletConnect 只在配置了 projectId 时才注册：它的连接器在创建时就会初始化
 *   AppKit 并请求远端配置，用占位值会持续产生 403 请求与告警。
 */
export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [
    injected({ shimDisconnect: true }),
    ...(hasWalletConnect
      ? [
          walletConnect({
            projectId: WC_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: APP_NAME,
              description: APP_DESCRIPTION,
              url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000',
              icons: ['https://avatars.githubusercontent.com/u/37784886'],
            },
          }),
        ]
      : []),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
    [mainnet.id]: http(),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
