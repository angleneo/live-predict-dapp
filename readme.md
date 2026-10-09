# LivePredict · Prediction Market 直播交易 DApp

> 直播内容 × 事件行情 × 链上买卖。从 Prototype 到 MVP 的纯前端 DApp 实现。

**技术栈：** Next.js 14 (App Router) · React 18 · TypeScript · wagmi v2 / viem · ethers.js v6 · WalletConnect · TanStack Query v5 · Zustand v4 · WebSocket · Tailwind CSS 3 · ECharts 5 · 虚拟列表 (@tanstack/react-virtual)

|  |  |
| --- | --- |
| 🌐 在线演示 | https://angleneo.github.io/live-predict-dapp/ |
| 📦 仓库 | https://github.com/angleneo/live-predict-dapp |
| 🚀 部署 | GitHub Pages（静态导出，推送 main 自动发布，见 `.github/workflows/deploy-pages.yml`） |

---

## 1. 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

**开箱即用**：不配置任何环境变量时，项目会：

- 使用**内置 Mock 实时源**推送行情 / 订单簿 / 成交 / 弹幕（无需后端）；
- 以 **Demo 模式**模拟交易的完整生命周期（签名 → 打包 → 确认 / 失败 / 拒签）。

想接真实链路，复制 `.env.local.example` 为 `.env.local` 并填入配置：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS` | PredictionMarket 合约地址；**填入后自动切换为链上真实读写** |
| `NEXT_PUBLIC_CHAIN_ID` | 目标链：`11155111`(Sepolia) / `1` / `31337`(本地) |
| `NEXT_PUBLIC_RPC_URL` | RPC 节点 |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud projectId；配置后才注册扫码连接器 |
| `NEXT_PUBLIC_WS_URL` | 行情推送服务地址；留空则使用内置 Mock 源 |
| `NEXT_PUBLIC_LIVE_TARGET_FPS` | 直播绘制目标帧率（默认 24） |

其他命令：`npm run build` / `npm run typecheck`。

---

## 2. 页面结构

| 路由 | 内容 |
| --- | --- |
| `/` | 直播广场：直播间卡片 + 热门事件市场 + 工程化说明 |
| `/live/[id]` | **核心页**：直播流 + 弹幕 / 赔率走势 / 交易面板 + 订单簿 / 事件信息 |
| `/markets` | 行情总览：搜索、分类、排序 |
| `/portfolio` | 个人持仓：组合汇总、持仓明细、交易意图流水与恢复状态 |

---

## 3. 目录结构

```
src/
├── app/                         # App Router 页面 + Providers（wagmi / React Query / 实时层启动）
├── components/
│   ├── common/                  # Panel、用 SVG 实现的迷你走势图、虚拟列表、倒计时
│   ├── diagnostics/             # 性能与链路诊断面板（FPS / 长帧 / 频道订阅 / 模拟断线）
│   ├── layout/                  # AppShell、Header、链路状态胶囊
│   ├── live/                    # LivePlayer（跳帧绘制）、LiveChat（虚拟列表 + 环形缓冲）
│   ├── market/                  # 赔率条、ECharts 走势图、市场卡片
│   ├── portfolio/               # 持仓表（行级订阅）
│   ├── trade/                   # 交易面板、订单簿面板
│   └── wallet/                  # 连接按钮、会话守门人、交易对账
├── hooks/                       # 频道订阅、行情 feed、交易执行、持仓、帧率探针
├── lib/
│   ├── contracts/               # ABI、地址、ethers.js 适配层
│   ├── mock/                    # 确定性（种子随机）Mock 目录数据
│   ├── portfolio/               # 组合聚合器（React 之外订阅行情）
│   ├── realtime/                # hub / scheduler / topics / socketClient / mockSource
│   ├── trade/                   # 交易数学（AMM 近似、滑点、持仓结算）、Demo 引擎
│   ├── errors.ts                # 交易错误分类（拒签 / 余额不足 / 链不匹配 / revert…）
│   └── wagmi.ts                 # wagmi 配置
├── store/                       # Zustand：交易表单与意图、持仓、UI 偏好（localStorage 持久化）
└── types/                       # 领域模型
```

---

## 4. 难点一：多通道并发下的渲染性能

直播流、行情、订单簿、弹幕同时高频更新，如果用「每个消息 → setState」的朴素写法，会立刻掉帧。项目的治理分四层：

### 4.1 数据放在 React 之外（局部订阅）

`src/lib/realtime/hub.ts` 实现了一个极轻量的外部状态容器 `Channel`，组件通过 `useSyncExternalStore` 按需订阅：

```ts
const odds = useOdds(market.id);       // 只订阅 market:{id}:odds
const book = useOrderBook(market.id, 'yes'); // 只订阅 market:{id}:book:yes
```

- 行情跳动只重渲染订阅了该频道的组件，**弹幕刷屏不会触发交易面板重渲染**，反之亦然；
- 频道是单例（`channel(key, initial)`），多个组件订阅同一频道时共享一次更新；
- 只在有订阅者时才产生数据（`hasSubscribers()`），不可见的市场不推送。

### 4.2 写入合并 + 帧率控制

`src/lib/realtime/scheduler.ts`：按频道 key 合并高频写入，并限制在目标帧率内落地。

```
Mock 订单簿 120ms 一跳（≈8 次/秒/频道）
        ↓ scheduleWrite(key, fn)  ← 同 key 一个时间片内只保留最后一次
   目标 30 FPS 落地 → React 更新
```

### 4.3 只增列表：环形缓冲 + 版本号

弹幕 / 成交流用 `RingBuffer`（数据在 React 之外）+ 版本号频道驱动：

- 追加消息不会重建数组，历史行的对象引用保持稳定；
- 行组件 `React.memo` 只比较消息 id → **新消息只挂载新行**；
- 虚拟列表只渲染可视区域（订单簿 11 档、弹幕、成交流）。

### 4.4 直播绘制跳帧

`LivePlayer` 用 rAF 驱动 canvas，但按 `targetFps` 主动跳帧，并在以下情况暂停绘制：

- 元素不在视口（`IntersectionObserver`）；
- 标签页隐藏（`document.hidden`）；
- 低端机模式下目标帧率降到 12。

HUD 展示的是**真实绘制帧率**（`23 / 24 FPS`），可以直接验证跳帧生效。

### 4.5 可观测

右上角仪表盘按钮打开诊断面板，实时展示：页面 FPS、最差帧耗时、长帧数、各频道订阅人数、实时链路状态（来源 / 重连次数 / 往返延迟）、目标帧率切换、「模拟断线 4s」。

---

## 5. 难点二：边界场景下的数据一致与状态恢复

### 5.1 交易状态机

```
reviewing → awaiting_signature → pending → confirming → success
                    │                 │           │
                    │                 │           └→ failed（revert/回执失败）
                    │                 └→ unknown（断连/超时，保留 txHash 待对账）
                    └→ rejected（用户取消签名）
```

- **取消签名**（`UserRejectedRequestError` / `code 4001`）：只做一次轻提示，**不清空表单**，直接回滚乐观持仓；
- **交易失败（revert）**：回滚乐观持仓并展示 revert 原因；
- **状态未知（断连 / 回执超时）**：**绝不盲目回滚**，标记 `unknown` 并持久化 txHash。

### 5.2 乐观更新 + 快照回滚

`store/positionStore.ts`：提交瞬间应用乐观持仓（面板立刻显示"待确认"），同时在 `history` 里保存**变更前快照**。失败时用快照还原，而不是反向计算 —— 避免买入/卖出反复叠加后的精度漂移。

### 5.3 钱包断连重连

`components/wallet/WalletSessionGuard.tsx`：

| 事件 | 处理 |
| --- | --- |
| 断开连接 | 持仓标记 `stale`（页面顶部出现"价格可能过期"提示），移除过期查询缓存 |
| 重新连接 | 失效所有链上查询强制重取，并 `flushSchedule()` 把被限流积压的更新一次性提交 |
| 切换账户 | 本地乐观持仓属于旧账户 → 整体重置并重新同步 |

### 5.4 交易对账（TxRecovery）

`components/wallet/TxRecovery.tsx`：钱包恢复连接后，扫描所有 `pending / confirming / unknown` 的意图，用 txHash 读取链上回执：

- 回执成功 → 提交乐观持仓；回执失败 → 回滚；
- 查不到且已超时 → 判定未上链，回滚；
- 所有结果都会写回意图流水，在 `/portfolio` 页面可见（"交易意图流水"）。

### 5.5 实时通道异常

`lib/realtime/socketClient.ts`：

- **指数退避 + 抖动**重连（1s → 2s → … 上限 20s，±30% 抖动），避免服务端抖动被客户端放大；
- **心跳 ping/pong + 静默超时**判定半开连接并主动重连；
- **重连后 resync**：重新订阅 + 请求 snapshot 覆盖本地增量状态；
- 断线期间顶部横幅明确告知"价格可能已过期"，不会静默展示过期数据。

---

## 6. 链上读写

- **交互式读写**（连接、切链、授权、下单、等待回执）：wagmi v2 hooks + viem，ABI 用 `as const` 获得完整类型推导；
- **批量只读**（一次 RPC 读取账户在所有市场的持仓）：`lib/contracts/ethersAdapter.ts` 用 ethers.js 的 `Contract` + `Promise.all`；
- **精度换算**：ethers `parseUnits / formatUnits`；
- **授权流程**：买入前检查 `allowance`，不足才走 `approve`（幂等，不会每次下单都授权）。

### Demo 模式

未配置合约地址时进入 Demo 模式（页面显示 `DEMO` 标记）：

- 交易走 `lib/trade/demoEngine.ts` 模拟生命周期，可显式选择结果：**成功 / 失败(revert) / 拒签**，用于验证上面所有边界链路；
- 持仓用本地种子数据（可在 `/portfolio` 一键重置）。

---

## 7. 部署（GitHub Pages）

线上地址：**https://angleneo.github.io/live-predict-dapp/**

```
push main ──▶ GitHub Actions ──┬─ npm ci
                               ├─ node scripts/build-pages.mjs   # output:'export' + basePath
                               ├─ actions/configure-pages
                               ├─ actions/upload-pages-artifact  (out/)
                               └─ actions/deploy-pages ──▶ GitHub Pages
```

关键点：

- 项目站点部署在 `https://<user>.github.io/<repo>/` 子路径下，因此构建时通过 `basePath` 前缀化所有资源与站内链接；
  `scripts/build-pages.mjs` 会自动从 `GITHUB_REPOSITORY` 推导仓库名作为 `basePath`（仓库名形如 `<user>.github.io` 时留空）。
- 静态导出要求 `trailingSlash: true`（生成 `/live/l-1/index.html`），并用 `.nojekyll` 避免 `_next` 目录被 Jekyll 忽略。
- 动态路由 `/live/[id]` 由服务端组件导出 `generateStaticParams()` 预渲染 4 个直播间；交互逻辑在客户端组件 `LiveRoom` 中。
- 首次部署需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（本仓库已通过 API 配置好）。

本地验证静态导出：

```bash
npm run build:pages     # 产物输出到 out/
# 自定义子路径：NEXT_PUBLIC_BASE_PATH=/my-path npm run build:pages
```

改仓库名时无需改代码：`basePath` 由 CI 自动推导，重命名仓库后重新运行工作流即可。

在 CI 中注入运行时配置（可选，编辑工作流里的 env）：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | 启用 WalletConnect 扫码连接（建议放在仓库 Secrets） |
| `NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS` | 填入已部署合约地址，线上即切换为链上真实读写 |

> 默认部署为 Demo 模式：使用内置 Mock 实时源，交易走本地模拟生命周期，无需任何后端或合约即可完整演示。

---

## 8. 已知取舍

- 交易报价用前端 AMM 近似模型（`lib/trade/math.ts`）估算均价、价格影响、手续费与滑点边界，**真实成交价以合约 `quoteBuy / quoteSell` 为准**；
- 列表数据（弹幕/成交）使用可变环形缓冲 + 版本号，属于"数据在 React 之外"的刻意设计，需要遵守"只用频道版本号驱动渲染"的约定；
- 构建时屏蔽了 `@x402/*`、`@base-org/account` 等 Coinbase Smart Wallet 相关的可选依赖（`next.config.mjs`），它们只在未使用的 x402 支付流程中才会执行；
- 未做 i18n、未接入真实行情推送服务（协议已在 `socketClient.ts` / `topics.ts` 中约定）。
