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

test('activation fills a short notebook with new words before old ones', () => {
  const wrong = [entry('spring'), entry('spring', 'ielts'), { kind: 'phrase', word: 'look up' }];
  const fresh = [entry('spring'), entry('roll')];
  const result = rules.reviewWords(rules.rng(42), wrong, fresh, [entry('run')], 3);
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

test('the default fee is 10 and all 18 different awards scale by the selected multiplier', () => {
  const first = rules.makeLootMachineBoard(rules.rng(17), rules.lootPrice());
  assert.equal(new Set(first.map(card => card.gold)).size, 18);
  assert.equal(new Set(first.map(card => card.symbol)).size, 18);
  assert.ok(first.every(card => card.k === 'G'));
  for (const multiplier of [1, 2, 3, 7]) {
    const price = rules.lootPrice(multiplier);
    assert.equal(price, 10 * multiplier);
    const board = rules.makeLootMachineBoard(rules.rng(17), price);
    assert.deepEqual(board, first.map(card => ({ ...card, gold: card.gold * multiplier })));
  }
});

test('weighted selection maps each draw to the configured slot', () => {
  for (const price of [10, 20, 80]) {
    const board = rules.makeLootMachineBoard(rules.rng(91), price);
    const weights = board.reduce((sum, card) => sum + card.weight, 0);
    let through = 0;
    for (const [index, card] of board.entries()) {
      assert.equal(rules.pickLootSlot(() => (through + 0.25) / weights, board), index);
      assert.equal(rules.pickLootSlot(() => (through + card.weight - 0.25) / weights, board), index);
      through += card.weight;
    }
  }
});

test('reel entry expands to five times the jackpot weight without changing the prize draw', () => {
  const board = rules.makeLootMachineBoard(rules.rng(65), rules.lootPrice(2));
  const top = board.reduce((best, card) => card.gold > best.gold ? card : best);
  const regular = board.find(card => card !== top);
  const otherWeight = board.reduce((sum, card) => sum + card.weight, 0) - top.weight;
  let reelOnly = 0;
  for (let ticket = 0; ticket < otherWeight; ticket++) {
    const rng = () => (ticket + 0.5) / otherWeight;
    if (rules.lootReelMode(rng, board, regular) === 'reels') reelOnly++;
  }
  assert.equal(top.weight + reelOnly, top.weight * 5);
  assert.equal(rules.lootReelMode(() => 0.999, board, top), 'jackpot');
  assert.equal(rules.lootReelMode(() => 0.999, board, regular), 'none');
});
