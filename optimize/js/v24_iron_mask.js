// 巴黎 Boss 换为铁面人（英文 Iron Mask）。只换这一城的对手图和显示名。
// 玛戈的图集、可选角色、天赋、镜像皮肤、蒸汽皮肤都留在原处。
//
// 缩放：源图集是 3×（192 格，脚点 96,162），见 assets/iron_mask/。
// 现有画面是 192×108 逻辑像素再 ×5 最近邻到 960×540，玛戈格子是 64、脚点 (32,54)。
// 5 不能整除 3，所以这里不改出屏分辨率。运行时 iron_mask.png 由 3× 图集按最近邻、
// 每 3 个源像素取左上角那一个（相位 0）收成 1024×960、cell 64、脚点 (32,54)，
// 和玛戈同一套格子，再走原来的 ×5。脚点 (96,162) 正好落到 (32,54)。
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
