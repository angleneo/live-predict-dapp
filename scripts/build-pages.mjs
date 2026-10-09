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
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/**
 * 解析本地安装的 next 可执行入口。
 * CI 里以 `node scripts/build-pages.mjs` 直接调用脚本，PATH 不含 node_modules/.bin，
 * 靠 shell 找 `next` 会报 `next: not found`（exit 127），因此显式解析。
 */
function resolveNextBin() {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('next/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const binRelative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.next;
    return binRelative ? join(dirname(pkgPath), binRelative) : null;
  } catch {
    return null;
  }
}

const nextBin = resolveNextBin();
const result = nextBin
  ? spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit', env })
  : spawnSync('next', ['build'], { stdio: 'inherit', env, shell: true });

process.exit(result.status ?? 1);
