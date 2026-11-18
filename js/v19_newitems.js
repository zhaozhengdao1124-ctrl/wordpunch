// v1.9 新道具（§7.2 可见 15 件 + §7.3 隐藏 8 件）和套装（§8）的效果钩子。
// 已知简化（写进报告）：双胞胎「再打一下」= 这一击伤害 ×1.5（不另播一段动作）；哨子 = 超时那题不挨打、直接出下一题。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19, ITEM = id => C.ITEMS.find(i => i.id === id);
  const SETS = () => C.ITEM_SETS;
  // ---------- 套装 ----------
  G.setBonus = function (sid) { const S = SETS()[sid]; if (!S || !this.camp) return 0; return S.members.filter(id => this.lvOf(id) > 0).length; };
  G.setOnGain = function (id) {
    const d = ITEM(id); if (!d || !d.set) return;
    const S = SETS()[d.set], n = this.setBonus(d.set), cp = this.camp; cp.setsHit = cp.setsHit || {};
    if (n >= 2 && (cp.setsHit[d.set] || 0) < n) {
      cp.setsHit[d.set] = n;
      this.toast(`套装「${S.name}」${n} / 3`, n >= 3 ? S.b3 : S.b2, null, S.color);
      WF.Audio.play('rating');
      if (n >= 3 && WF.Ach) WF.Ach.flag(this, 'set3');
    }
  };
  const curseK = g => g.setBonus('exam') >= 3 ? 0.8 : 1;   // 考试周 3 件：双刃剑的坏处 ×0.8
  G.curseK = function () { return curseK(this); };

  // ---------- 进城 / 换城 ----------
  const baseEnter = G.campEnterCity;
  G.campEnterCity = function () {
    const cp = this.camp, first = cp && !cp.entered;
    const r = baseEnter.apply(this, arguments);
    if (first) this.city19Start();
    return r;
  };
  G.city19Start = function () {
    const cp = this.camp, P = this.p[0];
    cp.cityQ = 0; cp.scratchLeft = this.num('scratch_paper') || 0; cp.whistleLeft = this.num('whistle') || 0; cp.fullLeft = this.num('full_score') || 0;
    cp.shield = 0; cp.dice = null;
    let sh = this.num('jacket') || 0; if (this.setBonus('pe') >= 3) sh += 40;
    if (sh) { cp.shield = sh; this.toast('护盾', `本城开场 +${sh} 护盾（先扣护盾）`, this.lvOf('jacket') ? 'jacket' : null, '#8fd0ff'); }
    if (this.lvOf('dice')) {
      const rng = this.campRng('dice' + cp.ci), lv = this.lvOf('dice'), g2 = this.setBonus('gambler') >= 2, g3 = this.setBonus('gambler') >= 3;
      let v = 1 + Math.floor(rng() * 6);
      if (g2 && v < 4 && rng() < 0.1) v = 4 + Math.floor(rng() * 3);   // 有利（4–6）的概率 +5 个百分点
      if (v === 1 && lv === 2) v = 1 + Math.floor(rng() * 6);
      if (v === 1 && (lv >= 3 || g3)) v = 2;
      cp.dice = v;
      const what = v === 1 ? `受伤 +${Math.round(20 * curseK(this))}%（整城）` : v <= 3 ? '无事发生' : v <= 5 ? '速答窗 +0.5 秒' : '伤害 +30%';
      this.toast(`骰子：${v} 点`, what, 'dice', v === 1 ? '#ff6a6a' : v >= 4 ? '#7dff9a' : '#e9d7a6');
      this.say(`骰子 ${v} 点`);
    }
  };
  const baseNextCity = G.campNextCity;
  G.campNextCity = function () {
    const r = baseNextCity.apply(this, arguments), cp = this.camp, P = this.p[0]; if (!cp) return r;
    if (this.lvOf('milktea')) { const v = this.num('milktea'); P.maxHp += v; P.hp = Math.min(P.maxHp, P.hp + v); P.trail = P.hp; this.toast('奶茶', `最大血量 +${v}，回 ${v} 血`, 'milktea', '#ffb6d5'); }
    if (this.lvOf('passport')) { cp.passport = Math.min(0.6, (cp.passport || 0) + this.num('passport')); this.toast('环球护照', `速答窗 +${cp.passport.toFixed(2).replace(/0$/, '')} 秒（本局）`, 'passport', '#8fd0ff'); }
    if (this.setBonus('snack') >= 3) this.campHeal(P.maxHp * 0.05, '零食柜');
    return r;
  };

  // ---------- 出题 ----------
  const baseNext = G.campNextQ;
  G.campNextQ = function () {
    const cp = this.camp; cp.cityQ = (cp.cityQ || 0) + 1;
    if (cp.teddyQ > 0 && cp.teddyArmed) cp.teddyQ--;
    if (cp.teddyQ > 0) cp.teddyArmed = true;
    return baseNext.apply(this, arguments);
  };
  const baseDecor = G.campDecorateQ;
  G.campDecorateQ = function (q) {
    baseDecor.apply(this, arguments);
    const cp = this.camp;
    q.gum = !!cp.gumNext; cp.gumNext = false;
    if (cp.scratchNext && q.options && q.options.length === 4 && q.erased == null) {
      const wrongs = [0, 1, 2, 3].filter(i => i !== q.correct); q.erased = wrongs[Math.floor(this.rand() * wrongs.length)];
      cp.scratchNext = false; cp.scratchLeft--; q.scratch = true;
    }
  };

  // ---------- 速答窗 / 时限 ----------
  const baseFast = G.campFastS;
  G.campFastS = function (s) {
    let v = baseFast.apply(this, arguments); if (s !== 0 || !this.camp) return v;
    const cp = this.camp, q = this.q, E = this.p[1];
    if (q && q.gum) v += this.num('gum');
    if (this.lvOf('magnifier') && E && E.mv && (!E.mv.minion || E.mv.elite)) v += this.num('magnifier');
    if (cp.passport) v += cp.passport;
    if (this.setBonus('scholar') >= 2) v += 0.3;
    if (cp.dice >= 4 && cp.dice <= 5) v += 0.5;
    if (this.lvOf('last_second')) v -= 0.3 * curseK(this);
    return Math.max(1.5, +v.toFixed(3));
  };
  const baseTO = G.campTimeout;
  G.campTimeout = function () { let v = baseTO.apply(this, arguments); if (this.lvOf('alarm')) v -= 6 * curseK(this); return Math.max(8, v); };
  const baseCrit = G.campCrit;
  G.campCrit = function (s) { let v = baseCrit.apply(this, arguments); if (s === 0 && this.setBonus('exam') >= 2) v += 0.03; return v; };
  // 连击加成上限（百连奖状）
  const baseCombo = G.comboMult;
  G.comboMult = function (s) {
    const cap = s === 0 && this.camp && this.lvOf('centurion') ? this.num('centurion') : null;
    const b = baseCombo.apply(this, arguments); if (cap == null) return b;
    const F = C.FEEL || {}, n = (this.ansCombo && this.ansCombo[s]) || 0;
    return Math.max(b, 1 + Math.min(cap, Math.max(0, n - 1) * (F.COMBO_STEP || 0.05)));   // 和韩多蔚天赋的上限取大的
  };

  // ---------- 我方伤害 ----------
  const basePD = G.campPlayerDmg;
  G.campPlayerDmg = function (s, kind, dmg, sec) {
    let v = basePD.apply(this, arguments);
    if (s !== 0 || !v || v <= 1 || this.campIsReporter(this.p[1])) return v;
    const cp = this.camp, q = this.q, P = this.p[0], E = this.p[1], fast = sec != null && sec <= this.fastS(0), pop = (t, col) => this.popWorld(t, E.x, C.GROUND_Y - 64, col, 20);
    let mul = 1, add = 0;
    if (fast && this.lvOf('highlighter')) add += this.num('highlighter');
    if (fast && this.lvOf('alarm')) mul += this.num('alarm');
    if (fast && this.setBonus('scholar') >= 3) mul += 0.10;
    if (/^combo/.test(kind) && this.setBonus('boxer') >= 2) mul += 0.05;
    if (cp.spicy > 0) { mul += this.num('spicy') * cp.spicy; pop('辣条！', '#ff8a5a'); cp.spicy = 0; }
    if (this.lvOf('golden_pencil')) mul += Math.min(0.2, Math.floor((cp.correctCount || 0) / 100) * this.num('golden_pencil'));
    if (this.setBonus('exam') >= 3 && (cp.cityQ || 0) <= 3) mul += 0.30;
    if (cp.dice === 6) mul += 0.30;
    if (cp.peBoost) { mul += 0.20; cp.peBoost = false; }
    if (cp.swissHit) { mul *= cp.swissHit; cp.swissHit = 0; pop('瑞士军刀！', '#ffd23c'); }
    if (this.lvOf('last_second') && sec != null && sec >= this.campTimeout() - 1) { mul *= this.num('last_second'); pop('最后一秒！', '#ff5a8a'); }
    if (this.lvOf('twins') && this.rand() < this.num('twins')) { mul *= 1.5; pop('双胞胎！', '#8fd0ff'); }
    mul = Math.min(K().ITEMS_V19.MULT_CAP, mul);
    v = Math.round((v + add) * mul);
    // 神经刀：最后乘，不受加成上限约束；只作用于普通 / 连击 / 慢答
    if (this.lvOf('neuro_blade') && (/^combo/.test(kind) || kind === 'slow')) {
      const nb = R.neuro(this.rand.bind(this), this.setBonus('gambler') >= 2 ? 0.05 : 0, this.setBonus('gambler') >= 3 ? 0.75 : 0.5);
      v = Math.max(1, Math.round(v * nb.mul));
      cp.neuroN = (cp.neuroN || 0) + 1; if (nb.dbl) cp.neuroDbl = (cp.neuroDbl || 0) + 1;
      this.popWorld(nb.dbl ? '×2' : '×½', E.x + 26, C.GROUND_Y - 84, nb.dbl ? '#ff9a3c' : '#9a9aaa', nb.dbl ? 26 : 20);
    }
    return v;
  };
  const baseUlt = G.campUltDmg;
  G.campUltDmg = function (A) {
    let v = baseUlt.apply(this, arguments);
    if (A.side === 0 && this.setBonus('boxer') >= 3) v = Math.round(v * 1.15);
    if (A.side === 1 && this.lvOf('remote')) v = Math.round(v * (1 - this.num('remote')));
    return v;
  };
  const baseClash = G.campClashDmg;
  G.campClashDmg = function (W) {
    let v = baseClash.apply(this, arguments);
    if (W.side === 0 && this.setBonus('boxer') >= 2) v += 20;
    if (W.side === 0 && this.setBonus('boxer') >= 3) this.campHeal(30, '拳击手套装');
    return v;
  };

  // ---------- 受到伤害：护盾、骰子、体育课、小熊、断掉的电锯 ----------
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, D, dmg) {
    let v = baseTaken.apply(this, arguments); if (D.side !== 0 || !this.camp) return v;
    const cp = this.camp;
    if (cp.teddyQ > 0) { this.popWorld('小熊抱住了你', D.x, C.GROUND_Y - 50, '#ffb6d5', 20); return 0; }
    if (this.setBonus('pe') >= 2) v *= 0.95;
    if (cp.dice === 1) v *= 1 + 0.2 * curseK(this);
    if (this.lvOf('broken_saw') && A && A.mv && !A.mv.minion && cp.cityId === 'buenosaires') v *= 1 + 0.1 * curseK(this);
    if (cp.shield > 0 && v > 0) {
      const ab = Math.min(cp.shield, Math.round(v)); cp.shield -= ab; v -= ab;
      this.popWorld(cp.shield > 0 ? `护盾 −${ab}` : '护盾碎了', D.x, C.GROUND_Y - 60, '#8fd0ff', 18);
    }
    return v;
  };
  const baseAfter = G.campAfterHurt;
  G.campAfterHurt = function (A, D, dealt) {
    baseAfter.apply(this, arguments);
    const cp = this.camp; if (!cp || D.side !== 0 || D.hp <= 0) return;
    if (this.lvOf('teddy') && !cp.used.teddy && D.hp < D.maxHp * 0.3) {
      cp.used.teddy = true; cp.teddyQ = this.num('teddy'); cp.teddyArmed = false;
      this.toast('小熊枕头', `接下来 ${cp.teddyQ} 题敌人打不到你（一局一次）`, 'teddy', '#ffb6d5');
    }
  };
  // 头盔挡住 → 体育课 3 件：下一击 +20%
  const baseEA = G.campEnemyAttack;
  G.campEnemyAttack = function (s, A) { const r = baseEA.apply(this, arguments); if (r && r.block && this.setBonus('pe') >= 3) this.camp.peBoost = true; return r; };

  // ---------- 作答后 ----------
  const baseAns = G.campOnAnswer;
  G.campOnAnswer = function (q, rec, was) {
    const cp = this.camp, P = this.p[0];
    if (!rec.ok && this.lvOf('full_score') && cp.fullLeft > 0 && this.ansCombo && this.ansCombo[0] >= 10) { cp.keepCombo = { a: this.ansCombo[0], s: this.streak[0] }; cp.fullLeft--; }
    baseAns.apply(this, arguments);
    if (!rec.ok) {
      if (this.lvOf('gum')) cp.gumNext = true;
      if (this.lvOf('scratch_paper') && cp.scratchLeft > 0) cp.scratchNext = true;
      return;
    }
    if (q.inBook && this.setBonus('scholar') >= 3) this.campHeal(5, '学霸书包');
    if (this.lvOf('swiss_knife') && cp.correctCount % 10 === 0) {
      const m = this.num('swiss_knife'), k = Math.floor(this.rand() * 3);
      if (k === 0) { this.campHeal(30 * m, '瑞士军刀'); this.toast('瑞士军刀', `回 ${Math.round(30 * m)} 血`, 'swiss_knife'); }
      else if (k === 1) { cp.shield = (cp.shield || 0) + Math.round(40 * m); this.toast('瑞士军刀', `护盾 +${Math.round(40 * m)}`, 'swiss_knife', '#8fd0ff'); }
      else { cp.swissHit = +(1.5 * m).toFixed(2); this.toast('瑞士军刀', `下一击 ×${cp.swissHit}`, 'swiss_knife', '#ffd23c'); }
    }
  };
  // 满分卷：连击 ≥10 时答错不断连击（answerNormal 里先清零连击，这里事后还原）
  const baseAN = G.answerNormal;
  G.answerNormal = function (s, idx) {
    const r = baseAN.apply(this, arguments), cp = this.camp;
    if (cp && cp.keepCombo && s === 0) { const k = cp.keepCombo; cp.keepCombo = null; if (this.ansCombo) this.ansCombo[0] = k.a; this.streak[0] = k.s; this.popWorld('满分卷：连击保住了', this.p[0].x, C.GROUND_Y - 60, '#ffd23c', 20); }
    return r;
  };
  // 哨子：超时不被反击，直接出下一题
  const baseTOut = G.campOnTimeout;
  G.campOnTimeout = function (q) {
    const cp = this.camp, E = this.p[1];
    if (cp && this.lvOf('whistle') && cp.whistleLeft > 0 && E && E.mv.minion && !q.ans[1]) {
      cp.whistleLeft--; if (this.ansCombo) this.ansCombo[0] = 0;
      this.popWorld('哨子！暂停！', this.p[0].x, C.GROUND_Y - 60, '#ffffff', 22); WF.Audio.play('beep', { f: 1400, d: 0.12 });
      return false;   // 不让小怪反击；game.js 接着 endQuestion() → 出下一题
    }
    return baseTOut.apply(this, arguments);
  };
  // 打倒小怪：辣条
  G.onEnemyDown19 = function (L) {
    const cp = this.camp;
    if (L.mv && L.mv.minion && this.lvOf('spicy')) cp.spicy = Math.min(this.setBonus('snack') >= 3 ? 2 : 1, (cp.spicy || 0) + 1);
  };
})();
