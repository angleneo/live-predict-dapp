'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MarketCard } from '@/components/market/MarketCard';
import { Panel, Segmented } from '@/components/common/Panel';
import { CATEGORIES, useMarkets } from '@/hooks/useMarkets';
import { formatUsd } from '@/lib/utils';

const SORTS = [
  { value: 'volume', label: '成交额' },
  { value: 'ending', label: '即将结算' },
  { value: 'liquidity', label: '流动性' },
] as const;

type SortKey = (typeof SORTS)[number]['value'];

export default function MarketsPage() {
  const markets = useMarkets();
  const [category, setCategory] = useState<string>('全部');
  const [sort, setSort] = useState<SortKey>('volume');
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const filtered = markets.filter((market) => {
      const matchCategory = category === '全部' || market.category === category;
      const matchKeyword = !keyword || market.question.includes(keyword);
      return matchCategory && matchKeyword;
    });

    return filtered.sort((a, b) => {
      if (sort === 'ending') return a.endsAt - b.endsAt;
      if (sort === 'liquidity') return b.liquidity - a.liquidity;
      return b.volume24h - a.volume24h;
    });
  }, [category, keyword, markets, sort]);

  const volume = list.reduce((sum, market) => sum + market.volume24h, 0);

  return (
    <div className="space-y-4">
      <Panel
        title="行情总览"
        extra={<span className="text-[11px] text-muted">{list.length} 个事件 · 24h 成交 {formatUsd(volume)}</span>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              className="input h-9 w-56 pl-8"
              placeholder="搜索事件…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['全部', ...CATEGORIES].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`chip ${category === item ? 'border-brand/50 text-slate-100' : 'hover:text-slate-200'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <Segmented className="ml-auto" size="sm" value={sort} onChange={setSort} options={[...SORTS]} />
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted">没有匹配的事件，换个关键词试试。</p>
      ) : null}
    </div>
  );
}
