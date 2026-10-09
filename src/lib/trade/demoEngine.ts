import type { TxStage } from '@/types';

/**
 * Demo 交易引擎
 * ---------------------------------------------------------------------------
 * 未部署合约时，用本地状态机模拟「等待签名 → 打包中 → 确认中 → 成功」的完整生命周期，
 * 让边界场景（用户拒签、链上 revert、钱包断连）在没有测试网的情况下也能被真实触发和验证。
 */

export interface DemoLifecycleOptions {
  mode: 'success' | 'revert' | 'reject';
  onStage: (stage: TxStage, detail?: string) => void;
  /** 外部中断（例如用户在等待期间断开钱包） */
  shouldAbort?: () => boolean;
}

export class DemoAbortError extends Error {
  constructor() {
    super('wallet disconnected');
    this.name = 'WalletDisconnectedError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomHash() {
  const hex = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < 64; i += 1) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

export async function simulateTradeLifecycle({ mode, onStage, shouldAbort }: DemoLifecycleOptions) {
  onStage('awaiting_signature', '等待钱包签名');
  await sleep(700 + Math.random() * 400);
  if (shouldAbort?.()) throw new DemoAbortError();

  if (mode === 'reject') {
    const error = new Error('User rejected the request.');
    error.name = 'UserRejectedRequestError';
    throw error;
  }

  const hash = randomHash();
  onStage('pending', hash);
  await sleep(900 + Math.random() * 600);
  if (shouldAbort?.()) throw new DemoAbortError();

  onStage('confirming', hash);
  await sleep(1100 + Math.random() * 900);
  if (shouldAbort?.()) throw new DemoAbortError();

  if (mode === 'revert') {
    const error = new Error('execution reverted: slippage exceeded maxCost');
    error.name = 'ContractFunctionExecutionError';
    throw error;
  }

  return { hash };
}

export function generateDemoHash() {
  return randomHash();
}
