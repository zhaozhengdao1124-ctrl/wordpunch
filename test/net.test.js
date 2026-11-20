// 双客户端集成：两个独立连接打完一局、再战、断线、无效房间、公平规则，以及浏览器里的单机回归。
const assert = require('assert');
const { start } = require('../server/index');
const Rules = require('../js/netrules');
const { WebSocket } = require('ws');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function solve(q) {
  const text = String((q && (q.rawWord || q.word)) || '');
  const m = text.match(/(\d+)\s*([+\-−–])\s*(\d+)/);
  if (!m) return -1;
  const c = m[2] === '+' ? (+m[1] + +m[3]) : (+m[1] - +m[3]);
  return (q.options || []).findIndex(o => Number(o) === c);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

class Peer {
  constructor(url) {
    this.url = url;
    this.msgs = [];
    this.ws = new WebSocket(url);
    this.ws.on('message', (buf) => {
      let msg = null;
      try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
      this.msgs.push(msg);
    });
  }
  ready() { return new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); }); }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  async until(pred, ms = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      await wait(20);
    }
    throw new Error('timeout ' + this.msgs.map(m => m.t).join(','));
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function pair(url, extra) {
  const a = new Peer(url), b = new Peer(url);
  await a.ready(); await b.ready();
  a.send({ t: 'hello', name: '甲' });
  b.send({ t: 'hello', name: '乙' });
  await a.until(m => m.t === 'hello');
  const create = Object.assign({
    t: 'create', name: '甲', char: 'suling', bankId: 'junior', mode: 'math', roundTime: 0,
    hp: 1, growth: { hp: 99, str: 99 }, items: ['genius'], difficulty: 'shura', wrongBook: true,
  }, extra || {});
  a.send(create);
  const joined = await a.until(m => m.t === 'joined');
  const room = await a.until(m => m.t === 'room' && m.code);
  b.send({ t: 'join', code: room.code, name: '乙', char: 'mrj', hp: 99999, growth: { str: 40 }, difficulty: 'shura' });
  await b.until(m => m.t === 'joined');
  await a.until(m => m.t === 'room' && (m.players || []).length === 2);
  return { a, b, code: room.code, tokenA: joined.token };
}

function arm(peer) {
  peer.seen = new Set();
  peer.onQ = null;
}

async function playUntilEnd(a, b, who) {
  // who: 'a' answers correctly, 'b' answers wrong. Loop until end.
  const peers = { a, b };
  const deadline = Date.now() + 20000;
  let end = null;
  while (Date.now() < deadline && !end) {
    for (const key of ['a', 'b']) {
      const p = peers[key];
      const q = p.msgs.find(m => m.t === 'question' && !p.seen.has(m.qid));
      if (!q) continue;
      p.seen.add(q.qid);
      assert.ok(!('correct' in q.q), 'question leaked the answer');
      const right = solve(q.q);
      assert.ok(right >= 0, 'math question not solvable ' + q.q.word);
      const idx = key === who ? right : (right + 1) % 4;
      p.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx, msgId: key + ':' + q.qid + ':' + idx });
      if (key === who) p.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: (idx + 2) % 4, msgId: key + ':' + q.qid + ':' + idx });
    }
    end = a.msgs.find(m => m.t === 'end') || b.msgs.find(m => m.t === 'end');
    if (!end) await wait(30);
  }
  if (!end) throw new Error('match did not finish');
  const endB = await b.until(m => m.t === 'end' && m.matchId === end.matchId);
  return { endA: a.msgs.find(m => m.t === 'end' && m.matchId === end.matchId), endB };
}

test('fair constants match the versus config', async () => {
  const { load } = require('../server/engine');
  const cfg = load().cfg;
  assert.strictEqual(cfg.HP, Rules.FAIR.hp);
  assert.deepStrictEqual([].slice.call(cfg.COMBO_DMG), Rules.FAIR.comboDmg);
  assert.strictEqual(cfg.SLOW_DMG, Rules.FAIR.slowDmg);
  assert.strictEqual(cfg.ULT_DMG, Rules.FAIR.ultDmg);
  assert.strictEqual(cfg.CLASH_DMG, Rules.FAIR.clashDmg);
  assert.strictEqual(cfg.CRIT_MULT, Rules.FAIR.critMult);
  assert.strictEqual(cfg.GUTS_RATIO, Rules.FAIR.gutsRatio);
  assert.strictEqual(cfg.GUTS_MULT, Rules.FAIR.gutsMult);
  assert.strictEqual(cfg.FEEL.FAST_CRIT, Rules.FAIR.fastCrit);
  assert.strictEqual(cfg.FAST_S, Rules.FAIR.fastS);
  assert.strictEqual(cfg.ULT_DMG, 250);
});

test('player UI source has no server address field', async () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../js/netclient.js'), 'utf8');
  assert.ok(!/id="wf-net-srv"/.test(src));
  assert.ok(!/id="wf-net-connect"/.test(src));
  assert.ok(/id="wf-net-create"/.test(src));
  assert.ok(/id="wf-net-code"/.test(src));
  assert.ok(/id="wf-net-lan-note"/.test(src));
  assert.ok(/GitHub Pages 链接不能只靠房间号配对/.test(src));
  assert.strictEqual(Rules.defaultServer({ protocol: 'https:', hostname: 'zhaozhengdao1124-ctrl.github.io', host: 'zhaozhengdao1124-ctrl.github.io' }, 'ws://evil.example/ws'), 'ws://evil.example/ws');
  // 客户端不再把 localStorage 旧地址传进 defaultServer；同源局域网仍自动选。
  assert.strictEqual(Rules.defaultServer({ protocol: 'http:', hostname: '192.168.1.8', host: '192.168.1.8:8787' }, ''), 'ws://192.168.1.8:8787');
  assert.strictEqual(Rules.defaultServer({ protocol: 'https:', hostname: 'zhaozhengdao1124-ctrl.github.io', host: 'zhaozhengdao1124-ctrl.github.io' }, ''), '');
  assert.strictEqual(Rules.defaultServer({ protocol: 'https:', hostname: 'abc123.trycloudflare.com', host: 'abc123.trycloudflare.com' }, ''), 'wss://abc123.trycloudflare.com');
});

test('localhost invite is not a public link', async () => {
  const local = Rules.inviteInfo('http://127.0.0.1:8787/', 'ws://127.0.0.1:8787', 'AB23');
  assert.strictEqual(local.public, false);
  assert.ok(!local.url);
  assert.ok(/本机|局域网|公网/.test(local.reason));
  const pages = Rules.inviteInfo('https://zhaozhengdao1124-ctrl.github.io/wordpunch/', 'ws://127.0.0.1:8787', 'AB23');
  assert.strictEqual(pages.public, false);
  const ok = Rules.inviteInfo('https://play.example.com/wordpunch/', 'wss://play.example.com/ws', 'AB23');
  assert.strictEqual(ok.public, true);
  assert.ok(ok.url.includes('net=AB23'));
  assert.ok(ok.url.includes('srv='));
  assert.strictEqual(Rules.defaultServer({ protocol: 'https:', hostname: 'zhaozhengdao1124-ctrl.github.io', host: 'zhaozhengdao1124-ctrl.github.io' }, ''), '');
  assert.strictEqual(Rules.defaultServer({ protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:8787' }, ''), 'ws://127.0.0.1:8787');
  assert.strictEqual(Rules.defaultServer({ protocol: 'http:', hostname: '192.168.1.20', host: '192.168.1.20:8787' }, ''), 'ws://192.168.1.20:8787');
  const lanInvite = Rules.inviteInfo('http://192.168.1.20:8787/', 'ws://192.168.1.20:8787', 'AB23');
  assert.strictEqual(lanInvite.public, false);
  assert.ok(!lanInvite.url);
});

test('LAN listen accepts a client on a non-loopback address when one exists', async () => {
  const os = require('os');
  const lan = [];
  const nics = os.networkInterfaces();
  for (const name of Object.keys(nics)) {
    for (const info of nics[name] || []) {
      const v4 = info.family === 'IPv4' || info.family === 4;
      if (v4 && !info.internal) lan.push(info.address);
    }
  }
  const bound = await start({ host: '0.0.0.0', port: 0, presentMs: 40, reconnectMs: 400, tickMs: 30 });
  try {
    const addr = bound.server.address();
    assert.ok(addr && (addr.address === '0.0.0.0' || addr.address === '::'));
    const target = lan[0] || '127.0.0.1';
    const peer = new Peer('ws://' + target + ':' + addr.port);
    await peer.ready();
    peer.send({ t: 'hello', name: '局域网' });
    const hello = await peer.until(m => m.t === 'hello');
    assert.ok(hello.banks && hello.banks.length);
    peer.close();
    if (!lan.length) console.log('note  this machine has no non-loopback IPv4; bind is 0.0.0.0 and the client used 127.0.0.1');
    else console.log('note  LAN client connected via ' + target);
  } finally {
    await bound.close();
  }
});

test('publishQuestion hides the answer', async () => {
  const pub = Rules.publishQuestion({ n: 1, word: 'cat', options: ['猫', '狗', '鸟', '鱼'], correct: 0, meaning: '猫', kind: 'word', ex: { en: 'A cat.', zh: '一只猫。' } }, false);
  assert.ok(!('correct' in pub));
  assert.ok(!('meaning' in pub));
  assert.ok(!('exZh' in pub));
  const shown = Rules.publishQuestion({ n: 1, word: 'cat', options: ['猫', '狗', '鸟', '鱼'], correct: 0, meaning: '猫', kind: 'word', ex: { en: 'A cat.', zh: '一只猫。' } }, true);
  assert.strictEqual(shown.correct, 0);
});

test('word rounds mix both directions and reverse prompts never show examples', () => {
  const engine = require('../server/engine').load();
  const source = engine.createSource('cet4', 'word', 47);
  let forwardWithExample = 0, reverse = 0;
  for (let i = 0; i < 64; i++) {
    const q = source.next();
    if (q.fmt !== 'zh-en') {
      assert.strictEqual(q.options[q.correct], q.meaning);
      if (q.ex) forwardWithExample++;
      continue;
    }
    reverse++;
    assert.strictEqual(q.displayWord, q.meaning);
    assert.strictEqual(q.options[q.correct], q.word);
    assert.strictEqual(q.ex, null);
    assert.strictEqual(new Set(q.options.map(word => word.toLowerCase())).size, 4);
    assert.ok(q.options.every(word => /[a-z]/i.test(word)));
    for (const reveal of [false, true]) {
      const pub = Rules.publishQuestion(q, reveal);
      assert.strictEqual(pub.word, q.meaning);
      assert.ok(!('exEn' in pub) && !('exZh' in pub));
      if (reveal) assert.strictEqual(pub.options[pub.correct], q.word);
      else assert.ok(!('rawWord' in pub) && !('correct' in pub));
    }
  }
  assert.ok(forwardWithExample > 0 && reverse > 0);
});

let srv;
test('two clients finish one match with the same state', async () => {
  const { a, b, code } = await pair('ws://127.0.0.1:' + srv.port);
  const room = a.msgs.filter(m => m.t === 'room').pop();
  assert.strictEqual(room.rules.hp, Rules.FAIR.hp);
  assert.strictEqual(room.rules.mode, 'math');
  assert.strictEqual(room.rules.bankId, 'junior');
  assert.ok(!room.rules.growth);
  assert.strictEqual(room.code, code);
  a.seen = new Set(); b.seen = new Set();
  a.send({ t: 'ready', on: true, char: 'mileiba' });
  b.send({ t: 'ready', on: true, char: 'maxike' });
  const startA = await a.until(m => m.t === 'start');
  const startB = await b.until(m => m.t === 'start');
  assert.strictEqual(startA.matchId, startB.matchId);
  assert.deepStrictEqual(startA.snap.hp, [800, 800]);
  assert.ok(startA.players.every(p => Rules.FAIR.roster.includes(p.char)));
  assert.ok(!startA.players.some(p => p.char === 'mileiba' || p.char === 'maxike'));
  const { endA, endB } = await playUntilEnd(a, b, 'a');
  assert.strictEqual(endA.winner, 0);
  assert.strictEqual(endB.winner, 0);
  assert.strictEqual(endA.reason, 'ko');
  assert.deepStrictEqual(endA.snap.hp, endB.snap.hp);
  assert.ok(endA.snap.hp[1] <= 0);
  assert.ok(endA.snap.hp[0] > 0);
  assert.deepStrictEqual(endA.snap.stats, endB.snap.stats);
  const qsA = a.msgs.filter(m => m.t === 'question').map(m => m.q.word + '|' + m.q.options.join('/'));
  const qsB = b.msgs.filter(m => m.t === 'question').map(m => m.q.word + '|' + m.q.options.join('/'));
  assert.deepStrictEqual(qsA, qsB);
  assert.ok(qsA.length >= 5);
  const first = a.msgs.find(m => m.t === 'resolve' && m.outcome && m.outcome.kind === 'hit');
  const st = Rules.freshState();
  Rules.noteWrong(st, 1);
  const again = Rules.hit(st, 0, first.answers[0].sec, 'math', 0);
  assert.strictEqual(again.ko, false);
  assert.deepStrictEqual(first.snap.hp, st.hp);
  assert.ok(first.snap.hp[1] < 800);
  const roomAfter = a.msgs.filter(m => m.t === 'room').pop();
  assert.strictEqual(roomAfter.code, code);
  assert.strictEqual(roomAfter.phase, 'result');
  a.close(); b.close();
});

test('rematch stays in the same room and needs both confirms', async () => {
  const { a, b, code } = await pair('ws://127.0.0.1:' + srv.port);
  a.seen = new Set(); b.seen = new Set();
  a.send({ t: 'ready', on: true });
  b.send({ t: 'ready', on: true });
  const first = await a.until(m => m.t === 'start');
  await playUntilEnd(a, b, 'a');
  a.send({ t: 'rematch', on: true });
  await wait(250);
  assert.ok(!a.msgs.some(m => m.t === 'start' && m.matchId !== first.matchId));
  const waiting = a.msgs.filter(m => m.t === 'room').pop();
  assert.strictEqual(waiting.code, code);
  assert.strictEqual(waiting.phase, 'result');
  assert.ok(waiting.players.find(p => p.slot === 0).rematch);
  assert.ok(!waiting.players.find(p => p.slot === 1).rematch);
  b.send({ t: 'rematch', on: true });
  const second = await a.until(m => m.t === 'start' && m.matchId !== first.matchId);
  const secondB = await b.until(m => m.t === 'start' && m.matchId === second.matchId);
  assert.deepStrictEqual(second.snap.hp, [800, 800]);
  assert.deepStrictEqual(secondB.snap.hp, [800, 800]);
  assert.strictEqual(second.rules.bankId, 'junior');
  assert.strictEqual(second.rules.mode, 'math');
  const q = await a.until(m => m.t === 'question' && m.matchId === second.matchId);
  assert.strictEqual(q.qn, 1);
  assert.ok(!('correct' in q.q));
  a.close(); b.close();
});

test('invalid room, duplicate answer, leave and disconnect', async () => {
  const url = 'ws://127.0.0.1:' + srv.port;
  const ghost = new Peer(url);
  await ghost.ready();
  ghost.send({ t: 'hello', name: '路人' });
  await ghost.until(m => m.t === 'hello');
  ghost.send({ t: 'join', code: 'ZZZZ', name: '路人' });
  const err = await ghost.until(m => m.t === 'error');
  assert.strictEqual(err.code, 'no_room');
  ghost.close();

  const { a, b } = await pair(url);
  a.seen = new Set(); b.seen = new Set();
  a.send({ t: 'ready', on: true });
  b.send({ t: 'ready', on: true });
  await a.until(m => m.t === 'start');
  const q = await a.until(m => m.t === 'question');
  const right = solve(q.q);
  const msgId = 'dup-' + q.qid;
  a.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: right, msgId });
  a.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: (right + 1) % 4, msgId });
  a.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: (right + 2) % 4, msgId: msgId + '-b' });
  b.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: (right + 1) % 4, msgId: 'b' + q.qid });
  const res = await a.until(m => m.t === 'resolve' && m.qid === q.qid);
  assert.strictEqual(res.answers[0].idx, right);
  assert.strictEqual(res.answers[0].ok, true);
  assert.strictEqual(res.snap.stats[0].answered, 1);
  a.send({ t: 'leave' });
  const ended = await b.until(m => m.t === 'end');
  assert.strictEqual(ended.reason, 'forfeit');
  assert.strictEqual(ended.winner, 1);
  b.close();

  const { a: c, b: d, tokenA } = await pair(url);
  c.send({ t: 'ready', on: true });
  d.send({ t: 'ready', on: true });
  await c.until(m => m.t === 'question');
  c.close();
  const resumed = new Peer(url);
  await resumed.ready();
  resumed.send({ t: 'hello', name: '甲', token: tokenA });
  const back = await resumed.until(m => m.t === 'joined' && m.resumed);
  assert.ok(back.resumed);
  const q2 = await resumed.until(m => m.t === 'question');
  const qB = await d.until(m => m.t === 'question' && m.qid === q2.qid);
  assert.strictEqual(q2.q.word, qB.q.word);
  assert.ok(!d.msgs.some(m => m.t === 'end'));
  resumed.close();
  d.close();
  await wait(srvReconnectWait());
});

function srvReconnectWait() { return 900; }

test('disconnect without return forfeits, no forked match', async () => {
  const url = 'ws://127.0.0.1:' + srv.port;
  const { a, b } = await pair(url);
  a.send({ t: 'ready', on: true });
  b.send({ t: 'ready', on: true });
  const start = await a.until(m => m.t === 'start');
  await a.until(m => m.t === 'question');
  a.close();
  const ended = await b.until(m => m.t === 'end', 3000);
  assert.strictEqual(ended.reason, 'forfeit');
  assert.strictEqual(ended.winner, 1);
  assert.strictEqual(ended.matchId, start.matchId);
  const ends = b.msgs.filter(m => m.t === 'end');
  assert.strictEqual(ends.length, 1);
  b.close();
});

test('word questions stay in sync and do not include the answer', async () => {
  const url = 'ws://127.0.0.1:' + srv.port;
  const a = new Peer(url), b = new Peer(url);
  await a.ready(); await b.ready();
  a.send({ t: 'hello' }); b.send({ t: 'hello' });
  await a.until(m => m.t === 'hello');
  a.send({ t: 'create', name: '甲', char: 'handawei', bankId: 'junior', mode: 'word', roundTime: 0 });
  const room = await a.until(m => m.t === 'room');
  b.send({ t: 'join', code: room.code, name: '乙', char: 'yukino' });
  await b.until(m => m.t === 'room' && m.players.length === 2);
  a.send({ t: 'ready', on: true });
  b.send({ t: 'ready', on: true });
  const qA = await a.until(m => m.t === 'question');
  const qB = await b.until(m => m.t === 'question');
  assert.deepStrictEqual(qA.q.options, qB.q.options);
  assert.strictEqual(qA.q.word, qB.q.word);
  assert.ok(!('correct' in qA.q) && !('meaning' in qA.q));
  a.send({ t: 'answer', matchId: qA.matchId, qn: qA.qn, qid: qA.qid, phase: qA.phase, idx: 0, msgId: 'w0' });
  b.send({ t: 'answer', matchId: qB.matchId, qn: qB.qn, qid: qB.qid, phase: qB.phase, idx: 0, msgId: 'w1' });
  const rA = await a.until(m => m.t === 'resolve' || m.t === 'clash');
  const rB = await b.until(m => m.t === rA.t && (m.qid ? m.qid === rA.qid : true));
  if (rA.snap && rB.snap) assert.deepStrictEqual(rA.snap.hp, rB.snap.hp);
  a.close(); b.close();
});

async function checkGuide(page) {
  const history = () => page.evaluate(() => WF.Profiles.get(WF.game.menu.p1).history);
  const before = await history();
  const menu = await page.evaluate(() => WF.game.homeButtons().map(b => b.key));
  for (const key of ['guide', 'start', 'campaign', 'versus', 'grow', 'daily']) assert.ok(menu.includes(key));
  for (let i = 0; i < menu.indexOf('versus'); i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => WF.game.ui.screen), 'versus');
  assert.deepEqual(await page.evaluate(() => WF.game.titleChoices().map(b => b.key)), ['net', 'local', 'versusBack']);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => WF.game.ui.screen), 'title');
  const guide = await page.evaluate(() => {
    const g = WF.game, r = g.menuRects.find(b => b.key === 'guide'), box = g.cv.getBoundingClientRect();
    return { x: box.left + (r.x + r.w / 2) * box.width / g.cv.width, y: box.top + (r.y + r.h / 2) * box.height / g.cv.height };
  });
  await page.mouse.click(guide.x, guide.y);
  assert.equal(await page.evaluate(() => WF.game.ui.screen), 'guide');
  await page.waitForFunction(() => WF.Audio.playingId === WF.Audio.trackId);
  for (const k of ['1', 'Enter']) await page.keyboard.press(k);
  assert.equal(await page.evaluate(() => WF.game.ui.guide.round), 0, 'retry after a wrong answer');
  for (const k of ['2', 'Enter', '4', 'Enter']) await page.keyboard.press(k);
  assert.deepEqual(await history(), before, 'the tutorial does not change word history');
  assert.equal(await page.evaluate(() => WF.game.ui.screen), 'charsel');
  assert.equal(await page.evaluate(() => WF.game.charselMode()), 'cpu');
  await page.keyboard.press('Escape');
}

async function browserSuite() {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) { console.log('skip browser: puppeteer-core missing'); return; }
  const fs = require('fs');
  const path = require('path');
  const artCandidates = ['/opt/cursor/artifacts', path.join(__dirname, '../_artifacts'), '/workspace/artifacts'];
  let ART = artCandidates.find(d => { try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return true; } catch (e) { return false; } });
  if (!ART) ART = path.join(__dirname, '../_artifacts');
  fs.mkdirSync(ART, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const pageErrors = [];
  try {
    const ctxA = await browser.createBrowserContext();
    const ctxB = await browser.createBrowserContext();
    const A = await ctxA.newPage();
    const B = await ctxB.newPage();
    A.setDefaultTimeout(60000);
    B.setDefaultTimeout(60000);
    for (const p of [A, B]) {
      p.on('pageerror', (err) => pageErrors.push(String(err)));
      p.on('console', (msg) => { const t = msg.text(); if (msg.type() === 'error' || t.indexOf('[solo]') === 0) console.log('PAGE', t.slice(0, 240)); if (msg.type() === 'error') pageErrors.push(t); });
    }
    await A.setViewport({ width: 1200, height: 760 });
    await B.setViewport({ width: 1200, height: 760 });
    if (A.setBypassServiceWorker) { await A.setBypassServiceWorker(true); await B.setBypassServiceWorker(true); }
    const url = 'http://127.0.0.1:' + srv.port + '/';
    await Promise.all([
      A.goto(url, { waitUntil: 'domcontentloaded' }),
      B.goto(url, { waitUntil: 'domcontentloaded' }),
    ]);
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      const s = await A.evaluate(() => ({ ready: !!(window.WF && WF.ready), wf: !!window.WF, href: location.href })).catch(e => ({ evalError: String(e) }));
      if (i === 0 || s.ready || s.evalError) console.log('boot', i, JSON.stringify(s));
      ready = !!s.ready;
      if (!ready) await wait(250);
    }
    if (!ready) throw new Error('game did not become ready\n' + pageErrors.join('\n'));
    await checkGuide(A);
    // 2026-11-21 起词库按需下载：进菜单后选中的词库在后台下载，开局前要等它下完
    await A.waitForFunction(() => WF.Banks.isLoaded(WF.game.banks[WF.game.menu.bank]), { timeout: 60000 });
    console.log('solo begin');
    const solo = await A.evaluate(async () => {
      const g = WF.game;
      if (WF.setManual) WF.setManual(true);
      console.log('[solo] enter', g.state);
      g.menu.cpu = true;
      g.menu.char = 'suling';
      if (g.rollCpuChar) g.rollCpuChar('suling');
      const before = localStorage.getItem('wf_profiles_v1');
      g.startMatch();
      // 2026-11-21 起角色图按需下载：对手的图没下完会先显示加载进度，下完自动开局
      for (let i = 0; i < 400 && g.bankLoad; i++) await new Promise(r => setTimeout(r, 50));
      console.log('[solo] started', g.state);
      let guard = 0;
      while (g.state === 'intro' || g.state === 'title') { g.update(); if (++guard > 400) break; }
      console.log('[solo] stepped', g.state, guard);
      const q = g.state;
      return { state: q, hasQ: !!g.q && typeof g.q.correct === 'number', screen: g.ui.screen, word: g.q && g.q.word };
    });
    console.log('solo', JSON.stringify(solo));
    const answered = await Promise.race([
      A.evaluate(() => {
        const g = WF.game;
        const hp = g.p[1].hp;
        g.answer(0, g.q.correct);
        for (let i = 0; i < 40; i++) g.update();
        return { state: g.state, hp: g.p[1].hp, was: hp };
      }),
      new Promise(r => setTimeout(() => r({ timeout: true }), 8000)),
    ]);
    console.log('answered', JSON.stringify(answered));
    assert.strictEqual(solo.state, 'question', 'solo match did not reach a question: ' + JSON.stringify(solo));
    assert.strictEqual(solo.hasQ, true);
    assert.strictEqual(answered.timeout, undefined);
    assert.ok(answered.hp < answered.was);

    await A.evaluate(() => {
      if (WF.setManual) WF.setManual(false);
      WF.game.goTitle();
      for (let i = 0; i < 200; i++) WF.game.update();
      if (WF.Profiles && WF.Profiles.save) WF.Profiles.save();
    });
    await B.waitForFunction(() => window.WF && WF.ready, { timeout: 20000 });
    console.log('both ready');
    const keys = ['wf_profiles_v1', 'wf_bank', 'wf_mode', 'wf_cpu', 'wf_char', 'wf_char_vs', 'wf_wrong', 'wf_round'];
    const snap = async (page) => page.evaluate((ks) => {
      const o = {};
      ks.forEach(k => { o[k] = localStorage.getItem(k); });
      return o;
    }, keys);
    const before = await snap(A);
    const beforeB = await snap(B);
    pageErrors.length = 0;
    const pagesLike = await A.evaluate(() => {
      const g = WF.game;
      const real = g.netDefaultUrl.bind(g);
      g.netDefaultUrl = () => '';
      g.openNet();
      const hint = (document.getElementById('wf-net-hint') || {}).textContent || '';
      const status = (document.getElementById('wf-net-status') || {}).textContent || '';
      document.getElementById('wf-net-create').click();
      const afterHint = (document.getElementById('wf-net-hint') || {}).textContent || '';
      const out = {
        hint, status, afterHint,
        room: !!(g.netRoom && g.netRoom.code),
        link: g.netLink,
        srv: !!document.getElementById('wf-net-srv'),
      };
      g.netDefaultUrl = real;
      g.goTitle();
      return out;
    });
    assert.strictEqual(pagesLike.srv, false);
    assert.ok(!pagesLike.room);
    assert.ok(pagesLike.status.indexOf('已连接') < 0, pagesLike.status);
    assert.ok(/GitHub Pages|房间号|局域网|WiFi/.test(pagesLike.hint + pagesLike.afterHint), JSON.stringify(pagesLike));
    await A.evaluate(() => WF.game.openNet());
    await B.evaluate(() => WF.game.openNet());
    await A.waitForSelector('#wf-net-create');
    const ui = await A.evaluate(() => ({
      srv: !!document.getElementById('wf-net-srv'),
      connect: !!document.getElementById('wf-net-connect'),
      create: !!document.getElementById('wf-net-create'),
      code: !!document.getElementById('wf-net-code'),
      join: !!document.getElementById('wf-net-join'),
      lan: (document.getElementById('wf-net-lan-note') || {}).textContent || '',
      auto: WF.game.netDefaultUrl(),
      title: (document.querySelector('#wf-net h2') || {}).textContent || '',
    }));
    assert.strictEqual(ui.srv, false, 'server address input must be removed');
    assert.strictEqual(ui.connect, false, 'manual connect button must be removed');
    assert.strictEqual(ui.create, true);
    assert.strictEqual(ui.code, true);
    assert.strictEqual(ui.join, true);
    assert.ok(/同一 WiFi|房间/.test(ui.lan));
    assert.ok(ui.auto.indexOf('ws://127.0.0.1:') === 0, ui.auto);
    assert.ok(/WiFi|对战/.test(ui.title));
    await A.waitForFunction(() => (document.getElementById('wf-net-status').textContent || '').indexOf('已连接') >= 0);
    await B.waitForFunction(() => (document.getElementById('wf-net-status').textContent || '').indexOf('已连接') >= 0);
    await A.click('#wf-net-create');
    await A.waitForFunction(() => document.querySelector('#wf-net-codebig') && document.querySelector('#wf-net-codebig').textContent.length === 4);
    const code = await A.$eval('#wf-net-codebig', el => el.textContent.trim());
    const note = await A.$eval('#wf-net-invite-note', el => el.textContent);
    assert.ok(/本机|局域网|公网/.test(note));
    const linkDisabled = await A.$eval('#wf-net-copylink', el => el.disabled);
    assert.strictEqual(linkDisabled, true);
    const fair = await A.$eval('#wf-net-fair', el => el.textContent);
    assert.ok(fair.includes('800'));
    assert.ok(/成长|错题/.test(fair));
    const hp = await A.evaluate(() => WF.game.netRoom && WF.game.netRoom.rules && WF.game.netRoom.rules.hp);
    assert.strictEqual(hp, 800);
    await A.select('#wf-net-mode', 'math');
    await A.waitForFunction(() => WF.game.netRoom && WF.game.netRoom.rules && WF.game.netRoom.rules.mode === 'math');
    await A.screenshot({ path: ART + '/net-lobby.png' });
    await B.evaluate((c) => { document.getElementById('wf-net-code').value = c; }, code);
    await B.click('#wf-net-join');
    await B.waitForFunction(() => WF.game.netRoom && (WF.game.netRoom.players || []).length === 2);
    await A.click('#wf-net-ready');
    await B.click('#wf-net-ready');
    await A.waitForFunction(() => WF.game.netLive && WF.game.q && WF.game.state === 'question');
    await B.waitForFunction(() => WF.game.netLive && WF.game.q);
    await A.screenshot({ path: ART + '/net-fight.png' });
    const answerLoop = async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const solveQ = (q) => {
        const m = String(q.word || '').match(/(\d+)\s*([+\-−–])\s*(\d+)/);
        if (!m) return -1;
        const c = m[2] === '+' ? (+m[1] + +m[3]) : (+m[1] - +m[3]);
        return q.options.findIndex(o => Number(o) === c);
      };
      const me = WF.game;
      const deadline = Date.now() + 25000;
      const ticks = [];
      while (Date.now() < deadline && me.state !== 'result') {
        if ((me.state === 'question' || me.state === 'clash') && me.q && !me.netLocked) {
          const right = solveQ(me.q);
          if (right >= 0) {
            try { me.netAnswer(me.netSlot === 0 ? right : (right + 1) % 4); }
            catch (e) { return { err: String(e), slot: me.netSlot, keys: Object.keys(me.q), ans: me.q.ans, state: me.state, word: me.q.word }; }
          }
        }
        if (me.netSnap && me.netSnap.hp) ticks.push(me.netSnap.hp.join(','));
        await sleep(40);
      }
      return { state: me.state, hp: me.p.map(f => f.hp), ticks: ticks.slice(-8) };
    };
    const played = await Promise.all([A.evaluate(answerLoop), B.evaluate(answerLoop)]);
    await A.waitForFunction(() => WF.game.state === 'result', { timeout: 20000 });
    await B.waitForFunction(() => WF.game.state === 'result', { timeout: 20000 });
    const result = await A.evaluate(() => ({
      winner: WF.game.result.winner,
      hp: WF.game.p.map(f => f.hp),
      blocked: (WF.Speech && WF.Speech._netBlocked) || 0,
      code: WF.game.netRoom && WF.game.netRoom.code,
      forfeit: !!WF.game.result.forfeit,
    }));
    const resultB = await B.evaluate(() => ({
      winner: WF.game.result.winner,
      hp: WF.game.p.map(f => f.hp),
      code: WF.game.netRoom && WF.game.netRoom.code,
      blocked: (WF.Speech && WF.Speech._netBlocked) || 0,
    }));
    assert.strictEqual(result.winner, 0, JSON.stringify(played));
    assert.strictEqual(resultB.winner, 0);
    assert.deepStrictEqual(result.hp, resultB.hp);
    assert.strictEqual(result.code, code);
    assert.strictEqual(resultB.code, code);
    assert.strictEqual(result.blocked, 0);
    assert.strictEqual(resultB.blocked, 0);
    assert.strictEqual(result.forfeit, false);
    await A.screenshot({ path: ART + '/net-result.png' });
    const mid = await snap(A);
    const midB = await snap(B);
    keys.forEach(k => assert.strictEqual(mid[k], before[k], 'online changed ' + k));
    keys.forEach(k => assert.strictEqual(midB[k], beforeB[k], 'online changed B ' + k));
    await A.click('#wf-net-rematch');
    await A.waitForFunction(() => (document.getElementById('wf-net-bar-status') || {}).textContent.includes('等待'));
    await wait(200);
    const still = await A.evaluate(() => WF.game.state);
    assert.strictEqual(still, 'result');
    await B.click('#wf-net-rematch');
    await A.waitForFunction(() => WF.game.state === 'question' && WF.game.qn === 1 && WF.game.p[0].hp === 800 && WF.game.p[1].hp === 800);
    await B.waitForFunction(() => WF.game.state === 'question' && WF.game.p[0].hp === 800);
    const again = await A.evaluate(() => ({ code: WF.game.netRoom.code, q: WF.game.q && WF.game.q.correct }));
    assert.strictEqual(again.code, code);
    assert.strictEqual(again.q, -1);
    await A.evaluate(() => WF.game.goTitle());
    await A.waitForFunction(() => WF.game.state === 'title' && !WF.game.netLive);
    const after = await snap(A);
    keys.forEach(k => assert.strictEqual(after[k], before[k], 'after online ' + k));
    const afterB = await snap(B);
    keys.forEach(k => assert.strictEqual(afterB[k], beforeB[k], 'after online B ' + k));
    const solo2 = await A.evaluate(() => {
      const g = WF.game;
      g.menu.cpu = true;
      g.menu.char = 'suling';
      if (g.rollCpuChar) g.rollCpuChar('suling');
      g.startMatch();
      let guard = 0;
      while (g.state !== 'question' && guard++ < 400) g.update();
      const spoke = WF.Speech.speak('cat');
      return { state: g.state, word: g.q && g.q.word, net: !!g.netLive, spoke: spoke === false ? 'blocked' : 'called' };
    });
    assert.strictEqual(solo2.state, 'question');
    assert.strictEqual(solo2.net, false);
    assert.notStrictEqual(solo2.spoke, 'blocked');
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
  } catch (err) {
    if (pageErrors.length) err.message += '\nPAGE\n' + pageErrors.join('\n');
    throw err;
  } finally {
    await browser.close();
  }
}


test('all modes clash window 200ms; online boundary still ~200ms', async () => {
  assert.strictEqual(Rules.FAIR.clashWindowS, 0.2, 'online FAIR window');
  const { load } = require('../server/engine');
  const cfg = load().cfg;
  assert.strictEqual(cfg.CLASH_WINDOW_S, 0.2, 'local config for pvp/cpu/campaign');
  assert.strictEqual(cfg.CLASH_WINDOW_CPU_S, undefined, 'no separate CPU window');
  const fs = require('fs');
  const path = require('path');
  const gameSrc = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
  const cfgSrc = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
  assert.ok(/clashWindowS\(\) \{ return WF\.CFG\.CLASH_WINDOW_S; \}/.test(gameSrc), 'game.clashWindowS always uses CLASH_WINDOW_S');
  assert.ok(!/CLASH_WINDOW_CPU_S/.test(gameSrc), 'game.js must not branch CPU window');
  assert.ok(!/CLASH_WINDOW_CPU_S/.test(cfgSrc), 'config must not define CPU-only window');
  assert.ok(/CLASH_WINDOW_S: 0\.2/.test(cfgSrc));

  const local = await start({ host: '127.0.0.1', port: 0, presentMs: 40, tickMs: 20, reconnectMs: 500 });
  const url = 'ws://127.0.0.1:' + local.port;
  function solve(q) {
    const text = String((q && (q.rawWord || q.word)) || '');
    const m = text.match(/(\d+)\s*([+\-−–])\s*(\d+)/);
    if (!m) return -1;
    const c = m[2] === '+' ? (+m[1] + +m[3]) : (+m[1] - +m[3]);
    return (q.options || []).findIndex(o => Number(o) === c);
  }
  async function setup() {
    const a = new Peer(url), b = new Peer(url);
    await a.ready(); await b.ready();
    a.send({ t: 'hello', name: '窗甲' }); b.send({ t: 'hello', name: '窗乙' });
    await a.until(m => m.t === 'hello');
    a.send({ t: 'create', name: '窗甲', char: 'suling', bankId: 'junior', mode: 'math', roundTime: 0 });
    await a.until(m => m.t === 'joined');
    const room = await a.until(m => m.t === 'room' && m.code);
    b.send({ t: 'join', code: room.code, name: '窗乙', char: 'mrj' });
    await b.until(m => m.t === 'joined');
    await a.until(m => m.t === 'room' && (m.players || []).length === 2);
    a.send({ t: 'ready', on: true, char: 'suling' });
    b.send({ t: 'ready', on: true, char: 'mrj' });
    await a.until(m => m.t === 'start');
    return { a, b };
  }
  try {
    const { a, b } = await setup();
    const q = await a.until(m => m.t === 'question');
    const right = solve(q.q);
    assert.ok(right >= 0);
    const t0 = Date.now();
    a.send({ t: 'answer', matchId: q.matchId, qn: q.qn, qid: q.qid, phase: q.phase, idx: right, msgId: 'win-a' });
    const res = await a.until(m => m.t === 'resolve' && m.qid === q.qid, 3000);
    const waited = Date.now() - t0;
    assert.ok(waited >= 150 && waited <= 320, 'only-A resolve should wait ~200ms clash window, got ' + waited);
    assert.strictEqual(res.outcome.band, 'fast');
    a.close(); b.close();

    const { a: a2, b: b2 } = await setup();
    const q2 = await a2.until(m => m.t === 'question' && m.phase !== 'clash');
    const right2 = solve(q2.q);
    const t1 = Date.now();
    a2.send({ t: 'answer', matchId: q2.matchId, qn: q2.qn, qid: q2.qid, phase: q2.phase, idx: right2, msgId: 'win-a2' });
    b2.send({ t: 'answer', matchId: q2.matchId, qn: q2.qn, qid: q2.qid, phase: q2.phase, idx: right2, msgId: 'win-b2' });
    const res2 = await a2.until(m => m.t === 'resolve' && m.qid === q2.qid, 3000);
    const bothWait = Date.now() - t1;
    assert.ok(bothWait < 150, 'both-correct should resolve promptly, got ' + bothWait);
    assert.strictEqual(res2.outcome.kind, 'clash');
    assert.deepStrictEqual(res2.snap.streak, [0, 0]);
    a2.close(); b2.close();
  } finally {
    await local.close();
  }
});

test('browser: solo regression, two clients, rematch, saves, no speech', browserSuite);

(async () => {
  srv = await start({
    host: '127.0.0.1',
    port: 0,
    presentMs: 70,
    clashWindowMs: 350,
    reconnectMs: 700,
    tickMs: 30,
  });
  let failed = 0;
  const only = process.env.ONLY || '';
  for (const t of tests) {
    if (only && t.name.indexOf(only) < 0) continue;
    try {
      await t.fn();
      console.log('ok  ' + t.name);
    } catch (err) {
      failed++;
      console.error('FAIL ' + t.name);
      console.error(err && err.stack || err);
    }
  }
  await srv.close();
  if (failed) process.exit(1);
  console.log('all ' + tests.length + ' tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
