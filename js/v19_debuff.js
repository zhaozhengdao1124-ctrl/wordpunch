// v1.9 霉运道具（§2A）：9 件，效果轻、可叠、答得出题、不致死。
// 「每 N 题」用计数器：拿到后每出一题 +1，到 N 触发并清零；条件不满足（单词太短 / 错题本空）就顺延到下一题。
// 计数只算对战里出的题（campNextQ）；砍价不经过 campNextQ，所以不计数（§2C.8-5）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, ITEM = id => C.ITEMS.find(i => i.id === id);
  const EVERY = ['foggy_glasses', 'leaky_pen', 'wobbly_desk', 'old_exam'];
  const hasD = (g, id) => !!(g.camp && g.camp.items.some(i => i.id === id));
  G.hasDebuff = function (id) { return hasD(this, id); };
  G.debuffDue = function (id) { const cp = this.camp, n = ITEM(id).everyQ; return (cp.dbc && cp.dbc[id] || 0) >= n; };
  G.debuffStatus = function (id) {
    const d = ITEM(id); if (!d.everyQ) return '持有期间一直生效';
    const left = d.everyQ - ((this.camp.dbc && this.camp.dbc[id]) || 0);
    return left <= 0 ? '下一题触发' : `再过 ${left} 题触发`;
  };
  // ---- 出题：计数 + 旧卷子 ----
  const baseNext = G.campNextQ;
  G.campNextQ = function () {
    const cp = this.camp; cp.dbc = cp.dbc || {};
    cp.qCount++;
    for (const id of EVERY) if (hasD(this, id)) cp.dbc[id] = (cp.dbc[id] || 0) + 1;
    if (hasD(this, 'old_exam') && this.debuffDue('old_exam')) {
      const ws = this.campWrongSrc, ents = ws ? ws.entries.filter(e => { const b = this.banks.find(x => x.id === e.bank); return b && b.words && b.words.length; }) : [];
      if (ents.length) {
        const e = ents[Math.floor(this.rand() * ents.length)], q = ws.wordFrom(e);
        if (q && q.options && q.options.length === 4) { cp.dbc.old_exam = 0; q.oldExam = true; cp.dbHits = (cp.dbHits || 0) + 1; return q; }
      }
    }
    return baseNext.apply(this, arguments);
  };
  const baseDecor = G.campDecorateQ;
  G.campDecorateQ = function (q) {
    baseDecor.apply(this, arguments);
    const cp = this.camp; cp.dbc = cp.dbc || {};
    if (q.kind !== 'word') return;
    if (hasD(this, 'foggy_glasses') && this.debuffDue('foggy_glasses') && q.ex && q.ex.en) { q.fog = true; cp.dbc.foggy_glasses = 0; }
    if (hasD(this, 'leaky_pen') && this.debuffDue('leaky_pen')) {
      const w = String(q.word), idx = [...w].map((ch, i) => /[a-z]/i.test(ch) ? i : -1).filter(i => i > 0);   // 首字母保留
      if (w.length >= ITEM('leaky_pen').minLen && idx.length) { q.leak = idx[Math.floor(this.rand() * idx.length)]; cp.dbc.leaky_pen = 0; }
    }
    if (hasD(this, 'wobbly_desk') && this.debuffDue('wobbly_desk') && q.options && q.options.length === 4) { q.wobble = { at: Math.round(ITEM('wobbly_desk').shuffleAt * C.FPS), done: false }; cp.dbc.wobbly_desk = 0; }
  };
  // ---- 摇晃的课桌：出题 3 秒后（还没作答）选项换位；所有跟下标有关的字段一起换 ----
  G.wobbleNow = function (q) {
    const perm = [0, 1, 2, 3];
    do { for (let i = 3; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } } while (perm.every((v, i) => v === i));
    // perm[newIdx] = oldIdx
    const map = old => old == null ? old : perm.indexOf(old);
    q.options = perm.map(o => q.options[o]);
    if (q.optionSenses) q.optionSenses = perm.map(o => q.optionSenses[o]);
    q.correct = map(q.correct); q.erased = map(q.erased);
    if (q.cpu && q.cpu.idx != null) q.cpu.idx = map(q.cpu.idx);
    for (const a of q.ans || []) if (a && a.idx != null) a.idx = map(a.idx);
    q.wobble.done = true; WF.Audio.play('whoosh');
    this.say(`摇晃的课桌：选项换位 → 正确 ${q.correct + 1}`);
  };
  const baseTick = G.campTick;
  G.campTick = function () {
    const r = baseTick.apply(this, arguments), q = this.q;
    if (q && q.wobble && !q.wobble.done && this.state === 'question' && !q.ans[0] && !q.first && q.t >= q.wobble.at) this.wobbleNow(q);
    return r;
  };
  // ---- 画面：起雾 / 漏墨 / 预警闪 / 旧卷子小标 ----
  const baseExample = G.drawExample;
  G.drawExample = function (text, word, cx, y, size) { return baseExample.call(this, text, word && this.q && this.q._realWord ? this.q._realWord : word, cx, y, size); };
  const basePanel = G.drawPanel;
  G.drawPanel = function () {
    const q = this.q, c = this.ctx, top = 402;
    if (!q) return basePanel.apply(this, arguments);
    const leak = q.leak != null && !q.revealed;
    if (leak) { q._realWord = q.word; q.word = [...q.word].map((ch, i) => i === q.leak ? '·' : ch).join(''); }
    try { basePanel.apply(this, arguments); } finally { if (leak) { q.word = q._realWord; q._realWord = null; } }
    if (leak) { c.fillStyle = '#1a2a6a'; c.fillRect(C.SCREEN_W / 2 + 230, top + 14, 8, 10); c.fillRect(C.SCREEN_W / 2 + 232, top + 10, 4, 4); this.txt('漏墨', C.SCREEN_W / 2 + 244, top + 20, 11, '#8fa8ff', 'left', { sw: 3 }); }
    if (q.fog && !q.revealed) {   // 例句框蒙一层雾
      const y = top + 38, h = 26;
      c.fillStyle = 'rgba(150,156,172,0.97)'; c.fillRect(40, y, C.SCREEN_W - 80, h);
      for (let x = 40; x < C.SCREEN_W - 40; x += 24) { c.fillStyle = (x / 24) % 2 ? 'rgba(190,196,210,0.9)' : 'rgba(170,176,190,0.9)'; c.fillRect(x, y + ((x / 24) % 3) * 4, 20, 10); }
      this.txt('起雾了…看不清例句', C.SCREEN_W / 2, y + h / 2, 14, '#3a3a4a', 'center', { stroke: false, weight: 900 });
    }
    if (q.wobble && !q.wobble.done && !q.ans[0] && this.ansRects) {
      const warnT = Math.round(ITEM('wobbly_desk').warn * C.FPS), dt = q.wobble.at - q.t;
      const jig = (this.t >> 2) % 2 ? 1 : -1;
      if (dt <= warnT && (this.t >> 2) % 2) for (const r of this.ansRects) this.box(r.x - 2 + jig, r.y - 2, r.w + 4, r.h + 4, 'rgba(0,0,0,0)', '#ffb15a', 3);
      this.txt('课桌在晃', 22, top + 52, 12, '#ffb15a', 'left', { sw: 3 });
    }
    if (q.oldExam) { this.box(16, top + 6, 44, 18, '#a08a68', null); this.txt('错题', 38, top + 15, 12, '#120c1c', 'center', { stroke: false, weight: 900 }); }
  };
  // ---- 时间 / 伤害 ----
  const baseTO = G.campTimeout;
  G.campTimeout = function () { const v = baseTO.apply(this, arguments); return hasD(this, 'rusty_clock') ? v + ITEM('rusty_clock').timeout : v; };
  const baseFast = G.campFastS;
  G.campFastS = function (s) {
    const v = baseFast.apply(this, arguments);
    if (s !== 0 || !hasD(this, 'sleepy_pillow')) return v;
    return Math.min(v, Math.max(K().CAPS.fastMin, v + ITEM('sleepy_pillow').fastWin));
  };
  const bag = (g, v) => hasD(g, 'heavy_bag') ? Math.max(1, Math.round(v * ITEM('heavy_bag').dmgDealt)) : v;
  const basePD = G.campPlayerDmg;
  G.campPlayerDmg = function (s, kind, dmg, sec) { const v = basePD.apply(this, arguments); return s === 0 && v > 1 && !this.campIsReporter(this.p[1]) ? bag(this, v) : v; };
  const baseUlt = G.campUltDmg;
  G.campUltDmg = function (A) { const v = baseUlt.apply(this, arguments); return A.side === 0 ? bag(this, v) : v; };
  const baseClash = G.campClashDmg;
  G.campClashDmg = function (W) { const v = baseClash.apply(this, arguments); return W.side === 0 ? bag(this, v) : v; };
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, D, dmg) { const v = baseTaken.apply(this, arguments); return D.side === 0 && hasD(this, 'glass_heart') ? v * ITEM('glass_heart').dmgTaken : v; };
})();
