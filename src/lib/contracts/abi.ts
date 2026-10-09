/**
 * PredictionMarket 合约 ABI（与后端合约约定）
 * 使用 `as const` 让 viem / wagmi 获得完整的类型推导与返回值类型。
 */

export const predictionMarketAbi = [
  // ---------------- views ----------------
  {
    type: 'function',
    name: 'marketCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: 'market',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'question', type: 'string' },
          { name: 'endTime', type: 'uint256' },
          { name: 'yesPrice', type: 'uint256' }, // 1e18 精度
          { name: 'noPrice', type: 'uint256' },
          { name: 'liquidity', type: 'uint256' },
          { name: 'volume', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'winningOutcome', type: 'uint8' }, // 0 = YES, 1 = NO
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [
      { name: 'cost', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [
      { name: 'proceeds', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'marketId', type: 'uint256' },
    ],
    outputs: [
      { name: 'sharesYes', type: 'uint256' },
      { name: 'sharesNo', type: 'uint256' },
      { name: 'realizedPnl', type: 'int256' },
      { name: 'claimed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'collateral',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },

  // ---------------- writes ----------------
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'shares', type: 'uint256' },
      { name: 'maxCost', type: 'uint256' },
    ],
    outputs: [{ name: 'cost', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'shares', type: 'uint256' },
      { name: 'minProceeds', type: 'uint256' },
    ],
    outputs: [{ name: 'proceeds', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ name: 'payout', type: 'uint256' }],
  },

  // ---------------- events ----------------
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'question', type: 'string', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Trade',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'isBuy', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'winningOutcome', type: 'uint8', indexed: false },
    ],
  },
] as const;

/** 结算资产（USDC 之类）最小 ABI —— 只做授权与余额检查 */
export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const OUTCOME_INDEX = { yes: 0, no: 1 } as const;
