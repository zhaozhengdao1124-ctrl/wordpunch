// 语音答题的提交状态机。一题只提交一次；没在听、上一题迟到、半成品、暂停中的答案都不算。
// 这里没有计时器，也不会因为等太久自己交卷。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    const W = root.WF = root.WF || {};
    W.VoiceMachine = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createVoiceMachine(parse) {
    const parseVoice = parse || function (text, conf) {
      const P = (typeof WF !== 'undefined' && WF.VoiceParse) || null;
      return P ? P.parseVoice(text, conf) : { type: 'ignore', reason: 'no_parser' };
    };
    const m = {
      status: 'off',
      qid: 0,
      submitted: null,
      highlight: null,
      note: '',
      listening: false,
    };
    function ignore(reason) {
      m.note = reason || '';
      return { action: 'ignore', reason: m.note };
    }
    m.handle = function (ev) {
      ev = ev || {};
      if (ev.type === 'unsupported') { m.status = 'unsupported'; m.listening = false; return { action: 'none', status: m.status }; }
      if (ev.type === 'denied') { m.status = 'denied'; m.listening = false; return { action: 'none', status: m.status }; }
      if (ev.type === 'listening') { m.status = 'listening'; m.listening = true; m.note = ''; return { action: 'none', status: m.status }; }
      if (ev.type === 'background') { m.status = 'background'; m.listening = false; return { action: 'none', status: m.status }; }
      if (ev.type === 'need_gesture') { m.status = 'need_gesture'; m.listening = false; return { action: 'none', status: m.status }; }
      if (ev.type === 'ended') {
        if (m.status === 'listening') { m.status = 'interrupted'; m.listening = false; }
        return { action: 'none', status: m.status };
      }
      if (ev.type === 'question') {
        m.qid = ev.qid;
        m.highlight = null;
        m.note = '';
        return { action: 'none', status: m.status };
      }
      if (ev.type === 'pause') {
        if (m.status !== 'listening') return ignore('not_listening');
        m.status = 'paused';
        return { action: 'pause', status: m.status };
      }
      if (ev.type === 'resume') {
        if (m.status !== 'paused') return ignore('not_paused');
        m.status = 'listening';
        m.listening = true;
        return { action: 'resume', status: m.status };
      }
      if (ev.type !== 'result') return ignore('unknown');
      if (ev.qid != null && ev.qid !== m.qid) return ignore('stale');
      if (m.status === 'paused') {
        const peeked = parseVoice(ev.transcript, ev.confidence);
        if (ev.isFinal === false) return ignore('interim');
        if (peeked.type === 'resume') {
          m.status = 'listening';
          m.listening = true;
          m.note = '';
          return { action: 'resume', status: m.status };
        }
        return ignore('paused');
      }
      if (!m.listening || m.status !== 'listening') return ignore('not_listening');
      if (m.submitted === m.qid) return ignore('duplicate');
      if (ev.isFinal === false) return ignore('interim');
      const parsed = parseVoice(ev.transcript, ev.confidence);
      if (!parsed || parsed.type === 'ignore') return ignore(parsed && parsed.reason || 'irrelevant');
      if (parsed.type === 'pause') {
        m.status = 'paused';
        return { action: 'pause', status: m.status };
      }
      if (parsed.type === 'resume') return ignore('not_paused');
      if (parsed.type === 'answer') {
        m.submitted = m.qid;
        m.highlight = parsed.idx;
        m.note = '';
        return { action: 'answer', idx: parsed.idx, qid: m.qid, status: m.status };
      }
      return ignore('irrelevant');
    };
    return m;
  }

  return { createVoiceMachine };
});
