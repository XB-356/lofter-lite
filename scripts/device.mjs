#!/usr/bin/env node
// LOFTER Lite 真机联调小工具（零依赖：只用 node 内置模块 + adb）
//
//   node scripts/device.mjs status           # 设备/安装/APK 一览
//   node scripts/device.mjs devices          # 列出已连接设备
//   node scripts/device.mjs install [apk]    # 安装（默认最新的 lofter-lite-debug.apk）
//   node scripts/device.mjs logcat           # 只看 WebView/页面控制台日志
//   node scripts/device.mjs shot [文件名]     # 手机截屏存到 dev-shots/
//   node scripts/device.mjs webviews         # 列出可调试的 WebView（chrome://inspect 的前置检查）
//   node scripts/device.mjs inspect          # 打开电脑 Chrome 的 chrome://inspect
//   node scripts/device.mjs uninstall
//   node scripts/device.mjs connect <ip:port> # 无线调试（Android 11+ 先在手机「无线调试」里配对）
//
// adb 位置：ANDROID_HOME / ANDROID_SDK_ROOT 下的 platform-tools，其次 D:\Android\sdk\platform-tools，最后 PATH。
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PKG = 'com.lofterlite';
const SHOTS = path.join(ROOT, 'dev-shots');

function findAdb() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'D:\\Android\\sdk']
    .filter(Boolean)
    .map((p) => path.join(p, 'platform-tools', 'adb.exe'));
  for (const p of roots) if (fs.existsSync(p)) return p;
  const probe = spawnSync('adb', ['version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'adb';
  return null;
}

const ADB = findAdb();

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function sh(args, opts = {}) {
  const r = spawnSync(ADB, args, { encoding: 'utf8', ...opts });
  if (r.error) die(`执行 adb 失败：${r.error.message}`);
  return r;
}

function devices() {
  const out = sh(['devices', '-l']).stdout || '';
  return out
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim() && !l.startsWith('*'))
    .map((l) => {
      const [serial, state] = l.trim().split(/\s+/);
      return { serial, state };
    })
    .filter((d) => d.state === 'device');
}

function prop(serial, name) {
  return (sh(['-s', serial, 'shell', 'getprop', name]).stdout || '').trim();
}

function pickDevice() {
  if (!ADB) {
    die(
      '没找到 adb。装 Android SDK platform-tools 后设置 ANDROID_HOME，或放到 D:\\Android\\sdk\\platform-tools。\n' +
        '   下载：https://dl.google.com/android/repository/platform-tools-latest-windows.zip（解压即用）'
    );
  }
  const list = devices();
  if (list.length === 0) {
    die(
      '没有已授权的设备。手机上依次做：\n' +
        '  1) 设置 → 关于手机 → 连续点「版本号」7 次，打开开发者选项\n' +
        '  2) 设置 → 系统 → 开发者选项 → 打开「USB 调试」（vivo 需先登录 vivo 帐号才能开「USB 调试（安全设置）」）\n' +
        '  3) 用数据线连电脑，手机上弹出的「允许 USB 调试」点允许\n' +
        ' 然后重跑这条命令。无线调试：在手机的「无线调试」里配对后 node scripts/device.mjs connect <ip:port>'
    );
  }
  return list[0].serial;
}

function newestApk() {
  const found = ['build\\lofter-lite-debug.apk', 'build\\lofter-lite.apk']
    .map((p) => path.join(ROOT, 'android', p))
    .filter((p) => fs.existsSync(p));
  if (found.length === 0) die('没找到 APK，先跑 npm run apk（或 npm run apk -- -Debug）');
  found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0];
}

const commands = {
  status() {
    const serial = pickDevice();
    const model = prop(serial, 'ro.product.model');
    const brand = prop(serial, 'ro.product.brand');
    const android = prop(serial, 'ro.build.version.release');
    const sdk = prop(serial, 'ro.build.version.sdk');
    console.log(`设备  ${brand} ${model}  Android ${android} (SDK ${sdk})  serial=${serial}`);
    const pmPath = (sh(['-s', serial, 'shell', 'pm', 'path', PKG]).stdout || '').trim();
    console.log(pmPath ? `已安装  ${PKG}\n         ${pmPath}` : `未安装  ${PKG}`);
    for (const name of ['lofter-lite-debug.apk', 'lofter-lite.apk']) {
      const apk = path.join(ROOT, 'android', 'build', name);
      if (!fs.existsSync(apk)) continue;
      const st = fs.statSync(apk);
      console.log(`本地 APK  ${path.relative(ROOT, apk)}  ${Math.round(st.size / 1024)}KB  ${st.mtime.toLocaleString()}`);
    }
    console.log('');
    console.log('下一步：npm run device install  → 手机上打开 LOFTER Lite → npm run device inspect');
  },

  devices() {
    console.log(`adb: ${ADB}`);
    process.stdout.write(sh(['devices', '-l']).stdout || '');
    if (devices().length === 0) {
      console.log('（没有可用的设备，见 node scripts/device.mjs status 里的开启步骤）');
    }
  },

  install() {
    const apkArg = process.argv[3];
    const serial = pickDevice();
    const apk = apkArg || newestApk();
    if (!fs.existsSync(apk)) die(`APK 不存在：${apk}`);
    console.log(`→ 安装 ${path.relative(ROOT, apk)} → ${serial}`);
    const r = sh(['-s', serial, 'install', '-r', '-t', apk]);
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (/Success/i.test(out)) {
      console.log('✓ 安装成功');
      console.log('  打开 App 后跑：node scripts/device.mjs webviews   看 WebView 是否可调试');
    } else {
      console.error('✗ 安装失败：\n' + out);
      if (/USER_RESTRICTED|INSTALL_FAILED_USER_RESTRICTED/i.test(out)) {
        console.error(
          '\nvivo 常见原因：需要在「开发者选项」里打开「USB 调试（安全设置）」（要登录 vivo 帐号）。\n' +
            '绕开办法：传到手机里手动点安装——\n' +
            `  "${ADB}" push "${apk}" /sdcard/Download/`
        );
      }
      process.exitCode = 1;
    }
  },

  uninstall() {
    const serial = pickDevice();
    process.stdout.write((sh(['-s', serial, 'uninstall', PKG]).stdout || '').trim() + '\n');
  },

  logcat() {
    const serial = pickDevice();
    const extra = process.argv.slice(3);
    if (extra.includes('--clear')) sh(['-s', serial, 'logcat', '-c']);
    console.log('（只看 WebView/页面控制台/崩溃；Ctrl+C 退出）');
    const child = spawn(
      ADB,
      ['-s', serial, 'logcat', '-v', 'time', 'chromium:V', 'WebView:V', 'console:V', 'AndroidRuntime:E', '*:S'],
      { stdio: 'inherit' }
    );
    child.on('exit', (code) => process.exit(code ?? 0));
  },

  shot() {
    const arg = process.argv[3];
    const name = arg ? (arg.endsWith('.png') ? arg : arg + '.png') : `device-${Date.now()}.png`;
    const serial = pickDevice();
    fs.mkdirSync(SHOTS, { recursive: true });
    const file = path.isAbsolute(name) ? name : path.join(SHOTS, name);
    const r = spawnSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0 || !r.stdout || r.stdout.length < 1000) die('截屏失败（设备可能锁屏或没授权）');
    fs.writeFileSync(file, r.stdout);
    console.log(`✓ 截图：${path.relative(ROOT, file)}  ${Math.round(r.stdout.length / 1024)}KB`);
  },

  webviews() {
    const serial = pickDevice();
    const out = sh(['-s', serial, 'shell', 'cat', '/proc/net/unix']).stdout || '';
    const sockets = out
      .split(/\r?\n/)
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((s) => s && s.includes('webview_devtools_remote'));
    if (sockets.length === 0) {
      console.log('没发现可调试的 WebView。检查：');
      console.log('  1) 装的是 debug 包吗？（npm run device install 默认用 lofter-lite-debug.apk）');
      console.log('  2) release 包的 WebView 调试是关的，要打 debug 包');
      console.log('  3) App 是否已经在前台打开过页面');
      return;
    }
    console.log(`发现 ${sockets.length} 个可调试 WebView：`);
    for (const s of sockets) console.log('  ' + s);
    console.log('\n下一步：node scripts/device.mjs inspect （Chrome 里应能看到 ' + PKG + ' 的页面）');
  },

  inspect() {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    const chrome = candidates.find((p) => p && fs.existsSync(p));
    if (!chrome) {
      console.log('没找到 Chrome。手动打开浏览器访问 chrome://inspect（连上手机后能看到 WebView）');
      return;
    }
    spawn(chrome, ['--new-window', 'chrome://inspect'], { detached: true, stdio: 'ignore' }).unref();
    console.log('✓ 已打开 Chrome 的 chrome://inspect');
    console.log('  等一会儿列表里会出现 ' + PKG + ' 的 WebView，点 inspect 就能用电脑调试页面。');
    console.log('  看不到时：先把 App 打开到具体页面；并确认 inspect 面板里的「Discover USB devices」已勾选。');
  },

  connect() {
    const target = process.argv[3];
    if (!target || !/:\d+$/.test(target)) {
      die('用法：node scripts/device.mjs connect 192.168.1.23:5555（手机「无线调试」里显示的 IP:端口）');
    }
    const r = sh(['connect', target]);
    process.stdout.write(((r.stdout || '') + (r.stderr || '')).trim() + '\n');
    if (/connected/i.test(r.stdout || '')) {
      console.log('✓ 已连接。Android 11+ 的「无线调试」要先在手机上用「使用配对码配对设备」生成配对信息：');
      console.log('  adb pair <ip:配对端口> <6 位配对码>');
    }
  },
};

const cmd = process.argv[2] || 'status';
if (!commands[cmd]) {
  console.log('用法：node scripts/device.mjs <' + Object.keys(commands).join('|') + '>');
  process.exit(1);
}
commands[cmd]();
