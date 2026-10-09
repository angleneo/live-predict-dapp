import { Suspense } from 'react';
import { lives } from '@/lib/mock/catalog';
import { LiveRoom } from './LiveRoom';

/**
 * 路由页保持为服务端组件：
 * - `generateStaticParams` 只能在服务端组件里导出，静态导出（output: 'export'）
 *   需要它来枚举动态路由，否则 /live/[id] 无法生成静态页面；
 * - `useSearchParams` 必须在 Suspense 边界内使用，因此边界放在这一层；
 * - 交互逻辑全部下沉到 LiveRoom（客户端组件）。
 */
export function generateStaticParams() {
  return lives.map((live) => ({ id: live.id }));
}

export const dynamicParams = false;

export default function LivePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs text-muted">加载直播间…</div>}>
      <LiveRoom liveId={params.id} />
    </Suspense>
  );
}
