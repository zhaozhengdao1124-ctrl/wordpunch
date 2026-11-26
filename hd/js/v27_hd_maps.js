// v27（hd 版）：十关 × A–D 四套官方高清地图（2026-11-25 资产包，120 张原图转 WebP q90）。
// 每套三层：street 5160×324（3 倍源，逻辑 1720×108）、arena backdrop 3990×1620（15 倍源，逻辑 266×108）、透明地面 deck 4830×555（逻辑 322×37，顶边 y=1065）。
// 规则：
//   · 同一城市的街道和擂台用同一个字母（跑到哪套街尾，就在哪套擂台开打）。
//   · 每局每城随机抽 A–D（设计交接：随机加载是讨论过的方向，不把四版硬绑难度）。
//   · 跑街：整条长卷按世界坐标 1:1 随真实位移滚动（地面线 y=76 → 源图 228），不平铺、不重复。
//   · 擂台：地面 deck 跟人物 1:1；背景按 (266−192)/(320−192) 视差平移，镜头走满擂台时恰好露出背景两端，不裁不留黑。
// 查询参数：
//   ?hdmap=B             所有城市固定用 B 套
//   ?hdmap=tokyo:C,paris:A  指定城市用指定套（其余随机）
//   ?hdcity=tokyo        闯关第一站改成这座城（便于逐城试图）
//   ?hdarena=0           退回原 5 层擂台和原跑街
(function () {
  const WF = window.WF || (window.WF = {});
  let q = '';
  try { q = location.search || ''; } catch (e) {}
  const P = new URLSearchParams(q);
  const STAGES = ['paris', 'tokyo', 'beijing', 'foshan', 'seoul', 'buenosaires', 'washington', 'shaolin', 'pyramid', 'rocketbase'];
  const VARS = ['A', 'B', 'C', 'D'];
  const STREET_SRC = 3, ARENA_SRC = 15, DECK_TOP = 1065;

  const forcedAll = /^[A-D]$/i.test(P.get('hdmap') || '') ? P.get('hdmap').toUpperCase() : null;
  const forcedCity = {};
  (P.get('hdmap') || '').split(',').forEach(s => { const m = /^([a-z]+):([A-D])$/i.exec(s.trim()); if (m) forcedCity[m[1].toLowerCase()] = m[2].toUpperCase(); });
  const hdCity = (P.get('hdcity') || '').toLowerCase();

  const on = () => WF.hdArena !== false;
  const has = id => STAGES.indexOf(id) >= 0;

  const cache = Object.create(null);
  function img(src) { const im = new Image(); im.decoding = 'async'; im.src = src; return im; }
  function pack(stage, v) {
    const k = stage + '/' + v;
    if (!cache[k]) {
      const base = 'assets/hd_maps/' + stage + '/' + v + '_';
      cache[k] = { street: null, bg: null, deck: null, base };
    }
    return cache[k];
  }
  function want(stage, v, which) {
    const p = pack(stage, v);
    if (which === 'street' || which === 'all') p.street = p.street || img(p.base + 'street.webp');
    if (which === 'arena' || which === 'all') { p.bg = p.bg || img(p.base + 'bg.webp'); p.deck = p.deck || img(p.base + 'deck.webp'); }
    return p;
  }
  const ok = im => !!(im && im.complete && im.naturalWidth);

  function pick(stage) { return forcedCity[stage] || forcedAll || VARS[Math.floor(Math.random() * VARS.length)]; }
  // 每局（camp 对象）每城只抽一次；street 状态上也记一份，街尾和擂台必然同一套
  function variantFor(g, stage) {
    const cp = g && g.camp;
    if (!cp) return forcedCity[stage] || forcedAll || 'A';
    const m = cp._hdMap || (cp._hdMap = {});
    if (!m[stage]) m[stage] = pick(stage);
    return m[stage];
  }
  function curStage(g) { const cp = g && g.camp; return cp && cp.city && (cp.city.stage || cp.cityId); }

  // ---------- 跑街 ----------
  function hookRun() {
    const R = WF.Run;
    if (!R || R._hdMapHooked) return;
    const baseDraw = R.draw.bind(R);
    R.draw = function (ctx, cam, t, st) {
      if (!on() || !st || !has(st.id)) return baseDraw(ctx, cam, t, st);
      const v = st.hdVar || (st.hdVar = variantFor(WF.game, st.id));
      const p = want(st.id, v, 'street');
      if (!ok(p.street)) return baseDraw(ctx, cam, t, st);
      const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE, im = p.street;
      const logW = im.naturalWidth / STREET_SRC, VW = C.VIEW_W + 2;
      let left = cam - C.VIEW_W / 2;
      left = Math.max(0, Math.min(logW - VW, left));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, left * STREET_SRC, 0, VW * STREET_SRC, im.naturalHeight, 0, 0, VW * WS, C.VIEW_H * WS);
      ctx.restore();
    };
    R._hdMapHooked = true;
  }

  // ---------- 擂台 ----------
  function hookStage() {
    const St = WF.Stage;
    if (!St || St._hdMapHooked) return;
    const baseDraw = St.draw.bind(St);
    St.draw = function (ctx, cam, t, excite) {
      if (!on()) return baseDraw(ctx, cam, t, excite);
      const g = WF.game, stage = curStage(g) || 'paris';
      if (!has(stage)) return baseDraw(ctx, cam, t, excite);
      const v = variantFor(g, stage);
      const p = want(stage, v, 'arena');
      if (!ok(p.bg) || !ok(p.deck)) return baseDraw(ctx, cam, t, excite);
      const C = WF.CFG, WS = C.WORLD_SCALE || C.SCALE, k = WS / ARENA_SRC;
      const left = cam - C.VIEW_W / 2;
      const span = Math.max(1, C.STAGE_W - C.VIEW_W);
      const bgLog = p.bg.naturalWidth / ARENA_SRC;
      const par = Math.max(0, Math.min(1, (bgLog - C.VIEW_W) / span));
      const bx = Math.round(-Math.max(0, Math.min(span, left)) * par * WS);
      const dx = Math.round(-left * WS);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = k !== 1;
      ctx.drawImage(p.bg, 0, 0, p.bg.naturalWidth, p.bg.naturalHeight, bx, 0, p.bg.naturalWidth * k, p.bg.naturalHeight * k);
      ctx.drawImage(p.deck, 0, 0, p.deck.naturalWidth, p.deck.naturalHeight, dx, DECK_TOP * k, p.deck.naturalWidth * k, p.deck.naturalHeight * k);
      ctx.restore();
    };
    St._hdMapHooked = true;
  }

  // ---------- 闯关流程：开街时定套、预载；可选指定第一站 ----------
  function hookCampaign() {
    const G = WF.Game && WF.Game.prototype;
    if (!G || G._hdMapHooked) return;
    const baseStart = G.campStartStreet;
    if (baseStart) G.campStartStreet = function () {
      const r = baseStart.apply(this, arguments);
      const stage = curStage(this);
      if (on() && this.street && has(stage)) {
        this.street.hdVar = variantFor(this, stage);
        want(stage, this.street.hdVar, 'all');
      }
      return r;
    };
    const baseRoute = G.campMakeRoute;
    if (baseRoute) G.campMakeRoute = function (opts) {
      let route = baseRoute.apply(this, arguments);
      if (hdCity && WF.CFG.CAMPAIGN.CITIES[hdCity] && Array.isArray(route)) {
        if (route.indexOf(hdCity) >= 0) route = [hdCity].concat(route.filter(c => c !== hdCity));
        else { route = route.slice(); route[0] = hdCity; }
      }
      return route;
    };
    G._hdMapHooked = true;
  }

  // 标题画面默认巴黎 A（或 ?hdmap 指定）
  if (on()) want('paris', forcedCity.paris || forcedAll || 'A', 'arena');

  WF.HDMaps = {
    stages: STAGES, variants: VARS, cache,
    variantFor, want,
    // 测试用：同步取某城某套的三层是否都已载入
    ready(stage, v) { const p = pack(stage, v); return ok(p.street) && ok(p.bg) && ok(p.deck); },
    current() { const g = WF.game, s = curStage(g); return { stage: s, variant: s ? variantFor(g, s) : null, street: g && g.street && g.street.hdVar }; },
  };

  hookRun();
  hookStage();
  hookCampaign();
})();
