// v1.7.1 难度：简单 / 普通 / 困难 / 修罗。闯关（剧情 / 挑战）和电脑陪练各自选、各自记住（localStorage）。
// 闯关基准 = v1.7 原来的数值 = 普通；陪练基准 = v1.7 原来的电脑 = 简单。数值全在 WF.CFG.DIFF。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, KC = C.CAMPAIGN, P = WF.Prog.P, Prog = WF.Prog, FPS = C.FPS;
  const D = C.DIFF = {
    ORDER: ['easy', 'normal', 'hard', 'shura'],
    easy:   { name: '简单', color: '#7dff9a' },
    normal: { name: '普通', color: '#8fd0ff' },
    hard:   { name: '困难', color: '#ffb43c' },
    shura:  { name: '修罗', color: '#ff4a5a' },
    // 闯关：对手血量 ×、城市对手正确率 +、作答延迟 ×、玩家速答窗口 + 秒、小怪战超时秒数 +、小怪血量 ×、玩家受到伤害 ×、对手放必杀要连续速答几次、得分 ×、经验 ×
    CAMP: {
      easy:   { oppHp: 0.75, acc: -0.10, delay: 1.30, fast: +1.5, timeout: +5, minionHp: 0.80, taken: 0.70, ultAt: 6, score: 0.7, xp: 0.8 },
      normal: { oppHp: 1.00, acc: 0.00, delay: 1.00, fast: 0, timeout: 0, minionHp: 1.00, taken: 1.00, ultAt: 5, score: 1.0, xp: 1.0 },
      hard:   { oppHp: 1.25, acc: +0.05, delay: 0.85, fast: -0.5, timeout: -2, minionHp: 1.20, taken: 1.25, ultAt: 5, score: 1.3, xp: 1.2 },
      shura:  { oppHp: 1.35, acc: +0.07, delay: 0.76, fast: -0.8, timeout: -4, minionHp: 1.28, taken: 1.33, ultAt: 4, score: 1.7, xp: 1.5 },   // v1.10.1 适度降低（原 1.50 / +0.08 / 0.70 / -1.0 / -5 / 1.40 / 1.50），仍明显难于困难
    },
    // 陪练：电脑正确率、作答延迟 ×、玩家速答窗口 + 秒、电脑放必杀要连续速答几次、对手血量 ×
    CPU: {
      easy:   { acc: 0.72, delay: 1.00, fast: 0, ultAt: 5, hp: 1.00 },
      normal: { acc: 0.80, delay: 0.80, fast: 0, ultAt: 5, hp: 1.00 },
      hard:   { acc: 0.87, delay: 0.65, fast: -0.5, ultAt: 5, hp: 1.15 },
      shura:  { acc: 0.91, delay: 0.56, fast: -0.8, ultAt: 4, hp: 1.24 },   // v1.10.1 适度降低（原 0.93 / 0.50 / -1.0 / 1.30）
    },
  };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const valid = t => D.ORDER.includes(t) ? t : null;
  G.diffCamp = function () { return this._diffStarting || (this.camp && this.camp.diff) || this.menuDiffCamp(); };
  G.menuDiffCamp = function () { return this.menu.diffCamp || (this.menu.diffCamp = valid(ls('wf_diff_camp')) || 'normal'); };
  G.diffCpu = function () { return this.menu.diffCpu || (this.menu.diffCpu = valid(ls('wf_diff_cpu')) || 'easy'); };
  const DC = g => D.CAMP[g.diffCamp()], DP = g => D.CPU[g.diffCpu()];
  G.cycleDiff = function (d = 1) {
    const camp = this.charselMode && this.charselMode() === 'camp', cur = camp ? this.menuDiffCamp() : this.diffCpu(), i = D.ORDER.indexOf(cur);
    const nx = D.ORDER[(i + d + D.ORDER.length) % D.ORDER.length];
    if (camp) { this.menu.diffCamp = nx; ls('wf_diff_camp', nx); } else { this.menu.diffCpu = nx; ls('wf_diff_cpu', nx); }
    WF.Audio.play('menu');
  };

  // ---------- 闯关 ----------
  const baseStart = G.startCampaign;
  G.startCampaign = function (opts) {
    const t = this.menuDiffCamp();
    this._diffStarting = t;
    let r; try { r = baseStart.apply(this, arguments); } finally { this._diffStarting = null; }
    if (this.camp) { this.camp.diff = t; this.say(`难度 ${D[t].name}`); }
    return r;
  };
  const baseCity = G.campCityFor;
  G.campCityFor = function (id, route) {
    const c = baseCity.apply(this, arguments), m = DC(this);
    const ai = c.ai || { accuracy: C.CPU.accuracy, delay: [C.CPU.delayMin, C.CPU.delayMax] };
    return Object.assign({}, c, {
      opponentHp: Math.round(c.opponentHp * m.oppHp),
      ai: { accuracy: Math.max(0.4, Math.min(0.97, ai.accuracy + m.acc)), delay: [Math.max(0.8, ai.delay[0] * m.delay), Math.max(1.6, ai.delay[1] * m.delay)] },
    });
  };
  const baseWaveHp = G.campWaveHp;
  G.campWaveHp = function (w, id) { const v = baseWaveHp.apply(this, arguments), mid = id || this.campWaveId(w); if (C.MOVES[mid] && C.MOVES[mid].reporter) return v; return Math.max(1, Math.round(v * DC(this).minionHp)); };
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, Df, dmg) { let v = baseTaken.apply(this, arguments); if (Df.side === 0) v *= DC(this).taken; return v; };
  const baseFast = G.campFastS;
  G.campFastS = function (s) { let v = baseFast.apply(this, arguments); if (s === 0) v = Math.max(1.5, v + DC(this).fast); return v; };
  const baseTO = G.campTimeout;
  G.campTimeout = function () { return Math.max(10, baseTO.apply(this, arguments) + DC(this).timeout); };
  const baseUltAt = G.campUltAt;
  G.campUltAt = function (s) { return s === 1 ? DC(this).ultAt : baseUltAt.apply(this, arguments); };
  const baseScore = G.campScore;
  G.campScore = function (full) {
    const sc = baseScore.apply(this, arguments), m = DC(this).score;
    sc.base = sc.total; sc.total = Math.round(sc.total * m); sc.diff = this.diffCamp(); sc.mult = m;
    return sc;
  };
  // 经验 ×（结算时临时放大每项经验；普通 ×1，所以普通第一次全通照样到 Lv2）
  const baseGrant = G.campGrant;
  G.campGrant = function (kind) {
    if (!this.camp || this.camp.grant) return baseGrant.apply(this, arguments);
    const m = DC(this).xp, keys = ['XP_CORRECT', 'XP_CITY', 'XP_KILL', 'XP_FULL'], save = keys.map(k => P[k]);
    keys.forEach(k => { P[k] = Math.round(P[k] * m); });
    let out; try { out = baseGrant.apply(this, arguments); } finally { keys.forEach((k, i) => { P[k] = save[i]; }); }
    if (out) {
      out.xp = Math.round(out.xp); out.diff = this.diffCamp();
      const g = Prog.of(this.menu.p1);
      if (g && out.score && kind !== 'quit') { const key = (this.camp.mode || 'story') + '_' + out.diff; g.bestT = g.bestT || {}; out.bestT = out.score.total > (g.bestT[key] || 0); if (out.bestT) g.bestT[key] = out.score.total; WF.Profiles.save(); }
    }
    return out;
  };

  // ---------- 电脑陪练 ----------
  const baseCpu = G.cpuPlan;
  G.cpuPlan = function (q, clash) {
    if (this.camp || !this.menu.cpu) return baseCpu.apply(this, arguments);
    const K = C.CPU, save = Object.assign({}, K), m = DP(this);
    K.accuracy = m.acc; K.delayMin *= m.delay; K.delayMax *= m.delay; K.clashDelayMin *= m.delay; K.clashDelayMax *= m.delay;
    try { return baseCpu.apply(this, arguments); } finally { Object.assign(K, save); }
  };
  const baseFastS = G.fastS;
  G.fastS = function (s) { const v = baseFastS.apply(this, arguments); return !this.camp && this.menu.cpu && s === 0 ? Math.max(1.5, v + DP(this).fast) : v; };
  const baseUA = G.ultAt;
  G.ultAt = function (s) { return !this.camp && this.menu.cpu && s === 1 ? DP(this).ultAt : baseUA.apply(this, arguments); };
  const baseSM = G.startMatch;
  G.startMatch = function () {
    const r = baseSM.apply(this, arguments);
    if (!this.camp && this.menu.cpu && this.p && this.p[1] && this.state !== 'title') { const m = DP(this).hp; this.p[1].maxHp = Math.round((this.p[1].maxHp || C.HP) * m); this.p[1].hp = this.p[1].maxHp; this.p[1].trail = this.p[1].hp; this.say(`陪练难度 ${D[this.diffCpu()].name}`); }
    return r;
  };

  // ---------- 界面 ----------
  // 选角：右上角难度按钮（T 键 / 点击换）
  const baseCS = G.drawCharSel;
  G.drawCharSel = function () {
    baseCS.apply(this, arguments);
    const mode = this.charselMode(); if (mode !== 'camp' && mode !== 'cpu') return;
    const t = mode === 'camp' ? this.menuDiffCamp() : this.diffCpu(), d = D[t], x = C.SCREEN_W - 250, y = 40, w = 230, h = 22;
    this.box(x, y, w, h, 'rgba(20,14,40,0.92)', d.color, 2);
    this.txt(`难度：◀ ${d.name} ▶（T）`, x + w / 2, y + 12, 14, d.color, 'center', { sw: 3, weight: 700 });
    this.menuRects.push({ x, y, w, h, key: 'diff', i: -1 });
  };
  // 闯关 HUD：模式标签后面带难度
  const baseHL = G.campHudLine;
  G.campHudLine = function () { return `${D[this.diffCamp()].name} · ` + baseHL.apply(this, arguments); };
  // 陪练 HUD：计时圈下面写难度
  const baseRender = G.render;
  G.render = function () {
    baseRender.apply(this, arguments);
    if (this.camp || !this.menu.cpu || this.state === 'title' || this.state === 'result' || this._lnShown) return;   // v1.10 发射时机条盖在这一行上，不画
    const d = D[this.diffCpu()]; this.ctx.save(); WF.uiTransform(this.ctx);
    this.txt(`陪练 · ${d.name}`, C.SCREEN_W / 2, 122, 13, d.color, 'center', { sw: 3, weight: 700 }); this.ctx.restore();
  };
  const baseDR = G.drawResult;
  G.drawResult = function () { baseDR.apply(this, arguments); if (this.menu.cpu) { const d = D[this.diffCpu()]; this.txt(`电脑陪练 · 难度 ${d.name}`, C.SCREEN_W / 2, 26, 16, d.color, 'center', { sw: 4, weight: 700 }); } };
  // 结算：难度标签 + 本难度最高
  const baseDC2 = G.drawCleared;
  G.drawCleared = function () {
    baseDC2.apply(this, arguments);
    const m = this.camp && this.camp.modal; if (!m || !m.final) return;
    const gr = this.camp.grant, t = this.diffCamp(), d = D[t], g = Prog.of(this.menu.p1);
    this.box(C.SCREEN_W - 230, 120, 210, 52, 'rgba(12,8,26,0.9)', d.color, 2);
    this.txt(`难度 ${d.name} · 得分 ×${D.CAMP[t].score}`, C.SCREEN_W - 125, 136, 14, d.color, 'center', { sw: 3, weight: 700 });
    const best = g && g.bestT ? g.bestT[(this.camp.mode || 'story') + '_' + t] || 0 : 0;
    this.txt(`${d.name}最高 ${best}${gr && gr.bestT ? ' 新！' : ''}`, C.SCREEN_W - 125, 157, 13, '#e9d7a6', 'center', { sw: 3, weight: 700 });
  };
  const baseRS = G.drawRunSummary;
  G.drawRunSummary = function () { baseRS.apply(this, arguments); if (this.result && this.result.t >= 6) { const d = D[this.diffCamp()]; this.txt(`难度 ${d.name}`, C.SCREEN_W - 30, 26, 16, d.color, 'right', { sw: 4, weight: 700 }); } };

  // ---------- 难度成就（独立页签「难度」） ----------
  const Ach = WF.Ach; if (!Ach) return;
  const { cnt } = Ach, flag = Ach.flagDef, life = Ach.life;
  Ach.CATS.splice(Ach.CATS.findIndex(c => c[0] === 'hidden'), 0, ['diff', '难度']);
  const MN = { story: '剧情', challenge: '挑战' };
  const NAMES = { story: { easy: '轻松观光', normal: '正式出差', hard: '硬核巡回', shura: '修罗道·剧情' }, challenge: { easy: '转盘新手', normal: '转盘玩家', hard: '转盘狠人', shura: '修罗道·挑战' } };
  for (const m of ['story', 'challenge']) for (const t of D.ORDER) Ach.add('diff', `dc_${m}_${t}`, NAMES[m][t], `${D[t].name}难度下${MN[m]}模式全部通关`, cnt(L => (L.dclear || {})[m + '_' + t] || 0, 1));
  for (const id of C.ROSTER) Ach.add('diff', 'shura_' + id, `修罗·${C.MOVES[id].name}`, `用${C.MOVES[id].name}在修罗难度下全部通关（任一模式）`, cnt(L => (L.shuraChar || {})[id] || 0, 1));
  Ach.add('diff', 'shura_all', '修罗众生', `${C.ROSTER.length} 个角色都在修罗难度下全部通关`, cnt(L => C.ROSTER.filter(id => (L.shuraChar || {})[id]).length, C.ROSTER.length));
  Ach.add('diff', 'climb', '步步高升', '简单、普通、困难、修罗四个难度都全部通关过', cnt(L => D.ORDER.filter(t => (L.dclear || {})['story_' + t] || (L.dclear || {})['challenge_' + t]).length, 4));
  Ach.add('diff', 'shura_clean', '片叶不沾身', '修罗难度下打通一座城，全程受到的伤害不超过 50', flag('shuraClean'));
  Ach.add('diff', 'shura_jin80', '金霸霸也怕你', '修罗难度下打败金霸霸时还剩 80% 以上血量', flag('shuraJin80'));
  Ach.add('diff', 'h_shura_onehp', '修罗场上一丝魂', '修罗难度下只剩不到 5% 血量时打败城市对手', Object.assign({ hidden: true }, flag('shuraOnehp')));
  Ach.add('diff', 'h_easy_lose3', '简单？不存在的', '简单难度下连续倒下 3 局', Object.assign({ hidden: true }, flag('easyLose3')));
  Ach.add('diff', 'h_shura_naked', '裸奔高手', '修罗难度下，道具被米雷霸锯掉还没恢复时打败城市对手', Object.assign({ hidden: true }, flag('shuraNaked')));
  // 采集
  const prevBoss = Ach.onBossWin;
  Ach.onBossWin = function (game, L) {
    if (prevBoss) prevBoss(game, L);
    if (game.diffCamp() !== 'shura') return;
    const P0 = game.p[0];
    if (P0.hp > 0 && P0.hp <= P0.maxHp * 0.05) L.f.shuraOnehp = 1;
    if (game.camp.cityId === 'washington' && P0.hp >= P0.maxHp * 0.8) L.f.shuraJin80 = 1;
    if (game.camp.itemOff && game.camp.itemOff.ids && game.camp.itemOff.ids.length) L.f.shuraNaked = 1;
  };
  // 每城受伤合计（修罗「片叶不沾身」）
  const baseAH = G.campAfterHurt;
  G.campAfterHurt = function (A, Df, dealt) { const r = baseAH.apply(this, arguments); if (this.camp && Df && Df.side === 0 && dealt > 0) this.camp._cityDmg = (this.camp._cityDmg || 0) + dealt; return r; };
  const baseUp = G.update;
  G.update = function () {
    baseUp.apply(this, arguments);
    const cp = this.camp; if (!cp || this.state === 'title') return;
    if (cp._dcN == null) { cp._dcN = cp.cleared.length; cp._cityDmg = 0; }
    if (cp.cleared.length > cp._dcN) {
      if (cp.diff === 'shura' && (cp._cityDmg || 0) <= 50) { const g = Prog.of(this.menu.p1); if (g) { life(g).f.shuraClean = 1; Ach.check(this); } }
      cp._dcN = cp.cleared.length; cp._cityDmg = 0;
    }
  };
  const baseG2 = G.campGrant;
  G.campGrant = function (kind) {
    const had = this.camp && this.camp.grant, g = Prog.of(this.menu.p1);
    if (!had && g && this.camp && kind !== 'quit') {
      const L = life(g), t = this.camp.diff || 'normal', m = this.camp.mode || 'story';
      L.dclear = L.dclear || {}; L.shuraChar = L.shuraChar || {};
      if (kind === 'full') { L.dclear[m + '_' + t] = (L.dclear[m + '_' + t] || 0) + 1; if (t === 'shura') L.shuraChar[this.camp.playerId] = 1; }
      if (kind === 'dead' && t === 'easy') { L.easyLoss = (L.easyLoss || 0) + 1; if (L.easyLoss >= 3) L.f.easyLose3 = 1; } else if (t === 'easy') L.easyLoss = 0;
      if (kind === 'full' && t === 'shura' && this.camp.cityId === 'washington' && this.p[0].hp >= this.p[0].maxHp * 0.8) L.f.shuraJin80 = 1;
    }
    return baseG2.apply(this, arguments);
  };
})();
