// v26（hd 版，仅本地分支）：Mr.J 15 倍全套 28 动作 212 帧接到现有绘制管线。
// 图集里没有 15 倍稿的动作（ground_combo、空中技、ki_blast、投技等）仍走原 50 像素图集。
// 不改脚点、逻辑格、跑速、帧 tick、战斗数值、邮票或朝左 1px 偏移。
// 查询参数：
//   默认开启 15 倍帧。
//   ?hdchar=0  同时退回原版 50 像素苏绫 / Mr.J 帧（对照用）
//   ?hdmrj=0   只退回原版 50 像素 Mr.J，苏绫高清帧不受影响
(function () {
  const WF = window.WF || (window.WF = {});
  let q = '';
  try { q = location.search || ''; } catch (e) {}
  const flag = (name, defOn) => {
    if (new RegExp('[?&]' + name + '=0(&|$)').test(q)) return false;
    if (new RegExp('[?&]' + name + '=1(&|$)').test(q)) return true;
    return defOn;
  };
  // 复用 v26 已解析的 WF.hdChar；若本文件单独加载则自行解析。
  if (typeof WF.hdChar === 'undefined') WF.hdChar = flag('hdchar', true);
  WF.hdMrj = flag('hdmrj', WF.hdChar);

  const SRC = 750, DST = 50;
  // Mr.J 15 倍全套：28 个动作 212 帧（2026-11-27 验收定稿）
  const HD_ANIMS = ['idle', 'walk', 'run', 'combo_a', 'combo_b', 'combo_c', 'heavy_punch', 'dash_punch', 'uppercut',
    'hyper_combo', 'mega_charge_a', 'mega_charge_b', 'block', 'block_hit', 'block_recover', 'hit_swap', 'burned',
    'dodge_roll', 'stunned', 'back_launch_knockdown', 'knocked_down', 'knocked_down_get_up', 'knocked_down_death',
    'clash_impact', 'clash_lock', 'clash_win', 'clash_lose', 'celebrate'];
  const CORE = { idle: 1, run: 1, walk: 1, combo_a: 1 };
  const CELLS = {};
  const ANIM_OF = {};
  (function buildCells() {
    const A = window.WF_ASSETS && window.WF_ASSETS.mrj && window.WF_ASSETS.mrj.anims;
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
    im.src = 'assets/mrj_hd/frames/' + path + '.webp';
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

  function isDefaultMrjSheet(set) {
    const im = set && set.normal;
    if (!im) return false;
    const src = im.src || '';
    if (/\/skins\//.test(src)) return false;
    return /mrj(?:\.png|$)/.test(src) || !src;
  }

  function canUseHd(id, cell, set) {
    const r = frames[cell];
    return !!(WF.hdMrj && WF.hdChar && id === 'mrj' && r && !r.failed && !animLeft[r.anim] && isDefaultMrjSheet(set));
  }

  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  function hookSprites() {
    const S = WF.Sprites;
    if (!S || S._mrjHdHooked) return;
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
    S._mrjHdHooked = true;
  }

  WF.MrJHD = {
    cells: CELLS,
    frames: frames,
    ready: ready,
    setHd: function (on) { WF.hdMrj = !!on; if (WF.game) WF.game.render(); },
    canvasPNG: function () { return WF.game && WF.game.cv.toDataURL('image/png'); },
    worldPNG: function () { return WF.game && WF.game.world.toDataURL('image/png'); },
    info: function () {
      const g = WF.game, f = g && g.p[0], C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE;
      const fr = f && f.frame();
      const loaded = Object.keys(frames).filter(k => ok(frames[k].normal) && !frames[k].failed).length;
      const failed = Object.keys(frames).filter(k => frames[k].failed).length;
      return {
        hdChar: !!WF.hdChar,
        hdMrj: !!WF.hdMrj,
        worldScale: WS,
        groundY: C.GROUND_Y,
        groundPx: C.GROUND_Y * WS,
        anim: f && f.anim,
        fi: f && f.fi,
        cell: fr && fr.c,
        char: f && f.id,
        tick: fr && fr.t,
        foot: (fr && fr.fo) || (window.WF_ASSETS.mrj && window.WF_ASSETS.mrj.foot),
        x: f && f.x,
        cam: g && g.cam,
        dir: f && f.dir,
        canvas: g && [g.cv.width, g.cv.height],
        world: g && [g.world.width, g.world.height],
        loaded: loaded,
        failed: failed,
        cellCount: Object.keys(CELLS).length,
      };
    },
  };

  hookSprites();
})();
