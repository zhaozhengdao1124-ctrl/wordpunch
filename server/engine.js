// 在 Node 里加载现有出题代码（词库、短语、数学），让联机用和单机同一套题，而不是另写一套题。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function expandLazy(sandbox) {
  const banks = sandbox.WF_BANKS || [];
  const dic = sandbox.WF_DICT || {};
  for (const b of banks) {
    if (!b || !b.lazy || b.loaded) continue;
    const L = (sandbox.WF_LAZY || {})[b.id];
    if (!L || !Array.isArray(L.order)) continue;
    const out = [];
    let bad = false;
    for (const w of L.order) {
      const e = dic[w] || (L.own && L.own[w]);
      if (!e) { bad = true; break; }
      if (!dic[w]) dic[w] = e;
      out.push(e);
    }
    if (bad || !out.length) continue;
    b.words = out;
    b.loaded = true;
  }
}

function load() {
  const sandbox = {
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const files = [
    'js/config.js',
    'js/quiz.js',
    'data/phrases.js',
    'js/v2_phrase.js',
    'js/source.js',
    'data/banks.js',
  ];
  for (const f of files) vm.runInContext(read(f), sandbox, { filename: f });
  const lazy = fs.readdirSync(path.join(ROOT, 'data')).filter(n => /^bank_[a-z0-9]+\.js$/.test(n));
  for (const n of lazy) vm.runInContext(read('data/' + n), sandbox, { filename: 'data/' + n });
  expandLazy(sandbox);
  const banks = (sandbox.WF_BANKS || []).filter(b => b && b.words && b.words.length >= 4).map(b => ({
    id: b.id, name: b.name, count: b.words.length,
  }));
  function bankById(id) {
    return (sandbox.WF_BANKS || []).find(b => b.id === id && b.words && b.words.length >= 4) || null;
  }
  function createSource(bankId, mode, seed) {
    const Rules = require('../js/netrules');
    const bank = bankById(bankId);
    const rnd = Rules.mulberry32((seed >>> 0) || 1);
    const src = sandbox.WF.makeSource({
      mode: mode || 'word',
      bank,
      rnd,
      banks: sandbox.WF_BANKS,
      phrases: true,
    });
    return src;
  }
  return { banks, bankById, createSource, cfg: sandbox.WF.CFG };
}

module.exports = { load, ROOT };
