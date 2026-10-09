import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 确定性伪随机（避免 SSR / CSR 首屏不一致导致 hydration mismatch） */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatUsd(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(digits)}`;
}

export function formatCompact(value: number) {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatShares(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatSignedUsd(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(digits)}`;
}

export function shortAddress(address?: string, size = 4) {
  if (!address) return '--';
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function shortHash(hash?: string, size = 6) {
  if (!hash) return '--';
  return `${hash.slice(0, 2 + size)}…${hash.slice(-4)}`;
}

export function formatClock(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}`;
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '已结束';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分${totalSeconds % 60}秒`;
}

/** 价格（0~1）转「美分」报价，预测市场习惯用 ¢ */
export function toCents(price: number) {
  return price * 100;
}

export function formatCents(price: number, digits = 1) {
  return `${toCents(price).toFixed(digits)}¢`;
}
