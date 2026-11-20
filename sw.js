// v1.8 离线缓存（只在 http(s) 下生效；file:// 下不会注册，游戏照常能玩）。
// 预缓存清单 sw-precache.json 由 src/gen_pwa.py 生成（打包前跑一次）：只含「核心」文件，不含按需词库 data/bank_*.js 和 data/*.json。
// 按需词库（考研/雅思/托福/SAT/新概念）：玩家第一次选到时才下载，下完存进单独的 BANKS 缓存（升级版本也不会丢），之后离线也能用。
// 其他清单外的文件走「先缓存、再联网」。
// GitHub Pages 的旧版和新版位于不同目录，各自维护离线资源。
// 2026-11-20 起：页面和代码（html / js / json）改为「先联网、断网才用缓存」，刷新一次就能拿到新版；图片和音频仍先用缓存。
// 缓存名带 core-nf- 表示这一代规则。从旧的「先缓存」版本升级时，新版激活后会把已打开的页面自动重新载入一次。
const PREFIX = 'wordfight@' + self.registration.scope + ':';
const CACHE = PREFIX + 'core-nf-v1.12-loot-pity2';
const isCode = u => { const p = new URL(u).pathname; return p.endsWith('/') || /\.(html|js|json|webmanifest)$/.test(p); };
const BANKS = PREFIX + 'banks';          // 不随版本清理
const isBank = u => /\/data\/bank_[a-z0-9]+\.js$/.test(new URL(u).pathname);
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let list = [];
    try { list = await (await fetch('sw-precache.json', { cache: 'no-store' })).json(); } catch (x) {}
    // 逐个加，缺一个不影响整体
    // cache:'reload'：绕过浏览器 HTTP 缓存，确保升级时拿到的是新文件（GitHub Pages 会让浏览器缓存 10 分钟）
    await Promise.all(list.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    let legacy = false;
    for (const k of await caches.keys()) if (k.startsWith(PREFIX + 'core-') && k !== CACHE) {
      if (!k.startsWith(PREFIX + 'core-nf-')) legacy = true;
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
async function codeFetch(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (r && r.ok && r.status === 200) c.put(req.url, r.clone());
    return r;
  } catch (x) {
    return (await c.match(req, { ignoreSearch: true })) || Response.error();
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
