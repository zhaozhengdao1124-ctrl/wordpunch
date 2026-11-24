// 绘制：世界层（原生像素 ×5）+ 高清 HUD（中文字）
(function () {
  const G = WF.Game.prototype;
  const ATTACKS = /combo|punch|kick|uppercut|hyper|mega|clash_win/;

  G.txt = function (s, x, y, size, color, align = 'center', o = {}) {
    const c = this.ctx;
    c.font = `${o.weight || 900} ${size}px ${o.font || WF.CFG.FONT}`;
    c.textAlign = align; c.textBaseline = o.base || 'middle';
    const phraseTouch = WF.touch && this.q && this.q.kind === 'phrase' && (this.state === 'question' || this.state === 'clash');
    const fl = Math.max(this._tfloor || 0, phraseTouch ? 16 : 0);   // v1.9 触屏：新界面的字不小于 fl（逻辑像素），见 v19_touch.js
    if (fl && size < fl) { size = fl; c.font = `${o.weight || 900} ${size}px ${o.font || WF.CFG.FONT}`; }
    if (o.maxW) { let w = c.measureText(s).width; if (w > o.maxW) { size = Math.max(fl, Math.floor(size * o.maxW / w)); c.font = `${o.weight || 900} ${size}px ${o.font || WF.CFG.FONT}`; } }
    if (this._txtLog) { const m = c.measureText(s), tf = c.getTransform(); this._txtLog.push({ s: String(s), x: x + tf.e, y: y + tf.f, xf: tf.a !== 1 || tf.d !== 1 || !!tf.b || !!tf.c, size, align, w: m.width, maxW: o.maxW || 0, base: o.base || 'middle', l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent }); }
    if (o.stroke !== false) { c.lineJoin = 'round'; c.lineWidth = o.sw || Math.max(3, size / 6); c.strokeStyle = o.stroke || '#120c1c'; c.strokeText(s, x, y); }
    c.fillStyle = color; c.fillText(s, x, y);
  };
  G.box = function (x, y, w, h, fill, stroke, lw = 2) {
    const c = this.ctx; c.fillStyle = fill; c.fillRect(x, y, w, h);
    if (this._txtLog && w * h > 900) { const a = /^rgba\(.*,\s*([\d.]+)\)$/.exec(String(fill)); if (!a || +a[1] >= 0.85) this._txtLog.push({ cover: true, x, y, w, h }); }   // 布局自检：不透明面板会盖住先画的字
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  };

  G.renderWorld = function () {
    const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE, ctx = this.ctx, w = this.wctx;
    const left = this.cam - C.VIEW_W / 2, li = Math.floor(left), frac = left - li;
    const lw = C.VIEW_W + 2, lh = C.VIEW_H;
    w.setTransform(WS, 0, 0, WS, 0, 0); w.imageSmoothingEnabled = false;
    w.clearRect(0, 0, lw, lh);
    if (this.onStreet && this.onStreet()) WF.Run.draw(w, li + C.VIEW_W / 2, this.t, this.street);
    else WF.Stage.draw(w, li + C.VIEW_W / 2, this.t, this.excite || 0);
    if (this.darken > 0.01) {
      w.fillStyle = `rgba(6,3,16,${this.darken})`; w.fillRect(0, 0, lw, lh);
      if (this.banner) {
        const R = WF.rng(this.t >> 1); w.fillStyle = 'rgba(255,240,200,0.35)';
        for (let i = 0; i < 14; i++) w.fillRect(Math.floor(R() * lw), Math.floor(R() * 70), 6 + Math.floor(R() * 20), 1);
      }
    }
    const order = this.fighters().slice().sort((a, b) => (ATTACKS.test(a.anim) ? 1 : 0) - (ATTACKS.test(b.anim) ? 1 : 0));
    if (this.drawWorldBehind) this.drawWorldBehind(w, li);
    WF.FX.drawSprites(w, li, true);
    for (const f of order) f.draw(w, li, this.t);
    WF.FX.draw(w, li);
    if (this.drawWorldFront) this.drawWorldFront(w, li);
    // 世界缓冲已经是 ×WORLD_SCALE 的设备像素。晃屏数值沿用 960 画面的像素，再乘 UI_SCALE。
    WF.deviceTransform(ctx);
    ctx.fillStyle = '#05030c'; ctx.fillRect(0, 0, C.OUT_W, C.OUT_H);
    const onTitle = this.state === 'title';
    const ui = C.UI_SCALE || 1;
    const sx = onTitle ? 0 : (this.shakeX || 0) * ui, sy = onTitle ? 0 : (this.shakeY || 0) * ui;
    const bw = this.world.width, bh = C.VIEW_H * WS;
    const zm = this.zoom;
    if (zm && zm.k > 0.001) {
      // 进场镜头推近：焦点从画面中心渐变到对手身上，并钳在画面内
      const z = 1 + (zm.z - 1) * zm.k, u = (C.VIEW_W / 2 + frac) + ((zm.fx - li) - (C.VIEW_W / 2 + frac)) * zm.k, v = C.VIEW_H / 2 + (zm.fy - C.VIEW_H / 2) * zm.k;
      const W = bw * z, H = bh * z;
      let dx = C.OUT_W / 2 - u * WS * z, dy = C.OUT_H / 2 - v * WS * z;
      dx = Math.min(-frac * WS * z, Math.max(C.OUT_W - W + 2 * WS * z - frac * WS * z, dx)); dy = Math.min(0, Math.max(C.OUT_H - H, dy));
      ctx.drawImage(this.world, 0, 0, bw, bh, Math.round(dx + sx), Math.round(dy + sy), Math.round(W), Math.round(H));
    } else ctx.drawImage(this.world, 0, 0, bw, bh, Math.round(-frac * WS + sx), Math.round(sy), bw, bh);
    WF.uiTransform(ctx);
    if (this.onStreet && this.onStreet() && this.street.phase === 'fade') {
      const k = Math.min(1, (this.street.fade || 0) / Math.max(1, (WF.CFG.CAMPAIGN.RUN && WF.CFG.CAMPAIGN.RUN.FADE) || 10));
      ctx.fillStyle = `rgba(255,248,230,${k})`; ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    }
    if (this.screenFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.18 * this.screenFlash})`; ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H); }
    return li;
  };

  G.render = function () {
    const C = WF.CFG;
    WF.uiTransform(this.ctx);
    if (this.camp && this.state === 'map') return this.drawMap();
    const li = this.renderWorld();
    if (this.state === 'title') {
      const sc = this.ui && this.ui.screen;
      if (sc === 'book' || sc === 'wrongbook') {
        if (WF.BookUI) WF.BookUI.ensure(this);
        return;
      }
      if (WF.BookUI) WF.BookUI.hide();
      if (sc === 'versus') return this.drawVersusMenu();
      if (sc === 'guide') return WF.Guide.draw(this);
      if (sc === 'charsel') return this.drawCharSel();
      if (sc === 'profiles') return this.drawProfiles();
      if (sc === 'settings') return this.drawSettings();
      if (sc === 'codex' && this.drawCodex) return this.drawCodex();   // v1.8 收藏 / 图鉴
      if (sc === 'achievements' && this.drawAchievements) return this.drawAchievements();   // v1.7.1 成就页
      if (sc === 'growth' && this.drawGrowth) return this.drawGrowth();   // v1.7.1 角色成长
      if (sc === 'daily' && this.drawDaily) return this.drawDaily();   // v1.7.1 每日任务
      if (sc === 'kick' && this.drawKick) return this.drawKick();   // v2.1 今日踢馆
      return this.drawTitle();
    }
    this.drawPops(li);
    const cineHide = this.camp && this.cine && !this.cine.hud;
    if (!cineHide && !(this.camp && (this.campModal() || this.state === 'result'))) this.drawHUD();
    if (this.q && !this.ko && (this.state === 'question' || this.state === 'resolve' || this.state === 'clash' || this.state === 'clashIntro' || this.state === 'rocket')) this.drawPanel();
    if (this.drawUlt2Hud) this.drawUlt2Hud();
    if (this.camp) this.drawCampOverlay(li);
    if (this.clash && !this.clash.done && !this.ko) this.drawClashUI();
    if (this.banner) this.drawBanner();
    if (this.announce) this.drawAnnounce();
    if (this.rating) this.drawRating();
    if (this.koText && this.state !== 'result') this.drawKO();
    if (this.state === 'result') { if (this.camp) this.drawRunSummary(); else this.drawResult(); }
    if (this.paused) this.drawPause();
  };

  G.drawPops = function (li) {
    const S = WF.CFG.SCALE;
    for (const p of this.pops) {
      const k = p.t / p.life, x = (p.wx - li) * S, y = p.wy * S - Math.min(1, p.t / 8) * 26;
      const sc = p.t < 4 ? 1.5 - p.t * 0.12 : 1;
      this.ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      this.txt(p.text, x, y, Math.round(p.size * sc), p.color, 'center', { sw: 6 });
      if (p.coin && WF.drawStrip19) { this.ctx.font = `900 ${Math.round(p.size * sc)}px ${WF.CFG.FONT}`; const tw = this.ctx.measureText(p.text).width; WF.drawStrip19(this.ctx, 'gold_coin_spin', p.t, Math.round(x - tw / 2 - 26), Math.round(y - 11), 20); }   // v1.9 掉落金币（I4 旋转帧）
      this.ctx.globalAlpha = 1;
    }
  };

  G.drawPortrait = function (f, x, y, size) {
    const c = this.ctx, d = f.data, cell = d.anims.idle.frames[0].c;
    const im = WF.Sprites.img[f.id].normal; if (!WF.Sprites.ok(im)) { this.box(x, y, size, size, '#1b1430', f.mv.color, 3); return; }
    const src = d.srcCell || d.cell, k = src / d.cell, sx = (cell % d.cols) * src, sy = Math.floor(cell / d.cols) * src;
    const pr = d.portrait || [14, 9, 20];
    this.box(x, y, size, size, '#1b1430', f.mv.color, 3);
    c.save(); c.beginPath(); c.rect(x + 3, y + 3, size - 6, size - 6); c.clip();
    c.imageSmoothingEnabled = false;
    if (f.side === 0) c.drawImage(im, sx + pr[0] * k, sy + pr[1] * k, pr[2] * k, pr[2] * k, x, y + 2, size, size);
    else { c.translate(x + size, y + 2); c.scale(-1, 1); c.drawImage(im, sx + pr[0] * k, sy + pr[1] * k, pr[2] * k, pr[2] * k, 0, 0, size, size); }
    c.restore();
  };

  G.drawAvatar = function (p, x, y, size) {
    const av = WF.Profiles.avatarOf(p), c = this.ctx, r = Math.floor(size / 2);
    this.box(x, y, size, size, '#1b1430', av.color, 3);
    c.fillStyle = av.color;
    c.beginPath(); c.arc(x + r, y + r, r - 6, 0, Math.PI * 2); c.fill();
    const ch = (p && p.name ? p.name[0] : '?');
    this.txt(ch, x + r, y + r + 1, Math.max(12, size * 0.42), '#120c1c', 'center', { stroke: false, weight: 900 });
  };

  // o.sil：没解锁的角色画成黑剪影；o.border：边框色
  G.drawCharBust = function (id, faceRight, x, y, size, o = {}) {
    const d = window.WF_ASSETS[id], mv = WF.CFG.MOVES[id]; if (!d || !WF.Sprites.img[id]) return;
    const cell = d.anims.idle.frames[0].c, im = o.sil ? WF.Sprites.blackOf(id) : WF.Sprites.img[id].normal;
    const pr = d.portrait || [14, 9, 20];   // v1.4：闯关角色用自己的头像框
    const src = d.srcCell || d.cell, kk = src / d.cell, sx = (cell % d.cols) * src, sy = Math.floor(cell / d.cols) * src, c = this.ctx;
    this.box(x, y, size, size, o.sil ? '#2a2440' : '#1b1430', o.border || mv.color, 3);
    if (!(im instanceof HTMLCanvasElement) && !WF.Sprites.ok(im)) return;   // 图还没下完：先只画框
    c.save(); c.imageSmoothingEnabled = false; c.beginPath(); c.rect(x + 3, y + 3, size - 6, size - 6); c.clip();
    if (faceRight) c.drawImage(im, sx + pr[0] * kk, sy + pr[1] * kk, pr[2] * kk, pr[2] * kk, x, y + 2, size, size);
    else { c.translate(x + size, y + 2); c.scale(-1, 1); c.drawImage(im, sx + pr[0] * kk, sy + pr[1] * kk, pr[2] * kk, pr[2] * kk, 0, 0, size, size); }
    c.restore();
  };
  // 小锁头（选角界面 / 解锁卡片）
  G.drawLock = function (cx, cy, s, col = '#e9d7a6') {
    const c = this.ctx;
    c.save(); c.lineWidth = Math.max(3, s * 0.16); c.strokeStyle = '#120c1c';
    c.beginPath(); c.arc(cx, cy - s * 0.18, s * 0.3, Math.PI, 0); c.stroke();
    c.lineWidth = Math.max(2, s * 0.09); c.strokeStyle = col;
    c.beginPath(); c.arc(cx, cy - s * 0.18, s * 0.3, Math.PI, 0); c.stroke();
    c.fillStyle = '#120c1c'; c.fillRect(cx - s * 0.46, cy - s * 0.2, s * 0.92, s * 0.72);
    c.fillStyle = col; c.fillRect(cx - s * 0.4, cy - s * 0.14, s * 0.8, s * 0.6);
    c.fillStyle = '#120c1c'; c.fillRect(cx - s * 0.06, cy + 0.0 * s, s * 0.12, s * 0.26);
    c.restore();
  };

  G.drawHUD = function () {
    const C = WF.CFG, c = this.ctx;
    const grd = c.createLinearGradient(0, 0, 0, 110); grd.addColorStop(0, 'rgba(8,5,18,0.85)'); grd.addColorStop(1, 'rgba(8,5,18,0)');
    c.fillStyle = grd; c.fillRect(0, 0, C.SCREEN_W, 110);
    for (const f of this.p) {
      const L = f.side === 0, bx = L ? 84 : 524, bw = 352, by = 22, bh = 22;
      this.drawPortrait(f, L ? 14 : C.SCREEN_W - 14 - 62, 12, 62);
      this.box(bx - 3, by - 3, bw + 6, bh + 6, '#0b0716', '#e9d7a6', 2);
      c.fillStyle = '#2a1a22'; c.fillRect(bx, by, bw, bh);
      const MH = f.maxHp || C.HP, hp = f.hp / MH, tr = f.trail / MH;
      const seg = (r, col) => { const w = Math.round(bw * r); c.fillStyle = col; if (L) c.fillRect(bx, by, w, bh); else c.fillRect(bx + bw - w, by, w, bh); };
      seg(tr, '#e83a3a');
      const low = f.hp <= MH * C.GUTS_RATIO;
      const hg = c.createLinearGradient(0, by, 0, by + bh);
      if (low) { const bl = (this.t >> 3) % 2; hg.addColorStop(0, bl ? '#ffb0a0' : '#ff7058'); hg.addColorStop(1, '#c0281e'); }
      else { hg.addColorStop(0, '#fff3a0'); hg.addColorStop(0.5, '#ffd23c'); hg.addColorStop(1, '#e69a1c'); }
      const w = Math.round(bw * hp); c.fillStyle = hg; if (L) c.fillRect(bx, by, w, bh); else c.fillRect(bx + bw - w, by, w, bh);
      c.fillStyle = 'rgba(255,255,255,0.35)'; if (L) c.fillRect(bx, by + 2, w, 3); else c.fillRect(bx + bw - w, by + 2, w, 3);
      this.txt(f.mv.name, L ? bx : bx + bw, 60, 20, '#fff', L ? 'left' : 'right');
      this.txt(f.mv.reporter ? `还差 ${f.hp} 题` : `${f.hp}`, L ? bx + bw - 4 : bx + 4, by + bh / 2 + 1, 15, '#fff', L ? 'right' : 'left', { sw: 4 });
      const st = this.streak ? this.streak[f.side] : 0, UA = f.mv.ult ? this.ultAt(f.side) : 0;
      for (let i = 0; i < UA; i++) {
        const px = L ? bx + 100 + i * 26 : bx + bw - 100 - 22 - i * 26, py = 52;
        const on = i < st, last = i === UA - 1;
        c.save(); c.translate(px + 10, py + 9); c.rotate(Math.PI / 4);
        c.fillStyle = on ? (st >= UA - 1 ? ((this.t >> 2) % 2 ? '#ffffff' : '#ffd23c') : '#ffd23c') : 'rgba(255,255,255,0.12)';
        c.fillRect(-7, -7, 14, 14); c.strokeStyle = last ? '#ff5050' : '#e9d7a6'; c.lineWidth = 2; c.strokeRect(-7, -7, 14, 14);
        c.restore();
      }
      if (UA && st >= UA - 1) this.txt('必杀就绪！', L ? bx + 100 + UA * 26 + 8 : bx + bw - 100 - UA * 26 - 8 + 22, 62, 16, (this.t >> 2) % 2 ? '#ff6a6a' : '#ffd23c', L ? 'left' : 'right', { sw: 4 });
      const cb = this.combo[f.side];
      if (cb && cb.t < 50 && (cb.n >= 2 || cb.label)) {
        const k = cb.t < 6 ? 1.6 - cb.t * 0.1 : 1, a = cb.t > 38 ? (50 - cb.t) / 12 : 1;
        c.globalAlpha = a;
        const x = L ? 40 : C.SCREEN_W - 40, al = L ? 'left' : 'right';
        if (cb.label) this.txt(cb.label, x, 232, Math.round(30 * k), '#ffd23c', al, { sw: 7 });
        else {
          this.txt(`${cb.n}`, x, 228, Math.round(56 * k), cb.ult ? '#ff6a6a' : '#ffd23c', al, { sw: 8, font: C.FONT_TITLE });
          this.txt(cb.ult ? '连击·必杀' : '连击', x + (L ? 1 : -1) * (cb.n >= 10 ? 70 : 40) * k, 238, Math.round(22 * k), '#fff', al, { sw: 5 });
        }
        c.globalAlpha = 1;
      }
    }
    const cx = C.SCREEN_W / 2, cy = 42;
    const q = this.q; let sec = 0, zone = 0;
    const FS = this.fastS(0), SS = this.slowS ? this.slowS() : C.SLOW_S, QT = this.timeoutS ? this.timeoutS() : (this.camp ? this.campTimeout() : C.Q_TIMEOUT_S);
    if (q && this.state === 'question') { sec = q.t / C.FPS; zone = sec <= FS ? 0 : sec <= SS ? 1 : 2; }
    c.beginPath(); c.arc(cx, cy, 32, 0, Math.PI * 2); c.fillStyle = '#120c1c'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#e9d7a6'; c.stroke();
    if (q && this.state === 'question') {
      const col = ['#ffd23c', '#ffffff', '#8a90a8'][zone];
      const lim = [FS, SS, QT][zone], base = [0, FS, SS][zone];
      const r = 1 - (sec - base) / (lim - base);
      c.beginPath(); c.arc(cx, cy, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, r)); c.lineWidth = 6; c.strokeStyle = col; c.stroke();
      this.txt(`${Math.floor(sec)}`, cx, cy + 2, 30, col, 'center', { font: C.FONT_TITLE });
      this.txt(['速攻 连击', '普通一击', '会被防御'][zone], cx, 88, q.kind === 'phrase' ? 16 : 15, col, 'center', { sw: 4 });
    } else {
      this.txt(this.clash ? '角力' : '—', cx, cy + 2, this.clash ? 22 : 26, '#e9d7a6', 'center');
    }
    const tag = this.qtypeName ? this.qtypeName() : (this.menu.wrongMatch ? '错题对战' : this.modeName());
    const left = this.matchLeft && this.matchLeft();
    const clock = left == null ? '' : (' · 剩余 ' + Math.ceil(left) + ' 秒');
    if (this.camp) { if (this.drawCampHudLine) this.drawCampHudLine(); else this.txt(this.campHudLine(), cx, 104, 13, '#e9d7a6', 'center', { sw: 3, weight: 700 }); return; }
    this.txt(`第 ${this.qn} 题 · ${tag}${this.bank && this.needsBank && this.needsBank() ? ' · ' + this.bank.name : ''}${clock}`, cx, 104, q && q.kind === 'phrase' ? 16 : 13, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  G.drawPanel = function () {
    const C = WF.CFG, c = this.ctx, q = this.q, phrase = q.kind === 'phrase', top = phrase ? 370 : 402;
    const g = c.createLinearGradient(0, top, 0, C.SCREEN_H); g.addColorStop(0, 'rgba(12,8,26,0.86)'); g.addColorStop(1, 'rgba(12,8,26,0.96)');
    c.fillStyle = g; c.fillRect(0, top, C.SCREEN_W, C.SCREEN_H - top);
    c.fillStyle = '#e9d7a6'; c.fillRect(0, top, C.SCREEN_W, 2);
    const hasEx = !!(q.ex && q.ex.en);
    if (phrase) {
      const cx = C.SCREEN_W / 2;
      this.txt('短语', q.hint && !q.revealed ? cx - 60 : cx, top + 14, 16, '#ffd23c', 'center', { sw: 3, weight: 900 });
      const text = q.displayWord || q.word, font = '"Noto Serif","Georgia",serif';
      let size = 34, lines = [text];
      const measure = t => { c.font = `700 ${size}px ${font}`; return c.measureText(t).width; };
      while (measure(text) > 760 && size > 24) size--;
      if (measure(text) > 760) {
        const words = text.split(/\s+/); let best = Infinity;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0,i).join(' '), b = words.slice(i).join(' '), w = Math.max(measure(a), measure(b));
          if (w < best) { best = w; lines = [a,b]; }
        }
        while (Math.max(...lines.map(measure)) > 760 && size > 16) size--;
      }
      lines.forEach((line,i) => this.txt(line, cx, top + (lines.length === 1 ? 44 : 33 + i * 25), size, '#fff', 'center', {font,weight:700,sw:3}));
      const subtitle = q.fmt === 'blank' ? q.meaning : (hasEx ? (q.revealed && q.ex.zh ? q.ex.zh : q.ex.en) : '');
      if (subtitle) this.drawPhraseSubtitle(subtitle, cx, top + 86);
      if (q.hint && !q.revealed) this.txt('提示：' + q.hint + '…', cx - 20, top + 14, 16, '#8fd0ff', 'left', {sw:3});
      this.phraseLayout = { lines: lines.length, size, width: Math.max(...lines.map(measure)), bottom: top + 90 };
    } else {
    const qFont = q.kind === 'math' ? C.FONT_TITLE : '"Noto Serif","Georgia",serif';
    const wy = hasEx ? top + 22 : top + 30;
    const prompt = q.displayWord || q.word;
    this.txt(prompt, C.SCREEN_W / 2, wy, q.kind === 'math' ? 36 : (hasEx ? 30 : 38), '#ffffff', 'center', { font: qFont, weight: 700, sw: 6, maxW: 420 });
    const ww = Math.min(210, c.measureText(prompt).width / 2);
    // v1.3：有例句时词性默认不显示（例句已经点明是哪个意思）；没例句或戴了学霸眼镜就显示
    if (q.pos && (!hasEx || q.posHint)) this.txt(q.pos, C.SCREEN_W / 2 + ww + 14, wy + 4, 16, q.posHint ? '#8fd0ff' : '#bfb3d6', 'left', { sw: 3, weight: 700 });
    if (q.hint && !q.revealed) this.txt('提示：' + q.hint + '…', C.SCREEN_W / 2 - ww - 20, wy + 4, 15, '#8fd0ff', 'right', { sw: 3, weight: 700 });
    if (hasEx) this.drawExample(q.revealed && q.ex.zh ? q.ex.zh : q.ex.en, q.revealed && q.ex.zh ? null : q.word, C.SCREEN_W / 2, top + 50, 17);
    }
    const coach = this.state === 'clash' && this.clashCoach ? this.clashCoach() : null;
    for (const s of [0, 1]) {
      const f = this.p[s], a = q.ans[s], L = s === 0, x = L ? 22 : C.SCREEN_W - 22, al = L ? 'left' : 'right';
      const keys = L ? '按 1 2 3 4' : (this.camp ? f.mv.name : (this.menu.cpu ? '电脑' : '按 7 8 9 0'));
      const idle = coach ? (L ? coach.p1idle : coach.p2idle) : '';
      let st = idle || `${L ? 'P1' : (this.camp ? '' : 'P2')} ${keys}`.trim(), col = f.mv.color;
      if (!L && this.camp && f.mv.minion) { if (!q.revealed) { this.txt(st, x, top + (phrase ? 14 : 30), phrase ? 16 : 19, col, al, { sw: 5 }); } continue; }
      if (a) {
        if (!a.ok) { st = `${L ? 'P1' : 'P2'} ✗ 答错`; col = '#ff6a6a'; }
        else if (q.revealed) { st = `${L ? 'P1' : 'P2'} ✓ ${(a.t / C.FPS).toFixed(1)} 秒`; col = '#7dff9a'; }
        else { st = `${L ? 'P1' : 'P2'} 已锁定`; col = '#ffffff'; }
      } else if (q.revealed) { st = `${L ? 'P1' : 'P2'} —`; col = '#8a90a8'; }
      this.txt(st, x, top + (phrase ? 14 : 30), phrase ? 16 : 19, col, al, { sw: 5 });
    }
    const bw = 222, gap = 12, x0 = (C.SCREEN_W - (bw * 4 + gap * 3)) / 2, y = phrase ? 468 : (hasEx ? top + 68 : top + 60), bh = phrase ? 66 : (hasEx ? 60 : 66);
    this.ansRects = [];   // v1.8 触屏 / 鼠标点选项
    for (let i = 0; i < 4; i++) this.ansRects.push({ x: x0 + i * (bw + gap), y, w: bw, h: bh, i });
    const k2 = ['7', '8', '9', '0'];
    for (const rect of this.ansRects) {
      const { x, i } = rect;
      if (q.erased === i) {
        this.box(x, y, bw, bh, 'rgba(30,24,44,0.55)', 'rgba(120,110,150,0.5)', 2);
        this.ctx.globalAlpha = 0.4; this.txt(q.options[i], x + bw / 2, y + bh / 2 + 4, 21, '#8a90a8', 'center', { sw: 3, maxW: bw - 30, weight: 700 }); this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#f4a8c0'; this.ctx.fillRect(x + 18, y + bh / 2 + 3, bw - 36, 3);
        this.txt('橡皮擦', x + bw - 10, y + 12, phrase ? 16 : 12, '#f4a8c0', 'right', { sw: 3 });
        continue;
      }
      const picked = q.ans.some(a => a && a.idx === i);
      const wrong = q.ans.some(a => a && a.idx === i && !a.ok);
      const flash = q.flash && q.flash.idx === i && q.flash.t < 8;
      const correct = (q.revealed && i === q.correct) || (flash && q.flash.ok);
      WF.Buttons.answer(this, rect, q.options[i], {
        tone: correct ? 'correct' : wrong ? 'wrong' : 'idle', pressed: picked,
        keyColor: this.p[0].mv.color, otherKey: !this.menu.cpu && k2[i], otherColor: this.p[1].mv.color,
        size: q.kind === 'math' ? 28 : 21, font: q.kind === 'math' ? C.FONT_TITLE : C.FONT,
      });
      for (const s of (this.camp ? [0] : [0, 1])) {
        const a = q.ans[s]; if (!a || a.idx !== i || (a.ok && !q.revealed)) continue;
        const bx = s === 0 ? x + 4 : x + bw - 40;
        this.box(bx, y + bh - 20, 36, 17, this.p[s].mv.color, null);
        this.txt(s === 0 ? 'P1' : 'P2', bx + 18, y + bh - 11, phrase ? 16 : 12, '#120c1c', 'center', { stroke: false });
      }
    }
  };

  // Short phrase subtitles retain a readable minimum on 667px phones.
  G.drawPhraseSubtitle = function(text, cx, y) {
    const c = this.ctx; let size = 17, shown = String(text);
    const width = () => { c.font = `700 ${size}px ${WF.CFG.FONT}`; return c.measureText(shown).width; };
    while (width() > 900 && size > 16) size--;
    while (width() > 900 && shown.length > 1) shown = shown.slice(0,-2) + '…';
    this.txt(shown, cx, y, size, '#d8d0ea', 'center', {sw:2,weight:700});
  };

  // 例句一行：把题目词（含变形）高亮成金色；太长就缩字号
  G.drawExample = function (text, word, cx, y, size) {
    const c = this.ctx, C = WF.CFG, maxW = 900;
    let parts = [[text, false]];
    if (word) {
      const stem = word.toLowerCase().slice(0, Math.max(3, word.length - (word.length > 5 ? 2 : 1)));
      const m = new RegExp('\\b(' + stem.replace(/[^a-z]/g, '') + '[a-z]*)', 'i').exec(text);
      if (m) parts = [[text.slice(0, m.index), false], [m[1], true], [text.slice(m.index + m[1].length), false]];
    }
    let sz = size;
    const width = () => { c.font = `700 ${sz}px ${C.FONT}`; return parts.reduce((a, p) => a + c.measureText(p[0]).width, 0); };
    while (width() > maxW && sz > 11) sz--;
    let x = cx - Math.min(maxW, width()) / 2;
    for (const [t, hl] of parts) {
      if (!t) continue;
      this.txt(t, x, y, sz, hl ? '#ffd23c' : '#d8d0ea', 'left', { sw: 3, weight: 700 });
      c.font = `700 ${sz}px ${C.FONT}`; x += c.measureText(t).width;
    }
  };

  // 角力进行中的操作说明。只描述现有规则：答对给己方加一格，先满 CLASH_WIN_COUNT 格的人打出一击；
  // 计时归零则平手、不掉血。按键 / 点选跟普通题同一套，不在这里发明新操作。
  G.clashCoach = function () {
    const n = WF.CFG.CLASH_WIN_COUNT;
    const touch = !!WF.touch;
    const net = !!this.netLive;
    const camp = !!this.camp && !net;
    const cpu = (!!(this.menu && this.menu.cpu) || camp) && !net;
    let rival = '电脑';
    if (!cpu) rival = 'P2';
    else if (camp && this.p && this.p[1] && this.p[1].mv && this.p[1].mv.name) {
      const name = this.p[1].mv.name;
      rival = name.length <= 4 ? name : '对手';
    }
    let how, p1idle, p2idle;
    if (net) {
      how = touch ? '点选答案抢答' : '按 1–4 或 7–0 抢答';
      p1idle = '';
      p2idle = '';
    } else if (!cpu) {
      how = touch ? 'P1 点选答案，P2 按 7 8 9 0' : 'P1 按 1–4，P2 按 7 8 9 0';
      p1idle = touch ? 'P1 点选' : 'P1 按 1 2 3 4';
      p2idle = 'P2 按 7 8 9 0';
    } else {
      how = touch ? '点选答案抢答' : '按 1 2 3 4 抢答';
      p1idle = touch ? 'P1 点选' : 'P1 按 1 2 3 4';
      p2idle = camp ? rival : 'P2 电脑';
    }
    const goal = `答对点亮己方一格，先满 ${n} 格打出一击；归零平手，不掉血`;
    return { how, goal, line1: how, line2: goal, left: 'P1', right: rival, p1idle, p2idle, n };
  };

  G.drawClashUI = function () {
    const C = WF.CFG, cl = this.clash; if (!cl || this.state === 'clashIntro') return;
    const coach = this.clashCoach();
    const cx = C.SCREEN_W / 2, y = 146;
    // 计分格和倒计时仍在原来的位置。只把盒子加宽，腾出两侧的 P1 / 对手名。
    this.box(cx - 230, y - 18, 460, 44, 'rgba(12,8,26,0.85)', '#ffd23c', 2);
    const pips = [];
    for (const s of [0, 1]) for (let i = 0; i < C.CLASH_WIN_COUNT; i++) {
      const x = s === 0 ? cx - 150 + i * 30 : cx + 150 - 20 - i * 30;
      const on = i < cl.score[s];
      this.box(x, y - 8, 20, 20, on ? this.p[s].mv.color : 'rgba(255,255,255,0.1)', '#e9d7a6', 2);
      pips.push({ x, y: y - 8, w: 20, h: 20, s, on });
    }
    this.txt(coach.left, cx - 162, y + 2, 16, this.p[0].mv.color, 'right', { sw: 3 });
    this.txt(coach.right, cx + 162, y + 2, 16, this.p[1].mv.color, 'left', { sw: 3, maxW: 64 });
    const left = Math.max(0, C.CLASH_CAP_S - cl.t / C.FPS);
    const timer = `角力 ${left.toFixed(1)}`;
    this.txt(timer, cx, y + 2, 18, '#ffd23c', 'center', { sw: 4 });
    const bar = { x: cx - 160, y: y + 20, w: 320, h: 3 };
    const r = left / C.CLASH_CAP_S; this.ctx.fillStyle = '#ffd23c'; this.ctx.fillRect(bar.x, bar.y, bar.w * r, bar.h);
    // 说明卡贴在计分条下方、偏左：右边 y=186 起是成就提示的位置，不挡倒计时、格子和下面的选项。
    const cap = { x: 36, y: 176, w: 548, h: 52 };
    this.box(cap.x, cap.y, cap.w, cap.h, 'rgba(12,8,26,0.9)', '#ffd23c', 2);
    this.txt(coach.line1, cap.x + cap.w / 2, cap.y + 16, 16, '#fff6dc', 'center', { sw: 3, maxW: cap.w - 20, weight: 700 });
    this.txt(coach.line2, cap.x + cap.w / 2, cap.y + 36, 16, '#ffd23c', 'center', { sw: 3, maxW: cap.w - 20, weight: 700 });
    this.clashHud = { pips, bar, caption: cap, timer, coach };
  };

  G.drawBanner = function () {
    const C = WF.CFG, c = this.ctx, b = this.banner, k = Math.min(1, b.t / 8);
    const y = 128, h = 64, col = this.p[b.side].mv.color;
    c.fillStyle = `rgba(0,0,0,${0.75 * k})`; c.fillRect(0, y, C.SCREEN_W, h);
    c.fillStyle = col; c.fillRect(0, y, C.SCREEN_W * k, 4); c.fillRect(C.SCREEN_W * (1 - k), y + h - 4, C.SCREEN_W * k, 4);
    const x = b.side === 0 ? -300 + 780 * Math.min(1, b.t / 10) - Math.min(40, Math.max(0, b.t - 10) * 1.2) : C.SCREEN_W + 300 - 780 * Math.min(1, b.t / 10) + Math.min(40, Math.max(0, b.t - 10) * 1.2);   // v1.7.1：漂移封顶 40px，长必杀横幅不再滑出屏幕
    c.font = `900 46px ${C.FONT_TITLE}`; const off = Math.max(170, Math.round(c.measureText(b.text).width / 2) + 52);   // v2.2：7 字必杀名（终章·万页合书 / 金钟罩·千佛手）不再压住「超必杀」
    this.txt('超必杀', x - (b.side === 0 ? off : -off), y + h / 2, 22, '#ffffff', 'center', { sw: 5 });
    this.txt(b.text, x, y + h / 2 + 2, 46, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9, stroke: '#3a0d0d' });
  };

  G.drawRating = function () {
    const C = WF.CFG, a = this.rating, k = a.t < 5 ? 1.7 - a.t * 0.12 : 1;
    const al = a.t > a.life - 8 ? (a.life - a.t) / 8 : 1;
    this.ctx.globalAlpha = Math.max(0, al);
    this.txt(a.text, C.SCREEN_W / 2, 200, Math.round(72 * k), '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 10, stroke: '#3a0d0d' });
    if (a.pts) this.txt('+' + a.pts, C.SCREEN_W / 2, 248, 22, '#7dff9a', 'center', { sw: 5, weight: 700 });
    this.ctx.globalAlpha = 1;
  };

  G.drawAnnounce = function () {
    const C = WF.CFG, a = this.announce, k = a.t < 6 ? 2 - a.t / 6 : 1;
    const al = a.t > a.life - 8 ? (a.life - a.t) / 8 : 1;
    this.ctx.globalAlpha = Math.max(0, al);
    this.txt(a.text, C.SCREEN_W / 2, 225, Math.round((a.big ? 96 : 68) * k), a.big ? '#ffd23c' : '#ffffff', 'center', { font: C.FONT_TITLE, sw: 12, stroke: '#3a0d0d' });
    if (a.sub) this.txt(a.sub, C.SCREEN_W / 2, 290, 24, '#ffe9a0', 'center', { sw: 6 });
    this.ctx.globalAlpha = 1;
  };

  G.drawKO = function () {
    const C = WF.CFG, t = this.koText, k = t < 8 ? 3 - t / 4 : 1;
    if (t < 4) { this.ctx.fillStyle = 'rgba(255,255,255,0.6)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H); }
    this.txt('K.O.', C.SCREEN_W / 2, 220, Math.round(130 * k), (t >> 2) % 2 ? '#ff4a3a' : '#ffd23c', 'center', { font: '"Noto Serif","Georgia",serif', sw: 14 });
    if (t > 50 && this.ko) this.txt(`${this.ko.winner.mv.name} 胜！`, C.SCREEN_W / 2, 310, 44, '#ffffff', 'center', { sw: 9 });
  };

  G.drawResult = function () {
    const C = WF.CFG, c = this.ctx, r = this.result, k = Math.min(1, r.t / 12);
    c.fillStyle = `rgba(6,3,16,${0.8 * k})`; c.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    if (r.t < 6) return;
    const W = r.winner >= 0 ? this.p[r.winner] : null;
    const title = r.draw ? (r.timeup ? '时间到 · 平局' : '平局') : ((r.timeup ? '时间到 · ' : '') + W.mv.name + ' 获胜！');
    this.txt(title, C.SCREEN_W / 2, 70, r.draw || r.timeup ? 48 : 56, W ? W.mv.color : '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 10 });
    const tot = this.stats[0].correct + this.stats[1].correct;
    this.txt(`比赛时长 ${r.secs.toFixed(0)} 秒 · 共 ${this.qn} 题 · 全场答对 ${tot} 次 · ${this.modeName()}${this.bank && this.menu.mode !== 'math' ? ' · ' + this.bank.name : ''}`, C.SCREEN_W / 2, 122, 18, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    const rows = [
      ['正确率', s => s.answered ? Math.round(s.correct / s.answered * 100) + '%' : '—'],
      ['答对 / 作答', s => `${s.correct} / ${s.answered}`],
      ['平均答对用时', s => s.correct ? (s.sumT / s.correct / C.FPS).toFixed(1) + ' 秒' : '—'],
      ['5 秒内速答', s => `${s.fast} 次`],
      ['最高连击', s => `${s.maxStreak}`],
      ['必杀 / 暴击', s => `${s.ults} / ${s.crits}`],
      ['角力胜', s => `${s.clashWins}`],
      ['造成伤害', s => `${s.dmg}`],
    ];
    const y0 = 170, lh = 34;
    this.box(170, y0 - 30, 620, rows.length * lh + 46, 'rgba(26,18,48,0.9)', '#e9d7a6', 2);
    this.txt(this.p[0].mv.name, 600 - 30, y0 - 8, 20, this.p[0].mv.color, 'center');
    this.txt(this.p[1].mv.name, 730 - 20, y0 - 8, 20, this.p[1].mv.color, 'center');
    rows.forEach((row, i) => {
      const y = y0 + 22 + i * lh;
      this.txt(row[0], 200, y, 19, '#ffffff', 'left', { sw: 4, weight: 700 });
      this.txt(row[1](this.stats[0]), 570, y, 20, '#ffffff', 'center', { sw: 4 });
      this.txt(row[1](this.stats[1]), 710, y, 20, '#ffffff', 'center', { sw: 4 });
    });
    if ((r.t >> 4) % 2 === 0 || r.t < 30) this.txt('Enter 再来一局    Esc 返回标题', C.SCREEN_W / 2, 505, 22, '#ffd23c', 'center', { sw: 5 });
  };

  G.drawPause = function () {
    const C = WF.CFG; this.ctx.fillStyle = 'rgba(6,3,16,0.7)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    if (this.camp && this.drawPauseItems) { this.drawPauseItems(); return; }
    this.txt('暂停', C.SCREEN_W / 2, 220, 72, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 10 });
    this.txt('Esc 继续    Q 返回标题', C.SCREEN_W / 2, 300, 24, '#ffffff', 'center', { sw: 5 });
  };

  // ================= 标题画面 =================
  G.homeButtons = function () {
    return [
      { key: 'start', label: '电脑陪练', group: 'play' },
      { key: 'guide', label: '新手引导', group: 'play' },
      { key: 'versus', label: '双人对战' },
      { key: 'campaign', label: '单人闯关' },
      { key: 'book', label: '单词书', group: 'study' },
      { key: 'wrongbook', label: '错题本', group: 'study' },
      { key: 'settings', label: '设置' },
    ];
  };
  const versusChoices = [
    { key: 'net', label: '同 WiFi 对战', hint: '两台设备连同一 WiFi，由电脑开房' },
    { key: 'local', label: '同机对战', hint: '共用键盘，玩家一按 1–4，玩家二按 7、8、9、0' },
    { key: 'versusBack', label: '返回首页' },
  ];
  G.titleChoices = function () { return this.ui.screen === 'versus' ? versusChoices : this.homeButtons(); };
  G.showVersusMenu = function (selected = 'net') {
    this.ui.screen = 'versus';
    this.menu.row = versusChoices.findIndex(action => action.key === selected);
  };
  G.drawVersusMenu = function () {
    this.box(0, 0, 960, 540, 'rgba(10,7,23,0.68)');
    this.txt('双人对战', 480, 94, 46, '#ffd23c', 'center', { font: WF.CFG.FONT_TITLE, sw: 7 });
    this.menuRects = [];
    versusChoices.forEach((choice, i) => {
      const y = 154 + i * 104, w = choice.hint ? 520 : 216;
      const rect = { x: 480 - w / 2, y, w, h: choice.hint ? 80 : 52, key: choice.key, i };
      WF.Buttons.plate(this, rect, this.menu.row === i ? 'focus' : 'idle');
      this.txt(choice.label, 480, y + (choice.hint ? 28 : 26), 25, '#fff4dc', 'center', { sw: 5 });
      if (choice.hint) this.txt(choice.hint, 480, y + 56, 17, '#efe3da', 'center', { sw: 3, maxW: w - 32 });
      this.menuRects.push(rect);
    });
  };
  G.settingsItems = function () {
    const b = this.banks[this.menu.bank];
    const need = this.needsBank();
    const qtype = this.qtypeName() + (!this.menu.wrongMatch && this.menu.mode === 'mix' ? '（单词 + 数学）' : '');
    const times = WF.CFG.ROUND_TIMES || [0, 60, 90, 120, 180];
    const rt = this.menu.roundTime || 0;
    const rtLabel = times.indexOf(rt) < 0 ? '不限时' : (rt ? rt + ' 秒' : '不限时');
    const H = WF.Haptics;
    return [
      { key: 'bank', label: '词库', value: need ? (b ? `${b.name}（${b.count || b.words.length} 词${b.lazy && !b.loaded ? ' · 首次需下载 ' + WF.Banks.sizeText(b) : ''}）` : '无') : '本题型不用词库', disabled: !need },
      { key: 'qtype', label: '题型', value: qtype },
      { key: 'round', label: '回合时间', value: rtLabel },
      { key: 'sfx', label: '音效', value: WF.Audio.sfxOn ? '开' : '关' },
      { key: 'music', label: '音乐', value: WF.Audio.musicOn ? '开' : '关' },
      { key: 'bgm', label: '背景曲目', value: WF.Audio.track.name + '（' + WF.Audio.track.credit + '）' },
      { key: 'hap', label: '震动', value: H.supported ? (H.enabled ? '开' : '关') : (H.enabled ? '开（本设备不支持，无效果）' : '关') },
    ];
  };
  G.menuItems = G.settingsItems;
  G.cycleQtype = function (d = 1) {
    const opts = [
      { mode: 'word', wrong: false },
      { mode: 'math', wrong: false },
      { mode: 'mix', wrong: false },
      { mode: 'word', wrong: true },
    ];
    const cur = opts.findIndex(o => o.wrong === !!this.menu.wrongMatch && (this.menu.wrongMatch || o.mode === this.menu.mode));
    const next = opts[(Math.max(0, cur) + d + opts.length) % opts.length];
    this.menu.mode = next.mode;
    this.menu.wrongMatch = next.wrong;
  };
  G.menuAct = function (key, d = 1) {
    const n = this.banks.length;
    if (key === 'bank' && this.needsBank()) this.menu.bank = (this.menu.bank + d + n) % n;
    if (key === 'mode') this.cycleQtype(d);
    if (key === 'qtype') this.cycleQtype(d);
    if (key === 'round') {
      const times = WF.CFG.ROUND_TIMES || [0, 60, 90, 120, 180];
      const i = Math.max(0, times.indexOf(this.menu.roundTime || 0));
      this.menu.roundTime = times[(i + d + times.length) % times.length];
    }
    if (key === 'sfx') WF.Audio.sfxOn = !WF.Audio.sfxOn;
    if (key === 'music') {
      WF.Audio.musicOn = !WF.Audio.musicOn;
      if (WF.Audio.musicOn) WF.Audio.startMusic();
    }
    if (key === 'bgm') {
      WF.Audio.cycleTrack(d, true);
      if (this.menu.p1) WF.Profiles.setBgm(this.menu.p1, WF.Audio.trackId);
    }
    if (key === 'hap') WF.Haptics.enabled = !WF.Haptics.enabled;
    if (key === 'versus') { this.showVersusMenu(); WF.Audio.play('confirm'); return; }
    if (key === 'versusBack') {
      this.goTitle(); this.menu.row = this.homeButtons().findIndex(b => b.key === 'versus'); return;
    }
    if (key === 'start' || key === 'local') { this.menu.cpu = key === 'start'; this.requestStart(); return; }
    if (key === 'net') { WF.Audio.play('confirm'); this.openNet(); return; }
    if (key === 'guide') { WF.Guide.open(this); return; }
    if (key === 'campaign') { this.requestCampaign(); return; }
    if (key === 'wrongfight') { this.requestStart(true); return; }
    if (key === 'book') { this.goBook(); return; }
    if (key === 'wrongbook') { this.goWrong(); return; }
    if (key === 'settings') { this.goSettings(); return; }
    this.persistMenu();
    WF.Audio.play('menu');
  };

  G.drawProfileChip = function (side, x, y, w, h, sel) {
    const id = side === 0 ? this.menu.p1 : this.menu.p2;
    const p = WF.Profiles.get(id);
    this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.22)' : 'rgba(20,14,40,0.82)', sel ? '#ffd23c' : '#5d4f86', 2);
    if (p) {
      this.drawAvatar(p, x + 6, y + 6, h - 12);
      this.txt((side === 0 ? '' : 'P2  ') + p.name, x + h + 4, y + h / 2, 16, '#ffffff', 'left', { sw: 4, weight: 700 });
    } else {
      this.txt(side === 0 ? '点此选择玩家' : 'P2  点此选择玩家', x + 14, y + h / 2, 16, '#bfb3d6', 'left', { sw: 4, weight: 700 });
    }
  };

  G.drawTitle = function () {
    const C = WF.CFG, bob = Math.sin(this.t / 18) * 3;
    this.txt('单词格斗', C.SCREEN_W / 2 + 5, 78 + bob + 6, 72, '#7a1414', 'center', { font: C.FONT_TITLE, sw: 0, stroke: false });
    this.txt('单词格斗', C.SCREEN_W / 2, 78 + bob, 72, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 12, stroke: '#2a0a0a' });
    this.txt('WORD FIGHT  ·  试玩版 v1.12', C.SCREEN_W / 2, 130, 16, '#e9d7a6', 'center', { sw: 4, weight: 700 });

    this.menuRects = [];
    const pw = 230, ph = 48, px = C.SCREEN_W - pw - 16, py = 14;
    this.drawProfileChip(0, px, py, pw, ph, false);
    this.menuRects.push({ x: px, y: py, w: pw, h: ph, key: 'p1', i: -1 });
    const pf = WF.Profiles.ext(this.menu.p1);   // v1.4：积分 + 解锁数
    if (pf) this.txt(`闯关积分 ${pf.points}  ·  角色 ${WF.Unlocks.countFor(pf.id)}/${WF.CFG.ROSTER.length}`, px + pw - 4, py + ph + 14, 13, '#e9d7a6', 'right', { sw: 3, weight: 700 });

    const buttons = this.homeButtons();
    if (this.menu.row < 0 || this.menu.row >= buttons.length) this.menu.row = 0;
    // v1.7.1：同一 group 的按钮并排成一行（成就 / 角色成长 / 每日任务）；键盘 ↑↓（←→ 也行）按顺序走
    const rows = []; buttons.forEach((bt, i) => { const last = rows[rows.length - 1]; if (bt.group && last && last[0].bt.group === bt.group) last.push({ bt, i }); else rows.push([{ bt, i }]); });
    const nr = rows.length, bw = 420, bh = nr > 6 ? 40 : nr > 5 ? 46 : nr > 4 ? 52 : 58, gap = nr > 6 ? 6 : nr > 5 ? 8 : nr > 4 ? 10 : 14, y0 = nr > 6 ? 150 : nr > 5 ? 156 : nr > 4 ? 160 : 168, x0 = (C.SCREEN_W - bw) / 2;
    rows.forEach((row, r) => {
      const y = y0 + r * (bh + gap), n = row.length, g = 8, w = (bw - g * (n - 1)) / n;
      row.forEach(({ bt, i }, k) => {
        const x = x0 + k * (w + g), sel = this.menu.row === i, gold = bt.key === 'start' || bt.key === 'campaign', small = n > 1;
        WF.Buttons.plate(this, { x, y, w, h: bh }, sel ? 'focus' : 'idle');
        const label = small ? bt.label : (sel ? '▶  ' : '') + bt.label + (sel ? '  ◀' : '');
        this.txt(label, x + w / 2, y + bh / 2 + 2, small ? 19 : gold ? 28 : 24, sel || gold ? '#ffd23c' : '#ffffff', 'center', { font: gold ? C.FONT_TITLE : C.FONT, sw: 5, weight: 700, maxW: w - 12 });
        if (bt.dot) { const c = this.ctx; c.fillStyle = '#120c1c'; c.fillRect(x + w - 16, y - 5, 16, 16); c.fillStyle = '#ff3a3a'; c.fillRect(x + w - 14, y - 3, 12, 12); c.fillStyle = '#ffb0b0'; c.fillRect(x + w - 12, y - 1, 4, 4); }
        this.menuRects.push({ x, y, w, h: bh, key: bt.key, i });
      });
    });
    this.txt(WF.touch ? '点按菜单进入' : '方向键选择    Enter 确定    鼠标也可点', C.SCREEN_W / 2, 520, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  G.drawSettings = function () {
    const C = WF.CFG;
    this.ctx.fillStyle = 'rgba(6,3,16,0.72)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.txt('设置', C.SCREEN_W / 2, 48, 40, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.menuRects = [];
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });

    const items = this.settingsItems();
    if (this.menu.row < 0 || this.menu.row >= items.length) this.menu.row = 0;
    const x = 140, w = 680, y0 = 78, h = 36;
    items.forEach((it, i) => {
      const y = y0 + i * (h + 6), sel = this.menu.row === i;
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.22)' : 'rgba(20,14,40,0.86)', sel ? '#ffd23c' : '#5d4f86', 2);
      this.menuRects.push({ x, y, w, h, key: it.key, i });
      this.txt(it.label, x + 18, y + h / 2 + 1, 17, it.disabled ? '#8f86b8' : '#bfb3d6', 'left', { sw: 4, weight: 700 });
      const val = (sel && !it.disabled ? '◀ ' : '') + it.value + (sel && !it.disabled ? ' ▶' : '');
      this.txt(val, x + w - 18, y + h / 2 + 1, 16, it.disabled ? '#8f86b8' : '#ffffff', 'right', { sw: 4, weight: 700 });
    });
    this.txt('署名：角色像素素材 Mr.J © JKLLIN（允许改绘商用，须署名，不得再分发素材）。苏绫按其风格改绘。', C.SCREEN_W / 2, 456, 12, '#8f86b8', 'center', { sw: 3, weight: 500, maxW: 880 });
    this.txt('音乐《Vigour》wyver9（CC BY 4.0）、《首领战》《激斗》Juhani Junkala（CC0）。词库 KyleBing、wzy1935、ECDICT（MIT）、新概念词表 hello-git-world/momo-db。', C.SCREEN_W / 2, 476, 12, '#8f86b8', 'center', { sw: 3, weight: 500, maxW: 880 });
    this.txt('↑↓ 选择    ←→ 切换    Esc 返回', C.SCREEN_W / 2, 520, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  // v1.4 选角：五个可选角色一排；没解锁的画成黑剪影 + 锁，卡片上写怎么解锁，下面写进度
  G.drawCharSel = function () {
    const C = WF.CFG, R = C.ROSTER, U = WF.Unlocks, mode = this.charselMode(), step = this.ui.step || 0;
    const pid = this.charselPid(), prof = WF.Profiles.ext(pid);
    this.ctx.fillStyle = 'rgba(6,3,16,0.62)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    const head = mode === 'pvp' ? (step === 0 ? 'P1 选择角色' : 'P2 选择角色') : '选择你的角色';
    this.txt(head, C.SCREEN_W / 2, 44, 38, mode === 'pvp' ? (step === 0 ? '#2fd6c3' : '#ff8a3d') : '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    const sub = mode === 'camp' ? '单人闯关 · ' + C.CAMPAIGN.ROUTE.map(c => C.CAMPAIGN.CITY_NAMES[c]).join(' → ') : mode === 'cpu' ? '电脑陪练' : (step === 0 ? '双人对战 · P1 用 1 2 3 4 答题' : '双人对战 · P2 用 7 8 9 0 答题');
    this.txt(sub, C.SCREEN_W / 2, 82, 17, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    if (prof) this.txt(`${prof.name}  ·  闯关积分 ${prof.points}  ·  已解锁 ${U.countFor(pid)}/${R.length}`, C.SCREEN_W - 20, 30, 14, '#e9d7a6', 'right', { sw: 3, weight: 700 });
    if (U.debugAll) this.txt('调试：已全部解锁（?unlockall=1）', C.SCREEN_W - 20, 50, 12, '#ff9aa0', 'right', { sw: 3, weight: 700 });
    this.menuRects = [];
    const gap = R.length > 5 ? 8 : 10, w = Math.min(172, Math.floor((C.SCREEN_W - 24 - gap * (R.length - 1)) / R.length)), x0 = (C.SCREEN_W - (w * R.length + gap * (R.length - 1))) / 2, y = 104, h = 286;   // v1.7：7 个角色，卡片自动变窄
    R.forEach((id, i) => {
      const mv = C.MOVES[id], sel = this.ui.sel === i, open = U.has(pid, id), x = x0 + i * (w + gap);
      const taken = mode === 'pvp' && step === 1 && this.menu.vs[0] === id;
      const border = sel ? (open && !taken ? '#ffd23c' : '#ff9aa0') : (open ? '#5d4f86' : '#3a3352');
      this.box(x, y, w, h, sel ? (open ? 'rgba(255,210,60,0.16)' : 'rgba(255,120,140,0.10)') : (open ? 'rgba(20,14,40,0.8)' : 'rgba(10,8,20,0.85)'), border, sel ? 4 : 2);
      this.menuRects.push({ x, y, w, h, key: 'pick', i });
      const bs = Math.min(112, w - 14), bx = x + (w - bs) / 2, by = y + 14;
      this.drawCharBust(id, true, bx, by, bs, open ? {} : { sil: true, border: '#5d5578' });
      if (!open) this.drawLock(bx + bs / 2, by + bs / 2 + 6, 40, '#c9bfe0');
      this.txt(mv.name, x + w / 2, y + 150, 28, open ? mv.color : '#8f86b8', 'center', { font: C.FONT_TITLE, sw: 6, maxW: w - 10 });
      if (open) {
        this.txt('必杀 · ' + mv.ultName, x + w / 2, y + 182, 14, '#ffffff', 'center', { sw: 4, weight: 700, maxW: w - 12 });
        if (mv.blurb) this.txt(mv.blurb, x + w / 2, y + 206, 12, '#bfb3d6', 'center', { sw: 3, weight: 700, maxW: w - 12 });
        const tag = taken ? 'P1 已选' : sel ? '▶  已选中  ◀' : '点此选择';
        this.txt(tag, x + w / 2, y + 252, 16, taken ? '#2fd6c3' : sel ? '#ffd23c' : '#bfb3d6', 'center', { sw: 4 });
      } else {
        this.txt('未解锁', x + w / 2, y + 182, 15, '#ff9aa0', 'center', { sw: 4 });
        const lines = U.rule(id).card || [U.hint(id)];
        lines.forEach((ln, k) => this.txt(ln, x + w / 2, y + 210 + k * 19, 13, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 14 }));
      }
      if (mode === 'pvp' && step === 1 && taken) { this.box(x + 6, y + 6, 40, 20, '#2fd6c3', null); this.txt('P1', x + 26, y + 16, 13, '#120c1c', 'center', { stroke: false }); }
    });
    // 下方说明：选中角色的解锁条件 + 进度，或者这一模式的对手说明
    const id = R[this.ui.sel], mv = C.MOVES[id], open = U.has(pid, id);
    this.box(60, 400, C.SCREEN_W - 120, 92, 'rgba(20,14,40,0.88)', '#5d4f86', 2);
    const dn = this.ui.deny && this.t - this.ui.deny.t < 50 ? this.ui.deny : null;
    if (!open) {
      this.txt(`解锁 ${mv.name}：${U.hint(id)}`, C.SCREEN_W / 2, 424, 18, '#ffd23c', 'center', { sw: 4, maxW: C.SCREEN_W - 150 });
      this.txt(U.progress(pid, id), C.SCREEN_W / 2, 452, 15, '#ffffff', 'center', { sw: 3, weight: 700, maxW: C.SCREEN_W - 150 });
      this.txt(dn ? '还没解锁，先选别的角色吧' : '解锁后在对战和闯关里都能选', C.SCREEN_W / 2, 476, 14, dn ? '#ff6a6a' : '#bfb3d6', 'center', { sw: 3, weight: 700 });
    } else {
      this.txt(`${mv.name}${mv.blurb ? '  ·  ' + mv.blurb : ''}`, C.SCREEN_W / 2, 424, 18, mv.color, 'center', { sw: 4, maxW: C.SCREEN_W - 150 });
      let line = '', col = '#e9d7a6';
      if (mode === 'cpu') {
        const cid = this.menu.cpuChar && this.menu.cpuChar !== id ? this.menu.cpuChar : (id === 'mrj' ? 'suling' : 'mrj');
        line = `电脑对手：${C.MOVES[cid].name}（按 Tab 或点这里换一个）`; col = C.MOVES[cid].color;
        this.menuRects.push({ x: 200, y: 440, w: C.SCREEN_W - 400, h: 26, key: 'cpu', i: -1 });
      } else if (mode === 'camp') {
        const KC = C.CAMPAIGN, ci = KC.ROUTE.find(c => KC.CITIES[c].opponent === id) || Object.keys(KC.CITIES).find(c => KC.CITIES[c].opponent === id);
        const sub = ci ? this.campOppFor(id, KC.CITIES[ci]) : null;   // v2.2 玛戈：巴黎在挑战模式城市池里，对手换成换色版玛戈
        line = ci ? `${KC.CITY_NAMES[ci]}站的城市对手会换成 ${sub === id ? '换色版' + C.MOVES[id].name : C.MOVES[sub].name}（不和自己打）` : `每城 20 个小怪 + 城市对手 × ${KC.ROUTE.length} 城，血量一路带着走`;
      } else line = step === 0 ? '选好后轮到 P2 选（不能和 P1 一样）' : `P1：${C.MOVES[this.menu.vs[0]].name}    Esc 回去重选 P1`;
      this.txt(line, C.SCREEN_W / 2, 453, 15, col, 'center', { sw: 3, weight: 700, maxW: C.SCREEN_W - 150 });
      if (dn && dn.why === 'taken') this.txt('P1 已经选了这个角色', C.SCREEN_W / 2, 476, 14, '#ff6a6a', 'center', { sw: 3, weight: 700 });
    }
    this.txt('← → 选择    Enter 确定    Esc 返回', C.SCREEN_W / 2, 516, 17, '#bfb3d6', 'center', { sw: 4, weight: 700 });
    this.box(20, 16, 80, 28, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 60, 31, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 20, y: 16, w: 80, h: 28, key: 'back', i: -1 });
  };

  // v1.4 新角色解锁卡片：任意键 / 点击继续（4 秒后也会自己收起）
  G.drawUnlockCard = function () {
    const C = WF.CFG, u = this.unlockShow[0]; if (!u) return;
    const mv = C.MOVES[u.id], c = this.ctx, k = Math.min(1, u.t / 10), out = u.t > 225 ? (240 - u.t) / 15 : 1;
    c.save(); c.globalAlpha = Math.max(0, Math.min(k, out));
    c.fillStyle = 'rgba(6,3,16,0.72)'; c.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    const w = 560, h = 330, x = (C.SCREEN_W - w) / 2, y = 96;
    this.box(x, y, w, h, 'rgba(26,18,48,0.97)', '#ffd23c', 4);
    // 放射光
    c.save(); c.translate(C.SCREEN_W / 2, y + 120); c.rotate(u.t * 0.02); c.fillStyle = 'rgba(255,210,60,0.10)';
    for (let i = 0; i < 10; i++) { c.rotate(Math.PI / 5); c.beginPath(); c.moveTo(0, 0); c.lineTo(-24, -170); c.lineTo(24, -170); c.closePath(); c.fill(); }
    c.restore();
    const s = u.t < 8 ? 1.5 - u.t * 0.06 : 1;
    this.txt('新角色解锁！', C.SCREEN_W / 2, y + 40, Math.round(40 * s), '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 9, stroke: '#7a1414' });
    const bs = 120, flip = u.t < 14;   // 先闪一下剪影再亮出来
    this.drawCharBust(u.id, true, C.SCREEN_W / 2 - bs / 2, y + 70, bs, flip ? { sil: true, border: '#ffd23c' } : { border: '#ffd23c' });
    this.txt(mv.name, C.SCREEN_W / 2, y + 220, 36, mv.color, 'center', { font: C.FONT_TITLE, sw: 7 });
    this.txt('达成：' + WF.Unlocks.hint(u.id), C.SCREEN_W / 2, y + 258, 15, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 40 });
    this.txt('现在可以在对战和闯关里选 TA 了', C.SCREEN_W / 2, y + 284, 15, '#ffffff', 'center', { sw: 3, weight: 700 });
    if (u.t > 20 && (u.t >> 4) % 2 === 0) this.txt('按任意键继续', C.SCREEN_W / 2, y + h - 14, 13, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    c.restore();
  };
  (function () {
    const base = G.render;
    G.render = function () { base.call(this); if (this.unlockShow && this.unlockShow.length && !(this.ui && (this.ui.screen === 'book' || this.ui.screen === 'wrongbook') && this.state === 'title')) this.drawUnlockCard(); };
  })();

  G.drawProfiles = function () {
    const C = WF.CFG, list = WF.Profiles.list();
    this.ctx.fillStyle = 'rgba(6,3,16,0.82)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    const side = this.ui.side === 1 ? 'P2' : 'P1';
    this.txt('玩家存档 · 给 ' + side + ' 选一个', C.SCREEN_W / 2, 40, 32, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 7 });
    this.txt(`已有 ${list.length} / ${WF.Profiles.MAX} 人，存在本机浏览器里`, C.SCREEN_W / 2, 74, 16, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    this.menuRects = [];
    list.forEach((p, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 80 + col * 410, y = 100 + row * 62, w = 390, h = 54;
      const sel = this.ui.sub === 'list' && this.ui.sel === i;
      const used = (this.menu.p1 === p.id ? 'P1' : '') || (this.menu.p2 === p.id ? 'P2' : '');
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.22)' : 'rgba(26,18,48,0.9)', sel ? '#ffd23c' : '#5d4f86', 2);
      this.drawAvatar(p, x + 8, y + 7, 40);
      this.txt(p.name, x + 58, y + 20, 20, '#ffffff', 'left', { sw: 4 });
      const acc = p.stats.answered ? Math.round(p.stats.correct / p.stats.answered * 100) + '%' : '—';
      this.txt(`对局 ${p.stats.matches}  胜 ${p.stats.wins}  正确率 ${acc}`, x + 58, y + 40, 13, '#bfb3d6', 'left', { sw: 3, weight: 700 });
      if (used) this.txt(used, x + w - 14, y + h / 2, 16, '#ffd23c', 'right', { sw: 4 });
      this.menuRects.push({ x, y, w, h, key: 'pick', i });
    });
    const by = 100 + Math.ceil(Math.max(list.length, 1) / 2) * 62 + 8;
    const canAdd = list.length < WF.Profiles.MAX;
    const actions = [
      { key: 'create', label: canAdd ? '＋ 新建玩家' : '已满 10 人', en: canAdd },
      { key: 'rename', label: '改名', en: list.length > 0 },
      { key: 'delete', label: '删除', en: list.length > 0 },
      { key: 'back', label: '返回', en: true },
    ];
    actions.forEach((a, i) => {
      const x = 80 + i * 200, y = Math.min(by, 430), w = 188, h = 36;
      const sel = this.ui.sub === 'actions' && this.ui.sel === i;
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.22)' : 'rgba(20,14,40,0.82)', sel ? '#ffd23c' : '#5d4f86', 2);
      this.txt(a.label, x + w / 2, y + h / 2 + 1, 16, a.en ? '#ffffff' : '#6a6280', 'center', { sw: 4, weight: 700 });
      this.menuRects.push({ x, y, w, h, key: a.key, i, en: a.en });
    });
    this.txt('↑↓←→ 选择    Enter 选定    N 新建    R 改名    Delete 删除    Esc 返回', C.SCREEN_W / 2, 500, 15, '#bfb3d6', 'center', { sw: 3, weight: 700 });

    if (this.ui.sub === 'create' || this.ui.sub === 'rename') this.drawNameForm();
    if (this.ui.confirm) this.drawConfirm();
  };

  G.drawNameForm = function () {
    const C = WF.CFG, c = this.ctx;
    c.fillStyle = 'rgba(6,3,16,0.75)'; c.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.box(230, 120, 500, 300, 'rgba(26,18,48,0.96)', '#ffd23c', 3);
    this.txt(this.ui.sub === 'create' ? '新建玩家' : '给玩家改名', C.SCREEN_W / 2, 160, 28, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 6 });
    this.txt('名字（最多 8 个字）', C.SCREEN_W / 2, 200, 16, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    this.box(300, 220, 360, 40, '#120c1c', '#e9d7a6', 2);
    this.txt((this.ui.nameValue || '') + ((this.t >> 4) % 2 ? '｜' : ''), 310, 241, 20, '#ffffff', 'left', { sw: 4, maxW: 340 });
    if (this.ui.sub === 'create') {
      this.txt('选一个头像', C.SCREEN_W / 2, 286, 16, '#bfb3d6', 'center', { sw: 3, weight: 700 });
      WF.Profiles.AVATARS.forEach((a, i) => {
        const x = 290 + (i % 8) * 48, y = 306;
        const dummy = { name: (this.ui.nameValue || '玩')[0], avatar: a.id };
        this.box(x, y, 42, 42, i === this.ui.avatar ? 'rgba(255,210,60,0.3)' : '#1b1430', i === this.ui.avatar ? '#ffd23c' : a.color, 2);
        this.drawAvatar(dummy, x + 1, y + 1, 40);
        this.menuRects.push({ x, y, w: 42, h: 42, key: 'avatar', i });
      });
    }
    this.txt('Enter 确定    Esc 取消', C.SCREEN_W / 2, 390, 16, '#e9d7a6', 'center', { sw: 4, weight: 700 });
  };

  G.drawConfirm = function () {
    const C = WF.CFG, cf = this.ui.confirm;
    this.ctx.fillStyle = 'rgba(6,3,16,0.7)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.box(250, 180, 460, 180, 'rgba(26,18,48,0.96)', '#ff6a6a', 3);
    this.txt('确认删除？', C.SCREEN_W / 2, 230, 28, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 6 });
    this.txt('将同时删掉这个人的错题本和战绩', C.SCREEN_W / 2, 270, 16, '#ffffff', 'center', { sw: 4, weight: 700 });
    this.txt(cf.name || '', C.SCREEN_W / 2, 300, 20, '#ff6a6a', 'center', { sw: 4 });
    this.txt('Enter 删除    Esc 取消', C.SCREEN_W / 2, 334, 16, '#e9d7a6', 'center', { sw: 4, weight: 700 });
  };

  G.drawSpeaker = function (x, y, on, muted) {
    const c = this.ctx, col = muted ? '#6a6280' : (on ? '#ffd23c' : '#e9d7a6');
    c.save();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x + 5, y + 6); c.lineTo(x + 11, y + 6); c.lineTo(x + 16, y + 2); c.lineTo(x + 16, y + 18);
    c.lineTo(x + 11, y + 14); c.lineTo(x + 5, y + 14); c.closePath(); c.fill();
    if (!muted) {
      c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.arc(x + 16, y + 10, 4, -0.7, 0.7); c.stroke();
      c.beginPath(); c.arc(x + 16, y + 10, 7.5, -0.7, 0.7); c.stroke();
    } else {
      c.strokeStyle = '#ff6a6a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 4, y + 3); c.lineTo(x + 22, y + 17); c.stroke();
    }
    c.restore();
  };

  G.drawBook = function () {
    const C = WF.CFG, p = WF.Profiles.get(this.menu.p1);
    this.ctx.fillStyle = 'rgba(6,3,16,0.88)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.txt((p ? p.name + ' 的' : '') + '单词书', C.SCREEN_W / 2, 32, 30, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 7 });
    this.menuRects = [];
    this.banks.forEach((b, i) => {
      const x = 40 + i * 130, y = 52, w = 120, h = 26, sel = this.ui.bank === i;
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.25)' : 'rgba(20,14,40,0.85)', sel ? '#ffd23c' : '#5d4f86', 2);
      this.txt(b.name, x + w / 2, y + 14, 15, sel ? '#ffd23c' : '#ffffff', 'center', { sw: 3, weight: 700 });
      this.menuRects.push({ x, y, w, h, key: 'bank', i });
    });
    this.box(700, 52, 220, 26, '#120c1c', '#e9d7a6', 2);
    this.txt((this.ui.query ? this.ui.query : '点此搜索单词 / 释义') + (this.ui.typing ? ((this.t >> 4) % 2 ? '｜' : '') : ''), 710, 66, 14, this.ui.query || this.ui.typing ? '#ffffff' : '#8f86b8', 'left', { sw: 3, maxW: 200, weight: 700 });
    this.menuRects.push({ x: 700, y: 52, w: 220, h: 26, key: 'search', i: -1 });

    const words = this.bookWords(), per = this.bookPageSize(), pages = Math.max(1, Math.ceil(words.length / per));
    if (this.ui.page > pages - 1) this.ui.page = pages - 1;
    if (this.ui.page < 0) this.ui.page = 0;
    if (this.ui.sel == null) this.ui.sel = 0;
    const page = this.ui.page;
    const slice = words.slice(page * per, page * per + per);
    if (this.ui.sel >= slice.length) this.ui.sel = Math.max(0, slice.length - 1);
    const left = slice.slice(0, 4), right = slice.slice(4, 8);
    if (WF.Speech && WF.Speech.prefetch) WF.Speech.prefetch(words.slice(page * per, page * per + per * 2).map(x => x.word));   // v1.7.2 预载本页 + 下一页发音
    const canSpeak = true; // 无系统语音时改走在线发音，按钮保持可点
    const drawPage = (arr, x, offset) => {
      this.box(x, 88, 430, 368, 'rgba(36,24,16,0.92)', '#e9d7a6', 3);
      arr.forEach((w, i) => {
        const idx = offset + i, y = 96 + i * 90, sel = this.ui.sel === idx;
        if (sel) this.box(x + 6, y, 418, 86, 'rgba(255,210,60,0.14)', '#ffd23c', 2);
        const m = p ? WF.Profiles.mastery(p.id, this.banks[this.ui.bank].id, w.word) : 'new';
        const col = { new: '#8a90a8', seen: '#ffffff', mastered: '#7dff9a', wrong: '#ff6a6a' }[m];
        const tag = { new: '未学', seen: '见过', mastered: '已掌握', wrong: '错题本' }[m];
        this.txt(w.word, x + 16, y + 16, 20, '#ffd23c', 'left', { sw: 4, font: '"Noto Serif","Georgia",serif', weight: 700, maxW: 200 });
        this.txt(tag, x + 414, y + 16, 13, col, 'right', { sw: 3, weight: 700 });
        const ipa = this.ipaText(w);
        if (ipa) this.txt(ipa, x + 16, y + 36, 13, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 300 });
        this.txt((w.pos ? w.pos + ' ' : '') + w.meaning, x + 16, y + 54, 14, '#ffffff', 'left', { sw: 3, weight: 700, maxW: 400 });
        const ex = this.exampleParts(w);
        const exLine = ex.en ? (ex.en + (ex.zh ? '  ' + ex.zh : '')) : (ex.zh || '');
        if (exLine) this.txt(exLine, x + 16, y + 72, 12, '#e9d7a6', 'left', { sw: 3, weight: 600, maxW: 340 });
        if (w.word) {
          this.drawSpeaker(x + 230, y + 6, sel, !canSpeak);
          this.menuRects.push({ x: x + 228, y: y + 2, w: 28, h: 22, key: 'say-word', i: idx });
        }
        if (ex.en) {
          this.drawSpeaker(x + 390, y + 62, false, !canSpeak);
          this.menuRects.push({ x: x + 388, y: y + 58, w: 28, h: 22, key: 'say-ex', i: idx });
        }
        this.menuRects.push({ x: x + 6, y: y, w: 418, h: 86, key: 'pick-entry', i: idx });
      });
    };
    drawPage(left, 40, 0); drawPage(right, 490, 4);
    this.txt(`第 ${page + 1} / ${pages} 页 · 共 ${words.length} 词`, C.SCREEN_W / 2, 470, 15, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.box(40, 488, 100, 28, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('← 上页', 90, 503, 14, '#ffffff', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 488, w: 100, h: 28, key: 'prev', i: -1 });
    this.box(820, 488, 100, 28, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('下页 →', 870, 503, 14, '#ffffff', 'center', { sw: 3 });
    this.menuRects.push({ x: 820, y: 488, w: 100, h: 28, key: 'next', i: -1 });
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    const hint = '← → 翻页    ↑↓ 选词    P 读单词    L 读例句    Tab 切词库    / 搜索    Esc 返回';
    this.txt(hint, C.SCREEN_W / 2, 528, 12, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  G.drawWrongBook = function () {
    const C = WF.CFG, p = WF.Profiles.get(this.menu.p1);
    this.ctx.fillStyle = 'rgba(6,3,16,0.88)'; this.ctx.fillRect(0, 0, C.SCREEN_W, C.SCREEN_H);
    this.txt((p ? p.name + ' 的' : '') + '错题本', C.SCREEN_W / 2, 32, 30, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 7 });
    this.menuRects = [];
    if (this.ui.bankFilter === 'math') this.ui.bankFilter = 'all';
    const filters = [{ id: 'all', name: '全部' }].concat(this.banks.map(b => ({ id: b.id, name: b.name })));
    filters.forEach((b, i) => {
      const x = 30 + i * 108, y = 52, w = 100, h = 26, sel = (this.ui.bankFilter || 'all') === b.id;
      this.box(x, y, w, h, sel ? 'rgba(255,210,60,0.25)' : 'rgba(20,14,40,0.85)', sel ? '#ffd23c' : '#5d4f86', 2);
      this.txt(b.name, x + w / 2, y + 14, 14, sel ? '#ffd23c' : '#ffffff', 'center', { sw: 3, weight: 700 });
      this.menuRects.push({ x, y, w, h, key: 'filter', i, id: b.id });
    });
    const list = p ? WF.Profiles.wrongList(p.id, this.ui.bankFilter || 'all') : [];
    const per = this.wrongPageSize(), pages = Math.max(1, Math.ceil(list.length / per));
    if (this.ui.page > pages - 1) this.ui.page = pages - 1;
    if (this.ui.sel == null) this.ui.sel = 0;
    const page = this.ui.page, slice = list.slice(page * per, page * per + per);
    if (this.ui.sel >= slice.length) this.ui.sel = Math.max(0, slice.length - 1);
    if (WF.Speech && WF.Speech.prefetch) WF.Speech.prefetch(list.slice(page * per, page * per + per * 2).filter(x => x && x.word && x.kind !== 'math' && x.bank !== 'math').map(x => x.word));   // v1.7.2
    const canSpeak = true; // 无系统语音时改走在线发音，按钮保持可点
    this.box(40, 88, 880, 368, 'rgba(26,18,48,0.92)', '#e9d7a6', 3);
    if (!slice.length) this.txt('这一类还没有错题。对战里答错的词或算式会自动收进来。', C.SCREEN_W / 2, 260, 18, '#bfb3d6', 'center', { sw: 4, weight: 700 });
    slice.forEach((raw, i) => {
      const h = this.enrichEntry(raw);
      const y = 96 + i * 72, sel = this.ui.sel === i;
      if (sel) this.box(50, y, 860, 68, 'rgba(255,210,60,0.14)', '#ffd23c', 2);
      const bankName = (this.banks.find(b => b.id === h.bank) || {}).name || h.bank || '';
      this.txt(h.word, 60, y + 16, 18, '#ffd23c', 'left', { sw: 4, font: '"Noto Serif","Georgia",serif', weight: 700, maxW: 280 });
      this.txt(h.meaning, 360, y + 16, 16, '#ffffff', 'left', { sw: 3, weight: 700, maxW: 260 });
      this.txt(bankName, 640, y + 16, 13, '#bfb3d6', 'left', { sw: 3, weight: 700 });
      const ds = h.lastWrong ? new Date(h.lastWrong) : null;
      const dsText = ds ? `${ds.getMonth() + 1}月${ds.getDate()}日` : '';
      this.txt('错 ' + h.wrongCount + ' 次' + (dsText ? ' · ' + dsText : ''), 700, y + 16, 13, '#ff6a6a', 'left', { sw: 3, weight: 700 });
      const ipa = this.ipaText(h);
      if (ipa) this.txt(ipa, 60, y + 36, 13, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 400 });
      const ex = this.exampleParts(h);
      const exLine = ex.en ? (ex.en + (ex.zh ? '  ' + ex.zh : '')) : (ex.zh || '');
      if (exLine) this.txt(exLine, 60, y + 54, 13, '#e9d7a6', 'left', { sw: 3, weight: 600, maxW: 780 });
      if (h.word) {
        this.drawSpeaker(880, y + 4, sel, !canSpeak);
        this.menuRects.push({ x: 876, y: y, w: 28, h: 22, key: 'say-word', i });
      }
      if (ex.en) {
        this.drawSpeaker(880, y + 42, false, !canSpeak);
        this.menuRects.push({ x: 876, y: y + 38, w: 28, h: 22, key: 'say-ex', i });
      }
      this.menuRects.push({ x: 50, y: y, w: 860, h: 68, key: 'pick-entry', i });
    });
    this.txt(`共 ${list.length} 条 · 第 ${page + 1} / ${pages} 页 · 连续答对 3 次会移出`, C.SCREEN_W / 2, 470, 14, '#e9d7a6', 'center', { sw: 4, weight: 700 });
    this.box(40, 488, 100, 28, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('← 上页', 90, 503, 14, '#ffffff', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 488, w: 100, h: 28, key: 'prev', i: -1 });
    this.box(400, 488, 160, 28, 'rgba(255,210,60,0.18)', '#ffd23c', 2);
    this.txt('▶ 错题对战', 480, 503, 16, '#ffd23c', 'center', { sw: 3 });
    this.menuRects.push({ x: 400, y: 488, w: 160, h: 28, key: 'wrongfight', i: -1 });
    this.box(820, 488, 100, 28, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('下页 →', 870, 503, 14, '#ffffff', 'center', { sw: 3 });
    this.menuRects.push({ x: 820, y: 488, w: 100, h: 28, key: 'next', i: -1 });
    this.box(40, 16, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 30, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 16, w: 80, h: 26, key: 'back', i: -1 });
    const hint = '← → 翻页    ↑↓ 选词    P 读单词    L 读例句    Tab 切分类    Esc 返回';
    this.txt(hint, C.SCREEN_W / 2, 528, 12, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

})();
