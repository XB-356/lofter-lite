'use strict';
/** 测试辅助：用随机端口启动一个真实的 server.js 子进程（mock 数据），用完关掉。 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function startServer({ env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lofter-lite-test-'));
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0', // 随机端口，测试之间不冲突
        HOST: '127.0.0.1',
        LOFTER_LITE_MOCK: '1',
        LOFTER_LITE_CACHE_DIR: cacheDir,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let done = false;
    const timer = setTimeout(() => finish(new Error(`启动超时:\n${out}`)), 20000);

    function finish(err, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        child.kill();
        return reject(err);
      }
      resolve(value);
    }

    child.stdout.on('data', (buf) => {
      out += buf.toString();
      const m = /LOFTER Lite 已启动: http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (m) {
        const port = Number(m[1]);
        finish(null, {
          child,
          port,
          base: `http://127.0.0.1:${port}`,
          cacheDir,
          output: () => out,
          async close() {
            await new Promise((res) => {
              if (child.exitCode != null) return res();
              child.once('exit', res);
              child.kill();
            });
            fs.rmSync(cacheDir, { recursive: true, force: true });
          },
        });
      }
    });
    child.stderr.on('data', (buf) => {
      out += buf.toString();
    });
    child.on('exit', (code) => finish(new Error(`server 退出 ${code}:\n${out}`)));
  });
}

async function get(base, pathname, options) {
  const res = await fetch(base + pathname, options);
  const text = await res.text();
  let body = text;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {}
  }
  return { res, status: res.status, headers: res.headers, body, text };
}

module.exports = { ROOT, startServer, get };
