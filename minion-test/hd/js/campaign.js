// v1.6.2 单人闯关（肉鸽）：世界地图 → 跑街 20 只小怪（中途休息）→ 切进擂台打城市对手 → 道具三选一 → 通关
// 规则与数值见 config.js 的 CAMPAIGN / ITEMS（来源：《肉鸽闯关玩法设计 v0.4》）。所有道具都是被动生效。
(function () {
  const G = WF.Game.prototype;
  const K = () => WF.CFG.CAMPAIGN;
  const ITEM = id => WF.CFG.ITEMS.find(i => i.id === id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MODAL = ['rest', 'swap', 'review', 'pick', 'cleared'];

  // ================= 开局 / 退出 =================
  G.requestCampaign = function () {
    this.persistMenu();
    if (!this.menu.p1) { this.goProfiles(0, 'campaign'); return; }
    this.goCharSel('campaign');
  };
  G.startCampaign = function (opts = {}) {
    const C = WF.CFG, KC = K();
    if (!this.menu.p1) { this.goProfiles(0, 'campaign'); return; }
    if (this.bankGate && this.bankGate([this.banks[this.menu.bank]].concat(this.wrongBanks(WF.Profiles.wrongList(this.menu.p1, 'all'))), () => this.startCampaign(opts))) return;   // v1.8 按需词库
    if (this.campSavedCpu == null) this.campSavedCpu = this.menu.cpu;
    this.menu.cpu = true;               // 只在本局内存里用，不写回设置
    this.menu.wrongMatch = this.menu.wrongMatch && false;
    const route = this.campMakeRoute ? this.campMakeRoute(opts) : KC.ROUTE.slice();   // v1.7 随机路线
    const cityId = opts.city || route[0], city = this.campCityFor ? this.campCityFor(cityId, route) : KC.CITIES[cityId];
    this.bank = this.bankForPlay();
    this.source = WF.makeSource({ mode: 'word', bank: this.bank, rnd: this.rnd, banks: this.banks });
    const prof = WF.Profiles.get(this.menu.p1);
    const ent = prof ? WF.Profiles.wrongList(prof.id, 'all') : [];
    this.campWrongSrc = new WF.WrongSource(ent, this.source, this.banks, this.rnd);
    // v1.4：五个可选角色都能闯关（没解锁的退回苏绫）
    const charId = WF.Unlocks.has(this.menu.p1, this.menu.char) ? this.menu.char : 'suling';
    const P = new WF.Fighter(charId, 0); P.maxHp = P.hp = P.trail = KC.PLAYER_HP;
    this.p = [P, new WF.Fighter(city.normals[0], 1)];
    this.p[1].alpha = 0;
    this.camp = {
      cityId, city, wave: 0, items: [], pending: [], toasts: [], modal: null,
      fightQn: 0, eliteGuard: false, firstHit: false, domino: false,
      used: {}, correctCount: 0, hintsLeft: 0, lastWord: '', cityMissed: [], newWrong: new Map(),
      restDone: false, startT: this.t, entered: false, ci: Math.max(0, route.indexOf(cityId)), cleared: [], flashCut: 0, route, random: !!opts.random,
      playerId: charId, kills: 0, run: null, mobs: [], waveBonus: 0, waveTags: { perfect: 0, smash: 0, both: 0 }, waveStat: null,
    };
    this.campResetHints();
    // 和 startMatch 一致的战斗状态
    this.streak = [0, 0]; this.ansCombo = [0, 0]; this.queue = []; this.pops = []; WF.FX.clear();
    this.stats = [0, 1].map(() => ({ answered: 0, correct: 0, wrong: 0, fast: 0, sumT: 0, maxStreak: 0, maxCombo: 0, ults: 0, crits: 0, dmg: 0, clashWins: 0, hits: 0 }));
    this.hitstop = 0; this.hsTargets = []; this.shake = 0; this.rumble = 0; this.shakeX = 0; this.shakeY = 0;
    this.darken = 0; this.darkenTarget = 0; this.screenFlash = 0; this.slow = 0; this.excite = 0;
    this.ko = null; this.koText = 0; this.banner = null; this.announce = null; this.rating = null; this.combo = [null, null];
    this.qn = 0; this.q = null; this.clash = null; this.matchStart = null; this.matchEnd = null; this.result = null;
    this.pendingAttack = null; this.missOnly = false; this.ui.screen = 'title'; this.paused = false;
    this.cine = null; this.zoom = null; this.camLock = null; this.bars = 0; this.street = null;
    WF.Stage.loadCity(city.stage);
    if (WF.Run && WF.Run.preloadAll) WF.Run.preloadAll();
    this.campMapStart('start');
    this.say('闯关开始 城市=' + cityId, '角色=' + P.mv.name, '词库=' + (this.bank ? this.bank.name : '—'));
  };
  // v1.3 地图飞行：起飞音效 + 背景音乐（进城后接着放），落地音效在快到时
  G.campMapStart = function (from) {
    const KC = K(), cp = this.camp, M = (window.WF_CAMPAIGN_DATA || {}).map, cs = M ? M.cities : {};
    const a = cs[from], b = cs[cp.cityId], long = !!(a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 60);   // v1.7：华盛顿→南美是南北向长航线
    this.mapAnim = { t: 0, from, to: cp.cityId, long, ticks: long ? KC.MAP.longTicks : KC.MAP.ticks, landed: false };
    this.state = 'map';
    WF.Audio.stopMusic(); WF.Audio.startMusic(); WF.Audio.play('takeoff');
  };
  // v1.4 城市对手：玩家自己选了这一城的对手时，换成 MIRROR_SUB 里同体型的原版角色（血量、答题水平、进场照旧按这一城）
  G.campOppFor = function (playerId, city) {
    const KC = K(), o = city.opponent;
    if (o !== playerId) return o;
    const taken = KC.ROUTE.map(c => KC.CITIES[c].opponent);
    let sub = (KC.MIRROR_SUB || {})[playerId];
    if (!sub || sub === playerId || !window.WF_ASSETS[sub]) sub = WF.CFG.ROSTER.find(x => x !== playerId && !taken.includes(x)) || 'mrj';
    return sub;
  };
  G.campRoute = function () { return (this.camp && this.camp.route) || K().ROUTE; };
  G.campOppId = function (city) { const cp = this.camp; return this.campOppFor(cp.playerId, city || cp.city); };
  G.campCityMult = function () { return Math.pow(K().CITY_MULT, this.camp ? this.camp.ci : 0); };
  // 打完一城的三选一之后：回 30% 血 → 飞往下一城（城内状态重置，道具 / 血量 / 连击带走）
  G.campNextCity = function () {
    const KC = K(), cp = this.camp, P = this.p[0], from = cp.cityId;
    const next = this.campRoute()[cp.ci + 1]; if (!next) { this.goTitle(); return; }
    cp.cleared.push(from);
    Object.assign(cp, { cityId: next, city: this.campCityFor ? this.campCityFor(next, cp.route) : KC.CITIES[next], ci: cp.ci + 1, wave: 0, modal: null, fightQn: 0, eliteGuard: false, firstHit: false,
      cityMissed: [], restDone: false, entered: false, flashCut: 0 });
    const before = P.hp; P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * KC.CITY_HEAL)); P.trail = P.hp;
    if (P.hp > before) this.toast('转机休整', `回复 ${Math.round(KC.CITY_HEAL * 100)}% 血量（+${P.hp - before}）`, null, '#7dff9a');
    this.campResetHints();
    this.p[1] = new WF.Fighter(cp.city.normals[0], 1); this.p[1].alpha = 0;
    this.q = null; this.ko = null; this.koText = 0; this.announce = null; this.combo = [null, null]; WF.FX.clear();
    this.street = null; this.camLock = null; this.car = null; WF.Audio.setOverride(null);
    if (this.ult2Reset) this.ult2Reset();
    WF.Stage.loadCity(cp.city.stage);
    if (WF.Run) WF.Run.load(cp.city.stage || next);
    this.campMapStart(from);
    this.say(`飞往 ${KC.CITY_NAMES[next]}（第 ${cp.ci + 1} 站）血量 ${P.hp}/${P.maxHp}`);
  };
  G.campExit = function () {
    if (this.campSavedCpu != null) { this.menu.cpu = this.campSavedCpu; this.campSavedCpu = null; }
    this.camp = null; this.cine = null; this.zoom = null; this.camLock = null; this.bars = 0; this.mapAnim = null; this.street = null; this.car = null;
    WF.Audio.setOverride(null); if (this.ult2Reset) this.ult2Reset();
    WF.Stage.useProc();
  };
  G.campModal = function () { return MODAL.includes(this.state); };

  // ================= 道具 =================
  G.lvOf = function (id) { const it = this.camp && this.camp.items.find(i => i.id === id); if (it && this.campItemOff && this.campItemOff(id)) return 0; return it ? it.lv : 0; };   // v1.7：被「全面削减」锯掉的道具暂时失效
  G.itemVal = function (id) { const l = this.lvOf(id); if (!l) return null; const d = ITEM(id); return d.lv[Math.min(l, d.lv.length) - 1]; };
  G.num = function (id, k) { const v = this.itemVal(id); if (v == null) return 0; return Array.isArray(v) ? v[k || 0] : v; };
  G.itemMaxLv = function (id) { const d = ITEM(id); return d.noUpgrade ? 1 : d.lv.length; };
  // 可掉落池：某一档稀有度、没到 Lv3、不是橡皮擦（它单独算掉率）
  G.itemPool = function (tier) {
    const tiers = tier === 'rare' ? ['rare', 'curse'] : [tier];
    return WF.CFG.ITEMS.filter(d => !d.special && tiers.includes(d.rarity) && this.lvOf(d.id) < this.itemMaxLv(d.id));
  };
  G.rollTier = function (w) {
    const W = w || K().RARITY_W, tot = W.common + W.rare + W.legend; let r = this.rand() * tot;
    if ((r -= W.common) < 0) return 'common'; if ((r -= W.rare) < 0) return 'rare'; return 'legend';
  };
  G.rollItem = function (tier, exclude = []) {
    const order = { common: ['common', 'rare', 'legend'], rare: ['rare', 'legend', 'common'], legend: ['legend', 'rare', 'common'] }[tier];
    for (const t of order) {
      const pool = this.itemPool(t).filter(d => !exclude.includes(d.id));
      if (pool.length) return pool[Math.floor(this.rand() * pool.length)].id;
    }
    return null;
  };
  G.giveItem = function (id, why) {
    const cp = this.camp, d = ITEM(id); if (!d) return false;
    const have = cp.items.find(i => i.id === id);
    if (have) {
      if (have.lv >= this.itemMaxLv(id)) return false;
      have.lv++;
      this.toast(`升级  ${d.name}  Lv${have.lv - 1} → Lv${have.lv}`, this.itemChange(id, have.lv - 1, have.lv), id, null, true);
      cp.iconFlash = { id, t: 0 }; WF.Audio.play('lvup');
    } else if (cp.items.length < K().SLOTS) {
      cp.items.push({ id, lv: 1 });
      this.toast(`获得  ${d.name}  Lv1`, d.desc(this.itemVal(id), 1), id);
      if (id === 'glasses') this.campResetHints();
    } else {
      cp.pending.push(id);
      if (!this.campModal()) this.toast(`背包满了：${d.name}`, '到休息点 / 战后再决定换掉哪件', id);
      return true;
    }
    if (id === 'glasses') this.campResetHints();
    WF.Audio.play('pickup', { rare: d.rarity !== 'common' });
    this.say(`道具 ${why || ''} ${d.name} Lv${this.lvOf(id)}`);
    return true;
  };
  // v1.3 升级提示里的“具体变化”：对比两级说明文字里的数值，写成 a → b；没有数值差（纯文字档）就给新一级的说明
  G.itemChange = function (id, a, b) {
    const da = this.itemDescAt(id, a), db = this.itemDescAt(id, b), re = /[-+]?\d+(?:\.\d+)?\s*(?:%|秒|血|次|伤害)?/g;
    const na = da.match(re) || [], nb = db.match(re) || [];
    if (na.length !== nb.length || na.every((x, i) => x === nb[i])) return db;
    let i = 0; return db.replace(re, y => { const x = na[i++]; return x === y ? y : `${x.trim()} → ${y.trim()}`; });
  };
  G.toast = function (text, sub, icon, color, lvup) {
    const cp = this.camp; if (!cp) return;
    cp.toasts.push({ text, sub, icon, color, t: 0, lvup: !!lvup });
    if (cp.toasts.length > 4) cp.toasts.shift();
  };
  G.campResetHints = function () { const cp = this.camp; if (cp) cp.hintsLeft = this.lvOf('glasses') >= 2 ? this.num('glasses') : 0; };
  G.campHeal = function (n, label) {
    const P = this.p[0]; n = Math.round(n); if (n <= 0 || P.hp <= 0) return;
    const before = P.hp; P.hp = Math.min(P.maxHp, P.hp + n); P.trail = Math.max(P.trail, P.hp);
    const got = P.hp - before; if (!got) return;
    this.popWorld('+' + got, P.x, WF.CFG.GROUND_Y - 44, '#7dff9a', 24); WF.Audio.play('heal');
    if (label) this.say('回血 ' + label + ' +' + got);
  };

  // ================= 加成（被动） =================
  G.campFastS = function (s) {
    const C = WF.CFG, cap = K().CAPS, cut = this.q && this.q.flashCut || 0;
    if (s !== 0) return C.FAST_S;
    return Math.max(Math.min(cap.fastMin, C.FAST_S - cut), clamp(C.FAST_S + this.num('mint') + this.num('genius') - this.num('final_bell', 1), cap.fastMin, cap.fastMax) - cut);
  };
  G.campUltAt = function (s) { return s === 0 && this.lvOf('champ_belt') ? 4 : 5; };
  G.campCrit = function (s) { const C = WF.CFG; if (s !== 0) return C.CRIT_CHANCE; return Math.min(K().CAPS.crit, C.CRIT_CHANCE + this.num('coin') + this.num('final_bell', 0)); };
  G.campGlobalBonus = function () {
    const P = this.p[0], r = P.hp / P.maxHp; let b = this.num('hachimaki', 0);
    if (this.lvOf('adrenaline')) { if (r < 0.25) b += this.num('adrenaline', 0); else if (r > 0.5) b -= this.num('adrenaline', 1); }
    return b;
  };
  G.capBonus = function (b) { return Math.min(K().CAPS.dmg, b); };
  G.campUltDmg = function (A) {
    const C = WF.CFG; if (A.side !== 0) return C.ULT_DMG;
    const b = this.capBonus(this.campGlobalBonus() + this.num('king_bomb') + (this.lvOf('champ_belt') ? this.num('champ_belt') : 0));
    return Math.round(C.ULT_DMG * (1 + b));
  };
  G.campClashDmg = function (W) {
    const C = WF.CFG; if (W.side !== 0) return C.CLASH_DMG;
    return Math.round((C.CLASH_DMG + this.num('big_gloves')) * (1 + this.capBonus(this.campGlobalBonus())));
  };
  G.campClashAllowed = function () { const E = this.p[1]; return !(E && E.mv && E.mv.minion); }; // 小怪没有角力动作
  G.campGap = function () { const E = this.p[1]; return WF.CFG.GAP + (E && E.data && WF.isHeavy(E.data) ? 8 : 0); };
  G.campSlowKeeps = function (s) {
    if (s !== 0 || !this.lvOf('slow_shoes')) return false;
    if (this.lvOf('slow_shoes') >= 3) this.streak[s] = Math.min(this.ultAt(s) - 1, this.streak[s] + 1);
    return true;
  };
  G.campIsReporter = function (f) { return !!(f && f.side === 1 && f.mv && f.mv.reporter); };
  // 记者“出手”：不接触、不扣血，闪光 + 下一题速答窗 / 时限 -1 秒
  G.campReporterFlash = function (A, D) {
    const cp = this.camp, C = WF.CFG, photo = A.anim === 'heavy_punch';
    this.screenFlash = photo ? 5 : 2; WF.Audio.play(photo ? 'flash' : 'beep', { f: 880, d: 0.06 });
    this.popWorld(photo ? '咔嚓！' : '请问……', A.x - 4, C.GROUND_Y - 38, photo ? '#ffffff' : '#e9d7a6', 24);
    if (photo) { cp.flashCut = A.mv.reporter.fastCut || 1; this.popWorld('下一题 -1 秒', D.x, C.GROUND_Y - 28, '#ff9a6a', 18); }
    D.play('block', { to: 1, loop: false, next: 'idle' });
  };
  G.campIsMinion = function (f) {
    // 临时测试街：大师兄/相扑顶街尾时 wave>WAVES，要走对手结算，不能再当小怪刷下一只。
    if (this.camp && this.camp.wave > this.campWaves()) return false;
    return !!(f && f.side === 1 && f.mv && f.mv.minion);
  };
  G.campGuts = function (D) { return !(this.campIsMinion(D) && !K().MINION_GUTS); };
  G.campTimeout = function () { return K().Q_TIMEOUT_S - (this.q && this.q.flashCut || 0); };
  G.campCelebrateOpts = function (W) { return this.campIsMinion(W) ? { to: 11 } : {}; }; // 小怪 celebrate 第 012 帧起是继承来的白光消散，停在 011

  // 玩家出招伤害（普通 / 连击 / 慢答）。对手（陈半山）出招不改。
  G.campPlayerDmg = function (s, kind, dmg, sec) {
    const cp = this.camp, q = this.q;
    if (s === 0 && this.campIsReporter(this.p[1])) { cp.firstHit = true; return 1; } // 记者：每答对一个“挤开”一格（共 3 格）
    if (s !== 0 || !dmg) return dmg;
    let b = this.campGlobalBonus();
    const combo = /^combo/.test(kind);
    if (combo) b += this.num('wraps');
    if (kind === 'slow' && this.lvOf('slow_shoes') >= 2) b += 0.10;
    if (q && q.inBook) b += this.num('repeater');
    if (q && q.rootMatch) b += this.num('root_sheet');
    let out = dmg * (1 + this.capBonus(b));
    if (!cp.firstHit && this.lvOf('coffee')) { out += this.num('coffee'); this.popWorld('早八 +' + this.num('coffee'), this.p[1].x, WF.CFG.GROUND_Y - 50, '#ffb15a', 20); }
    cp.firstHit = true;
    if (combo && this.streak[0] >= 4) cp.domino = !!this.lvOf('domino');
    const E = this.p[1];
    if (E.mv.elite && cp.eliteGuard) {
      out *= K().ELITE_GUARD; cp.eliteGuard = false;
      this.popWorld('格挡 ½', E.x, WF.CFG.GROUND_Y - 52, '#8fd0ff', 26);
    }
    return Math.round(out);
  };
  // 小怪出手：答错 / 超时反击，精英每 3 题主动出手；不放必杀
  G.campEnemyAttack = function (s, A) {
    if (s !== 1 || !A.mv.minion) return null;
    const cp = this.camp, q = this.q, KC = K(), w = cp.wave;
    if (A.mv.reporter) return { kind: 'reporter', dmg: 0, lvl: 'reporter', crit: false, anim: q && q.playerWrong ? 'heavy_punch' : 'combo_a', block: false, kick: false, leads: null };
    let dmg = this.campWaveDmg(w), block = false;
    const wrong = q && q.playerWrong;
    if (wrong && this.lvOf('hachimaki')) dmg += this.num('hachimaki', 1);
    if (wrong && this.lvOf('helmet') && this.rand() < this.num('helmet')) {
      block = true; dmg = 0; this.popWorld('头盔挡住了！', this.p[0].x, WF.CFG.GROUND_Y - 50, '#8fd0ff', 22);
    }
    if (q && q.eliteAct && !wrong) cp.eliteGuard = true;
    let anim = A.mv.elite ? (this.rand() < 0.7 ? 'heavy_punch' : 'combo_a') : (this.rand() < 0.6 ? 'combo_a' : 'heavy_punch'), leads = null;
    // v1.2.1 出招分档：小怪只有 combo_a / heavy_punch 两招 —— 速答=刺拳接重拳，普通=重拳，慢 / 超时=刺拳
    const HT = WF.CFG.HIT_TIERS;
    if (HT && HT.campaign && q) {
      const sec = (q.first ? q.first.t : q.t) / WF.CFG.FPS, fast = this.fastS(1);
      if (block) anim = 'combo_a';
      else if (q.eliteAct || sec <= fast) { anim = 'heavy_punch'; leads = ['combo_a']; }
      else if (sec <= this.slowS()) anim = 'heavy_punch';
      else anim = 'combo_a';
      if (leads && !leads.every(a => A.has(a))) leads = null;
    }
    return { kind: block ? 'blocked' : 'minion', dmg, lvl: block ? 'block' : (A.mv.elite ? 'heavy' : 'mid'), crit: false, anim, block, kick: false, leads };
  };
  G.campTakenDmg = function (A, D, dmg) {
    if (D.side === 0) dmg *= 1 - Math.min(K().CAPS.reduce, this.num('wristguard'));
    return dmg;
  };
  G.campAfterHurt = function (A, D, dealt) {
    const ws = this.camp && this.camp.waveStat;
    if (ws && D.side === 0 && dealt > 0) ws.took = (ws.took || 0) + dealt;
    if (ws && D.side === 1 && A && A.side === 0 && D.mv && D.mv.minion && dealt > 0 && !D._chainHit) {
      ws.hits = (ws.hits || 0) + 1;
      if (D.hp <= 0 && D.hp + dealt >= D.maxHp) ws.oneShots = (ws.oneShots || 0) + 1;
    }
    if (D.side !== 0) return;
    const cp = this.camp, P = D, KC = K();
    if (P.hp <= 0 && this.lvOf('tumbler') && !cp.used.tumbler) {
      cp.used.tumbler = true; P.hp = Math.max(1, Math.round(P.maxHp * this.num('tumbler'))); P.trail = P.hp;
      this.toast('不倒翁！', `以 ${P.hp} 血站了起来（本局一次）`, 'tumbler'); WF.Audio.play('heal');
      this.popWorld('不倒翁！', P.x, WF.CFG.GROUND_Y - 50, '#ffc93c', 28);
      return;
    }
    if (P.hp <= 0) return;
    if (P.hp < P.maxHp * 0.2 && this.lvOf('firstaid') && !cp.used.firstaid) { cp.used.firstaid = true; this.campHeal(this.num('firstaid'), '急救箱'); this.toast('急救箱', `回 ${this.num('firstaid')} 血（本局一次）`, 'firstaid'); }
    if (P.hp < P.maxHp * 0.1 && this.lvOf('last_candy') && !cp.used.candy) { cp.used.candy = true; this.campHeal(this.num('last_candy'), '最后一颗糖'); this.toast('最后一颗糖', `回 ${this.num('last_candy')} 血（一次性）`, 'last_candy'); }
  };

  // ================= 出题 =================
  G.campNextQ = function () {
    const r = this.num('retake', 1);
    if (r && this.campWrongSrc && !this.campWrongSrc.useFallback && this.rand() < r) {
      const e = this.campWrongSrc.entries[Math.floor(this.rand() * this.campWrongSrc.entries.length)];
      return this.campWrongSrc.wordFrom(e);
    }
    return this.source.next();
  };
  G.campDecorateQ = function (q) {
    const cp = this.camp, prof = WF.Profiles.get(this.menu.p1);
    q.erased = null; q.hint = null; q.hintAt = null;
    if (cp.flashCut) { q.flashCut = cp.flashCut; cp.flashCut = 0; }
    if (this.lvOf('eraser') && q.options && q.options.length === 4) {
      const wrongs = [0, 1, 2, 3].filter(i => i !== q.correct);
      q.erased = wrongs[Math.floor(this.rand() * wrongs.length)];
    }
    if ((q.kind === 'word' || q.kind === 'phrase') && this.lvOf('glasses')) {
      if (q.kind === 'phrase') { q.hint = q.word.match(/[a-z]/i)?.[0] || ''; }
      else {
        if (!q.pos) { const w = this.lookupBankWord(q.bank, q.word); if (w && w.pos) q.pos = w.pos; }
        q.posHint = true;
        if (cp.hintsLeft > 0) q.hintAt = 4 * WF.CFG.FPS;
      }
    }
    q.inBook = !!(prof && (q.kind === 'phrase' && WF.Profiles.phraseMastery ? WF.Profiles.phraseMastery(prof.id, q.bank, q.word) : WF.Profiles.mastery(prof.id, q.bank, q.word)) === 'wrong');
    q.rootMatch = q.kind !== 'phrase' && this.rootMatch(cp.lastWord, q.word);
  };
  // “同词根”用一个简单判断：前 4 个字母相同，或共享 4 字母以上的常见词缀（-tion、-ment…）
  G.rootMatch = function (a, b) {
    if (!a || !b || a === b) return false; a = a.toLowerCase(); b = b.toLowerCase();
    if (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4)) return true;
    const SUF = ['tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ence', 'ance', 'ship', 'ology', 'graph', 'ful'];
    return SUF.some(x => x.length >= 4 && a.endsWith(x) && b.endsWith(x));
  };
  G.campCpuPlan = function (q, clash) {
    const E = this.p[1], ai = this.camp && this.camp.city.ai;
    if (E && !E.mv.minion && ai && !clash) {   // v1.3 城市对手各自的答题水平（金霸霸最强）
      let idx = q.correct;
      if (this.rand() >= ai.accuracy) { idx = (q.correct + 1 + Math.floor(this.rand() * 3)) % 4; if (idx === q.erased) idx = [0, 1, 2, 3].find(i => i !== q.correct && i !== q.erased); }
      q.cpu = { t: Math.round((ai.delay[0] + (ai.delay[1] - ai.delay[0]) * Math.pow(this.rand(), 1.3)) * WF.CFG.FPS), idx };
      return true;
    }
    if (!E || !E.mv.minion) return false;
    const cp = this.camp, KC = K();
    if (clash) { q.cpu = null; return true; }
    cp.fightQn++;
    if (E.mv.elite && cp.fightQn % KC.ELITE_EVERY === 0) {
      const [a, b] = KC.ELITE_ACT_S;
      q.cpu = { t: Math.round((a + (b - a) * this.rand()) * WF.CFG.FPS), idx: q.correct }; q.eliteAct = true;
    } else q.cpu = { t: Infinity, idx: q.correct };   // 只在答错 / 超时时“答对”= 反击
    return true;
  };
  G.campOnTimeout = function (q) {
    if (!q.ans[0] && this.ansCombo) this.ansCombo[0] = 0; // 超时算断连击
    const E = this.p[1];
    if (E && E.mv.minion && !q.ans[1]) { this.answer(1, q.correct); return true; }
    return false;
  };
  G.campOnAnswer = function (q, rec, was) {
    const cp = this.camp;
    if (!rec.ok) {
      q.playerWrong = true;
      if ((q.kind === 'word' || q.kind === 'phrase') && !cp.cityMissed.some(e => e.word === q.word && e.bank === q.bank && (e.kind || 'word') === q.kind)) cp.cityMissed.push({ word: q.word, bank: q.bank, meaning: q.meaning, pos: q.pos || '', kind: q.kind, phraseId: q.phraseId, fmt: q.fmt });
      if ((q.kind === 'word' || q.kind === 'phrase') && was !== 'wrong') cp.newWrong.set(q.bank + '\t' + (q.kind === 'phrase' ? 'ph:' : '') + q.word, { word: q.word, meaning: q.meaning });
    } else {
      cp.correctCount++; cp.lastWord = q.kind === 'phrase' ? null : q.word;
      if (this.lvOf('flashcard') && cp.correctCount % 15 === 0) { this.campHeal(this.num('flashcard'), '抽认卡'); this.toast('抽认卡', `又答对 15 个词，回 ${this.num('flashcard')} 血`, 'flashcard'); }
    }
  };

  // ================= 波次 / 跑街 =================
  G.campWaves = function () { return K().WAVES || 20; };
  G.campEliteAt = function () { return K().ELITE_AT || [10, 20]; };
  G.campIsEliteWave = function (w) { return this.campEliteAt().indexOf(w) >= 0; };
  G.campWaveId = function (w) {
    const c = this.camp.city;
    if (this.campIsEliteWave(w)) return c.elite;
    return c.normals[(w - 1) % c.normals.length];
  };
  // 后面的城市小怪血量 / 伤害 ×CITY_MULT^(第几站-1)；记者只有 3 格（答对 3 题）
  G.campWaveHp = function (w, id) {
    const H = K().WAVE_HP, m = this.campCityMult();
    const mid = id || this.campWaveId(w);
    if (WF.CFG.MOVES[mid].reporter) return WF.CFG.MOVES[mid].reporter.toClear;
    const elites = this.campEliteAt();
    if (mid === this.camp.city.elite && this.campIsEliteWave(w)) {
      return Math.round((w === elites[0] ? H.elite5 : H.elite10) * m);
    }
    const n = this.campWaves(), half = n / 2;
    if (w < half) {
      const last = half - 1, t = last <= 1 ? 0 : (w - 1) / (last - 1);
      return Math.round((H.a[0] + (H.a[1] - H.a[0]) * t) * m);
    }
    const first = half + 1, last = n - 1, t = last <= first ? 0 : (w - first) / (last - first);
    return Math.round((H.b[0] + (H.b[1] - H.b[0]) * t) * m);
  };
  G.campWaveDmg = function (w) {
    const D = K().WAVE_DMG, elites = this.campEliteAt(), m = this.campCityMult();
    if (w === elites[0]) return Math.round(D.elite5 * m);
    if (this.campIsEliteWave(w)) return Math.round(D.elite10 * m);
    return Math.round((w < this.campWaves() / 2 ? D.a : D.b) * m);
  };
  G.campSpawnOne = function (id, hp, x) {
    const E = new WF.Fighter(id, 1); E.maxHp = E.hp = E.trail = hp; E.x = x; E.dir = -1; E.alpha = 1;
    return E;
  };
  G.campSpawn = function (id, hp, x) {
    const E = this.campSpawnOne(id, hp, x);
    this.p[1] = E; const cp = this.camp;
    cp.mobs = [E];
    cp.fightQn = 0; cp.firstHit = false; cp.eliteGuard = !!E.mv.elite;
    this.combo[1] = null;
    return E;
  };
  G.campHome = function () {
    if (this.onStreet && this.onStreet()) return this.p[0].x;
    return clamp(this.p[0].x, 70, WF.CFG.STAGE_W - 110);
  };
  G.campLivingMobs = function () {
    return (this.camp.mobs || []).filter(m => m.hp > 0 && !m.fly && !m._down);
  };
  G.campResetSegStat = function () {
    this.camp.waveStat = { t0: this.t, took: 0, hits: 0, oneShots: 0 };
  };
  G.campStreetLen = function () {
    const R = K().RUN || {}, n = this.campWaves();
    // 只用于排布景物：实际关长由奔跑距离决定，街尾再把 prop_end 挪到玩家前方
    return (R.START || 80) + n * 70 + (R.END_PAD || 160) + 80;
  };
  G.campStartStreet = function () {
    const C = WF.CFG, P = this.p[0], cp = this.camp, R = K().RUN || {};
    const id = cp.city.stage || cp.cityId;
    const st = WF.Run.begin(id, this.campStreetLen());
    this.street = st;
    this.cam = C.VIEW_W / 2; this.camLock = null;
    if (P.clearHome) P.clearHome();
    P.x = this.streetSlot(0); P.dir = 1; P.tween = null; P.play('idle');
    this.campResetSegStat();
  };
  // 街上固定屏幕槽位：玩家在左侧约 1/3，小怪在其右侧标准间距。镜头决定槽位，槽位不决定镜头。
  G.streetSlot = function (side) {
    const C = WF.CFG, R = K().RUN || {}, slot = R.SLOT || (1 / 3);
    const cam = this.camLock != null ? this.camLock : this.cam;
    const px = cam - C.VIEW_W / 2 + C.VIEW_W * slot;
    return side === 0 ? px : px + this.gap();
  };
  G.campStreetHold = function (opts) {
    if (!(this.onStreet && this.onStreet())) return;
    const P = this.p[0], E = this.p[1], snap = !!(opts && opts.snap);
    if (P && !P.fly) {
      P.lockHome(this.streetSlot(0)); P.dir = 1;
      if (snap) { P.ox = 0; if (P.tween && P.tween.kind === 'ox') P.tween = null; }
    }
    if (E && E.hp > 0 && !E.fly && !E._down) {
      E.lockHome(this.streetSlot(1)); E.dir = -1;
      if (snap) { E.ox = 0; if (E.tween && E.tween.kind === 'ox') E.tween = null; }
    }
  };
  G.campStreetRelease = function () {
    const P = this.p[0], E = this.p[1];
    if (P && P.clearHome) P.clearHome();
    if (E && !E.fly && E.clearHome) E.clearHome();
  };
  G.campStreetBusy = function (f) {
    return !!(f && f.anim && /combo|punch|kick|upper|hyper|mega|hit|block/.test(f.anim) && !f.done);
  };
  G.campStreetGo = function (phase) {
    const P = this.p[0], R = K().RUN || {};
    if (!this.street) return;
    this.street.phase = phase || 'run';
    this.camLock = null;
    this.campStreetRelease();
    if (!this.campStreetBusy(P)) P.play(P.has('run') ? 'run' : 'walk', { loop: true, speed: R.ANIM || 1.2 });
    P.dir = 1;
  };
  G.campStreetStop = function () {
    const P = this.p[0], E = this.p[1];
    if (this.street) this.street.phase = 'fight';
    this.camLock = this.cam;
    this.campStreetHold({ snap: true });
    if (P && !this.campStreetBusy(P) && P.anim !== 'idle') P.play('idle');
    if (E && E.hp > 0 && !E.fly && E.anim === 'walk') E.play('idle');
  };
  G.campSpawnApproach = function (w) {
    const C = WF.CFG, cp = this.camp, P = this.p[0];
    const id = this.campWaveId(w), hp = this.campWaveHp(w, id);
    const start = this.cam + C.VIEW_W / 2 + 18;
    if (this.p[0] && this.p[0].clearHome) this.p[0].clearHome();
    const leftovers = (cp.mobs || []).filter(m => m.alpha > 0 && (m.fly || m._down || m.hp <= 0));
    const E = this.campSpawnOne(id, hp, start); E._wave = w;
    if (cp.domino && this.lvOf('domino')) {
      const cut = E.mv.reporter ? 1 : Math.round(E.maxHp * this.num('domino')); E.hp -= cut; E.trail = E.hp; cp.domino = false;
      this.popWorld('多米诺 -' + cut, P.x + this.gap(), C.GROUND_Y - 50, '#ffc93c', 22);
    }
    if (E.clearHome) E.clearHome();
    E.dir = -1; E.play('walk', { loop: true, speed: 1.8 });
    cp.mobs = leftovers.concat([E]);
    this.p[1] = E;
    cp.fightQn = 0; cp.firstHit = false; cp.eliteGuard = !!E.mv.elite;
    this.combo[1] = null;
    this.street.approachT = 0;
    this.campStreetGo('approach');
    this.say(`小怪 ${w}/${this.campWaves()} ${E.mv.name} HP ${E.hp}`);
    return E;
  };
  G.campStreetTick = function () {
    const st = this.street; if (!st || !st.on) return;
    const C = WF.CFG, R = K().RUN || {}, P = this.p[0];
    const spd = (R.SPEED || 60) / C.FPS;
    const moving = st.phase === 'intro' || st.phase === 'run' || st.phase === 'approach' || st.phase === 'toEnd';
    // 奔跑只推镜头，玩家钉在屏幕槽位上；对词时镜头钉住、两人钉在槽位
    if (moving && !this.campStreetBusy(P)) {
      this.cam += spd;
      if (st.fixedEntrance) this.cam = Math.min(this.cam, st.endX + C.VIEW_W * (0.5 - (R.SLOT || 1 / 3)));
      if (this.cam < C.VIEW_W / 2) this.cam = C.VIEW_W / 2;
      P.x = this.streetSlot(0); P.dir = 1; P.ox = 0; P.home = null; P.tween = (P.tween && P.tween.kind === 'ox') ? null : P.tween;
      if (P.anim !== 'run' && P.anim !== 'walk') P.play(P.has('run') ? 'run' : 'walk', { loop: true, speed: R.ANIM || 1.2 });
    }
    if (st.phase === 'approach') {
      const E = this.p[1];
      st.approachT = (st.approachT || 0) + 1;
      if (E && E.hp > 0 && !E.fly && !E._down) {
        const mspd = (R.MOB_SPEED || 60) / C.FPS;
        const slot = this.streetSlot(1);
        E.home = null;
        if (!E.tween) E.x -= mspd;
        if (E.x <= slot || st.approachT > 90) {
          E.x = slot; E.ox = 0;
          this.campSettle();
          this.campStreetStop();
        }
      }
    }
    if (st.phase === 'fight' || st.phase === 'rest' || this.state === 'rest') {
      if (this.camLock != null) this.cam = this.camLock;
      this.campStreetHold();
    }
    if (st.phase === 'toEnd' && this.cam >= (st.endCam != null ? st.endCam : st.endX)) this.campStreetFade();
    if (st.phase === 'fade') {
      st.fade++;
      if (st.fade >= (R.FADE || 10)) this.campEnterArena();
    }
    if (WF.Run) WF.Run.tick(this, st);
  };
  G.campStreetToEnd = function () {
    const R = K().RUN || {}, P = this.p[0];
    const pad = this.street.fixedEntrance ? this.street.endX - this.streetSlot(0) : R.END_PAD || 160;
    const x = this.streetSlot(0) + pad;
    if (WF.Run) WF.Run.setEnd(this.street, x);
    else this.street.endX = x;
    this.street.endCam = this.cam + pad;
    this.campStreetGo('toEnd');
    this.say('跑向擂台入口');
  };
  G.campStreetFade = function () {
    if (!this.street || this.street.phase === 'fade' || this.street.phase === 'arena') return;
    this.street.phase = 'fade'; this.street.fade = 0;
    this.camLock = this.cam;
    const P = this.p[0]; if (P) P.play('idle');
    this.screenFlash = 8;
    WF.Audio.play('whoosh');
  };
  G.campEnterArena = function () {
    const cp = this.camp, C = WF.CFG, P = this.p[0];
    if (this.street) { this.street.on = false; this.street.phase = 'arena'; }
    const hasPng = !!((window.WF_CAMPAIGN_DATA || {}).stages || {})[cp.city.stage];
    if (hasPng) { WF.Stage.useCity(cp.city.stage); if (WF.Stage.mode !== 'city') WF.Stage.loadCity(cp.city.stage, () => { if (this.camp && this.camp.city === cp.city) WF.Stage.useCity(cp.city.stage); }); }
    else WF.Stage.useTint(cp.cityId, cp.city.tint);
    if (P.clearHome) P.clearHome();
    P.x = 110; P.dir = 1; P.tween = null; P.play('idle');
    this.cam = 140; this.camLock = null;
    this.screenFlash = 10;
    this.campStartCine();
  };
  G.campCityIntroSeq = function* () {
    const KC = K(), cp = this.camp;
    this.state = 'cityIntro';
    const name = KC.CITY_NAMES[cp.cityId];
    const opp = WF.CFG.MOVES[this.campOppId()].name;
    this.announce = { text: name, sub: `第 ${cp.ci + 1} 站 · 街上 ${this.campWaves()} 个小怪，最后是${cp.city.final ? '最终 Boss ' : '城市对手 '}${opp}`, t: 0, life: 46 };
    WF.Audio.play('beep', { f: 520 }); WF.Audio.startMusic({ keep: true });
    cp.wave = 1;
    this.campStreetGo('intro');
    this.campSpawnApproach(1);
    yield () => this.street && this.street.phase === 'fight';
    this.announce = { text: 'FIGHT!', t: 0, life: 24, big: true }; WF.Audio.play('fight'); this.shakeAdd(6);
    yield 12;
    this.matchStart = this.t;
    this.newQuestion();
  };
  G.campSettle = function () {
    const P = this.p[0];
    const living = this.campLivingMobs();
    const E = living[0] || this.p[1];
    if (E && (E.anim === 'walk' || E.anim === 'run')) E.play('idle');
    if (E) { E.dir = -1; this.p[1] = E; }
    if (P) { P.dir = 1; if (P.anim === 'walk' || P.anim === 'run' || P._home) { P._home = false; P.play('idle'); } }
  };
  G.campDeathAnim = function (L) {
    // 小怪没有 back_launch_knockdown：用 knocked_down（倒地）而不是 knocked_down_death（末帧是一缕残烟）
    if (L.has('back_launch_knockdown')) return 'back_launch_knockdown';
    if (L.has('knocked_down')) return 'knocked_down';
    return 'knocked_down_death';
  };
  G.campDeathLie = function (L) {
    const name = L.has('knocked_down') ? 'knocked_down' : (L.anim || 'knocked_down_death');
    const a = L.data && L.data.anims && L.data.anims[name];
    if (!a || !a.frames || !a.frames.length) return;
    const last = a.frames.length - 1;
    if (L.anim === name && L.fi === last && L.o && L.o.hold) return;
    L.play(name, { from: last, hold: true });
  };
  G.campDeathSmoke = function (L, n) {
    const C = WF.CFG;
    const x = L.worldX ? L.worldX() : L.x;
    const y = C.GROUND_Y - 4 - (L.y || 0) * 0.15;
    if (WF.FX.smoke) WF.FX.smoke(x, y, n == null ? 6 : n);
  };
  G.campDeathHoldN = function () { const F = (WF.CFG.FEEL || {}); return F.DEATH_HOLD != null ? F.DEATH_HOLD : 18; };
  G.campDeathFadeN = function () { const F = (WF.CFG.FEEL || {}); return F.DEATH_FADE != null ? F.DEATH_FADE : 16; };
  G.campLaunch = function (L, W) {
    const F = WF.CFG.FEEL || {}, C = WF.CFG;
    L.play(this.campDeathAnim(L), { hold: true });
    L.tween = null; if (L.clearHome) L.clearHome();
    const dir = (W && L.x < W.x) ? -1 : 1;
    const vx = (F.DEATH_FLY_VX != null ? F.DEATH_FLY_VX : 3.8) * dir;
    // 把落点钳在击飞当时的镜头内，后续镜头前移时尸体会自然滚出画面
    const margin = 12;
    const cam = this.camLock != null ? this.camLock : this.cam;
    L.fly = {
      vx, vy: F.FLY_VY || 3.6, g: F.FLY_G || 0.38,
      phase: 'air', t: 0, landed: 0, wasAir: false, holdT: 0, fadeT: 0,
      xMin: cam - C.VIEW_W / 2 + margin, xMax: cam + C.VIEW_W / 2 - margin,
    };
    L._down = true;
    L.alpha = 1;
    L.deathFx = null;
  };
  G.campMinionKO = function (W, L) {
    if (!this.ko || !this.ko.minion) this.ko = { winner: W, loser: L, minion: true };
    this.matchEnd = this.t;
    L.hp = 0;
    if (!L.fly) this.campLaunch(L, W);
    this.say(`小怪倒地 ${L.mv.name}（第 ${this.camp.wave}/${this.campWaves()} 只）`);
  };
  G.campFlyTick = function () {
    const C = WF.CFG, F = C.FEEL || {}, cp = this.camp;
    if (!cp || !cp.mobs) return;
    const HOLD = this.campDeathHoldN(), FADE = this.campDeathFadeN(), BLINK = F.DEATH_BLINK != null ? F.DEATH_BLINK : 8;
    for (const E of cp.mobs) {
      if (E.fly) this.campDeathTickFly(E, HOLD, FADE, BLINK);
      else if (E.deathFx) this.campDeathTickGround(E, HOLD, FADE, BLINK);
    }
    if (cp.mobs && this.p[1]) cp.mobs = cp.mobs.filter(m => m === this.p[1] || m.alpha > 0);
  };
  G.campDeathTickFly = function (E, HOLD, FADE, BLINK) {
    const fl = E.fly;
    fl.t = (fl.t || 0) + 1;
    if (fl.xMin != null && E.x < fl.xMin) { E.x = fl.xMin; if (fl.vx < 0) fl.vx = 0; }
    if (fl.xMax != null && E.x > fl.xMax) { E.x = fl.xMax; if (fl.vx > 0) fl.vx = 0; }
    if (fl.phase === 'air' || !fl.phase) {
      fl.phase = 'air';
      if ((E.y || 0) > 0) fl.wasAir = true;
      if (fl.wasAir && (E.y || 0) === 0) {
        fl.landed = (fl.landed || 0) + 1;
        const dir = fl.vx >= 0 ? 1 : -1;
        WF.FX.dust(E.worldX ? E.worldX() : E.x, WF.CFG.GROUND_Y, dir, fl.landed === 1 ? 5 : 2);
        if (fl.landed === 1) this.shakeAdd(2);
        fl.vx *= 0.55;
        if (Math.abs(fl.vy) < 0.45) {
          fl.vy = 0; fl.vx = 0; fl.g = 0;
          fl.phase = 'hold'; fl.holdT = 0;
          this.campDeathLie(E);
        }
      }
      if (fl.t > 90 && fl.phase === 'air') { // 安全网：异常滞空则强制倒地
        E.y = 0; fl.vy = 0; fl.vx = 0; fl.g = 0;
        fl.phase = 'hold'; fl.holdT = 0; this.campDeathLie(E);
      }
      return;
    }
    if (fl.phase === 'hold') {
      E.y = 0; fl.vx = 0; fl.vy = 0; fl.g = 0;
      fl.holdT++;
      if (fl.holdT <= BLINK && fl.holdT % 2 === 0) { E.flash = 1; E.flashSeq = ['white']; }
      if (fl.holdT >= HOLD) {
        fl.phase = 'fade'; fl.fadeT = 0;
        this.campDeathSmoke(E, 7);
      }
      return;
    }
    if (fl.phase === 'fade') {
      E.y = 0; fl.vx = 0; fl.vy = 0; fl.g = 0;
      fl.fadeT++;
      E.alpha = Math.max(0, 1 - fl.fadeT / FADE);
      if (fl.fadeT === Math.max(1, Math.floor(FADE / 3))) this.campDeathSmoke(E, 4);
      if (E.alpha <= 0) { E.fly = null; E.alpha = 0; }
    }
  };
  G.campStartGroundDeath = function (L) {
    L.deathFx = { phase: 'wait', t: 0, holdT: 0, fadeT: 0 };
    L._down = true;
    L.alpha = 1;
  };
  G.campDeathTickGround = function (E, HOLD, FADE, BLINK) {
    const d = E.deathFx; if (!d) return;
    d.t = (d.t || 0) + 1;
    const settled = !E.tween && (E.done || (E.o && E.o.hold && E.fi === (E.to != null ? E.to : ((E.a && E.a.frames.length - 1) || 0))));
    if (d.phase === 'wait') {
      if (settled || d.t > 40) {
        this.campDeathLie(E);
        d.phase = 'hold'; d.holdT = 0;
      }
      return;
    }
    if (d.phase === 'hold') {
      d.holdT++;
      if (d.holdT <= BLINK && d.holdT % 2 === 0) { E.flash = 1; E.flashSeq = ['white']; }
      if (d.holdT >= HOLD) {
        d.phase = 'fade'; d.fadeT = 0;
        this.campDeathSmoke(E, 7);
      }
      return;
    }
    if (d.phase === 'fade') {
      d.fadeT++;
      E.alpha = Math.max(0, 1 - d.fadeT / FADE);
      if (d.fadeT === Math.max(1, Math.floor(FADE / 3))) this.campDeathSmoke(E, 4);
      if (E.alpha <= 0) { E.deathFx = null; E.alpha = 0; }
    }
  };
  // 击倒后立刻接着跑，下一只约 1 秒内从右边跑来；评价只在半程休息和街尾出现
  G.campMinionOutSeq = function* () {
    const KC = K(), cp = this.camp, P = this.p[0];
    this.state = 'minionOut'; this.pendingAttack = null; this.rumble = 0; this.darkenTarget = 0; this.banner = null;
    yield KC.MINION_OUT || 2;
    for (const M of cp.mobs || []) {
      if ((M.hp <= 0 || M._down) && !M._scored) { M._scored = true; this.campOnEnemyDown(M); }
    }
    this.ko = null;
    const n = this.campWaves();
    if (cp.wave === KC.REST_AFTER && !cp.restDone) {
      this.campStreetStop();
      this.campSegClear();
      cp.restDone = true; this.campOpenRest();
      yield () => !this.campModal();
      this.state = 'minionOut';
      this.campResetSegStat();
    }
    if (cp.wave >= n) {
      if (!(KC.REST_AFTER === n && cp.restDone)) this.campSegClear();
      this.campStreetToEnd();
      yield () => !this.street || this.street.phase === 'arena' || !this.street.on;
      return;
    }
    cp.wave += 1;
    this.campStreetGo('approach');
    this.campSpawnApproach(cp.wave);
    yield () => this.street && this.street.phase === 'fight';
    this.newQuestion();
  };
  G.campSegClear = function () {
    const ws = this.camp.waveStat || {}, P = WF.CFG.POINTS, F = WF.CFG.FEEL || {};
    const perfect = !ws.took;
    if (perfect) {
      const pts = P.segPerfect || P.wavePerfect || 8;
      this.rating = { text: '完美！', t: 0, life: F.WAVE_TEXT || 40, pts };
      WF.Audio.play('rating', { big: true });
      this.camp.waveBonus = (this.camp.waveBonus || 0) + pts;
      this.camp.waveTags = this.camp.waveTags || { perfect: 0 };
      this.camp.waveTags.perfect = (this.camp.waveTags.perfect || 0) + 1;
      this.say(`段落完美 +${pts}（hits ${ws.hits || 0}）`);
    } else {
      this.say(`段落结束（掉血 ${ws.took || 0}）`);
    }
  };

  G.campOnEnemyDown = function (L) {
    const cp = this.camp, KC = K(), E = ERASER_OK(this);
    cp.kills++;
    if (this.lvOf('sportsdrink')) this.campHeal(this.num('sportsdrink'), '电解质饮料');
    if (this.lvOf('blindbox')) {
      const [n, pHeal] = this.itemVal('blindbox'), P = this.p[0];
      if (this.rand() < pHeal) this.campHeal(n, '盲盒');
      else { const before = P.hp; P.hp = Math.max(1, P.hp - n); this.popWorld('盲盒 -' + (before - P.hp), P.x, WF.CFG.GROUND_Y - 44, '#ff6a6a', 22); }
    }
    if (!L.mv.minion) return;
    const elite = !!L.mv.elite, er = KC.ERASER_P[elite ? 'elite' : 'normal'];
    if (E && this.rand() < er) { this.giveItem('eraser', elite ? '精英掉落' : '小怪掉落'); return; }
    const boost = 1 + this.num('retake', 0);
    if (elite) {
      const rare = this.rand() < Math.min(1, KC.ELITE_RARE_PLUS * boost);
      const tier = rare ? (this.rand() < KC.RARITY_W.legend / (KC.RARITY_W.rare + KC.RARITY_W.legend) ? 'legend' : 'rare') : 'common';
      const id = this.rollItem(tier); if (id) this.giveItem(id, '精英掉落');
    } else if (this.rand() < KC.DROP_NORMAL * boost) {
      const id = this.rollItem('common'); if (id) this.giveItem(id, '小怪掉落');
    }
  };
  function ERASER_OK(g) { return !g.lvOf('eraser'); }

  // ================= 休息点 / 复习 / 三选一 / 替换 =================
  G.campOpenRest = function () {
    const cp = this.camp;
    const reviewList = this.campReviewList();
    cp.modal = { type: 'rest', sel: reviewList.length ? 2 : 0, reviewN: reviewList.length, t: 0 };
    this.state = 'rest'; this.campMaybeSwap();
    this.say('休息点');
  };
  G.campReviewList = function () {
    const cp = this.camp, N = K().REVIEW_N, list = cp.cityMissed.slice(-N);
    if (list.length < N && this.campWrongSrc) {
      for (const e of this.campWrongSrc.entries) { if (list.length >= N) break; if (!list.some(x => x.word === e.word && x.bank === e.bank && (x.kind || 'word') === (e.kind || 'word'))) list.push(e); }
    }
    return list;
  };
  // 背包满时先处理待换的道具
  G.campMaybeSwap = function () {
    const cp = this.camp;
    if (!cp.pending.length) return false;
    cp.swapReturn = cp.modal; cp.modal = { type: 'swap', id: cp.pending.shift(), t: 0 };
    this.state = 'swap'; return true;
  };
  G.campSwap = function (slot) {
    const cp = this.camp, m = cp.modal;
    if (slot != null && cp.items[slot]) {
      const old = ITEM(cp.items[slot].id), nw = ITEM(m.id);
      cp.items[slot] = { id: m.id, lv: 1 };
      this.toast(`换上  ${nw.name}`, `丢掉了 ${old.name}`, m.id);
      if (m.id === 'glasses' || old.id === 'glasses') this.campResetHints();
    }
    const back = cp.swapReturn; cp.swapReturn = null;
    if (this.campMaybeSwap()) { cp.swapReturn = back; return; }
    if (back && back.type === 'cleared') { this.campOpenCleared(); return; }   // v1.4：通关面板统一走这里（记积分 / 解锁）
    cp.modal = back; this.state = back ? back.type : 'minionOut';
    if (!back) cp.modal = null;
  };
  G.campRestChoose = function (i) {
    const cp = this.camp, P = this.p[0], m = cp.modal;
    if (i === 0) { this.campHeal(P.maxHp * K().REST_HEAL, '休息点'); this.toast('休息一下', `回复 ${Math.round(K().REST_HEAL * 100)}% 血量`, null, '#7dff9a'); this.campCloseModal(); }
    else if (i === 1) { const id = this.rollItem(this.rollTier()); if (id) this.giveItem(id, '休息点'); this.campCloseModal(); }
    else if (i === 2) {
      const list = this.campReviewList(); if (!list.length) return;
      const ws = new WF.WrongSource([], this.source, this.banks, this.rnd);
      cp.review = { list, i: 0, ok: 0, ws, fb: 0 };
      cp.modal = { type: 'review', t: 0 }; this.state = 'review'; this.campReviewQ();
    }
  };
  G.campCloseModal = function () {
    const cp = this.camp; cp.modal = null;
    if (this.campMaybeSwap()) { cp.swapReturn = null; return; }
    this.state = 'minionOut';
  };
  G.campReviewQ = function () {
    const cp = this.camp, r = cp.review, e = r.list[r.i];
    const q = r.ws.wordFrom(e); Object.assign(q, { t: 0, ans: [null, null], revealed: false, n: 0 });
    if (this.lvOf('eraser')) { const w = [0, 1, 2, 3].filter(i => i !== q.correct); q.erased = w[Math.floor(this.rand() * w.length)]; }
    r.q = q; r.pick = null; r.fb = 0;
  };
  G.campReviewAnswer = function (idx) {
    const cp = this.camp, r = cp.review; if (!r || r.pick != null || r.q.erased === idx) return;
    r.pick = idx; r.fb = 1; const ok = idx === r.q.correct; if (ok) r.ok++;
    WF.Audio.play(ok ? 'correct' : 'wrong');
    const prof = WF.Profiles.get(this.menu.p1); if (prof) { const was = r.q.kind === 'phrase' ? WF.Profiles.phraseMastery(prof.id, r.q.bank, r.q.word) : WF.Profiles.mastery(prof.id, r.q.bank, r.q.word); WF.Profiles.markAnswer(prof.id, r.q, ok); this.campOnAnswer(r.q, { ok }, was); }
    this.stats[0].answered++; if (ok) this.stats[0].correct++; else this.stats[0].wrong++;
  };
  G.campReviewTick = function () {
    const cp = this.camp, r = cp.review; if (!r || r.pick == null) return;
    if (++r.fb < 26) return;
    r.i++;
    if (r.i < r.list.length) { this.campReviewQ(); return; }
    const all = r.ok === r.list.length;
    if (all) { const id = this.rollItem('rare'); this.toast('复习全对！', '奖励一件稀有道具', null, '#4fa3ff'); if (id) this.giveItem(id, '复习奖励'); }
    else this.toast(`复习完成  ${r.ok} / ${r.list.length}`, '这些词已记进错题本，下次再来', null, '#e9d7a6');
    cp.review = null; this.campCloseModal();
  };
  G.campOpenPick = function () {
    const cp = this.camp, KC = K(), offers = [];
    let eraserUsed = false;
    for (let i = 0; i < 3; i++) {
      if (!eraserUsed && ERASER_OK(this) && this.rand() < KC.ERASER_P.pick) { offers.push('eraser'); eraserUsed = true; continue; }
      const id = this.rollItem(this.rollTier(), offers); if (id) offers.push(id);
    }
    cp.modal = { type: 'pick', offers, sel: 0, t: 0 };
    this.state = 'pick'; this.say('道具三选一 ' + offers.join(','));
  };
  G.campPickChoose = function (i) {
    const cp = this.camp, m = cp.modal, id = m.offers[i]; if (!id) return;
    this.giveItem(id, '对手三选一');
    cp.modal = null;
    if (this.campMaybeSwap()) { cp.swapReturn = { type: 'cleared', t: 0, final: !!cp.city.final }; return; }
    this.campOpenCleared();
  };
  G.campOpenCleared = function () {
    const cp = this.camp; cp.modal = { type: 'cleared', t: 0, final: !!cp.city.final }; this.state = 'cleared';
    const prof = WF.Profiles.get(this.menu.p1); if (prof && cp.city.final) WF.Profiles.markMatch(prof.id, true);
    if (cp.city.final) this.campRecordRun(true);
    WF.Audio.play('fight'); this.say(K().CITY_NAMES[cp.cityId] + '通关' + (cp.city.final ? '（全部通关）' : ''));
  };

  // ================= 城市对手进场镜头（数据驱动，boss 变体留给金霸霸） =================
  G.campStartCine = function (variant) {
    const C = WF.CFG, KC = K(), cp = this.camp, P = this.p[0];
    const id = this.campOppId(), mv = C.MOVES[id];
    let v = variant || (mv.boss ? 'boss' : (cp.city.cine || 'city'));
    if (v === 'car' && !(window.WF_ASSETS[id].anims.intro_car)) v = 'boss';   // 玩家自己选了马西克 → 对手换人，不开车
    const cfg = KC.CINE[v];
    WF.Audio.setOverride(cp.city.bgm && id === cp.city.opponent ? cp.city.bgm : null);   // v1.7 马西克专属 BGM
    const px = this.campHome(), ex = px + C.GAP;
    const camT = clamp((px + ex) / 2, C.VIEW_W / 2, C.STAGE_W - C.VIEW_W / 2);
    const ex2 = px + C.GAP + (WF.isHeavy(window.WF_ASSETS[id]) ? 8 : 0);
    const E = this.campSpawn(id, cp.city.opponentHp, camT + C.VIEW_W / 2 + 30);
    E.sil = 1; E.play('idle');
    if (Math.abs(P.x - px) > 0.5) { P.play(P.has('run') ? 'run' : 'walk', { loop: true, speed: 1.6 }); P.slideTo(px, 14, 'out', false); P._home = true; }
    cp.wave = this.campWaves() + 1;
    const ph = [], add = (k, n) => { if (n) ph.push({ k, a: ph.length ? ph[ph.length - 1].b : 0, b: (ph.length ? ph[ph.length - 1].b : 0) + n }); };
    add('dark', cfg.dark); add('search', cfg.search || 0); add('walk', cfg.walk); add('zoom', cfg.zoom); add('card', cfg.card); add('back', cfg.back);
    this.cine = { t: 0, v, cfg, ph, total: ph[ph.length - 1].b, E, x0: E.x, x1: ex2, camT, mv, hud: false, steps: 0 };
    if (v === 'car' && this.campCarCineInit) this.campCarCineInit();
    this.camLock = camT; this.state = 'cine'; this.q = null;
    WF.Audio.stopMusic();
    this.say(`进场镜头 ${v} ${mv.name}`);
  };
  G.cinePhase = function () { const c = this.cine; return c.ph.find(p => c.t >= p.a && c.t < p.b) || c.ph[c.ph.length - 1]; };
  G.campCineTick = function () {
    const C = WF.CFG, c = this.cine, E = c.E, P = this.p[0], cfg = c.cfg;
    if (c.v === 'car' && this.campCarCineTick) { this.campCarCineTick(); return; }
    if (c.t === 0) this.darkenTarget = 0.55;
    const ph = this.cinePhase(), k = (c.t - ph.a) / Math.max(1, ph.b - ph.a);
    if (ph.k === 'search') { this.darkenTarget = 0.7; }
    if (ph.k === 'walk') {
      if (c.t === ph.a) { E.play('walk', { loop: true }); if (P._home) { P._home = false; P.play('idle'); } }
      E.x = c.x0 + (c.x1 - c.x0) * k; E.tween = null;
      if ((c.t - ph.a) % 8 === 4) {
        this.shakeAdd(WF.isHeavy(E.data) || cfg.bigShake ? 4 : 2.5); WF.Audio.play('step');
        if (WF.isHeavy(E.data)) WF.FX.dust(E.x, C.GROUND_Y, -1, 4);
      }
    }
    if (ph.k === 'zoom') {
      if (c.t === ph.a) { E.x = c.x1; E.play(E.mv.intro && E.has(E.mv.intro) ? E.mv.intro : 'idle', { hold: true }); this.darkenTarget = 0.3; }
      const e = 1 - Math.pow(1 - k, 3);
      this.zoom = { k: e, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 22 };
      E.sil = Math.max(0, 1 - k / 0.6);
    }
    if (ph.k === 'card') {
      E.sil = 0; this.zoom = { k: 1, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 22 };
      this.bars = Math.min(1, (c.t - ph.a + 1) / 6);
      if (c.t === ph.a) {
        WF.Audio.play('drum', { big: !!cfg.bigShake }); this.shakeAdd(cfg.bigShake ? 26 : 8);
        if (cfg.gold) { WF.FX.ring(E.x, C.GROUND_Y - 20, '#ffd23c', 60, 20); this.screenFlash = 4; }
      }
    }
    if (ph.k === 'back') {
      const e = k * k; this.zoom = { k: 1 - e, z: cfg.zoomTo, fx: E.x, fy: C.GROUND_Y - 22 };
      this.bars = Math.max(0, 1 - k * 1.4); this.darkenTarget = 0; c.hud = k > 0.4;
      if (c.t === ph.a) { WF.Audio.startMusic(); c.musicOn = true; if (E.anim !== 'idle') E.play('idle'); }
    }
    c.t++;
    if (c.t >= c.total) this.campCineEnd();
  };
  G.campCineSkip = function () { if (this.cine) { if (!this.cine.musicOn) WF.Audio.startMusic(); this.cine.skipped = true; this.campCineEnd(); } };
  G.campCineEnd = function () {
    const c = this.cine, E = c.E, P = this.p[0];
    E.x = c.x1; E.tween = null; E.sil = 0; E.alpha = 1; E.dir = -1; if (E.anim !== 'idle') E.play('idle');
    this.car = null;
    if (P._home) { P._home = false; P.x = this.campHome(); P.tween = null; P.play('idle'); }
    this.zoom = null; this.bars = 0; this.darkenTarget = 0; this.cine = null; this.camLock = null;
    if (c.skipped) this.darken = 0;
    this.announce = { text: 'FIGHT!', t: 0, life: 24, big: true }; WF.Audio.play('fight');
    this.state = 'resolve';
    this.run((function* () { yield 12; this.newQuestion(); }).call(this));
  };

  // ================= 主循环钩子 =================
  G.campUpdate = function () {
    const cp = this.camp;
    if (this.paused) return false;
    if (cp.iconFlash && ++cp.iconFlash.t > 60) cp.iconFlash = null;
    // 拾取提示最多同时亮 2 条，后来的排队；排队时缩短停留，不拖节奏
    const L = K().TOAST_TICKS;
    cp.toasts.slice(0, 2).forEach(t => { t.t += cp.toasts.length > 2 ? 1.5 : 1; });
    cp.toasts = cp.toasts.filter(t => t.t < L);
    if (this.state === 'map') {
      const a = this.mapAnim; a.t++;
      if (!a.landed && a.t >= a.ticks - 22) { a.landed = true; WF.Audio.play('land'); }
      if (a.t >= a.ticks + K().MAP.hold) this.campEnterCity();
      return true;
    }
    if (this.campModal()) {
      if (cp.modal) cp.modal.t++;
      this.fighters().forEach(f => f.step()); WF.FX.update(); this.decay();
      this.campFlyTick();
      if (this.street && this.street.on && WF.Run) WF.Run.tick(this, this.street);
      if (this.state === 'review') this.campReviewTick();
      return true;
    }
    return false;
  };
  G.campTick = function () {
    this.campFlyTick();
    if (this.onStreet && this.onStreet()) this.campStreetTick();
    if (this.state === 'cine' && this.cine) this.campCineTick();
    const q = this.q, cp = this.camp;
    if (q && this.state === 'question' && q.hintAt && !q.hint && !q.ans[0] && q.t >= q.hintAt && cp.hintsLeft > 0) {
      const m = String(q.options[q.correct] || '').replace(/^[（(].*?[）)]/, '').trim();
      if (m) { q.hint = m[0]; cp.hintsLeft--; }
    }
  };
  G.campEnterCity = function () {
    const cp = this.camp;
    if (cp.entered) return; cp.entered = true;
    WF.Stage.loadCity(cp.city.stage); // 擂台图先加载，街尾再切过去
    if (WF.Run) WF.Run.load(cp.city.stage || cp.cityId);
    this.mapAnim = null; this.state = 'cityIntro';
    this.campStartStreet();
    this.run(this.campCityIntroSeq());
  };
  // v1.4 一局结束（死亡 / 全部通关）：结算积分、记通关次数、检查解锁。每局只记一次
  G.campRecordRun = function (full) {
    const cp = this.camp; if (!cp || cp.run) return cp && cp.run;
    const st = this.stats[0];
    const run = { cleared: cp.cleared.length + (full ? 1 : 0), kills: cp.kills, answered: st.answered, correct: st.correct, maxStreak: st.maxStreak, maxCombo: st.maxCombo || 0, waveBonus: cp.waveBonus || 0, waveTags: cp.waveTags, full: !!full };
    const r = WF.Unlocks.recordRun(this.menu.p1, run);
    cp.run = Object.assign({ run }, r);
    this.say(`闯关积分 +${r.pts.total}（城市 ${r.pts.city} / 敌人 ${r.pts.enemy} / 正确率 ${r.pts.acc} / 连击 ${r.pts.combo} / 评价 ${r.pts.wave || 0} / 通关 ${r.pts.full}）累计 ${r.total}`);
    this.showUnlocks(r.unlocked, this.menu.p1);
    return cp.run;
  };
  G.campShowResult = function () {
    const ko = this.ko || {}, W = ko.winner;
    if (W && W.side === 0) {     // 打倒城市对手
      this.camp.kills++;
      WF.Audio.stopMusic(); this.ko = null; this.koText = 0;
      if (this.campBeat) this.campBeat(ko.loser);
      // v1.7 修：打倒最终 Boss 后不再三选一道具（下一城已经没有了），直接进全部通关结算
      if (this.camp.city.final) { this.camp.pending = []; this.campOpenCleared(); return true; }
      this.campOpenPick();
      return true;
    }
    this.state = 'result';
    this.result = { t: 0, campaign: true, dead: true, killer: W ? W.id : null };
    const prof = WF.Profiles.get(this.menu.p1); if (prof) WF.Profiles.markMatch(prof.id, false);
    this.campRecordRun(false);
    WF.Audio.stopMusic(); this.say('闯关失败：第 ' + this.camp.wave + (this.camp.wave > this.campWaves() ? ' 场对手' : ' 只小怪'));
    return true;
  };

  // ================= 输入 =================
  G.campKey = function (code) {
    const cp = this.camp, st = this.state, m = cp && cp.modal;
    const num = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9, Numpad9: 8, Numpad0: 9, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7 }[code];
    const ok = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
    if (st === 'map') { this.campEnterCity(); return true; }
    if (st === 'cine') { this.campCineSkip(); return true; }
    if (st === 'rest') {
      if (code === 'ArrowLeft' || code === 'KeyA') { m.sel = (m.sel + 2) % 3; WF.Audio.play('menu'); }
      else if (code === 'ArrowRight' || code === 'KeyD') { m.sel = (m.sel + 1) % 3; WF.Audio.play('menu'); }
      else if (num != null && num < 3) { if (num !== 2 || m.reviewN) this.campRestChoose(num); }
      else if (ok) { if (m.sel !== 2 || m.reviewN) this.campRestChoose(m.sel); }
      return true;
    }
    if (st === 'swap') {
      if (num != null && num < cp.items.length) this.campSwap(num);
      else if (code === 'Escape') this.campSwap(null);   // v1.7：10 格，0 = 第 10 格
      return true;
    }
    if (st === 'review') { if (num != null && num < 4) this.campReviewAnswer(num); return true; }
    if (st === 'pick') {
      if (code === 'ArrowLeft' || code === 'KeyA') { m.sel = (m.sel + m.offers.length - 1) % m.offers.length; WF.Audio.play('menu'); }
      else if (code === 'ArrowRight' || code === 'KeyD') { m.sel = (m.sel + 1) % m.offers.length; WF.Audio.play('menu'); }
      else if (num != null && num < m.offers.length) this.campPickChoose(num);
      else if (ok) this.campPickChoose(m.sel);
      return true;
    }
    if (st === 'cleared') { if (code === 'Escape' || (ok && m.final)) this.goTitle(); else if (ok && m.t > 10) this.campNextCity(); return true; }
    if (st === 'result') {
      if (ok) this.startCampaign(); else if (code === 'Escape') this.goTitle();
      return true;
    }
    return false;
  };
  G.campClick = function (x, y) {
    const st = this.state;
    if (st === 'map') { this.campEnterCity(); return; }
    if (st === 'cine') { this.campCineSkip(); return; }
    const hit = WF.pickRect ? WF.pickRect(this.campRects, x, y) : (this.campRects || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (hit && hit.key === 'pause') { this.paused = !this.paused; if (this.paused) WF.Audio.stopMusic(); else WF.Audio.startMusic({ keep: true }); return; }
    if (this.paused) { if (hit && hit.key === 'quit') this.goTitle(); return; }
    if (st === 'result') { if (hit && hit.key === 'title') this.goTitle(); else this.startCampaign(); return; }
    if (st === 'cleared') { const m = this.camp.modal; if (m.final) this.goTitle(); else if (m.t > 10) this.campNextCity(); return; }
    if (!hit) return;
    if (st === 'rest' && hit.key === 'opt') { if (hit.i !== 2 || this.camp.modal.reviewN) this.campRestChoose(hit.i); }
    else if (st === 'pick' && hit.key === 'opt') this.campPickChoose(hit.i);
    else if (st === 'swap') this.campSwap(hit.key === 'slot' ? hit.i : null);
    else if (st === 'review' && hit.key === 'opt') this.campReviewAnswer(hit.i);
  };

  // ================= HUD 文字 =================
  G.campHudLine = function () {
    const cp = this.camp, name = K().CITY_NAMES[cp.cityId], w = cp.wave, E = this.p[1];
    const N = this.campWaves(), elite = this.campIsEliteWave(w);
    const what = w > N ? `${E && E.mv ? E.mv.name : '城市对手'}` : elite ? `精英 ${w}/${N}` : `小怪 ${w}/${N}`;
    return `${name} · ${what} · 第 ${this.qn} 题`;
  };
})();
