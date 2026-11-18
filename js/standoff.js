// v1.2.1 出题时的「对峙 / 虚晃」：纯表现层，零伤害、零玩法影响。
// 只写 fighter.vis（画面上的位移 + 覆盖动作）和 WF.FX 粒子，不碰 x / anim / hp / 计时 / 种子随机数，
// 所以双人和电脑陪练的血量轨迹与 v1.2 逐帧一致。真出招（pendingAttack）一出现，覆盖动作立刻撤掉、位移 2~3 帧内收回。
WF.Standoff = {
  beat: null, wait: 0, _seed: 0,
  rnd() { // 独立随机数：不消耗对战用的 g.rnd
    if (!this._seed) return Math.random();
    let t = (this._seed = (this._seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  seed(n) { this._seed = n | 0; },
  enabledFor(g) { const S = WF.CFG.STANDOFF; return !!(S && S.on && (g.camp ? S.campaign : g.menu.cpu ? S.cpu : S.versus)); },
  vis(f) { return f.vis || (f.vis = { dx: 0, tx: 0, anim: null, a: null, fi: 0, ft: 0, to: 0, hold: 0, speed: 1, onHit: null, wf: 0, wt: 0 }); },
  idleReal(f) { return f.anim === 'idle' && !f.tween && !f.paused && f.hp > 0 && f.alpha >= 1 && !(f.sil > 0); },
  active(g) {
    const S = WF.CFG.STANDOFF, q = g.q;
    return this.enabledFor(g) && g.state === 'question' && q && !q.revealed && !q.first && !g.pendingAttack && !g.ko && !g.paused
      && !g.cine && q.t >= S.START_T && g.p.length === 2 && g.p.every(f => this.idleReal(f));
  },
  reset(g) { this.beat = null; this.wait = 0; for (const f of (g ? g.p : [])) if (f) f.vis = null; },
  tick(g) {
    const S = WF.CFG.STANDOFF;
    if (!g.p || g.p.length !== 2) return;
    const on = this.active(g);
    for (const f of g.p) {
      const v = this.vis(f);
      if (!on) { // 撤：覆盖动作立刻停，位移快速收回原站位
        v.anim = null; v.onHit = null; v.walking = false; v.tx = 0; v.dx *= S.RETURN_K; if (Math.abs(v.dx) < 0.25) v.dx = 0;
        continue;
      }
    }
    if (!on) { this.beat = null; this.wait = Math.min(this.wait, 4); return; }
    const [a, b] = g.p;
    if (!this.beat || this.beat.t >= this.beat.len) this.newBeat(g);
    const B = this.beat; B.t++;
    for (const ev of B.evs) if (ev.t === B.t) ev.fn();
    for (const f of g.p) this.stepVis(g, f);
    // 站位保护：不能贴得比正常间距近太多 / 拉得太开，也不出擂台边
    const C = WF.CFG, va = this.vis(a), vb = this.vis(b);
    const gap = (b.x + vb.dx) - (a.x + va.dx), min = g.gap() - S.MAX_CLOSE, max = g.gap() + S.MAX_OPEN;
    if (gap < min) { const k = (min - gap) / 2; va.dx -= k; vb.dx += k; }
    if (gap > max) { const k = (gap - max) / 2; va.dx += k; vb.dx -= k; }
    for (const f of g.p) {
      const v = this.vis(f);
      v.dx = Math.max(-S.MAX_DX, Math.min(S.MAX_DX, v.dx));
      // 擂台：画面位移不出台边。街上槽位不在 0–320 里，不能再用 STAGE_W 去夹，否则两人会被拽到 x=308、画出镜头。
      if (!(g.onStreet && g.onStreet())) {
        v.dx = Math.max(C.WALL_MARGIN - 2 - f.x, Math.min(C.STAGE_W - C.WALL_MARGIN + 2 - f.x, v.dx));
      }
    }
  },
  stepVis(g, f) {
    const S = WF.CFG.STANDOFF, v = this.vis(f);
    const d = v.tx - v.dx, moving = Math.abs(d) > 0.4;
    if (moving) v.dx += Math.sign(d) * Math.min(Math.abs(d), S.STEP_SPEED);
    if (v.anim) {
      if (v.hold > 0 && v.fi >= v.to) { v.hold--; if (v.hold <= 0) v.anim = null; }
      else if (++v.ft >= Math.max(1, Math.round(v.a.frames[v.fi].t / v.speed))) {
        v.ft = 0;
        if (v.fi < v.to) { v.fi++; if (v.fi === v.hitI && v.onHit) { const h = v.onHit; v.onHit = null; h(); } }
        else if (!(v.hold > 0)) v.anim = null;
      }
    }
    // 走动：有位移目标且没在出覆盖动作时画 walk；后退时倒着播
    v.walking = moving && !v.anim && f.has('walk');
    if (v.walking) {
      const w = f.data.anims.walk, back = Math.sign(d) !== f.dir;
      if (++v.wt >= Math.max(1, Math.round(w.frames[v.wf % w.frames.length].t / 1.4))) { v.wt = 0; v.wf = (v.wf + (back ? w.frames.length - 1 : 1)) % w.frames.length; }
    }
  },
  act(f, name, o = {}) {
    const a = f.data.anims[name]; if (!a) return false;
    const v = this.vis(f), hitI = a.frames.findIndex(fr => (fr.ev || []).includes('hit'));
    Object.assign(v, { anim: name, a, fi: o.from || 0, ft: 0, speed: o.speed || 1, hitI: hitI < 0 ? -1 : hitI,
      to: Math.min(a.frames.length - 1, o.to !== undefined ? o.to : (hitI >= 0 ? hitI + (o.after || 1) : a.frames.length - 1)),
      hold: o.hold || 0, onHit: o.onHit || null });
    return true;
  },
  // 覆盖动作的出拳点（含画面位移）
  fist(f) {
    const v = this.vis(f), fr = v.anim ? v.a.frames[v.fi] : f.frame(), hp = f.hitPoint(fr);
    return { x: hp.x + v.dx, y: hp.y };
  },
  newBeat(g) {
    const S = WF.CFG.STANDOFF, C = WF.CFG, R = () => this.rnd(), [a, b] = g.p, q = g.q;
    const len = Math.round((S.BEAT_S[0] + (S.BEAT_S[1] - S.BEAT_S[0]) * R()) * C.FPS);
    // 越到后面敌人越躁：答题时间过得越多，敌方（右边）越常主动试探
    const heat = Math.min(1, q.t / (S.HEAT_S * C.FPS)), enemySide = (g.camp || g.menu.cpu) ? 1 : -1;
    const pickAgg = () => enemySide < 0 ? (R() < 0.5 ? 0 : 1) : (R() < 0.45 + S.HEAT_AGGR * heat ? 1 : 0);
    const W = S.WEIGHTS, aggrBoost = enemySide > 0 ? heat * S.HEAT_AGGR : 0;
    const table = [['shuffle', W.shuffle * (1 - 0.5 * heat)], ['press', W.press], ['probe', W.probe * (1 + aggrBoost * 2)],
      ['whiff', W.whiff * (1 + aggrBoost)], ['trade', W.trade * (1 + aggrBoost)], ['guard', W.guard]];
    let kind = this.last === 'trade' ? 'shuffle' : null;
    if (!kind) { let tot = 0; for (const [, w] of table) tot += w; let r = R() * tot; for (const [k, w] of table) { if ((r -= w) <= 0) { kind = k; break; } } kind = kind || 'shuffle'; }
    if (kind === this.last && kind !== 'shuffle' && R() < 0.6) kind = 'shuffle';
    this.last = kind;
    const B = this.beat = { kind, t: 0, len, evs: [] }, at = (t, fn) => B.evs.push({ t: Math.max(1, Math.min(len, Math.round(t))), fn });
    const A = g.p[pickAgg()], D = g.other(A), vA = this.vis(A), vD = this.vis(D);
    const fwd = (f, px) => { this.vis(f).tx = f.dir * px; };
    const end = (t) => at(t, () => { vA.tx = 0; vD.tx = 0; });
    if (kind === 'shuffle') { // 两边小碎步，原地晃
      fwd(a, (R() < 0.5 ? -1 : 1) * (1 + R() * 2)); fwd(b, (R() < 0.5 ? -1 : 1) * (1 + R() * 2)); end(len * 0.6);
    } else if (kind === 'press') { // 一边上步逼近，另一边退半步
      fwd(A, 3 + R() * 2); at(4 + R() * 4, () => fwd(D, -(2 + R() * 2))); end(len * 0.7);
    } else if (kind === 'probe') { // 刺拳试探，对面架住（蓝色格挡火花）
      fwd(A, 2);
      at(3, () => this.act(A, 'combo_a', { speed: 1.25, after: 1, onHit: () => {
        const p = this.fist(A); WF.FX.spark(p.x, p.y, A.dir, 'block', 0.45);
        this.act(D, 'block', { hold: 8 }); vD.tx = -D.dir * 2;
      } }));
      at(6, () => { if (!this.vis(D).anim) this.act(D, 'block', { hold: 10 }); });
      end(len * 0.75);
    } else if (kind === 'whiff') { // 空挥一拳，对面后撤躲开
      at(2, () => this.act(A, R() < 0.5 && A.has('heavy_punch') && R() < 0.3 ? 'heavy_punch' : 'combo_a', { speed: 1.3, after: 1, onHit: () => {
        const p = this.fist(A); WF.FX.spark(p.x, p.y, A.dir, 'miss', 0.3);
      } }));
      at(4, () => fwd(D, -4)); end(len * 0.7);
    } else if (kind === 'trade') { // 双方同时出拳，拳头对拳头：小对冲火花，各退一步
      const go = () => {
        const fa = this.act(a, 'combo_a', { speed: 1.2, after: 1 }), fb = this.act(b, 'combo_a', { speed: 1.2, after: 1, onHit: () => {
          const pa = this.fist(a), pb = this.fist(b); WF.FX.spark((pa.x + pb.x) / 2, Math.min(pa.y, pb.y), 1, 'clash', 0.55);
          WF.FX.ring((pa.x + pb.x) / 2, Math.min(pa.y, pb.y), '#ffe8a0', 7, 8);
          this.vis(a).tx = -a.dir * 3; this.vis(b).tx = -b.dir * 3;
          WF.FX.dust(a.x + this.vis(a).dx, C.GROUND_Y, -a.dir, 2); WF.FX.dust(b.x + this.vis(b).dx, C.GROUND_Y, -b.dir, 2);
        } });
        return fa && fb;
      };
      fwd(a, 1.5); fwd(b, 1.5); at(3, go); end(len * 0.8);
    } else { // guard：一边架拳不动，另一边小幅前后晃
      this.act(D, 'block', { hold: Math.round(len * 0.6) }); fwd(A, 2); at(len * 0.35, () => fwd(A, -1)); end(len * 0.7);
    }
  },
};
