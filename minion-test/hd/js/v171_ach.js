// v1.7.1 成就页：标题菜单「成就」入口 → 全部成就列表（已解锁彩色 + 日期 / 未解锁灰色 + 条件 + 进度），分页，Esc / 返回 回菜单。
// 顶部小条：玩家等级 + 经验、剧情 / 挑战各自最高分。进度记录 prog.rec 从 v1.7.1 起累计（之前的局没有逐项记录，只能从已有字段推一部分）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, KC = C.CAMPAIGN, P = WF.Prog.P, Prog = WF.Prog;
  const PER = 10;   // 每页 2 列 × 5 行

  // ---------- 进度记录：每局结算时累计（中途退出不记，和成就规则一致） ----------
  const baseGrant = G.campGrant;
  G.campGrant = function (kind) {
    const had = this.camp && this.camp.grant;
    const out = baseGrant.call(this, kind);
    if (had || !out || kind === 'quit') return out;
    const g = Prog.of(this.menu.p1); if (!g) return out;
    const r = g.rec = g.rec || {}, st = this.stats[0], cp = this.camp, full = kind === 'full';
    const cities = cp.cleared.length + (full ? 1 : 0);
    r.combo = Math.max(r.combo || 0, st.maxCombo || st.maxStreak || 0);
    r.ults = Math.max(r.ults || 0, st.ults || 0);
    r.cities = Math.max(r.cities || 0, cities);
    r[cp.mode + 'Cities'] = Math.max(r[cp.mode + 'Cities'] || 0, cities);
    if (out.score) {
      if (full) r.acc = Math.max(r.acc || 0, out.score.acc || 0);
      const order = ['C', 'B', 'A', 'S'];
      if (order.indexOf(out.score.rank) > order.indexOf(r.rank || '')) r.rank = out.score.rank;
    }
    WF.Profiles.save();
    return out;
  };

  // ---------- 每个成就的进度 ----------
  function progress(id, g) {
    const r = (g && g.rec) || {}, runs = g ? (g.runs.story || 0) + (g.runs.challenge || 0) : 0;
    const N = KC.ROUTE.length, lvMax = g ? Math.max(1, ...Object.values(g.chars || {}).map(c => c.lv || 1)) : 1;
    const f = (n, of) => ({ n: Math.min(n, of), of });
    switch (id) {
      case 'first_run': return f(runs, 1);
      case 'city1': return f(r.cities || 0, 1);
      case 'story_clear': return f(r.storyCities || 0, N);
      case 'challenge_clear': return f(r.challengeCities || 0, N);
      case 'combo20': return f(r.combo || 0, 20);
      case 'combo50': return f(r.combo || 0, 50);
      case 'ult10': return f(r.ults || 0, 10);
      case 'lv10': return f(lvMax, 10);
      case 'lv30': return f(lvMax, 30);
      case 'acc95': return r.acc ? { text: `最好 ${Math.floor(r.acc * 100)}%` } : null;
      case 'rank_s': return r.rank ? { text: `最好 ${r.rank}` } : null;
      default: return null;
    }
  }
  const dstr = ts => { const d = new Date(ts); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  // ---------- 菜单入口 ----------
  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice(), i = b.findIndex(x => x.key === 'wrongbook');
    b.splice(i + 1, 0, { key: 'ach', label: '成就' });
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, d) { if (key === 'ach') { this.goAch(); return; } return baseAct.call(this, key, d); };
  G.goAch = function () { this.state = 'title'; this.ui.screen = 'achievements'; this.ui.achPage = 0; WF.Audio.play('menu'); };
  G.achPages = function () { return Math.max(1, Math.ceil(P.ACH.length / PER)); };
  G.achBack = function () { this.ui.screen = 'title'; this.menu.row = Math.max(0, this.homeButtons().findIndex(b => b.key === 'ach')); WF.Audio.play('menu'); };
  G.achTurn = function (d) {
    const n = this.achPages(), p = Math.max(0, Math.min(n - 1, (this.ui.achPage || 0) + d));
    if (p !== this.ui.achPage) { this.ui.achPage = p; WF.Audio.play('menu'); }
  };
  G.achKey = function (code) {
    if (code === 'Escape' || code === 'Backspace') this.achBack();
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'PageDown' || code === 'ArrowDown' || code === 'KeyS') this.achTurn(1);
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'PageUp' || code === 'ArrowUp' || code === 'KeyW') this.achTurn(-1);
  };
  G.achClick = function (hit) {
    if (hit.key === 'back') this.achBack();
    else if (hit.key === 'prev') this.achTurn(-1);
    else if (hit.key === 'next') this.achTurn(1);
  };

  // ---------- 画面 ----------
  G.drawAchievements = function () {
    const c = this.ctx, W = C.SCREEN_W, pid = this.menu.p1, prof = WF.Profiles.get(pid), g = pid ? Prog.of(pid) : null;
    const list = P.ACH, got = list.filter(a => g && g.ach[a[0]]).length, pages = this.achPages();
    const page = this.ui.achPage = Math.max(0, Math.min(pages - 1, this.ui.achPage || 0));
    c.fillStyle = 'rgba(6,3,16,0.8)'; c.fillRect(0, 0, W, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    this.txt('成就', W / 2, 38, 38, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`已解锁 ${got}/${list.length}`, W - 40, 30, 18, got ? '#ffd23c' : '#bfb3d6', 'right', { sw: 4, weight: 700 });

    // 顶部小条：玩家等级 / 经验 / 两个模式最高分
    const hy = 66;
    this.box(40, hy, W - 80, 30, 'rgba(20,14,40,0.86)', '#5d4f86', 2);
    if (g) {
      const need = P.PLAYER_NEED(g.lv), k = Math.max(0, Math.min(1, g.xp / need));
      this.txt(`${prof ? prof.name : ''}  玩家 Lv${g.lv}`, 54, hy + 15, 15, '#ffffff', 'left', { sw: 4, weight: 700, maxW: 190 });
      const bx = 254, bw = 180;
      this.box(bx, hy + 9, bw, 12, '#120c1c', '#5d4f86', 1);
      c.fillStyle = '#7ec8ff'; c.fillRect(bx + 2, hy + 11, Math.round((bw - 4) * k), 8);
      this.txt(`${g.xp}/${need}`, bx + bw + 8, hy + 15, 13, '#bfb3d6', 'left', { sw: 3, weight: 700 });
      const M = KC.MODES;
      this.txt(`${M.story.name} 最高 ${g.best.story || 0}`, 640, hy + 15, 14, M.story.color, 'center', { sw: 4, weight: 700 });
      this.txt(`${M.challenge.name} 最高 ${g.best.challenge || 0}`, 820, hy + 15, 14, M.challenge.color, 'center', { sw: 4, weight: 700 });
    } else this.txt('还没有玩家档 · 回菜单点右上角建一个，开始闯关就能解锁成就', W / 2, hy + 15, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });

    // 成就卡：2 列 × 5 行
    const cw = 432, ch = 64, gx = 16, gy = 10, x0 = (W - cw * 2 - gx) / 2, y0 = 108;
    list.slice(page * PER, page * PER + PER).forEach((a, i) => {
      const [id, name, cond] = a, ts = g && g.ach[id], x = x0 + (i % 2) * (cw + gx), y = y0 + Math.floor(i / 2) * (ch + gy);
      this.box(x, y, cw, ch, ts ? 'rgba(60,40,10,0.9)' : 'rgba(22,20,32,0.9)', ts ? '#ffd23c' : '#3c3852', 2);
      // 徽章：已解锁金色星 / 未解锁灰色锁
      const bx = x + 10, by = y + 12;
      this.box(bx, by, 40, 40, ts ? '#ffd23c' : '#2e2b3e', ts ? '#7a4a00' : '#4a4660', 2);
      this.txt(ts ? '★' : '?', bx + 20, by + 21, ts ? 26 : 22, ts ? '#7a1414' : '#6d6888', 'center', { sw: 0, stroke: false });
      this.txt(name, x + 62, y + 20, 18, ts ? '#ffd23c' : '#8f8aa6', 'left', { sw: 4, weight: 700, maxW: 220 });
      this.txt(cond, x + 62, y + 45, 13, ts ? '#ffffff' : '#7d7894', 'left', { sw: 3, weight: 700, maxW: cw - 72 - (ts ? 0 : 76) });
      if (ts) this.txt(`${dstr(ts)} 解锁`, x + cw - 12, y + 20, 12, '#e9d7a6', 'right', { sw: 3, weight: 700 });
      else {
        const pr = progress(id, g);
        if (pr && pr.of) {
          this.txt(`${pr.n}/${pr.of}`, x + cw - 12, y + 20, 14, '#bfb3d6', 'right', { sw: 3, weight: 700 });
          const pw = 64, px = x + cw - 12 - pw, py = y + 40;
          this.box(px, py, pw, 8, '#120c1c', '#4a4660', 1);
          c.fillStyle = '#9a8fd0'; c.fillRect(px + 1, py + 1, Math.round((pw - 2) * pr.n / pr.of), 6);
        } else if (pr && pr.text) this.txt(pr.text, x + cw - 12, y + 20, 13, '#bfb3d6', 'right', { sw: 3, weight: 700 });
        else this.txt('未解锁', x + cw - 12, y + 20, 12, '#6d6888', 'right', { sw: 3, weight: 700 });
      }
    });

    // 翻页
    const fy = 488;
    if (pages > 1) {
      const btn = (key, label, x, on) => { this.box(x, fy - 15, 110, 30, on ? 'rgba(20,14,40,0.88)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + 55, fy, 15, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3, weight: 700 }); if (on) this.menuRects.push({ x, y: fy - 15, w: 110, h: 30, key, i: -1 }); };
      btn('prev', '◀ 上一页', W / 2 - 190, page > 0);
      btn('next', '下一页 ▶', W / 2 + 80, page < pages - 1);
      this.txt(`第 ${page + 1} / ${pages} 页`, W / 2, fy, 15, '#ffffff', 'center', { sw: 4, weight: 700 });
    }
    this.txt('←→ 翻页    Esc 返回    鼠标也可点', W / 2, 524, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };
})();
