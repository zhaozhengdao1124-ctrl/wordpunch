// v1.9 道具大改 · 骨架：一局的新状态、奖池过滤（禁用 / 拿掉 / 隐藏）、道具不限量、金币、道具栏多行、暂停分页、米雷霸锯上限、
// 掉落（小怪 4% + 金币；精英改翻牌）、状态路由（翻牌 / 休息 / 商店 / 禁用的画面与按键在各自文件里）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19;
  const ITEM = id => C.ITEMS.find(i => i.id === id);
  const isDebuff = id => { const d = ITEM(id); return !!(d && d.kind === 'debuff'); };
  const NEW_MODAL = ['flip', 'upgrade', 'shop', 'ban'];
  WF.V19 = { NEW_MODAL, ITEM, isDebuff };
  const art = () => window.WF_ART19 || { items: {}, ui: {} };
  // ---- 美术：清单查询 + 像素清晰贴图（只用整数倍或 ×1.5，坐标取整，最近邻）----
  WF.hasArt19 = (kind, id) => { const v = art()[kind]; return !!(v && (Array.isArray(v) ? v.includes(id) : Object.prototype.hasOwnProperty.call(v, id))); };
  WF.hasItemIcon = id => ((window.WF_CAMPAIGN_DATA || {}).icons || []).includes(id) || WF.hasArt19('items', id);
  WF.pxScale = v => v >= 2 ? Math.floor(v) : v >= 1.5 ? 1.5 : v >= 1 ? 1 : v;   // 想要的倍数 → 允许的倍数（不超过想要的）
  WF.blit19 = function (c, im, x, y, box, want, o = {}) {   // 在 box×box 的格子里居中画 im，倍数取 pxScale(want)
    const k = WF.pxScale(want), w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const dx = Math.round(x + (box - w) / 2), dy = Math.round(y + (box - h) / 2);
    c.imageSmoothingEnabled = false;
    if (o.flip) { c.save(); c.translate(dx + w, dy); c.scale(-1, 1); c.drawImage(im, 0, 0, w, h); c.restore(); } else c.drawImage(im, dx, dy, w, h);
    return { x: dx, y: dy, w, h, k };
  };
  // 开机预载清单里的图（第一次出现不闪占位）
  WF.afterReady(() => { const a = art(); for (const id in (a.items || {})) WF.campImg('items/' + id + '.png'); for (const id of ((window.WF_CAMPAIGN_DATA || {}).icons || [])) WF.campImg('items/' + id + '.png'); for (const id in (a.ui || {})) WF.campImg('ui/' + id + '.png');
    for (const e in (a.portrait || {})) for (let i = 0; i < a.portrait[e].n; i++) WF.campImg(`shopkeeper/portrait/${e}/${String(i).padStart(3, '0')}.png`);
    for (const k in (a.counter || {})) a.counter[k].ticks.forEach((_, i) => WF.campImg(`shopkeeper/counter/${k}/${String(i).padStart(3, '0')}.png`));
    if (a.shopBg) WF.campImg('shopkeeper/shop_bg.png'); });   // 2026-11-21：进菜单 2 秒后再预载
  // 横排帧条（I4 gold_coin_spin：4 帧 10×10，每帧 4 tick 循环）：第 tt tick 的那一帧画进 box×box，按允许倍数居中、整数坐标
  WF.drawStrip19 = function (c, id, tt, x, y, box) {
    const a = art(), S = a.strips && a.strips[id], im = S && WF.hasArt19('ui', id) ? WF.campImg('ui/' + id + '.png') : null;
    if (!im) return false;
    const L = S.ticks.reduce((p, q) => p + q, 0); let r = ((Math.floor(tt) % L) + L) % L, f = 0;
    while (f < S.ticks.length - 1 && r >= S.ticks[f]) { r -= S.ticks[f]; f++; }
    const k = WF.pxScale(box / S.w), w = Math.round(S.w * k), h = Math.round(S.h * k), dx = Math.round(x + (box - w) / 2), dy = Math.round(y + (box - h) / 2);
    c.imageSmoothingEnabled = false; c.drawImage(im, f * S.w, 0, S.w, S.h, dx, dy, w, h);
    return true;
  };
  C.CAMPAIGN.FLIP = Object.assign(C.CAMPAIGN.FLIP || {}, WF.FLIP19);   // v17_fx 覆盖过 FLIP（旧翻牌动画参数），合并回 v1.9 的翻牌规则

  // ================= 一局开始 =================
  const baseStart = G.startCampaign;
  G.startCampaign = function (opts = {}) {
    const old = this.camp;
    const r = baseStart.apply(this, arguments);
    const cp = this.camp; if (!cp || cp === old) return r;
    const seed = WF.seed19 != null ? (WF.seed19 >>> 0) : ((Math.random() * 4294967296) >>> 0);
    Object.assign(cp, {
      seed, gold: 0, goldGot: 0, goldSpent: 0, pity: { bad: 0, nogood: 0 }, qCount: 0, shopMiss: 0, shopN: 0, flipN: 0,
      removeBad: 0, removeOther: 0, removed: [], bans: { picked: [], extra: [] }, perCity: {}, shield: 0, flipLog: [], haggleWins: 0,
      goodRun: 0, purified: 0, removedN: 0, maxDebuff: 0, pending: [],
    });
    cp.rng = R.sub(seed, 'misc');
    this.say(`v1.9 道具系统 种子=${seed}`);
    if (this.banMaybeOpen) this.banMaybeOpen();
    return r;
  };
  G.campRng = function (tag) { const cp = this.camp; return R.sub(cp.seed, tag); };
  const baseModal = G.campModal;
  G.campModal = function () { return baseModal.call(this) || NEW_MODAL.includes(this.state); };

  // ================= 存档：图鉴 seen / 隐藏解锁 / 最高金币 =================
  G.items19 = function () {
    const pid = this.menu && this.menu.p1, P = pid && WF.Prog && WF.Prog.of(pid); if (!P) return null;
    const L = P.life = P.life || {}; L.items = L.items || {};
    const I = P.items = P.items || {}; I.seen = I.seen || {}; I.unlocked = I.unlocked || {}; I.banUsed = I.banUsed || 0; I.maxGold = I.maxGold || 0;
    if (!I._migrated) { for (const k in L.items) if (!I.seen[k]) I.seen[k] = 1; I._migrated = 1; }   // 旧存档 prog.life.items → prog.items.seen
    return I;
  };
  G.itemSeen = function (id) { const I = this.items19(); if (I && !I.seen[id]) { I.seen[id] = Date.now(); WF.Profiles.save(); } };
  // 隐藏道具：条件全读现有存档字段；满足的那一刻解锁（只弹「新道具加入奖池」，不说条件）
  G.hiddenUnlocked = function (id) { const I = this.items19(); return !!(I && I.unlocked[id]); };
  G.hiddenCheck = function () {
    const pid = this.menu && this.menu.p1, P = pid && WF.Prog && WF.Prog.of(pid), I = this.items19(); if (!P || !I) return;
    const L = P.life || {}, f = L.f || {}, ach = P.ach || {};
    for (const d of C.ITEMS) {
      if (!d.hidden || I.unlocked[d.id]) continue;
      const h = d.hidden; let ok = false;
      if (h.flag) ok = !!(f[h.flag] || ach[h.flag]);
      if (h.charClear) ok = Object.values(L.charClear || {}).filter(n => n > 0).length >= h.charClear;
      if (h.correct) ok = (L.correct || 0) >= h.correct;
      if (h.maxCombo) ok = (L.maxCombo || 0) >= h.maxCombo;
      if (ok) { I.unlocked[d.id] = Date.now(); WF.Profiles.save(); if (this.camp) this.toast('新道具加入奖池', '？？？ —— 也许下一盘就能翻到', null, '#ffd23c'); this.say('隐藏道具解锁 ' + d.id); }
    }
  };

  // ================= 奖池 =================
  G.itemBlocked = function (id) {
    const cp = this.camp, d = ITEM(id); if (!d) return true;
    if (d.special || d.kind === 'debuff') return true;
    if (d.hidden && !this.hiddenUnlocked(id)) return true;
    if (cp && (cp.removed.includes(id) || cp.bans.picked.includes(id) || cp.bans.extra.includes(id))) return true;
    return false;
  };
  G.itemOwnedLv = function (id) { const it = this.camp && this.camp.items.find(i => i.id === id); return it ? it.lv : 0; };
  G.itemPool = function (tier) {
    const tiers = tier === 'rare' ? ['rare', 'curse'] : [tier];
    return C.ITEMS.filter(d => tiers.includes(d.rarity) && !this.itemBlocked(d.id) && this.itemOwnedLv(d.id) < this.itemMaxLv(d.id));
  };
  G.itemWeight = function (id) { const d = ITEM(id); return d.hidden ? K().ITEMS_V19.HIDDEN_WEIGHT : 1; };
  G.rollTier = function (w, rng) {
    const W = w || K().RARITY_W, tot = W.common + W.rare + W.legend; let r = (rng || this.rand.bind(this))() * tot;
    if ((r -= W.common) < 0) return 'common'; if ((r -= W.rare) < 0) return 'rare'; return 'legend';
  };
  G.rollItem = function (tier, exclude = [], rng) {
    const rnd = rng || this.rand.bind(this);
    const order = { common: ['common', 'rare', 'legend'], rare: ['rare', 'legend', 'common'], legend: ['legend', 'rare', 'common'] }[tier];
    for (const t of order) {
      const pool = this.itemPool(t).filter(d => !exclude.includes(d.id)); if (!pool.length) continue;
      const tot = pool.reduce((a, d) => a + this.itemWeight(d.id), 0); let r = rnd() * tot;
      for (const d of pool) { if ((r -= this.itemWeight(d.id)) < 0) return d.id; }
      return pool[pool.length - 1].id;
    }
    return null;
  };
  G.debuffPool = function () { const cp = this.camp; return C.DEBUFF_IDS.filter(id => !cp.items.some(i => i.id === id) && !cp.removed.includes(id) && !cp.bans.picked.includes(id)); };

  // ================= 拿道具：不限量 =================
  G.giveItem = function (id, why) {
    const cp = this.camp, d = ITEM(id); if (!d || !cp) return false;
    const have = cp.items.find(i => i.id === id);
    if (have) {
      if (have.lv >= this.itemMaxLv(id)) return false;
      have.lv++;
      this.toast(`升级  ${d.name}  Lv${have.lv - 1} → Lv${have.lv}`, this.itemChange(id, have.lv - 1, have.lv), id, null, true);
      cp.iconFlash = { id, t: 0 }; WF.Audio.play('lvup');
    } else {
      cp.items.push({ id, lv: 1, got: cp.items.length });
      if (d.kind === 'debuff') {
        this.toast(`霉运：${d.name}`, d.desc(), id, C.RARITY_COLOR.debuff); const t = cp.toasts[cp.toasts.length - 1]; if (t) t.life = 75;
        WF.Audio.play('wrong'); cp.maxDebuff = Math.max(cp.maxDebuff, cp.items.filter(i => isDebuff(i.id)).length);
      } else {
        this.toast(`获得  ${d.name}  Lv1`, d.desc(this.itemVal(id), 1), id);
        WF.Audio.play('pickup', { rare: d.rarity !== 'common' });
      }
      cp.iconFlash = { id, t: 0 };
      if (this.setOnGain) this.setOnGain(id);
    }
    if (id === 'glasses') this.campResetHints();
    this.itemSeen(id);
    this.say(`道具 ${why || ''} ${d.name} Lv${this.itemOwnedLv(id)}`);
    return true;
  };
  G.removeItem = function (id) {
    const cp = this.camp, k = cp.items.findIndex(i => i.id === id); if (k < 0) return false;
    cp.items.splice(k, 1); if (!cp.removed.includes(id)) cp.removed.push(id);
    if (cp.itemOff) cp.itemOff.ids = cp.itemOff.ids.filter(x => x !== id);
    if (id === 'glasses') this.campResetHints();
    return true;
  };
  G.has = function (id) { return this.lvOf(id) > 0; };
  // 不再有「背包满 → 换哪件」
  G.campMaybeSwap = function () { return false; };

  // ================= 金币 =================
  G.goldMul = function () { return R.goldMul(this.num('lucky_cat'), this.has('holey_wallet')); };
  G.addGold = function (base, why, o = {}) {
    const cp = this.camp; if (!cp) return 0;
    const n = o.raw ? Math.max(1, Math.round(base)) : R.goldAmount(base, this.diffCamp ? this.diffCamp() : 'normal', o.noCity ? null : cp.ci, this.goldMul());
    cp.gold += n; cp.goldGot += n; cp.goldFx = { t: 0, n: (cp.goldFx && cp.goldFx.t < 10 ? cp.goldFx.n : 0) + n };
    const I = this.items19(); if (I && cp.goldGot > I.maxGold) I.maxGold = cp.goldGot;
    if (o.x != null) { const f = this._goldPop; if (f && f.t === this.t) { f.n += n; f.p.text = '+' + f.n; } else { this.popWorld('+' + n, o.x, C.GROUND_Y - 40, '#ffd24a', 18); const p = this.pops[this.pops.length - 1]; p.coin = true; /* 掉落：「+n」旁边一枚转着的金币 */ this._goldPop = { t: this.t, n, p }; } }
    this.say(`金币 +${n}（${why}）余 ${cp.gold}`);
    return n;
  };
  G.spendGold = function (n, why) { const cp = this.camp; if (cp.gold < n) return false; cp.gold -= n; cp.goldSpent += n; cp.goldFx = { t: 0, n: -n }; WF.Audio.play('pickup', { rare: true }); this.say(`金币 −${n}（${why}）余 ${cp.gold}`); return true; };
  G.drawCoin = function (x, y, s = 12) {
    const c = this.ctx, small = s < 15 && WF.hasArt19('ui', 'gold_coin_12'), im = small ? WF.campImg('ui/gold_coin_12.png') : WF.hasArt19('ui', 'gold_coin') ? WF.campImg('ui/gold_coin.png') : null;
    if (im) { WF.blit19(c, im, x, y, s, s / im.naturalWidth); return; }   // 12px 手点小号给 HUD；其余 16px 按允许倍数居中
    const u = s / 12;   // 占位：像素素金币
    c.fillStyle = '#25202e'; c.fillRect(x + 3 * u, y, 6 * u, s); c.fillRect(x, y + 3 * u, s, 6 * u); c.fillRect(x + u, y + u, 10 * u, 10 * u);
    c.fillStyle = '#ffd24a'; c.fillRect(x + 3 * u, y + u, 6 * u, 10 * u); c.fillRect(x + u, y + 3 * u, 10 * u, 6 * u); c.fillRect(x + 2 * u, y + 2 * u, 8 * u, 8 * u);
    c.fillStyle = '#b8860b'; c.fillRect(x + 5 * u, y + 4 * u, 2 * u, 4 * u);
    c.fillStyle = '#fff3a0'; c.fillRect(x + 3 * u, y + 2 * u, 2 * u, 2 * u);
  };

  // ================= 掉落：小怪 4% + 金币；精英改翻牌 =================
  G.campOnEnemyDown = function (L) {
    const cp = this.camp, KC = K();
    cp.kills++;
    if (this.lvOf('sportsdrink')) this.campHeal(this.num('sportsdrink'), '电解质饮料');
    if (this.lvOf('blindbox')) {
      const [n, pHeal] = this.itemVal('blindbox'), P = this.p[0], bonus = this.setBonus ? (this.setBonus('gambler') >= 2 ? 0.05 : 0) : 0;
      if (this.rand() < pHeal + bonus) this.campHeal(n, '盲盒');
      else { const before = P.hp; P.hp = Math.max(1, P.hp - n); this.popWorld('盲盒 -' + (before - P.hp), P.x, C.GROUND_Y - 44, '#ff6a6a', 22); }
    }
    if (this.onEnemyDown19) this.onEnemyDown19(L);
    if (!L.mv.minion) return;
    const elite = !!L.mv.elite;
    if (L.mv.reporter) { this.addGold(R.int(cp.rng, ...KC.GOLD.DROP.minion), '小怪', { x: L.x }); return; }
    this.addGold(R.int(cp.rng, ...KC.GOLD.DROP[elite ? 'elite' : 'minion']), elite ? '精英' : '小怪', { x: L.x });
    if (elite) { cp.flipQueue = 'elite'; return; }   // 精英不再必掉：打完翻一盘 9 选 1（§2.1）
    if (!this.itemOwnedLv('eraser') && !cp.removed.includes('eraser') && this.rand() < KC.ERASER_P.normal) { this.giveItem('eraser', '小怪掉落'); return; }
    const boost = 1 + this.num('retake', 0);
    if (this.rand() < (KC.DROP_NORMAL + this.num('magnet')) * boost) { const id = this.rollItem('common'); if (id) this.giveItem(id, '小怪掉落'); }
  };
  // 和 campaign.js 的同名生成器一致，只多了「精英翻牌」那一段
  G.campMinionOutSeq = function* () {
    const KC = K(), cp = this.camp;
    this.state = 'minionOut'; this.pendingAttack = null; this.rumble = 0; this.darkenTarget = 0; this.banner = null;
    yield KC.MINION_OUT || 2;
    for (const M of cp.mobs || []) { if ((M.hp <= 0 || M._down) && !M._scored) { M._scored = true; this.campOnEnemyDown(M); } }
    this.ko = null;
    if (cp.flipQueue) {
      const tier = cp.flipQueue; cp.flipQueue = null;
      this.campStreetStop(); this.flipOpen(tier);
      yield () => !this.campModal();
      this.state = 'minionOut';
    }
    const n = this.campWaves();
    if (cp.wave === KC.REST_AFTER && !cp.restDone) {
      this.campStreetStop(); this.campSegClear();
      cp.restDone = true; this.campOpenRest();
      yield () => !this.campModal();
      this.state = 'minionOut'; this.campResetSegStat();
    }
    if (cp.wave >= n) {
      if (!(KC.REST_AFTER === n && cp.restDone)) this.campSegClear();
      this.campStreetToEnd();
      yield () => !this.street || this.street.phase === 'arena' || !this.street.on;
      return;
    }
    cp.wave += 1;
    this.campStreetGo('approach'); this.campSpawnApproach(cp.wave);
    yield () => this.street && this.street.phase === 'fight';
    this.newQuestion();
  };
  // 城市对手：掉金币 → 翻一盘（大档）→ 通关面板。最终 Boss 只计金币不翻牌（沿用 v1.7）
  G.campOpenPick = function () {
    const cp = this.camp;
    this.addGold(R.int(cp.rng, ...K().GOLD.DROP.opponent), '城市对手');
    this.flipOpen('city');
  };
  const baseCleared = G.campOpenCleared;
  G.campOpenCleared = function () {
    const cp = this.camp;
    if (cp && cp.city.final && !cp._finalGold) { cp._finalGold = 1; this.addGold(R.int(cp.rng, ...K().GOLD.DROP.final), '最终 Boss'); }
    return baseCleared.apply(this, arguments);
  };

  // ================= 道具栏：多行、自动换行、永不折叠 =================
  G.stripLayout = function () { return R.stripLayout(this.camp ? this.camp.items.length : 0); };
  G.stripBottom = function () { return this.stripLayout().bottom; };
  G.debuffBadgeRect = function (x, y, sc) {
    const s = 16 * sc, pad = Math.max(2, sc), W = Math.round(s + pad * 2), u = Math.max(1, Math.round(sc / 1.5));
    const k = WF.pxScale(sc), iw = Math.round(16 * k), iy = Math.round(y + pad + (s - iw) / 2);   // 图标图像的上沿（blit19 居中）
    return { x: Math.round(x + W - 8 * u), y: iy - 5 * u, w: 8 * u, h: 5 * u, u, iconTop: iy };
  };
  G.edgeBadgeRect = function (x, y, sc) { const n = Math.max(3, Math.round(sc * 2)); return { x: x + 2, y: y + 2, w: n, h: n }; };   // 双刃剑紫角（左上）
  G.iconImageRect = function (x, y, sc) { const s = 16 * sc, pad = Math.max(2, sc), k = WF.pxScale(sc), iw = Math.round(16 * k); return { x: Math.round(x + pad + (s - iw) / 2), y: Math.round(y + pad + (s - iw) / 2), w: iw, h: iw, k }; };
  G.drawItemIcon = function (id, lv, x, y, sc = 2, o = {}) {
    const d = ITEM(id), c = this.ctx, deb = d.kind === 'debuff', col = C.RARITY_COLOR[d.rarity], s = 16 * sc, pad = Math.max(2, sc);
    const W = Math.round(s + pad * 2);
    this.box(x, y, W, W, o.bg || (deb ? 'rgba(40,30,22,0.92)' : 'rgba(14,10,28,0.88)'), col, Math.max(2, Math.round(sc * 0.9)));
    const im = WF.hasItemIcon(id) ? WF.campImg('items/' + id + '.png') : null;
    c.imageSmoothingEnabled = false;
    if (im) WF.blit19(c, im, x + pad, y + pad, s, sc);   // 16px 素材：×1.5 / ×2 / ×3…，非允许倍数（如 1.75、2.5）往下取，居中
    else {   // 占位图：稀有度底色 + 名字首字（新道具第二个字也画上，避免「草稿纸 / 草…」撞字）
      c.fillStyle = { common: '#5a5670', rare: '#24508a', legend: '#8a6a1a', curse: '#5a2f8a', debuff: '#4a3c2c' }[d.rarity] || '#5a5670';
      c.fillRect(x + pad + sc, y + pad + sc, s - sc * 2, s - sc * 2);
      if (d.isNew || deb) { c.fillStyle = 'rgba(255,255,255,0.10)'; for (let k = 0; k < s - sc * 2; k += Math.max(2, sc * 2)) c.fillRect(x + pad + sc + k, y + pad + sc, Math.max(1, sc), s - sc * 2); }
      this.txt(d.name[0], x + W / 2, y + W / 2 + 1, Math.round(s * 0.62), deb ? '#e9d7a6' : '#ffffff', 'center', { sw: Math.max(2, sc), weight: 900 });
    }
    if (deb) {   // 乌云角标：贴在框的右上角、往上探出，底边不低于图标第 0 行 → 不挡图标像素（item_rules_check 按每个倍数核对）
      const b = G.debuffBadgeRect(x, y, sc), u = b.u, cx = b.x + u, cy = b.y;
      c.fillStyle = '#25202e'; c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = '#8a8fa0'; c.fillRect(cx, cy + u, 6 * u, 3 * u); c.fillRect(cx + u, cy, 3 * u, u);
    } else if (d.edge) { const e = G.edgeBadgeRect(x, y, sc); c.fillStyle = '#b36bff'; c.fillRect(e.x, e.y, e.w, e.h); }
    if (!d.noUpgrade && lv) for (let i = 0; i < lv; i++) {
      const r = Math.max(2, Math.round(sc * 1.2)), dx = x + W - pad - 2 - i * (r * 2 + 1) - r * 2, dy = y + W - pad - r * 2 - 1;
      c.fillStyle = '#120c1c'; c.fillRect(dx - 1, dy - 1, r * 2 + 2, r * 2 + 2); c.fillStyle = col; c.fillRect(dx, dy, r * 2, r * 2);
    }
    if (o.setLine && d.set && C.ITEM_SETS[d.set]) { c.fillStyle = C.ITEM_SETS[d.set].color; c.fillRect(x + 3, y + W + 1, W - 6, 2); }
    return W;
  };
  G.drawItemStrip = function () {
    const cp = this.camp, L = this.stripLayout(), c = this.ctx;
    this.stripRects = [];
    cp.items.forEach((it, i) => {
      const p = L.cells[i];
      if (this.campItemOff && this.campItemOff(it.id)) this.drawSawSlot19(p.x, p.y, p.w);
      else {
        this.drawItemIcon(it.id, it.lv, p.x, p.y, p.sc, { setLine: true });
        if (it.id === 'glasses' && it.lv >= 2) this.txt(String(cp.hintsLeft), p.x + p.w - 5, p.y + 6, 12, '#8fd0ff', 'center', { sw: 3 });
        if (cp.iconFlash && cp.iconFlash.id === it.id) this.goldFlash(p.x, p.y, p.w, cp.iconFlash.t);
      }
      this.stripRects.push({ x: p.x, y: p.y, w: p.w, h: p.w, id: it.id, lv: it.lv });
    });
    if (!cp.items.length) { c.strokeStyle = 'rgba(233,215,166,0.22)'; c.lineWidth = 1; c.strokeRect(80.5, 74.5, 35, 35); }
    if (this.drawSawStrip) this.drawSawStrip(80, 74, 10);
    // 金币：头像下方（道具栏左边空位），变化时数字放大 1.2× 0.4 秒
    const fx = cp.goldFx, k = fx && fx.t < 12 ? 1 + 0.2 * Math.sin(fx.t / 12 * Math.PI) : 1;
    if (!(fx && fx.t < 32 && WF.drawStrip19(c, 'gold_coin_spin', fx.t, 15, 80, 15))) this.drawCoin(16, 82, 12);   // 拿到 / 花掉金币：头像下的小金币转一秒（I4）
    this.txt(String(cp.gold), 32, 89, Math.round(14 * k), fx && fx.t < 12 ? (fx.n >= 0 ? '#fff3a0' : '#ff9a6a') : '#ffd24a', 'left', { sw: 3, weight: 900, maxW: 46 });
    if (this.has('holey_wallet')) { c.fillStyle = '#25202e'; c.fillRect(24, 90, 3, 3); }
    // 暂停按钮（同 v1.7）
    const PS = WF.touch ? 48 : 36, bx = C.SCREEN_W - 84 - PS, y = 74, pk = PS / 36;
    this.box(bx, y, PS, PS, 'rgba(14,10,28,0.8)', '#e9d7a6', 2);
    c.fillStyle = '#e9d7a6'; c.fillRect(bx + 12 * pk, y + 10 * pk, 4 * pk, 16 * pk); c.fillRect(bx + 20 * pk, y + 10 * pk, 4 * pk, 16 * pk);
    this.campRects.push({ x: bx, y, w: PS, h: PS, key: 'pause' });
    if (cp.mode === 'challenge') { const m = K().MODES[cp.mode]; c.fillStyle = m.color; c.fillRect(0, 0, C.SCREEN_W, 3); c.fillRect(0, C.SCREEN_H - 3, C.SCREEN_W, 3); }
    this.drawItemHover();
  };
  G.drawSawSlot19 = function (x, y, w) {
    const c = this.ctx, cp = this.camp, q = (cp.itemOff && cp.itemOff.q) || 0;
    c.fillStyle = '#1a0f16'; c.fillRect(x, y, w, w);
    c.fillStyle = '#ac252f'; c.fillRect(x, y, w, 2); c.fillRect(x, y + w - 2, w, 2); c.fillRect(x, y, 2, w); c.fillRect(x + w - 2, y, 2, w);
    this.txt(String(Math.max(1, q)), x + w / 2, y + w / 2 + 1, Math.round(w * 0.5), '#ff9a6a', 'center', { sw: 3, weight: 900 });
  };
  // 鼠标悬停（手机：长按）道具图标 → 迷你说明卡
  G.drawItemHover = function () {
    const h = this.hover19; if (!h || this.paused || this.campModal()) return;
    const r = (this.stripRects || []).find(r => h.x >= r.x && h.x <= r.x + r.w && h.y >= r.y && h.y <= r.y + r.h); if (!r) return;
    const d = ITEM(r.id), col = C.RARITY_COLOR[d.rarity], desc = this.itemDescAt(r.id, r.lv);
    const w = 300, lines = this.wrapLines(desc, w - 20, 13, 3), hh = 40 + lines.length * 18, x = Math.min(C.SCREEN_W - w - 8, r.x), y = r.y + r.h + 6;
    this.box(x, y, w, hh, 'rgba(12,8,26,0.96)', col, 2);
    this.txt(`${d.name}${d.noUpgrade ? '' : '  Lv' + r.lv}`, x + 10, y + 14, 15, col, 'left', { sw: 3, maxW: w - 90 });
    this.txt(C.RARITY_NAME[d.rarity] + (d.set ? ' · ' + C.ITEM_SETS[d.set].name : ''), x + w - 10, y + 14, 12, '#bfb3d6', 'right', { sw: 3, weight: 700 });
    lines.forEach((ln, i) => this.txt(ln, x + 10, y + 36 + i * 18, 13, '#ffffff', 'left', { sw: 3, weight: 700 }));
  };
  if (typeof window !== 'undefined') window.addEventListener('load', () => setTimeout(() => {
    const cv = document.getElementById('game'); if (!cv) return;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * C.SCREEN_W / r.width, y: (e.clientY - r.top) * C.SCREEN_H / r.height }; };
    cv.addEventListener('mousemove', e => { if (WF.game) WF.game.hover19 = pos(e); });
    cv.addEventListener('mouseleave', () => { if (WF.game) WF.game.hover19 = null; });
  }, 0));
  // 提示条跟着道具栏行数往下让
  G.drawToasts = function () {
    const cp = this.camp, modal = this.campModal() || this.state === 'result';
    const top = this.stripBottom() + 8 + (cp.itemOff ? 20 : 0);
    this._toastRects = [];
    if (WF.touch && modal) return this.drawToastsTouch();
    cp.toasts.slice(0, 2).forEach((t, i) => {
      const L = K().TOAST_TICKS, k = t.t < 5 ? t.t / 5 : t.t > L - 8 ? (L - t.t) / 8 : 1;
      const shop = this.state === 'shop', upg = this.state === 'upgrade', h = 42, w = shop ? 340 : modal ? 300 : 380;
      // 位置：战斗中在道具栏下面；商店在底部两个按钮之间；升级界面靠右下往上叠（左下是「返回」）；其他弹窗在底边左右各一条（中间是操作提示）
      const x0 = shop ? (i ? 14 : 290) : upg || (modal && i === 1) ? C.SCREEN_W - 14 - w : 14;
      // 商店：第 1 条在底部两个按钮之间，第 2 条在左上（标题那一带；I4 货架下层的格子到 y≈432，不能再往上叠）；禁用界面：网格和说明之间
      const x = x0 - (1 - Math.min(1, t.t / 5)) * 30, y = shop ? (i ? 4 : 470) : upg ? C.SCREEN_H - 56 - i * 48 : this.state === 'ban' ? 384 : modal ? C.SCREEN_H - 56 : top + i * 48;
      this.ctx.globalAlpha = Math.max(0, k);
      const col = t.color || (t.icon ? C.RARITY_COLOR[ITEM(t.icon).rarity] : '#e9d7a6');
      this._toastRects.push({ x, y, w, h });   // 给 item_rules_check 的布局自检用
      this.box(x, y, w, h, 'rgba(12,8,26,0.9)', t.lvup ? '#ffd23c' : col, 2);
      let tx = x + 12;
      if (t.icon) { this.drawItemIcon(t.icon, this.itemOwnedLv(t.icon), x + 5, y + 5, 1.75); if (t.lvup) this.goldFlash(x + 5, y + 5, 32, t.t); tx = x + 46; }
      this.txt(t.text, tx, y + 14, 15, col, 'left', { sw: 4, maxW: w - (tx - x) - 8 });
      if (t.sub) this.txt(t.sub, tx, y + 31, 12, '#ffffff', 'left', { sw: 3, weight: 700, maxW: w - (tx - x) - 8 });
      this.ctx.globalAlpha = 1;
    });
  };
  // 触屏弹窗界面的提示条：顶边那一带（各界面在 y < 92 都没有按钮）。第 1 条左上，第 2 条右上（这时「成就解锁」先等着，见 v171_ach2.js）。
  // 字 ≥ 16；副标题放不下就折两行、条变高，不缩字、不截断。
  G.drawToastsTouch = function () {
    const cp = this.camp, L = K().TOAST_TICKS, w = 470;
    let yLeft = 2;
    cp.toasts.slice(0, 2).forEach((t, i) => {
      const k = t.t < 5 ? t.t / 5 : t.t > L - 8 ? (L - t.t) / 8 : 1, tx0 = t.icon ? 46 : 12, mw = w - tx0 - 8;
      const subs = t.sub ? this.wrapLines(t.sub, mw, 16, 2) : [], h = subs.length > 1 ? 66 : 46;
      const right = i === 1, slide = (1 - Math.min(1, t.t / 5)) * 30;
      // 从里往边上滑进来，滑的时候也不出画布
      const x = right ? C.SCREEN_W - 10 - w - slide : 10 + slide, y = right ? 2 : yLeft; if (!right) yLeft += h + 4;
      this.ctx.globalAlpha = Math.max(0, k);
      const col = t.color || (t.icon ? C.RARITY_COLOR[ITEM(t.icon).rarity] : '#e9d7a6');
      this._toastRects.push({ x, y, w, h });
      this.box(x, y, w, h, 'rgba(12,8,26,0.92)', t.lvup ? '#ffd23c' : col, 2);
      if (t.icon) { this.drawItemIcon(t.icon, this.itemOwnedLv(t.icon), x + 5, y + 5, 1.75); if (t.lvup) this.goldFlash(x + 5, y + 5, 32, t.t); }
      this.txt(t.text, x + tx0, y + 14, 16, col, 'left', { sw: 4, maxW: mw });
      subs.forEach((ln, j) => this.txt(ln, x + tx0, y + 33 + j * 20, 16, '#ffffff', 'left', { sw: 3, weight: 700 }));
      this.ctx.globalAlpha = 1;
    });
  };
  const baseCU = G.campUpdate;
  G.campUpdate = function () {
    const cp = this.camp;
    if (cp && !this.paused) {
      if (cp.goldFx) cp.goldFx.t++;
      // 提示条：霉运弹窗多停一会儿（life 75 帧 ≈ 2.5 秒）：中途「冻住」t，其余照旧由 campaign.js 计时
      const inc = cp.toasts.length > 2 ? 1.5 : 1;
      for (const t of cp.toasts.slice(0, 2)) if (t.life && t.t >= 20 && (t.hold || 0) < t.life - K().TOAST_TICKS) { t.t -= inc; t.hold = (t.hold || 0) + 1; }
      if (this.t % 30 === 0) this.hiddenCheck();
    }
    const r = baseCU.apply(this, arguments);
    if (cp && !this.paused && this.campModal()) { if (this.tick19) this.tick19(); }
    return r;
  };

  // ================= 画面路由 =================
  G.drawCampOverlay = function (li) {
    const st = this.state, C2 = C;
    this.campRects = [];
    if (this.cine) this.drawCine();
    if (!this.cine && !this.campModal() && st !== 'result' && st !== 'map') this.drawItemStrip();
    if (st === 'ko' && this.ko && this.ko.winner && this.ko.winner.side === 1) {
      const mv = this.ko.winner.mv;
      if (mv.catchphrase && this.koText > 30) this.txt(mv.catchphrase, C2.SCREEN_W / 2, 380, 54, mv.catchColor || '#ffd23c', 'center', { font: '"Noto Serif","Georgia",serif', sw: 10, stroke: '#3a0d0d' });
    }
    if (st === 'rest') this.drawRest();
    if (st === 'cleared') this.drawCleared();
    if (st === 'flip') this.drawFlip();
    if (st === 'upgrade') this.drawUpgrade();
    if (st === 'shop') this.drawShop();
    if (st === 'ban') this.drawBan();
    if (!this.cine) this.drawToasts();
  };
  const baseKey = G.campKey;
  G.campKey = function (code) {
    const st = this.state;
    if (this.paused && this.camp) {
      if (/^(ArrowLeft|PageUp|KeyA)$/.test(code)) { this.pausePage(-1); return true; }
      if (/^(ArrowRight|PageDown|KeyD)$/.test(code)) { this.pausePage(1); return true; }
      return false;
    }
    if (st === 'flip') return this.flipKey(code), true;
    if (st === 'rest') return this.restKey(code), true;
    if (st === 'upgrade') return this.upgradeKey(code), true;
    if (st === 'shop') return this.shopKey(code), true;
    if (st === 'ban') return this.banKey(code), true;
    return baseKey.call(this, code);
  };
  const baseClick = G.campClick;
  G.campClick = function (x, y) {
    const st = this.state, hit = WF.pickRect ? WF.pickRect(this.campRects, x, y) : (this.campRects || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (this.paused && hit && (hit.key === 'pgprev' || hit.key === 'pgnext')) { this.pausePage(hit.key === 'pgnext' ? 1 : -1); return; }
    if (!this.paused) {
      if (st === 'flip') return this.flipClick(hit, x, y);
      if (st === 'rest') return this.restClick(hit);
      if (st === 'upgrade') return this.upgradeClick(hit);
      if (st === 'shop') return this.shopClick(hit, x, y);
      if (st === 'ban') return this.banClick(hit);
    }
    return baseClick.call(this, x, y);
  };

  // ================= 暂停：分页（8 件一页）+ 霉运页 + 套装页 + 禁用页 =================
  const RANK = { legend: 0, rare: 1, common: 2, curse: 3, debuff: 4 };
  G.pausePages = function () {
    const cp = this.camp, per = K().ITEMS_V19.PAUSE_PER_PAGE, pages = [];
    const good = cp.items.filter(i => !isDebuff(i.id)).sort((a, b) => RANK[ITEM(a.id).rarity] - RANK[ITEM(b.id).rarity] || a.got - b.got);
    const bad = cp.items.filter(i => isDebuff(i.id));
    for (let i = 0; i < good.length; i += per) pages.push({ kind: 'items', title: '道具', list: good.slice(i, i + per) });
    if (!good.length) pages.push({ kind: 'items', title: '道具', list: [] });
    for (let i = 0; i < bad.length; i += per) pages.push({ kind: 'debuff', title: '霉运', list: bad.slice(i, i + per) });
    pages.push({ kind: 'sets', title: '套装 · 本局禁用' });
    return pages;
  };
  G.pausePage = function (d) { const n = this.pausePages().length; this.pausePg = ((this.pausePg || 0) + d + n) % n; WF.Audio.play('menu'); };
  G.drawPauseItems = function () {
    const c = C, cp = this.camp, P = this.p[0], pages = this.pausePages();
    if (!this.paused) this.pausePg = 0;
    const pg = Math.min(this.pausePg || 0, pages.length - 1), page = pages[pg];
    this.campRects = [];
    this.txt('暂停', c.SCREEN_W / 2, 44, 40, '#ffd23c', 'center', { font: c.FONT_TITLE, sw: 8 });
    const nGood = cp.items.filter(i => !isDebuff(i.id)).length, nBad = cp.items.length - nGood;
    this.txt(`${K().CITY_NAMES[cp.cityId]} · 第 ${cp.ci + 1} 站 · ${cp.wave > this.campWaves() ? '城市对手' : '小怪 ' + cp.wave + '/' + this.campWaves()} · 血量 ${P.hp}/${P.maxHp} · 金币 ${cp.gold}`, 30, 82, 15, '#e9d7a6', 'left', { sw: 4, weight: 700, maxW: 640 });
    this.txt(`道具 ${nGood} 件${nBad ? ' · 霉运 ' + nBad + ' 件' : ''}`, c.SCREEN_W - 30, 82, 15, '#ffd23c', 'right', { sw: 4, weight: 700 });
    const w = 440, h = 82, x0 = 30, y0 = 100, gy = 8;
    if (page.kind === 'items' || page.kind === 'debuff') {
      if (!page.list.length) this.txt('还没有道具 —— 打倒精英和城市对手可以翻牌，小怪偶尔也会掉', c.SCREEN_W / 2, 240, 18, '#bfb3d6', 'center', { sw: 4 });
      if (page.kind === 'debuff') this.txt('霉运道具：只有坏处，不能升级；在胭脂的商店里花金币「净化」才能拿掉', c.SCREEN_W / 2, y0 - 2 + 4 * (h + gy) + 8, 13, '#a08a68', 'center', { sw: 3, weight: 700 });
      page.list.forEach((it, i) => {
        const d = ITEM(it.id), x = x0 + (i % 2) * (w + 20), y = y0 + Math.floor(i / 2) * (h + gy), col = C.RARITY_COLOR[d.rarity], max = this.itemMaxLv(it.id);
        this.box(x, y, w, h, d.kind === 'debuff' ? 'rgba(36,28,22,0.95)' : 'rgba(20,14,40,0.94)', col, 2);
        this.drawItemIcon(it.id, it.lv, x + 10, y + 21, 2, { setLine: true });
        this.txt(d.name, x + 60, y + 18, 16, col, 'left', { sw: 4, maxW: 200 });
        const tag = d.kind === 'debuff' ? '霉运' : (d.noUpgrade ? '不可升级' : `Lv${it.lv} / ${max}`) + (d.set ? ' · ' + C.ITEM_SETS[d.set].name : '') + (this.campItemOff && this.campItemOff(it.id) ? ' · 被锯中' : '');
        this.txt(tag, x + w - 12, y + 18, 13, '#ffd23c', 'right', { sw: 3, maxW: 170 });
        this.txt((d.kind === 'debuff' ? '效果：' : '现在：') + this.itemDescAt(it.id, it.lv), x + 60, y + 44, 13, '#ffffff', 'left', { sw: 3, weight: 700, maxW: w - 72 });
        let nx;
        if (d.kind === 'debuff') nx = this.debuffStatus ? this.debuffStatus(it.id) : '';
        else nx = it.lv < max ? '下一级：' + this.itemChange(it.id, it.lv, it.lv + 1) : (d.noUpgrade ? '' : '已满级');
        if (nx) this.txt(nx, x + 60, y + 66, 12, d.kind === 'debuff' ? '#e9d7a6' : it.lv < max ? '#8fd0ff' : '#7dff9a', 'left', { sw: 3, weight: 700, maxW: w - 72 });
      });
    } else this.drawPauseSets(y0);
    // 页码
    const by = 474;
    if (pages.length > 1) {
      this.box(c.SCREEN_W / 2 - 250, by - 40, 120, 32, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: c.SCREEN_W / 2 - 250, y: by - 40, w: 120, h: 32, key: 'pgprev' });
      this.txt('◀ 上一页', c.SCREEN_W / 2 - 190, by - 24, 14, '#e9d7a6', 'center', { sw: 3 });
      this.txt(`第 ${pg + 1} / ${pages.length} 页 · ${page.title}`, c.SCREEN_W / 2, by - 24, 14, '#ffd23c', 'center', { sw: 3, weight: 700 });
      this.box(c.SCREEN_W / 2 + 130, by - 40, 120, 32, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: c.SCREEN_W / 2 + 130, y: by - 40, w: 120, h: 32, key: 'pgnext' });
      this.txt('下一页 ▶', c.SCREEN_W / 2 + 190, by - 24, 14, '#e9d7a6', 'center', { sw: 3 });
    }
    this.box(c.SCREEN_W / 2 - 230, by + 2, 200, 38, 'rgba(20,14,40,0.92)', '#ffd23c', 2); this.campRects.push({ x: c.SCREEN_W / 2 - 230, y: by + 2, w: 200, h: 38, key: 'pause' });
    this.txt('继续（Esc / P）', c.SCREEN_W / 2 - 130, by + 21, 16, '#ffd23c', 'center', { sw: 4 });
    this.box(c.SCREEN_W / 2 + 30, by + 2, 200, 38, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: c.SCREEN_W / 2 + 30, y: by + 2, w: 200, h: 38, key: 'quit' });
    this.txt('返回标题（Q）', c.SCREEN_W / 2 + 130, by + 21, 16, '#e9d7a6', 'center', { sw: 4 });
    if (pages.length > 1) this.txt('← → 翻页', c.SCREEN_W - 30, by + 21, 13, '#bfb3d6', 'right', { sw: 3, weight: 700 });
  };
  G.drawPauseSets = function (y0) {
    const cp = this.camp, owned = cp.items.map(i => i.id);
    this.txt('套装（同一套拿到 2 件、3 件时各触发一次加成）', 30, y0 + 6, 16, '#ffd23c', 'left', { sw: 4 });
    Object.entries(C.ITEM_SETS).forEach(([sid, S], i) => {
      const x = 30 + (i % 2) * 460, y = y0 + 22 + Math.floor(i / 2) * 82, n = R.setCount(sid, owned);
      this.box(x, y, 440, 74, 'rgba(20,14,40,0.94)', n ? S.color : '#3a3256', 2);
      this.txt(`${S.name}  ${n}/3`, x + 12, y + 16, 15, n ? S.color : '#8a90a8', 'left', { sw: 3 });
      S.members.forEach((id, k) => this.txt(ITEM(id).name, x + 150 + k * 96, y + 16, 12, owned.includes(id) ? '#ffffff' : '#5d5f78', 'left', { sw: 3, weight: 700, maxW: 92 }));
      this.txt('2 件：' + S.b2, x + 12, y + 40, 12, n >= 2 ? '#7dff9a' : '#8a90a8', 'left', { sw: 3, weight: 700, maxW: 416 });
      this.txt('3 件：' + S.b3, x + 12, y + 60, 12, n >= 3 ? '#7dff9a' : '#8a90a8', 'left', { sw: 3, weight: 700, maxW: 416 });
    });
    const b = cp.bans, all = b.picked.concat(b.extra);
    this.txt(all.length ? `本局禁用：${b.picked.map(id => ITEM(id).name).join('、')}${b.extra.length ? '（连带：' + b.extra.map(id => ITEM(id).name).join('、') + '）' : ''}` : '本局禁用：无', 30, y0 + 22 + 3 * 82 + 10, 14, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 900 });
    if (cp.removed.length) this.txt('已拿掉（本局不再出现）：' + cp.removed.map(id => ITEM(id).name).join('、'), 30, y0 + 22 + 3 * 82 + 32, 14, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 900 });
  };

  // ================= 米雷霸「全面削减」：最多 5 件，霉运道具不锯 =================
  const baseSawBegin = G.sawBegin;
  G.sawBegin = function (A, D) {
    const cp = this.camp, bossVer = A.side === 1 && !!cp && D.side === 0;
    if (!bossVer) return baseSawBegin.apply(this, arguments);
    if (this._sawRun && this._sawRun.A === A) return;
    const S = C.ULT2.SAW;
    this._sawRun = { A, D, bossVer };
    const held = cp.items.map(i => i.id).filter(id => !this.campItemOff(id) && !isDebuff(id));
    const n = R.sawCount(held.length), pool = held.slice(), cut = [];
    for (let i = 0; i < n; i++) cut.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
    const L = this.stripLayout(), xs = L.cells.slice(0, L.per).map(p => p.x), midX = xs.length ? (xs[0] + xs[xs.length - 1] + L.cell) / 2 : 98;
    this.sawFx = { t: 0, cut, mid: (midX - 80) / 36, fly: [], keep: true, spawned: false, afA: A };
    this.afuera = null;
    this._sawRun.cut = cut; this._sawRun.held = held.length;
    const q = Math.max(0, S.DISABLE_Q - this.num('broken_saw'));
    cp.itemOff = cut.length && q > 0 ? { ids: (cp.itemOff ? cp.itemOff.ids : []).concat(cut), q } : cp.itemOff;
    WF.Audio.play('clash', { power: 1.2 }); WF.Audio.play('boom'); this.shakeAdd(14);
    this.say(`全面削减：锯掉 ${cut.length}/${held.length} 件道具 ${cut.join(',')}，${q} 题后恢复`);
    if (WF.Ach) WF.Ach.ev(this, 'sawCut', cut.length);
  };
  const baseSawTick = G.sawTick;
  G.sawTick = function () {
    const f = this.sawFx, cp = this.camp;
    if (f && cp && !f.spawned && f.t === 18) {
      f.spawned = true; const L = this.stripLayout(), midX = 80 + f.mid * 36;
      for (const id of f.cut) {
        const k = cp.items.findIndex(it => it.id === id); if (k < 0) continue; const p = L.cells[k];
        f.fly.push({ id, lv: cp.items[k].lv, x: p.x, y: p.y, vx: (p.x < midX ? -1 : 1) * (2 + Math.random() * 3), vy: -7 - Math.random() * 4 });
      }
      WF.Audio.play('whoosh');
    }
    return baseSawTick.apply(this, arguments);
  };

  // ================= 结算画面：金币一行 + 道具多行 =================
  G.drawSummaryBody = function (y0) {
    const cp = this.camp, rows = this.campSummaryRows();
    this.box(150, y0, 660, 300, 'rgba(26,18,48,0.9)', '#e9d7a6', 2);
    rows.forEach((r, i) => { const y = y0 + 28 + i * 30; this.txt(r[0], 180, y, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 }); this.txt(r[1], 400, y, 18, '#ffffff', 'right', { sw: 4 }); });
    this.txt(`金币  获得 ${cp.goldGot} · 花费 ${cp.goldSpent} · 剩余 ${cp.gold}`, 180, y0 + 172, 14, '#ffd24a', 'left', { sw: 3, weight: 700, maxW: 250 });
    const good = cp.items.filter(i => !isDebuff(i.id)).length, bad = cp.items.length - good;
    this.txt(`带着的道具 ${good} 件${bad ? ' · 霉运 ' + bad : ''}`, 440, y0 + 28, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 });
    if (!cp.items.length) this.txt('无', 440, y0 + 62, 16, '#8a90a8', 'left', { sw: 3 });
    const MAXN = 33, list = cp.items.slice(0, cp.items.length > MAXN ? MAXN - 1 : MAXN);
    list.forEach((it, i) => this.drawItemIcon(it.id, it.lv, 440 + (i % 11) * 32, y0 + 40 + Math.floor(i / 11) * 31, 1.5));
    if (cp.items.length > MAXN) this.txt(`+${cp.items.length - list.length}`, 440 + 10 * 32 + 14, y0 + 40 + 2 * 31 + 14, 14, '#ffd23c', 'center', { sw: 3 });
    this.txt('新进错题本', 180, y0 + 200, 17, '#bfb3d6', 'left', { sw: 4, weight: 700 });
    const nw = Array.from(cp.newWrong.values());
    if (!nw.length) this.txt('没有新错题，厉害！', 300, y0 + 200, 16, '#7dff9a', 'left', { sw: 3, weight: 700 });
    nw.slice(0, 6).forEach((w, i) => this.txt(`${w.word}  ${String(w.meaning || '').slice(0, 10)}`, 180 + (i % 2) * 320, y0 + 228 + Math.floor(i / 2) * 22, 15, '#ffffff', 'left', { sw: 3, weight: 700, maxW: 300 }));
    if (nw.length > 6) this.txt(`…共 ${nw.length} 个`, 790, y0 + 200, 14, '#bfb3d6', 'right', { sw: 3 });
    const Rn = cp.run;
    if (Rn) {
      const p = Rn.pts;
      this.txt(`本局积分 +${p.total}`, 440, y0 + 150, 20, '#ffd23c', 'left', { sw: 4 });
      this.txt(`累计 ${Rn.total}`, 790, y0 + 150, 16, '#ffffff', 'right', { sw: 4, weight: 700 });
      this.txt(`城市 ${p.city} · 敌人 ${p.enemy} · 正确率 ${p.acc} · 连击 ${p.combo}${p.wave ? ' · 评价 ' + p.wave : ''}${p.full ? ' · 通关 ' + p.full : ''}`, 440, y0 + 174, 13, '#bfb3d6', 'left', { sw: 3, weight: 700, maxW: 350 });
    }
  };
})();
