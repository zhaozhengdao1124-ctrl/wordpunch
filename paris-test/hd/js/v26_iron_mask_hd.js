// v26（仅临时测试街 paris-test）：铁面人（槽位 iron_mask）960 已通过 240 帧接到现有绘制管线。玩法仍克隆玛戈（v24_iron_mask.js）；只换高清画稿。idle_alt 只在同词换页时播。
// 钩 WF.Sprites.draw。SRC=960 DST=64，再 × WORLD_SCALE=15。着地末行是 814（y≥815 全透明），不要套小怪 809。待机垫底脚点 x 约 470.6，不强行居中到 480。
// 脚点用各帧自身（官方 selfcheck：末 6 行 alpha>8 均值 x；着地 y 用画布 clear_from），不写死 (480,810) 或 (480,815)。
// 朝左仍是 translate(X+1) 再 scale(-1,1)。受击白/红闪用运行时 source-in。
// 查询参数：
//   默认开启高清帧。
//   ?hdchar=0     同时退回原版图集（对照用）
//   ?hdiron=0   只退回本角色原版图集
//   ?paris=1      跳过地图，直接进入巴黎长街（不破坏原有行为）
//   ?ironlab=1  姿势台：钉本角色单帧（见文件内按键；[ ] 步进；G 地面线）
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
  WF.hdIron = flag('hdiron', WF.hdChar);
  WF.ironLab = flag('ironlab', false);
  if (WF.ironLab) WF.lukeParis = true;

  const SRC = 960, DST = 64, SCALE = 15;
  const GROUND_SRC = 815;
  const DEFAULT_FX = 470.6;
  const CHAR_ID = 'iron_mask';
  const SHEET_RE = /iron_mask/;
  const ASSET_BASE = 'assets/iron_mask_hd/frames/';
  const HD_ANIMS = ['idle', 'heavy_kick', 'walk', 'run', 'dodge_roll', 'combo_a', 'combo_b', 'combo_c', 'heavy_punch', 'uppercut', 'dash_punch', 'light_kick', 'mega_charge_a', 'mega_charge_b', 'grab_and_beatdown', 'block', 'block_hit', 'block_recover', 'hit_swap', 'stunned', 'knocked_down', 'back_launch_knockdown', 'knocked_down_get_up', 'knocked_down_death', 'burned', 'clash_impact', 'clash_lock', 'clash_win', 'clash_lose', 'intro', 'celebrate', 'idle_alt'];
  const CORE = { idle: 1, walk: 1, run: 1, combo_a: 1 };
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

  // 官方 selfcheck：末 6 行（last_row-5..last_row）alpha>8 像素的平均 x。y 用画布着地线，不把离地帧拉回地面。
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
    return !!(WF.hdIron && WF.hdChar && id === CHAR_ID && r && !r.failed && !animLeft[r.anim] && isDefaultSheet(set));
  }

  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._ironMaskHdHooked) return;
    const baseDraw = S.draw.bind(S);
    const baseLoad = S.load.bind(S);
    S.draw = function (ctx, id, cell, X, G, dir, variant, fo) {
      const set = S.img && S.img[id];
      if (!canUseHd(id, cell, set)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const rec = frames[cell];
      let im = tintOf(rec, variant || 'normal');
      if (!ok(im)) return baseDraw(ctx, id, cell, X, G, dir, variant, fo);
      const fx = srcFootX(rec);
      const foot = [fx / SCALE, GROUND_SRC / SCALE];
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
    S._ironMaskHdHooked = true;
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
      if (!WF.ironLab || !WF.game) return;
      const g = WF.game;
      const map = { Digit1: 'idle', Digit2: 'walk', Digit3: 'run', Digit4: 'combo_a', Digit5: 'heavy_punch', Digit6: 'heavy_kick', Digit7: 'intro', Digit8: 'celebrate', Digit9: 'idle_alt', Digit0: 'block' };
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
    if (!G || G._ironMaskGroundHooked) return;
    const base = G.render;
    if (!base) return;
    G.render = function () {
      const r = base.apply(this, arguments);
      if (WF.ironLab && lab.ground) drawGroundLine(this);
      return r;
    };
    G._ironMaskGroundHooked = true;
  }

  function startWhenReady() {
    if (!WF.ironLab) return;
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
              if (!WF.ironLab) return;
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

  WF.IronMaskHD = {
    id: CHAR_ID,
    src: SRC,
    dst: DST,
    groundSrc: GROUND_SRC,
    cells: CELLS,
    frames: frames,
    ready: ready,
    lab: lab,
    setHd: function (on) { WF.hdIron = !!on; if (WF.game) WF.game.render(); },
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
      const fx = rec && !rec.failed ? srcFootX(rec) : DEFAULT_FX;
      const hdW = rec && rec.normal && rec.normal.naturalWidth;
      return {
        hdChar: !!WF.hdChar,
        hdIron: !!WF.hdIron,
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
        foot: [fx / SCALE, GROUND_SRC / SCALE],
        footSrc: [fx, GROUND_SRC],
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

  hookSprites();
  startWhenReady();
})();
