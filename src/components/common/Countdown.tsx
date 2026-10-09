'use client';

import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/utils';

/**
 * 倒计时
 * 服务端与客户端的时间戳必然有毫秒级差异，直接渲染会触发 hydration mismatch。
 * 因此首帧渲染占位符，挂载后再开始计时。
 */
export function Countdown({ endsAt, className }: { endsAt: number; className?: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setText(formatDuration(endsAt - Date.now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return <span className={className}>{text ?? '--:--'}</span>;
}

/** 只在客户端渲染内容，避免时间/随机数导致的水合不一致 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}
