// v2.1 今日踢馆（每日复习关）+ 词库掌握进度
// · 主菜单「今日踢馆」：把今天到期的词（最多 20 个，最早到期的在前）排成词单，不够 15 个用易错词补；
//   打一场守馆人（电脑对手，血更厚），赢了 = 今天的复习完成，发闯关积分；每天一次，输了当天可以再来。
// · 掌握进度：3 个不同的日子答对算掌握（见 v21_memory.js），主菜单和单词书显示「四级 320 / 4431」。
(function () {
  const W = window.WF = window.WF || {};
  const C = W.CFG, G = W.Game && W.Game.prototype, P = W.Profiles, Mem = W.Memory;
  if (!G || !Mem) return;
  const K = C.KICK = { MAX: 20, MIN: 15, REWARD: 200, HP_PER: 90, HP_MAX: 2000, EXTRA: 5 };   // EXTRA：全场最多补考几次（≈ 词数 + 5 题内打完）

  const bankOk = (g, id) => (g.banks || []).some(b => b.id === id);
  const bankName = (g, id) => { const b = (g.banks || []).find(x => x.id === id); return b ? b.name : id; };
  const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

  // 今天的词单：当天第一次打开时定下来；如果当时是空的，之后有了到期 / 易错词会重算
  G.kickQueue = function (pid) {
    const p = P.ext(pid); if (!p) return null;
    const today = Mem.today();
    let k = p.kick;
    if (k && k.day === today && (k.words.length || k.done)) return k;
    const seen = new Set(), words = [];
    const add = (h, src) => { const key = h.bank + '\t' + h.word; if (seen.has(key) || !bankOk(this, h.bank)) return; seen.add(key); words.push({ bank: h.bank, word: h.word, src }); };
    for (const h of Mem.dueList(pid)) { if (words.length >= K.MAX) break; add(h, 'due'); }
    for (const h of Mem.riskList(pid)) { if (words.length >= K.MIN) break; add(h, 'risk'); }
    k = p.kick = { day: today, words, done: false, tries: (k && k.day === today ? k.tries : 0) || 0 };
    P.save();
    return k;
  };
  G.kickState = function (pid) {
    const k = pid && this.kickQueue(pid);
    return !k ? 'none' : k.done ? 'done' : k.words.length ? 'ready' : 'empty';
  };
  G.kickGuardian = function (day) {
    const pool = C.ROSTER.filter(id => id !== this.menu.char);
    return pool[hash(day || Mem.today()) % pool.length];
  };

  // ---------- 主菜单入口 ----------
  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice(), i = b.findIndex(x => x.key === 'wrongbook');
    const bt = { key: 'kick', label: '今日踢馆', group: 'study' };
    try { bt.dot = !!(this.menu.p1 && this.kickState(this.menu.p1) === 'ready'); } catch (e) {}
    b.splice(i < 0 ? b.length : i + 1, 0, bt);
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, d) { if (key === 'kick') { this.goKick(); return; } return baseAct.call(this, key, d); };
  G.goKick = function () {
    if (!this.menu.p1) { this.goProfiles(0); return; }
    this.state = 'title'; this.ui.screen = 'kick'; WF.Audio.play('menu');
  };
  G.kickBack = function () { this.ui.screen = 'title'; this.menu.row = Math.max(0, this.homeButtons().findIndex(b => b.key === 'kick')); WF.Audio.play('menu'); };
  G.kickKey = function (code) {
    if (code === 'Escape' || code === 'Backspace') return this.kickBack();
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { if (this.kickState(this.menu.p1) === 'ready') this.kickStart(); else this.kickBack(); }
  };
  G.kickClick = function (hit) {
    if (hit.key === 'back') this.kickBack();
    else if (hit.key === 'kickGo') this.kickStart();
  };

  G.drawKick = function () {
    const c = this.ctx, SW = C.SCREEN_W, pid = this.menu.p1, k = this.kickQueue(pid), st = this.kickState(pid);
    c.fillStyle = 'rgba(6,3,16,0.84)'; c.fillRect(0, 0, SW, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    this.txt('今日踢馆', SW / 2, 40, 38, '#ff8a3d', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`${Mem.today()} · 打赢守馆人 = 今天的复习完成 · 每天一次`, SW / 2, 76, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    const pf = P.ext(pid);
    if (pf) this.txt(`闯关积分 ${pf.points}`, SW - 40, 30, 16, '#ffd23c', 'right', { sw: 4, weight: 700 });
    const x = 110, w = SW - 220, y = 96, h = 300;
    this.box(x, y, w, h, 'rgba(20,14,40,0.9)', st === 'done' ? '#7dff9a' : '#5d4f86', 2);
    let btn = '返回菜单';
    if (st === 'done') {
      this.txt('✔ 今日已踢馆', SW / 2, y + 100, 40, '#7dff9a', 'center', { font: C.FONT_TITLE, sw: 8 });
      this.txt(`今天的 ${k.words.length} 个词已经复习过了，奖励 +${K.REWARD} 闯关积分已发放`, SW / 2, y + 160, 17, '#ffffff', 'center', { sw: 4, weight: 700 });
      this.txt('明天再来：新到期的词会自动排进词单', SW / 2, y + 194, 15, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    } else if (st !== 'ready') {
      this.txt('今天没有要复习的词', SW / 2, y + 96, 30, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 6 });
      this.txt('去「单人闯关」或「电脑陪练」多答几题吧——', SW / 2, y + 150, 17, '#ffffff', 'center', { sw: 4, weight: 700 });
      this.txt('答过的词会按 1 / 3 / 7 / 15 天排进复习，到期了就会出现在这里', SW / 2, y + 178, 15, '#bfb3d6', 'center', { sw: 3, weight: 700 });
      this.txt('答错和答得慢的词也会来这里补课', SW / 2, y + 204, 15, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    } else {
      const due = k.words.filter(e => e.src === 'due').length, risk = k.words.length - due;
      this.txt(`今日词单 ${k.words.length} 个 · 到期 ${due} · 易错 ${risk}`, x + 20, y + 22, 18, '#ffffff', 'left', { sw: 4, weight: 700 });
      const cols = 4, cw = (w - 40) / cols;
      k.words.slice(0, 20).forEach((e, i) => {
        const cx = x + 20 + (i % cols) * cw, cy = y + 54 + Math.floor(i / cols) * 34;
        this.box(cx, cy - 13, cw - 10, 28, 'rgba(12,8,26,0.9)', e.src === 'due' ? '#8fd0ff' : '#ff8a8a', 1);
        this.txt(e.word, cx + 10, cy + 1, 16, '#ffffff', 'left', { sw: 3, weight: 700, maxW: cw - 70, font: '"Noto Serif","Georgia",serif' });
        this.txt(bankName(this, e.bank), cx + cw - 18, cy + 2, 11, '#8f86b8', 'right', { sw: 2, weight: 700, maxW: 52 });
      });
      const gid = this.kickGuardian(k.day), mv = C.MOVES[gid];
      this.txt(`守馆人：${mv ? mv.name : gid} · 血量 ${this.kickHp(k.words.length)}（比平时厚）`, x + 20, y + h - 46, 16, '#ff8a3d', 'left', { sw: 4, weight: 700 });
      this.txt(`打赢奖励：+${K.REWARD} 闯关积分（每天一次）${k.tries ? ` · 今天已挑战 ${k.tries} 次` : ''}`, x + 20, y + h - 20, 15, '#ffd23c', 'left', { sw: 3, weight: 700 });
      btn = '开始踢馆';
    }
    const bw = 300, bh = 56, bx = (SW - bw) / 2, by = 420;
    WF.Buttons.plate(this, { x: bx, y: by, w: bw, h: bh }, 'focus');
    this.txt(btn, SW / 2, by + bh / 2 + 2, st === 'ready' ? 28 : 22, '#ffd23c', 'center', { font: st === 'ready' ? C.FONT_TITLE : C.FONT, sw: 5, weight: 700 });
    this.menuRects.push({ x: bx, y: by, w: bw, h: bh, key: st === 'ready' ? 'kickGo' : 'back', i: 0 });
    if (!WF.touch) this.txt('Enter ' + btn + '    Esc 返回', SW / 2, 520, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };
  G.kickHp = n => Math.max(C.HP, Math.min(K.HP_MAX, Math.round(n * K.HP_PER / 50) * 50));

  // ---------- 开打：电脑陪练的一局，换成踢馆词单 ----------
  // 词单题源：每个词先考一遍（顺序打乱）；答错的过 3 题再考一次（全场最多补考 EXTRA 次）；
  // 第二次还错就算「复习过但没记住」（记忆照常记错），不再拖住比赛。词单考完 = 守馆人倒下。
  class KickSource {
    constructor(g, words) {
      this.g = g; this.id = 'word'; this.name = '今日踢馆'; this.quiz = {};
      const a = words.map(e => ({ bank: e.bank, word: e.word, src: e.src, miss: 0, done: null }));
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      this.words = a; this.pending = a.slice(); this.reasks = 0; this.served = 0; this.lastQ = null;
    }
    get size() { return this.words.length; }
    get resolved() { return this.words.filter(e => e.done).length; }
    get correct() { return this.words.filter(e => e.done === 'ok').length; }
    get exhausted() { return this.words.every(e => e.done); }
    quizFor(id) { const b = this.g.banks.find(x => x.id === id); if (!b || !b.words || !b.words.length) return null; return this.quiz[id] || (this.quiz[id] = new WF.Quiz(b, this.g.rnd)); }
    // 一道词单题有了结果（任何出题方式：普通题、角力、浮空追打；没答 / 超时算错）
    result(q, ok) {
      const e = q && q.kick; if (!e || q._kickRes) return; q._kickRes = true;
      if (e.done) return;   // 已经算过（补考时答对也不再掉守馆人的血）
      if (ok) { e.done = 'ok'; return; }
      e.miss++;
      if (e.miss === 1 && this.reasks < K.EXTRA) { this.reasks++; this.pending.splice(Math.min(3, this.pending.length), 0, e); }
      else e.done = 'fail';
    }
    next() {
      if (this.lastQ && !this.lastQ._kickRes) this.result(this.lastQ, false);   // 上一题没答
      let e = null;
      while (this.pending.length && !e) { const c = this.pending.shift(); if (!c.done) e = c; }
      let bonus = false;
      if (!e) { bonus = true; const rest = this.words.filter(x => x !== (this.lastQ && this.lastQ.kick)); e = rest[Math.floor(this.g.rand() * rest.length)] || this.words[0]; }
      const qz = e && this.quizFor(e.bank), w = qz && qz.words.find(x => x.word === e.word);
      let q;
      if (w) { q = qz.build(w); q.kind = 'word'; q.bank = e.bank; }
      else { if (e && !e.done) e.done = 'fail'; const z = this.quizFor(this.g.bank && this.g.bank.id) || this.quizFor('cet4'); q = z.next(); q.kind = 'word'; q.bank = z.bank.id; bonus = true; }
      if (!bonus) { q.kick = e; this.served++; }
      this.lastQ = q;
      return q;
    }
  }
  // 守馆人的血只看词单进度：maxHp × 还没结果的词 / 词数
  G.kickTargetHp = function () {
    const src = this.source, E = this.p && this.p[1];
    if (!src || !src.words || !E) return null;
    return Math.round(E.maxHp * (src.size - src.resolved) / src.size);
  };

  G.kickStart = function () {
    const pid = this.menu.p1, k = pid && this.kickQueue(pid);
    if (!k || k.done || !k.words.length) return;
    if (!this.dailyKick) {
      const m = this.menu;
      this._kickSaved = { mode: m.mode, wrongMatch: m.wrongMatch, cpu: m.cpu, cpuChar: m.cpuChar, roundTime: m.roundTime };
    }
    this.dailyKick = { day: k.day, n: k.words.length, won: false };
    Object.assign(this.menu, { mode: 'word', wrongMatch: false, cpu: true, cpuChar: this.kickGuardian(k.day), roundTime: 0 });
    k.tries = (k.tries || 0) + 1; P.save();
    WF.Audio.play('menu');
    this.startMatch();
  };
  G.kickExit = function () {
    if (!this.dailyKick) return;
    this.dailyKick = null;
    const s = this._kickSaved; this._kickSaved = null;
    if (s) { Object.assign(this.menu, s); if (this.persistMenu) this.persistMenu(); }
  };
  const kickBanks = (g) => { const k = g.menu.p1 && g.kickQueue(g.menu.p1); if (!k) return []; const ids = [...new Set(k.words.map(e => e.bank))]; return ids.map(id => g.banks.find(b => b.id === id)).filter(Boolean); };

  const baseMatch = G.startMatch;
  G.startMatch = function () {
    if (this.dailyKick && this.state === 'result') {   // 结算页上 Enter / 点击：赢了回踢馆页，输了再来一次
      if (this.dailyKick.won) { this.kickExit(); this.goTitle(); this.goKick(); return; }
      const k = this.kickQueue(this.menu.p1); if (k) { k.tries = (k.tries || 0) + 1; P.save(); }
    }
    if (this.dailyKick && this.bankGate && this.bankGate(kickBanks(this), () => this.startMatch())) return;
    const r = baseMatch.apply(this, arguments);
    if (this.dailyKick && this.state === 'intro') {
      const k = this.kickQueue(this.menu.p1);
      this.source = new KickSource(this, k.words);
      this.memRun = null; this.wlAdapt = null;
      const E = this.p[1], hp = this.kickHp(k.words.length);
      E.maxHp = E.hp = E.trail = hp; E.kickGuard = true;
      this.announce = { text: '今日踢馆', sub: '守馆人 ' + E.mv.name + ' · 词单 ' + k.words.length + ' 个', t: 0, life: 70 };
    }
    return r;
  };
  // 结果：所有作答都会经过 Profiles.markAnswer（普通题、角力、浮空追打）
  const baseMark = P.markAnswer;
  P.markAnswer = function (id, q, ok) {
    const r = baseMark.apply(this, arguments), g = W.game;
    if (g && g.dailyKick && q && q.kick && id === g.menu.p1 && g.source && g.source.result) g.source.result(q, !!ok);
    return r;
  };
  // 超时没答：当场算错（不用等下一题）
  const baseEnd = G.endQuestion;
  G.endQuestion = function () {
    const q = this.q;
    if (this.dailyKick && this.state === 'question' && q && q.kick && q.ans && !q.ans[0] && this.source && this.source.result) this.source.result(q, false);
    return baseEnd.apply(this, arguments);
  };
  const baseQT = G.qtypeName;
  G.qtypeName = function () {
    const src = this.source;
    if (this.dailyKick && src && src.words) return `今日踢馆 · 已复习 ${src.resolved} / ${src.size}`;
    return baseQT ? baseQT.apply(this, arguments) : (this.menu.wrongMatch ? '错题对战' : this.modeName());
  };
  // 伤害：打到守馆人时血量直接按词单进度算（连击 / 暴击照常演出，不另外掉血）；词单的最后一个词答对那一下 KO
  const baseDmg = G.damage;
  G.damage = function (A, D, amount) {
    if (this.dailyKick && this.p && D === this.p[1] && A === this.p[0]) {
      const hp = this.kickTargetHp();
      if (hp != null) {
        const was = D.hp; D.hp = Math.min(was, hp); D.trailHold = 13;
        if (this.stats && this.stats[0]) this.stats[0].dmg += was - D.hp;
        return D.hp <= 0;
      }
    }
    return baseDmg.apply(this, arguments);
  };
  // 词单都有结果了守馆人却还站着（最后一个词答错、或在角力里答完）：下一题不出了，直接补一记收尾
  const baseNQ = G.newQuestion;
  G.newQuestion = function () {
    const src = this.source, A = this.p && this.p[0], D = this.p && this.p[1];
    if (this.dailyKick && !this.ko && src && src.words && src.exhausted && D && D.hp > 0 && A && A.hp > 0) {
      this.state = 'resolve'; this.kickFinisher = true;
      this.run(this.attackSeq(A, D, this.pickMove(A, A.mv.combo[0]), { dmg: D.hp, lvl: 'heavy' }));
      return;
    }
    return baseNQ.apply(this, arguments);
  };
  const baseResult = G.showResult;
  G.showResult = function () {
    const r = baseResult.apply(this, arguments);
    const dk = this.dailyKick;
    if (dk && this.result && !this.camp) {
      const win = !this.result.draw && this.result.winner === 0;
      const k = this.kickQueue(this.menu.p1), pf = P.ext(this.menu.p1);
      if (win && k && !k.done) {
        k.done = Date.now(); dk.won = true; dk.reward = K.REWARD;
        if (pf) pf.points += K.REWARD;
        P.save();
        WF.Audio.play('fight');
      } else if (win) dk.won = true;
      this.result.kick = { win, reward: dk.reward || 0 };
    }
    return r;
  };
  const baseDR = G.drawResult;
  G.drawResult = function () {
    baseDR.apply(this, arguments);
    const r = this.result; if (!this.dailyKick || !r || !r.kick || r.t < 6) return;
    const SW = C.SCREEN_W, win = r.kick.win;
    this.box(150, 466, SW - 300, 66, win ? 'rgba(20,60,30,0.96)' : 'rgba(60,20,24,0.96)', win ? '#7dff9a' : '#ff8a8a', 2);
    this.txt(win ? `踢馆成功！今天的复习完成${r.kick.reward ? ` · +${r.kick.reward} 闯关积分` : ''}` : '守馆人守住了 · 今天还能再来', SW / 2, 486, 20, win ? '#7dff9a' : '#ffb0b0', 'center', { sw: 4, weight: 700 });
    if ((r.t >> 4) % 2 === 0 || r.t < 30) this.txt(win ? 'Enter / 点击 回到踢馆页    Esc 返回标题' : 'Enter / 点击 再来一次    Esc 返回标题', SW / 2, 515, 15, '#ffd23c', 'center', { sw: 4 });
  };
  // 踢馆期间临时改的菜单（对手 / 题型 / 时长）不写进本地设置
  const basePersist = G.persistMenu;
  G.persistMenu = function () { if (this.dailyKick) return; return basePersist.apply(this, arguments); };
  const baseGoTitle = G.goTitle;
  G.goTitle = function () { if (this.dailyKick) this.kickExit(); return baseGoTitle.apply(this, arguments); };

  // ---------- 掌握进度：主菜单 ----------
  G.masteryLine = function (pid, bank) {
    if (!pid || !bank || bank.id === 'math') return null;
    const pr = Mem.progress(pid, bank.id); if (!pr.total) return null;
    return { name: bank.name, done: pr.done, total: pr.total };
  };
  const baseTitle = G.drawTitle;
  G.drawTitle = function () {
    baseTitle.apply(this, arguments);
    if ((this.ui.screen || 'title') !== 'title') return;
    const b = (this.banks || [])[this.menu.bank], m = this.masteryLine(this.menu.p1, b);
    if (!m) return;
    const pw = 230, px = C.SCREEN_W - pw - 16, py = 14, ph = 48;
    this.txt(`掌握 · ${m.name} ${m.done} / ${m.total}`, px + pw - 4, py + ph + 32, 13, '#7dff9a', 'right', { sw: 3, weight: 700 });
  };
})();
