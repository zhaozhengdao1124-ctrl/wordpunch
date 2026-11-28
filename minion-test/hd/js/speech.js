// 单词书 / 错题本朗读。只在书里用，对战中不朗读。
// 优先用本机 / Edge 在线 Natural 英语语音；没有声音或 1 秒内没开始时，改走有道在线发音（需联网）。
(function () {
  const W = window.WF = window.WF || {};
  const YOUDAO = 'https://dict.youdao.com/dictvoice';
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let voice = null;
  let audio = null;
  let armed = null;
  let timer = null;
  let speakToken = 0;

  function listVoices() {
    if (!supported) return [];
    try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }
  function scoreVoice(v) {
    if (!v) return 0;
    const lang = String(v.lang || '').replace(/_/g, '-');
    const name = String(v.name || '');
    let s = 0;
    if (/^en-US/i.test(lang)) s += 30;
    else if (/^en/i.test(lang)) s += 15;
    else if (/english/i.test(name)) s += 8;
    else return 0;
    if (/natural/i.test(name)) s += 25;
    if (/online/i.test(name)) s += 20;
    if (/aria|jenny|guy/i.test(name)) s += 6;
    if (/microsoft/i.test(name)) s += 2;
    return s;
  }
  function pick(vs) {
    vs = vs || listVoices();
    let best = null, bestS = 0;
    for (let i = 0; i < vs.length; i++) {
      const s = scoreVoice(vs[i]);
      if (s > bestS) { bestS = s; best = vs[i]; }
    }
    return best || null;
  }
  function refresh() {
    voice = pick(listVoices());
    return voice;
  }
  if (supported) {
    refresh();
    const ev = function () { refresh(); };
    try { window.speechSynthesis.addEventListener('voiceschanged', ev); } catch (e) {}
    try { window.speechSynthesis.onvoiceschanged = ev; } catch (e) {}
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
  }
  // 朗读 / 展示前清理：弯引号、断开的撇号、中文译文、HTML
  function cleanText(text) {
    let s = decodeEntities(text == null ? '' : text);
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/¦/g, '\n');
    if (s.indexOf('::') >= 0) {
      s = s.split(/\n/).map(function (part) {
        const i = part.indexOf('::');
        return i >= 0 ? part.slice(0, i) : part;
      }).join(' ');
    }
    s = s.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+/g, ' ');
    s = s.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'");
    s = s.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
    // hairdresser' s / I' ve → hairdresser's / I've
    s = s.replace(/([A-Za-z])'\s+(s|ll|re|ve|d|m|t)\b/gi, "$1'$2");
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  function youdaoUrl(text) {
    return YOUDAO + '?audio=' + encodeURIComponent(cleanText(text) || String(text || '')) + '&type=2';
  }
  function stopAudio() {
    if (audio) {
      // v1.7.2：预载缓存里的元素只暂停回到开头，不清 src（清了下次就得重新下载，缓存也变成死元素）
      if (audio._wfCached) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }
      else { try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {} }
      audio = null;
    }
    if (armed && armed !== audio) {
      try { armed.pause(); } catch (e) {}
    }
    armed = null;
  }
  function stopAll() {
    if (timer) { clearTimeout(timer); timer = null; }
    speakToken++;
    stopAudio();
    if (supported) try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  function playYoudao(text) {
    stopAudio();
    const a = new Audio(youdaoUrl(text));
    a.preload = 'auto';
    audio = a;
    const p = a.play();
    if (p && p.catch) p.catch(function (e) { console.warn('[WF] dictvoice', e); });
    return a;
  }
  // 在用户点击的同一拍预播再暂停，避免 1 秒后补播被浏览器拦截
  function armYoudao(text) {
    try {
      const a = new Audio(youdaoUrl(text));
      a.preload = 'auto';
      const p = a.play();
      if (p && p.then) {
        p.then(function () { if (armed !== a) return; try { a.pause(); a.currentTime = 0; } catch (e) {} }).catch(function () {});
      }
      armed = a;
      return a;
    } catch (e) {
      armed = null;
      return null;
    }
  }

  // v1.7.2 提速：单词书 / 错题本翻到哪页，就把这页（和下一页）的有道发音先下好；点了直接播，不再等系统语音
  const cache = new Map(); let lastKey = '';
  const CACHE_MAX = 48;
  function prefetch(words) {
    const list = (words || []).map(function (w) { return cleanText(w); }).filter(Boolean);
    const key = list.join('|'); if (key === lastKey) return; lastKey = key;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { lastKey = ''; return; }   // 明确断网：不预载，点的时候走系统语音
    list.forEach(function (w) {
      if (cache.has(w)) {
        const a = cache.get(w); cache.delete(w);
        if (!a.error) { cache.set(w, a); return; }   // 之前下载失败（例如断网）：过 15 秒再换个新元素重下，免得断网时每次滚动都狂发请求
        if (!a._wfErrAt) a._wfErrAt = Date.now();
        if (Date.now() - a._wfErrAt < 15000) { cache.set(w, a); return; }
        release(a);
      }
      try { cache.set(w, newCached(w)); } catch (e) {}
    });
    while (cache.size > CACHE_MAX) { const k = cache.keys().next().value; const a = cache.get(k); cache.delete(k); release(a); }
  }
  function newCached(w) {   // 预载元素：下载完一次就记住（之后暂停 / 回到开头时 readyState 会短暂掉到 1，但数据已经在内存里）
    const a = new Audio(youdaoUrl(w)); a.preload = 'auto'; a._wfCached = true;
    a.addEventListener('canplaythrough', function () { a._wfOK = true; });
    a.addEventListener('error', function () { a._wfOK = false; a._wfErrAt = Date.now(); });
    a.load(); return a;
  }
  function release(a) {   // 挤出缓存的元素：没在播就释放网络 / 解码缓冲
    if (!a || a === audio) { if (a) a._wfCached = false; return; }
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {}
  }
  function readyCached(str) {
    const a = cache.get(str);
    return a && !a.error && (a._wfOK || a.readyState >= 3) ? a : null;   // HAVE_FUTURE_DATA：已经能马上出声
  }
  W.Speech = {
    supported,
    youdaoUrl,
    cleanText,
    scoreVoice,
    pick,
    hasVoice() { refresh(); return !!voice; },
    stop: stopAll,
    prefetch,
    warm(word) {   // 单个词预载（不影响列表的去重 key）
      const w = cleanText(word); if (!w) return;
      if (cache.has(w) && !cache.get(w).error) { const a = cache.get(w); cache.delete(w); cache.set(w, a); return; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (cache.has(w)) { const b = cache.get(w); if (Date.now() - (b._wfErrAt || (b._wfErrAt = Date.now())) < 15000) return; release(b); cache.delete(w); }
      try { cache.set(w, newCached(w)); } catch (e) {}
      while (cache.size > CACHE_MAX) { const k = cache.keys().next().value; const a = cache.get(k); cache.delete(k); release(a); }
    },
    _cacheSize() { return cache.size; },
    speak(text, opts) {
      const str = cleanText(text) || String(text || '').trim();
      if (!str) return false;
      const o = opts || {};
      stopAll();
      const tok = speakToken;
      const hot = readyCached(str);
      if (hot) {
        audio = hot;
        try { hot.currentTime = 0; } catch (e) {}
        const hp = hot.play();
        if (hp && hp.catch) hp.catch(function () { if (tok === speakToken) playYoudao(str); });
        return true;
      }
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;   // v1.7.2：明确断网就只用系统语音，不去请求有道
      if (!offline) armYoudao(str);

      const fallback = function () {
        if (tok !== speakToken) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (offline) return;
        if (supported) try { window.speechSynthesis.cancel(); } catch (e) {}
        if (armed) {
          const el = armed; armed = null; audio = el;
          try { el.currentTime = 0; } catch (e) {}
          const p = el.play();
          if (p && p.catch) p.catch(function () { if (tok === speakToken) playYoudao(str); });
        } else {
          playYoudao(str);
        }
      };

      if (!supported) { fallback(); return true; }

      const speakNow = function () {
        if (tok !== speakToken) return;
        refresh();
        try {
          const u = new SpeechSynthesisUtterance(str);
          u.lang = o.lang || 'en-US';
          u.rate = o.rate == null ? 0.9 : o.rate;
          // 有英语语音就用（优先 en-US Natural / Online）；没有也不放弃，让系统按 lang 读
          const v = voice || pick();
          if (v) u.voice = v;
          u.onstart = function () {
            if (tok !== speakToken) return;
            if (timer) { clearTimeout(timer); timer = null; }
            if (armed) { try { armed.pause(); } catch (e) {} armed = null; }
          };
          u.onerror = function () { fallback(); };
          window.speechSynthesis.speak(u);
        } catch (e) {
          console.warn('[WF] speech', e);
          fallback();
        }
      };

      // Chrome / Edge：cancel() 后立刻 speak 可能没声，稍等一拍
      try { window.speechSynthesis.cancel(); } catch (e) {}
      setTimeout(speakNow, 60);
      // 单词很快起声；例句和 Edge 在线 Natural 语音需要更久，1 秒会误切到有道并打断朗读
      const wait = /\s/.test(str) ? Math.min(4000, Math.max(1400, 900 + str.length * 25)) : 800;   // v1.7.2：单个单词 0.8 秒没出声就切有道
      timer = setTimeout(fallback, wait);
      return true;
    },
  };
})();
