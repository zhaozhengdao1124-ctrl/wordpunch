// v2.1 新题型：听音选义 + 例句填空（只在闯关的首领战、困难 / 修罗难度、陪练的困难 / 修罗出现，频率适中）
// · 听音选义：读出单词，选中文意思；没有可用的发音（不支持语音又断网、或关了音效）就照常出普通题
// · 例句填空：只用四级 / 六级的例句，把目标词和它的变形（-s/-ed/-ing/-er…）挖掉，选英文单词；挖不干净的例句不用
// 双人对战、联机、短语题、今日踢馆都不变。
(function () {
  const W = window.WF = window.WF || {};
  const C = W.CFG, G = W.Game && W.Game.prototype;
  const QT = C.QTYPES = { LISTEN: 0.1, CLOZE: 0.1, GAP: 2, CLOZE_BANKS: ['cet4', 'cet6'], MAX_LEN: 120 };

  // ---------- 挖空 ----------
  function forms(word) {
    const w = word.toLowerCase(), f = new Set([w]);
    ['s', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'est', 'ly', "'s"].forEach(x => f.add(w + x));
    if (/[^aeiou]y$/.test(w)) { const s = w.slice(0, -1); ['ies', 'ied', 'ier', 'iest', 'ily'].forEach(x => f.add(s + x)); }
    if (/e$/.test(w)) { const s = w.slice(0, -1); ['ing', 'ed', 'er', 'est', 'ers'].forEach(x => f.add(s + x)); }
    if (/ie$/.test(w)) f.add(w.slice(0, -2) + 'ying');
    if (/[^aeiou][aeiou][bdgklmnprtvz]$/.test(w)) { const c = w.slice(-1); ['ed', 'ing', 'er', 'est', 'ers'].forEach(x => f.add(w + c + x)); }
    if (/c$/.test(w)) ['ked', 'king'].forEach(x => f.add(w + x));
    return [...f];
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 返回挖空后的句子；挖不干净（没找到 / 剩下的地方还看得出这个词）返回 null
  function mask(sentence, word) {
    if (!sentence || !word || !/^[a-z][a-z-]{2,}$/i.test(word)) return null;
    const en = String(sentence).replace(/\s+/g, ' ').trim();
    if (en.length > QT.MAX_LEN || /[\u4e00-\u9fff]/.test(en)) return null;
    const re = new RegExp("(^|[^A-Za-z'-])(" + forms(word).sort((a, b) => b.length - a.length).map(esc).join('|') + ")(?![A-Za-z-])", 'gi');
    let n = 0;
    const out = en.replace(re, (m, pre) => { n++; return pre + '_____'; });
    if (!n) return null;
    const lw = word.toLowerCase(), low = out.toLowerCase();
    const stem = lw.replace(/(e|y|ie)$/, '');
    if (stem.length >= 4 ? low.includes(stem) : new RegExp('\\b' + esc(stem)).test(low)) return null;   // 派生词（abandonment / unhappy…）会露馅
    return out;
  }
  W.Cloze = { forms, mask };

  // ---------- 能不能出新题型 ----------
  const canListen = () => {
    if (!W.Speech || (W.Audio && W.Audio.sfxOn === false)) return false;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    return (W.Speech.supported && W.Speech.hasVoice()) || online;   // 本机有英语语音，或在线（有道发音）
  };
  if (!G) return;
  G.qSpecialOn = function () {
    if (this.netLive || this.dailyKick) return false;
    if (this.camp) {
      const E = this.p && this.p[1], d = this.diffCamp ? this.diffCamp() : 'normal';
      return !!(E && !E.mv.minion) || d === 'hard' || d === 'shura';
    }
    if (this.menu.cpu && !this.menu.wrongMatch) { const d = this.diffCpu ? this.diffCpu() : 'normal'; return d === 'hard' || d === 'shura'; }
    return false;
  };
  G.qtQuiz = function (bankId) {
    const src = this.source, sq = src && (src.quiz || (src.wordSrc && src.wordSrc.quiz));
    if (sq && sq.bank && sq.bank.id === bankId) return sq;
    this._qtQuiz = this._qtQuiz || {};
    const b = (this.banks || []).find(x => x.id === bankId); if (!b || !b.words || !b.words.length) return null;
    return this._qtQuiz[bankId] || (this._qtQuiz[bankId] = new W.Quiz(b, this.rnd));
  };
  const keep = (from, to) => { ['kind', 'bank', 'requeue', 'shuraBook', 'oldExam', 'inBook'].forEach(k => { if (from[k] !== undefined) to[k] = from[k]; }); return to; };
  G.makeListen = function (q, w, qz) {
    const n = q.fmt === 'zh-en' ? qz.build(w, q.senseId, false) : Object.assign({}, q);
    if (n.fmt === 'zh-en') return null;
    keep(q, n); n.fmt = 'listen'; n.listen = true; n.ex = null; n.displayWord = '听音选义'; n.posAll = false;
    return n;
  };
  G.makeCloze = function (q, w, qz) {
    if (QT.CLOZE_BANKS.indexOf(q.bank) < 0) return null;
    const ss = W.Quiz.senses(w), first = ss.find(s => s.id === q.senseId);
    const order = (first ? [first] : []).concat(ss.filter(s => s !== first));
    for (const s of order) {
      const exs = (s.ex || []).filter(W.Quiz.okEx);
      for (const ex of exs) {
        const m = mask(ex.en, w.word); if (!m) continue;
        const n = qz.build(w, s.id, true);
        if (n.fmt !== 'zh-en' || !n.options || n.options.length !== 4) return null;
        keep(q, n); n.fmt = 'cloze'; n.cloze = { masked: m, full: String(ex.en).replace(/\s+/g, ' ').trim(), zh: ex.zh || '' };
        n.displayWord = '例句填空'; n.ex = { en: m }; n.meaning = n.meaning || q.meaning;
        return n;
      }
    }
    return null;
  };
  G.qSpecial = function (q) {
    try {
      if (!q || q.kind !== 'word' || q.math || q.fmt === 'blank' || q.shuraBook || q.oldExam || !q.bank || !this.qSpecialOn()) return q;
      this._qtGap = (this._qtGap || 0) + 1;
      if (this._qtGap <= QT.GAP) return q;
      const r = this.rand();
      let kind = r < QT.LISTEN ? 'listen' : r < QT.LISTEN + QT.CLOZE ? 'cloze' : null;
      if (!kind) return q;
      const qz = this.qtQuiz(q.bank), w = qz && qz.words.find(x => x.word === q.word);
      if (!w) return q;
      let n = null;
      if (kind === 'listen' && canListen()) n = this.makeListen(q, w, qz);
      if (!n && QT.CLOZE_BANKS.indexOf(q.bank) >= 0) n = this.makeCloze(q, w, qz);   // 听不了 / 抽到填空：试填空
      if (!n) return q;
      this._qtGap = 0; this.qtStats = this.qtStats || { listen: 0, cloze: 0 }; this.qtStats[n.fmt]++;
      return n;
    } catch (e) { console.warn('[WF] qtype', e); return q; }
  };
  // 出题入口：闯关走 campNextQ（最外层），陪练给本局题源包一层
  const baseNext = G.campNextQ;
  G.campNextQ = function () { return this.qSpecial(baseNext.apply(this, arguments)); };
  const baseMatch = G.startMatch;
  G.startMatch = function () {
    const r = baseMatch.apply(this, arguments);
    this._qtGap = 0;
    if (this.state === 'intro' && !this.camp && this.source && !this.source._qt && this.menu.cpu && !this.dailyKick && !this.netLive) {
      const src = this.source, sn = src.next.bind(src), g = this;
      src.next = function () { return g.qSpecial(sn()); }; src._qt = true;
    }
    return r;
  };
  const baseCamp = G.startCampaign;
  G.startCampaign = function () { this._qtGap = 0; return baseCamp.apply(this, arguments); };

  // ---------- 听音：出题时读两遍；R 键 / 点题目处重听 ----------
  G.qtSpeak = function (q) { if (q && q.listen && W.Speech) try { W.Speech.speak(q.word, { rate: 0.85 }); } catch (e) {} };
  const baseNQ = G.newQuestion;
  G.newQuestion = function () {
    const r = baseNQ.apply(this, arguments), q = this.q;
    if (q && q.listen && this.state === 'question') {
      setTimeout(() => { if (this.q === q && !q.revealed) this.qtSpeak(q); }, 120);
      setTimeout(() => { if (this.q === q && !q.revealed && !(q.ans && q.ans[0])) this.qtSpeak(q); }, 2600);
    }
    return r;
  };
  const baseInput = G.input;
  G.input = function (code) {
    const q = this.q;
    if (code === 'KeyR' && q && q.listen && this.state === 'question' && !q.revealed) { this.qtSpeak(q); return true; }
    return baseInput.apply(this, arguments);
  };
  const baseTouch = W.touchHit;
  if (baseTouch) W.touchHit = function (g, x, y) {
    const q = g.q;
    if (q && q.listen && g.state === 'question' && !q.revealed && y >= 400 && y <= 456 && x >= 300 && x <= 660) { g.qtSpeak(q); return true; }
    return baseTouch.apply(this, arguments);
  };

  // ---------- 画题目 ----------
  const basePanel = G.drawPanel;
  G.drawPanel = function () {
    const q = this.q;
    if (q && q.listen) { q.displayWord = q.revealed ? q.word : '♪ 听音选义'; q.ex = null; }
    if (q && q.cloze) { q.displayWord = q.revealed ? q.word : '例句填空'; q.ex = { en: q.revealed ? q.cloze.full : q.cloze.masked }; }
    basePanel.apply(this, arguments);
    if (q && q.listen && !q.revealed) this.txt(WF.touch ? '点这里重听' : '按 R 重听', C.SCREEN_W / 2, 455, 12, '#8fd0ff', 'center', { sw: 3, weight: 700 });
  };
})();
