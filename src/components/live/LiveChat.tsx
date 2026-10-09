'use client';

import { memo, useState } from 'react';
import { Send } from 'lucide-react';
import { cn, formatClock } from '@/lib/utils';
import { VirtualList } from '@/components/common/VirtualList';
import { useChat } from '@/hooks/useMarketFeed';
import { ingestChat } from '@/lib/realtime';
import { useHydrated } from '@/store/storage';
import type { ChatMessage } from '@/types';

/**
 * 直播弹幕
 * ---------------------------------------------------------------------------
 * 弹幕是典型的高频、只增、变高的列表：
 * - 数据放在模块级 RingBuffer（容量 300），版本号变化才触发列表重渲染；
 * - 行组件 React.memo，仅按 message 引用比较 —— 新消息只挂载新行，历史行不动；
 * - 虚拟列表只渲染可视区域，滚动时也不产生整表 diff。
 */
export function LiveChat({ liveId, className }: { liveId: string; className?: string }) {
  const hydrated = useHydrated();
  const { items, version } = useChat(liveId);
  const [draft, setDraft] = useState('');

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    ingestChat({
      id: `local-${Date.now()}`,
      liveId,
      user: '我',
      avatarSeed: 42,
      text,
      ts: Date.now(),
    });
    setDraft('');
  };

  void version;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {hydrated ? (
        <VirtualList
          items={items}
          dynamic
          estimateSize={40}
          overscan={6}
          stickToBottom
          className="min-h-0 flex-1 px-3 py-2"
          getKey={(message) => message.id}
          emptyText="正在连接弹幕…"
          renderRow={(message) => <ChatRow message={message} />}
        />
      ) : (
        <div className="min-h-0 flex-1 px-3 py-2 text-xs text-muted">弹幕加载中…</div>
      )}

      <div className="flex items-center gap-2 border-t border-line p-2">
        <input
          className="input h-9 py-1.5"
          placeholder="发条弹幕…（Enter 发送）"
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
        />
        <button type="button" className="btn-primary h-9 px-3" onClick={send} disabled={!draft.trim()}>
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const ChatRow = memo(
  function ChatRow({ message }: { message: ChatMessage }) {
    return (
      <div className="flex items-start gap-2 py-1 text-xs leading-relaxed">
        <span
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: `hsl(${message.avatarSeed % 360} 60% 42%)` }}
        >
          {message.user.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <span className="mr-1.5 text-brand-soft">{message.user}</span>
          <span className="text-slate-300">{message.text}</span>
          {message.tip ? (
            <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-300">
              打赏 {message.tip}
            </span>
          ) : null}
          <span className="num ml-1.5 text-[10px] text-muted">{formatClock(message.ts)}</span>
        </div>
      </div>
    );
  },
  (prev, next) => prev.message.id === next.message.id,
);
