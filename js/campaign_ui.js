// v1.2 闯关画面：世界地图飞行、进场镜头的黑边 / 名字卡 / 探照灯、道具栏、拾取提示、休息点、三选一、结算
(function () {
  const G = WF.Game.prototype;
  const K = () => WF.CFG.CAMPAIGN;
  const ITEM = id => WF.CFG.ITEMS.find(i => i.id === id);
  const IMG = {};
  WF.campImg = function (path) {
    let im = IMG[path];
    if (!im) { im = new Image(); im.src = 'assets/campaign/' + path; IMG[path] = im; }
    return im.complete && im.naturalWidth ? im : null;
  };
  // v1.7.2：开机先预载地图底图和图钉，第一站地图不再黑几帧
  setTimeout(() => { const M = (window.WF_CAMPAIGN_DATA || {}).map; if (!M) return; WF.campImg('map/world.png'); WF.campImg('map/trail.png'); for (const k in M.sprites) WF.campImg('map/' + M.sprites[k].file); }, 0);
  const ease = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

  // ---------- 世界地图 ----------
  G.drawMap = function () {
    const C = WF.CFG, KC = K(), M = (window.WF_CAMPAIGN_DATA || {}).map, ctx = this.ctx, a = this.mapAnim || { t: 9999 };
    ctx.fillStyle = '#0b1830'; ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    if (!M) return;
    if (!this.mapCv) { this.mapCv = document.createElement('canvas'); this.mapCv.width = M.size[0]; this.mapCv.height = M.size[1]; }
    const m = this.mapCv.getContext('2d'); m.imageSmoothingEnabled = false;
    m.clearRect(0, 0, M.size[0], M.size[1]);
    const world = WF.campImg('map/world.png'); if (world) m.drawImage(world, 0, 0);
    const SP = M.sprites, cities = M.cities, dest = cities[this.camp.cityId];
    const spr = (key, x, y, frame = 0, flip = false) => {
      const d = SP[key], im = WF.campImg('map/' + d.file); if (!im) return;
      const [fw, fh] = d.frame_size, [ax, ay] = d.anchor;
      if (!flip) m.drawImage(im, frame * fw, 0, fw, fh, Math.round(x - ax), Math.round(y - ay), fw, fh);
      else { m.save(); m.translate(Math.round(x) + 1, 0); m.scale(-1, 1); m.drawImage(im, frame * fw, 0, fw, fh, -ax, Math.round(y - ay), fw, fh); m.restore(); }
    };
    // 航线：从西南方飞来，二次贝塞尔弧线
    // v1.3：从上一城起飞（第一站从西南方飞来）；跨太平洋的长航线不推近
    const T = a.ticks || KC.MAP.ticks, t0 = 14, k = Math.max(0, Math.min(1, (a.t - t0) / (T - t0)));
    const src = cities[a.from], P0 = src ? [src[0], src[1] - 4] : [dest[0] - 62, dest[1] + 30], P2 = [dest[0], dest[1] - 4];
    const P1 = [(P0[0] + P2[0]) / 2 - (src ? 0 : 6), Math.min(P0[1], P2[1]) - (a.long ? 46 : src ? 14 : 40)];
    const bez = u => [(1 - u) * (1 - u) * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) * (1 - u) * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
    const fk = ease(k * 1.0) * 0.55 + k * 0.45;
    // 拖尾虚线
    const tr = WF.campImg('map/trail.png');
    if (tr && a.t > t0) { let lastP = bez(0), acc = 0; for (let u = 0; u <= fk; u += 0.004) { const p = bez(u); acc += Math.hypot(p[0] - lastP[0], p[1] - lastP[1]); lastP = p; if (acc >= 5) { acc = 0; m.drawImage(tr, Math.round(p[0] - 1), Math.round(p[1] - 1)); } } }
    // 图钉（v1.7.2 地标图钉：SP['pin_'+城市]，6 帧 = 0–3 当前城动画 / 4 未到 / 5 已通关金像；埃及路线 id pyramid → pin_cairo。缺图时退回旧图钉）
    const route = this.campRoute(), PA = M.pin_alias || {};
    for (const id of route) {
      const c = cities[id]; if (!c) continue;
      const lk = 'pin_' + (PA[id] || id), cur = id === this.camp.cityId, done = this.camp.cleared.includes(id);
      const pd = SP[lk]; if (pd) { const cf = pd.current || [0, 1, 2, 3]; spr(lk, c[0], c[1], cur ? cf[Math.floor(this.t / (pd.suggested_ticks_per_frame_at_30fps || 5)) % cf.length] : done ? (pd.cleared != null ? pd.cleared : 5) : (pd.locked != null ? pd.locked : 4)); continue; }
      if (cur) spr('pin_current', c[0], c[1], Math.floor(this.t / 5) % 4);
      else if (done) spr('pin_cleared', c[0], c[1]);
      else if ((M.city_pins || {})[id] || id === route[route.length - 1]) {   // v1.7：最终站（华盛顿·金霸霸）银色 final_pin，其它 Boss 城金色 boss_pin——按路线算，不依赖素材里写死的城市
        const pin = id === route[route.length - 1] ? 'final_pin' : 'boss_pin';
        if (SP[pin]) spr(pin, c[0], c[1], Math.floor(this.t / 5) % 4); else spr('pin_locked', c[0], c[1]);
      }
      else spr('pin_locked', c[0], c[1]);
    }
    // 飞机
    if (a.t > t0 - 4 && fk < 0.995) {
      const p = bez(fk), q = bez(Math.min(1, fk + 0.02)), dx = q[0] - p[0], dy = q[1] - p[1];
      const key = dy < -0.25 * Math.abs(dx) - 0.05 ? 'plane_up' : dy > 0.25 * Math.abs(dx) + 0.05 ? 'plane_down' : 'plane';
      m.globalAlpha = fk > 0.86 ? Math.max(0, (0.995 - fk) / 0.135) : 1;   // v1.7.2：快落地时飞机淡出，不盖住目的地图钉
      spr(key, p[0], p[1], 0, dx < 0); m.globalAlpha = 1;
    }
    // 镜头：先看全图，再推近到亚洲（三个亚洲图钉只差 10 像素）
    const zk = ease((a.t - t0) / (T - t0)), z = a.long ? 1 + 0.25 * zk : src ? KC.MAP.zoom : 1 + (KC.MAP.zoom - 1) * zk;
    const mid = src ? [(src[0] + dest[0]) / 2 + 6, (src[1] + dest[1]) / 2] : [160, 90], aim = a.long ? mid : [dest[0] + 6, dest[1]];
    const st = src && !a.long ? [src[0] + 6, src[1]] : mid;
    const fx = st[0] + (aim[0] - st[0]) * zk, fy = st[1] + (aim[1] - st[1]) * zk;
    const S = 3 * z; let dx0 = C.SCREEN_W / 2 - fx * S, dy0 = C.SCREEN_H / 2 - fy * S;
    dx0 = Math.min(0, Math.max(C.SCREEN_W - M.size[0] * S, dx0)); dy0 = Math.min(0, Math.max(C.SCREEN_H - M.size[1] * S, dy0));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapCv, Math.round(dx0), Math.round(dy0), Math.round(M.size[0] * S), Math.round(M.size[1] * S));
    const toScr = c => [dx0 + c[0] * S, dy0 + c[1] * S];
    // 城市名（程序画）
    for (const id of route) {
      const c = cities[id]; if (!c) continue; const lo = (M.label_offset || {})[id]; let [x, y] = toScr(lo ? [c[0] + lo[0], c[1] + lo[1]] : c); const px = toScr(c)[0], cur = id === this.camp.cityId; if (px >= 0 && px <= C.SCREEN_W) x = Math.max(58, Math.min(C.SCREEN_W - 58, x));   // 图钉在屏内时名字不出屏   // v1.7.2：label_offset 让开相邻图钉（少林寺名字压在佛山图钉上）
      const bossPin = !!(M.city_pins || {})[id] || id === route[route.length - 1], bossName = bossPin ? WF.CFG.MOVES[KC.CITIES[id].opponent].name : '';
      if (!cur && z > 1.6 && !bossPin) this.txt(KC.CITY_NAMES[id], x + 2, y + 12 * z / 2.6 + 10, 14, '#9aa4b8', 'center', { sw: 4, weight: 700 });
      if (bossPin && !cur && z < 1.4) this.txt(`${KC.CITY_NAMES[id]} · ${bossName}`, x, y + 22, 14, (this.camp.route ? (this.camp.route[this.camp.route.length - 1] === id) : KC.CITIES[id].final) ? '#dfe4ee' : '#ffd23c', 'center', { sw: 4, weight: 700 });
    }
    const [bx, by] = toScr(dest);
    if (a.t >= T - 6) { const k2 = Math.min(1, (a.t - T + 6) / 8); this.txt(KC.CITY_NAMES[this.camp.cityId], bx + ((M.land_offset || {})[this.camp.cityId] || [0])[0] * S, by - 11 * S - 14 - 16 * k2, Math.round(22 + 20 * k2), '#ffffff', 'center', { font: WF.CFG.FONT_TITLE, sw: 7, stroke: '#7a1414' }); }
    // 信息条
    const g = ctx.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(6,10,24,0.85)'); g.addColorStop(1, 'rgba(6,10,24,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, C.SCREEN_W, 90);
    this.txt(`世界巡回 · 第 ${this.camp.ci + 1} 站`, 30, 32, 26, '#ffd23c', 'left', { font: WF.CFG.FONT_TITLE, sw: 6 });
    const prof = WF.Profiles.get(this.menu.p1), wn = prof ? WF.Profiles.wrongList(prof.id, 'all').length : 0;
    this.txt(`词库 ${this.bank ? this.bank.name : '—'} · 生词本 ${wn} 词 · 已拿道具 ${this.camp.items.length ? this.camp.items.length + ' 件' : '无'}`, 30, 62, 16, '#e9d7a6', 'left', { sw: 4, weight: 700 });
    this.txt((this.camp.random ? '随机路线 · ' : '') + route.map(id => KC.CITY_NAMES[id]).join(' → '), C.SCREEN_W - 30, 32, 16, '#bfb3d6', 'right', { sw: 4, weight: 700 });
    if ((this.t >> 4) % 2 === 0) this.txt('任意键 / 点击 跳过', C.SCREEN_W / 2, 518, 15, '#e9d7a6', 'center', { sw: 4, weight: 700 });
  };

  // ---------- 道具图标 ----------
  G.drawItemIcon = function (id, lv, x, y, sc = 2, o = {}) {
    const d = ITEM(id), c = this.ctx, col = WF.CFG.RARITY_COLOR[d.rarity], s = 16 * sc, pad = Math.max(2, sc);
    const W = s + pad * 2;
    this.box(x, y, W, W, o.bg || 'rgba(14,10,28,0.88)', col, Math.max(2, Math.round(sc * 0.9)));
    const icons = (window.WF_CAMPAIGN_DATA || {}).icons || [];
    const im = icons.includes(id) ? WF.campImg('items/' + id + '.png') : null;
    c.imageSmoothingEnabled = false;
    if (im) c.drawImage(im, x + pad, y + pad, s, s);
    else {   // 还没画图标的道具：色块 + 名字首字
      c.fillStyle = { common: '#5a5670', rare: '#24508a', legend: '#8a6a1a', curse: '#5a2f8a' }[d.rarity];
      c.fillRect(x + pad + sc, y + pad + sc, s - sc * 2, s - sc * 2);
      this.txt(d.name[0], x + W / 2, y + W / 2 + 1, Math.round(s * 0.62), '#ffffff', 'center', { sw: Math.max(2, sc), weight: 900 });
    }
    if (!d.noUpgrade && lv) for (let i = 0; i < lv; i++) {
      const r = Math.max(2, Math.round(sc * 1.2)), dx = x + W - pad - 2 - i * (r * 2 + 1) - r * 2, dy = y + W - pad - r * 2 - 1;
      c.fillStyle = '#120c1c'; c.fillRect(dx - 1, dy - 1, r * 2 + 2, r * 2 + 2); c.fillStyle = col; c.fillRect(dx, dy, r * 2, r * 2);
    }
    return W;
  };

  // ---------- 叠加层 ----------
  G.drawCampOverlay = function (li) {
    const C = WF.CFG, c = this.ctx, cp = this.camp, st = this.state;
    this.campRects = [];
    if (this.cine) this.drawCine();
    if (!this.cine && !this.campModal() && st !== 'result' && st !== 'map') this.drawItemStrip();
    if (st === 'ko' && this.ko && this.ko.winner && this.ko.winner.side === 1) {
      const mv = this.ko.winner.mv;
      if (mv.catchphrase && this.koText > 30) this.txt(mv.catchphrase, C.SCREEN_W / 2, 380, 54, mv.catchColor || '#ffd23c', 'center', { font: '"Noto Serif","Georgia",serif', sw: 10, stroke: '#3a0d0d' });
    }
    if (st === 'rest') this.drawRest();
    if (st === 'swap') this.drawSwap();
    if (st === 'review') this.drawReview();
    if (st === 'pick') this.drawPick();
    if (st === 'cleared') this.drawCleared();
    if (!this.cine) this.drawToasts();
  };
  G.drawItemStrip = function () {
    const cp = this.camp, N = K().SLOTS, x0 = K().STRIP_X0 || 84, y = 74, DX = K().STRIP_DX || 38;   // v1.7：10 格收紧到 36px 间距，不压中间的计时圈
    for (let i = 0; i < N; i++) {
      const it = cp.items[i], x = x0 + i * DX;
      if (it && this.campItemOff && this.campItemOff(it.id)) { if (this.drawSawSlot) this.drawSawSlot(it, x, y, i); }
      else if (it) {
        this.drawItemIcon(it.id, it.lv, x, y, 2); if (it.id === 'glasses' && it.lv >= 2) this.txt(String(cp.hintsLeft), x + 31, y + 6, 12, '#8fd0ff', 'center', { sw: 3 });
        if (cp.iconFlash && cp.iconFlash.id === it.id) this.goldFlash(x, y, 36, cp.iconFlash.t);
      }
      else { this.ctx.strokeStyle = 'rgba(233,215,166,0.22)'; this.ctx.lineWidth = 1; this.ctx.strokeRect(x + 0.5, y + 0.5, 35, 35); }
    }
    if (this.drawSawStrip) this.drawSawStrip(x0, y, N);
    // v1.3 暂停按钮（也可按 Esc / P）
    const PS = WF.touch ? 48 : 36, bx = WF.CFG.SCREEN_W - 84 - PS, c = this.ctx;   // 右侧，敌人名字下方（中间是关卡信息行）
    const pk = PS / 36;
    this.box(bx, y, PS, PS, 'rgba(14,10,28,0.8)', '#e9d7a6', 2);
    c.fillStyle = '#e9d7a6'; c.fillRect(bx + 12 * pk, y + 10 * pk, 4 * pk, 16 * pk); c.fillRect(bx + 20 * pk, y + 10 * pk, 4 * pk, 16 * pk);
    this.campRects.push({ x: bx, y, w: PS, h: PS, key: 'pause' });
  };
  // 升级时图标闪金光：白金色覆盖 + 外圈，2 秒内闪 3 下后淡出
  G.goldFlash = function (x, y, w, t) {
    const c = this.ctx, a = Math.max(0, Math.sin(t / 60 * Math.PI * 6) * 0.6) * (1 - t / 70);
    c.globalAlpha = a; c.fillStyle = '#ffe680'; c.fillRect(x + 2, y + 2, w - 4, w - 4);
    c.globalAlpha = Math.min(1, 1.2 - t / 60); c.strokeStyle = '#ffd23c'; c.lineWidth = 3; c.strokeRect(x - 2.5, y - 2.5, w + 5, w + 5);
    c.globalAlpha = 1;
  };
  // v1.3 暂停面板：每件道具 = 图标 + 名字 + 等级 + 这一级的效果 + 下一级会变成什么
  G.drawPauseItems = function () {
    const C = WF.CFG, cp = this.camp;
    this.campRects = [];
    this.txt('暂停', C.SCREEN_W / 2, 52, 50, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
    const P = this.p[0];
    this.txt(`${K().CITY_NAMES[cp.cityId]} · 第 ${cp.ci + 1} 站 · ${cp.wave > this.campWaves() ? '城市对手' : '小怪 ' + cp.wave + '/' + this.campWaves()} · 血量 ${P.hp}/${P.maxHp}`, C.SCREEN_W / 2, 92, 17, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    const w = 440, h = 82, x0 = 30, y0 = 110;
    if (!cp.items.length) this.txt('还没有道具 —— 打倒小怪、精英和城市对手都会掉', C.SCREEN_W / 2, 240, 18, '#bfb3d6', 'center', { sw: 4 });
    cp.items.forEach((it, i) => {
      const d = ITEM(it.id), x = x0 + (i % 2) * (w + 20), y = y0 + Math.floor(i / 2) * (h + 8), col = C.RARITY_COLOR[d.rarity], max = this.itemMaxLv(it.id);
      this.box(x, y, w, h, 'rgba(20,14,40,0.94)', col, 2);
      this.drawItemIcon(it.id, it.lv, x + 10, y + 21, 2);
      this.txt(d.name, x + 60, y + 18, 17, col, 'left', { sw: 4, maxW: 220 });
      this.txt(d.noUpgrade ? '一次性' : `Lv${it.lv} / ${max}`, x + w - 12, y + 18, 15, '#ffd23c', 'right', { sw: 3 });
      this.txt('现在：' + this.itemDescAt(it.id, it.lv), x + 60, y + 44, 14, '#ffffff', 'left', { sw: 3, weight: 700, maxW: w - 72 });
      const nx = it.lv < max ? '下一级：' + this.itemChange(it.id, it.lv, it.lv + 1) : '已满级';
      this.txt(nx, x + 60, y + 66, 13, it.lv < max ? '#8fd0ff' : '#7dff9a', 'left', { sw: 3, weight: 700, maxW: w - 72 });
    });
    const by = 486;
    this.box(C.SCREEN_W / 2 - 230, by, 200, 38, 'rgba(20,14,40,0.92)', '#ffd23c', 2); this.campRects.push({ x: C.SCREEN_W / 2 - 230, y: by, w: 200, h: 38, key: 'pause' });
    this.txt('继续（Esc / P）', C.SCREEN_W / 2 - 130, by + 19, 16, '#ffd23c', 'center', { sw: 4 });
    this.box(C.SCREEN_W / 2 + 30, by, 200, 38, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: C.SCREEN_W / 2 + 30, y: by, w: 200, h: 38, key: 'quit' });
    this.txt('返回标题（Q）', C.SCREEN_W / 2 + 130, by + 19, 16, '#e9d7a6', 'center', { sw: 4 });
  };
  G.drawToasts = function () {
    const C = WF.CFG, cp = this.camp, L = K().TOAST_TICKS, modal = this.campModal() || this.state === 'result';
    cp.toasts.slice(0, 2).forEach((t, i) => {
      const k = t.t < 5 ? t.t / 5 : t.t > L - 8 ? (L - t.t) / 8 : 1;
      // 战斗中放在左上道具栏下面（不挡人物和题目）；模态画面里放在左下角
      const w = 360, h = 42, x = 14 - (1 - Math.min(1, t.t / 5)) * 30, y = modal ? C.SCREEN_H - 56 - i * 48 : (cp.itemOff ? 138 : 118) + i * 48;   // v1.7：道具被锯掉时，下面有“被锯掉 N 件”一行，提示再往下让
      this.ctx.globalAlpha = Math.max(0, k);
      const col = t.icon ? WF.CFG.RARITY_COLOR[ITEM(t.icon).rarity] : (t.color || '#e9d7a6');
      this.box(x, y, w, h, 'rgba(12,8,26,0.86)', t.lvup ? '#ffd23c' : col, 2);
      let tx = x + 12;
      if (t.icon) { this.drawItemIcon(t.icon, this.lvOf(t.icon), x + 5, y + 5, 1.75); if (t.lvup) this.goldFlash(x + 5, y + 5, 32, t.t); tx = x + 46; }
      this.txt(t.text, tx, y + 14, 15, col, 'left', { sw: 4, maxW: w - (tx - x) - 8 });
      if (t.sub) this.txt(t.sub, tx, y + 31, 12, '#ffffff', 'left', { sw: 3, weight: 700, maxW: w - (tx - x) - 8 });
      this.ctx.globalAlpha = 1;
    });
  };

  // ---------- 进场镜头 ----------
  G.drawCine = function () {
    const C = WF.CFG, c = this.ctx, ci = this.cine, ph = this.cinePhase(), cfg = ci.cfg, mv = ci.mv;
    // 探照灯（boss 变体）
    if (cfg.searchlight && (ph.k === 'search' || ph.k === 'walk')) {
      const tt = ci.t;
      for (let i = 0; i < 2; i++) {
        const ang = Math.sin(tt * 0.07 + i * 2.2) * 0.55 + (i ? 0.25 : -0.25), ox = i ? C.SCREEN_W * 0.82 : C.SCREEN_W * 0.18;
        c.save(); c.translate(ox, C.SCREEN_H + 20); c.rotate(ang);
        const g = c.createLinearGradient(0, 0, 0, -C.SCREEN_H * 1.3); g.addColorStop(0, 'rgba(255,240,190,0.38)'); g.addColorStop(1, 'rgba(255,240,190,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(-18, 0); c.lineTo(18, 0); c.lineTo(150, -C.SCREEN_H * 1.3); c.lineTo(-150, -C.SCREEN_H * 1.3); c.closePath(); c.fill(); c.restore();
      }
    }
    // 黑边
    const bh = Math.round(72 * (this.bars || 0));
    if (bh > 0) { c.fillStyle = '#000'; c.fillRect(0, 0, C.SCREEN_W, bh); c.fillRect(0, C.SCREEN_H - bh, C.SCREEN_W, bh); }
    // 名字定格
    if (ph.k === 'card' || ((ph.k === 'back' || ph.k === 'carOut') && this.bars > 0.05)) {
      const k = ph.k === 'card' ? Math.min(1, (ci.t - ph.a) / 5) : this.bars;
      const gold = cfg.gold, main = gold ? '#ffd23c' : '#ffffff', stroke = gold ? '#5a3a00' : '#3a0d0d';
      const size = Math.round(70 * (ph.k === 'card' && ci.t - ph.a < 5 ? 1.6 - 0.12 * (ci.t - ph.a) : 1));
      c.globalAlpha = k;
      const cityName = mv.city || K().CITY_NAMES[this.camp.cityId];
      const y = C.SCREEN_H - 112;
      c.fillStyle = gold ? 'rgba(80,50,0,0.55)' : 'rgba(0,0,0,0.55)'; c.fillRect(0, y - 46, C.SCREEN_W, 92);
      c.fillStyle = gold ? '#ffd23c' : (mv.color || '#e9d7a6'); c.fillRect(0, y - 46, C.SCREEN_W * k, 3); c.fillRect(C.SCREEN_W * (1 - k), y + 43, C.SCREEN_W * k, 3);
      this.txt(`${cityName} · ${mv.name}`, C.SCREEN_W / 2, y, size, main, 'center', { font: C.FONT_TITLE, sw: 11, stroke });
      const sub = mv.title || (mv.ultName ? '绝招 · ' + mv.ultName : '');
      if (sub) this.txt(sub, C.SCREEN_W / 2, y + 62, 20, gold ? '#ffe9a0' : '#e9d7a6', 'center', { sw: 5 });
      if (mv.catchphrase) this.txt(mv.catchphrase, C.SCREEN_W / 2, 150, 64, mv.catchColor || '#ffd23c', 'center', { font: '"Noto Serif","Georgia",serif', sw: 12, stroke: '#3a0d0d' });
      c.globalAlpha = 1;
    }
    if ((this.t >> 4) % 2 === 0) this.txt('任意键跳过', C.SCREEN_W - 20, C.SCREEN_H - 14, 13, '#bfb3d6', 'right', { sw: 3, weight: 700 });
  };

  // ---------- 模态画面 ----------
  G.campDim = function (a = 0.72) { const C = WF.CFG; this.ctx.fillStyle = `rgba(6,3,16,${a})`; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H); };
  G.campHpLine = function (y) {
    const C = WF.CFG, P = this.p[0], c = this.ctx, w = 360, x = (C.SCREEN_W - w) / 2;
    this.box(x - 3, y - 3, w + 6, 22, '#0b0716', '#e9d7a6', 2); c.fillStyle = '#2a1a22'; c.fillRect(x, y, w, 16);
    c.fillStyle = P.hp / P.maxHp <= 0.25 ? '#ff6a58' : '#ffd23c'; c.fillRect(x, y, Math.round(w * P.hp / P.maxHp), 16);
    this.txt(`${P.mv.name}  ${P.hp} / ${P.maxHp}`, C.SCREEN_W / 2, y + 9, 14, '#ffffff', 'center', { sw: 4 });
  };
  G.campCard = function (i, x, y, w, h, sel, o) {
    this.box(x, y, w, h, o.disabled ? 'rgba(20,14,40,0.6)' : (sel ? 'rgba(255,210,60,0.18)' : 'rgba(20,14,40,0.92)'), o.border || (sel ? '#ffd23c' : '#5d4f86'), sel ? 4 : 2);
    this.campRects.push({ x, y, w, h, key: 'opt', i });
    this.txt(String(i + 1), x + 18, y + 20, 18, '#ffd23c', 'center', { sw: 4 });
    if (o.tag) { this.box(x + w - 70, y - 12, 64, 24, '#ffd23c', null); this.txt(o.tag, x + w - 38, y, 14, '#120c1c', 'center', { stroke: false }); }
  };
  G.drawRest = function () {
    const C = WF.CFG, m = this.camp.modal, P = this.p[0], KC = K();
    this.campDim(0.7);
    this.txt('休息点', C.SCREEN_W / 2, 70, 46, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
    this.txt('打完了精英，喘口气：三选一', C.SCREEN_W / 2, 116, 18, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.campHpLine(146);
    const opts = [
      { t: '回血', d: `回复 ${Math.round(KC.REST_HEAL * 100)}% 血量（+${Math.min(P.maxHp - P.hp, Math.round(P.maxHp * KC.REST_HEAL))}）`, ic: '✚' },
      { t: '抽道具', d: '再抽一件道具：普通、稀有或传说', ic: '?' },
      { t: '复习', d: m.reviewN ? `把本城错过的 ${m.reviewN} 个词再答一遍，全对奖励一件稀有道具` : '本城还没有答错的词，也没有错题本', ic: '✎', disabled: !m.reviewN, tag: m.reviewN ? '推荐' : null },
    ];
    const w = 270, h = 220, gap = 24, x0 = (C.SCREEN_W - (w * 3 + gap * 2)) / 2, y = 200;
    opts.forEach((o, i) => {
      const x = x0 + i * (w + gap), sel = m.sel === i;
      this.campCard(i, x, y, w, h, sel, { disabled: o.disabled, tag: o.tag });
      this.txt(o.ic, x + w / 2, y + 64, 54, o.disabled ? '#5d4f86' : (i === 2 ? '#8fd0ff' : i === 0 ? '#7dff9a' : '#ffd23c'), 'center', { sw: 6 });
      this.txt(o.t, x + w / 2, y + 122, 28, o.disabled ? '#8a90a8' : '#ffffff', 'center', { font: C.FONT_TITLE, sw: 6 });
      this.wrapTxt(o.d, x + w / 2, y + 160, w - 36, 15, o.disabled ? '#8a90a8' : '#e9d7a6');
    });
    this.txt('← → 选择   1 2 3 / Enter 确定   鼠标也可点', C.SCREEN_W / 2, 470, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };
  G.wrapTxt = function (s, cx, y, maxW, size, color) {
    size = Math.max(size, this._tfloor || 0);   // v1.9 触屏字号下限（v19_touch.js）
    const c = this.ctx; c.font = `700 ${size}px ${WF.CFG.FONT}`;
    const lines = []; let cur = '';
    for (const ch of s) { if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur);
    lines.slice(0, 4).forEach((l, i) => this.txt(l, cx, y + i * (size + 6), size, color, 'center', { sw: 3, weight: 700 }));
  };
  G.itemDescAt = function (id, lv) { const d = ITEM(id); return d.desc(d.lv[Math.min(lv, d.lv.length) - 1], lv); };
  G.drawPick = function () {
    const C = WF.CFG, m = this.camp.modal;
    this.campDim(0.74);
    this.txt('战利品 · 三选一', C.SCREEN_W / 2, 70, 44, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
    this.txt('打倒了城市对手，挑一件带走', C.SCREEN_W / 2, 114, 18, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    const w = 270, h = 280, gap = 24, x0 = (C.SCREEN_W - (w * 3 + gap * 2)) / 2, y = 150;
    m.offers.forEach((id, i) => this.drawOfferCard(id, i, x0 + i * (w + gap), y, w, h, m.sel === i));
    this.txt('← → 选择   1 2 3 / Enter 确定', C.SCREEN_W / 2, 470, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };
  G.drawOfferCard = function (id, i, x, y, w, h, sel) {
    const C = WF.CFG, d = ITEM(id), col = C.RARITY_COLOR[d.rarity], have = this.lvOf(id), next = have + 1;
    this.campCard(i, x, y, w, h, sel, { border: sel ? '#ffd23c' : col });
    const iw = this.drawItemIcon(id, next > 1 ? next : 1, x + w / 2 - 28, y + 26, 3);
    this.txt(d.name, x + w / 2, y + 112, 26, col, 'center', { font: C.FONT_TITLE, sw: 6 });
    this.txt(C.RARITY_NAME[d.rarity] + (d.noUpgrade ? ' · 不升级' : '') + (have ? `  ·  升级 Lv${have} → Lv${next}` : '  ·  新'), x + w / 2, y + 146, 15, '#ffffff', 'center', { sw: 4, weight: 700 });
    this.wrapTxt(this.itemDescAt(id, next), x + w / 2, y + 186, w - 36, 16, '#e9d7a6');
  };
  // v1.7 背包满：新道具和身上每件道具都写出这一级的效果，方便对比再决定换哪件（10 格 = 5×2）
  G.wrapLines = function (text, maxW, size, n) {
    size = Math.max(size, this._tfloor || 0);   // v1.9 触屏字号下限（v19_touch.js）
    const c = this.ctx; c.font = `700 ${size}px ${WF.CFG.FONT}`;
    const out = []; let line = '';
    for (const ch of String(text)) {
      if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; if (out.length === n) break; }
      else line += ch;
    }
    if (out.length < n && line) out.push(line);
    else if (out.length === n && line && out.join('').length < String(text).length) { out[n - 1] = out[n - 1].slice(0, -1) + '…'; if (this._txtLog) this._txtLog.push({ cut: String(text) }); }
    return out.slice(0, n);
  };
  G.drawSwap = function () {
    const C = WF.CFG, m = this.camp.modal, cp = this.camp, d = ITEM(m.id);
    this.campDim(0.8);
    this.txt('背包满了 · 换掉哪件？', C.SCREEN_W / 2, 40, 34, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    // 新道具卡
    const nw = 520, nx = (C.SCREEN_W - nw) / 2, ny = 66, col = C.RARITY_COLOR[d.rarity];
    this.box(nx, ny, nw, 84, 'rgba(40,30,10,0.95)', col, 3);
    this.drawItemIcon(m.id, 1, nx + 12, ny + 14, 3);
    this.txt(`新：${d.name}  Lv1 · ${C.RARITY_NAME[d.rarity]}`, nx + 80, ny + 20, 18, col, 'left', { sw: 4, maxW: nw - 92 });
    this.wrapLines(this.itemDescAt(m.id, 1), nw - 92, 15, 2).forEach((ln, k) => this.txt(ln, nx + 80, ny + 46 + k * 20, 15, '#ffffff', 'left', { sw: 3, weight: 700 }));
    const w = 178, h = 124, gx = 8, cols = 5, x0 = (C.SCREEN_W - (w * cols + gx * (cols - 1))) / 2;
    cp.items.forEach((it, i) => {
      const x = x0 + (i % cols) * (w + gx), y = 162 + Math.floor(i / cols) * (h + 8), dd = ITEM(it.id), rc = C.RARITY_COLOR[dd.rarity];
      const off = this.campItemOff && this.campItemOff(it.id);
      this.box(x, y, w, h, 'rgba(20,14,40,0.94)', rc, 2);
      this.campRects.push({ x, y, w, h, key: 'slot', i });
      this.txt(i < 9 ? String(i + 1) : '0', x + 12, y + 14, 15, '#ffd23c', 'center', { sw: 4 });
      this.drawItemIcon(it.id, it.lv, x + 24, y + 6, 1.5);
      this.txt(dd.name, x + 70, y + 16, 14, rc, 'left', { sw: 3, maxW: w - 76 });
      this.txt((dd.noUpgrade ? '一次性' : 'Lv' + it.lv) + (off ? ' · 被锯中' : ''), x + 70, y + 36, 12, off ? '#ff9a6a' : '#e9d7a6', 'left', { sw: 3, weight: 700 });
      this.wrapLines(this.itemDescAt(it.id, it.lv), w - 14, 12, 4).forEach((ln, k) => this.txt(ln, x + 7, y + 62 + k * 16, 12, '#ffffff', 'left', { sw: 3, weight: 700 }));
    });
    this.box(C.SCREEN_W / 2 - 110, 436, 220, 38, 'rgba(20,14,40,0.92)', '#5d4f86', 2);
    this.campRects.push({ x: C.SCREEN_W / 2 - 110, y: 436, w: 220, h: 38, key: 'skip', i: -1 });
    this.txt('不要新道具（Esc）', C.SCREEN_W / 2, 455, 16, '#e9d7a6', 'center', { sw: 4 });
    this.txt('按 1-9 / 0 或点卡片换掉那一件', C.SCREEN_W / 2, 500, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };
  G.drawReview = function () {
    const C = WF.CFG, r = this.camp.review; if (!r) return;
    const q = r.q;
    this.campDim(0.8);
    this.txt(`复习  ${r.i + 1} / ${r.list.length}`, C.SCREEN_W / 2, 64, 36, '#8fd0ff', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`已答对 ${r.ok}　全对奖励一件稀有道具`, C.SCREEN_W / 2, 104, 16, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.txt(q.word, C.SCREEN_W / 2, 190, 56, '#ffffff', 'center', { font: '"Noto Serif","Georgia",serif', sw: 8, maxW: 700 });
    if (q.pos) this.txt(q.pos, C.SCREEN_W / 2, 240, 18, '#bfb3d6', 'center', { sw: 4 });
    const bw = 400, bh = 64, gx = 20, x0 = (C.SCREEN_W - bw * 2 - gx) / 2;
    for (let i = 0; i < 4; i++) {
      const x = x0 + (i % 2) * (bw + gx), y = 280 + Math.floor(i / 2) * (bh + 16);
      let fill = '#221a3a', stroke = '#5d4f86';
      if (r.pick != null) { if (i === q.correct) { fill = '#1d4a2c'; stroke = '#7dff9a'; } else if (i === r.pick) { fill = '#4a1a24'; stroke = '#ff6a6a'; } }
      if (q.erased === i) { this.box(x, y, bw, bh, 'rgba(30,24,44,0.55)', 'rgba(120,110,150,0.5)', 2); this.ctx.fillStyle = '#f4a8c0'; this.ctx.fillRect(x + 20, y + bh / 2, bw - 40, 3); continue; }
      this.box(x, y, bw, bh, fill, stroke, 3);
      this.campRects.push({ x, y, w: bw, h: bh, key: 'opt', i });
      this.txt(String(i + 1), x + 18, y + 18, 16, '#ffd23c', 'center', { sw: 4 });
      this.txt(q.options[i], x + bw / 2, y + bh / 2 + 3, 21, '#ffffff', 'center', { sw: 4, maxW: bw - 50, weight: 700 });
    }
    this.txt('按 1 2 3 4 作答，不限时', C.SCREEN_W / 2, 470, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };
  G.campSummaryRows = function () {
    const st = this.stats[0], acc = st.answered ? Math.round(st.correct / st.answered * 100) + '%' : '—';
    return [['答题', `${st.answered} 个词`], ['正确率', acc], ['最高连击', `${st.maxCombo || st.maxStreak}`], ['必杀 / 暴击', `${st.ults} / ${st.crits}`], ['造成伤害', `${st.dmg}`]];
  };
  G.drawSummaryBody = function (y0) {
    const C = WF.CFG, cp = this.camp, rows = this.campSummaryRows();
    this.box(150, y0, 660, 300, 'rgba(26,18,48,0.9)', '#e9d7a6', 2);
    rows.forEach((r, i) => { const y = y0 + 28 + i * 30; this.txt(r[0], 180, y, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 }); this.txt(r[1], 400, y, 18, '#ffffff', 'right', { sw: 4 }); });
    this.txt('带着的道具', 440, y0 + 28, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 });
    if (!cp.items.length) this.txt('无', 440, y0 + 62, 16, '#8a90a8', 'left', { sw: 3 });
    cp.items.forEach((it, i) => this.drawItemIcon(it.id, it.lv, 440 + (i % 4) * 88, y0 + 44 + Math.floor(i / 4) * 42, 2));
    this.txt('新进错题本', 180, y0 + 186, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 });
    const nw = Array.from(cp.newWrong.values());
    if (!nw.length) this.txt('没有新错题，厉害！', 300, y0 + 186, 16, '#7dff9a', 'left', { sw: 3, weight: 700 });
    nw.slice(0, 8).forEach((w, i) => this.txt(`${w.word}  ${String(w.meaning || '').slice(0, 10)}`, 180 + (i % 2) * 320, y0 + 216 + Math.floor(i / 2) * 22, 15, '#ffffff', 'left', { sw: 3, weight: 700, maxW: 300 }));
    if (nw.length > 8) this.txt(`…共 ${nw.length} 个`, 790, y0 + 186, 14, '#bfb3d6', 'right', { sw: 3 });
    // v1.4 本局积分（死亡 / 全部通关时结算）
    const R = cp.run;
    if (R) {
      const p = R.pts;
      this.txt(`本局积分 +${p.total}`, 440, y0 + 140, 20, '#ffd23c', 'left', { sw: 4 });
      this.txt(`累计 ${R.total}`, 790, y0 + 140, 16, '#ffffff', 'right', { sw: 4, weight: 700 });
      this.txt(`城市 ${p.city} · 敌人 ${p.enemy} · 正确率 ${p.acc} · 连击 ${p.combo}${p.wave ? ' · 评价 ' + p.wave : ''}${p.full ? ' · 通关 ' + p.full : ''}`, 440, y0 + 164, 13, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 350 });
    }
  };
  G.drawRunSummary = function () {
    const C = WF.CFG, r = this.result, cp = this.camp, k = Math.min(1, r.t / 12);
    this.ctx.fillStyle = `rgba(6,3,16,${0.82 * k})`; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    if (r.t < 6) return;
    this.campRects = [];
    const killer = r.killer && C.MOVES[r.killer];
    if (killer && killer.catchphrase) this.txt(killer.catchphrase, C.SCREEN_W / 2, 40, 40, killer.catchColor || '#ffd23c', 'center', { font: '"Noto Serif","Georgia",serif', sw: 8, stroke: '#3a0d0d' });
    this.txt('闯关结束', C.SCREEN_W / 2, killer && killer.catchphrase ? 92 : 64, 50, '#ff6a6a', 'center', { font: C.FONT_TITLE, sw: 10 });
    const cityName = K().CITY_NAMES[cp.cityId];
    const where = cp.wave > this.campWaves() ? `倒在${cityName}的${cp.city.final ? '最终 Boss' : '城市对手'} ${C.MOVES[this.campOppId()].name} 面前` : `倒在${cityName}第 ${cp.wave} 只${this.campIsEliteWave(cp.wave) ? '精英' : '小怪'}（${killer ? killer.name : ''}）手里`;
    this.txt(where + ' · 道具清空，单词进度和错题本已保存', C.SCREEN_W / 2, 132, 17, '#e9d7a6', 'center', { sw: 4, weight: 700, maxW: 880 });
    this.drawSummaryBody(160);
    if ((r.t >> 4) % 2 === 0 || r.t < 30) this.txt('Enter 再来一局    Esc 返回标题', C.SCREEN_W / 2, cp && cp.grant ? 524 : 500, cp && cp.grant ? 18 : 22, '#ffd23c', 'center', { sw: 5 });
    this.campRects.push({ x: 0, y: 0, w: C.SCREEN_W, h: C.SCREEN_H, key: 'again', i: -1 });
  };
  G.drawCleared = function () {
    const C = WF.CFG, m = this.camp.modal, k = Math.min(1, m.t / 10);
    this.campDim(0.8 * k);
    const s = m.t < 8 ? 1.6 - m.t * 0.075 : 1;
    const KC = K(), cp = this.camp, name = KC.CITY_NAMES[cp.cityId], nx = this.campRoute()[cp.ci + 1];
    if (m.final) {   // v1.3 全部通关
      this.txt('世界巡回 · 全部通关！', C.SCREEN_W / 2, 66, Math.round(54 * s), '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 11, stroke: '#7a1414' });
      this.txt(`${this.campRoute().map(id => KC.CITY_NAMES[id]).join(' ✓ ')} ✓  ·  ${WF.CFG.MOVES[this.campOppId()].name + ' 倒下了'}`, C.SCREEN_W / 2, 122, 17, '#e9d7a6', 'center', { sw: 4, weight: 700, maxW: 900 });
      this.drawSummaryBody(148);
      this.txt(`剩余血量 ${this.p[0].hp} / ${this.p[0].maxHp} · 用时 ${Math.round((this.t - cp.startT) / C.FPS / 60)} 分钟`, C.SCREEN_W / 2, 470, 19, '#8fd0ff', 'center', { sw: 5 });
      if ((m.t >> 4) % 2 === 0 || m.t < 30) this.txt('Enter 返回标题', C.SCREEN_W / 2, 510, 20, '#ffd23c', 'center', { sw: 5 });
      return;
    }
    this.txt(`${name} · 通关！`, C.SCREEN_W / 2, 66, Math.round(58 * s), '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 11, stroke: '#7a1414' });
    this.txt(`剩余血量 ${this.p[0].hp} / ${this.p[0].maxHp}  ·  飞往下一城前回复 ${Math.round(KC.CITY_HEAL * 100)}%`, C.SCREEN_W / 2, 122, 18, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.drawSummaryBody(148);
    this.txt(`下一站：${KC.CITY_NAMES[nx]}（第 ${cp.ci + 2} 站 · 小怪更强 ×${KC.CITY_MULT}）`, C.SCREEN_W / 2, 470, 19, '#8fd0ff', 'center', { sw: 5 });
    if ((m.t >> 4) % 2 === 0 || m.t < 30) this.txt('Enter 起飞  ·  Esc 返回标题', C.SCREEN_W / 2, 510, 20, '#ffd23c', 'center', { sw: 5 });
  };
})();
