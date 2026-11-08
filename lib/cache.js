'use strict';
/**
 * 极简两级缓存：内存 + 磁盘。
 * - 内存：热数据，带过期时间
 * - 磁盘：重启后仍然可用，按 mtime 判断是否过期
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Cache {
  constructor(dir) {
    this.dir = dir;
    this.mem = new Map(); // key -> {v, exp}
    this.maxMem = 300;
    fs.mkdirSync(dir, { recursive: true });
    // 定期清理内存
    setInterval(() => this.sweep(), 60 * 1000).unref();
  }

  file(key) {
    const h = crypto.createHash('sha1').update(key).digest('hex');
    return path.join(this.dir, h.slice(0, 2), h + '.json');
  }

  get(key, ttlMs) {
    const now = Date.now();
    const hit = this.mem.get(key);
    if (hit && hit.exp > now) return hit.v;
    if (hit) this.mem.delete(key);

    const f = this.file(key);
    try {
      const st = fs.statSync(f);
      if (now - st.mtimeMs > ttlMs) return null;
      const v = JSON.parse(fs.readFileSync(f, 'utf8'));
      this.mem.set(key, { v, exp: st.mtimeMs + ttlMs });
      return v;
    } catch {
      return null;
    }
  }

  set(key, v, ttlMs) {
    this.mem.set(key, { v, exp: Date.now() + ttlMs });
    if (this.mem.size > this.maxMem) {
      const first = this.mem.keys().next().value;
      this.mem.delete(first);
    }
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // 异步写盘，失败不影响主流程
    fs.writeFile(f, JSON.stringify(v), (err) => {
      if (err) return;
      const t = new Date();
      fs.utimes(f, t, t, () => {});
    });
  }

  /** 让某个前缀/精确 key 失效 */
  del(key) {
    this.mem.delete(key);
    fs.unlink(this.file(key), () => {});
  }

  sweep() {
    const now = Date.now();
    for (const [k, v] of this.mem) if (v.exp <= now) this.mem.delete(k);
  }
}

module.exports = Cache;
