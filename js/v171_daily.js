// v1.7.1 每日任务：每个本地自然日从任务池抽 3 个，午夜刷新；奖励进「闯关积分」。存在玩家存档（localStorage）里：profile.daily。
// 进度在 G.update 里每帧对比战斗统计的增量来记（不改原有答题逻辑）。游玩时间只算真正在打的时候（暂停、菜单、地图、转盘、过场、三选一等都不算）。
// 调试：网址加 ?dailydebug=1，每日任务页按 N（或点「调试：跳到明天」）把“今天”往后挪一天，用来测午夜刷新；偏移存在 localStorage wf_daily_offset。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, FPS = C.FPS;
  let debug = false; try { debug = /[?&]dailydebug=1(&|$)/.test(location.search || ''); } catch (e) {}
  const POOL = [
    { id: 'play20', name: '闯关游玩 20 分钟', desc: '剧情或挑战模式里累计打 20 分钟（暂停 / 菜单不算）', goal: 20 * 60 * FPS, reward: 100, fmt: n => `${Math.floor(n / FPS / 60)}/20 分钟` },
    { id: 'vs5', name: '对战 5 场', desc: '双人对战或电脑陪练打完 5 场', goal: 5, reward: 100 },
    { id: 'correct100', name: '答对 100 题', desc: '任何模式累计答对 100 题', goal: 100, reward: 80 },
    { id: 'city2', name: '打通 2 座城市', desc: '闯关里打通任意 2 座城市', goal: 2, reward: 80 },
    { id: 'combo10', name: '10 连对', desc: '一次连续答对 10 题', goal: 1, reward: 60, fmt: (n, b) => n >= 1 ? '达成' : `最高 ${b || 0}/10 连` },
    { id: 'ult1', name: '放 1 次必杀', desc: '任何模式放出 1 次必杀', goal: 1, reward: 60 },
    { id: 'review20', name: '复习错题 20 个', desc: '在错题对战里答 20 个错题本里的词', goal: 20, reward: 60 },
  ];
  const BONUS = 100, PER_DAY = 3;
  const offset = () => { try { return +localStorage.getItem('wf_daily_offset') || 0; } catch (e) { return 0; } };
  const dayKey = (ms) => { const d = new Date(ms != null ? ms : Date.now() + offset() * 864e5); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  const D = WF.Daily = {
    POOL, BONUS, debug, dayKey,
    task(id) { return POOL.find(t => t.id === id); },
    get(pid) {
      const p = WF.Profiles.ext(pid); if (!p) return null;
      const today = dayKey();
      if (!p.daily || p.daily.day !== today) {
        // 按“日期 + 玩家”定种子抽 3 个（同一天反复打开结果一样）
        let seed = hash(today + '|' + p.id);
        const ids = POOL.map(t => t.id), pick = [];
        while (pick.length < PER_DAY) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; const i = seed % ids.length; pick.push(ids.splice(i, 1)[0]); }
        p.daily = { day: today, tasks: pick.map(id => ({ id, n: 0, best: 0, done: false, claimed: false })), bonusClaimed: false };
        WF.Profiles.save();
      }
      return p.daily;
    },
    claimable(pid) { const d = this.get(pid); if (!d) return false; return d.tasks.some(t => t.done && !t.claimed) || (this.allDone(d) && !d.bonusClaimed); },
    allDone(d) { return d.tasks.every(t => t.done); },
    // 加进度；返回这次刚完成的任务
    add(pid, id, n, absBest) {
      const d = this.get(pid); if (!d) return null;
      const t = d.tasks.find(x => x.id === id); if (!t || t.done) return null;
      const def = this.task(id);
      if (absBest != null) t.best = Math.max(t.best || 0, absBest);
      t.n = Math.min(def.goal, t.n + n);
      if (t.n >= def.goal) { t.done = true; t.doneAt = Date.now(); WF.Profiles.save(); return def; }
      return null;
    },
    claim(pid, i) {
      const p = WF.Profiles.ext(pid), d = this.get(pid); if (!p || !d) return 0;
      let got = 0;
      if (i === 'bonus') { if (this.allDone(d) && !d.bonusClaimed) { d.bonusClaimed = true; got = BONUS; } }
      else { const t = d.tasks[i]; if (t && t.done && !t.claimed) { t.claimed = true; got = this.task(t.id).reward; } }
      if (got) { p.points += got; WF.Profiles.save(); }
      return got;
    },
    debugNextDay() { try { localStorage.setItem('wf_daily_offset', String(offset() + 1)); } catch (e) {} },
    debugReset() { try { localStorage.removeItem('wf_daily_offset'); } catch (e) {} },
    offset,
  };

  // ---------- 进度：每帧对比增量 ----------
  const ACTIVE_OUT = ['title', 'map', 'wheel', 'result', 'cityIntro'];
  const baseUpdate = G.update;
  G.update = function () {
    baseUpdate.apply(this, arguments);
    const pid = this.menu && this.menu.p1; if (!pid || this.state === 'title' || !this.stats) return;
    if (this._dqStats !== this.stats) { this._dqStats = this.stats; this._dq = this.stats.map(s => ({ correct: s.correct, ults: s.ults, answered: s.answered })); this._dqCities = this.camp ? this.camp.cleared.length : 0; }
    const sides = this.camp || this.menu.cpu ? [0] : [0, 1], done = [];
    const push = r => { if (r) done.push(r); };
    for (const s of sides) {
      const st = this.stats[s], b = this._dq[s]; if (!st || !b) continue;
      if (st.correct > b.correct) { push(D.add(pid, 'correct100', st.correct - b.correct)); b.correct = st.correct; }
      if (st.ults > b.ults) { push(D.add(pid, 'ult1', st.ults - b.ults)); b.ults = st.ults; }
      const combo = st.maxCombo || 0;
      if (combo >= 10) push(D.add(pid, 'combo10', 1, combo)); else if (combo > 0) { const d = D.get(pid), t = d && d.tasks.find(x => x.id === 'combo10'); if (t && combo > (t.best || 0)) t.best = combo; }
      if (st.answered > b.answered) { if (!this.camp && this.menu.wrongMatch) push(D.add(pid, 'review20', st.answered - b.answered)); b.answered = st.answered; }
    }
    if (this.camp) {
      const n = this.camp.cleared.length; if (n > this._dqCities) { push(D.add(pid, 'city2', n - this._dqCities)); this._dqCities = n; }
      const active = !this.paused && !this.campModal() && !ACTIVE_OUT.includes(this.state) && !this.cine;
      if (active) { this._dqPlay = (this._dqPlay || 0) + 1; if (this._dqPlay >= FPS) { push(D.add(pid, 'play20', this._dqPlay)); this._dqPlay = 0; } }
    }
    for (const t of done) this.dailyToastShow(t);
  };
  // （v1.9：闯关休息点的「复习」已取消，复习错题只在错题对战里计数）
  // 对战（非闯关）打完一场
  const baseShow = G.showResult;
  G.showResult = function () {
    const camp = !!this.camp;
    baseShow.apply(this, arguments);
    if (!camp && this.menu.p1) { const t = D.add(this.menu.p1, 'vs5', 1); if (t) this.dailyToastShow(t); }
  };

  // ---------- 完成提示（小条，3 秒） ----------
  G.dailyToastShow = function (def) { this.dailyToast = { def, t0: this.t }; WF.Audio.play('point', { n: 3 }); if (this.say) this.say(`每日任务完成：${def.name}（+${def.reward} 闯关积分，到「每日任务」领取）`); };
  const baseRender = G.render;
  G.render = function () {
    baseRender.apply(this, arguments);
    const dt = this.dailyToast; if (!dt) return;
    const age = this.t - dt.t0, L = 3 * FPS; if (age > L || age < 0) { this.dailyToast = null; return; }
    const c = this.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const k = Math.min(1, age / 5, (L - age) / 8), w = 380, h = 44, x = (C.SCREEN_W - w) / 2, y = 136 - (1 - Math.min(1, age / 6)) * 20;
    c.globalAlpha = Math.max(0, k);
    this.box(x, y, w, h, 'rgba(12,8,26,0.92)', '#7dff9a', 2);
    this.txt(`✔ 每日任务完成：${dt.def.name}`, C.SCREEN_W / 2, y + 15, 16, '#7dff9a', 'center', { sw: 4, weight: 700, maxW: w - 20 });
    this.txt(`+${dt.def.reward} 闯关积分 · 回菜单「每日任务」领取`, C.SCREEN_W / 2, y + 33, 12, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    c.restore();
  };

  // ---------- 菜单入口 ----------
  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice(), i = b.findIndex(x => x.key === 'grow');
    b.splice(i + 1, 0, { key: 'daily', label: '每日任务' });
    for (const x of b) if (x.key === 'ach' || x.key === 'grow' || x.key === 'daily') x.group = 'meta';   // 三个并排一行
    const d = b.find(x => x.key === 'daily'); if (d) d.dot = !!(this.menu.p1 && D.claimable(this.menu.p1));
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, dd) { if (key === 'daily') { this.goDaily(); return; } return baseAct.call(this, key, dd); };
  G.goDaily = function () { this.state = 'title'; this.ui.screen = 'daily'; this.ui.dsel = 0; WF.Audio.play('menu'); };
  G.dailyBack = function () { this.ui.screen = 'title'; this.menu.row = Math.max(0, this.homeButtons().findIndex(b => b.key === 'daily')); WF.Audio.play('menu'); };
  G.dailyClaim = function (i) {
    const got = D.claim(this.menu.p1, i);
    if (got) { WF.Audio.play('heal'); this.dailyFlash = { i, t0: this.t, got }; } else WF.Audio.play('wrong');
  };
  G.dailyKey = function (code) {
    const n = 4;
    if (code === 'Escape' || code === 'Backspace') this.dailyBack();
    else if (code === 'ArrowUp' || code === 'KeyW') { this.ui.dsel = (this.ui.dsel + n - 1) % n; WF.Audio.play('menu'); }
    else if (code === 'ArrowDown' || code === 'KeyS') { this.ui.dsel = (this.ui.dsel + 1) % n; WF.Audio.play('menu'); }
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.dailyClaim(this.ui.dsel === 3 ? 'bonus' : this.ui.dsel);
    else if (code === 'KeyN' && D.debug) { D.debugNextDay(); WF.Audio.play('menu'); }
  };
  G.dailyClick = function (hit) {
    if (hit.key === 'back') this.dailyBack();
    else if (hit.key === 'claim') { this.ui.dsel = hit.i === 'bonus' ? 3 : hit.i; this.dailyClaim(hit.i); }
    else if (hit.key === 'dnext' && D.debug) D.debugNextDay();
  };

  G.drawDaily = function () {
    const c = this.ctx, W = C.SCREEN_W, pid = this.menu.p1, p = WF.Profiles.ext(pid), d = pid ? D.get(pid) : null;
    c.fillStyle = 'rgba(6,3,16,0.82)'; c.fillRect(0, 0, W, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    this.txt('每日任务', W / 2, 38, 38, '#7dff9a', 'center', { font: C.FONT_TITLE, sw: 8 });
    if (!d) { this.txt('还没有玩家档 · 回菜单点右上角建一个', W / 2, 260, 18, '#bfb3d6', 'center', { sw: 4 }); return; }
    const now = new Date(Date.now() + D.offset() * 864e5), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), left = Math.max(0, mid - now);
    this.txt(`${d.day} · ${Math.floor(left / 36e5)} 小时 ${Math.floor(left / 6e4) % 60} 分后刷新`, W / 2, 74, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    this.txt(`闯关积分 ${p.points}`, W - 40, 30, 16, '#ffd23c', 'right', { sw: 4, weight: 700 });
    const x = 120, w = W - 240, h = 78, y0 = 96, fl = this.dailyFlash && this.t - this.dailyFlash.t0 < 40 ? this.dailyFlash : null;
    const row = (i, y, title, desc, k, prog, reward, done, claimed) => {
      const sel = (this.ui.dsel === (i === 'bonus' ? 3 : i));
      this.box(x, y, w, h, claimed ? 'rgba(20,30,24,0.8)' : done ? 'rgba(30,60,30,0.9)' : 'rgba(20,14,40,0.9)', sel ? '#ffd23c' : done && !claimed ? '#7dff9a' : '#5d4f86', sel ? 3 : 2);
      this.txt(title, x + 18, y + 20, 19, claimed ? '#8fa89a' : '#ffffff', 'left', { sw: 4, weight: 700, maxW: 360 });
      this.txt(desc, x + 18, y + 44, 12, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: w - 220 });
      const bx = x + 18, by = y + 58, bw = w - 220;
      this.box(bx, by, bw, 12, '#120c1c', '#4a4660', 1);
      c.fillStyle = done ? '#7dff9a' : '#8fd0ff'; c.fillRect(bx + 1, by + 1, Math.round((bw - 2) * Math.min(1, k)), 10);
      this.txt(prog, bx + bw, y + 20, 14, done ? '#7dff9a' : '#e9d7a6', 'right', { sw: 3, weight: 700 });
      // 领取按钮
      const cx = x + w - 172, cy = y + 16, cw = 156, ch = 46;
      const can = done && !claimed;
      this.box(cx, cy, cw, ch, can ? 'rgba(255,210,60,0.9)' : 'rgba(30,24,52,0.9)', can ? '#7a4a00' : '#3c3852', 2);
      this.txt(claimed ? '已领取 ✔' : can ? `领取 +${reward}` : `+${reward} 积分`, cx + cw / 2, cy + ch / 2 + 1, can ? 19 : 15, can ? '#3a1a00' : claimed ? '#7dff9a' : '#8f8aa6', 'center', { sw: can ? 0 : 3, stroke: can ? false : undefined, weight: 900 });
      if (can && (this.t >> 4) % 2 === 0) { c.fillStyle = '#ff3a3a'; c.fillRect(cx + cw - 12, cy - 4, 14, 14); c.fillStyle = '#ffffff'; c.fillRect(cx + cw - 8, cy, 6, 6); }
      if (fl && fl.i === i) this.txt(`+${fl.got}`, cx + cw / 2, cy - 6 - (this.t - fl.t0) / 2, 22, '#ffd23c', 'center', { sw: 5 });
      this.menuRects.push({ x: cx, y: cy, w: cw, h: ch, key: 'claim', i });
    };
    d.tasks.forEach((t, i) => {
      const def = D.task(t.id);
      const prog = def.fmt ? def.fmt(t.n, t.best) : `${t.n}/${def.goal}`;
      row(i, y0 + i * (h + 10), def.name, def.desc, t.n / def.goal, prog, def.reward, t.done, t.claimed);
    });
    const nd = d.tasks.filter(t => t.done).length;
    row('bonus', y0 + 3 * (h + 10) + 6, '三项全部完成', '今天 3 个任务都完成，额外奖励', nd / 3, `${nd}/3`, BONUS, nd === 3, d.bonusClaimed);
    this.txt('奖励进「闯关积分」（存档累计）。↑↓ 选择  Enter 领取  Esc 返回  鼠标也可点', W / 2, 474, 13, '#9a92bd', 'center', { sw: 3, weight: 700 });
    if (D.debug) {
      this.box(W / 2 - 130, 490, 260, 26, 'rgba(60,10,20,0.9)', '#ff9aa0', 2);
      this.txt(`调试：跳到明天（N）· 偏移 ${D.offset()} 天`, W / 2, 503, 13, '#ff9aa0', 'center', { sw: 3, weight: 700 });
      this.menuRects.push({ x: W / 2 - 130, y: 490, w: 260, h: 26, key: 'dnext', i: -1 });
    }
  };
})();
