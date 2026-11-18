// v1.8 手机原型：触屏点击、横屏整数 / 最近邻缩放 + 黑边、竖屏「请横屏」、点击开始（解锁音频）、PWA 注册。
// 键盘和鼠标照常可用。触屏设备（或网址加 ?touch=1）才会出现「点击开始」；?tap=1 可在电脑上强制出现。
(function () {
  const W = window.WF = window.WF || {};
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
#wf-tap em{font-style:normal;margin-top:4vmin;padding:1.6vmin 6vmin;border:.6vmin solid #ffd23c;border-radius:2vmin;font-size:5vmin;color:#fff;animation:wfp 1.2s infinite;}
@keyframes wfp{50%{opacity:.35}}
#wf-rot i{display:block;width:12vmin;height:20vmin;border:1vmin solid #ffd23c;border-radius:2vmin;margin-bottom:4vmin;animation:wfr 2s infinite ease-in-out;}
@keyframes wfr{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
body.wf-touch #wf-dict .wf-back,body.wf-touch #wf-dict .wf-fight,body.wf-touch #wf-dict .wf-tab{min-height:44px;min-width:44px;padding:8px 16px;font-size:16px;}
body.wf-touch #wf-dict .wf-speak{width:48px;height:48px;line-height:48px;font-size:20px;}
body.wf-touch #wf-dict .wf-bar{padding:8px 14px 8px;gap:6px 10px;}
body.wf-touch #wf-dict .wf-list{padding:10px 14px 6px;-webkit-overflow-scrolling:touch;touch-action:pan-y;}
body.wf-touch #wf-dict{touch-action:pan-y;}
@media (max-height:500px){body.wf-touch #wf-dict .wf-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x;padding-bottom:2px;}body.wf-touch #wf-dict .wf-tab{flex:0 0 auto;min-height:40px;padding:4px 14px;}body.wf-touch #wf-dict h1{font-size:18px;}body.wf-touch #wf-dict .wf-card{padding:10px 14px;}body.wf-touch #wf-dict .wf-word{font-size:24px;}}
`;
  document.head.appendChild(st);
  const mk = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  const rot = mk('wf-rot', '<i></i><b>请横屏</b><small>把手机横过来玩 · Please rotate your device</small>');
  const tap = mk('wf-tap', '<b>单词格斗</b><em>点击屏幕开始</em><small>先点一下，声音才会出来</small>');
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
    tap.style.display = 'none';
    try { W.Audio && W.Audio.unlock(); } catch (x) {}
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
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
