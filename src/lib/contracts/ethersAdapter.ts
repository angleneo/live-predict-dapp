import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { predictionMarketAbi } from './abi';
import { collateralDecimals, chainMeta, contracts, targetChainId } from './addresses';
import type { Position } from '@/types';
import type { WalletClient } from 'viem';

/**
 * ethers.js 适配层
 * ---------------------------------------------------------------------------
 * 与 wagmi/viem 共存的分工：
 * - 交互式读写（签名、交易）走 wagmi/viem，享受 React hooks + 类型推导；
 * - 批量只读（持仓快照、历史对账）、精度换算走 ethers.js，写法更直观；
 * - WalletConnect 会话下的 EIP-1193 通道可以直接喂给 ethers 的 BrowserProvider。
 */

type Eip1193Like = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

/** 把 wagmi 的 walletClient 转成 ethers 的 BrowserProvider（复用同一个已连接账户） */
export function toEthersProvider(walletClient: WalletClient): BrowserProvider {
  const transport = walletClient.transport as unknown as Eip1193Like;
  return new BrowserProvider(transport as never, 'any');
}

/** 只读 provider（不依赖钱包，用于批量读取与后台对账） */
export function createReadProvider(chainId: number = targetChainId) {
  const url = process.env.NEXT_PUBLIC_RPC_URL;
  if (url) return new JsonRpcProvider(url, chainId, { staticNetwork: true });
  return new JsonRpcProvider(undefined, chainId, { staticNetwork: true });
}

export function createEthersPublicClient(chainId: number = targetChainId): PublicClient {
  return createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || chainMeta[chainId]?.explorer || undefined),
  }) as PublicClient;
}

export interface ChainPosition {
  marketId: string;
  onChainId: number;
  sharesYes: bigint;
  sharesNo: bigint;
  realizedPnl: bigint;
  claimed: boolean;
}

/**
 * 批量读取某账户在所有市场的持仓。
 * 用 ethers 的 Contract + Promise.all 做并发只读，避免在 React 层为每个市场建一个 query。
 */
export async function fetchPositionsWithEthers(
  account: Address,
  marketIds: number[],
  chainId: number = targetChainId,
): Promise<ChainPosition[]> {
  if (!contracts.predictionMarket || marketIds.length === 0) return [];

  const provider = createReadProvider(chainId);
  const contract = new Contract(contracts.predictionMarket, predictionMarketAbi as never, provider);

  const results = await Promise.all(
    marketIds.map(async (onChainId) => {
      try {
        const raw = (await contract.positions(account, BigInt(onChainId))) as unknown as [
          bigint,
          bigint,
          bigint,
          boolean,
        ];
        return {
          marketId: String(onChainId),
          onChainId,
          sharesYes: raw[0],
          sharesNo: raw[1],
          realizedPnl: raw[2],
          claimed: raw[3],
        } satisfies ChainPosition;
      } catch (error) {
        console.warn(`[ethers] 读取市场 ${onChainId} 持仓失败`, error);
        return null;
      }
    }),
  );

  return results.filter((item): item is ChainPosition => item !== null);
}

/** 链上 bigint → 前端可用的 Position（含精度换算） */
export function chainPositionToLocal(chain: ChainPosition, question: string): Position[] {
  const list: Position[] = [];
  const yes = Number(formatUnits(chain.sharesYes, collateralDecimals));
  const no = Number(formatUnits(chain.sharesNo, collateralDecimals));
  const realized = Number(formatUnits(chain.realizedPnl, collateralDecimals));

  if (yes > 0) {
    list.push({ marketId: String(chain.onChainId), outcome: 'yes', shares: yes, avgPrice: 0, realizedPnl: realized });
  }
  if (no > 0) {
    list.push({ marketId: String(chain.onChainId), outcome: 'no', shares: no, avgPrice: 0, realizedPnl: realized });
  }
  void question;
  return list;
}

/** 金额换算（ethers 的 parseUnits 对小数位处理更稳） */
export function toCollateralUnits(value: string | number) {
  try {
    return parseUnits(String(value || '0'), collateralDecimals);
  } catch {
    return 0n;
  }
}

export function fromCollateralUnits(value: bigint) {
  return Number(formatUnits(value, collateralDecimals));
}
