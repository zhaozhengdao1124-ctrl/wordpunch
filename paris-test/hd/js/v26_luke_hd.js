// v26（仅本地测试街 /workspace/wordpunch-luke-hd）：卢克（槽位 pa_newsboy）15 倍 80 帧接到现有绘制管线。
// 不改脚点、逻辑格、跑速、帧 tick、战斗数值、邮票或朝左 1px 偏移。
// 脚点用角色/帧自带的 foot（默认 [24, 40]），按各帧 750 垫底原样绘制；不要把脚点硬改成 360,600。
// 查询参数：
//   默认开启 15 倍卢克帧。
//   ?hdchar=0   同时退回原版 50 像素苏绫 / Mr.J / 卢克帧（对照用）
//   ?hdluke=0   只退回原版 50 像素 pa_newsboy 图集，苏绫 / Mr.J 高清帧不受影响
//   ?paris=1    跳过地图，直接进入巴黎长街（第一只小怪是卢克）
//   ?lukelab=1  姿势台：在巴黎街上钉卢克单帧（1 待机 / 2 走 / 3 连击 / 4 重击 / 5 出场；[ ] 步进；G 地面线）
(function () {
  const WF = window.WF || (window.WF = {});
  let q = '';
  try { q = location.search || ''; } catch (e) {}
  const flag = (name, defOn) => {
    if (new RegExp('[?&]' + name + '=0(&|$)').test(q)) return false;
    if (new RegExp('[?&]' + name + '=1(&|$)').test(q)) return true;
    return defOn;
  };
  if (typeof WF.hdChar === 'undefined') WF.hdChar = flag('hdchar', true);
  WF.hdLuke = flag('hdluke', WF.hdChar);
  WF.lukeLab = flag('lukelab', false);
  WF.lukeParis = flag('paris', false) || WF.lukeLab;

  const SRC = 750, DST = 50;
  const HD_ANIMS = ['idle', 'walk', 'combo_a', 'heavy_punch', 'block', 'hit_swap',
    'knocked_down', 'knocked_down_death', 'intro', 'celebrate'];
  const CORE = { idle: 1, walk: 1, combo_a: 1 };
  const CELLS = {};
  const ANIM_OF = {};
  (function buildCells() {
    const A = window.WF_ASSETS && window.WF_ASSETS.pa_newsboy && window.WF_ASSETS.pa_newsboy.anims;
    if (!A) return;
    HD_ANIMS.forEach(name => {
      const an = A[name]; if (!an) return;
      an.frames.forEach((f, i) => { CELLS[f.c] = name + '/' + String(i).padStart(3, '0'); ANIM_OF[f.c] = name; });
    });
  })();
  const TINT = { white: '#f4f0ff', red: '#ff3a48', black: '#07040e' };

  const frames = Object.create(null);
  const animLeft = Object.create(null);
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
    if (!core) im.fetchPriority = 'low';
    im.src = 'assets/pa_newsboy_hd/frames/' + path + '.webp';
  }
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

  function isDefaultLukeSheet(set) {
    const im = set && set.normal;
    if (!im) return false;
    const src = im.src || '';
    if (/\/skins\//.test(src)) return false;
    return /pa_newsboy/.test(src) || !src;
  }

  function canUseHd(id, cell, set) {
    const r = frames[cell];
    return !!(WF.hdLuke && WF.hdChar && id === 'pa_newsboy' && r && !r.failed && !animLeft[r.anim] && isDefaultLukeSheet(set));
  }

  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._lukeHdHooked) return;
    const baseDraw = S.draw.bind(S);
    const baseLoad = S.load.bind(S);
    S.draw = function (ctx, id, cell, X, G, dir, variant, fo) {
      const set = S.img && S.img[id];
      if (!canUseHd(id, cell, set)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const rec = frames[cell];
      const d = window.WF_ASSETS && window.WF_ASSETS[id];
      let im = tintOf(rec, variant || 'normal');
      if (!ok(im)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      // 用帧自带 fo 或角色默认 foot，不把 15 倍脚点硬写成 360,600。
      const foot = fo || (d && d.foot) || [24, 40];
      const top = G - foot[1];
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
    S._lukeHdHooked = true;
  }

  function ensureProfile(g) {
    if (g.menu.p1 && WF.Profiles.get(g.menu.p1)) return g.menu.p1;
    const list = WF.Profiles.list && WF.Profiles.list();
    if (list && list.length) { g.menu.p1 = list[0].id; return g.menu.p1; }
    const av = (WF.Profiles.AVATARS && WF.Profiles.AVATARS[0] && WF.Profiles.AVATARS[0].id) || 'suling';
    const r = WF.Profiles.create('测试', av);
    const id = r && r.profile ? r.profile.id : (r && r.id);
    if (id) g.menu.p1 = id;
    return g.menu.p1;
  }

  function bootParis(g) {
    if (!g || g.camp && g.camp.cityId === 'paris' && g.street) return true;
    if (!ensureProfile(g)) return false;
    if (!g.menu.char) g.menu.char = 'suling';
    g.startCampaign({ city: 'paris' });
    if (g.state === 'map' && g.campEnterCity) g.campEnterCity();
    return !!(g.camp && g.camp.cityId === 'paris');
  }

  let lab = { anim: 'idle', fi: 0, ground: false, ready: false };

  function applyPose(spec) {
    const g = WF.game; if (!g || !g.p || !g.p[1]) return false;
    let anim, fi;
    if (typeof spec === 'string') {
      const m = spec.match(/^([a-z_]+)\/?(\d+)?$/i);
      if (!m) return false;
      anim = m[1];
      fi = m[2] != null ? parseInt(m[2], 10) : 0;
    } else {
      anim = spec.anim; fi = spec.fi || 0;
    }
    const E = g.p[1];
    if (E.id !== 'pa_newsboy') return false;
    const a = E.data && E.data.anims && E.data.anims[anim];
    if (!a) return false;
    fi = Math.max(0, Math.min(a.frames.length - 1, fi));
    if (g.campStreetStop) g.campStreetStop();
    E.dir = -1;
    E.alpha = 1;
    E.tween = null; E.fly = null; E._down = false;
    if (E.clearHome && g.streetSlot) E.lockHome(g.streetSlot(1));
    E.play(anim, { from: fi, to: fi, hold: true, loop: false });
    if (g.p[0] && g.p[0].anim !== 'idle') g.p[0].play('idle');
    lab.anim = anim; lab.fi = fi;
    if (g.render) g.render();
    return true;
  }

  function drawGroundLine(g) {
    if (!lab.ground || !g || !g.world) return;
    const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE, w = g.world;
    const y = (C.GROUND_Y || 76) * WS;
    const ctx = w.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(255,40,40,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w.width, y + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function hookLabInput() {
    window.addEventListener('keydown', ev => {
      if (!WF.lukeLab || !WF.game) return;
      const g = WF.game;
      const map = { Digit1: 'idle', Digit2: 'walk', Digit3: 'combo_a', Digit4: 'heavy_punch', Digit5: 'intro',
        Digit6: 'block', Digit7: 'hit_swap', Digit8: 'knocked_down', Digit9: 'knocked_down_death', Digit0: 'celebrate' };
      if (map[ev.code]) { applyPose({ anim: map[ev.code], fi: 0 }); ev.preventDefault(); return; }
      if (ev.code === 'KeyG') { lab.ground = !lab.ground; if (g.render) g.render(); ev.preventDefault(); return; }
      if (ev.code === 'BracketLeft' || ev.code === 'BracketRight') {
        const A = g.p[1] && g.p[1].data && g.p[1].data.anims[lab.anim];
        if (!A) return;
        const n = A.frames.length;
        lab.fi = ev.code === 'BracketRight' ? (lab.fi + 1) % n : (lab.fi + n - 1) % n;
        applyPose({ anim: lab.anim, fi: lab.fi });
        ev.preventDefault();
      }
    });
  }

  function hookRenderGround() {
    const G = WF.Game && WF.Game.prototype;
    if (!G || G._lukeGroundHooked) return;
    const base = G.render;
    if (!base) return;
    G.render = function () {
      const r = base.apply(this, arguments);
      if (WF.lukeLab && lab.ground) drawGroundLine(this);
      return r;
    };
    G._lukeGroundHooked = true;
  }

  function startWhenReady() {
    const t0 = Date.now();
    const tick = () => {
      const g = WF.game;
      if (!(WF.ready && g && g.ui)) {
        if (Date.now() - t0 < 45000) requestAnimationFrame(tick);
        return;
      }
      ready.then(() => {
        if (WF.lukeParis) bootParis(g);
        if (WF.lukeLab) {
          const wait = () => {
            if (g.p && g.p[1] && g.p[1].id === 'pa_newsboy' && g.street) {
              applyPose({ anim: 'idle', fi: 0 });
              lab.ready = true;
              hookLabInput();
              hookRenderGround();
              return;
            }
            if (Date.now() - t0 < 45000) setTimeout(wait, 50);
          };
          wait();
        }
      });
    };
    tick();
  }

  WF.LukeHD = {
    cells: CELLS,
    frames: frames,
    ready: ready,
    lab: lab,
    setHd: function (on) { WF.hdLuke = !!on; if (WF.game) WF.game.render(); },
    applyPose: applyPose,
    bootParis: function () { return bootParis(WF.game); },
    canvasPNG: function () { return WF.game && WF.game.cv.toDataURL('image/png'); },
    worldPNG: function () { return WF.game && WF.game.world.toDataURL('image/png'); },
    info: function () {
      const g = WF.game, f = g && g.p && g.p[1], C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const fr = f && f.frame();
      const loaded = Object.keys(frames).filter(k => ok(frames[k].normal) && !frames[k].failed).length;
      const failed = Object.keys(frames).filter(k => frames[k].failed).length;
      const foot = (fr && fr.fo) || (window.WF_ASSETS.pa_newsboy && window.WF_ASSETS.pa_newsboy.foot);
      return {
        hdChar: !!WF.hdChar,
        hdLuke: !!WF.hdLuke,
        worldScale: WS,
        groundY: C.GROUND_Y,
        groundPx: C.GROUND_Y * WS,
        anim: f && f.anim,
        fi: f && f.fi,
        cell: fr && fr.c,
        char: f && f.id,
        tick: fr && fr.t,
        foot: foot,
        x: f && f.x,
        cam: g && g.cam,
        dir: f && f.dir,
        city: g && g.camp && g.camp.cityId,
        wave: g && g.camp && g.camp.wave,
        state: g && g.state,
        streetPhase: g && g.street && g.street.phase,
        canvas: g && [g.cv.width, g.cv.height],
        world: g && [g.world.width, g.world.height],
        loaded: loaded,
        failed: failed,
        cellCount: Object.keys(CELLS).length,
        lab: { anim: lab.anim, fi: lab.fi, ground: lab.ground, ready: lab.ready },
      };
    },
  };


  // 格挡/命中火花：HD 卢克身子比 50 像素原图更满，默认 hitPoint 会落在脸和胸口。
  // 只改本测试街的特效落点，把火花和冲击环推到不透明轮廓外，格挡粒子向外喷，不改站位和数值。
  const SPARK_MARGIN = 10;
  const SPARK_ALPHA = 32;

  function visFrame(f) {
    const v = f.vis;
    if (v && v.anim) return v.a.frames[v.fi];
    return f.frame();
  }
  function drawX(f) {
    let X = Math.round(f.worldX());
    if (f.jitter > 0 && WF.game) X += (WF.game.t % 2 ? 1 : -1);
    if (f.vis && f.vis.dx) X += Math.round(f.vis.dx);
    return X;
  }
  function maskOf(cell) {
    const rec = frames[cell];
    if (!rec || rec.failed || !ok(rec.normal)) return null;
    if (rec.sparkMask) return rec.sparkMask;
    const c = document.createElement('canvas');
    c.width = DST; c.height = DST;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(rec.normal, 0, 0, SRC, SRC, 0, 0, DST, DST);
    const data = g.getImageData(0, 0, DST, DST).data;
    const rows = new Array(DST);
    for (let y = 0; y < DST; y++) {
      let l = null, r = null;
      for (let x = 0; x < DST; x++) {
        if (data[(y * DST + x) * 4 + 3] >= SPARK_ALPHA) {
          if (l == null) l = x;
          r = x;
        }
      }
      rows[y] = { l: l, r: r };
    }
    rec.sparkMask = rows;
    return rows;
  }
  function rowAt(mask, ly) {
    const y0 = Math.max(0, Math.min(DST - 1, Math.round(ly)));
    if (mask[y0] && mask[y0].l != null) return mask[y0];
    for (let d = 1; d <= 3; d++) {
      for (const y of [y0 - d, y0 + d]) {
        if (y >= 0 && y < DST && mask[y] && mask[y].l != null) return mask[y];
      }
    }
    return null;
  }
  function localToWorldX(f, localX, X, foot) {
    return f.dir > 0 ? X - foot[0] + localX : X + 1 + foot[0] - localX;
  }
  function pushOffLuke(f, x, y, dir) {
    if (WF._skipSparkPush) return { x: x, y: y, dir: dir };
    if (!f || f.id !== 'pa_newsboy' || !WF.hdLuke || !WF.hdChar) return { x: x, y: y, dir: dir };
    const fr = visFrame(f);
    if (!fr) return { x: x, y: y, dir: dir };
    const mask = maskOf(fr.c);
    if (!mask) return { x: x, y: y, dir: dir };
    const foot = fr.fo || (f.data && f.data.foot) || [24, 40];
    const X = drawX(f);
    const yOff = Math.round(f.y || 0);
    const localY = y - ((WF.CFG.GROUND_Y || 76) - yOff - foot[1]);
    const row = rowAt(mask, localY);
    if (!row) return { x: x, y: y, dir: dir };
    const wL = localToWorldX(f, row.l, X, foot);
    const wR = localToWorldX(f, row.r, X, foot);
    const worldLeft = Math.min(wL, wR);
    const worldRight = Math.max(wL, wR);
    if (x < worldLeft - SPARK_MARGIN || x > worldRight + SPARK_MARGIN) {
      return { x: x, y: y, dir: dir };
    }
    let side;
    if (dir > 0) side = 'left';
    else if (dir < 0) side = 'right';
    else side = x <= (worldLeft + worldRight) / 2 ? 'left' : 'right';
    const edge = side === 'left' ? worldLeft : worldRight;
    const target = side === 'left' ? edge - SPARK_MARGIN : edge + SPARK_MARGIN;
    const nx = side === 'left' ? Math.min(x, target) : Math.max(x, target);
    return { x: nx, y: y, dir: dir, outDir: side === 'left' ? -1 : 1 };
  }
  function hookFxSpark() {
    const fx = WF.FX;
    if (!fx || fx._lukeSparkHooked) return;
    const spark0 = fx.spark.bind(fx);
    const ring0 = fx.ring.bind(fx);
    fx.spark = function (x, y, dir, kind, size) {
      const g = WF.game, luke = g && g.p && g.p.find(p => p && p.id === 'pa_newsboy');
      const a = luke ? pushOffLuke(luke, x, y, dir) : { x: x, y: y, dir: dir };
      const d = (kind === 'block' && a.outDir != null) ? a.outDir : a.dir;
      return spark0(a.x, a.y, d, kind, size);
    };
    fx.ring = function (x, y, color, maxR, life) {
      const g = WF.game, luke = g && g.p && g.p.find(p => p && p.id === 'pa_newsboy');
      const a = luke ? pushOffLuke(luke, x, y, 0) : { x: x, y: y };
      return ring0(a.x, a.y, color, maxR, life);
    };
    fx._lukeSparkHooked = true;
  }

  hookSprites();
  hookFxSpark();
  startWhenReady();
})();

