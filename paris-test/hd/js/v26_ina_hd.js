// v26（仅临时测试街 paris-test）：伊娜（槽位 pa_sketcher）15 倍已通过帧接到现有绘制管线。不画 celebrate，包内也不含庆祝帧。
// 钩 WF.Sprites.draw。750 画进 50 逻辑格，再 × WORLD_SCALE=15。
// 【固定脚位 v1.20】绘制用角色/帧自带 foot[0]（同卢克），不再按每帧质心居中；着地 y 用画布 clear_from（旧：每帧末 6 行均值 x 会左右跳），不写死 (360,600)。
// 朝左仍是 translate(X+1) 再 scale(-1,1)。受击白/红闪用运行时 source-in。
// 查询参数：
//   默认开启高清帧。
//   ?hdchar=0     同时退回原版图集（对照用）
//   ?hdina=0   只退回本角色原版图集
//   ?paris=1      跳过地图，直接进入巴黎长街（不破坏原有行为）
//   ?inalab=1  姿势台：钉本角色单帧（见文件内按键；[ ] 步进；G 地面线）
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
  WF.hdIna = flag('hdina', WF.hdChar);
  WF.inaLab = flag('inalab', false);
  if (WF.inaLab) WF.lukeParis = true;

  const SRC = 750, DST = 50, SCALE = 15;
  const GROUND_SRC = 600;
  const DEFAULT_FX = 360;
  const CHAR_ID = 'pa_sketcher';
  const SHEET_RE = /pa_sketcher/;
  const ASSET_BASE = 'assets/pa_sketcher_hd/frames/';
  const HD_ANIMS = ['idle', 'walk', 'combo_a', 'heavy_punch', 'block', 'hit_swap', 'knocked_down', 'knocked_down_death', 'intro'];
  const CORE = { idle: 1, walk: 1, combo_a: 1 };
  const CELLS = {};
  const ANIM_OF = {};
  (function buildCells() {
    const A = window.WF_ASSETS && window.WF_ASSETS[CHAR_ID] && window.WF_ASSETS[CHAR_ID].anims;
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
    const rec = frames[key] = { normal: im, white: null, red: null, black: null, anim: name, path: path, fx: null };
    const fin = () => { animLeft[name]--; if (core) { pending--; settle(); } };
    im.onload = fin;
    im.onerror = () => { rec.failed = true; fin(); };
    if (!core) im.fetchPriority = 'low';
    im.src = ASSET_BASE + path + '.webp';
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


  // 固定脚位（与 v26_luke_hd.js 同一套）：x 用帧自带 fo 或角色默认 foot[0]，不按每帧质心/脚位重新居中；
  // y 仍用本角色着地线 GROUND_SRC/SCALE（Bastian 810 / 铁面人 815 / Ina 600，末行 809 / 814 / 599 不变）。
  function footOf(fo) {
    const d = window.WF_ASSETS && window.WF_ASSETS[CHAR_ID];
    const fx = (fo && fo[0] != null) ? fo[0] : (d && d.foot && d.foot[0] != null ? d.foot[0] : DEFAULT_FX / SCALE);
    return [fx, GROUND_SRC / SCALE];
  }

  // （仅诊断用，不再参与绘制）// 官方 selfcheck：末 6 行（last_row-5..last_row）alpha>8 像素的平均 x。y 用画布着地线，不把离地帧拉回地面。
  function srcFootX(rec) {
    if (rec.fx != null) return rec.fx;
    const src = rec.normal;
    if (!ok(src) || src instanceof HTMLCanvasElement) { rec.fx = DEFAULT_FX; return rec.fx; }
    const w = src.naturalWidth, h = src.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    let last = -1;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) { last = y; break; }
      }
      if (last >= 0) break;
    }
    if (last < 0) { rec.fx = DEFAULT_FX; return rec.fx; }
    let sx = 0, n = 0;
    const y0 = Math.max(0, last - 5);
    for (let y = y0; y <= last; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) { sx += x; n++; }
      }
    }
    rec.fx = n ? sx / n : DEFAULT_FX;
    rec.lastRow = last;
    return rec.fx;
  }

  function isDefaultSheet(set) {
    const im = set && set.normal;
    if (!im) return false;
    const src = im.src || '';
    if (/\/skins\//.test(src)) return false;
    return SHEET_RE.test(src) || !src;
  }

  function canUseHd(id, cell, set) {
    const r = frames[cell];
    return !!(WF.hdIna && WF.hdChar && id === CHAR_ID && r && !r.failed && !animLeft[r.anim] && isDefaultSheet(set));
  }

  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._inaHdHooked) return;
    const baseDraw = S.draw.bind(S);
    const baseLoad = S.load.bind(S);
    S.draw = function (ctx, id, cell, X, G, dir, variant, fo) {
      const set = S.img && S.img[id];
      if (!canUseHd(id, cell, set)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const rec = frames[cell];
      let im = tintOf(rec, variant || 'normal');
      if (!ok(im)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const foot = footOf(fo);
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
    S._inaHdHooked = true;
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

  function ensureFighter(g) {
    if (g.p && g.p[1] && g.p[1].id === CHAR_ID) return g.p[1];
    if (g.campStreetStop) g.campStreetStop();
    const x = (g.streetSlot && g.streetSlot(1)) || (g.p[1] && g.p[1].x) || 120;
    const hp = (g.p[1] && g.p[1].maxHp) || 500;
    if (g.campSpawn) return g.campSpawn(CHAR_ID, hp, x);
    const E = new WF.Fighter(CHAR_ID, 1);
    E.x = x; E.dir = -1; E.hp = E.maxHp = hp; E.alpha = 1;
    g.p[1] = E;
    return E;
  }

  function applyPose(spec) {
    const g = WF.game; if (!g || !g.p) return false;
    let anim, fi;
    if (typeof spec === 'string') {
      const m = spec.match(/^([a-z_]+)\/?(\d+)?$/i);
      if (!m) return false;
      anim = m[1];
      fi = m[2] != null ? parseInt(m[2], 10) : 0;
    } else {
      anim = spec.anim; fi = spec.fi || 0;
    }
    const E = ensureFighter(g);
    if (!E || E.id !== CHAR_ID) return false;
    const a = E.data && E.data.anims && E.data.anims[anim];
    if (!a) return false;
    fi = Math.max(0, Math.min(a.frames.length - 1, fi));
    if (g.campStreetStop) g.campStreetStop();
    E.dir = -1;
    E.alpha = 1;
    E.tween = null; E.fly = null; E._down = false;
    if (E.lockHome && g.streetSlot) E.lockHome(g.streetSlot(1));
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
      if (!WF.inaLab || !WF.game) return;
      const g = WF.game;
      const map = { Digit1: 'idle', Digit2: 'walk', Digit3: 'combo_a', Digit4: 'heavy_punch', Digit5: 'intro', Digit6: 'block', Digit7: 'hit_swap', Digit8: 'knocked_down', Digit9: 'knocked_down_death' };
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
    if (!G || G._inaGroundHooked) return;
    const base = G.render;
    if (!base) return;
    G.render = function () {
      const r = base.apply(this, arguments);
      if (WF.inaLab && lab.ground) drawGroundLine(this);
      return r;
    };
    G._inaGroundHooked = true;
  }

  function startWhenReady() {
    if (!WF.inaLab) return;
    const t0 = Date.now();
    const tick = () => {
      const g = WF.game;
      if (!(WF.ready && g && g.ui)) {
        if (Date.now() - t0 < 45000) requestAnimationFrame(tick);
        return;
      }
      ready.then(() => {
        bootParis(g);
        const wait = () => {
          if (g.p && g.p[0] && g.street) {
            if (g.campStreetStop) g.campStreetStop();
            const pinned = applyPose({ anim: 'idle', fi: 0 });
            if (!pinned || !g.p[1] || g.p[1].id !== CHAR_ID) {
              if (Date.now() - t0 < 45000) setTimeout(wait, 50);
              return;
            }
            lab.ready = true;
            hookLabInput();
            hookRenderGround();
            const hold = () => {
              if (!WF.inaLab) return;
              const E = g.p && g.p[1];
              if (!E || E.id !== CHAR_ID) applyPose({ anim: lab.anim, fi: lab.fi });
              else if (g.street && g.street.phase !== 'fight' && g.campStreetStop) g.campStreetStop();
              requestAnimationFrame(hold);
            };
            hold();
            return;
          }
          if (Date.now() - t0 < 45000) setTimeout(wait, 50);
        };
        wait();
      });
    };
    tick();
  }

  WF.InaHD = {
    id: CHAR_ID,
    src: SRC,
    dst: DST,
    groundSrc: GROUND_SRC,
    cells: CELLS,
    frames: frames,
    ready: ready,
    lab: lab,
    setHd: function (on) { WF.hdIna = !!on; if (WF.game) WF.game.render(); },
    applyPose: applyPose,
    bootParis: function () { return bootParis(WF.game); },
    canvasPNG: function () { return WF.game && WF.game.cv.toDataURL('image/png'); },
    worldPNG: function () { return WF.game && WF.game.world.toDataURL('image/png'); },
    info: function () {
      const g = WF.game, f = g && g.p && g.p[1], C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const fr = f && f.frame();
      const rec = fr && frames[fr.c];
      const loaded = Object.keys(frames).filter(k => ok(frames[k].normal) && !frames[k].failed).length;
      const failed = Object.keys(frames).filter(k => frames[k].failed).length;
      const mfx = rec && !rec.failed ? srcFootX(rec) : DEFAULT_FX;   // 本帧测得的脚位（仅诊断）
      const ft = footOf(fr && fr.fo);
      const hdW = rec && rec.normal && rec.normal.naturalWidth;
      return {
        hdChar: !!WF.hdChar,
        hdIna: !!WF.hdIna,
        usingHd: !!(f && f.id === CHAR_ID && rec && !rec.failed && hdW === SRC),
        hdSrcWidth: hdW || 0,
        worldScale: WS,
        groundY: C.GROUND_Y,
        groundPx: C.GROUND_Y * WS,
        anim: f && f.anim,
        fi: f && f.fi,
        cell: fr && fr.c,
        char: f && f.id,
        tick: fr && fr.t,
        foot: ft,
        footSrc: [ft[0] * SCALE, GROUND_SRC],
        measuredFootSrcX: mfx,
        lastRow: rec && rec.lastRow,
        x: f && f.x,
        cam: g && g.cam,
        dir: f && f.dir,
        canvas: g && [g.cv.width, g.cv.height],
        world: g && [g.world.width, g.world.height],
        loaded: loaded,
        failed: failed,
        cellCount: Object.keys(CELLS).length,
        city: g && g.camp && g.camp.cityId,
        wave: g && g.camp && g.camp.wave,
        path: rec && rec.path,
      };
    },
  };


  // ---- 火花/冲击环贴边（沿用卢克 hookFxSpark 思路，改为只作用于「被打的一方」，并拉到剪影前沿）----
  // 轮廓行范围用整张 SRC 回读（不是 64 格最近邻），再按逻辑行取最左/最右。
  const SPARK_MARGIN = 1.5;   // 火花中心落在剪影前沿外 1.5 逻辑像素
  const SPARK_REACH = 14;     // 原落点离剪影超过这个距离就不动
  const SPARK_ALPHA = 32;
  const SPARK_SKIP = { clash: 1, miss: 1 };
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
    c.width = SRC; c.height = SRC;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(rec.normal, 0, 0);
    const data = g.getImageData(0, 0, SRC, SRC).data;
    const rows = new Array(DST);
    for (let ly = 0; ly < DST; ly++) {
      let l = null, r = null;
      for (let sy = ly * SCALE; sy < (ly + 1) * SCALE; sy++) {
        const o = sy * SRC * 4 + 3;
        for (let x = 0; x < SRC; x++) {
          if (data[o + x * 4] >= SPARK_ALPHA) {
            if (l == null || x < l) l = x;
            if (r == null || x > r) r = x;
          }
        }
      }
      rows[ly] = l == null ? { l: null, r: null } : { l: l / SCALE, r: (r + 1) / SCALE };
    }
    rec.sparkMask = rows;
    return rows;
  }
  function rowAt(mask, ly) {
    const y0 = Math.max(0, Math.min(DST - 1, Math.floor(ly)));
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
  function pushToEdge(f, x, y, dir) {
    if (WF._skipSparkPush) return null;
    if (!f || f.id !== CHAR_ID || !WF.hdIna || !WF.hdChar) return null;
    if (dir !== 0 && f.dir === dir) return null;          // 这是出手的一方，不是被打的一方
    const fr = visFrame(f);
    if (!fr || !canUseHd(CHAR_ID, fr.c, S_img())) return null;
    const mask = maskOf(fr.c);
    if (!mask) return null;
    const foot = footOf(fr.fo);
    const X = drawX(f);
    const yOff = Math.round(f.y || 0);
    const localY = y - ((WF.CFG.GROUND_Y || 76) - yOff - foot[1]);
    const row = rowAt(mask, localY);
    if (!row) return null;
    const wL = localToWorldX(f, row.l, X, foot);
    const wR = localToWorldX(f, row.r, X, foot);
    const worldLeft = Math.min(wL, wR);
    const worldRight = Math.max(wL, wR);
    if (x < worldLeft - SPARK_REACH || x > worldRight + SPARK_REACH) return null;
    let side;
    if (dir > 0) side = 'left';
    else if (dir < 0) side = 'right';
    else side = x <= (worldLeft + worldRight) / 2 ? 'left' : 'right';
    const nx = side === 'left' ? worldLeft - SPARK_MARGIN : worldRight + SPARK_MARGIN;
    return { x: nx, y: y, dir: dir, outDir: side === 'left' ? -1 : 1 };
  }
  function S_img() { return WF.Sprites && WF.Sprites.img && WF.Sprites.img[CHAR_ID]; }
  function hookFxSpark() {
    const fx = WF.FX;
    if (!fx || fx._inaSparkHooked) return;
    const spark0 = fx.spark.bind(fx);
    const ring0 = fx.ring.bind(fx);
    let last = null;
    const self = () => { const g = WF.game; return g && g.p && g.p.find(p => p && p.id === CHAR_ID); };
    fx.spark = function (x, y, dir, kind, size) {
      const f = self();
      const a = (f && !SPARK_SKIP[kind || 'hit']) ? pushToEdge(f, x, y, dir) : null;
      last = a ? { x0: x, y0: y, x1: a.x, y1: a.y } : null;
      if (!a) return spark0(x, y, dir, kind, size);
      const d = (kind === 'block' && a.outDir != null) ? a.outDir : dir;
      return spark0(a.x, a.y, d, kind, size);
    };
    fx.ring = function (x, y, color, maxR, life) {
      if (last && last.x0 === x && last.y0 === y) return ring0(last.x1, last.y1, color, maxR, life);
      return ring0(x, y, color, maxR, life);
    };
    fx._inaSparkHooked = true;
  }

  hookSprites();
  hookFxSpark();
  startWhenReady();
})();
