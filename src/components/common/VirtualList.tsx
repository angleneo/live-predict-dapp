'use client';

import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export interface VirtualListProps<T> {
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  /** 自动吸底（弹幕场景） */
  stickToBottom?: boolean;
  /** 行高不固定时开启动态测量 */
  dynamic?: boolean;
  emptyText?: string;
}

/**
 * 虚拟列表
 * ---------------------------------------------------------------------------
 * 弹幕 / 成交流这类「只增不改、长度可能上千」的列表，如果整表渲染，
 * 每次追加都会触发 O(n) 的 DOM diff。这里做三件事：
 * 1. 只渲染可视区域 + overscan 的行；
 * 2. 配合 React.memo 的行组件，仅新增行挂载，历史行不重渲染；
 * 3. 弹幕场景自动吸底，但用户手动上翻时不再强制滚动。
 */
export function VirtualList<T>({
  items,
  getKey,
  renderRow,
  estimateSize = 28,
  overscan = 8,
  className,
  stickToBottom = false,
  dynamic = false,
  emptyText = '暂无数据',
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => {
      const item = items[index];
      return item ? getKey(item, index) : index;
    },
    measureElement: dynamic ? (element) => element.getBoundingClientRect().height : undefined,
  });

  // 吸底：只在用户本来就贴着底部时才跟随
  useEffect(() => {
    if (!stickToBottom) return;
    if (!pinnedRef.current) return;
    if (items.length === 0) return;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [items.length, stickToBottom, virtualizer]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 24;
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn('scroll-thin relative overflow-y-auto overflow-x-hidden', className)}
    >
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-muted">{emptyText}</div>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (item === undefined) return null;
            return (
              <div
                key={virtualRow.key as string}
                data-index={virtualRow.index}
                ref={dynamic ? virtualizer.measureElement : undefined}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(item, virtualRow.index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
