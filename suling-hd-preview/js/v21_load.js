// 2026-11-21 首屏提速（配合 render.js Sprites / v18_banks.js / sw.js）：
//  1) 闯关开局前等全部角色图（小怪 / 首领）下完，其它模式只等可选角色（bankGate 里判断 _campGate）
//  2) 飞往一座城时，预取这座城首领的专属音乐（马西克），进擂台不用临时缓冲
//  3) 进菜单 8 秒后通知 service worker 在后台慢慢缓存其余文件（离线可玩），不和首屏抢带宽
(function () {
  const W = window.WF, G = W.Game && W.Game.prototype; if (!G) return;
  const baseStart = G.startCampaign;
  G.startCampaign = function () { this._campGate = true; try { return baseStart.apply(this, arguments); } finally { this._campGate = false; } };

  const fetched = {};
  W.prefetch = function (url) {
    if (!url || fetched[url] || !window.fetch || location.protocol === 'file:') return;
    fetched[url] = true; fetch(url).then(r => r.blob()).catch(() => { fetched[url] = false; });
  };
  const baseMap = G.campMapStart;
  if (baseMap) G.campMapStart = function () {
    const r = baseMap.apply(this, arguments), cp = this.camp;
    try { if (cp && cp.city && cp.city.bgm) W.prefetch(W.Audio.extraFile(cp.city.bgm)); } catch (e) {}
    return r;
  };

  // 第一次打开时词库在 SW 接管前就下好了，没进词库缓存：warm 时把已下载的词库文件一并告诉 SW
  function warm() {
    try {
      const sw = navigator.serviceWorker; if (!sw) return;
      if (!sw.controller) { if (!warm.wait) { warm.wait = 1; sw.addEventListener('controllerchange', () => setTimeout(warm, 2000)); } return; }
      const banks = (window.WF_BANKS || []).filter(b => b.lazy && b.loaded && b.file).map(b => b.file);
      sw.controller.postMessage({ type: 'warm', banks });
    } catch (e) {}
  }
  const iv = setInterval(() => { if (W.ready) { clearInterval(iv); setTimeout(warm, 8000); } }, 500);
})();
