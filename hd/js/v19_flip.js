// v1.9 翻牌（§2.1–2.4）：精英 / 城市对手统一 9 选 1。出盘时整盘已定（种子化），玩家选的那张先翻开，停顿约 0.5 秒，其余 8 张同时翻开变暗。
// 任意键 / 点击跳过动画；Enter / 点击继续。保底：连续 2 坏 / 连续 3 没好 → 下一盘全是好牌（toast「运气回来了」）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19, ITEM = id => C.ITEMS.find(i => i.id === id);
  const art = () => window.WF_ART19 || { ui: [] };
  const KIND = {
    I: { name: '道具', col: null }, G: { name: '金币', col: '#ffd24a' }, H: { name: '加血', col: '#7dff9a' },
    E: { name: '空盒子', col: '#8a90a8' }, X: { name: '掉血', col: '#ff6a6a' }, D: { name: '霉运', col: '#a08a68' },
  };
  // 网格：960×540 画布上 3×3，每张 132×104（手机 667×375 下 ≈ 92×72 CSS px，大于 44）
  const CW0 = 132, CH = 104, GX = 14, GY = 12, GRID_Y = 118, CW_T = 176;   // 触屏：牌宽 176，16px 的说明一行放得下
  const cellRect = i => { const CW = WF.touch ? CW_T : CW0, x0 = (C.SCREEN_W - (CW * 3 + GX * 2)) / 2; return { x: x0 + (i % 3) * (CW + GX), y: GRID_Y + Math.floor(i / 3) * (CH + GY), w: CW, h: CH }; };
  G.flipCellRect = cellRect;
  // 「你翻的」签：挂在牌的左上角（往左探出 8px，落在牌缝里），右边离 ×3 图标框 ≥3px，离右上角的乌云角标更远（item_rules_check 核对）
  G.flipOwnTagRect = r => WF.touch ? { x: r.x - 10, y: r.y - 10, w: 58, h: 22 } : { x: r.x - 8, y: r.y - 9, w: 44, h: 18 };
  G.flipIconFrameRect = r => ({ x: Math.round(r.x + r.w / 2 - 27), y: r.y + 4, w: 54, h: 54 });

  G.flipOpen = function (tier) {
    const cp = this.camp, diff = this.diffCamp ? this.diffCamp() : 'normal';
    cp.flipN++;
    const rng = this.campRng('flip' + cp.flipN);
    const board = R.makeBoard({
      rng, diff, tier, pity: cp.pity, goldMul: this.goldMul(), debuffPool: this.debuffPool(),
      eraserOK: !this.itemOwnedLv('eraser') && !cp.removed.includes('eraser'),
      drawItem: (r, exclude) => this.rollItem(this.rollTier(null, r), exclude, r),
    });
    // 金币牌的城市系数：出盘时算好，翻开显示的就是实际到账的数
    for (const c of board.cards) if (c.k === 'G') c.gold = Math.max(1, Math.round(c.gold * K().GOLD.CITY_MUL(cp.ci)));
    cp.modal = { type: 'flip', tier, board, sel: 4, pick: null, t: 0, pt: 0, skip: false, forced: board.forced };
    this.state = 'flip';
    if (board.forced) { this.toast('运气回来了', '这一盘每一张都是好东西', null, '#7dff9a'); WF.Audio.play('rating', { big: true }); }
    this.say(`翻牌 ${tier} #${cp.flipN} ${board.comp}${board.forced ? '（保底）' : ''} = ${board.cards.map(c => c.k + (c.id ? ':' + c.id : c.gold ? ':' + c.gold : c.pct ? ':' + c.pct : '')).join(' ')}`);
    WF.Audio.play('whoosh');
  };
  const FL = () => K().FLIP.REVEAL;
  const ownDone = m => m.pick != null && (m.skip || m.pt >= 12);
  const allDone = m => m.pick != null && (m.skip || m.pt >= FL().own + FL().pause + FL().others);
  G.flipAllDone = function () { const m = this.camp && this.camp.modal; return !!(m && m.type === 'flip' && allDone(m)); };
  G.flipPick = function (i) {
    const cp = this.camp, m = cp.modal; if (m.pick != null || i < 0 || i > 8) return;
    m.pick = i; m.pt = 0; WF.Audio.play('whoosh');
    const card = m.board.cards[i];
    cp.pity = R.pityAfter(cp.pity, card.k);
    cp.goodRun = R.cls(card.k) === 'good' ? cp.goodRun + 1 : 0;
    cp.flipLog.push(card.k);
    this.flipApply(card, m.tier);
    // 图鉴：翻开展示到的道具 / 霉运也算「遇到过」
    for (const c of m.board.cards) if (c.id) this.itemSeen(c.id);
    this.say(`翻牌选 ${i + 1} → ${card.k}${card.id ? ' ' + card.id : ''}  保底 ${JSON.stringify(cp.pity)}`);
  };
  G.flipApply = function (card, tier) {
    const cp = this.camp, P = this.p[0];
    if (card.k === 'I') this.giveItem(card.id, tier === 'city' ? '对手翻牌' : '精英翻牌');
    else if (card.k === 'G') { cp.gold += card.gold; cp.goldGot += card.gold; cp.goldFx = { t: 0, n: card.gold }; const I = this.items19(); if (I && cp.goldGot > I.maxGold) I.maxGold = cp.goldGot; this.toast(`金币 +${card.gold}`, '小黄布袋里哗啦啦掉出来', null, '#ffd24a'); WF.Audio.play('pickup', { rare: true }); this.say(`金币 +${card.gold}（翻牌）余 ${cp.gold}`); }
    else if (card.k === 'H') { const before = P.hp; this.campHeal(P.maxHp * card.pct, '翻牌'); this.toast(`回血 +${P.hp - before}`, `回复 ${Math.round(card.pct * 100)}% 最大血量`, null, '#7dff9a'); }
    else if (card.k === 'X') { const before = P.hp; P.hp = R.hurtTo(P.hp, P.maxHp, card.pct); P.trail = Math.max(P.trail, P.hp); this.toast(`掉血 −${before - P.hp}`, `−${Math.round(card.pct * 100)}% 最大血量（不会因此倒下）`, null, '#ff6a6a'); WF.Audio.play('wrong'); }
    else if (card.k === 'D') this.giveItem(card.id, '翻牌霉运');
    else { this.toast('下次一定', '空盒子里只有一小片阳光', null, '#8a90a8'); WF.Audio.play('beep', { f: 300, d: 0.08 }); }
  };
  G.flipClose = function () {
    const cp = this.camp, m = cp.modal; cp.modal = null;
    if (m.tier === 'city') { this.campOpenCleared(); return; }
    this.state = 'minionOut';
  };
  G.tick19 = function () {
    const m = this.camp && this.camp.modal; if (!m) return;
    if (m.type === 'flip' && m.machine) { WF.LootReview.tick(this,m); return; }
    if (m.type === 'flip' && m.pick != null && !m.skip) {
      m.pt++;
      if (m.pt === FL().own + FL().pause) WF.Audio.play('whoosh');
    }
    if (this.tickShop) this.tickShop();
  };
  G.flipKey = function (code) {
    const m = this.camp.modal;
    if (m.inReview || m.machine) return WF.LootReview.key(this,m,code);
    if ((m.pick == null || allDone(m)) && code === 'KeyR') return WF.LootReview.open(this,m);
    const num = /^(Digit|Numpad)([1-9])$/.exec(code);
    if (m.pick == null) {
      if (num) return this.flipPick(+num[2] - 1);
      const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -3, KeyW: -3, ArrowDown: 3, KeyS: 3 }[code];
      if (mv) { const n = m.sel + mv; if (n >= 0 && n < 9 && !(Math.abs(mv) === 1 && Math.floor(n / 3) !== Math.floor(m.sel / 3))) { m.sel = n; WF.Audio.play('menu'); } return; }
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.flipPick(m.sel);
      return;
    }
    if (!allDone(m)) { m.skip = true; WF.Audio.play('menu'); return; }
    if (m.pt + (m.skip ? 99 : 0) > 0 && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'Escape')) this.flipClose();
  };
  G.flipClick = function (hit) {
    const m = this.camp.modal;
    if (m.inReview || m.machine) return WF.LootReview.click(this,m,hit);
    if ((m.pick == null || allDone(m)) && hit?.key === 'machine') return WF.LootReview.open(this,m);
    if (m.pick == null) { if (hit && hit.key === 'card') this.flipPick(hit.i); return; }
    if (!allDone(m)) { m.skip = true; return; }
    if (hit?.key === 'leave') this.flipClose();
  };

  // ---------- 画面 ----------
  G.drawCardBack19 = function (x, y, w, h, i, sel) {
    const c = this.ctx;
    this.box(x, y, w, h, '#2a1a4a', sel ? '#ffd23c' : '#e9d7a6', sel ? 4 : 3);
    for (let yy = y + 8; yy < y + h - 8; yy += 10) for (let xx = x + 8; xx < x + w - 8; xx += 10) { c.fillStyle = ((xx - x) / 10 + (yy - y) / 10) % 2 ? '#3a2a6a' : '#21143a'; c.fillRect(xx, yy, Math.min(10, x + w - 8 - xx), Math.min(10, y + h - 8 - yy)); }
    c.fillStyle = '#120c1c'; c.fillRect(x + w / 2 - 24, y + h / 2 - 24, 48, 48);
    this.txt('?', x + w / 2, y + h / 2 + 2, 40, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 5 });
    this.txt(String(i + 1), x + 14, y + 16, 16, '#ffd23c', 'center', { sw: 4 });
  };
  G.drawResIcon = function (k, x, y, s) {   // 翻牌结果小图（Codex 的 ui/res_*.png 到了就用，没到画占位）
    const file = { G: 'res_gold', H: 'res_heal', E: 'res_empty', X: 'res_hurt' }[k], c = this.ctx;
    const im = file && WF.hasArt19('ui', file) ? WF.campImg('ui/' + file + '.png') : null;
    if (im) { WF.blit19(c, im, x, y, s, s / 16); return; }
    const u = s / 16, P = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x + px * u), Math.round(y + py * u), Math.ceil(w * u), Math.ceil(h * u)); };
    if (k === 'G') { P(4, 4, 8, 10, '#25202e'); P(5, 5, 6, 8, '#c9a04a'); P(6, 3, 4, 2, '#25202e'); P(5, 7, 6, 1, '#8a6a1a'); this.drawCoin(x + 10 * u, y + 9 * u, 6 * u); this.drawCoin(x, y + 10 * u, 5 * u); }
    else if (k === 'H' || k === 'X') { P(2, 4, 5, 6, '#25202e'); P(9, 4, 5, 6, '#25202e'); P(3, 8, 10, 4, '#25202e'); P(5, 12, 6, 2, '#25202e'); P(3, 5, 3, 4, '#fb4647'); P(10, 5, 3, 4, '#fb4647'); P(4, 8, 8, 4, '#fb4647'); P(6, 12, 4, 1, '#fb4647'); P(4, 5, 1, 1, '#ffffff'); if (k === 'X') { P(7, 5, 2, 3, '#25202e'); P(8, 8, 1, 3, '#25202e'); P(7, 11, 1, 2, '#25202e'); } }
    else { P(2, 6, 12, 8, '#25202e'); P(3, 7, 10, 6, '#8a7a5a'); P(3, 7, 10, 2, '#5a4a36'); P(1, 3, 6, 3, '#25202e'); P(2, 4, 4, 1, '#a89470'); P(8, 9, 1, 1, '#c8c0b0'); P(10, 11, 1, 1, '#c8c0b0'); }
  };
  G.drawCardFace19 = function (card, x, y, w, h, own, dim) {
    const c = this.ctx, k = card.k, d = card.id && ITEM(card.id), col = k === 'I' ? C.RARITY_COLOR[d.rarity] : KIND[k].col;
    this.box(x, y, w, h, k === 'D' ? 'rgba(46,34,24,0.97)' : k === 'X' ? 'rgba(60,16,24,0.97)' : 'rgba(24,16,44,0.97)', col, own ? 4 : 3);
    let line1 = '', line2 = '';
    if (k === 'I' || k === 'D') {
      { const f = this.flipIconFrameRect({ x, y, w, h }); this.drawItemIcon(card.id, k === 'I' ? Math.max(1, this.itemOwnedLv(card.id)) : 0, f.x, f.y, 3); }   // 16px 素材 ×3（§美术需求：翻牌 48px）
      line1 = (k === 'D' ? '霉运：' : '') + d.name;
      const have = k === 'I' && own ? this.itemOwnedLv(card.id) : 0;
      line2 = k === 'D' ? d.desc() : (C.RARITY_NAME[d.rarity] + (own && have > 1 ? ` · 升到 Lv${have}` : ''));
    } else {
      this.drawResIcon(k, Math.round(x + w / 2 - 24), y + 8, 48);   // ×3
      line1 = k === 'G' ? `+${card.gold} 金币` : k === 'H' ? `+${Math.round(card.pct * 100)}% 血` : k === 'X' ? `−${Math.round(card.pct * 100)}% 血` : '空盒子';
      line2 = k === 'E' ? '下次一定' : k === 'X' ? '不会因此倒下' : k === 'H' ? '回复最大血量' : '小黄布袋';
    }
    this.txt(line1, x + w / 2, y + h - 34, 15, col, 'center', { sw: 4, maxW: w - 10 });
    this.txt(line2, x + w / 2, y + h - 14, 11, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 10 });
    if (dim) { c.fillStyle = 'rgba(6,3,16,0.5)'; c.fillRect(x, y, w, h); }
  };
  G.drawFlip = function () {
    const cp = this.camp, m = cp.modal, c = this.ctx, F = FL(), P = this.p[0];
    if (m.inReview || m.machine) return WF.LootReview.draw(this,m);
    this.campDim(0.78);
    const title = m.tier === 'city' ? '战利品 · 翻牌' : '精英掉落 · 翻牌';
    this.txt(title, C.SCREEN_W / 2, 44, 36, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    const sub = m.pick == null ? (m.forced ? '运气回来了 · 免费选一份好牌' : '免费选 1 张牌，领取战斗奖励') : !allDone(m) ? '……' : '已领取战斗奖励';
    this.txt(sub, C.SCREEN_W / 2, 84, 17, m.forced ? '#7dff9a' : '#e9d7a6', 'center', { sw: 4, weight: 700 });
    // 左右两侧：血量 / 金币 / 保底提示
    this.txt(`血量 ${P.hp} / ${P.maxHp}`, 40, 140, 15, '#7dff9a', 'left', { sw: 3, weight: 700 });
    this.drawCoin(40, 158, 14); this.txt(String(cp.gold), 60, 166, 16, '#ffd24a', 'left', { sw: 3, weight: 900 });
    this.txt(`道具 ${cp.items.length} 件`, 40, 192, 14, '#bfb3d6', 'left', { sw: 3, weight: 700 });
    const diff = this.diffCamp ? this.diffCamp() : 'normal', comp = K().FLIP.COMP[diff] || '';
    const cnt = ch => comp.split('').filter(x => x === ch).length;
    const lines = [['道具', cnt('I'), C.RARITY_COLOR.rare], ['金币', cnt('G'), '#ffd24a'], ['加血', cnt('H'), '#7dff9a'], ['空盒', cnt('E'), '#8a90a8'], ['掉血', cnt('X'), '#ff6a6a'], ['霉运', cnt('D'), '#a08a68']].filter(l => l[1]);
    this.txt('这一盘有：', C.SCREEN_W - 40, 140, 14, '#bfb3d6', 'right', { sw: 3, weight: 700 });
    lines.forEach((l, i) => this.txt(`${l[0]} ×${m.forced && /掉血|霉运|空盒/.test(l[0]) ? 0 : l[1]}`, C.SCREEN_W - 40, 164 + i * 22, 14, l[2], 'right', { sw: 3, weight: 700 }));
    for (let i = 0; i < 9; i++) {
      const r = cellRect(i), card = m.board.cards[i], own = i === m.pick;
      let dt;   // 这张牌翻开了多少帧（<0 = 还是背面）
      if (m.pick == null) dt = -1;
      else if (m.skip) dt = 99;
      else dt = own ? m.pt : m.pt - (F.own + F.pause);
      const DUR = 12;
      if (dt < 0) { this.drawCardBack19(r.x, r.y, r.w, r.h, i, m.pick == null && m.sel === i); if (m.pick == null) this.campRects.push({ x: r.x, y: r.y, w: r.w, h: r.h, key: 'card', i }); continue; }
      const k = Math.min(1, dt / DUR), sx = Math.max(0.04, Math.abs(Math.cos(k * Math.PI))), face = k >= 0.5;
      if (own && face && dt < DUR + 26 && !m.skip) {   // 自己那张：稀有度色光框向外扩
        const g = (dt - DUR / 2) / (26 + DUR / 2), pad = Math.round(4 + g * 16), col = card.k === 'I' ? C.RARITY_COLOR[ITEM(card.id).rarity] : KIND[card.k].col;
        c.fillStyle = col; c.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, 4); c.fillRect(r.x - pad, r.y + r.h + pad - 4, r.w + pad * 2, 4); c.fillRect(r.x - pad, r.y - pad, 4, r.h + pad * 2); c.fillRect(r.x + r.w + pad - 4, r.y - pad, 4, r.h + pad * 2);
      }
      c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(sx, 1); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      if (face) this.drawCardFace19(card, r.x, r.y, r.w, r.h, own, !own); else this.drawCardBack19(r.x, r.y, r.w, r.h, i, false);
      c.restore();
      if (own && face) { const t = this.flipOwnTagRect(r); this.box(t.x, t.y, t.w, t.h, '#ffd23c', null); this.txt('你翻的', t.x + t.w / 2, t.y + t.h / 2 + 1, 12, '#120c1c', 'center', { stroke: false, weight: 900 }); }
    }
    if (m.pick == null || allDone(m)) WF.LootReview.drawEntry(this, m);
    else {
      const hint = WF.touch ? '点一下跳过动画' : '任意键 / 点击 跳过动画';
      this.txt(hint, C.SCREEN_W / 2, 494, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
      this.campRects.push({ x: 0, y: 0, w: C.SCREEN_W, h: C.SCREEN_H, key: 'any' });
    }
  };
})();
