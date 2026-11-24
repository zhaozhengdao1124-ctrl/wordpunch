// 角力提示：文案必须对上现有规则和当前输入，并且不挡住选项、计分格、倒计时。
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '../optimize');
const ART = ['/opt/cursor/artifacts', path.join(__dirname, '../_artifacts')].find((d) => {
  try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return true; } catch (e) { return false; }
}) || path.join(__dirname, '../_artifacts');
fs.mkdirSync(ART, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
};

function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/index.html';
    if (rel.includes('\0') || rel.split('/').includes('..')) { res.writeHead(400); res.end('bad'); return; }
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('missing'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function hit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function textBox(t) {
  const left = t.align === 'right' ? t.x - t.w : t.align === 'left' ? t.x : t.x - t.w / 2;
  const top = t.y - (t.a || 0);
  const bot = t.y + (t.d || 0);
  return { x: left, y: top, w: t.w, h: Math.max(1, bot - top), s: t.s, size: t.size };
}

async function saveCanvas(page, name) {
  const url = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  const file = path.join(ART, name);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
}

async function main() {
  const server = await serve();
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });
    if (page.setBypassServiceWorker) await page.setBypassServiceWorker(true);
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WF && WF.ready);

    async function reachClash(opts) {
      await page.evaluate((opts) => {
        const g = WF.game;
        WF.setManual(true);
        g.menu.cpu = !!opts.cpu;
        g.menu.mode = 'math';
        g.menu.char = 'suling';
        g.menu.vs = ['suling', 'mrj'];
        g.netLive = false;
        WF.touch = false;
        if (!g.menu.p1 && WF.Profiles.list().length) g.menu.p1 = WF.Profiles.list()[0].id;
        if (!opts.cpu && !g.menu.p2) {
          const made = WF.Profiles.create('玩家2', 'orange');
          g.menu.p2 = made && made.profile && made.profile.id;
        }
        if (opts.cpu && g.rollCpuChar) g.rollCpuChar('suling');
        if (g.state !== 'title') g.goTitle();
        g.startMatch();
      }, opts);
      await page.waitForFunction(() => {
        const g = WF.game;
        return g.state === 'intro' || g.state === 'question' || g.state === 'clash';
      }, { timeout: 20000 });
      return page.evaluate(() => {
        const g = WF.game;
        WF.setManual(true);
        let guard = 0;
        while (g.state !== 'question' && guard++ < 800) g.update();
        if (!g.q || typeof g.q.correct !== 'number') return { fail: true, state: g.state, guard, log: (g.log || []).slice(-8) };
        g.answer(0, g.q.correct);
        g.answer(1, g.q.correct);
        let intro = 0;
        while (g.state !== 'clash' && intro++ < 400) g.update();
        g.achQ = [];
        g.announce = null;
        g.render();
        return {
          fail: g.state !== 'clash', state: g.state, intro,
          word: g.q && (g.q.displayWord || g.q.word),
          line: g.clashCoach().line1, cpu: g.menu.cpu,
        };
      });
    }

    const boot = await reachClash({ cpu: true });
    assert.strictEqual(boot.fail, false, 'did not reach clash: ' + JSON.stringify(boot));

    async function snap(label) {
      return page.evaluate((label) => {
        const g = WF.game;
        g.achQ = [];
        g._txtLog = [];
        g.render();
        const texts = (g._txtLog || []).filter((t) => t.s).map((t) => ({
          s: t.s, x: t.x, y: t.y, w: t.w, a: t.a, d: t.d, size: t.size, align: t.align,
        }));
        return {
          label,
          state: g.state,
          coach: g.clashCoach(),
          hud: g.clashHud,
          ans: (g.ansRects || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
          touch: (g.touchRects || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, key: r.key })),
          announce: g.announce,
          score: g.clash && g.clash.score.slice(),
          texts,
          win: WF.CFG.CLASH_WIN_COUNT,
          cap: WF.CFG.CLASH_CAP_S,
          dmg: WF.CFG.CLASH_DMG,
          windowS: WF.CFG.CLASH_WINDOW_S,
        };
      }, label);
    }

    function checkLayout(view, mode) {
      const cap = view.hud.caption;
      const toast = { x: 960 - 340 - 16, y: 186, w: 340, h: 42 };
      assert.ok(cap.x >= 0 && cap.y >= 140 && cap.x + cap.w <= 960 && cap.y + cap.h <= 360, mode + ' caption offscreen ' + JSON.stringify(cap));
      assert.ok(!hit(cap, toast), mode + ' caption hits achievement toast slot');
      for (const pip of view.hud.pips) assert.ok(!hit(cap, pip), mode + ' caption hits pip');
      assert.ok(!hit(cap, view.hud.bar), mode + ' caption hits countdown bar');
      for (const a of view.ans) assert.ok(!hit(cap, a), mode + ' caption hits answer ' + JSON.stringify(a));
      const lines = view.texts.filter((t) => t.s === view.coach.line1 || t.s === view.coach.line2);
      assert.strictEqual(lines.length, 2, mode + ' missing coach lines ' + view.texts.map((t) => t.s).join('|'));
      for (const t of lines) {
        const b = textBox(t);
        assert.ok(b.x >= cap.x - 1 && b.x + b.w <= cap.x + cap.w + 1, mode + ' line overflows card ' + JSON.stringify(b));
        assert.ok(b.y >= cap.y && b.y + b.h <= cap.y + cap.h + 2, mode + ' line overflows card vertically ' + JSON.stringify(b));
        assert.ok(t.size >= 15, mode + ' coach text shrunk to ' + t.size);
      }
      const timer = view.texts.find((t) => t.s === view.hud.timer);
      assert.ok(timer, mode + ' missing timer ' + view.hud.timer);
      assert.ok(!hit(textBox(timer), cap), mode + ' timer hits caption');
      for (const pip of view.hud.pips) assert.ok(!hit(textBox(timer), pip), mode + ' timer hits pip');
      const side = view.texts.filter((t) => t.s === 'P1' || t.s === view.coach.right);
      for (const t of side) for (const pip of view.hud.pips) assert.ok(!hit(textBox(t), pip), mode + ' label hits pip ' + t.s);
      assert.ok(!view.texts.some((t) => t.s && t.s.indexOf('先答对') >= 0 && t.s.indexOf('获胜') >= 0), mode + ' old banner still drawn');
    }

    const cpu = await snap('cpu');
    await saveCanvas(page, 'clash-cpu.png');
    assert.strictEqual(cpu.coach.line1, '按 1 2 3 4 抢答');
    assert.ok(cpu.coach.line2.indexOf('先满 ' + cpu.win + ' 格打出一击') >= 0, cpu.coach.line2);
    assert.ok(cpu.coach.line2.indexOf('归零平手，不掉血') >= 0, cpu.coach.line2);
    assert.ok(cpu.coach.line1.indexOf('7') < 0, cpu.coach.line1);
    assert.strictEqual(cpu.coach.right, '电脑');
    assert.strictEqual(cpu.coach.p1idle, 'P1 按 1 2 3 4');
    assert.strictEqual(cpu.coach.p2idle, 'P2 电脑');
    assert.strictEqual(cpu.announce, null);
    assert.strictEqual(cpu.windowS, 0.2);
    assert.strictEqual(cpu.dmg, 120);
    assert.strictEqual(cpu.cap, 15);
    assert.deepStrictEqual(cpu.score, [0, 0]);
    checkLayout(cpu, 'cpu');
    assert.ok(cpu.texts.some((t) => t.s === 'P1 按 1 2 3 4'), 'panel should still show P1 keys');

    const scored = await page.evaluate(() => {
      const g = WF.game;
      const before = g.p.map((f) => f.hp);
      const idx = g.q.correct;
      g.answer(0, idx);
      g.achQ = [];
      return { score: g.clash.score.slice(), state: g.state, hp: g.p.map((f) => f.hp), before, on: g.clashHud && g.clashHud.pips.filter((p) => p.on).length };
    });
    assert.deepStrictEqual(scored.score, [1, 0], JSON.stringify(scored));
    assert.strictEqual(scored.state, 'clash');
    assert.deepStrictEqual(scored.hp, scored.before, 'scoring a clash point must not deal damage yet');
    assert.strictEqual(scored.on, 1);
    await page.evaluate(() => { WF.game.achQ = []; WF.game.render(); });
    await saveCanvas(page, 'clash-scored.png');

    await page.evaluate(() => {
      const g = WF.game;
      let n = 0;
      while (g.state === 'clash' && g.q && g.q.revealed && n++ < 40) g.update();
      g.menu.cpu = false;
      WF.touch = false;
      g.achQ = [];
      g.render();
    });
    const local = await snap('local');
    await saveCanvas(page, 'clash-local.png');
    assert.strictEqual(local.coach.line1, 'P1 按 1–4，P2 按 7 8 9 0');
    assert.strictEqual(local.coach.p1idle, 'P1 按 1 2 3 4');
    assert.strictEqual(local.coach.p2idle, 'P2 按 7 8 9 0');
    assert.strictEqual(local.coach.right, 'P2');
    checkLayout(local, 'local');
    assert.ok(local.texts.some((t) => t.s === 'P2 按 7 8 9 0'));

    await page.evaluate(() => {
      const g = WF.game;
      g.menu.cpu = true;
      WF.touch = true;
      document.body.classList.add('wf-touch');
      g.achQ = [];
      g.render();
    });
    const touch = await snap('touch');
    await saveCanvas(page, 'clash-touch.png');
    assert.strictEqual(touch.coach.line1, '点选答案抢答');
    assert.ok(touch.coach.line1.indexOf('按') < 0, touch.coach.line1);
    assert.strictEqual(touch.coach.p1idle, 'P1 点选');
    assert.ok(touch.texts.some((t) => t.s === 'P1 点选'));
    assert.ok(!touch.texts.some((t) => t.s === 'P1 按 1 2 3 4'), 'touch clash must not keep telling P1 to press keys');
    checkLayout(touch, 'touch');
    const pause = touch.touch.find((r) => r.key === 'tpause');
    assert.ok(pause, 'touch pause button missing');
    assert.ok(!hit(touch.hud.caption, pause), 'caption hits pause');

    await page.evaluate(() => {
      const g = WF.game;
      WF.touch = true;
      g.menu.cpu = false;
      g.netLive = false;
      g.achQ = [];
      g.render();
    });
    const touchLocal = await snap('touch-local');
    assert.strictEqual(touchLocal.coach.line1, 'P1 点选答案，P2 按 7 8 9 0');
    assert.strictEqual(touchLocal.coach.p2idle, 'P2 按 7 8 9 0');
    checkLayout(touchLocal, 'touch-local');
    await saveCanvas(page, 'clash-touch-local.png');

    await page.evaluate(() => {
      const g = WF.game;
      WF.touch = false;
      g.menu.cpu = false;
      g.netLive = true;
      g.achQ = [];
      g.render();
    });
    const net = await snap('net');
    assert.strictEqual(net.coach.line1, '按 1–4 或 7–0 抢答');
    assert.strictEqual(net.coach.p1idle, '');
    checkLayout(net, 'net');
    await page.evaluate(() => {
      const g = WF.game;
      g.netLive = true;
      WF.touch = true;
      g.achQ = [];
      g.render();
    });
    const netTouch = await snap('net-touch');
    assert.strictEqual(netTouch.coach.line1, '点选答案抢答');
    checkLayout(netTouch, 'net-touch');

    const camp = await page.evaluate(() => {
      const g = WF.game;
      g.netLive = false;
      WF.touch = false;
      g.menu.cpu = true;
      const prevCamp = g.camp;
      const prevName = g.p[1].mv.name;
      g.camp = { probe: true };
      g.p[1].mv.name = '陈半山';
      const named = g.clashCoach();
      g.p[1].mv.name = '武馆大师兄';
      const longName = g.clashCoach();
      WF.touch = true;
      const tapped = g.clashCoach();
      g.p[1].mv.name = prevName;
      g.camp = prevCamp;
      WF.touch = false;
      g.menu.cpu = true;
      g.netLive = false;
      return { named, longName, tapped };
    });
    assert.strictEqual(camp.named.right, '陈半山');
    assert.strictEqual(camp.named.p2idle, '陈半山');
    assert.strictEqual(camp.named.line1, '按 1 2 3 4 抢答');
    assert.strictEqual(camp.longName.right, '对手');
    assert.strictEqual(camp.tapped.line1, '点选答案抢答');
    assert.strictEqual(camp.tapped.p1idle, 'P1 点选');

    const phrase = await page.evaluate(() => {
      const g = WF.game;
      const kind = g.q.kind;
      g.q.kind = 'phrase';
      WF.touch = true;
      g.menu.cpu = true;
      g.netLive = false;
      g.camp = null;
      g.achQ = [];
      g._txtLog = [];
      g.render();
      const ans = (g.ansRects || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
      const cap = g.clashHud.caption;
      const lines = (g._txtLog || []).filter((t) => t.s === g.clashCoach().line1 || t.s === g.clashCoach().line2).map((t) => t.size);
      g.q.kind = kind;
      WF.touch = false;
      return { ans, cap, lines };
    });
    for (const a of phrase.ans) assert.ok(!hit(phrase.cap, a), 'phrase touch caption hits answers');
    assert.ok(phrase.lines.every((s) => s >= 16), 'phrase touch coach text ' + phrase.lines.join(','));

    await page.setViewport({ width: 667, height: 375, deviceScaleFactor: 1 });
    await page.evaluate(() => { WF.game.achQ = []; WF.touch = false; WF.game.menu.cpu = true; WF.game.render(); });
    const narrow = await page.evaluate(() => {
      const r = document.getElementById('game').getBoundingClientRect();
      return { w: r.width, h: r.height, top: r.top, left: r.left, iw: innerWidth, ih: innerHeight };
    });
    assert.ok(narrow.left >= -1 && narrow.top >= -1, JSON.stringify(narrow));
    assert.ok(narrow.left + narrow.w <= narrow.iw + 1 && narrow.top + narrow.h <= narrow.ih + 1, 'canvas clipped ' + JSON.stringify(narrow));
    await saveCanvas(page, 'clash-narrow.png');

    const realLocal = await reachClash({ cpu: false });
    assert.strictEqual(realLocal.fail, false, JSON.stringify(realLocal));
    assert.strictEqual(realLocal.line, 'P1 按 1–4，P2 按 7 8 9 0');
    assert.strictEqual(realLocal.cpu, false);
    await saveCanvas(page, 'clash-local-real.png');

    if (errors.length) throw new Error(errors.join('\n'));
    console.log('clash hint ok');
    console.log('shots', ART);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
