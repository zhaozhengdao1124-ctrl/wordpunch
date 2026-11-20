const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../js/config.js');
require('../js/v19_config.js');
require('../js/v19_rules.js');
const rules = WF.R19;
const entry = (word, bank = 'junior') => ({ word, bank });

test('review keeps the bank and missed sense of each distinct notebook word', () => {
  const missed = { ...entry('spring', 'ielts'), wrongSenses: ['v'] };
  const wrong = [missed, entry('point'), entry('lead')];
  const result = rules.reviewWords(rules.rng(42), wrong, [entry('spring')], [entry('new')], 3);
  assert.equal(result.fromBook, 3);
  assert.equal(result.filled, 0);
  assert.ok(result.words.includes(missed));
  assert.deepEqual(new Set(result.words), new Set(wrong));
});

test('review fills a short notebook with seen words before new ones', () => {
  const wrong = [entry('spring'), entry('spring', 'ielts'), { kind: 'phrase', word: 'look up' }];
  const result = rules.reviewWords(rules.rng(42), wrong, [entry('spring'), entry('roll')], [entry('run')], 3);
  assert.deepEqual(result.words.map(e => e.word), ['spring', 'roll', 'run']);
  assert.equal(result.fromBook, 1);
  assert.equal(result.filled, 2);
});

test('an empty notebook uses the selected bank and never labels its words as mistakes', () => {
  const words = [entry('roll'), entry('run'), entry('read')];
  const result = rules.reviewWords(rules.rng(42), [], [], words, 3);
  assert.equal(result.ok, true);
  assert.equal(result.fromBook, 0);
  assert.equal(result.filled, 3);
  assert.deepEqual(result, rules.haggleWords(rules.rng(42), [], [], words));
  assert.equal(rules.reviewWords(rules.rng(42), [], [], words.slice(0,2), 3).ok, false);
});

test('gear contacts follow each reel and spread out as it brakes', () => {
  require('../js/loot_reels.js');
  const { gearTicks, rollStart, stopsAt } = WF.LootReels;
  const contacts = gearTicks(4, [0, 0, 1]);
  assert.deepEqual(contacts, [...contacts].sort((a, b) => a.at - b.at));
  for (const [axis, stop] of stopsAt.entries()) {
    const times = contacts.filter(event => event.axis === axis).map(event => event.at);
    assert.equal(times.length, [16, 28, 28][axis]);
    assert.ok(times[0] > rollStart);
    assert.ok(times.at(-1) < stop);
    const tail = times.slice(-6);
    const gaps = tail.slice(1).map((at, index) => at - tail[index]);
    assert.ok(gaps.every((gap, index) => index === 0 || gap > gaps[index - 1]));
  }
});

test('coin prices and all 18 different awards double over successive plays', () => {
  const first = rules.makeLootMachineBoard(rules.rng(17), rules.lootPrice(0));
  assert.equal(new Set(first.map(card => card.gold)).size, 18);
  assert.ok(first.every(card => card.k === 'G'));
  for (const [i, price] of [10, 20, 40, 80, 160].entries()) {
    assert.equal(rules.lootPrice(i), price);
    const board = rules.makeLootMachineBoard(rules.rng(17), price);
    assert.deepEqual(board, first.map(card => ({ ...card, gold: card.gold * 2 ** i })));
  }
});

test('weights define the exact published odds and a constant 92.5% return', () => {
  for (const price of [10, 20, 80]) {
    const board = rules.makeLootMachineBoard(rules.rng(91), price);
    const weights = board.reduce((sum, card) => sum + card.weight, 0);
    assert.equal(weights, 1000);
    assert.equal(board.reduce((sum, card) => sum + card.gold * card.weight, 0) / (weights * price), .925);
    assert.equal(board.find(card => card.gold === 2 * price).weight, 3);
    let through = 0;
    for (const [index, card] of board.entries()) {
      assert.equal(rules.pickLootSlot(() => (through + 0.25) / weights, board), index);
      assert.equal(rules.pickLootSlot(() => (through + card.weight - 0.25) / weights, board), index);
      through += card.weight;
    }
  }
});
