// 在线对战客户端。题目和血量以服务器为准；这里只负责进房、作答和把结果画出来。
// 不写玩家存档，对战里不朗读。
(function () {
  const W = window.WF = window.WF || {};
  const G = W.Game && W.Game.prototype;
  const Rules = W.NetRules;
  if (!G || !Rules) return;

  const CSS = `
#wf-net,#wf-net-bar{position:fixed;z-index:40;color:#f4efe2;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;}
#wf-net{inset:0;display:none;align-items:flex-start;justify-content:center;background:rgba(5,3,12,.72);overflow:auto;padding:12px;}
#wf-net.on{display:flex;}
#wf-net .card{width:min(560px,100%);margin:12px 0 24px;background:#140e28;border:3px solid #ffd23c;border-radius:16px;padding:14px 14px 16px;box-sizing:border-box;}
#wf-net h2{margin:0 0 6px;text-align:center;color:#ffd23c;font-size:28px;}
#wf-net-status{margin:0 0 8px;text-align:center;font-size:18px;line-height:1.35;color:#fff;}
#wf-net-hint{margin:0 0 8px;text-align:center;font-size:14px;line-height:1.4;color:#ffb4b4;}
#wf-net label{display:block;font-size:13px;color:#bfb3d6;margin:8px 0 4px;}
#wf-net input,#wf-net select{width:100%;box-sizing:border-box;font-size:18px;padding:10px 12px;border-radius:10px;border:2px solid #5d4f86;background:#0c0818;color:#fff;}
#wf-net .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
#wf-net button,.wf-net-btn{min-height:48px;padding:10px 14px;border-radius:12px;border:2px solid #ffd23c;background:#2a2148;color:#fff;font-size:18px;font-weight:700;}
#wf-net button:disabled{opacity:.45;}
#wf-net .grow{flex:1;}
#wf-net-lan-note{font-size:14px;line-height:1.45;color:#e9d7a6;background:rgba(255,210,60,.08);border-radius:10px;padding:8px 10px;margin:8px 0;}
#wf-net-fair{font-size:14px;line-height:1.45;color:#e9d7a6;background:rgba(255,210,60,.08);border-radius:10px;padding:8px 10px;margin:8px 0;}
#wf-net-invite-note{font-size:14px;line-height:1.4;color:#ffb4b4;margin:6px 0;}
#wf-net-codebig{font-size:40px;letter-spacing:.18em;text-align:center;color:#ffd23c;font-weight:800;margin:4px 0;}
#wf-net-players{font-size:16px;line-height:1.45;margin:6px 0;}
#wf-net .chars{display:flex;flex-wrap:wrap;gap:8px;}
#wf-net .chars button{flex:1;min-width:30%;}
#wf-net .chars button.on{background:#ffd23c;color:#1a1020;}
#wf-net-bar{left:0;right:0;bottom:0;display:none;gap:8px;justify-content:center;align-items:center;padding:10px;background:rgba(8,4,18,.92);}
#wf-net-bar.on{display:flex;}
#wf-net-bar p{margin:0;font-size:16px;flex:1;text-align:center;}
`;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:0;top:0;font-size:18px;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }

  const panel = el(`<div id="wf-net">
    <div class="card">
      <h2>同 WiFi 对战</h2>
      <p id="wf-net-status">未连接</p>
      <p id="wf-net-hint"></p>
      <div id="wf-net-setup">
        <p id="wf-net-lan-note">同一 WiFi：双方都要先用电脑启动时打印的游戏地址打开（例如 http://192.168.x.x:8787/），再创建房间或输入房间号。不用填服务器。</p>
        <div class="row">
          <button type="button" id="wf-net-create" class="grow">创建房间</button>
        </div>
        <label for="wf-net-code">房间码</label>
        <div class="row">
          <input id="wf-net-code" maxlength="4" autocapitalize="characters" placeholder="4 位房间码" style="flex:1">
          <button type="button" id="wf-net-join">加入</button>
        </div>
      </div>
      <div id="wf-net-room" style="display:none">
        <div id="wf-net-codebig"></div>
        <label for="wf-net-codeout">房间码（可长按复制）</label>
        <input id="wf-net-codeout" readonly>
        <div class="row">
          <button type="button" id="wf-net-copy" class="grow">复制房间码</button>
          <button type="button" id="wf-net-copylink" class="grow">复制邀请链接</button>
          <button type="button" id="wf-net-share" class="grow">分享</button>
        </div>
        <p id="wf-net-invite-note"></p>
        <p id="wf-net-fair"></p>
        <div id="wf-net-players"></div>
        <label for="wf-net-bank">词库（双方相同）</label>
        <select id="wf-net-bank"></select>
        <label for="wf-net-mode">题型（双方相同）</label>
        <select id="wf-net-mode">
          <option value="word">单词</option>
          <option value="math">数学</option>
          <option value="mix">混合</option>
        </select>
        <label for="wf-net-round">回合时间（双方相同）</label>
        <select id="wf-net-round">
          <option value="0">不限时</option>
          <option value="60">60 秒</option>
          <option value="90">90 秒</option>
          <option value="120">120 秒</option>
          <option value="180">180 秒</option>
        </select>
        <label>角色（只换外观和动作，数值相同）</label>
        <div id="wf-net-chars" class="chars"></div>
        <div class="row">
          <button type="button" id="wf-net-ready" class="grow">准备</button>
          <button type="button" id="wf-net-leave">离开</button>
        </div>
      </div>
      <div class="row"><button type="button" id="wf-net-back" class="grow">返回标题</button></div>
    </div>
  </div>`);
  document.body.appendChild(panel);
  const bar = el(`<div id="wf-net-bar"><p id="wf-net-bar-status"></p><button type="button" id="wf-net-rematch" class="wf-net-btn">再战一局</button><button type="button" id="wf-net-bar-leave" class="wf-net-btn">离开</button></div>`);
  document.body.appendChild(bar);

  const $ = (id) => document.getElementById(id);
  const nodes = {
    status: $('wf-net-status'), hint: $('wf-net-hint'),
    setup: $('wf-net-setup'), room: $('wf-net-room'), codebig: $('wf-net-codebig'),
    codeout: $('wf-net-codeout'), note: $('wf-net-invite-note'), fair: $('wf-net-fair'),
    players: $('wf-net-players'), bank: $('wf-net-bank'), mode: $('wf-net-mode'),
    round: $('wf-net-round'), chars: $('wf-net-chars'), ready: $('wf-net-ready'),
    copylink: $('wf-net-copylink'), share: $('wf-net-share'), barStatus: $('wf-net-bar-status'),
  };

  function charName(id) {
    const mv = W.CFG && W.CFG.MOVES && W.CFG.MOVES[id];
    return mv ? mv.name : id;
  }

  G.netDefaultUrl = function () {
    // 只认当前页面同源。同一 WiFi 场景要求双方都打开电脑启动时打印的局域网游戏地址，不再让玩家填服务器。
    try { localStorage.removeItem('wf_net_srv'); } catch (e) {}
    if (document.documentElement.hasAttribute('data-static-host')) return '';
    return Rules.defaultServer(location, '');
  };
  G.netName = function () {
    const p = W.Profiles && this.menu && W.Profiles.get(this.menu.p1);
    return Rules.sanitizeName(p && p.name);
  };
  G.netStatusLine = function () {
    if (this.netLink === 'connecting') return '连接中…';
    if (this.netLink === 'reconnecting') return '掉线，正在重连…';
    if (this.netLink === 'failed') return '重连失败，本局已结束';
    if (this.netLink === 'replaced') return '这个连接被另一边顶掉了';
    if (this.netLink !== 'open') return '已断开';
    if (this.netRoom && this.netRoom.status) return '已连接 · ' + this.netRoom.status;
    return '已连接。可以创建房间，或输入房间码加入。';
  };
  G.netShowPanel = function (on) { panel.classList.toggle('on', !!on); };
  G.netShowBar = function (on) { bar.classList.toggle('on', !!on); };
  G.netSend = function (obj) {
    if (this.netWs && this.netWs.readyState === 1) this.netWs.send(JSON.stringify(obj));
  };
  G.netCloseSocket = function () {
    if (this.netRetry) { clearTimeout(this.netRetry); this.netRetry = 0; }
    const ws = this.netWs;
    this.netWs = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch (e) {} }
  };
  G.netSaveMenu = function () {
    if (this._netMenu) return;
    const m = this.menu;
    this._netMenu = {
      cpu: m.cpu, wrongMatch: m.wrongMatch, mode: m.mode, bank: m.bank,
      char: m.char, vs: (m.vs || []).slice(), roundTime: m.roundTime,
    };
  };
  G.netRestoreMenu = function () {
    const s = this._netMenu;
    if (!s) return;
    this.menu.cpu = s.cpu;
    this.menu.wrongMatch = s.wrongMatch;
    this.menu.mode = s.mode;
    this.menu.bank = s.bank;
    this.menu.char = s.char;
    this.menu.vs = s.vs.slice();
    this.menu.roundTime = s.roundTime;
    this._netMenu = null;
  };
  G.netFillBanks = function (banks) {
    if (!banks || !banks.length || nodes.bank.dataset.ready) return;
    nodes.bank.innerHTML = '';
    banks.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name + '（' + b.count + '）';
      nodes.bank.appendChild(o);
    });
    nodes.bank.dataset.ready = '1';
    const cur = this.banks && this.banks[this.menu.bank];
    if (cur && banks.some(b => b.id === cur.id)) nodes.bank.value = cur.id;
  };
  G.netFillChars = function () {
    if (nodes.chars.childElementCount) return;
    Rules.FAIR.roster.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = charName(id);
      b.dataset.char = id;
      b.addEventListener('click', () => {
        this.netChar = id;
        this.netSend({ t: 'char', char: id });
        this.netPaintChars();
      });
      nodes.chars.appendChild(b);
    });
  };
  G.netPaintChars = function () {
    const id = this.netChar || 'suling';
    nodes.chars.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.char === id));
  };
  G.netInvite = function () {
    const code = this.netRoom && this.netRoom.code;
    return Rules.inviteInfo(location.href, this.netUrl || '', code || '');
  };
  G.netPaint = function () {
    const line = this.netStatusLine();
    if (nodes.status.textContent !== line) nodes.status.textContent = line;
    const hint = this.netHint || '';
    if (nodes.hint.textContent !== hint) nodes.hint.textContent = hint;
    const room = this.netRoom;
    const inRoom = !!(room && room.code && this.state === 'title');
    nodes.room.style.display = inRoom ? 'block' : 'none';
    nodes.setup.style.display = inRoom ? 'none' : 'block';
    if (!inRoom) return;
    nodes.codebig.textContent = room.code;
    if (nodes.codeout.value !== room.code) nodes.codeout.value = room.code;
    const info = this.netInvite();
    const note = info.public ? '这是公网邀请链接，朋友打开就能加入这个房间。' : info.reason;
    if (nodes.note.textContent !== note) nodes.note.textContent = note;
    nodes.copylink.disabled = !info.public;
    nodes.share.disabled = !info.public;
    const fair = (room.fair || Rules.FAIR.text) + ' 在线角色不带单机解锁和成长。';
    if (nodes.fair.textContent !== fair) nodes.fair.textContent = fair;
    const me = (room.players || []).find(p => p.slot === room.you);
    const lines = (room.players || []).map(p => {
      const who = p.slot === room.you ? '你' : '对方';
      const conn = p.connected ? '在线' : (p.reconnecting ? '掉线，等待重连' : '离开');
      const ready = room.phase === 'result' ? (p.rematch ? '已确认再战' : '还没确认再战') : (p.ready ? '已准备' : '未准备');
      return who + ' · ' + p.name + ' · ' + charName(p.char) + ' · ' + conn + ' · ' + ready;
    });
    if (!room.players || room.players.length < 2) lines.push('还差一位玩家');
    const pt = lines.join('\n');
    if (nodes.players.textContent !== pt) nodes.players.textContent = pt;
    const host = room.you === room.host && room.phase === 'lobby';
    nodes.bank.disabled = !host;
    nodes.mode.disabled = !host;
    nodes.round.disabled = !host;
    if (room.rules) {
      if (document.activeElement !== nodes.bank && nodes.bank.value !== room.rules.bankId && [...nodes.bank.options].some(o => o.value === room.rules.bankId)) nodes.bank.value = room.rules.bankId;
      if (document.activeElement !== nodes.mode) nodes.mode.value = room.rules.mode;
      if (document.activeElement !== nodes.round) nodes.round.value = String(room.rules.roundTime || 0);
    }
    nodes.ready.textContent = me && me.ready ? '取消准备' : '准备';
    nodes.ready.disabled = room.phase !== 'lobby' || (room.players || []).length < 2;
    if (me && me.char && me.char !== this.netChar) { this.netChar = me.char; this.netPaintChars(); }
  };
  G.netConnect = function () {
    const url = this.netDefaultUrl();
    if (!url) {
      this.netLink = 'closed';
      this.netHint = '当前页面没有对战服务，也不能自动发现同一 WiFi 里的电脑。请先在电脑运行 node server/index.js，用它打印的局域网地址（例如 http://192.168.x.x:8787/）打开游戏，再创建或输入房间号。GitHub Pages 链接不能只靠房间号配对。';
      this.netPaint();
      return;
    }
    if (this.netWs && this.netUrl === url && (this.netWs.readyState === 0 || this.netWs.readyState === 1)) return;
    this.netCloseSocket();
    this.netUrl = url;
    this.netWant = true;
    this.netLink = this.netWantResume && this.netToken ? 'reconnecting' : 'connecting';
    this.netHint = '';
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) {
      this.netLink = 'failed';
      this.netHint = '连不上本机对战服务。请确认电脑上的 node server/index.js 还在运行，并且你打开的是它打印的游戏地址。';
      this.netPaint();
      return;
    }
    this.netWs = ws;
    const self = this;
    ws.onopen = function () {
      if (self.netWs !== ws) return;
      self.netLink = 'open';
      self.netReconnectUntil = 0;
      self.netSend({ t: 'hello', name: self.netName(), token: self.netWantResume ? self.netToken : undefined });
      self.netPaint();
    };
    ws.onmessage = function (ev) {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      self.netOn(msg);
    };
    ws.onerror = function () {};
    ws.onclose = function () {
      if (self.netWs === ws) self.netWs = null;
      self.netOnClose();
    };
    this.netPaint();
  };
  G.netOnClose = function () {
    if (this.netRetry) { clearTimeout(this.netRetry); this.netRetry = 0; }
    if (this.netLink === 'replaced' || this.netLeft) {
      if (this.netLink !== 'replaced') this.netLink = 'closed';
      this.netPaint();
      return;
    }
    const can = this.netWant && this.netToken && this.netRoom && (this.netLive || (this.netRoom && this.netRoom.code));
    if (can) {
      this.netWantResume = true;
      if (!this.netReconnectUntil) this.netReconnectUntil = Date.now() + (this.netReconnectMs || 12000);
      if (Date.now() > this.netReconnectUntil) {
        this.netLink = 'failed';
        this.netHint = '重连失败，本局已结束。不会假装还连着。';
        this.netWant = false;
        this.netShowPanel(true);
      } else {
        this.netLink = 'reconnecting';
        this.netHint = '掉线了，正在重连。超时还没连上，这局会判负。';
        this.netShowPanel(true);
        this.netRetry = setTimeout(() => { if (this.netWant) this.netConnect(); }, 400);
      }
    } else {
      this.netLink = 'closed';
      if (!this.netHint) this.netHint = '已断开';
    }
    this.netPaint();
    if (this.render) this.render();
  };
  G.netOn = function (msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'status') {
      if (msg.reconnectMs) this.netReconnectMs = msg.reconnectMs;
      this.netPaint();
      return;
    }
    if (msg.t === 'hello') {
      this.netFillBanks(msg.banks);
      if (msg.reconnectMs) this.netReconnectMs = msg.reconnectMs;
      this.netLink = 'open';
      if (this.netAutoJoin && !this.netRoom) {
        const code = this.netAutoJoin;
        this.netAutoJoin = '';
        nodes.code && ( $('wf-net-code').value = code );
        this.netSend({ t: 'join', code, name: this.netName(), char: this.netChar || 'suling' });
      }
      this.netPaint();
      return;
    }
    if (msg.t === 'error') {
      this.netHint = msg.message || '出错了';
      this.netPaint();
      return;
    }
    if (msg.t === 'joined') {
      this.netToken = msg.token;
      this.netSlot = msg.slot;
      this.netReconnectMs = msg.reconnectMs || this.netReconnectMs;
      this.netLeft = false;
      try {
        sessionStorage.setItem('wf_net_token', msg.token);
        sessionStorage.setItem('wf_net_code', msg.code);
      } catch (e) {}
      if (msg.resumed) this.netHint = '已重新连上';
      this.netPaint();
      return;
    }
    if (msg.t === 'room') {
      this.netRoom = msg;
      if (msg.reconnectMs) this.netReconnectMs = msg.reconnectMs;
      const me = (msg.players || []).find(p => p.slot === msg.you);
      if (me) this.netChar = me.char;
      if (msg.phase === 'result') this.netShowBar(true);
      this.netPaint();
      if (this.render) this.render();
      return;
    }
    if (msg.t === 'replaced') {
      this.netLink = 'replaced';
      this.netWant = false;
      this.netWantResume = false;
      this.netHint = '这个连接被另一边顶掉了，没有自动再连。';
      this.netPaint();
      return;
    }
    if (msg.t === 'start') { this.netBegin(msg); return; }
    if (msg.t === 'question') { this.netQuestion(msg); return; }
    if (msg.t === 'lock') { this.netLock(msg); return; }
    if (msg.t === 'resolve') { this.netResolve(msg); return; }
    if (msg.t === 'clash') { this.netClash(msg); return; }
    if (msg.t === 'end') { this.netEnd(msg); return; }
    if (msg.t === 'peer') {
      if (msg.event === 'down') this.netHint = '对手掉线，房间会等一会儿重连';
      this.netPaint();
    }
  };
  G.netBegin = function (msg) {
    this.netSaveMenu();
    this.netLive = true;
    this.netLeft = false;
    this.netMatchId = msg.matchId;
    this.netSlot = msg.you;
    this.netRules = msg.rules;
    this.netRematched = false;
    this.netResolved = 0;
    this.netLog = [];
    this.menu.cpu = false;
    this.menu.wrongMatch = false;
    this.menu.mode = msg.rules.mode;
    this.menu.roundTime = 0;
    this.matchStart = null;
    const ordered = (msg.players || []).slice().sort((a, b) => a.slot - b.slot);
    this.chars = [ordered[0].char, ordered[1].char];
    // 不用 spawnFighters：它会按本机存档把两人换成不同角色。
    this.p = [new W.Fighter(this.chars[0], 0), new W.Fighter(this.chars[1], 1)];
    const C = W.CFG, c = C.STAGE_W / 2;
    this.p[0].x = c - C.GAP / 2; this.p[1].x = c + C.GAP / 2; this.cam = c;
    this.p.forEach(f => { f.maxHp = Rules.FAIR.hp; f.hp = Rules.FAIR.hp; f.trail = Rules.FAIR.hp; f.play('idle'); });
    this.streak = [0, 0]; this.ansCombo = [0, 0]; this.combo = [null, null];
    this.stats = [Rules.emptyStats(), Rules.emptyStats()];
    this.queue = []; this.pops = []; this.ko = null; this.koText = 0; this.result = null; this.clash = null; this.q = null;
    this.banner = null; this.announce = null; this.rating = null;
    this.hitstop = 0; this.hsTargets = []; this.shake = 0; this.rumble = 0; this.shakeX = 0; this.shakeY = 0;
    this.darken = 0; this.darkenTarget = 0; this.screenFlash = 0; this.slow = 0; this.excite = 0;
    this.paused = false; this.pendingAttack = null; this.missOnly = false; this.camp = null;
    this.unlockShow = []; this.dailyToast = null;
    this.bank = { id: msg.rules.bankId, name: msg.rules.bankName };
    this.state = 'question';
    this.netShowPanel(false);
    this.netShowBar(false);
    try { W.Audio.startMusic(); } catch (e) {}
    this.netApplySnap(msg.snap);
    if (this.render) this.render();
  };
  G.netSyncClock = function (serverNow) {
    if (typeof serverNow === 'number') this.netSkew = serverNow - Date.now();
  };
  G.netNow = function () { return Date.now() + (this.netSkew || 0); };
  G.netApplySnap = function (snap) {
    if (!snap || !snap.hp) return;
    this.netSnap = snap;
    for (const s of [0, 1]) if (this.p && this.p[s]) {
      this.p[s].maxHp = Rules.FAIR.hp;
      this.p[s].hp = snap.hp[s];
      if (this.p[s].trail > snap.hp[s]) this.p[s].trail = snap.hp[s];
    }
    if (snap.streak) this.streak = snap.streak.slice();
    if (snap.ansCombo) this.ansCombo = snap.ansCombo.slice();
    if (snap.stats) this.stats = snap.stats.map(s => Object.assign(Rules.emptyStats(), s));
    this.netLog = this.netLog || [];
    this.netLog.push({ qn: this.netQn || 0, hp: snap.hp.slice() });
  };
  G.netQuestion = function (msg) {
    if (!this.netLive || msg.matchId !== this.netMatchId) return;
    if (msg.qid && this.netQid === msg.qid && this.q && !msg.resume) return;
    this.netSyncClock(msg.serverNow);
    this.netQid = msg.qid;
    this.netQn = msg.qn;
    this.netPhase = msg.phase;
    this.netQStarted = msg.startedAt;
    this.netLocked = false;
    this.netApplySnap(msg.snap);
    const q = msg.q || {};
    this.q = {
      word: q.rawWord || q.word, displayWord: q.word, pos: q.pos || '',
      options: (q.options || []).slice(), kind: q.kind || 'word', fmt: q.fmt || '',
      meaning: q.hint || '', ex: q.exEn ? { en: q.exEn, zh: '' } : null,
      correct: -1, ans: [null, null], revealed: false, t: 0, n: msg.qn, flash: null, bank: q.bank,
    };
    this.qn = msg.qn;
    this.state = msg.phase === 'clash' ? 'clash' : 'question';
    this.pendingAttack = null;
    if (msg.clash) {
      this.clash = { score: msg.clash.score.slice(), t: 0, n: msg.clash.n, done: false };
      this.netClashStarted = msg.clash.start;
    } else if (msg.phase !== 'clash') this.clash = null;
    if (msg.resume) this.netHint = '已重新连上';
    if (this.render) this.render();
  };
  G.netLock = function (msg) {
    if (!this.q || msg.matchId !== this.netMatchId || msg.qn !== this.netQn) return;
    if (msg.slot === this.netSlot) return;
    if (!this.q.ans[msg.slot]) this.q.ans[msg.slot] = { idx: -1, t: this.q.t, ok: true, pending: true };
    if (this.render) this.render();
  };
  G.netAnimate = function (outcome) {
    if (!outcome || outcome.attacker == null || outcome.kind === 'miss' || outcome.kind === 'clash' || outcome.kind === 'clash-draw') {
      if (outcome && outcome.kind === 'clash') this.announce = { text: '角力！', sub: '先答对 3 题', t: 0, life: 36 };
      return;
    }
    const A = this.p[outcome.attacker], D = this.p[1 - outcome.attacker];
    if (!A || !D) return;
    const anim = outcome.band === 'ult' ? ((A.mv.ult && A.mv.ult[0]) || 'hyper_combo') : (A.mv.late && outcome.band === 'block' ? A.mv.late : 'combo_a');
    try { A.play(anim); } catch (e) {}
    try {
      if (outcome.ko) D.play('knocked_down_death', { hold: true });
      else if (outcome.band === 'block') D.play('block_hit', { next: 'block_recover' });
      else D.play('hit_swap');
    } catch (e) {}
    if (outcome.band === 'ult') this.banner = { text: (A.mv && A.mv.ultName) || '必杀', side: A.side, t: 0 };
    try {
      if (outcome.ko) W.Audio.play('boom');
      else W.Audio.play(outcome.band === 'block' ? 'block' : 'hit', { power: 1 });
    } catch (e) {}
  };
  G.netResolve = function (msg) {
    if (!this.netLive || msg.matchId !== this.netMatchId) return;
    const key = (msg.qid || 0) + ':' + (msg.phase || '');
    if (this.netResolvedKey === key) return;
    this.netResolvedKey = key;
    this.netApplySnap(msg.snap);
    if (this.q && (msg.qid == null || msg.qid === this.netQid)) {
      this.q.revealed = true;
      this.q.revealT = this.t;
      this.q.correct = msg.correct;
      if (msg.exZh && this.q.ex) this.q.ex.zh = msg.exZh;
      for (const a of msg.answers || []) if (a) this.q.ans[a.slot] = { idx: a.idx, t: Math.round((a.sec || 0) * 30), ok: !!a.ok };
    }
    this.netAnimate(msg.outcome);
    if (!(msg.outcome && msg.outcome.ko)) this.state = 'resolve';
    this.netLocked = true;
    if (this.render) this.render();
  };
  G.netClash = function (msg) {
    if (!this.netLive || msg.matchId !== this.netMatchId) return;
    this.netApplySnap(msg.snap);
    if (this.clash && msg.score) this.clash.score = msg.score.slice();
    if (this.render) this.render();
  };
  G.netEnd = function (msg) {
    if (msg.matchId && this.netMatchId && msg.matchId !== this.netMatchId) return;
    this.netApplySnap(msg.snap);
    this.netSecs = msg.secs || 0;
    this.netEndText = msg.text || '';
    const w = msg.winner;
    const draw = w == null || msg.reason === 'draw';
    this.ko = {
      winner: draw ? this.p[0] : this.p[w],
      loser: draw ? this.p[1] : this.p[w === 0 ? 1 : 0],
      draw, timeup: msg.reason === 'time' || msg.reason === 'draw', forfeit: msg.reason === 'forfeit',
    };
    this.netRematched = false;
    this.showResult();
    this.netShowBar(true);
    nodes.barStatus.textContent = (msg.text ? msg.text + '。' : '') + (this.netRematched ? '已确认再战，等待对方' : '双方都点再战，就在这个房间再来一局');
    if (this.render) this.render();
  };
  G.netAnswer = function (idx) {
    if (!this.netLive || this.netLocked) return;
    if (this.state !== 'question' && this.state !== 'clash') return;
    if (!this.q || this.q.revealed) return;
    idx = +idx;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;
    this.netLocked = true;
    if (!this.q.ans) this.q.ans = [null, null];
    this.q.ans[this.netSlot] = { idx, t: this.q.t || 0, ok: true, pending: true };
    const msgId = [this.netMatchId, this.netQid, this.netSlot, Date.now(), Math.random().toString(16).slice(2)].join(':');
    this.netSend({ t: 'answer', matchId: this.netMatchId, qn: this.netQn, qid: this.netQid, phase: this.netPhase, idx, msgId });
    if (this.render) this.render();
  };
  G.netRematch = function () {
    if (!this.netLive || this.netRematched) return;
    this.netRematched = true;
    this.netSend({ t: 'rematch', on: true });
    nodes.barStatus.textContent = '已确认再战，等待对方';
  };
  G.netDrop = function () {
    this.netSend({ t: 'leave' });
    this.netWant = false;
    this.netWantResume = false;
    this.netLeft = true;
    this.netLive = false;
    this.netRoom = null;
    this.netToken = '';
    this.netReconnectUntil = 0;
    try { sessionStorage.removeItem('wf_net_token'); sessionStorage.removeItem('wf_net_code'); } catch (e) {}
    this.netCloseSocket();
    this.netLink = 'closed';
    this.netRestoreMenu();
    this.netShowPanel(false);
    this.netShowBar(false);
  };
  G.openNet = function (opts) {
    opts = opts || {};
    this.state = 'title';
    this.ui.screen = 'net';
    this.netLeft = false;
    this.netFillChars();
    if (!this.netChar) this.netChar = 'suling';
    this.netPaintChars();
    if (opts.join) this.netAutoJoin = String(opts.join).toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[01OI]/g, '').slice(0, 4);
    let token = '', code = '';
    try { token = sessionStorage.getItem('wf_net_token') || ''; code = sessionStorage.getItem('wf_net_code') || ''; } catch (e) {}
    if (token && code && !opts.join) { this.netToken = token; this.netWantResume = true; }
    this.netShowPanel(true);
    this.netConnect();
    if (this.render) this.render();
  };

  function ensureConnected(g) {
    if (!g) return false;
    if (g.netLink === 'open') return true;
    g.netWantResume = false;
    g.netConnect();
    if (g.netLink === 'open') return true;
    if (!g.netHint) g.netHint = '还没连上对战服务。同一 WiFi 请先用电脑打印的游戏地址打开，再创建或加入房间。';
    g.netPaint();
    return false;
  }
  $('wf-net-create').addEventListener('click', () => {
    const g = W.game; if (!ensureConnected(g)) return;
    g.netSend({
      t: 'create', name: g.netName(), char: g.netChar || 'suling',
      bankId: nodes.bank.value, mode: nodes.mode.value, roundTime: +nodes.round.value,
    });
  });
  $('wf-net-join').addEventListener('click', () => {
    const g = W.game; if (!ensureConnected(g)) return;
    const code = $('wf-net-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!code) { g.netHint = '请输入 4 位房间码'; g.netPaint(); return; }
    g.netSend({ t: 'join', code, name: g.netName(), char: g.netChar || 'mrj' });
  });
  function sendRules() {
    const g = W.game;
    if (!g || !g.netRoom || g.netRoom.you !== g.netRoom.host || g.netRoom.phase !== 'lobby') return;
    g.netSend({ t: 'rules', bankId: nodes.bank.value, mode: nodes.mode.value, roundTime: +nodes.round.value });
  }
  nodes.bank.addEventListener('change', sendRules);
  nodes.mode.addEventListener('change', sendRules);
  nodes.round.addEventListener('change', sendRules);
  $('wf-net-ready').addEventListener('click', () => {
    const g = W.game; if (!g || !g.netRoom) return;
    const me = (g.netRoom.players || []).find(p => p.slot === g.netRoom.you);
    g.netSend({ t: 'ready', on: !(me && me.ready), char: g.netChar || 'suling' });
  });
  $('wf-net-copy').addEventListener('click', () => {
    const g = W.game; const code = g && g.netRoom && g.netRoom.code;
    if (!code) return;
    copyText(code).then(() => { g.netHint = '已复制房间码'; g.netPaint(); });
  });
  $('wf-net-copylink').addEventListener('click', () => {
    const g = W.game; if (!g) return;
    const info = g.netInvite();
    if (!info.public) { g.netHint = info.reason; g.netPaint(); return; }
    copyText(info.url).then(() => { g.netHint = '已复制邀请链接'; g.netPaint(); });
  });
  $('wf-net-share').addEventListener('click', () => {
    const g = W.game; if (!g) return;
    const info = g.netInvite();
    if (!info.public) { g.netHint = info.reason; g.netPaint(); return; }
    const payload = { title: '单词格斗', text: '来单词格斗，房间 ' + g.netRoom.code, url: info.url };
    if (navigator.share) navigator.share(payload).catch(() => copyText(info.url));
    else copyText(info.url);
  });
  function leave() { const g = W.game; if (g) g.goTitle(); }
  $('wf-net-leave').addEventListener('click', leave);
  $('wf-net-back').addEventListener('click', leave);
  $('wf-net-bar-leave').addEventListener('click', leave);
  $('wf-net-rematch').addEventListener('click', () => { const g = W.game; if (g) g.netRematch(); });

  const basePersist = G.persistMenu;
  G.persistMenu = function () { if (this.netLive || (this.ui && this.ui.screen === 'net')) return; return basePersist.call(this); };
  const baseShow = G.showResult;
  G.showResult = function () {
    if (this.netLive) {
      const ko = this.ko || {};
      const Wf = ko.winner;
      this.state = 'result';
      this.result = {
        winner: ko.draw ? -1 : (Wf ? Wf.side : 0),
        draw: !!ko.draw, timeup: !!ko.timeup, forfeit: !!ko.forfeit,
        secs: this.netSecs || 0, t: 0, net: true,
      };
      try { W.Audio.stopMusic(); } catch (e) {}
      return;
    }
    return baseShow.apply(this, arguments);
  };
  const baseStart = G.startMatch;
  G.startMatch = function (wrong) {
    if (this.netLive) { this.netRematch(); return; }
    return baseStart.call(this, wrong);
  };
  const baseGo = G.goTitle;
  G.goTitle = function () {
    if (!this._netLeaving && (this.netLive || this.netRoom || (this.ui && this.ui.screen === 'net'))) {
      this._netLeaving = true;
      this.netDrop();
      this._netLeaving = false;
    }
    return baseGo.call(this);
  };
  const baseAnswer = G.answer;
  G.answer = function (side, idx) {
    if (this.netLive) { this.netAnswer(idx); return; }
    return baseAnswer.call(this, side, idx);
  };
  const baseInput = G.input;
  G.input = function (code) {
    if (this.netLive) {
      const C = W.CFG;
      let idx = -1;
      if (code in C.KEYS_P1) idx = C.KEYS_P1[code];
      else if (code in C.KEYS_P2) idx = C.KEYS_P2[code];
      if (idx < 0) return false;
      this.netAnswer(idx);
      return true;
    }
    return baseInput.call(this, code);
  };
  const baseNQ = G.newQuestion;
  G.newQuestion = function () {
    if (this.netLive) return;
    return baseNQ.call(this);
  };
  const baseUQ = G.updateQuestion;
  G.updateQuestion = function () {
    if (this.netLive) {
      if (this.q && this.netQStarted) this.q.t = Math.max(0, Math.round((this.netNow() - this.netQStarted) / 1000 * W.CFG.FPS));
      if (this.q && this.q.flash) this.q.flash.t++;
      return;
    }
    return baseUQ.call(this);
  };
  const baseUC = G.updateClash;
  G.updateClash = function () {
    if (this.netLive) {
      if (this.q && this.netQStarted) this.q.t = Math.max(0, Math.round((this.netNow() - this.netQStarted) / 1000 * W.CFG.FPS));
      if (this.clash && this.netClashStarted) this.clash.t = Math.max(0, Math.round((this.netNow() - this.netClashStarted) / 1000 * W.CFG.FPS));
      return;
    }
    return baseUC.call(this);
  };
  const baseUpd = G.update;
  G.update = function () {
    if (this.netLive) {
      const p1 = this.menu.p1, p2 = this.menu.p2;
      this.menu.p1 = null; this.menu.p2 = null;
      try { return baseUpd.call(this); }
      finally { this.menu.p1 = p1; this.menu.p2 = p2; }
    }
    return baseUpd.call(this);
  };
  const baseRender = G.render;
  G.render = function () {
    if (this.state === 'title' && this.ui && this.ui.screen === 'net') {
      this.renderWorld();
      this.netPaint();
      return;
    }
    baseRender.call(this);
    if (!this.netLive) return;
    const C = W.CFG;
    if (this.state !== 'result') {
      this.box(C.SCREEN_W - 86, 8, 74, 36, 'rgba(20,14,40,.9)', '#ff8a8a', 2);
      this.txt('离开', C.SCREEN_W - 49, 26, 16, '#ffb4b4', 'center', { sw: 3 });
      this.touchRects = this.touchRects || [];
      this.touchRects.push({ x: C.SCREEN_W - 86, y: 8, w: 74, h: 36, key: 'net-leave' });
      const link = this.netLink === 'reconnecting' ? '掉线，正在重连' : (this.netLink === 'failed' ? '重连失败' : '公平对战');
      this.txt(link + ' · 你是 P' + ((this.netSlot || 0) + 1), C.SCREEN_W / 2, 122, 14, '#e9d7a6', 'center', { sw: 3 });
    }
  };
  const baseDR = G.drawResult;
  G.drawResult = function () {
    baseDR.call(this);
    if (!this.netLive || !this.result) return;
    const C = W.CFG;
    this.box(80, 486, 800, 40, 'rgba(12,8,24,.94)', '#ffd23c', 2);
    const extra = this.result.forfeit ? '对手掉线或离开，本局结束。' : '';
    const wait = this.netRematched ? '已确认再战，等待对方。' : '双方确认后，原房间再战。';
    this.txt(extra + wait + '  Esc 离开', C.SCREEN_W / 2, 506, 16, '#ffd23c', 'center', { sw: 4 });
  };
  const baseTouch = W.touchHit;
  W.touchHit = function (g, x, y) {
    if (g && g.netLive) {
      const t = W.pickRect ? W.pickRect(g.touchRects || [], x, y) : null;
      if (t && t.key === 'net-leave') { g.goTitle(); return true; }
      if (g.state === 'result') { g.netRematch(); return true; }
      const a = (g.ansRects || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (a && (g.state === 'question' || g.state === 'clash')) { g.netAnswer(a.i); return true; }
      return true;
    }
    return baseTouch ? baseTouch(g, x, y) : false;
  };
  window.addEventListener('keydown', (e) => {
    const g = W.game;
    if (!g) return;
    if (g.ui && g.ui.screen === 'net' && g.state === 'title' && e.code === 'Escape') {
      e.preventDefault(); e.stopPropagation(); g.goTitle(); return;
    }
    if (!g.netLive || g.state === 'title') return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); g.goTitle(); }
    else if (e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); }
  }, true);

  if (W.Speech && W.Speech.speak && !W.Speech._netGuard) {
    const orig = W.Speech.speak.bind(W.Speech);
    W.Speech.speak = function () {
      const g = W.game;
      if (g && g.netLive) { W.Speech._netBlocked = (W.Speech._netBlocked || 0) + 1; return false; }
      return orig.apply(W.Speech, arguments);
    };
    W.Speech._netGuard = true;
  }

  function maybeJoin() {
    if (!W.game || !W.ready) { setTimeout(maybeJoin, 40); return; }
    let code = '';
    try {
      const q = new URLSearchParams(location.search);
      code = q.get('net') || '';
    } catch (e) {}
    // 忽略 ?srv=。同一 WiFi 只走当前页面同源，避免把旧公网地址或任意服务器塞进本地对战。
    if (code) W.game.openNet({ join: code });
  }
  window.addEventListener('load', () => setTimeout(maybeJoin, 0));
})();
