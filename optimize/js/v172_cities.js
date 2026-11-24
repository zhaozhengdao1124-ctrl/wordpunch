// v1.7.2 挑战模式城市池三城：埃及·金字塔（法老王）/ 河南·少林寺（玄铁）/ 佛山·宝芝林（黄师傅）。
// 剧情路线不变；挑战模式从「剧情前 5 城 + 三城」里每局抽 5 城打乱，最后一站固定华盛顿（金霸霸）。
// 三个 Boss 的出题机制照《少林佛山埃及新城规范》§1.6 / 2.8 / 3.8 / 4.8（数值初稿，见 CFG.NEWCITY）：
//   法老王：木乃伊在场时干扰项换成拼写相近词的意思；沙暴（heavy_kick 命中帧 cover_options）后下一题选项盖沙 1.5 秒
//   玄铁：速答窗口 / 超时 +2 秒；答错挨打 ×1.5；他离必杀差 CHARGE_LEFT 次速答时蓄力，要连对 2 题才打断，只对 1 题金钟罩不破
//   黄师傅：速答窗口 / 超时 −1.5 秒；慢答答对有 30% 被他闪开（dodge_roll + 残影，不掉血）
// 没做：黄师傅「三连快攻」（规范 4.8）——留到试打后再定。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, KC = C.CAMPAIGN, NC = C.NEWCITY;
  const camp = g => g.camp;
  const bossFight = g => { const cp = g.camp, E = g.p && g.p[1]; return !!(cp && E && !E.mv.minion && cp.wave > g.campWaves()); };
  const bossKind = g => bossFight(g) ? g.p[1].mv.newCity || null : null;

  // ================= 路线：挑战模式城市池 =================
  const baseRoute = G.campMakeRoute;
  G.campMakeRoute = function (opts) {
    if (opts.random == null) opts.random = this.menu.campMode === 'challenge';
    if (!opts.random) return baseRoute.call(this, opts);   // 剧情：固定路线
    const last = KC.RANDOM.LAST, n = KC.ROUTE.length - 1;
    // offline 的城（现在是巴黎）不进池，抽满 5 城时不会少抽一座
    const playable = c => { const city = KC.CITIES[c]; return !!(city && !city.offline); };
    const pool = KC.ROUTE.filter(c => c !== last && playable(c)).concat((KC.POOL || []).filter(c => playable(c) && (window.WF_CAMPAIGN_DATA || {}).stages && WF_CAMPAIGN_DATA.stages[c]));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, n).concat([last]);
  };
  // 血量 / 答题水平：按站数取剧情同一站的数值，再乘该城的 hpMult、加 accAdj、乘 delayMult；都压在最终站（金霸霸）之下
  const baseCity = G.campCityFor;
  G.campCityFor = function (id, route) {
    const c = baseCity.call(this, id, route), base = KC.CITIES[id];
    if (!base || !(base.hpMult || base.accAdj || base.delayMult) || c === base) return c;
    const top = KC.CITIES[KC.RANDOM.LAST], o = Object.assign({}, c);
    if (base.hpMult) o.opponentHp = Math.min(top.opponentHp - 100, Math.round(c.opponentHp * base.hpMult / 10) * 10);
    if (c.ai) {
      const acc = Math.min(top.ai.accuracy - 0.01, c.ai.accuracy + (base.accAdj || 0)), dm = base.delayMult || 1;
      o.ai = { accuracy: Math.round(acc * 100) / 100, delay: [Math.round(c.ai.delay[0] * dm * 10) / 10, Math.round(c.ai.delay[1] * dm * 10) / 10] };
    }
    return o;
  };

  // ================= 每场 Boss 战的状态 =================
  const st = g => {
    const E = g.p && g.p[1];
    if (!g.nc || g.nc.E !== E) g.nc = { E, mummy: null, sinceDie: 99, sandNext: false, charge: null, dodgeQ: null, lookN: 0, sandN: 0, dodgeN: 0, breakN: 0, chargeN: 0 };
    return g.nc;
  };

  // ================= 答题时间：玄铁 +2 秒 / 黄师傅 −1.5 秒（速答窗口和超时一起挪） =================
  const timeDelta = g => { const k = bossKind(g); return k === 'xuantie' ? NC.xuantie.TIME_PLUS : k === 'huang' ? -NC.huang.TIME_MINUS : 0; };
  const baseFast = G.campFastS;
  G.campFastS = function (s) { const v = baseFast.call(this, s); return s === 0 ? Math.max(1.5, v + timeDelta(this)) : v; };
  const baseTO = G.campTimeout;
  G.campTimeout = function () { return baseTO.apply(this, arguments) + timeDelta(this); };

  // ================= 法老王：木乃伊 + 形近干扰词 =================
  let quizCache = {};
  const lev = (a, b, cap) => {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > cap) return cap + 1; prev = cur;
    }
    return prev[b.length];
  };
  G.ncLookalikes = function (q) {
    const bank = (this.banks || []).find(b => b.id === q.bank) || this.bank; if (!bank || !bank.words) return [];
    const quiz = quizCache[bank.id] || (quizCache[bank.id] = new WF.Quiz(bank, Math.random));
    const w0 = String(q.word).toLowerCase(), cap = w0.length <= 4 ? 1 : 2, out = [];
    const tw = bank.words.find(w => w.word === q.word), pf = WF.Quiz.profile(tw || { senses: [{ zh: q.meaning, pos: q.pos }] });
    for (const w of bank.words) {
      const x = String(w.word).toLowerCase(); if (x === w0 || x[0] !== w0[0] || /\s/.test(x)) continue;
      const d = lev(w0, x, cap); if (d > cap) continue;
      const s = WF.Quiz.senses(w)[0]; if (!s) continue;
      const g = WF.Quiz.short(s.zh); if (!g || q.options.includes(g) || out.some(o => o.g === g) || WF.Quiz.clash(pf, g)) continue;
      if (q.fmt === 'zh-en' && (q.options.some(option => option.toLowerCase() === x)
          || out.some(o => o.word.toLowerCase() === x) || !WF.Quiz.englishDistractor(w, q.meaning))) continue;
      out.push({ d, word: w.word, g });
    }
    out.sort((a, b) => a.d - b.d || Math.random() - 0.5);
    return out;
  };
  const baseDecor = G.campDecorateQ;
  G.campDecorateQ = function (q) {
    baseDecor.call(this, q);
    const k = bossKind(this); if (!k) return;
    const S = st(this);
    if (k === 'pharaoh') {
      const E = this.p[1];
      if (!S.mummy) { S.sinceDie++; if (S.sinceDie >= NC.pharaoh.MUMMY_EVERY) { S.mummy = { ph: 'spawn', t: 0 }; S.sinceDie = 0; this.popWorld('木乃伊出现：选项里混进形近词！', E.x, C.GROUND_Y - 62, '#e9d7a6', 20); WF.Audio.play('whoosh'); this.say('法老王召出木乃伊（形近干扰词）'); } }
      if (S.mummy && S.mummy.ph !== 'die' && q.kind === 'word' && q.options && q.options.length === 4) {
        const alts = this.ncLookalikes(q).slice(0, NC.pharaoh.LOOKALIKE), slots = [0, 1, 2, 3].filter(i => i !== q.correct && i !== q.erased);
        q.lookalike = {};
        alts.forEach((a, n) => {
          const i = slots[n];
          if (i == null) return;
          const reverse = q.fmt === 'zh-en';
          q.options[i] = reverse ? a.word : a.g;
          q.lookalike[i] = reverse ? a.g : a.word;
        });
        if (alts.length) { S.lookN++; this.say(`木乃伊干扰：${q.word} ← ${alts.map(a => a.word).join(', ')}`); }
      }
      if (S.sandNext) { S.sandNext = false; q.sand = { t: 0, dur: Math.round(NC.pharaoh.SAND_S * C.FPS) }; S.sandN++; this.say('沙暴：选项盖沙 ' + NC.pharaoh.SAND_S + ' 秒'); }
    }
  };
  // 打掉木乃伊：你答对一题它就散成沙
  const baseOnAns = G.campOnAnswer;
  G.campOnAnswer = function (q, rec, was) {
    baseOnAns.call(this, q, rec, was);
    const k = bossKind(this); if (!k) return;
    const S = st(this);
    if (k === 'pharaoh' && rec.ok && S.mummy && S.mummy.ph !== 'die') { S.mummy = { ph: 'die', t: 0 }; this.popWorld('木乃伊散了', this.p[1].x - 20 * this.p[1].dir * -1, C.GROUND_Y - 40, '#e9d7a6', 18); }
    if (k === 'xuantie' && S.charge) { if (rec.ok) S.charge.got++; else S.charge.got = 0; }
  };
  // 沙暴命中帧（heavy_kick 的 cover_options 事件）→ 下一题盖沙
  const baseEnter = WF.Fighter.prototype.enter;
  WF.Fighter.prototype.enter = function () {
    baseEnter.apply(this, arguments);
    const f = this.frame(), g = WF.game;
    if (f && f.ev && f.ev.includes('cover_options') && g && this.side === 1 && bossKind(g) === 'pharaoh') st(g).sandNext = true;
  };

  // ================= 玄铁：答错 ×1.5 + 金钟罩蓄力（连对 2 题才打断） =================
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, D, dmg) {
    let v = baseTaken.call(this, A, D, dmg);
    if (D.side === 0 && A && A.mv && A.mv.newCity === 'xuantie' && bossFight(this) && this.q && this.q.playerWrong) { const v0 = v; v *= NC.xuantie.WRONG_MULT; this.say(`玄铁：答错挨打 ×${NC.xuantie.WRONG_MULT}（${Math.round(v0)}→${Math.round(v)}）`); }
    return v;
  };
  const baseBegin = G.beginAttack;
  G.beginAttack = function (s, opts) {
    const k = bossKind(this), S = k ? st(this) : null;
    const keep = k === 'xuantie' && s === 0 && S.charge && S.charge.got < NC.xuantie.BREAK_N ? this.streak[1] : null;
    baseBegin.call(this, s, opts);
    if (keep != null) { this.streak[1] = keep; this.popWorld(`金钟罩挡住了（再对 ${NC.xuantie.BREAK_N - S.charge.got} 题）`, this.p[1].x, C.GROUND_Y - 64, '#ffd23c', 20); }
    else if (k === 'xuantie' && s === 0 && S.charge) { S.charge = null; S.breakN++; this.popWorld('金钟罩破！', this.p[1].x, C.GROUND_Y - 64, '#ffffff', 30); WF.Audio.play('block'); this.say('玄铁蓄力被连对 2 题打断'); }
    // 黄师傅：慢答答对，30% 被闪开
    const pa = this.pendingAttack;
    if (k === 'huang' && s === 0 && pa && pa.side === 0 && pa.kind === 'slow' && this.rand() < NC.huang.DODGE) { S.dodgeQ = this.q && this.q.n; this.say('黄师傅闪开了慢答的这一下'); }
  };
  const baseContact = G.contact;
  G.contact = function (A, D, f, o) {
    const k = bossKind(this), S = k ? st(this) : null;
    if (k === 'huang' && A.side === 0 && D === this.p[1] && S.dodgeQ != null && this.q && S.dodgeQ === this.q.n && o && o.lvl !== 'ultFinal' && o.lvl !== 'ult') {
      S.dodgeQ = null; S.dodgeN++;
      D.play('dodge_roll', { loop: false, next: 'idle' });
      const gh = D.data.fx && D.data.fx.kick_ghost; if (gh) WF.FX.sprite(gh, D.worldX(), C.GROUND_Y - D.y, D.dir);
      this.popWorld('闪开了！', D.x, C.GROUND_Y - 58, '#7ad0a0', 28); WF.Audio.play('whoosh');
      return false;
    }
    const r = baseContact.call(this, A, D, f, o);
    // 金钟罩没破：挨了这一下也不播受击，继续蓄力
    if (k === 'xuantie' && A.side === 0 && D === this.p[1] && S.charge && !r && D.hp > 0 && !this.ko) D.play('idle');
    return r;
  };

  // ================= 每帧：木乃伊动画、玄铁蓄力、沙层计时 =================
  const baseUpd = G.update;
  G.update = function () {
    baseUpd.apply(this, arguments);
    const k = bossKind(this);
    if (!k) { if (this.nc && (!this.camp || this.nc.E !== (this.p && this.p[1]))) this.nc = null; return; }
    const S = st(this), q = this.q;
    if (S.mummy) {
      S.mummy.t++;
      const an = (WF_CAMPAIGN_DATA.summons || {}).mummy, A = an && an.anims;
      if (A && S.mummy.ph === 'spawn' && S.mummy.t >= A.spawn.n * A.spawn.t) S.mummy = { ph: 'idle', t: 0 };
      if (A && S.mummy.ph === 'die' && S.mummy.t >= A.die.n * A.die.t + 6) S.mummy = null;
      if (this.ko) S.mummy = S.mummy && S.mummy.ph !== 'die' ? { ph: 'die', t: 0 } : S.mummy;
    }
    if (q && q.sand && !this.paused) q.sand.t++;
    if (k === 'xuantie') {
      const need = this.ultAt(1) - (NC.xuantie.CHARGE_LEFT || 1);   // 差 CHARGE_LEFT 次速答就放必杀时开始蓄力
      if (!S.charge && this.streak[1] >= need && this.streak[1] > 0) { S.charge = { got: 0, t: 0 }; S.chargeN++; this.popWorld(`金钟罩蓄力！连对 ${NC.xuantie.BREAK_N} 题打断`, this.p[1].x, C.GROUND_Y - 64, '#ffd23c', 22); WF.Audio.play('superflash'); this.say('玄铁金钟罩蓄力'); }
      if (S.charge) { S.charge.t++; if (this.streak[1] < need) S.charge = null; }
    }
  };

  // ================= 画面：木乃伊（法老王身前）、金钟罩气晕、选项沙层 =================
  const baseFront = G.drawWorldFront;
  G.drawWorldFront = function (w, li) {
    if (baseFront) baseFront.call(this, w, li);
    const S = this.nc; if (!S || !bossFight(this)) return;
    const E = this.p[1];
    if (S.mummy) {
      const sm = (WF_CAMPAIGN_DATA.summons || {}).mummy; if (!sm) return;
      const a = sm.anims[S.mummy.ph], im = WF.FX.img(a.src); if (!im.complete || !im.naturalWidth) return;
      const fi = a.loop ? Math.floor(S.mummy.t / a.t) % a.n : Math.min(a.n - 1, Math.floor(S.mummy.t / a.t));
      const x = Math.round(E.worldX() + E.dir * 24 - li), y = C.GROUND_Y;
      w.save(); w.translate(x, 0); if (E.dir < 0) w.scale(-1, 1);
      w.drawImage(im, fi * sm.w, 0, sm.w, sm.h, -sm.foot[0], y - sm.foot[1], sm.w, sm.h); w.restore();
    }
  };
  const baseBehind = G.drawWorldBehind;
  G.drawWorldBehind = function (w, li) {
    if (baseBehind) baseBehind.call(this, w, li);
    const S = this.nc; if (!S || !S.charge || !bossFight(this)) return;
    const E = this.p[1], fx = E.data.fx && E.data.fx.armor_glow; if (!fx) return;
    const im = WF.FX.img(fx.src); if (!im.complete || !im.naturalWidth) return;
    const fi = Math.floor(S.charge.t / fx.t) % fx.n, X = Math.round(E.worldX() - li), Y = Math.round(C.GROUND_Y - E.y);
    w.drawImage(im, fi * fx.w, 0, fx.w, fx.h, X - fx.o[0], Y - fx.o[1] - 6, fx.w, fx.h);
  };
  const basePanel = G.drawPanel;
  G.drawPanel = function () {
    basePanel.apply(this, arguments);
    const q = this.q; if (!q) return;
    const c = this.ctx, top = 402, hasEx = !!(q.ex && q.ex.en), bw = 222, gap = 12, x0 = (C.SCREEN_W - (bw * 4 + gap * 3)) / 2, y = hasEx ? top + 68 : top + 60, bh = hasEx ? 60 : 66;
    // 形近词：揭晓后在被换掉的选项下面小字标出是哪个词的意思
    if (q.lookalike && q.revealed) for (const i in q.lookalike) this.txt('形近：' + q.lookalike[i], x0 + i * (bw + gap) + bw / 2, y + bh - 9, 12, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    // 沙层：0–5 帧循环盖住，最后 4 帧（6、7）变稀揭开；橡皮擦擦掉的选项也盖
    if (q.sand && q.sand.t < q.sand.dur && !q.revealed) {
      const E = this.p[1], fx = E && E.data.fx && E.data.fx.sand_cover; if (!fx) return;
      const im = WF.FX.img(fx.src); if (!im.complete || !im.naturalWidth) return;
      const left = q.sand.dur - q.sand.t, fi = left <= 2 * fx.t ? Math.min(fx.n - 1, fx.n - Math.ceil(left / fx.t)) : Math.floor(q.sand.t / fx.t) % Math.max(1, fx.n - 2);
      const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
      for (let i = 0; i < 4; i++) c.drawImage(im, fi * fx.w, 0, fx.w, fx.h, x0 + i * (bw + gap) - 2, y - 2, bw + 4, bh + 4);
      c.imageSmoothingEnabled = sm;
    }
  };
  // ================= 成就：三城 Boss（结算时由 v17_sys campGrant 颁发）+ 三城都打过 =================
  if (WF.Ach && WF.Ach.add) {
    const run = { test: () => false };
    WF.Ach.add('clear', 'beat_falaowang', '法老退朝', '挑战模式打败埃及·金字塔的法老王', run);
    WF.Ach.add('clear', 'beat_xuantie', '金钟罩破了', '挑战模式打败河南·少林寺的玄铁', run);
    WF.Ach.add('clear', 'beat_huangshifu', '无影脚也有影', '挑战模式打败佛山的黄师傅', run);
    WF.Ach.add('clear', 'beat_newcity3', '三城巡礼', '法老王、玄铁、黄师傅都打败过', WF.Ach.cnt((L, g) => ['beat_falaowang', 'beat_xuantie', 'beat_huangshifu'].filter(id => g && g.ach[id]).length, 3));
  }
  // 揭开前按键：沙子盖着也能按（规范只要求挡字），不另加限制
  WF.NewCity = { st, bossKind };
})();
