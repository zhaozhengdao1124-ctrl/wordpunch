// 角色：逐帧播放 json 里的 tick 时长；事件在“进入该帧”时触发（hit 帧 = 命中/顿帧时刻）
WF.Fighter = class {
  constructor(id, side) {
    this.id = id; this.side = side; this.data = window.WF_ASSETS[id]; this.mv = WF.CFG.MOVES[id];
    this.dir = side === 0 ? 1 : -1; this.x = 0; this.y = 0;
    this.maxHp = WF.CFG.HP; this.hp = WF.CFG.HP; this.trail = WF.CFG.HP; this.trailHold = 0;
    this.sil = 0; this.alpha = 1;
    this.flash = 0; this.flashVariant = 'white'; this.jitter = 0; this.tween = null; this.paused = false;
    this.ox = 0; this.home = null; // 街上对词：x 钉在槽位，ox 只是暂时的出拳/击退画面偏移
    this.play('idle');
  }
  has(name) { return !!this.data.anims[name]; }
  play(name, o = {}) {
    let a = this.data.anims[name];
    if (!a && WF.Fighter.ALIAS[name]) { const al = WF.Fighter.ALIAS[name]; if (this.data.anims[al]) { name = al; a = this.data.anims[al]; if (o.loop === undefined) o = Object.assign({}, o, { loop: false }); } else if (al === 'idle') { name = 'idle'; a = this.data.anims.idle; } }
    if (!a) { console.warn('[WF] 缺动作', this.id, name); name = 'idle'; a = this.data.anims.idle; }
    this.anim = name; this.a = a; this.o = o; this.pid = (this.pid || 0) + 1;
    this.fi = o.from || 0; this.ft = 0; this.done = false;
    this.loop = o.loop !== undefined ? o.loop : a.loop;
    this.to = o.to !== undefined ? Math.min(o.to, a.frames.length - 1) : a.frames.length - 1;
    this.enter();
    return this;
  }
  frame() { return this.a.frames[this.fi]; }
  enter() {
    const f = this.frame();
    if (f.fx && this.data.fx) for (const [n, ox, oy, ang, at] of f.fx) {
      const d = this.data.fx[n]; if (!d) continue;
      // v1.7.2：at='opp' = 砸在对手脚下（法老王光柱）；单帧常驻特效（王座）每帧补一次，只活这一帧
      const g = WF.game, opp = at === 'opp' && g && g.p ? g.p[1 - this.side] : null;
      const e = opp ? WF.FX.sprite(d, opp.worldX() + ox * this.dir, WF.CFG.GROUND_Y + oy, this.dir, ang || 0) : WF.FX.sprite(d, this.worldX() + ox * this.dir, WF.CFG.GROUND_Y - this.y + oy, this.dir, ang || 0);
      if (e && d.n === 1) e.life = Math.max(1, f.t || 2);
    }
    if (this.o.onEvent) { if (f.ev) for (const e of f.ev) this.o.onEvent(e, this.fi, f); this.o.onEvent('frame', this.fi, f); }
  }
  step() {
    if (this.paused) return;
    if (this.fly) {
      // v1.5 击飞：不受擂台边限制，带一点抛物线
      this.home = null; this.ox = 0;
      this.x += this.fly.vx;
      this.y = (this.y || 0) + this.fly.vy;
      this.fly.vy -= this.fly.g;
      if (this.y < 0) { this.y = 0; this.fly.vy *= -0.22; if (Math.abs(this.fly.vy) < 0.45) this.fly.vy = 0; }
    } else if (this.tween) {
      const tw = this.tween; tw.t++;
      const k = Math.min(1, tw.t / tw.d), e = tw.ease === 'in' ? k * k : tw.ease === 'lin' ? k : 1 - Math.pow(1 - k, 3);
      if (tw.kind === 'ox') {
        this.ox = tw.x0 + (tw.x1 - tw.x0) * e;
        if (tw.dust && tw.t % 2 === 0 && k < 0.8) WF.FX.dust(this.x + this.ox, WF.CFG.GROUND_Y, tw.x1 > tw.x0 ? 1 : -1, 1);
        if (k >= 1) {
          this.ox = tw.x1; this.tween = null;
          if (tw.ret && Math.abs(this.ox) > 0.3) {
            this.tween = { kind: 'ox', x0: this.ox, x1: 0, t: 0, d: Math.max(4, Math.round((tw.d || 6) * 0.7)), ease: 'out', dust: false, ret: false };
          } else if (tw.ret) this.ox = 0;
        }
      } else {
        this.x = tw.x0 + (tw.x1 - tw.x0) * e;
        if (tw.dust && tw.t % 2 === 0 && k < 0.8) WF.FX.dust(this.x, WF.CFG.GROUND_Y, tw.x1 > tw.x0 ? 1 : -1, 1);
        if (k >= 1) this.tween = null;
      }
    } else if (this.home != null && this.ox) {
      this.ox *= 0.6; if (Math.abs(this.ox) < 0.25) this.ox = 0;
    }
    if (this.home != null && !this.fly) this.x = this.home;
    if (this.done) return;
    this.ft++;
    const dur = Math.max(1, Math.round(this.frame().t / (this.o.speed || 1)));
    if (this.ft < dur) return;
    this.ft = 0;
    if (this.fi < this.to) { this.fi++; this.enter(); return; }
    if (this.loop) { this.fi = this.o.from || 0; this.enter(); return; }
    this.done = true;
    const cb = this.o.onEnd; const before = this.pid;
    if (cb) cb();
    if (this.done && !this.o.hold && this.pid === before) this.play(this.o.next || 'idle', this.o.nextOpts || {});
  }
  lockHome(x) { this.home = x; this.x = x; if (this.ox == null) this.ox = 0; }
  clearHome() { this.home = null; this.ox = 0; if (this.tween && this.tween.kind === 'ox') this.tween = null; }
  worldX() { return this.x + (this.ox || 0); }
  moveTo(x, d, ease = 'out', dust = false) {
    // 街上对词：槽位不动，出拳/击退只改画面偏移，结束后收回
    if (this.home != null && !this.fly) {
      const dest = Math.max(-40, Math.min(40, x - this.home));
      this.tween = { kind: 'ox', x0: this.ox || 0, x1: dest, t: 0, d: Math.max(1, d), ease, dust, ret: true };
      return;
    }
    const C = WF.CFG; x = Math.max(C.WALL_MARGIN, Math.min(C.STAGE_W - C.WALL_MARGIN, x));
    this.tween = { x0: this.x, x1: x, t: 0, d: Math.max(1, d), ease, dust };
  }
  // 不受擂台边限制的位移（小怪滑出画面 / 从画面外跑进来）
  slideTo(x, d, ease = 'out', dust = false) {
    if (this.home != null && !this.fly) { this.moveTo(x, d, ease, dust); return; }
    this.tween = { x0: this.x, x1: x, t: 0, d: Math.max(1, d), ease, dust };
  }
  get settled() { return !this.tween && (this.anim === 'idle' || (this.done && this.o.hold)); }
  // 命中点（拳头前沿）→ 世界坐标
  hitPoint(f) {
    f = f || this.frame();
    const ft = f.fo || this.data.foot || [24, 40];
    let hx = f.hit ? f.hit[2] - 2 : (f.bb ? f.bb[2] - 2 : ft[0] + 16); const hy = f.hit ? f.hit[1] : ft[1] - 13;
    if (f.hr != null) hx = ft[0] + f.hr;   // v1.7 喷火：火焰打到的距离（hit_reach，脚底起算）比枪口命中红更远
    const X = Math.round(this.worldX());
    return { x: this.dir > 0 ? X + (hx - ft[0]) + 0.5 : X - (hx - ft[0]) + 0.5, y: WF.CFG.GROUND_Y - ft[1] + hy };
  }
  draw(ctx, ox, t) {
    const G = WF.CFG.GROUND_Y; let X = Math.round(this.worldX() - ox);
    if (this.jitter > 0) X += (t % 2 ? 1 : -1);
    if (this.vis && this.vis.dx) X += Math.round(this.vis.dx);
    // 影子
    if (this.alpha <= 0) return;
    const al = this.alpha, wide = WF.isHeavy(this.data) ? 1.35 : 1;
    ctx.globalAlpha = 0.35 * al; ctx.fillStyle = '#1a0e08';
    ctx.fillRect(X - Math.round(8 * wide), G - 1, Math.round(17 * wide), 2); ctx.fillRect(X - Math.round(6 * wide), G + 1, Math.round(13 * wide), 1); ctx.globalAlpha = al;
    const seq = this.flashSeq || ['white'];
    const variant = this.flash > 0 ? seq[Math.max(0, Math.min(seq.length - 1, seq.length - this.flash))] : 'normal';
    let fr = this.frame();
    const v = this.vis; // v1.2.1 对峙：纯画面覆盖（位移 + 覆盖动作），不改真实状态
    if (v) {
      if (v.anim) fr = v.a.frames[v.fi];
      else if (v.walking && this.data.anims.walk) fr = this.data.anims.walk.frames[v.wf % this.data.anims.walk.frames.length];
    }
    if (this.sil < 1) WF.Sprites.draw(ctx, this.id, fr.c, X, G - Math.round(this.y), this.dir, variant, fr.fo);
    if (this.sil > 0) { ctx.globalAlpha = al * this.sil; WF.Sprites.draw(ctx, this.id, fr.c, X, G - Math.round(this.y), this.dir, 'black', fr.fo); }
    ctx.globalAlpha = 1;
  }
};
// v1.7 体型看 meta.body（米雷霸是 64 格但仍是标准男身）；旧素材没写 body 的按格子大小判断
WF.isHeavy = function (d) { if (!d) return false; if (d.body) return d.body === 'heavy'; return d.cell > 50; };
// 小怪只画了 10 个动作：缺的动作退到最接近的那个
WF.Fighter.ALIAS = {
  block_hit: 'block', block_recover: 'idle', back_launch_knockdown: 'knocked_down', forward_launch_knockdown: 'knocked_down',
  knocked_down_get_up: 'idle', dodge_roll: 'idle', stunned: 'idle', mega_charge_a: 'idle', run: 'walk',
};
