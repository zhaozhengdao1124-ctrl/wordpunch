// v1.7 成长系统：剧情模式 / 挑战模式、玩家等级 + 经验、角色天赋 + 成长（Lv1-30）、得分 + 评级、成就、炫酷通关结算。
// 数字全部在 WF.CFG.PROG 里（同步写在 standard/v1.7_系统设计.md）。存档：WF.Profiles（localStorage），字段 p.prog。
(function () {
  const C = WF.CFG, KC = C.CAMPAIGN;
  const P = C.PROG = {
    // ---- 经验 ----
    XP_CORRECT: 10,          // 每答对 1 题（中途退出也给）
    XP_CITY: 100,            // 每打通 1 城（中途退出不给）
    XP_KILL: 2,              // 每打倒 1 个敌人（中途退出不给）
    XP_FULL: 500,            // 全部通关（中途退出不给）
    PLAYER_NEED: L => 500 + 150 * (L - 1),         // 玩家等级 L → L+1 需要的经验（上限 99）
    CHAR_MAX: 30,
    CHAR_NEED: L => 2500 + 500 * (L - 1),          // v1.7.1 用户定：Lv1→2 只要 2,500（第一次全通必到 Lv2），之后每级多 500（= 第一级的 20%）；1→30 合计 275,500 ≈ 75 局全通
    CHAR_LV_PER_RUN: 2,      // 一局最多升 2 级（多出来的经验作废，停在下一级门槛前 1 点）
    MAX_GAIN: 0.30,          // Lv30 比 Lv1 强 30%（六项加成按角色偏向分配，加权平均 = 30%）
    // ---- 得分（每局；中途退出不计） ----
    SCORE: { correct: 100, fast: 50, combo: 200, ult: 500, kill: 150, city: 2000, full: 10000, accMax: 5000, noHitCity: 1500 },
    RANK: [['S', 0.95, 60000], ['A', 0.88, 40000], ['B', 0.75, 20000], ['C', 0, 0]],   // [评级, 正确率门槛, 分数门槛]
    CHALLENGE_SCORE_MULT: 1.2,   // 挑战模式（随机路线）得分 ×1.2
  };
  // ---- 六维：体力 / 力量 / 反应 / 专注 / 韧性 / 运气；每个角色的偏向权重（平均 1.0，合计 6） ----
  P.STATS = [['hp', '体力'], ['str', '力量'], ['rea', '反应'], ['foc', '专注'], ['tou', '韧性'], ['luk', '运气']];
  P.BIAS = {
    mrj:         { role: '坦克', hp: 1.8, str: 1.0, rea: 0.5, foc: 0.7, tou: 1.6, luk: 0.4 },
    suling:      { role: '速度', hp: 0.7, str: 0.9, rea: 1.9, foc: 1.1, tou: 0.6, luk: 0.8 },
    chenbanshan: { role: '反击', hp: 1.0, str: 1.3, rea: 0.9, foc: 0.8, tou: 1.4, luk: 0.6 },
    handawei:    { role: '连击', hp: 0.8, str: 1.4, rea: 1.2, foc: 1.4, tou: 0.6, luk: 0.6 },
    yukino:      { role: '暴击', hp: 0.6, str: 1.1, rea: 1.0, foc: 1.0, tou: 0.5, luk: 1.8 },
    jinbawang:   { role: '霸王', hp: 1.3, str: 1.3, rea: 0.7, foc: 1.1, tou: 1.0, luk: 0.6 },
    mileiba:     { role: '削减', hp: 0.9, str: 1.2, rea: 0.9, foc: 1.3, tou: 0.8, luk: 0.9 },
    maxike:      { role: '火力', hp: 1.2, str: 1.5, rea: 0.6, foc: 1.2, tou: 1.0, luk: 0.5 },
    margot:      { role: '博学', hp: 1.2, str: 1.0, rea: 0.6, foc: 1.3, tou: 1.4, luk: 0.5 },   // v2.2 用户 2026-11-22 拍板：慢但扛打，偏防守
  };
  // 每 1.0 的加成在战斗里折算成：体力 = 最大血量 ×(1+x)；力量 = 普通/连击/慢答/角力伤害 ×(1+x)；反应 = 速答窗口 + 2 秒 × x；
  // 专注 = 必杀伤害 ×(1+x)；韧性 = 受到伤害 ÷(1+x)；运气 = 暴击率 + 25% × x
  P.REA_S = 2, P.LUK_CRIT = 0.25;
  // ---- 天赋（Lv1 就有，不随等级变） ----
  P.TALENT = {
    mrj:         { name: '铁壁', desc: '最大血量 +15%；血量低于 30% 时伤害 +20%', hp: 0.15, lowHp: 0.30, lowDmg: 0.20 },
    suling:      { name: '疾风', desc: '速答窗口 +0.5 秒；连续 3 次速答后，下一击伤害 ×2', fast: 0.5, chain: 3, chainMult: 2 },
    chenbanshan: { name: '借力', desc: '角力胜利伤害 +30%；每个对手第一次打中你，反弹 50% 伤害', clash: 0.30, reflect: 0.5 },
    handawei:    { name: '连环', desc: '连续答对的伤害加成上限 +50% → +80%', comboCap: 0.80 },
    yukino:      { name: '冰刃', desc: '暴击率 +8%，暴击伤害 ×1.5 → ×1.8', crit: 0.08, critMult: 1.8 },
    jinbawang:   { name: '霸气', desc: '（无额外天赋，靠六维成长）' },
    mileiba:     { name: '全面削减', desc: '玩家版必杀：打碎对手护甲，对手韧性减半 3 题（受伤 ×1.5）' },
    // v2.2 玛戈天赋 A（实现在 js/v22_paris.js）：只对城市对手 / Boss，血量第一次跌到 70%、30% 各一次；两题都只出「看英文选中文」
    margot:      { name: '同词换页', desc: '城市对手 / Boss 血量跌到 70%、30% 各出两题，同一个词考两个意思，对手不抢答；全对用合书必定暴击 ×2.0，第二题答错挨反击 ×1.3',
                   pageSwap: true, at: [0.7, 0.3], psCrit: 2.0, psCounter: 1.3 },
    maxike:      { name: '星舰升空', desc: '玩家版必杀：10 秒 5 道简单题，答对越多火力越大，5/5 满伤害' },
  };
  // ---- 成就 ----
  P.ACH = [
    ['first_run', '出发！', '完成第一局闯关（倒下也算）'],
    ['city1', '第一站', '打通任意一座城市'],
    ['beat_dashixiong', '胡同之王', '打败北京城市对手'], ['beat_seoul', '首尔夜行', '打通首尔'], ['beat_tokyo', '东京塔下', '打通东京'],
    ['beat_jinbawang', '扳倒金霸霸', '打败华盛顿的金霸霸'], ['beat_mileiba', 'AFUERA！', '打败布宜诺斯艾利斯的米雷霸'], ['beat_maxike', '火箭没升空', '打败火箭基地的马西克'],
    ['story_clear', '剧情通关', '剧情模式全部通关'], ['challenge_clear', '挑战者', '挑战模式全部通关'],
    ['combo20', '二十连', '一局里连续答对 20 题'], ['combo50', '五十连', '一局里连续答对 50 题'],
    ['ult10', '必杀狂', '一局里放出 10 次必杀'], ['acc95', '神准', '全部通关且正确率 ≥ 95%'],
    ['rank_s', 'S 评级', '一局拿到 S 评级'], ['rocket_block', '全部挡住', '马西克的星舰升空答对 5/5 让它反噬'],
    ['lv10', '老手', '任意角色升到 Lv10'], ['lv30', '满级', '任意角色升到 Lv30'],
  ];
  KC.MODES = {
    story:     { name: '剧情模式', color: '#ffd23c', dark: '#5a3a00', desc: '固定路线 ' + KC.ROUTE.map(c => KC.CITY_NAMES[c]).join('→') + '（剧情以后补）' },
    challenge: { name: '挑战模式', color: '#ff5a8a', dark: '#4a0a24', desc: '随机路线 · 难度按站数递增 · 金霸霸永远压轴 · 只看分数和成就' },
  };
  KC.RANDOM = { LAST: 'washington' };   // 挑战模式：最后一站固定华盛顿（金霸霸），其余 5 城每局打乱
  // ---- 剧情钩子（剧情模式用；文案以后填，空的就不显示） ----
  KC.STORY = {};
  for (const id of KC.ROUTE) KC.STORY[id] = { intro: null, outro: null };   // intro: 进城前一句 / outro: 打通后一句；格式 { title, lines: [..] }

  // ================= 存档 =================
  const Prog = WF.Prog = {
    of(pid) {
      const p = WF.Profiles.ext(pid); if (!p) return null;
      const g = p.prog = p.prog || {};   // 原地补字段（不要换对象，外面可能还拿着旧引用）
      const def = { xp: 0, lv: 1, chars: {}, ach: {}, best: {}, runs: {}, last: null };
      for (const k in def) if (g[k] === undefined) g[k] = def[k];
      for (const m of ['story', 'challenge']) { if (typeof g.best[m] !== 'number') g.best[m] = 0; if (typeof g.runs[m] !== 'number') g.runs[m] = 0; }
      return g;
    },
    char(pid, id) { const g = this.of(pid); if (!g) return { xp: 0, lv: 1 }; const c = g.chars[id] = g.chars[id] || {}; if (!(c.lv >= 1)) c.lv = 1; if (!(c.xp >= 0)) c.xp = 0;
      // v1.7.2：旧存档按旧门槛（4000）攒的经验，换新曲线后可能超过本级门槛 → 补升级
      const lv0 = c.lv, xp0 = c.xp;
      while (c.lv < P.CHAR_MAX && c.xp >= P.CHAR_NEED(c.lv)) { c.xp -= P.CHAR_NEED(c.lv); c.lv++; }
      if (c.lv >= P.CHAR_MAX) c.xp = 0;
      if ((c.lv !== lv0 || c.xp !== xp0) && WF.Profiles && WF.Profiles.save) { try { WF.Profiles.save(); } catch (e) {} }   // 补升级后立刻写回存档
      return c; },
    // 六维加成（0~MAX_GAIN×权重）
    stats(id, lv) {
      const b = P.BIAS[id] || {}, k = (Math.min(P.CHAR_MAX, lv || 1) - 1) / (P.CHAR_MAX - 1), out = {};
      for (const [s] of P.STATS) out[s] = P.MAX_GAIN * (b[s] == null ? 1 : b[s]) * k;
      return out;
    },
    addPlayerXp(g, n) {
      const from = g.lv; g.xp += n;
      while (g.xp >= P.PLAYER_NEED(g.lv) && g.lv < 99) { g.xp -= P.PLAYER_NEED(g.lv); g.lv++; }
      return { from, to: g.lv };
    },
    addCharXp(c, n) {
      const from = c.lv; let left = n, capped = false;
      while (left > 0 && c.lv < P.CHAR_MAX) {
        const need = P.CHAR_NEED(c.lv) - c.xp;
        if (left >= need) {
          if (c.lv - from >= P.CHAR_LV_PER_RUN) { c.xp = P.CHAR_NEED(c.lv) - 1; capped = true; left = 0; break; }
          left -= need; c.xp = 0; c.lv++;
          if (c.lv - from >= P.CHAR_LV_PER_RUN) { const nd = c.lv < P.CHAR_MAX ? P.CHAR_NEED(c.lv) - 1 : 0; if (left > nd) { capped = true; left = nd; } }
        } else { c.xp += left; left = 0; }
      }
      if (c.lv >= P.CHAR_MAX) c.xp = 0;
      return { from, to: c.lv, capped };
    },
    grantAch(pid, id) { const g = this.of(pid); if (!g || g.ach[id]) return false; g.ach[id] = Date.now(); return true; },
  };
  WF.Prog.P = P;

  const G = WF.Game.prototype;
  const tal = g => (g.camp && g.camp.prog && g.camp.prog.tal) || {};
  const pst = g => (g.camp && g.camp.prog && g.camp.prog.st) || {};

  // ================= 路线：剧情（固定）/ 挑战（随机） =================
  G.campMakeRoute = function (opts) {
    if (opts.random == null) opts.random = this.menu.campMode === 'challenge';
    if (!opts.random) return KC.ROUTE.slice();
    const last = KC.RANDOM.LAST, pool = KC.ROUTE.filter(c => c !== last);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.concat([last]);
  };
  // 每一站的城市配置：挑战模式按站数取剧情路线同一站的血量 / 电脑水平（难度按站数递增），最后一站 = 最终站
  G.campCityFor = function (id, route) {
    const base = KC.CITIES[id], fixed = KC.ROUTE;
    if (!route || route.join() === fixed.join()) return base;
    const i = route.indexOf(id), slot = KC.CITIES[fixed[Math.max(0, i)]];
    return Object.assign({}, base, { opponentHp: slot.opponentHp, ai: slot.ai, final: i === route.length - 1, stop: i });
  };

  // ================= 开局：天赋 + 成长落到本局 =================
  const baseStart = G.startCampaign;
  G.startCampaign = function (opts = {}) {
    baseStart.call(this, opts);
    const cp = this.camp; if (!cp) return;
    const id = cp.playerId, c = Prog.char(this.menu.p1, id), st = Prog.stats(id, c.lv), t = P.TALENT[id] || {};
    cp.mode = cp.random ? 'challenge' : 'story';
    cp.prog = { lv: c.lv, st, tal: t, fastRun: 0, double: false, reflected: null, startXp: c.xp };
    const Pl = this.p[0], hp = Math.round(KC.PLAYER_HP * (1 + st.hp) * (1 + (t.hp || 0)));
    Pl.maxHp = Pl.hp = Pl.trail = hp;
    this.say(`本局 ${KC.MODES[cp.mode].name} 路线=${cp.route.join('→')} 角色 Lv${c.lv} 天赋=${t.name || '-'} 血量=${hp} 六维=${P.STATS.map(([s, n]) => n + '+' + Math.round(st[s] * 100) + '%').join(' ')}`);
  };
  // 速答窗口：反应 + 苏绫天赋
  const baseFast = G.campFastS;
  G.campFastS = function (s) { let v = baseFast.call(this, s); if (s === 0) v += P.REA_S * (pst(this).rea || 0) + (tal(this).fast || 0); return v; };
  const baseCrit = G.campCrit;
  G.campCrit = function (s) { let v = baseCrit.call(this, s); if (s === 0) v += P.LUK_CRIT * (pst(this).luk || 0) + (tal(this).crit || 0); return v; };
  // 暴击倍率（雪乃 ×1.8）：只在玩家出招计算伤害时临时改
  const baseBegin = G.beginAttack;
  G.beginAttack = function (s, o) {
    const t = tal(this), keep = C.CRIT_MULT;
    if (this.camp && s === 0 && t.critMult) C.CRIT_MULT = t.critMult;
    try { return baseBegin.call(this, s, o); } finally { C.CRIT_MULT = keep; }
  };
  // 连击加成上限（韩多蔚 +80%）
  const baseCombo = G.comboMult;
  G.comboMult = function (s) {
    const t = tal(this); if (!(this.camp && s === 0 && t.comboCap)) return baseCombo.call(this, s);
    const F = C.FEEL || {}, n = (this.ansCombo && this.ansCombo[s]) || 0;
    return 1 + Math.min(t.comboCap, Math.max(0, n - 1) * (F.COMBO_STEP || 0.05));
  };
  // 普通 / 连击 / 慢答伤害：力量、Mr.J 残血、苏绫三连速答后翻倍
  const basePD = G.campPlayerDmg;
  G.campPlayerDmg = function (s, kind, dmg, sec) {
    let d = basePD.call(this, s, kind, dmg, sec);
    if (s !== 0 || !d || this.campIsReporter(this.p[1])) return d;
    const cp = this.camp, pg = cp.prog, t = pg.tal, Pl = this.p[0];
    d *= 1 + (pg.st.str || 0);
    if (t.lowHp && Pl.hp / Pl.maxHp < t.lowHp) d *= 1 + t.lowDmg;
    if (t.chain) {
      if (pg.double) { d *= t.chainMult; pg.double = false; pg.fastRun = 0; this.popWorld('疾风 ×2', Pl.x, C.GROUND_Y - 50, '#7dffe0', 22); this.say('天赋 疾风：伤害 ×2'); }
      else if (sec <= this.fastS(0)) { pg.fastRun++; if (pg.fastRun >= t.chain) { pg.double = true; this.popWorld('疾风蓄满', Pl.x, C.GROUND_Y - 50, '#7dffe0', 18); } }
      else pg.fastRun = 0;
    }
    return d;
  };
  const baseUlt = G.campUltDmg;
  G.campUltDmg = function (A) { const v = baseUlt.call(this, A); return A.side === 0 ? Math.round(v * (1 + (pst(this).foc || 0))) : v; };
  const baseClash = G.campClashDmg;
  G.campClashDmg = function (W) { const v = baseClash.call(this, W); return W.side === 0 ? Math.round(v * (1 + (pst(this).str || 0)) * (1 + (tal(this).clash || 0))) : v; };
  const baseTaken = G.campTakenDmg;
  G.campTakenDmg = function (A, D, dmg) { let v = baseTaken.call(this, A, D, dmg); if (D.side === 0) v /= 1 + (pst(this).tou || 0); return v; };
  // 陈半山反弹：每个对手第一次打中他时，反弹 50%（反弹不致死，最多打到 1 血，避免反弹触发 KO 流程）
  const baseHurt = G.campAfterHurt;
  G.campAfterHurt = function (A, D, dealt) {
    baseHurt.call(this, A, D, dealt);
    const t = tal(this), pg = this.camp && this.camp.prog;
    if (!pg || !t.reflect || D.side !== 0 || !A || A.side !== 1 || dealt <= 0 || pg.reflected === A) return;
    pg.reflected = A;
    const r = Math.min(Math.round(dealt * t.reflect), Math.max(0, A.hp - 1)); if (r <= 0) return;
    A.hp -= r; A.trailHold = 13; this.stats[0].dmg += r;
    this.popWorld('借力反弹 -' + r, A.worldX(), C.GROUND_Y - 46, '#8fd0ff', 22); this.say('天赋 借力：反弹 ' + r);
  };

  // ================= 一局结束：得分 / 经验 / 等级 / 成就 =================
  G.campScore = function (full) {
    const cp = this.camp, st = this.stats[0], S = P.SCORE, acc = st.answered ? st.correct / st.answered : 0;
    const parts = {
      答对: st.correct * S.correct, 速答: st.fast * S.fast, 最高连击: (st.maxCombo || st.maxStreak) * S.combo, 必杀: st.ults * S.ult,
      打倒: cp.kills * S.kill, 城市: (cp.cleared.length + (full ? 1 : 0)) * S.city, 通关: full ? S.full : 0,
      正确率: Math.round(S.accMax * acc * Math.min(1, st.answered / 60)),
    };
    let total = Object.values(parts).reduce((a, b) => a + b, 0);
    if (cp.mode === 'challenge') total = Math.round(total * P.CHALLENGE_SCORE_MULT);
    const rank = (P.RANK.find(([, a, sc]) => acc >= a && total >= sc) || ['C'])[0];
    return { parts, total, acc, rank: full ? rank : (rank === 'S' ? 'A' : rank) };
  };
  G.campGrant = function (kind) {   // kind: 'full' | 'dead' | 'quit'
    const cp = this.camp, pid = this.menu.p1, g = Prog.of(pid); if (!cp || !g || cp.grant) return cp && cp.grant;
    const st = this.stats[0], full = kind === 'full', quit = kind === 'quit';
    const xp = st.correct * P.XP_CORRECT + (quit ? 0 : (cp.cleared.length + (full ? 1 : 0)) * P.XP_CITY + cp.kills * P.XP_KILL + (full ? P.XP_FULL : 0));
    const pl = Prog.addPlayerXp(g, xp), c = Prog.char(pid, cp.playerId), ch = Prog.addCharXp(c, xp);
    const out = { kind, xp, pl, ch, plXp: g.xp, plNeed: P.PLAYER_NEED(g.lv), chXp: c.xp, chNeed: c.lv < P.CHAR_MAX ? P.CHAR_NEED(c.lv) : 0, ach: [], score: null, best: false, mode: cp.mode };
    if (!quit) {
      const sc = this.campScore(full); out.score = sc;
      if (sc.total > (g.best[cp.mode] || 0)) { g.best[cp.mode] = sc.total; out.best = true; }
      g.runs[cp.mode] = (g.runs[cp.mode] || 0) + 1;
      const A = id => { if (Prog.grantAch(pid, id)) out.ach.push(id); };
      const beat = new Set((cp.beaten || []));
      A('first_run');
      if (cp.cleared.length + (full ? 1 : 0) >= 1) A('city1');
      const done = cp.cleared.concat(full ? [cp.cityId] : []);
      if (done.includes('beijing')) A('beat_dashixiong'); if (done.includes('seoul')) A('beat_seoul'); if (done.includes('tokyo')) A('beat_tokyo');
      if (done.includes('washington')) A('beat_jinbawang'); if (done.includes('buenosaires')) A('beat_mileiba'); if (done.includes('rocketbase')) A('beat_maxike');
      if (done.includes('pyramid')) A('beat_falaowang'); if (done.includes('shaolin')) A('beat_xuantie'); if (done.includes('foshan')) A('beat_huangshifu'); if (done.includes('paris')) A('beat_margot');   // v1.7.2 挑战城市池三城
      if (full) A(cp.mode === 'challenge' ? 'challenge_clear' : 'story_clear');
      if ((st.maxCombo || st.maxStreak) >= 20) A('combo20'); if ((st.maxCombo || st.maxStreak) >= 50) A('combo50');
      if (st.ults >= 10) A('ult10'); if (full && sc.acc >= 0.95) A('acc95'); if (full && sc.rank === 'S') A('rank_s');
      if (cp.rocketBlock) A('rocket_block');
    } else { this.say(`中途退出：只给答对经验 +${xp}（不给通关经验、不计分、不给闯关积分）`); this.quitNote = { xp, pl, ch, name: C.MOVES[cp.playerId].name, t0: this.t }; }
    if (c.lv >= 10 && Prog.grantAch(pid, 'lv10')) out.ach.push('lv10');
    if (c.lv >= 30 && Prog.grantAch(pid, 'lv30')) out.ach.push('lv30');
    g.last = { kind, xp, t: Date.now(), char: cp.playerId, lv: c.lv, score: out.score && out.score.total };
    WF.Profiles.save();
    cp.grant = out;
    this.say(`结算 ${kind} 经验 +${xp} 玩家 Lv${pl.from}→${pl.to} ${C.MOVES[cp.playerId].name} Lv${ch.from}→${ch.to}${ch.capped ? '（本局升级已封顶）' : ''}` + (out.score ? ` 得分 ${out.score.total} 评级 ${out.score.rank}${out.best ? ' 新纪录' : ''}` : '') + (out.ach.length ? ' 成就 ' + out.ach.join(',') : ''));
    return out;
  };
  const baseRecord = G.campRecordRun;
  G.campRecordRun = function (full) { const r = baseRecord.call(this, full); this.campGrant(full ? 'full' : 'dead'); return r; };
  // 中途退出（暂停菜单退出 / 通关面板 Esc）：只给答对经验，不记闯关积分
  const baseExit = G.campExit;
  G.campExit = function () { if (this.camp && !this.camp.run && !this.camp.grant && this.stats && this.stats[0].correct > 0) this.campGrant('quit'); baseExit.call(this); };
  // 星舰升空 5/5 挡下 → 成就
  const baseRocketAns = G.answerRocket;
  G.answerRocket = function (s, idx) { baseRocketAns.call(this, s, idx); const rk = this.rocket; if (this.camp && rk && rk.mode === 'boss' && rk.correct >= C.ULT2.ROCKET.QUESTIONS) this.camp.rocketBlock = true; };

  // ================= 剧情钩子 =================
  G.campStory = function (when) {
    const cp = this.camp; if (!cp || cp.mode !== 'story') return null;
    const s = (KC.STORY[cp.cityId] || {})[when];
    if (s && s.lines && s.lines.length) { this.toast(s.title || KC.CITY_NAMES[cp.cityId], s.lines.join(' '), null, '#ffd23c'); return s; }
    return null;
  };
  const baseEnter = G.campEnterCity;
  G.campEnterCity = function () { const was = this.camp && this.camp.entered; baseEnter.call(this); if (!was) this.campStory('intro'); };
  const baseCleared = G.campOpenCleared;
  G.campOpenCleared = function () { baseCleared.call(this); this.campStory('outro'); };

  // ================= 选角界面：模式切换 + 等级 / 天赋 =================
  try { const m = localStorage.getItem('wf_campmode'); if (m === 'story' || m === 'challenge') WF.__campMode = m; } catch (e) {}
  G.toggleCampMode = function (to) {
    this.menu.campMode = to || (this.menu.campMode === 'challenge' ? 'story' : 'challenge');
    try { localStorage.setItem('wf_campmode', this.menu.campMode); } catch (e) {}
    WF.Audio.play('menu');
  };
  const baseCS = G.drawCharSel;
  G.drawCharSel = function () {
    if (!this.menu.campMode) this.menu.campMode = WF.__campMode || 'story';
    baseCS.call(this);
    if (this.charselMode() !== 'camp') return;
    const c = this.ctx, pid = this.charselPid(), g = Prog.of(pid), R = C.ROSTER, M = KC.MODES;
    // 顶部：两个模式按钮（剧情金色 / 挑战粉红）
    c.fillStyle = 'rgba(6,3,16,0.92)'; c.fillRect(110, 62, C.SCREEN_W - 220, 34);
    ['story', 'challenge'].forEach((k, i) => {
      const on = this.menu.campMode === k, m = M[k], x = C.SCREEN_W / 2 - 250 + i * 256, w = 244;
      this.box(x, 64, w, 30, on ? m.dark : 'rgba(20,14,40,0.85)', on ? m.color : '#5d4f86', on ? 3 : 2);
      const best = g ? g.best[k] || 0 : 0;
      this.txt(`${m.name}${best ? '  最高 ' + best : ''}`, x + w / 2, 80, 16, on ? m.color : '#8f86b8', 'center', { sw: 4, weight: 700 });
      this.menuRects.push({ x, y: 64, w, h: 30, key: 'campmode', i, mode: k });
    });
    // 卡片里：角色等级 + 定位
    const gap = R.length > 5 ? 8 : 10, w = Math.min(172, Math.floor((C.SCREEN_W - 24 - gap * (R.length - 1)) / R.length)), x0 = (C.SCREEN_W - (w * R.length + gap * (R.length - 1))) / 2, y = 104;
    R.forEach((id, i) => {
      if (!WF.Unlocks.has(pid, id)) return;
      const ch = Prog.char(pid, id), b = P.BIAS[id] || {};
      this.txt(`Lv${ch.lv} · ${b.role || ''}`, x0 + i * (w + gap) + w / 2, y + 229, 13, ch.lv >= P.CHAR_MAX ? '#ffd23c' : '#8fd0ff', 'center', { sw: 3, weight: 700, maxW: w - 8 });
    });
    const id = R[this.ui.sel], t = P.TALENT[id], m = M[this.menu.campMode];
    if (WF.Unlocks.has(pid, id) && !(this.ui.deny && this.t - this.ui.deny.t < 50)) {
      const ch = Prog.char(pid, id), st = Prog.stats(id, ch.lv);
      this.txt(`天赋「${t ? t.name : '-'}」${t ? t.desc : ''}  ·  Lv${ch.lv}：${P.STATS.map(([s, n]) => n + '+' + Math.round(st[s] * 100) + '%').join(' ')}`, C.SCREEN_W / 2, 476, 13, '#7dffe0', 'center', { sw: 3, weight: 700, maxW: C.SCREEN_W - 140 });
    }
    c.fillStyle = 'rgba(20,14,40,1)'; c.fillRect(64, 442, C.SCREEN_W - 128, 22);
    this.txt(`${m.name}：${m.desc}  ·  R 切换${g ? '  ·  玩家 Lv' + g.lv : ''}`, C.SCREEN_W / 2, 453, 14, m.color, 'center', { sw: 3, weight: 700, maxW: C.SCREEN_W - 140 });
  };

  // ================= 战斗中：挑战模式的标识色 =================
  const baseStrip = G.drawItemStrip;
  G.drawItemStrip = function () {
    baseStrip.call(this);
    const cp = this.camp; if (!cp || !cp.mode) return;
    const m = KC.MODES[cp.mode];
    if (cp.mode === 'challenge') { const c = this.ctx; c.fillStyle = m.color; c.fillRect(0, 0, C.SCREEN_W, 3); c.fillRect(0, C.SCREEN_H - 3, C.SCREEN_W, 3); }
  };

  // ================= 结算画面 =================
  const ACHN = id => (P.ACH.find(a => a[0] === id) || [id, id])[1];
  G.drawGrantPanel = function (gr, x, y, w, t) {
    if (!gr) return;
    const c = this.ctx, k = Math.min(1, t / 50);
    // 玩家经验条 + 角色经验条
    const bar = (label, lv, from, xp, need, yy, col) => {
      this.txt(label, x, yy, 15, '#bfb3d6', 'left', { sw: 3, weight: 700 });
      const bx = x + 150, bw = w - 260;
      c.fillStyle = '#120c1c'; c.fillRect(bx, yy - 8, bw, 16); c.fillStyle = '#2a2440'; c.fillRect(bx + 2, yy - 6, bw - 4, 12);
      const f = need ? Math.min(1, xp / need) * k : 1; c.fillStyle = col; c.fillRect(bx + 2, yy - 6, Math.round((bw - 4) * f), 12);
      const up = lv > from;
      this.txt(up ? `Lv${from} → Lv${lv}` : `Lv${lv}`, x + w, yy, 16, up && (t >> 3) % 2 ? '#ffffff' : col, 'right', { sw: 4 });
      if (up && t > 50) this.txt('LEVEL UP!', bx + bw / 2, yy + 1, 13, (t >> 2) % 2 ? '#ffd23c' : '#ffffff', 'center', { sw: 4 });
    };
    this.txt(`经验 +${Math.round(gr.xp * k)}`, x, y, 18, '#7dff9a', 'left', { sw: 4 });
    bar('玩家等级', gr.pl.to, gr.pl.from, gr.plXp, gr.plNeed, y + 28, '#8fd0ff');
    bar(C.MOVES[this.camp.playerId].name + ' 等级', gr.ch.to, gr.ch.from, gr.chXp, gr.chNeed, y + 56, '#7dffe0');
    if (gr.ch.capped) this.txt('（一局最多升 2 级）', x + w, y + 74, 11, '#bfb3d6', 'right', { sw: 3 });
    if (gr.ach.length) this.txt('新成就：' + gr.ach.map(ACHN).join('、'), x, y + 92, 15, '#ffd23c', 'left', { sw: 4, maxW: w, weight: 700 });
  };
  const baseDC = G.drawCleared;
  G.drawCleared = function () {
    const m = this.camp.modal; if (!m.final) return baseDC.call(this);
    const cp = this.camp, gr = cp.grant, t = m.t, c = this.ctx, mode = KC.MODES[cp.mode || 'story'];
    this.campDim(Math.min(0.9, t / 12));
    // 烟花（实心像素块）
    if (!this._fw || t === 0) this._fw = [];
    if (t % 9 === 0 && this._fw.length < 30) { const cx = 120 + Math.random() * (C.SCREEN_W - 240), cy = 60 + Math.random() * 160, col = ['#ffd23c', '#ff5a8a', '#7dffe0', '#8fd0ff', '#ffffff'][Math.floor(Math.random() * 5)]; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; this._fw.push({ x: cx, y: cy, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, l: 30, col }); } WF.Audio.play('beep', { f: 300 + Math.random() * 400, d: 0.05 }); }
    this._fw = this._fw.filter(p => (p.x += p.vx, p.y += p.vy, p.vy += 0.08, --p.l) > 0);
    for (const p of this._fw) { c.fillStyle = p.col; c.fillRect(Math.round(p.x), Math.round(p.y), 4, 4); }
    const s = t < 8 ? 1.7 - t * 0.085 : 1;
    this.txt(cp.mode === 'challenge' ? '挑战模式 · 全部通关！' : '世界巡回 · 全部通关！', C.SCREEN_W / 2, 52, Math.round(50 * s), mode.color, 'center', { font: C.FONT_TITLE, sw: 11, stroke: mode.dark });
    this.txt(`${this.campRoute().map(id => KC.CITY_NAMES[id]).join(' ✓ ')} ✓`, C.SCREEN_W / 2, 98, 15, '#e9d7a6', 'center', { sw: 4, weight: 700, maxW: 900 });
    const sc = gr && gr.score;
    if (sc) {
      // 评级大字（第 20 帧砸下来）
      if (t >= 20) { const k = Math.max(1, 3 - (t - 20) * 0.3); this.txt(sc.rank, 150, 210, Math.round(120 * k), { S: '#ffd23c', A: '#ff5a8a', B: '#8fd0ff', C: '#bfb3d6' }[sc.rank], 'center', { font: C.FONT_TITLE, sw: 12, stroke: '#3a0d0d' }); if (t === 20) { this.shakeAdd(10); WF.Audio.play('drum', { big: true }); } }
      const k = Math.min(1, t / 60), shown = Math.round(sc.total * k);
      this.txt('得分', 280, 140, 18, '#bfb3d6', 'left', { sw: 4, weight: 700 });
      this.txt(String(shown), 280, 180, 46, '#ffffff', 'left', { font: C.FONT_TITLE, sw: 8 });
      if (gr.best && t > 60) this.txt('新纪录！', 560, 180, 22, (t >> 3) % 2 ? '#ffd23c' : '#ff5a8a', 'left', { sw: 5 });
      this.txt(`${mode.name}最高 ${Prog.of(this.menu.p1).best[cp.mode] || 0}${cp.mode === 'challenge' ? '（挑战得分 ×' + P.CHALLENGE_SCORE_MULT + '）' : ''}`, 280, 214, 14, mode.color, 'left', { sw: 3, weight: 700 });
      Object.entries(sc.parts).forEach(([n, v], i) => { if (t > 30 + i * 4) this.txt(`${n} ${v}`, 280 + (i % 4) * 160, 244 + Math.floor(i / 4) * 22, 14, '#e9d7a6', 'left', { sw: 3, weight: 700 }); });
    }
    this.box(150, 300, 660, 140, 'rgba(26,18,48,0.9)', mode.color, 2);
    this.drawGrantPanel(gr, 176, 324, 610, Math.max(0, t - 40));
    const st = this.stats[0];
    this.txt(`正确率 ${st.answered ? Math.round(st.correct / st.answered * 100) : 0}% · 最高连击 ${st.maxCombo || st.maxStreak} · 必杀 ${st.ults} · 剩余血量 ${this.p[0].hp}/${this.p[0].maxHp} · 用时 ${Math.round((this.t - cp.startT) / C.FPS / 60)} 分钟`, C.SCREEN_W / 2, 466, 15, '#8fd0ff', 'center', { sw: 4, weight: 700 });
    if ((t >> 4) % 2 === 0 || t < 30) this.txt('Enter 返回标题', C.SCREEN_W / 2, 510, 20, mode.color, 'center', { sw: 5 });
  };
  // 倒下的结算：在原面板下面补一行经验 / 得分
  const baseRS = G.drawRunSummary;
  G.drawRunSummary = function () {
    baseRS.call(this);
    const gr = this.camp && this.camp.grant; if (!gr || this.result.t < 6) return;
    const m = KC.MODES[gr.mode || 'story'];
    this.txt(`${m.name} · 得分 ${gr.score ? gr.score.total : 0}（${gr.score ? gr.score.rank : '-'}）${gr.best ? ' 新纪录！' : ''} · 经验 +${gr.xp} · 玩家 Lv${gr.pl.to} · ${C.MOVES[this.camp.playerId].name} Lv${gr.ch.from}${gr.ch.to > gr.ch.from ? '→' + gr.ch.to : ''}${gr.ach.length ? ' · 新成就 ' + gr.ach.map(ACHN).join('、') : ''}`, C.SCREEN_W / 2, 474, 14, m.color, 'center', { sw: 3, weight: 700, maxW: 900 });
  };
})();

// v1.7：计时圈下面那行改成从道具栏右端（10 格到 x≈436）之后左对齐画，前面是模式色的「剧情 4/6」标签，不再压道具栏；星舰倒计时期间让给倒计时面板。
(function () {
  const G = WF.Game.prototype;
  G.drawCampHudLine = function () {
    const cp = this.camp; if (this.rocket && !this.rocket.done) return;
    const K = WF.CFG.CAMPAIGN, m = K.MODES[cp.mode || 'story'], x0 = (K.STRIP_X0 || 84) + (K.SLOTS - 1) * (K.STRIP_DX || 38) + 50;
    const tag = `${m.name.slice(0, 2)} ${cp.ci + 1}/${(cp.route || []).length}`;
    this.txt(tag, x0, 104, 13, m.color, 'left', { sw: 3, weight: 700 });
    const tw = this.ctx.measureText ? this.ctx.measureText(tag).width : 50;
    this.txt('· ' + this.campHudLine(), x0 + tw + 6, 104, 13, '#e9d7a6', 'left', { sw: 3, weight: 700, maxW: 800 - x0 - tw });
  };
})();

// v1.7：中途退出回到标题时，屏幕下方弹一条短提示（约 8 秒后淡出），说明只拿到了答对经验
(function () {
  const G = WF.Game.prototype, base = G.drawTitle;
  G.drawTitle = function () {
    base.apply(this, arguments);
    const n = this.quitNote; if (!n) return;
    const C = WF.CFG, age = this.t - n.t0, L = 8 * C.FPS;
    if (age > L) { this.quitNote = null; return; }
    const k = Math.min(1, age / 6, (L - age) / 12);
    this.ctx.globalAlpha = Math.max(0, k);
    const w = 560, h = 40, x = (C.SCREEN_W - w) / 2, y = C.SCREEN_H - 64;   // v1.7.1：菜单 6 个按钮到 y≈472，提示放到按钮下面
    this.box(x, y, w, h, 'rgba(12,8,26,0.9)', '#7ec8ff', 2);
    const up = n.pl.to > n.pl.from ? `  ·  玩家 Lv${n.pl.from}→${n.pl.to}` : '';
    this.txt(`中途退出 · ${n.name} 拿到答对经验 +${n.xp}${up}`, C.SCREEN_W / 2, y + 13, 15, '#7ec8ff', 'center', { sw: 4, weight: 700 });
    this.txt('没打完不给通关经验、不计分、不给闯关积分', C.SCREEN_W / 2, y + 30, 12, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    this.ctx.globalAlpha = 1;
  };
})();
