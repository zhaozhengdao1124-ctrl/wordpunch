// v1.7.1「角色成长」页：标题菜单 / 选角界面（G 键或右上角按钮）进入。
// 每个角色：等级、到下一级的经验条、六维加成（当前 / Lv30 上限）、天赋；没解锁的角色灰掉 + 写怎么解锁。
// 成长是自动的（没有加点）：升级时六维按角色定位自动长，天赋 Lv1 就有。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, P = WF.Prog.P, Prog = WF.Prog, U = WF.Unlocks;
  const pct = x => Math.round(x * 100);
  const EFFECT = {
    hp: x => `最大血量 +${pct(x)}%`,
    str: x => `普通 / 连击 / 角力伤害 +${pct(x)}%`,
    rea: x => `速答窗口 +${(P.REA_S * x).toFixed(2)} 秒`,
    foc: x => `必杀伤害 +${pct(x)}%`,
    tou: x => `受到伤害 −${pct(1 - 1 / (1 + x))}%`,
    luk: x => `暴击率 +${(P.LUK_CRIT * x * 100).toFixed(1)}%`,
  };

  // ---------- 入口 ----------
  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice(), i = b.findIndex(x => x.key === 'ach');
    b.splice(i + 1, 0, { key: 'grow', label: '角色成长' });
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, d) { if (key === 'grow') { this.goGrow('title'); return; } return baseAct.call(this, key, d); };
  G.goGrow = function (from) {
    const R = C.ROSTER;
    this.ui.growFrom = from || 'title';
    this.ui.growSel = from === 'charsel' ? (this.ui.sel || 0) : Math.max(0, R.indexOf(this.menu.char));
    this.ui.screen = 'growth'; this.state = 'title'; WF.Audio.play('menu');
  };
  G.growBack = function () {
    if (this.ui.growFrom === 'charsel') { this.ui.screen = 'charsel'; this.ui.sel = this.ui.growSel; if (this.charselPreview) this.charselPreview(); }
    else { this.ui.screen = 'title'; this.menu.row = Math.max(0, this.homeButtons().findIndex(b => b.key === 'grow')); }
    WF.Audio.play('menu');
  };
  G.growKey = function (code) {
    const n = C.ROSTER.length;
    if (code === 'Escape' || code === 'Backspace' || code === 'KeyG') this.growBack();
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') { this.ui.growSel = (this.ui.growSel + n - 1) % n; WF.Audio.play('menu'); }
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS') { this.ui.growSel = (this.ui.growSel + 1) % n; WF.Audio.play('menu'); }
  };
  G.growClick = function (hit) {
    if (hit.key === 'back') this.growBack();
    else if (hit.key === 'gtab') { this.ui.growSel = hit.i; WF.Audio.play('menu'); }
  };

  // 选角界面右上角加一个「角色成长 G」按钮
  const baseCS = G.drawCharSel;
  G.drawCharSel = function () {
    baseCS.call(this);
    const x = 110, y = 16, w = 128, h = 28;
    this.box(x, y, w, h, 'rgba(20,14,40,0.82)', '#7dffe0', 2);
    this.txt('角色成长（G）', x + w / 2, y + 15, 14, '#7dffe0', 'center', { sw: 3, weight: 700 });
    this.menuRects.push({ x, y, w, h, key: 'grow', i: -1 });
  };

  // ---------- 画面 ----------
  G.drawGrowth = function () {
    const c = this.ctx, W = C.SCREEN_W, R = C.ROSTER, pid = this.menu.p1, prof = WF.Profiles.get(pid), g = pid ? Prog.of(pid) : null;
    const sel = this.ui.growSel = Math.max(0, Math.min(R.length - 1, this.ui.growSel || 0));
    c.fillStyle = 'rgba(6,3,16,0.82)'; c.fillRect(0, 0, W, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    this.txt('角色成长', W / 2, 36, 36, '#7dffe0', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(g ? `${prof ? prof.name + ' · ' : ''}玩家 Lv${g.lv}` : '还没有玩家档', W - 40, 30, 15, '#e9d7a6', 'right', { sw: 3, weight: 700 });

    // 角色页签（一排 7 个）
    const tw = 118, tg = 8, tx0 = (W - (tw * R.length + tg * (R.length - 1))) / 2, ty = 62, th = 84;
    R.forEach((id, i) => {
      const open = pid ? U.has(pid, id) : U.rule(id).start, ch = Prog.char(pid, id), x = tx0 + i * (tw + tg), on = i === sel, mv = C.MOVES[id];
      this.box(x, ty, tw, th, on ? 'rgba(125,255,224,0.14)' : open ? 'rgba(20,14,40,0.86)' : 'rgba(10,8,20,0.86)', on ? '#7dffe0' : open ? '#5d4f86' : '#3a3352', on ? 3 : 2);
      this.drawCharBust(id, true, x + 6, ty + 8, 44, open ? {} : { sil: true, border: '#5d5578' });
      if (!open) this.drawLock(x + 28, ty + 34, 22, '#c9bfe0');
      this.txt(mv.name, x + 56, ty + 22, 16, open ? mv.color : '#8f86b8', 'left', { sw: 4, weight: 700, maxW: tw - 60 });
      this.txt(open ? `Lv${ch.lv}` : '未解锁', x + 56, ty + 46, open ? 18 : 13, open ? (ch.lv >= P.CHAR_MAX ? '#ffd23c' : '#ffffff') : '#ff9aa0', 'left', { sw: 4, weight: 700 });
      // 页签底部小经验条
      const need = ch.lv < P.CHAR_MAX ? P.CHAR_NEED(ch.lv) : 0, k = need ? Math.min(1, ch.xp / need) : 1;
      this.box(x + 8, ty + th - 18, tw - 16, 8, '#120c1c', open ? '#4a4660' : '#2e2b3e', 1);
      if (open) { c.fillStyle = '#7dffe0'; c.fillRect(x + 9, ty + th - 17, Math.round((tw - 18) * k), 6); }
      this.menuRects.push({ x, y: ty, w: tw, h: th, key: 'gtab', i });
    });

    // 详情
    const id = R[sel], mv = C.MOVES[id], open = pid ? U.has(pid, id) : U.rule(id).start, ch = Prog.char(pid, id), b = P.BIAS[id] || {}, t = P.TALENT[id];
    const dx = 40, dy = 158, dw = W - 80, dh = 318;
    this.box(dx, dy, dw, dh, 'rgba(20,14,40,0.9)', open ? mv.color : '#3a3352', 2);
    const dim = open ? 1 : 0.5;
    this.drawCharBust(id, true, dx + 18, dy + 18, 104, open ? {} : { sil: true, border: '#5d5578' });
    if (!open) this.drawLock(dx + 70, dy + 76, 44, '#c9bfe0');
    this.txt(mv.name, dx + 18 + 52, dy + 144, 28, open ? mv.color : '#8f86b8', 'center', { font: C.FONT_TITLE, sw: 6, maxW: 130 });
    this.txt(`定位：${b.role || '-'}`, dx + 70, dy + 174, 14, open ? '#e9d7a6' : '#8f86b8', 'center', { sw: 3, weight: 700 });
    // 等级 + 经验条
    const ex = dx + 150, ew = 420;
    this.txt(`Lv${ch.lv}`, ex, dy + 30, 30, open ? '#ffffff' : '#8f86b8', 'left', { font: C.FONT_TITLE, sw: 6 });
    this.txt(`/ ${P.CHAR_MAX}`, ex + 78, dy + 34, 15, '#bfb3d6', 'left', { sw: 3, weight: 700 });
    const need = ch.lv < P.CHAR_MAX ? P.CHAR_NEED(ch.lv) : 0;
    this.box(ex, dy + 52, ew, 16, '#120c1c', '#4a4660', 2);
    c.fillStyle = open ? '#7dffe0' : '#4a4660'; c.fillRect(ex + 2, dy + 54, Math.round((ew - 4) * (need ? Math.min(1, ch.xp / need) : 1)), 12);
    this.txt(need ? `经验 ${ch.xp} / ${need} · 还差 ${need - ch.xp} 升到 Lv${ch.lv + 1}` : '已满级', ex, dy + 84, 14, open ? '#e9d7a6' : '#8f86b8', 'left', { sw: 3, weight: 700 });
    if (open) this.txt('升级全自动，不用加点：六维按定位成长，Lv30 比 Lv1 强 30%。闯关里每答对 1 题 +10、每城 +100、全通 +500；一局最多升 2 级。', ex, dy + 106, 12, '#9a92bd', 'left', { sw: 3, weight: 700, maxW: dw - 170 });
    else {
      const pr = pid ? U.progress(pid, id) : '';
      this.txt(`解锁条件：${U.hint(id)}${pr ? '  ·  ' + pr : ''}`, ex, dy + 106, 13, '#ffd23c', 'left', { sw: 3, weight: 700, maxW: dw - 170 });
    }

    // 六维：当前加成（实心）/ Lv30 上限（暗色）
    const st = Prog.stats(id, ch.lv), mx = Prog.stats(id, P.CHAR_MAX), sx = ex, sy = dy + 132, bw = 130;
    const top = Math.max(...P.STATS.map(([s]) => mx[s]));
    P.STATS.forEach(([s, name], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = sx + col * 370, y = sy + row * 34;
      this.txt(name, x, y, 15, open ? '#ffffff' : '#8f86b8', 'left', { sw: 3, weight: 700 });
      this.box(x + 42, y - 6, bw, 12, '#120c1c', '#3a3352', 1);
      c.fillStyle = '#3a3460'; c.fillRect(x + 43, y - 5, Math.round((bw - 2) * mx[s] / top), 10);
      c.fillStyle = open ? '#8fd0ff' : '#5d5878'; c.fillRect(x + 43, y - 5, Math.round((bw - 2) * st[s] / top), 10);
      this.txt(EFFECT[s](st[s]), x + 42 + bw + 8, y, 12, open ? '#e9d7a6' : '#8f86b8', 'left', { sw: 3, weight: 700, maxW: 180 });
    });
    this.txt(`暗条 = Lv${P.CHAR_MAX} 上限（权重：${P.STATS.map(([s, n]) => n + (b[s] == null ? 1 : b[s])).join(' ')}）`, sx, sy + 104, 11, '#7d7894', 'left', { sw: 3, weight: 700, maxW: dw - 170 });

    // 天赋
    const ty2 = dy + 254;
    this.box(dx + 14, ty2, dw - 28, 52, open ? 'rgba(60,40,10,0.55)' : 'rgba(22,20,32,0.8)', open ? '#ffd23c' : '#3a3352', 2);
    const isUlt = id === 'mileiba' || id === 'maxike';
    this.txt(`${isUlt ? '特色必杀' : '天赋'}「${t ? t.name : '-'}」`, dx + 28, ty2 + 17, 16, open ? '#ffd23c' : '#8f86b8', 'left', { sw: 4, weight: 700 });
    this.txt(open ? (isUlt ? '已拥有（玩家版必杀）' : '已拥有 · Lv1 起生效') : '解锁角色后拥有', dx + dw - 28, ty2 + 17, 13, open ? '#7dff9a' : '#ff9aa0', 'right', { sw: 3, weight: 700 });
    this.txt(t ? t.desc : '', dx + 28, ty2 + 38, 13, open ? '#ffffff' : '#8f86b8', 'left', { sw: 3, weight: 700, maxW: dw - 60 });
    void dim;
    this.txt('←→ 换角色    Esc 返回    鼠标也可点', W / 2, 516, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  // ---------- 结算：角色经验更显眼 ----------
  // 全部通关：原面板里的角色经验条加上「+N」「经验 x/y」「还差 N 升 LvX」
  const baseGP = G.drawGrantPanel;
  G.drawGrantPanel = function (gr, x, y, w, t) {
    baseGP.call(this, gr, x, y, w, t);
    if (!gr || t < 50) return;
    const name = C.MOVES[this.camp.playerId].name, nd = gr.chNeed;
    const txt = nd ? `${name} 经验 ${gr.chXp}/${nd} · 还差 ${nd - gr.chXp} 升到 Lv${gr.ch.to + 1}` : `${name} 已满级`;
    this.txt(txt, x + 150, y + 74, 12, '#7dffe0', 'left', { sw: 3, weight: 700 });
  };
  // 倒下的结算：下面补一条角色经验条
  const baseRS = G.drawRunSummary;
  G.drawRunSummary = function () {
    baseRS.call(this);
    const gr = this.camp && this.camp.grant; if (!gr || this.result.t < 6) return;
    const c = this.ctx, name = C.MOVES[this.camp.playerId].name, x = 230, y = 498, w = 500, nd = gr.chNeed;
    const k = Math.min(1, (this.result.t - 6) / 40);
    this.box(x - 6, y - 12, w + 12, 24, 'rgba(12,8,26,0.92)', '#7dffe0', 1);
    this.txt(`${name} Lv${gr.ch.to}`, x, y, 13, '#7dffe0', 'left', { sw: 3, weight: 700 });
    c.fillStyle = '#2a2440'; c.fillRect(x + 92, y - 5, 220, 10);
    c.fillStyle = '#7dffe0'; c.fillRect(x + 92, y - 5, Math.round(220 * (nd ? Math.min(1, gr.chXp / nd) : 1) * k), 10);
    this.txt(gr.ch.to > gr.ch.from ? `LEVEL UP!  +${gr.xp}` : `+${gr.xp} · ${gr.chXp}/${nd}`, x + 322, y, 13, gr.ch.to > gr.ch.from ? '#ffd23c' : '#e9d7a6', 'left', { sw: 3, weight: 700, maxW: w - 322 });
  };
})();
