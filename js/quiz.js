// v1.3 出题：按「词 + 义项」出题。v1.4 起固定考第一个义项（最常见的意思），它没有可用例句才换义项；有例句就配例句；
// 干扰项 = 同词库、同词性、长度相近的别的词的义项；和目标词任何一个义项有共同词 / 共同两字串 / 共同实义字的一律不要，避免「几个选项都对」。
WF.Quiz = class {
  constructor(bank, rnd) {
    this.bank = bank; this.words = bank.words; this.rnd = rnd || Math.random; this.used = new Set();
  }
  static STOP = /[的地得了着使之者性化等]/g;
  static toks(zh) { return String(zh || '').split(/[，,；;]/).map(s => s.trim()).filter(Boolean); }
  // 选项上显示的短释义：前几个义项拼起来不超过 10 个字
  static short(zh, max = 10) {
    const t = WF.Quiz.toks(zh); let out = t[0] || '';
    for (let i = 1; i < t.length; i++) { const c = out + '，' + t[i]; if (c.length > max) break; out = c; }
    return out;
  }
  static senses(w) {
    if (w && w.senses && w.senses.length) return w.senses;
    return w ? [{ id: (w.pos || 'n.').replace('.', ''), pos: w.pos || '', zh: w.meaning || '', ex: w.ex ? [{ en: w.ex, zh: w.exZh || '', src: 'legacy' }] : [] }] : [];
  }
  // 目标词的「指纹」：所有义项的词、两字串、实义字
  static profile(w) {
    const tk = new Set(), bi = new Set(), ch = new Set();
    for (const s of WF.Quiz.senses(w)) for (const t of WF.Quiz.toks(s.zh)) {
      tk.add(t);
      for (let i = 0; i + 2 <= t.length; i++) bi.add(t.substr(i, 2));
      for (const c of t.replace(WF.Quiz.STOP, '')) ch.add(c);
    }
    return { tk, bi, ch };
  }
  static clash(pf, gloss) {
    for (const t of WF.Quiz.toks(gloss)) {
      if (pf.tk.has(t)) return true;
      for (const x of pf.tk) if (x.includes(t) || t.includes(x)) return true;
      for (let i = 0; i + 2 <= t.length; i++) if (pf.bi.has(t.substr(i, 2))) return true;
      for (const c of t.replace(WF.Quiz.STOP, '')) if (pf.ch.has(c)) return true;
    }
    return false;
  }
  // 兼容 v1.2 的调用（WrongSource 以外的地方也用到）
  static similar(a, b) { return WF.Quiz.clash(WF.Quiz.profile({ meaning: a }), b); }
  static englishDistractor(w, prompt) {
    // 一个英文选项的其他义项也不能与中文题面重合。
    return /[a-z]/i.test(w.word) && !/\p{Script=Han}/u.test(w.word)
      && !WF.Quiz.clash(WF.Quiz.profile(w), prompt);
  }
  index() {
    if (this.pools) return this.pools;
    const pools = { all: [] };
    for (const w of this.words) for (const s of WF.Quiz.senses(w)) {
      const g = WF.Quiz.short(s.zh), e = { w, s, g, len: g.length };
      (pools[s.pos] = pools[s.pos] || []).push(e); pools.all.push(e);
    }
    return (this.pools = pools);
  }
  // 出题只用干净例句：GPT 新写的都可用；旧词库例句须是 ≤12 词、首字母大写、不以省略号开头的完整短句
  static okEx(e) {
    if (!e || !e.en) return false;
    if (e.src !== 'legacy') return true;
    const en = e.en.trim();
    return en.split(/\s+/).length <= 12 && en.length <= 80 && /^[A-Z"“‘']/.test(en) && !/^(\.\.\.|…)/.test(en) && /[.!?。”"']$/.test(en);
  }
  pick() { return this.words[Math.floor(this.rnd() * this.words.length)]; }
  pickSense(w, want) {
    const ss = WF.Quiz.senses(w);
    if (want) { const f = ss.find(s => s.id === want); if (f) return f; }
    // v1.4：考最常见的意思——第一个义项有能用的例句就固定用它；没有才换后面第一个有例句的义项；都没有就用第一个义项（只显示单词 + 词性）
    const QC = WF.CFG && WF.CFG.QUIZ;
    if (!QC || QC.firstSense !== false) {
      const usable = s => (s.ex || []).some(WF.Quiz.okEx);
      return usable(ss[0]) ? ss[0] : (ss.find(usable) || ss[0]);
    }
    const W = [0.62, 0.24, 0.1, 0.04]; let tot = 0;
    const ws = ss.map((s, i) => { const v = (W[i] || 0.03) * ((s.ex || []).some(WF.Quiz.okEx) ? 1.3 : 1); tot += v; return v; });
    let r = this.rnd() * tot;
    for (let i = 0; i < ss.length; i++) if ((r -= ws[i]) <= 0) return ss[i];
    return ss[0];
  }
  next() {
    let w = null;
    for (let i = 0; i < 50; i++) { const c = this.pick(); if (!this.used.has(c.word)) { w = c; break; } }
    if (!w) { this.used.clear(); w = this.pick(); }
    this.used.add(w.word);
    return this.build(w);
  }
  build(w, senseId, preferReverse = this.rnd() < WF.CFG.QUIZ.reverseRatio) {
    const s = this.pickSense(w, senseId), gloss = WF.Quiz.short(s.zh), pf = WF.Quiz.profile(w), P = this.index();
    const reverse = preferReverse && /\p{Script=Han}/u.test(gloss) && !/[a-z]/i.test(gloss)
      && /[a-z]/i.test(w.word) && !/\p{Script=Han}/u.test(w.word);
    const opts = [gloss], picked = [], words = new Set([w.word.toLowerCase()]);
    const ok = (e) => !words.has(e.w.word.toLowerCase()) && !opts.includes(e.g) && !WF.Quiz.clash(pf, e.g)
      && (!reverse || WF.Quiz.englishDistractor(e.w, gloss))
      && !picked.some(p => WF.Quiz.clash(WF.Quiz.profile({ senses: [p.s] }), e.g));
    const passes = [[P[s.pos] || [], 2], [P[s.pos] || [], 4], [P.all, 4], [P.all, 99]];
    for (const [pool, dl] of passes) {
      if (!pool.length) continue;
      for (let i = 0; i < 300 && opts.length < 4; i++) {
        const e = pool[Math.floor(this.rnd() * pool.length)];
        if (Math.abs(e.len - gloss.length) > dl || !ok(e)) continue;
        opts.push(e.g); picked.push(e); words.add(e.w.word.toLowerCase());
      }
      if (opts.length >= 4) break;
    }
    if (reverse && opts.length < 4) return this.build(w, s.id, false);
    while (opts.length < 4) opts.push('（其他）' + opts.length);
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const exs = reverse ? [] : (s.ex || []).filter(WF.Quiz.okEx), ex = exs.length ? exs[Math.floor(this.rnd() * exs.length)] : null;
    const samePos = picked.every(p => p.s.pos === s.pos);
    const choices = reverse ? [w.word, ...picked.map(e => e.w.word)] : opts;
    return { word: w.word, pos: s.pos || '', posAll: samePos, meaning: gloss, senseId: s.id, ex,
      ...(reverse ? { fmt: 'zh-en', displayWord: gloss } : {}),
      options: order.map(i => choices[i]), correct: order.indexOf(0) };
  }
};
