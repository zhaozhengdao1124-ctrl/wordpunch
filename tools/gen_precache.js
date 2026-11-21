// 2026-11-21：生成 sw-precache.json = { core, rest }
//   core：首屏要用的（页面、全部脚本、词库清单、菜单要用的角色图），service worker 安装时就缓存
//   rest：其余素材（受击图、闯关角色、城市背景、音乐…），进菜单后页面通知 service worker 在后台慢慢缓存
//   词库词条 data/b/<id>.js 不预缓存：玩家用到哪个才下载哪个（存进单独的词库缓存，离线也能用）
// 新增素材后：把文件加进 rest（或直接在本脚本里加规则），再跑 node tools/gen_precache.js
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'sw-precache.json'), 'utf8'));
const all = Array.isArray(old) ? old : old.core.concat(old.rest);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const ROSTER = ['suling', 'mrj', 'chenbanshan', 'handawei', 'yukino', 'mileiba', 'maxike', 'margot'];
const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8').match(/ROSTER:\s*\[([^\]]+)\]/);
const roster = cfg ? cfg[1].split(',').map(x => x.trim().replace(/'/g, '')) : ROSTER;
const core = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', ...scripts, ...roster.map(id => 'assets/' + id + '.png')];
const drop = new Set(['data/banks.js', 'sw.js']);
const rest = [...new Set(all)].filter(u => !core.includes(u) && !drop.has(u) && !/^data\/b(ank_|\/)/.test(u));
for (const u of core.concat(rest)) if (u !== './' && !fs.existsSync(path.join(ROOT, u))) { console.error('缺文件', u); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'sw-precache.json'), JSON.stringify({ core, rest }, null, 0) + '\n');
const size = l => l.filter(u => u !== './').reduce((s, u) => s + fs.statSync(path.join(ROOT, u)).size, 0);
console.log('core', core.length, (size(core) / 1048576).toFixed(2) + 'MB', 'rest', rest.length, (size(rest) / 1048576).toFixed(2) + 'MB');
