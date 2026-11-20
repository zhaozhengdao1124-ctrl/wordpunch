// v2.1 记忆系统（2026-11-21 Gray）
// 1) 每个玩家、每个词记一份记忆状态 history[词].m：
//    lv 记忆等级 0–3（复习间隔 1 / 3 / 7 / 15 天）、next 下次该复习的时间、avgT 平均答对用时（秒）、n / ok 作答 / 答对次数、
//    days 在几个「不同的日子」答对过、lastDay 最近答对的日期、mastered 进入「已掌握」的时间（3 个不同日子答对过）。
//    旧存档没有 m：第一次用到时补上（以前见过的词按「今天该复习」处理，答对过的算 1 天）。
// 2) 不用自评按钮，答题速度就是记忆分（沿用对战的快 / 中 / 慢判定）：
//    到期（或新词）时答对：快（≤ 快攻时限）升一级、按满间隔；中速升一级、间隔打 6 折；慢（超过重拳时限，压哨）降一级。
//    没到期的词答对只记次数，不改间隔（同一天反复答对不会刷等级）。答错 / 超时：等级归零、马上到期，并在本局 4–7 题后再考一次。
// 3) 单人闯关和电脑陪练出词：到期复习词 / 易错词 / 新词 按比例混合（普通 40 / 30 / 30，按难度微调），哪类不够自动让给别的类；
//    新词仍按四六级难度档出（js/v20_wordlevel.js）。双人对战、联网、错题对战不受影响。
(function () {
  const W = window.WF, P = W.Profiles, G = W.Game && W.Game.prototype, DAY = 86400000;
  const M = W.CFG.MEMORY = {
    LADDER: [1, 3, 7, 15],            // 天
    MID_FACTOR: 0.6,                  // 中速答对：间隔打折
    MASTER_DAYS: 3,                   // 3 个不同的日子答对 → 已掌握
    REQUEUE: [4, 7],                  // 答错后过几题再考
    DUE_FULL: 6,                      // 到期词不少于 6 个才按满比例出
    RISK_T: 7,                        // 平均答对用时 ≥7 秒也算易错
    MIX: { easy: [30, 20, 50], normal: [40, 30, 30], hard: [40, 30, 30], shura: [35, 40, 25] },   // 到期 / 易错 / 新词
  };
  const z = n => String(n).padStart(2, '0');
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  const isWord = q => !!(q && q.word && q.bank && q.bank !== 'math' && (q.kind || 'word') === 'word' && !q.math);

  const Mem = W.Memory = {
    cfg: M, dayKey, now: () => Date.now(), ctx: null,
    today() { return dayKey(this.now()); },
    // 读一个 history 记录的记忆状态（旧存档补默认值，不写回）
    of(h) {
      if (!h) return null;
      if (h.m) return h.m;
      const seen = (h.seen || h.correct || h.wrongCount) ? 1 : 0;
      return { lv: 0, next: seen ? 1 : 0, n: 0, ok: 0, avgT: 0, days: h.correct ? 1 : 0, lastDay: '', mastered: 0, legacy: 1 };
    },
    ensure(h) { if (!h.m) { h.m = Object.assign({}, this.of(h)); delete h.m.legacy; } return h.m; },
    isDue(h, now) { const m = this.of(h); return !!m && (h.seen || h.correct || h.wrongCount || m.n) && m.next <= (now || this.now()); },
    isRisk(h) { const m = this.of(h); return !!h && (h.inBook || (h.wrongCount > 0 && (h.streak || 0) < 2) || (m && m.ok >= 1 && m.avgT >= M.RISK_T)); },
    isMastered(h) { const m = h && h.m; return !!(m && m.mastered); },
    // 记一次作答。info = { t 用时秒, fast 快攻时限, slow 重拳时限 }，缺省按中速
    record(pid, q, ok, info) {
      if (!isWord(q)) return null;
      const p = P.get(pid); if (!p || !p.history) return null;
      const h = p.history[P.qKey(q)]; if (!h) return null;
      const fresh = !h.m, now = this.now();
      // markAnswer 已先把这次计进 correct / wrongCount；扣掉这次就是以前的作答次数
      const prevC = (h.correct || 0) - (ok ? 1 : 0), prevW = (h.wrongCount || 0) - (ok ? 0 : 1), wasNew = fresh && prevC + prevW <= 0;
      if (fresh) h.m = { lv: 0, next: wasNew ? 0 : 1, n: 0, ok: 0, avgT: 0, days: prevC > 0 ? 1 : 0, lastDay: '', mastered: 0 };   // 旧存档：以前见过的词按「已到期」
      const m = h.m;
      const due = wasNew || m.next <= now;
      const t = info && info.t != null ? info.t : null;
      const speed = t == null ? 'mid' : t <= info.fast ? 'fast' : t > info.slow ? 'slow' : 'mid';
      m.n = (m.n || 0) + 1;
      if (!ok) {
        m.lv = 0; m.next = now; m.lapse = (m.lapse || 0) + 1;
      } else {
        m.ok = (m.ok || 0) + 1;
        if (t != null) m.avgT = m.avgT ? Math.round((m.avgT * 0.7 + t * 0.3) * 100) / 100 : Math.round(t * 100) / 100;
        if (due) {
          const top = M.LADDER.length - 1;
          let lv = wasNew ? -1 : (m.lv || 0);
          if (speed === 'slow') lv = Math.max(0, lv - 1); else lv = Math.min(top, lv + 1);
          m.lv = lv;
          const days = M.LADDER[lv] * (speed === 'mid' ? M.MID_FACTOR : 1);
          m.next = now + Math.max(1, Math.round(days)) * DAY;
        }
        const d = dayKey(now);
        if (m.lastDay !== d) { m.lastDay = d; m.days = (m.days || 0) + 1; }
        if (!m.mastered && m.days >= M.MASTER_DAYS) m.mastered = now;
      }
      m.last = now;
      P.save();
      return { m, due, speed };
    },
    // 某词库的掌握进度（不需要先下载词库）
    progress(pid, bankId) {
      const p = P.get(pid), b = (window.WF_BANKS || []).find(x => x.id === bankId);
      const total = b ? (b.count || b.words.length) : 0; let done = 0;
      if (p && p.history) { const pre = bankId + '\t'; for (const k in p.history) if (k.startsWith(pre) && this.isMastered(p.history[k])) done++; }
      return { done: Math.min(done, total || done), total };
    },
    // 全部词库里到期 / 易错的词（今日踢馆用）。返回 history 记录，按逾期时间从早到晚
    dueList(pid, now) {
      const p = P.get(pid); if (!p || !p.history) return [];
      now = now || this.now(); const out = [];
      for (const k in p.history) { const h = p.history[k]; if (h.kind === 'word' && h.bank && h.bank !== 'math' && this.isDue(h, now)) out.push(h); }
      return out.sort((a, b) => this.of(a).next - this.of(b).next);
    },
    riskList(pid) {
      const p = P.get(pid); if (!p || !p.history) return [];
      const out = []; for (const k in p.history) { const h = p.history[k]; if (h.kind === 'word' && h.bank && h.bank !== 'math' && this.isRisk(h)) out.push(h); }
      return out.sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.lastWrong || 0) - (a.lastWrong || 0));
    },
    // 本局状态：requeue = 答错要再考的词
    newRun(pid, mode) { return { pid, mode: mode || 'normal', n: 0, re: [], stats: { due: 0, risk: 0, new: 0, re: 0 } }; },
  };

  // ---------- 作答时记录（所有调用 Profiles.markAnswer 的地方：对战、闯关复习、开箱复习…） ----------
  const baseMark = P.markAnswer;
  P.markAnswer = function (id, q, ok) {
    const r = baseMark.apply(this, arguments);
    try { Mem.record(id, q, ok, Mem.ctx); } catch (e) { console.warn('memory', e); }
    return r;
  };

  // ---------- 出词：到期 / 易错 / 新词 混合 ----------
  const Q = W.Quiz.prototype, basePick = Q.pick, baseNext = Q.next;
  Q.memPools = function (mem) {
    const p = P.get(mem.pid), hist = (p && p.history) || {}, id = this.bank.id, now = Mem.now();
    const pend = new Set(mem.re.map(r => r.word)), due = [], risk = [], fresh = [];
    for (const w of this.words) {
      if (!w || this.used.has(w.word) || pend.has(w.word)) continue;
      const h = hist[id + '\t' + w.word];
      if (!h || !(h.seen || h.correct || h.wrongCount)) { fresh.push(w); continue; }
      if (Mem.isDue(h, now)) due.push(w); else if (Mem.isRisk(h)) risk.push(w);
    }
    return { due, risk, fresh };
  };
  Q.pick = function () {
    const mem = this.memFn && this.memFn();
    if (!mem || !P.get(mem.pid)) return basePick.apply(this, arguments);
    const pools = this.memPools(mem), mix = (M.MIX[mem.mode] || M.MIX.normal).slice();
    if (pools.due.length < M.DUE_FULL) mix[0] *= pools.due.length / M.DUE_FULL;
    const lists = [pools.due, pools.risk, pools.fresh];
    let tot = 0; for (let i = 0; i < 3; i++) if (lists[i].length) tot += mix[i];
    if (!tot) return basePick.apply(this, arguments);
    let r = this.rnd() * tot, k = 2;
    for (let i = 0; i < 3; i++) { if (!lists[i].length) continue; if ((r -= mix[i]) < 0) { k = i; break; } }
    this.lastPool = ['due', 'risk', 'new'][k];
    if (k < 2) { mem.stats[this.lastPool]++; const l = lists[k]; return l[Math.floor(this.rnd() * l.length)]; }
    // 新词：仍按难度档挑（v20），挑到见过的就再试几次
    const freshSet = new Set(pools.fresh.map(w => w.word));
    for (let i = 0; i < 24; i++) { const w = basePick.apply(this, arguments); if (w && freshSet.has(w.word)) { mem.stats.new++; return w; } }
    mem.stats.new++;
    return pools.fresh[Math.floor(this.rnd() * pools.fresh.length)];
  };
  Q.next = function () {
    const mem = this.memFn && this.memFn();
    if (mem) {
      mem.n++;
      const i = mem.re.findIndex(r => r.at <= mem.n && r.bank === this.bank.id);
      if (i >= 0) {
        const r = mem.re.splice(i, 1)[0], w = this.words.find(x => x.word === r.word);
        if (w) { this.used.add(w.word); const q = this.build(w, r.senseId); q.requeue = true; mem.stats.re++; this.lastPool = 're'; return q; }
      }
    }
    return baseNext.apply(this, arguments);
  };

  if (!G) return;
  const quizOf = src => src && (src.quiz || (src.wordSrc && src.wordSrc.quiz) || (src.fallback && quizOf(src.fallback)));
  G.memAttach = function (mode) {
    const qz = quizOf(this.source); this.memRun = null;
    if (!qz || !this.menu.p1 || !P.get(this.menu.p1)) return;
    const run = this.memRun = Mem.newRun(this.menu.p1, mode);
    qz.memFn = () => (this.memRun === run ? run : null);
  };
  const baseCamp = G.startCampaign;
  G.startCampaign = function () { const src = this.source, r = baseCamp.apply(this, arguments); if (this.camp && this.source !== src) this.memAttach(this.diffCamp ? this.diffCamp() : 'normal'); return r; };
  const baseMatch = G.startMatch;
  G.startMatch = function () {
    const r = baseMatch.apply(this, arguments);
    if (this.state === 'intro' && !this.camp && !this.dailyKick) {
      if (this.menu.cpu && !this.menu.wrongMatch && !this.netLive) this.memAttach(this.diffCpu ? this.diffCpu() : 'normal'); else this.memRun = null;
    }
    return r;
  };
  // 记下答题用时，供 markAnswer 里的记忆打分用；答错的词本局稍后再考
  const human0 = g => !!(g.camp || g.menu.cpu);
  G.memRequeue = function (q) {
    const run = this.memRun; if (!run || !isWord(q) || run.re.some(r => r.word === q.word && r.bank === q.bank)) return;
    const [a, b] = M.REQUEUE, at = run.n + a + Math.floor(this.rand() * (b - a + 1));
    run.re.push({ word: q.word, bank: q.bank, senseId: q.senseId, at });
  };
  const baseAns = G.answerNormal;
  G.answerNormal = function (s, idx) {
    const q = this.q, had = q && q.ans && q.ans[s];
    Mem.ctx = q ? { t: q.t / W.CFG.FPS, fast: this.fastS(s), slow: this.slowS() } : null;
    try { return baseAns.apply(this, arguments); } finally {
      Mem.ctx = null;
      if (s === 0 && q && !had && q.ans && q.ans[0] && !q.ans[0].ok && human0(this)) this.memRequeue(q);
    }
  };
  // 超时没答：只记进记忆（算忘了），不进错题本
  const baseEnd = G.endQuestion;
  G.endQuestion = function () {
    const q = this.q;
    if (this.state === 'question' && q && q.ans && !q.ans[0] && human0(this) && isWord(q) && !q._memTO) {
      q._memTO = true; const pid = this.menu.p1, p = P.get(pid);
      if (p && p.history && p.history[P.qKey(q)]) { Mem.record(pid, q, false); this.memRequeue(q); }
    }
    return baseEnd.apply(this, arguments);
  };
})();
