// v26（hd 版）：苏绫 15 倍全套 31 动作 236 帧接到现有绘制管线。
// 图集里没有 15 倍稿的动作（ground_combo、空中技、ki_blast、投技等）仍走原 50 像素图集。
// 不改脚点、逻辑格、跑速、帧 tick、战斗数值、邮票或朝左 1px 偏移。
// 查询参数：
//   默认开启 15 倍帧。
//   ?hdchar=0  退回原版 50 像素苏绫帧（对照用）
//   ?hdarena=0 / ?hdmap=… 见 v27_hd_maps.js
//   ?hdlab=1   姿势台：1 空闲 / 2 跑动 / 3 combo_a；[] 单帧步进；F1–F8 钉跑动帧
//              G 地面线；H 切换原版/15 倍（不改地址）
(function () {
  const WF = window.WF || (window.WF = {});
  let q = '';
  try { q = location.search || ''; } catch (e) {}
  const flag = (name, defOn) => {
    if (new RegExp('[?&]' + name + '=0(&|$)').test(q)) return false;
    if (new RegExp('[?&]' + name + '=1(&|$)').test(q)) return true;
    return defOn;
  };
  WF.hdChar = flag('hdchar', true);
  WF.hdArena = flag('hdarena', true);
  WF.hdLab = flag('hdlab', false);

  const SRC = 750, DST = 50;
  // 苏绫 15 倍全套：31 个动作 236 帧（idle / run / combo_a 沿用已验收的定稿，其余 28 个动作为 2026-11-27 script+Astra 全套）
  const HD_ANIMS = ['idle', 'run', 'combo_a', 'combo_b', 'combo_c', 'heavy_punch', 'uppercut', 'hyper_combo', 'dash_punch',
    'mega_charge_a', 'mega_charge_b', 'light_kick', 'heavy_kick', 'block', 'block_hit', 'block_recover', 'hit_swap', 'stunned',
    'knocked_down', 'back_launch_knockdown', 'knocked_down_get_up', 'knocked_down_death', 'burned', 'walk', 'dodge_roll',
    'celebrate', 'intro', 'clash_impact', 'clash_lock', 'clash_win', 'clash_lose'];
  const CORE = { idle: 1, run: 1, walk: 1, combo_a: 1, intro: 1 };
  const CELLS = {};
  const ANIM_OF = {};
  (function buildCells() {
    const A = window.WF_ASSETS && window.WF_ASSETS.suling && window.WF_ASSETS.suling.anims;
    if (!A) return;
    HD_ANIMS.forEach(name => {
      const an = A[name]; if (!an) return;
      an.frames.forEach((f, i) => { CELLS[f.c] = name + '/' + String(i).padStart(3, '0'); ANIM_OF[f.c] = name; });
    });
  })();
  const TINT = { white: '#f4f0ff', red: '#ff3a48', black: '#07040e' };

  const frames = Object.create(null);
  const animLeft = Object.create(null);   // 每个动作还差几帧没载入；整组载完才换 15 倍，不在一个动作里混用新旧帧
  let pending = 0, allDone = false;
  const waiters = [];
  function settle() {
    if (pending !== 0) return;
    allDone = true;
    waiters.splice(0).forEach(fn => fn());
  }
  function loadOne(key, path, core) {
    if (core) pending++;
    const name = ANIM_OF[key];
    animLeft[name] = (animLeft[name] || 0) + 1;
    const im = new Image();
    const rec = frames[key] = { normal: im, white: null, red: null, black: null, anim: name };
    const fin = () => { animLeft[name]--; if (core) { pending--; settle(); } };
    im.onload = fin;
    im.onerror = () => { rec.failed = true; fin(); };
    if (!core) im.fetchPriority = 'low';   // 后台动作帧不抢地图和开局带宽
    im.src = 'assets/suling_hd/frames/' + path + '.webp';
  }
  // 先载跑街与开场要用的核心动作（挡住开局），其余动作后台载入，载完前该动作仍用原 50 像素图
  Object.keys(CELLS).filter(c => CORE[ANIM_OF[c]]).forEach(c => loadOne(+c, CELLS[c], true));
  setTimeout(() => Object.keys(CELLS).filter(c => !CORE[ANIM_OF[c]]).forEach(c => loadOne(+c, CELLS[c], false)), 0);
  if (pending === 0) allDone = true;

  function ok(im) { return !!(im && (im instanceof HTMLCanvasElement || (im.complete && im.naturalWidth))); }

  function tintOf(rec, variant) {
    if (variant === 'normal' || !variant) return rec.normal;
    if (rec[variant]) return rec[variant];
    if (!ok(rec.normal)) return rec.normal;
    const src = rec.normal;
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || SRC;
    c.height = src.naturalHeight || SRC;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = TINT[variant] || TINT.white;
    g.fillRect(0, 0, c.width, c.height);
    rec[variant] = c;
    return c;
  }

  function isDefaultSulingSheet(set) {
    const im = set && set.normal;
    if (!im) return false;
    const src = im.src || '';
    if (/\/skins\//.test(src)) return false;
    return /suling(?:\.png|$)/.test(src) || !src;
  }

  function canUseHd(id, cell, set) {
    const r = frames[cell];
    return !!(WF.hdChar && id === 'suling' && r && !r.failed && !animLeft[r.anim] && isDefaultSulingSheet(set));
  }

  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  // ---- 钩 Sprites.draw：750 源画进 50 逻辑格，经 WORLD_SCALE=15 后在 1620 画布上 1:1 ----
  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._hdHooked) return;
    const baseDraw = S.draw.bind(S);
    const baseLoad = S.load.bind(S);
    S.draw = function (ctx, id, cell, X, G, dir, variant, fo) {
      const set = S.img && S.img[id];
      if (!canUseHd(id, cell, set)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const rec = frames[cell];
      const d = window.WF_ASSETS && window.WF_ASSETS[id];
      let im = tintOf(rec, variant || 'normal');
      if (!ok(im)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const foot = fo || (d && d.foot) || [24, 40];
      const top = G - foot[1];
      // 桌面 15 倍 1:1 不插值；触屏 960×540（×5）是 3 倍缩小，开插值避免锯齿闪烁
      const prevSm = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = (WF.CFG.WORLD_SCALE || WF.CFG.SCALE) < 15;
      if (dir > 0) ctx.drawImage(im, 0, 0, SRC, SRC, X - foot[0], top, DST, DST);
      else {
        ctx.save();
        ctx.translate(X + 1, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, SRC, SRC, -foot[0], top, DST, DST);
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = prevSm;
    };
    S.load = function (done, prog) {
      baseLoad(() => { ready.then(done); }, prog);
    };
    S._hdHooked = true;
  }

  // （擂台 / 跑街的高清地图在 v27_hd_maps.js）

  function hookTitle() {
    const G = WF.Game && WF.Game.prototype;
    if (!G || G._hdLabHooked) return;
    const baseTitle = G.drawTitle;
    G.drawTitle = function () {
      if (this.ui && this.ui.screen === 'hdlab') return drawLabHud(this);
      return baseTitle.apply(this, arguments);
    };
    const baseFront = G.drawWorldFront;
    G.drawWorldFront = function (w, li) {
      if (baseFront) baseFront.call(this, w, li);
      if (this.ui && this.ui.screen === 'hdlab' && this._hdGround) {
        const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
        w.save();
        w.setTransform(1, 0, 0, 1, 0, 0);
        w.strokeStyle = 'rgba(255,80,80,0.85)';
        w.lineWidth = 1;
        w.beginPath();
        w.moveTo(0, C.GROUND_Y * WS + 0.5);
        w.lineTo(w.canvas.width, C.GROUND_Y * WS + 0.5);
        w.stroke();
        w.restore();
      }
    };
    G._hdLabHooked = true;
  }

  function drawLabHud(g) {
    const C = WF.CFG, c = g.ctx, f = g.p[0];
    const mode = WF.hdChar ? '15倍定稿帧' : '原版 50 帧';
    const anim = f ? (f.anim + '  #' + String(f.fi).padStart(3, '0') + (f.paused ? ' 暂停' : '')) : '';
    c.save();
    WF.uiTransform(c);
    c.fillStyle = 'rgba(5,3,12,0.62)';
    c.fillRect(0, 0, C.SCREEN_W, 42);
    c.fillRect(0, C.SCREEN_H - 46, C.SCREEN_W, 46);
    c.font = '700 14px ' + C.FONT;
    c.fillStyle = '#ffd23c';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('苏绫 15 倍手感台  ·  ' + mode + '  ·  ' + anim, 16, 22);
    c.font = '700 12px ' + C.FONT;
    c.fillStyle = '#e8e6f0';
    c.fillText('1 空闲   2 跑动   3 combo_a   [ ] 步进   F1–F8 钉跑帧   G 地面线   H 原版/15倍   对手已隐藏', 16, C.SCREEN_H - 23);
    c.restore();
  }

  function enterLab() {
    const g = WF.game;
    if (!g || g.ui.screen === 'hdlab') return;
    g.state = 'title';
    g.ui.screen = 'hdlab';
    g.paused = false;
    g.queue.length = 0;
    g.camp = null;
    if (g.p[1]) g.p[1].alpha = 0;
    const mid = WF.CFG.STAGE_W / 2;
    g.p[0].alpha = 1;
    g.p[0].x = mid;
    g.p[0].y = 0;
    g.p[0].ox = 0;
    g.p[0].dir = 1;
    g.cam = mid;
    const want = (new URLSearchParams(q).get('pose') || 'idle').toLowerCase();
    applyPose(want);
    g.render();
  }

  function applyPose(spec) {
    const g = WF.game, f = g && g.p[0];
    if (!f) return;
    let name = 'idle', idx = null, runSpeed = (WF.CFG.CAMPAIGN && WF.CFG.CAMPAIGN.RUN && WF.CFG.CAMPAIGN.RUN.ANIM) || 1.2;
    const m = String(spec).match(/^(idle|run|combo_a)(?:[_/:-]?(\d+))?$/i);
    if (m) { name = m[1].toLowerCase(); if (m[2] != null) idx = +m[2]; }
    else if (/^r(\d+)$/i.test(spec)) { name = 'run'; idx = +RegExp.$1; }
    const speed = name === 'run' ? runSpeed : 1;
    f.paused = false;
    f.play(name, { loop: true, speed: speed, hold: true });
    if (idx != null && f.a && idx >= 0 && idx < f.a.frames.length) {
      f.fi = idx;
      f.ft = 0;
      f.paused = true;
    }
  }

  function onLabKey(e) {
    if (!WF.hdLab || !WF.game || WF.game.ui.screen !== 'hdlab') return;
    const k = e.code, f = WF.game.p[0];
    let used = true;
    if (k === 'Digit1' || k === 'Numpad1') applyPose('idle');
    else if (k === 'Digit2' || k === 'Numpad2') applyPose('run');
    else if (k === 'Digit3' || k === 'Numpad3') applyPose('combo_a');
    else if (k === 'BracketLeft') { stepLab(-1); }
    else if (k === 'BracketRight') { stepLab(1); }
    else if (/^F([1-8])$/.test(k)) applyPose('run' + (RegExp.$1 - 1));
    else if (k === 'KeyG') { WF.game._hdGround = !WF.game._hdGround; }
    else if (k === 'KeyH') { WF.hdChar = !WF.hdChar; }
    else used = false;
    if (!used) return;
    e.preventDefault();
    e.stopPropagation();
    if (f && f.paused) { /* keep freeze */ }
    WF.game.render();
  }

  function stepLab(dir) {
    const f = WF.game.p[0];
    if (!f || !f.a) return;
    const n = f.a.frames.length;
    f.fi = (f.fi + dir + n) % n;
    f.ft = 0;
    f.paused = true;
  }

  WF.SulingHD = {
    cells: CELLS,
    frames: frames,
    ready: ready,
    enterLab: enterLab,
    applyPose: applyPose,
    setHd: function (on) { WF.hdChar = !!on; if (WF.game) WF.game.render(); },
    canvasPNG: function () { return WF.game && WF.game.cv.toDataURL('image/png'); },
    worldPNG: function () { return WF.game && WF.game.world.toDataURL('image/png'); },
    info: function () {
      const g = WF.game, f = g && g.p[0], C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const fr = f && f.frame();
      return {
        hdChar: !!WF.hdChar,
        hdArena: !!WF.hdArena,
        worldScale: WS,
        groundY: C.GROUND_Y,
        groundPx: C.GROUND_Y * WS,
        runSpeed: C.CAMPAIGN && C.CAMPAIGN.RUN && C.CAMPAIGN.RUN.SPEED,
        runAnim: C.CAMPAIGN && C.CAMPAIGN.RUN && C.CAMPAIGN.RUN.ANIM,
        anim: f && f.anim,
        fi: f && f.fi,
        cell: fr && fr.c,
        tick: fr && fr.t,
        speed: f && f.o && (f.o.speed || 1),
        foot: (fr && fr.fo) || (window.WF_ASSETS.suling && window.WF_ASSETS.suling.foot),
        x: f && f.x,
        cam: g && g.cam,
        dir: f && f.dir,
        canvas: g && [g.cv.width, g.cv.height],
        world: g && [g.world.width, g.world.height],
      };
    },
  };

  hookSprites();
  hookTitle();
  window.addEventListener('keydown', onLabKey, true);
  window.addEventListener('load', function () {
    const iv = setInterval(function () {
      if (!(WF.ready && WF.game && allDone)) return;
      clearInterval(iv);
      if (WF.hdLab) enterLab();
    }, 50);
  });
})();
