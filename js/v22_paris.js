// v2.2 巴黎关 · 玛戈「同词换页」（锁定 W3a：只在巴黎 Boss 战作为 W3 的例外；用户 2026-11-21 拍板）
//   · 玛戈血量第一次跌到 70%、30% 以下时各触发一次：她播 idle_alt「舔指翻页」，接着连出两题，考同一个英文词的两个义项
//   · 词对来自人工起草的 data/paris_pairs.js，不从词库自动拆义项；两题都只出「看英文选中文」（第二题按规则必须关掉「看中文选英文」）
//   · 两题都答对：第二题的出拳强制暴击（不是重击档），玛戈播 stunned「词典被打飞、再接回」（fx dict_fly）
//   · 第二题答错 / 超时：玛戈固定用 heavy_kick「Fermez！合书」反击；第一题答错照常被她反击
//   · 换页的两题不进角力（避免规则被角力吞掉），玛戈不抢答（只在你答错 / 超时时出手）
// 界面招式名带法语味（config.js MOVES.margot.moveNames），精灵图里没有文字。
// v2.2 玛戈可选（用户 2026-11-22 拍板）：玩家用玛戈时，同词换页变成天赋（PROG.TALENT.margot，模式 'tal'）：
//   · 只对城市对手 / Boss（小怪、精英不触发），对手血量第一次跌到 70%、30% 各一次；同样两题、同样只出「看英文选中文」、对手不抢答、不进角力
//   · 两题全对：第二题那一拳固定「Fermez！合书」（heavy_kick），必定暴击，倍率 ×2.0（平时 ×1.5）
//   · 第二题答错 / 超时：对手反击，这一下受到的伤害 ×1.3；第一题答错照常挨打
//   · 没有 Boss 版「第一题留 1 血」：第一题就打倒对手，第二题跳过
//   · 天赋只在闯关生效（camp.prog.tal 只在闯关开局时设置）
//   · 巴黎镜像：玩家玛戈抽到巴黎时，对手是「换色版玛戈」（CAMPAIGN.MIRROR_SKIN），不跑 Boss 版同词换页，只跑玩家的天赋
(function () {
  const W = window.WF, G = W.Game && W.Game.prototype; if (!G) return;
  const C = W.CFG;
  const PS = C.PAGESWAP = { AT: [0.7, 0.3], TAG: 'Tournez la page！同词换页' };
  const PAIRS = window.WF_PARIS_PAIRS || [];
  const TIER = { junior: 'b', senior: 'b', primary: 'b', starter: 'b', pep3: 'b', pep4: 'b', pep5: 'b', pep6: 'b', nce1: 'b', nce2: 'b', cet4: 'c', cet6: 'c', nce3: 'c', kaoyan: 'a', ielts: 'a', toefl: 'a', sat: 'a', gre: 'a', nce4: 'a' };
  const tal = g => (g.camp && g.camp.prog && g.camp.prog.tal) || {};
  const bossWave = g => { const cp = g.camp, E = g.p && g.p[1]; return !!(cp && E && E.mv && !E.mv.minion && !E.mv.elite && cp.wave > g.campWaves()); };
  // Boss 版：对手是玛戈，而且玩家不是玛戈（玩家玛戈打镜像时只跑天赋）
  const isMargot = g => bossWave(g) && g.p[1].mv.newCity === 'margot' && g.camp.playerId !== 'margot';
  // 天赋版：玩家带「同词换页」天赋，对手是城市对手 / Boss
  const isTal = g => bossWave(g) && !!tal(g).pageSwap;
  const mode = g => isMargot(g) ? 'boss' : isTal(g) ? 'tal' : null;
  const st = g => {
    const E = g.p && g.p[1];
    if (!g.ps || g.ps.E !== E) g.ps = { E, mode: mode(g), done: [false, false], pending: [], cur: null, log: [] };
    return g.ps;
  };
  W.Paris = { st, isMargot, isTal, mode, PAIRS };

  // ---------- 出题 ----------
  G.psPickPair = function () {
    const cp = this.camp, used = cp.psUsed || (cp.psUsed = []);
    const bank = this.bank, inBank = new Set(bank && bank.words ? bank.words.map(w => w.word) : []);
    const tier = TIER[bank && bank.id] || 'c';
    const free = PAIRS.filter(p => !used.includes(p.word));
    const pools = [free.filter(p => inBank.has(p.word) && p.tier === tier), free.filter(p => inBank.has(p.word)), free.filter(p => p.tier === tier), free, PAIRS];
    const pool = pools.find(l => l.length);
    const p = pool[Math.floor(this.rand() * pool.length)];
    used.push(p.word);
    return p;
  };
  // 干扰项：当前词库同词性、长度相近的别的词的义项；与这个词任何一个义项（含词库里的其他义项）撞字的都不要
  G.psBuild = function (pair, step) {
    const s = step === 1 ? pair.a : pair.b, other = step === 1 ? pair.b : pair.a;
    const bank = this.bank && this.bank.words && this.bank.words.length ? this.bank : (this.banks || []).find(b => b.words && b.words.length);
    const qz = this.qtQuiz ? this.qtQuiz(bank.id) : new W.Quiz(bank, this.rnd), P = qz.index();
    const dictW = bank.words.find(w => w.word === pair.word) || (window.WF_DICT || {})[pair.word];
    const pf = W.Quiz.profile({ senses: [{ zh: s.zh, pos: s.pos }, { zh: other.zh, pos: other.pos }].concat(dictW ? W.Quiz.senses(dictW) : []) });
    const gloss = s.zh, opts = [gloss], picked = [], words = new Set([pair.word.toLowerCase()]);
    const ok = e => !words.has(e.w.word.toLowerCase()) && !opts.includes(e.g) && !W.Quiz.clash(pf, e.g)
      && !picked.some(p => W.Quiz.clash(W.Quiz.profile({ senses: [p.s] }), e.g));
    for (const [pool, dl] of [[P[s.pos] || [], 2], [P[s.pos] || [], 4], [P.all, 4], [P.all, 99]]) {
      if (!pool.length) continue;
      for (let i = 0; i < 400 && opts.length < 4; i++) {
        const e = pool[Math.floor(this.rand() * pool.length)];
        if (Math.abs(e.len - gloss.length) > dl || !ok(e)) continue;
        opts.push(e.g); picked.push(e); words.add(e.w.word.toLowerCase());
      }
      if (opts.length >= 4) break;
    }
    while (opts.length < 4) opts.push('（其他）' + opts.length);
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const inBank = bank.words.some(w => w.word === pair.word);
    const qb = inBank ? bank.id : (((this.banks || []).find(b => b.words && b.words.some(w => w.word === pair.word))) || bank).id;
    return { kind: 'word', bank: qb, word: pair.word, pos: s.pos, posAll: picked.every(p => p.s.pos === s.pos), meaning: gloss, senseId: 'ps' + step,
      ex: { en: s.en, zh: s.exZh }, options: order.map(i => opts[i]), correct: order.indexOf(0), pageSwap: step, psWord: pair.word };
  };
  const baseNext = G.campNextQ;
  G.campNextQ = function () {
    const md = mode(this);
    if (!md || this.state === 'clash') return baseNext.apply(this, arguments);
    const S = st(this), E = this.p[1], Pl = this.p[0];
    if (S.cur && S.cur.step === 1 && S.cur.res[1] != null) S.cur.step = 2;
    else if (S.cur && S.cur.step === 2 && S.cur.res[2] != null) S.cur = null;
    if (!S.cur && S.pending.length && E.hp > 0) {
      const tr = S.pending.shift(), pair = this.psPickPair();
      S.cur = { pair, step: 1, res: {}, at: tr };
      S.log.push({ ev: 'start', mode: md, at: tr.at, hpPct: Math.round(E.hp / E.maxHp * 1000) / 10, word: pair.word, qn: this.qn, opp: E.id });
      if (md === 'boss') {
        if (E.has('idle_alt') && E.hp > 0) E.play('idle_alt', { loop: false, next: 'idle' });
        this.popWorld(PS.TAG, E.x, C.GROUND_Y - 70, '#eee0b3', 24);
      } else {   // 天赋：玩家玛戈舔指翻页
        if (Pl.has('idle_alt') && Pl.hp > 0 && (Pl.anim === 'idle' || Pl.done)) Pl.play('idle_alt', { loop: false, next: 'idle' });
        this.popWorld('天赋 · ' + PS.TAG, Pl.x, C.GROUND_Y - 70, '#eee0b3', 22);
      }
      W.Audio.play('whoosh');
      this.say(`同词换页${md === 'tal' ? '（天赋）' : ''}（${E.mv.name} ${S.log[S.log.length - 1].hpPct}%）：${pair.word} = ${pair.a.zh} / ${pair.b.zh}`);
    }
    if (S.cur) return this.psBuild(S.cur.pair, S.cur.step);
    return baseNext.apply(this, arguments);
  };
  // 换页的两题：玛戈不抢答，只在你答错 / 超时时出手
  const baseCpu = G.campCpuPlan;
  G.campCpuPlan = function (q, clash) {
    if (q && q.pageSwap && !clash) { q.cpu = { t: Infinity, idx: q.correct }; return true; }
    return baseCpu.apply(this, arguments);
  };
  const baseClash = G.clashAllowed;
  G.clashAllowed = function () { return this.q && this.q.pageSwap ? false : baseClash.apply(this, arguments); };
  const settle = (g, q, ok, how) => {
    const S = st(g); if (!S.cur || S.cur.res[q.pageSwap] != null) return;
    S.cur.res[q.pageSwap] = ok;
    if (q.pageSwap === 2 && ok && S.cur.res[1]) q.forceCrit = true;
    if (!ok) { q.psWrong = true; if (q.pageSwap === 2) q.forceCounter = true; if (q.cpu) q.cpu.idx = q.correct; }
    S.log.push({ ev: 'answer', step: q.pageSwap, ok, how, word: q.word, qn: q.n });
  };
  const baseAns = G.campOnAnswer;
  G.campOnAnswer = function (q, rec, was) {
    baseAns.apply(this, arguments);
    if (q && q.pageSwap && mode(this)) settle(this, q, !!rec.ok, 'answer');
  };
  const baseTO = G.campOnTimeout;
  G.campOnTimeout = function (q) {
    if (q && q.pageSwap && mode(this) && !q.ans[0] && !q.ans[1]) {
      if (this.ansCombo) this.ansCombo[0] = 0;
      settle(this, q, false, 'timeout');
      this.answer(1, q.correct);   // 超时 = 答错：对手出手
      return true;
    }
    return baseTO.apply(this, arguments);
  };

  // ---------- 出招：强制暴击 / 固定合书反击 / 法语招式名 ----------
  const baseBegin = G.beginAttack;
  G.beginAttack = function (s, opts) {
    const q = this.q, A = this.p[s], md = q && q.pageSwap ? mode(this) : null, T = tal(this);
    if (md === 'tal') return talBegin.call(this, s, opts, q, A, T);
    const ps = md === 'boss';
    if (ps && s === 1 && q.forceCounter) this.streak[1] = 0;   // 反击固定是合书，不让它攒成必杀
    // 两题都对的这一拳必须是暴击：刚好攒满必杀时先打暴击，必杀留到下一次速答（速答数照常累计）
    const holdUlt = ps && s === 0 && q.forceCrit;
    if (holdUlt) this.ultAt = () => Infinity;
    try { baseBegin.call(this, s, opts); } finally { if (holdUlt) delete this.ultAt; }
    const pa = this.pendingAttack; if (!pa || pa.side !== s) return;
    let relaunch = false;
    if (ps && s === 1 && q.forceCounter && !pa.isUlt && A.has('heavy_kick')) {
      pa.anim = 'heavy_kick'; pa.leads = null; pa.kick = true; pa.block = false; pa.lvl = pa.crit ? 'crit' : 'heavy'; pa.snappy = this.attackOpts(A, 'heavy_kick'); pa.psCounter = true; relaunch = true;
      st(this).log.push({ ev: 'counter', anim: 'heavy_kick', qn: q.n });
      this.say('同词换页第二题答错：玛戈「Fermez！合书」反击');
    }
    if (ps && s === 0 && q.forceCrit && !pa.isUlt) {
      const sec = (q.first ? q.first.t : q.t) / C.FPS;
      if (pa.block || !pa.dmg) {   // 慢到被挡的那一档：换成普通出拳再暴击
        pa.block = false; pa.anim = this.pickMove(A, A.mv.slow); pa.kick = /kick/.test(pa.anim); pa.leads = null; pa.snappy = this.attackOpts(A, pa.anim);
        pa.dmg = Math.round(this.campPlayerDmg(0, 'slow', C.SLOW_DMG, sec) * this.comboMult(0)); relaunch = true;
      }
      if (!pa.crit) { pa.crit = true; pa.dmg = Math.round(pa.dmg * C.CRIT_MULT); pa.kind += '+crit'; }
      pa.lvl = 'crit'; pa.psCrit = true;
      st(this).log.push({ ev: 'crit', dmg: pa.dmg, kind: pa.kind, qn: q.n });
      this.say(`同词换页两题都对：强制暴击 ${pa.dmg}`);
    }
    if (relaunch) this.launchAttackAnim();
    if (s === 1 && A.mv && A.mv.moveNames && !pa.isUlt && A.mv.moveNames[pa.anim]) this.popWorld(A.mv.moveNames[pa.anim], A.x + 12, C.GROUND_Y - 46, '#eee0b3', pa.psCounter ? 26 : 18);
  };
  // 天赋版出招：两题全对 → 玩家玛戈固定合书 + 必定暴击 ×2.0；第二题答错 → 对手照常出手（受到的伤害在 campTakenDmg 里 ×1.3）
  function talBegin(s, opts, q, A, T) {
    const holdUlt = s === 0 && q.forceCrit;
    if (holdUlt) this.ultAt = () => Infinity;   // 刚好攒满必杀时先打这一下暴击，必杀留到下一次速答
    try { baseBegin.call(this, s, opts); } finally { if (holdUlt) delete this.ultAt; }
    const pa = this.pendingAttack; if (!pa || pa.side !== s) return;
    if (s === 1 && q.forceCounter) {
      pa.psCounter = true;
      st(this).log.push({ ev: 'counter', mode: 'tal', anim: pa.anim, ult: !!pa.isUlt, qn: q.n });
      this.popWorld(`反击 ×${T.psCounter}`, this.p[0].x, C.GROUND_Y - 60, '#ff9aa0', 20);
      this.say(`天赋 同词换页第二题答错：${A.mv.name} 反击，伤害 ×${T.psCounter}`);
      if (A.mv && A.mv.moveNames && !pa.isUlt && A.mv.moveNames[pa.anim]) this.popWorld(A.mv.moveNames[pa.anim], A.x + 12, C.GROUND_Y - 46, '#eee0b3', 18);
      return;
    }
    if (s !== 0 || !q.forceCrit || pa.isUlt) return;
    const sec = (q.first ? q.first.t : q.t) / C.FPS, mult = T.psCrit || 2;
    if (pa.block || !pa.dmg) {   // 慢到被挡的那一档：先按慢答算伤害再暴击
      pa.block = false; pa.dmg = Math.round(this.campPlayerDmg(0, 'slow', C.SLOW_DMG, sec) * this.comboMult(0));
    } else if (pa.crit) pa.dmg = pa.dmg / C.CRIT_MULT;   // 已经是暴击：先还原成不暴击的伤害，再按 ×2.0 算
    const anim = A.has('heavy_kick') ? 'heavy_kick' : (pa.anim || this.pickMove(A, A.mv.slow));
    pa.anim = anim; pa.kick = /kick/.test(anim); pa.leads = null; pa.snappy = this.attackOpts(A, anim);
    pa.crit = true; pa.dmg = Math.round(pa.dmg * mult); pa.lvl = 'crit'; pa.psCrit = true;
    if (!/crit/.test(pa.kind)) pa.kind += '+crit';
    st(this).log.push({ ev: 'crit', mode: 'tal', mult, dmg: pa.dmg, kind: pa.kind, anim, qn: q.n });
    this.say(`天赋 同词换页两题都对：合书必定暴击 ×${mult} = ${pa.dmg}`);
    this.launchAttackAnim();
    this.popWorld(`${(A.mv.moveNames && A.mv.moveNames[anim]) || '合书'} ×${mult}`, A.x + 12, C.GROUND_Y - 46, '#eee0b3', 24);
  }
  // 天赋版第二题答错的反击：玩家受到的伤害 ×1.3（整次反击的每一下都算，包括对手的必杀）
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, D, dmg) {
    let v = baseTaken.apply(this, arguments);
    const q = this.q;
    if (D && D.side === 0 && A && A.side === 1 && q && q.pageSwap === 2 && q.forceCounter && mode(this) === 'tal') {
      const k = tal(this).psCounter || 1.3; v *= k;
      st(this).log.push({ ev: 'counterHit', mult: k, base: Math.round(v / k), dmg: Math.round(v), anim: A.anim, qn: q.n });
    }
    return v;
  };
  // 强制暴击命中：玛戈的词典被打飞再接回（stunned 000–013，001 帧带 dict_fly）
  const baseContact = G.contact;
  G.contact = function (A, D, f, o) {
    const q = this.q, r = baseContact.apply(this, arguments);
    if (!r && o && o.crit && q && q.forceCrit && !q.psStunned && A.side === 0 && D === this.p[1] && D.hp > 0 && !this.ko && D.id === 'margot' && mode(this) && D.has('stunned')) {
      q.psStunned = true; D.play('stunned', { loop: false, next: 'idle' });
      st(this).log.push({ ev: 'stunned', qn: q.n, hpPct: Math.round(D.hp / D.maxHp * 1000) / 10 });
    }
    if (o && A.side === 1 && D === this.p[0] && q && q.pageSwap && mode(this)) st(this).log.push({ ev: 'hitPlayer', anim: A.anim, qn: q.n });
    return r;
  };
  // 换页第一题打出的伤害不会直接 KO 玛戈（留 1 血），保证第二题一定出；第二题照常可以 KO
  const baseDmg = G.damage;
  G.damage = function (A, D, amount) {
    const r = baseDmg.apply(this, arguments);
    if (r && isMargot(this) && D === this.p[1]) { const S = st(this); if (S.cur && S.cur.step === 1) { D.hp = 1; D.trail = Math.max(D.trail || 0, 1); S.log.push({ ev: 'hold1hp', qn: this.q && this.q.n }); return false; } }
    return r;
  };
  // ---------- 触发：血量第一次跌破 70% / 30% ----------
  const baseHurt = G.campAfterHurt;
  G.campAfterHurt = function (A, D, dealt) {
    const r = baseHurt.apply(this, arguments);
    const md = mode(this);
    if (md && D === this.p[1] && D.hp > 0 && dealt > 0) {
      const S = st(this), AT = md === 'tal' ? (tal(this).at || PS.AT) : PS.AT;
      AT.forEach((k, i) => { if (!S.done[i] && D.hp <= D.maxHp * k) { S.done[i] = true; S.pending.push({ i, hp: D.hp, at: Math.round(k * 100) + '%' }); S.log.push({ ev: 'armed', mode: md, at: Math.round(k * 100) + '%', hpPct: Math.round(D.hp / D.maxHp * 1000) / 10, opp: D.id }); } });
    }
    return r;
  };
  // ---------- 题板：换页标签 ----------
  const basePanel = G.drawPanel;
  G.drawPanel = function () {
    basePanel.apply(this, arguments);
    const q = this.q; if (!q || !q.pageSwap || this.state !== 'question' && this.state !== 'resolve') return;
    const pre = mode(this) === 'tal' ? '天赋 · ' : '';
    const t = pre + (q.pageSwap === 1 ? '同词换页 1/2 · Tournez la page' : '同词换页 2/2 · 同一个词，换个意思');
    this.txt(t, C.SCREEN_W / 2, 392, 16, '#eee0b3', 'center', { sw: 4, weight: 700 });
  };

  // ---------- 图鉴 / 成就 ----------
  if (window.WF_CODEX && WF_CODEX.chars && !WF_CODEX.chars.some(c => c.id === 'margot')) WF_CODEX.chars.push({ id: 'margot', group: 'boss', tag: '巴黎 · 旧书摊 Boss',
    bio: '玛戈在塞纳河边守着一个旧书摊，摊上的书比她的年纪还大。她看书时总把眼镜推到鼻尖，听见有人把单词答错，就「啪」地合上那本大词典：这一页，你还没读懂。' });
  if (W.Ach && W.Ach.add) W.Ach.add('clear', 'beat_margot', '合上最后一页', '挑战模式打败巴黎的玛戈', { test: () => false });

  // ---------- v2.2 可选角色：头像框 / 巴黎镜像对手 ----------
  // 头像框微调（原 [22,14,26] 脸偏右上、切掉左边的头发）：只改裁剪坐标，不动图
  if (window.WF_ASSETS && WF_ASSETS.margot) WF_ASSETS.margot.portrait = [20, 13, 24];
  // 镜像：玩家选的角色正好是这一城的对手、而且 CAMPAIGN.MIRROR_SKIN 里有换色图集 → 对手不换人，换成换色版
  const MS = () => (C.CAMPAIGN && C.CAMPAIGN.MIRROR_SKIN) || {};
  const baseOpp = G.campOppFor;
  G.campOppFor = function (playerId, city) {
    if (city && city.opponent === playerId && MS()[playerId]) return playerId;
    return baseOpp.apply(this, arguments);
  };
  // TODO(Codex 换色图集)：assets/skins/margot_mirror{,_white,_red}.png 现在是程序换色的临时图（tools/margot_mirror_placeholder.py），
  //   Codex 的正式换色图集到了直接覆盖这三个文件（同尺寸同布局），代码不用改
  const baseSpawnOne = G.campSpawnOne;
  G.campSpawnOne = function (id, hp, x) {
    const E = baseSpawnOne.apply(this, arguments), cp = this.camp, sk = MS()[id];
    if (cp && sk && id === cp.playerId) { E.skin = sk; E.mirror = true; if (W.Skins) W.Skins.ensure(sk); this.say(`镜像对手：换色版${E.mv.name}（${sk}）`); }
    return E;
  };
  const baseStart = G.startCampaign;
  G.startCampaign = function () {
    const r = baseStart.apply(this, arguments), cp = this.camp, sk = cp && MS()[cp.playerId];
    if (sk && W.Skins) W.Skins.ensure(sk);   // 提前下载镜像图集，打到巴黎时已经就绪
    return r;
  };
})();
