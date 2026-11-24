// v1.8 手机原型：触屏点击、横屏整数 / 最近邻缩放 + 黑边、竖屏「请横屏」、点击开始（解锁音频）、PWA 注册。
// 键盘和鼠标照常可用。触屏设备（或网址加 ?touch=1）才会出现「点击开始」；?tap=1 可在电脑上强制出现。
(function () {
  const W = window.WF = window.WF || {};
  // CSS 显示尺寸仍按 960×540 计算（和改内部分辨率之前占的窗口一样）。画布位图像素是 OUT_W×OUT_H。
  const SW = 960, SH = 540;
  const qs = /[?&]touch=1(&|$)/.test(location.search || ''), qtap = /[?&]tap=1(&|$)/.test(location.search || '');
  W.touch = !!(qs || 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia('(pointer:coarse)').matches));
  W.hold = false;   // true = 主循环停（竖屏 / 还没点开始）
  const MIN_CSS = 44;   // 手指最小点击尺寸（CSS 像素）

  // ---------- 样式 ----------
  const st = document.createElement('style');
  st.textContent = `
html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
body{height:100vh;height:100dvh;touch-action:none;}
#game{touch-action:none;}
#wf-rot,#wf-tap{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#ffd23c;font-family:"Noto Sans SC","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;}
#wf-rot{z-index:100;background:#05030cf5;}
#wf-tap{z-index:90;background:radial-gradient(ellipse at center,#2a1450 0%,#05030c 75%);}
#wf-rot b{font-size:9vmin;letter-spacing:.1em;}
#wf-rot small,#wf-tap small{color:#bfb3d6;font-size:3.4vmin;margin-top:2vmin;}
#wf-tap b{font-size:9vmin;font-family:"Noto Serif SC","Noto Serif CJK SC","Songti SC",serif;text-shadow:0 0 .4em #7a1414;}
#wf-tap button{font:inherit;font-size:4vmin;color:#fff;background:#3a2266;border:.4vmin solid #ffd23c;border-radius:1.5vmin;padding:1.2vmin 3vmin;}
#wf-tap em{font-style:normal;margin-top:4vmin;padding:1.6vmin 6vmin;border:.6vmin solid #ffd23c;border-radius:2vmin;font-size:5vmin;color:#fff;animation:wfp 1.2s infinite;}
@keyframes wfp{50%{opacity:.35}}
#wf-rot i{display:block;width:12vmin;height:20vmin;border:1vmin solid #ffd23c;border-radius:2vmin;margin-bottom:4vmin;animation:wfr 2s infinite ease-in-out;}
@keyframes wfr{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
`;
  document.head.appendChild(st);
  const mk = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  const rot = mk('wf-rot', '<i></i><b>请横屏</b><small>把手机横过来玩 · Please rotate your device</small>');
  const tap = mk('wf-tap', '<b>单词格斗</b><em>点击屏幕开始</em><small>先点一下，声音才会出来</small><small class="wf-load"></small><span class="wf-fix" style="display:none;margin-top:3vmin;gap:4vmin"><button data-act="reload">重新加载</button><button data-act="reset">清除缓存后重进</button></span>');
  // 游戏还没加载完时，在点击开始页显示进度；点了先留在这页，加载完自动进入。
  // 超过 10 秒还没好：显示报错原因和「重新加载 / 清除缓存后重进」按钮（主屏幕快捷方式里没有刷新键）。
  const loadNote = tap.querySelector('.wf-load'), fixBar = tap.querySelector('.wf-fix');
  const t0 = Date.now(), bootErrors = [];
  window.addEventListener('error', e => { bootErrors.push(((e.message || '') + ' ' + ((e.filename || '').split('/').pop()) + ':' + (e.lineno || '')).trim()); });
  const isReady = () => !!(W.ready || W.game);
  let tapPending = false;
  loadNote.textContent = '正在加载…';
  async function resetAll() {
    // 只清本目录（试玩页）的 service worker 和缓存，不动旧版主页。
    try { for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope === new URL('./', location.href).href) await r.unregister(); } catch (x) {}
    try { for (const k of await caches.keys()) if (k.startsWith('wordfight@' + new URL('./', location.href).href)) await caches.delete(k); } catch (x) {}
    // 先装好新的 service worker 再重进：它会绕过浏览器的 10 分钟缓存去取最新代码。
    try {
      await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 15000))]);
    } catch (x) {}
    location.replace(location.pathname);
  }
  if (/[?&]reset=1(&|$)/.test(location.search || '')) { resetAll(); }
  fixBar.addEventListener('touchend', e => e.stopPropagation(), { passive: true });
  fixBar.addEventListener('click', e => {
    e.stopPropagation();
    const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'reload') location.reload();
    if (act === 'reset') resetAll();
  });
  const readyWatch = setInterval(() => {
    if (isReady()) { clearInterval(readyWatch); fixBar.style.display = 'none'; if (!tapPending) loadNote.textContent = ''; return; }
    const sec = Math.round((Date.now() - t0) / 1000);
    if (sec >= 10) {
      fixBar.style.display = 'flex';
      loadNote.textContent = `已等待 ${sec} 秒` + (bootErrors.length ? ` · 出错：${bootErrors[0].slice(0, 80)}` : ' · 网络慢或缓存异常时可点下面按钮');
    }
  }, 500);
  if (W.touch) document.body.classList.add('wf-touch');

  // ---------- 缩放：整数倍优先（损失 ≤3% 屏幕才取整数，否则铺满用最近邻分数倍），否则最近邻分数倍；黑边居中 ----------
  function layout() {
    const cv = document.getElementById('game'); if (!cv) return;
    const vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const fit = Math.min(vw / SW, vh / SH) * dpr, k = Math.floor(fit);
    const s = (k >= 1 && k >= fit * 0.97) ? k : fit;     // 设备像素下的倍率
    const css = s / dpr;
    cv.style.width = Math.floor(SW * css) + 'px'; cv.style.height = Math.floor(SH * css) + 'px';
    cv.style.imageRendering = s >= 1 ? 'pixelated' : 'auto';   // 缩小时用平滑，免得中文字发毛
    W.view = { vw, vh, dpr, scale: css, devScale: s, integer: s === k && k >= 1 };
    const portrait = vh > vw && W.touch;
    rot.style.display = portrait ? 'flex' : 'none';
    W.hold = portrait || tap.style.display === 'flex';
  }
  window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  if (W.touch || qtap) tap.style.display = 'flex';
  layout();

  function startTap(e) {
    if (tap.style.display !== 'flex') return;
    if (e && e.cancelable) e.preventDefault();
    try { W.Audio.unlock(); } catch (x) {}
    if (!isReady()) {
      if (tapPending) return;
      tapPending = true;
      if (Date.now() - t0 < 10000) loadNote.textContent = '正在加载，网络慢时请稍等…';
      const wait = setInterval(() => { if (isReady()) { clearInterval(wait); tapPending = false; startTap(); } }, 300);
      return;
    }
    tap.style.display = 'none';
    try {
      if (!W.game || W.game.state === 'title') W.Audio.startMusic({ keep: true });
      W.Audio.play('confirm');
    } catch (x) {}
    try { const el = document.documentElement; if (W.touch && el.requestFullscreen && !document.fullscreenElement) { const p = el.requestFullscreen(); p && p.catch && p.catch(() => {}); } } catch (x) {}
    try { if (screen.orientation && screen.orientation.lock) { const p = screen.orientation.lock('landscape'); p && p.catch && p.catch(() => {}); } } catch (x) {}
    layout();
  }
  tap.addEventListener('touchend', startTap, { passive: false });
  tap.addEventListener('click', startTap);
  tap.addEventListener('keydown', startTap);
  window.addEventListener('keydown', () => { if (tap.style.display === 'flex' && qtap) startTap(); });
  window.addEventListener('touchstart', () => { if (!W.touch) { W.touch = true; document.body.classList.add('wf-touch'); } }, { passive: true, once: true });

  // ---------- 点击命中：触屏时把小按钮的点击区放大到 ≥44 CSS 像素，取最近的 ----------
  W.pickRect = function (rects, x, y) {
    rects = rects || [];
    const exact = rects.filter(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (!W.touch) return rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (exact.length) return exact.sort((a, b) => a.w * a.h - b.w * b.h)[0];   // 重叠时取最小的（全屏「再来一局」垫底）
    const m = MIN_CSS / ((W.view && W.view.scale) || 1);
    let best = null, bd = 1e9;
    for (const r of rects) {
      if (r.w >= SW * 0.9 && r.h >= SH * 0.9) continue;
      const px = Math.max(0, (m - r.w) / 2), py = Math.max(0, (m - r.h) / 2);
      if (x < r.x - px || x > r.x + r.w + px || y < r.y - py || y > r.y + r.h + py) continue;
      const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2)); if (d < bd) { bd = d; best = r; }
    }
    return best || rects.find(r => r.w >= SW * 0.9 && r.h >= SH * 0.9);
  };

  // ---------- 战斗里的触屏：点选项答题；非闯关对局的暂停按钮 ----------
  const G = WF.Game && WF.Game.prototype;
  if (G) {
    const baseRender = G.render;
    G.render = function () {
      this.ansRects = [];
      const r = baseRender.apply(this, arguments);
      this.touchRects = [];
      if (W.touch && this.state !== 'title' && this.state !== 'result' && !this.camp) {
        const c = this.ctx, C = WF.CFG;
        if (!this.paused) {
          const x = C.SCREEN_W - 64, y = 78, s = 48;
          this.box(x, y, s, s, 'rgba(14,10,28,0.8)', '#e9d7a6', 2); c.fillStyle = '#e9d7a6'; c.fillRect(x + 15, y + 12, 6, 24); c.fillRect(x + 27, y + 12, 6, 24);
          this.touchRects.push({ x, y, w: s, h: s, key: 'tpause' });
        } else {
          [['继续', 'tresume', C.SCREEN_W / 2 - 240, '#ffd23c'], ['返回标题', 'tquit', C.SCREEN_W / 2 + 40, '#e9d7a6']].forEach(([t, k, x, col]) => {
            this.box(x, 340, 200, 56, 'rgba(20,14,40,0.94)', col, 3); this.txt(t, x + 100, 369, 22, col, 'center', { sw: 5 });
            this.touchRects.push({ x, y: 340, w: 200, h: 56, key: k });
          });
        }
      }
      return r;
    };
    W.touchHit = function (g, x, y) {
      if (g.state === 'title') return false;
      const t = W.pickRect(g.touchRects, x, y);
      if (t) {
        if (t.key === 'tpause' || t.key === 'tresume') { g.paused = !g.paused; if (g.paused) WF.Audio.stopMusic(); else WF.Audio.startMusic(); }
        else if (t.key === 'tquit') g.goTitle();
        return true;
      }
      if (g.paused) return false;
      const a = (g.ansRects || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (a && (g.state === 'question' || g.state === 'clash' || g.state === 'rocket')) { g.answer(0, a.i); return true; }
      return false;
    };
  }

  // ---------- PWA：只在 http(s) 下注册，file:// 下什么也不做 ----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    // 页面若由别的 service worker 控制（例如旧版主页那一个），本目录的 service worker 接管后重新载入一次。
    const mine = new URL('sw.js', location.href).href, first = navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !first || first.scriptURL === mine) return;
      // 同一标签页 30 秒内最多自动重载一次，避免反复重载。
      const last = +sessionStorage.getItem('wf-sw-reload') || 0;
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem('wf-sw-reload', String(Date.now()));
      reloaded = true; location.reload();
    });
    // 不等页面全部加载完就注册 / 检查更新：网络卡住时，新版 service worker 也能先装上并接管。
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
