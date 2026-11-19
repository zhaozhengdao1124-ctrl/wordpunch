// 权威房间：题目、作答时间、血量、胜负都在这里结算。两个客户端只提交选择，不能各自往下演。
const crypto = require('crypto');
const Rules = require('../js/netrules');

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function uid() {
  return crypto.randomBytes(9).toString('hex');
}
function codeOf() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPH[crypto.randomInt(ALPH.length)];
  return s;
}
function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

function createRooms(engine, opts) {
  opts = opts || {};
  const reconnectMs = opts.reconnectMs != null ? opts.reconnectMs : 12000;
  const presentMs = opts.presentMs != null ? opts.presentMs : 750;
  const clashWindowMs = opts.clashWindowMs != null ? opts.clashWindowMs : Math.round(Rules.FAIR.clashWindowS * 1000);
  const testReveal = !!opts.testReveal;
  const rooms = new Map();
  const byToken = new Map();

  function freshRules(msg) {
    const bank = engine.bankById(msg && msg.bankId) || engine.banks[0];
    const mode = Rules.sanitizeMode(msg && msg.mode);
    return {
      version: Rules.FAIR.version,
      bankId: bank ? bank.id : '',
      bankName: bank ? bank.name : '',
      mode: (mode === 'word' && !bank) ? 'math' : mode,
      roundTime: Rules.sanitizeRound(msg && msg.roundTime),
      hp: Rules.FAIR.hp,
      roster: Rules.FAIR.roster.slice(),
      text: Rules.FAIR.text,
    };
  }

  function publicRoom(room, you) {
    return {
      t: 'room',
      code: room.code,
      phase: room.phase,
      you: you,
      host: room.hostSlot,
      players: room.players.map(p => ({
        slot: p.slot,
        name: p.name,
        char: p.char,
        ready: !!p.ready,
        rematch: !!p.rematch,
        connected: !!p.connected,
        reconnecting: !p.connected && !p.left,
      })),
      rules: room.rules,
      reconnectMs,
      fair: Rules.FAIR.text,
    };
  }

  class Room {
    constructor(code, hostMsg) {
      this.code = code;
      this.players = [];
      this.phase = 'lobby';
      this.rules = freshRules(hostMsg);
      this.hostSlot = 0;
      this.match = null;
      this.seq = 1;
      this.status = '等待对手加入';
    }
    player(slot) { return this.players.find(p => p.slot === slot) || null; }
    other(slot) { return this.players.find(p => p.slot !== slot) || null; }
    broadcast(obj, except) {
      for (const p of this.players) if (p !== except && p.ws) send(p.ws, obj);
    }
    sendRoom() {
      for (const p of this.players) if (p.ws) send(p.ws, publicRoom(this, p.slot));
    }
    setRules(msg) {
      const next = freshRules(Object.assign({}, this.rules, {
        bankId: msg.bankId != null ? msg.bankId : this.rules.bankId,
        mode: msg.mode != null ? msg.mode : this.rules.mode,
        roundTime: msg.roundTime != null ? msg.roundTime : this.rules.roundTime,
      }));
      next.hp = Rules.FAIR.hp;
      this.rules = next;
    }
    add(conn, msg, host) {
      const slot = this.players.length ? 1 : 0;
      const p = {
        id: uid(),
        token: uid(),
        name: Rules.sanitizeName(msg && msg.name),
        char: Rules.sanitizeChar(msg && msg.char),
        slot,
        ready: false,
        rematch: false,
        ws: conn.ws,
        conn,
        connected: true,
        left: false,
        disconnectAt: 0,
        host: !!host || slot === 0,
      };
      conn.player = p;
      conn.room = this;
      this.players.push(p);
      byToken.set(p.token, p);
      if (host) this.hostSlot = p.slot;
      this.status = this.players.length < 2 ? '等待对手加入' : '人都到了，双方准备后开始';
      send(p.ws, { t: 'joined', token: p.token, slot: p.slot, code: this.code, reconnectMs });
      this.sendRoom();
      return p;
    }
    detach(p, intentional) {
      if (!p || p.left) return;
      if (intentional) {
        p.left = true;
        p.connected = false;
        p.ws = null;
        byToken.delete(p.token);
        this.players = this.players.filter(x => x !== p);
        if (this.phase === 'fight') this.finish({ reason: 'forfeit', winner: this.players[0] ? this.players[0].slot : null, text: '对手离开了房间' });
        if (!this.players.length) {
          rooms.delete(this.code);
          return;
        }
        if (!this.players.some(x => x.slot === this.hostSlot)) {
          this.hostSlot = this.players[0].slot;
          this.players[0].host = true;
        }
        if (this.phase !== 'fight') {
          this.phase = 'lobby';
          this.match = null;
          this.players.forEach(x => { x.ready = false; x.rematch = false; });
          this.status = '对手已离开，房间还在';
        }
        this.sendRoom();
        return;
      }
      p.connected = false;
      p.ws = null;
      p.disconnectAt = Date.now();
      this.status = '有人掉线，等待重连';
      this.sendRoom();
      this.broadcast({ t: 'peer', event: 'down', slot: p.slot, reconnectMs });
    }
    rebind(p, conn) {
      if (p.conn && p.conn !== conn && p.conn.ws && p.conn.ws !== conn.ws) {
        const old = p.conn;
        old.player = null;
        old.replaced = true;
        send(old.ws, { t: 'replaced' });
        try { old.ws.close(); } catch (e) {}
      }
      p.conn = conn;
      p.ws = conn.ws;
      p.connected = true;
      p.disconnectAt = 0;
      p.left = false;
      conn.player = p;
      conn.room = this;
      const resumed = this.phase === 'fight' || this.phase === 'result';
      send(p.ws, { t: 'joined', token: p.token, slot: p.slot, code: this.code, reconnectMs, resumed });
      this.status = this.phase === 'fight' ? '对战中' : this.status;
      this.sendRoom();
      if (this.phase === 'fight' && this.match) this.pushLive(p);
      if (this.phase === 'result' && this.match && this.match.end) send(p.ws, this.match.end);
    }
    begin() {
      if (this.players.length < 2) return;
      if (!this.players.every(p => p.connected)) return;
      const seed = crypto.randomInt(1, 0x7fffffff);
      const mode = this.rules.mode;
      const bankId = this.rules.bankId;
      let source = null;
      try { source = engine.createSource(bankId, mode, seed); } catch (e) { source = null; }
      const state = Rules.freshState();
      this.match = {
        id: uid(),
        seed,
        source,
        mode,
        bankId,
        state,
        q: null,
        qn: 0,
        phase: 'q',
        started: Date.now(),
        qStart: 0,
        deadline: 0,
        answers: [null, null],
        seen: new Set(),
        clash: null,
        presentUntil: 0,
        rnd: Rules.mulberry32((seed ^ 0x9e3779b9) >>> 0),
        end: null,
        pausedAt: 0,
      };
      this.phase = 'fight';
      this.players.forEach(p => { p.ready = false; p.rematch = false; });
      this.status = '对战中';
      const start = {
        t: 'start',
        matchId: this.match.id,
        rules: this.rules,
        youNeed: true,
        players: this.players.map(p => ({ slot: p.slot, name: p.name, char: p.char })),
        snap: Rules.snap(state, { roundLeft: this.rules.roundTime || null }),
      };
      for (const p of this.players) send(p.ws, Object.assign({ you: p.slot }, start));
      this.dealQuestion(false);
    }
    dealQuestion(clash) {
      const m = this.match;
      if (!m || m.end) return;
      let raw = null;
      try { raw = m.source ? m.source.next() : null; } catch (e) { raw = null; }
      if (!raw || !raw.options || raw.options.length < 4) {
        try {
          const math = engine.createSource(this.rules.bankId, 'math', (m.seed + m.qn + 17) >>> 0);
          raw = math.next();
        } catch (e) { raw = null; }
      }
      if (!raw) {
        this.finish({ reason: 'draw', winner: null, text: '出题失败' });
        return;
      }
      if (!clash) m.qn += 1;
      raw.n = m.qn;
      m.qid = (m.qid || 0) + 1;
      m.q = raw;
      m.answers = [null, null];
      m.phase = clash ? 'clash' : 'q';
      const now = Date.now();
      m.qStart = now;
      const kind = raw.kind || 'word';
      const secs = clash ? Rules.FAIR.clashQuestionS : Rules.windows(kind).timeout;
      m.deadline = now + secs * 1000;
      if (clash && !m.clash) m.clash = { score: [0, 0], start: now, n: 0 };
      if (clash) m.clash.n += 1;
      const pub = Rules.publishQuestion(raw, false);
      if (testReveal) pub.correct = raw.correct;
      const msg = {
        t: 'question',
        matchId: m.id,
        qn: m.qn,
        qid: m.qid,
        phase: m.phase,
        q: pub,
        startedAt: m.qStart,
        deadline: m.deadline,
        serverNow: now,
        clash: m.clash ? { score: m.clash.score.slice(), n: m.clash.n, start: m.clash.start, cap: m.clash.start + Rules.FAIR.clashCapS * 1000 } : null,
        snap: Rules.snap(m.state, { roundLeft: this.roundLeft(now) }),
      };
      this.broadcast(msg);
    }
    roundLeft(now) {
      if (!this.rules.roundTime || !this.match) return null;
      return Math.max(0, this.rules.roundTime - (now - this.match.started) / 1000);
    }
    pushLive(p) {
      const m = this.match;
      if (!m || !m.q || m.end) return;
      const pub = Rules.publishQuestion(m.q, false);
      if (testReveal) pub.correct = m.q.correct;
      send(p.ws, {
        t: 'question',
        matchId: m.id,
        qn: m.qn,
        qid: m.qid,
        phase: m.phase,
        q: pub,
        startedAt: m.qStart,
        deadline: m.deadline,
        serverNow: Date.now(),
        clash: m.clash ? { score: m.clash.score.slice(), n: m.clash.n, start: m.clash.start, cap: m.clash.start + Rules.FAIR.clashCapS * 1000 } : null,
        snap: Rules.snap(m.state, { roundLeft: this.roundLeft(Date.now()) }),
        resume: true,
      });
    }
    onAnswer(p, msg, now) {
      const m = this.match;
      if (!m || m.end || this.phase !== 'fight') return;
      if (msg.matchId && msg.matchId !== m.id) return;
      if (msg.qn != null && +msg.qn !== m.qn) return;
      if (msg.phase && msg.phase !== m.phase) return;
      if (msg.qid != null && +msg.qid !== m.qid) return;
      const id = String(msg.msgId || '');
      if (id) {
        if (m.seen.has(id)) return;
        m.seen.add(id);
        if (m.seen.size > 400) m.seen.clear();
      }
      const idx = +msg.idx;
      if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;
      if (m.phase === 'present') return;
      if (m.answers[p.slot]) return;
      const q = m.q;
      if (!q) return;
      const sec = Math.max(0, (now - m.qStart) / 1000);
      const ok = idx === q.correct;
      m.answers[p.slot] = { idx, sec, ok, at: now };
      this.broadcast({ t: 'lock', matchId: m.id, qn: m.qn, phase: m.phase, slot: p.slot });
      this.consider(now);
    }
    shiftTimers(dt) {
      const m = this.match;
      if (!m || !dt) return;
      m.started += dt;
      m.qStart += dt;
      m.deadline += dt;
      if (m.presentUntil) m.presentUntil += dt;
      if (m.clash) m.clash.start += dt;
      for (const a of m.answers) if (a) a.at += dt;
    }
    timeUp(now) {
      const left = this.roundLeft(now);
      if (left == null || left > 0) return false;
      const hp = this.match.state.hp;
      let winner = null;
      let reason = 'time';
      if (hp[0] > hp[1]) winner = 0;
      else if (hp[1] > hp[0]) winner = 1;
      else reason = 'draw';
      this.finish({ reason, winner, text: reason === 'draw' ? '时间到，平局' : '时间到' });
      return true;
    }
    miss(reason) {
      Rules.wipePace(this.match.state);
      this.resolve({ kind: 'miss', reason: reason || 'miss', attacker: null, band: 'none', dmg: 0, ko: false });
    }
    attack(slot, sec, kind) {
      const m = this.match;
      const outcome = Rules.hit(m.state, slot, sec, kind, m.rnd());
      this.resolve(Object.assign({ kind: 'hit' }, outcome));
    }
    resolve(outcome) {
      const m = this.match;
      const q = m.q;
      const revealed = Rules.publishQuestion(q, true);
      const msg = {
        t: 'resolve',
        matchId: m.id,
        qn: m.qn,
        qid: m.qid,
        phase: m.phase,
        correct: q.correct,
        meaning: revealed.meaning || '',
        exZh: revealed.exZh || '',
        answers: [0, 1].map(s => m.answers[s] ? { slot: s, idx: m.answers[s].idx, ok: m.answers[s].ok, sec: +m.answers[s].sec.toFixed(3) } : null),
        outcome,
        snap: Rules.snap(m.state, { roundLeft: this.roundLeft(Date.now()) }),
      };
      m.phase = 'present';
      m.presentUntil = Date.now() + (outcome.ko ? Math.max(presentMs, 400) : presentMs);
      m.pending = outcome.ko ? { end: true, winner: outcome.attacker } : (outcome.clashNext ? { clash: true } : null);
      this.broadcast(msg);
      if (outcome.ko) {
        m.pending = { end: true, winner: outcome.attacker, reason: 'ko' };
      }
    }
    peekUlt(slot, sec, kind) {
      const w = Rules.windows(kind);
      if (sec > w.fast) return false;
      return this.match.state.streak[slot] + 1 >= Rules.FAIR.ultAt;
    }
    countCorrect(slot) {
      const m = this.match, a = m.answers[slot];
      if (!a || !a.ok || a.counted) return;
      a.counted = true;
      const st = m.state.stats[slot];
      st.answered++; st.correct++;
      st.sumT += Math.round(a.sec * 30);
      m.state.ansCombo[slot] = (m.state.ansCombo[slot] || 0) + 1;
      st.maxCombo = Math.max(st.maxCombo || 0, m.state.ansCombo[slot]);
    }
    startClash() {
      const m = this.match;
      // 两边都答对：记进统计，然后清连击进度进入角力（和单机 startClash 一样，不在这一下掉血）。
      this.countCorrect(0); this.countCorrect(1);
      m.state.streak = [0, 0];
      const revealed = Rules.publishQuestion(m.q, true);
      this.broadcast({
        t: 'resolve',
        matchId: m.id,
        qn: m.qn,
        qid: m.qid,
        phase: 'q',
        correct: m.q.correct,
        meaning: revealed.meaning || '',
        exZh: revealed.exZh || '',
        answers: [0, 1].map(s => m.answers[s] ? { slot: s, idx: m.answers[s].idx, ok: true, sec: +m.answers[s].sec.toFixed(3) } : null),
        outcome: { kind: 'clash', attacker: null, band: 'clash', dmg: 0, ko: false },
        snap: Rules.snap(m.state, { roundLeft: this.roundLeft(Date.now()) }),
      });
      m.clash = { score: [0, 0], start: Date.now(), n: 0 };
      m.phase = 'present';
      m.presentUntil = Date.now() + Math.min(presentMs, 400);
      m.pending = { clash: true };
    }
    clashView() {
      const m = this.match;
      return {
        t: 'clash',
        matchId: m.id,
        qn: m.qn,
        score: m.clash.score.slice(),
        snap: Rules.snap(m.state, { roundLeft: this.roundLeft(Date.now()) }),
      };
    }
    endClash(slot) {
      const m = this.match;
      let outcome;
      if (slot == null) {
        outcome = { kind: 'clash-draw', attacker: null, band: 'none', dmg: 0, ko: false };
      } else {
        outcome = Object.assign({ kind: 'hit' }, Rules.clashHit(m.state, slot));
      }
      m.clash = null;
      m.phase = 'q';
      this.resolve(outcome);
    }
    finish(info) {
      if (this.phase === 'result' && this.match && this.match.end) return;
      const m = this.match;
      const now = Date.now();
      const secs = m ? Math.max(0, (now - m.started) / 1000) : 0;
      const msg = {
        t: 'end',
        matchId: m ? m.id : '',
        reason: info.reason,
        winner: info.winner == null ? null : info.winner,
        text: info.text || '',
        secs,
        snap: m ? Rules.snap(m.state, { roundLeft: 0 }) : null,
        fair: Rules.FAIR.text,
      };
      if (m) m.end = msg;
      this.phase = 'result';
      this.status = '本局结束。双方都确认后，原房间再战一局';
      this.players.forEach(p => { p.rematch = false; p.ready = false; });
      this.broadcast(msg);
      this.sendRoom();
    }
    tick(now) {
      for (const p of this.players.slice()) {
        if (!p.connected && !p.left && p.disconnectAt && now - p.disconnectAt >= reconnectMs) {
          p.left = true;
          byToken.delete(p.token);
          this.players = this.players.filter(x => x !== p);
          if (this.phase === 'fight') {
            const other = this.players[0];
            this.finish({ reason: 'forfeit', winner: other ? other.slot : null, text: '对手掉线，没有在限时内重连' });
          } else if (!this.players.length) rooms.delete(this.code);
          else {
            if (!this.players.some(x => x.slot === this.hostSlot)) this.hostSlot = this.players[0].slot;
            this.phase = this.phase === 'fight' ? this.phase : 'lobby';
            if (this.phase !== 'result') {
              this.phase = 'lobby';
              this.match = null;
            }
            this.status = '对手未能重连';
            this.sendRoom();
          }
        }
      }
      if (this.phase !== 'fight' || !this.match || this.match.end) return;
      const down = this.players.some(p => !p.connected);
      if (down) {
        if (!this.match.pausedAt) this.match.pausedAt = now;
        return;
      }
      if (this.match.pausedAt) {
        this.shiftTimers(now - this.match.pausedAt);
        this.match.pausedAt = 0;
        this.status = '对战中';
        this.sendRoom();
      }
      const m = this.match;
      if (m.phase === 'present') {
        if (now >= m.presentUntil) {
          const pend = m.pending;
          m.pending = null;
          if (pend && pend.end) this.finish({ reason: pend.reason || 'ko', winner: pend.winner, text: 'KO' });
          else if (pend && pend.clash) this.dealQuestion(true);
          else this.dealQuestion(false);
        }
        return;
      }
      this.consider(now);
    }
  }

  // The consider() path above has a bug: when both answers are in and one is wrong,
  // noteWrong + attack is correct only if we haven't already noteWrong'd.
  // When only the correct one is in and the window elapsed, we should not noteWrong a missing player.
  // I need to fix double noteWrong on the "both answered, one correct" path because
  // noteWrong + later if consider isn't reentered it's once. OK.
  // BUT: "both wrong" calls noteWrong then miss() which wipePace. Good.
  // Clash considerClash calls noteWrong every tick if one is wrong and deadline not reached.
  // THAT is a bug. I must count a wrong clash answer only once.

  const origConsiderClash = Room.prototype.considerClash;
  Room.prototype.considerClash = function (now) {
    const m = this.match;
    // Count each wrong clash answer once, when it arrives, via a flag.
    for (const s of [0, 1]) {
      const a = m.answers[s];
      if (a && !a.ok && !a.counted) {
        Rules.noteWrong(m.state, s);
        a.counted = true;
      }
    }
    const cap = m.clash.start + Rules.FAIR.clashCapS * 1000;
    if (now >= cap) return this.endClash(null);
    const a0 = m.answers[0], a1 = m.answers[1];
    const take = (slot) => {
      const a = m.answers[slot];
      if (a.counted) return;
      a.counted = true;
      m.state.stats[slot].answered++;
      m.state.stats[slot].correct++;
      m.state.stats[slot].sumT += Math.round(a.sec * 30);
      m.clash.score[slot]++;
      this.broadcast(this.clashView());
      if (m.clash.score[slot] >= Rules.FAIR.clashWin) return this.endClash(slot);
      m.phase = 'present';
      m.presentUntil = Date.now() + Math.min(280, presentMs);
      m.pending = { clash: true };
    };
    if (a0 && a0.ok && (!a1 || !a1.ok || a0.at <= a1.at)) return take(0);
    if (a1 && a1.ok) return take(1);
    if (a0 && a1 && !a0.ok && !a1.ok) {
      m.phase = 'present';
      m.presentUntil = Date.now() + Math.min(280, presentMs);
      m.pending = { clash: true };
      return;
    }
    if (now >= m.deadline) {
      m.phase = 'present';
      m.presentUntil = Date.now() + Math.min(200, presentMs);
      m.pending = { clash: true };
    }
  };
  void origConsiderClash;

  // Fix the question resolver so wrong answers are counted once and correct answers
  // are not also passed through noteWrong. Replace consider with a clean version.
  Room.prototype.consider = function (now) {
    const m = this.match;
    if (!m || m.end || m.phase === 'present') return;
    if (this.timeUp(now)) return;
    if (m.phase === 'clash') return this.considerClash(now);
    const q = m.q;
    if (!q) return;
    const kind = q.kind || 'word';
    for (const s of [0, 1]) {
      const a = m.answers[s];
      if (a && !a.ok && !a.counted) { Rules.noteWrong(m.state, s); a.counted = true; }
    }
    const a0 = m.answers[0], a1 = m.answers[1];
    const both = !!(a0 && a1);
    if (both && a0.ok && a1.ok) {
      const first = a0.at <= a1.at ? 0 : 1;
      const dt = Math.abs(a0.at - a1.at);
      if (!this.peekUlt(first, m.answers[first].sec, kind) && dt <= clashWindowMs) return this.startClash();
      this.countCorrect(1 - first);
      return this.attack(first, m.answers[first].sec, kind);
    }
    if (both && (a0.ok || a1.ok)) {
      const slot = a0.ok ? 0 : 1;
      return this.attack(slot, m.answers[slot].sec, kind);
    }
    if (both && !a0.ok && !a1.ok) return this.miss('both-wrong');
    const onlySlot = a0 ? 0 : a1 ? 1 : -1;
    if (onlySlot >= 0 && m.answers[onlySlot].ok) {
      const a = m.answers[onlySlot];
      if (this.peekUlt(onlySlot, a.sec, kind) || now - a.at >= clashWindowMs) return this.attack(onlySlot, a.sec, kind);
    }
    if (now >= m.deadline) {
      if (a0 && a0.ok) return this.attack(0, a0.sec, kind);
      if (a1 && a1.ok) return this.attack(1, a1.sec, kind);
      return this.miss('timeout');
    }
  };

  function onMsg(conn, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') { send(conn.ws, { t: 'pong', n: msg.n || 0, serverNow: Date.now() }); return; }
    if (msg.t === 'hello') {
      send(conn.ws, {
        t: 'hello',
        banks: engine.banks,
        fair: Rules.FAIR.text,
        roster: Rules.FAIR.roster,
        modes: Rules.FAIR.modes,
        roundTimes: Rules.FAIR.roundTimes,
        hp: Rules.FAIR.hp,
        reconnect: true,
        reconnectMs,
      });
      if (msg.token && byToken.has(msg.token)) {
        const p = byToken.get(msg.token);
        if (p && !p.left && p.conn && p.conn.room) p.conn.room.rebind(p, conn);
      }
      return;
    }
    if (msg.t === 'create') {
      if (conn.room) return;
      let code = codeOf();
      for (let i = 0; i < 6 && rooms.has(code); i++) code = codeOf();
      const room = new Room(code, msg);
      rooms.set(code, room);
      // growth / hp / items / difficulty on msg are ignored inside freshRules
      room.add(conn, msg, true);
      return;
    }
    if (msg.t === 'join') {
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const room = rooms.get(code);
      if (!room) { send(conn.ws, { t: 'error', code: 'no_room', message: '没有这个房间' }); return; }
      if (room.players.length >= 2) { send(conn.ws, { t: 'error', code: 'full', message: '房间已经满了' }); return; }
      if (room.phase === 'fight') { send(conn.ws, { t: 'error', code: 'in_match', message: '这局已经开始了' }); return; }
      room.add(conn, msg, false);
      return;
    }
    const room = conn.room, p = conn.player;
    if (!room || !p) { send(conn.ws, { t: 'error', code: 'no_room', message: '还没有加入房间' }); return; }
    if (msg.t === 'rules') {
      if (p.slot !== room.hostSlot || room.phase !== 'lobby') return;
      room.setRules(msg);
      room.sendRoom();
      return;
    }
    if (msg.t === 'char') {
      if (room.phase === 'fight') return;
      p.char = Rules.sanitizeChar(msg.char);
      room.sendRoom();
      return;
    }
    if (msg.t === 'ready') {
      if (room.phase !== 'lobby') return;
      p.ready = !!msg.on;
      if (msg.char) p.char = Rules.sanitizeChar(msg.char);
      room.status = room.players.length < 2 ? '等待对手加入' : (room.players.every(x => x.ready) ? '开始' : '等人准备');
      room.sendRoom();
      if (room.players.length === 2 && room.players.every(x => x.ready && x.connected)) room.begin();
      return;
    }
    if (msg.t === 'answer') { room.onAnswer(p, msg, Date.now()); return; }
    if (msg.t === 'rematch') {
      if (room.phase !== 'result') return;
      p.rematch = msg.on !== false;
      const n = room.players.filter(x => x.rematch).length;
      room.status = n <= 0 ? '本局结束。双方都确认后，原房间再战一局' : (n >= room.players.length ? '再战开始' : '已确认再战，等待对方');
      room.sendRoom();
      if (room.players.length === 2 && room.players.every(x => x.rematch && x.connected)) room.begin();
      return;
    }
    if (msg.t === 'leave') {
      room.detach(p, true);
      conn.player = null;
      conn.room = null;
      return;
    }
  }

  function connect(ws) {
    const conn = { ws, player: null, room: null, replaced: false };
    ws.on('message', (buf) => {
      let msg = null;
      try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
      try { onMsg(conn, msg); } catch (e) {
        send(ws, { t: 'error', code: 'server', message: '服务器处理失败' });
      }
    });
    ws.on('close', () => {
      if (conn.replaced) return;
      if (conn.player && conn.room && conn.room.players.includes(conn.player) && conn.player.ws === ws) {
        conn.room.detach(conn.player, false);
      }
    });
    send(ws, { t: 'status', status: 'open', reconnect: true, reconnectMs });
  }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      try { room.tick(now); } catch (e) {}
    }
  }, opts.tickMs || 40);
  if (timer.unref) timer.unref();

  return {
    connect,
    rooms,
    close() { clearInterval(timer); },
  };
}

module.exports = { createRooms };
