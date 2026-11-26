// v2.3 玛戈主题重塑皮肤「蒸汽排字师」margot_vapeur（用户 2026-11-22 批准 B 方案，价格 2500 积分）。
// 在 v18 皮肤系统上加三样东西（只对穿这套皮肤的战斗位生效，命中盒 / 伤害 / tick 仍读玛戈原数据）：
//   1. 特效按皮肤换图：data.fx 同名特效换成 assets/skins/margot_vapeur_fx_*.png（尺寸、帧数、原点与原版相同）
//   2. 招式名 / 口头禅 / 必杀副题按皮肤换（必杀主名不变「终章·万页合书」，横幅下方加副题）
//   3. 皮肤专属音效（WebAudio 现场合成，不用音频文件）：键帽咔嗒、回车「叮」、蒸汽嘶声、吐纸声
// 另：积分商店最小入口——选角卡片外观条上，没买的付费皮肤显示「🔒 名字 价格」，同方向再按一次用闯关积分购买。
(function () {
  const W = window.WF = window.WF || {}, S = W.Skins; if (!S) return;
  const FXDIR = 'assets/skins/';
  const EXTRA = W.SKIN_EXTRA = W.SKIN_EXTRA || {};
  EXTRA.margot_vapeur = {
    price: 2500,
    fx: ['dict_fly', 'page_flip', 'page_impact', 'page_glow', 'page_storm', 'quay_dust'],
    moveNames: { combo_a: 'Touche！键帽点', combo_b: 'Ruban！纸带扫', combo_c: 'Levier！拉杆上挑', heavy_punch: 'Presse！铅版压', uppercut: 'Majuscule！大写上撩', dash_punch: 'Vapeur！蒸汽前冲', light_kick: 'Petit pas！靴尖正蹬', heavy_kick: 'Retour chariot！回车', grab_and_beatdown: 'Composteur！排字夹' },
    ultSub: 'Presse à vapeur · 万字连排',
    catchphrase: 'Point final.', catchColor: '#f2ebd8',
    introLine: 'Encre fraîche !',
    blurb: '1889 年左岸印刷坊的排字师，黄铜打字机当盾也当武器',
  };
  Object.keys(EXTRA).forEach(id => { if (EXTRA[id].price) S.PRICE[id] = EXTRA[id].price; });

  function skinData(base, skinId) {
    const ex = EXTRA[skinId]; if (!ex || !ex.fx || !base.fx) return base;
    const fx = Object.assign({}, base.fx);
    ex.fx.forEach(n => { if (fx[n]) fx[n] = Object.assign({}, fx[n], { src: FXDIR + skinId + '_fx_' + n + '.png' }); });
    return Object.assign({}, base, { fx });
  }
  function skinMv(base, skinId) {
    const ex = EXTRA[skinId]; if (!ex || !base) return base;
    const o = Object.assign({}, base);
    if (ex.moveNames) o.moveNames = Object.assign({}, base.moveNames || {}, ex.moveNames);
    ['ultSub', 'catchphrase', 'catchColor', 'blurb', 'introLine'].forEach(k => { if (ex[k]) o[k] = ex[k]; });
    o.skinId = skinId; return o;
  }

  // ---- 音效（合成）----
  const A = W.Audio;
  if (A && A.SFX) {
    const nb = new WeakMap();
    const noise = c => { let b = nb.get(c); if (!b) { b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0); let s = 98765; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 2147483647 * 2 - 1; } nb.set(c, b); } return b; };
    const env = (g, t, a, v, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    const tone = (c, out, t, type, f0, f1, d, v) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d); env(g, t, 0.002, v, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
    const hiss = (c, out, t, type, f, q, d, v, a = 0.002, f1) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + d); fl.Q.value = q; env(g, t, a, v, d); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.4); s.stop(t + a + d + 0.05); };
    Object.assign(A.SFX, {
      // 打字机键：短促金属「咔嗒」
      vp_key(c, out, t, p) { const k = 1 + ((p && p.v) || 0) * 0.07; hiss(c, out, t, 'bandpass', 3800 * k, 6, 0.018, 0.5); tone(c, out, t, 'square', 1900 * k, 1200 * k, 0.02, 0.08); hiss(c, out, t + 0.022, 'bandpass', 2400 * k, 5, 0.015, 0.3); },
      // 连打：一串键
      vp_rattle(c, out, t, p) { const n = (p && p.n) || 6; for (let i = 0; i < n; i++) A.SFX.vp_key(c, out, t + i * 0.055, { v: i % 3 }); },
      // 回车：滑架「咔——」+ 铃「叮」
      vp_ding(c, out, t) { hiss(c, out, t, 'bandpass', 900, 2, 0.14, 0.35, 0.01, 2600); tone(c, out, t + 0.15, 'sine', 2637, 2637, 0.6, 0.22); tone(c, out, t + 0.15, 'sine', 5274, 5274, 0.25, 0.06); },
      // 蒸汽阀：嘶声渐强
      vp_steam(c, out, t, p) { const d = (p && p.d) || 0.5; hiss(c, out, t, 'highpass', 2600, 0.7, d, 0.32, d * 0.4); hiss(c, out, t, 'bandpass', 5200, 1.2, d, 0.18, d * 0.5); },
      // 吐纸：滚筒「嗤——」
      vp_paper(c, out, t) { hiss(c, out, t, 'bandpass', 1500, 1.5, 0.28, 0.3, 0.02, 4200); },
    });
  }
  const sfx = (n, p) => { try { A && A.play(n, p || {}); } catch (e) {} };

  // ---- 战斗位：皮肤 fx / 招式名 / 音效 ----
  const F1 = W.Fighter;
  if (F1) {
    W.Fighter = class extends F1 {
      constructor(id, side) {
        super(id, side);
        if (this.skin && EXTRA[this.skin]) { this.data = skinData(this.data, this.skin); this.mv = skinMv(this.mv, this.skin); }
      }
      enter() {
        super.enter();
        if (this.skin !== 'margot_vapeur') return;
        const f = this.frame(), ev = (f && f.ev) || [], an = this.anim, i = this.fi, n = this.a.frames.length;
        if (ev.includes('hit')) {
          if (an === 'heavy_kick') sfx('vp_ding');
          else if (an === 'mega_charge_b') sfx('vp_rattle', { n: 4 });
          else sfx('vp_key', { v: i % 3 });
        }
        if (an === 'mega_charge_a' && i === 0) sfx('vp_steam', { d: 0.7 });
        if (an === 'dash_punch' && i === 0) sfx('vp_steam', { d: 0.25 });
        if (an === 'intro' && i === 4) { sfx('vp_paper'); const g = W.game; if (g && g.popWorld && this.mv.introLine) g.popWorld(this.mv.introLine, this.worldX(), W.CFG.GROUND_Y - 70, '#f2ebd8', 22); }
        if (an === 'celebrate' && i === n - 6) sfx('vp_ding');
        if (an === 'idle_alt' && i === 2) sfx('vp_rattle', { n: 3 });
      }
    };
  }

  // ---- 必杀横幅副题 ----
  const G = W.Game && W.Game.prototype;
  if (G && G.drawBanner) {
    const db = G.drawBanner;
    G.drawBanner = function () {
      db.call(this);
      const b = this.banner, P = this.p && this.p[b.side], sub = P && P.mv && P.mv.ultSub; if (!sub) return;
      const C = W.CFG, k = Math.min(1, b.t / 8);
      this.ctx.globalAlpha = k; this.txt(sub, C.SCREEN_W / 2, 128 + 64 + 14, 18, '#f2ebd8', 'center', { sw: 5, weight: 700 }); this.ctx.globalAlpha = 1;
    };
  }

  // ---- 选角外观条：付费皮肤购买入口 ----
  if (G && G.skinStep && G.drawCharSel) {
    const locked = (pid, id) => S.list(id).filter(s => S.price(s.id) && !S.isUnlocked(pid, s.id));
    const pts = pid => { const p = W.Profiles.ext && W.Profiles.ext(pid); return (p && p.points) || 0; };
    const step0 = G.skinStep;
    G.skinStep = function (d) {
      const R = W.CFG.ROSTER, id = R[this.ui.sel], pid = this.skinPid();
      if (!pid || !W.Unlocks.has(pid, id)) return false;
      const L = locked(pid, id), b = this._skinBuy;
      if (b && (b.pid !== pid || b.char !== id)) this._skinBuy = null;
      if (L.length) {
        if (this._skinBuy) {
          if (d === this._skinBuy.d) {
            const r = S.buy(pid, this._skinBuy.skin);
            if (r.ok) { S.set(pid, id, this._skinBuy.skin); this._skinBuy = null; sfx('lvup'); this.charselPreview(); }
            else { this._skinBuy.err = r.err; sfx('wrong'); }
          } else { this._skinBuy = null; sfx('menu'); }
          return true;
        }
        const o = S.options(pid, id), cur = Math.max(0, o.indexOf(S.choice(pid, id)));
        if ((d > 0 && cur === o.length - 1) || (d < 0 && cur === 0)) { this._skinBuy = { pid, char: id, skin: L[0].id, d }; sfx('menu'); return true; }
      }
      return step0.call(this, d);
    };
    const dc = G.drawCharSel;
    G.drawCharSel = function () {
      dc.call(this);
      const C = W.CFG, R = C.ROSTER, c = this.ctx, pid = this.skinPid(); if (!pid) return;
      const gap = R.length > 5 ? 8 : 10, w = Math.min(172, Math.floor((C.SCREEN_W - 24 - gap * (R.length - 1)) / R.length)), x0 = (C.SCREEN_W - (w * R.length + gap * (R.length - 1))) / 2, y = 104;
      R.forEach((id, i) => {
        if (!W.Unlocks.has(pid, id)) return;
        const L = locked(pid, id), b = this._skinBuy && this._skinBuy.pid === pid && this._skinBuy.char === id ? this._skinBuy : null;
        if (!L.length) return;
        const o = S.options(pid, id), touch = !!W.touch, x = x0 + i * (w + gap), cy = y + (touch ? 259 : 262), h = touch ? 26 : 22, sel = this.ui.sel === i;
        if (o.length < 2 || b) {   // v18 没画条（只有原版）或正在确认购买：画本模块的条
          c.fillStyle = b ? 'rgba(255,120,60,0.30)' : 'rgba(40,30,70,0.85)'; c.fillRect(x + 6, cy, w - 12, h);
          c.strokeStyle = b ? '#ffb070' : (sel ? '#bfb3d6' : '#5d4f86'); c.lineWidth = 2; c.strokeRect(x + 7, cy + 1, w - 14, h - 2);
          const sk = S.of(b ? b.skin : L[0].id), pr = S.price(sk.id);
          const t = b ? (b.err ? b.err : `${b.d > 0 ? '›' : '‹'} 再按购买 ${pr}`) : (o.length < 2 ? '原版' : '');
          this.txt('‹', x + 16, cy + h / 2 + 1, touch ? 22 : 15, sel ? '#ffffff' : '#8f86b8', 'center', { sw: 3 });
          this.txt('›', x + w - 16, cy + h / 2 + 1, touch ? 22 : 15, sel ? '#ffffff' : '#8f86b8', 'center', { sw: 3 });
          this.txt(t, x + w / 2, cy + h / 2 + 1, touch ? 14 : 12, b ? '#ffe0c0' : '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 40 });
          if (o.length < 2) {
            const rx = x + 4, rw = w - 8, ry = touch ? y + 238 : cy - 4, rh = touch ? 52 : h + 8;
            this.menuRects.push({ x: rx, y: ry, w: Math.floor(rw / 2), h: rh, key: 'skin', i, dir: -1 });
            this.menuRects.push({ x: rx + Math.floor(rw / 2), y: ry, w: Math.ceil(rw / 2), h: rh, key: 'skin', i, dir: 1 });
          }
        }
        // 条上方一行小字：🔒 皮肤名 价格 / 现有积分
        if (sel) this.txt(`🔒 ${S.of(L[0].id).name} ${S.price(L[0].id)} 积分（现有 ${pts(pid)}）`, x + w / 2, cy - 10, 11, '#ffd23c', 'center', { sw: 3, weight: 700, maxW: w + 40 });
      });
    };
  }
})();
