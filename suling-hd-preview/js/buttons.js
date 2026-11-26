// 只缓存按钮底板。文字、玩家键位和作答状态仍由当前题目决定。
WF.Buttons = (() => {
  const faces = new Map();
  const accents = { focus: '#ffcf58', correct: '#8af0ac', wrong: '#ff9196' };

  function cutRect(c, x, y, w, h, cut, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + cut, y); c.lineTo(x + w - cut, y); c.lineTo(x + w, y + cut);
    c.lineTo(x + w, y + h - cut); c.lineTo(x + w - cut, y + h); c.lineTo(x + cut, y + h);
    c.lineTo(x, y + h - cut); c.lineTo(x, y + cut); c.closePath(); c.fill();
  }
  function gradient(c, x, y, w, h, stops) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    for (const [at, col] of stops) g.addColorStop(at, col);
    return g;
  }
  function rivet(c, x, y) {
    c.fillStyle = '#17191e'; c.fillRect(x, y, 5, 4);
    c.fillStyle = '#c3bbaa'; c.fillRect(x + 1, y, 3, 1);
    c.fillStyle = '#736e68'; c.fillRect(x + 1, y + 2, 3, 1);
  }

  function steel(c, w, h, y, accent) {
    cutRect(c, 1, 2, w - 2, h - 2, 5, '#131b23');
    cutRect(c, 2, y, w - 4, h - 6, 4, accent || '#adb7b9');
    const metal = gradient(c, 0, 0, w * 0.7, h, [[0,'#54606a'],[0.31,'#78858d'],[0.48,'#52616c'],[0.84,'#43515c'],[1,'#69767c']]);
    cutRect(c, 4, y + 2, w - 8, h - 10, 3, metal);
    for (let i = 0; i < 13; i++) {
      const x = 10 + (i * 61) % (w - 68);
      c.fillStyle = i % 3 ? 'rgba(235,245,247,.11)' : 'rgba(10,23,32,.16)';
      c.fillRect(x, y + 4 + (i * 7) % (h - 16), 16 + (i * 17) % 43, 1);
    }
    rivet(c, w - 16, y + 7); rivet(c, 11, y + h - 17);
  }
  function wood(c, w, h, y, accent) {
    cutRect(c, 1, 2, w - 2, h - 2, 4, '#29190f');
    cutRect(c, 2, y, w - 4, h - 6, 4, accent || '#bd8951');
    cutRect(c, 4, y + 2, w - 8, h - 10, 3, gradient(c, 0, 0, 0, h, [[0,'#a56b39'],[0.25,'#89522c'],[0.72,'#915a31'],[1,'#664121']]));
    c.save(); c.clip();
    for (let i = 0; i < 9; i++) {
      const row = y + 7 + i * (h - 15) / 9;
      c.strokeStyle = i % 2 ? 'rgba(51,24,10,.30)' : 'rgba(255,193,112,.22)';
      c.lineWidth = 1; c.beginPath(); c.moveTo(4, row);
      c.bezierCurveTo(w * .3, row - 6, w * .59, row + 7, w * .72, row - 1);
      c.quadraticCurveTo(w * .83, row - 5, w, row + 1); c.stroke();
    }
    c.strokeStyle = '#774724';
    for (const r of [5, 12]) { c.beginPath(); c.ellipse(w * .78, y + h * .68, r, r / 4, -.08, 0, 2 * Math.PI); c.stroke(); }
    c.restore(); rivet(c, 11, y + h - 17); rivet(c, w - 16, y + 7);
  }
  function arcade(c, w, h, y, accent) {
    cutRect(c, 0, 0, w, h, 9, '#171426');
    cutRect(c, 2, 2, w - 4, h - 4, 8, '#4a416a');
    cutRect(c, 4, y, w - 8, h - 6, 7, accent || '#9e95d6');
    cutRect(c, 7, y + 2, w - 14, h - 11, 5, gradient(c, 0, y, 0, h - 6, [[0,'#7469a2'],[.25,'#5b528b'],[.28,'#514777'],[.82,'#403658'],[1,'#52476c']]));
    c.fillStyle = '#beb5e5'; c.fillRect(14, y + 3, w - 28, 1);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(13, y + 5, 25, 1);
    c.fillStyle = '#282138'; c.fillRect(13, y + h - 10, w - 26, 2);
  }
  const materials = { steel, wood, arcade };

  function plate(g, rect, tone = 'idle', pressed = false, theme = g.state === 'shop' ? 'wood' : 'arcade') {
    const { x, y } = rect, w = Math.round(rect.w), h = Math.round(rect.h);
    const id = [theme, w, h, tone, pressed].join('/');
    if (!faces.has(id)) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'), top = pressed ? 4 : 1;
      materials[theme](c, w, h, top, accents[tone]);
      if (tone === 'correct' || tone === 'wrong') {
        c.fillStyle = tone === 'correct' ? 'rgba(10,90,45,.48)' : 'rgba(130,25,39,.49)';
        c.fillRect(8, top + 3, w - 16, h - 13);
      }
      if (tone === 'disabled') {
        c.fillStyle = 'rgba(25,20,25,.50)';
        c.fillRect(4, top + 2, w - 8, h - 10);
      }
      faces.set(id, cv);
    }
    g.ctx.drawImage(faces.get(id), Math.round(x), Math.round(y));
    return pressed ? 3 : 0;
  }

  function resultTone(i, picked, correct) {
    if (picked == null) return 'idle';
    if (i === correct) return 'correct';
    return i === picked ? 'wrong' : 'idle';
  }
  function answer(g, rect, label, opts = {}) {
    const { x, y, w, h, i } = rect, tone = opts.tone || 'idle';
    const dy = plate(g, rect, tone, opts.pressed, opts.theme);
    const keycap = (s, left, color) => {
      cutRect(g.ctx, left, y + 7 + dy, 24, 20, 3, '#222231');
      g.txt(s, left + 12, y + 17 + dy, 15, color, 'center', { stroke: false });
    };
    keycap(String(i + 1), x + 9, opts.keyColor || '#ffdc86');
    if (opts.otherKey) keycap(opts.otherKey, x + w - 33, opts.otherColor);
    const mark = tone === 'correct' ? '✓' : tone === 'wrong' ? '×' : '';
    if (mark) g.txt(mark, x + w - (opts.otherKey ? 47 : 19), y + 17 + dy, 16, accents[tone]);
    const size = opts.size || 21, mid = y + h / 2 + 4 + dy;
    const lines = opts.wrap ? g.wrapLines(label, w - 86, size, 2) : [label];
    lines.forEach((s, n) => g.txt(s, x + w / 2, mid + (n - (lines.length - 1) / 2) * (size + 2), size, '#fff', 'center',
      { sw: 3, weight: 700, font: opts.font, maxW: w - (opts.wrap ? 86 : 32) }));
  }
  return { plate, answer, resultTone };
})();
