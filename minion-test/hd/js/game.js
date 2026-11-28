// 单词格斗：状态机 + 动作导演 + 打击感 + HUD
WF.frameNo = 0;
WF.Game = class {
  constructor(canvas) {
    if (WF.applyResolution) WF.applyResolution();
    const C = WF.CFG, ws = C.WORLD_SCALE || C.SCALE;
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    canvas.width = C.OUT_W || C.SCREEN_W; canvas.height = C.OUT_H || C.SCREEN_H;
    this.ctx.imageSmoothingEnabled = false;
    this.world = document.createElement('canvas'); this.world.width = (C.VIEW_W + 2) * ws; this.world.height = C.VIEW_H * ws;
    this.wctx = this.world.getContext('2d'); this.wctx.imageSmoothingEnabled = false;
    this.t = 0; this.state = 'title'; this.paused = false; this.rnd = Math.random;
    this.banks = window.WF_BANKS || [];
    WF.Profiles.load();
    let bi = 2; let mode = 'word'; let cpu = false; let ch = 'suling'; let wrong = false; let roundTime = 0; let vs = [C.P1_CHAR, C.P2_CHAR];
    try {
      const s = localStorage.getItem('wf_bank'); const i = this.banks.findIndex(b => b.id === s); if (i >= 0) bi = i;
      const m = localStorage.getItem('wf_mode'); if (C.QMODES.some(q => q.id === m)) mode = m;
      cpu = localStorage.getItem('wf_cpu') === '1';
      const c = localStorage.getItem('wf_char'); if (C.ROSTER.includes(c)) ch = c;
      const v = (localStorage.getItem('wf_char_vs') || '').split(','); if (v.length === 2 && v.every(x => C.ROSTER.includes(x)) && v[0] !== v[1]) vs = v;
      wrong = localStorage.getItem('wf_wrong') === '1';
      const rt = parseInt(localStorage.getItem('wf_round'), 10);
      if ((C.ROUND_TIMES || [0, 60, 90, 120, 180]).indexOf(rt) >= 0) roundTime = rt;
    } catch (e) {}
    this.menu = {
      row: 0, bank: Math.min(bi, Math.max(0, this.banks.length - 1)),
      cpu, mode, char: ch, wrongMatch: wrong, roundTime,
      vs, cpuChar: null,   // v1.4：vs = 双人对战 [P1, P2] 的角色；cpuChar = 电脑陪练时电脑用的角色（进选角界面时随机）
      p1: WF.Profiles.data.lastP1, p2: WF.Profiles.data.lastP2,
    };
    this.menuRects = [];
    this.ui = { screen: 'title', sel: 0, page: 0, bank: 0, query: '', confirm: null, side: 0, avatar: 0, flash: 0 };
    if (this.menu.p1) WF.Profiles.applyBgm(this.menu.p1);
    this.applyChars();
    this.p = [new WF.Fighter(this.chars[0], 0), new WF.Fighter(this.chars[1], 1)];
    this.layoutTitle();
    this.queue = []; this.pops = []; this.log = [];
    this.pendingAttack = null;
    this.unlockShow = [];   // v1.4 新角色解锁卡片（排队显示）
  }
  // ================= 工具 =================
  // 以下几项 2P 对战按原规则返回；闯关模式在 campaign.js 里读道具加成
  fastS(s) { return (this.camp ? this.campFastS(s) : WF.CFG.FAST_S) + (this.q && this.q.kind === 'phrase' ? 1 : 0); }
  slowS() { return WF.CFG.SLOW_S + (this.q && this.q.kind === 'phrase' ? 1 : 0); }
  timeoutS() { return (this.camp ? this.campTimeout() : WF.CFG.Q_TIMEOUT_S) + (this.q && this.q.kind === 'phrase' ? 2 : 0); }
  ultAt(s) { return this.camp ? this.campUltAt(s) : 5; }
  critChance(s) { return this.camp ? this.campCrit(s) : WF.CFG.CRIT_CHANCE; }
  ultDmg(A) { return this.camp ? this.campUltDmg(A) : WF.CFG.ULT_DMG; }
  clashDmg(W) { return this.camp ? this.campClashDmg(W) : WF.CFG.CLASH_DMG; }
  clashAllowed() { return this.camp ? this.campClashAllowed() : true; }
  // 全模式角力窗口（双人 / 人机 / 闯关）统一读 CLASH_WINDOW_S。
  clashWindowS() { return WF.CFG.CLASH_WINDOW_S; }
  gap() { return this.camp ? this.campGap() : WF.CFG.GAP; }
  slowStreak(s) { if (this.camp && this.campSlowKeeps(s)) return; this.streak[s] = 0; }
  // v1.5：全体上场角色（含一波里尚未作为 p[1] 的小怪），供步进 / 绘制 / 顿帧使用
  fighters() {
    const out = this.p ? this.p.slice() : [];
    const mobs = this.camp && this.camp.mobs;
    if (mobs) for (const m of mobs) if (m && out.indexOf(m) < 0) out.push(m);
    return out;
  }
  // 连续答对伤害加成：第 1 题 ×1，之后每题 +5%，最多 +50%
  comboMult(s) {
    const F = WF.CFG.FEEL || {}, n = (this.ansCombo && this.ansCombo[s]) || 0;
    return 1 + Math.min(F.COMBO_CAP || 0.5, Math.max(0, n - 1) * (F.COMBO_STEP || 0.05));
  }
  other(p) { return this.p[1 - p.side]; }
  rand() { return this.rnd(); }
  applyChars() {
    // v1.4：双人对战按 menu.vs（默认 P1 苏绫、P2 Mr.J）；电脑陪练玩家用 menu.char，电脑用 menu.cpuChar（不能和玩家同一个）
    const C = WF.CFG, ok = id => C.ROSTER.includes(id);
    if (this.menu.cpu) {
      const a = ok(this.menu.char) ? this.menu.char : 'suling';
      let b = this.menu.cpuChar;
      if (!ok(b) || b === a) b = a === 'suling' ? 'mrj' : 'suling';
      this.chars = [a, b];
    } else {
      const v = this.menu.vs || [];
      const a = ok(v[0]) ? v[0] : C.P1_CHAR;
      let b = ok(v[1]) ? v[1] : C.P2_CHAR;
      if (b === a) b = a === C.P2_CHAR ? C.P1_CHAR : C.P2_CHAR;
      this.chars = [a, b];
    }
  }
  // v1.4 电脑陪练：随机挑一个和玩家不同的角色当电脑对手
  rollCpuChar(avoid) {
    const others = WF.CFG.ROSTER.filter(id => id !== (avoid || this.menu.char) && id !== this.menu.cpuChar);
    const pool = others.length ? others : WF.CFG.ROSTER.filter(id => id !== (avoid || this.menu.char));
    this.menu.cpuChar = pool[Math.floor(Math.random() * pool.length)];
  }
  // 新角色解锁：排队显示解锁卡片
  showUnlocks(ids, pid) {
    for (const id of ids || []) {
      this.unlockShow.push({ id, pid, t: 0 });
      this.say('解锁角色 ' + WF.CFG.MOVES[id].name + (pid ? '（' + ((WF.Profiles.get(pid) || {}).name || '') + '）' : ''));
    }
  }
  checkUnlocks(pids) { for (const pid of pids) if (pid) this.showUnlocks(WF.Unlocks.check(pid), pid); }
  spawnFighters() {
    this.applyChars();
    this.p = [new WF.Fighter(this.chars[0], 0), new WF.Fighter(this.chars[1], 1)];
  }
  layoutTitle() { const c = WF.CFG.STAGE_W / 2; this.p[0].x = c - 70; this.p[1].x = c + 70; this.cam = c; this.p.forEach(f => f.play('idle')); }
  say(...a) { const s = '[WF] ' + a.join(' '); this.log.push(s); console.log(s); }
  persistMenu() {
    try {
      if (this.banks[this.menu.bank]) localStorage.setItem('wf_bank', this.banks[this.menu.bank].id);
      localStorage.setItem('wf_mode', this.menu.mode);
      localStorage.setItem('wf_cpu', this.menu.cpu ? '1' : '0');
      localStorage.setItem('wf_char', this.menu.char);
      if (this.menu.vs) localStorage.setItem('wf_char_vs', this.menu.vs.join(','));
      localStorage.setItem('wf_wrong', this.menu.wrongMatch ? '1' : '0');
      localStorage.setItem('wf_round', String(this.menu.roundTime || 0));
    } catch (e) {}
    WF.Profiles.setLast(0, this.menu.p1);
    if (this.menu.p2) WF.Profiles.setLast(1, this.menu.p2);
  }
  profileOf(side) { return side === 0 ? WF.Profiles.get(this.menu.p1) : (this.menu.cpu ? null : WF.Profiles.get(this.menu.p2)); }
  modeName() { return (WF.CFG.QMODES.find(m => m.id === this.menu.mode) || {}).name || '单词'; }
  needsBank() { return !this.menu.wrongMatch && this.menu.mode !== 'math'; }
  qtypeName() { return this.menu.wrongMatch ? '错题对战' : this.modeName(); }
  matchLeft() {
    const lim = this.camp ? 0 : (this.menu.roundTime || 0);
    if (!lim || this.matchStart == null) return null;
    return Math.max(0, lim - (this.t - this.matchStart) / WF.CFG.FPS);
  }
  goSettings() {
    WF.Audio.play('confirm');
    this.state = 'title'; this.ui.screen = 'settings'; this.menu.row = 0;
  }

  // ================= 开局 =================
  startMatch(wrongMatch) {
    const C = WF.CFG;
    if (wrongMatch !== undefined) this.menu.wrongMatch = !!wrongMatch;
    if (!this.menu.p1) { this.goProfiles(0); return; }
    if (!this.menu.cpu && !this.menu.p2) { this.goProfiles(1); return; }
    const ids = this.menu.cpu ? [this.menu.p1] : [this.menu.p1, this.menu.p2];
    let wrongEntries = null;
    if (this.menu.wrongMatch) {
      wrongEntries = WF.Profiles.unionWrong(ids, 'all');
    }
    // v1.8 按需词库：选到还没下载的词库 → 先下载（显示加载中），成功后再开局；失败则回退到上一个词库（见 js/v18_banks.js）
    if (this.bankGate && this.bankGate([this.needsBank() ? this.banks[this.menu.bank] : null].concat(this.wrongBanks(wrongEntries)), () => this.startMatch())) return;
    this.persistMenu();
    this.spawnFighters();
    this.bank = this.bankForPlay();
    this.source = WF.makeSource({
      mode: this.menu.mode, bank: this.bank, rnd: this.rnd, banks: this.banks,
      wrongEntries: this.menu.wrongMatch ? wrongEntries : null,
    });
    this.usedFallback = !!(this.menu.wrongMatch && (!wrongEntries || wrongEntries.length < 4));
    const c = C.STAGE_W / 2; this.p[0].x = c - C.GAP / 2; this.p[1].x = c + C.GAP / 2; this.cam = c;
    this.streak = [0, 0]; this.ansCombo = [0, 0]; this.queue = []; this.pops = []; WF.FX.clear();
    this.stats = [0, 1].map(() => ({ answered: 0, correct: 0, wrong: 0, fast: 0, sumT: 0, maxStreak: 0, maxCombo: 0, ults: 0, crits: 0, dmg: 0, clashWins: 0, hits: 0 }));
    this.hitstop = 0; this.hsTargets = []; this.shake = 0; this.rumble = 0; this.shakeX = 0; this.shakeY = 0;
    this.darken = 0; this.darkenTarget = 0; this.screenFlash = 0; this.slow = 0; this.excite = 0;
    this.ko = null; this.koText = 0; this.banner = null; this.announce = null; this.rating = null; this.combo = [null, null];
    this.qn = 0; this.q = null; this.clash = null; this.matchStart = null; this.matchEnd = null; this.result = null;
    this.pendingAttack = null; this.missOnly = false; this.ui.screen = 'title';
    this.state = 'intro'; this.paused = false;
    const vs = this.menu.cpu ? ('电脑 · ' + this.p[1].mv.name) : '玩家';
    this.say('开局 题型=' + this.modeName(), '词库=' + (this.bank ? this.bank.name : '—'),
      '对手=' + vs, 'P1=' + this.p[0].mv.name, 'P2=' + this.p[1].mv.name,
      this.menu.wrongMatch ? (this.usedFallback ? '错题不足，回退普通题库' : '错题对战') : '');
    this.run(this.introSeq());
  }
  requestStart(wrongMatch) {
    if (wrongMatch !== undefined) this.menu.wrongMatch = !!wrongMatch;
    this.persistMenu();
    if (!this.menu.p1) { this.goProfiles(0, 'start'); return; }
    if (!this.menu.cpu && !this.menu.p2) { this.goProfiles(1, 'start'); return; }
    this.goCharSel('start');   // v1.4：双人对战也先选角色
  }
  *introSeq() {
    const [a, b] = this.p;
    if (a.mv.intro && a.has(a.mv.intro)) a.play(a.mv.intro);
    if (b.mv.intro && b.has(b.mv.intro)) b.play(b.mv.intro);   // v1.4：右边的角色也亮相（Mr.J 没有亮相动作，不受影响）
    this.announce = { text: '第 1 回合', sub: this.menu.wrongMatch ? '错题对战' : '准备', t: 0, life: 40 }; WF.Audio.play('beep', { f: 520 });
    yield 40;
    this.announce = { text: 'FIGHT!', t: 0, life: 28, big: true }; WF.Audio.play('fight'); this.shakeAdd(6);
    WF.Audio.startMusic();
    yield 22;
    this.matchStart = this.t;
    this.newQuestion();
  }

  // ================= 导演队列（动作按顺序执行） =================
  run(gen, tag) { this.queue.push({ g: gen, wait: 0, cond: null, tag: tag || '' }); }
  clearTagged(tag) { this.queue = this.queue.filter(t => t.tag !== tag); }
  get busy() { return this.queue.length > 0; }
  runQueue() {
    for (let guard = 0; guard < 8 && this.queue.length; guard++) {
      const task = this.queue[0];
      if (task.wait > 0) { task.wait--; return; }
      if (task.cond) { if (!task.cond()) return; task.cond = null; }
      const r = task.g.next();
      if (r.done) { this.queue.shift(); continue; }
      if (typeof r.value === 'number') { task.wait = r.value - 1; return; }
      if (typeof r.value === 'function') { task.cond = r.value; if (!task.cond()) return; task.cond = null; continue; }
      return;
    }
  }

  // ================= 出题 / 作答 =================
  newQuestion() {
    if (this.ko) return;
    this.qn++;
    const q = this.camp ? this.campNextQ() : this.source.next();
    Object.assign(q, { t: 0, ans: [null, null], first: null, revealed: false, revealT: 0, n: this.qn, flash: null });
    if (this.camp) this.campDecorateQ(q);
    this.q = q; this.state = 'question'; this.pendingAttack = null; this.missOnly = false;
    if (this.ult2OnQuestion) this.ult2OnQuestion();
    if (this.onStreet && this.onStreet() && this.street.phase === 'fight') this.campStreetHold({ snap: true });
    this.cpuPlan(q, false);
    for (const s of [0, 1]) {
      const p = this.profileOf(s);
      if (p) WF.Profiles.markSeen(p.id, q);
    }
  }
  cpuPlan(q, clash) {
    if (this.camp && this.campCpuPlan(q, clash)) return;
    if (!this.menu.cpu) { q.cpu = null; return; }
    const K = WF.CFG.CPU, lo = clash ? K.clashDelayMin : K.delayMin, hi = clash ? K.clashDelayMax : K.delayMax;
    const ok = this.rand() < K.accuracy;
    let idx = q.correct; if (!ok) { idx = (q.correct + 1 + Math.floor(this.rand() * 3)) % 4; if (idx === q.erased) idx = [0, 1, 2, 3].find(i => i !== q.correct && i !== q.erased); }
    q.cpu = { t: Math.round((lo + (hi - lo) * Math.pow(this.rand(), 1.3)) * WF.CFG.FPS), idx };
  }
  input(code) {
    const C = WF.CFG;
    let side = -1, idx = -1;
    if (code in C.KEYS_P1) { side = 0; idx = C.KEYS_P1[code]; }
    else if (code in C.KEYS_P2) { side = 1; idx = C.KEYS_P2[code]; }
    if (side < 0) return false;
    if (side === 1 && this.menu.cpu) return true; // 电脑模式下 P2 键无效
    this.answer(side, idx); return true;
  }
  answer(side, idx) {
    if (this.paused) return;
    if (this.state === 'question') return this.answerNormal(side, idx);
    if (this.state === 'clash') return this.answerClash(side, idx);
    if (this.state === 'rocket' && this.answerRocket) return this.answerRocket(side, idx);
  }
  answerNormal(s, idx) {
    const q = this.q, C = WF.CFG, W = this.clashWindowS() * C.FPS;
    if (!q || q.revealed || q.ans[s]) return;
    if (q.erased === idx) return; // 橡皮擦擦掉的选项按了没反应
    const rec = { idx, t: q.t, ok: idx === q.correct };
    q.ans[s] = rec; const st = this.stats[s]; st.answered++;
    q.flash = { idx, t: 0, ok: rec.ok, side: s };
    const prof = this.profileOf(s);
    const was = (this.camp && prof) ? (q.kind === 'phrase' ? WF.Profiles.phraseMastery(prof.id, q.bank, q.word) : WF.Profiles.mastery(prof.id, q.bank, q.word)) : null;
    if (prof) WF.Profiles.markAnswer(prof.id, q, rec.ok);
    if (this.camp && s === 0) this.campOnAnswer(q, rec, was);
    const o = 1 - s;
    if (!rec.ok) {
      st.wrong++; this.streak[s] = 0; if (this.ansCombo) this.ansCombo[s] = 0;
      WF.Audio.play('lock', { p2: s === 1 });
      WF.Audio.play('wrong'); if (this.humanSide(s)) WF.Haptics.wrong();
      this.say(`Q${q.n} P${s + 1} 答错 ${(q.t / C.FPS).toFixed(2)}s`);
      // 电脑已经不能再改变“会不会角力”，立即按预设计划作答，避免空等
      if (this.menu.cpu && s === 0 && !q.ans[1] && q.cpu) { this.answer(1, q.cpu.idx); this.render(); return; }
      if (q.ans[o] && !q.ans[o].ok) this.endQuestion();
      else if (q.first && q.first.p === o) this.commitAttack();
      this.render();
      return;
    }
    st.correct++; st.sumT += q.t;
    if (!this.ansCombo) this.ansCombo = [0, 0];
    this.ansCombo[s] = (this.ansCombo[s] || 0) + 1;
    st.maxCombo = Math.max(st.maxCombo || 0, this.ansCombo[s]);
    WF.Audio.play('lock', { p2: s === 1 });
    WF.Audio.play('correct'); if (this.humanSide(s)) WF.Haptics.correct();
    if (!q.first) {
      q.first = { p: s, t: q.t };
      const canClash = !q.ans[o] && this.clashAllowed();
      this.beginAttack(s, { speculative: canClash });
      if (!canClash) this.commitAttack();
    } else if (q.first.p === o && q.t - q.first.t <= W) {
      const pa = this.pendingAttack;
      if (pa && pa.isUlt) {
        this.commitAttack();
      } else {
        this.cancelSpeculative();
        this.startClash();
      }
    }
    this.render();
  }
  updateQuestion() {
    const q = this.q, C = WF.CFG;
    if (!q) return;
    q.t++;
    const pa = this.pendingAttack;
    if (q.cpu && q.t === q.cpu.t && !q.ans[1]) this.answer(1, q.cpu.idx);
    if (this.state !== 'question') return;
    if (pa && pa.speculative && !pa.committed) {
      if (q.t - q.first.t > this.clashWindowS() * C.FPS) this.commitAttack();
      return;
    }
    if (q.first && !pa && q.t - q.first.t > this.clashWindowS() * C.FPS) this.beginAttack(q.first.p, { speculative: false }), this.commitAttack();
    else if (!q.first && q.t >= this.timeoutS() * C.FPS) {
      this.say(`Q${q.n} 超时`);
      if (this.camp && this.campOnTimeout(q)) return;
      this.endQuestion();
    }
  }
  reveal() { if (this.q && !this.q.revealed) { this.q.revealed = true; this.q.revealT = this.t; } }
  endQuestion() {
    if (this.state !== 'question') return;
    this.reveal(); this.state = 'resolve'; this.streak = [0, 0]; this.ansCombo = [0, 0]; this.missOnly = true;
    this.pendingAttack = null;
    this.clearTagged('whiff'); this.clearTagged('regroup');
    this.run(this.nextSeq());
  }

  // 出招从按下那一帧就开始，不等揭晓、不等当前动作播完
  // 每一档从招式池里随机挑一招，避免和上一招重复
  pickMove(A, pool) {
    if (!Array.isArray(pool)) return pool;
    const ok = pool.filter(a => A.data.anims[a]);
    const c = ok.filter(a => a !== A.lastMove);
    const list = c.length ? c : (ok.length ? ok : pool);
    const m = list[Math.floor(this.rand() * list.length)];
    A.lastMove = m; return m;
  }
  attackOpts(A, anim) {
    const frames = (A.data.anims[anim] || { frames: [] }).frames;
    let hitI = frames.findIndex(f => (f.ev || []).includes('hit'));
    if (hitI < 0) hitI = 0;
    const from = hitI >= 2 ? Math.min(2, hitI - 1) : 0;
    return { from, speed: 2, hitI };
  }
  beginAttack(s, opts) {
    const q = this.q, C = WF.CFG, A = this.p[s], D = this.p[1 - s], st = this.stats[s];
    const sec = (q.first ? q.first.t : q.t) / C.FPS;
    this.streak[1 - s] = 0;
    // 打断对方闪避/受击收招，立刻进入对打
    A.paused = false; D.paused = false;
    if (D.anim === 'dodge_roll' || D.anim === 'stunned' || D.anim === 'block' || D.anim === 'block_recover') D.play('idle');
    if (A.anim === 'dodge_roll' || A.anim === 'stunned' || A.anim === 'idle' || A.done) { /* will be replaced */ }
    this.clearTagged('whiff'); this.clearTagged('regroup');
    let kind, dmg, lvl, crit = false, anim, block = false, kick = false, isUlt = false;
    const ov = this.camp ? this.campEnemyAttack(s, A) : null;
    if (ov) ({ kind, dmg, lvl, crit, anim, block, kick } = ov);
    else if (sec <= this.fastS(s)) {
      st.fast++; this.streak[s]++; st.maxStreak = Math.max(st.maxStreak, this.streak[s]);
      if (this.streak[s] >= this.ultAt(s)) {
        kind = 'ult'; this.streak[s] = 0; st.ults++; isUlt = true;
        anim = (A.mv.ult && A.mv.ult[0]) || this.pickMove(A, A.mv.combo[0]);
        dmg = 0; lvl = 'ult';
      } else {
        const n = this.streak[s];
        crit = (WF.CFG.FEEL && WF.CFG.FEEL.FAST_CRIT) || this.rand() < this.critChance(s);
        kind = 'combo' + n + (crit ? '+crit' : '');
        dmg = C.COMBO_DMG[n - 1] * (crit ? C.CRIT_MULT : 1);
        lvl = crit ? 'crit' : (n >= 4 ? 'heavy' : n >= 2 ? 'mid' : 'light');
        anim = this.pickMove(A, A.mv.combo[n - 1]);
        kick = /kick/.test(anim);
      }
    } else if (sec <= this.slowS()) {
      this.slowStreak(s); kind = 'slow';
      crit = this.rand() < this.critChance(s);
      dmg = C.SLOW_DMG * (crit ? C.CRIT_MULT : 1);
      lvl = crit ? 'crit' : 'light';
      anim = this.pickMove(A, A.mv.slow); kick = /kick/.test(anim);
    } else {
      this.streak[s] = 0; kind = 'blocked';
      dmg = 0; lvl = 'block'; anim = A.mv.late; block = true;
    }
    if (this.camp && !ov) dmg = this.campPlayerDmg(s, kind, dmg, sec);
    if (this.camp && !ov && block && this.campIsReporter(D)) { block = false; lvl = 'light'; dmg = this.campPlayerDmg(s, kind, 1, sec); } // 记者：慢答也算答对
    if (!ov && dmg) dmg = Math.round(dmg * this.comboMult(s));
    // v1.2.1 出招分档（只换动作）：速答=短连段，普通=重拳，慢答=轻拳；伤害上面已经按原规则算好
    let leads = null;
    const HT = C.HIT_TIERS;
    if (HT && (this.camp ? HT.campaign : HT.versus) && !isUlt) {
      if (ov) leads = ov.leads || null;
      else if (kind.startsWith('combo')) {
        const n = Math.max(1, Math.min(4, this.streak[s] || 1));
        leads = HT.chainLead.filter(a => A.has(a) && a !== anim).slice(0, HT.chainN[n - 1] || 1); // 第 n 下速答：先垫 1~2 拳
        if (!leads.length) leads = null;
      } else if (kind === 'slow' && A.has(HT.normal)) { anim = HT.normal; kick = false; }
      else if (kind === 'blocked' && A.has(HT.slow)) anim = HT.slow;
    }
    const snappy = this.attackOpts(A, anim);
    this.pendingAttack = {
      side: s, speculative: !!opts.speculative, committed: false,
      kind, dmg, lvl, crit, anim, block, kick, isUlt, comboN: (this.ansCombo && this.ansCombo[s]) || ((kind && kind.startsWith('combo')) ? this.streak[s] || 1 : (isUlt ? 5 : 1)),
      snappy, held: false, leads,
    };
    this.say(`Q${q.n} P${s + 1} 答对 ${sec.toFixed(2)}s → ${kind}${opts.speculative ? '（抢先出招）' : ''}`);
    // 必杀不走抢先/角力窗口：立刻开演，避免被窗口取消或卡在循环蓄力上
    if (isUlt) {
      this.reveal(); this.state = 'resolve';
      const pa = this.pendingAttack;
      if (pa) { pa.committed = true; pa.finishing = true; pa.speculative = false; }
      this.run(this.ultSeq(A, D), 'attack');
      this.run(this.regroupSeq(A), 'regroup');
      this.run(this.nextSeq());
      return;
    }
    this.launchAttackAnim();
  }
  launchAttackAnim() {
    const pa = this.pendingAttack; if (!pa) return;
    const A = this.p[pa.side], D = this.p[1 - pa.side];
    if (pa.leads) { this.playChain(pa, 0, pa.speculative && !pa.committed); if (!pa.block && this.rand() < 0.5) WF.Audio.play('whoosh'); return; }
    const { from, speed, hitI } = pa.snappy;
    let ended = false, hit = false;
    const holdHit = pa.speculative && !pa.committed;
    pa.held = holdHit;
    A.play(pa.anim, {
      from, speed, to: holdHit ? Math.max(from, hitI - 1) : undefined, hold: holdHit,
      onEvent: (e, fi, f) => {
        if (e === 'hit' && !hit && pa.committed && !pa.isUlt) {
          hit = true; pa.hitDone = true;
          this.contact(A, D, f, { dmg: pa.dmg, lvl: pa.block ? 'block' : pa.lvl, crit: pa.crit, block: pa.block, kick: pa.kick, comboN: pa.comboN });
        }
      },
      onEnd: () => { ended = true; },
    });
    pa.endedRef = () => ended || this.ko;
    pa.markHit = () => { hit = true; pa.hitDone = true; };
    if (!pa.block && this.rand() < 0.5) WF.Audio.play('whoosh');
  }
  // v1.2.1 速答连段：先打 1~2 下「垫步拳」（只有火花和受击小抖，0 伤害），最后一下才是真正的命中和伤害
  playChain(pa, i, hold, fromHit) {
    const A = this.p[pa.side], D = this.p[1 - pa.side], HT = WF.CFG.HIT_TIERS;
    const seq = pa.leads.concat([pa.anim]), name = seq[i], last = i === seq.length - 1;
    const sn = this.attackOpts(A, name), len = (A.data.anims[name] || { frames: [1] }).frames.length;
    let ended = false, hit = false;
    const from = fromHit ? sn.hitI : i === 0 ? sn.from : Math.max(0, sn.hitI - 1);
    pa.held = !!hold; pa.chainI = i;
    if (last) { pa.endedRef = () => ended || this.ko; pa.markHit = () => { hit = true; pa.hitDone = true; }; }
    else if (!pa.endedRef || i === 0) pa.endedRef = () => this.ko;
    A.paused = false;
    A.play(name, {
      from, speed: last ? 2 : HT.leadSpeed,
      to: hold ? Math.max(from, sn.hitI - 1) : last ? undefined : Math.min(len - 1, sn.hitI + 1),
      hold: !!hold,
      onEvent: (e, fi, f) => {
        if (e !== 'hit' || hit || !pa.committed || this.ko) return;
        hit = true;
        if (last) { pa.hitDone = true; this.contact(A, D, f, { dmg: pa.dmg, lvl: pa.block ? 'block' : pa.lvl, crit: pa.crit, block: pa.block, kick: pa.kick, comboN: pa.comboN }); }
        else this.leadContact(A, D, f, i);
      },
      onEnd: () => { if (last) { ended = true; return; } if (hold) return; if (!this.ko && this.pendingAttack === pa) this.playChain(pa, i + 1, false); else pa.endedRef = () => true; },
    });
  }
  leadContact(A, D, f, i) {
    if (this.camp && (D !== this.p[1 - A.side] || D.hp <= 0)) return;
    const hp = A.hitPoint(f);
    WF.FX.spark(hp.x, hp.y, A.dir, 'hit', 0.55 + 0.15 * i);
    D.play('hit_swap', { to: 1 }); // 垫步拳不闪白，和真正命中区分开
    this.setHitstop(1, [D]); this.shakeAdd(0.8);
    WF.Audio.play('hit', { power: 0.6, pitch: 1.1 + 0.08 * i });
  }
  commitAttack() {
    const pa = this.pendingAttack;
    if (!pa || pa.finishing) return;
    const A = this.p[pa.side], D = this.p[1 - pa.side];
    pa.committed = true; pa.speculative = false; pa.finishing = true;
    this.reveal(); this.state = 'resolve';
    if (pa.isUlt) {
      this.run(this.ultSeq(A, D), 'attack');
      this.run(this.regroupSeq(A), 'regroup');
      this.run(this.nextSeq());
      return;
    }
    // 抢先出招停在命中前一帧：现在打出命中。已经在播完整动画的则接着等它命中即可。
    if (!pa.hitDone && pa.held && pa.leads) {
      this.playChain(pa, 0, false, true);
      this.run(this._waitThen(A, D, () => pa.endedRef(), pa), 'attack');
    } else if (!pa.hitDone && pa.held) {
      const { hitI } = pa.snappy;
      let ended = false, hit = false;
      A.paused = false;
      A.play(pa.anim, {
        from: hitI, speed: 2,
        onEvent: (e, fi, f) => {
          if (e === 'hit' && !hit) {
            hit = true; pa.hitDone = true;
            this.contact(A, D, f, { dmg: pa.dmg, lvl: pa.block ? 'block' : pa.lvl, crit: pa.crit, block: pa.block, kick: pa.kick, comboN: pa.comboN });
          }
        },
        onEnd: () => { ended = true; },
      });
      pa.held = false;
      this.run(this._waitThen(A, D, () => ended || this.ko, pa), 'attack');
    } else {
      this.run(this._waitThen(A, D, pa.leads ? () => pa.endedRef() : (pa.endedRef || (() => A.done || A.settled)), pa), 'attack');
    }
    this.run(this.regroupSeq(A), 'regroup');
    this.run(this.nextSeq());
  }
  *_waitThen(A, D, done, pa) {
    if (pa && pa.block) D.play('block', { loop: true });
    yield () => (done && done()) || this.ko;
    if (pa && !pa.hitDone && !this.ko) {
      this.contact(A, D, A.frame(), { dmg: pa.dmg, lvl: pa.block ? 'block' : pa.lvl, crit: pa.crit, block: pa.block, kick: pa.kick, comboN: pa.comboN });
      pa.hitDone = true;
    }
    if (this.ko) { yield* this.koSeq(); return; }
    yield () => A.settled && D.settled;
  }
  cancelSpeculative() {
    const pa = this.pendingAttack;
    if (!pa) return;
    const A = this.p[pa.side];
    A.paused = false; A.tween = null;
    this.clearTagged('attack');
    this.pendingAttack = null;
  }
  *nextSeq() {
    const wait = this.missOnly ? WF.CFG.REVEAL_WRONG : WF.CFG.REVEAL_MIN;
    yield () => this.q && this.t - this.q.revealT >= wait;
    if (!this.missOnly) yield WF.CFG.NEXT_Q_DELAY;
    if (!this.ko) this.newQuestion();
  }

  // ================= 打击 =================
  damage(A, D, amount) {
    const C = WF.CFG, thr = (D.maxHp || C.HP) * C.GUTS_RATIO;
    const guts = !(this.camp && !this.campGuts(D));
    let dmg = amount; if (this.camp) dmg = this.campTakenDmg(A, D, dmg);
    if (D.toughQ > 0) dmg *= (WF.CFG.ULT2.SAW.TOUGH_MULT || 1.5);   // v1.7 护甲被锯碎：韧性减半
    if (guts && D.hp <= thr) dmg *= C.GUTS_MULT;
    dmg = Math.round(dmg);
    let hp = D.hp - dmg;
    if (guts && D.hp > thr && hp <= 0) hp = 1; // 根性：一下打不死
    hp = Math.max(0, hp);
    const dealt = D.hp - hp; D.hp = hp; D.trailHold = 13;
    this.stats[A.side].dmg += dealt;
    if (this.camp) this.campAfterHurt(A, D, dealt);
    return D.hp <= 0;
  }
  setHitstop(n, targets) { this.hitstop = Math.max(this.hitstop, n); this.hsTargets = targets; }
  shakeAdd(n) { this.shake = Math.max(this.shake, n); }
  streetCam() { return this.camLock != null ? this.camLock : this.cam; }
  streetPad(f) {
    const base = (WF.CFG.CAMPAIGN.RUN && WF.CFG.CAMPAIGN.RUN.PAD) || 32;
    if (!f || !f.data) return base;
    const foot = f.data.foot || [24, 40], cell = f.data.cell || 50;
    return Math.max(base, Math.max(foot[0], cell - foot[0]) + 1);
  }
  streetFighting() {
    if (!(this.onStreet && this.onStreet())) return false;
    const ph = this.street.phase;
    return ph === 'fight' || ph === 'rest' || this.state === 'rest';
  }
  streetViewPad() { return Math.max(this.streetPad(this.p[0]), this.streetPad(this.p[1])); }
  // 擂台用台边；街上对词时用当前镜头左右边（加边距），避免击退把人推出钉住的画面
  worldLo() {
    const C = WF.CFG;
    if (this.streetFighting()) return this.streetCam() - C.VIEW_W / 2 + this.streetViewPad();
    return C.WALL_MARGIN;
  }
  worldHi() {
    const C = WF.CFG;
    if (this.streetFighting()) return this.streetCam() + C.VIEW_W / 2 - this.streetViewPad();
    if (this.onStreet && this.onStreet()) return this.cam + C.VIEW_W / 2 + 80;
    return C.STAGE_W - C.WALL_MARGIN;
  }
  push(D, A, dist, dur, dust = true, follow = false) {
    const C = WF.CFG, away = D.x > A.x ? 1 : -1, lo = this.worldLo(), hi = this.worldHi();
    const want = D.x + away * dist, got = Math.max(lo, Math.min(hi, want)), over = want - got;
    D.moveTo(got, dur, 'out', dust);
    const clampX = x => Math.max(lo, Math.min(hi, x));
    if (follow) A.moveTo(clampX(A.x + away * (dist - Math.abs(over))), dur, 'out', false);
    else if (Math.abs(over) > 0.5) A.moveTo(clampX(A.x - over), dur, 'out', dust); // 贴墙：反推攻击方
  }
  contact(A, D, f, o) {
    if (this.camp && (D !== this.p[1 - A.side] || D.hp <= 0)) return false; // 闯关：打在已倒下 / 已换下的敌人身上的残余命中帧不算
    if (this.camp && o.lvl === 'reporter') { this.campReporterFlash(A, D); return false; }
    const C = WF.CFG, hp = A.hitPoint(f), st = this.stats[A.side];
    if (o.block) {
      D.play('block_hit', { next: 'block_recover' });
      WF.FX.spark(hp.x, hp.y, A.dir, 'block', 1); WF.FX.ring(hp.x, hp.y, '#7fc8ff', 8, 8);
      this.setHitstop(C.HITSTOP.block, [D]); this.shakeAdd(C.SHAKE.block);
      WF.Audio.play('block'); this.push(D, A, C.KNOCK.block, 6);
      this.popWorld('防御', hp.x, hp.y - 12, '#8fd0ff', 26);
      return false;
    }
    const lvl = o.lvl, crit = !!o.crit, final = lvl === 'ultFinal';
    const ko = this.damage(A, D, o.dmg);
    st.hits++; if (crit) st.crits++;
    // 顿帧 + 受击闪白/闪红 + 抖动
    const mko = ko && this.camp && this.campIsMinion(D);
    this.setHitstop(ko ? (mko ? C.CAMPAIGN.MINION_KO_HITSTOP : C.HITSTOP.ko) : C.HITSTOP[lvl], [D]);
    D.flash = crit || final || ko ? 4 : 2; D.flashSeq = crit || final ? ['white', 'red', 'red', 'white'] : ['white', 'white'];
    // 火花（打在拳头接触点）
    const kind = final || ko ? 'ultFinal' : crit ? 'crit' : 'hit';
    WF.FX.spark(hp.x, hp.y, A.dir, kind, lvl === 'heavy' ? 1.3 : lvl === 'ult' ? 1.1 : 1);
    if (crit || final || ko) { WF.FX.ring(hp.x, hp.y, crit ? '#ff6a3c' : '#ffe066', final || ko ? 30 : 16, final ? 16 : 12); this.screenFlash = final || ko ? 4 : 2; }
    this.shakeAdd(ko ? (mko ? C.SHAKE.heavy : C.SHAKE.ko) : C.SHAKE[lvl]);
    this.excite = Math.max(this.excite, crit || final || ko || lvl === 'heavy' ? 40 : 10);
    WF.Audio.play('hit', { power: { light: 0.9, mid: 1, heavy: 1.2, crit: 1.3, ult: 1, ultFinal: 1.4 }[lvl] || 1, pitch: 0.88 + this.rand() * 0.24, kick: !!o.kick || /kick/.test(A.anim), crit: crit || final });
    if ((final || ko) && !mko) WF.Audio.play('boom'); else if (mko) WF.Audio.play('thud');
    if (lvl === 'ult') WF.Haptics.ultHit(); else if (final) WF.Haptics.ultFinal(); else if (crit) WF.Haptics.crit(); else if (this.humanSide(A.side) || this.humanSide(D.side)) WF.Haptics.hit();
    // 连击数
    const cn = o.comboN || 1;
    this.combo[A.side] = { n: cn, t: 0, crit, ult: lvl === 'ult' || final, label: cn >= 2 ? (cn + ' 连击！') : (crit ? null : null) };
    if (cn >= 2) this.combo[A.side].label = cn + ' 连击！';
    if (crit) this.popWorld('暴击！', hp.x, hp.y - 16, '#ffd23c', crit ? 38 : 34);
    if (ko) { this.startKO(A, D); return true; }
    // 受击反应 + 击退
    if (final) { D.play('back_launch_knockdown', { next: 'knocked_down_get_up' }); this.push(D, A, C.KNOCK.ultFinal, 22, true); }
    else { D.play(A.mv.burns && D.has('burned') && lvl !== 'ult' && A.frame().hr ? 'burned' : 'hit_swap', { loop: false }); this.push(D, A, C.KNOCK[lvl] || 4, lvl === 'ult' ? 4 : 7, lvl !== 'ult', !!o.follow); }
    return false;
  }
  startKO(W, L) {
    const C = WF.CFG;
    if (this.camp && this.campIsMinion(L)) { this.campMinionKO(W, L); return; }
    this.ko = { winner: W, loser: L }; this.matchEnd = this.t;
    if (this.camp && this.campDeathAnim) {
      // 闯关城市对手：倒地停留再淡出，不立刻播会化成残烟的 knocked_down_death
      L.play(this.campDeathAnim(L), { hold: true });
      this.push(L, W, C.KNOCK.ko, 26, true);
      if (this.campStartGroundDeath) this.campStartGroundDeath(L);
    } else {
      L.play('knocked_down_death', { hold: true }); this.push(L, W, C.KNOCK.ko, 26, true);
    }
    this.slow = 70; this.koText = 1; this.darkenTarget = 0; this.rumble = 0;
    WF.Haptics.ko();
    const tot = this.stats[0].correct + this.stats[1].correct;
    this.say(`KO! ${W.mv.name} 胜；全场答对 ${tot} 次（P1 ${this.stats[0].correct} / P2 ${this.stats[1].correct}），比赛时长 ${((this.matchEnd - this.matchStart) / C.FPS).toFixed(1)}s，题数 ${this.qn}`);
  }
  *koSeq() {
    const { winner: W, loser: L } = this.ko; this.state = 'ko'; this.queue.length = 1;
    if (this.ko.minion) { yield* this.campMinionOutSeq(); return; }
    yield () => L.done;
    yield () => W.anim === 'idle' || W.done;
    yield 18;
    // 临时测试街：这些挂钩小怪都没有庆祝帧。胜者带 minion 标记时不播 celebrate，直接结算。
    // 玩家打败街尾（大师兄/相扑）时，胜者（苏绫）仍按原表播庆祝。
    if (!(W && W.mv && W.mv.minion)) {
      W.play(W.has('celebrate') ? 'celebrate' : 'idle', Object.assign({ hold: true }, this.camp ? this.campCelebrateOpts(W) : {}));
      yield () => W.done || W.anim === 'idle';
      yield 40;
    }
    this.showResult();
  }
  showResult() {
    if (this.camp && this.campShowResult()) return;
    const C = WF.CFG, ko = this.ko || {};
    const W = ko.winner;
    this.state = 'result';
    const secs = this.matchStart != null ? (this.matchEnd - this.matchStart) / C.FPS : 0;
    this.result = { winner: ko.draw ? -1 : (W ? W.side : 0), draw: !!ko.draw, timeup: !!ko.timeup, secs, t: 0 };
    for (const s of [0, 1]) {
      const p = this.profileOf(s);
      if (!p) continue;
      if (ko.draw) WF.Profiles.markMatch(p.id, null);
      else if (W) WF.Profiles.markMatch(p.id, s === W.side);
      this.checkUnlocks([p.id]);   // v1.4：掌握词库解锁雪乃，可能在对战里达成
    }
    WF.Audio.stopMusic();
  }
  endByTime() {
    if (this.ko || this.result || this.state === 'result' || this.state === 'ko' || this.state === 'title') return;
    const a = this.p[0], b = this.p[1];
    const draw = a.hp === b.hp;
    const W = a.hp >= b.hp ? a : b;
    const L = W === a ? b : a;
    this.matchEnd = this.t;
    this.ko = { winner: W, loser: L, timeup: true, draw };
    this.queue.length = 0;
    this.pendingAttack = null;
    this.announce = { text: '时间到', sub: draw ? '平局' : (W.mv.name + ' 领先'), t: 0, life: 40 };
    this.say('时间到 ' + (draw ? '平局' : W.mv.name + ' 胜'));
    this.showResult();
  }

  // ================= 动作序列 =================
  *attackSeq(A, D, anim, o) {
    let hit = false, ended = false;
    if (o.block) D.play('block', { loop: true });
    A.play(anim, {
      onEvent: (e, fi, f) => { if (e === 'hit' && !hit) { hit = true; this.contact(A, D, f, o); } },
      onEnd: () => { ended = true; },
    });
    if (!o.block && this.rand() < 0.5) WF.Audio.play('whoosh');
    yield () => ended || this.ko;
    if (!hit && !this.ko) this.contact(A, D, A.frame(), o);
    if (this.ko) { yield* this.koSeq(); return; }
    yield () => A.settled && D.settled;
  }
  *whiffSeq(A, D) {
    let ended = false, missed = false;
    yield () => A.settled && D.settled;
    D.play('dodge_roll');
    A.play(this.pickMove(A, A.mv.combo[0]), {
      onEvent: (e, fi, f) => {
        if (e === 'hit' && !missed) {
          missed = true; const hp = A.hitPoint(f);
          WF.Audio.play('miss'); WF.FX.spark(hp.x, hp.y, A.dir, 'miss', 0.5);
          this.popWorld('MISS', hp.x, hp.y - 12, '#d6dcef', 28);
        }
      },
      onEnd: () => { ended = true; A.play('stunned', { to: 9 }); A.moveTo(A.x - A.dir * 4, 10, 'out', true); },
    });
    yield () => ended;
    yield () => A.settled && D.settled;
  }
  *regroupSeq(mover) {
    const C = WF.CFG, [a, b] = this.p;
    yield () => a.settled && b.settled;
    if (this.ko) return;
    // 街上不对词后走近/推开：槽位固定，击退只是 ox，自己收回
    if (this.onStreet && this.onStreet()) {
      if (this.campStreetHold) this.campStreetHold();
      return;
    }
    const GAP = this.gap(), diff = (b.x - a.x) - GAP;
    if (Math.abs(diff) < 0.6) return;
    if (diff > 0 && mover) {
      const other = this.other(mover), target = other.x - mover.dir * GAP;
      const d = Math.abs(target - mover.x), ticks = Math.max(4, Math.round(d / 2.2));
      mover.play('walk', { loop: true, speed: 1.8 }); mover.moveTo(target, ticks, 'lin');
      yield ticks;
      mover.x = target; mover.play('idle');
    } else {
      const mid = (a.x + b.x) / 2, ticks = 6;
      a.moveTo(mid - GAP / 2, ticks, 'out'); b.moveTo(mid + GAP / 2, ticks, 'out');
      yield ticks;
    }
  }
  *ultSeq(A, D) {
    const C = WF.CFG;
    if (A.mv.ultKind === 'rocket' && this.rocketUltSeq) { yield* this.rocketUltSeq(A, D); return; }   // v1.7 星舰升空
    // 打断抢先蓄力的 loop，避免永远等不到 settled；位移结束或已经在蓄力即可开演
    A.paused = false; D.paused = false;
    A.loop = false;
    let readyWait = 0;
    yield () => {
      readyWait++;
      const poseReady = A.anim === 'mega_charge_a' || A.settled || A.anim === 'idle';
      const defReady = !D.tween || D.settled;
      return (poseReady && defReady && !A.tween) || readyWait > 30;
    };
    // 超必杀演出：压暗 + 定格对手 + 横幅
    WF.Audio.play('superflash'); WF.Haptics.ultStart();
    this.darkenTarget = 0.7; this.banner = { text: A.mv.ultName, side: A.side, t: 0 };
    D.paused = true; A.flash = 0;
    if (A.mv.ultPose && A.has(A.mv.ultPose)) A.play(A.mv.ultPose, { to: 0, hold: true });   // v1.7.1 U1.1：米雷霸蓄力定在 saw_strip/000
    else if (A.has('mega_charge_a')) A.play('mega_charge_a', { to: 7, hold: true });
    for (let i = 0; i < 26; i++) { A.flash = (i % 6 < 2) ? 1 : 0; A.flashSeq = ['white']; yield 1; }
    A.flash = 0; D.paused = false;
    this.say(`必杀 ${A.mv.ultName} by P${A.side + 1}`);
    if (A.mv.ultPose) this.banner = null;   // v1.7.1：saw_strip 举锯会顶到横幅那一带，出招时收起横幅（蓄力时已经显示过）
    const anims = A.mv.ult.filter(n => A.has(n));
    const counts = anims.map(n => A.data.anims[n].frames.filter(f => (f.ev || []).includes('hit')).length || 1);
    const total = counts.reduce((x, y) => x + y, 0);
    const ULT = Math.round(this.ultDmg(A) * this.comboMult(A.side)), fin = Math.round(ULT * C.ULT_FINAL_SHARE), rest = ULT - fin;
    const dmgs = []; if (total === 1) dmgs.push(ULT); else for (let i = 0; i < total - 1; i++) dmgs.push(Math.floor(rest / (total - 1)) + (i < rest % (total - 1) ? 1 : 0)); if (total > 1) dmgs.push(fin);
    this.rumble = C.SHAKE.ultRumble;
    let k = 0;
    for (const anim of anims) {
      let ended = false;
      A.play(anim, {
        onEvent: (e, fi, f) => {
          if (e === 'hit' && !this.ko && k < total) {
            const final = k === total - 1;
            this.contact(A, D, f, { dmg: dmgs[k], lvl: final ? 'ultFinal' : 'ult', follow: !final, comboN: k + 1 });
            k++;
            if (final && !this.ko && A.mv.ultKind === 'saw' && this.sawBegin) this.sawBegin(A, D);   // v1.7.1 U1.1：saw_strip 命中帧 005 = 锯口 / 破甲开始
          }
        },
        onEnd: () => { ended = true; },
      });
      yield () => ended || this.ko;
      if (this.ko) break;
    }
    // 动画里命中帧数不足时补最后一击
    if (!this.ko && k < total) { this.contact(A, D, A.frame(), { dmg: dmgs.slice(k).reduce((x, y) => x + y, 0), lvl: 'ultFinal' }); }
    if (!this.ko && A.mv.ultKind === 'saw' && this.sawAfterSeq) yield* this.sawAfterSeq(A, D);   // v1.7 全面削减：锯道具栏 / 碎对手护甲
    this.rumble = 0; this.darkenTarget = 0; this.banner = null;
    D.paused = false; A.paused = false;
    if (this.ko) { yield* this.koSeq(); return; }
    let after = 0;
    yield () => { after++; return (A.settled && D.settled) || after > 90; };
    if (!A.settled && A.anim !== 'idle') A.play('idle');
    if (!D.settled && D.anim !== 'idle' && !this.ko) D.play('idle');
  }

  // ================= 角力 =================
  startClash() {
    const q = this.q; this.reveal(); this.state = 'clashIntro'; this.streak = [0, 0];
    this.say(`Q${q.n} 双方 ${this.clashWindowS()} 秒内都答对 → 角力`);
    this.run(this.clashIntroSeq());
  }
  clashPoint() { const [a, b] = this.p; return { x: (a.x + b.x) / 2 + 0.5, y: WF.CFG.GROUND_Y - 12 }; }
  clashSpark(power) {
    const C = WF.CFG, cp = this.clashPoint();
    WF.FX.spark(cp.x, cp.y, 1, 'clash', power); WF.FX.ring(cp.x, cp.y, '#ffe9a0', 14 + 10 * power, 12);
    this.setHitstop(Math.round(C.HITSTOP.clash * power), this.p.slice()); this.shakeAdd(C.SHAKE.clash * power);
    WF.Audio.play('clash', { power }); WF.Haptics.clash(); this.excite = 30;
  }
  *clashIntroSeq() {
    const [a, b] = this.p;
    a.paused = false; b.paused = false;
    yield* this.regroupSeq(null);
    let contact = false, ended = 0;
    a.play('clash_impact', { hold: true, onEvent: (e, fi) => { if (e === 'frame' && fi === 2 && !contact) { contact = true; this.clashSpark(1.2); } }, onEnd: () => ended++ });
    b.play('clash_impact', { hold: true, onEnd: () => ended++ });
    yield () => ended >= 2;
    a.play('clash_lock', { loop: true }); b.play('clash_lock', { loop: true });
    this.announce = { text: '角力！', sub: `先答对 ${WF.CFG.CLASH_WIN_COUNT} 题获胜`, t: 0, life: 45 };
    this.clash = { score: [0, 0], t: 0, n: 0, shift: 0 };
    this.state = 'clash'; this.newClashQ();
  }
  newClashQ() {
    const q = this.camp ? this.campNextQ() : this.source.next(); this.clash.n++;
    Object.assign(q, { t: 0, ans: [null, null], revealed: false, revealT: 0, n: this.qn, clash: true, wait: 0, flash: null });
    if (this.camp) this.campDecorateQ(q);
    this.q = q; this.cpuPlan(q, true);
    for (const s of [0, 1]) { const p = this.profileOf(s); if (p) WF.Profiles.markSeen(p.id, q); }
  }
  answerClash(s, idx) {
    const q = this.q, cl = this.clash;
    if (!q || q.revealed || q.ans[s]) return;
    if (q.erased === idx) return;
    const rec = { idx, t: q.t, ok: idx === q.correct }; q.ans[s] = rec;
    const st = this.stats[s]; st.answered++;
    q.flash = { idx, t: 0, ok: rec.ok, side: s };
    const prof = this.profileOf(s);
    const was = (this.camp && prof) ? (q.kind === 'phrase' ? WF.Profiles.phraseMastery(prof.id, q.bank, q.word) : WF.Profiles.mastery(prof.id, q.bank, q.word)) : null;
    if (prof) WF.Profiles.markAnswer(prof.id, q, rec.ok);
    if (this.camp && s === 0) this.campOnAnswer(q, rec, was);
    if (!rec.ok) {
      st.wrong++; WF.Audio.play('wrong'); if (this.humanSide(s)) WF.Haptics.wrong();
      if (this.menu.cpu && s === 0 && !q.ans[1] && q.cpu) { this.answer(1, q.cpu.idx); this.render(); return; }
      if (q.ans[1 - s] && !q.ans[1 - s].ok) { this.reveal(); q.wait = 18; }
      this.render();
      return;
    }
    st.correct++; st.sumT += q.t;
    cl.score[s]++; this.reveal(); q.winner = s; q.wait = 14;
    WF.Audio.play('correct'); WF.Audio.play('point', { n: cl.score[s] }); if (this.humanSide(s)) WF.Haptics.correct();
    // 顶一下：两人一起往输的一方挪 2 像素
    const dir = s === 0 ? 1 : -1; cl.shift += 2 * dir;
    this.p.forEach(f => f.moveTo(f.x + dir * 2, 4, 'out', true));
    this.clashSpark(0.55);
    this.say(`角力 P${s + 1} 得分 ${cl.score[0]}:${cl.score[1]}`);
    if (cl.score[s] >= WF.CFG.CLASH_WIN_COUNT) this.endClash(s);
    this.render();
  }
  updateClash() {
    const C = WF.CFG, cl = this.clash, q = this.q;
    cl.t++; q.t++;
    if (q.cpu && q.t === q.cpu.t && !q.ans[1]) this.answer(1, q.cpu.idx);
    if (this.state !== 'clash') return;
    if (cl.t >= C.CLASH_CAP_S * C.FPS) { this.endClash(null); return; }
    if (q.revealed) { if (--q.wait <= 0) this.newClashQ(); }
    else if (q.t >= 6 * C.FPS) { this.reveal(); q.wait = 12; }
  }
  endClash(w) {
    this.state = 'resolve'; this.clash.done = true;
    this.say(w === null ? '角力 15 秒到，平手' : `角力 P${w + 1} 胜`);
    if (w !== null) this.stats[w].clashWins++;
    this.run(this.clashFinishSeq(w));
    this.run(this.nextSeq());
  }
  *clashFinishSeq(w) {
    const C = WF.CFG, [a, b] = this.p;
    yield () => !a.tween && !b.tween;
    if (w === null) {
      this.announce = { text: '平手', sub: '谁也没占到便宜', t: 0, life: 40 };
      this.clashSpark(1);
      a.play('block_hit', { next: 'block_recover' }); b.play('block_hit', { next: 'block_recover' });
      a.moveTo(a.x - 6, 8, 'out', true); b.moveTo(b.x + 6, 8, 'out', true);
      yield () => a.settled && b.settled;
      yield* this.regroupSeq(null);
      this.clash = null; return;
    }
    const W = this.p[w], L = this.p[1 - w];
    let done = false, wEnd = false;
    W.play('clash_win', {
      onEvent: (e, fi, f) => {
        if (e === 'frame' && fi === 1 && !done) {
          done = true;
          const cp = this.clashPoint(), ko = this.damage(W, L, this.clashDmg(W));
          WF.FX.spark(cp.x, cp.y, W.dir, 'crit', 1.4); WF.FX.ring(cp.x, cp.y, '#ff6a3c', 26, 14);
          this.setHitstop(ko ? C.HITSTOP.ko : C.HITSTOP.clashWin, [L]); this.shakeAdd(C.SHAKE.clashWin); this.screenFlash = 3;
          L.flash = 4; L.flashSeq = ['white', 'red', 'red', 'white'];
          WF.Audio.play('hit', { power: 1.3, pitch: 0.9, crit: true }); WF.Audio.play('clash', { power: 0.8 }); WF.Haptics.crit();
          this.excite = 40; this.combo[w] = { n: 1, t: 0, label: '角力胜' };
          if (ko) { this.startKO(W, L); return; }
          L.play('clash_lose', { from: 2, to: 4, next: 'knocked_down', nextOpts: { from: 3, next: 'knocked_down_get_up' } });
          this.push(L, W, C.KNOCK.clashLose, 18, true);
        }
      },
      onEnd: () => { wEnd = true; },
    });
    L.play('clash_lose', { to: 1, hold: true });
    yield () => wEnd || this.ko;
    this.clash = null;
    if (this.ko) { yield* this.koSeq(); return; }
    yield () => W.settled && L.settled;
    yield* this.regroupSeq(W);
  }

  // ================= 界面跳转 =================
  goTitle() {
    if (this.camp) this.campExit();
    WF.Audio.startMusic({ keep: true });
    WF.Audio.play('back');
    if (WF.BookUI) WF.BookUI.hide();
    this.state = 'title'; this.ui.screen = 'title'; this.paused = false;
    this.q = null; this.clash = null; this.pendingAttack = null;
    this.spawnFighters(); this.layoutTitle();
  }
  // v1.4 选角：ui.step 0 = P1（或单人），1 = 双人对战的 P2；ui.sel = ROSTER 下标
  charselMode() { return this.ui.then === 'campaign' ? 'camp' : (this.menu.cpu ? 'cpu' : 'pvp'); }
  charselPid() { return this.ui.step === 1 ? this.menu.p2 : this.menu.p1; }
  goCharSel(then) {
    WF.Audio.play('confirm');
    const R = WF.CFG.ROSTER;
    this.state = 'title'; this.ui.screen = 'charsel'; this.ui.then = then || ''; this.ui.step = 0; this.ui.deny = null;
    const mode = this.charselMode();
    this.checkUnlocks(mode === 'pvp' ? [this.menu.p1, this.menu.p2] : [this.menu.p1]);
    let cur = mode === 'pvp' ? (this.menu.vs || [])[0] : this.menu.char;
    if (!WF.Unlocks.has(this.menu.p1, cur)) cur = 'suling';
    this.ui.sel = Math.max(0, R.indexOf(cur));
    if (mode === 'cpu' && (!this.menu.cpuChar || this.menu.cpuChar === cur)) this.rollCpuChar(cur);
    this.charselPreview();
  }
  // 背景里两个人跟着光标换（不改设置）
  charselPreview() {
    const R = WF.CFG.ROSTER, id = R[this.ui.sel] || 'suling', mode = this.charselMode();
    let pair;
    if (mode === 'pvp') pair = this.ui.step === 1 ? [this.menu.vs[0], id] : [id, this.menu.vs[1] !== id ? this.menu.vs[1] : (id === 'mrj' ? 'suling' : 'mrj')];
    else if (mode === 'cpu') pair = [id, this.menu.cpuChar && this.menu.cpuChar !== id ? this.menu.cpuChar : (id === 'mrj' ? 'suling' : 'mrj')];
    else { const KC = WF.CFG.CAMPAIGN, c = KC.CITIES[KC.ROUTE[0]]; pair = [id, this.campOppFor(id, c)]; }
    this.chars = pair;
    this.p = [new WF.Fighter(pair[0], 0), new WF.Fighter(pair[1], 1)];
    this.layoutTitle();
  }
  charselMove(d) {
    const n = WF.CFG.ROSTER.length;
    this.ui.sel = (this.ui.sel + d + n) % n; this.ui.deny = null;
    this.charselPreview(); WF.Audio.play('menu');
  }
  // 选中的角色能不能确定：没解锁 / 双人里被 P1 选走了 都不行
  charselBlock(i) {
    const id = WF.CFG.ROSTER[i];
    if (!WF.Unlocks.has(this.charselPid(), id)) return 'locked';
    if (this.charselMode() === 'pvp' && this.ui.step === 1 && id === this.menu.vs[0]) return 'taken';
    return null;
  }
  charselBack() {
    WF.Audio.play('back');
    if (this.charselMode() === 'pvp' && this.ui.step === 1) { this.ui.step = 0; this.ui.sel = Math.max(0, WF.CFG.ROSTER.indexOf(this.menu.vs[0])); this.ui.deny = null; this.charselPreview(); return; }
    this.ui.screen = 'title'; this.menu.row = 0; this.applyChars(); this.spawnFighters(); this.layoutTitle();
  }
  goProfiles(side, then) {
    WF.Audio.play('confirm');
    this.state = 'title'; this.ui.screen = 'profiles'; this.ui.side = side == null ? 0 : side;
    this.ui.sel = 0; this.ui.confirm = null; this.ui.then = then || ''; this.ui.sub = 'list';
  }
  goBook() {
    if (!this.menu.p1) { this.goProfiles(0, 'book'); return; }
    WF.Audio.play('confirm');
    this.state = 'title'; this.ui.screen = 'book'; this.ui.page = 0; this.ui.query = ''; this.ui.bank = this.menu.bank; this.ui.sel = 0; if (window.WF.Speech) WF.Speech.stop();
    if (WF.BookUI) WF.BookUI.open(this, 'book');
  }
  goWrong() {
    if (!this.menu.p1) { this.goProfiles(0, 'wrong'); return; }
    WF.Audio.play('confirm');
    this.state = 'title'; this.ui.screen = 'wrongbook'; this.ui.page = 0; this.ui.bankFilter = 'all'; this.ui.sel = 0; if (window.WF.Speech) WF.Speech.stop();
    if (this.bankBg) this.bankBg(this.wrongBanks(WF.Profiles.wrongList(this.menu.p1, 'all')));   // v1.8 错题涉及的按需词库后台下载（补全例句）
    if (WF.BookUI) WF.BookUI.open(this, 'wrong');
  }
  humanSide(s) { return s === 0 || (!this.menu.cpu && !this.camp); }   // v1.8.1 震动只给真人：电脑陪练的 P2 答题不震
  ipaText(w) {
    if (!w) return '';
    if (w.ipa && w.ipaUk) return '/' + w.ipa + '/    英 /' + w.ipaUk + '/';
    if (w.ipa) return '/' + w.ipa + '/';
    if (w.ipaUk) return '/' + w.ipaUk + '/';
    return '';
  }
  lookupBankWord(bankId, word) {
    const b = this.banks.find(x => x.id === bankId);
    return (b && b.words.find(w => w.word === word)) || null;
  }
  enrichEntry(h) {
    if (!h || h.kind === 'phrase' || h.kind === 'math' || h.bank === 'math') return h;
    const w = this.lookupBankWord(h.bank, h.word);
    return w ? Object.assign({}, w, h) : h;
  }
  exampleParts(w) {
    if (!w) return { en: '', zh: '' };
    let en = w.ex || w.example || '';
    let zh = w.exZh || '';
    if (en.indexOf('::') >= 0) {
      const i = en.indexOf('::');
      const maybeZh = en.slice(i + 2).trim();
      en = en.slice(0, i);
      if (!zh) zh = maybeZh;
    }
    en = (WF.Speech && WF.Speech.cleanText) ? WF.Speech.cleanText(en) : String(en).trim();
    zh = String(zh || '').trim();
    return { en, zh };
  }
  speakEntry(entry, what) {
    if (what === 'ex') return false; // 例句不再朗读
    if (!entry || entry.kind === 'math' || entry.bank === 'math') return false;
    if (!WF.Speech || !entry.word) return false;
    return WF.Speech.speak(entry.word);
  }
  bookPageSize() { return 8; }
  wrongPageSize() { return 5; }
  bookWords() {
    const b = this.banks[this.ui.bank]; if (!b) return [];
    if (b.lazy && !b.loaded) { if (this.bankBg) this.bankBg([b]); return []; }   // v1.8 按需词库：后台下载，下完自动刷新
    const q = (this.ui.query || '').trim().toLowerCase();
    let w = b.words;
    if (q) w = w.filter(x => x.word.toLowerCase().includes(q) || WF.Quiz.senses(x).some(s => (s.zh || '').includes(q)));
    if (q) { const r = x => { const l = x.word.toLowerCase(); return l === q ? 0 : l.startsWith(q) ? 1 : 2; }; w = w.slice().sort((a, b) => r(a) - r(b)); } // 完全匹配排最前
    return w;
  }
  confirmChar() {
    const R = WF.CFG.ROSTER, id = R[this.ui.sel], mode = this.charselMode();
    const why = this.charselBlock(this.ui.sel);
    if (why) { this.ui.deny = { why, t: this.t }; WF.Audio.play('wrong'); return; }
    WF.Audio.play('confirm');
    if (mode === 'pvp') {
      this.menu.vs = (this.menu.vs || [WF.CFG.P1_CHAR, WF.CFG.P2_CHAR]).slice();
      if (this.ui.step === 0) {
        this.menu.vs[0] = id; this.ui.step = 1;
        let j = R.indexOf(this.menu.vs[1]);
        if (j < 0 || this.charselBlock(j)) j = R.findIndex((x, k) => !this.charselBlock(k));
        this.ui.sel = Math.max(0, j); this.ui.deny = null; this.charselPreview();
        return;
      }
      this.menu.vs[1] = id;
    } else {
      this.menu.char = id;
      if (mode === 'cpu' && this.menu.cpuChar === id) this.rollCpuChar(id);
    }
    this.persistMenu();
    if (this.ui.then === 'start') this.startMatch(this.menu.wrongMatch);
    else if (this.ui.then === 'campaign') this.startCampaign();
    else { this.applyChars(); this.spawnFighters(); this.layoutTitle(); this.ui.screen = 'title'; }
  }

  onStreet() { return !!(this.street && this.street.on); }
  camFollowX() {
    const C = WF.CFG, slot = (this.camp && WF.CFG.CAMPAIGN.RUN && WF.CFG.CAMPAIGN.RUN.SLOT) || (1 / 3);
    return this.p[0].x + C.VIEW_W / 2 - C.VIEW_W * slot;
  }
  camMid() {
    if (this.onStreet()) return this.camFollowX();
    return (this.p[0].x + this.p[1].x) / 2;
  }
  // ================= 主循环 =================
  update() {
    this.t++; WF.frameNo++;
    if (this.unlockShow.length) { const u = this.unlockShow[0]; if (++u.t > 240) this.unlockShow.shift(); }
    if (this.state === 'title') { this.fighters().forEach(f => f.step()); WF.FX.update(); return; }
    if (this.camp && this.campUpdate()) return;
    if (this.paused || this.state === 'result') { if (this.result) this.result.t++; this.fighters().forEach(f => { if (this.state === 'result') f.step(); }); return; }
    if (this.slow > 0) { this.slow--; if (this.slow % 3 !== 0) { this.decay(); return; } }
    WF.FX.update(); this.decay();
    if (this.hitstop > 0) {
      this.hitstop--;
      for (const f of this.fighters()) { f.jitter = this.hsTargets.includes(f) ? 1 : 0; if (f.flash > 0) f.flash--; }
      return;
    }
    for (const f of this.fighters()) { f.jitter = 0; if (f.flash > 0) f.flash--; }
    this.runQueue();
    for (const f of this.fighters()) f.step();
    if (this.state === 'question') this.updateQuestion();
    else if (this.state === 'clash') this.updateClash();
    if (WF.Standoff) WF.Standoff.tick(this); // 纯表现：出题时的对峙虚晃
    if ((this.state === 'question' || this.state === 'clash') && this.matchLeft() === 0) this.endByTime();
    if (this.camp) this.campTick();
    // 镜头：跑街只由奔跑推进（campStreetTick 改 this.cam），对词时钉住，绝不跟角色
    const C = WF.CFG;
    if (this.onStreet()) {
      if (this.camLock != null) this.cam = this.camLock;
    } else {
      const mid = this.camLock != null ? this.camLock : this.camMid();
      const tgt = Math.max(C.VIEW_W / 2, Math.min(C.STAGE_W - C.VIEW_W / 2, mid));
      this.cam += (tgt - this.cam) * 0.12;
    }
  }
  decay() {
    // 屏幕震动（随机方向，指数衰减）+ 大招持续低频震
    const amp = Math.max(this.shake, this.rumble);
    this.shakeX = (Math.random() * 2 - 1) * amp; this.shakeY = (Math.random() * 2 - 1) * amp * 0.6;
    this.shake *= 0.84; if (this.shake < 0.4) this.shake = 0;
    this.darken += (this.darkenTarget - this.darken) * 0.2;
    if (this.screenFlash > 0) this.screenFlash--;
    if (this.excite > 0) this.excite--;
    for (const f of this.fighters()) {
      if (f.trailHold > 0) f.trailHold--; else if (f.trail > f.hp) f.trail = Math.max(f.hp, f.trail - (f.maxHp || WF.CFG.HP) * 0.024);
      if (f.trail < f.hp) f.trail = f.hp;
    }
    for (const c of this.combo) if (c) c.t++;
    if (this.announce) { this.announce.t++; if (this.announce.t > this.announce.life) this.announce = null; }
    if (this.rating) { this.rating.t++; if (this.rating.t > this.rating.life) this.rating = null; }
    if (this.banner) this.banner.t++;
    if (this.koText) this.koText++;
    this.pops = this.pops.filter(p => ++p.t < p.life);
    if (this.q && this.q.flash) this.q.flash.t++;
  }
  popWorld(text, wx, wy, color, size) { this.pops.push({ text, wx, wy, color, size, t: 0, life: 34 }); }
};
