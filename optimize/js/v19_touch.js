// v1.9 触屏：新界面（翻牌 / 休息点 / 升级 / 商店 / 对话 / 拿掉 / 砍价 / 禁用 / 图鉴 / 提示条）在触屏设备上字号不小于 TOUCH_FONT 逻辑像素。
// 960×540 画布在 667×375 横屏上缩到 ≈0.694 → 16px ≈ 11 CSS px；点击区 ≥ TOUCH_TAP（64px ≈ 44 CSS px）由各界面的触屏布局保证。
// 桌面（非触屏）完全不走这里的分支。
(function () {
  const G = WF.Game.prototype;
  WF.TOUCH_FONT = 16; WF.TOUCH_TAP = 64;
  ['drawRest', 'drawUpgrade', 'drawFlip', 'drawShop', 'drawBan', 'drawToasts', 'drawCodex', 'drawCleared'].forEach(n => {
    const f = G[n]; if (!f) return;
    G[n] = function () { const o = this._tfloor; if (WF.touch) this._tfloor = WF.TOUCH_FONT; try { return f.apply(this, arguments); } finally { this._tfloor = o; } };
  });
})();
(function () {   // 提示条矩形每帧重算（给布局自检用；没有闯关时也不会越积越多）
  const G = WF.Game.prototype, base = G.render;
  G.render = function () { this._toastRects = []; return base.apply(this, arguments); };
})();
