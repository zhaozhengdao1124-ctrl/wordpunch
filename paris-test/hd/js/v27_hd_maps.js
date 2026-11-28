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
  // 只有下载并解码完成才算可画，避免第一帧拿到未解码的图
  function img(src, pri) {
    const im = new Image(); im.decoding = 'async'; if (pri) im.fetchPriority = pri;
    im.onload = () => { if (im.decode) im.decode().then(() => { im._hdOk = true; }, () => { im._hdOk = true; }); else im._hdOk = true; };
    im.onerror = () => { im._hdFail = true; };
    im.src = src; return im;
  }
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
    if (which === 'street' || which === 'all') p.street = p.street || img(p.base + 'street.webp', 'high');
    const arena = () => { p.bg = p.bg || img(p.base + 'bg.webp', 'low'); p.deck = p.deck || img(p.base + 'deck.webp', 'low'); };
    if (which === 'arena') arena();
    else if (which === 'all' && !p.bg) {
      // 街道优先：街道载完（或失败）再载擂台，不抢开局带宽
      const st = p.street;
      if (st._hdOk || st._hdFail) arena();
      else { const go = () => arena(); st.addEventListener('load', go, { once: true }); st.addEventListener('error', go, { once: true }); }
    }
    return p;
  }
  const ok = im => !!(im && im._hdOk && im.complete && im.naturalWidth);
  const NEUTRAL = '#05030c';
  function neutral(ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = NEUTRAL; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }

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
      if (!ok(p.street)) return neutral(ctx);   // hd 版不再画旧跑街：没载好就是纯底色
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
      if (!ok(p.bg) || !ok(p.deck)) return neutral(ctx);   // hd 版不再画旧擂台
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

  // hd 版：十城的旧跑街 / 旧擂台图不再下载（只留 runs.js 里的数据，关长、入口等逻辑照旧），省带宽给高清图
  function hookOldLoaders() {
    const R = WF.Run, St = WF.Stage;
    if (R && !R._hdSkipOld) {
      const baseLoad = R.load.bind(R);
      R.load = function (id, done) {
        if (!on() || !has(id)) return baseLoad(id, done);
        if (!this.cache[id]) this.cache[id] = { layers: [], props: [], dyn: {}, sp: this.spec(id) || {} };
        if (done) done(true);
      };
      R._hdSkipOld = true;
    }
    if (St && !St._hdSkipOld) {
      const baseCity = St.loadCity.bind(St);
      St.loadCity = function (id, done) {
        if (!on() || !has(id)) return baseCity(id, done);
        if (!this.imgCache[id]) this.imgCache[id] = [];
        if (done) done(true);
      };
      St._hdSkipOld = true;
    }
  }
  // 起飞时就定下这一城的套并预载街道 + 擂台；飞机落地后若街道还没载完，停在地图上等（最多 HOLD_MAX_MS），不先进城
  const HOLD_MAX_MS = 30000;
  function preloadCity(g) {
    const stage = curStage(g);
    if (!on() || !has(stage)) return null;
    const v = variantFor(g, stage);
    want(stage, v, 'all');
    return { stage, v };
  }
  function hookPreload() {
    const G = WF.Game && WF.Game.prototype;
    if (!G || G._hdPreHooked) return;
    const baseMap = G.campMapStart;
    if (baseMap) G.campMapStart = function () {
      const r = baseMap.apply(this, arguments);
      const pc = preloadCity(this);
      if (pc && this.camp) this.camp._hdWait = { stage: pc.stage, v: pc.v, t0: Date.now() };
      return r;
    };
    const baseEnter = G.campEnterCity;
    if (baseEnter) G.campEnterCity = function () {
      const cp = this.camp, w = cp && cp._hdWait;
      if (on() && cp && !cp.entered) {
        const pc = preloadCity(this);
        if (pc && !ok(pack(pc.stage, pc.v).street)) {   // 等街道就够：擂台在跑街的几分钟里接着载，载完前也只画底色
          const t0 = (w && w.stage === pc.stage) ? w.t0 : (cp._hdWait = { stage: pc.stage, v: pc.v, t0: Date.now() }).t0;
          const p = pack(pc.stage, pc.v);
          const failed = !!(p.street && p.street._hdFail);
          if (!failed && Date.now() - t0 < HOLD_MAX_MS) { this._hdLoading = true; return; }
        }
      }
      this._hdLoading = false;
      if (cp) cp._hdWait = null;
      return baseEnter.apply(this, arguments);
    };
    // 等待时在地图画面右下角提示一下
    const baseRender = G.render;
    if (baseRender) G.render = function () {
      const r = baseRender.apply(this, arguments);
      if (this._hdLoading && this.state === 'map' && this.ctx) {
        const C = WF.CFG, c = this.ctx;
        c.save(); WF.uiTransform(c);
        c.fillStyle = 'rgba(5,3,12,0.72)'; c.fillRect(C.SCREEN_W - 210, C.SCREEN_H - 44, 196, 30);
        c.fillStyle = '#ffd23c'; c.font = '700 14px ' + C.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('载入高清地图…', C.SCREEN_W - 112, C.SCREEN_H - 29);
        c.restore();
      }
      return r;
    };
    G._hdPreHooked = true;
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

  hookOldLoaders();
  hookRun();
  hookStage();
  hookCampaign();
  hookPreload();
})();
