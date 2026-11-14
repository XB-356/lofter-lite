#!/usr/bin/env node
/**
 * 开发启动器（跨平台，Windows 也能用；不需要 nodemon）。
 *
 *   node scripts/dev.mjs                # 真实 LOFTER 上游 + 文件变更自动重启
 *   node scripts/dev.mjs --mock         # 本地假数据，完全离线，随便点不心疼
 *   node scripts/dev.mjs --lan          # 监听 0.0.0.0，手机同一 WiFi 可访问
 *   node scripts/dev.mjs --mock --lan --open
 *   node scripts/dev.mjs --port 8790 --no-watch
 *
 * 对应 npm script：npm run dev / dev:mock / dev:lan / dev:mock:lan
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

const has = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
};

if (has('help') || has('h')) {
  console.log(`用法: node scripts/dev.mjs [选项]

  --mock         使用 dev/mock.js 本地假数据（不访问 LOFTER）
  --lan          监听 0.0.0.0，同一局域网手机可访问
  --port <n>     端口，默认 8787（0 = 随机）
  --open         启动后自动打开浏览器
  --no-watch     关闭文件变更自动重启
  --help         显示帮助

环境变量同样有效：PORT、HOST、LOFTER_LITE_MOCK=1、MOCK_FAIL=1、MOCK_EMPTY=1、MOCK_DELAY=800`);
  process.exit(0);
}

const env = { ...process.env };
if (has('mock')) env.LOFTER_LITE_MOCK = '1';
if (has('lan')) env.HOST = env.HOST || '0.0.0.0';
if (value('port')) env.PORT = value('port');
if (!env.PORT) env.PORT = '8787';

const watch = !has('no-watch');
const args = [...(watch ? ['--watch'] : []), 'server.js'];

const mock = env.LOFTER_LITE_MOCK === '1';
const host = env.HOST || '127.0.0.1';
const loopback = host === '0.0.0.0' || host === '::' || host === '';
const shown = loopback ? '127.0.0.1' : host;
const url = `http://${shown}:${env.PORT}`;

console.log('');
console.log('  LOFTER Lite · 开发模式');
console.log(`  数据   ${mock ? 'mock（本地假数据，离线可用）' : 'live（真实 LOFTER 上游）'}`);
console.log(`  监听   ${host}${loopback ? '  （局域网可访问）' : ''}`);
console.log(`  地址   ${url}`);
console.log(`  热重启 ${watch ? '开（node --watch）' : '关'}`);
if (mock) console.log('  提示   MOCK_FAIL=1 错误态 · MOCK_EMPTY=1 空态 · MOCK_DELAY=800 慢速');
console.log('');

const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });

if (has('open')) waitForServer(url).then(() => openBrowser(url));

child.on('exit', (code) => process.exit(code == null ? 0 : code));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}

async function waitForServer(base) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/ping`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function openBrowser(target) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', target]]
      : process.platform === 'darwin'
        ? ['open', [target]]
        : ['xdg-open', [target]];
  try {
    const p = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {}
}
