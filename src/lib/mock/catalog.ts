import { mulberry32 } from '@/lib/utils';
import type { ChatMessage, LiveStream, Market, PricePoint } from '@/types';

/**
 * Mock 目录数据
 * ---------------------------------------------------------------------------
 * 全部使用「种子随机」生成，保证 SSR 与 CSR 首屏一致，不会 hydration mismatch。
 */

const now = Date.now();

export const CATEGORIES = ['加密行情', '直播综艺', '电竞赛事', '体育', '宏观事件'] as const;

export const markets: Market[] = [
  {
    id: 'm-1',
    onChainId: 1,
    question: '本场直播结束前 BTC 会重新站上 $78,000 吗？',
    category: '加密行情',
    status: 'live',
    endsAt: now + 1000 * 60 * 42,
    volume24h: 1_284_500,
    liquidity: 320_400,
    liveId: 'l-1',
    outcomes: [
      { key: 'yes', label: '会', price: 0.62 },
      { key: 'no', label: '不会', price: 0.38 },
    ],
  },
  {
    id: 'm-2',
    onChainId: 2,
    question: '主播今晚能否在 60 分钟内完成 3 连胜挑战？',
    category: '直播综艺',
    status: 'live',
    endsAt: now + 1000 * 60 * 58,
    volume24h: 486_200,
    liquidity: 152_800,
    liveId: 'l-1',
    outcomes: [
      { key: 'yes', label: '能', price: 0.47 },
      { key: 'no', label: '不能', price: 0.53 },
    ],
  },
  {
    id: 'm-3',
    onChainId: 3,
    question: '本场直播峰值同时在线人数会突破 20 万吗？',
    category: '直播综艺',
    status: 'live',
    endsAt: now + 1000 * 60 * 25,
    volume24h: 268_900,
    liquidity: 96_300,
    liveId: 'l-2',
    outcomes: [
      { key: 'yes', label: '会', price: 0.71 },
      { key: 'no', label: '不会', price: 0.29 },
    ],
  },
  {
    id: 'm-4',
    onChainId: 4,
    question: '总决赛 BO5：LGD 会以 3-1 或更好比分夺冠吗？',
    category: '电竞赛事',
    status: 'live',
    endsAt: now + 1000 * 60 * 74,
    volume24h: 2_940_100,
    liquidity: 718_000,
    liveId: 'l-3',
    outcomes: [
      { key: 'yes', label: '会', price: 0.35 },
      { key: 'no', label: '不会', price: 0.65 },
    ],
  },
  {
    id: 'm-5',
    onChainId: 5,
    question: '本场连麦嘉宾会官宣新一轮融资吗？',
    category: '宏观事件',
    status: 'live',
    endsAt: now + 1000 * 60 * 31,
    volume24h: 173_400,
    liquidity: 64_500,
    liveId: 'l-2',
    outcomes: [
      { key: 'yes', label: '会', price: 0.24 },
      { key: 'no', label: '不会', price: 0.76 },
    ],
  },
  {
    id: 'm-6',
    onChainId: 6,
    question: '本场德比主队会零封对手吗？',
    category: '体育',
    status: 'live',
    endsAt: now + 1000 * 60 * 96,
    volume24h: 921_700,
    liquidity: 288_000,
    liveId: 'l-4',
    outcomes: [
      { key: 'yes', label: '会', price: 0.41 },
      { key: 'no', label: '不会', price: 0.59 },
    ],
  },
  {
    id: 'm-7',
    onChainId: 7,
    question: '今晚 22:00 前 ETH 会突破 $3,400 吗？',
    category: '加密行情',
    status: 'live',
    endsAt: now + 1000 * 60 * 63,
    volume24h: 654_300,
    liquidity: 210_900,
    liveId: 'l-1',
    outcomes: [
      { key: 'yes', label: '会', price: 0.56 },
      { key: 'no', label: '不会', price: 0.44 },
    ],
  },
  {
    id: 'm-8',
    onChainId: 8,
    question: '新赛季揭幕战客队会拿下首个进球吗？',
    category: '体育',
    status: 'upcoming',
    endsAt: now + 1000 * 60 * 60 * 26,
    volume24h: 118_600,
    liquidity: 44_200,
    liveId: 'l-4',
    outcomes: [
      { key: 'yes', label: '会', price: 0.52 },
      { key: 'no', label: '不会', price: 0.48 },
    ],
  },
];

export const lives: LiveStream[] = [
  {
    id: 'l-1',
    title: '【24H 加密盯盘】行情急拉，边看边押',
    streamer: 'CryptoMia',
    category: '加密行情',
    viewers: 128_430,
    startedAt: now - 1000 * 60 * 96,
    online: true,
    marketIds: ['m-1', 'm-2', 'm-7'],
  },
  {
    id: 'l-2',
    title: '连线创始人：新项目发布会现场',
    streamer: 'Web3 Daily',
    category: '宏观事件',
    viewers: 56_780,
    startedAt: now - 1000 * 60 * 38,
    online: true,
    marketIds: ['m-3', 'm-5'],
  },
  {
    id: 'l-3',
    title: 'LGD vs T1 总决赛 BO5 全程解说',
    streamer: '电竞老张',
    category: '电竞赛事',
    viewers: 342_900,
    startedAt: now - 1000 * 60 * 142,
    online: true,
    marketIds: ['m-4'],
  },
  {
    id: 'l-4',
    title: '周末德比前瞻：数据模型怎么押',
    streamer: '数据看球',
    category: '体育',
    viewers: 41_260,
    startedAt: now - 1000 * 60 * 22,
    online: true,
    marketIds: ['m-6', 'm-8'],
  },
];

export function findMarket(id: string | number) {
  const key = String(id);
  return markets.find((m) => m.id === key || String(m.onChainId) === key);
}

export function findLive(id: string | number) {
  const key = String(id);
  return lives.find((l) => l.id === key);
}

export function marketsOfLive(liveId: string) {
  return markets.filter((m) => m.liveId === liveId);
}

/** 生成确定性的历史价格序列（默认每分钟一个点，共 size 个） */
export function buildInitialSeries(marketId: string, size = 180): PricePoint[] {
  const market = findMarket(marketId);
  const seed = market ? market.onChainId * 7919 : 1234;
  const random = mulberry32(seed);
  const base = market?.outcomes.find((o) => o.key === 'yes')?.price ?? 0.5;
  const points: PricePoint[] = [];
  let value = base;
  const startTs = now - size * 60_000;
  for (let i = 0; i < size; i += 1) {
    value += (random() - 0.5) * 0.012;
    value = Math.min(0.97, Math.max(0.03, value));
    points.push({
      ts: startTs + i * 60_000,
      yes: Number(value.toFixed(4)),
      no: Number((1 - value).toFixed(4)),
    });
  }
  // 末尾对齐到当前报价，避免图表和历史脱节
  if (points.length) {
    points[points.length - 1] = { ts: now, yes: base, no: Number((1 - base).toFixed(4)) };
  }
  return points;
}

const CHAT_USERS = [
  '0x9f…31c2',
  '小张同学',
  'CryptoMia的粉',
  'Luna_88',
  '只做概率题',
  '老王的钱包',
  'hodl4ever',
  '数据党',
  'Kevin.eth',
  '喜欢看盘的人',
];

const CHAT_TEXTS = [
  '这波 YES 已经 62¢ 了，还能上车吗',
  '刚在 58¢ 挂了买单，成交了',
  '主播这波操作太秀了',
  '订单簿买盘突然变厚了',
  '我押不会，理由是资金费率',
  '有没有人一起做市？',
  '刚才那笔 12k 的买单是谁的',
  '链上确认有点慢，等了两分钟',
  'nice，盈利 8% 了',
  '注意滑点啊兄弟们，别直接市价全吃',
  '这个市场的流动性比昨天好多了',
  '已经平仓，落袋为安',
];

export function buildInitialChat(liveId: string, size = 40): ChatMessage[] {
  const random = mulberry32(liveId.length * 104729 + 17);
  const messages: ChatMessage[] = [];
  const base = Date.now() - size * 3200;
  for (let i = 0; i < size; i += 1) {
    messages.push({
      id: `${liveId}-seed-${i}`,
      liveId,
      user: CHAT_USERS[Math.floor(random() * CHAT_USERS.length)]!,
      avatarSeed: Math.floor(random() * 997),
      text: CHAT_TEXTS[Math.floor(random() * CHAT_TEXTS.length)]!,
      ts: base + i * 3200,
      tip: random() > 0.93 ? Math.round(random() * 50) + 1 : undefined,
    });
  }
  return messages;
}

export function randomChatUser(random: () => number) {
  return CHAT_USERS[Math.floor(random() * CHAT_USERS.length)]!;
}

export function randomChatText(random: () => number) {
  return CHAT_TEXTS[Math.floor(random() * CHAT_TEXTS.length)]!;
}
