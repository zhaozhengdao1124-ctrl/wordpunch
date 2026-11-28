// v1.10 马西克「星舰升空」发射按钮（用户定稿）：倒数 3-2-1 时屏幕上出一条时机条（指针从左往右扫）+ 一个大「发射」按钮。
//   绿区 = 完美发射 ×1.5；黄区 = 普通发射 ×1；绿区正中的金芯 = 超级发射 ×2（很窄，稀有）；按早 / 按晚 / 没按 = 发射失败 ×0.5。
//   电脑版按 Enter（双人对战：P1 按 空格 或 1–4，P2 按 Enter 或 7–0，各按各的，按对方的键无效）；手机点大按钮（或屏幕任意处，暂停键除外）。
//   刚出条的前 12%（约 0.25 秒）是「准备」段：这时按键不算（防止答题时连按带过来误触）。
//   保底：连续失败后下一次绿区 / 黄区变宽（1 次 ×1.35，2 次及以上 ×1.7），成功一次就清零；闯关里跨关卡记着，对战每局清零。金芯不变宽。
//   电脑当马西克（闯关 Boss / 电脑陪练）：先照旧出 5 道挡伤害的题，挡完后电脑按发射钮，按难度掷结果（期望伤害 ≈ 原来，简单偏低、困难偏高），画面同样出条和指针。
//   失败动画 = Codex U2：前景小火箭从发射口升起 → 抖两下 → 噗地冒黑烟（比火箭往马西克那边近 15px）→ 歪歪扭扭飞出去擦过对手（50% 伤害，命中闪红和火花由引擎出）→ 马西克原地黑脸、咳两声、抹脸回待机。
(function () {
  const G = WF.Game.prototype;
  const CF = WF.CFG;
  CF.ULT2.LAUNCH = {
    ARM: 0.12,          // 准备段（这段按了不算）
    GREEN: 0.10,        // 绿区总宽（占整条）
    YELLOW: 0.09,       // 黄区（绿区两侧各一段）
    SUPER: 0.024,       // 金芯总宽（≈50ms）
    ZMIN: 0.40, ZMAX: 0.94,   // 黄区整体落在这个范围里，每次随机
    MULT: { super: 2, perfect: 1.5, normal: 1, fail: 0.5 },
    PITY: [1, 1.35, 1.7],
    LINGER: 16,         // 按下后时机条停留几帧（看清按在哪）
    // 电脑：失败 / 普通 / 完美 / 超级 的概率（按难度）
    CPU: { easy: [0.35, 0.55, 0.10, 0], normal: [0.25, 0.55, 0.20, 0], hard: [0.20, 0.50, 0.28, 0.02], shura: [0.18, 0.50, 0.30, 0.02] },   // v1.10.1 修罗略降（原 0.15 / 0.50 / 0.32 / 0.03）
    CPU_SWEEP: 42,      // 电脑按发射时指针扫一遍的帧数
    FLIGHT: [[0, 17], [7, 24], [14, 31], [23, 40], [39, 56]],   // 失败火箭飞行关键帧（tick）：离开发射口 → 往上歪 → 顶点 → 擦过对手 → 飞出画面
  };
  const L = () => CF.ULT2.LAUNCH, U2 = () => CF.ULT2;
  const NAME = { super: '超级发射！', perfect: '完美发射！', normal: '发射成功', fail: '发射失败…' };
  const WHY = { early: '按早了', late: '按晚了', none: '没按' };
  const rnd = Math.random;

  // ---------- 保底 ----------
  const pityBox = g => g.camp ? (g.camp.launchPity = g.camp.launchPity || [0, 0]) : (g.launchPity = g.launchPity || [0, 0]);
  const baseStart = G.startMatch;
  G.launchClear = function () { this.launchFx = null; this.launchFlare = null; this.rocket = null; this.lnGoldT = 0; this._lnDefer = null; };
  // 失败动画的 4 条特效图第一次用到时才去加载 → 第一次失败时小火箭 / 烟可能晚几帧才出来；开局就预载（只有马西克在场时）
  const FAIL_FX = ['rocket_fail_pad', 'fail_smoke_puff', 'rocket_fail_fly', 'fail_trail'];
  G.launchPreload = function () { for (const f of this.p || []) { const F = f && f.data && f.data.fx; if (F && F.rocket_fail_fly) for (const k of FAIL_FX) if (F[k] && F[k].src) WF.FX.img(F[k].src); } };
  G.startMatch = function () { this.launchPity = [0, 0]; this.launchClear(); const r = baseStart.apply(this, arguments); this.launchPreload(); return r; };
  // 大招放到一半就「暂停 → 返回标题」：把火箭状态清掉（v1.9 起就会把半截 rocket 带进下一局闯关）
  const baseTitle = G.goTitle, baseCamp = G.startCampaign;
  G.goTitle = function () { const r = baseTitle.apply(this, arguments); this.launchClear(); if (this.ult2Reset) this.ult2Reset(); return r; };
  G.startCampaign = function () { this.launchClear(); return baseCamp.apply(this, arguments); };

  // ---------- 时机条 ----------
  G.launchMake = function (side, human, total) {
    this.launchPreload();
    const P = L(), pity = pityBox(this)[side] || 0, k = P.PITY[Math.min(P.PITY.length - 1, pity)];
    const g = P.GREEN * k, y = P.YELLOW * k, half = g / 2 + y;
    const lo = Math.max(P.ARM + 0.04, P.ZMIN) + half, hi = P.ZMAX - half;
    const c = lo + (hi - lo) * this.rand();
    const ln = { side, human, total, t: 0, c, g, y, s: P.SUPER, pity, k, res: null, after: 0 };
    if (!human) {   // 电脑：先掷结果，再算按在条上的哪个位置（画面上看得到指针停在哪）
      const pr = P.CPU[this.diffForLaunch()] || P.CPU.normal, r = this.rand();
      const kind = r < pr[0] ? 'fail' : r < pr[0] + pr[1] ? 'normal' : r < pr[0] + pr[1] + pr[2] ? 'perfect' : 'super';
      const u = this.rand(), sgn = this.rand() < 0.5 ? -1 : 1;
      let pos;
      if (kind === 'super') pos = c + sgn * u * ln.s * 0.4;
      else if (kind === 'perfect') pos = c + sgn * (ln.s / 2 + 0.002 + u * (g / 2 - ln.s / 2 - 0.004));
      else if (kind === 'normal') pos = c + sgn * (g / 2 + 0.003 + u * (y - 0.006));
      else pos = sgn < 0 ? c - half - 0.03 - u * Math.max(0.01, c - half - P.ARM - 0.05) : (u < 0.5 ? Math.min(0.985, c + half + 0.03 + u * 0.08) : null);   // 失败：按早 / 按晚 / 干脆没按
      ln.cpu = { kind, pos, t: pos == null ? null : Math.max(1, Math.round(pos * total)) };
    }
    return ln;
  };
  G.diffForLaunch = function () {
    try { return this.camp ? (this.diffCamp ? this.diffCamp() : 'normal') : (this.diffCpu ? this.diffCpu() : 'normal'); } catch (e) { return 'normal'; }
  };
  G.launchJudge = function (ln, pos) {
    if (pos == null) return { kind: 'fail', why: 'none', pos: null };
    const d = Math.abs(pos - ln.c);
    if (d <= ln.s / 2) return { kind: 'super', pos };
    if (d <= ln.g / 2) return { kind: 'perfect', pos };
    if (d <= ln.g / 2 + ln.y) return { kind: 'normal', pos };
    return { kind: 'fail', why: pos < ln.c ? 'early' : 'late', pos };
  };
  G.launchResolve = function (ln, pos, forced) {
    if (ln.res) return ln.res;
    const r = ln.res = forced ? Object.assign({ pos }, forced) : this.launchJudge(ln, pos);
    const box = pityBox(this);
    box[ln.side] = r.kind === 'fail' ? (box[ln.side] || 0) + 1 : 0;
    const hum = ln.human && (!this.humanSide || this.humanSide(ln.side));
    WF.Audio.play('launchClick');
    if (r.kind === 'fail') { if (hum) WF.Haptics.pulse('launchFail', [30, 40, 30], 1); }
    else if (hum) WF.Haptics.pulse('launch' + r.kind, r.kind === 'normal' ? 40 : [60, 30, 90], r.kind === 'normal' ? 2 : 3);
    this.say(`发射 P${ln.side + 1} ${r.kind}${r.why ? '(' + r.why + ')' : ''} 位置 ${r.pos == null ? '—' : r.pos.toFixed(3)} 绿区中心 ${ln.c.toFixed(3)} 保底档 ${ln.pity}${ln.human ? '' : ' 电脑'}`);
    return r;
  };
  // 当前指针位置（0–1）；按键时用两帧之间的小数部分补准一点
  G.launchPos = function (ln, frac) { return Math.min(1, (ln.t + (frac || 0)) / ln.total); };
  G.launchActive = function () { const rk = this.rocket, ln = rk && rk.ln; return !!(ln && !ln.res && ln.human && !this.paused && !this.ko); };
  G.launchPress = function (side, o) {
    const rk = this.rocket, ln = rk && rk.ln;
    if (!ln || ln.res || !ln.human || ln.side !== side || this.paused || this.ko) return false;
    let frac = 0;
    if (!(o && o.pos != null) && typeof performance !== 'undefined' && this._lnStamp) { const d = performance.now() - this._lnStamp; if (d >= 0 && d < 1000 / CF.FPS) frac = d / (1000 / CF.FPS); }
    const pos = o && o.pos != null ? o.pos : this.launchPos(ln, frac);
    if (pos < L().ARM) { ln.armTap = 8; return true; }   // 准备段：不算
    this.launchResolve(ln, pos); ln.btnT = 6; return true;
  };
  const baseUpd = G.update;
  G.update = function () { baseUpd.call(this); if (typeof performance !== 'undefined') this._lnStamp = performance.now(); this.launchTick(); };
  G.launchTick = function () {
    if (this.paused) return;
    const f = this.launchFx; if (f && !f.seq) { f.t++; if (f.t > 200) this.launchFx = null; }   // 失败动画进行中由 launchFailSeq 自己走表（每 tick +1），演完以后这里接着走到 200 再收
    const fl = this.launchFlare; if (fl && ++fl.t > fl.life) this.launchFlare = null;
    if (this.launchMsg && ++this.launchMsg.t > 60) this.launchMsg = null;
    if (this.lnGoldT > 0) this.lnGoldT--;
  };

  // ---------- 输入：键盘 / 鼠标 / 触屏 ----------
  const ONE = ['Enter', 'NumpadEnter', 'Space'];
  G.launchKeySide = function (code) {
    if (this.camp || this.menu.cpu) return ONE.includes(code) ? 0 : -1;
    if (code === 'Space' || code in CF.KEYS_P1) return 0;
    if (code === 'Enter' || code === 'NumpadEnter' || code in CF.KEYS_P2) return 1;
    return -1;
  };
  G.launchKey = function (code) {
    const rk = this.rocket, ln = rk && rk.ln; if (!ln || ln.res || this.paused || this.ko) return false;
    const s = this.launchKeySide(code); if (s < 0) return false;
    if (ln.human && s === ln.side) this.launchPress(s);
    return true;   // 倒数时这些键只管发射，不做别的
  };
  G.launchKeyLabel = function (side) { return (this.camp || this.menu.cpu) ? 'Enter' : side === 0 ? '空格' : 'Enter'; };
  const baseInput = G.input;
  G.input = function (code) { if (this.launchKey(code)) return true; return baseInput.apply(this, arguments); };
  if (G.campKey) { const baseCK = G.campKey; G.campKey = function (code) { if (this.launchKey(code)) return true; return baseCK.apply(this, arguments); }; }
  const baseTouch = WF.touchHit;
  WF.touchHit = function (g, x, y) {
    if (g.state !== 'title' && g.launchActive && g.launchActive()) {
      const tr = WF.pickRect ? WF.pickRect(g.touchRects || [], x, y) : null, cr = g.camp ? (WF.pickRect ? WF.pickRect(g.campRects || [], x, y) : null) : null;
      if (!(tr && /pause|resume|quit/.test(tr.key)) && !(cr && cr.key === 'pause')) {
        const ln = g.rocket.ln, b = g._lnBtn;
        // 手机：屏幕任意处都算按发射（暂停键除外）；电脑鼠标：点发射按钮才算
        if (WF.touch || (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) { g.launchPress(ln.side); return true; }
      }
    }
    return baseTouch ? baseTouch(g, x, y) : false;
  };

  // ---------- 主流程（改写 v1.7 的 rocketUltSeq；Boss 版的 5 道挡伤害题照旧） ----------
  G.rocketUltSeq = function* (A, D) {
    const C = WF.CFG, R = U2().ROCKET, P = L();
    A.paused = false; D.paused = false; A.loop = false;
    let w0 = 0; yield () => { w0++; return (!A.tween && (!D.tween || D.settled)) || w0 > 30; };
    const bossVer = A.side === 1 && (this.camp || this.menu.cpu);
    const side = bossVer ? D.side : A.side, human = side === 0 || !this.menu.cpu;
    WF.Audio.play('superflash'); WF.Haptics.ultStart();
    this.darkenTarget = 0.7; this.banner = { text: A.mv.ultName, side: A.side, t: 0 }; D.paused = true;
    const RP = U2().ROCKET_PLAYER || {}, quick = !bossVer && RP.SECONDS;
    let clicked = false;
    const hasRemote = A.has('remote_press');
    if (hasRemote) A.play('remote_press', { hold: true, onEvent: (e) => { if (e === 'active') clicked = true; } });
    else if (A.has('mega_charge_a')) A.play('mega_charge_a', { to: 7, hold: true });
    for (let i = 0; !clicked && i < (hasRemote ? 40 : quick ? RP.CHARGE : 24); i++) { A.flash = (i < 6 && i % 6 < 2) ? 1 : 0; A.flashSeq = ['white']; yield 1; }
    A.flash = 0; D.paused = false;
    this.popWorld(quick ? '咔哒 · 点火！' : '咔哒 · 发射！', A.worldX(), C.GROUND_Y - 46, bossVer ? '#ff6a6a' : '#7dff9a', 22);
    WF.Audio.play('beep', { f: 1200, d: 0.08 }); WF.Audio.play('boom');
    const secs = quick ? RP.SECONDS : R.SECONDS, step = quick ? Math.round((RP.STEP || 1) * C.FPS) : C.FPS;
    const rk = this.rocket = { mode: bossVer ? 'boss' : 'player', quick: !!quick, t: 0, step, left: secs * step, total: secs * step, n: 0, correct: 0, tier: 0, side, A, D };
    this.darkenTarget = 0.35; this.banner = null;
    let res = null;
    if (quick) {
      const ln = rk.ln = this.launchMake(A.side, human, rk.total);
      this.say(`星舰升空（玩家版）：倒数 ${secs}-…-1 共 ${(rk.total / C.FPS).toFixed(1)} 秒，P${A.side + 1} ${human ? '按 ' + this.launchKeyLabel(A.side) + ' 发射' : '电脑'}；绿区 ${(ln.g * 100).toFixed(0)}% 黄区 2×${(ln.y * 100).toFixed(0)}%（保底档 ${ln.pity}）`);
      rk.tier = 1;
      while (!ln.res) {
        ln.t++; rk.left = Math.max(0, rk.total - ln.t);
        const tier = Math.min(3, 1 + Math.floor(ln.t / rk.step));
        if (tier !== rk.tier) rk.tier = tier;
        if (ln.t % rk.step === 0 && rk.left > 0) WF.Audio.play('beep', { f: 660 + tier * 120, d: 0.05 });
        if (ln.armTap) ln.armTap--;
        if (!human && ln.cpu.t != null && ln.t >= ln.cpu.t) this.launchResolve(ln, ln.cpu.pos, { kind: ln.cpu.kind, why: ln.cpu.kind === 'fail' ? 'early' : undefined });
        if (!ln.res && ln.t >= ln.total) this.launchResolve(ln, null);
        yield 1;
      }
      res = ln.res;
      if (WF.Ach && side === 0) WF.Ach.ev(this, 'rocketP', 1);
    } else {
      this.say(`星舰升空（${bossVer ? 'Boss 版' : '玩家版'}）：${R.SECONDS} 秒内 ${R.QUESTIONS} 道简单题，P${side + 1} 作答`);
      while (rk.left > 0 && rk.n < R.QUESTIONS) {
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
    }
    const c = rk.correct, all = !quick && c >= R.QUESTIONS;
    // Boss 版：挡题结束后电脑按发射钮（5/5 全挡 = 遥控失灵，不用按）
    if (bossVer && !all) {
      const ln = rk.ln = this.launchMake(A.side, false, P.CPU_SWEEP); rk.cpuStage = true;
      while (!ln.res) {
        ln.t++;
        if (ln.cpu.t != null && ln.t >= ln.cpu.t) this.launchResolve(ln, ln.cpu.pos, { kind: ln.cpu.kind, why: ln.cpu.kind === 'fail' ? (ln.cpu.pos < ln.c ? 'early' : 'late') : undefined });
        if (!ln.res && ln.t >= ln.total) this.launchResolve(ln, null, { kind: 'fail', why: 'none' });
        yield 1;
      }
      res = ln.res;
    }
    const kind = res ? res.kind : 'normal', mult = P.MULT[kind] || 1;
    this.launchMsg = res ? { kind, why: res.why, t: 0, side: A.side, cpu: !(rk.ln && rk.ln.human) } : null;
    const base = bossVer ? Math.round(R.BASE * (D.maxHp || C.HP) * Math.max(0, 1 - R.BLOCK * c))
      : Math.round(this.ultDmg(A) * this.comboMult(A.side) * (quick ? 1 : Math.max(0.2, c / R.QUESTIONS)));
    const dmg = Math.round(base * mult);
    this.say(quick ? `星舰升空 ${NAME[kind]} ×${mult} 伤害 ${dmg}` : `星舰升空 答对 ${c}/${R.QUESTIONS}${res ? ' · 电脑' + NAME[kind] + ' ×' + mult : ''} 伤害 ${all ? '反噬' : dmg}`);
    // 时机条停一会儿再收
    const hold = () => { if (rk.ln) rk.ln.after++; };
    if (kind === 'fail') {
      rk.fail = { t: 0 };
      yield* this.launchFailSeq(A, D, dmg, rk, hold);
    } else {
      rk.done = !rk.ln; 
      // 起飞：mega_charge_a 8-9 点火 → mega_charge_b 0-1 冲天 → 2-4 俯冲 → 5 砸地
      this.darkenTarget = 0.55; this.rumble = C.SHAKE.ultRumble;
      if (kind === 'perfect' || kind === 'super') {
        const big = kind === 'super';
        WF.Audio.play(big ? 'launchSuper' : 'launchPerfect'); this.launchFlare = { x: A.worldX(), y: C.GROUND_Y - 18, t: 0, life: big ? 22 : 16, big };
        this.lnGoldT = big ? 8 : 5; this.shakeAdd(big ? C.SHAKE.ultFinal : C.SHAKE.heavy);
        WF.FX.ring(A.worldX(), C.GROUND_Y - 18, '#ffdc86', big ? 40 : 28, big ? 18 : 14); if (big) WF.FX.ring(A.worldX(), C.GROUND_Y - 18, '#fff3da', 24, 12);
        if (big) WF.Haptics.ultFinal();
      } else WF.Audio.play('launchGo');
      let done = false;
      A.play('mega_charge_a', { from: 8, hold: true, onEnd: () => { done = true; } }); yield () => { hold(); return done; };
      A.play('mega_charge_b', { to: 1, hold: true });
      { const n = quick ? RP.RISE : 14; for (let i = 0; i < n; i++) { A.y = (i + 1) * (126 / n); hold(); if (kind !== 'normal' && i % 2 === 0) WF.FX.spark(A.worldX(), C.GROUND_Y - A.y + 4, A.dir, 'ultFinal', kind === 'super' ? 0.9 : 0.6); yield 1; } }
      rk.done = true;
      A.alpha = 0; A.y = 130;
      if (bossVer && all) {   // 5/5：遥控器失灵，火箭掉回他自己头上（v1.7 原样）
        this.popWorld('遥控失灵！', A.worldX(), C.GROUND_Y - 50, '#7dff9a', 26);
        rk.fall = { x: A.worldX(), y: -10 };
        for (let i = 0; i < 18; i++) { yield 1; }
        A.alpha = 1; A.y = 0; A.play('mega_charge_b', { from: 7, to: 7, hold: true });
        for (let i = 0; i < 12; i++) { rk.fall.y = -10 + (i + 1) * ((C.GROUND_Y - 30 + 10) / 12); yield 1; }
        rk.fall = null;
        const fx = A.data.fx && A.data.fx.rocket_blast; if (fx) WF.FX.sprite(fx, A.worldX(), C.GROUND_Y - 1, 1);
        const bd = Math.round(R.BACKFIRE * (D.maxHp || C.HP));
        this.screenFlash = 5; this.shakeAdd(C.SHAKE.ultFinal);
        this.contact(D, A, D.frame(), { dmg: bd, lvl: 'ultFinal' });
        WF.FX.spark(A.worldX(), C.GROUND_Y - 20, -D.dir, 'ultFinal', 1.6);
        this.combo[D.side] = { n: 1, t: 0, label: '火箭反噬！' };
      } else {
        for (let i = 0, n = quick ? RP.HOVER : 10; i < n; i++) yield 1;
        A.alpha = 1;
        A.play('mega_charge_b', { from: 2, to: 4, hold: true });
        { const n = quick ? RP.DIVE : 9; for (let i = 0; i < n; i++) { A.y = 130 - (i + 1) * (130 / n); yield 1; } }
        A.y = 0;
        let land = false, ended = false;
        A.play('mega_charge_b', { from: 5, onEvent: (e, fi, f) => { if (e === 'hit' && fi === 5 && !land) { land = true; if (dmg > 0) this.contact(A, D, f, { dmg, lvl: 'ultFinal' }); else { this.popWorld('全部挡住！', D.worldX(), C.GROUND_Y - 46, '#7dff9a', 26); WF.FX.spark(D.worldX(), C.GROUND_Y - 20, A.dir, 'block', 1.4); } this.shakeAdd(C.SHAKE.ultFinal); this.screenFlash = 4; if (kind === 'super') { this.shakeAdd(C.SHAKE.ultFinal); WF.Audio.play('boom'); this.lnGoldT = 3; WF.FX.ring(D.worldX(), C.GROUND_Y - 20, '#ffdc86', 36, 16); } else if (kind === 'perfect') WF.FX.ring(D.worldX(), C.GROUND_Y - 20, '#ffdc86', 28, 14); } }, onEnd: () => { ended = true; } });
        if (!bossVer || res) this.combo[A.side] = { n: 1, t: 0, label: kind === 'super' ? '超级发射 ×2' : kind === 'perfect' ? '完美发射 ×1.5' : '发射成功 ×1', gold: kind !== 'normal' };
        yield () => ended || this.ko;
      }
    }
    this.rumble = 0; this.darkenTarget = 0; this.banner = null; A.y = 0; A.alpha = 1;
    this.rocket = null; D.paused = false; A.paused = false; this.launchFx = null;
    if (this.ko) { yield* this.koSeq(); return; }
    let after = 0; yield () => { after++; return (A.settled && D.settled) || after > 90; };
    if (!A.settled && A.anim !== 'idle') A.play('idle');
    if (!D.settled && D.anim !== 'idle') D.play('idle');
  };

  // ---------- 失败：小火箭歪着飞出去擦过对手，马西克原地被熏黑 ----------
  // 时间线（tick，从 launch_fail 第 0 帧算）：0–16 发射口上的火箭点火 / 抖 / 噗；14 黑烟团；17 起爆离开发射口，每 3 tick 丢一团尾迹；约 40 擦过对手（50% 伤害）；39、45 咳嗽冒烟。
  G.launchFailPath = function (f, t) {
    const K = L().FLIGHT, C = WF.CFG, pts = f.pts;
    if (t <= K[0][1]) return { x: pts[0][0], y: pts[0][1] };
    let i = 0; while (i < K.length - 2 && t > K[i + 1][1]) i++;
    const t0 = K[i][1], t1 = K[i + 1][1], u = Math.max(0, Math.min(1.2, (t - t0) / (t1 - t0)));
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cr = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u);
    let x = cr(p0[0], p1[0], p2[0], p3[0]), y = cr(p0[1], p1[1], p2[1], p3[1]);
    if (t < K[2][1] + 4) { const w = Math.sin((t - K[0][1]) * 0.75) * 3.2; x += w * 0.6; y += w * 0.4 * f.dir; }   // 歪歪扭扭：上升段晃两下
    return { x, y };
  };
  G.launchFailSeq = function* (A, D, dmg, rk, hold) {
    const C = WF.CFG, F = A.data.fx || {}, dir = A.dir, GY = C.GROUND_Y;
    // 两人贴得太近（必杀前刚打过一套）：对手先往后退一步，给发射口和弧线留地方；退不动（贴墙）就把发射口往回收
    const want = 62, gap0 = (D.worldX() - A.worldX()) * dir;
    if (gap0 < want && !D.fly) { D.moveTo(D.x + dir * (want - gap0), 8, 'out', true); }
    let padX = Math.round(A.worldX() + 30 * dir);
    const f = this.launchFx = { t: -8, padX, dir, A, D, rocket: null, rise: 0, grazed: false, pts: null, seq: true };
    // 关键点（火箭中心）：发射口顶端 → 往上歪 → 顶点 → 擦过对手胸口 → 冲出画面
    for (let i = 0; i < 1; i++) yield 1;
    const gap1 = (D.tween ? (D.tween.kind === 'ox' ? D.x + D.tween.x1 : D.tween.x1) : D.worldX()) - A.worldX();
    if (gap1 * dir < 44) padX = f.padX = Math.round(A.worldX() + dir * Math.max(16, Math.round(gap1 * dir * 0.5)));
    const dx = (A.worldX() + gap1) - padX, Dx = A.worldX() + gap1;
    const far = dir > 0 ? Math.max(Dx + 120, this.cam + C.VIEW_W / 2 + 30) : Math.min(Dx - 120, this.cam - C.VIEW_W / 2 - 30);
    f.pts = [[padX, GY - 24], [padX + dir * 6 + dx * 0.15, GY - 46], [padX + dx * 0.5, GY - 60], [Dx - dir * 4, GY - 26], [far, GY - 44]];
    WF.Audio.play('launchFizzle');
    // 发射口打开，火箭升上来（8 tick）
    WF.FX.dust(padX, GY, dir, 3); WF.Audio.play('thud');
    for (let i = 0; i < 8; i++) { f.t++; f.rise = (i + 1) / 8; hold(); yield 1; }
    f.t = 0; f.rise = 1;
    this.darkenTarget = 0.2; this.rumble = 0;
    let ended = false;
    A.play('launch_fail', { next: 'idle', onEnd: () => { ended = true; }, onEvent: (e, fi, fr) => {
      if (e === 'smoke') {
        const s = F.fail_smoke_puff; if (s) WF.FX.sprite(s, A.worldX() + 15 * dir, GY, dir);
        this.shakeAdd(C.SHAKE.heavy || 4); WF.Audio.play('boom');
      }
      if (e === 'cough') {
        const m = fr.mo || [38, 29], tr = F.fail_trail, ft = A.data.foot || [32, 54];
        if (tr) WF.FX.sprite(tr, A.worldX() + (m[0] - ft[0] + 4) * dir, GY - (ft[1] - m[1]) - 1, 1);
        WF.Audio.play('cough');
      }
    } });
    for (let i = 0; i < 90 && !(ended && f.t > 62); i++) {
      hold();
      const t = f.t;
      if (t >= L().FLIGHT[0][1]) {
        const p = this.launchFailPath(f, t), q = this.launchFailPath(f, t + 1);
        f.rocket = { x: p.x, y: p.y, vx: q.x - p.x, vy: q.y - p.y };
        if ((t - L().FLIGHT[0][1]) % 3 === 0 && F.fail_trail) { const v = Math.hypot(f.rocket.vx, f.rocket.vy) || 1; WF.FX.sprite(F.fail_trail, p.x - f.rocket.vx / v * 9, p.y - f.rocket.vy / v * 9, 1); }
        if (!f.grazed && t >= L().FLIGHT[3][1]) {
          f.grazed = true;
          const ft = A.data.foot || [32, 54], X = Math.round(A.worldX());
          const fake = { fo: ft, hit: [0, ft[1] - (GY - p.y), ft[0] + (p.x - X) * dir + 2] };
          if (dmg > 0) { this.contact(A, D, fake, { dmg, lvl: 'heavy' }); D.flash = 4; D.flashSeq = ['red', 'red', 'white', 'white']; }
          WF.FX.spark(p.x, p.y, dir, 'hit', 1.2); WF.Audio.play('whoosh');
          this.popWorld('擦过！', D.worldX(), GY - 50, '#e0dcef', 22);
          this.combo[A.side] = { n: 1, t: 0, label: '发射失败 ×0.5' };
          if (this.ko) break;
        }
        if (Math.abs(p.x - this.cam) > C.VIEW_W / 2 + 24 && t > L().FLIGHT[3][1]) f.rocket = null, f.gone = true;
      }
      f.t++;
      rk.done = rk.ln ? rk.ln.after > L().LINGER : true;
      yield 1;
    }
    f.seq = false; rk.done = true;
  };

  // ---------- 画：世界层（发射口火箭、飞行火箭、完美闪光、背景火箭熄火） ----------
  const baseFront = G.drawWorldFront;
  G.drawWorldFront = function (w, li) {
    baseFront.apply(this, arguments);
    const f = this.launchFx;
    if (f) {
      const F = f.A.data.fx || {}, im = k => WF.FX.img(F[k].src);
      const pad = F.rocket_fail_pad;
      if (pad && f.t < 17) {
        const I = im('rocket_fail_pad'); let fi = 0;
        if (f.t >= 0 && pad.ts) { let acc = 0; for (fi = 0; fi < pad.n - 1; fi++) { acc += pad.ts[fi]; if (f.t < acc) break; } }
        const X = Math.round(f.padX - li), Y = WF.CFG.GROUND_Y + Math.round((1 - f.rise) * 44);
        if (I.complete && I.naturalWidth) {
          w.save(); w.beginPath(); w.rect(0, 0, w.canvas.width / (WF.CFG.WORLD_SCALE || 1), WF.CFG.GROUND_Y + 1); w.clip();
          if (f.dir > 0) w.drawImage(I, fi * pad.w, 0, pad.w, pad.h, X - pad.o[0], Y - pad.o[1], pad.w, pad.h);
          else { w.translate(X, 0); w.scale(-1, 1); w.drawImage(I, fi * pad.w, 0, pad.w, pad.h, -pad.o[0], Y - pad.o[1], pad.w, pad.h); }
          w.restore();
        }
        if (f.rise < 1) { w.fillStyle = '#25202e'; w.fillRect(X - 9, WF.CFG.GROUND_Y - 1, 18, 2); }   // 发射口盖板
      }
      const r = f.rocket, fly = F.rocket_fail_fly;
      if (r && fly) {
        const I = im('rocket_fail_fly');
        if (I.complete && I.naturalWidth) {
          const ang = (Math.atan2(r.vx, -r.vy) * 180 / Math.PI + 360) % 360, di = Math.round(ang / 45) % 8;
          const fi = di + (((f.t >> 1) & 1) ? (fly.stride || 8) : 0);
          w.drawImage(I, fi * fly.w, 0, fly.w, fly.h, Math.round(r.x - li) - fly.o[0], Math.round(r.y) - fly.o[1], fly.w, fly.h);
        }
      }
    }
    const fl = this.launchFlare;
    if (fl) {   // 完美 / 超级发射：金色星芒（代码画的实心像素，素材没交可选的 rocket_perfect_flare）
      const k = fl.t / fl.life, n = fl.big ? 12 : 8, len = (fl.big ? 34 : 24) * Math.sin(Math.min(1, k * 1.8) * Math.PI / 2) * (1 - k * 0.5), X = fl.x - li, Y = fl.y - (this.rocket && this.rocket.A ? this.rocket.A.y * 0.4 : 0);
      const cols = ['#fff3da', '#ffdc86', '#ffae4b'];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + fl.t * 0.06, L2 = len * (i % 2 ? 0.6 : 1);
        for (let s = 2; s < L2; s += 1) { w.fillStyle = cols[Math.min(2, Math.floor(s / L2 * 3))]; w.fillRect(Math.round(X + Math.cos(a) * s), Math.round(Y + Math.sin(a) * s * 0.8), s < L2 * 0.4 ? 2 : 1, 1); }
      }
      if (fl.t < 6) { w.fillStyle = '#fff3da'; w.fillRect(Math.round(X) - 3, Math.round(Y) - 3, 7, 7); }
    }
  };
  // 背景火箭：失败时尾焰熄掉，只剩一缕缕黑烟
  const baseBG = G.drawRocketBG;
  G.drawRocketBG = function (ctx, ox, own) {
    const rk = this.rocket; if (!rk || !rk.fail) return baseBG.apply(this, arguments);
    const t = this.launchFx ? this.launchFx.t + 8 : 99, baseX = own ? 150 - ox : 146 - ox, baseY = own ? 62 : 60;
    if (own || !(this.camp && this.camp.city.stage === 'rocketbase')) {
      const x = baseX - 3, y = baseY - 30;
      ctx.fillStyle = '#25202e'; ctx.fillRect(x - 1, y + 2, 9, 30); ctx.fillRect(x + 1, y, 5, 3);
      ctx.fillStyle = '#5a5468'; ctx.fillRect(x, y + 3, 7, 27); ctx.fillStyle = '#3a3548'; ctx.fillRect(x + 5, y + 3, 2, 27); ctx.fillRect(x + 2, y + 1, 3, 2);   // 熄火的大火箭压暗（熏黑色），前面飞的小火箭才看得清
      ctx.fillStyle = '#25202e'; ctx.fillRect(x - 3, y + 24, 3, 7); ctx.fillRect(x + 7, y + 24, 3, 7);
    }
    if (t < 14 && (t >> 1) % 2 === 0) { ctx.fillStyle = '#ffae4b'; ctx.fillRect(baseX - 1, baseY, 3, 3 + (t % 3)); }
    for (let i = 0; i < 4; i++) {
      const k = ((t + i * 9) % 36) / 36, s = 2 + Math.round(k * 4), x = baseX - 2 + Math.round(Math.sin(t * 0.1 + i) * 3), y = baseY + 2 - Math.round(k * 26);
      ctx.fillStyle = '#25202e'; ctx.fillRect(x - 1, y - 1, s + 2, s + 2); ctx.fillStyle = i % 2 ? '#3a3548' : '#5a5468'; ctx.fillRect(x, y, s, s);
    }
  };

  // ---------- 画：HUD（时机条 + 发射按钮 + 结果字） ----------
  const baseHud = G.drawUlt2Hud;
  G.drawUlt2Hud = function () {
    const rk = this.rocket; this._lnShown = false;
    if (rk && rk.ln) {   // 有时机条以后不再画 v1.7 的倒计时面板
      if (!rk.ln.res || rk.ln.after <= L().LINGER) {
        this._lnShown = true;
        const C = WF.CFG, c = this.ctx, boss = !rk.ln.human;
        c.fillStyle = boss ? '#7a1418' : '#1a6a34'; c.fillRect(0, 0, C.SCREEN_W, 4); c.fillRect(0, 398, C.SCREEN_W, 4);
        if (this.camp) this._lnDefer = rk; else this.drawLaunchHud(rk);   // 闯关：等道具栏画完再画，盖在道具栏上面（不然标题被图标挡住）
      }
      this.drawUlt2Rest();
    } else baseHud.apply(this, arguments);
    if (this.lnGoldT > 0) { const c = this.ctx; c.fillStyle = `rgba(255,214,120,${0.09 * this.lnGoldT})`; c.fillRect(0, 0, WF.CFG.SCREEN_W, WF.CFG.SCREEN_H); }
  };
  const baseCampOv = G.drawCampOverlay;
  G.drawCampOverlay = function () {
    const r = baseCampOv.apply(this, arguments), rk = this._lnDefer; this._lnDefer = null;
    if (rk && rk === this.rocket && rk.ln) this.drawLaunchHud(rk);
    return r;
  };
  // 时机条期间不画底部题目面板（上一题已经答完；手机上这块给大按钮用）
  const basePanel = G.drawPanel;
  G.drawPanel = function () { const rk = this.rocket; if (rk && rk.ln && (rk.quick || rk.cpuStage)) return; return basePanel.apply(this, arguments); };
  // ---------- v1.10.2 像素 UI：发射按钮 + 面板边框 ----------
  // 素材 assets/launch_ui.png（src/gen_launch_ui.py 生成）：圆顶按钮 6 态 / 金属底座 / 光晕 / 键帽 / 小火箭。坐标表和脚本打印的一致。
  const UI = {
    src: 'assets/launch_ui.png',
    dome: { idle: [0, 0], idleB: [36, 0], hot: [72, 0], flash: [108, 0], down: [144, 0], spent: [180, 0] }, DW: 36, DH: 30, DX: 8, DY: 6,
    base: [0, 30, 52, 45], halo: [52, 30, 62, 55], rocket: [130, 30, 7, 11],
    key: { enter: { up: [0, 85, 31, 12], dn: [32, 85, 31, 12] }, space: { up: [64, 85, 31, 12], dn: [96, 85, 31, 12] }, tap: { up: [128, 85, 21, 12], dn: [150, 85, 21, 12] } },
    BW: 52, BH: 45, KEYY: 36,   // 键帽挂在底座下沿（顶边在底座第 36 行）
  };
  if (WF.FX && WF.FX.img) WF.FX.img(UI.src);   // 一加载就预取
  const uiImg = () => { const im = WF.FX.img(UI.src); return im.complete && im.naturalWidth ? im : null; };
  const spr = (c, im, r, x, y, S, a) => { if (a != null) c.globalAlpha = a; c.drawImage(im, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2] * S, r[3] * S); if (a != null) c.globalAlpha = 1; };
  G.launchLayout = function () {
    const touch = !!WF.touch, W = WF.CFG.SCREEN_W, H = WF.CFG.SCREEN_H;
    const p = touch ? { x: 150, y: 62, w: 660, h: 132 } : { x: 190, y: 62, w: 580, h: 132 };
    const rk = this.rocket, boss = !!(rk && rk.ln && !rk.ln.human);   // 电脑发射没有按钮：条拉满整块面板
    const bar = touch || boss ? { x: p.x + 112, y: p.y + 50, w: p.w - 136, h: touch ? 36 : 34 } : { x: p.x + 104, y: p.y + 50, w: 336, h: 34 };
    // 按钮（含挂在下沿的键帽）：桌面 2 倍像素 = 104×96；手机 3 倍 = 156×144（≈108 CSS，够大又不是一整块）
    const S = touch ? 3 : 2, bw = UI.BW * S, bh = (UI.KEYY + 12) * S;
    const btn = touch ? { x: W - bw - 30, y: H - bh - 16, w: bw, h: bh, S } : { x: p.x + p.w - 14 - bw, y: p.y + Math.round((p.h - bh) / 2), w: bw, h: bh, S };
    return { p, bar, btn, touch };
  };
  // 面板边框（缓存成一张离屏图，不用每帧重画）：黑描边 + 斜角、顶部黄黑警示条、钢板边、铆钉、凹进去的深色内框
  const frameCache = {};
  G.launchFrame = function (p, boss, u, bay) {   // bay = 桌面玩家版：右侧留给按钮的宽度（深色内框到按钮前面就停）
    const key = [p.w, p.h, boss, u, bay || 0].join('|'); if (frameCache[key]) return frameCache[key];
    const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h; const c = cv.getContext('2d');
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); };
    const Wc = Math.floor(p.w / u), Hc = Math.floor(p.h / u);
    const pal = boss ? { f: '#7a1418', hi: '#a82a30', lo: '#560e12' } : { f: '#1a6a34', hi: '#2c9250', lo: '#124e26' };
    const K = '#25202e';
    R(0, 0, Wc, Hc, K);                                   // 外轮廓
    for (const [x, y] of [[0, 0], [Wc - 1, 0], [0, Hc - 1], [Wc - 1, Hc - 1], [1, 0], [Wc - 2, 0], [1, Hc - 1], [Wc - 2, Hc - 1], [0, 1], [Wc - 1, 1], [0, Hc - 2], [Wc - 1, Hc - 2]]) c.clearRect(x * u, y * u, u, u);   // 斜切角
    R(1, 1, Wc - 2, Hc - 2, '#5a5468');                   // 钢板边
    R(1, 1, Wc - 2, 1, '#8a8498'); R(1, 1, 1, Hc - 2, '#8a8498'); R(1, Hc - 2, Wc - 2, 1, '#3a3548'); R(Wc - 2, 1, 1, Hc - 2, '#3a3548');
    c.clearRect(0, 0, u, u); c.clearRect((Wc - 1) * u, 0, u, u); c.clearRect(0, (Hc - 1) * u, u, u); c.clearRect((Wc - 1) * u, (Hc - 1) * u, u, u);
    // 顶部警示条（黄黑斜纹，两端留出铆钉位）
    const hz0 = 5, hz1 = Wc - 5;
    for (let y = 2; y <= 3; y++) for (let x = hz0; x < hz1; x++) R(x, y, 1, 1, ((x + y) >> 1) % 2 ? '#2a2230' : '#ffd23c');
    R(hz0 - 1, 2, 1, 2, K); R(hz1, 2, 1, 2, K); R(hz0, 1, hz1 - hz0, 1, K); R(hz0, 4, hz1 - hz0, 1, K);
    // 彩色底板（人 = 绿 / 电脑 = 红）+ 上亮下暗
    const ix = 3, iy = 5, iw = Wc - 6, ih = Hc - iy - 3;
    R(ix, iy, iw, ih, pal.f); R(ix, iy, iw, 1, pal.hi); R(ix, iy + ih - 1, iw, 1, pal.lo); R(ix, iy, 1, ih, pal.hi); R(ix + iw - 1, iy, 1, ih, pal.lo);
    R(ix - 1, iy - 1, iw + 2, 1, K); R(ix - 1, iy + ih, iw + 2, 1, K); R(ix - 1, iy, 1, ih, K); R(ix + iw, iy, 1, ih, K);
    // 凹进去的深色内框（放时机条 / 数字）
    const wx = Math.ceil(10 / u), wy = Math.ceil(32 / u), ww = Wc - 2 * wx - Math.ceil((bay || 0) / u), wh = Hc - wy - Math.ceil(10 / u);
    R(wx - 1, wy - 1, ww + 2, wh + 2, K); R(wx, wy, ww, wh, '#120c1c'); R(wx, wy, ww, 1, '#06030c'); R(wx, wy + wh - 1, ww, 1, pal.hi); R(wx + ww - 1, wy, 1, wh, pal.hi * 0 || pal.lo);
    // 铆钉
    for (const [x, y] of [[2, 2], [Wc - 3, 2], [2, Hc - 3], [Wc - 3, Hc - 3]]) { R(x, y, 1, 1, '#e8e0f4'); }
    return (frameCache[key] = cv);
  };
  // 像素箭头（指针头）：dir = 1 朝下 / -1 朝上
  const arrow = (c, cx, y, dir, fill, K) => {
    for (let r = 0; r < 6; r++) { const hw = 6 - r, yy = dir > 0 ? y + r * 2 : y - r * 2 - 2; c.fillStyle = K; c.fillRect(cx - hw - 2, yy, (hw + 2) * 2, 2); }
    for (let r = 0; r < 5; r++) { const hw = 5 - r, yy = dir > 0 ? y + 2 + r * 2 : y - r * 2 - 4; c.fillStyle = fill; c.fillRect(cx - hw, yy, hw * 2, 2); }
  };
  G.drawLaunchBtn = function (ln, b) {
    const c = this.ctx, im = uiImg(), S = b.S;
    if (!im) { c.fillStyle = '#25202e'; c.fillRect(b.x, b.y, b.w, b.h - 12 * S); c.fillStyle = '#d8282e'; c.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 12 * S - 8); this.txt('发射', b.x + b.w / 2, b.y + b.h / 2 - 10, 30, '#ffffff', 'center', { sw: 6, stroke: '#3a0d0d' }); return; }
    const P = L(), tt = ln.t / ln.total, t = ln.t | 0;
    const inY = !ln.res && tt >= ln.c - ln.g / 2 - ln.y && tt <= ln.c + ln.g / 2 + ln.y, inG = inY && tt >= ln.c - ln.g / 2 && tt <= ln.c + ln.g / 2;
    const bt = ln.btnT || 0;
    if (bt > 0 && !this.paused) ln.btnT--;
    let st, halo;
    if (bt > 3) { st = 'flash'; halo = 0.9; }
    else if (bt > 0 || (ln.res && ln.after < 10)) { st = 'down'; halo = 0; }
    else if (ln.res) { st = 'spent'; halo = 0; }
    else if (inG) { st = 'hot'; halo = 0.78 + 0.22 * Math.sin(t * 0.62); }      // 绿区：亮、快闪
    else if (inY) { st = 'hot'; halo = 0.5 + 0.2 * Math.sin(t * 0.36); }                                // 黄区：亮、中速
    else { st = (t % 40) < 12 ? 'idleB' : 'idle'; halo = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.16)); } // 待机：呼吸
    c.save(); c.imageSmoothingEnabled = false;
    if (halo > 0.01) spr(c, im, UI.halo, b.x - 5 * S, b.y - 5 * S, S, Math.max(0, Math.min(1, halo)));
    spr(c, im, UI.base, b.x, b.y, S);
    spr(c, im, [UI.dome[st][0], UI.dome[st][1], UI.DW, UI.DH], b.x + UI.DX * S, b.y + UI.DY * S, S);
    if (inG && (t >> 1) % 3 !== 0) {   // 绿区：圆顶左上角闪一颗小星
      const sx = b.x + (UI.DX + 8) * S, sy = b.y + (UI.DY + 4) * S; c.fillStyle = '#fff8d0';
      c.fillRect(sx, sy, S, S); c.fillRect(sx - 2 * S, sy, S, S); c.fillRect(sx + 2 * S, sy, S, S); c.fillRect(sx, sy - 2 * S, S, S); c.fillRect(sx, sy + 2 * S, S, S);
      c.fillStyle = 'rgba(255,248,208,0.55)'; c.fillRect(sx - S, sy, S, S); c.fillRect(sx + S, sy, S, S); c.fillRect(sx, sy - S, S, S); c.fillRect(sx, sy + S, S, S);
    }
    const kind = this._lnKeyKind || 'tap', down = st === 'down' || st === 'flash' || st === 'spent';
    const kr = UI.key[kind][down ? 'dn' : 'up'];
    spr(c, im, kr, b.x + (b.w - kr[2] * S) / 2, b.y + UI.KEYY * S, S);
    c.restore();
  };
  G.drawLaunchHud = function (rk) {
    const ln = rk.ln, c = this.ctx, Lo = this.launchLayout(), { p, bar, btn, touch } = Lo, boss = !ln.human, P = L();
    const fs = n => touch ? Math.max(16, n) : n;
    const u = touch ? 3 : 2;
    c.drawImage(this.launchFrame(p, boss, u, touch || boss ? 0 : p.x + p.w - btn.x - 6), p.x, p.y); if (this._txtLog) this._txtLog.push({ cover: true, x: p.x, y: p.y, w: p.w, h: p.h });
    if (ln.res) {   // 按下以后：标题换成结果（金芯 / 绿 / 黄 / 失败 各一种颜色）
      const r = ln.res, k = r.kind, colR = k === 'super' ? ((ln.after >> 1) % 2 ? '#fff3da' : '#ffdc86') : k === 'perfect' ? '#ffd23c' : k === 'normal' ? '#7dff9a' : '#c8c4d6';
      const t = `${boss ? rk.A.mv.name + ' ' : ''}${NAME[k]}${r.why ? '（' + WHY[r.why] + '）' : ''} ×${P.MULT[k]}`;
      this.txt(t, p.x + 18, p.y + 23, Math.round((k === 'fail' ? 20 : 24) * (ln.after < 4 ? 1.2 : 1)), colR, 'left', { sw: 5, stroke: '#120c1c', maxW: p.w - 40 });
    } else {
      const who = boss ? `${rk.A.mv.name}按下发射钮…` : (this.camp || this.menu.cpu) ? '看准绿区，发射！' : `P${ln.side + 1} 看准绿区，发射！`;
      const im = uiImg(), bob = Math.round(Math.sin(ln.t * 0.25));
      if (im && !boss) { c.save(); c.imageSmoothingEnabled = false; spr(c, im, UI.rocket, p.x + 14, p.y + 12 + bob * u, u === 3 ? 2 : 2); c.restore(); }
      this.txt(who, p.x + (boss ? 18 : 18 + 7 * 2 + 10), p.y + 22, fs(17), boss ? '#ffd0d0' : '#d0ffd8', 'left', { sw: 4 });
    }
    if (ln.pity && !boss && !ln.res) {
      const s = `手感加成 · 判定区 ×${ln.k}`; c.font = `900 ${fs(14)}px ${WF.CFG.FONT}`; const tw = c.measureText(s).width + 16;
      const rx = touch ? p.x + p.w - 20 : btn.x - 16;
      this.box(rx - tw, p.y + 11, tw, 22, '#3a2a08', '#ffd23c', 2); this.txt(s, rx - tw / 2, p.y + 22, fs(14), '#ffd23c', 'center', { stroke: false });
    }
    // 倒数数字
    const sec = ln.res ? 0 : Math.max(1, Math.ceil((ln.total - ln.t) / (rk.cpuStage ? ln.total : rk.step)));
    const pulse = !ln.res && (ln.t % rk.step) < 5;
    if (!rk.cpuStage) this.pxDigits(ln.res ? '0' : String(Math.min(3, sec)), p.x + 56, p.y + 44, pulse ? 11 : 10, ln.res ? '#8a8498' : pulse ? '#ffffff' : '#7dff9a', '#25202e');
    else this.txt('电脑', p.x + 56, p.y + 74, 20, '#ffb0b0', 'center', { sw: 4 });
    // 时机条
    const X = v => bar.x + Math.round(v * bar.w);
    c.fillStyle = '#25202e'; c.fillRect(bar.x - 3, bar.y - 3, bar.w + 6, bar.h + 6);
    c.fillStyle = '#3a2a44'; c.fillRect(bar.x, bar.y, bar.w, bar.h);
    c.fillStyle = '#221a30'; c.fillRect(bar.x, bar.y, X(P.ARM) - bar.x, bar.h);
    const y0 = ln.c - ln.g / 2 - ln.y, g0 = ln.c - ln.g / 2;
    c.fillStyle = '#d8a428'; c.fillRect(X(y0), bar.y, X(ln.c + ln.g / 2 + ln.y) - X(y0), bar.h);
    c.fillStyle = '#ffd23c'; c.fillRect(X(y0), bar.y + 3, X(ln.c + ln.g / 2 + ln.y) - X(y0), bar.h - 6);
    c.fillStyle = '#1f9a4c'; c.fillRect(X(g0), bar.y, X(ln.c + ln.g / 2) - X(g0), bar.h);
    c.fillStyle = '#3ad06a'; c.fillRect(X(g0), bar.y + 3, X(ln.c + ln.g / 2) - X(g0), bar.h - 6);
    // 区间交界的暗线 + 顶部高光（让色块像一整条凹槽里的发光带，而不是平涂）
    c.fillStyle = '#25202e'; c.fillRect(X(g0) - 1, bar.y, 2, bar.h); c.fillRect(X(ln.c + ln.g / 2) - 1, bar.y, 2, bar.h);
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(X(y0), bar.y + 3, X(ln.c + ln.g / 2 + ln.y) - X(y0), 3);
    const sx = X(ln.c - ln.s / 2), sw = Math.max(4, X(ln.c + ln.s / 2) - sx);
    c.fillStyle = '#fff3da'; c.fillRect(sx, bar.y + 2, sw, bar.h - 4); c.fillStyle = '#ffae4b'; c.fillRect(sx, bar.y + 2, sw, 2); c.fillRect(sx, bar.y + bar.h - 4, sw, 2);
    c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(bar.x, bar.y, bar.w, 3);   // 槽口上沿的内阴影
    for (let i = 1; i < 3 && !rk.cpuStage; i++) { c.fillStyle = '#120c1c'; c.fillRect(X(i * rk.step / ln.total) - 1, bar.y + bar.h - 7, 2, 7); }
    // 指针：竖线 + 上下两个像素箭头
    const pos = ln.res ? (ln.res.pos == null ? 1 : ln.res.pos) : this.launchPos(ln, 0), px = X(pos);
    const pc = ln.res ? (ln.res.kind === 'fail' ? '#ff8a8a' : ln.res.kind === 'normal' ? '#fff3a0' : '#ffffff') : (ln.armTap ? '#8a8498' : '#ffffff');
    c.fillStyle = '#25202e'; c.fillRect(px - 3, bar.y - 4, 6, bar.h + 8);
    c.fillStyle = pc; c.fillRect(px - 1, bar.y - 3, 2, bar.h + 6);
    arrow(c, px, bar.y - 16, 1, pc, '#25202e');
    arrow(c, px, bar.y + bar.h + 16, -1, pc, '#25202e');
    if (ln.res && ln.res.kind !== 'fail' && ln.after < 10 && ln.after % 4 < 2) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.strokeRect(X(y0) - 2, bar.y - 2, X(ln.c + ln.g / 2 + ln.y) - X(y0) + 4, bar.h + 4); }
    // 图例
    const lg = touch ? '绿区 完美×1.5 · 黄区 ×1 · 金芯 ×2' : '绿区 完美 ×1.5　黄区 发射 ×1　金芯 超级 ×2　其他 失败 ×0.5';
    this.txt(lg, bar.x + bar.w / 2, p.y + p.h - 20, fs(13), '#bfb3d6', 'center', { stroke: false, maxW: bar.w + 20 });
    // 发射按钮
    this._lnBtn = null;
    if (!boss) {
      this._lnKeyKind = touch ? 'tap' : this.launchKeyLabel(ln.side) === '空格' ? 'space' : 'enter';
      this.drawLaunchBtn(ln, btn);
      if (touch && !ln.res) this.txt('点按钮或屏幕任意处', btn.x + btn.w, btn.y - 12, 16, '#f0e6d0', 'right', { sw: 4, stroke: '#25202e' });
      this._lnBtn = { x: btn.x, y: btn.y, w: btn.w, h: btn.h };
    }
  };
  G.drawLaunchMsg = function () {
    const m = this.launchMsg; if (!m || m.t > 44) return;
    const C = WF.CFG, k = m.t < 5 ? 1.35 - m.t * 0.07 : 1, Lo = this.launchLayout();
    const col = m.kind === 'super' ? ((m.t >> 2) % 2 ? '#fff3da' : '#ffdc86') : m.kind === 'perfect' ? '#ffd23c' : m.kind === 'normal' ? '#7dff9a' : '#c8c4d6';
    const big = m.kind === 'fail' ? 30 : m.kind === 'normal' ? 32 : 40;
    const y = Lo.p.y + Lo.p.h + 30, mult = L().MULT[m.kind];
    this.txt(`${m.cpu ? '马西克 ' : ''}${NAME[m.kind]}${m.why ? '（' + WHY[m.why] + '）' : ''}  ×${mult}`, C.SCREEN_W / 2, y, Math.round(big * k), col, 'center', { sw: 7, stroke: m.kind === 'fail' ? '#1a1426' : '#3a1a00' });
  };
})();
