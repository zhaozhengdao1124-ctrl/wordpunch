// v1.8 收藏 → 图鉴：角色 / Boss / 道具。文案在 data/codex.js。
// 解锁判定全部来自现有存档：道具 = prog.life.items；角色 = 已解锁可选角色 / 打败过 / 全通过 / 本机见过（prog.codex.met，战斗中遇到就记）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, X = window.WF_CODEX || { chars: [], items: [] };
  const TABS = [['char', '角色'], ['boss', 'Boss'], ['item', '道具']];
  const COLS = 4, ROWS = 3, PER = COLS * ROWS;
  const ITEM = id => C.ITEMS.find(i => i.id === id);
  const CHARS = id => X.chars.find(c => c.id === id);
  const CODEX_IDS = new Set(X.chars.map(c => c.id));

  const profId = g => g.menu && g.menu.p1;
  const prog = g => { const pid = profId(g), P = pid && WF.Prog && WF.Prog.of(pid); if (!P) return null; P.codex = P.codex || { met: {} }; P.codex.met = P.codex.met || {}; return P; };
  const list = tab => tab === 'item' ? X.items : X.chars.filter(c => c.group === tab);

  // ---- 解锁判定 ----
  G.codexHas = function (tab, e) {
    const P = prog(this), pid = profId(this), U = WF.Unlocks;
    if (tab === 'item') {
      if (this.camp && this.camp.items.some(i => i.id === e.id)) return true;
      return !!(P && P.life && P.life.items && P.life.items[e.id]);
    }
    if (U && U.debugAll && C.ROSTER.includes(e.id)) return true;
    if (C.ROSTER.includes(e.id) && U && pid && U.owned(pid, e.id)) return true;
    if (!P) return false;
    if (P.codex.met[e.id]) return true;
    const ext = pid && WF.Profiles.ext(pid);
    if (ext && ext.camp && ext.camp.beat && ext.camp.beat[e.id]) return true;
    const L = P.life || {};
    if ((L.charClear && L.charClear[e.id]) || (L.ultBy && L.ultBy[e.id])) return true;
    return false;
  };
  G.codexCount = function (tab) { const l = list(tab); return [l.filter(e => this.codexHas(tab, e)).length, l.length]; };
  // 战斗中遇到的角色记进图鉴
  G.codexMark = function () {
    if (!this.p || this.state === 'title') return;
    const P = prog(this); if (!P) return; let n = 0;
    for (const f of this.p) if (f && f.id && CODEX_IDS.has(f.id) && !P.codex.met[f.id]) { P.codex.met[f.id] = Date.now(); n++; }
    if (n) WF.Profiles.save();
  };
  const baseUpd = G.update;
  G.update = function () { const r = baseUpd.apply(this, arguments); if (this.t % 20 === 0) { try { this.codexMark(); } catch (e) {} } return r; };

  // ---- 入口 ----
  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice(), i = b.findIndex(x => x.key === 'daily');
    b.splice((i < 0 ? b.length - 1 : i) + 1, 0, { key: 'codex', label: '收藏', group: 'meta' });
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, d) { if (key === 'codex') { this.goCodex(); return; } return baseAct.call(this, key, d); };
  G.goCodex = function () { this.state = 'title'; this.ui.screen = 'codex'; this.ui.cdxTab = this.ui.cdxTab || 0; this.ui.cdxSel = 0; this.ui.cdxPage = 0; WF.Audio.play('menu'); };
  G.codexBack = function () { this.ui.screen = 'title'; this.menu.row = Math.max(0, this.homeButtons().findIndex(b => b.key === 'codex')); WF.Audio.play('menu'); };
  const cur = g => list(TABS[g.ui.cdxTab || 0][0]);
  G.codexPages = function () { return Math.max(1, Math.ceil(cur(this).length / PER)); };
  G.codexSelect = function (i) { const n = cur(this).length; i = Math.max(0, Math.min(n - 1, i)); if (i !== this.ui.cdxSel) { this.ui.cdxSel = i; WF.Audio.play('menu'); } this.ui.cdxPage = Math.floor(i / PER); };
  G.codexTab = function (d) { this.ui.cdxTab = ((this.ui.cdxTab || 0) + d + TABS.length) % TABS.length; this.ui.cdxSel = 0; this.ui.cdxPage = 0; WF.Audio.play('menu'); };
  G.codexTurn = function (d) {
    const n = this.codexPages(), p = Math.max(0, Math.min(n - 1, (this.ui.cdxPage || 0) + d));
    if (p !== this.ui.cdxPage) { this.ui.cdxPage = p; this.ui.cdxSel = Math.min(cur(this).length - 1, p * PER); WF.Audio.play('menu'); }
  };
  G.codexKey = function (code) {
    const s = this.ui.cdxSel || 0;
    if (code === 'Escape' || code === 'Backspace') this.codexBack();
    else if (code === 'ArrowRight' || code === 'KeyD') this.codexSelect(s + 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') this.codexSelect(s - 1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.codexSelect(s + COLS);
    else if (code === 'ArrowUp' || code === 'KeyW') this.codexSelect(s - COLS);
    else if (code === 'PageDown') this.codexTurn(1);
    else if (code === 'PageUp') this.codexTurn(-1);
    else if (code === 'Tab' || code === 'KeyE') this.codexTab(1);
    else if (code === 'KeyQ') this.codexTab(-1);
  };
  G.codexClick = function (hit) {
    if (hit.key === 'back') this.codexBack();
    else if (hit.key === 'prev') this.codexTurn(-1);
    else if (hit.key === 'next') this.codexTurn(1);
    else if (hit.key === 'ctab') { this.ui.cdxTab = hit.i; this.ui.cdxSel = 0; this.ui.cdxPage = 0; WF.Audio.play('menu'); }
    else if (hit.key === 'centry') this.codexSelect(hit.i);
  };

  // ---- 绘制 ----
  const sil = {};   // 道具剪影缓存
  function silhouette(id) {
    if (sil[id]) return sil[id];
    const icons = (window.WF_CAMPAIGN_DATA || {}).icons || [], im = icons.includes(id) ? WF.campImg('items/' + id + '.png') : null;
    if (!im || !im.complete || !im.naturalWidth) return null;
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const x = cv.getContext('2d');
    x.drawImage(im, 0, 0, 16, 16); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0d0a1a'; x.fillRect(0, 0, 16, 16);
    return (sil[id] = cv);
  }
  G.codexIcon = function (id, x, y, s, has) {
    const c = this.ctx, d = ITEM(id), col = has ? C.RARITY_COLOR[d.rarity] : '#4a4366';
    this.box(x, y, s, s, has ? 'rgba(14,10,28,0.92)' : '#1c1730', col, 3);
    c.imageSmoothingEnabled = false;
    const icons = (window.WF_CAMPAIGN_DATA || {}).icons || [], pad = 6, im = icons.includes(id) ? WF.campImg('items/' + id + '.png') : null;
    const k = Math.floor((s - pad * 2) / 16) * 16, ox = x + (s - k) / 2, oy = y + (s - k) / 2;
    if (has && im) c.drawImage(im, ox, oy, k, k);
    else if (!has && silhouette(id)) { c.drawImage(silhouette(id), ox, oy, k, k); this.txt('?', x + s / 2, y + s / 2 + 2, Math.round(s * 0.34), '#7a7298', 'center', { sw: 4 }); }
    else this.txt(has ? d.name[0] : '?', x + s / 2, y + s / 2, Math.round(s * 0.4), '#ffffff', 'center', { sw: 4 });
  };
  // 按宽度折行（中文逐字）
  G.codexWrap = function (s, size, maxW, weight) {
    const c = this.ctx; c.font = `${weight || 700} ${size}px ${C.FONT}`;
    const out = []; let line = '';
    for (const ch of s) { if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    if (line) out.push(line); return out;
  };
  G.drawCodex = function () {
    const c = this.ctx, W = C.SCREEN_W, ti = this.ui.cdxTab = Math.max(0, Math.min(TABS.length - 1, this.ui.cdxTab || 0)), tab = TABS[ti][0], L = list(tab);
    const sel = this.ui.cdxSel = Math.max(0, Math.min(L.length - 1, this.ui.cdxSel || 0)), pages = this.codexPages(), page = this.ui.cdxPage = Math.max(0, Math.min(pages - 1, Math.floor(sel / PER)));
    c.fillStyle = 'rgba(6,3,16,0.86)'; c.fillRect(0, 0, W, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 14, 96, 30, 'rgba(20,14,40,0.82)', '#5d4f86', 2); this.txt('返回', 88, 29, 15, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 14, w: 96, h: 30, key: 'back', i: -1 });
    this.txt('收藏 · 图鉴', W / 2, 30, 34, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    const tot = TABS.reduce((a, t) => { const n = this.codexCount(t[0]); return [a[0] + n[0], a[1] + n[1]]; }, [0, 0]);
    this.txt(`已收集 ${tot[0]}/${tot[1]}`, W - 40, 30, 18, tot[0] ? '#ffd23c' : '#bfb3d6', 'right', { sw: 4, weight: 700 });
    // 页签
    const tw = 150, tg = 8;
    TABS.forEach(([k, nm], i) => {
      const n = this.codexCount(k), on = i === ti, x = 40 + i * (tw + tg), y = 56;
      this.box(x, y, tw, 34, on ? 'rgba(255,210,60,0.22)' : 'rgba(20,14,40,0.88)', on ? '#ffd23c' : '#5d4f86', on ? 3 : 2);
      this.txt(`${nm}  ${n[0]}/${n[1]}`, x + tw / 2, y + 18, 16, on ? '#ffd23c' : '#ffffff', 'center', { sw: 4, weight: 700 });
      this.menuRects.push({ x, y, w: tw, h: 34, key: 'ctab', i });
    });
    // 左：卡片网格
    const cw = 118, ch = 104, gx = 8, gy = 8, x0 = 40, y0 = 102;
    L.slice(page * PER, page * PER + PER).forEach((e, k) => {
      const idx = page * PER + k, has = this.codexHas(tab, e), on = idx === sel, x = x0 + (k % COLS) * (cw + gx), y = y0 + Math.floor(k / COLS) * (ch + gy);
      const d = tab === 'item' ? ITEM(e.id) : null, mv = tab !== 'item' ? C.MOVES[e.id] : null, col = has ? (d ? C.RARITY_COLOR[d.rarity] : mv.color) : '#4a4366';
      this.box(x, y, cw, ch, on ? 'rgba(255,210,60,0.16)' : 'rgba(20,14,40,0.86)', on ? '#ffd23c' : '#3c3852', on ? 4 : 2);
      if (d) this.codexIcon(e.id, x + (cw - 62) / 2, y + 8, 62, has);
      else this.drawCharBust(e.id, true, x + (cw - 62) / 2, y + 8, 62, has ? {} : { sil: true, border: '#4a4366' });
      if (!has && !d) this.txt('?', x + cw / 2, y + 40, 28, '#7a7298', 'center', { sw: 5 });
      this.txt(has ? (d ? d.name : mv.name) : '???', x + cw / 2, y + 88, 16, has ? col : '#7d7894', 'center', { sw: 4, weight: 700, maxW: cw - 10 });
      this.menuRects.push({ x, y, w: cw, h: ch, key: 'centry', i: idx });
    });
    // 右：详情
    const px = 556, py = 102, pw = 364, ph = ch * ROWS + gy * 2, e = L[sel];
    this.box(px, py, pw, ph, 'rgba(20,14,40,0.9)', '#5d4f86', 3);
    if (e) {
      const has = this.codexHas(tab, e), d = tab === 'item' ? ITEM(e.id) : null, mv = d ? null : C.MOVES[e.id];
      const col = has ? (d ? C.RARITY_COLOR[d.rarity] : mv.color) : '#7d7894';
      if (d) this.codexIcon(e.id, px + 18, py + 18, 96, has); else { this.drawCharBust(e.id, true, px + 18, py + 18, 96, has ? {} : { sil: true, border: '#4a4366' }); if (!has) this.txt('?', px + 66, py + 62, 44, '#7a7298', 'center', { sw: 6 }); }
      this.txt(has ? (d ? d.name : mv.name) : '???', px + 130, py + 44, 28, col, 'left', { font: C.FONT_TITLE, sw: 6, maxW: pw - 144 });
      const sub = has ? (d ? C.RARITY_NAME[d.rarity] + '道具' : e.tag) : (d ? '还没拿到过' : '还没遇到过');
      this.txt(sub, px + 130, py + 80, 15, has ? '#e9d7a6' : '#9b93b8', 'left', { sw: 4, weight: 700, maxW: pw - 144 });
      if (has && !d && mv.ultName) this.txt('必杀 · ' + mv.ultName, px + 130, py + 102, 14, '#ffffff', 'left', { sw: 4, weight: 700, maxW: pw - 144 });
      const body = has ? (d ? e.flavor : e.bio) : (d ? '闯关里翻到它，就会被记在这里。' : tab === 'boss' ? '在闯关路上遇到他，或者打败他，就会被记在这里。' : '解锁或在闯关里遇到她 / 他，就会被记在这里。');
      const lines = this.codexWrap(body, 16, pw - 40, 700);
      lines.slice(0, 9).forEach((ln, k) => this.txt(ln, px + 20, py + 140 + k * 24, 16, has ? '#ffffff' : '#8f86b8', 'left', { sw: 3, weight: 700 }));
    }
    // 翻页
    const fy = 456, btn = (key, label, x, on) => { this.box(x, fy - 16, 118, 32, on ? 'rgba(20,14,40,0.88)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + 59, fy, 15, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3, weight: 700 }); if (on) this.menuRects.push({ x, y: fy - 16, w: 118, h: 32, key, i: -1 }); };
    btn('prev', '◀ 上一页', 40, page > 0); btn('next', '下一页 ▶', 40 + 118 + 8 + 150, page < pages - 1);
    this.txt(`第 ${page + 1} / ${pages} 页`, 40 + 118 + 4 + 75, fy, 15, '#ffffff', 'center', { sw: 4, weight: 700 });
    this.txt(WF.touch ? '轻点卡片查看    轻点页签换分类    轻点按钮翻页' : '←→↑↓ 选择    Q / E 换页签    PageUp / PageDown 翻页    Esc 返回    鼠标也可点', W / 2, 510, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };
})();
