// 音效：全部 WebAudio 现场合成（不需要音效文件）。BGM 用 <audio> 循环播放 audio/ 下的曲目（可在标题画面切换）。
// 每个音效都是 fn(ac, out, t, p)，所以同一套代码既能实时播放，也能离线渲染成录屏的音轨。
WF.Audio = (function () {
  let ac = null, master = null, sfxOn = true, musicOn = true, bgm = null;
  let trackId = 'vigour';
  try {
    sfxOn = localStorage.getItem('wf_sfx') !== '0';
    musicOn = localStorage.getItem('wf_music') !== '0';
    const tid = localStorage.getItem('wf_bgm'); if (tid) trackId = tid;
  } catch (e) {}
  const TRACKS = [
    { id: 'vigour', name: 'Vigour', file: 'audio/vigour.ogg', credit: 'wyver9', license: 'CC BY 4.0', url: 'https://opengameart.org/content/vigour-decisive-chiptune-theme-8bit' },
    { id: 'bossfight', name: '首领战', file: 'audio/boss_fight.ogg', credit: 'Juhani Junkala', license: 'CC0', url: 'https://opengameart.org/content/4-chiptunes-adventure' },
    { id: 'action3', name: '激斗', file: 'audio/action_level3.ogg', credit: 'Juhani Junkala', license: 'CC0', url: 'https://opengameart.org/content/5-chiptunes-action' },
  ];
  // v1.7 马西克 Boss 战占位曲：Grok Bot 用代码合成的原创芯片曲（audio_drafts/maxike_bgm_v1），144 BPM、A 小调、无缝循环
  const EXTRA = { maxike: { id: 'maxike', name: '马西克 · 发射倒计时', file: 'audio/maxike_bgm_v1.ogg', credit: '《我的拳》原创（Grok Bot 代码合成）', license: '项目自有' } };
  let override = null, wantMusic = false, retryArmed = false;
  // play() 被浏览器拒了（还没有用户手势）→ 下一次手势再试一次，成功就不再监听
  function armRetry() {
    if (retryArmed || typeof window === 'undefined' || !window.addEventListener) return; retryArmed = true;
    const go = () => {
      if (!wantMusic || !musicOn || !bgm) { done(); return; }
      const pr = bgm.play(); if (pr && pr.then) pr.then(done).catch(() => {}); else done();
    };
    const done = () => { retryArmed = false; ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(e => window.removeEventListener(e, go, true)); };
    ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(e => window.addEventListener(e, go, true));
  }
  function trackById(id) { return TRACKS.find(t => t.id === id) || TRACKS[0]; }
  if (!TRACKS.some(t => t.id === trackId)) trackId = 'vigour';
  const noiseCache = new WeakMap();
  let recording = null; // [{t, name, p}]

  function noise(c) {
    let b = noiseCache.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
      const d = b.getChannelData(0);
      let s = 1234567;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      noiseCache.set(c, b);
    }
    return b;
  }
  function env(c, g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function osc(c, out, t, type, f0, f1, dur, vol, a = 0.003) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(c, g, t, a, vol, dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05);
  }
  function nz(c, out, t, ftype, freq, q, dur, vol, a = 0.002, f1 = null) {
    const s = c.createBufferSource(); s.buffer = noise(c);
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    const g = c.createGain(); env(c, g, t, a, vol, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
  }
  function shaper(c, out, amt) {
    const w = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amt) / Math.tanh(amt); }
    w.curve = curve; w.connect(out); return w;
  }

  const SFX = {
    // 拳拳到肉：低频闷响 + 肉感中频 + 噪声爆裂
    hit(c, out, t, p) {
      const pw = p.power || 1, pt = p.pitch || 1, kick = !!p.kick, crit = !!p.crit;
      const bus = shaper(c, out, crit ? 3.2 : 2.2);
      osc(c, bus, t, 'sine', (kick ? 115 : 150) * pt, kick ? 36 : 46, kick ? 0.26 : 0.17, 0.9 * Math.min(1.3, pw));
      osc(c, bus, t, 'triangle', 340 * pt, 90, 0.06, 0.35 * pw);
      nz(c, bus, t, 'bandpass', 1900 * pt, 0.9, 0.07, 0.75 * pw);
      nz(c, bus, t, 'highpass', 4200, 0.7, 0.018, 0.5);
      if (kick) nz(c, bus, t + 0.005, 'lowpass', 420, 0.8, 0.16, 0.6 * pw);
      if (crit) {
        nz(c, bus, t + 0.01, 'bandpass', 3000, 1.4, 0.12, 0.8);
        osc(c, out, t + 0.012, 'square', 1500, 700, 0.16, 0.12);
        osc(c, bus, t + 0.03, 'sine', 90, 30, 0.3, 0.8);
      }
    },
    // 格挡：闷闷的“咔哒”，偏木头/护臂
    block(c, out, t, p) {
      osc(c, out, t, 'triangle', 520, 300, 0.05, 0.45);
      osc(c, out, t, 'square', 260, 200, 0.03, 0.12);
      nz(c, out, t, 'bandpass', 1300, 4, 0.045, 0.55);
      osc(c, out, t, 'sine', 110, 60, 0.07, 0.35);
    },
    whoosh(c, out, t, p) { nz(c, out, t, 'bandpass', 380, 1.2, 0.2, 0.55, 0.06, 1700); },
    clash(c, out, t, p) {
      const pw = p.power || 1;
      [523, 787, 1187, 1663, 2210].forEach((f, i) => osc(c, out, t, i % 2 ? 'square' : 'sine', f, f * 0.985, 0.55 - i * 0.07, 0.11 * pw));
      nz(c, out, t, 'highpass', 2500, 0.8, 0.09, 0.6 * pw);
      osc(c, out, t, 'sine', 120, 45, 0.22, 0.7 * pw);
    },
    lock(c, out, t, p) { osc(c, out, t, 'square', p.p2 ? 660 : 880, p.p2 ? 660 : 880, 0.05, 0.12); },
    correct(c, out, t) { osc(c, out, t, 'triangle', 880, 880, 0.08, 0.22); osc(c, out, t + 0.07, 'triangle', 1320, 1320, 0.12, 0.22); },
    wrong(c, out, t) { osc(c, out, t, 'sawtooth', 210, 120, 0.22, 0.16); nz(c, out, t, 'lowpass', 500, 1, 0.18, 0.15); },
    miss(c, out, t) { nz(c, out, t, 'bandpass', 600, 1.5, 0.16, 0.4, 0.03, 2400); osc(c, out, t + 0.05, 'triangle', 300, 180, 0.12, 0.08); },
    superflash(c, out, t) {
      osc(c, out, t, 'sawtooth', 160, 1400, 0.55, 0.12, 0.02);
      nz(c, out, t, 'bandpass', 300, 1, 0.6, 0.45, 0.25, 4000);
      osc(c, out, t + 0.62, 'sine', 140, 40, 0.4, 0.8);
      nz(c, out, t + 0.62, 'lowpass', 900, 0.7, 0.35, 0.6);
    },
    boom(c, out, t, p) {
      const bus = shaper(c, out, 2.5);
      osc(c, bus, t, 'sine', 95, 28, 0.75, 1.0);
      nz(c, bus, t, 'lowpass', 1200, 0.7, 0.9, 0.85, 0.004, 120);
      nz(c, bus, t, 'bandpass', 2500, 1, 0.1, 0.8);
      osc(c, bus, t + 0.02, 'square', 70, 30, 0.5, 0.2);
    },
    thud(c, out, t) { osc(c, out, t, 'sine', 90, 40, 0.18, 0.55); nz(c, out, t, 'lowpass', 350, 0.8, 0.15, 0.35); },
    // v1.3 地图：起飞（喷气声由低到高）/ 降落（由高到低 + 落地一下）
    takeoff(c, out, t) { nz(c, out, t, 'bandpass', 260, 0.9, 1.1, 0.32, 0.25, 1600); osc(c, out, t, 'sawtooth', 70, 140, 1.0, 0.05, 0.2); },
    land(c, out, t) { nz(c, out, t, 'bandpass', 1400, 0.9, 0.7, 0.26, 0.05, 260); nz(c, out, t + 0.62, 'lowpass', 500, 0.8, 0.08, 0.3); osc(c, out, t + 0.62, 'sine', 120, 60, 0.12, 0.25); },
    flash(c, out, t) { nz(c, out, t, 'highpass', 5000, 0.7, 0.03, 0.4); osc(c, out, t + 0.01, 'square', 2400, 1800, 0.05, 0.06); },
    lvup(c, out, t) { [660, 880, 1100, 1320].forEach((f, i) => osc(c, out, t + i * 0.06, 'square', f, f, 0.08, 0.09)); },
    // v1.5 清场评价：短促上行琶音
    rating(c, out, t, p) {
      const k = p && p.big ? 1.15 : 1;
      [523, 659, 784, 1046].forEach((f, i) => osc(c, out, t + i * 0.055, 'triangle', f, f, 0.14, 0.14 * k));
      osc(c, out, t, 'sine', 196, 392, 0.28, 0.1 * k);
    },
    step(c, out, t) { nz(c, out, t, 'lowpass', 600, 0.8, 0.03, 0.12); },
    beep(c, out, t, p) { const f = p.f || 660; osc(c, out, t, 'square', f, f, p.d || 0.12, 0.13); },
    reelSurge(c, out, t, { big }) {
      const level = big ? 1.14 : 1;
      // A cabinet thump and a rising motor cue, timed to the roll start at 420 ms.
      osc(c, out, t, 'sine', 148, 46, 0.30, 0.53 * level);
      osc(c, out, t + 0.006, 'triangle', 365, 172, 0.13, 0.24 * level);
      nz(c, out, t + 0.014, 'bandpass', 1800, 1.5, 0.12, 0.36 * level);
      nz(c, out, t + 0.08, 'bandpass', 260, 1.1, 0.31, 0.29, 0.045, 2200);
      for (const [offset, pitch] of [[0.12, 523], [0.21, 784], [0.30, 1046]]) {
        osc(c, out, t + offset, 'triangle', pitch, pitch * 1.05, 0.17, 0.105 * level);
      }
    },
    reelGear(c, out, t, { axis }) {
      const ring = [1260, 1050, 870][axis];
      nz(c, out, t, 'bandpass', ring * 1.7, 1.8, 0.023, 0.25, 0.001);
      osc(c, out, t, 'triangle', ring, ring * 0.76, 0.017, 0.11, 0.001);
      osc(c, out, t + 0.008, 'sine', ring * 0.54, ring * 0.49, 0.025, 0.07, 0.001);
    },
    reelLock(c, out, t, { axis }) {
      const pitch = [325, 280, 245][axis];
      nz(c, out, t, 'bandpass', pitch * 4.3, 1.1, 0.043, 0.40, 0.001);
      osc(c, out, t, 'triangle', pitch, pitch * 0.58, 0.079, 0.25, 0.001);
      osc(c, out, t, 'sine', pitch * 0.47, pitch * 0.32, 0.10, 0.16, 0.001);
      if (axis === 2) {
        osc(c, out, t + 0.060, 'sine', 1046, 1046, 0.41, 0.17);
        osc(c, out, t + 0.060, 'sine', 2235, 2235, 0.24, 0.065);
      }
    },
    fight(c, out, t) { osc(c, out, t, 'sawtooth', 220, 440, 0.25, 0.15); osc(c, out, t + 0.02, 'square', 330, 660, 0.3, 0.1); nz(c, out, t, 'highpass', 3000, 0.7, 0.2, 0.2); },
    menu(c, out, t) { osc(c, out, t, 'square', 520, 520, 0.035, 0.08); },
    confirm(c, out, t) { osc(c, out, t, 'triangle', 554, 740, 0.07, 0.19); },
    back(c, out, t) { osc(c, out, t, 'triangle', 440, 294, 0.07, 0.16); },
    // v1.2：进场名字定格的重鼓（大鼓：低频正弦下滑 + 鼓皮噪声 + 余震）
    drum(c, out, t, p) {
      const k = p.big ? 1.25 : 1;
      osc(c, out, t, 'sine', 120 * k, 38, 0.9, 1.0, 0.002);
      osc(c, out, t, 'triangle', 70, 32, 0.7, 0.45, 0.002);
      nz(c, out, t, 'lowpass', 900, 0.9, 0.35, 0.7, 0.002, 90);
      nz(c, out, t, 'bandpass', 1800, 1.2, 0.05, 0.35);
      if (p.big) { osc(c, out, t + 0.12, 'sine', 90, 34, 0.8, 0.6); nz(c, out, t + 0.12, 'lowpass', 600, 0.8, 0.4, 0.4, 0.002, 80); }
    },
    pickup(c, out, t, p) { const r = p.rare ? 1.25 : 1; osc(c, out, t, 'square', 660 * r, 660 * r, 0.06, 0.1); osc(c, out, t + 0.06, 'square', 990 * r, 990 * r, 0.09, 0.1); if (p.rare) osc(c, out, t + 0.14, 'square', 1320 * r, 1320 * r, 0.12, 0.09); },
    heal(c, out, t) { osc(c, out, t, 'triangle', 440, 880, 0.25, 0.12); osc(c, out, t + 0.05, 'sine', 660, 1320, 0.25, 0.08); },
    point(c, out, t, p) { osc(c, out, t, 'square', 700 + (p.n || 0) * 140, 900 + (p.n || 0) * 140, 0.09, 0.14); },
    // v1.10 马西克发射按钮：按下咔哒 / 普通发射（低沉推力）/ 完美（金色和弦 + 闪光声）/ 超级（再高八度 + 双重轰鸣）/ 失败（噗噗熄火 + 一声闷爆）/ 咳嗽
    launchClick(c, out, t) { osc(c, out, t, 'square', 1500, 1100, 0.03, 0.12); nz(c, out, t, 'highpass', 3000, 0.8, 0.02, 0.25); },
    launchGo(c, out, t) { osc(c, out, t, 'sawtooth', 90, 220, 0.5, 0.12, 0.02); nz(c, out, t, 'bandpass', 500, 0.8, 0.7, 0.45, 0.03, 1500); },
    launchPerfect(c, out, t) {
      [784, 988, 1175, 1568].forEach((f, i) => osc(c, out, t + i * 0.045, 'triangle', f, f, 0.22, 0.16));
      osc(c, out, t + 0.18, 'square', 2093, 2093, 0.16, 0.05); nz(c, out, t + 0.02, 'highpass', 6000, 0.7, 0.35, 0.22, 0.01);
      osc(c, out, t, 'sawtooth', 110, 300, 0.55, 0.12, 0.02); nz(c, out, t, 'bandpass', 600, 0.8, 0.8, 0.5, 0.02, 2200);
    },
    launchSuper(c, out, t) {
      SFX.launchPerfect(c, out, t);
      [1568, 1976, 2349, 3136].forEach((f, i) => osc(c, out, t + 0.22 + i * 0.04, 'triangle', f, f, 0.2, 0.1));
      osc(c, out, t + 0.05, 'sine', 70, 28, 0.9, 0.9); nz(c, out, t + 0.05, 'lowpass', 900, 0.7, 0.9, 0.6, 0.004, 100);
    },
    launchFizzle(c, out, t) {
      for (let i = 0; i < 4; i++) nz(c, out, t + i * 0.09, 'lowpass', 900 - i * 160, 1.2, 0.06, 0.32 - i * 0.05);
      osc(c, out, t, 'sawtooth', 260, 70, 0.4, 0.06);
      nz(c, out, t + 0.42, 'lowpass', 500, 0.7, 0.35, 0.55, 0.005, 120); osc(c, out, t + 0.42, 'sine', 90, 45, 0.25, 0.45);
    },
    cough(c, out, t) { nz(c, out, t, 'bandpass', 750, 2.2, 0.09, 0.32); nz(c, out, t + 0.12, 'bandpass', 620, 2.2, 0.07, 0.22); },
  };

  // v1.10.1 输出链：其他音效照旧走 master(0.8) → 压缩器(-14dB, 4:1)；击打音效（hit：拳脚 / 暴击 / 必杀收尾 / 火箭擦过）单独一条：
  // ×HIT_GAIN → 软削波（-6dBFS 以下线性，最高 -1dBFS）→ 跟主路一起进最后一道软削波保护 → 输出。
  // 不走主压缩器（走主压缩器的话 4:1 会把加的音量又压回去）；软削波保证不爆音（Chrome 的压缩器节点会把小声音也拉低，所以保护级不用压缩器）。数值按 wftest/v1101/sfx_levels.js 实测定的。
  const HIT_GAIN = 0.85;   // 实测：普通击打比 v1.10 响 ≈ +5 dB（因为不再经过主压缩器，所以这里的数字看着小）
  const HIT_CRIT = 1.4;  // 暴击 / 必杀收尾再 ×1.4，保证暴击依然明显比普通击打响
  const HIT_NAMES = { hit: 1 };
  // 软削波：knee 以下完全线性（小声音一点不动），knee 以上用 tanh 圆滑地压到 ceil，永远到不了 0dBFS
  function softClip(c, knee, ceil) {
    const w = c.createWaveShaper(), n = 4097, curve = new Float32Array(n), r = ceil - knee;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
      const y = ax <= knee ? ax : knee + r * Math.tanh((ax - knee) / r);
      curve[i] = x < 0 ? -y : y;
    }
    w.curve = curve; w.oversample = 'none'; return w;   // WaveShaper 的输入范围固定是 -1..1（超出按两端算）；不开过采样，免得降采样滤波过冲
  }
  function busFor(ch, name, p) { return HIT_NAMES[name] ? (p && p.crit ? ch.crit : ch.hit) : ch.main; }
  function buildChain(c) {
    const safe = softClip(c, 0.8, 0.97);   // 最后一道（两路叠加时防冲顶）；平时信号都在 0.8 以下，完全不动作
    safe.connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    const m = c.createGain(); m.gain.value = 0.8; m.connect(comp); comp.connect(safe);
    const hg = c.createGain(); hg.gain.value = 0.8 * HIT_GAIN;
    const sc = softClip(c, 0.5, 0.89);    // 击打专用：-6dBFS 以下线性，以上圆滑压住，最高 -1dBFS
    hg.connect(sc); sc.connect(safe);
    const hc = c.createGain(); hc.gain.value = HIT_CRIT; hc.connect(hg);
    return { main: m, hit: hg, crit: hc };
  }
  let bus = null, resuming = null;
  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    bus = buildChain(ac); master = bus.main;
    return ac;
  }

  const A = {
    SFX, HIT_GAIN, HIT_CRIT, BGM_VOL: 0.32,
    buildChain(c, name, p) { return busFor(buildChain(c), name, p); },
    chain(c) { return buildChain(c); }, busFor,   // 测音量用（wftest/v1101/sfx_levels.js）
    get sfxOn() { return sfxOn; }, set sfxOn(v) { sfxOn = !!v; try { localStorage.setItem('wf_sfx', v ? '1' : '0'); } catch (e) {} },
    get musicOn() { return musicOn; },
    set musicOn(v) { musicOn = !!v; try { localStorage.setItem('wf_music', v ? '1' : '0'); } catch (e) {} if (!v) A.stopMusic(); },
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended' && !resuming) {
        resuming = c.resume().catch(() => {}).finally(() => { resuming = null; });
      }
    },
    play(name, p = {}) {
      if (recording) { recording.push({ t: WF.frameNo / WF.CFG.FPS, name, p }); return; }
      if (!sfxOn) return;
      const c = ensure(); if (!c) return;
      if (c.state !== 'running') {
        // 第一次按键可能和 AudioContext 启动在同一刻。只补播当次操作的短音。
        if (resuming && ['menu', 'confirm', 'back'].includes(name)) {
          resuming.then(() => { if (c.state === 'running' && sfxOn) A.play(name, p); });
        }
        return;
      }
      try { SFX[name](c, busFor(bus, name, p), c.currentTime + 0.005, p); } catch (e) { console.warn('sfx', name, e); }
    },
    TRACKS,
    get trackId() { return trackId; },
    get track() { return trackById(trackId); },
    setTrack(id, preview) {
      const tr = trackById(id);
      if (trackId === tr.id && bgm && !preview) return tr;
      trackId = tr.id;
      try { localStorage.setItem('wf_bgm', trackId); } catch (e) {}
      const playing = !!(bgm && !bgm.paused);
      if (bgm) { bgm.pause(); bgm.setAttribute('data-id', ''); }   // 同一个元素，下次 startMusic 会换成新曲
      if (preview && musicOn) A.startMusic();
      else if (playing && musicOn) A.startMusic();
      return tr;
    },
    cycleTrack(dir, preview) {
      const i = Math.max(0, TRACKS.findIndex(t => t.id === trackId));
      return A.setTrack(TRACKS[(i + (dir || 1) + TRACKS.length) % TRACKS.length].id, preview);
    },
    // v1.7 关卡专属曲（马西克）：不进设置里的曲目列表，只在那场 Boss 战覆盖当前选曲
    setOverride(id) { const tr = id ? (EXTRA[id] || null) : null; override = tr; },
    get override() { return override; },
    get playingId() { return bgm && !bgm.paused ? bgm.getAttribute('data-id') : (bgm ? bgm.getAttribute('data-id') + '(paused)' : null); },
    // v1.10.2：整局只用【一个】<audio> 元素，换曲 = 换 src。原来换曲（进马西克 Boss 战）会 new 一个新的 Audio，
    //   而 iOS / Safari 只允许「用户点过的那个元素」继续播放；新元素在游戏循环里 play() 会被静默拒绝 → 马西克一出场就没有音乐。
    //   play() 被拒时记下来，玩家下一次点屏幕 / 按键就补播（music 想放但没放上 = wantMusic）。
    startMusic(o = {}) {
      if (!musicOn || recording) return;
      wantMusic = true;
      const tr = override || trackById(trackId);
      if (o.keep && bgm && !bgm.paused && bgm.getAttribute('data-id') === tr.id) return; // 已在放就接着放（地图飞行 → 进城）
      if (!bgm) { bgm = new Audio(); bgm.loop = true; bgm.volume = 0.32; bgm.preload = 'auto'; }
      if (bgm.getAttribute('data-id') !== tr.id) { bgm.pause(); bgm.setAttribute('data-id', tr.id); bgm.src = tr.file; }
      try { bgm.currentTime = 0; } catch (e) {}
      const pr = bgm.play(); if (pr && pr.catch) pr.catch(() => { armRetry(); });
    },
    stopMusic() { wantMusic = false; if (bgm) bgm.pause(); },
    // —— 录屏用：把一段时间内的音效记录下来，再离线渲染成 WAV ——
    startRecording() { recording = []; },
    stopRecording() { const r = recording; recording = null; return r || []; },
    async renderOffline(events, seconds, rate = 44100) {
      const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const ch = buildChain(c);
      for (const e of events) { try { SFX[e.name](c, busFor(ch, e.name, e.p), e.t + 0.01, e.p || {}); } catch (err) {} }
      const buf = await c.startRendering();
      return wav(buf);
    },
  };
  function wav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
    out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const chans = []; for (let i = 0; i < ch; i++) chans.push(buf.getChannelData(i));
    let o = 44;
    for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { const v = Math.max(-1, Math.min(1, chans[k][i])); out.setInt16(o, v * 32767, true); o += 2; }
    const bytes = new Uint8Array(out.buffer); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  return A;
})();
