// v1.7.1 成就 2.0：约 100 个成就（9 个分类，其中 18 个隐藏）。全部由存档里的真实数据判定：
//   prog.life = 终身计数（答对、速答、必杀、通关、道具、词库、每日任务……），prog.life.f = 一次性事件旗标（隐藏成就多用这个）。
// 判定时机：每 60 帧、进标题 / 成就页、结算、领每日奖励、以及 WF.Ach.ev() 事件发生时。解锁时屏幕上方弹「成就解锁」。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, KC = C.CAMPAIGN, P = WF.Prog.P, Prog = WF.Prog, U = WF.Unlocks, FPS = C.FPS;
  const ROSTER = C.ROSTER, UNLOCKABLE = ROSTER.filter(id => !(C.UNLOCK[id] || {}).start);
  const NAME = id => C.MOVES[id].name;
  const CITY_BOSS = { beijing: 'beat_dashixiong', seoul: 'beat_seoul', tokyo: 'beat_tokyo', buenosaires: 'beat_mileiba', rocketbase: 'beat_maxike', washington: 'beat_jinbawang' };

  // ---------- 存档 ----------
  const life = g => {
    const L = g.life = g.life || {};
    const def = { correct: 0, answered: 0, fast: 0, ults: 0, ultBy: {}, sawP: 0, rocketP: 0, rankS: 0, clears: {}, charClear: {}, items: {}, swaps: 0, discards: 0, bankAns: {}, maxCombo: 0,
      dClaims: 0, dBonus: 0, dStreak: 0, dBestStreak: 0, dLastDay: null, same: { id: null, n: 0 }, wrongPeak: 0, playF: 0, bosses: 0, minions: 0, f: {} };
    for (const k in def) if (L[k] === undefined) L[k] = def[k];
    return L;
  };
  const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const lvOf = (pid, id) => Prog.char(pid, id).lv;
  const mastered = pid => { const p = WF.Profiles.get(pid); if (!p) return 0; let n = 0; for (const k in p.history) { const h = p.history[k]; if (h && h.kind !== 'phrase' && !h.inBook && h.streak >= 3) n++; } return n; };
  const wrongNow = pid => WF.Profiles.wrongList(pid).length;
  const banksPlayed = L => Object.values(L.bankAns).filter(n => n >= 10).length;
  const has = (g, id) => !!(g && g.ach[id]);

  // ---------- 成就表 ----------
  // 每条：id, 分类, 名字, 条件说明, { hidden, test(L,g,pid) → bool, prog(L,g,pid) → [n, of] }
  const A = [];
  const add = (cat, id, name, desc, o = {}) => A.push(Object.assign({ cat, id, name, desc }, o));
  const cnt = (get, of) => ({ test: (L, g, pid) => get(L, g, pid) >= of, prog: (L, g, pid) => [Math.min(of, get(L, g, pid)), of] });
  const flag = k => ({ test: L => !!L.f[k] });
  const runAch = { test: () => false };   // 由结算时 campGrant 直接颁发（v1.7 原有的那批）

  // 通关
  add('clear', 'first_run', '出发！', '完成第一局闯关（倒下也算）', cnt((L, g) => (g.runs.story || 0) + (g.runs.challenge || 0), 1));
  add('clear', 'city1', '第一站', '打通任意一座城市', runAch);
  add('clear', 'beat_dashixiong', '胡同之王', '打败北京的城市对手', runAch);
  add('clear', 'beat_seoul', '首尔夜行', '打通首尔', runAch);
  add('clear', 'beat_tokyo', '东京塔下', '打通东京', runAch);
  add('clear', 'beat_mileiba', 'AFUERA！', '打败布宜诺斯艾利斯的米雷霸', runAch);
  add('clear', 'beat_maxike', '火箭没升空', '打败火箭基地的马西克', runAch);
  add('clear', 'beat_jinbawang', '扳倒金霸霸', '打败华盛顿的金霸霸（最终 Boss）', runAch);
  add('clear', 'story_clear', '剧情通关', '剧情模式全部通关', runAch);
  add('clear', 'challenge_clear', '挑战者', '挑战模式全部通关', runAch);
  add('clear', 'story_x5', '老司机', '剧情模式全部通关 5 次', cnt(L => L.clears.story || 0, 5));
  add('clear', 'challenge_x5', '转盘常客', '挑战模式全部通关 5 次', cnt(L => L.clears.challenge || 0, 5));
  add('clear', 'clear_x20', '环球旅行家', '两种模式合计全部通关 20 次', cnt(L => sum(L.clears), 20));
  for (const id of ROSTER) add('clear', 'clear_' + id, `${NAME(id)}的世界巡回`, `用${NAME(id)}全部通关一次`, cnt(L => L.charClear[id] || 0, 1));
  add('clear', 'clear_allchar', '全员出差', `${ROSTER.length} 个角色都全部通关过`, cnt(L => ROSTER.filter(id => L.charClear[id]).length, ROSTER.length));
  add('clear', 'hp_high', '游刃有余', '全部通关时还剩 80% 以上血量', flag('hpHigh'));
  add('clear', 'hp_low', '惊险过关', '全部通关时只剩 10% 以下血量', flag('hpLow'));
  // 答题
  for (const [n, nm] of [[100, '小试牛刀'], [500, '渐入佳境'], [2000, '单词达人'], [10000, '词海无涯']]) add('quiz', 'correct' + n, nm, `累计答对 ${n} 题（任何模式）`, cnt(L => L.correct, n));
  add('quiz', 'phrase100', '搭配达人', '累计答对 100 道短语题', cnt((L, g, pid) => { const p = WF.Profiles.get(pid); return p && p.stats && p.stats.phraseCorrect || 0; }, 100));
  add('quiz', 'fast50', '快人一步', '累计速答 50 次', cnt(L => L.fast, 50));
  add('quiz', 'fast500', '手比脑子快', '累计速答 500 次', cnt(L => L.fast, 500));
  add('quiz', 'acc95', '神准', '全部通关且正确率 ≥ 95%', runAch);
  add('quiz', 'acc100', '满分卷', '全部通关且一题没错', flag('acc100'));
  add('quiz', 'rank_s', 'S 评级', '一局拿到 S 评级', runAch);
  add('quiz', 'rank_s5', 'S 级常客', '累计拿到 5 次 S 评级', cnt(L => L.rankS, 5));
  // 连击
  for (const [n, nm] of [[10, '十连'], [20, '二十连'], [50, '五十连'], [100, '百连斩']]) add('combo', n === 20 ? 'combo20' : n === 50 ? 'combo50' : 'combo' + n, nm, `连续答对 ${n} 题`, cnt(L => L.maxCombo, n));
  // 大招
  for (const id of ROSTER) add('ult', 'ult_' + id, `${C.MOVES[id].ultName}！`, `用${NAME(id)}放出一次「${C.MOVES[id].ultName}」`, cnt(L => L.ultBy[id] || 0, 1));
  add('ult', 'ult10', '必杀狂', '一局里放出 10 次必杀', runAch);
  add('ult', 'ult100', '必杀成瘾', '累计放出 100 次必杀', cnt(L => L.ults, 100));
  add('ult', 'saw_p5', '锯友', '玩家版「全面削减」打碎对手护甲 5 次', cnt(L => L.sawP, 5));
  add('ult', 'rocket_p5', '常驻发射场', '玩家版「星舰升空」起飞 5 次', cnt(L => L.rocketP, 5));
  add('ult', 'saw_survive', '锯后余生', '被米雷霸锯掉道具后，还是打通了那座城', flag('sawSurvive'));
  // 角色
  for (const id of UNLOCKABLE) add('char', 'unlock_' + id, `新伙伴：${NAME(id)}`, `解锁${NAME(id)}（${U.hint(id)}）`, { test: (L, g, pid) => U.has(pid, id) && !U.debugAll });
  add('char', 'unlock_all', '全员到齐', `解锁全部 ${ROSTER.length} 个角色`, { test: (L, g, pid) => !U.debugAll && ROSTER.every(id => U.has(pid, id)), prog: (L, g, pid) => [ROSTER.filter(id => U.has(pid, id)).length, ROSTER.length] });
  const maxLv = pid => Math.max(...ROSTER.map(id => lvOf(pid, id)));
  for (const [n, nm] of [[5, '小有所成'], [10, '老手'], [20, '高手'], [30, '满级']]) add('char', n === 10 ? 'lv10' : n === 30 ? 'lv30' : 'lv' + n, nm, `任意角色升到 Lv${n}`, cnt((L, g, pid) => maxLv(pid), n));
  add('char', 'all_lv5', '雨露均沾', '所有角色都升到 Lv5', cnt((L, g, pid) => ROSTER.filter(id => lvOf(pid, id) >= 5).length, ROSTER.length));
  add('char', 'all_lv10', '全员精英', '所有角色都升到 Lv10', cnt((L, g, pid) => ROSTER.filter(id => lvOf(pid, id) >= 10).length, ROSTER.length));
  // 道具
  // v1.9：只数「可见、非霉运」的道具（隐藏道具另有汇总成就）；删掉满满当当 / 喜新厌旧 / 倒爷（背包上限和换道具都取消了）
  const VIS = () => C.ITEMS.filter(d => d.kind !== 'debuff' && !d.hidden).map(d => d.id);
  const NITEM = VIS().length;
  const itemN = L => Object.keys(L.items).filter(id => { const d = C.ITEMS.find(x => x.id === id); return d && d.kind !== 'debuff'; }).length;
  add('item', 'items10', '小收藏家', '闯关里拿到过 10 种不同道具', cnt(L => itemN(L), 10));
  add('item', 'items20', '大收藏家', '闯关里拿到过 20 种不同道具', cnt(L => itemN(L), 20));
  add('item', 'items_all', '图鉴全开', `${NITEM} 种道具全部拿到过（不含隐藏道具）`, cnt(L => VIS().filter(id => L.items[id]).length, NITEM));
  // 词库
  const NB = () => (WF.game && WF.game.banks || []).length || 11;
  add('bank', 'bank3', '换换口味', '在 3 个不同词库里各答 10 题以上', cnt(L => banksPlayed(L), 3));
  add('bank', 'bank6', '博览群书', '在 6 个不同词库里各答 10 题以上', cnt(L => banksPlayed(L), 6));
  add('bank', 'bank_all', '词库通', '所有词库都各答过 10 题以上', { test: L => banksPlayed(L) >= NB(), prog: L => [Math.min(NB(), banksPlayed(L)), NB()] });
  add('bank', 'bank_pep', '人教全家桶', '人教三、四、五、六年级词库都各答 10 题以上', cnt(L => ['pep3', 'pep4', 'pep5', 'pep6'].filter(b => (L.bankAns[b] || 0) >= 10).length, 4));
  for (const [n, nm] of [[50, '记住了'], [200, '过目不忘'], [1000, '人形词典']]) add('bank', 'master' + n, nm, `掌握 ${n} 个词（同一个词连续答对 3 次）`, cnt((L, g, pid) => mastered(pid), n));
  add('bank', 'wrong_clear', '错题清零', '错题本曾经有 10 个以上的词，后来全部复习掉', { test: (L, g, pid) => L.wrongPeak >= 10 && wrongNow(pid) === 0, prog: (L, g, pid) => L.wrongPeak >= 10 ? [L.wrongPeak - wrongNow(pid), L.wrongPeak] : [L.wrongPeak, 10] });
  // 每日任务
  add('daily', 'daily1', '打卡第一天', '领取一次每日任务奖励', cnt(L => L.dClaims, 1));
  add('daily', 'daily10', '勤快人', '累计领取 10 个每日任务奖励', cnt(L => L.dClaims, 10));
  add('daily', 'daily_bonus', '今日全勤', '一天之内 3 个每日任务全部完成并领取额外奖励', cnt(L => L.dBonus, 1));
  add('daily', 'daily_streak3', '三天打鱼', '连续 3 天领取每日任务奖励', cnt(L => L.dBestStreak, 3));
  add('daily', 'daily_streak7', '一周不落', '连续 7 天领取每日任务奖励', cnt(L => L.dBestStreak, 7));
  // 隐藏（解锁前显示 ???）
  const H = (id, name, desc, k) => add('hidden', id, name, desc, Object.assign({ hidden: true }, k ? flag(k) : runAch));
  H('h_comeback', '置之死地而后生', '一场战斗里连续答错 5 题，最后还是赢了', 'comeback');
  H('h_onehp', '一丝血', '只剩不到 5% 血量时打败城市对手', 'onehp');
  H('h_wrong10', '反向天才', '连续答错 10 题（四个选项都排除了一遍又一遍）', 'wrong10');
  H('h_owl', '夜猫子', '凌晨 3 点还在答题', 'owl');
  H('h_early', '早起的鸟儿', '早上 5 点到 7 点之间答题', 'early');
  H('h_midnight', '零点打卡', '午夜 0:00 到 0:10 之间答题', 'midnight');
  add('hidden', 'rocket_block', '快递退回', '马西克的 Boss 版星舰升空 5 题全挡，火箭掉回他自己头上', Object.assign({ hidden: true }, flag('rocketBlock')));
  H('h_saw5', '清仓大甩卖', '被米雷霸一次锯掉 5 件以上道具', 'saw5');
  H('h_idle', '发呆冠军', '在标题画面一动不动待满 2 分钟', 'idle');
  H('h_flash', '闪电手', '题目出来 0.3 秒内就答对', 'flash');
  H('h_pause10', '尿急', '一局闯关里暂停 10 次', 'pause10');
  H('h_same20', '老搭档', '连续 20 局闯关都用同一个角色', 'same20');
  H('h_buzzer', '压哨绝杀', '一道题拖到 15 秒以后才答对', 'buzzer');
  H('h_nemesis', '冤家路窄', '同一局里同一个词答错 3 次', 'nemesis');
  H('h_noult', '佛系通关', '全部通关，而且一次必杀都没放', 'noult');
  H('h_perfectboss', '毫发无伤', '城市对手战从头到尾一滴血没掉', 'perfectBoss');
  H('h_speedrun', '赶飞机', '一局全部通关只用了 12 分钟以内', 'speedrun');
  // 累计（从 v1.7.1 起记）
  for (const [h, nm] of [[1, '热身完毕'], [5, '渐入状态'], [20, '废寝忘食'], [50, '人生半百小时'], [100, '百小时俱乐部']]) add('total', 'play_h' + h, nm, `累计游玩 ${h} 小时（只算真正在打的时间）`, { test: L => L.playF >= h * 3600 * FPS, prog: L => [Math.min(h * 60, Math.floor(L.playF / FPS / 60)), h * 60] });
  for (const [n, nm] of [[10, '打怪升级'], [50, 'Boss 克星'], [200, 'Boss 收割机'], [500, 'Boss 们的噩梦']]) add('total', 'boss' + n, nm, `累计打败 ${n} 个城市对手 / 最终 Boss（所有模式）`, cnt(L => L.bosses, n));
  for (const [n, nm] of [[100, '扫街'], [1000, '一条街的传说'], [5000, '小怪退散'], [20000, '万人敌']]) add('total', 'minion' + n, nm, `累计打倒 ${n} 个小怪`, cnt(L => L.minions, n));
  const CATS = [['clear', '通关'], ['quiz', '答题'], ['combo', '连击'], ['ult', '大招'], ['char', '角色'], ['item', '道具'], ['bank', '词库'], ['daily', '每日'], ['total', '累计'], ['hidden', '隐藏']];
  // 替换 v1.7 的成就表（保留原 id，旧存档已解锁的照样算）
  P.ACH.length = 0; for (const a of A) P.ACH.push([a.id, a.name, a.desc, a.cat, !!a.hidden]);

  // ---------- 判定 ----------
  const Ach = WF.Ach = {
    list: A, CATS, life, cnt, flagDef: flag, add: (cat, id, name, desc, o) => { add(cat, id, name, desc, o); const a = A[A.length - 1]; P.ACH.push([a.id, a.name, a.desc, a.cat, !!a.hidden]); },
    check(game, quiet) {
      const pid = game.menu && game.menu.p1, g = pid && Prog.of(pid); if (!g) return [];
      const L = life(g), out = [];
      L.wrongPeak = Math.max(L.wrongPeak, wrongNow(pid));
      for (const a of A) { if (g.ach[a.id]) continue; let ok = false; try { ok = a.test(L, g, pid); } catch (e) { ok = false; } if (ok && Prog.grantAch(pid, a.id)) out.push(a); }
      if (out.length) { WF.Profiles.save(); if (!quiet) for (const a of out) game.achToastShow(a); }
      return out;
    },
    ev(game, kind, v) {
      const pid = game.menu && game.menu.p1, g = pid && Prog.of(pid); if (!g) return;
      const L = life(g);
      if (kind === 'sawCut') { if (v >= 5) L.f.saw5 = 1; if (v > 0 && game.camp) game.camp._sawed = true; }
      if (kind === 'sawP') L.sawP++;
      if (kind === 'rocketP') L.rocketP++;
      if (kind === 'rocketBlock') L.f.rocketBlock = 1;
      this.check(game);
    },
    flag(game, k) { const pid = game.menu && game.menu.p1, g = pid && Prog.of(pid); if (!g) return; const L = life(g); if (!L.f[k]) { L.f[k] = 1; this.check(game); } },
  };

  // ---------- 采集：每帧对比战斗统计 ----------
  let idleT = 0;
  try { for (const ev of ['keydown', 'mousedown', 'touchstart', 'pointerdown']) window.addEventListener(ev, () => { idleT = 0; }, true); } catch (e) {}
  const baseUpdate = G.update;
  G.update = function () {
    const wasPaused = this.paused;
    baseUpdate.apply(this, arguments);
    const pid = this.menu && this.menu.p1, g = pid && Prog.of(pid); if (!g) return;
    const L = life(g);
    if (this.state === 'title') {
      if ((this.ui.screen || 'title') === 'title' && !(typeof document !== 'undefined' && document.hidden)) { if (++idleT >= 120 * FPS && !L.f.idle) Ach.flag(this, 'idle'); } else idleT = 0;
      if (this.t % 60 === 0) Ach.check(this);
      return;
    }
    idleT = 0;
    if (!this.stats) return;
    if (this._a2Stats !== this.stats) { this._a2Stats = this.stats; this._a2 = this.stats.map(s => ({ correct: s.correct, answered: s.answered, fast: s.fast, ults: s.ults })); this._a2W = [0, 0]; this._a2Fight = null; this._a2Cities = this.camp ? this.camp.cleared.length : 0; }
    const sides = this.camp || this.menu.cpu ? [0] : [0, 1];
    for (const s of sides) {
      const st = this.stats[s], b = this._a2[s]; if (!st || !b) continue;
      if (st.correct > b.correct) { L.correct += st.correct - b.correct; b.correct = st.correct; }
      if (st.answered > b.answered) { const bid = this.camp || !this.menu.wrongMatch ? this.bank && this.bank.id : null; if (bid && this.menu.mode !== 'math') L.bankAns[bid] = (L.bankAns[bid] || 0) + (st.answered - b.answered); L.answered += st.answered - b.answered; b.answered = st.answered; }
      if (st.fast > b.fast) { L.fast += st.fast - b.fast; b.fast = st.fast; }
      if (st.ults > b.ults) { const f = this.p && this.p[s], cid = f && f.id; L.ults += st.ults - b.ults; if (cid) L.ultBy[cid] = (L.ultBy[cid] || 0) + (st.ults - b.ults); b.ults = st.ults; }
      L.maxCombo = Math.max(L.maxCombo, st.maxCombo || 0);
    }
    const cp = this.camp;
    const prevP = this._a2PrevPaused; this._a2PrevPaused = this.paused;
    // 累计游玩：闯关里真正在打（不算暂停 / 三选一等弹窗 / 地图 / 转盘 / 过场）；对战 / 陪练里出题到出招的时间
    const fightSt = ['question', 'resolve', 'clash', 'clashIntro', 'rocket', 'ko'];
    if (!this.paused && (cp ? !this.campModal() && !['map', 'wheel', 'result', 'cityIntro'].includes(this.state) && !this.cine : fightSt.includes(this.state))) L.playF++;
    if (cp) { if (this._a2Kills == null || this._a2KillsCp !== cp) { this._a2KillsCp = cp; this._a2Kills = cp.kills || 0; } if ((cp.kills || 0) > this._a2Kills) { L.minions += cp.kills - this._a2Kills; this._a2Kills = cp.kills; } }
    if (cp) {
      for (const it of cp.items) L.items[it.id] = 1;
      if (this.paused && !prevP) { cp._pauses = (cp._pauses || 0) + 1; if (cp._pauses >= 10) L.f.pause10 = 1; }
      const n = cp.cleared.length; if (n > this._a2Cities) { if (cp._sawed) { L.f.sawSurvive = 1; cp._sawed = false; } this._a2Cities = n; }
      // 城市对手战：记开打时的血量
      const bossNow = cp.wave > this.campWaves() && this.p && this.p[1] && this.p[1].id === this.campOppId();
      if (bossNow && this._a2Fight !== this.p[1]) { this._a2Fight = this.p[1]; this._a2Hp0 = this.p[0].hp; }
    }
    // 一场打完（KO 第一帧）
    if (this.ko && !this._a2Ko) {
      const W = this.ko.winner;
      if (W && sides.includes(W.side)) {
        if (this._a2W[W.side] >= 5) L.f.comeback = 1;
        if (cp && cp.wave > this.campWaves() && W.side === 0) {
          L.bosses++; L.minions--;   // 打倒城市对手稍后也会让 cp.kills +1，这里先抵掉，小怪数只算小怪
          if (WF.Ach.onBossWin) WF.Ach.onBossWin(this, L);
          if (this.p[0].hp > 0 && this.p[0].hp <= this.p[0].maxHp * 0.05) L.f.onehp = 1;
          if (this._a2Hp0 != null && this.p[0].hp >= this._a2Hp0) L.f.perfectBoss = 1;
        }
      }
      this._a2W = [0, 0];
    }
    this._a2Ko = !!this.ko;
    if (this.t % 60 === 0) Ach.check(this);
  };
  // 每道题：时间 / 速度 / 连错 / 同词错
  const onAns = function (s, q) {
    const rec = q && q.ans && q.ans[s]; if (!rec || rec._a2) return; rec._a2 = 1;
    const human = s === 0 || (!this.camp && !this.menu.cpu); if (!human) return;
    const pid = this.menu.p1, g = Prog.of(pid); if (!g) return;
    const L = life(g), h = new Date().getHours(), m = new Date().getMinutes();
    if (h === 3) L.f.owl = 1; if (h >= 5 && h < 7) L.f.early = 1; if (h === 0 && m < 10) L.f.midnight = 1;
    this._a2Wst = this._a2Wst || [0, 0];
    if (rec.ok) { this._a2Wst[s] = 0; if (rec.t <= Math.round(0.3 * FPS)) L.f.flash = 1; if (rec.t >= 15 * FPS) L.f.buzzer = 1; }
    else {
      this._a2Wst[s]++; if (this._a2Wst[s] >= 10) L.f.wrong10 = 1;
      if (this._a2W) this._a2W[s] = Math.max(this._a2W[s], this._a2Wst[s]);
      if (this.camp && q.word) { const w = this.camp._a2Words = this.camp._a2Words || {}; w[q.word] = (w[q.word] || 0) + 1; if (w[q.word] >= 3) L.f.nemesis = 1; }
    }
  };
  const baseAN = G.answerNormal;
  G.answerNormal = function (s, idx) { const q = this.q; const r = baseAN.apply(this, arguments); onAns.call(this, s, q); return r; };
  const baseAC = G.answerClash;
  if (baseAC) G.answerClash = function (s, idx) { const q = this.q; const r = baseAC.apply(this, arguments); onAns.call(this, s, q); return r; };
  // 换道具 / 放弃新道具
  const baseSwap = G.campSwap;
  G.campSwap = function (slot) {
    const cp = this.camp, g = Prog.of(this.menu.p1);
    if (g && cp && cp.modal && cp.modal.type === 'swap') { const L = life(g); if (slot != null && cp.items[slot]) L.swaps++; else if (slot == null) { L.discards++; if (L.discards >= 5) L.f.discard5 = 1; } }
    return baseSwap.apply(this, arguments);
  };
  // 星舰升空 Boss 版 5/5
  const baseRA = G.answerRocket;
  if (baseRA) G.answerRocket = function (s, idx) { const r = baseRA.apply(this, arguments); const rk = this.rocket; if (this.camp && rk && rk.mode === 'boss' && rk.correct >= C.ULT2.ROCKET.QUESTIONS) Ach.ev(this, 'rocketBlock'); return r; };
  // 结算：全通 / 倒下
  const baseGrant = G.campGrant;
  G.campGrant = function (kind) {
    const had = this.camp && this.camp.grant;
    const out = baseGrant.apply(this, arguments);
    if (had || !out || kind === 'quit') return out;
    const g = Prog.of(this.menu.p1); if (!g) return out;
    const L = life(g), cp = this.camp, full = kind === 'full', st = this.stats[0], P0 = this.p[0];
    if (full) {
      L.clears[cp.mode] = (L.clears[cp.mode] || 0) + 1; L.charClear[cp.playerId] = (L.charClear[cp.playerId] || 0) + 1;
      if (P0.hp >= P0.maxHp * 0.8) L.f.hpHigh = 1; if (P0.hp > 0 && P0.hp <= P0.maxHp * 0.1) L.f.hpLow = 1;
      if (st.answered && st.wrong === 0) L.f.acc100 = 1;
      if (!st.ults) L.f.noult = 1;
      if ((this.t - cp.startT) / FPS <= 12 * 60) L.f.speedrun = 1;
    }
    if (out.score && out.score.rank === 'S') L.rankS++;
    if (L.same.id === cp.playerId) L.same.n++; else L.same = { id: cp.playerId, n: 1 };
    if (L.same.n >= 20) L.f.same20 = 1;
    const got = Ach.check(this, true);
    for (const a of got) if (!out.ach.includes(a.id)) out.ach.push(a.id);
    for (const a of got) this.achToastShow(a);
    WF.Profiles.save();
    return out;
  };
  // 每日任务领取 → 打卡统计
  if (WF.Daily) {
    const baseClaim = WF.Daily.claim.bind(WF.Daily);
    WF.Daily.claim = function (pid, i) {
      const got = baseClaim(pid, i), g = got && Prog.of(pid);
      if (g) {
        const L = life(g), today = WF.Daily.dayKey(), y = WF.Daily.dayKey(Date.now() + (WF.Daily.offset() - 1) * 864e5);
        if (i === 'bonus') L.dBonus++; else L.dClaims++;
        if (L.dLastDay !== today) { L.dStreak = L.dLastDay === y ? L.dStreak + 1 : 1; L.dLastDay = today; L.dBestStreak = Math.max(L.dBestStreak, L.dStreak); }
        WF.Profiles.save(); if (WF.game) Ach.check(WF.game);
      }
      return got;
    };
  }

  // ---------- 解锁提示 ----------
  G.achToastShow = function (a) { (this.achQ = this.achQ || []).push({ a, t0: null }); WF.Audio.play('lvup'); if (this.say) this.say(`成就解锁：${a.name}`); };
  const baseRender = G.render;
  G.render = function () {
    baseRender.apply(this, arguments);
    const q = this.achQ; if (!q || !q.length) return;
    const it = q[0];
    if (WF.touch && this.camp && this.campModal && this.campModal() && this.camp.toasts.length >= 2) { if (it.t0 != null) it.t0++; return; }   // v1.9 触屏：右上角被第 2 条提示占着 → 成就先等一等（不计时）
    if (this.rocket && this.rocket.ln) { if (it.t0 != null) it.t0 = this.t - (it.age || 0); return; }   // v1.10：马西克发射（瞄准 + 飞行 / 失败动画）期间成就提示先等一等（不计时），不挡条、按钮和动画
    if (it.t0 == null) it.t0 = this.t;
    const age = it.age = this.t - it.t0, L = 75; if (age > L) { q.shift(); return; }
    const c = this.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const T = WF.touch, k = Math.min(1, age / 5, (L - age) / 8), w = T ? 460 : 340, h = T ? 72 : 42, x = T ? C.SCREEN_W - w - 10 : C.SCREEN_W - w - 16, y = T ? 2 : 186;   // v1.9 触屏：右上角（标题那一带没有按钮），说明折两行，字 ≥ 16
    const fl = this._tfloor; if (T) this._tfloor = WF.TOUCH_FONT || 16;
    c.globalAlpha = Math.max(0, k);
    this.box(x, y, w, h, 'rgba(40,26,6,0.94)', '#ffd23c', 2);
    this.box(x + 6, y + (h - 30) / 2, 30, 30, '#ffd23c', '#7a4a00', 2);
    this.txt('★', x + 21, y + h / 2 + 1, 20, '#7a1414', 'center', { stroke: false });
    this.txt(`成就解锁${it.a.hidden ? '（隐藏）' : ''}：${it.a.name}`, x + 44, y + (T ? 15 : 14), 15, '#ffd23c', 'left', { sw: 4, weight: 700, maxW: w - 52 });
    if (T) this.wrapLines(it.a.desc, w - 52, 16, 2).forEach((ln, j) => this.txt(ln, x + 44, y + 36 + j * 20, 16, '#ffffff', 'left', { sw: 3, weight: 700 }));
    else this.txt(it.a.desc, x + 44, y + 31, 11, '#ffffff', 'left', { sw: 3, weight: 700, maxW: w - 52 });
    this._tfloor = fl; if (T) (this._toastRects = this._toastRects || []).push({ x, y, w, h });
    c.restore();
  };

  // ---------- 成就页：分类页签 + 分页 ----------
  const PER = 10;
  const inCat = cat => A.filter(a => a.cat === cat);
  G.goAch = function () { this.state = 'title'; this.ui.screen = 'achievements'; this.ui.achPage = 0; this.ui.achCat = this.ui.achCat || 0; WF.Audio.play('menu'); Ach.check(this, true); };
  G.achPages = function () { return Math.max(1, Math.ceil(inCat(CATS[this.ui.achCat || 0][0]).length / PER)); };
  G.achTab = function (d) { this.ui.achCat = ((this.ui.achCat || 0) + d + CATS.length) % CATS.length; this.ui.achPage = 0; WF.Audio.play('menu'); };
  G.achKey = function (code) {
    if (code === 'Escape' || code === 'Backspace') this.achBack();
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'PageDown') this.achTurn(1);
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'PageUp') this.achTurn(-1);
    else if (code === 'ArrowDown' || code === 'KeyS' || code === 'Tab' || code === 'KeyE') this.achTab(1);
    else if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyQ') this.achTab(-1);
  };
  G.achClick = function (hit) {
    if (hit.key === 'back') this.achBack();
    else if (hit.key === 'prev') this.achTurn(-1);
    else if (hit.key === 'next') this.achTurn(1);
    else if (hit.key === 'acat') { this.ui.achCat = hit.i; this.ui.achPage = 0; WF.Audio.play('menu'); }
  };
  const dstr = ts => { const d = new Date(ts); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  G.drawAchievements = function () {
    const c = this.ctx, W = C.SCREEN_W, pid = this.menu.p1, prof = WF.Profiles.get(pid), g = pid ? Prog.of(pid) : null, L = g ? life(g) : null;
    const ci = this.ui.achCat = Math.max(0, Math.min(CATS.length - 1, this.ui.achCat || 0)), cat = CATS[ci][0], list = inCat(cat), pages = this.achPages();
    const page = this.ui.achPage = Math.max(0, Math.min(pages - 1, this.ui.achPage || 0));
    const got = A.filter(a => g && g.ach[a.id]).length;
    c.fillStyle = 'rgba(6,3,16,0.84)'; c.fillRect(0, 0, W, C.SCREEN_H);
    this.menuRects = [];
    this.box(40, 14, 80, 26, 'rgba(20,14,40,0.82)', '#5d4f86', 2);
    this.txt('返回', 80, 28, 14, '#e9d7a6', 'center', { sw: 3 });
    this.menuRects.push({ x: 40, y: 14, w: 80, h: 26, key: 'back', i: -1 });
    this.txt('成就', W / 2, 32, 34, '#ffd23c', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.txt(`已解锁 ${got}/${A.length}`, W - 40, 28, 18, got ? '#ffd23c' : '#bfb3d6', 'right', { sw: 4, weight: 700 });
    // 顶部小条
    const hy = 54;
    this.box(40, hy, W - 80, 26, 'rgba(20,14,40,0.86)', '#5d4f86', 2);
    if (g) {
      const need = P.PLAYER_NEED(g.lv), k = Math.max(0, Math.min(1, g.xp / need));
      this.txt(`${prof ? prof.name : ''}  玩家 Lv${g.lv}`, 54, hy + 13, 14, '#ffffff', 'left', { sw: 4, weight: 700, maxW: 190 });
      const bx = 254, bw = 180; this.box(bx, hy + 8, bw, 11, '#120c1c', '#5d4f86', 1);
      c.fillStyle = '#7ec8ff'; c.fillRect(bx + 2, hy + 10, Math.round((bw - 4) * k), 7);
      this.txt(`${g.xp}/${need}`, bx + bw + 8, hy + 13, 12, '#bfb3d6', 'left', { sw: 3, weight: 700 });
      const M = KC.MODES;
      this.txt(`${M.story.name} 最高 ${g.best.story || 0}`, 640, hy + 13, 13, M.story.color, 'center', { sw: 4, weight: 700 });
      this.txt(`${M.challenge.name} 最高 ${g.best.challenge || 0}`, 820, hy + 13, 13, M.challenge.color, 'center', { sw: 4, weight: 700 });
    } else this.txt('还没有玩家档 · 回菜单点右上角建一个', W / 2, hy + 13, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    // 分类页签
    const tg = 6, tw = (W - 80 - tg * (CATS.length - 1)) / CATS.length, ty = 88, th = 30;
    CATS.forEach(([k, nm], i) => {
      const items = inCat(k), n = items.filter(a => g && g.ach[a.id]).length, on = i === ci, x = 40 + i * (tw + tg);
      this.box(x, ty, tw, th, on ? 'rgba(255,210,60,0.22)' : 'rgba(20,14,40,0.88)', on ? '#ffd23c' : '#5d4f86', on ? 3 : 2);
      this.txt(nm, x + tw / 2, ty + 11, 14, on ? '#ffd23c' : '#ffffff', 'center', { sw: 3, weight: 700 });
      this.txt(`${n}/${items.length}`, x + tw / 2, ty + 24, 10, n === items.length ? '#7dff9a' : '#bfb3d6', 'center', { sw: 3, weight: 700 });
      this.menuRects.push({ x, y: ty, w: tw, h: th, key: 'acat', i });
    });
    // 卡片 2 列 × 5 行
    const cw = 432, ch = 58, gx = 16, gy = 8, x0 = (W - cw * 2 - gx) / 2, y0 = 126;
    list.slice(page * PER, page * PER + PER).forEach((a, i) => {
      const ts = g && g.ach[a.id], x = x0 + (i % 2) * (cw + gx), y = y0 + Math.floor(i / 2) * (ch + gy), secret = a.hidden && !ts;
      this.box(x, y, cw, ch, ts ? 'rgba(60,40,10,0.9)' : 'rgba(22,20,32,0.9)', ts ? '#ffd23c' : secret ? '#4a2a5a' : '#3c3852', 2);
      const bx = x + 9, by = y + 9;
      this.box(bx, by, 40, 40, ts ? '#ffd23c' : secret ? '#2a1838' : '#2e2b3e', ts ? '#7a4a00' : '#4a4660', 2);
      this.txt(ts ? '★' : '?', bx + 20, by + 21, ts ? 24 : 22, ts ? '#7a1414' : secret ? '#a070c0' : '#6d6888', 'center', { sw: 0, stroke: false });
      this.txt(secret ? '???' : a.name, x + 60, y + 18, 17, ts ? '#ffd23c' : secret ? '#a070c0' : '#8f8aa6', 'left', { sw: 4, weight: 700, maxW: 230 });
      this.txt(secret ? '隐藏成就 · 达成后揭晓' : a.desc, x + 60, y + 41, 12, ts ? '#ffffff' : '#7d7894', 'left', { sw: 3, weight: 700, maxW: cw - 70 - (ts ? 0 : 80) });
      if (ts) this.txt(`${dstr(ts)} 解锁`, x + cw - 10, y + 18, 11, '#e9d7a6', 'right', { sw: 3, weight: 700 });
      else if (!secret && a.prog && g) {
        let pr = null; try { pr = a.prog(L, g, pid); } catch (e) { pr = null; }
        if (pr) {
          this.txt(`${pr[0]}/${pr[1]}`, x + cw - 10, y + 18, 13, '#bfb3d6', 'right', { sw: 3, weight: 700 });
          const pw = 66, px = x + cw - 10 - pw, py = y + 37; this.box(px, py, pw, 8, '#120c1c', '#4a4660', 1);
          c.fillStyle = '#9a8fd0'; c.fillRect(px + 1, py + 1, Math.round((pw - 2) * Math.min(1, pr[0] / pr[1])), 6);
        }
      } else this.txt(secret ? '' : '未解锁', x + cw - 10, y + 18, 11, '#6d6888', 'right', { sw: 3, weight: 700 });
    });
    // 翻页
    const fy = 470;
    const btn = (key, label, x, on) => { this.box(x, fy - 14, 110, 28, on ? 'rgba(20,14,40,0.88)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + 55, fy, 14, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3, weight: 700 }); if (on) this.menuRects.push({ x, y: fy - 14, w: 110, h: 28, key, i: -1 }); };
    btn('prev', '◀ 上一页', W / 2 - 190, page > 0);
    btn('next', '下一页 ▶', W / 2 + 80, page < pages - 1);
    this.txt(`${CATS[ci][1]} · 第 ${page + 1} / ${pages} 页`, W / 2, fy, 14, '#ffffff', 'center', { sw: 4, weight: 700 });
    this.txt('↑↓ 换分类    ←→ 翻页    Esc 返回    鼠标也可点', W / 2, 510, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };
})();
