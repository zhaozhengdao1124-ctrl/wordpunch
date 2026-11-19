// 单词格斗自托管对战服务。
// 本机：node server/index.js
// 然后打开 http://127.0.0.1:8787/
// GitHub Pages 只托管页面，不会自带这个进程。公网对战需要你自己把这个服务放到一台双方都能连上的机器，并在游戏里填写 wss:// 地址。
const http = require('http');
const fs = require('fs');
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

if (require.main === module) {
  start({}).then(({ port }) => {
    console.log('单词格斗对战服务已在本机启动');
    console.log('打开 http://127.0.0.1:' + port + '/');
    console.log('这是本机服务。局域网或公网朋友连不上 127.0.0.1。');
    console.log('GitHub Pages 不会自动带上这个进程。');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { start };
