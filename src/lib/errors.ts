export type TxErrorKind =
  | 'user_rejected'
  | 'insufficient_funds'
  | 'chain_mismatch'
  | 'reverted'
  | 'timeout'
  | 'disconnected'
  | 'unknown';

export interface ClassifiedTxError {
  kind: TxErrorKind;
  /** 给用户看的一句话（中文，可操作） */
  message: string
  /** 原始错误，便于排查 */
  raw?: unknown;
  /** 是否属于「用户主动放弃」——这类不应作为错误提示，也不该回滚乐观状态之外的任何东西 */
  benign: boolean;
}

interface ErrorLike {
  name?: string;
  code?: number | string;
  shortMessage?: string;
  details?: string;
  message?: string;
  cause?: ErrorLike;
  data?: unknown;
}

function str(error: unknown): string {
  const e = error as ErrorLike | undefined;
  return e?.shortMessage || e?.details || e?.message || '';
}

/**
 * 错误分类
 * ---------------------------------------------------------------------------
 * 边界场景的核心：同样是「交易没成功」，用户的处理方式完全不同。
 * - 取消签名：不报错、不清空表单、不重试，只做一次轻提示；
 * - 余额/授权不足：引导去充值或重新授权；
 * - 网络切换错误：提示切回目标链；
 * - 链上 revert：回滚乐观状态 + 展示 revert 原因。
 */
export function classifyTxError(error: unknown): ClassifiedTxError {
  const e = error as ErrorLike | undefined;
  const name = e?.name ?? '';
  const code = e?.code;
  const message = str(error);
  const lower = message.toLowerCase();

  if (
    name.includes('UserRejected') ||
    name.includes('UserDenied') ||
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return { kind: 'user_rejected', message: '已取消签名，订单未提交', raw: error, benign: true };
  }

  if (
    name.includes('InsufficientFunds') ||
    lower.includes('insufficient funds') ||
    lower.includes('exceeds balance') ||
    code === -32000
  ) {
    return { kind: 'insufficient_funds', message: '余额不足，无法支付本次交易与 Gas', raw: error, benign: false };
  }

  if (
    name.includes('ChainMismatch') ||
    name.includes('SwitchChain') ||
    code === 4902 ||
    lower.includes('chain mismatch') ||
    lower.includes('does not match the target chain')
  ) {
    return { kind: 'chain_mismatch', message: '钱包网络与目标链不一致，请切换后重试', raw: error, benign: false };
  }

  if (name.includes('Timeout') || lower.includes('timeout') || lower.includes('timed out')) {
    return { kind: 'timeout', message: '交易回执超时，稍后会自动重试确认', raw: error, benign: false };
  }

  if (
    name.includes('Disconnected') ||
    lower.includes('disconnected') ||
    lower.includes('provider is not connected') ||
    lower.includes('connector not connected')
  ) {
    return { kind: 'disconnected', message: '钱包连接已断开，请重新连接后继续', raw: error, benign: false };
  }

  if (name.includes('ContractFunctionExecution') || name.includes('Revert') || lower.includes('reverted')) {
    const reason = extractRevertReason(message);
    return { kind: 'reverted', message: `交易被合约拒绝${reason ? `：${reason}` : ''}`, raw: error, benign: false };
  }

  return { kind: 'unknown', message: message || '交易失败，请稍后重试', raw: error, benign: false };
}

const REVERT_PATTERNS = [/reverted with reason string '(.+?)'/i, /execution reverted: (.+?)(?:\n|$)/i, /reason: (.+?)(?:\n|$)/i];

export function extractRevertReason(message: string) {
  for (const pattern of REVERT_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

/** wagmi/viem 的 simulation 报错有时把原因藏在 cause 里，这里统一兜底 */
export function humanizeError(error: unknown) {
  const classified = classifyTxError(error);
  if (classified.kind !== 'unknown') return classified;

  const cause = (error as ErrorLike)?.cause;
  if (cause) return classifyTxError(cause);
  return classified;
}

export function errorMessage(error: unknown, fallback = '操作失败') {
  const classified = humanizeError(error);
  return classified.message || fallback;
}
