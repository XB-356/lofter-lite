#!/usr/bin/env node
/**
 * 清缓存。调试时改完上游解析逻辑，旧缓存会让人怀疑人生。
 *
 *   node scripts/cache-clear.mjs         # 清 data/cache 和 data/cache-mock（真实 / mock 各一份）
 *   node scripts/cache-clear.mjs --all   # 连 data/ 一起删
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const targets = all
  ? [path.join(ROOT, 'data')]
  : [path.join(ROOT, 'data', 'cache'), path.join(ROOT, 'data', 'cache-mock')];

function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      const sub = walk(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files++;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

let cleaned = 0;
for (const target of targets) {
  if (!existsSync(target)) continue;
  const { files, bytes } = walk(target);
  rmSync(target, { recursive: true, force: true });
  cleaned++;
  console.log(`✓ 已清理 ${path.relative(ROOT, target)}：${files} 个文件 / ${(bytes / 1024).toFixed(1)} KB`);
}

if (!cleaned) console.log('（没有可清理的缓存，data/ 本来就是干净的）');
