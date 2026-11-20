// v2.1 批次 B：今日踢馆 / 掌握进度 / 听音 + 填空题型 / 转盘倒计时（js/v21_kick.js、js/v21_qtypes.js、js/v21_flow.js）
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
  key: i => [...store.keys()][i] ?? null, get length() { return store.size; }, clear: () => store.clear(),
};
require('../js/config.js');
require('../data/banks.js');
require('../data/word_levels.js');
require('../js/quiz.js');
require('../js/profiles.js');
require('../js/source.js');
WF.CFG.CAMPAIGN.WHEEL = { R: 56, SCALE: 3, SPIN_TICKS: 150, TURNS: 5, HOLD: 45, IDLE_AUTO: 0 };
WF.Audio = { play() {}, sfxOn: true };
WF.Buttons = { plate() {} };
const calls = [];
WF.Game = class {};
Object.assign(WF.Game.prototype, {
  homeButtons() { return [{ key: 'start' }, { key: 'book', group: 'study' }, { key: 'wrongbook', group: 'study' }, { key: 'settings' }]; },
  menuAct(k) { calls.push('act:' + k); },
  startCampaign() {}, campNextQ() { return this.source.next(); }, endQuestion() {}, drawProfiles() {}, drawTitle() {}, drawResult() {}, drawPanel() {},
  qtypeName() { return 'base'; }, persistMenu() { calls.push('persist'); }, goProfiles() {},
  goTitle() { this.state = 'title'; this.ui.screen = 'title'; },
  startMatch() { this.state = 'intro'; this.p = [{ mv: { name: 'A' }, hp: 800 }, { mv: { name: 'B' }, hp: 800 }]; this.source = this.makeSrc ? this.makeSrc() : null; },
  showResult() { this.state = 'result'; this.result = { winner: this._winner, draw: false, t: 0 }; },
  answerNormal(s, idx) { const q = this.q; q.ans[s] = { ok: idx === q.correct, t: 30 }; if (s === 0) WF.Profiles.markAnswer(this.menu.p1, q, q.ans[s].ok); },
  damage(A, D, amt) { D.hp -= amt; return D.hp <= 0; }, pickMove() { return 'punch'; }, *attackSeq() {}, run(gen) { (this.runs = this.runs || []).push(gen); },
  newQuestion() {}, input() { return false; }, fastS() { return 5; }, slowS() { return 10; },
  wheelTick() { const w = this.wheel; w.t++; if (w.phase === 'spin' && w.t >= 150) { w.phase = 'done'; w.t = 0; } else if (w.phase === 'done' && w.t >= WF.CFG.CAMPAIGN.WHEEL.HOLD) this.wheelEnd(); },
  wheelSpin() { const w = this.wheel; if (w.phase === 'idle') { w.phase = 'spin'; w.t = 0; } else if (w.phase === 'spin') w.t = 150; else if (w.phase === 'done' && w.t > 12) this.wheelEnd(); },
  wheelEnd() { this.wheel = null; this.ended = (this.ended || 0) + 1; }, drawWheel() {},
});
require('../js/v20_wordlevel.js');
require('../js/v21_memory.js');
require('../js/v21_kick.js');
require('../js/v21_qtypes.js');
require('../js/v21_flow.js');
const M = WF.Memory, P = WF.Profiles, DAY = 86400000, C = WF.CFG;
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let clock = new Date(2026, 10, 21, 9, 0, 0).getTime();
M.now = () => clock;
P.load();
const pid = P.data.profiles[0].id;
const cet4 = WF_BANKS.find(b => b.id === 'cet4'), cet6 = WF_BANKS.find(b => b.id === 'cet6');
const answer = (word, ok, bank = 'cet4') => { M.ctx = { t: 2, fast: 5, slow: 10 }; P.markAnswer(pid, { kind: 'word', bank, word, meaning: 'x' }, ok); M.ctx = null; };
const game = () => {
  const g = new WF.Game();
  Object.assign(g, { banks: WF_BANKS, menu: { p1: pid, char: 'suling', mode: 'mix', cpu: false, cpuChar: 'mrj', roundTime: 90, wrongMatch: false, bank: 2 }, ui: { screen: 'title' }, rnd: rng(7), t: 0 });
  g.rand = g.rnd; g.bank = cet4; g.diffCpu = () => g.menu.diffCpu || 'easy';
  return g;
};

test('今日踢馆 queue: overdue first, max 20, topped up with risky words to 15, frozen for the day', () => {
  const g = game();
  assert.equal(g.kickState(pid), 'empty', 'fresh player → friendly empty state');
  const words = cet4.words.slice(0, 30).map(w => w.word);
  words.forEach((w, i) => answer(w, true));          // all scheduled tomorrow
  clock += 2 * DAY;                                   // 30 due
  delete P.ext(pid).kick;
  let k = g.kickQueue(pid);
  assert.equal(k.words.length, 20); assert.ok(k.words.every(e => e.src === 'due'));
  assert.equal(g.kickState(pid), 'ready');
  assert.ok(g.homeButtons().find(b => b.key === 'kick' && b.group === 'study' && b.dot), 'main menu entry with dot');
  answer(words[25], false);                           // more changes today do not reshuffle the frozen queue
  assert.equal(g.kickQueue(pid), k);
  // next day: only 3 due + risky words fill up to 15
  clock += DAY; P.get(pid).history = {}; delete P.ext(pid).kick;
  cet4.words.slice(100, 103).forEach(w => answer(w.word, true));
  cet4.words.slice(200, 220).forEach(w => answer(w.word, false));
  clock += 2 * DAY; cet4.words.slice(200, 220).forEach(w => { P.get(pid).history['cet4\t' + w.word].m.next = clock + 5 * DAY; });
  k = g.kickQueue(pid);
  assert.equal(k.words.filter(e => e.src === 'due').length, 3);
  assert.equal(k.words.length, 15, 'topped up to 15 with risky words');
});

test('今日踢馆 fight: guardian with thick HP, queue source re-asks misses, win marks done + reward once per day', () => {
  const g = game();
  const k = g.kickQueue(pid), pts0 = P.ext(pid).points;
  g.bankGate = () => false;
  g.kickStart();
  assert.ok(g.dailyKick); assert.equal(g.menu.cpu, true); assert.equal(g.menu.mode, 'word'); assert.notEqual(g.menu.cpuChar, 'suling');
  assert.equal(g.p[1].maxHp, g.kickHp(k.words.length)); assert.ok(g.p[1].maxHp >= C.HP);
  WF.game = g;
  const src = g.source, seen = new Set(), N = k.words.length, A = g.p[0], E = g.p[1];
  A.hp = 800; A.mv = { combo: [[]] }; E.hp = E.maxHp;
  const ask = () => { const q = g.source.next(); q.ans = [null, null]; g.q = q; g.state = 'question'; return q; };
  // 3 deliberate misses (each fixed on the re-ask), one word answered inside a 角力 (markAnswer only), everything else normal
  let n = 0; const miss = new Set();
  while (!src.exhausted && n < 100) {
    const q = ask(); n++; if (q.kick) seen.add(q.word);
    if (q.kick && miss.size < 3 && !q.kick.miss && !miss.has(q.word)) { miss.add(q.word); g.answerNormal(0, (q.correct + 1) % 4); continue; }
    if (n === 7) { P.markAnswer(pid, q, true); continue; }   // 角力里答对：不经过 answerNormal
    g.answerNormal(0, q.correct);
    const before = E.hp, ko = g.damage(A, E, 999);      // normal hit visuals; HP follows the list
    assert.equal(E.hp, g.kickTargetHp()); assert.ok(E.hp <= before);
    if (src.exhausted) assert.equal(ko, true, 'last listed word KOs');
  }
  assert.equal(seen.size, N, 'every listed word asked');
  assert.equal(n, N + 3, '20 words + 3 re-asks');
  assert.equal(src.correct, N); assert.equal(E.hp, 0);
  assert.match(g.qtypeName(), new RegExp('已复习 ' + N + ' / ' + N));
  // 一直答错：最多补考 EXTRA 次，然后词单考完 → 守馆人收尾倒下；答过的错词照样记进记忆
  g.state = 'result'; g.startMatch();
  const s2 = g.source, E2 = g.p[1]; g.p[0].hp = 800; g.p[0].mv = { combo: [[]] }; E2.hp = E2.maxHp;
  let m = 0, timeouts = 0;
  while (!s2.exhausted && m < 200) {
    const q = ask(); m++;
    if (m % 4 === 0) { timeouts++; g.endQuestion(); continue; }   // 超时没答
    g.answerNormal(0, (q.correct + 1) % 4);
  }
  assert.equal(m, N + C.KICK.EXTRA, 'capped at N + EXTRA questions: ' + m + ' n=' + N);
  assert.equal(s2.correct, 0); assert.equal(g.kickTargetHp(), 0);
  const h = P.get(pid).history[s2.words[0].bank + '\t' + s2.words[0].word]; assert.ok(h.m && h.m.lv === 0, 'failed words scheduled in memory');
  g.runs = []; g.ko = null; g.newQuestion();
  assert.equal(g.state, 'resolve'); assert.equal(g.runs.length, 1, 'finisher attack instead of another question');
  // 守馆人打倒玩家：照常判负，当天可再来
  g.runs = []; g._winner = 1; g.showResult();
  assert.equal(g.result.kick.win, false); assert.equal(g.kickState(pid), 'ready', 'loss → can retry today');
  g.startMatch();                                      // Enter on result = retry
  g._winner = 0; g.showResult();
  assert.equal(g.result.kick.win, true); assert.equal(g.result.kick.reward, C.KICK.REWARD);
  assert.equal(P.ext(pid).points, pts0 + C.KICK.REWARD); assert.equal(g.kickState(pid), 'done');
  g.startMatch();                                      // Enter after win → back to the kick page, menu restored
  assert.equal(g.dailyKick, null); assert.equal(g.ui.screen, 'kick');
  assert.equal(g.menu.mode, 'mix'); assert.equal(g.menu.cpu, false); assert.equal(g.menu.roundTime, 90); assert.equal(g.menu.cpuChar, 'mrj');
  g.kickStart(); assert.equal(g.dailyKick, null, 'only once per day');
  assert.equal(P.ext(pid).points, pts0 + C.KICK.REWARD);
});

test('mastery progress: 3 different days → counted for 四级 x / 4431', () => {
  const g = game();
  const before = g.masteryLine(pid, cet4);
  assert.equal(before.name, '四级'); assert.equal(before.total, cet4.words.length);
  const w = cet4.words[400].word;
  for (let d = 0; d < 3; d++) { answer(w, true); clock += DAY; }
  assert.equal(g.masteryLine(pid, cet4).done, before.done + 1);
  assert.equal(M.progress(pid, 'cet4').done, before.done + 1);
});

test('cloze masking: inflections masked, derived forms rejected, most CET-4/6 words usable', () => {
  const m = WF.Cloze.mask;
  assert.equal(m('She abandoned the car.', 'abandon'), 'She _____ the car.');
  assert.equal(m('They stopped running.', 'stop'), 'They _____ running.');
  assert.equal(m('He studies hard.', 'study'), 'He _____ hard.');
  assert.equal(m('I am making a cake.', 'make'), 'I am _____ a cake.');
  assert.equal(m('The abandonment was sad.', 'abandon'), null);
  assert.equal(m('She was unhappy.', 'happy'), null);
  assert.equal(m('He went home.', 'go'), null);
  for (const b of [cet4, cet6]) {
    let ok = 0;
    for (const w of b.words) {
      const ex = WF.Quiz.senses(w).flatMap(s => s.ex || []).filter(WF.Quiz.okEx);
      const hit = ex.map(e => m(e.en, w.word)).find(Boolean);
      if (hit) { ok++; const stem = w.word.toLowerCase().replace(/(e|y|ie)$/, ''); assert.ok(stem.length < 4 || !hit.toLowerCase().includes(stem), w.word + ': ' + hit); }
    }
    assert.ok(ok / b.words.length > 0.95, b.id + ' ' + ok);
  }
});

test('listening / cloze only in boss fights, 困难 / 修罗; moderate share; silent fallback without voice', () => {
  const g = game();
  g.source = new WF.WordSource(cet4, rng(3));
  const qs = () => { const q = g.source.next(); return g.qSpecial(q); };
  // 双人 / 简单陪练 / 联机 / 踢馆：不出
  g.menu.cpu = false; for (let i = 0; i < 200; i++) assert.ok(!['listen', 'cloze'].includes(qs().fmt));
  g.menu.cpu = true; g.menu.diffCpu = 'easy'; for (let i = 0; i < 200; i++) assert.ok(!['listen', 'cloze'].includes(qs().fmt));
  g.menu.diffCpu = 'hard'; g.netLive = true; for (let i = 0; i < 200; i++) assert.ok(!['listen', 'cloze'].includes(qs().fmt));
  g.netLive = false;
  // 没有语音（不支持又断网）：不出听音，只出填空
  WF.Speech = undefined;
  let n = 0, listen = 0, cloze = 0;
  for (let i = 0; i < 3000; i++) { const q = qs(); if (q.kind !== 'word') continue; n++; if (q.fmt === 'listen') listen++; if (q.fmt === 'cloze') cloze++; }
  assert.equal(listen, 0); assert.ok(cloze > 0);
  WF.Speech = { supported: true, hasVoice: () => true, speak() {} };
  n = 0; listen = 0; cloze = 0; let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const q = qs(); if (q.kind !== 'word') continue; n++;
    if (q.fmt === 'listen') { listen++; assert.ok(!q.ex); assert.ok(/\p{Script=Han}/u.test(q.options[q.correct])); }
    if (q.fmt === 'cloze') {
      cloze++; assert.equal(q.options[q.correct], q.word); assert.match(q.cloze.masked, /_____/);
      assert.equal(q.bank, 'cet4'); checked++;
    }
  }
  const share = (listen + cloze) / n;
  assert.ok(listen > 0 && cloze > 0); assert.ok(share > 0.08 && share < 0.25, 'share ' + share.toFixed(3));
  // 闯关首领战：普通难度也出；小怪 + 普通难度不出
  const h = game(); h.camp = { diff: 'normal' }; h.diffCamp = () => 'normal'; h.source = new WF.WordSource(cet4, rng(5));
  h.p = [{ mv: {} }, { mv: { minion: true } }]; assert.equal(h.qSpecialOn(), false);
  h.p[1].mv.minion = false; assert.equal(h.qSpecialOn(), true);
  h.p[1].mv.minion = true; h.diffCamp = () => 'shura'; assert.equal(h.qSpecialOn(), true);
  h.dailyKick = {}; assert.equal(h.qSpecialOn(), false);
  // 非四六级词库：不出填空
  const j = game(); j.menu.cpu = true; j.menu.diffCpu = 'hard'; const jr = WF_BANKS.find(b => b.id === 'junior'); j.source = new WF.WordSource(jr, rng(9)); WF.Speech = undefined;
  for (let i = 0; i < 500; i++) { const q = j.qSpecial(j.source.next()); assert.notEqual(q.fmt, 'cloze'); }
});

test('fate wheel: spins by itself, 2 s countdown after it stops, a press skips', () => {
  const g = game();
  g.wheel = { phase: 'idle', t: 0 };
  for (let i = 0; i < C.FLOW.WHEEL_AUTO; i++) g.wheelTick();
  assert.equal(g.wheel.phase, 'spin', 'auto-spin without a press');
  for (let i = 0; i < 150; i++) g.wheelTick();
  assert.equal(g.wheel.phase, 'done');
  assert.equal(C.CAMPAIGN.WHEEL.HOLD, 2 * C.FPS);
  g.wheelSpin(); assert.ok(g.wheel, 'press right at the stop is ignored (no accidental skip)');
  for (let i = 0; i < 10; i++) g.wheelTick();
  g.wheelSpin(); assert.equal(g.wheel, null, 'press skips the countdown');
  g.wheel = { phase: 'done', t: 0 }; g.ended = 0;
  for (let i = 0; i < 2 * C.FPS; i++) g.wheelTick();
  assert.equal(g.ended, 1, 'auto-continues after 2 s');
});
