// 桌面测试端启动器（Windows）：确保 exe 存在 / 源码更新后自动重编译，然后打开界面
//   npm run desktop            打开图形界面
//   npm run desktop -- --self-test   无界面自检（随机端口起 mock 服务，ping 通就 OK）
//   npm run desktop -- --headless --mock --port 8899   无界面跑服务（脚本/调试用）
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'desktop', 'LOFTER-Lite-Launcher.exe');
const src = path.join(root, 'desktop', 'src', 'Launcher.cs');
const buildScript = path.join(root, 'desktop', 'build.ps1');

if (process.platform !== 'win32') {
  console.log('桌面启动器只支持 Windows。');
  console.log('在其它系统上用：npm run dev:mock（假数据）或 npm run dev（真实上游）');
  process.exit(0);
}

function build() {
  console.log('[desktop] 编译启动器…');
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
    { stdio: 'inherit', cwd: root }
  );
  if (r.status !== 0) {
    console.error('[desktop] 编译失败');
    process.exit(r.status || 1);
  }
}

const needBuild = !existsSync(exe) || (existsSync(src) && statSync(src).mtimeMs > statSync(exe).mtimeMs);
if (needBuild) build();

const args = process.argv.slice(2);
const headless = args.includes('--headless') || args.includes('--self-test');

if (headless) {
  // 无界面模式：直接把输出接到当前终端，Ctrl+C 结束
  const child = spawn(exe, args, { stdio: 'inherit' });
  const forward = (sig) => () => { try { child.kill(sig); } catch { } };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
  child.on('exit', (code) => process.exit(code == null ? 0 : code));
} else {
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: root });
  child.unref();
  console.log('[desktop] 已打开 LOFTER Lite 测试端窗口');
  console.log('[desktop] 窗口里选「Mock 假数据 / 真实上游」→ 点「启动」→ 「打开浏览器」');
}
