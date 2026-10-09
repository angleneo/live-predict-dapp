/**
 * GitHub Pages 静态导出构建脚本（跨平台，不依赖 shell 语法）
 * - 设置 NEXT_OUTPUT_MODE=export 让 next.config.mjs 启用 output:'export'
 * - 自动推导 basePath：CI 里从 GITHUB_REPOSITORY 取仓库名；
 *   如果仓库名形如 <user>.github.io 则站点在根路径，basePath 留空
 *
 * 本地验证：npm run build:pages
 * 自定义：NEXT_PUBLIC_BASE_PATH=/my-sub-path npm run build:pages
 */
import { spawnSync } from 'node:child_process';

const repoName = (process.env.GITHUB_REPOSITORY || '').split('/')[1] || '';

let basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  basePath = repoName && !repoName.endsWith('.github.io') ? `/${repoName}` : '';
}
basePath = basePath.replace(/\/$/, '');

const env = {
  ...process.env,
  NEXT_OUTPUT_MODE: 'export',
  NEXT_PUBLIC_BASE_PATH: basePath,
};

console.log(`[build:pages] output=export basePath="${basePath || '(根路径)'}"`);

const result = spawnSync('next', ['build'], { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
