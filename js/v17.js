// v1.7 新城引擎：跑车进场 / idle_alt 插播 / 两个新大招（全面削减、星舰升空）的特效与规则。
// 特效全部是代码画的像素块（实心色、无半透明），颜色取自现有特效和两位 Boss 的色表。
(function () {
  const G = WF.Game.prototype;
  const K = () => WF.CFG.CAMPAIGN;
  const U2 = () => WF.CFG.ULT2;
  const ITEM = id => WF.CFG.ITEMS.find(i => i.id === id);
  const PAL = { ol: '#25202e', w: '#ffffff', y1: '#fff3a0', y2: '#ffb43c', r1: '#fb4647', r2: '#ac252f', saw: '#e6962a', sawD: '#b0641e', bar: '#aab0be', barD: '#787e8c',
    steel: '#c8ccd6', steelD: '#969caa', red: '#d8282e', redD: '#7a1418', grn: '#3ad06a', grnD: '#1a6a34', gray: '#5a5670', dark: '#1a1426' };
  const rnd = Math.random;

  // ---------- 小工具：3×5 像素数字 ----------
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111' };
  G.pxDigits = function (str, x, y, u, col, ol) {
    const c = this.ctx; str = String(str); const W = str.length * 4 - 1;
    let cx = Math.round(x - W * u / 2);
    for (const ch of str) {
      const m = DIG[ch]; if (!m) { cx += 4 * u; continue; }
      for (let i = 0; i < 15; i++) if (m[i] === '1') {
        const px = cx + (i % 3) * u, py = y + Math.floor(i / 3) * u;
        if (ol) { c.fillStyle = ol; c.fillRect(px - u / 2, py - u / 2, u * 2, u * 2); }
      }
      for (let i = 0; i < 15; i++) if (m[i] === '1') { c.fillStyle = col; c.fillRect(cx + (i % 3) * u, y + Math.floor(i / 3) * u, u, u); }
      cx += 4 * u;
    }
  };

  // ================= 解锁：打败某个 Boss =================
  G.campBeat = function (L) {
    const pid = this.menu.p1, p = WF.Profiles.ext(pid); if (!p || !L) return;
    p.camp.beat = Object.assign({}, p.camp.beat || {}); p.camp.beat[L.id] = (p.camp.beat[L.id] || 0) + 1; WF.Profiles.save();
    this.showUnlocks(WF.Unlocks.check(pid), pid);
  };

  // ================= idle_alt：待机时偶尔插播（拉启动绳 / 试喷一口火） =================
  const baseUpdate = G.update;
  G.update = function () {
    baseUpdate.call(this);
    if (this.paused) return;
    const okState = this.state === 'question' || this.state === 'title' || this.state === 'resolve';
    for (const f of this.fighters()) {
      if (!f.mv || !f.mv.idleAlt || !f.has('idle_alt')) continue;
      if (f.anim !== 'idle' || !okState || f.vis && f.vis.anim) { f._idleT = 0; continue; }
      f._idleT = (f._idleT || 0) + 1;
      if (!f._idleNext) f._idleNext = Math.round((3.5 + rnd() * 4) * WF.CFG.FPS);
      if (f._idleT >= f._idleNext) { f._idleT = 0; f._idleNext = 0; f.play('idle_alt', { next: 'idle' }); }
    }
    if (this.sawFx) { this.sawFx.t++; for (const p of this.sawFx.fly) { p.x += p.vx; p.y += p.vy; p.vy += 0.7; } if (this.sawFx.t > 200 && !this.sawFx.keep) this.sawFx = null; }
    if (this.afuera) { if (++this.afuera.t > 60) this.afuera = null; }
    if (this.sawTick) this.sawTick();
    if (this.armorFx) { const a = this.armorFx; a.t++; for (const s of a.shards) { s.x += s.vx; s.y += s.vy; s.vy += 0.12; } if (a.t > 50) this.armorFx = null; }
    if (this.rocket) this.rocket.t++;
  };

  // ================= 跑车进场（马西克） =================
  G.campCarCineInit = function () {
    const c = this.cine, cfg = c.cfg, E = c.E, ph = [];
    let t = 0; for (const k of ['dark', 'lights', 'drive', 'door', 'exit', 'intro', 'zoom', 'card', 'carOut', 'back']) { const n = cfg[k] || 0; if (n) { ph.push({ k, a: t, b: t + n }); t += n; } }
    c.ph = ph; c.total = t;
    E.sil = 0; E.alpha = 0; E.x = c.x1; E.dir = -1;
    const stopX = c.x1 + 4, startX = c.camT + WF.CFG.VIEW_W / 2 + 40;
    this.car = { x: startX, stopX, startX, wheel: 0, door: -1, light: -1, smoke: -1, on: true };
  };
  G.campCarCineTick = function () {
    const C = WF.CFG, c = this.cine, E = c.E, P = this.p[0], car = this.car, cfg = c.cfg;
    const ph = this.cinePhase(), k = (c.t - ph.a) / Math.max(1, ph.b - ph.a), first = c.t === ph.a;
    if (c.t === 0) this.darkenTarget = 0.62;
    if (P._home && !P.tween) { P._home = false; P.play('idle'); }
    if (ph.k === 'lights') {   // 远处车灯一亮：车还在画面外，只看到车头灯
      car.x = c.camT + C.VIEW_W / 2 + 30; car.light = Math.min(2, Math.floor(k * 6) % 3);
      if (first) WF.Audio.play('beep', { f: 300, d: 0.12 });
    }
    if (ph.k === 'drive') {    // 无声滑进 + 甩尾停住
      const e = 1 - Math.pow(1 - k, 3), last = car.x;
      car.x = car.startX + (car.stopX - car.startX) * e; car.wheel = (car.wheel + Math.abs(car.x - last) * 0.5) % 4; car.light = 2;
      if (k > 0.72) { car.smoke = Math.min(4, Math.floor((k - 0.72) / 0.28 * 5)); if (c.t % 3 === 0) WF.FX.dust(car.x + 16, C.GROUND_Y, 1, 2); }
      if (k > 0.72 && c.t % 6 === 0) this.shakeAdd(1.5);
    }
    if (ph.k === 'door') { car.smoke = -1; car.light = -1; car.door = Math.min(5, Math.floor(k * 6)); if (first) WF.Audio.play('whoosh'); }
    if (ph.k === 'exit') { if (first) { E.alpha = 1; E.x = c.x1; E.play('intro_car', { hold: true }); } }
    if (ph.k === 'intro') { if (first) E.play(E.has('intro') ? 'intro' : 'idle', { hold: true }); }
    if (ph.k === 'zoom') { if (first) this.darkenTarget = 0.3; const e = 1 - Math.pow(1 - k, 3); this.zoom = { k: e, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 24 }; }
    if (ph.k === 'card') {
      this.zoom = { k: 1, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 24 }; this.bars = Math.min(1, (c.t - ph.a + 1) / 6);
      if (first) { WF.Audio.play('drum', { big: true }); this.shakeAdd(20); this.steamPuff = 24; }
    }
    if (ph.k === 'carOut') {   // 门关上，跑车自己倒车开出画面
      this.zoom = { k: 1 - k * k, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 24 }; this.bars = Math.max(0, 1 - k * 1.6);
      car.door = Math.max(-1, 5 - Math.floor(k * 18)); const last = car.x;
      car.x = car.stopX + (c.camT + C.VIEW_W / 2 + 50 - car.stopX) * k * k; car.wheel = (car.wheel - Math.abs(car.x - last) * 0.5 + 8) % 4;
      if (first && E.anim !== 'idle') E.play('idle');
    }
    if (ph.k === 'back') {
      this.zoom = null; this.bars = 0; this.darkenTarget = 0; c.hud = k > 0.3; car.on = false;
      if (first) { WF.Audio.startMusic(); c.musicOn = true; }
    }
    if (this.steamPuff > 0) this.steamPuff--;
    c.t++;
    if (c.t >= c.total) this.campCineEnd();
  };
  function carImg(f) { return WF.campImg('car/' + f); }
  G.drawCar = function (w, li, front) {
    const car = this.car; if (!car || !car.on) return;
    const C = WF.CFG, X = Math.round(car.x - li) - 32, Y = C.GROUND_Y - 23;
    if (!front) {
      const hl = carImg('car_headlight.png'), sm = carImg('car_drift_smoke.png'), body = carImg('car_body.png'), wh = carImg('car_wheels.png');
      if (hl && car.light >= 0) w.drawImage(hl, car.light * 32, 0, 32, 12, X - 30, Y + 8, 32, 12);
      if (sm && car.smoke >= 0) w.drawImage(sm, car.smoke * 32, 0, 32, 12, X + 47, Y + 12, 32, 12);
      if (body) w.drawImage(body, X, Y);
      if (wh) w.drawImage(wh, (Math.floor(car.wheel) % 4) * 64, 0, 64, 24, X, Y, 64, 24);
    } else {
      const dr = carImg('car_door.png');
      if (dr && car.door >= 0) w.drawImage(dr, car.door * 64, 0, 64, 40, X, Y - 16, 64, 40);
    }
  };

  // ================= 世界层挂钩 =================
  G.drawWorldBehind = function (w, li) {
    this.drawCar(w, li, false);
    if (WF.Stage.mode === 'proc' && this.rocket) this.drawRocketBG(w, Math.round((li) * 0.55), true);
  };
  G.drawWorldFront = function (w, li) {
    this.drawCar(w, li, true);
    if (this.armorFx) this.drawArmorFx(w, li);
    if (this.rocket && this.rocket.fall) this.drawFallingRocket(w, li);
  };
  // 擂台层回调（城市 PNG 模式）：火箭基地的巨型火箭在 mid 层，点火 / 白烟画在它底座上
  WF.Stage.onLayer = function (ctx, l, ox, t) {
    const g = WF.game; if (!g) return;
    if (l.id === 'near' && g.rocket) g.drawRocketBG(ctx, Math.round(ox / (l.p || 0.8) * 0.55), false);   // 画在 near 层之上，不然尾焰被栏杆挡住
    if (l.id === 'mid' && g.steamPuff > 0 && g.camp && g.camp.city.stage === 'rocketbase') g.drawSteamPuff(ctx, ox, g.steamPuff);
  };
  G.drawSteamPuff = function (ctx, ox, n) {
    const k = 1 - n / 24, cx = 146 - ox, cy = 66, R = WF.rng(9);
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI, d = 6 + k * 26 * (0.6 + R() * 0.6), s = 3 + Math.round(R() * 3 + k * 3);
      const x = Math.round(cx + Math.cos(a) * d * (R() < 0.5 ? -1 : 1)), y = Math.round(cy - Math.sin(a) * d * 0.4);
      ctx.fillStyle = '#c8ccd6'; ctx.fillRect(x - 1, y - 1, s + 2, s + 2); ctx.fillStyle = '#f0f2f6'; ctx.fillRect(x, y, s, s);
    }
  };
  // 背景火箭点火：tier 0 小火苗，1-3 越来越大；红色（Boss 版）尾焰更乱，绿色倒计时（玩家版）尾焰更整齐
  G.drawRocketBG = function (ctx, ox, own) {
    const rk = this.rocket, t = this.t; if (!rk) return;
    const baseX = own ? 150 - ox : 146 - ox, baseY = own ? 62 : 60;
    if (own || !(this.camp && this.camp.city.stage === 'rocketbase')) {   // 没有火箭基地背景时自己画一枚小火箭
      const x = baseX - 3, y = baseY - 30;
      ctx.fillStyle = PAL.ol; ctx.fillRect(x - 1, y + 2, 9, 30); ctx.fillRect(x + 1, y, 5, 3);
      ctx.fillStyle = PAL.steel; ctx.fillRect(x, y + 3, 7, 27); ctx.fillStyle = PAL.steelD; ctx.fillRect(x + 5, y + 3, 2, 27); ctx.fillRect(x + 2, y + 1, 3, 2);
      ctx.fillStyle = PAL.ol; ctx.fillRect(x - 3, y + 24, 3, 7); ctx.fillRect(x + 7, y + 24, 3, 7);
    }
    const tier = rk.mode === 'player' ? rk.tier : 1 + Math.min(2, Math.floor(rk.t / 100));
    const L = 8 + tier * 9 + (t % 4 < 2 ? 2 : 0), W = 4 + tier * 3;
    for (let i = 0; i < L; i++) {
      const k = i / L, ww = Math.max(1, Math.round(W * (1 - k * 0.7) + ((t + i) % 3 === 0 ? 1 : 0)));
      const col = k < 0.25 ? PAL.w : k < 0.55 ? PAL.y1 : k < 0.8 ? PAL.y2 : PAL.r1;
      ctx.fillStyle = col; ctx.fillRect(baseX - Math.floor(ww / 2), baseY + i, ww, 1);
    }
    // 底部白烟团（实心）
    for (let i = 0; i < 2 + tier; i++) {
      const s = 3 + ((t >> 2) + i) % 3, dx = (i % 2 ? 1 : -1) * (4 + i * 4 + ((t >> 3) % 3));
      ctx.fillStyle = '#9aa0ae'; ctx.fillRect(baseX + dx - 1, baseY + L - 3, s + 2, s); ctx.fillStyle = '#e6e8ee'; ctx.fillRect(baseX + dx, baseY + L - 3, s, s - 1);
    }
  };
  G.drawFallingRocket = function (w, li) {
    const f = this.rocket.fall, x = Math.round(f.x - li), y = Math.round(f.y);
    w.fillStyle = PAL.ol; w.fillRect(x - 4, y - 22, 9, 22); w.fillRect(x - 2, y - 25, 5, 4);
    w.fillStyle = PAL.steel; w.fillRect(x - 3, y - 21, 7, 20); w.fillStyle = PAL.steelD; w.fillRect(x + 2, y - 21, 2, 20); w.fillRect(x - 1, y - 24, 3, 3);
    w.fillStyle = PAL.ol; w.fillRect(x - 6, y - 26, 3, 6); w.fillRect(x + 4, y - 26, 3, 6);
    for (let i = 0; i < 10; i++) { const k = i / 10; w.fillStyle = k < 0.3 ? PAL.w : k < 0.6 ? PAL.y1 : PAL.y2; w.fillRect(x - Math.round(2 * (1 - k)), y - 26 - i, 1 + Math.round(4 * (1 - k)), 1); }
  };

  // ================= 全面削减（米雷霸） =================
  G.campItemOff = function (id) { const o = this.camp && this.camp.itemOff; return !!(o && o.ids.indexOf(id) >= 0); };
  // v1.7.1 U1.1：身体动作 = saw_strip（10 帧 46 tick；active 004，hit 005 = tick 18；最后一帧回 idle/000）。
  // 伤害在 ultSeq 里由 saw_strip 的 hit 帧打出，同一帧调用 sawBegin 开始锯口 / 破甲；之后 sawAfterSeq 等特效走完再收尾。
  G.sawBegin = function (A, D) {
    if (this._sawRun && this._sawRun.A === A) return;
    const S = U2().SAW;
    const bossVer = A.side === 1 && !!this.camp && D.side === 0;
    this._sawRun = { A, D, bossVer };
    if (bossVer) {
      const cp = this.camp, held = cp.items.map(i => i.id).filter(id => !this.campItemOff(id));
      const n = Math.ceil(held.length / 2), pool = held.slice(), cut = [];
      for (let i = 0; i < n; i++) cut.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
      const N = K().SLOTS, mid = Math.floor(N / 2);
      this.sawFx = { t: 0, cut, mid, fly: [], keep: true, spawned: false, afA: A };   // ¡AFUERA! 等到 saw_strip/008（单手指人）才弹出
      this.afuera = null;
      this._sawRun.cut = cut; this._sawRun.held = held.length;
      cp.itemOff = cut.length ? { ids: (cp.itemOff ? cp.itemOff.ids : []).concat(cut), q: S.DISABLE_Q } : cp.itemOff;
      WF.Audio.play('clash', { power: 1.2 }); WF.Audio.play('boom'); this.shakeAdd(14);
      this.say(`全面削减：锯掉 ${cut.length}/${held.length} 件道具 ${cut.join(',')}，${S.DISABLE_Q} 题后恢复`);
      if (WF.Ach) WF.Ach.ev(this, 'sawCut', cut.length);
    } else {
      D.toughQ = S.TOUGH_Q + 1;   // ult2OnQuestion 先减 1：接下来正好 3 题
      if (WF.Ach && A.side === 0) WF.Ach.ev(this, 'sawP', 1);
      const ft = D.frame(), foot = ft.fo || D.data.foot, top = WF.CFG.GROUND_Y - foot[1] + (ft.bb ? ft.bb[1] : 10) - 12;
      this.armorFx = { t: 0, x: D.worldX(), y: top, shards: [], D };
      WF.Audio.play('clash', { power: 1 });
    }
  };
  // 每帧推进（v17 update 里调用）：锯到道具栏时图标飞走 / 护甲碎开
  G.sawTick = function () {
    const f = this.sawFx, cp = this.camp;
    if (f && cp && !f.spawned && f.t === 18) {
      f.spawned = true; const mid = f.mid;
      for (const id of f.cut) {
        const k = cp.items.findIndex(it => it.id === id); if (k < 0) continue;
        f.fly.push({ id, lv: cp.items[k].lv, x: (K().STRIP_X0 || 84) + k * (K().STRIP_DX || 38), y: 74, vx: (k < mid ? -1 : 1) * (2 + rnd() * 3), vy: -7 - rnd() * 4 });
      }
      WF.Audio.play('whoosh');
    }
    if (f && f.afA && !this.afuera && !f.afDone && (f.afA.anim === 'saw_strip' ? f.afA.fi >= 8 : f.t >= 14)) { f.afDone = true; this.afuera = { t: 0 }; }
    if (f && f.t < 24 && f.t % 5 === 0) WF.Audio.play('hit', { power: 0.5, pitch: 1.6 });
    const a = this.armorFx;
    if (a && a.t === 10 && !a.broke) {
      a.broke = true;
      for (let s = 0; s < 7; s++) a.shards.push({ x: a.x + (s % 3) * 3 - 3, y: a.y + Math.floor(s / 3) * 3, vx: (rnd() - 0.5) * 2.4, vy: -1.4 - rnd() * 1.2, c: s % 2 ? PAL.steel : PAL.steelD });
      WF.Audio.play('hit', { power: 1.2, pitch: 1.4 }); this.shakeAdd(6);
      this.popWorld('破甲！韧性减半', a.x, a.y - 4, '#ffb43c', 24);
    }
  };
  G.sawAfterSeq = function* (A, D) {
    const S = U2().SAW;
    if (!this._sawRun || this._sawRun.A !== A) this.sawBegin(A, D);   // 兜底：动画没走到命中帧
    const run = this._sawRun; this._sawRun = null;
    if (run.bossVer) {
      let w = 0; while (this.sawFx && this.sawFx.t < 36 && w++ < 60) yield 1;
      const cut = run.cut;
      if (!cut.length) this.toast('全面削减！', '道具栏是空的，锯了个寂寞', null, '#ff9a6a');
      else this.toast(`AFUERA！${cut.length} 件道具被踢出去`, `${cut.map(id => ITEM(id).name).join('、')} 失效 ${S.DISABLE_Q} 题`, null, '#ff6a6a');
    } else {
      let w = 0; while (this.armorFx && this.armorFx.t < 34 && w++ < 60) yield 1;
      this.say(`全面削减（玩家版）：${D.mv.name} 韧性减半 ${S.TOUGH_Q} 题`);
    }
  };
  // 被锯掉的格子：裂开的空格 + 还剩几题的像素数字
  G.drawSawSlot = function (it, x, y, i) {
    const c = this.ctx, cp = this.camp, q = (cp.itemOff && cp.itemOff.q) || 0;
    c.fillStyle = PAL.dark; c.fillRect(x, y, 36, 36);
    c.fillStyle = PAL.redD; c.fillRect(x, y, 36, 2); c.fillRect(x, y + 34, 36, 2); c.fillRect(x, y, 2, 36); c.fillRect(x + 34, y, 2, 36);
    for (let k = 0; k < 9; k++) { c.fillStyle = PAL.r2; c.fillRect(x + 4 + k * 3, y + 6 + ((k * 7) % 5) * 5, 2, 2); }
    this.pxDigits(Math.max(1, q), x + 18, y + 10, 4, '#ff9a6a', PAL.ol);
  };
  // 道具栏上的电锯 + 锯口 + 飞走的图标（屏幕坐标，2 像素一格，和道具图标同一放大倍率）
  G.drawSawStrip = function (x0, y) {
    const f = this.sawFx; if (!f) return;
    const c = this.ctx, u = 2, cx = x0 + f.mid * (K().STRIP_DX || 38) - 1;
    const off = this.camp && this.camp.itemOff;
    if (f.keep && f.t > 30 && !(off && off.q > 0)) { this.sawFx = null; return; }
    // 锯口：锯过之后一直留一条锯齿裂缝，直到道具恢复
    const cutY = Math.min(36, Math.max(0, (f.t - 4) * 3));
    for (let yy = 0; yy < cutY; yy += u) { c.fillStyle = PAL.ol; c.fillRect(cx - 2 + ((yy / u) % 2 ? u : 0), y + yy, u * 2, u); c.fillStyle = PAL.r1; if ((yy / u) % 3 === 0) c.fillRect(cx + ((yy / u) % 2 ? u : 0), y + yy, u, u); }
    // 电锯（锯杆朝下，机身在上）：t 0-24 从上往下锯过道具栏
    if (f.t < 30) {
      const sy = y - 44 + Math.min(60, f.t * 2.6), sx = cx - 9 * u;
      const P = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(sx + px * u, sy + py * u, w * u, h * u); };
      P(4, 0, 11, 9, PAL.ol); P(5, 1, 9, 7, PAL.saw); P(5, 6, 9, 2, PAL.sawD); P(7, 2, 3, 2, PAL.y1); P(2, 2, 3, 3, PAL.ol); P(3, 3, 2, 1, PAL.barD);
      P(7, 9, 5, 15, PAL.ol); P(8, 9, 3, 14, PAL.bar); P(10, 9, 1, 14, PAL.barD);
      for (let k = 0; k < 7; k++) { P((k + (f.t >> 1)) % 2 ? 6 : 12, 10 + k * 2, 1, 1, PAL.ol); }
      if (f.t > 4 && f.t < 26) for (let k = 0; k < 6; k++) { const a = rnd() * Math.PI, d = 4 + rnd() * 14; c.fillStyle = k % 2 ? PAL.y1 : PAL.w; c.fillRect(Math.round(cx + Math.cos(a) * d * (k % 2 ? 1 : -1)), Math.round(y + Math.min(34, cutY) - Math.sin(a) * d * 0.6), u, u); }
    }
    for (const p of f.fly) if (p.y < WF.CFG.SCREEN_H + 40) this.drawItemIcon(p.id, p.lv, Math.round(p.x), Math.round(p.y), 2);
  };
  G.drawArmorFx = function (w, li) {
    const a = this.armorFx, x = Math.round(a.x - li), y = Math.round(a.y);
    if (a.t < 10) {   // 护甲图标：小盾牌，第 10 帧碎开
      const yy = y - Math.min(4, a.t);
      w.fillStyle = PAL.ol; w.fillRect(x - 5, yy - 1, 11, 10); w.fillRect(x - 4, yy + 9, 9, 2); w.fillRect(x - 2, yy + 11, 5, 1);
      w.fillStyle = PAL.steel; w.fillRect(x - 4, yy, 9, 9); w.fillRect(x - 3, yy + 9, 7, 1);
      w.fillStyle = PAL.steelD; w.fillRect(x + 1, yy, 4, 9); w.fillStyle = PAL.w; w.fillRect(x - 3, yy + 1, 2, 2);
    } else for (const s of a.shards) { w.fillStyle = PAL.ol; w.fillRect(Math.round(s.x - li) - 1, Math.round(s.y) - 1, 4, 4); w.fillStyle = s.c; w.fillRect(Math.round(s.x - li), Math.round(s.y), 2, 2); }
  };
  // 每出一道正常题：道具失效、韧性减半各少 1 题
  G.ult2OnQuestion = function () {
    const cp = this.camp;
    if (cp && cp.itemOff) {
      if (cp.itemOff.q <= 0) {
        const back = cp.itemOff.ids.map(id => ITEM(id).name); cp.itemOff = null;
        this.toast('道具回来了', back.join('、') + ' 重新生效', null, '#7dff9a'); WF.Audio.play('pickup', { rare: true });
        this.campResetHints && this.lvOf('glasses') && null;
      } else cp.itemOff.q--;
    }
    for (const f of this.p) if (f && f.toughQ > 0) f.toughQ--;
  };
  G.ult2Reset = function () { if (this.camp) this.camp.itemOff = null; this._sawRun = null; this.sawFx = null; this.afuera = null; this.armorFx = null; this.rocket = null; if (this.p) for (const f of this.p) if (f) f.toughQ = 0; };

  // ================= 星舰升空（马西克） =================
  G.easySource = function () {
    if (this._easy && this._easyFor === this.bank) return this._easy; this._easyFor = this.bank;
    const id = U2().ROCKET.EASY_BANK, cur = this.bank, easyOwn = cur && /^(starter|primary|pep\d)$/.test(cur.id);   // 小学词库本来就简单：直接用当前词库
    const b = easyOwn ? cur : (this.banks.find(x => x.id === id) || this.banks[0]);
    this._easy = WF.makeSource({ mode: 'word', bank: b, rnd: this.rnd, banks: this.banks });
    return this._easy;
  };
  G.rocketUltSeq = function* (A, D) {
    const C = WF.CFG, R = U2().ROCKET;
    A.paused = false; D.paused = false; A.loop = false;
    let w0 = 0; yield () => { w0++; return (!A.tween && (!D.tween || D.settled)) || w0 > 30; };
    const bossVer = A.side === 1 && (this.camp || this.menu.cpu);
    const side = bossVer ? D.side : A.side, human = side === 0 || !this.menu.cpu;
    WF.Audio.play('superflash'); WF.Haptics.ultStart();
    this.darkenTarget = 0.7; this.banner = { text: A.mv.ultName, side: A.side, t: 0 }; D.paused = true;
    // 按下遥控器：v1.7.1 U1.1 remote_press（8 帧 24 tick；active 003 = tick 9 拇指按下 → 咔哒 + 背景火箭点火 + 倒计时开始）。
    // 004–007 在倒计时里继续播完，停在 007（起飞预备），倒计时结束接 mega_charge_a/008 起飞。
    const RP = U2().ROCKET_PLAYER || {}, quick = !bossVer && RP.SECONDS;   // v1.7.1 玩家版：3 秒点火，不出题
    let clicked = false;
    const hasRemote = A.has('remote_press');
    if (hasRemote) A.play('remote_press', { hold: true, onEvent: (e) => { if (e === 'active') clicked = true; } });
    else if (A.has('mega_charge_a')) A.play('mega_charge_a', { to: 7, hold: true });
    for (let i = 0; !clicked && i < (hasRemote ? 40 : quick ? RP.CHARGE : 24); i++) { A.flash = (i < 6 && i % 6 < 2) ? 1 : 0; A.flashSeq = ['white']; yield 1; }
    A.flash = 0; D.paused = false;
    this.popWorld('咔哒 · 发射！', A.worldX(), C.GROUND_Y - 46, bossVer ? '#ff6a6a' : '#7dff9a', 22);
    WF.Audio.play('beep', { f: 1200, d: 0.08 }); WF.Audio.play('boom');
    const secs = quick ? RP.SECONDS : R.SECONDS;
    const rk = this.rocket = { mode: bossVer ? 'boss' : 'player', quick: !!quick, t: 0, step: quick ? Math.round((RP.STEP || 1) * C.FPS) : C.FPS, left: secs * (quick ? Math.round((RP.STEP || 1) * C.FPS) : C.FPS), total: secs * (quick ? Math.round((RP.STEP || 1) * C.FPS) : C.FPS), n: 0, correct: 0, tier: 0, side, A, D };
    this.darkenTarget = 0.35; this.banner = null;
    if (quick) {
      this.say(`星舰升空（玩家版）：倒数 ${secs}-…-1，每格 ${rk.step} 帧（共 ${(rk.total / C.FPS).toFixed(1)} 秒），满火力起飞`);
      rk.tier = 1;
      while (rk.left > 0) {
        rk.left--;
        const el = rk.total - rk.left, tier = Math.min(3, 1 + Math.floor(el / rk.step));
        if (tier !== rk.tier) { rk.tier = tier; WF.Audio.play('point', { n: tier }); this.popWorld(`火力 ${['—', 'Ⅰ', 'Ⅱ', 'Ⅲ'][tier]}`, A.worldX(), C.GROUND_Y - 44, '#7dff9a', 20); }
        if (rk.left % rk.step === 0 && rk.left > 0) WF.Audio.play('beep', { f: 660 + tier * 120, d: 0.05 });
        yield 1;
      }
      rk.correct = R.QUESTIONS;   // 满火力
      if (WF.Ach && side === 0) WF.Ach.ev(this, 'rocketP', 1);
    } else this.say(`星舰升空（${bossVer ? 'Boss 版' : '玩家版'}）：${R.SECONDS} 秒内 ${R.QUESTIONS} 道简单题，P${side + 1} 作答`);
    while (!quick && rk.left > 0 && rk.n < R.QUESTIONS) {
      const q = this.easySource().next();
      Object.assign(q, { t: 0, ans: [null, null], first: null, revealed: false, revealT: 0, n: this.qn, flash: null, erased: null, rocket: true });
      this.q = q; this.state = 'rocket'; rk.q = q;
      if (!human) q.cpu = { t: Math.round((0.8 + rnd() * 1.2) * C.FPS), idx: rnd() < R.CPU_ACC ? q.correct : (q.correct + 1) % 4 };
      while (!q.ans[side] && rk.left > 0) {
        if (q.cpu && q.t >= q.cpu.t) this.answerRocket(side, q.cpu.idx);
        q.t++; rk.left--;
        if (rk.left % C.FPS === 0 && rk.left > 0) WF.Audio.play('beep', { f: bossVer ? 880 : 660, d: 0.05 });
        yield 1;
      }
      this.reveal(); rk.n++;
      for (let i = 0; i < 8 && rk.left > 0; i++) { rk.left--; yield 1; }
    }
    this.state = 'resolve'; if (this.q) this.reveal();
    const c = rk.correct, all = c >= R.QUESTIONS;
    rk.done = true;
    this.say(quick ? '星舰升空 满火力起飞' : `星舰升空 答对 ${c}/${R.QUESTIONS}`);
    // 起飞：mega_charge_a 8-9 点火 → mega_charge_b 0-1 冲天（引擎往上拉高）→ 2-4 俯冲 → 5 砸地
    this.darkenTarget = 0.55; this.rumble = C.SHAKE.ultRumble;
    let done = false;
    A.play('mega_charge_a', { from: 8, hold: true, onEnd: () => { done = true; } }); yield () => done;
    A.play('mega_charge_b', { to: 1, hold: true });
    { const n = quick ? RP.RISE : 14; for (let i = 0; i < n; i++) { A.y = (i + 1) * (126 / n); yield 1; } }
    A.alpha = 0; A.y = 130;
    if (bossVer && all) {   // 5/5：遥控器失灵，火箭掉回他自己头上
      this.popWorld('遥控失灵！', A.worldX(), C.GROUND_Y - 50, '#7dff9a', 26);
      rk.fall = { x: A.worldX(), y: -10 };
      for (let i = 0; i < 18; i++) { yield 1; }
      A.alpha = 1; A.y = 0; A.play('mega_charge_b', { from: 7, to: 7, hold: true });
      for (let i = 0; i < 12; i++) { rk.fall.y = -10 + (i + 1) * ((C.GROUND_Y - 30 + 10) / 12); yield 1; }
      rk.fall = null;
      const fx = A.data.fx && A.data.fx.rocket_blast; if (fx) WF.FX.sprite(fx, A.worldX(), C.GROUND_Y - 1, 1);
      const dmg = Math.round(R.BACKFIRE * (D.maxHp || C.HP));
      this.screenFlash = 5; this.shakeAdd(C.SHAKE.ultFinal);
      this.contact(D, A, D.frame(), { dmg, lvl: 'ultFinal' });
      WF.FX.spark(A.worldX(), C.GROUND_Y - 20, -D.dir, 'ultFinal', 1.6);
      this.combo[D.side] = { n: 1, t: 0, label: '火箭反噬！' };
    } else {
      const dmg = bossVer ? Math.round(R.BASE * (D.maxHp || C.HP) * Math.max(0, 1 - R.BLOCK * c))
        : Math.round(this.ultDmg(A) * this.comboMult(A.side) * Math.max(0.2, c / R.QUESTIONS));
      for (let i = 0, n = quick ? RP.HOVER : 10; i < n; i++) yield 1;
      A.alpha = 1;
      A.play('mega_charge_b', { from: 2, to: 4, hold: true });
      { const n = quick ? RP.DIVE : 9; for (let i = 0; i < n; i++) { A.y = 130 - (i + 1) * (130 / n); yield 1; } }
      A.y = 0;
      let land = false, ended = false;
      A.play('mega_charge_b', { from: 5, onEvent: (e, fi, f) => { if (e === 'hit' && fi === 5 && !land) { land = true; if (dmg > 0) this.contact(A, D, f, { dmg, lvl: 'ultFinal' }); else { this.popWorld('全部挡住！', D.worldX(), C.GROUND_Y - 46, '#7dff9a', 26); WF.FX.spark(D.worldX(), C.GROUND_Y - 20, A.dir, 'block', 1.4); } this.shakeAdd(C.SHAKE.ultFinal); this.screenFlash = 4; } }, onEnd: () => { ended = true; } });
      if (!bossVer) this.combo[A.side] = { n: 1, t: 0, label: `火力 ${['—', 'Ⅰ', 'Ⅱ', 'Ⅲ'][rk.tier]} 档` };
      yield () => ended || this.ko;
    }
    this.rumble = 0; this.darkenTarget = 0; this.banner = null; A.y = 0; A.alpha = 1;
    this.rocket = null; D.paused = false; A.paused = false;
    if (this.ko) { yield* this.koSeq(); return; }
    let after = 0; yield () => { after++; return (A.settled && D.settled) || after > 90; };
    if (!A.settled && A.anim !== 'idle') A.play('idle');
    if (!D.settled && D.anim !== 'idle') D.play('idle');
  };
  G.answerRocket = function (s, idx) {
    const rk = this.rocket, q = this.q; if (!rk || !q || rk.side !== s || q.ans[s] || q.revealed) return;
    const R = U2().ROCKET, ok = idx === q.correct;
    q.ans[s] = { idx, t: q.t, ok }; q.flash = { idx, t: 0, ok, side: s };
    const st = this.stats[s]; st.answered++; if (ok) { st.correct++; st.sumT += q.t; } else st.wrong++;
    const prof = this.profileOf(s); if (prof) WF.Profiles.markAnswer(prof.id, q, ok);
    if (this.camp && s === 0) this.campOnAnswer(q, { ok }, null);
    if (ok) {
      rk.correct++; rk.tier = rk.correct >= R.QUESTIONS ? 3 : rk.correct >= R.TIERS[1] ? 2 : rk.correct >= 1 ? 1 : 0;
      WF.Audio.play('correct'); WF.Audio.play('point', { n: rk.correct });
      const F = rk.mode === 'boss' ? rk.D : rk.A;
      this.popWorld(rk.mode === 'boss' ? `挡住 ${rk.correct * 20}%` : `火力 +1`, F.worldX(), WF.CFG.GROUND_Y - 44, rk.mode === 'boss' ? '#8fd0ff' : '#7dff9a', 20);
    } else WF.Audio.play('wrong');
    this.render && 0;
  };
  // ---------- HUD：倒计时（红色警报 / 绿色发射）+ AFUERA! + 韧性减半标签 ----------
  G.drawUlt2Hud = function () {
    const C = WF.CFG, c = this.ctx, R = U2().ROCKET;
    const rk = this.rocket;
    if (rk && !rk.done) {
      const boss = rk.mode === 'boss', col = boss ? PAL.red : PAL.grn, colD = boss ? PAL.redD : PAL.grnD;
      const blink = (rk.t >> 3) % 2 === 0;
      if (boss && blink) { c.fillStyle = PAL.red; c.fillRect(0, 0, C.SCREEN_W, 8); c.fillRect(0, 394, C.SCREEN_W, 8); c.fillRect(0, 0, 8, 402); c.fillRect(C.SCREEN_W - 8, 0, 8, 402); }
      if (!boss) { c.fillStyle = PAL.grnD; c.fillRect(0, 0, C.SCREEN_W, 4); c.fillRect(0, 398, C.SCREEN_W, 4); }
      if (rk.quick) { this.drawQuickRocketHud(rk); return this.drawUlt2Rest(); }
      const bx = C.SCREEN_W / 2 - 130, by = 92;
      c.fillStyle = PAL.ol; c.fillRect(bx, by, 260, 120); c.fillStyle = colD; c.fillRect(bx + 4, by + 4, 252, 112); c.fillStyle = '#120c1c'; c.fillRect(bx + 10, by + 30, 240, 80);
      this.txt(boss ? '⚠ 发射倒计时' : '发射倒计时', C.SCREEN_W / 2, by + 17, 18, boss ? '#ffd0d0' : '#d0ffd8', 'center', { sw: 4 });
      const sec = Math.ceil(rk.left / C.FPS);
      this.pxDigits(String(sec).padStart(2, '0'), C.SCREEN_W / 2 - 40, by + 42, 11, boss && blink ? '#ff6a6a' : (boss ? PAL.red : '#7dff9a'), PAL.ol);
      // 右边：5 格进度（挡住 / 火力）
      for (let i = 0; i < R.QUESTIONS; i++) { const on = i < rk.correct, x = bx + 176 + (i % 1) * 0, y = by + 36 + i * 14; c.fillStyle = PAL.ol; c.fillRect(x, y, 66, 11); c.fillStyle = on ? (boss ? '#8fd0ff' : PAL.y2) : (i < rk.n ? PAL.gray : '#2a2440'); c.fillRect(x + 2, y + 2, 62, 7); }
      const sub = boss ? `答对一题挡住 20%（已挡 ${rk.correct * 20}%）· 5 题全对火箭反噬` : `火力 ${['—', 'Ⅰ', 'Ⅱ', 'Ⅲ'][rk.tier]} 档 · 5 题全对满伤害`;
      this.txt(sub, C.SCREEN_W / 2, by + 136, 16, boss ? '#ffb0b0' : '#b0ffc0', 'center', { sw: 4 });
    }
    this.drawUlt2Rest();
  };
  // v1.7.1 玩家版 3 秒点火 HUD：大号 3-2-1 + 三格火力条（每秒点亮一格）
  G.drawQuickRocketHud = function (rk) {
    const C = WF.CFG, c = this.ctx, bx = C.SCREEN_W / 2 - 110, by = 92, sec = Math.max(1, Math.ceil(rk.left / rk.step));
    const el = rk.total - rk.left, pulse = (el % rk.step) < 6;
    c.fillStyle = PAL.grnD; c.fillRect(0, 0, C.SCREEN_W, 4); c.fillRect(0, 398, C.SCREEN_W, 4);
    c.fillStyle = PAL.ol; c.fillRect(bx, by, 220, 104); c.fillStyle = PAL.grnD; c.fillRect(bx + 4, by + 4, 212, 96); c.fillStyle = '#120c1c'; c.fillRect(bx + 10, by + 28, 200, 66);
    this.txt('点火！', C.SCREEN_W / 2, by + 16, 18, '#d0ffd8', 'center', { sw: 4 });
    this.pxDigits(String(sec), bx + 26, by + 36, pulse ? 11 : 10, pulse ? '#ffffff' : '#7dff9a', PAL.ol);
    for (let i = 0; i < 3; i++) {
      const on = i < rk.tier, x = bx + 98, y = by + 36 + (2 - i) * 18;
      c.fillStyle = PAL.ol; c.fillRect(x, y, 104, 14);
      c.fillStyle = on ? ['#ffd23c', '#ff8a2a', '#ff4a3a'][i] : '#2a2440'; c.fillRect(x + 2, y + 2, on && i === rk.tier - 1 ? Math.round(100 * Math.min(1, (el % rk.step + 1) / rk.step + (rk.tier === 3 ? 1 : 0))) : (on ? 100 : 0), 10);
      this.txt(['Ⅰ', 'Ⅱ', 'Ⅲ'][i], x + 52, y + 7, 11, on ? '#120c1c' : '#5d5878', 'center', { stroke: false, weight: 900 });
    }
    this.txt(`火力 ${['—', 'Ⅰ', 'Ⅱ', 'Ⅲ'][rk.tier]} 档 · ${sec} 秒后满火力起飞`, C.SCREEN_W / 2, by + 120, 16, '#b0ffc0', 'center', { sw: 4 });
  };
  G.drawUlt2Rest = function () {
    const C = WF.CFG;
    if (this.afuera) {
      // v1.7.1：放在道具栏下方（y≈142，人物头顶最高点在 y≈180 以下），不压 saw_strip 的身体动作；弹出时最多放大到 1.3 倍
      const a = this.afuera, k = a.t < 6 ? 1.3 - a.t * 0.05 : 1, sh = a.t < 12 ? (a.t % 2 ? 3 : -3) : 0;
      this.txt('¡AFUERA!', C.SCREEN_W / 2 + 60 + sh, 142, Math.round(50 * k), (a.t >> 2) % 2 ? '#ffd23c' : '#ff4a3a', 'center', { font: '"Noto Serif","Georgia",serif', sw: 8, stroke: '#3a0d0d' });
    }
    if (this.p && this.state !== 'title' && !(this.camp && (this.campModal() || this.state === 'result'))) for (const f of this.p) if (f && f.toughQ > 0) {
      const L = f.side === 0, x = L ? 84 + 352 : 524;
      this.txt(`破甲 · 韧性减半 ${Math.min(U2().SAW.TOUGH_Q, f.toughQ)}`, L ? x : x, 60 + 0, 14, '#ffb43c', L ? 'right' : 'left', { sw: 4 });
    }
    if (this.camp && this.camp.itemOff && !this.campModal() && this.state !== 'result' && !this.cine) {
      this.txt(`被锯掉 ${this.camp.itemOff.ids.length} 件 · 还剩 ${Math.max(1, this.camp.itemOff.q)} 题`, 84, 118, 13, '#ff9a6a', 'left', { sw: 3 });
    }
  };
})();
