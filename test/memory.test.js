// v2.1 批次 A：记忆状态 / 速度打分 / 混合出词 / 存档导出导入 / 词库拆分（js/v21_memory.js、js/v21_save.js、tools/split_banks.js）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

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
WF.Game = class {};
Object.assign(WF.Game.prototype, { startCampaign() {}, campNextQ() {}, startMatch() {}, answerNormal() {}, endQuestion() {}, drawProfiles() {} });
require('../js/v20_wordlevel.js');
require('../js/v21_memory.js');
require('../js/v21_save.js');
const M = WF.Memory, P = WF.Profiles, DAY = 86400000;
const bank = id => WF_BANKS.find(b => b.id === id);
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let clock = new Date(2026, 10, 21, 9, 0, 0).getTime();
M.now = () => clock;
P.load();
const pid = P.data.profiles[0].id;
const fast = { t: 2, fast: 5, slow: 10 }, mid = { t: 7, fast: 5, slow: 10 }, slow = { t: 14, fast: 5, slow: 10 };
const q = word => ({ kind: 'word', bank: 'cet4', word, meaning: 'x', pos: 'n.' });
const answer = (word, ok, info) => { M.ctx = info || null; P.markAnswer(pid, q(word), ok); M.ctx = null; return P.get(pid).history['cet4\t' + word].m; };

test('interval ladder 1 → 3 → 7 → 15 days on fast answers; not-due answers do not move it', () => {
  let m = answer('ability', true, fast);
  assert.equal(m.lv, 0); assert.equal(m.next, clock + DAY);
  m = answer('ability', true, fast);   // same day, not due
  assert.equal(m.lv, 0); assert.equal(m.next, clock + DAY, 'not due → interval unchanged');
  for (const [lv, d] of [[1, 3], [2, 7], [3, 15], [3, 15]]) {
    clock = m.next + 1000; m = answer('ability', true, fast);
    assert.equal(m.lv, lv); assert.equal(m.next, clock + d * DAY);
  }
  assert.ok(m.avgT > 1.9 && m.avgT < 2.1);
});

test('mid speed shortens the interval, a last-second answer drops a level, a miss resets it', () => {
  let m = answer('absorb', true, fast); clock = m.next + 1;
  m = answer('absorb', true, fast); assert.equal(m.lv, 1); clock = m.next + 1;
  m = answer('absorb', true, mid); assert.equal(m.lv, 2); assert.equal(m.next, clock + Math.round(7 * 0.6) * DAY);
  clock = m.next + 1; m = answer('absorb', true, slow); assert.equal(m.lv, 1, 'last-second → one level down'); assert.equal(m.next, clock + 3 * DAY);
  m = answer('absorb', false, fast); assert.equal(m.lv, 0); assert.equal(m.next, clock, 'wrong → due now');
  assert.equal(P.get(pid).history['cet4\tabsorb'].inBook, true, 'wrong-book logic untouched');
});

test('mastery needs correct answers on 3 different days', () => {
  let m = answer('academic', true, fast); answer('academic', true, fast); m = answer('academic', true, fast);
  assert.equal(m.days, 1); assert.equal(m.mastered, 0);
  clock += DAY; m = answer('academic', true, mid); assert.equal(m.days, 2);
  clock += 2 * DAY; m = answer('academic', true, slow); assert.equal(m.days, 3); assert.ok(m.mastered > 0);
  assert.ok(M.progress(pid, 'cet4').done >= 1); assert.equal(M.progress(pid, 'cet4').total, 4431);
});

test('old saves without memory fields upgrade gracefully', () => {
  const h = P.rec(pid, q('accent')); Object.assign(h, { seen: 4, correct: 3, wrongCount: 1, streak: 2, best: 3 }); delete h.m;
  assert.ok(M.isDue(h, clock), 'previously seen words count as due');
  const m = answer('accent', true, fast);
  assert.equal(m.days, 2, 'earlier correct answers count as one day'); assert.equal(m.lv, 1, 'due → one level up');
  assert.ok(M.dueList(pid).every(x => x.kind === 'word'));
});

test('picker mixes due / risky / new about 40 / 30 / 30 and falls back when a pool is empty', () => {
  const p = P.get(pid); p.history = {};
  const words = bank('cet4').words;
  for (const w of words.slice(0, 200)) { const h = P.rec(pid, { kind: 'word', bank: 'cet4', word: w.word, meaning: 'x' }); h.seen = 1; h.correct = 1; h.m = { lv: 1, next: clock - 1, n: 1, ok: 1, avgT: 3, days: 1, lastDay: '', mastered: 0 }; }
  for (const w of words.slice(200, 400)) { const h = P.rec(pid, { kind: 'word', bank: 'cet4', word: w.word, meaning: 'x' }); h.seen = 2; h.wrongCount = 2; h.inBook = true; h.m = { lv: 0, next: clock + 5 * DAY, n: 2, ok: 0, avgT: 0, days: 0, lastDay: '', mastered: 0 }; }
  const count = (mode, n) => {
    const qz = new WF.Quiz(bank('cet4'), rng(3)), run = M.newRun(pid, mode); qz.memFn = () => run; qz.levelFn = () => WF.WordLevel.mix(1);
    const c = { due: 0, risk: 0, new: 0 }; for (let i = 0; i < n; i++) { qz.pick(); c[qz.lastPool]++; } return c;
  };
  let c = count('normal', 3000);
  assert.ok(Math.abs(c.due / 3000 - 0.4) < 0.04 && Math.abs(c.risk / 3000 - 0.3) < 0.04 && Math.abs(c.new / 3000 - 0.3) < 0.04, JSON.stringify(c));
  c = count('easy', 3000); assert.ok(c.new > c.due && c.new > c.risk, 'easy leans on new words ' + JSON.stringify(c));
  for (const w of words.slice(0, 200)) p.history['cet4\t' + w.word].m.next = clock + DAY;   // nothing due
  c = count('normal', 2000); assert.equal(c.due, 0); assert.ok(Math.abs(c.risk / 2000 - 0.5) < 0.05, JSON.stringify(c));
  p.history = {}; c = count('normal', 500); assert.equal(c.new, 500, 'fresh profile → all new');
});

test('a missed word comes back 4–7 questions later in the same run', () => {
  const qz = new WF.Quiz(bank('cet4'), rng(11)), run = M.newRun(pid, 'normal'); qz.memFn = () => run;
  run.re.push({ word: 'abandon', bank: 'cet4', at: 5 });
  const seq = []; for (let i = 0; i < 8; i++) seq.push(qz.next());
  const k = seq.findIndex(x => x.requeue); assert.equal(k, 4); assert.equal(seq[k].word, 'abandon');
});

test('save export skips network data, validates input and restores on import', () => {
  store.clear(); P.data = { v: 1, profiles: [], lastP1: null, lastP2: null }; P.load();
  localStorage.setItem('wf_bank', 'cet6'); localStorage.setItem('wf_net_token', 'secret'); localStorage.setItem('other_app', 'x');
  const snap = WF.Save.snapshot(clock), text = JSON.stringify(snap);
  assert.ok(snap.keys.wf_profiles_v1 && snap.keys.wf_bank === 'cet6'); assert.equal(snap.keys.wf_net_token, undefined); assert.equal(snap.keys.other_app, undefined);
  for (const bad of ['', '{', '{"app":"x"}', JSON.stringify({ app: 'wordfight', kind: 'save', v: 1, keys: { wf_profiles_v1: '{"profiles":[{"name":1}]}' } }), JSON.stringify({ app: 'wordfight', kind: 'save', v: 1, keys: { 'evil key': 'x' } })]) {
    assert.equal(WF.Save.validate(bad).ok, false, bad.slice(0, 40));
  }
  const r = WF.Save.validate(text); assert.ok(r.ok); assert.equal(r.summary.profiles.length, 1);
  localStorage.setItem('wf_bank', 'junior'); localStorage.setItem('wf_mode', 'math');
  assert.ok(WF.Save.apply(r.data));
  assert.equal(localStorage.getItem('wf_bank'), 'cet6'); assert.equal(localStorage.getItem('wf_mode'), null, 'keys not in the file are cleared');
  assert.equal(localStorage.getItem('wf_net_token'), 'secret', 'network session kept'); assert.equal(localStorage.getItem('other_app'), 'x');
  assert.match(WF.Save.fileName(new Date(2026, 10, 21, 9, 0).getTime()), /^单词格斗存档_20261121_0900\.json$/);
});

test('split bank files: every bank listed, word lists identical to banks.js, meaning fixes carried over', () => {
  const sb = {}; sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/banks_index.js'), 'utf8'), sb);
  assert.equal(JSON.stringify(sb.WF_BANKS.map(b => b.id)), JSON.stringify(WF_BANKS.map(b => b.id)));
  assert.equal(Object.keys(sb.WF_DICT).length, 0);
  const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/cet_meaning_fix.json'), 'utf8'));
  for (const b of sb.WF_BANKS) {
    assert.ok(b.lazy && b.count > 0 && b.file === 'data/b/' + b.id + '.js');
    vm.runInContext(fs.readFileSync(path.join(ROOT, b.file), 'utf8'), sb);
    const L = sb.WF_LAZY[b.id], orig = bank(b.id);
    assert.equal(L.order.length, b.count);
    assert.ok(L.order.every(w => L.own[w] && L.own[w].word === w), b.id + ' self-contained');
    if (!orig.lazy) assert.equal(JSON.stringify(L.order), JSON.stringify(orig.words.map(w => w.word)), b.id + ' same order');
    if (/^cet[46]$/.test(b.id)) for (const [w, m] of Object.entries(FIX)) if (L.own[w]) assert.equal(L.own[w].meaning, m, w);
  }
});

test('page wiring: boot progress script count, precache lists', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const n = (html.match(/<script src=/g) || []).length;
  assert.equal(+html.match(/id="wf-boot" data-n="(\d+)"/)[1], n, 'update data-n on #wf-boot');
  assert.ok(!html.includes('data/banks.js') && html.includes('data/banks_index.js'));
  const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'sw-precache.json'), 'utf8'));
  for (const s of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(pc.core.includes(s[1]), 'precache core misses ' + s[1]);
  assert.ok(!pc.core.concat(pc.rest).some(u => u === 'data/banks.js' || u.startsWith('data/b/')));
});
