// v1.8 离线缓存（只在 http(s) 下生效；file:// 下不会注册，游戏照常能玩）。
// 预缓存清单 sw-precache.json 由 src/gen_pwa.py 生成（打包前跑一次）：只含「核心」文件，不含按需词库 data/bank_*.js 和 data/*.json。
// 按需词库（考研/雅思/托福/SAT/新概念）：玩家第一次选到时才下载，下完存进单独的 BANKS 缓存（升级版本也不会丢），之后离线也能用。
// 其他清单外的文件走「先缓存、再联网」。
// GitHub Pages 的旧版和新版位于不同目录，各自维护离线资源。
// 2026-11-20 起：页面和代码（html / js / json）改为「先联网、断网才用缓存」，刷新一次就能拿到新版；图片和音频仍先用缓存。
// 缓存名带 core-nf- 表示这一代规则。从旧的「先缓存」版本升级时，新版激活后会把已打开的页面自动重新载入一次。
const PREFIX = 'wordfight@' + self.registration.scope + ':';
const CACHE = PREFIX + 'core-nf-v1.12-net-timeout1';
const NET_TIMEOUT = 3000;   // 联网超过 3 秒就先用缓存（网络慢或被墙时不卡死），联网结果回来后悄悄更新缓存
const PRECACHE_PARALLEL = 4; // 预缓存每次只并发 4 个，不和页面本身抢带宽
const isCode = u => { const p = new URL(u).pathname; return p.endsWith('/') || /\.(html|js|json|webmanifest)$/.test(p); };
const BANKS = PREFIX + 'banks';          // 不随版本清理
const isBank = u => /\/data\/bank_[a-z0-9]+\.js$/.test(new URL(u).pathname);
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let list = [];
    self.skipWaiting();
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      list = await (await fetch('sw-precache.json', { cache: 'no-store', signal: ctl.signal })).json();
      clearTimeout(t);
    } catch (x) {}
    // 旧缓存里已有的文件直接复制，不重新下载（以前每次升级都要重下约 18MB）。代码文件的新鲜度由「先联网」保证。
    // 缺的文件限并发下载，缺一个不影响整体。
    const old = [];
    for (const k of await caches.keys()) if (k.startsWith(PREFIX + 'core-') && k !== CACHE) old.push(await caches.open(k));
    let next = 0;
    async function worker() {
      while (next < list.length) {
        const u = list[next++];
        try {
          let hit = null;
          for (const o of old) { hit = await o.match(u, { ignoreSearch: true }); if (hit) break; }
          if (hit) await c.put(u, hit);
          else {
            // 单个文件最多等 10 秒，卡住的跳过（之后玩到时再按需缓存）。
            const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
            try { const r = await fetch(new Request(u, { cache: 'reload', signal: ctl.signal })); if (r.ok) await c.put(u, r); } finally { clearTimeout(t); }
          }
        } catch (x) {}
      }
    }
    // 预缓存最多占用 20 秒，到时间就先完成安装，让新版尽快接管；没缓存到的文件以后按需补。
    await Promise.race([Promise.all(Array.from({ length: PRECACHE_PARALLEL }, worker)), new Promise(r => setTimeout(r, 20000))]);
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    let legacy = false;
    for (const k of await caches.keys()) if (k.startsWith(PREFIX + 'core-') && k !== CACHE) {
      // 旧的「先缓存」版本，以及 18:20 发布的 loot-pity2（联网没有超时，慢网下会卡住）：升级后都把打开的页面重载一次。
      if (!k.startsWith(PREFIX + 'core-nf-') || k === PREFIX + 'core-nf-v1.12-loot-pity2') legacy = true;
      await caches.delete(k);
    }
    await self.clients.claim();
    // 旧版页面是从旧缓存载入的，代码已过时：重新载入一次，玩家不用再手动刷新。
    if (legacy) for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  if (isBank(req.url)) { e.respondWith(bankFetch(req)); return; }
  if (req.mode === 'navigate' || isCode(req.url)) { e.respondWith(codeFetch(req)); return; }
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; } catch (x) { return hit || Response.error(); }
  })());
});
// 页面和代码：先联网（向服务器确认是否有新版，绕过浏览器 10 分钟的 HTTP 缓存），断网时才用缓存。
// 网络超过 NET_TIMEOUT 还没回来、或出错时，有缓存就先用缓存；没有缓存只能继续等网络。
async function codeFetch(req) {
  const c = await caches.open(CACHE);
  const cached = async () => (await c.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
    if (r && r.ok && r.status === 200) c.put(req.url, r.clone()).catch(() => {});
    return r;
  });
  const timer = new Promise(res => setTimeout(res, NET_TIMEOUT, 'timeout'));
  try {
    const first = await Promise.race([net, timer]);
    if (first !== 'timeout') return first;
    const hit = await cached();
    if (hit) return hit;
    return await net;
  } catch (x) {
    return (await cached()) || Response.error();
  }
}
// 按需词库：缓存里有就直接用（后台悄悄更新一份）；没有就联网下载并存下。带 ?r= 的是页面发现缓存内容不对后的重试 → 跳过缓存直接联网。
async function bankFetch(req) {
  const c = await caches.open(BANKS), key = new URL(req.url); key.search = '';
  const retry = new URL(req.url).search.indexOf('r=') >= 0;
  const hit = retry ? null : await c.match(key.href);
  const net = () => fetch(key.href, { cache: retry ? 'reload' : 'default' }).then(r => { if (r && r.ok && r.status === 200) c.put(key.href, r.clone()); return r; });
  if (hit) { net().catch(() => {}); return hit; }
  try { return await net(); } catch (x) { return Response.error(); }
}
