'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Cache = require('../lib/cache');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lofter-cache-'));
}

test('内存命中：写入后立刻读到同一个值', () => {
  const dir = tmpDir();
  try {
    const c = new Cache(dir);
    c.set('k', { a: 1 }, 60000);
    assert.deepEqual(c.get('k', 60000), { a: 1 });
    assert.equal(c.get('missing', 60000), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('过期后读到 null（TTL 生效）', async () => {
  const dir = tmpDir();
  try {
    const c = new Cache(dir);
    c.set('k', 'v', 1);
    await sleep(40);
    assert.equal(c.get('k', 1), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('磁盘持久化：新实例（模拟重启）能读到旧值', async () => {
  const dir = tmpDir();
  try {
    const a = new Cache(dir);
    a.set('post:1:2', { id: 2 }, 60000);
    await sleep(120); // set() 是异步写盘

    const b = new Cache(dir);
    assert.deepEqual(b.get('post:1:2', 60000), { id: 2 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('del 之后读不到', async () => {
  const dir = tmpDir();
  try {
    const c = new Cache(dir);
    c.set('k', 'v', 60000);
    c.del('k');
    await sleep(60);
    assert.equal(c.get('k', 60000), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
