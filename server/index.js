// 单词格斗自托管对战服务。
// 本机：node server/index.js
// 然后打开 http://127.0.0.1:8787/
// GitHub Pages 只托管页面，不会自带这个进程。同一 WiFi：双方打开本服务打印的局域网游戏地址，再在游戏里用房间号配对（不填服务器）。
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const { load, ROOT } = require('./engine');
const { createRooms } = require('./rooms');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function start(opts) {
  opts = opts || {};
  const engine = opts.engine || load();
  const rooms = createRooms(engine, opts);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/net/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, banks: engine.banks.length }));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel.includes('\0') || rel.split('/').includes('..')) { res.writeHead(400); res.end('bad path'); return; }
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    const blocked = ['/node_modules/', '/.git/', '/server/', '/test/'];
    const slash = file.slice(ROOT.length).replace(/\\/g, '/');
    if (blocked.some(b => slash.startsWith(b) || slash.includes(b))) { res.writeHead(404); res.end('not found'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
      if (ext === '.html' || ext === '.js' || file.endsWith('sw.js') || file.endsWith('sw-precache.json')) headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(buf);
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => rooms.connect(ws));
  const port = opts.port != null ? opts.port : (process.env.PORT ? +process.env.PORT : 8787);
  const host = opts.host || '0.0.0.0';
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server, wss, rooms, engine,
        port: addr.port,
        close() {
          rooms.close();
          return new Promise((res) => {
            let settled = false;
            const done = () => { if (settled) return; settled = true; res(); };
            const timer = setTimeout(done, 1500);
            try { for (const client of wss.clients) client.terminate(); } catch (e) {}
            try { wss.close(); } catch (e) {}
            server.close(() => { clearTimeout(timer); done(); });
          });
        },
      });
    });
  });
}

function lanPages(port) {
  const out = [];
  const nics = os.networkInterfaces();
  for (const name of Object.keys(nics)) {
    for (const info of nics[name] || []) {
      const v4 = info.family === 'IPv4' || info.family === 4;
      if (v4 && !info.internal) out.push('http://' + info.address + ':' + port + '/');
    }
  }
  return out;
}

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  const port = process.env.PORT ? +process.env.PORT : 8787;
  start({ host, port }).then(() => {
    console.log('单词格斗对战服务已启动，监听 ' + host + ':' + port);
    console.log('这台电脑自己玩：打开 http://127.0.0.1:' + port + '/');
    const lan = lanPages(port);
    if (host === '127.0.0.1' || host === 'localhost') {
      console.log('当前只监听本机。同一 WiFi 的手机连不上。若要一起玩，请不要设置 HOST=127.0.0.1。');
    } else if (lan.length) {
      console.log('同一 WiFi 的手机或另一台电脑，请打开：');
      lan.forEach(u => console.log('  ' + u));
      console.log('手机上不要打开 127.0.0.1，那个地址只代表手机自己。');
    } else {
      console.log('没有发现局域网网卡地址。手机要连，请确认这台电脑已经连上 WiFi。');
    }
    console.log('这不是公网。不在同一个 WiFi 的朋友打不开上面的地址。');
    console.log('GitHub Pages 网站不会自动带上这个进程。');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { start };
