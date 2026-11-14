#!/usr/bin/env node
/**
 * 零依赖自检：语法 + JSON + 相对路径引用是否存在。
 * 没有构建步骤的项目，最怕的就是改出一个手滑的 require。
 *
 *   node scripts/check.mjs
 *   npm run check
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'www', 'gen', 'build', 'tools']);
const JS_EXT = new Set(['.js', '.mjs', '.cjs']);
const JSON_EXT = new Set(['.json', '.webmanifest']);

const problems = [];
let checked = 0;

function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue;
      walk(full);
      continue;
    }
    const ext = path.extname(name.name).toLowerCase();
    if (JS_EXT.has(ext)) checkJs(full);
    else if (JSON_EXT.has(ext)) checkJson(full);
  }
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function checkJs(file) {
  checked++;
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim().split('\n').filter(Boolean).slice(-4).join(' / ');
    problems.push(`${rel(file)} 语法错误: ${msg}`);
    return;
  }
  checkImports(file);
}

const IMPORT_RE = /(?:require\(\s*|from\s+|import\(\s*)['"](\.[^'"]+)['"]/g;
function checkImports(file) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1];
    const target = path.resolve(path.dirname(file), spec);
    const candidates = [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, path.join(target, 'index.js')];
    if (!candidates.some((c) => exists(c))) problems.push(`${rel(file)} 引用了不存在的模块: ${spec}`);
  }
}

function exists(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function checkJson(file) {
  checked++;
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${rel(file)} JSON 解析失败: ${err.message}`);
  }
}

walk(ROOT);

if (problems.length) {
  console.error(`\n✗ check 失败（${problems.length} 个问题，已检查 ${checked} 个文件）\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ check 通过（${checked} 个文件：语法 / JSON / 相对引用）`);
