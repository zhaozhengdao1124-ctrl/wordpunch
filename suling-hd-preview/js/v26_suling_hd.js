// v26 本地手感验收：把已定稿的苏绫 15 倍 17 帧接到现有绘制管线。
// 只覆盖 idle / run / combo_a；其余动作仍走原 50 像素图集。
// 不改脚点、逻辑格、跑速、帧 tick、战斗数值、邮票或朝左 1px 偏移。
// 查询参数：
//   默认开启 15 倍帧与官方巴黎 A 擒台（战斗/标题，不含跑街）。
//   ?hdchar=0  退回原版 50 像素苏绫帧（对照用）
//   ?hdarena=0 退回原程序化/城市擂台
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
  const CELLS = {
    0: 'idle/000', 1: 'idle/001', 2: 'idle/002', 3: 'idle/003',
    4: 'combo_a/000', 5: 'combo_a/001', 6: 'combo_a/002', 7: 'combo_a/003', 8: 'combo_a/004',
    260: 'run/000', 261: 'run/001', 262: 'run/002', 263: 'run/003',
    264: 'run/004', 265: 'run/005', 266: 'run/006', 267: 'run/007',
  };
  const TINT = { white: '#f4f0ff', red: '#ff3a48', black: '#07040e' };

  const frames = Object.create(null);
  let pending = 0, allDone = false;
  const waiters = [];
  function settle() {
    if (pending !== 0) return;
    allDone = true;
    waiters.splice(0).forEach(fn => fn());
  }
  function loadOne(key, path) {
    pending++;
    const im = new Image();
    const rec = frames[key] = { normal: im, white: null, red: null, black: null };
    const fin = () => { pending--; settle(); };
    im.onload = fin;
    im.onerror = () => { rec.failed = true; fin(); };
    im.src = 'assets/suling_hd/frames/' + path + '.png';
  }
  Object.keys(CELLS).forEach(c => loadOne(+c, CELLS[c]));

  const arena = { bg: new Image(), deck: new Image(), ready: false };
  (function loadArena() {
    let left = 2;
    const done = () => { if (--left <= 0) arena.ready = !!(arena.bg.naturalWidth && arena.deck.naturalWidth); };
    arena.bg.onload = arena.bg.onerror = done;
    arena.deck.onload = arena.deck.onerror = done;
    arena.bg.src = 'assets/hd_maps/paris_A_arena-backdrop.png';
    arena.deck.src = 'assets/hd_maps/paris_A_arena-deck.png';
  })();

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
    return !!(WF.hdChar && id === 'suling' && frames[cell] && !frames[cell].failed && isDefaultSulingSheet(set));
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
      ctx.imageSmoothingEnabled = false;
      if (dir > 0) ctx.drawImage(im, 0, 0, SRC, SRC, X - foot[0], top, DST, DST);
      else {
        ctx.save();
        ctx.translate(X + 1, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, SRC, SRC, -foot[0], top, DST, DST);
        ctx.restore();
      }
    };
    S.load = function (done, prog) {
      baseLoad(() => { ready.then(done); }, prog);
    };
    S._hdHooked = true;
  }

  // ---- 官方巴黎 A 擒台：设备像素绘制，按 WORLD_SCALE/15 均匀缩放，不拉伸 ----
  function hookStage() {
    const St = WF.Stage;
    if (!St || St._hdHooked) return;
    const baseDraw = St.draw.bind(St);
    St.draw = function (ctx, cam, t, excite) {
      if (!WF.hdArena || !arena.ready) return baseDraw(ctx, cam, t, excite);
      const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const k = WS / 15;
      const left = cam - C.VIEW_W / 2;
      const x = Math.round(-left * WS);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const bg = arena.bg, deck = arena.deck;
      ctx.drawImage(bg, 0, 0, bg.naturalWidth, bg.naturalHeight, x, 0, bg.naturalWidth * k, bg.naturalHeight * k);
      ctx.drawImage(deck, 0, 0, deck.naturalWidth, deck.naturalHeight, x, 1065 * k, deck.naturalWidth * k, deck.naturalHeight * k);
      ctx.restore();
    };
    St._hdHooked = true;
  }

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
    arena: arena,
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
  hookStage();
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
