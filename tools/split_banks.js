// 首屏提速（2026-11-20 Gray）：把 data/banks.js（6.4 MB，全部默认词库 + 共用词典）拆成
//   data/banks_index.js —— 只有词库清单（名称、词数、文件、大小），网页启动只加载它（几 KB）
//   data/b/<id>.js     —— 每个词库一个文件，自带全部词条（WF_LAZY 格式），选到 / 开局时才下载
// data/banks.js 和 data/bank_<id>.js 保持原样：联机服务器（server/engine.js）和工具脚本仍然读它们。
// 释义修正：先 node tools/apply_meaning_fix.js 改 banks.js（它最后会自动调用本脚本），也可单独跑 node tools/split_banks.js。
// 本脚本会再核对一遍 tools/cet_meaning_fix.json 里的修正都已带进拆分后的文件，没带上就报错退出。
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data'), OUT = path.join(DATA, 'b');
const lines = fs.readFileSync(path.join(DATA, 'banks.js'), 'utf8').split('\n');
const grab = pre => { const l = lines.find(x => x.startsWith(pre)); if (!l) throw new Error('banks.js 缺少 ' + pre); return JSON.parse(l.slice(pre.length).replace(/;\s*$/, '')); };
const DICT = grab('window.WF_DICT = '), BANKS = grab('window.WF_BANKS = ');
// 旧的按需词库文件只带「默认词典里没有的词」，这里读进来补全
const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
for (const b of BANKS) if (b.lazy) vm.runInContext(fs.readFileSync(path.join(ROOT, b.file), 'utf8'), sb, { filename: b.file });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.js$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const index = [];
for (const b of BANKS) {
  let order, own = {};
  if (b.lazy) {
    const L = sb.WF_LAZY[b.id]; if (!L) throw new Error('读不到 ' + b.file);
    order = L.order;
    for (const w of order) { const e = DICT[w] || L.own[w]; if (!e) throw new Error(b.id + ' 缺词条 ' + w); own[w] = e; }
  } else {
    order = b.words;
    for (const w of order) { const e = DICT[w]; if (!e) throw new Error(b.id + ' 缺词条 ' + w); own[w] = e; }
  }
  const rel = 'data/b/' + b.id + '.js';
  const body = `// 由 tools/split_banks.js 从 data/banks.js 生成：词库 ${b.id}（${order.length} 词），勿手改\n` +
    `(window.WF_LAZY = window.WF_LAZY || {})[${JSON.stringify(b.id)}] = {order:${JSON.stringify(order)},own:${JSON.stringify(own)}};\n`;
  fs.writeFileSync(path.join(ROOT, rel), body);
  const shell = { id: b.id, name: b.name, desc: b.desc, lazy: true, count: order.length, file: rel, bytes: zlib.gzipSync(body, { level: 9 }).length, raw: Buffer.byteLength(body), words: [] };   // bytes = 压缩后大约要下载的大小（只用于显示）
  if (!b.lazy) shell.core = true;   // 原来的默认词库（初中…人教六年级）
  index.push(shell);
}
fs.writeFileSync(path.join(DATA, 'banks_index.js'),
  '// 由 tools/split_banks.js 生成，勿手改。网页启动只加载这份清单；词条在 data/b/<id>.js，选到才下载（js/v18_banks.js）\n' +
  'window.WF_DICT = window.WF_DICT || {};\n' +
  'window.WF_BANKS = ' + JSON.stringify(index) + ';\n');
// 核对释义修正已带进拆分文件
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'cet_meaning_fix.json'), 'utf8'));
for (const id of ['cet4', 'cet6']) {
  const s2 = { window: {} }; s2.window = s2; vm.createContext(s2);
  vm.runInContext(fs.readFileSync(path.join(OUT, id + '.js'), 'utf8'), s2);
  const own = s2.WF_LAZY[id].own;
  for (const [w, m] of Object.entries(FIX)) if (own[w] && own[w].meaning !== m) { console.error('释义修正没带上：', id, w, own[w].meaning, '≠', m); process.exit(1); }
}
console.log('split ok:', index.map(b => `${b.id} ${b.count} ${(b.bytes / 1024).toFixed(0)}KB`).join(' | '));
