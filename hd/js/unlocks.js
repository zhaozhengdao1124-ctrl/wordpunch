// v1.4 可选角色解锁 + 闯关积分。数据存在每个玩家存档里（WF.Profiles：unlocks / points / camp）。
// 规则在 config.js 的 ROSTER / UNLOCK / POINTS。网址加 ?unlockall=1 可临时全部解锁（测试用，不写存档）。
(function () {
  const W = window.WF = window.WF || {};
  const CFG = () => W.CFG;
  let debugAll = false;
  try { debugAll = /[?&]unlockall=1(&|$)/.test(location.search || ''); } catch (e) {}
  const cache = {};

  W.Unlocks = {
    get debugAll() { return debugAll; },
    set debugAll(v) { debugAll = !!v; },
    roster() { return CFG().ROSTER.slice(); },
    playable(id) { return CFG().ROSTER.includes(id); },
    rule(id) { return CFG().UNLOCK[id] || { start: true }; },
    has(pid, id) {
      if (!this.playable(id)) return false;
      if (debugAll || this.rule(id).start) return true;
      const p = W.Profiles.ext(pid);
      return !!(p && p.unlocks[id]);
    },
    // 存档里真正解锁了没有（不管调试开关）
    owned(pid, id) { const p = W.Profiles.ext(pid); return !!(this.rule(id).start || (p && p.unlocks[id])); },
    countFor(pid) { return this.roster().filter(id => this.has(pid, id)).length; },
    grant(pid, id) {
      const p = W.Profiles.ext(pid); if (!p || this.rule(id).start || p.unlocks[id]) return false;
      p.unlocks[id] = Date.now(); W.Profiles.save(); return true;
    },

    // ---- 词库掌握度：词库里每个词「连续答对 n 次」过（历史最长连对，答错后不倒扣）----
    mastery(pid, bankId) {
      const p = W.Profiles.get(pid), bank = (window.WF_BANKS || []).find(b => b.id === bankId);
      if (!p || !bank) return { done: 0, total: 0, pct: 0 };
      const need = (this.rule('yukino').streak) || 3;
      const key = pid + '|' + bankId + '|' + p.stats.answered + '|' + need;
      if (cache[bankId + pid] && cache[bankId + pid].key === key) return cache[bankId + pid].v;
      const seen = new Set(); let done = 0;
      if (bank.lazy && !bank.loaded) {   // 2026-11-21 词库按需下载：还没下载时按存档记录数（总数用清单里的词数）
        const pre = bankId + '\t';
        for (const k in p.history || {}) { if (!k.startsWith(pre)) continue; const h = p.history[k]; if (h.kind !== 'phrase' && Math.max(h.best || 0, h.streak || 0) >= need) done++; }
        return { done: Math.min(done, bank.count || 0), total: bank.count || 0, pct: bank.count ? Math.min(1, done / bank.count) : 0 };
      }
      for (const w of bank.words) {
        if (!w || seen.has(w.word)) continue; seen.add(w.word);
        const h = p.history[bankId + '\t' + w.word];
        if (h && Math.max(h.best || 0, h.streak || 0) >= need) done++;
      }
      const total = seen.size, v = { done, total, pct: total ? done / total : 0 };
      cache[bankId + pid] = { key, v };
      return v;
    },
    masteryBanks(id) { const r = this.rule(id || 'yukino'); return (r.banks || []).filter(b => (window.WF_BANKS || []).some(x => x.id === b)); },
    bankName(bid) { const b = (window.WF_BANKS || []).find(x => x.id === bid); return b ? b.name : bid; },
    pctText(v) { if (!v.total) return '—'; if (v.done >= v.total) return '100%'; const p = v.pct * 100; return (p > 0 && p < 1 ? p.toFixed(1) : Math.floor(p)) + '%'; },

    // 条件达成了没有（不看是否已解锁）
    met(pid, id) {
      const r = this.rule(id), p = W.Profiles.ext(pid);
      if (r.start) return true; if (!p) return false;
      if (r.type === 'clear') return p.camp.clears >= 1;
      if (r.type === 'beat') return !!(p.camp.beat && p.camp.beat[r.boss]);
      if (r.type === 'flawless') return p.camp.flawless >= 1;
      if (r.type === 'master') return this.masteryBanks(id).some(b => { const v = this.mastery(pid, b); return v.total > 0 && v.done >= v.total; });
      return false;
    },
    // 检查并解锁；返回这次新解锁的角色 id
    check(pid) {
      if (!pid || !W.Profiles.get(pid)) return [];
      const out = [];
      for (const id of this.roster()) if (!this.owned(pid, id) && this.met(pid, id) && this.grant(pid, id)) out.push(id);
      return out;
    },
    // 选角界面上的解锁说明（短的写在卡片上，长的带进度写在下面）
    hint(id) { return this.rule(id).hint || ''; },
    progress(pid, id) {
      const r = this.rule(id), p = W.Profiles.ext(pid);
      if (r.start || !p) return '';
      if (r.type === 'clear') return `目前全部通关 ${p.camp.clears} 次（共闯关 ${p.camp.runs} 局）`;
      if (r.type === 'beat') return (p.camp.beat && p.camp.beat[r.boss]) ? '已经打败过' : `还没打败过（共闯关 ${p.camp.runs} 局）`;
      if (r.type === 'flawless') return p.camp.clears ? `全部通关过 ${p.camp.clears} 次，最高正确率 ${Math.round((p.camp.bestAcc || 0) * 100)}%（要 ≥ ${Math.round(r.acc * 100)}%）` : `还没有全部通关过（共闯关 ${p.camp.runs} 局）`;
      if (r.type === 'master') return '掌握进度：' + this.masteryBanks(id).map(b => `${this.bankName(b)} ${this.pctText(this.mastery(pid, b))}`).join(' · ');
      return '';
    },

    // ---- 闯关积分 ----
    // run: { cleared: 打通的城市数, kills, answered, correct, maxStreak, full: 是否全部通关 }
    points(run) {
      const P = CFG().POINTS, acc = run.answered ? run.correct / run.answered : 0;
      const parts = {
        city: run.cleared * P.city,
        enemy: run.kills * P.enemy,
        acc: Math.round(P.accMax * acc * Math.min(1, run.answered / P.accFullAt)),
        combo: run.maxStreak * P.combo,
        wave: run.waveBonus || 0,
        full: run.full ? P.fullClear : 0,
      };
      parts.total = parts.city + parts.enemy + parts.acc + parts.combo + parts.wave + parts.full;
      return parts;
    },
    // 一局结束时调用一次：记积分 / 通关次数 / 全通正确率，返回 { pts, total, unlocked }
    recordRun(pid, run) {
      const p = W.Profiles.ext(pid), pts = this.points(run);
      if (!p) return { pts, total: 0, unlocked: [] };
      const acc = run.answered ? run.correct / run.answered : 0;
      p.points += pts.total; p.camp.runs++;
      p.camp.bestPoints = Math.max(p.camp.bestPoints, pts.total);
      if (run.full) {
        p.camp.clears++;
        p.camp.bestAcc = Math.max(p.camp.bestAcc || 0, acc);
        if (acc >= (this.rule('handawei').acc || 0.9)) p.camp.flawless++;
      }
      W.Profiles.save();
      return { pts, total: p.points, unlocked: this.check(pid) };
    },
  };
})();
