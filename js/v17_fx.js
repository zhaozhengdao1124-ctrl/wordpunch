// v1.7 挑战模式转盘（选下一站）+ 道具卡翻牌动画。转盘是程序画的像素图（低分辨率画布逐像素上色，再整数倍放大）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, KC = C.CAMPAIGN;
  const ITEM = id => C.ITEMS.find(i => i.id === id);
  const SEG = [['#3a2a6a', '#5d4f86'], ['#6a1a3a', '#a8325a']];
  const ease = k => 1 - Math.pow(1 - k, 3);

  // ================= 转盘 =================
  KC.WHEEL = { R: 56, SCALE: 3, SPIN_TICKS: 150, TURNS: 5, HOLD: 45, IDLE_AUTO: 0 };
  const baseMap = G.campMapStart;
  G.campMapStart = function (from) {
    const cp = this.camp;
    if (cp && cp.random && !cp._wheelFor && cp.route) {
      const last = cp.route[cp.route.length - 1], segs = cp.route.slice(cp.ci).filter(c => c !== last);
      if (cp.cityId !== last && segs.length >= 2) {
        cp._wheelFor = cp.cityId;
        // 转盘上的顺序再打乱一次（结果仍是已经洗好的下一站）
        const order = segs.slice().sort(() => Math.random() - 0.5);
        this.wheel = { from, segs: order, target: order.indexOf(cp.cityId), ang: Math.random() * Math.PI * 2, phase: 'idle', t: 0, lastSeg: -1 };
        this.state = 'wheel'; this.say(`挑战转盘：${order.map(c => KC.CITY_NAMES[c]).join('/')} → 结果 ${KC.CITY_NAMES[cp.cityId]}`);
        WF.Audio.play('whoosh');
        return;
      }
    }
    if (cp) cp._wheelFor = null;
    return baseMap.call(this, from);
  };
  G.wheelSpin = function () {
    const w = this.wheel; if (!w) return;
    if (w.phase === 'idle') {
      const n = w.segs.length, seg = Math.PI * 2 / n;
      // 指针在正上方（-π/2）：让目标格中心转到指针下，加几圈 + 格内一点随机
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const want = -Math.PI / 2 - (w.target + 0.5) * seg + jitter;
      let delta = want - w.ang; delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      w.a0 = w.ang; w.a1 = w.ang + delta + KC.WHEEL.TURNS * Math.PI * 2; w.phase = 'spin'; w.t = 0;
      WF.Audio.play('drum');
    } else if (w.phase === 'spin') { w.t = KC.WHEEL.SPIN_TICKS; }      // 再按一下：直接停
    else if (w.phase === 'done' && w.t > 12) this.wheelEnd();
  };
  G.wheelEnd = function () { const w = this.wheel; if (!w) return; this.wheel = null; const cp = this.camp; cp._wheelFor = cp.cityId; baseMap.call(this, w.from); cp._wheelFor = null; };
  G.wheelSegAt = function (ang) { const w = this.wheel, n = w.segs.length, seg = Math.PI * 2 / n; let a = (-Math.PI / 2 - ang) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return Math.floor(a / seg) % n; };
  G.wheelTick = function () {
    const w = this.wheel; if (!w) return; w.t++;
    if (w.phase === 'idle') w.ang += 0.012;
    else if (w.phase === 'spin') {
      const k = Math.min(1, w.t / KC.WHEEL.SPIN_TICKS); w.ang = w.a0 + (w.a1 - w.a0) * ease(k);
      const s = this.wheelSegAt(w.ang); if (s !== w.lastSeg) { w.lastSeg = s; WF.Audio.play('beep', { f: 1100 + (k * 300), d: 0.018 }); w.tick = 4; }
      if (k >= 1) { w.ang = w.a1; w.phase = 'done'; w.t = 0; WF.Audio.play('fight'); this.shakeAdd(6); }
    } else if (w.phase === 'done' && w.t >= KC.WHEEL.HOLD) this.wheelEnd();
    if (w.tick > 0) w.tick--;
  };
  G.drawWheel = function () {
    const w = this.wheel, c = this.ctx, R = KC.WHEEL.R, S = KC.WHEEL.SCALE, D = R * 2 + 8, n = w.segs.length, seg = Math.PI * 2 / n;
    const mode = KC.MODES ? KC.MODES.challenge : { color: '#ff5a8a', dark: '#4a0a24' };
    c.fillStyle = '#0c0614'; c.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    // 背景竖条纹
    for (let x = 0; x < C.SCREEN_W; x += 24) { c.fillStyle = (x / 24 + (this.t >> 3)) % 2 ? '#140a22' : '#1a0c2a'; c.fillRect(x, 0, 12, C.SCREEN_H); }
    if (!this._wcv) { this._wcv = document.createElement('canvas'); this._wcv.width = this._wcv.height = D; this._wimg = this._wcv.getContext('2d').createImageData(D, D); }
    const img = this._wimg, px = img.data, cx = D / 2, cy = D / 2, sel = w.phase !== 'idle' ? this.wheelSegAt(w.ang) : -1;
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cols = w.segs.map((id, i) => { const p = SEG[i % 2]; return [hex(p[0]), hex(p[1])]; });
    const OL = hex('#25202e'), GOLD = hex('#ffd23c'), GOLDD = hex('#b0821e'), WH = hex('#ffffff'), HUB = hex('#c8ccd6');
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), o = (y * D + x) * 4;
      let col = null;
      if (r <= R + 4) {
        if (r > R + 2) col = OL; else if (r > R) col = ((Math.floor((Math.atan2(dy, dx) + 7) * 8) + (this.t >> 2)) % 2) ? GOLD : GOLDD;   // 外圈跑马灯
        else if (r < 8) col = r < 6 ? HUB : OL;
        else {
          let a = Math.atan2(dy, dx) - w.ang; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const si = Math.floor(a / seg) % n, edge = (a - si * seg) < 0.035 * (60 / r) || ((si + 1) * seg - a) < 0.035 * (60 / r);
          col = edge ? OL : (si === sel && w.phase === 'done' && (w.t >> 2) % 2 ? WH : cols[si][r > R * 0.62 ? 1 : 0]);
        }
      }
      if (col) { px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255; } else px[o + 3] = 0;
    }
    this._wcv.getContext('2d').putImageData(img, 0, 0);
    const X = C.SCREEN_W / 2 - D * S / 2, Y = 92;
    c.imageSmoothingEnabled = false; c.drawImage(this._wcv, Math.round(X), Y, D * S, D * S);
    // 城市名（沿半径摆放）
    const CX = C.SCREEN_W / 2, CY = Y + D * S / 2;
    w.segs.forEach((id, i) => {
      const a = w.ang + (i + 0.5) * seg, rr = R * S * 0.6;
      this.txt(KC.CITY_NAMES[id], CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, n > 4 ? 15 : 18, i === sel && w.phase === 'done' ? '#25202e' : '#ffffff', 'center', { sw: 4, weight: 700 });
    });
    // 指针（正上方，像素三角，过格子时抖一下）
    const pu = 4, pxp = CX, pyp = Y - 2 + (w.tick > 0 ? -pu : 0);
    for (let k = 0; k < 6; k++) { c.fillStyle = '#25202e'; c.fillRect(pxp - (6 - k) * pu - pu, pyp + k * pu, (6 - k) * pu * 2 + pu * 2, pu); }
    for (let k = 0; k < 5; k++) { c.fillStyle = k < 2 ? '#ffffff' : mode.color; c.fillRect(pxp - (5 - k) * pu, pyp + k * pu, (5 - k) * pu * 2, pu); }
    // 标题与提示
    const cp = this.camp;
    this.txt('挑战模式 · 命运转盘', C.SCREEN_W / 2, 40, 34, mode.color, 'center', { font: C.FONT_TITLE, sw: 8, stroke: mode.dark });
    this.txt(`第 ${cp.ci + 1} 站 · 剩下 ${n} 座城随机 · 华盛顿（金霸霸）永远压轴`, C.SCREEN_W / 2, 74, 15, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    if (w.phase === 'idle') { if ((this.t >> 4) % 2 === 0) this.txt('Enter / 空格 / 点击  转动转盘', C.SCREEN_W / 2, 470, 20, '#ffd23c', 'center', { sw: 5 }); }
    else if (w.phase === 'spin') this.txt('……', C.SCREEN_W / 2, 470, 22, '#bfb3d6', 'center', { sw: 5 });
    else { const k = Math.min(1, w.t / 8); this.txt(`下一站：${KC.CITY_NAMES[cp.cityId]}！`, C.SCREEN_W / 2, 470, Math.round(26 + 20 * (1 - k) + 10), mode.color, 'center', { font: C.FONT_TITLE, sw: 8, stroke: mode.dark }); }
  };
  const baseCU = G.campUpdate;
  G.campUpdate = function () { if (this.state === 'wheel' && this.wheel) { if (!this.paused) this.wheelTick(); return true; } return baseCU.call(this); };
  const baseRender = G.render;
  G.render = function () { if (this.camp && this.state === 'wheel' && this.wheel) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.drawWheel(); return; } return baseRender.call(this); };
  const baseKey = G.campKey;
  G.campKey = function (code) {
    if (this.state === 'wheel') { if (code === 'Escape') { this.wheel = null; this.goTitle(); } else this.wheelSpin(); return true; }
    if (this.state === 'pick' && this.camp && this.camp.modal && !this.flipDone(this.camp.modal)) { this.flipSkip(this.camp.modal); return true; }
    return baseKey.call(this, code);
  };
  const baseClick = G.campClick;
  G.campClick = function (x, y) {
    if (this.state === 'wheel') { this.wheelSpin(); return; }
    if (this.state === 'pick' && this.camp && this.camp.modal && !this.flipDone(this.camp.modal)) { this.flipSkip(this.camp.modal); return; }
    return baseClick.call(this, x, y);
  };

  // ================= 翻牌 =================
  const F = KC.FLIP = { FIRST: 10, EACH: 16, DUR: 12, BOUNCE: 8, GLOW: 26 };
  G.flipStart = (m, i) => F.FIRST + i * F.EACH;
  G.flipDone = function (m) { return m.flipSkip || m.t >= this.flipStart(m, m.offers.length - 1) + F.DUR; };
  G.flipSkip = function (m) { m.flipSkip = true; m.flipSkipT = m.t; WF.Audio.play('menu'); };
  G.drawCardBack = function (x, y, w, h, i) {
    const c = this.ctx;
    this.box(x, y, w, h, '#2a1a4a', '#e9d7a6', 3);
    for (let yy = y + 10; yy < y + h - 10; yy += 12) for (let xx = x + 10; xx < x + w - 10; xx += 12) { c.fillStyle = ((xx - x) / 12 + (yy - y) / 12) % 2 ? '#3a2a6a' : '#21143a'; c.fillRect(xx, yy, 12, 12); }
    c.fillStyle = '#120c1c'; c.fillRect(x + w / 2 - 36, y + h / 2 - 36, 72, 72);
    this.txt('?', x + w / 2, y + h / 2 + 2, 56, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 6 });
    this.txt(String(i + 1), x + 18, y + 20, 18, '#ffd23c', 'center', { sw: 4 });
  };
  const baseOffer = G.drawOfferCard;
  G.drawOfferCard = function (id, i, x, y, w, h, sel) {
    const m = this.camp && this.camp.modal; if (!m || m.type !== 'pick') return baseOffer.call(this, id, i, x, y, w, h, sel);
    const t0 = this.flipStart(m, i), dt = m.flipSkip ? F.DUR + Math.max(0, m.t - m.flipSkipT) + 4 : m.t - t0;
    const d = ITEM(id), col = C.RARITY_COLOR[d.rarity], c = this.ctx;
    if (!m.flipSkip && dt === 0) WF.Audio.play('whoosh');
    if (!m.flipSkip && dt === Math.floor(F.DUR / 2)) WF.Audio.play('pickup', { rare: d.rarity !== 'common' });
    if (dt < 0) { this.campRects.push({ x, y, w, h, key: 'opt', i }); return this.drawCardBack(x, y, w, h, i); }
    const k = Math.min(1, dt / F.DUR), sx = Math.max(0.04, Math.abs(Math.cos(k * Math.PI))), face = k >= 0.5;
    const b = dt >= F.DUR && dt < F.DUR + F.BOUNCE ? Math.sin((dt - F.DUR) / F.BOUNCE * Math.PI) * 0.06 : 0;
    // 稀有度光晕：翻开后一圈实色方块向外扩
    if (face && dt < F.DUR + F.GLOW) {
      const g = (dt - F.DUR / 2) / (F.GLOW + F.DUR / 2), pad = Math.round(4 + g * 18);
      c.fillStyle = col; const th = 4;
      if (((dt >> 1) % 2) === 0 || d.rarity !== 'common') { c.fillRect(x - pad, y - pad, w + pad * 2, th); c.fillRect(x - pad, y + h + pad - th, w + pad * 2, th); c.fillRect(x - pad, y - pad, th, h + pad * 2); c.fillRect(x + w + pad - th, y - pad, th, h + pad * 2); }
    }
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(sx * (1 + b), 1 + b); c.translate(-(x + w / 2), -(y + h / 2));
    if (face) baseOffer.call(this, id, i, x, y, w, h, sel && dt >= F.DUR); else { this.drawCardBack(x, y, w, h, i); }
    c.restore();
    if (!face) this.campRects.push({ x, y, w, h, key: 'opt', i });
  };
  const basePick = G.drawPick;
  G.drawPick = function () {
    basePick.call(this);
    const m = this.camp.modal;
    if (m.rest) {   // 休息点抽道具：盖住原标题
      this.ctx.fillStyle = 'rgba(6,3,16,0.96)'; this.ctx.fillRect(0, 36, C.SCREEN_W, 96);
      this.txt('休息点 · 抽道具', C.SCREEN_W / 2, 70, 44, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
      this.txt('翻开看看抽到了什么', C.SCREEN_W / 2, 114, 18, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    }
    if (!this.flipDone(m)) { this.ctx.fillStyle = 'rgba(6,3,16,0.96)'; this.ctx.fillRect(0, 456, C.SCREEN_W, 30); this.txt('任意键 / 点击 跳过翻牌', C.SCREEN_W / 2, 470, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 }); }
  };
  // 休息点「抽道具」也走翻牌：一张卡（居中），翻开后 Enter / 点击 收下
  const baseRest = G.campRestChoose;
  G.campRestChoose = function (i) {
    if (i !== 1) return baseRest.call(this, i);
    const id = this.rollItem(this.rollTier()); if (!id) return this.campCloseModal();
    this.camp.modal = { type: 'pick', offers: [id], sel: 0, t: 0, rest: true }; this.state = 'pick';
    this.say('休息点抽道具 ' + id);
  };
  const baseChoose = G.campPickChoose;
  G.campPickChoose = function (i) {
    const cp = this.camp, m = cp.modal;
    if (m && m.rest) { const id = m.offers[0]; this.giveItem(id, '休息点'); this.campCloseModal(); return; }
    return baseChoose.call(this, i);
  };
  // 一张卡时居中画
  const basePick2 = G.drawPick;
  G.drawPick = function () {
    const m = this.camp.modal;
    if (m.offers.length !== 1) return basePick2.call(this);
    const keep = m.offers; const w = 270, h = 280, y = 150;
    this.campDim(0.74);
    this.drawOfferCard(keep[0], 0, (C.SCREEN_W - w) / 2, y, w, h, true);
    this.ctx.fillStyle = 'rgba(6,3,16,0.96)'; this.ctx.fillRect(0, 36, C.SCREEN_W, 96);
    this.txt(m.rest ? '休息点 · 抽道具' : '战利品', C.SCREEN_W / 2, 70, 44, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9 });
    this.txt(this.flipDone(m) ? 'Enter / 点击 收下' : '任意键 / 点击 跳过翻牌', C.SCREEN_W / 2, 470, 16, '#bfb3d6', 'center', { sw: 4, weight: 700 });
  };
})();
