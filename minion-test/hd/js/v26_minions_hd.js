// v26（仅临时测试街 minion-test）：已锁定的九只小怪全套接到现有绘制管线。
// 胡同混混 / 练功学徒 / 不良少年 / 剑道部女生 / 街头舞者 / 跆拳道黄带：SRC=750 DST=50，固定脚位 fo || d.foot || [24,40]，着地末行 599。
// 武馆大师兄 / 相扑力士 / 夜店保镖：SRC=960 DST=64，固定脚位 fo || d.foot || [32,54]，着地末行 809。
// 挂钩方式同卢克：不按每帧测到的 fx 重新居中。小怪包内不含庆祝帧，也不画庆祝。
// v26 city3：城市对手 陈半山（北京）/ 韩多蔚（首尔）/ 雪乃（东京）高清全套 31 动作 236 帧（含庆祝）：
//   SRC=750 DST=50，固定脚位 fo || d.foot || [24,40]，着地末行 599；按需加载（进对应城市 / 姿势台 / 直打入口 / 首次绘制时才拉）。
// 查询参数：
//   ?beijing=1  跳过地图，进北京街（混混、学徒交替，大师兄做精英；街尾照正式版打陈半山）
//   ?tokyo=1    跳过地图，进东京街（不良少年与剑道部女生交替；相扑做精英；街尾照正式版打雪乃）
//   ?seoul=1    跳过地图，进首尔街（舞者与黄带交替；夜店保镖做精英；街尾照正式版打韩多蔚）
//   ?hunhunlab=1 / ?xuetulab=1 / ?dashixionglab=1 / ?badboylab=1 / ?sumolab=1
//   ?kendolab=1 / ?dancerlab=1 / ?yellowbeltlab=1 / ?bouncerlab=1
//                 姿势台（1 待机 2 走 3 连击 4 重击 5 出场 6 防御 7 受击 8 倒地 9 倒地消散；[ ] 步进；G 地面线）
//   ?chenbanshanlab=1 / ?handaweilab=1 / ?yukinolab=1
//                 城市对手姿势台（1 待机 2 走 3 跑 4 出场 5 连击A 6 重拳 7 受击 8 倒地 9 庆祝 0 超必杀；
//                 , . 切换上/下一个动作（31 个全覆盖）；[ ] 步进；P 连播当前动作；G 地面线）
//   ?chenbanshanfight=1 / ?handaweifight=1 / ?yukinofight=1
//                 直接进入与该对手对打：进城后清掉第一只小怪，跑到街尾，走正式的城市对手登场镜头
//   ?hdchenbanshan=0 / ?hdhandawei=0 / ?hdyukino=0  单独退回原版图集
//   ?hdchar=0   同时退回原版图集（对照用）
//   ?hdminion=0 只退回这九只的原版图集
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
    bj_hunhun:      { src: 750, dst: 50, foot: [24, 40], lab: 'hunhunlab', city: 'beijing' },
    bj_xuetu:       { src: 750, dst: 50, foot: [24, 40], lab: 'xuetulab',  city: 'beijing' },
    bj_dashixiong:  { src: 960, dst: 64, foot: [32, 54], lab: 'dashixionglab', city: 'beijing' },
    ty_badboy:      { src: 750, dst: 50, foot: [24, 40], lab: 'badboylab', city: 'tokyo' },
    ty_kendo:       { src: 750, dst: 50, foot: [24, 40], lab: 'kendolab',  city: 'tokyo' },
    ty_sumo:        { src: 960, dst: 64, foot: [32, 54], lab: 'sumolab',   city: 'tokyo' },
    sl_dancer:      { src: 750, dst: 50, foot: [24, 40], lab: 'dancerlab', city: 'seoul' },
    sl_yellowbelt:  { src: 750, dst: 50, foot: [24, 40], lab: 'yellowbeltlab', city: 'seoul' },
    sl_bouncer:     { src: 960, dst: 64, foot: [32, 54], lab: 'bouncerlab', city: 'seoul' },
    chenbanshan:    { src: 750, dst: 50, foot: [24, 40], lab: 'chenbanshanlab', fight: 'chenbanshanfight', city: 'beijing', opp: true },
    handawei:       { src: 750, dst: 50, foot: [24, 40], lab: 'handaweilab', fight: 'handaweifight', city: 'seoul', opp: true },
    yukino:         { src: 750, dst: 50, foot: [24, 40], lab: 'yukinolab', fight: 'yukinofight', city: 'tokyo', opp: true },
  };
  const HD_ANIMS = ['idle', 'walk', 'combo_a', 'heavy_punch', 'block', 'hit_swap',
    'knocked_down', 'knocked_down_death', 'intro'];
  const CORE = { idle: 1, walk: 1, combo_a: 1 };
  // 城市对手：游戏里实际播放的 31 个动作（roster.md / MANIFEST.csv 的 236 帧），按这个顺序排姿势台。
  const OPP_ANIMS = ['idle', 'walk', 'run', 'intro', 'combo_a', 'combo_b', 'combo_c', 'heavy_punch', 'light_kick',
    'heavy_kick', 'uppercut', 'dash_punch', 'hyper_combo', 'mega_charge_a', 'mega_charge_b', 'block', 'block_hit',
    'block_recover', 'hit_swap', 'stunned', 'burned', 'back_launch_knockdown', 'knocked_down', 'knocked_down_get_up',
    'knocked_down_death', 'dodge_roll', 'clash_lock', 'clash_impact', 'clash_win', 'clash_lose', 'celebrate'];
  const OPP_FIRST = { idle: 1, walk: 1, run: 1, intro: 1 };
  const OPP_LAB_KEYS = { Digit1: 'idle', Digit2: 'walk', Digit3: 'run', Digit4: 'intro', Digit5: 'combo_a',
    Digit6: 'heavy_punch', Digit7: 'hit_swap', Digit8: 'knocked_down', Digit9: 'celebrate', Digit0: 'hyper_combo' };
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
    const list = conf.opp ? OPP_ANIMS : HD_ANIMS;
    if (A) {
      list.forEach(name => {
        const an = A[name]; if (!an) return;
        an.frames.forEach((f, i) => { cells[f.c] = name + '/' + String(i).padStart(3, '0'); animOf[f.c] = name; });
      });
    }
    let left = 0, oneDone = null;
    const whenAll = new Promise(res => { oneDone = res; });
    function loadOne(key, path, core) {
      if (core) pending++;
      left++;
      const name = animOf[key];
      animLeft[name] = (animLeft[name] || 0) + 1;
      const im = new Image();
      const rec = frames[key] = { normal: im, white: null, red: null, black: null, anim: name };
      const fin = () => { animLeft[name]--; if (core) { pending--; settle(); } if (--left === 0) oneDone(); };
      im.onload = fin;
      im.onerror = () => { rec.failed = true; fin(); };
      if (!core) im.fetchPriority = 'low';
      im.src = 'assets/' + id + '_hd/frames/' + path + '.webp';
    }
    // 还没开始拉的格子 frames[c] 为空，canUseHd 直接退回原版图集；同一动作的格子同批入队，不会半套高清半套像素。
    let started = false;
    function startLoad() {
      if (started) return whenAll;
      started = true;
      if (!Object.keys(cells).length) { oneDone(); return whenAll; }
      if (conf.opp) {
        // 城市对手不挡开机：先拉待机/走/跑/出场，其余低优先级
        Object.keys(cells).filter(c => OPP_FIRST[animOf[c]]).forEach(c => loadOne(+c, cells[c], false));
        setTimeout(() => Object.keys(cells).filter(c => !OPP_FIRST[animOf[c]]).forEach(c => loadOne(+c, cells[c], false)), 0);
      } else {
        Object.keys(cells).filter(c => CORE[animOf[c]]).forEach(c => loadOne(+c, cells[c], true));
        setTimeout(() => Object.keys(cells).filter(c => !CORE[animOf[c]]).forEach(c => loadOne(+c, cells[c], false)), 0);
      }
      return whenAll;
    }
    if (!conf.opp) startLoad();
    bag[id] = { conf: conf, cells: cells, animOf: animOf, frames: frames, animLeft: animLeft, anims: list,
      load: startLoad, started: () => started, loaded: whenAll };
    conf.enabledFlag = 'hd_' + id;
    WF[conf.enabledFlag] = flag('hd' + id.replace(/^(bj_|ty_|sl_)/, ''), WF.hdMinion);
    if (flag(conf.lab, false)) WF.minionLab = id;
    if (conf.fight && flag(conf.fight, false)) WF.oppFight = id;
  });
  if (pending === 0) allDone = true;
  const ready = new Promise(res => { if (allDone) res(); else waiters.push(res); });

  WF.minionCity = null;
  if (flag('beijing', false)) WF.minionCity = 'beijing';
  if (flag('tokyo', false)) WF.minionCity = 'tokyo';
  if (flag('seoul', false)) WF.minionCity = 'seoul';
  if (WF.minionLab && CHARS[WF.minionLab]) WF.minionCity = CHARS[WF.minionLab].city;
  if (WF.oppFight && CHARS[WF.oppFight]) WF.minionCity = CHARS[WF.oppFight].city;
  // 城市对手按需加载：带了城市 / 姿势台 / 直打参数就先拉对应对手。
  const CITY_OPP = {};
  Object.keys(CHARS).forEach(id => { if (CHARS[id].opp) CITY_OPP[CHARS[id].city] = id; });
  function want(id) { const b = bag[id]; return b && b.load ? b.load() : Promise.resolve(); }
  if (WF.minionCity && CITY_OPP[WF.minionCity]) want(CITY_OPP[WF.minionCity]);
  if (WF.minionLab) want(WF.minionLab);
  if (WF.oppFight) want(WF.oppFight);

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
    if (!b.started()) { b.load(); return false; }
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
    labTip();
    if (g.render) g.render();
    return true;
  }

  // 姿势台冻结：街战的出题/超时/攻防不再跑（数字键 1-9 原来会同时答题，答完就进了普通街战）。
  function freezeLab(g) {
    if (g._minionLabFrozen) return;
    g._minionLabFrozen = true;
    g.state = 'lab';
    g.q = null;
    g.pendingAttack = null;
    g.paused = false;
    g.newQuestion = function () {};   // 迟到的出题（剧情/入场回调）也不再起题
    g.update = function () {
      if (this.state !== 'lab' || this.q) { this.state = 'lab'; this.q = null; this.pendingAttack = null; }
      this.t++; WF.frameNo++;
      if (WF.FX && WF.FX.update) WF.FX.update();
      this.decay();
    };
    if (typeof document !== 'undefined' && document.body && !document.getElementById('minionLabTip')) {
      const d = document.createElement('div');
      d.id = 'minionLabTip';
      d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;padding:6px 10px;background:rgba(0,0,0,.72);color:#9f9;font:12px/1.5 monospace;border-radius:4px;pointer-events:none;white-space:pre';
      document.body.appendChild(d);
      lab.tip = d;
    }
  }
  function labKeys() { return CHARS[WF.minionLab] && CHARS[WF.minionLab].opp ? OPP_LAB_KEYS : LAB_KEYS; }
  function labAnims() {
    const b = bag[WF.minionLab], E = WF.game && WF.game.p && WF.game.p[1];
    const list = b ? b.anims : HD_ANIMS;
    return list.filter(a => !E || !E.data || E.data.anims[a]);
  }
  function labTip() {
    if (!lab.tip) return;
    const opp = CHARS[lab.id] && CHARS[lab.id].opp;
    const A = WF.game && WF.game.p && WF.game.p[1] && WF.game.p[1].data && WF.game.p[1].data.anims[lab.anim];
    const list = labAnims(), k = list.indexOf(lab.anim);
    lab.tip.textContent = '姿势台 ' + (lab.id || '') + '  ' + lab.anim + '/' + String(lab.fi).padStart(3, '0') +
      (A ? ' (共 ' + A.frames.length + ' 帧)' : '') + '  动作 ' + (k + 1) + '/' + list.length + (lab.playing ? '  ▶连播' : '') +
      (opp ? '\n1待机 2走 3跑 4出场 5连击A 6重拳 7受击 8倒地 9庆祝 0超必杀  , . 换动作  [ ] 步进  P 连播  G 地面线'
           : '\n1待机 2走 3连击 4重击 5出场 6防御 7受击 8倒地 9消散  [ ] 步进  G 地面线');
  }
  function labPlay() {
    // 连播：按动作原表的 t 一帧帧推进（不改动画数据），播完回到 000 再停住
    const g = WF.game, E = g && g.p && g.p[1];
    const A = E && E.data && E.data.anims[lab.anim];
    if (!A) return;
    lab.playing = true;
    const anim = lab.anim, tok = (lab.tok = (lab.tok || 0) + 1);
    let fi = 0;
    const step = () => {
      if (lab.tok !== tok || lab.anim !== anim) return;
      applyPose({ anim: anim, fi: fi });
      lab.playing = true; labTip();
      const t = (A.frames[fi] && A.frames[fi].t) || 2;
      fi++;
      if (fi >= A.frames.length) { setTimeout(() => { if (lab.tok === tok) { lab.playing = false; labTip(); } }, t * 1000 / (WF.CFG.FPS || 30)); return; }
      setTimeout(step, t * 1000 / (WF.CFG.FPS || 30));
    };
    step();
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
      const K = labKeys();
      if (K[ev.code]) { lab.tok = (lab.tok || 0) + 1; lab.playing = false; applyPose({ anim: K[ev.code], fi: 0 }); ev.preventDefault(); return; }
      if (ev.code === 'Comma' || ev.code === 'Period') {
        const list = labAnims(), k = list.indexOf(lab.anim), n = list.length;
        const nk = ev.code === 'Period' ? (k + 1) % n : (k + n - 1) % n;
        lab.tok = (lab.tok || 0) + 1; lab.playing = false;
        applyPose({ anim: list[nk], fi: 0 }); ev.preventDefault(); return;
      }
      if (ev.code === 'KeyP') { labPlay(); ev.preventDefault(); return; }
      if (ev.code === 'KeyG') { lab.ground = !lab.ground; if (g.render) g.render(); ev.preventDefault(); return; }
      if (ev.code === 'BracketLeft' || ev.code === 'BracketRight') {
        const A = g.p[1] && g.p[1].data && g.p[1].data.anims[lab.anim];
        if (!A) return;
        const n = A.frames.length;
        lab.tok = (lab.tok || 0) + 1; lab.playing = false;
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
      if (WF.minionLab && this._minionLabFrozen && (this.q || this.state !== 'lab')) { this.q = null; this.state = 'lab'; }
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

  // 直打入口：等第一只小怪走到位、开始出题，就把它撤掉、跳到最后一波，走正式的「跑向街尾 → 擂台 → 城市对手登场镜头」。
  const fight = { id: null, skipped: false };
  function skipToOpponent(g) {
    fight.id = WF.oppFight;
    const t0 = Date.now();
    const wait = () => {
      const cp = g.camp, st = g.street;
      if (cp && st && st.on && st.phase === 'fight' && g.state === 'question' && g.p[1] && g.p[1].mv && g.p[1].mv.minion) {
        const M = g.p[1];
        g.queue.length = 0;
        g.q = null; g.pendingAttack = null; g.announce = null;
        M.hp = 0; M.alpha = 0; M._scored = true; M.tween = null;
        cp.mobs = [];
        cp.wave = g.campWaves();
        cp.restDone = true;
        g.state = 'minionOut';
        g.campStreetToEnd();
        fight.skipped = true;
        return;
      }
      if (Date.now() - t0 < 60000) setTimeout(wait, 50);
    };
    wait();
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
        if (WF.oppFight) skipToOpponent(g);
        if (WF.minionLab) {
          const wait = () => {
            if (g.p && g.p[1] && g.street) {
              freezeLab(g);
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
    want: want,
    fight: fight,
    labAnims: labAnims,
    oppLoaded: function (id) {
      const b = bag[id]; if (!b) return null;
      const keys = Object.keys(b.cells);
      return { cells: keys.length, loaded: keys.filter(c => b.frames[c] && ok(b.frames[c].normal) && !b.frames[c].failed).length,
        failed: keys.filter(c => b.frames[c] && b.frames[c].failed).length, started: b.started() };
    },
    hdDrawn: function (id, cell) { const b = bag[id]; return !!(b && canUseHd(id, cell, WF.Sprites && WF.Sprites.img && WF.Sprites.img[id])); },
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
