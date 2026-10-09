/**
 * GitHub Pages 使用静态导出：
 * - 由 CI 设置 NEXT_OUTPUT_MODE=export 启用（本地 npm run build 不受影响）
 * - NEXT_PUBLIC_BASE_PATH 使用仓库名作为子路径，例如 /live-predict-dapp
 */
const isStaticExport = process.env.NEXT_OUTPUT_MODE === 'export';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim().replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? 'export' : undefined,
  // 项目站点部署在 https://<user>.github.io/<repo>/ 下，必须带上 basePath
  basePath: basePath || undefined,
  // 静态托管需要目录形式的路由（/live/l-1/index.html）
  trailingSlash: isStaticExport ? true : false,
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    // WalletConnect / wagmi 依赖链里的可选依赖，浏览器端不需要打包
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    /**
     * @wagmi/connectors 的聚合入口会连带引入 @coinbase/cdp-sdk → @base-org/account，
     * 后者静态引用了 x402 协议的可选包（@x402/*）。这段代码只在 Coinbase 智能账户的
     * x402 支付流程里才会执行，本项目用不到，但 webpack 仍会尝试解析并导致构建失败。
     * 这里将它们标记为忽略模块（不影响 injected / WalletConnect / Coinbase 钱包连接）。
     */
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core': false,
      '@x402/core/client': false,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/svm': false,
      '@x402/svm/exact/client': false,
      // Coinbase Smart Wallet 相关的重依赖：本项目只需 injected + WalletConnect
      '@base-org/account': false,
      // MetaMask SDK 为 React Native 环境准备的可选存储实现，Web 端用不到
      '@react-native-async-storage/async-storage': false,
    };

    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    }

    return config;
  },
};

export default nextConfig;
