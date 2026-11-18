// 题目源：可插拔接口。每个源都实现 next()，返回
// { word, pos, meaning, options[4], correct, kind, bank, math? }
// 之后加新模式只需再写一个源，再在 QMODES / makeSource 里登记即可。
(function () {
  const W = window.WF = window.WF || {};

  function shuffle(rnd, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  W.WordSource = class {
    constructor(bank, rnd) {
      this.id = 'word'; this.name = bank ? bank.name : '单词';
      this.bank = bank; this.quiz = new WF.Quiz(bank, rnd); this.rnd = rnd || Math.random;
    }
    get size() { return this.bank && this.bank.words ? this.bank.words.length : 0; }
    next() {
      const q = this.quiz.next();
      q.kind = 'word'; q.bank = this.bank.id;
      return q;
    }
  };

  W.MathSource = class {
    constructor(rnd) {
      this.id = 'math'; this.name = '数学'; this.rnd = rnd || Math.random; this.used = new Set();
    }
    get size() { return Infinity; }
    ri(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); }
    next() {
      let a, b, op, c, key;
      for (let n = 0; n < 30; n++) {
        op = this.rnd() < 0.5 ? '+' : '-';
        if (op === '+') { a = this.ri(0, 100); b = this.ri(0, 100 - a); c = a + b; }
        else { a = this.ri(0, 100); b = this.ri(0, a); c = a - b; }
        key = a + op + b;
        if (!this.used.has(key) || n > 20) break;
      }
      if (this.used.size > 400) this.used.clear();
      this.used.add(key);
      const vals = this.distractors(a, op, b, c);
      const options = shuffle(this.rnd, vals);
      return {
        kind: 'math', bank: 'math',
        word: `${a} ${op === '+' ? '+' : '−'} ${b} = ?`,
        pos: '', meaning: String(c),
        options: options.map(String),
        correct: options.indexOf(c),
        math: { a, op, b, c },
      };
    }
    distractors(a, op, b, c) {
      const cand = [];
      const add = (x) => {
        x = Math.round(x);
        if (Number.isInteger(x) && x >= 0 && x <= 100 && x !== c && cand.indexOf(x) < 0) cand.push(x);
      };
      add(c + 1); add(c - 1); add(c + 10); add(c - 10);
      if (op === '+') {
        const ones = (a % 10) + (b % 10);
        if (ones >= 10) add(c - 10); // 忘记进位
        else add(c + 10);            // 不该进位却进了
        add(a + (b % 10));
        add((a % 10) + b);
        add(Math.abs(a - b));
        add(c + 2); add(c - 2);
        // 只加十位 / 只加个位
        add((Math.floor(a / 10) + Math.floor(b / 10)) * 10);
        add((a % 10) + (b % 10));
      } else {
        const needBorrow = (a % 10) < (b % 10);
        if (needBorrow) add(c + 10); // 忘记借位
        else add(c - 10);            // 不该借位却借了
        add(a + b);
        add(c + 2); add(c - 2);
        add(a - (b % 10));
        add(Math.abs((a % 10) - (b % 10)));
      }
      if (c >= 10) add((c % 10) * 10 + Math.floor(c / 10)); // 个位十位对调
      let d = 3;
      while (cand.length < 3 && d < 60) { add(c + d); add(c - d); d++; }
      return [c].concat(cand.slice(0, 3));
    }
  };

  W.MixSource = class {
    constructor(wordSrc, mathSrc, ratio, rnd) {
      this.id = 'mix'; this.name = '混合';
      this.wordSrc = wordSrc; this.mathSrc = mathSrc;
      this.ratio = ratio == null ? WF.CFG.MIX_MATH_RATIO : ratio;
      this.rnd = rnd || Math.random;
    }
    get size() { return (this.wordSrc.size || 0) + 100; }
    next() { return (this.rnd() < this.ratio ? this.mathSrc : this.wordSrc).next(); }
  };

  // 错题源：题目来自错题本条目；干扰项对单词题从原词库抽，数学题重新生成。
  // 不足 4 条时回退到 fallback。
  W.WrongSource = class {
    constructor(entries, fallback, banks, rnd) {
      this.id = 'wrong'; this.name = '错题';
      this.entries = (entries || []).filter(e => e && e.kind !== 'math' && e.bank !== 'math' && !e.math);
      this.fallback = fallback;
      this.banks = banks || [];
      this.rnd = rnd || Math.random;
      this.useFallback = this.entries.length < 4;
      this.quizByBank = {};
    }
    get size() { return this.useFallback ? (this.fallback ? this.fallback.size : 0) : this.entries.length; }
    next() {
      if (this.useFallback) {
        const q = this.fallback.next();
        q.fromWrongBook = false;
        return q;
      }
      const e = this.entries[Math.floor(this.rnd() * this.entries.length)];
      return this.wordFrom(e);
    }
    mathFrom(e) {
      let a, op, b, c;
      if (e.math) { a = e.math.a; op = e.math.op; b = e.math.b; c = e.math.c; }
      else {
        const m = String(e.word).match(/(\d+)\s*([+\-−–])\s*(\d+)/);
        if (m) { a = +m[1]; op = m[2] === '+' ? '+' : '-'; b = +m[3]; c = op === '+' ? a + b : a - b; }
                else { return this.fallback ? this.fallback.next() : new WF.MathSource(this.rnd).next(); }
      }
      const src = new WF.MathSource(this.rnd);
      const vals = src.distractors(a, op, b, c);
      const options = shuffle(this.rnd, vals);
      return {
        kind: 'math', bank: 'math', fromWrongBook: true,
        word: `${a} ${op === '+' ? '+' : '−'} ${b} = ?`,
        pos: '', meaning: String(c),
        options: options.map(String),
        correct: options.indexOf(c),
        math: { a, op, b, c },
      };
    }
    wordFrom(e) {
      const bank = this.banks.find(b => b.id === e.bank) || this.banks[0];
      if (!bank) return this.fallback.next();
      if (!this.quizByBank[bank.id]) this.quizByBank[bank.id] = new WF.Quiz(bank, this.rnd);
      const quiz = this.quizByBank[bank.id];
      const w = bank.words.find(x => x.word === e.word) || { word: e.word, pos: e.pos || '', meaning: e.meaning };
      const ws = e.wrongSenses && e.wrongSenses.length ? e.wrongSenses : null;
      const q = quiz.build(w, ws ? ws[Math.floor(this.rnd() * ws.length)] : e.senseId);
      return Object.assign(q, { kind: 'word', bank: e.bank || bank.id, fromWrongBook: true });
    }
  };

  W.makeSource = function (opts) {
    const rnd = opts.rnd || Math.random;
    const bank = opts.bank;
    const mode = opts.mode || 'word';
    const wordSrc = bank ? new WF.WordSource(bank, rnd) : null;
    const mathSrc = new WF.MathSource(rnd);
    let base;
    if (mode === 'math') base = mathSrc;
    else if (mode === 'mix' && wordSrc) base = new WF.MixSource(wordSrc, mathSrc, WF.CFG.MIX_MATH_RATIO, rnd);
    else if (wordSrc) base = wordSrc;
    else base = mathSrc;
    if (opts.wrongEntries) return new WF.WrongSource(opts.wrongEntries, base, opts.banks || [], rnd);
    return base;
  };
})();
