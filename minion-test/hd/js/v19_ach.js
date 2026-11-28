// v1.9 成就（§10.3）+ 图鉴「商店」页签的点亮标记。一局内的条件在闯关中每 0.5 秒检查一次，满足就记终身标记（L.f）；累计类读 prog.items。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, Ach = WF.Ach; if (!Ach) return;
  const ITEMS = () => (WF.game && WF.game.items19 && WF.game.items19()) || {};
  const flag = k => ({ test: L => !!(L.f && L.f[k]) });
  const cntI = (get, of) => ({ test: (L, g) => get(g.items || {}) >= of, prog: (L, g) => [Math.min(of, get(g.items || {})), of] });
  const DEB = () => C.DEBUFF_IDS, HID = () => C.ITEMS.filter(d => d.hidden).map(d => d.id), SETS = () => Object.keys(C.ITEM_SETS);
  Ach.add('item', 'gold1000', '小富翁', '一局闯关累计获得 1000 金币', flag('gold1000'));
  Ach.add('item', 'spend600', '精打细算', '一局闯关里花掉 600 金币以上', flag('spend600'));
  Ach.add('item', 'purify3', '破除霉运', '累计找胭脂净化 3 件霉运道具', cntI(I => I.purified || 0, 3));
  Ach.add('item', 'debuff5', '倒霉蛋', '同时背着 5 件霉运道具', flag('debuff5'));
  Ach.add('item', 'debuff_all', '霉运图鉴', '9 件霉运道具都遇到过', cntI(I => DEB().filter(id => I.seen && I.seen[id]).length, 9));
  Ach.add('item', 'remove2', '断舍离', '累计用「拿掉一件道具」服务 2 次', cntI(I => I.removed || 0, 2));
  Ach.add('item', 'lucky5', '好运连连', '连续 5 次翻牌都是好结果', flag('lucky5'));
  Ach.add('item', 'haggle3', '砍价高手', '一局闯关里砍价成功 3 次', flag('haggle3'));
  Ach.add('item', 'luckycat', '招财进宝', '带着招财猫，一局获得 1200 金币以上', flag('luckycat'));
  Ach.add('item', 'set3', '凑齐一套', '任意一个套装凑齐 3 件', flag('set3'));
  Ach.add('item', 'set_all', '集邮达人', `${SETS().length} 个套装都凑齐过`, cntI(I => SETS().filter(k => I.sets && I.sets[k]).length, SETS().length));
  Ach.add('item', 'gambler', '赌徒本色', '神经刀、骰子、盲盒同时拥有', flag('gambler'));
  Ach.add('item', 'picky', '挑食', '用过开局禁用，并且全部通关', flag('picky'));
  Ach.add('hidden', 'hidden_items', '隐藏道具全发现', '所有隐藏道具都加入了奖池', Object.assign({ hidden: true }, cntI(I => HID().filter(id => I.unlocked && I.unlocked[id]).length, HID().length)));

  G.ach19Tick = function () {
    const cp = this.camp, I = this.items19(); if (!cp || !I) return;
    const F = k => Ach.flag(this, k);
    I.codex = I.codex || {};
    const mark = k => { if (!I.codex[k]) { I.codex[k] = Date.now(); WF.Profiles.save(); } };
    if (cp.goldGot > 0) mark('coin');
    if (cp.flipN > 0) mark('card');
    if (cp.shopN > 0 && cp.shop) mark('rouge');
    if (cp.flipLog && cp.flipLog.includes('E')) mark('empty');
    if (cp.goldGot >= 1000) F('gold1000');
    if (cp.goldSpent >= 600) F('spend600');
    if (cp.items.filter(i => DEB().includes(i.id)).length >= 5) F('debuff5');
    if (cp.goodRun >= 5) F('lucky5');
    if (cp.haggleWins >= 3) F('haggle3');
    if (this.lvOf('lucky_cat') && cp.goldGot >= 1200) F('luckycat');
    if (this.setBonus && this.setBonus('gambler') >= 3) F('gambler');
    if (this.setBonus) for (const k of SETS()) if (this.setBonus(k) >= 3 && !(I.sets && I.sets[k])) { I.sets = I.sets || {}; I.sets[k] = 1; F('set3'); WF.Profiles.save(); }
    const m = cp.modal; if (m && m.type === 'cleared' && m.final && cp.bans.picked.length) F('picky');
    // 终身计数：本局新增的净化 / 拿掉次数
    const dP = (cp.purified || 0) - (cp._achP || 0), dR = (cp.removeOther || 0) - (cp._achR || 0);
    if (dP > 0 || dR > 0) { I.purified = (I.purified || 0) + Math.max(0, dP); I.removed = (I.removed || 0) + Math.max(0, dR); cp._achP = cp.purified || 0; cp._achR = cp.removeOther || 0; WF.Profiles.save(); Ach.check(this); }
  };
  const baseCU = G.campUpdate;
  G.campUpdate = function () { const r = baseCU.apply(this, arguments); if (this.camp && this.t % 15 === 0) { try { this.ach19Tick(); } catch (e) { console.error(e); } } return r; };
  // 最终结算：加一行金币（不计分）
  const baseDC = G.drawCleared;
  G.drawCleared = function () {
    baseDC.apply(this, arguments);
    const cp = this.camp, m = cp && cp.modal; if (!m || !m.final) return;
    this.txt(`金币  获得 ${cp.goldGot} · 花费 ${cp.goldSpent} · 剩余 ${cp.gold}（金币不计分）`, C.SCREEN_W / 2, 488, 13, '#ffd24a', 'center', { sw: 3, weight: 700 });
  };
})();
