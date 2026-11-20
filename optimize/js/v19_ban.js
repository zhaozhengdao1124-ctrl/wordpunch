// v1.9 开局禁用（§5）：第一次全部通关后解锁。选好难度、开局之后先弹这个面板（可直接跳过）。
// 列表 = 图鉴里遇到过的道具（含霉运）；神奇橡皮擦不出现；隐藏道具解锁后才出现。最多点 2 件，每点 1 件系统连带随机禁 1 件非霉运道具（代价）。不影响积分。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19, ITEM = id => C.ITEMS.find(i => i.id === id);
  const life = g => { const pid = g.menu && g.menu.p1, P = pid && WF.Prog && WF.Prog.of(pid); return P ? (P.life || {}) : null; };
  G.banUnlocked = function () { return R.banUnlocked(life(this)); };
  G.banCandidates = function () {
    const I = this.items19(); if (!I) return [];
    return C.ITEMS.filter(d => R.banable(d.id) && I.seen[d.id] && (!d.hidden || this.hiddenUnlocked(d.id))).map(d => d.id)
      .sort((a, b) => { const o = { debuff: 0, legend: 1, curse: 2, rare: 3, common: 4 }; return o[ITEM(a).rarity] - o[ITEM(b).rarity]; });
  };
  // 连带禁用的候选：可见、非霉运、未解锁的隐藏不算（玩家不知道它存在）
  G.banExtraPool = function () { return C.ITEMS.filter(d => d.kind !== 'debuff' && !d.special && (!d.hidden || this.hiddenUnlocked(d.id))).map(d => d.id); };
  G.banMaybeOpen = function () {
    const cp = this.camp; if (!cp || !this.banUnlocked()) return;
    const list = this.banCandidates(); if (!list.length) return;
    cp.modal = { type: 'ban', prev: this.state, list, sel: 0, picks: [], t: 0 };   // picks: [{id, extra}]
    this.state = 'ban';
    this.say(`开局禁用：可选 ${list.length} 件`);
  };
  G.banToggle = function (i) {
    const cp = this.camp, m = cp.modal, id = m.list[i]; if (!id) return;
    m.sel = i;
    const k = m.picks.findIndex(p => p.id === id);
    if (k >= 0) { m.picks.splice(k, 1); WF.Audio.play('menu'); return; }
    if (m.picks.length >= K().ITEMS_V19.BAN_MAX) { WF.Audio.play('wrong'); m.shake = 8; return; }
    const taken = m.picks.flatMap(p => [p.id, p.extra]).filter(Boolean);
    const extra = R.banExtra(this.campRng('ban' + id + m.picks.length), taken.concat([id]), [], this.banExtraPool());
    m.picks.push({ id, extra }); WF.Audio.play('pickup');
  };
  G.banClose = function (apply) {
    const cp = this.camp, m = cp.modal;
    if (apply && m.picks.length) {
      cp.bans.picked = m.picks.map(p => p.id); cp.bans.extra = m.picks.map(p => p.extra).filter(Boolean);
      const I = this.items19(); if (I) { I.banUsed = (I.banUsed || 0) + 1; WF.Profiles.save(); }
      this.toast('本局禁用', cp.bans.picked.concat(cp.bans.extra).map(id => ITEM(id).name).join('、'), null, '#ff9a6a');
      this.say(`禁用 ${cp.bans.picked.join(',')} + 连带 ${cp.bans.extra.join(',')}`);
    }
    cp.modal = null; this.state = m.prev || 'map';
    WF.Audio.play('menu');
  };
  G.banKey = function (code) {
    const m = this.camp.modal, n = m.list.length, cols = 8;
    const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -cols, KeyW: -cols, ArrowDown: cols, KeyS: cols }[code];
    if (mv) { m.sel = Math.max(0, Math.min(n - 1, m.sel + mv)); WF.Audio.play('menu'); return; }
    if (code === 'Space') { this.banToggle(m.sel); return; }
    if (code === 'Enter' || code === 'NumpadEnter') { this.banClose(true); return; }
    if (code === 'Escape') { m.picks = []; this.banClose(false); }
  };
  G.banClick = function (hit) {
    if (!hit) return;
    if (hit.key === 'ban') this.banToggle(hit.i);
    else if (hit.key === 'go') this.banClose(true);
    else if (hit.key === 'skip') { this.camp.modal.picks = []; this.banClose(false); }
    else if (hit.key === 'banpg') { const m = this.camp.modal, per = BAN_T.per, pg = Math.max(0, Math.min(Math.ceil(m.list.length / per) - 1, Math.floor(m.sel / per) + hit.i)); m.sel = pg * per; WF.Audio.play('menu'); }
  };
  G.drawBan = function () {
    if (WF.touch) return this.drawBanT();
    const m = this.camp.modal, c = this.ctx;
    this.campDim(0.86);
    this.txt('开局禁用', C.SCREEN_W / 2, 40, 34, '#ff9a6a', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`最多点 ${K().ITEMS_V19.BAN_MAX} 件：本局不会出现。代价：每点 1 件，系统会连带随机禁掉 1 件好道具`, C.SCREEN_W / 2, 76, 14, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    const cw = 104, ch = 78, gap = 6, cols = 8, x0 = (C.SCREEN_W - (cw * cols + gap * (cols - 1))) / 2, y0 = 96;
    const rows = Math.max(1, Math.floor((410 - y0) / (ch + gap))), per = rows * cols, page = Math.floor(m.sel / per), start = page * per;
    m.list.slice(start, start + per).forEach((id, j) => {
      const i = start + j, d = ITEM(id), x = x0 + (j % cols) * (cw + gap), y = y0 + Math.floor(j / cols) * (ch + gap), picked = m.picks.some(p => p.id === id), sel = m.sel === i;
      const extraOf = m.picks.find(p => p.extra === id);
      this.box(x, y, cw, ch, picked ? 'rgba(120,30,30,0.95)' : extraOf ? 'rgba(70,40,20,0.95)' : 'rgba(20,14,40,0.94)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w: cw, h: ch, key: 'ban', i });
      this.drawItemIcon(id, 1, x + cw / 2 - 16, y + 6, 2);
      this.txt(d.name, x + cw / 2, y + 52, 12, C.RARITY_COLOR[d.rarity], 'center', { sw: 3, maxW: cw - 6 });
      if (picked || extraOf) { c.fillStyle = picked ? '#ff6a6a' : '#ffb15a'; c.fillRect(x + 6, y + ch / 2 - 2, cw - 12, 4); this.txt(picked ? '禁用' : '连带', x + cw / 2, y + 68, 11, picked ? '#ff9a9a' : '#ffcf9a', 'center', { sw: 3 }); }
    });
    if (m.list.length > per) this.txt(`第 ${page + 1} / ${Math.ceil(m.list.length / per)} 页（方向键翻）`, C.SCREEN_W - 30, 76, 12, '#bfb3d6', 'right', { sw: 3 });
    const sd = ITEM(m.list[m.sel]);
    if (sd) this.txt(`${sd.name}：${sd.kind === 'debuff' ? sd.desc() : this.itemDescAt(sd.id, 1)}`, C.SCREEN_W / 2, 424, 13, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: 880 });
    const sum = m.picks.length ? '本局禁用：' + m.picks.map(p => ITEM(p.id).name + (p.extra ? `（连带 ${ITEM(p.extra).name}）` : '')).join('、') : '还没点；不想禁可以直接开始';
    this.txt(sum, C.SCREEN_W / 2, 448, 14, m.picks.length ? '#ff9a9a' : '#8a90a8', 'center', { sw: 3, weight: 700, maxW: 880 });
    this.box(C.SCREEN_W / 2 + 20, 470, 220, 46, 'rgba(40,90,40,0.95)', '#7dff9a', 3); this.campRects.push({ x: C.SCREEN_W / 2 + 20, y: 470, w: 220, h: 46, key: 'go' });
    this.txt(m.picks.length ? '确定，开始（Enter）' : '开始（Enter）', C.SCREEN_W / 2 + 130, 493, 16, '#ffffff', 'center', { sw: 4 });
    this.box(C.SCREEN_W / 2 - 240, 470, 220, 46, 'rgba(20,14,40,0.95)', '#8a90a8', 2); this.campRects.push({ x: C.SCREEN_W / 2 - 240, y: 470, w: 220, h: 46, key: 'skip' });
    this.txt('不禁用（Esc）', C.SCREEN_W / 2 - 130, 493, 16, '#e9d7a6', 'center', { sw: 4 });
    this.txt('点道具 / 空格 选中或取消', 30, 528, 11, '#8a90a8', 'left', { sw: 2 });
  };

  // 触屏版（v1.9 手机）：7 列宽格子（7 个字的名字放得下）、64 高的按钮、翻页按钮；点击区 ≥ 64 逻辑像素、字 ≥ 16
  const BAN_T = { cols: 7, cw: 124, ch: 84, gap: 6, y0: 92, rows: 3, get per() { return this.cols * this.rows; } };
  G.drawBanT = function () {
    const m = this.camp.modal, c = this.ctx, L = BAN_T, per = L.per;
    this.campDim(0.86);
    this.txt('开局禁用', C.SCREEN_W / 2, 34, 32, '#ff9a6a', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`最多点 ${K().ITEMS_V19.BAN_MAX} 件：本局不会出现。代价：每点 1 件，系统会连带随机禁掉 1 件好道具`, C.SCREEN_W / 2, 70, 16, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: 920 });
    const x0 = (C.SCREEN_W - (L.cw * L.cols + L.gap * (L.cols - 1))) / 2, page = Math.floor(m.sel / per), pages = Math.max(1, Math.ceil(m.list.length / per)), start = page * per;
    m.list.slice(start, start + per).forEach((id, j) => {
      const i = start + j, d = ITEM(id), x = x0 + (j % L.cols) * (L.cw + L.gap), y = L.y0 + Math.floor(j / L.cols) * (L.ch + L.gap), picked = m.picks.some(p => p.id === id), sel = m.sel === i;
      const extraOf = m.picks.find(p => p.extra === id);
      this.box(x, y, L.cw, L.ch, picked ? 'rgba(120,30,30,0.95)' : extraOf ? 'rgba(70,40,20,0.95)' : 'rgba(20,14,40,0.94)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w: L.cw, h: L.ch, key: 'ban', i });
      this.drawItemIcon(id, 1, x + L.cw / 2 - 18, y + 4, 2);
      this.txt(d.name, x + L.cw / 2, y + 52, 16, C.RARITY_COLOR[d.rarity], 'center', { sw: 3, maxW: L.cw - 6 });
      if (picked || extraOf) { c.fillStyle = picked ? '#ff6a6a' : '#ffb15a'; c.fillRect(x + 6, y + 24, L.cw - 12, 4); this.txt(picked ? '禁用' : '连带', x + L.cw / 2, y + 72, 16, picked ? '#ff9a9a' : '#ffcf9a', 'center', { sw: 3 }); }
    });
    const sd = ITEM(m.list[m.sel]);
    if (sd) this.wrapLines(`${sd.name}：${sd.kind === 'debuff' ? sd.desc() : this.itemDescAt(sd.id, 1)}`, 900, 16, 1).forEach(ln => this.txt(ln, C.SCREEN_W / 2, 386, 16, '#e9d7a6', 'center', { sw: 3, weight: 700 }));
    const sum = m.picks.length ? '本局禁用：' + m.picks.map(p => ITEM(p.id).name + (p.extra ? `（连带 ${ITEM(p.extra).name}）` : '')).join('、') : '还没点；不想禁可以直接开始';
    this.wrapLines(sum, 900, 16, 1).forEach(ln => this.txt(ln, C.SCREEN_W / 2, 414, 16, m.picks.length ? '#ff9a9a' : '#8a90a8', 'center', { sw: 3, weight: 700 }));
    const by = 440, bh = 66;
    this.box(C.SCREEN_W / 2 + 20, by, 230, bh, 'rgba(40,90,40,0.95)', '#7dff9a', 3); this.campRects.push({ x: C.SCREEN_W / 2 + 20, y: by, w: 230, h: bh, key: 'go' });
    this.txt(m.picks.length ? '确定，开始' : '开始', C.SCREEN_W / 2 + 135, by + bh / 2, 20, '#ffffff', 'center', { sw: 4 });
    this.box(C.SCREEN_W / 2 - 250, by, 230, bh, 'rgba(20,14,40,0.95)', '#8a90a8', 2); this.campRects.push({ x: C.SCREEN_W / 2 - 250, y: by, w: 230, h: bh, key: 'skip' });
    this.txt('不禁用', C.SCREEN_W / 2 - 135, by + bh / 2, 20, '#e9d7a6', 'center', { sw: 4 });
    if (pages > 1) {
      const pb = (x, on, label, d) => { this.box(x, by, 120, bh, on ? 'rgba(20,14,40,0.92)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + 60, by + bh / 2, 16, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3 }); if (on) this.campRects.push({ x, y: by, w: 120, h: bh, key: 'banpg', i: d }); };
      pb(20, page > 0, '◀ 上页', -1); pb(C.SCREEN_W - 140, page < pages - 1, '下页 ▶', 1);
      this.txt(`${page + 1}/${pages}`, C.SCREEN_W - 80, by - 10, 16, '#bfb3d6', 'center', { sw: 3 });
    }
  };
})();
