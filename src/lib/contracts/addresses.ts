import type { Address } from 'viem';
import { sepolia, mainnet, hardhat } from 'wagmi/chains';

const ZERO = '0x0000000000000000000000000000000000000000';

function readEnv(key: string, fallback = ZERO): Address {
  const value = (process.env[key] || '').trim();
  if (!value || value.toLowerCase() === ZERO) return fallback as Address;
  return value as Address;
}

export const contracts = {
  predictionMarket: readEnv('NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS'),
  /** 结算资产地址，可在 .env 中覆盖（默认 Sepolia USDC） */
  collateral: readEnv('NEXT_PUBLIC_COLLATERAL_ADDRESS', '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8'),
} as const;

export const collateralDecimals = 6;
export const SHARE_DECIMALS = 6;

/** 只允许已配置的链，便于 wagmi 的 switchChain 保持类型安全 */
export type SupportedChainId = typeof mainnet.id | typeof sepolia.id | typeof hardhat.id;

export const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || sepolia.id) as SupportedChainId;

export const chainMeta: Record<number, { name: string; explorer: string; short: string }> = {
  [mainnet.id]: { name: 'Ethereum', explorer: 'https://etherscan.io', short: 'Mainnet' },
  [sepolia.id]: { name: 'Sepolia', explorer: 'https://sepolia.etherscan.io', short: 'Sepolia' },
  [hardhat.id]: { name: 'Localhost', explorer: '', short: 'Local' },
};

export function explorerTxUrl(chainId: number | undefined, hash: string | undefined) {
  if (!hash) return undefined;
  const meta = chainMeta[chainId ?? targetChainId];
  if (!meta?.explorer) return undefined;
  return `${meta.explorer}/tx/${hash}`;
}

/**
 * 未配置合约地址（仍是零地址）时进入 Demo 模式：
 * 链上读写走本地模拟的完整生命周期（签名 → pending → 确认），
 * 用于 Prototype → MVP 阶段在无后端 / 无部署合约时验证交互与数据一致性。
 */
export const isContractConfigured = (contracts.predictionMarket as string).toLowerCase() !== ZERO;
export const demoMode = !isContractConfigured;
