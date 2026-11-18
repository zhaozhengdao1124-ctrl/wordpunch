// 本机存档：最多 10 个玩家，存在 localStorage。每人有错题本、单词书进度和战绩。
(function () {
  const W = window.WF = window.WF || {};
  const KEY = 'wf_profiles_v1';
  const MAX = 10;

  W.Profiles = {
    KEY, MAX,
    AVATARS: [
      { id: 'teal',   color: '#2fd6c3' },
      { id: 'orange', color: '#ff8a3d' },
      { id: 'gold',   color: '#ffd23c' },
      { id: 'red',    color: '#ff6a6a' },
      { id: 'blue',   color: '#7fc8ff' },
      { id: 'purple', color: '#b58cff' },
      { id: 'green',  color: '#7dff9a' },
      { id: 'pink',   color: '#ff9ad6' },
    ],
    data: { v: 1, profiles: [], lastP1: null, lastP2: null },

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && Array.isArray(d.profiles)) this.data = Object.assign({ v: 1, lastP1: null, lastP2: null }, d);
        }
      } catch (e) {}
      if (!this.data.profiles.length) {
        const p = this._make('玩家1', 'teal');
        this.data.profiles.push(p);
        this.data.lastP1 = p.id;
        this.save();
      }
      if (this.data.lastP1 && !this.get(this.data.lastP1)) this.data.lastP1 = this.data.profiles[0].id;
      if (this.data.lastP2 && !this.get(this.data.lastP2)) this.data.lastP2 = null;
      this.purgeMath();
      return this.data;
    },
    isMathEntry(h, key) {
      if (key && String(key).indexOf('math\t') === 0) return true;
      return !!(h && (h.kind === 'math' || h.bank === 'math' || h.math));
    },
    purgeMath() {
      let n = 0;
      for (const p of this.data.profiles) {
        if (!p.history) continue;
        for (const k of Object.keys(p.history)) {
          if (this.isMathEntry(p.history[k], k)) { delete p.history[k]; n++; }
        }
      }
      if (n) this.save();
      return n;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    _uid() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); },
    _make(name, avatar) {
      return {
        id: this._uid(),
        name: String(name || '玩家').trim().slice(0, 8) || '玩家',
        avatar: avatar || 'teal',
        created: Date.now(),
        bgm: null,
        stats: { matches: 0, wins: 0, losses: 0, answered: 0, correct: 0 },
        // key: bank + '\t' + word
        history: {},
        // v1.4 解锁 / 闯关积分
        unlocks: {}, points: 0,
        camp: { runs: 0, clears: 0, flawless: 0, bestPoints: 0, bestAcc: 0 },
      };
    },
    list() { return this.data.profiles; },
    get(id) { return this.data.profiles.find(p => p.id === id) || null; },
    create(name, avatar) {
      if (this.data.profiles.length >= MAX) return { err: '最多 10 个玩家' };
      const p = this._make(name, avatar);
      this.data.profiles.push(p);
      this.save();
      return { profile: p };
    },
    rename(id, name) {
      const p = this.get(id); if (!p) return;
      p.name = String(name || '').trim().slice(0, 8) || p.name;
      this.save();
    },
    remove(id) {
      const i = this.data.profiles.findIndex(p => p.id === id);
      if (i < 0) return;
      this.data.profiles.splice(i, 1);
      if (this.data.lastP1 === id) this.data.lastP1 = this.data.profiles[0] ? this.data.profiles[0].id : null;
      if (this.data.lastP2 === id) this.data.lastP2 = null;
      if (!this.data.profiles.length) {
        const p = this._make('玩家1', 'teal');
        this.data.profiles.push(p);
        this.data.lastP1 = p.id;
      }
      this.save();
    },
    setLast(side, id) {
      if (side === 0) this.data.lastP1 = id; else this.data.lastP2 = id;
      this.save();
    },
    isMath(q) { return !!(q && (q.kind === 'math' || q.bank === 'math' || q.math)); },
    qKey(q) {
      if (this.isMath(q)) return 'math\t' + (q.word || '');
      return (q.bank || '') + '\t' + (q.word || '');
    },
    rec(id, q) {
      const p = this.get(id); if (!p || !q) return null;
      const k = this.qKey(q);
      const math = this.isMath(q);
      if (!p.history[k]) {
        p.history[k] = {
          kind: math ? 'math' : (q.kind || 'word'),
          bank: math ? 'math' : (q.bank || ''),
          word: q.word, meaning: q.meaning != null ? String(q.meaning) : '', pos: q.pos || '',
          math: q.math || null,
          seen: 0, correct: 0, wrongCount: 0, streak: 0, lastWrong: 0, inBook: false,
        };
      }
      const h = p.history[k];
      if (math) {
        h.kind = 'math'; h.bank = 'math';
        if (q.math) h.math = q.math;
        if (q.meaning != null && String(q.meaning) !== '') h.meaning = String(q.meaning);
        else if (h.math && h.math.c != null) h.meaning = String(h.math.c);
      } else {
        if (q.meaning && (!h.meaning || !q.senseId)) { h.meaning = q.meaning; h.pos = q.pos || h.pos; }
        if (q.bank) h.bank = q.bank;
      }
      return h;
    },
    markSeen(id, q) {
      if (this.isMath(q)) return;
      const h = this.rec(id, q); if (!h) return;
      h.seen++;
      this.save();
    },
    markAnswer(id, q, ok) {
      if (this.isMath(q)) return;
      const h = this.rec(id, q); if (!h) return;
      if (!h.seen) h.seen++;
      // v1.3 按义项记：答错的义项进 wrongSenses，错题对战只考这些义项；答对后从里面移出
      const sid = q.senseId;
      if (sid) { h.senses = h.senses || {}; const sv = h.senses[sid] = h.senses[sid] || { seen: 0, correct: 0, wrong: 0 }; sv.seen++; if (ok) sv.correct++; else sv.wrong++; }
      if (ok) {
        h.correct++;
        h.streak++;
        h.best = Math.max(h.best || 0, h.streak); // v1.4 历史最长连续答对（解锁雪乃按它算：连对 3 次就算掌握过）
        if (sid && h.wrongSenses) h.wrongSenses = h.wrongSenses.filter(x => x !== sid);
        if (h.streak >= 3 && h.inBook) { h.inBook = false; h.wrongSenses = []; }
      } else {
        h.wrongCount++;
        h.streak = 0;
        h.inBook = true;
        h.lastWrong = Date.now();
        if (sid) { h.wrongSenses = (h.wrongSenses || []).filter(x => x !== sid).concat([sid]); h.senseId = sid; h.meaning = q.meaning; h.pos = q.pos || h.pos; }
      }
      const p = this.get(id);
      if (p) { p.stats.answered++; if (ok) p.stats.correct++; }
      this.save();
    },
    markMatch(id, win) {
      const p = this.get(id); if (!p) return;
      p.stats.matches++;
      if (win === true) p.stats.wins++;
      else if (win === false) p.stats.losses++;
      this.save();
    },
    mastery(id, bank, word) {
      const p = this.get(id); if (!p) return 'new';
      const h = p.history[(bank || '') + '\t' + word];
      if (!h) return 'new';
      if (h.inBook) return 'wrong';
      if (h.streak >= 3) return 'mastered';
      if (h.seen || h.correct) return 'seen';
      return 'new';
    },
    wrongList(id, bankFilter) {
      const p = this.get(id); if (!p) return [];
      const out = [];
      for (const k of Object.keys(p.history)) {
        const h = p.history[k];
        if (!h.inBook) continue;
        if (this.isMathEntry(h, k)) continue;
        const bank = h.bank || '';
        if (bankFilter && bankFilter !== 'all' && bank !== bankFilter) continue;
        out.push(h);
      }
      out.sort((a, b) => (b.lastWrong || 0) - (a.lastWrong || 0));
      return out;
    },
    unionWrong(ids, bankFilter) {
      const map = new Map();
      for (const id of ids) {
        if (!id) continue;
        for (const h of this.wrongList(id, bankFilter)) {
          const k = (h.bank || '') + '\t' + h.word;
          if (!map.has(k)) map.set(k, h);
        }
      }
      return Array.from(map.values());
    },
    // v1.4 旧存档没有解锁 / 积分字段：用到时补上
    ext(id) {
      const p = typeof id === 'object' ? id : this.get(id); if (!p) return null;
      if (!p.unlocks) p.unlocks = {};
      if (typeof p.points !== 'number') p.points = 0;
      p.camp = Object.assign({ runs: 0, clears: 0, flawless: 0, bestPoints: 0, bestAcc: 0 }, p.camp || {});
      return p;
    },
    accuracy(id) {
      const p = this.get(id); if (!p || !p.stats.answered) return 0;
      return p.stats.correct / p.stats.answered;
    },
    avatarOf(p) {
      return this.AVATARS.find(a => a.id === (p && p.avatar)) || this.AVATARS[0];
    },
    setBgm(id, trackId) {
      const p = this.get(id); if (!p) return;
      p.bgm = trackId; this.save();
    },
    applyBgm(id) {
      const p = this.get(id);
      if (p && p.bgm && window.WF && WF.Audio) WF.Audio.setTrack(p.bgm, false);
    },
  };
})();
