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
    this.writes = new Map(); // key -> Promise，set() 的异步写盘
    this.deleted = new Set(); // 删除中的 key，避免「删完又被慢写入复活」
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
    if (this.deleted.has(key)) return null;
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
    this.deleted.delete(key);
    this.mem.set(key, { v, exp: Date.now() + ttlMs });
    if (this.mem.size > this.maxMem) {
      const first = this.mem.keys().next().value;
      this.mem.delete(first);
    }
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // 异步写盘，失败不影响主流程
    const p = new Promise((resolve) => {
      fs.writeFile(f, JSON.stringify(v), (err) => {
        if (err) return resolve();
        const t = new Date();
        fs.utimes(f, t, t, () => resolve());
      });
    });
    this.writes.set(key, p);
    p.then(() => {
      if (this.writes.get(key) === p) this.writes.delete(key);
    });
  }

  /** 让某个 key 失效；等写盘落定再删文件，避免异步写把刚删的文件又写回来 */
  del(key) {
    this.mem.delete(key);
    this.deleted.add(key);
    const f = this.file(key);
    const unlink = () => fs.unlink(f, () => this.deleted.delete(key));
    const pending = this.writes.get(key);
    if (pending) pending.then(unlink);
    else unlink();
  }

  sweep() {
    const now = Date.now();
    for (const [k, v] of this.mem) if (v.exp <= now) this.mem.delete(k);
  }
}

module.exports = Cache;
