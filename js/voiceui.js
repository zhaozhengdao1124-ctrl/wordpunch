// 语音答题：单机、免手。没有倒计时，说清楚一个选项才结算。
// 使用浏览器的 Web Speech。Chrome 等通常会把声音发给浏览器厂商做识别，不能当成完全离线或只在本地处理。
// 本游戏不把录音上传到自己的服务器。联机规则不走这里。
(function () {
  const W = window.WF = window.WF || {};
  const G = W.Game && W.Game.prototype;
  const Parse = W.VoiceParse;
  const Machine = W.VoiceMachine;
  if (!G || !Parse || !Machine) return;

  const FAIR_PAST_FAST = 1;
  const STATUS_TEXT = {
    off: '还没开始听',
    listening: '正在听。说 A B C D，或选一、选二、选三、选四。',
    paused: '已暂停。说「继续」，或点继续。',
    interrupted: '监听中断了。点一下「恢复监听」，不会假装还在听。',
    background: '页面在后台，已经停止听。回到前台后点一下「恢复监听」。',
    need_gesture: '需要再点一次，浏览器才允许继续听。',
    denied: '麦克风权限被拒绝。可以改用触摸答题，或在浏览器设置里允许麦克风。',
    unsupported: '这个浏览器没有语音识别。请用普通对战，或换用 Chrome / 新版 Safari。',
    starting: '正在打开麦克风…',
  };

  const machine = Machine.createVoiceMachine(Parse.parseVoice);
  let rec = null;
  let wantListen = false;
  let restarts = 0;

  function SpeechCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function supported() { return !!SpeechCtor(); }

  function fairFrames() {
    return Math.round(((W.CFG.FAST_S || 5) + FAIR_PAST_FAST) * (W.CFG.FPS || 30));
  }

  const css = document.createElement('style');
  css.textContent = `
#wf-voice-intro,#wf-voice-bar{position:fixed;z-index:45;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;color:#f4efe2;}
#wf-voice-intro{inset:0;display:none;align-items:flex-start;justify-content:center;background:rgba(5,3,12,.78);overflow:auto;padding:16px;}
#wf-voice-intro.on{display:flex;}
#wf-voice-intro .card{width:min(640px,100%);margin:12px auto;background:#140e28;border:3px solid #ffd23c;border-radius:16px;padding:16px;box-sizing:border-box;}
#wf-voice-intro h2{margin:0 0 8px;text-align:center;color:#ffd23c;font-size:28px;}
#wf-voice-intro p{margin:8px 0;font-size:16px;line-height:1.45;}
#wf-voice-intro button,#wf-voice-bar button{min-height:52px;padding:10px 14px;border-radius:12px;border:2px solid #ffd23c;background:#2a2148;color:#fff;font-size:18px;font-weight:700;}
#wf-voice-bar{left:0;right:0;bottom:0;display:none;flex-direction:column;gap:8px;padding:8px 10px 12px;background:rgba(8,4,18,.94);}
#wf-voice-bar.on{display:flex;}
#wf-voice-status{margin:0;text-align:center;font-size:18px;line-height:1.35;}
#wf-voice-opts{display:flex;gap:8px;}
#wf-voice-opts button{flex:1;min-height:72px;font-size:22px;line-height:1.2;text-align:center;}
#wf-voice-opts button.on{background:#ffd23c;color:#1a1020;}
#wf-voice-actions{display:flex;gap:8px;justify-content:center;}
`;
  document.head.appendChild(css);

  const intro = document.createElement('div');
  intro.id = 'wf-voice-intro';
  intro.innerHTML = `<div class="card">
    <h2>语音答题</h2>
    <p>适合把手机放在支架上、慢慢走的时候用。不要在跑步时使用，跑起来容易听错，也不安全。</p>
    <p>说 A、B、C、D，或「选一」「选二」「选三」「选四」。说「暂停」「继续」。没听清不会替你提交。没有倒计时，说清楚才进入下一题。</p>
    <p>识别用的是浏览器自带的语音识别。Chrome 通常会把声音发给浏览器厂商的在线服务来识别，不能保证离线可用，也不是完全在你的手机本地处理。苹果手机的 Safari 常常听完一句就停，停了需要再点一次。本游戏不会把录音上传到自己的服务器。</p>
    <p id="wf-voice-intro-status"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" id="wf-voice-arm">启用麦克风并开始</button>
      <button type="button" id="wf-voice-back">返回</button>
    </div>
  </div>`;
  document.body.appendChild(intro);
  const bar = document.createElement('div');
  bar.id = 'wf-voice-bar';
  bar.innerHTML = `<p id="wf-voice-status"></p><div id="wf-voice-opts"></div>
    <div id="wf-voice-actions" class="wf-voice-actions">
      <button type="button" id="wf-voice-pause">暂停</button>
      <button type="button" id="wf-voice-resume">继续</button>
      <button type="button" id="wf-voice-retry">恢复监听</button>
      <button type="button" id="wf-voice-exit">退出</button>
    </div>`;
  document.body.appendChild(bar);
  const $ = (id) => document.getElementById(id);

  function setIntro(on) { intro.classList.toggle('on', !!on); }
  function setBar(on) { bar.classList.toggle('on', !!on); }

  function paint(g) {
    const st = machine.status;
    const el = $('wf-voice-status');
    if (el) el.textContent = STATUS_TEXT[st] || machine.note || '';
    const introSt = $('wf-voice-intro-status');
    if (introSt && intro.classList.contains('on')) introSt.textContent = STATUS_TEXT[st] || '';
    const box = $('wf-voice-opts');
    if (!box || !g || !g.q || !g.voiceMode) return;
    const labels = ['A', 'B', 'C', 'D'];
    const opts = g.q.options || [];
    if (box.childElementCount !== 4) {
      box.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.idx = String(i);
        b.addEventListener('click', () => { if (g.voiceMode && !g.paused) g.answer(0, i); });
        box.appendChild(b);
      }
    }
    for (let i = 0; i < 4; i++) {
      const b = box.children[i];
      b.textContent = labels[i] + '  ' + (opts[i] || '');
      b.classList.toggle('on', machine.highlight === i);
    }
    $('wf-voice-retry').style.display = (st === 'interrupted' || st === 'need_gesture' || st === 'background') ? '' : 'none';
  }

  function stopRec() {
    wantListen = false;
    if (!rec) return;
    try { rec.onend = null; rec.stop(); } catch (e) {}
    rec = null;
  }

  function ensureRec(g) {
    const Ctor = SpeechCtor();
    if (!Ctor) { machine.handle({ type: 'unsupported' }); return null; }
    if (rec) return rec;
    const r = new Ctor();
    r.lang = 'zh-CN';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = function () {
      restarts = 0;
      machine.handle({ type: 'listening' });
      paint(g);
    };
    r.onresult = function (ev) {
      const res = ev.results && ev.results[ev.resultIndex];
      const alt = res && res[0];
      if (!alt) return;
      const out = machine.handle({
        type: 'result',
        transcript: alt.transcript,
        confidence: typeof alt.confidence === 'number' ? alt.confidence : null,
        isFinal: !!res.isFinal,
        qid: g && g.q ? g.q.n : machine.qid,
      });
      apply(g, out);
    };
    r.onerror = function (ev) {
      const code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') machine.handle({ type: 'denied' });
      else if (code === 'aborted') { /* stop() */ }
      else machine.handle({ type: 'ended' });
      paint(g);
    };
    r.onend = function () {
      rec = null;
      if (!wantListen) return;
      if (document.hidden) {
        machine.handle({ type: 'background' });
        wantListen = false;
        paint(g);
        return;
      }
      machine.handle({ type: 'ended' });
      if (machine.status === 'interrupted' && restarts < 1 && g && g.voiceMode && !g.paused) {
        restarts++;
        machine.handle({ type: 'need_gesture' });
      }
      paint(g);
    };
    rec = r;
    return r;
  }

  function startRec(g) {
    const r = ensureRec(g);
    if (!r) return false;
    wantListen = true;
    try { r.start(); return true; }
    catch (e) {
      machine.handle({ type: 'need_gesture' });
      paint(g);
      return false;
    }
  }

  function apply(g, out) {
    if (!g || !out) return;
    if (out.action === 'pause') { g.paused = true; try { W.Audio.stopMusic(); } catch (e) {} }
    if (out.action === 'resume') { g.paused = false; try { W.Audio.startMusic(); } catch (e) {} }
    if (out.action === 'answer' && out.qid === (g.q && g.q.n) && !g.paused) g.answer(0, out.idx);
    paint(g);
    if (g.render) g.render();
  }

  function onQuestion(g) {
    if (!g || !g.voiceMode || !g.q) return;
    machine.handle({ type: 'question', qid: g.q.n });
    paint(g);
  }

  const Voice = W.Voice = {
    machine: machine,
    supported: supported,
    statusText: STATUS_TEXT,
    onQuestion: onQuestion,
    fairFrames: fairFrames,
    stop(g) {
      stopRec();
      machine.status = 'off';
      machine.listening = false;
      machine.highlight = null;
      if (g) {
        g.voiceMode = false;
        if (g._voiceSaved) {
          g.menu.cpu = g._voiceSaved.cpu;
          g.menu.roundTime = g._voiceSaved.roundTime;
          g._voiceSaved = null;
        }
        g._voicePersist = false;
      }
      setIntro(false);
      setBar(false);
    },
    open() {
      const g = W.game;
      if (!g) return;
      if (!supported()) machine.handle({ type: 'unsupported' });
      else machine.status = 'off';
      setIntro(true);
      setBar(false);
      paint(g);
    },
    armAndStart() {
      const g = W.game;
      if (!g || !supported()) { machine.handle({ type: 'unsupported' }); paint(g); return; }
      machine.status = 'starting';
      paint(g);
      const r = ensureRec(g);
      if (!r) return;
    wantListen = true;
    r.onstart = function () {
        restarts = 0;
        machine.handle({ type: 'listening' });
        beginMatch(g);
      };
      try { r.start(); }
      catch (e) { machine.handle({ type: 'need_gesture' }); paint(g); }
    },
    debugResult(g, ev) {
      const out = machine.handle(Object.assign({ type: 'result', qid: g && g.q ? g.q.n : machine.qid, isFinal: true }, ev));
      apply(g, out);
      return out;
    },
  };

  function beginMatch(g) {
    if (!g || g.voiceMode) { setIntro(false); setBar(true); paint(g); return; }
    g._voiceSaved = { cpu: g.menu.cpu, roundTime: g.menu.roundTime };
    g._voicePersist = true;
    g.menu.cpu = true;
    g.voiceMode = true;
    setIntro(false);
    setBar(true);
    g.startMatch(false);
    paint(g);
  }

  document.addEventListener('visibilitychange', function () {
    const g = W.game;
    if (!g || !g.voiceMode) return;
    if (document.hidden) {
      wantListen = false;
      stopRec();
      machine.handle({ type: 'background' });
      paint(g);
    } else if (machine.status === 'background') {
      machine.handle({ type: 'need_gesture' });
      paint(g);
    }
  });

  $('wf-voice-arm').addEventListener('click', () => Voice.armAndStart());
  $('wf-voice-back').addEventListener('click', () => { setIntro(false); const g = W.game; if (g) g.goTitle(); });
  $('wf-voice-pause').addEventListener('click', () => { const g = W.game; if (!g) return; apply(g, machine.handle({ type: 'pause' })); });
  $('wf-voice-resume').addEventListener('click', () => { const g = W.game; if (!g) return; apply(g, machine.handle({ type: 'resume' })); });
  $('wf-voice-retry').addEventListener('click', () => { const g = W.game; if (g) startRec(g); });
  $('wf-voice-exit').addEventListener('click', () => { const g = W.game; if (g) g.goTitle(); });

  const baseHome = G.homeButtons;
  G.homeButtons = function () {
    const b = baseHome.call(this).slice();
    const i = b.findIndex(x => x.key === 'start');
    b.splice(i + 1, 0, { key: 'voice', label: '语音答题' });
    return b;
  };
  const baseAct = G.menuAct;
  G.menuAct = function (key, d) {
    if (key === 'voice') { Voice.open(); return; }
    return baseAct.call(this, key, d);
  };
  const basePersist = G.persistMenu;
  G.persistMenu = function () { if (this._voicePersist) return; return basePersist.call(this); };
  const baseNQ = G.newQuestion;
  G.newQuestion = function () {
    const r = baseNQ.apply(this, arguments);
    if (this.voiceMode && !this.netLive) onQuestion(this);
    return r;
  };
  const baseUQ = G.updateQuestion;
  G.updateQuestion = function () {
    if (this.voiceMode && !this.netLive && this.q) return;
    return baseUQ.call(this);
  };
  const baseEnd = G.endByTime;
  G.endByTime = function () { if (this.voiceMode && !this.netLive) return; return baseEnd.call(this); };
  const baseAnswer = G.answer;
  G.answer = function (side, idx) {
    if (this.voiceMode && !this.netLive && side === 0 && this.q && (this.state === 'question' || this.state === 'clash')) {
      this.q.t = fairFrames();
    }
    return baseAnswer.call(this, side, idx);
  };
  const baseGo = G.goTitle;
  G.goTitle = function () {
    if (this.voiceMode || machine.listening) Voice.stop(this);
    setIntro(false);
    setBar(false);
    return baseGo.call(this);
  };
  const baseRender = G.render;
  G.render = function () {
    const r = baseRender.apply(this, arguments);
    if (this.voiceMode && this.state !== 'title') {
      setBar(true);
      paint(this);
      const C = W.CFG;
      if (this.state === 'question' || this.state === 'clash') {
        this.box(C.SCREEN_W / 2 - 78, 6, 156, 108, 'rgba(12,8,24,0.94)', '#ffd23c', 2);
        this.txt('在听', C.SCREEN_W / 2, 42, 28, '#ffd23c', 'center', { sw: 4 });
        this.txt('不倒计时', C.SCREEN_W / 2, 78, 16, '#ffffff', 'center', { sw: 3 });
      }
    }
    return r;
  };
})();
