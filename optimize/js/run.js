// v1.6 闯关跑街：无缝平铺层 + 视差景物 + 动态特效。太阳/月亮所在的天空层不重复、不随镜头挪，避免并排出现两个。
(function () {
  function mod(n, m) { return ((n % m) + m) % m; }

  WF.Run = {
    cache: {},
    loading: {},
    specs() { return ((window.WF_CAMPAIGN_DATA || {}).runs) || {}; },
    spec(id) { return this.specs()[id] || null; },

    srcOf(sp, file, fallback) {
      if (fallback) return fallback;
      return (sp.base || ('assets/runs/' + (sp.id || '') + '/')) + file;
    },

    load(id, done) {
      if (this.cache[id]) { if (done) done(true); return; }
      const sp = this.spec(id);
      if (!sp) { if (done) done(false); return; }
      if (this.loading[id]) { this.loading[id].push(done); return; }
      this.loading[id] = done ? [done] : [];
      const layers = (sp.layers || []).map(L => {
        const im = new Image();
        im.src = L.src || this.srcOf(sp, L.file);
        return { id: L.id, p: L.parallax, c: im, w: L.width, h: L.height, repeat: L.repeat_x !== false && L.id !== 'sky' };
      });
      const props = (sp.props || []).map(P => {
        const im = new Image();
        im.src = P.src || this.srcOf(sp, P.file);
        return { def: P, c: im };
      });
      const dyn = {};
      (sp.dynamic_elements || []).forEach(D => {
        const im = new Image();
        im.src = D.src || this.srcOf(sp, D.file);
        dyn[D.id] = { def: D, c: im };
      });
      const all = layers.map(l => l.c).concat(props.map(p => p.c)).concat(Object.keys(dyn).map(k => dyn[k].c));
      let left = Math.max(1, all.length);
      const fin = () => {
        if (--left > 0) return;
        this.cache[id] = { layers, props, dyn, sp };
        const cbs = this.loading[id] || [];
        delete this.loading[id];
        cbs.forEach(cb => { if (cb) cb(true); });
      };
      if (!all.length) { left = 1; fin(); return; }
      all.forEach(im => { if (im.complete && im.naturalWidth) { fin(); } else { im.onload = im.onerror = fin; } });
    },

    preloadAll() { Object.keys(this.specs()).forEach(id => this.load(id)); },

    layout(sp, length) {
      const props = [], endClear = 170;
      (sp.props || []).forEach(def => {
        const pl = def.placement || {};
        if (pl.mode === 'at_level_end') props.push({ id: def.id, def, x: length + (pl.offset_px || 0) });
        else if (pl.mode === 'spaced_landmark') {
          const iv = pl.suggested_interval_px || 800;
          let x = pl.first_world_x || 200;
          while (x < length - (pl.end_clearance_px || endClear)) {
            props.push({ id: def.id, def, x });
            x += iv;
          }
        }
      });
      return props;
    },

    begin(id, length) {
      const sp = this.spec(id) || { layers: [], props: [], ground_y: 76, placeholder: true };
      this.load(id);
      length = sp.world_width || length;
      const laid = this.layout(sp, length);
      const endP = laid.find(p => p.id === 'end');
      return {
        id, on: true, phase: 'intro', length,
        endX: sp.entrance_x ?? (endP ? endP.x : length),
        fixedEntrance: sp.entrance_x != null,
        props: laid,
        pigeons: [], nextPigeon: 45,
        fade: 0, placeholder: !!sp.placeholder,
      };
    },

    setEnd(st, x) {
      st.endX = x;
      const end = st.props.find(p => p.id === 'end');
      if (end) end.x = x;
      else {
        const sp = this.spec(st.id) || {}, def = (sp.props || []).find(p => p.id === 'end');
        if (def) st.props.push({ id: 'end', def, x });
      }
      // 终点被动态挪近时，清掉会叠在入口上的牌楼/摊/树
      st.props = st.props.filter(p => p.id === 'end' || p.x < x - 185);
    },

    layerPar(pack, id) {
      const l = pack && pack.layers && pack.layers.find(x => x.id === id);
      return l ? l.p : 1;
    },

    tick(g, st) {
      const dyn = ((this.spec(st.id) || {}).dynamic_elements) || [];
      const pig = dyn.find(d => d.id === 'pigeon');
      if (!pig) return;
      const fps = WF.CFG.FPS;
      if (--st.nextPigeon <= 0) {
        const n = pig.count_per_flock || 2;
        const lo = (pig.spawn_y_range || [5, 11])[0], hi = (pig.spawn_y_range || [5, 11])[1];
        const y0 = lo + Math.random() * (hi - lo);
        const sx = (pig.spacing_px || [14, 3]);
        for (let i = 0; i < n; i++) st.pigeons.push({ x: WF.CFG.VIEW_W + 4 + i * sx[0], y: y0 + i * sx[1], t: 0 });
        st.nextPigeon = Math.round((pig.spawn_interval_s || 10) * fps);
      }
      const vx = (pig.screen_vx_px_s || -22) / fps;
      st.pigeons.forEach(p => { p.x += vx; p.t++; });
      st.pigeons = st.pigeons.filter(p => p.x > -16);
    },

    draw(ctx, cam, t, st) {
      const pack = this.cache[st && st.id], C = WF.CFG;
      if (!pack) { ctx.fillStyle = '#2a2438'; ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H); return; }
      const dyn = ((pack.sp && pack.sp.dynamic_elements) || []);
      for (const l of pack.layers) {
        this.drawLayer(ctx, cam, l);
        for (const d of dyn) {
          if ((d.layer || '') === l.id && d.space === 'repeat_with_layer') this.drawRepeatFx(ctx, cam, t, pack, d);
        }
        for (const p of (st.props || [])) {
          if ((p.def.layer || '') !== l.id) continue;
          this.drawProp(ctx, cam, p, l.p, pack);
        }
        for (const d of dyn) {
          if ((d.layer || '') === l.id && d.space === 'prop_local') this.drawPropFx(ctx, cam, t, st, pack, d);
        }
        if (l.id === 'far') this.drawPigeons(ctx, t, st, pack);
      }
    },

    drawLayer(ctx, cam, l) {
      const im = l.c; if (!im || !im.complete || !im.naturalWidth) return;
      const VW = WF.CFG.VIEW_W;
      if (!l.repeat) {
        const offset = l.id === 'sky' ? 0 : Math.floor((cam - VW / 2) * l.p);
        ctx.drawImage(im, -offset, 0, l.w, l.h);
        return;
      }
      const w = l.w || im.naturalWidth;
      const ox = -mod(Math.floor((cam - 96) * l.p), w);
      for (let x = ox; x < VW; x += w) ctx.drawImage(im, x, 0);
    },

    drawProp(ctx, cam, p, par, pack) {
      const rec = pack.props.find(x => x.def.id === p.def.id);
      const im = rec && rec.c; if (!im || !im.complete || !im.naturalWidth) return;
      const ax = p.def.anchor_px ? p.def.anchor_px[0] : Math.round((p.def.width || im.naturalWidth) / 2);
      const ay = p.def.anchor_px ? p.def.anchor_px[1] : (p.def.height || im.naturalHeight);
      const sx = 96 + Math.floor((p.x - cam) * (par == null ? 1 : par));
      const sy = p.def.anchor_y != null ? p.def.anchor_y : WF.CFG.GROUND_Y;
      ctx.drawImage(im, sx - ax, sy - ay);
    },

    drawRepeatFx(ctx, cam, t, pack, def) {
      const rec = pack.dyn && pack.dyn[def.id];
      const im = rec && rec.c; if (!im || !im.complete || !im.naturalWidth) return;
      const par = this.layerPar(pack, def.coordinate_layer || def.layer || 'far');
      const w = def.repeat_world_layer_px || 256, VW = WF.CFG.VIEW_W;
      const ox = -mod(Math.floor((cam - 96) * par), w);
      const cw = def.cell_size[0], ch = def.cell_size[1];
      const order = def.frame_order || [];
      const n = order.length || def.frames || 1;
      const fd = Math.max(1, Math.round((def.frame_duration_ms || 160) * WF.CFG.FPS / 1000));
      const fi = (order.length ? order : [...Array(n).keys()])[Math.floor(t / fd) % n];
      const ax = def.anchor_left_px || 0, ay = def.anchor_top_px || 0;
      for (let x = ox; x < VW; x += w)
        ctx.drawImage(im, fi * cw, 0, cw, ch, x + ax, ay, cw, ch);
    },

    drawPropFx(ctx, cam, t, st, pack, def) {
      const rec = pack.dyn && pack.dyn[def.id];
      const im = rec && rec.c; if (!im || !im.complete || !im.naturalWidth) return;
      const par = this.layerPar(pack, def.layer || 'near');
      const trees = (st.props || []).filter(p => p.id === (def.source_prop || 'tree'));
      const cw = def.cell_size[0], ch = def.cell_size[1];
      const order = def.frame_order || [0, 1, 2, 3];
      const fd = Math.max(1, Math.round((def.frame_duration_ms || 160) * WF.CFG.FPS / 1000));
      const period = Math.max(1, Math.round((def.period_ms || 3900) * WF.CFG.FPS / 1000));
      const fall = def.fall_distance_px || 35, drift = def.drift_px || 0, sway = def.sway_px || 0;
      const origin = def.local_origin || [0, 0];
      const staggers = def.stagger_ms || [0];
      for (const tree of trees) {
        const ax = tree.def.anchor_px ? tree.def.anchor_px[0] : 0;
        const ay = tree.def.anchor_px ? tree.def.anchor_px[1] : 0;
        const sx = 96 + Math.floor((tree.x - cam) * par);
        const sy = tree.def.anchor_y != null ? tree.def.anchor_y : WF.CFG.GROUND_Y;
        const ox = sx - ax + origin[0], oy = sy - ay + origin[1];
        staggers.forEach((ms, k) => {
          const off = Math.round((ms || 0) * WF.CFG.FPS / 1000);
          const tf = mod(t - off, period), kprog = tf / period;
          const x = ox + kprog * drift + Math.sin(kprog * Math.PI * 2) * sway;
          const y = oy + kprog * fall;
          const fi = order[Math.floor(tf / fd) % order.length];
          ctx.drawImage(im, fi * cw, 0, cw, ch, Math.round(x), Math.round(y), cw, ch);
        });
      }
    },

    drawPigeons(ctx, t, st, pack) {
      const d = pack.dyn && pack.dyn.pigeon; if (!d || !d.c || !d.c.complete || !d.c.naturalWidth) return;
      const def = d.def, im = d.c, cw = def.cell_size[0], ch = def.cell_size[1];
      const order = def.frame_order || [0, 1, 2];
      const fd = Math.max(1, Math.round((def.frame_duration_ms || 125) * WF.CFG.FPS / 1000));
      for (const p of st.pigeons) {
        const fi = order[Math.floor(p.t / fd) % order.length];
        ctx.drawImage(im, fi * cw, 0, cw, ch, Math.round(p.x), Math.round(p.y), cw, ch);
      }
    },
  };
})();
