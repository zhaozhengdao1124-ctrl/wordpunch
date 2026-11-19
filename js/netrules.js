// 在线对战的公平规则。浏览器和自托管服务共用这一份。
// 数值对齐 js/config.js 里「非闯关」对战的基础值。服务端只认这里的结果，不读客户端传来的血量、成长、道具或难度。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    const W = root.WF = root.WF || {};
    W.NetRules = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const FAIR = {
    version: 1,
    hp: 800,
    comboDmg: [50, 60, 70, 80],
    slowDmg: 50,
    ultDmg: 250,
    clashDmg: 120,
    critChance: 0.15,
    critMult: 1.5,
    fastCrit: true,
    gutsRatio: 0.10,
    gutsMult: 0.8,
    comboStep: 0.05,
    comboCap: 0.50,
    fastS: 5,
    slowS: 10,
    timeoutS: 20,
    phraseFastExtra: 1,
    phraseSlowExtra: 1,
    phraseTimeoutExtra: 2,
    clashWindowS: 0.3,
    clashWin: 3,
    clashCapS: 15,
    clashQuestionS: 6,
    ultAt: 5,
    // 在线只用基础出招角色。米雷霸 / 马西克的电锯、火箭不进联机，避免特殊大招变成养成外的优势。
    roster: ['suling', 'mrj', 'chenbanshan', 'handawei', 'yukino'],
    modes: ['word', 'math', 'mix'],
    roundTimes: [0, 60, 90, 120, 180],
    text: '双方同一词库、同一题型、同一回合时间。血量 800，伤害、速答窗口、暴击和根性都用基础数值。不带闯关成长、道具、难度或错题本。在线必杀按基础必杀伤害一次结算。',
  };

  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function sanitizeChar(id) { return FAIR.roster.indexOf(id) >= 0 ? id : 'suling'; }
  function sanitizeMode(m) { return FAIR.modes.indexOf(m) >= 0 ? m : 'word'; }
  function sanitizeRound(t) {
    t = +t || 0;
    return FAIR.roundTimes.indexOf(t) >= 0 ? t : 0;
  }
  function sanitizeName(s) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 8);
    return s || '玩家';
  }
  function emptyStats() {
    return { answered: 0, correct: 0, wrong: 0, fast: 0, sumT: 0, maxStreak: 0, maxCombo: 0, ults: 0, crits: 0, dmg: 0, clashWins: 0, hits: 0 };
  }
  function freshState() {
    return { hp: [FAIR.hp, FAIR.hp], streak: [0, 0], ansCombo: [0, 0], stats: [emptyStats(), emptyStats()] };
  }
  function windows(kind) {
    const p = kind === 'phrase';
    return {
      fast: FAIR.fastS + (p ? FAIR.phraseFastExtra : 0),
      slow: FAIR.slowS + (p ? FAIR.phraseSlowExtra : 0),
      timeout: FAIR.timeoutS + (p ? FAIR.phraseTimeoutExtra : 0),
    };
  }
  function comboMult(n) {
    return 1 + Math.min(FAIR.comboCap, Math.max(0, (n || 0) - 1) * FAIR.comboStep);
  }
  // 和 game.js damage() 的非闯关分支一致：根性、单下打不死。
  function applyDamage(hp, amount) {
    const maxHp = FAIR.hp, thr = maxHp * FAIR.gutsRatio;
    let dmg = amount;
    if (hp <= thr) dmg *= FAIR.gutsMult;
    dmg = Math.round(dmg);
    let next = hp - dmg;
    if (hp > thr && next <= 0) next = 1;
    next = Math.max(0, next);
    return { hp: next, dealt: hp - next, ko: next <= 0 };
  }
  function noteWrong(state, slot) {
    const st = state.stats[slot];
    st.answered++; st.wrong++;
    state.streak[slot] = 0;
    state.ansCombo[slot] = 0;
  }
  function wipePace(state) {
    state.streak = [0, 0];
    state.ansCombo = [0, 0];
  }
  // 一次答对造成的伤害。sec 用服务端收到答案的时间。critRoll 只在慢答时用。
  function hit(state, slot, sec, kind, critRoll) {
    const s = slot, o = 1 - s, w = windows(kind);
    const st = state.stats[s];
    st.answered++; st.correct++;
    st.sumT += Math.round(sec * 30);
    state.ansCombo[s] = (state.ansCombo[s] || 0) + 1;
    st.maxCombo = Math.max(st.maxCombo || 0, state.ansCombo[s]);
    let band = 'block', crit = false;
    if (sec <= w.fast) {
      const n = state.streak[s] + 1;
      st.fast++;
      st.maxStreak = Math.max(st.maxStreak || 0, n);
      if (n >= FAIR.ultAt) {
        band = 'ult'; state.streak[s] = 0; st.ults++;
      } else {
        band = 'fast'; state.streak[s] = n; crit = !!FAIR.fastCrit; if (crit) st.crits++;
      }
    } else if (sec <= w.slow) {
      band = 'slow'; state.streak[s] = 0;
      crit = critRoll < FAIR.critChance; if (crit) st.crits++;
    } else {
      band = 'block'; state.streak[s] = 0;
    }
    state.streak[o] = 0;
    let raw = 0;
    if (band === 'ult') raw = Math.round(FAIR.ultDmg * comboMult(state.ansCombo[s]));
    else if (band === 'fast') {
      const n = Math.max(1, Math.min(4, state.streak[s] || 1));
      raw = Math.round(FAIR.comboDmg[n - 1] * (crit ? FAIR.critMult : 1) * comboMult(state.ansCombo[s]));
    } else if (band === 'slow') raw = Math.round(FAIR.slowDmg * (crit ? FAIR.critMult : 1) * comboMult(state.ansCombo[s]));
    let ko = false, dealt = 0;
    if (raw) {
      const r = applyDamage(state.hp[o], raw);
      state.hp[o] = r.hp; dealt = r.dealt; ko = r.ko; st.dmg += dealt; if (raw) st.hits++;
    }
    return { band, crit, dmg: dealt, raw, ko, attacker: s };
  }
  function clashHit(state, slot) {
    const o = 1 - slot;
    const r = applyDamage(state.hp[o], FAIR.clashDmg);
    state.hp[o] = r.hp;
    state.stats[slot].dmg += r.dealt;
    state.stats[slot].clashWins++;
    state.stats[slot].hits++;
    return { band: 'clash', crit: false, dmg: r.dealt, raw: FAIR.clashDmg, ko: r.ko, attacker: slot };
  }
  function publishQuestion(q, reveal) {
    const pub = {
      n: q.n,
      word: q.displayWord || q.word,
      rawWord: q.word,
      pos: q.pos || '',
      options: (q.options || []).slice(0, 4),
      kind: q.kind || 'word',
      bank: q.bank || '',
      fmt: q.fmt || '',
    };
    if (q.kind === 'phrase' && q.fmt === 'blank') pub.hint = q.meaning || q.phraseHint || '';
    if (q.ex && q.ex.en) pub.exEn = q.ex.en;
    if (reveal) {
      pub.correct = q.correct;
      pub.meaning = q.meaning || '';
      if (q.ex && q.ex.zh) pub.exZh = q.ex.zh;
    }
    return pub;
  }
  function isPublicHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local') || h.endsWith('.localhost')) return false;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) || /^169\.254\./.test(h)) return false;
    return true;
  }
  // 邀请链接必须同时是公网页面和公网对战服务。本机地址只给房间码，不伪装成能发给外网朋友的链接。
  function inviteInfo(pageHref, serverUrl, code) {
    const out = { public: false, url: '', reason: '' };
    if (!code) { out.reason = '还没有房间码。'; return out; }
    let page = null, srv = null;
    try { page = new URL(pageHref); } catch (e) { page = null; }
    try { srv = new URL(serverUrl); } catch (e) { srv = null; }
    const pageOk = !!(page && (page.protocol === 'http:' || page.protocol === 'https:') && isPublicHost(page.hostname));
    const srvOk = !!(srv && (srv.protocol === 'ws:' || srv.protocol === 'wss:') && isPublicHost(srv.hostname));
    if (!pageOk || !srvOk) {
      out.reason = '当前页面或对战服务是本机 / 局域网地址，不能当成公网邀请。把房间码告诉连着同一台对战服务的朋友；要给外网朋友发链接，需要页面和对战服务都放在公网地址上。';
      return out;
    }
    const u = new URL(page.href);
    u.searchParams.set('net', code);
    u.searchParams.set('srv', serverUrl);
    out.public = true;
    out.url = u.toString();
    return out;
  }
  function defaultServer(loc, saved) {
    if (saved) return String(saved);
    if (!loc) return '';
    const host = loc.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && (loc.protocol === 'http:' || loc.protocol === 'https:')) {
      return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host;
    }
    return '';
  }
  function snap(state, extra) {
    return Object.assign({
      hp: state.hp.slice(),
      streak: state.streak.slice(),
      ansCombo: state.ansCombo.slice(),
      stats: state.stats.map(s => Object.assign({}, s)),
    }, extra || {});
  }

  return {
    FAIR, mulberry32, sanitizeChar, sanitizeMode, sanitizeRound, sanitizeName,
    emptyStats, freshState, windows, comboMult, applyDamage, noteWrong, wipePace, hit, clashHit,
    publishQuestion, isPublicHost, inviteInfo, defaultServer, snap,
  };
});
