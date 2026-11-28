// v26（仅临时测试街 minion-test）：已锁定的五只小怪全套接到现有绘制管线。
// 胡同混混 / 练功学徒 / 不良少年：SRC=750 DST=50，固定脚位 fo || d.foot || [24,40]，着地末行 599。
// 武馆大师兄 / 相扑力士：SRC=960 DST=64，固定脚位 fo || d.foot || [32,54]，着地末行 809。
// 挂钩方式同卢克：不按每帧测到的 fx 重新居中。包内不含庆祝帧，也不画庆祝。
// 查询参数：
//   ?beijing=1  跳过地图，进北京街（混混、学徒，大师兄做精英和第 21 场街尾）
//   ?tokyo=1    跳过地图，进东京街（只有不良少年；相扑做精英和街尾。不含剑道部女生）
//   ?hunhunlab=1 / ?xuetulab=1 / ?dashixionglab=1 / ?badboylab=1 / ?sumolab=1
//                 姿势台（1 待机 2 走 3 连击 4 重击 5 出场 6 防御 7 受击 8 倒地 9 倒地消散；[ ] 步进；G 地面线）
//   ?hdchar=0   同时退回原版图集（对照用）
//   ?hdminion=0 只退回这五只的原版图集
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
  WF.hdMinion = flag('hdminion', WF.hdChar);

  const CHARS = {
    bj_hunhun:     { src: 750, dst: 50, foot: [24, 40], lab: 'hunhunlab', city: 'beijing' },
    bj_xuetu:      { src: 750, dst: 50, foot: [24, 40], lab: 'xuetulab',  city: 'beijing' },
    bj_dashixiong: { src: 960, dst: 64, foot: [32, 54], lab: 'dashixionglab', city: 'beijing' },
    ty_badboy:     { src: 750, dst: 50, foot: [24, 40], lab: 'badboylab', city: 'tokyo' },
    ty_sumo:       { src: 960, dst: 64, foot: [32, 54], lab: 'sumolab',   city: 'tokyo' },
  };
  const HD_ANIMS = ['idle', 'walk', 'combo_a', 'heavy_punch', 'block', 'hit_swap',
    'knocked_down', 'knocked_down_death', 'intro'];
  const CORE = { idle: 1, walk: 1, combo_a: 1 };
  const TINT = { white: '#f4f0ff', red: '#ff3a48', black: '#07040e' };
  const LAB_KEYS = { Digit1: 'idle', Digit2: 'walk', Digit3: 'combo_a', Digit4: 'heavy_punch',
    Digit5: 'intro', Digit6: 'block', Digit7: 'hit_swap', Digit8: 'knocked_down', Digit9: 'knocked_down_death' };

  const bag = Object.create(null);
  const waiters = [];
  let pending = 0, allDone = false;
  function settle() {
    if (pending !== 0) return;
    allDone = true;
    waiters.splice(0).forEach(fn => fn());
  }
  function ok(im) { return !!(im && (im instanceof HTMLCanvasElement || (im.complete && im.naturalWidth))); }

  Object.keys(CHARS).forEach(id => {
    const conf = CHARS[id];
    const cells = {}, animOf = {}, frames = Object.create(null), animLeft = Object.create(null);
    const A = window.WF_ASSETS && window.WF_ASSETS[id] && window.WF_ASSETS[id].anims;
    if (A) {
      HD_ANIMS.forEach(name => {
        const an = A[name]; if (!an) return;
        an.frames.forEach((f, i) => { cells[f.c] = name + '/' + String(i).padStart(3, '0'); animOf[f.c] = name; });
      });
    }
    function loadOne(key, path, core) {
      if (core) pending++;
      const name = animOf[key];
      animLeft[name] = (animLeft[name] || 0) + 1;
      const im = new Image();
      const rec = frames[key] = { normal: im, white: null, red: null, black: null, anim: name };
      const fin = () => { animLeft[name]--; if (core) { pending--; settle(); } };
      im.onload = fin;
      im.onerror = () => { rec.failed = true; fin(); };
      if (!core) im.fetchPriority = 'low';
      im.src = 'assets/' + id + '_hd/frames/' + path + '.webp';
    }
    Object.keys(cells).filter(c => CORE[animOf[c]]).forEach(c => loadOne(+c, cells[c], true));
    setTimeout(() => Object.keys(cells).filter(c => !CORE[animOf[c]]).forEach(c => loadOne(+c, cells[c], false)), 0);
    bag[id] = { conf: conf, cells: cells, animOf: animOf, frames: frames, animLeft: animLeft };
    conf.enabledFlag = 'hd_' + id;
    WF[conf.enabledFlag] = flag('hd' + id.replace(/^(bj_|ty_)/, ''), WF.hdMinion);
    if (flag(conf.lab, false)) WF.minionLab = id;
  });
  if (pending === 0) allDone = true;
  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  WF.minionCity = null;
  if (flag('beijing', false)) WF.minionCity = 'beijing';
  if (flag('tokyo', false)) WF.minionCity = 'tokyo';
  if (WF.minionLab && CHARS[WF.minionLab]) WF.minionCity = CHARS[WF.minionLab].city;

  function tintOf(rec, variant, srcSize) {
    if (variant === 'normal' || !variant) return rec.normal;
    if (rec[variant]) return rec[variant];
    if (!ok(rec.normal)) return rec.normal;
    const src = rec.normal;
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || srcSize;
    c.height = src.naturalHeight || srcSize;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = TINT[variant] || TINT.white;
    g.fillRect(0, 0, c.width, c.height);
    rec[variant] = c;
    return c;
  }

  function isDefaultSheet(id, set) {
    const im = set && set.normal;
    if (!im) return false;
    const src = im.src || '';
    if (/\/skins\//.test(src)) return false;
    return new RegExp(id).test(src) || !src;
  }

  function canUseHd(id, cell, set) {
    const b = bag[id];
    if (!b) return false;
    if (!(WF.hdChar && WF.hdMinion && WF[b.conf.enabledFlag])) return false;
    const r = b.frames[cell];
    return !!(r && !r.failed && !b.animLeft[r.anim] && isDefaultSheet(id, set));
  }

  function footOf(id, fo) {
    const d = window.WF_ASSETS && window.WF_ASSETS[id];
    return fo || (d && d.foot) || (bag[id] && bag[id].conf.foot) || [24, 40];
  }

  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._minionHdHooked) return;
    const baseDraw = S.draw.bind(S);
    const baseLoad = S.load.bind(S);
    S.draw = function (ctx, id, cell, X, G, dir, variant, fo) {
      const set = S.img && S.img[id];
      if (!canUseHd(id, cell, set)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const b = bag[id], rec = b.frames[cell], conf = b.conf;
      let im = tintOf(rec, variant || 'normal', conf.src);
      if (!ok(im)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      // 固定脚位（同卢克）：fo || d.foot || 角色默认，不按每帧测到的 fx 重新居中。
      const foot = footOf(id, fo);
      const top = G - foot[1];
      const prevSm = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = (WF.CFG.WORLD_SCALE || WF.CFG.SCALE) < 15;
      if (dir > 0) ctx.drawImage(im, 0, 0, conf.src, conf.src, X - foot[0], top, conf.dst, conf.dst);
      else {
        ctx.save();
        ctx.translate(X + 1, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, conf.src, conf.src, -foot[0], top, conf.dst, conf.dst);
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = prevSm;
    };
    S.load = function (done, prog) {
      baseLoad(() => { ready.then(done); }, prog);
    };
    S._minionHdHooked = true;
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

  function bootCity(g, city) {
    if (!g || g.camp && g.camp.cityId === city && g.street) return true;
    if (!ensureProfile(g)) return false;
    if (!g.menu.char) g.menu.char = 'suling';
    g.startCampaign({ city: city });
    if (g.state === 'map' && g.campEnterCity) g.campEnterCity();
    return !!(g.camp && g.camp.cityId === city);
  }

  const lab = { anim: 'idle', fi: 0, ground: false, ready: false, id: null };

  function ensureFighter(g, id) {
    if (g.p && g.p[1] && g.p[1].id === id) return g.p[1];
    if (g.campStreetStop) g.campStreetStop();
    const x = (g.streetSlot && g.streetSlot(1)) || (g.p[1] && g.p[1].x) || 120;
    const hp = (g.p[1] && g.p[1].maxHp) || 500;
    if (g.campSpawn) return g.campSpawn(id, hp, x);
    const E = new WF.Fighter(id, 1);
    E.x = x; E.dir = -1; E.hp = E.maxHp = hp; E.alpha = 1;
    g.p[1] = E;
    return E;
  }

  function applyPose(spec) {
    const g = WF.game; if (!g || !g.p) return false;
    const id = WF.minionLab;
    if (!id) return false;
    let anim, fi;
    if (typeof spec === 'string') {
      const m = spec.match(/^([a-z_]+)\/?(\d+)?$/i);
      if (!m) return false;
      anim = m[1];
      fi = m[2] != null ? parseInt(m[2], 10) : 0;
    } else {
      anim = spec.anim; fi = spec.fi || 0;
    }
    const E = ensureFighter(g, id);
    if (!E || E.id !== id) return false;
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
    lab.anim = anim; lab.fi = fi; lab.id = id;
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
      if (!WF.minionLab || !WF.game) return;
      const g = WF.game;
      if (LAB_KEYS[ev.code]) { applyPose({ anim: LAB_KEYS[ev.code], fi: 0 }); ev.preventDefault(); return; }
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
    if (!G || G._minionGroundHooked) return;
    const base = G.render;
    if (!base) return;
    G.render = function () {
      const r = base.apply(this, arguments);
      if (WF.minionLab && lab.ground) drawGroundLine(this);
      return r;
    };
    G._minionGroundHooked = true;
  }

  // 火花/冲击环贴边（沿用巴黎测试街：只作用于被打的一方，拉到剪影前沿）。
  const SPARK_MARGIN = 1.5;
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
  function maskOf(id, cell) {
    const b = bag[id], rec = b && b.frames[cell];
    if (!rec || rec.failed || !ok(rec.normal)) return null;
    if (rec.sparkMask) return rec.sparkMask;
    const DST = b.conf.dst, SRC = b.conf.src;
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
    rec.sparkDst = DST;
    return rows;
  }
  function rowAt(mask, ly, dst) {
    const y0 = Math.max(0, Math.min(dst - 1, Math.round(ly)));
    if (mask[y0] && mask[y0].l != null) return mask[y0];
    for (let d = 1; d <= 3; d++) {
      for (const y of [y0 - d, y0 + d]) {
        if (y >= 0 && y < dst && mask[y] && mask[y].l != null) return mask[y];
      }
    }
    return null;
  }
  function localToWorldX(f, localX, X, foot) {
    return f.dir > 0 ? X - foot[0] + localX : X + 1 + foot[0] - localX;
  }
  function pushOff(f, x, y, dir) {
    if (WF._skipSparkPush) return null;
    if (!f || !bag[f.id] || !canUseHd(f.id, (visFrame(f) || {}).c, WF.Sprites && WF.Sprites.img && WF.Sprites.img[f.id])) return null;
    const fr = visFrame(f);
    if (!fr) return null;
    const mask = maskOf(f.id, fr.c);
    if (!mask) return null;
    const foot = footOf(f.id, fr.fo);
    const X = drawX(f);
    const yOff = Math.round(f.y || 0);
    const localY = y - ((WF.CFG.GROUND_Y || 76) - yOff - foot[1]);
    const dst = bag[f.id].conf.dst;
    const row = rowAt(mask, localY, dst);
    if (!row) return null;
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
    if (!fx || fx._minionSparkHooked) return;
    const spark0 = fx.spark.bind(fx);
    const ring0 = fx.ring.bind(fx);
    fx.spark = function (x, y, dir, kind, size) {
      const g = WF.game, hit = g && g.p && g.p.find(p => p && bag[p.id]);
      const a = hit ? pushOff(hit, x, y, dir) : null;
      if (!a) return spark0(x, y, dir, kind, size);
      const d = (kind === 'block' && a.outDir != null) ? a.outDir : a.dir;
      return spark0(a.x, a.y, d, kind, size);
    };
    fx.ring = function (x, y, color, maxR, life) {
      const g = WF.game, hit = g && g.p && g.p.find(p => p && bag[p.id]);
      const a = hit ? pushOff(hit, x, y, 0) : null;
      if (!a) return ring0(x, y, color, maxR, life);
      return ring0(a.x, a.y, color, maxR, life);
    };
    fx._minionSparkHooked = true;
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
        if (WF.minionCity) bootCity(g, WF.minionCity);
        if (WF.minionLab) {
          const wait = () => {
            if (g.p && g.p[1] && g.street) {
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

  WF.MinionHD = {
    bag: bag,
    ready: ready,
    lab: lab,
    applyPose: applyPose,
    bootCity: function (city) { return bootCity(WF.game, city || WF.minionCity); },
    info: function () {
      const g = WF.game, f = g && g.p && g.p[1], C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const fr = f && f.frame();
      const id = f && f.id;
      const b = id && bag[id];
      let loaded = 0, failed = 0, cellCount = 0;
      Object.keys(bag).forEach(k => {
        const frames = bag[k].frames;
        loaded += Object.keys(frames).filter(c => ok(frames[c].normal) && !frames[c].failed).length;
        failed += Object.keys(frames).filter(c => frames[c].failed).length;
        cellCount += Object.keys(bag[k].cells).length;
      });
      return {
        hdChar: !!WF.hdChar,
        hdMinion: !!WF.hdMinion,
        worldScale: WS,
        groundY: C.GROUND_Y,
        anim: f && f.anim,
        fi: f && f.fi,
        cell: fr && fr.c,
        char: id,
        foot: fr && fr.fo || (id && window.WF_ASSETS[id] && window.WF_ASSETS[id].foot),
        hookFoot: id && footOf(id, fr && fr.fo),
        dir: f && f.dir,
        city: g && g.camp && g.camp.cityId,
        wave: g && g.camp && g.camp.wave,
        state: g && g.state,
        loaded: loaded,
        failed: failed,
        cellCount: cellCount,
        lab: { id: lab.id, anim: lab.anim, fi: lab.fi, ground: lab.ground, ready: lab.ready },
      };
    },
  };

  hookSprites();
  hookFxSpark();
  startWhenReady();
})();
