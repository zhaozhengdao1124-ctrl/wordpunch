// v2.0 四级 / 六级按难度出词。词的难度 1–5 来自 data/word_levels.js（tools/word_levels.py 生成，词库内相对分级）。
// 只对有分级数据的词库生效（目前 cet4、cet6）；其他词库、双人对战、联网对战照旧随机出词。
// 难度档 notch 0–6 = 模式基准（简单 0 / 普通 1 / 困难 2 / 修罗 3）+ 闯关进度（第几座城，0–2）+ 城市对手 / 最终 Boss（+1）+ 自适应（-2…+2）。
// 自适应：连续答错 3 题（超时算错）降一档；连续答对 8 题升一档。每局重新计。修罗另有约 20% 的题来自错题本。
(function () {
  const G = WF.Game.prototype, LV = window.WF_WORD_LEVELS || {};
  const D = WF.CFG.WORD_LEVEL = {
    BASE: { easy: 0, normal: 1, hard: 2, shura: 3 },
    // 每档 1–5 级的出词比例（%）
    MIX: [
      [45, 30, 15, 7, 3],     // 0 简单开局：1–2 级 75%
      [30, 30, 22, 12, 6],    // 1 普通开局
      [18, 25, 27, 20, 10],   // 2 困难开局：接近词库本身的比例
      [10, 18, 27, 27, 18],   // 3 修罗开局：4–5 级 45%
      [5, 12, 23, 32, 28],    // 4
      [3, 7, 18, 35, 37],     // 5
      [2, 5, 13, 35, 45],     // 6 最难：4–5 级 80%
    ],
    PROG_MAX: 2, BOSS: 1, ADJ_MAX: 2, WRONG_RUN: 3, RIGHT_RUN: 8, SHURA_BOOK: 0.2,
  };
  const levelMap = {};
  WF.WordLevel = {
    has: id => !!LV[id],
    of(id, word) {
      if (!LV[id]) return 0;
      if (!levelMap[id]) { const m = levelMap[id] = new Map(); for (const l in LV[id]) for (const w of LV[id][l].split(' ')) if (w) m.set(w, +l); }
      return levelMap[id].get(word) || 0;
    },
    mix: notch => D.MIX[Math.max(0, Math.min(D.MIX.length - 1, notch | 0))],
  };

  // ---------- 出词：有 levelFn 且词库有分级时，先按比例抽难度，再在该难度里随机挑词 ----------
  const basePick = WF.Quiz.prototype.pick;
  WF.Quiz.prototype.pick = function () {
    const id = this.bank && this.bank.id;
    if (!this.levelFn || !WF.WordLevel.has(id)) return basePick.apply(this, arguments);
    const mix = this.levelFn(); if (!mix) return basePick.apply(this, arguments);
    if (!this.levelBuckets || this.levelBucketsN !== this.words.length) {
      this.levelBuckets = [[], [], [], [], []]; this.levelBucketsN = this.words.length;
      for (const w of this.words) { const l = WF.WordLevel.of(id, w.word); if (l) this.levelBuckets[l - 1].push(w); }
    }
    let tot = 0; for (let i = 0; i < 5; i++) if (this.levelBuckets[i].length) tot += mix[i];
    if (!tot) return basePick.apply(this, arguments);
    let r = this.rnd() * tot;
    for (let i = 0; i < 5; i++) {
      const b = this.levelBuckets[i]; if (!b.length) continue;
      if ((r -= mix[i]) < 0 || i === 4) { this.lastLevel = i + 1; return b[Math.floor(this.rnd() * b.length)]; }
    }
    return basePick.apply(this, arguments);
  };

  const quizOf = src => src && (src.quiz || (src.wordSrc && src.wordSrc.quiz) || (src.fallback && quizOf(src.fallback)));
  G.wordLevelReset = function () { this.wlAdapt = { adj: 0, wrong: 0, right: 0 }; };
  G.wordLevelNotch = function () {
    const a = this.wlAdapt || { adj: 0 };
    if (this.camp) {
      const cp = this.camp, n = (cp.route && cp.route.length) || 1;
      const prog = Math.min(D.PROG_MAX, Math.floor((D.PROG_MAX + 1) * (cp.ci || 0) / n));
      const E = this.p && this.p[1], boss = E && E.mv && !E.mv.minion ? D.BOSS : 0;
      return Math.max(0, Math.min(6, D.BASE[this.diffCamp()] + prog + boss + a.adj));
    }
    return Math.max(0, Math.min(6, D.BASE[this.diffCpu()] + a.adj));
  };
  G.wordLevelMix = function () { return WF.WordLevel.mix(this.wordLevelNotch()); };
  G.wordLevelAttach = function () {
    this.wordLevelReset();
    const qz = quizOf(this.source); if (qz) qz.levelFn = () => this.wordLevelMix();
  };
  G.wordLevelOnResult = function (q, ok) {
    if (!q || q.kind !== 'word' || q._wl || !WF.WordLevel.has(q.bank) || !this.wlAdapt) return;
    q._wl = true; const a = this.wlAdapt;
    if (ok) { a.right++; a.wrong = 0; if (a.right >= D.RIGHT_RUN) { a.right = 0; if (a.adj < D.ADJ_MAX) { a.adj++; this.say && this.say('词难度 +1（连对）'); } } }
    else { a.wrong++; a.right = 0; if (a.wrong >= D.WRONG_RUN) { a.wrong = 0; if (a.adj > -D.ADJ_MAX) { a.adj--; this.say && this.say('词难度 -1（连错）'); } } }
  };

  // 闯关：开局挂上；修罗额外从错题本出题
  const baseCamp = G.startCampaign;
  G.startCampaign = function () { const r = baseCamp.apply(this, arguments); if (this.camp) this.wordLevelAttach(); return r; };
  const baseNext = G.campNextQ;
  G.campNextQ = function () {
    const ws = this.campWrongSrc;
    if (this.diffCamp() === 'shura' && WF.WordLevel.has(this.bank && this.bank.id) && ws && !ws.useFallback && this.rand() < D.SHURA_BOOK) {
      const ents = ws.entries.filter(e => e.kind !== 'phrase' && this.banks.some(b => b.id === e.bank && b.words && b.words.length));
      if (ents.length) { const q = ws.wordFrom(ents[Math.floor(this.rand() * ents.length)]); if (q && q.options && q.options.length === 4) { q.shuraBook = true; return q; } }
    }
    return baseNext.apply(this, arguments);
  };
  // 电脑陪练：按陪练难度；双人对战不挂（levelFn 为空 → 原来的随机出词）
  const baseMatch = G.startMatch;
  G.startMatch = function () {
    const r = baseMatch.apply(this, arguments);
    if (this.state === 'intro' && !this.camp) { if (this.menu.cpu && !this.menu.wrongMatch) this.wordLevelAttach(); else this.wlAdapt = null; }
    return r;
  };
  // 自适应计数：玩家（左边）答题和超时
  const baseAns = G.answerNormal;
  G.answerNormal = function (s, idx) {
    const q = this.q, had = q && q.ans && q.ans[s];
    const r = baseAns.apply(this, arguments);
    if (s === 0 && q && !had && q.ans && q.ans[0]) this.wordLevelOnResult(q, q.ans[0].ok);
    return r;
  };
  const baseEnd = G.endQuestion;
  G.endQuestion = function () {
    const q = this.q;
    if (this.state === 'question' && q && q.ans && !q.ans[0]) this.wordLevelOnResult(q, false);
    return baseEnd.apply(this, arguments);
  };
})();
