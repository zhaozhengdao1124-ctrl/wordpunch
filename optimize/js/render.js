// 精灵绘制 + 程序化像素擂台背景 + 打击特效
WF.rng = function (seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

WF.Sprites = {
  img: {},
  // 2026-11-21 首屏提速：启动只等「菜单要用的」可选角色正常图（7 张）；其余（受击白 / 红图、闯关小怪和城市首领）进菜单后后台慢慢下，
  // 开局前没下完由 bankGate 显示进度（见 js/v18_banks.js）。没下完的图画的时候直接跳过，不会报错。
  VARS: ['', '_white', '_red'],
  st: {}, q: [], active: 0, PAR: 3, subs: [],
  init() {
    if (this._init) return; this._init = true;
    for (const id of Object.keys(window.WF_ASSETS)) { this.img[id] = {}; for (const v of this.VARS) this.img[id][v.replace('_', '') || 'normal'] = new Image(); }
  },
  ok(im) { return !!(im && im.complete && im.naturalWidth); },
  start(id, v) {
    const k = id + v; if (this.st[k] || !this.img[id]) return;
    this.st[k] = 'loading'; this.active++;
    const im = this.img[id][v.replace('_', '') || 'normal'];
    const fin = (r) => { if (this.st[k] !== 'loading') return; this.st[k] = r; this.active--; this.pump(); for (const f of this.subs.slice()) f(); };
    im.onload = () => fin('done'); im.onerror = () => fin('error');
    im.src = 'assets/' + id + v + '.png';
  },
  pump() { while (this.bg && this.active < this.PAR && this.q.length) { const [id, v] = this.q.shift(); if (!this.st[id + v]) this.start(id, v); } },
  settled(id, v) { const s = this.st[id + v]; return s === 'done' || s === 'error'; },
  // 还没下完的图（[id, 变体]），ids 缺省 = 全部角色，vars 缺省 = 正常 / 白 / 红三种
  missing(ids, vars) { const out = []; for (const id of ids || Object.keys(this.img)) if (this.img[id]) for (const v of vars || this.VARS) if (!this.settled(id, v)) out.push([id, v]); return out; },
  // 立刻开始下这些图（不排队），全部结束（成功或失败）后 resolve
  need(list) {
    for (const [id, v] of list) this.start(id, v);
    return new Promise(res => { const chk = () => { if (list.every(([id, v]) => this.settled(id, v))) { this.subs.splice(this.subs.indexOf(chk) >>> 0, 1); res(); return true; } }; if (!chk()) this.subs.push(chk); });
  },
  core() { return (WF.CFG.ROSTER || []).filter(id => this.img[id]); },
  load(done, prog) {
    this.init();
    const core = this.core().map(id => [id, '']); let called = false;
    // 网络很慢或个别图片卡住时，最多等 20 秒就先进游戏，没到的图之后到了照常显示。
    const finish = () => { if (called) return; called = true; done(); setTimeout(() => this.background(), 1500); };   // 先让选中的词库下载 1.5 秒
    setTimeout(finish, 20000);
    const tick = () => { const n = core.filter(([id, v]) => this.settled(id, v)).length; if (prog) prog(n, core.length); return n === core.length; };
    this.subs.push(() => { if (!called && tick()) finish(); });
    for (const [id, v] of core) this.start(id, v);
    if (tick()) finish();
  },
  // 进菜单后：后台按顺序下其余的图（先可选角色的受击图，再闯关角色），每次最多 PAR 张
  background() {
    if (this.bg) return; this.bg = true;
    const core = this.core(), rest = Object.keys(this.img).filter(id => core.indexOf(id) < 0);
    for (const id of core) for (const v of this.VARS) this.q.push([id, v]);
    for (const id of rest) for (const v of this.VARS) this.q.push([id, v]);
    this.pump();
  },
  // 纯黑剪影（进场镜头用）：运行时由正常图集合成，不需要额外文件
  blackOf(id) {
    const set = WF.Sprites.img[id];
    if (set.black) return set.black;
    const im = set.normal; if (!im || !im.complete || !im.naturalWidth) return im;
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#07040e'; g.fillRect(0, 0, c.width, c.height);
    set.black = c; return c;
  },
  // X：脚底原点世界坐标（整数）；G：地面 y；dir 1 朝右 / -1 朝左（以脚底原点镜像）；fo：本帧脚底原点（缺省用角色的）
  draw(ctx, id, cell, X, G, dir, variant = 'normal', fo) {
    const d = window.WF_ASSETS[id], set = WF.Sprites.img[id]; if (!set) return;
    let im = variant === 'black' ? WF.Sprites.blackOf(id) : set[variant];
    if (!WF.Sprites.ok(im)) im = set.normal;          // 受击图还没下完：先用正常图
    if (!WF.Sprites.ok(im) && !(im instanceof HTMLCanvasElement)) return;   // 还没下完：这一帧不画
    const foot = fo || d.foot;
    const sx = (cell % d.cols) * d.cell, sy = Math.floor(cell / d.cols) * d.cell, top = G - foot[1];
    if (dir > 0) ctx.drawImage(im, sx, sy, d.cell, d.cell, X - foot[0], top, d.cell, d.cell);
    else { ctx.save(); ctx.translate(X + 1, 0); ctx.scale(-1, 1); ctx.drawImage(im, sx, sy, d.cell, d.cell, -foot[0], top, d.cell, d.cell); ctx.restore(); }
  },
};

// ---------------- 擂台背景（夜间擂台，程序化像素画） ----------------
WF.Stage = {
  layers: [],
  build() {
    const C = WF.CFG, H = C.VIEW_H, R = WF.rng(7);
    const mk = (w) => { const c = document.createElement('canvas'); c.width = w; c.height = H; return c; };
    const span = C.STAGE_W - C.VIEW_W;
    const L = (p) => ({ p, c: mk(Math.ceil(C.VIEW_W + span * p) + 2) });
    // 天空
    const sky = L(0.15), g = sky.c.getContext('2d');
    const bands = ['#0d0b1f', '#120f29', '#181434', '#1f1940', '#28204c', '#33275a', '#3f2f63'];
    for (let y = 0; y < H; y++) {
      const f = Math.min(bands.length - 1, y / 62 * (bands.length - 1)), i = Math.floor(f), fr = f - i;
      for (let x = 0; x < sky.c.width; x++) {
        const dither = ((x + y) % 2 === 0 ? 0.25 : 0.75);
        g.fillStyle = bands[fr > dither && i < bands.length - 1 ? i + 1 : i]; g.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = R() < 0.2 ? '#fff7d6' : '#8f86b8'; g.fillRect(Math.floor(R() * sky.c.width), Math.floor(R() * 40), 1, 1); }
    // 月亮
    const mx = 150, my = 16;
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      const r = x * x + y * y; if (r > 50) continue;
      g.fillStyle = r > 38 ? '#cfc6a0' : ((x + 2) * (x + 2) + (y + 1) * (y + 1) < 5 || (x - 3) * (x - 3) + (y - 3) * (y - 3) < 3 ? '#d8cfa8' : '#f4ecc4');
      g.fillRect(mx + x, my + y, 1, 1);
    }
    // 远山
    const mt = L(0.3), gm = mt.c.getContext('2d');
    for (let x = 0; x < mt.c.width; x++) {
      const h1 = 48 + Math.sin(x * 0.045) * 6 + Math.sin(x * 0.13 + 1) * 3 + Math.sin(x * 0.021 + 2) * 5;
      gm.fillStyle = '#2a2350'; gm.fillRect(x, Math.round(h1), 1, H);
      const h2 = 56 + Math.sin(x * 0.07 + 3) * 4 + Math.sin(x * 0.19) * 2;
      gm.fillStyle = '#211b40'; gm.fillRect(x, Math.round(h2), 1, H);
    }
    // 城楼屋檐 + 窗灯
    const town = L(0.55), gt = town.c.getContext('2d');
    let x = 0; this.lanterns = [];
    while (x < town.c.width) {
      const w = 22 + Math.floor(R() * 18), h = 10 + Math.floor(R() * 10), base = 66, top = base - h;
      gt.fillStyle = '#16122c'; gt.fillRect(x + 2, top, w - 4, h + 20);
      // 飞檐屋顶
      gt.fillStyle = '#100d22';
      for (let i = 0; i < 5; i++) gt.fillRect(x - 1 + i, top - 1 - i, w + 2 - i * 2, 1);
      gt.fillRect(x - 2, top, 2, 1); gt.fillRect(x + w, top, 2, 1); gt.fillRect(x - 3, top - 1, 1, 1); gt.fillRect(x + w + 2, top - 1, 1, 1);
      for (let wy = top + 3; wy < base - 2; wy += 5) for (let wx = x + 5; wx < x + w - 5; wx += 5)
        if (R() < 0.45) { gt.fillStyle = R() < 0.5 ? '#f2b84b' : '#c9853a'; gt.fillRect(wx, wy, 2, 2); }
      if (R() < 0.7) this.lanterns.push({ x: x + Math.floor(w / 2), y: top + 2, p: 0.55, ph: R() * 6 });
      x += w + 3 + Math.floor(R() * 6);
    }
    // 观众 + 栏杆
    const crowd = L(0.8), gc = crowd.c.getContext('2d');
    const shirts = ['#3b2d5c', '#4a2f45', '#2f3d5c', '#5a3a3a', '#35304f'];
    this.crowd = [];
    for (let cx = 0; cx < crowd.c.width; cx += 4) {
      const hy = 62 + Math.floor(R() * 3);
      gc.fillStyle = shirts[Math.floor(R() * shirts.length)]; gc.fillRect(cx, hy + 3, 4, 10);
      gc.fillStyle = '#1c1630'; gc.fillRect(cx + 1, hy, 3, 3);
      this.crowd.push({ x: cx, y: hy, ph: R() * 6 });
    }
    gc.fillStyle = '#5b3420'; gc.fillRect(0, 68, crowd.c.width, 2);
    gc.fillStyle = '#3a2115'; gc.fillRect(0, 70, crowd.c.width, 1);
    for (let px = 0; px < crowd.c.width; px += 12) { gc.fillStyle = '#4a2a1a'; gc.fillRect(px, 66, 2, 6); gc.fillStyle = '#7a4a2a'; gc.fillRect(px, 66, 2, 1); }
    // 擂台地板（木板）
    const fl = L(1), gf = fl.c.getContext('2d'), G = C.GROUND_Y;
    for (let y = 71; y < H; y++) {
      const depth = (y - 71) / (H - 71);
      const plank = Math.floor(Math.pow(depth, 0.7) * 9);
      gf.fillStyle = plank % 2 ? '#7a4a2e' : '#83512f'; gf.fillRect(0, y, fl.c.width, 1);
    }
    for (let y = 71; y < H; y++) {
      const depth = (y - 71) / (H - 71); const seam = Math.floor(Math.pow(depth, 0.7) * 9);
      const prev = Math.floor(Math.pow(Math.max(0, (y - 72) / (H - 71)), 0.7) * 9);
      if (seam !== prev) { gf.fillStyle = '#5a321e'; gf.fillRect(0, y, fl.c.width, 1); }
    }
    for (let vx = -400; vx < fl.c.width + 400; vx += 18) {
      for (let y = 72; y < H; y++) {
        const k = (y - 71) / (H - 71);
        const xx = Math.round(fl.c.width / 2 + (vx - fl.c.width / 2) * (0.55 + k * 0.9));
        if ((y + vx) % 7 === 0) continue;
        gf.fillStyle = '#62381f'; gf.fillRect(xx, y, 1, 1);
      }
    }
    gf.fillStyle = '#c99a5b'; gf.fillRect(0, 71, fl.c.width, 1);
    gf.fillStyle = '#a77845'; gf.fillRect(0, 72, fl.c.width, 1);
    // 擂台两端红柱
    for (const px of [6, fl.c.width - 10]) {
      gf.fillStyle = '#8c1f22'; gf.fillRect(px, 30, 4, 42); gf.fillStyle = '#c23a2c'; gf.fillRect(px, 30, 1, 42);
      gf.fillStyle = '#e8c36a'; gf.fillRect(px - 1, 29, 6, 2);
    }
    this.layers = [sky, mt, town, crowd, fl];
    this.proc = this.layers; this.mode = 'proc';
  },
  // v1.2：城市场景用 5 张 PNG（stage.json 里的视差），2P 对战仍用上面的程序化夜间擂台
  imgCache: {},
  loadCity(id, done) {
    const data = (window.WF_CAMPAIGN_DATA || {}).stages || {}, st = data[id];
    if (!st) { if (done) done(false); return; }
    if (this.imgCache[id]) { if (done) done(true); return; }
    const layers = st.layers.map(L => { const im = new Image(); im.src = 'assets/campaign/stages/' + id + '/' + L.file; return { p: L.parallax, c: im, id: L.id }; });
    // v1.7 擂台动态元素（火箭基地 rocket_steam / 警示灯）：挂在所在层上，跟着那层的视差
    for (const D of st.dynamic_elements || []) {
      const l = layers.find(x => x.id === D.layer); if (!l || !D.file) continue;
      const im = new Image(); im.src = 'assets/campaign/stages/' + id + '/' + D.file;
      (l.dyn = l.dyn || []).push({ d: D, c: im });
    }
    let left = layers.length;
    layers.forEach(l => { l.c.onload = l.c.onerror = () => { if (--left === 0) { this.imgCache[id] = layers; if (done) done(true); } }; });
  },
  useCity(id) {
    const L = this.imgCache[id];
    if (L) { this.layers = L; this.mode = 'city'; }
  },
  useProc() { if (this.proc) { this.layers = this.proc; this.mode = 'proc'; } },
  // v1.3 占位：还没有 5 层 PNG 的城市 → 程序擂台染一层城市色（source-atop 只染已有像素）
  // 以后把 PNG 和 stage.json 放进 incoming/stages/<city>/ 再跑 pack_campaign.py，campEnterCity 会自动改用 PNG
  tintCache: {},
  useTint(id, tint) {
    if (!this.proc) return;
    if (!tint) { this.useProc(); return; }
    let L = this.tintCache[id];
    if (!L) {
      L = this.tintCache[id] = this.proc.map((l, i) => {
        const c = document.createElement('canvas'); c.width = l.c.width; c.height = l.c.height;
        const g = c.getContext('2d'); g.drawImage(l.c, 0, 0);
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = tint.a * (i === 4 ? 0.5 : 1); g.fillStyle = tint.c; g.fillRect(0, 0, c.width, c.height);
        return { p: l.p, c };
      });
    }
    this.layers = L; this.mode = 'proc';
  },
  draw(ctx, cam, t, excite) {
    const C = WF.CFG, left = cam - C.VIEW_W / 2;
    for (const l of this.layers) {
      const ox = Math.round(left * l.p);
      ctx.drawImage(l.c, -ox, 0);
      if (this.mode !== 'proc') {
        if (l.dyn) for (const e of l.dyn) {
          const D = e.d, im = e.c; if (!im.complete || !im.naturalWidth) continue;
          const [cw, ch] = D.cell_size, n = D.frames || 1, fi = Math.floor(t / (D.ticks_per_frame || 3)) % n, o = D.origin || [0, 0];
          for (const [px, py] of D.positions_px || []) ctx.drawImage(im, fi * cw, 0, cw, ch, px - o[0] - ox, py - o[1], cw, ch);
        }
        if (this.onLayer) this.onLayer(ctx, l, ox, t);
        continue;
      }
      if (l === this.layers[2]) { // 灯笼（闪烁）
        for (const ln of this.lanterns) {
          const x = ln.x - ox; if (x < -4 || x > C.VIEW_W + 4) continue;
          const on = Math.sin(t * 0.08 + ln.ph) > -0.7;
          ctx.fillStyle = '#5a1515'; ctx.fillRect(x, ln.y - 1, 1, 1);
          ctx.fillStyle = on ? '#e8402c' : '#b32b22'; ctx.fillRect(x - 1, ln.y, 3, 3);
          ctx.fillStyle = on ? '#ffb15a' : '#d8703a'; ctx.fillRect(x, ln.y + 1, 1, 1);
        }
      }
      if (l === this.layers[3] && excite > 0) { // 观众随大招/重击跳动
        for (const c of this.crowd) {
          const x = c.x - ox; if (x < -4 || x > C.VIEW_W + 4) continue;
          const j = Math.max(0, Math.round(Math.sin(t * 0.6 + c.ph) * 1.5 * Math.min(1, excite / 20)));
          if (j > 0) { ctx.fillStyle = '#1c1630'; ctx.fillRect(x + 1, c.y - j, 3, 3); }
        }
      }
    }
  },
};

// ---------------- 打击特效（像素火花 / 尘土 / 冲击环） ----------------
WF.FX = {
  list: [],
  clear() { this.list.length = 0; },
  spark(x, y, dir, kind = 'hit', size = 1) {
    const R = Math.random, parts = [];
    const n = kind === 'block' ? 6 : Math.round(8 * size + (kind === 'crit' ? 6 : 0));
    for (let i = 0; i < n; i++) {
      const a = (kind === 'clash' ? R() * Math.PI * 2 : (dir > 0 ? 0 : Math.PI) + (R() - 0.5) * 2.2);
      const sp = (1.2 + R() * 2.4) * (kind === 'block' ? 0.8 : 1) * (0.8 + size * 0.3);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 8 + Math.floor(R() * 8) });
    }
    this.list.push({ type: 'spark', kind, x, y, dir, size, t: 0, life: kind === 'crit' || kind === 'ultFinal' ? 12 : 9, parts, rot: R() * 0.8 });
  },
  dust(x, y, dir, n = 3) {
    for (let i = 0; i < n; i++)
      this.list.push({ type: 'dust', x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: -dir * (0.2 + Math.random() * 0.6), vy: -0.15 - Math.random() * 0.25, t: 0, life: 14 + Math.floor(Math.random() * 8), r: 1 + Math.random() * 1.6 });
  },
  // v1.3 角色自带的序列帧特效（金霸霸 gold_shockwave 等）：fx = WF_ASSETS[id].fx[name]
  img(src) { const C = this._img || (this._img = {}); if (!C[src]) { C[src] = new Image(); C[src].src = src; } return C[src]; },
  sprite(fx, x, y, dir, ang) { this.img(fx.src); const e = { type: 'sprite', fx, x, y, dir, ang: ang || 0, t: 0, life: fx.n * fx.t }; this.list.push(e); return e; },
  drawSprites(ctx, ox, behind) {
    for (const e of this.list) {
      if (e.type !== 'sprite' || !!e.fx.behind !== behind || e.t >= e.life) continue;
      const fx = e.fx, im = this.img(fx.src); if (!im.complete || !im.naturalWidth) continue;
      const i = Math.min(fx.n - 1, Math.floor(e.t / fx.t)), X = Math.round(e.x - ox), Y = Math.round(e.y);
      if (e.ang) {   // v1.7 素材给了喷口角度（面右时的图像坐标角度），绕特效原点转；镜像时一起翻
        ctx.save(); ctx.translate(X, Y); if (e.dir < 0) ctx.scale(-1, 1); ctx.rotate(e.ang * Math.PI / 180);
        ctx.drawImage(im, i * fx.w, 0, fx.w, fx.h, -fx.o[0], -fx.o[1], fx.w, fx.h); ctx.restore();
      } else if (e.dir > 0) ctx.drawImage(im, i * fx.w, 0, fx.w, fx.h, X - fx.o[0], Y - fx.o[1], fx.w, fx.h);
      else { ctx.save(); ctx.translate(X, 0); ctx.scale(-1, 1); ctx.drawImage(im, i * fx.w, 0, fx.w, fx.h, -fx.o[0], Y - fx.o[1], fx.w, fx.h); ctx.restore(); }
    }
  },
  ring(x, y, color, maxR = 20, life = 12) { this.list.push({ type: 'ring', x, y, color, maxR, t: 0, life }); },
  update() {
    for (const e of this.list) {
      e.t++;
      if (e.parts) for (const p of e.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.92; p.life--; }
      if (e.type === 'dust') { e.x += e.vx; e.y += e.vy; e.r += 0.08; }
    }
    this.list = this.list.filter(e => e.t < e.life || (e.parts && e.parts.some(p => p.life > 0)));
  },
  draw(ctx, ox) {
    const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x - ox), Math.round(y), w, h); };
    this.drawSprites(ctx, ox, false);
    for (const e of this.list) {
      if (e.type === 'sprite') continue;
      if (e.type === 'dust') {
        const a = 1 - e.t / e.life; if (a <= 0) continue;
        ctx.globalAlpha = a * 0.8; const r = Math.round(e.r);
        px(e.x - r, e.y - r, '#c8a77a', r * 2, r * 2); px(e.x - r + 1, e.y - r, '#e2c9a0', Math.max(1, r * 2 - 2), 1);
        ctx.globalAlpha = 1; continue;
      }
      if (e.type === 'ring') {
        const k = e.t / e.life; if (k >= 1) continue; const r = 3 + (e.maxR - 3) * (1 - Math.pow(1 - k, 2));
        ctx.globalAlpha = 1 - k; const steps = Math.max(12, Math.round(r * 5));
        for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; px(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.7, e.color); }
        ctx.globalAlpha = 1; continue;
      }
      // spark
      const pal = {
        hit: ['#ffffff', '#fff3a0', '#ffb43c', '#fb4647'],
        crit: ['#ffffff', '#ffe066', '#ff6a3c', '#fb4647'],
        ultFinal: ['#ffffff', '#fff7c0', '#ffd23c', '#fb4647'],
        block: ['#ffffff', '#cfefff', '#6fc4ff', '#3a6fd8'],
        clash: ['#ffffff', '#fff7c0', '#ffd23c', '#7fd8ff'],
        miss: ['#ffffff', '#dddddd', '#aaaaaa', '#777777'],
      }[e.kind] || ['#fff', '#ff0', '#f80', '#f00'];
      for (const p of e.parts) if (p.life > 0) px(p.x, p.y, p.life > 6 ? pal[1] : pal[2], p.life > 10 ? 2 : 1, 1);
      if (e.t >= e.life) continue;
      const k = e.t / e.life, S = e.size * (e.kind === 'crit' ? 1.5 : e.kind === 'ultFinal' ? 2.1 : e.kind === 'clash' ? 1.7 : e.kind === 'block' ? 0.8 : 1);
      const rays = e.kind === 'clash' || e.kind === 'ultFinal' ? 10 : 8;
      const len = (3 + 9 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2)) * S, inner = k * len * 0.8;
      for (let r = 0; r < rays; r++) {
        const a = e.rot + r / rays * Math.PI * 2, L = len * (r % 2 ? 0.6 : 1);
        for (let d = inner; d < L; d += 1) {
          const col = d < L * 0.35 ? pal[0] : d < L * 0.7 ? pal[1] : pal[3];
          px(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.85, col);
        }
      }
      if (k < 0.4) { const c = Math.round(2 + 3 * S * (1 - k)); px(e.x - c / 2, e.y - c / 2, pal[0], c, c); }
    }
  },
};
