// 手机震动（为后续移动版准备）。桌面浏览器 / 不支持的设备上全部是空操作。
WF.Haptics = (function () {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const touch = typeof window !== 'undefined' && (('ontouchstart' in window) || (nav.maxTouchPoints || 0) > 0);
  const supported = typeof nav.vibrate === 'function' && touch;
  let enabled = true;
  try { enabled = localStorage.getItem('wf_haptics') !== '0'; } catch (e) {}
  const H = {
    supported, log: [],
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; try { localStorage.setItem('wf_haptics', v ? '1' : '0'); } catch (e) {} },
    pulse(name, pattern) {
      H.log.push(name);
      if (H.log.length > 200) H.log.shift();
      if (!supported || !enabled) return false;
      try { return nav.vibrate(pattern); } catch (e) { return false; }
    },
    ultStart() { return H.pulse('ultStart', [60, 40, 90]); },
    ultHit()   { return H.pulse('ultHit', 28); },
    ultFinal() { return H.pulse('ultFinal', [220, 60, 140, 40, 80]); },
    crit()     { return H.pulse('crit', 18); },
    clash()    { return H.pulse('clash', [40, 30, 40]); },
    ko()       { return H.pulse('ko', [300, 80, 200]); },
    stop()     { if (supported) try { nav.vibrate(0); } catch (e) {} },
  };
  return H;
})();
