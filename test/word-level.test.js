// 四级 / 六级按难度出词（js/v20_wordlevel.js + data/word_levels.js）
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../js/config.js');
require('../data/banks.js');
require('../data/word_levels.js');
require('../js/quiz.js');
WF.Game = class {};
const G = WF.Game.prototype;
Object.assign(G, { startCampaign() {}, campNextQ() {}, startMatch() {}, answerNormal() {}, endQuestion() {} });
require('../js/v20_wordlevel.js');
const bank = id => WF_BANKS.find(b => b.id === id);
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('every CET-4 / CET-6 word has a level and each bank keeps the 15/25/30/20/10 spread', () => {
  for (const id of ['cet4', 'cet6']) {
    const words = bank(id).words, n = words.length, count = [0, 0, 0, 0, 0, 0];
    for (const w of words) count[WF.WordLevel.of(id, w.word)]++;
    assert.equal(count[0], 0, `${id} has unleveled words`);
    [0.15, 0.25, 0.30, 0.20, 0.10].forEach((p, i) => assert.ok(Math.abs(count[i + 1] / n - p) < 0.01, `${id} L${i + 1}`));
  }
  assert.equal(WF.WordLevel.has('junior'), false);
});

test('the easiest notch draws mostly level 1–2 words and the hardest mostly level 4–5', () => {
  for (const [notch, lo, hi, min] of [[0, 1, 2, 0.70], [6, 4, 5, 0.75]]) {
    const q = new WF.Quiz(bank('cet6'), rng(5)); q.levelFn = () => WF.WordLevel.mix(notch);
    let hit = 0; for (let i = 0; i < 4000; i++) { const l = WF.WordLevel.of('cet6', q.pick().word); if (l >= lo && l <= hi) hit++; }
    assert.ok(hit / 4000 > min, `notch ${notch}: ${hit / 4000}`);
  }
});

test('banks without levels keep the old random draw exactly', () => {
  const a = new WF.Quiz(bank('junior'), rng(9)), b = new WF.Quiz(bank('junior'), rng(9));
  b.levelFn = () => WF.WordLevel.mix(6);
  for (let i = 0; i < 50; i++) assert.equal(a.pick().word, b.pick().word);
});

test('mode, city progress, ring opponents and the adaptive net move the notch', () => {
  const g = new WF.Game(); let diff = 'easy';
  g.diffCamp = () => diff; g.diffCpu = () => diff; g.say = () => {};
  g.camp = { ci: 0, route: [0, 1, 2, 3, 4, 5] }; g.p = [{}, { mv: { minion: true } }];
  g.wordLevelReset();
  assert.equal(g.wordLevelNotch(), 0);
  g.p[1].mv = { minion: false }; assert.equal(g.wordLevelNotch(), 1, 'city opponent one notch harder');
  g.camp.ci = 5; assert.equal(g.wordLevelNotch(), 3, 'last city +2 and boss +1');
  diff = 'shura'; assert.equal(g.wordLevelNotch(), 6);
  const q = () => ({ kind: 'word', bank: 'cet4' });
  for (let i = 0; i < 3; i++) g.wordLevelOnResult(q(), false);
  assert.equal(g.wordLevelNotch(), 5, '3 wrong in a row drops one');
  for (let i = 0; i < 8; i++) g.wordLevelOnResult(q(), true);
  assert.equal(g.wordLevelNotch(), 6, '8 right in a row raises one');
  diff = 'easy'; g.camp.ci = 0; g.p[1].mv = { minion: true };
  for (let i = 0; i < 9; i++) g.wordLevelOnResult(q(), false);
  assert.equal(g.wlAdapt.adj, -2, 'safety net stops at -2');
  assert.equal(g.wordLevelNotch(), 0, 'never below the easiest notch');
  g.wordLevelOnResult({ kind: 'word', bank: 'junior' }, true);
  assert.equal(g.wlAdapt.right, 0, 'other banks do not count');
});
