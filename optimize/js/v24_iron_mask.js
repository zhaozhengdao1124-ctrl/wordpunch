// 巴黎 Boss 换为铁面人（英文 Iron Mask）。只换这一城的对手图和显示名。
// 玛戈的图集、可选角色、天赋、镜像皮肤、蒸汽皮肤都留在原处。
//
// 缩放：源图 assets/iron_mask.png 就是 3× 图集（192 格，脚点 96,162），不再抽样成 64 格。
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
