// 手机震动（安卓 Chrome 等支持 navigator.vibrate 的设备）。iPhone Safari / 桌面浏览器上全部是空操作，不会报错。
// v1.8.1：答对 / 出拳命中 = 轻震；暴击 / 必杀 / KO = 重震；答错 = 很短的轻震。设置里「手机震动」开关（默认开）。
// 节流：同级或更低级的震动 90ms 内只震一次，每秒最多 8 次，免得连击时一直嗡嗡响。
WF.Haptics = (function () {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const touch = typeof window !== 'undefined' && (('ontouchstart' in window) || (nav.maxTouchPoints || 0) > 0);
  const supported = typeof nav.vibrate === 'function' && touch;
  let enabled = true;
  try { enabled = localStorage.getItem('wf_haptics') !== '0'; } catch (e) {}
  const now = () => H.clock ? H.clock() : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let last = { t: -1e9, pri: 0, until: 0 }, recent = [];
  const H = {
    supported, log: [], sent: [], clock: null,   // clock：测试用（逐帧推进时按游戏时间节流）
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; try { localStorage.setItem('wf_haptics', v ? '1' : '0'); } catch (e) {} if (!enabled) H.stop(); },
    // pri：1 轻（答对 / 命中 / 答错）2 中（暴击 / 角力）3 重（必杀）4 KO
    pulse(name, pattern, pri) {
      pri = pri || 1;
      H.log.push(name);
      if (H.log.length > 200) H.log.shift();
      if (!enabled) return false;
      const t = now();
      if (t < last.until && pri <= last.pri) return false;          // 上一个更重 / 同级的还在震：不打断
      if (t - last.t < 90 && pri <= last.pri) return false;
      recent = recent.filter(x => t - x < 1000);
      if (recent.length >= 8 && pri < 3) return false;
      const dur = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
      last = { t, pri, until: t + dur };
      recent.push(t);
      H.sent.push(name); if (H.sent.length > 200) H.sent.shift();
      if (!supported) return false;
      try { return nav.vibrate(pattern); } catch (e) { return false; }
    },
    correct()  { return H.pulse('correct', 15, 1); },
    wrong()    { return H.pulse('wrong', 8, 1); },
    hit()      { return H.pulse('hit', 22, 1); },
    crit()     { return H.pulse('crit', 45, 2); },
    clash()    { return H.pulse('clash', [40, 30, 40], 2); },
    ultStart() { return H.pulse('ultStart', [60, 40, 90], 3); },
    ultHit()   { return H.pulse('ultHit', 28, 2); },
    ultFinal() { return H.pulse('ultFinal', [220, 60, 140, 40, 80], 3); },
    ko()       { return H.pulse('ko', [300, 80, 200], 4); },
    stop()     { last = { t: -1e9, pri: 0, until: 0 }; if (supported) try { nav.vibrate(0); } catch (e) {} },
  };
  return H;
})();
