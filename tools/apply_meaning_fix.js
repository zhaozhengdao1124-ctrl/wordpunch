// 四级 / 六级主释义修正（2026-11-20 Gray）：按 tools/cet_meaning_fix.json 改 data/banks.js 的 WF_DICT。
// 重新生成 banks.js 后再跑一次：node tools/apply_meaning_fix.js（重复跑结果不变）
const fs = require('fs'), P = require('path').join(__dirname, '../data/banks.js');
const FIX = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'cet_meaning_fix.json'), 'utf8'));
const DROP = { download: ['卸载', '下栽'], universally: ['宇宙'], aspirational: ['志同的'] };
const SENSE_FIRST = { quick: 'adj' };
const lines = fs.readFileSync(P, 'utf8').split('\n'); const i = lines.findIndex(l => l.startsWith('window.WF_DICT = '));
const D = JSON.parse(lines[i].slice('window.WF_DICT = '.length).replace(/;\s*$/, ''));
const banksLine = lines.find(l => l.startsWith('window.WF_BANKS = '));
const B = JSON.parse(banksLine.slice('window.WF_BANKS = '.length).replace(/;\s*$/, ''));
const inBank = {}; for (const b of B) for (const w of b.words) (inBank[w] = inBank[w] || []).push(b.id);
const toks = zh => zh.split('，').map(s => s.trim()).filter(Boolean);
const rows = [];
for (const [w, nw] of Object.entries(FIX)) {
  const d = D[w]; if (!d) throw new Error('missing ' + w);
  if (!(inBank[w] || []).some(id => id === 'cet4' || id === 'cet6')) throw new Error('not cet ' + w);
  const old = d.meaning, oldZh = d.senses[0].zh;
  if (SENSE_FIRST[w]) { const k = d.senses.findIndex(s => s.id === SENSE_FIRST[w]); d.senses.unshift(d.senses.splice(k, 1)[0]); d.pos = d.senses[0].pos; }
  const s = d.senses[0], drop = DROP[w] || [];
  let t = toks(s.zh).filter(x => x !== nw && !drop.includes(x));
  if (!SENSE_FIRST[w] && t[0] === old) t = t.slice(1).concat(drop.includes(old) ? [] : [old]);
  s.zh = [nw, ...t].join('，'); d.meaning = nw;
  rows.push({ w, banks: inBank[w], old, nw, oldZh, newZh: s.zh });
}
lines[i] = 'window.WF_DICT = ' + JSON.stringify(D) + ';';
fs.writeFileSync(P, lines.join('\n'));
const c = id => rows.filter(r => r.banks.includes(id)).length;
console.log('changed', rows.length, 'cet4', c('cet4'), 'cet6', c('cet6'), 'also in other banks', rows.filter(r => r.banks.some(b => !/^cet[46]$/.test(b))).length);
for (const r of rows.slice(0, 8)) console.log(r.w, r.old, '→', r.nw, '|', r.oldZh, '→', r.newZh);
console.log(rows.find(r => r.w === 'quick'), rows.find(r => r.w === 'download'));
