// 巴黎关卡暂时下线（新小兵图未就绪）。不删图、不删角色、不改数值。
// 挑战池不再抽到巴黎；直接指定 paris、地图图钉、以及已经把路线指到巴黎的半局，都改去下一座还开着的城，或者回标题。
(function () {
  const W = window.WF, G = W && W.Game && W.Game.prototype;
  if (!G || !W.CFG || !W.CFG.CAMPAIGN) return;
  const KC = () => W.CFG.CAMPAIGN;
  const city = id => (KC().CITIES || {})[id];
  const closed = id => { const c = city(id); return !!(c && c.offline); };
  const playableRoute = list => (list || []).filter(id => { const c = city(id); return c && !c.offline; });

  const baseRoute = G.campMakeRoute;
  G.campMakeRoute = function (opts) {
    const route = baseRoute ? baseRoute.call(this, opts || {}) : (KC().ROUTE || []).slice();
    const out = playableRoute(route);
    return out.length ? out : playableRoute(KC().ROUTE);
  };

  const baseStart = G.startCampaign;
  G.startCampaign = function (opts) {
    const o = Object.assign({}, opts || {});
    if (o.city && closed(o.city)) delete o.city;
    return baseStart.call(this, o);
  };

  // 半局存档 / 已经抽中的路线：当前站若是巴黎，不打，改飞后面还开着的城；没有下一站就回标题。
  G.campLeaveParis = function () {
    const cp = this.camp;
    if (!cp || this._parisBusy) return false;
    const routeDirty = (cp.route || []).some(closed);
    const here = closed(cp.cityId) || !!(cp.city && cp.city.offline);
    const wheelDirty = !!(this.wheel && (this.wheel.segs || []).some(closed));
    if (!routeDirty && !here && !wheelDirty) return false;

    const before = (cp.route || []).slice();
    const route = playableRoute(before);
    if (!route.length) {
      this.say('巴黎暂时关闭，没有可去的下一站，回标题');
      this.goTitle();
      return true;
    }
    cp.route = route;

    const note = (sub) => {
      if (cp._parisTold) return;
      cp._parisTold = true;
      cp.toasts = cp.toasts || [];
      try { this.toast('巴黎暂时关闭', sub, null, '#ffd23c'); } catch (e) {}
      if (this.say) this.say('巴黎暂时关闭 ' + sub);
    };

    if (!here) {
      const i = route.indexOf(cp.cityId);
      if (i >= 0) cp.ci = i;
      note('这条路线不再经过巴黎');
      if (!wheelDirty) return false;
      this.wheel = null;
      this._parisBusy = true;
      try { if (this.campMapStart) this.campMapStart((this.mapAnim && this.mapAnim.from) || 'start'); }
      finally { this._parisBusy = false; }
      return true;
    }

    if (this.state === 'result') {
      this.say('巴黎暂时关闭，本局已结束，回标题');
      this.goTitle();
      return true;
    }

    const at = Math.max(0, before.indexOf(cp.cityId));
    let next = null;
    for (let i = at + 1; i < before.length; i++) if (!closed(before[i]) && route.includes(before[i])) { next = before[i]; break; }
    if (!next) {
      this.say('巴黎暂时关闭，没有可去的下一站，回标题');
      this.goTitle();
      return true;
    }

    const skipped = cp.cityId;
    cp.cityId = next;
    cp.city = this.campCityFor ? this.campCityFor(next, route) : city(next);
    cp.ci = Math.max(0, route.indexOf(next));
    cp.entered = false;
    cp.wave = 0;
    cp.modal = null;
    this.queue = [];
    this.q = null;
    this.ko = null;
    this.pendingAttack = null;
    this.street = null;
    this.cine = null;
    this.wheel = null;
    this.car = null;
    this.mapAnim = null;
    this.zoom = null;
    this.camLock = null;
    if (this.p && cp.city && cp.city.normals && cp.city.normals[0]) {
      this.p[1] = new W.Fighter(cp.city.normals[0], 1);
      this.p[1].alpha = 0;
    }
    note('改去' + (KC().CITY_NAMES[next] || next));
    this.say('跳过已下线城市 ' + skipped);
    const from = (cp.cleared && cp.cleared.length) ? cp.cleared[cp.cleared.length - 1] : 'start';
    this._parisBusy = true;
    try { if (this.campMapStart) this.campMapStart(from); }
    finally { this._parisBusy = false; }
    return true;
  };

  const baseMap = G.campMapStart;
  if (baseMap) G.campMapStart = function (from) {
    if (!this._parisBusy && this.campLeaveParis && this.campLeaveParis()) return;
    return baseMap.call(this, from);
  };
  const baseEnter = G.campEnterCity;
  if (baseEnter) G.campEnterCity = function () {
    if (this.camp && this.camp.city && this.camp.city.offline) {
      if (!(this.campLeaveParis && this.campLeaveParis())) this.goTitle();
      return;
    }
    return baseEnter.call(this);
  };
  const baseNext = G.campNextCity;
  if (baseNext) G.campNextCity = function () {
    const cp = this.camp;
    if (cp && Array.isArray(cp.route)) {
      const route = playableRoute(cp.route);
      if (route.length && route.length !== cp.route.length && !(cp.city && cp.city.offline)) {
        cp.route = route;
        const i = route.indexOf(cp.cityId);
        if (i >= 0) cp.ci = i;
        if (!cp._parisTold) {
          cp._parisTold = true;
          this.toast('巴黎暂时关闭', '这条路线不再经过巴黎', null, '#ffd23c');
        }
      }
    }
    if (this.camp && this.camp.city && this.camp.city.offline) {
      if (this.campLeaveParis) this.campLeaveParis();
      return;
    }
    return baseNext.call(this);
  };
  const baseCU = G.campUpdate;
  if (baseCU) G.campUpdate = function () {
    if (this.campLeaveParis && this.campLeaveParis()) return true;
    return baseCU.apply(this, arguments);
  };
  const baseDraw = G.drawMap;
  if (baseDraw) G.drawMap = function () {
    const cp = this.camp;
    if (cp && cp.city && cp.city.offline) return;
    if (cp && Array.isArray(cp.route)) {
      const shown = playableRoute(cp.route);
      if (shown.length && shown.length !== cp.route.length && shown.includes(cp.cityId)) {
        cp.route = shown;
        cp.ci = shown.indexOf(cp.cityId);
      }
    }
    return baseDraw.call(this);
  };
})();

// 巴黎 Boss 换为铁面人（英文 Iron Mask）。只换这一城的对手图和显示名。
// 玛戈的图集、可选角色、天赋、镜像皮肤、蒸汽皮肤都留在原处。
//
// 缩放：源图 assets/iron_mask.png 就是 3× 图集 v3（192 格，脚点 96,162），不再抽样成 64 格。
// 逻辑格子仍是 64、脚点 (32,54)，和玛戈的站位、命中盒一致。
// 世界层 ×15 时，64 逻辑像素 = 960 设备像素，192 源像素 ×5 铺进去，整数倍最近邻。
//
// 书页 / 词典特效：帧上的 dict_fly、page_flip、page_impact、page_glow、page_storm 去掉。
// 本来就有的 quay_dust（灰尘）留下，仍用玛戈那张中性灰尘条。不新做链条特效。
(function () {
  const W = window.WF;
  const src = window.WF_ASSETS && WF_ASSETS.margot;
  if (!src || !W || !W.CFG) return;
  const BOOK = { dict_fly: 1, page_flip: 1, page_impact: 1, page_glow: 1, page_storm: 1 };
  const d = JSON.parse(JSON.stringify(src));
  d.id = 'iron_mask';
  d.name = '铁面人';
  d.credit = 'Word Punch 原创';
  d.portrait = [20, 12, 24];
  d.cell = 64;
  d.drawCell = 64;
  d.srcCell = 192;
  d.foot = [32, 54];
  for (const anim of Object.values(d.anims)) {
    for (const f of anim.frames) {
      if (!f.fx) continue;
      f.fx = f.fx.filter(fx => !BOOK[fx[0]]);
      if (!f.fx.length) delete f.fx;
    }
  }
  d.fx = src.fx && src.fx.quay_dust ? { quay_dust: src.fx.quay_dust } : {};
  window.WF_ASSETS.iron_mask = d;

  // 打败巴黎 Boss 仍计入玛戈的解锁（beat.margot）。奖励和旧存档条件不变，只是对手换成了铁面人。
  const G = W.Game && W.Game.prototype;
  if (!G || !G.campBeat) return;
  const baseBeat = G.campBeat;
  G.campBeat = function (L) {
    if (L && L.id === 'iron_mask') {
      const pid = this.menu && this.menu.p1, p = W.Profiles && W.Profiles.ext(pid);
      if (p) {
        p.camp.beat = Object.assign({}, p.camp.beat || {});
        p.camp.beat.margot = (p.camp.beat.margot || 0) + 1;
      }
    }
    return baseBeat.call(this, L);
  };
})();
