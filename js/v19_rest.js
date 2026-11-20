// v1.9 休息点（§2.6）：A 回血 35% / B 花金币把一件道具升 1 级（标价、不浮动、不砍价）——二选一（用户定：v1.8 的「复习」选项取消；错题本照旧，在错题对战里练）。
// 25% 概率出现的「胭脂的杂货铺」是额外按钮，不占名额，可以先逛再选。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19, ITEM = id => C.ITEMS.find(i => i.id === id);

  G.campOpenRest = function () {
    const cp = this.camp;
    const roll = R.shopRoll(this.campRng('shop' + cp.ci), cp.cityId, cp.ci, cp.shopMiss);
    if (roll.counted) cp.shopMiss = roll.miss;
    cp.modal = { type: 'rest', sel: 0, t: 0, shop: roll.show, shopPity: !!roll.pity };
    if (roll.show) { cp.shopN++; cp.shopVisitN = 0; cp.shop = null; }
    this.state = 'rest';
    this.say(`休息点${roll.show ? '（胭脂的杂货铺开着' + (roll.pity ? '·保底' : '') + '）' : ''} 商店连续未出 ${cp.shopMiss}`);
  };
  G.restHealPct = function () { return K().REST.HEAL + (this.setBonus && this.setBonus('snack') >= 2 ? 0.10 : 0); };
  G.upgradeCands = function () {
    return this.camp.items.filter(it => { const d = ITEM(it.id); return d.kind !== 'debuff' && !d.noUpgrade && it.lv < this.itemMaxLv(it.id) && !(this.campItemOff && this.campItemOff(it.id)); });
  };
  G.restUpgradeState = function () {
    const c = this.upgradeCands(); if (!c.length) return { ok: false, why: '没有可升级的道具' };
    const min = Math.min(...c.map(it => R.upgradePrice(it.id)));
    if (this.camp.gold < min) return { ok: false, why: `金币不够（最便宜 ${min}）` };
    return { ok: true, min };
  };
  G.restOpts = function () {
    const m = this.camp.modal, up = this.restUpgradeState();
    const o = [{ key: 'heal', ok: true }, { key: 'upgrade', ok: up.ok, why: up.why }];   // 二选一；商店（有的话）是第 3 个按钮，不占名额
    if (m.shop) o.push({ key: 'shop', ok: true });
    return o;
  };
  G.campRestChoose = function (i) {
    const cp = this.camp, P = this.p[0], o = this.restOpts()[i]; if (!o) return;
    if (!o.ok) { WF.Audio.play('wrong'); cp.modal.shake = 8; return; }
    if (o.key === 'heal') { const pc = this.restHealPct(); this.campHeal(P.maxHp * pc, '休息点'); this.toast('休息一下', `回复 ${Math.round(pc * 100)}% 血量`, null, '#7dff9a'); this.campCloseModal(); }
    else if (o.key === 'upgrade') { const sel0 = Math.max(0, this.upgradeCands().findIndex(it => R.upgradePrice(it.id) <= cp.gold)); cp.modal = { type: 'upgrade', sel: sel0, t: 0, confirm: null, back: cp.modal }; this.state = 'upgrade'; }
    else if (o.key === 'shop') this.shopOpen(cp.modal);
  };
  // v1.10.2：休息点刚出现的 0.5 秒（30 帧）不收输入——上一个界面（翻牌「按任意键继续」）连按 / 双击会直接落在这里，替玩家选了「回血」，商店按钮根本来不及看
  const REST_GUARD = 30;
  G.restKey = function (code) {
    const m = this.camp.modal, n = this.restOpts().length;
    if (m.t < REST_GUARD) return;
    if (code === 'ArrowLeft' || code === 'KeyA') { m.sel = (m.sel + n - 1) % n; WF.Audio.play('menu'); }
    else if (code === 'ArrowRight' || code === 'KeyD') { m.sel = (m.sel + 1) % n; WF.Audio.play('menu'); }
    else if (/^(Digit|Numpad)[1-3]$/.test(code)) { const i = +code.slice(-1) - 1; if (i < n) this.campRestChoose(i); }
    else if (code === 'KeyS' && m.shop) this.campRestChoose(2);
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.campRestChoose(m.sel);
  };
  G.restClick = function (hit) { if (this.camp.modal.t < REST_GUARD) return; if (hit && hit.key === 'opt') { this.camp.modal.sel = hit.i; this.campRestChoose(hit.i); } };

  G.drawRest = function () {
    const m = this.camp.modal, P = this.p[0], cp = this.camp, opts = this.restOpts();
    this.campDim(0.72);
    this.txt('休息点', C.SCREEN_W / 2, 58, 42, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
    this.txt('喘口气：回血和升级只能选一项', C.SCREEN_W / 2, 100, 17, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.campHpLine(126);
    this.drawCoin(C.SCREEN_W / 2 + 196, 126, 16); this.txt(String(cp.gold), C.SCREEN_W / 2 + 218, 135, 18, '#ffd24a', 'left', { sw: 4, weight: 900 });
    const up = this.restUpgradeState(), heal = Math.min(P.maxHp - P.hp, Math.round(P.maxHp * this.restHealPct()));
    const card = [
      { t: '回血', d: `回复 ${Math.round(this.restHealPct() * 100)}% 血量（+${heal}）`, ic: '✚', col: '#7dff9a' },
      { t: '升级道具', d: up.ok ? `花金币把一件道具升 1 级（${up.min} 金币起，不打折）` : up.why, ic: '▲', col: '#ffd23c' },
    ];
    const w = 300, h = 210, gap = 40, x0 = (C.SCREEN_W - (w * 2 + gap)) / 2, y = 166, sh = m.shake > 0 ? (m.shake-- % 2 ? 4 : -4) : 0;
    card.forEach((o, i) => {
      const x = x0 + i * (w + gap) + (m.sel === i ? sh : 0), dis = !opts[i].ok;
      this.campCard(i, x, y, w, h, m.sel === i, { disabled: dis });
      this.txt(o.ic, x + w / 2, y + 58, 50, dis ? '#5d4f86' : o.col, 'center', { sw: 6 });
      this.txt(o.t, x + w / 2, y + 112, 26, dis ? '#8a90a8' : '#ffffff', 'center', { font: C.FONT_TITLE, sw: 6 });
      this.wrapTxt(o.d, x + w / 2, y + 148, w - 34, 14, dis ? '#8a90a8' : '#e9d7a6');
    });
    if (m.shop) {   // 商店按钮：不占名额
      const sel = m.sel === 2, T = WF.touch, bw = T ? 480 : 420, bx = (C.SCREEN_W - bw) / 2, by = T ? 396 : 394, bh = T ? 72 : 52;   // 触屏：72 高（≈50 CSS 像素）
      const pulse = Math.floor(m.t / 18) % 2 === 0;   // v1.10.2：商店按钮会闪（金 / 红边），一眼看到
      const rect = { x: bx, y: by, w: bw, h: bh, key: 'opt', i: 2 };
      WF.Buttons.plate(this, rect, sel || pulse ? 'focus' : 'idle', false, 'wood');
      this.campRects.push(rect);
      if (!T) this.txt('3', bx + 18, by + 18, 16, '#ffd23c', 'center', { sw: 4 });
      this.txt('胭脂的杂货铺开着！进去逛逛（不占名额）', bx + bw / 2 + (T ? 0 : 8), by + (T ? 24 : 20), 18, '#ffe0e6', 'center', { sw: 4, weight: 900, maxW: bw - 50 });
      this.txt('买道具 · 净化霉运 · 砍价', bx + bw / 2 + (T ? 0 : 8), by + (T ? 52 : 40), 13, '#ffb6c1', 'center', { sw: 3, weight: 700 });
    }
    if (!WF.touch) this.txt(`← → 选择   1 2${m.shop ? ' 3（或 S）' : ''} / Enter 确定   鼠标也可点`, C.SCREEN_W / 2, m.shop ? 470 : 420, 15, '#bfb3d6', 'center', { sw: 4, weight: 700 });
    else this.txt('点一张卡片', C.SCREEN_W / 2, m.shop ? 494 : 420, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };

  // ---------- 升级：选一件 → 确认条（显示新旧效果）----------
  G.upgradeKey = function (code) {
    const m = this.camp.modal, list = this.upgradeCands();
    if (m.confirm) { if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyY') this.upgradeDo(); else if (code === 'Escape' || code === 'KeyN') m.confirm = null; return; }
    if (code === 'Escape') { this.camp.modal = m.back; this.state = 'rest'; return; }
    const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -4, KeyW: -4, ArrowDown: 4, KeyS: 4 }[code];
    if (mv) { m.sel = Math.max(0, Math.min(list.length - 1, m.sel + mv)); WF.Audio.play('menu'); return; }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.upgradeAsk(m.sel);
  };
  G.upgradeAsk = function (i) {
    const m = this.camp.modal, it = this.upgradeCands()[i]; if (!it) return;
    m.sel = i; const price = R.upgradePrice(it.id);
    if (this.camp.gold < price) { WF.Audio.play('wrong'); m.shake = 8; this.toast('金币不够', `升级要 ${price}，你有 ${this.camp.gold}`, null, '#ff9a6a'); return; }
    m.confirm = { id: it.id, price };
  };
  G.upgradeDo = function () {
    const cp = this.camp, m = cp.modal, cf = m.confirm; if (!cf) return;
    if (!this.spendGold(cf.price, '休息点升级 ' + cf.id)) return;
    this.giveItem(cf.id, '休息点升级');
    cp.modal = null; this.state = 'minionOut'; this.campCloseModal();
  };
  G.upgradeClick = function (hit) {
    const m = this.camp.modal; if (!hit) return;
    if (hit.key === 'yes') this.upgradeDo(); else if (hit.key === 'no') m.confirm = null;
    else if (hit.key === 'back') { this.camp.modal = m.back; this.state = 'rest'; }
    else if (hit.key === 'up' && !m.confirm) this.upgradeAsk(hit.i);
    else if (hit.key === 'uppg' && !m.confirm) { const n = this.upgradeCands().length, pg = Math.max(0, Math.min(Math.ceil(n / UP_T.per) - 1, Math.floor(m.sel / UP_T.per) + hit.i)); m.sel = pg * UP_T.per; WF.Audio.play('menu'); }
  };
  G.drawUpgrade = function () {
    if (WF.touch) return this.drawUpgradeT();
    const cp = this.camp, m = cp.modal, list = this.upgradeCands();
    this.campDim(0.8);
    this.txt('升级道具', C.SCREEN_W / 2, 46, 36, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt('选一件升 1 级 · 价格 = 稀有度标价（普通 70 / 稀有 140 / 传说 280 / 双刃剑 105），不浮动、不砍价', C.SCREEN_W / 2, 84, 14, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    this.drawCoin(C.SCREEN_W - 150, 34, 16); this.txt(String(cp.gold), C.SCREEN_W - 128, 43, 20, '#ffd24a', 'left', { sw: 4, weight: 900 });
    const w = 214, h = 92, gx = 12, gy = 10, cols = 4, x0 = (C.SCREEN_W - (w * cols + gx * (cols - 1))) / 2, y0 = 104;
    list.slice(0, 12).forEach((it, i) => {
      const d = ITEM(it.id), x = x0 + (i % cols) * (w + gx), y = y0 + Math.floor(i / cols) * (h + gy), price = R.upgradePrice(it.id), poor = cp.gold < price, sel = m.sel === i;
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.16)' : 'rgba(20,14,40,0.94)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w, h, key: 'up', i });
      this.drawItemIcon(it.id, it.lv, x + 8, y + 8, 1.5);
      this.txt(d.name, x + 44, y + 16, 15, C.RARITY_COLOR[d.rarity], 'left', { sw: 3, maxW: w - 52 });
      this.txt(`Lv${it.lv} → Lv${it.lv + 1}`, x + 44, y + 36, 13, '#8fd0ff', 'left', { sw: 3, weight: 700 });
      this.wrapLines(this.itemChange(it.id, it.lv, it.lv + 1), w - 16, 11, 2).forEach((ln, k) => this.txt(ln, x + 8, y + 56 + k * 15, 11, '#ffffff', 'left', { sw: 3, weight: 700 }));
      this.drawCoin(x + w - 60, y + 9, 12); this.txt(String(price), x + w - 44, y + 16, 14, poor ? '#8a90a8' : '#ffd24a', 'left', { sw: 3, weight: 900 });
    });
    if (list.length > 12) this.txt(`还有 ${list.length - 12} 件可升级（方向键翻到下面）`, C.SCREEN_W / 2, 418, 13, '#bfb3d6', 'center', { sw: 3 });
    this.box(30, 486, 150, 36, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: 30, y: 486, w: 150, h: 36, key: 'back' });
    this.txt('返回（Esc）', 105, 504, 15, '#e9d7a6', 'center', { sw: 3 });
    this.txt('方向键选择 · Enter 升级 · 鼠标点卡片', C.SCREEN_W / 2, 504, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    if (m.confirm) this.drawConfirm19(`升级 ${ITEM(m.confirm.id).name}  Lv${this.itemOwnedLv(m.confirm.id)} → Lv${this.itemOwnedLv(m.confirm.id) + 1}，花 ${m.confirm.price} 金币？`,
      ['现在：' + this.itemDescAt(m.confirm.id, this.itemOwnedLv(m.confirm.id)), '升级后：' + this.itemDescAt(m.confirm.id, this.itemOwnedLv(m.confirm.id) + 1)]);
  };
  // 通用确认条（大字价格、防误触）：按钮 key = yes / no
  function confirmButton(g, rect, label, size) {
    const yes = rect.key === 'yes';
    if (g.state === 'shop') WF.Buttons.plate(g, rect, yes ? 'focus' : 'idle');
    else g.box(rect.x, rect.y, rect.w, rect.h, yes ? 'rgba(40,90,40,0.95)' : 'rgba(60,20,30,0.95)', yes ? '#7dff9a' : '#ff9a9a', yes ? 3 : 2);
    g.campRects.push(rect);
    g.txt(label, rect.x + rect.w / 2, rect.y + rect.h / 2, size, '#ffffff', 'center', { sw: 4 });
  }
  G.drawConfirm19 = function (title, lines = [], yesTxt = '确定（Enter）', noTxt = '取消（Esc）') {
    if (WF.touch) return this.drawConfirm19T(title, lines, yesTxt.replace(/（[^）]*）$/, ''), noTxt.replace(/（[^）]*）$/, ''));
    const w = 640, h = 112 + lines.length * 20, x = (C.SCREEN_W - w) / 2, y = (C.SCREEN_H - h) / 2;
    this.ctx.fillStyle = 'rgba(6,3,16,0.6)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.campRects = this.campRects.filter(r => r.key === 'pause');
    this.box(x, y, w, h, 'rgba(24,16,44,0.98)', '#ffd23c', 3);
    this.txt(title, C.SCREEN_W / 2, y + 26, 18, '#ffd23c', 'center', { sw: 4, maxW: w - 30 });
    lines.forEach((l, i) => this.txt(l, C.SCREEN_W / 2, y + 54 + i * 20, 13, i ? '#8fd0ff' : '#ffffff', 'center', { sw: 3, weight: 700, maxW: w - 30 }));
    const by = y + h - 50;
    confirmButton(this, { x: x + 90, y: by, w: 200, h: 40, key: 'yes' }, yesTxt, 16);
    confirmButton(this, { x: x + w - 290, y: by, w: 200, h: 40, key: 'no' }, noTxt, 16);
  };

  // ================= 触屏版（v1.9 手机）：点击区 ≥ 64 逻辑像素、字 ≥ 16 逻辑像素 =================
  const UP_T = { cols: 3, w: 290, h: 104, gx: 12, gy: 10, y0: 100, rows: 3, get per() { return this.cols * this.rows; } };
  G.drawUpgradeT = function () {
    const cp = this.camp, m = cp.modal, list = this.upgradeCands(), L = UP_T, per = L.per;
    this.campDim(0.8);
    this.txt('升级道具', C.SCREEN_W / 2, 40, 34, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt('点一件升 1 级 · 价格 = 稀有度标价，不浮动、不砍价', C.SCREEN_W / 2, 78, 16, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    this.drawCoin(C.SCREEN_W - 150, 28, 16); this.txt(String(cp.gold), C.SCREEN_W - 128, 37, 20, '#ffd24a', 'left', { sw: 4, weight: 900 });
    const x0 = (C.SCREEN_W - (L.w * L.cols + L.gx * (L.cols - 1))) / 2, page = Math.floor(Math.max(0, m.sel) / per), pages = Math.max(1, Math.ceil(list.length / per)), start = page * per;
    list.slice(start, start + per).forEach((it, j) => {
      const i = start + j, d = ITEM(it.id), x = x0 + (j % L.cols) * (L.w + L.gx), y = L.y0 + Math.floor(j / L.cols) * (L.h + L.gy), price = R.upgradePrice(it.id), poor = cp.gold < price, sel = m.sel === i;
      this.box(x, y, L.w, L.h, sel ? 'rgba(255,210,60,0.16)' : 'rgba(20,14,40,0.94)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w: L.w, h: L.h, key: 'up', i });
      this.drawItemIcon(it.id, it.lv, x + 8, y + 8, 2);
      this.txt(d.name, x + 52, y + 18, 17, C.RARITY_COLOR[d.rarity], 'left', { sw: 3, maxW: L.w - 136 });
      this.txt(`Lv${it.lv} → Lv${it.lv + 1}`, x + 52, y + 40, 16, '#8fd0ff', 'left', { sw: 3, weight: 700 });
      this.drawCoin(x + L.w - 70, y + 11, 14); this.txt(String(price), x + L.w - 52, y + 19, 18, poor ? '#8a90a8' : '#ffd24a', 'left', { sw: 3, weight: 900 });
      this.wrapLines(this.itemChange(it.id, it.lv, it.lv + 1), L.w - 16, 16, 2).forEach((ln, k) => this.txt(ln, x + 8, y + 64 + k * 19, 16, '#ffffff', 'left', { sw: 3, weight: 700 }));
    });
    const by = 448, bh = 64;
    this.box(30, by, 170, bh, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: 30, y: by, w: 170, h: bh, key: 'back' });
    this.txt('返回', 115, by + bh / 2, 18, '#e9d7a6', 'center', { sw: 3 });
    if (pages > 1) {
      const pb = (x, w, on, label, d) => { this.box(x, by, w, bh, on ? 'rgba(20,14,40,0.92)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + w / 2, by + bh / 2, 16, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3 }); if (on) this.campRects.push({ x, y: by, w, h: bh, key: 'uppg', i: d }); };
      pb(300, 130, page > 0, '◀ 上一页', -1); this.txt(`${page + 1} / ${pages}`, 480, by + bh / 2, 16, '#bfb3d6', 'center', { sw: 3 }); pb(530, 130, page < pages - 1, '下一页 ▶', 1);
    }
    if (m.confirm) this.drawConfirm19(`升级 ${ITEM(m.confirm.id).name}  Lv${this.itemOwnedLv(m.confirm.id)} → Lv${this.itemOwnedLv(m.confirm.id) + 1}，花 ${m.confirm.price} 金币？`,
      ['现在：' + this.itemDescAt(m.confirm.id, this.itemOwnedLv(m.confirm.id)), '升级后：' + this.itemDescAt(m.confirm.id, this.itemOwnedLv(m.confirm.id) + 1)]);
  };
  G.drawConfirm19T = function (title, lines, yesTxt, noTxt) {
    const w = 760, wrapped = lines.map(l => this.wrapLines(l, w - 40, 16, 2)), nl = wrapped.reduce((a, b) => a + b.length, 0);
    const h = 70 + nl * 22 + 96, x = (C.SCREEN_W - w) / 2, y = Math.round((C.SCREEN_H - h) / 2);
    this.ctx.fillStyle = 'rgba(6,3,16,0.6)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.campRects = this.campRects.filter(r => r.key === 'pause');
    this.box(x, y, w, h, 'rgba(24,16,44,0.98)', '#ffd23c', 3);
    this.wrapLines(title, w - 40, 20, 2).forEach((ln, k, a) => this.txt(ln, C.SCREEN_W / 2, y + 30 + k * 24 - (a.length - 1) * 6, 20, '#ffd23c', 'center', { sw: 4 }));
    let ly = y + 66; wrapped.forEach((ls, i) => ls.forEach(l => { this.txt(l, C.SCREEN_W / 2, ly, 16, i ? '#8fd0ff' : '#ffffff', 'center', { sw: 3, weight: 700 }); ly += 22; }));
    const by = y + h - 82, bw = 260, bh = 68;
    confirmButton(this, { x: x + 90, y: by, w: bw, h: bh, key: 'yes' }, yesTxt, 20);
    confirmButton(this, { x: x + w - 90 - bw, y: by, w: bw, h: bh, key: 'no' }, noTxt, 20);
  };
})();
