// v1.8 离线缓存（只在 http(s) 下生效；file:// 下不会注册，游戏照常能玩）。
// 预缓存清单 sw-precache.json 由 src/gen_pwa.py 生成（打包前跑一次）：只含「核心」文件，不含按需词库 data/bank_*.js 和 data/*.json。
// 按需词库（考研/雅思/托福/SAT/新概念）：玩家第一次选到时才下载，下完存进单独的 BANKS 缓存（升级版本也不会丢），之后离线也能用。
// 其他清单外的文件走「先缓存、再联网」。
// GitHub Pages 的旧版和新版位于不同目录，各自维护离线资源。
// 本份是临时测试街 minion-test：缓存名独立，SW 默认范围是本目录（.../minion-test/hd/），不会注册到仓库根，也不会冲掉正式 /hd/ 或其他预览的缓存。
// 2026-11-20 起：页面和代码（html / js / json）改为「先联网、断网才用缓存」，刷新一次就能拿到新版；图片和音频仍先用缓存。
// 缓存名带 core-nf- 表示这一代规则。从旧的「先缓存」版本升级时，新版激活后会把已打开的页面自动重新载入一次。
const PREFIX = 'wordfight@' + self.registration.scope + ':';
const CACHE = PREFIX + 'core-nf-v1.21-minion-test-fixedfoot';
const NET_TIMEOUT = 3000;   // 联网超过 3 秒就先用缓存（网络慢或被墙时不卡死），联网结果回来后悄悄更新缓存
const PRECACHE_PARALLEL = 4; // 预缓存每次只并发 4 个，不和页面本身抢带宽
const isCode = u => { const p = new URL(u).pathname; return p.endsWith('/') || /\.(html|js|json|webmanifest)$/.test(p); };
// 2026-11-21：词库拆成 data/b/<id>.js（每个文件自带全部词条），换一个词库缓存名；旧的 data/bank_<id>.js 缓存在激活时删掉
const BANKS = PREFIX + 'banks2';         // 不随版本清理
const isBank = u => /\/data\/(b\/|bank_)[a-z0-9]+\.js$/.test(new URL(u).pathname);
// 2026-11-21 首屏提速：sw-precache.json = { core, rest }。升级安装时只缓存 core（页面、脚本、菜单要用的图），第一次打开只缓存首页；
//   其余等页面进了菜单、发来 {type:'warm'} 再用 2 路并发慢慢缓存，不和首屏抢带宽（旧格式的数组 = 全部当 core）。
async function readList() {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const j = await (await fetch('sw-precache.json', { cache: 'no-store', signal: ctl.signal })).json();
    clearTimeout(t);
    return Array.isArray(j) ? { core: j, rest: [] } : { core: j.core || [], rest: j.rest || [] };
  } catch (x) { return { core: [], rest: [] }; }
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    self.skipWaiting();
    const all = await readList();
    const old = [];
    for (const k of await caches.keys()) if (k.startsWith(PREFIX + 'core-') && k !== CACHE) old.push(await caches.open(k));
    // 第一次打开（没有旧缓存）：页面自己正在下载这些文件，这里不重复下载，等页面进菜单后发 warm 再从浏览器缓存补齐。
    // 升级（有旧缓存）：先把新版核心文件缓存好；旧缓存里已有的 rest 素材顺手复制过来（只复制不下载）。
    const list = old.length ? all.core.concat(all.rest.map(u => ({ u, copyOnly: true }))) : ['./', 'index.html'];
    // 旧缓存里已有的文件直接复制，不重新下载（以前每次升级都要重下约 18MB）。代码文件的新鲜度由「先联网」保证。
    // 缺的文件限并发下载，缺一个不影响整体。
    let next = 0;
    async function worker() {
      while (next < list.length) {
        const it = list[next++], u = typeof it === 'string' ? it : it.u, copyOnly = typeof it !== 'string';
        try {
          let hit = null;
          // 只复制图片、音频等素材；代码一律重新下载，避免新旧版本的代码混在一起。
          if (!isCode(new URL(u, self.location.href).href)) for (const o of old) { hit = await o.match(u, { ignoreSearch: true }); if (hit) break; }
          if (hit) await c.put(u, hit);
          else if (!copyOnly) {
            // 单个文件最多等 10 秒，卡住的跳过（之后玩到时再按需缓存）。
            const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
            try { const r = await fetch(new Request(u, { cache: 'no-cache', signal: ctl.signal })); if (r.ok) await c.put(u, r); } finally { clearTimeout(t); }   // no-cache = 向服务器确认，没变就用浏览器缓存（304，几乎不耗流量）
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
    await caches.delete(PREFIX + 'banks');   // 旧格式的按需词库缓存（新版不再用）
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
  // 只用本版本自己的缓存，不拿旧版本缓存里的代码。首页地址（./ 与 index.html）互为备用。
  const cached = async () => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit || req.mode !== 'navigate') return hit;
    return (await c.match(new URL('./', self.location.href).href)) || (await c.match(new URL('index.html', self.location.href).href));
  };
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
// 页面进菜单后发来 warm：后台补齐 core + rest（已缓存的跳过），2 路并发，单个文件最多等 20 秒
let warming = null;
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'warm') return;
  // 页面已经下载过的词库：补进 BANKS 缓存（多半直接来自浏览器缓存，不重复走网络）
  const bl = Array.isArray(e.data.banks) ? e.data.banks.filter(u => typeof u === 'string' && isBank(new URL(u, self.registration.scope).href)) : [];
  if (bl.length) {
    const p = (async () => {
      const c = await caches.open(BANKS);
      for (const u of bl) {
        const href = new URL(u, self.registration.scope).href;
        try { if (!(await c.match(href))) { const r = await fetch(href); if (r && r.ok && r.status === 200) await c.put(href, r); } } catch (x) {}
      }
    })();
    if (e.waitUntil) e.waitUntil(p);
  }
  if (warming) return;
  warming = (async () => {
    const all = await readList(), rest = all.core.concat(all.rest), c = await caches.open(CACHE);   // 第一次打开时 core 也在这里补（多半直接来自浏览器缓存）
    let next = 0;
    async function worker() {
      while (next < rest.length) {
        const u = rest[next++];
        try {
          if (await c.match(u, { ignoreSearch: true })) continue;
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
          try { const r = await fetch(new Request(u, { signal: ctl.signal })); if (r.ok) await c.put(u, r); } finally { clearTimeout(t); }
        } catch (x) {}
      }
    }
    await Promise.all([worker(), worker()]);
  })();
  if (e.waitUntil) e.waitUntil(warming);
});
