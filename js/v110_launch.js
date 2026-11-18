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
    CPU: { easy: [0.35, 0.55, 0.10, 0], normal: [0.25, 0.55, 0.20, 0], hard: [0.20, 0.50, 0.28, 0.02], shura: [0.15, 0.50, 0.32, 0.03] },
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
          w.save(); w.beginPath(); w.rect(0, 0, w.canvas.width, WF.CFG.GROUND_Y + 1); w.clip();
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
  G.launchLayout = function () {
    const touch = !!WF.touch, W = WF.CFG.SCREEN_W;
    const p = touch ? { x: 150, y: 62, w: 660, h: 132 } : { x: 190, y: 62, w: 580, h: 132 };
    const rk = this.rocket, boss = !!(rk && rk.ln && !rk.ln.human);   // 电脑发射没有按钮：条拉满整块面板
    const bar = touch || boss ? { x: p.x + 112, y: p.y + 50, w: p.w - 136, h: touch ? 36 : 34 } : { x: p.x + 104, y: p.y + 50, w: 336, h: 34 };
    const btn = touch ? { x: W - 286, y: 352, w: 264, h: 170 } : { x: p.x + p.w - 122, y: p.y + 30, w: 108, h: 88 };
    return { p, bar, btn, touch };
  };
  G.drawLaunchHud = function (rk) {
    const ln = rk.ln, c = this.ctx, Lo = this.launchLayout(), { p, bar, btn, touch } = Lo, boss = !ln.human, P = L();
    const fs = n => touch ? Math.max(16, n) : n;
    const col = boss ? '#7a1418' : '#1a6a34';
    c.fillStyle = '#25202e'; c.fillRect(p.x, p.y, p.w, p.h); if (this._txtLog) this._txtLog.push({ cover: true, x: p.x, y: p.y, w: p.w, h: p.h }); c.fillStyle = col; c.fillRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8); c.fillStyle = '#120c1c'; c.fillRect(p.x + 10, p.y + 32, p.w - 20, p.h - 42);
    if (ln.res) {   // 按下以后：标题换成结果（金芯 / 绿 / 黄 / 失败 各一种颜色）
      const r = ln.res, k = r.kind, colR = k === 'super' ? ((ln.after >> 1) % 2 ? '#fff3da' : '#ffdc86') : k === 'perfect' ? '#ffd23c' : k === 'normal' ? '#7dff9a' : '#c8c4d6';
      const t = `${boss ? rk.A.mv.name + ' ' : ''}${NAME[k]}${r.why ? '（' + WHY[r.why] + '）' : ''} ×${P.MULT[k]}`;
      this.txt(t, p.x + 18, p.y + 17, Math.round((k === 'fail' ? 20 : 24) * (ln.after < 4 ? 1.2 : 1)), colR, 'left', { sw: 5, stroke: '#120c1c', maxW: p.w - 40 });
    } else {
      const who = boss ? `${rk.A.mv.name}按下发射钮…` : (this.camp || this.menu.cpu) ? '看准绿区，发射！' : `P${ln.side + 1} 看准绿区，发射！`;
      this.txt(who, p.x + 18, p.y + 18, fs(17), boss ? '#ffd0d0' : '#d0ffd8', 'left', { sw: 4 });
    }
    if (ln.pity && !boss && !ln.res) {
      const s = `手感加成 · 判定区 ×${ln.k}`; c.font = `900 ${fs(14)}px ${WF.CFG.FONT}`; const tw = c.measureText(s).width + 16;
      this.box(p.x + p.w - 14 - tw, p.y + 7, tw, 22, '#3a2a08', '#ffd23c', 2); this.txt(s, p.x + p.w - 14 - tw / 2, p.y + 18, fs(14), '#ffd23c', 'center', { stroke: false });
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
    const sx = X(ln.c - ln.s / 2), sw = Math.max(4, X(ln.c + ln.s / 2) - sx);
    c.fillStyle = '#fff3da'; c.fillRect(sx, bar.y + 2, sw, bar.h - 4); c.fillStyle = '#ffae4b'; c.fillRect(sx, bar.y + 2, sw, 2); c.fillRect(sx, bar.y + bar.h - 4, sw, 2);
    for (let i = 1; i < 3 && !rk.cpuStage; i++) { c.fillStyle = '#120c1c'; c.fillRect(X(i * rk.step / ln.total) - 1, bar.y + bar.h - 7, 2, 7); }
    // 指针
    const pos = ln.res ? (ln.res.pos == null ? 1 : ln.res.pos) : this.launchPos(ln, 0), px = X(pos);
    const pc = ln.res ? (ln.res.kind === 'fail' ? '#ff8a8a' : ln.res.kind === 'normal' ? '#fff3a0' : '#ffffff') : (ln.armTap ? '#8a8498' : '#ffffff');
    c.fillStyle = '#25202e'; c.fillRect(px - 3, bar.y - 9, 6, bar.h + 18);
    c.fillStyle = pc; c.fillRect(px - 1, bar.y - 7, 2, bar.h + 14);
    c.fillStyle = '#25202e'; c.fillRect(px - 7, bar.y - 13, 14, 6); c.fillStyle = pc; c.fillRect(px - 5, bar.y - 12, 10, 4);
    if (ln.res && ln.res.kind !== 'fail' && ln.after < 10 && ln.after % 4 < 2) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.strokeRect(X(y0) - 2, bar.y - 2, X(ln.c + ln.g / 2 + ln.y) - X(y0) + 4, bar.h + 4); }
    // 图例
    const lg = touch ? '绿区 完美×1.5 · 黄区 ×1 · 金芯 ×2' : '绿区 完美 ×1.5　黄区 发射 ×1　金芯 超级 ×2　其他 失败 ×0.5';
    this.txt(lg, bar.x + bar.w / 2, p.y + p.h - 20, fs(13), '#bfb3d6', 'center', { stroke: false, maxW: bar.w + 20 });
    // 发射按钮
    this._lnBtn = null;
    if (!boss) {
      const down = (ln.btnT || 0) > 0 || !!ln.res, o = down ? 3 : 0, b = btn;
      if (ln.btnT > 0 && !this.paused) ln.btnT--;
      if (!down) { c.fillStyle = '#25202e'; c.fillRect(b.x, b.y + 4, b.w, b.h); }
      c.fillStyle = '#25202e'; c.fillRect(b.x, b.y + o, b.w, b.h - 2);
      const glow = !ln.res && ln.t / ln.total >= ln.c - ln.g / 2 - ln.y && ln.t / ln.total <= ln.c + ln.g / 2 + ln.y;
      c.fillStyle = down ? '#8a1c1c' : glow ? '#ff5a3a' : '#d8282e'; c.fillRect(b.x + 3, b.y + 3 + o, b.w - 6, b.h - 8);
      c.fillStyle = down ? '#6a1418' : '#ff8a6a'; c.fillRect(b.x + 6, b.y + 6 + o, b.w - 12, 4);
      this.txt('发射', b.x + b.w / 2, b.y + o + (touch ? b.h / 2 - 12 : b.h / 2 - 10), touch ? 46 : 30, '#ffffff', 'center', { sw: 6, stroke: '#3a0d0d' });
      const kl = touch ? '点按钮或屏幕任意处' : this.launchKeyLabel(ln.side);
      if (touch) this.txt(kl, b.x + b.w / 2, b.y + o + b.h - 34, 16, '#ffe0d0', 'center', { stroke: false });
      else { c.font = `900 15px ${WF.CFG.FONT}`; const kw = c.measureText(kl).width + 14; this.box(b.x + b.w / 2 - kw / 2, b.y + o + b.h - 32, kw, 20, '#f0e6d0', '#25202e', 2); this.txt(kl, b.x + b.w / 2, b.y + o + b.h - 22, 15, '#25202e', 'center', { stroke: false }); }
      this._lnBtn = { x: b.x, y: b.y, w: b.w, h: b.h };
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
