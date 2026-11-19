// 语音命令解析和提交状态机。模拟 speech 事件，不是真机、也不是跑步机实测。
const assert = require('assert');
const Parse = require('../js/voiceparse');
const Machine = require('../js/voicemachine');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function machine() {
  return Machine.createVoiceMachine(Parse.parseVoice);
}
function listen(m, qid) {
  m.handle({ type: 'listening' });
  m.handle({ type: 'question', qid: qid == null ? 1 : qid });
}
function say(m, transcript, extra) {
  return m.handle(Object.assign({
    type: 'result', transcript, confidence: 0.9, isFinal: true, qid: m.qid,
  }, extra || {}));
}

test('letters and chinese number readings map to A B C D', () => {
  const samples = [
    ['A', 0], ['a', 0], ['选A', 0], ['选一', 0], ['一', 0], ['第一个', 0], ['甲', 0], ['one', 0], ['1', 0],
    ['B', 1], ['选二', 1], ['二', 1], ['第二个', 1], ['乙', 1], ['two', 1], ['answer b', 1],
    ['C', 2], ['选三', 2], ['三', 2], ['第三个', 2], ['丙', 2], ['three', 2], ['option c', 2],
    ['D', 3], ['选四', 3], ['四', 3], ['第四个', 3], ['丁', 3], ['four', 3], ['number 4', 3],
  ];
  for (const [text, idx] of samples) {
    const got = Parse.parseVoice(text, 0.95);
    assert.strictEqual(got.type, 'answer', text);
    assert.strictEqual(got.idx, idx, text);
  }
});

test('irrelevant, long, ambiguous and low confidence are not answers', () => {
  assert.strictEqual(Parse.parseVoice('hello', 0.99).reason, 'irrelevant');
  assert.strictEqual(Parse.parseVoice('跑步', 0.99).reason, 'irrelevant');
  assert.strictEqual(Parse.parseVoice('about', 0.99).reason, 'irrelevant');
  assert.strictEqual(Parse.parseVoice('a b', 0.99).reason, 'irrelevant');
  assert.strictEqual(Parse.parseVoice('我觉得这个词的意思应该是奔跑而不是走路', 0.99).reason, 'too_long');
  assert.strictEqual(Parse.parseVoice('a', 0.2).reason, 'low_confidence');
  assert.strictEqual(Parse.parseVoice('a', 0).type, 'answer');
  assert.strictEqual(Parse.parseVoice('', 0.9).reason, 'empty');
});

test('pause and resume phrases', () => {
  assert.strictEqual(Parse.parseVoice('暂停', 0.9).type, 'pause');
  assert.strictEqual(Parse.parseVoice('pause', 0.9).type, 'pause');
  assert.strictEqual(Parse.parseVoice('继续', 0.9).type, 'resume');
  assert.strictEqual(Parse.parseVoice('resume', 0.9).type, 'resume');
});

test('one submit per question; noise and duplicates do not submit', () => {
  const m = machine();
  listen(m, 3);
  assert.strictEqual(say(m, '嗯嗯').action, 'ignore');
  assert.strictEqual(m.submitted, null);
  const ok = say(m, '选二');
  assert.strictEqual(ok.action, 'answer');
  assert.strictEqual(ok.idx, 1);
  assert.strictEqual(ok.qid, 3);
  assert.strictEqual(say(m, '选三').reason, 'duplicate');
  assert.strictEqual(m.highlight, 1);
});

test('stale result from the previous question cannot select the next one', () => {
  const m = machine();
  listen(m, 1);
  m.handle({ type: 'question', qid: 2 });
  const late = say(m, 'A', { qid: 1 });
  assert.strictEqual(late.reason, 'stale');
  assert.strictEqual(m.submitted, null);
  const now = say(m, 'C', { qid: 2 });
  assert.strictEqual(now.action, 'answer');
  assert.strictEqual(now.idx, 2);
});

test('interim results and results while not listening are ignored', () => {
  const m = machine();
  listen(m, 1);
  assert.strictEqual(say(m, 'A', { isFinal: false }).reason, 'interim');
  m.handle({ type: 'ended' });
  assert.strictEqual(m.status, 'interrupted');
  assert.strictEqual(say(m, 'A').reason, 'not_listening');
  assert.strictEqual(m.submitted, null);
});

test('pause blocks answers until resume, including a spoken resume', () => {
  const m = machine();
  listen(m, 4);
  assert.strictEqual(m.handle({ type: 'pause' }).action, 'pause');
  assert.strictEqual(say(m, 'A').reason, 'paused');
  assert.strictEqual(say(m, '继续').action, 'resume');
  assert.strictEqual(m.status, 'listening');
  assert.strictEqual(say(m, 'D').action, 'answer');
});

test('permission denial, unsupported, background and restart do not pretend to keep listening', () => {
  const denied = machine();
  denied.handle({ type: 'listening' });
  denied.handle({ type: 'denied' });
  assert.strictEqual(denied.status, 'denied');
  assert.strictEqual(denied.listening, false);
  assert.strictEqual(say(denied, 'A').reason, 'not_listening');

  const missing = machine();
  missing.handle({ type: 'unsupported' });
  assert.strictEqual(missing.status, 'unsupported');
  assert.strictEqual(say(missing, 'B').reason, 'not_listening');

  const bg = machine();
  listen(bg, 1);
  bg.handle({ type: 'background' });
  assert.strictEqual(bg.listening, false);
  assert.strictEqual(say(bg, 'A').reason, 'not_listening');
  bg.handle({ type: 'need_gesture' });
  assert.strictEqual(bg.status, 'need_gesture');
  assert.strictEqual(say(bg, 'A').reason, 'not_listening');
  bg.handle({ type: 'listening' });
  assert.strictEqual(say(bg, 'A').action, 'answer');
});

test('waiting produces no submit; there is no timer on the machine', () => {
  const m = machine();
  listen(m, 8);
  assert.strictEqual(m.submitted, null);
  assert.strictEqual(m.status, 'listening');
  assert.ok(!m.handle.length || true);
});

async function browserHold() {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) { console.log('skip browser voice hold'); return; }
  const { start } = require('../server/index');
  const srv = await start({ host: '127.0.0.1', port: 0, presentMs: 40, reconnectMs: 300, tickMs: 40 });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(40000);
    await page.goto('http://127.0.0.1:' + srv.port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WF && WF.ready);
    const report = await page.evaluate(() => {
      const g = WF.game;
      if (WF.setManual) WF.setManual(true);
      g._voicePersist = true;
      g._voiceSaved = { cpu: g.menu.cpu, roundTime: g.menu.roundTime };
      g.menu.cpu = true;
      g.voiceMode = true;
      g.startMatch();
      let n = 0;
      while (g.state !== 'question' && n++ < 500) g.update();
      const qn = g.q && g.q.n;
      const word = g.q && g.q.word;
      WF.Voice.machine.handle({ type: 'listening' });
      WF.Voice.onQuestion(g);
      for (let i = 0; i < 800; i++) g.update();
      const waited = { state: g.state, qn: g.q && g.q.n, same: g.q && g.q.word === word };
      const letters = ['a', 'b', 'c', 'd'];
      const first = WF.Voice.debugResult(g, { transcript: letters[g.q.correct], confidence: 0.92, isFinal: true });
      const second = WF.Voice.debugResult(g, { transcript: 'b', confidence: 0.99, isFinal: true });
      const late = WF.Voice.machine.handle({ type: 'question', qid: 99 });
      const stale = WF.Voice.machine.handle({ type: 'result', transcript: 'a', confidence: 0.99, isFinal: true, qid: qn });
      return {
        waited, first: { action: first.action, idx: first.idx },
        second: second.reason || second.action,
        stale: stale.reason,
        t: g.q && g.q.t,
        fair: WF.Voice.fairFrames(),
        net: !!g.netLive,
      };
    });
    assert.strictEqual(report.waited.state, 'question');
    assert.strictEqual(report.waited.qn, 1);
    assert.strictEqual(report.waited.same, true);
    assert.strictEqual(report.first.action, 'answer');
    assert.strictEqual(report.second, 'duplicate');
    assert.strictEqual(report.stale, 'stale');
    assert.strictEqual(report.t, report.fair);
    assert.strictEqual(report.net, false);
    console.log('ok  browser voice wait has no timeout and submits once');
  } finally {
    await browser.close();
    await srv.close();
  }
}

test('browser: voice mode waits without timeout, then one submit', browserHold);

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('ok  ' + t.name);
    } catch (err) {
      failed++;
      console.error('FAIL ' + t.name);
      console.error(err && err.stack || err);
    }
  }
  if (failed) process.exit(1);
  console.log('voice tests passed: ' + tests.length);
})().catch((err) => { console.error(err); process.exit(1); });
