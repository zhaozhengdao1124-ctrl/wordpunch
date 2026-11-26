// v2.1 少点几下：挑战模式的命运转盘自己转；停下后 2 秒倒计时自动进下一站，按任意键 / 点一下立刻出发。
// （选角页单击卡片 / 一次 Enter 就开打，原来已经是这样，不用改）
(function () {
  const W = window.WF = window.WF || {};
  const C = W.CFG, G = W.Game && W.Game.prototype, KC = C.CAMPAIGN;
  if (!G || !KC || !KC.WHEEL) return;
  const FL = C.FLOW = { WHEEL_AUTO: 24, WHEEL_COUNT: 60, SKIP_GUARD: 8 };   // 帧（30 帧 = 1 秒）
  KC.WHEEL.HOLD = FL.WHEEL_COUNT;
  KC.WHEEL.IDLE_AUTO = FL.WHEEL_AUTO;

  const baseTick = G.wheelTick;
  G.wheelTick = function () {
    const w = this.wheel;
    if (w && w.phase === 'idle' && w.t + 1 >= FL.WHEEL_AUTO) { w.t++; this.wheelSpin(); return; }
    return baseTick.apply(this, arguments);
  };
  const baseSpin = G.wheelSpin;
  G.wheelSpin = function () {
    const w = this.wheel;
    if (w && w.phase === 'done') { if (w.t > FL.SKIP_GUARD) this.wheelEnd(); return; }
    return baseSpin.apply(this, arguments);
  };
  const baseDraw = G.drawWheel;
  G.drawWheel = function () {
    baseDraw.apply(this, arguments);
    const w = this.wheel; if (!w) return;
    if (w.phase === 'done') {
      const left = Math.max(0, KC.WHEEL.HOLD - w.t), sec = Math.max(1, Math.ceil(left / C.FPS));
      const bw = 420, bx = (C.SCREEN_W - bw) / 2, by = 494;
      this.box(bx, by, bw, 34, 'rgba(12,8,26,0.9)', '#5d4f86', 2);
      const c = this.ctx; c.fillStyle = '#ffd23c'; c.fillRect(bx + 3, by + 29, Math.round((bw - 6) * left / KC.WHEEL.HOLD), 3);
      this.txt(`${sec} 秒后出发 · ${W.touch ? '点一下' : '任意键 / 点击'}立即出发`, C.SCREEN_W / 2, by + 16, 15, '#ffffff', 'center', { sw: 3, weight: 700 });
    } else if (w.phase === 'idle') {
      this.txt('马上开转…', C.SCREEN_W / 2, 505, 14, '#bfb3d6', 'center', { sw: 3, weight: 700 });
    }
  };
})();
