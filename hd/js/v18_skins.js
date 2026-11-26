// v1.8 皮肤（外观）系统：7 个可玩角色各有一套“美术皮肤”（assets/skins/*.png，登记在 assets/skins.js 的 WF_SKIN_REG）。
// 原则：只换图，不换逻辑——命中盒 bb / hit / tick / 事件 / 伤害 / 锚点仍然读基础角色的 WF_ASSETS；皮肤图集与基础图集同尺寸同布局（build_game_skins.py 校验）。
// 默认 = 原版外观（没选过皮肤的存档、电脑对手、闯关小怪/首领、图鉴里的 NPC 一律原版）。
// 选择存在玩家存档里：Profiles 的 p.skins = { 角色id: 皮肤id }（localStorage wf_profiles_v1，随 WF.Profiles.save() 一起存）。
// 选角界面：每张可选角色卡片底部一个“‹ 外观名 ›”小条——键盘 ↑↓ / W S、鼠标/触屏点左半边=上一个、右半边=下一个。
// 积分商店钩子：WF.Skins.PRICE[皮肤id] = 积分（现在为空 = 全部免费解锁）；isUnlocked() 读 p.skinsOwned；buy() 扣 p.points（闯关积分）并记 p.skinsOwned。
(function () {
  const W = window.WF = window.WF || {};
  const REG = window.WF_SKIN_REG || [];
  const byId = {}, byChar = {};
  REG.forEach(s => { byId[s.id] = s; (byChar[s.char] = byChar[s.char] || []).push(s); });
  const S = W.Sprites, VARS = ['', '_white', '_red'];
  const sets = {};   // key -> {normal, white, red, failed}
  const keyOfSkin = id => 'skin:' + id;

  W.Skins = {
    reg: REG,
    PRICE: {},   // 积分商店钩子：{ suling_winter: 300, ... }；没写 = 免费
    of(id) { return byId[id] || null; },
    list(charId) { return (byChar[charId] || []).slice(); },
    // ---- 解锁 / 商店钩子 ----
    isUnlocked(pid, skinId) {
      const price = this.PRICE[skinId] || 0; if (!price) return true;
      if (W.Unlocks && W.Unlocks.debugAll) return true;
      const p = W.Profiles.ext(pid); return !!(p && p.skinsOwned && p.skinsOwned[skinId]);
    },
    price(skinId) { return this.PRICE[skinId] || 0; },
    buy(pid, skinId) {
      const p = W.Profiles.ext(pid), price = this.price(skinId);
      if (!p || !byId[skinId]) return { ok: false, err: '没有这个外观' };
      if (this.isUnlocked(pid, skinId)) return { ok: true, free: true };
      if (p.points < price) return { ok: false, err: '积分不够（需要 ' + price + '）' };
      p.points -= price; (p.skinsOwned = p.skinsOwned || {})[skinId] = Date.now(); W.Profiles.save(); return { ok: true };
    },
    // 这个玩家可选的外观：['' (原版), 皮肤id…]（没解锁的不出现在循环里）
    options(pid, charId) { return [''].concat(this.list(charId).filter(s => this.isUnlocked(pid, s.id)).map(s => s.id)); },
    // ---- 存档读写 ----
    choice(pid, charId) {
      const p = W.Profiles.get(pid), id = p && p.skins && p.skins[charId];
      return id && byId[id] && byId[id].char === charId && this.isUnlocked(pid, id) ? id : '';
    },
    set(pid, charId, skinId) {
      const p = W.Profiles.get(pid); if (!p) return false;
      if (skinId && (!byId[skinId] || byId[skinId].char !== charId || !this.isUnlocked(pid, skinId))) return false;
      p.skins = p.skins || {};
      if (skinId) p.skins[charId] = skinId; else delete p.skins[charId];
      W.Profiles.save(); return true;
    },
    cycle(pid, charId, d) {
      const o = this.options(pid, charId); if (o.length < 2) return this.choice(pid, charId);
      const i = Math.max(0, o.indexOf(this.choice(pid, charId))), n = o[(i + d + o.length) % o.length];
      this.set(pid, charId, n); return n;
    },
    // ---- 图集加载（按需；没加载好之前画原版，不会闪空）----
    ensure(skinId) {
      const k = keyOfSkin(skinId); if (sets[k]) return sets[k];
      const set = sets[k] = {};
      VARS.forEach(v => { const im = new Image(); im.onerror = () => { set.failed = true; }; im.src = 'assets/skins/' + skinId + v + '.png'; set[v.replace('_', '') || 'normal'] = im; });
      return set;
    },
    preloadAll() { REG.forEach(s => this.ensure(s.id)); },
    ready(skinId) {
      if (!skinId) return null; const set = this.ensure(skinId);
      if (set.failed) return null;
      return ['normal', 'white', 'red'].every(n => set[n].complete && set[n].naturalWidth) ? set : null;
    },
    // 某个战斗位的外观：P1 用 P1 存档；双人对战的 P2 用 P2 存档；电脑对手 / 闯关里的敌人 = 原版
    forFighter(id, side) {
      let pid = null; const g = W.game;
      if (!g || !g.menu) { if (side === 0) pid = (W.Profiles.data || {}).lastP1; }
      else if (side === 0) pid = g.menu.p1;
      else if (side === 1 && !g.menu.cpu && !g.camp && !(g.ui && g.ui.screen === 'charsel' && g.ui.then === 'campaign')) pid = g.menu.p2;
      if (!pid || !byChar[id]) return '';
      const s = this.choice(pid, id); if (s) this.ensure(s); return s;
    },
    // 头像 / 图鉴 / 选角卡片用的外观：选角界面看正在选的那位（P1 或 P2），其他界面看 P1
    bustSkin(id) {
      const g = W.game; if (!g || !g.menu || !byChar[id]) return '';
      const pid = g.ui && g.ui.screen === 'charsel' && g.charselPid ? g.charselPid() : g.menu.p1;
      return pid ? this.choice(pid, id) : '';
    },
    // 临时把某角色的图集换成皮肤图集再执行 fn（皮肤没加载好就原样执行）
    using(id, skinId, fn) {
      const set = skinId ? this.ready(skinId) : null; if (!set) return fn();
      const orig = S.img[id]; S.img[id] = set;
      try { return fn(); } finally { S.img[id] = orig; }
    },
  };

  // ---- 战斗位：子类带 skin，画的时候用皮肤图集 ----
  const F0 = W.Fighter;
  if (F0) {
    const F1 = class extends F0 {
      constructor(id, side) { super(id, side); this.skin = W.Skins.forFighter(id, side); }
      draw(ctx, ox, t) { return W.Skins.using(this.id, this.skin, () => super.draw(ctx, ox, t)); }
    };
    W.Fighter = F1;
  }
  // ---- 头像 / 选角卡片 / 图鉴 / 解锁卡片 ----
  const G = W.Game && W.Game.prototype;
  if (G) {
    const bp = G.drawPortrait;
    G.drawPortrait = function (f, x, y, size) { return W.Skins.using(f.id, f.skin, () => bp.call(this, f, x, y, size)); };
    const bb = G.drawCharBust;
    G.drawCharBust = function (id, faceRight, x, y, size, o = {}) {
      const sk = o.sil ? '' : (o.skin !== undefined ? o.skin : W.Skins.bustSkin(id));
      return W.Skins.using(id, sk, () => bb.call(this, id, faceRight, x, y, size, o));
    };
    // ---- 选角界面：卡片底部的外观小条 ----
    G.skinPid = function () { return this.charselPid(); };
    G.skinStep = function (d) {
      const R = WF.CFG.ROSTER, id = R[this.ui.sel], pid = this.skinPid();
      if (!pid || !W.Unlocks.has(pid, id)) return false;
      const o = W.Skins.options(pid, id); if (o.length < 2) { WF.Audio.play('wrong'); return true; }
      W.Skins.cycle(pid, id, d); this.charselPreview(); WF.Audio.play('menu'); return true;
    };
    G.skinKey = function (code) {
      if (code === 'ArrowUp' || code === 'KeyW') return this.skinStep(-1);
      if (code === 'ArrowDown' || code === 'KeyS') return this.skinStep(1);
      return false;
    };
    G.skinClick = function (hit) {
      const R = WF.CFG.ROSTER; if (this.ui.sel !== hit.i) { this.ui.sel = hit.i; this.ui.deny = null; this.charselPreview(); }
      this.skinStep(hit.dir || 1);
    };
    const bc = G.drawCharSel;
    G.drawCharSel = function () {
      bc.call(this);
      if (!this._skinPre) { this._skinPre = true; W.Skins.preloadAll(); }
      const C = WF.CFG, R = C.ROSTER, c = this.ctx, pid = this.skinPid(), mode = this.charselMode(), step = this.ui.step || 0;
      const gap = R.length > 5 ? 8 : 10, w = Math.min(172, Math.floor((C.SCREEN_W - 24 - gap * (R.length - 1)) / R.length)), x0 = (C.SCREEN_W - (w * R.length + gap * (R.length - 1))) / 2, y = 104;
      R.forEach((id, i) => {
        if (!W.Unlocks.has(pid, id)) return;
        const o = W.Skins.options(pid, id); if (o.length < 2) return;
        const touch = !!W.touch;   // 触屏：外观条画高、点击区再放大（≥ 手指大小），盖住卡片底部的“点此选择”小字
        const x = x0 + i * (w + gap), cy = y + (touch ? 259 : 262), h = touch ? 26 : 22, cur = W.Skins.choice(pid, id), s = cur ? W.Skins.of(cur) : null, sel = this.ui.sel === i;
        c.fillStyle = s ? 'rgba(255,210,60,0.22)' : 'rgba(40,30,70,0.85)'; c.fillRect(x + 6, cy, w - 12, h);
        c.strokeStyle = s ? '#ffd23c' : (sel ? '#bfb3d6' : '#5d4f86'); c.lineWidth = 2; c.strokeRect(x + 7, cy + 1, w - 14, h - 2);
        this.txt('‹', x + 16, cy + h / 2 + 1, touch ? 22 : 15, sel ? '#ffffff' : '#8f86b8', 'center', { sw: 3 });
        this.txt('›', x + w - 16, cy + h / 2 + 1, touch ? 22 : 15, sel ? '#ffffff' : '#8f86b8', 'center', { sw: 3 });
        this.txt(s ? s.name : '原版', x + w / 2, cy + h / 2 + 1, touch ? 15 : 13, s ? '#ffd23c' : '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 44 });
        const rx = x + 4, rw = w - 8, ry = touch ? y + 238 : cy - 4, rh = touch ? 52 : h + 8;
        this.menuRects.push({ x: rx, y: ry, w: Math.floor(rw / 2), h: rh, key: 'skin', i, dir: -1 });
        this.menuRects.push({ x: rx + Math.floor(rw / 2), y: ry, w: Math.ceil(rw / 2), h: rh, key: 'skin', i, dir: 1 });
      });
      this.txt(W.touch ? '点卡片下方的外观条换外观' : '↑ ↓ / W S  换外观', C.SCREEN_W - 24, 516, 14, '#e9d7a6', 'right', { sw: 4, weight: 700 });
    };
  }
})();
