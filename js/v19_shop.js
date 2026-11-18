// v1.9 胭脂的杂货铺（§2C）：货架 5 件（±50% 浮动、红绿价签）、刷新（40/80/120，不浮动不打折）、和胭脂说话（净化霉运 / 拿掉道具 / 砍价 / 聊天）。
// 一个休息点 = 一次进店：同一休息点里出去再进来，货架、价签、两档「拿掉」的浮动、砍价结果都不变（防刷价）。
(function () {
  const G = WF.Game.prototype, C = WF.CFG, K = () => C.CAMPAIGN, R = WF.R19, ITEM = id => C.ITEMS.find(i => i.id === id);
  const SK = () => window.WF_SHOPKEEPER || { greet: [{ t: '欢迎光临', f: 'smile' }] };
  const art = () => window.WF_ART19 || { portrait: {}, counter: {} };
  const W = 960;
  // 货位：左侧约 2/3，两层木架（3 + 2）
  const SLOT = [{ x: 44, y: 128 }, { x: 228, y: 128 }, { x: 412, y: 128 }, { x: 44, y: 284 }, { x: 228, y: 284 }], SW = 168, SH = 132;
  const KEEPER = { x: 640, y: 196, w: 300, h: 240 }, COUNTER_ANCHOR = { x: 790, y: 446 }, BTN_REF0 = { x: 44, y: 470, w: 220, h: 44 }, BTN_LEAVE0 = { x: 760, y: 470, w: 170, h: 44 };
  // 触屏：按钮 64 高（≈44 CSS 像素）
  const BTN_REF_T = { x: 44, y: 466, w: 240, h: 64 }, BTN_LEAVE_T = { x: 740, y: 466, w: 190, h: 64 };
  // 焦点顺序：0–4 货位、5 胭脂、6 刷新、7 离开
  const NAV = {
    ArrowRight: [1, 2, 5, 4, 5, 5, 7, 7], ArrowLeft: [0, 0, 1, 3, 3, 2, 6, 6],
    ArrowDown: [3, 4, 4, 6, 6, 7, 6, 7], ArrowUp: [0, 1, 2, 0, 1, 5, 3, 5],
  };
  NAV.KeyD = NAV.ArrowRight; NAV.KeyA = NAV.ArrowLeft; NAV.KeyS = NAV.ArrowDown; NAV.KeyW = NAV.ArrowUp;

  G.shopOpen = function (restModal) {
    const cp = this.camp;
    if (!cp.shop) {
      const rng = this.campRng('shopvisit' + cp.shopN);
      cp.shop = { rng, refreshN: 0, gone: [], pctBad: R.rollPct(rng), pctOther: R.rollPct(rng), disc: 0, haggled: false, haggleWon: false, chatUsed: [], seenRed: false, seenGreen: false, visit: cp.shopN };
      cp.shop.stock = this.shopStock();
      this.shopSay('greet');
      for (const s of cp.shop.stock) this.itemSeen(s.id);
    } else this.shopSay('greet');
    cp.modal = { type: 'shop', back: restModal, view: 'shelf', sel: 0, confirm: null, t: 0, shake: 0 };
    this.state = 'shop';
    this.say(`进店 #${cp.shopN}：${cp.shop.stock.map(s => `${s.id}${s.up ? '↑' : ''} ${this.shopPrice(s)}(${s.list}${s.pct >= 0 ? '+' : ''}${Math.round(s.pct * 100)}%)`).join(' / ')}  净化 ${this.removeCost('debuff')} 拿掉 ${this.removeCost('other')}`);
    // 砍价可能要用错题本里别的词库：提前懒加载（失败也不报错，到时候补词）
    const P = WF.Profiles.get(this.menu.p1);
    if (P && WF.Banks) for (const b of new Set(WF.Profiles.wrongList(P.id, 'all').slice(0, 30).map(e => e.bank))) if (b && WF.Banks.find && WF.Banks.find(b)) WF.Banks.ensure(b).catch(() => {});
  };
  G.shopCandidates = function () {
    const cp = this.camp;
    return C.ITEMS.filter(d => !this.itemBlocked(d.id) && !cp.shop.gone.includes(d.id) && (() => { const lv = this.itemOwnedLv(d.id); return lv ? (!d.noUpgrade && lv < this.itemMaxLv(d.id)) : true; })())
      .map(d => ({ id: d.id, up: this.itemOwnedLv(d.id) > 0 }));
  };
  // 每件的权重 = 稀有度档权重 ÷ 该档候选件数（双刃剑算稀有档）× 隐藏 0.5 → 各档出现的概率和翻牌一致（60/30/10）
  G.shopStock = function () {
    const cand = this.shopCandidates(), RW = K().RARITY_W, tierOf = id => { const r = ITEM(id).rarity; return r === 'curse' ? 'rare' : r; };
    const n = { common: 0, rare: 0, legend: 0 }; for (const c of cand) n[tierOf(c.id)]++;
    return R.stock({ rng: this.camp.shop.rng, pool: cand, n: K().SHOP.STOCK, weightOf: id => RW[tierOf(id)] / Math.max(1, n[tierOf(id)]) * this.itemWeight(id) });
  };
  G.shopPrice = function (s) { return R.price(s.list, s.pct, this.camp.shop.disc); };
  G.removeCost = function (kind) { const cp = this.camp, S = cp.shop; return R.removePrice(kind, kind === 'debuff' ? cp.removeBad : cp.removeOther, kind === 'debuff' ? S.pctBad : S.pctOther, S.disc); };
  G.shopSay = function (cat, extra) {
    const cp = this.camp, S = cp.shop, L = SK()[cat] || SK().greet;
    const line = L[Math.floor(S.rng() * L.length)];
    S.line = { t: (extra ? extra + ' ' : '') + line.t, f: line.f, cat, at: this.t };
  };
  G.shopLeave = function () {
    const cp = this.camp, m = cp.modal;
    this.shopSay('farewell');
    this.toast('胭脂：' + cp.shop.line.t.slice(0, 22) + (cp.shop.line.t.length > 22 ? '…' : ''), '离开了杂货铺', null, '#ff8fa6');
    cp.modal = m.back; this.state = 'rest'; cp.modal.sel = 2;
    WF.Audio.play('menu');
  };
  G.shopBuyAsk = function (i) {
    const cp = this.camp, m = cp.modal, s = cp.shop.stock[i]; if (!s || s.sold) return;
    const price = this.shopPrice(s);
    if (cp.gold < price) { this.shopSay('poor'); m.shake = 8; WF.Audio.play('wrong'); return; }
    m.confirm = { kind: 'buy', i, price };
  };
  G.shopBuy = function () {
    const cp = this.camp, m = cp.modal, cf = m.confirm, s = cp.shop.stock[cf.i];
    if (!this.spendGold(cf.price, '购买 ' + s.id)) return;
    s.sold = true; m.confirm = null;
    this.giveItem(s.id, '杂货铺');
    cp.bought = (cp.bought || 0) + 1;
    if (s.pct < 0) cp.boughtCheap = (cp.boughtCheap || 0) + 1;
    this.shopSay('bought'); WF.Audio.play('rating');
  };
  G.shopRefresh = function () {
    const cp = this.camp, S = cp.shop, m = cp.modal, price = R.refreshPrice(S.refreshN);
    if (price == null) { WF.Audio.play('wrong'); return; }
    if (cp.gold < price) { this.shopSay('poor'); m.shake = 8; WF.Audio.play('wrong'); return; }
    this.spendGold(price, '刷新货架');
    for (const s of S.stock) if (!S.gone.includes(s.id)) S.gone.push(s.id);
    S.refreshN++; S.stock = this.shopStock(); for (const s of S.stock) this.itemSeen(s.id);
    S.seenRed = S.seenGreen = false;
    this.shopSay('refresh'); WF.Audio.play('whoosh');
    this.say(`刷新货架 #${S.refreshN}：${S.stock.map(s => s.id + ' ' + this.shopPrice(s)).join(' / ')}`);
  };
  // ---------- 对话 ----------
  G.talkOpts = function () {
    const cp = this.camp, S = cp.shop, hasBad = cp.items.some(i => ITEM(i.id).kind === 'debuff'), hasOther = cp.items.some(i => ITEM(i.id).kind !== 'debuff');
    const hw = this.haggleReady();
    return [
      { key: 'purify', t: '净化霉运', ok: hasBad, price: hasBad ? this.removeCost('debuff') : null, base: R.removeBase('debuff', cp.removeBad), pct: S.pctBad },
      { key: 'remove', t: '拿掉一件道具', ok: hasOther, price: hasOther ? this.removeCost('other') : null, base: R.removeBase('other', cp.removeOther), pct: S.pctOther },
      { key: 'haggle', t: '砍价（答 3 个错题词，全对打折）', ok: !S.haggled && hw.ok, note: S.haggled ? (S.haggleWon ? `砍下了 −${Math.round(S.disc * 100)}%` : '今天不砍了') : hw.ok ? '本次还没砍过' : '胭脂今天没带题' },
      { key: 'chat', t: '聊聊天', ok: S.chatUsed.length < K().SHOP.CHAT_MAX, note: S.chatUsed.length < K().SHOP.CHAT_MAX ? '随便说两句，不花钱' : '她要忙生意了' },
      { key: 'bye', t: '回到货架', ok: true },
    ];
  };
  G.talkChoose = function (i) {
    const cp = this.camp, S = cp.shop, m = cp.modal, o = this.talkOpts()[i]; if (!o) return;
    m.tsel = i;
    if (o.key === 'bye') { m.view = 'shelf'; m.sel = 5; return; }
    if (o.key === 'purify') { if (!o.ok) { this.shopSay('clean'); WF.Audio.play('wrong'); return; } m.view = 'remove'; m.rkind = 'debuff'; m.rsel = 0; return; }
    if (o.key === 'remove') { if (!o.ok) { this.shopSay('nothing'); WF.Audio.play('wrong'); return; } m.view = 'remove'; m.rkind = 'other'; m.rsel = 0; return; }
    if (o.key === 'haggle') {
      if (S.haggled) { this.shopSay('haggleDone'); WF.Audio.play('wrong'); return; }
      const hw = this.haggleReady(); if (!hw.ok) { this.shopSay('haggleNone'); WF.Audio.play('wrong'); return; }
      this.haggleStart(); return;
    }
    if (o.key === 'chat') {
      if (!o.ok) { WF.Audio.play('wrong'); return; }
      const L = SK().chat, left = L.map((x, k) => k).filter(k => !S.chatUsed.includes(k)), k = left[Math.floor(S.rng() * left.length)];
      S.chatUsed.push(k); S.line = { t: L[k].t, f: L[k].f, cat: 'chat', at: this.t }; WF.Audio.play('menu');
    }
  };
  G.removeList = function () {
    const m = this.camp.modal;
    return this.camp.items.filter(it => (ITEM(it.id).kind === 'debuff') === (m.rkind === 'debuff'));
  };
  G.removeAsk = function (i) {
    const cp = this.camp, m = cp.modal, it = this.removeList()[i]; if (!it) return;
    m.rsel = i; const price = this.removeCost(m.rkind);
    if (cp.gold < price) { this.shopSay('poor'); m.shake = 8; WF.Audio.play('wrong'); return; }
    m.confirm = { kind: 'remove', id: it.id, price };
  };
  G.removeDo = function () {
    const cp = this.camp, m = cp.modal, cf = m.confirm, d = ITEM(cf.id);
    if (!this.spendGold(cf.price, (m.rkind === 'debuff' ? '净化 ' : '拿掉 ') + cf.id)) return;
    this.removeItem(cf.id); m.confirm = null;
    if (m.rkind === 'debuff') { cp.removeBad++; cp.purified++; this.shopSay('purify'); cp.shop.cloud = { t: 0 }; this.toast(`净化  ${d.name}`, '乌云散啦', cf.id, '#ff8fa6'); }
    else { cp.removeOther++; this.shopSay(d.rarity === 'curse' ? 'removeCurse' : 'removeOther'); this.toast(`拿掉  ${d.name}`, '本局不会再出现', cf.id, '#ff8fa6'); }
    cp.removedN++;
    this.say(`${m.rkind === 'debuff' ? '净化' : '拿掉'} ${cf.id} −${cf.price}  下次基础价 ${R.removeBase(m.rkind, m.rkind === 'debuff' ? cp.removeBad : cp.removeOther)}`);
    if (!this.removeList().length) { m.view = 'talk'; }
    else m.rsel = Math.min(m.rsel, this.removeList().length - 1);
    WF.Audio.play('rating');
  };
  // ---------- 砍价（§2C.8）----------
  G.haggleReady = function () {
    const cp = this.camp, S = cp.shop;
    if (S.hw) return S.hw;
    const prof = WF.Profiles.get(this.menu.p1), pid = prof && prof.id;
    const loaded = id => { const b = this.banks.find(x => x.id === id); return !!(b && b.words && b.words.length && (!WF.Banks || WF.Banks.isLoaded(b))); };
    const wrong = pid ? WF.Profiles.wrongList(pid, 'all').filter(e => e.kind !== 'phrase' && e.word && loaded(e.bank)) : [];
    const bank = this.bank && this.bank.words && this.bank.words.length ? this.bank : null;
    const seen = [], any = [];
    if (bank) for (const w of bank.words) { const e = { word: w.word, bank: bank.id }; const ms = pid ? WF.Profiles.mastery(pid, bank.id, w.word) : 'new'; (ms === 'seen' || ms === 'wrong' ? seen : any).push(e); }
    const hw = R.haggleWords(this.campRng('haggle' + S.visit), wrong, seen, any.length > 400 ? R.shuffle(this.campRng('hagfill' + S.visit), any).slice(0, 400) : any);
    // 能出四选一题才算数（词库里找得到这个词）
    if (hw.ok) { try { const ws = new WF.WrongSource([], this.source, this.banks, this.campRng('hagq' + S.visit)); hw.qs = hw.words.map(e => ws.wordFrom(e)); if (hw.qs.some(q => !q || !q.options || q.options.length < 2)) hw.ok = false; } catch (e) { hw.ok = false; } }
    S.hw = hw; return hw;
  };
  G.haggleStart = function () {
    const cp = this.camp, S = cp.shop, m = cp.modal, hw = this.haggleReady();
    S.haggled = true;   // 进去就算用掉（中途 Esc 按失败算）
    m.view = 'haggle'; m.hg = { i: 0, pick: null, fb: 0, qs: hw.qs };
    this.shopSay(hw.filled ? 'haggleFill' : 'haggleAsk');
    this.say(`砍价开始：${hw.words.map(w => w.word).join(', ')}（错题本 ${hw.fromBook} / 补 ${hw.filled}）`);
  };
  G.haggleAnswer = function (k) {
    const m = this.camp.modal, h = m.hg; if (!h || h.pick != null) return;
    const q = h.qs[h.i]; if (k < 0 || k >= q.options.length) return;
    h.pick = k; h.fb = 0; h.ok = k === q.correct; WF.Audio.play(h.ok ? 'correct' : 'wrong');
  };
  G.haggleEnd = function (win) {
    const cp = this.camp, S = cp.shop, m = cp.modal;
    if (win) { S.disc = R.haggleDisc(this.campRng('hagdisc' + S.visit)); S.haggleWon = true; cp.haggleWins++; this.shopSay('haggleWin', `（全场 −${Math.round(S.disc * 100)}%）`); WF.Audio.play('rating', { big: true }); }
    else { this.shopSay('haggleLose'); }
    this.say(`砍价${win ? '成功 −' + Math.round(S.disc * 100) + '%' : '失败'}`);
    m.hg = null; m.view = 'shelf'; m.sel = 5;
  };
  G.tickShop = function () {
    const cp = this.camp, m = cp && cp.modal; if (!m || m.type !== 'shop') return;
    m.t++;
    const hv = this.hover19; if (hv && (!m.hv || m.hv.x !== hv.x || m.hv.y !== hv.y)) { m.hv = { x: hv.x, y: hv.y }; this.shopHover(hv.x, hv.y); }   // 鼠标移动过才跟随，不和键盘抢焦点
    if (cp.shop.cloud && ++cp.shop.cloud.t > 50) cp.shop.cloud = null;
    const h = m.hg; if (!h || h.pick == null) return;
    if (++h.fb < 30) return;
    if (!h.ok) { this.haggleEnd(false); return; }
    h.i++; h.pick = null;
    if (h.i >= h.qs.length) this.haggleEnd(true);
  };
  // ---------- 输入 ----------
  const isOK = c => c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
  G.shopKey = function (code) {
    const cp = this.camp, m = cp.modal;
    if (m.confirm) { if (isOK(code) || code === 'KeyY') (m.confirm.kind === 'buy' ? this.shopBuy() : this.removeDo()); else if (code === 'Escape' || code === 'KeyN') m.confirm = null; return; }
    if (m.view === 'haggle') {
      const h = m.hg;
      if (code === 'Escape') { if (h.pick == null) { WF.Audio.play('wrong'); this.haggleEnd(false); } return; }
      const n = /^(Digit|Numpad)([1-4])$/.exec(code); if (n) { this.haggleAnswer(+n[2] - 1); return; }
      const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[code];
      if (mv && h.pick == null) { h.sel = Math.max(0, Math.min(3, (h.sel || 0) + mv)); return; }
      if (isOK(code)) this.haggleAnswer(h.sel || 0);
      return;
    }
    if (m.view === 'talk') {
      const n = this.talkOpts().length;
      if (code === 'Escape') { m.view = 'shelf'; m.sel = 5; return; }
      if (code === 'ArrowUp' || code === 'KeyW') { m.tsel = ((m.tsel || 0) + n - 1) % n; WF.Audio.play('menu'); return; }
      if (code === 'ArrowDown' || code === 'KeyS') { m.tsel = ((m.tsel || 0) + 1) % n; WF.Audio.play('menu'); return; }
      const d = /^(Digit|Numpad)([1-5])$/.exec(code); if (d) { this.talkChoose(+d[2] - 1); return; }
      if (isOK(code)) this.talkChoose(m.tsel || 0);
      return;
    }
    if (m.view === 'remove') {
      const n = this.removeList().length;
      if (code === 'Escape') { m.view = 'talk'; return; }
      const mv = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -8, KeyW: -8, ArrowDown: 8, KeyS: 8 }[code];
      if (mv) { m.rsel = Math.max(0, Math.min(n - 1, (m.rsel || 0) + mv)); WF.Audio.play('menu'); return; }
      if (isOK(code)) this.removeAsk(m.rsel || 0);
      return;
    }
    // 货架
    if (code === 'Escape') { this.shopLeave(); return; }
    if (code === 'KeyT') { m.view = 'talk'; m.tsel = 0; WF.Audio.play('menu'); return; }
    if (code === 'KeyR') { this.shopRefresh(); return; }
    if (NAV[code]) { m.sel = NAV[code][m.sel]; WF.Audio.play('menu'); this.shopNotice(); return; }
    const d = /^(Digit|Numpad)([1-5])$/.exec(code); if (d) { m.sel = +d[2] - 1; this.shopBuyAsk(m.sel); return; }
    if (isOK(code)) this.shopActivate(m.sel);
  };
  G.shopActivate = function (i) {
    const m = this.camp.modal; m.sel = i;
    if (i <= 4) this.shopBuyAsk(i); else if (i === 5) { m.view = 'talk'; m.tsel = 0; WF.Audio.play('menu'); } else if (i === 6) this.shopRefresh(); else this.shopLeave();
  };
  // 焦点落在红价 / 绿价上：她各说一次
  G.shopNotice = function () {
    const S = this.camp.shop, s = S.stock[this.camp.modal.sel]; if (!s || s.sold) return;
    if (s.pct > 0 && !S.seenRed) { S.seenRed = true; this.shopSay('hagglePricey'); }
    else if (s.pct < 0 && !S.seenGreen) { S.seenGreen = true; this.shopSay('haggleCheap'); }
  };
  G.shopClick = function (hit) {
    const m = this.camp.modal; if (!hit) return;
    if (hit.key === 'yes') { m.confirm.kind === 'buy' ? this.shopBuy() : this.removeDo(); return; }
    if (hit.key === 'no') { m.confirm = null; return; }
    if (m.confirm) return;
    if (hit.key === 'slot') { m.sel = hit.i; this.shopNotice(); this.shopBuyAsk(hit.i); }
    else if (hit.key === 'keeper') this.shopActivate(5);
    else if (hit.key === 'refresh') { m.sel = 6; this.shopRefresh(); }
    else if (hit.key === 'leave') this.shopLeave();
    else if (hit.key === 'talk') this.talkChoose(hit.i);
    else if (hit.key === 'rm') this.removeAsk(hit.i);
    else if (hit.key === 'rmback') m.view = 'talk';
    else if (hit.key === 'rmpg') { const per = RM_T.per, n = this.removeList().length, pg = Math.max(0, Math.min(Math.ceil(n / per) - 1, Math.floor((m.rsel || 0) / per) + hit.i)); m.rsel = pg * per; WF.Audio.play('menu'); }
    else if (hit.key === 'hg') this.haggleAnswer(hit.i);
    else if (hit.key === 'hgquit') { if (m.hg && m.hg.pick == null) this.haggleEnd(false); }
  };
  // 鼠标悬停货位：显示说明 + 触发红绿台词
  G.shopHover = function (x, y) {
    const m = this.camp && this.camp.modal; if (!m || m.type !== 'shop' || m.view !== 'shelf' || m.confirm) return;
    this.shopSlots(!!(art().shopBg && WF.campImg('shopkeeper/shop_bg.png'))).forEach((p, i) => { if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h && m.sel !== i) { m.sel = i; this.shopNotice(); } });
  };

  // ---------- 画面 ----------
  // 价签：绿 = ▼现价 + 划掉的标价 + −x%；红 = ▲现价 +x%；平价 = 白
  G.drawPriceTag = function (x, y, w, list, pct, disc, price, poor) {
    const up = pct > 0, down = pct < 0, col = poor ? '#8a90a8' : up ? '#ff6a6a' : down ? '#7dff9a' : '#fff3c8';
    if (WF.touch) {   // 触屏：44 高、16px 字；砍价折扣只在顶部金章显示一次（价签里放不下）
      this.box(x, y, w, 44, up ? 'rgba(70,14,20,0.95)' : down ? 'rgba(12,48,24,0.95)' : 'rgba(40,30,20,0.95)', up ? '#ff6a6a' : down ? '#3fc06a' : '#c9a04a', 2);
      this.drawCoin(x + 5, y + 16, 12);
      this.txt((up ? '▲' : down ? '▼' : '') + price, x + 20, y + 23, 20, col, 'left', { sw: 3, weight: 900 });
      if (down || disc) { const c = this.ctx; c.font = `700 16px ${C.FONT}`; const s = String(list), tw = c.measureText(s).width, tx = x + w - 6 - tw; this.txt(s, tx, y + 12, 16, '#9a9aaa', 'left', { sw: 2, weight: 700 }); c.fillStyle = '#d0d0d8'; c.fillRect(tx - 1, y + 12, tw + 2, 2); }
      if (pct) this.txt(`${up ? '+' : '−'}${Math.round(Math.abs(pct) * 100)}%`, x + w - 6, y + 32, 16, up ? '#ff9a9a' : '#9aff9a', 'right', { sw: 2, weight: 700 });
      return;
    }
    this.box(x, y, w, 36, up ? 'rgba(70,14,20,0.95)' : down ? 'rgba(12,48,24,0.95)' : 'rgba(40,30,20,0.95)', up ? '#ff6a6a' : down ? '#3fc06a' : '#c9a04a', 2);
    this.drawCoin(x + 6, y + 12, 12);
    this.txt((up ? '▲' : down ? '▼' : '') + price, x + 22, y + 19, 18, col, 'left', { sw: 3, weight: 900 });
    if (down || disc) {   // 标价灰色小字，划掉
      const c = this.ctx; c.font = `700 11px ${C.FONT}`; const s = String(list), tw = c.measureText(s).width, tx = x + w - 8 - tw;
      this.txt(s, tx, y + 10, 11, '#9a9aaa', 'left', { sw: 2, weight: 700 }); c.fillStyle = '#d0d0d8'; c.fillRect(tx - 1, y + 10, tw + 2, 2);
    }
    if (pct) this.txt(`${up ? '+' : '−'}${Math.round(Math.abs(pct) * 100)}%`, x + w - 8, y + 27, 11, up ? '#ff9a9a' : '#9aff9a', 'right', { sw: 2, weight: 700 });
    if (disc) { this.box(x + 4, y + 30, 58, 15, '#ffd23c', '#8a5a00', 1); this.txt(`砍价 −${Math.round(disc * 100)}%`, x + 33, y + 37.5, 10, '#120c1c', 'center', { stroke: false, weight: 900 }); }   // 金章贴在价签左下角（上方是稀有度那行，右上是划掉的标价）
  };
  // 胭脂半身像（占位：程序画的像素图；Codex 的 shopkeeper/portrait/<表情>/000.png 到了就用）
  // ---- 胭脂的动画状态（§美术需求 4.4-C）：说话 → talk；砍价成功 → happy；答错 / 钱不够 → pout；其余 idle ----
  const F3 = n => String(n).padStart(3, '0');
  const ONE_SHOT = { haggleWin: 'happy', haggleLose: 'pout', poor: 'pout' };
  const HOLD = 45, BLEND_STEP = 3, TOSS_EVERY = 7;   // 一次性动画停在末帧的时长（tick），之后倒放回第 0 帧（第 0 帧和 idle 第 0 帧逐像素相同）→ 手不跳
  // 像素溶解：只用合成（不读像素，file:// 下也不会被跨域污染卡住）。step 1..3 = 25 / 50 / 75% 的像素换成 idle/000
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], DIS = {};
  function dissolve(from, to, step, n, key) {
    const id = key + step; if (DIS[id]) return DIS[id];
    const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = n; return cv; };
    const mask = mk(), mx = mask.getContext('2d'); mx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (BAYER[(y % 4) * 4 + (x % 4)] < step * 4) mx.fillRect(x, y, 1, 1);
    const a = mk(), ax = a.getContext('2d'); ax.drawImage(to, 0, 0); ax.globalCompositeOperation = 'destination-in'; ax.drawImage(mask, 0, 0);
    const b = mk(), bx = b.getContext('2d'); bx.drawImage(from, 0, 0); bx.globalCompositeOperation = 'destination-out'; bx.drawImage(mask, 0, 0);
    const out = mk(), ox = out.getContext('2d'); ox.drawImage(b, 0, 0); ox.drawImage(a, 0, 0);
    return (DIS[id] = out);
  }
  G.rougeTalkLen = function (line) { return line ? Math.min(90, 24 + line.t.length * 2) : 0; };
  // 返回 { anim, frame }：纯函数式，按 line.at 和当前 t 算，不存状态（重进商店 / 截图都可复现）
  G.rougeCounterFrame = function (line, t) {
    const A = art().counter || {}, sum = a => a.reduce((x, y) => x + y, 0);
    const loopAt = (name, tt) => { const tk = A[name].ticks, L = sum(tk); let r = ((tt % L) + L) % L; for (let i = 0; i < tk.length; i++) { if (r < tk[i]) return i; r -= tk[i]; } return 0; };
    // 闲着时偶尔抛一次硬币（I4 coin_toss，8 帧 26 tick，首尾 = idle/000）：每 7 个 idle 循环（≈9 秒）在循环开头播一次，播完停在 idle/000 到本循环结束 → 不跳帧
    const idleAt = tt => {
      if (!A.idle) return { anim: 'idle', frame: 0, phase: 'idle' };
      const L = sum(A.idle.ticks), cyc = Math.floor(tt / L), r = tt - cyc * L;
      if (A.coin_toss && ((cyc % TOSS_EVERY) + TOSS_EVERY) % TOSS_EVERY === TOSS_EVERY - 4) {
        const tk = A.coin_toss.ticks; let q = r;
        for (let i = 0; i < tk.length; i++) { if (q < tk[i]) return { anim: 'coin_toss', frame: i, phase: 'toss' }; q -= tk[i]; }
        return { anim: 'idle', frame: 0, phase: 'idle' };
      }
      return { anim: 'idle', frame: loopAt('idle', r), phase: 'idle' };
    };
    const age = line ? t - line.at : 1e9, one = line && ONE_SHOT[line.cat];
    if (one && A[one]) {
      const tk = A[one].ticks, L = sum(tk);
      if (age < L) { let r = age; for (let i = 0; i < tk.length; i++) { if (r < tk[i]) return { anim: one, frame: i, phase: 'play' }; r -= tk[i]; } }
      if (age < L + HOLD) return { anim: one, frame: tk.length - 1, phase: 'hold' };
      const back = age - L - HOLD;   // 回 idle：末帧 → idle/000 像素溶解（4×4 Bayer，3 步 × 3 tick），不倒放（倒放会把抛币再放一遍）
      if (back < BLEND_STEP * 3) return { anim: one, frame: tk.length - 1, phase: 'blend', step: 1 + Math.floor(back / BLEND_STEP) };
      return idleAt(back - BLEND_STEP * 3);
    }
    if (line && A.talk && age < this.rougeTalkLen(line)) return { anim: 'talk', frame: loopAt('talk', age), phase: 'talk' };
    return idleAt(t);
  };
  // 柜台小场景：锚点 (32,63) 放在 (ax, ay)；素材朝右，镜像成朝左（面向货架）；×4 整数倍
  G.drawRougeCounter = function (ax, ay, k, line) {
    const A = art(), f = this.rougeCounterFrame(line, this.t), im = A.counter && A.counter[f.anim] ? WF.campImg(`shopkeeper/counter/${f.anim}/${F3(f.frame)}.png`) : null;
    if (!im) return null;
    const an = (A.counter[f.anim].anchor || A.anchor || [32, 63]), cell = A.counterCell || 64;
    let src = im;
    if (f.phase === 'blend') { const idle0 = WF.campImg('shopkeeper/counter/idle/000.png'); if (idle0) src = dissolve(im, idle0, f.step, cell, f.anim); }
    const x = Math.round(ax - (cell - 1 - an[0]) * k), y = Math.round(ay - an[1] * k);   // 镜像后锚点的 x = cell-1-ax
    const c = this.ctx; c.imageSmoothingEnabled = false; c.save(); c.translate(x + cell * k, y); c.scale(-1, 1); c.drawImage(src, 0, 0, cell * k, cell * k); c.restore();
    return { x, y, w: cell * k, h: cell * k, f };
  };
  // 对话半身像：48×48，在 box 里按允许倍数居中；说话时嘴 000/001 交替（每帧 4 tick）
  G.drawRougePortrait = function (x, y, box, face, line) {
    const P = art().portrait || {}, e = P[face] ? face : P.smile ? 'smile' : null;
    if (e) {
      const talking = line && this.t - line.at < this.rougeTalkLen(line), tk = P[e].ticks || [4, 4];
      const fr = talking ? Math.floor((this.t - line.at) / tk[0]) % P[e].n : 0, im = WF.campImg(`shopkeeper/portrait/${e}/${F3(fr)}.png`);
      if (im) return WF.blit19(this.ctx, im, x, y, box, box / 48);
    }
    this.drawRouge(x + box / 2 - 30 * (box / 64), y, box / 64, face);   // 占位
    return null;
  };
  G.drawRouge = function (x, y, s, face) {   // 占位：程序画的像素图（素材没到 / 加载中）
    const c = this.ctx, R_ = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x + px * s), Math.round(y + py * s), Math.ceil(w * s), Math.ceil(h * s)); };
    const OUT = '#25202e', HAIR = '#7a1f2b', HAIR2 = '#a83246', SKIN = '#f2c29b', SKIN2 = '#d99a76', RED = '#d3263c', JK = '#8e1b2c', JK2 = '#b52a3e', BLK = '#1a1622', GOLD = '#ffd24a';
    // 头发（后）
    R_(14, 6, 32, 40, OUT); R_(15, 7, 30, 38, HAIR); R_(12, 18, 4, 30, HAIR); R_(44, 18, 4, 26, HAIR); R_(11, 30, 2, 18, OUT);
    // 脸
    R_(19, 12, 22, 24, OUT); R_(20, 13, 20, 22, SKIN); R_(20, 30, 20, 5, SKIN2); R_(22, 34, 16, 2, SKIN);
    // 刘海（侧分）+ 垂下的一缕
    R_(18, 9, 24, 6, HAIR); R_(18, 14, 6, 6, HAIR); R_(34, 14, 8, 3, HAIR); R_(18, 20, 3, 16, HAIR2); R_(18, 36, 2, 4, GOLD);
    R_(26, 9, 10, 2, HAIR2);
    // 眼睛（按表情）
    const eye = (ex, kind) => {
      if (kind === 'closed') { R_(ex, 22, 5, 1, OUT); R_(ex + 1, 23, 3, 1, OUT); }
      else if (kind === 'happy') { R_(ex, 23, 1, 1, OUT); R_(ex + 1, 22, 3, 1, OUT); R_(ex + 4, 23, 1, 1, OUT); }
      else { R_(ex, 21, 5, 1, OUT); R_(ex, 22, 5, 3, '#ffffff'); R_(ex + 1, 22, 3, 3, '#5a2030'); R_(ex + 2, 22, 1, 1, '#ffffff'); R_(ex, 22, 5, 1, kind === 'lazy' ? SKIN2 : '#5a2030'); }
    };
    const f = face || 'smile';
    eye(23, f === 'giggle' ? 'happy' : f === 'wink' ? 'lazy' : 'lazy');
    eye(32, f === 'wink' ? 'closed' : f === 'giggle' ? 'happy' : 'lazy');
    // 眉毛
    R_(23, 19, 5, 1, HAIR); if (f === 'brow' || f === 'smug') R_(32, 17, 5, 1, HAIR); else R_(32, 19, 5, 1, HAIR);
    // 泪痣（左眼下）
    R_(24, 26, 1, 1, '#5a2030');
    // 嘴（正红）
    if (f === 'pout') { R_(28, 30, 4, 2, RED); }
    else if (f === 'giggle') { R_(27, 29, 6, 2, RED); R_(33, 28, 5, 5, SKIN); R_(33, 28, 5, 1, OUT); R_(33, 32, 5, 1, OUT); R_(38, 28, 1, 5, OUT); }   // 掩嘴：手
    else if (f === 'smug') { R_(27, 30, 6, 1, RED); R_(33, 29, 1, 1, RED); }
    else { R_(27, 29, 1, 1, RED); R_(28, 30, 4, 1, RED); R_(32, 29, 1, 1, RED); }
    // 腮红
    R_(21, 27, 2, 1, '#f08a8a'); R_(37, 27, 2, 1, '#f08a8a');
    // 金色大圈耳环
    R_(16, 26, 4, 1, GOLD); R_(15, 27, 1, 4, GOLD); R_(20, 27, 1, 4, GOLD); R_(16, 31, 4, 1, GOLD);
    R_(40, 26, 4, 1, GOLD); R_(39, 27, 1, 4, GOLD); R_(44, 27, 1, 4, GOLD); R_(40, 31, 4, 1, GOLD);
    // 脖子 + 黑色高领
    R_(26, 36, 8, 4, SKIN2); R_(24, 38, 12, 5, BLK); R_(25, 38, 10, 1, '#3a3446');
    // 身体：黑色高领上衣 + 披在肩上的酒红丝绒短外套
    R_(12, 42, 36, 22, OUT); R_(14, 43, 32, 21, BLK);
    R_(12, 42, 12, 22, JK); R_(36, 42, 12, 22, JK); R_(14, 43, 6, 3, JK2); R_(40, 43, 6, 3, JK2); R_(23, 44, 1, 20, OUT); R_(36, 44, 1, 20, OUT);
    R_(21, 52, 3, 3, GOLD); R_(36, 52, 3, 3, GOLD);
    // 古铜钱吊坠
    R_(29, 43, 1, 4, '#c9a04a'); R_(27, 47, 5, 5, '#b8860b'); R_(29, 49, 1, 1, BLK);
  };
  // 货位布局：有 I4 夜摊背景时按 shop_bg.json 的 5 个货位中心（×5）摆：名字、稀有度、图标（×3，落在净空区）在格子里，价签挂在木板上；
  // 没有背景时沿用旧的 3+2 方格。返回每格 { x, y, w, h（点击区）, cx, name, sub, icon（图标框上沿）, isc（图标倍数）, tag（价签上沿） }
  G.shopSlots = function (bg) {
    const meta = art().shopBgMeta;
    if (bg && meta && meta.slots && meta.slots.length >= 5) {
      const k = meta.scale || 5;
      return meta.slots.slice(0, 5).map(sl => {
        const cx = sl.c[0] * k, top = sl.c[1] * k < 280;   // 上层 / 下层
        return top ? { cx, x: cx - 88, y: 126, w: 176, h: 166, name: 142, sub: 163, icon: 183, isc: 3, tag: 244 }
                   : { cx, x: cx - 88, y: 292, w: 176, h: 140, name: 300, sub: 320, icon: 330, isc: 3, tag: 386 };
      });
    }
    return SLOT.map(p => ({ cx: p.x + SW / 2, x: p.x, y: p.y, w: SW, h: SH, name: p.y + 58, sub: p.y + 78, icon: p.y + 4, isc: 2.5, tag: p.y + 92 }));
  };
  G.drawShop = function () {
    const cp = this.camp, S = cp.shop, m = cp.modal, c = this.ctx;
    // 背景：深木色货架（Codex 的 shop_bg.png 到了就用）
    const bg = art().shopBg ? WF.campImg('shopkeeper/shop_bg.png') : null, T = WF.touch;
    if (bg) { c.imageSmoothingEnabled = false; c.drawImage(bg, 0, 0, W, C.SCREEN_H); }   // I4 夜摊：192×108 ×5 铺满
    else {
      c.fillStyle = 'rgba(14,8,10,0.94)'; c.fillRect(0, 0, W, C.SCREEN_H);
      c.fillStyle = '#2a1810'; c.fillRect(28, 112, 580, 336);
      for (let yy = 116; yy < 448; yy += 14) { c.fillStyle = (yy / 14) % 2 ? '#311d13' : '#2a1810'; c.fillRect(32, yy, 572, 8); }
      for (const sy of [262, 418]) { c.fillStyle = '#5a3a1e'; c.fillRect(24, sy, 588, 12); c.fillStyle = '#7a5230'; c.fillRect(24, sy, 588, 3); c.fillStyle = '#1a0e08'; c.fillRect(24, sy + 12, 588, 4); }
      c.fillStyle = '#4a2c18'; c.fillRect(24, 108, 8, 344); c.fillRect(604, 108, 8, 344);
    }
    this.txt('胭脂的杂货铺', 316, 42, 34, '#ff8fa6', 'center', { font: C.FONT_TITLE, sw: 8 });
    this.drawCoin(W - 176, 26, 20); this.txt(String(cp.gold), W - 148, 37, 26, '#ffd24a', 'left', { sw: 5, weight: 900 });
    this.txt('金币', W - 176, 62, 12, '#bfb3d6', 'left', { sw: 3 });
    if (S.disc) { this.box(W - 290, 22, 100, 28, '#ffd23c', '#8a5a00', 2); this.txt(`砍价 −${Math.round(S.disc * 100)}%`, W - 240, 36, 15, '#120c1c', 'center', { stroke: false, weight: 900 }); }
    const shake = m.shake > 0 ? (m.shake-- % 2 ? 3 : -3) : 0;
    // 货位
    this.shopSlots(!!bg).forEach((L, i) => {
      const s = S.stock[i], sel = m.view === 'shelf' && m.sel === i, dx = sel ? shake : 0, x = L.x + dx, cx = L.cx + dx, y = L.y, w = L.w, h = L.h;
      this.campRects.push({ x: L.x, y, w, h, key: 'slot', i });
      if (!s || s.sold) {
        this.box(cx - 50, L.icon + 8, 100, 32, 'rgba(60,40,24,0.9)', '#8a6a3a', 2);
        this.txt(s ? '已售出' : '售罄', cx, L.icon + 24, 14, '#c9b48a', 'center', { sw: 3 });
        if (sel) this.box(x - 3, y - 3, w + 6, h + 6, 'rgba(0,0,0,0)', '#ffd23c', 3);
        return;
      }
      const d = ITEM(s.id), price = this.shopPrice(s), poor = cp.gold < price;
      if (sel) { c.fillStyle = 'rgba(255,210,60,0.14)'; c.fillRect(x - 3, y - 3, w + 6, h + 6); this.box(x - 3, y - 3, w + 6, h + 6, 'rgba(0,0,0,0)', '#ffd23c', 3); }
      this.drawItemIcon(s.id, s.up ? this.itemOwnedLv(s.id) + 1 : 1, cx - L.isc * 8 - Math.max(2, L.isc), L.icon, L.isc);
      this.txt(d.name, cx, L.name, 15, C.RARITY_COLOR[d.rarity], 'center', { sw: 4, maxW: w - 8 });
      this.txt(s.up ? `升级 Lv${this.itemOwnedLv(s.id)} → Lv${this.itemOwnedLv(s.id) + 1}` : C.RARITY_NAME[d.rarity] + (d.set ? ' · ' + C.ITEM_SETS[d.set].name : ''), cx, L.sub, 11, s.up ? '#8fd0ff' : '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: w - 8 });
      this.drawPriceTag(cx - 70, L.tag, 140, s.list, s.pct, S.disc, price, poor);
    });
    // 旧占位货架（没有 I4 背景时）：第二层右边那格「新货在路上」
    if (!bg) { this.box(412 + 34, 284 + 40, SW - 68, 30, 'rgba(60,40,24,0.7)', '#6a5030', 2); this.txt('新货在路上', 412 + SW / 2, 284 + 55, 12, '#a08a68', 'center', { sw: 3 }); }
    // 柜台 + 胭脂
    const face = (S.line && S.line.f) || 'smile', ksel = m.view === 'shelf' && m.sel === 5;
    const bob = Math.round(Math.sin(this.t / 22) * 1.5);
    const real = this.drawRougeCounter(COUNTER_ANCHOR.x, COUNTER_ANCHOR.y, 4, S.line);   // 素材自带柜台前沿、算盘、招财猫
    if (real) S.anim = real.f;
    else {
    this.drawRouge(KEEPER.x + 30, KEEPER.y + 4 + bob, 4, face);
    c.fillStyle = '#5a3a1e'; c.fillRect(620, 430, 340, 30); c.fillStyle = '#7a5230'; c.fillRect(620, 430, 340, 4); c.fillStyle = '#1a0e08'; c.fillRect(620, 458, 340, 4);
    // 柜台摆件：小算盘 + 招财猫（占位）
    c.fillStyle = '#3a2412'; c.fillRect(870, 412, 50, 20); for (let k = 0; k < 4; k++) { c.fillStyle = '#ffd24a'; c.fillRect(874 + k * 12, 416, 5, 5); c.fillRect(878 + k * 10, 424, 5, 5); }
    c.fillStyle = '#25202e'; c.fillRect(640, 400, 28, 32); c.fillStyle = '#fff3e0'; c.fillRect(642, 402, 24, 28); c.fillStyle = '#d3263c'; c.fillRect(646, 418, 16, 3); c.fillStyle = '#25202e'; c.fillRect(648, 409, 3, 2); c.fillRect(657, 409, 3, 2);
    const armUp = (this.t >> 4) % 2; c.fillStyle = '#fff3e0'; c.fillRect(664, armUp ? 396 : 400, 6, 10);
    }
    this.campRects.push({ x: KEEPER.x, y: KEEPER.y, w: KEEPER.w, h: KEEPER.h - 10, key: 'keeper' });
    if (ksel) this.box(KEEPER.x + 18, KEEPER.y - 4, 264, 248, 'rgba(0,0,0,0)', '#ffd23c', 3);
    this.txt(m.view === 'shelf' ? (T ? '胭脂 · 点她说话' : '胭脂 · 点她 / 按 T 说话') : '胭脂', KEEPER.x + 150, real ? (T ? 452 : 456) : 446, 13, '#ffd0da', 'center', { sw: 3 });   // 素材：写在柜台下方；占位：写在柜台正面
    // 对话气泡
    if (S.line) {
      const bx = 632, by = 92, bw = 316, bh = 96;
      this.box(bx, by, bw, bh, 'rgba(255,246,236,0.97)', '#d3263c', 3);
      c.fillStyle = '#d3263c'; c.fillRect(bx + 150, by + bh, 14, 4); c.fillStyle = 'rgba(255,246,236,0.97)'; c.fillRect(bx + 152, by + bh - 1, 10, 4); c.fillRect(bx + 154, by + bh + 3, 6, 4);
      this.wrapLines(S.line.t, bw - 24, 14, 4).forEach((ln, k) => this.txt(ln, bx + 12, by + 18 + k * (T ? 20 : 21), 14, '#3a1420', 'left', { stroke: false, weight: 700 }));
    }
    // 净化动画：乌云散开
    if (S.cloud) { const k = S.cloud.t / 50; for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2, r = 20 + k * 120; c.globalAlpha = 1 - k; c.fillStyle = '#6a6a7a'; c.fillRect(780 + Math.cos(a) * r - 16, 260 + Math.sin(a) * r * 0.6 - 8, 32, 16); } c.globalAlpha = 1; }
    // 按钮
    const BTN_REF = T ? BTN_REF_T : BTN_REF0, BTN_LEAVE = T ? BTN_LEAVE_T : BTN_LEAVE0, by = BTN_REF.h / 2;
    const rp = R.refreshPrice(S.refreshN), rsel = m.view === 'shelf' && m.sel === 6, lsel = m.view === 'shelf' && m.sel === 7;
    this.box(BTN_REF.x, BTN_REF.y, BTN_REF.w, BTN_REF.h, rp == null ? 'rgba(30,24,36,0.9)' : 'rgba(40,30,20,0.95)', rsel ? '#ffd23c' : '#c9a04a', rsel ? 3 : 2);
    this.campRects.push(Object.assign({ key: 'refresh' }, BTN_REF));
    if (rp == null) this.txt(T ? '今天没货了' : '今天没货了（刷新 3/3）', BTN_REF.x + BTN_REF.w / 2, BTN_REF.y + by, 14, '#8a90a8', 'center', { sw: 3 });
    else { this.txt(T ? '刷新货架' : `R 刷新货架`, BTN_REF.x + 16, BTN_REF.y + by, 15, cp.gold < rp ? '#8a90a8' : '#fff3c8', 'left', { sw: 3 }); this.drawCoin(BTN_REF.x + (T ? 112 : 132), BTN_REF.y + by - 6, 12); this.txt(String(rp), BTN_REF.x + (T ? 128 : 148), BTN_REF.y + by, 16, cp.gold < rp ? '#8a90a8' : '#ffd24a', 'left', { sw: 3, weight: 900 }); this.txt(`${S.refreshN}/3`, BTN_REF.x + BTN_REF.w - 10, BTN_REF.y + by, 11, '#bfb3d6', 'right', { sw: 2 }); }
    this.box(BTN_LEAVE.x, BTN_LEAVE.y, BTN_LEAVE.w, BTN_LEAVE.h, 'rgba(60,20,30,0.95)', lsel ? '#ffd23c' : '#ff9a9a', lsel ? 3 : 2);
    this.campRects.push(Object.assign({ key: 'leave' }, BTN_LEAVE));
    this.txt(T ? '离开' : '离开（Esc）', BTN_LEAVE.x + BTN_LEAVE.w / 2, BTN_LEAVE.y + by, T ? 20 : 16, '#ffffff', 'center', { sw: 3 });
    // 焦点货品的效果：写在标题下面那一行（底部留给按钮和提示条）
    const fs = m.view === 'shelf' && m.sel <= 4 && S.stock[m.sel] && !S.stock[m.sel].sold ? S.stock[m.sel] : null;
    if (fs) { const d = ITEM(fs.id), lv = fs.up ? this.itemOwnedLv(fs.id) + 1 : 1, t = `${d.name}${fs.up ? ` Lv${lv - 1}→${lv}` : ''}：${fs.up ? this.itemChange(fs.id, lv - 1, lv) : this.itemDescAt(fs.id, lv)}`;
      if (T) this.wrapLines(t, 600, 16, 2).forEach((ln, k, a) => this.txt(ln, 316, (a.length > 1 ? 76 : 86) + k * 20, 16, '#fff3c8', 'center', { sw: 4, weight: 700 }));   // 触屏：两行
      else this.txt(t, 316, 84, 14, '#fff3c8', 'center', { sw: 3, weight: 700, maxW: 590 }); }
    else this.txt(T ? '买道具 · 点胭脂：净化霉运 / 拿掉道具 / 砍价' : '买道具 · 和胭脂说话可以净化霉运 / 拿掉道具 / 砍价', 316, T ? 86 : 84, 14, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    if (m.view === 'shelf' && !T) this.txt('方向键移动 · Enter 买 / 说话 · T 说话 · R 刷新 · Esc 离开', 512, 530, 11, '#8a90a8', 'center', { sw: 3, weight: 700 });
    if (m.view === 'talk') this.drawTalk();
    else if (m.view === 'remove') this.drawRemove();
    else if (m.view === 'haggle') this.drawHaggle();
    if (m.confirm) {
      if (m.confirm.kind === 'buy') { const s = S.stock[m.confirm.i], d = ITEM(s.id), lv = s.up ? this.itemOwnedLv(s.id) + 1 : 1; this.drawConfirm19(`买下 ${d.name}${s.up ? ` （升到 Lv${lv}）` : ''}，花 ${m.confirm.price} 金币？`, [this.itemDescAt(s.id, lv), `买了不能退 · 现有 ${cp.gold} 金币`], '买（Enter）'); }
      else { const d = ITEM(m.confirm.id); this.drawConfirm19(`${m.rkind === 'debuff' ? '净化' : '拿掉'} ${d.name}，花 ${m.confirm.price} 金币？`, [m.rkind === 'debuff' ? '霉运效果立刻消失，本局不会再中这一件' : '整件拿掉（不管等级），本局不会再出现' + (d.rarity === 'curse' ? '；它的坏处也会一起消失' : ''), `现有 ${cp.gold} 金币`], (m.rkind === 'debuff' ? '净化' : '拿掉') + '（Enter）'); }
    }
  };
  const panel = (g, x, y, w, h) => { g.ctx.fillStyle = 'rgba(6,3,16,0.55)'; g.ctx.fillRect(0, 0, W, C.SCREEN_H); g.campRects = g.campRects.filter(r => r.key === 'pause'); g.box(x, y, w, h, 'rgba(24,14,30,0.98)', '#d3263c', 3); };
  G.drawTalk = function () {
    if (WF.touch) return this.drawTalkT();
    const cp = this.camp, m = cp.modal, o = this.talkOpts();
    panel(this, 150, 96, 660, 360);
    this.drawRougePortrait(166, 116, 144, (cp.shop.line && cp.shop.line.f) || 'smile', cp.shop.line);   // 48px ×3
    this.txt('胭脂', 236, 280, 16, '#ff8fa6', 'center', { sw: 4 });
    this.wrapLines(cp.shop.line ? cp.shop.line.t : '想要点什么服务呀？', 380, 14, 3).forEach((ln, k) => this.txt(ln, 316, 128 + k * 20, 14, '#ffe0e6', 'left', { sw: 3, weight: 700 }));
    o.forEach((it, i) => {
      const y = 196 + i * 46, x = 316, w = 470, sel = (m.tsel || 0) === i;
      this.box(x, y, w, 40, sel ? 'rgba(122,31,43,0.95)' : 'rgba(40,20,30,0.9)', sel ? '#ffd23c' : (it.ok ? '#a83246' : '#4a3040'), sel ? 3 : 2);
      this.campRects.push({ x, y, w, h: 40, key: 'talk', i });
      this.txt(`${i + 1}  ${it.t}`, x + 12, y + 20, 15, it.ok ? '#ffffff' : '#8a7a8a', 'left', { sw: 3, maxW: 300 });
      if (it.price != null) this.drawPriceTag(x + w - 150, y + 2, 142, it.base, it.pct, cp.shop.disc, it.price, cp.gold < it.price);
      else if (it.key === 'purify' || it.key === 'remove') this.txt(it.key === 'purify' ? '身上没有霉运' : '身上没有道具', x + w - 12, y + 20, 12, '#8a7a8a', 'right', { sw: 3 });
      else if (it.note) this.txt(it.note, x + w - 12, y + 20, 12, it.ok ? '#ffb6c1' : '#8a7a8a', 'right', { sw: 3, weight: 700 });
    });
    this.txt('↑↓ 选择 · Enter 确定 · Esc 回到货架', 480, 438, 13, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };
  G.drawRemove = function () {
    if (WF.touch) return this.drawRemoveT();
    const cp = this.camp, m = cp.modal, list = this.removeList(), bad = m.rkind === 'debuff', price = this.removeCost(m.rkind);
    panel(this, 90, 90, 780, 380);
    this.txt(bad ? '净化霉运：选一件' : '拿掉一件道具：选一件（整件拿掉，不管等级）', 480, 116, 18, bad ? '#d8c8a8' : '#ffb6c1', 'center', { sw: 4 });
    this.drawPriceTag(700, 136, 150, R.removeBase(m.rkind, bad ? cp.removeBad : cp.removeOther), bad ? cp.shop.pctBad : cp.shop.pctOther, cp.shop.disc, price, cp.gold < price);
    this.txt(`本局第 ${(bad ? cp.removeBad : cp.removeOther) + 1} 次${bad ? '净化' : '拿掉'}（每次基础价 +${bad ? 30 : 60}）`, 110, 156, 13, '#bfb3d6', 'left', { sw: 3, weight: 700 });
    const cw = 90, ch = 74, cols = 8, x0 = 106, y0 = 190, per = 24, start = Math.floor((m.rsel || 0) / per) * per;   // 一页 24 件（3 行），多了用方向键翻
    list.slice(start, start + per).forEach((it, j) => {
      const i = start + j, d = ITEM(it.id), x = x0 + (j % cols) * (cw + 4), y = y0 + Math.floor(j / cols) * (ch + 4), sel = (m.rsel || 0) === i;
      this.box(x, y, cw, ch, sel ? 'rgba(122,31,43,0.95)' : bad ? 'rgba(46,34,24,0.95)' : 'rgba(30,20,40,0.95)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w: cw, h: ch, key: 'rm', i });
      this.drawItemIcon(it.id, it.lv, x + cw / 2 - 16, y + 6, 2);
      this.txt(d.name, x + cw / 2, y + 50, 11, C.RARITY_COLOR[d.rarity], 'center', { sw: 3, maxW: cw - 6 });
      this.txt(d.kind === 'debuff' || d.noUpgrade ? '' : `Lv${it.lv}`, x + cw / 2, y + 65, 10, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    });
    if (list.length > per) this.txt(`第 ${Math.floor((m.rsel || 0) / per) + 1} / ${Math.ceil(list.length / per)} 页`, 850, 172, 11, '#bfb3d6', 'right', { sw: 2 });
    const sel = list[m.rsel || 0]; if (sel) this.txt(`${ITEM(sel.id).name}：${ITEM(sel.id).kind === 'debuff' ? ITEM(sel.id).desc() : this.itemDescAt(sel.id, Math.max(1, sel.lv))}`, 540, 436, 13, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: 560 });
    this.box(110, 420, 130, 32, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: 110, y: 420, w: 130, h: 32, key: 'rmback' }); this.txt('返回（Esc）', 175, 436, 14, '#e9d7a6', 'center', { sw: 3 });
  };
  G.drawHaggle = function () {
    if (WF.touch) return this.drawHaggleT();
    const cp = this.camp, m = cp.modal, h = m.hg; if (!h) return;
    const q = h.qs[h.i];
    panel(this, 110, 84, 740, 390);
    this.drawRougePortrait(132, 106, 96, (cp.shop.line && cp.shop.line.f) || 'brow', cp.shop.line);   // 48px ×2
    this.txt(`砍价 · 第 ${h.i + 1} / ${h.qs.length} 题`, 520, 112, 20, '#ffd23c', 'center', { sw: 4 });
    this.txt('不限时 · 全对随机打 9～7 折 · 答错不扣东西，但本次不能再砍', 520, 140, 12, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    for (let k = 0; k < h.qs.length; k++) { const done = k < h.i || (k === h.i && h.pick != null && h.ok); this.box(450 + k * 50, 156, 40, 12, done ? '#7dff9a' : k === h.i && h.pick != null ? '#ff6a6a' : '#3a2a4a', null); }
    this.txt(q.word, 520, 206, 40, '#ffffff', 'center', { font: C.FONT_TITLE, sw: 7, maxW: 560 });
    if (q.pos) this.txt(q.pos, 520, 238, 14, '#bfb3d6', 'center', { sw: 3 });
    const bw = 300, bh = 64;
    q.options.slice(0, 4).forEach((op, k) => {
      const x = 220 + (k % 2) * (bw + 20), y = 262 + Math.floor(k / 2) * (bh + 14), sel = h.pick == null && (h.sel || 0) === k;
      let col = sel ? '#ffd23c' : '#5d4f86', bg = 'rgba(24,16,44,0.95)';
      if (h.pick != null) { if (k === q.correct) { col = '#7dff9a'; bg = 'rgba(20,70,30,0.95)'; } else if (k === h.pick) { col = '#ff6a6a'; bg = 'rgba(80,20,24,0.95)'; } }
      this.box(x, y, bw, bh, bg, col, sel || h.pick != null ? 3 : 2);
      this.campRects.push({ x, y, w: bw, h: bh, key: 'hg', i: k });
      this.txt(String(k + 1), x + 16, y + bh / 2, 16, '#ffd23c', 'center', { sw: 3 });
      this.wrapLines(op, bw - 44, 15, 2).forEach((ln, j, arr) => this.txt(ln, x + 32, y + bh / 2 + (j - (arr.length - 1) / 2) * 20, 15, '#ffffff', 'left', { sw: 3, weight: 700 }));
    });
    this.box(130, 430, 150, 30, 'rgba(60,20,30,0.95)', '#ff9a9a', 2); this.campRects.push({ x: 130, y: 430, w: 150, h: 30, key: 'hgquit' });
    this.txt('放弃（Esc，算失败）', 205, 445, 12, '#ffffff', 'center', { sw: 3 });
    this.txt('1–4 / 点选项作答', 620, 448, 13, '#bfb3d6', 'center', { sw: 3, weight: 700 });
  };

  // ================= 触屏版（v1.9 手机）：点击区 ≥ 64 逻辑像素（≈44 CSS 像素）、字 ≥ 16 逻辑像素（≈11 CSS 像素），没有键盘提示 =================
  const RM_T = { cols: 6, cw: 128, ch: 92, gap: 8, x0: 76, y0: 108, rows: 3, get per() { return this.cols * this.rows; } };
  G.drawTalkT = function () {
    const cp = this.camp, m = cp.modal, o = this.talkOpts();
    panel(this, 12, 20, 936, 500);
    this.drawRougePortrait(60, 40, 144, (cp.shop.line && cp.shop.line.f) || 'smile', cp.shop.line);
    this.txt('胭脂', 132, 204, 18, '#ff8fa6', 'center', { sw: 4 });
    this.wrapLines(cp.shop.line ? cp.shop.line.t : '想要点什么服务呀？', 640, 16, 3).forEach((ln, k) => this.txt(ln, 250, 46 + k * 20, 16, '#ffe0e6', 'left', { sw: 3, weight: 700 }));
    o.forEach((it, i) => {
      const y = 112 + i * 70, x = 250, w = 650, h = 64, sel = (m.tsel || 0) === i;
      this.box(x, y, w, h, sel ? 'rgba(122,31,43,0.95)' : 'rgba(40,20,30,0.9)', sel ? '#ffd23c' : (it.ok ? '#a83246' : '#4a3040'), sel ? 3 : 2);
      this.campRects.push({ x, y, w, h, key: 'talk', i });
      this.txt(it.t, x + 14, y + h / 2, 17, it.ok ? '#ffffff' : '#8a7a8a', 'left', { sw: 3, maxW: 330 });
      if (it.price != null) this.drawPriceTag(x + w - 158, y + 10, 150, it.base, it.pct, cp.shop.disc, it.price, cp.gold < it.price);
      else if (it.key === 'purify' || it.key === 'remove') this.txt(it.key === 'purify' ? '身上没有霉运' : '身上没有道具', x + w - 14, y + h / 2, 16, '#8a7a8a', 'right', { sw: 3 });
      else if (it.note) this.txt(it.note, x + w - 14, y + h / 2, 16, it.ok ? '#ffb6c1' : '#8a7a8a', 'right', { sw: 3, weight: 700 });
    });
  };
  G.drawRemoveT = function () {
    const cp = this.camp, m = cp.modal, list = this.removeList(), bad = m.rkind === 'debuff', price = this.removeCost(m.rkind), L = RM_T, per = L.per;
    panel(this, 12, 20, 936, 500);
    this.txt(bad ? '净化霉运：选一件' : '拿掉一件道具（整件拿掉，不管等级）', 390, 48, 20, bad ? '#d8c8a8' : '#ffb6c1', 'center', { sw: 4, maxW: 660 });
    this.drawPriceTag(744, 28, 166, R.removeBase(m.rkind, bad ? cp.removeBad : cp.removeOther), bad ? cp.shop.pctBad : cp.shop.pctOther, cp.shop.disc, price, cp.gold < price);
    this.txt(`本局第 ${(bad ? cp.removeBad : cp.removeOther) + 1} 次${bad ? '净化' : '拿掉'}（每次基础价 +${bad ? 30 : 60}）`, 50, 88, 16, '#bfb3d6', 'left', { sw: 3, weight: 700 });
    const page = Math.floor((m.rsel || 0) / per), pages = Math.max(1, Math.ceil(list.length / per)), start = page * per;
    list.slice(start, start + per).forEach((it, j) => {
      const i = start + j, d = ITEM(it.id), x = L.x0 + (j % L.cols) * (L.cw + L.gap), y = L.y0 + Math.floor(j / L.cols) * (L.ch + L.gap), sel = (m.rsel || 0) === i;
      this.box(x, y, L.cw, L.ch, sel ? 'rgba(122,31,43,0.95)' : bad ? 'rgba(46,34,24,0.95)' : 'rgba(30,20,40,0.95)', sel ? '#ffd23c' : C.RARITY_COLOR[d.rarity], sel ? 3 : 2);
      this.campRects.push({ x, y, w: L.cw, h: L.ch, key: 'rm', i });
      this.drawItemIcon(it.id, it.lv, x + L.cw / 2 - 18, y + 5, 2);
      this.txt(d.name, x + L.cw / 2, y + 58, 16, C.RARITY_COLOR[d.rarity], 'center', { sw: 3, maxW: L.cw - 8 });
      if (!(d.kind === 'debuff' || d.noUpgrade)) this.txt(`Lv${it.lv}`, x + L.cw / 2, y + 78, 16, '#e9d7a6', 'center', { sw: 3, weight: 700 });
    });
    const sel = list[m.rsel || 0];
    if (sel) this.wrapLines(`${ITEM(sel.id).name}：${ITEM(sel.id).kind === 'debuff' ? ITEM(sel.id).desc() : this.itemDescAt(sel.id, Math.max(1, sel.lv))}`, 840, 16, 2).forEach((ln, k) => this.txt(ln, 480, 414 + k * 20, 16, '#e9d7a6', 'center', { sw: 3, weight: 700 }));
    const by = 448, bh = 64;
    this.box(50, by, 170, bh, 'rgba(20,14,40,0.92)', '#5d4f86', 2); this.campRects.push({ x: 50, y: by, w: 170, h: bh, key: 'rmback' }); this.txt('返回', 135, by + bh / 2, 18, '#e9d7a6', 'center', { sw: 3 });
    if (pages > 1) {
      const pb = (x, w, on, label, d) => { this.box(x, by, w, bh, on ? 'rgba(20,14,40,0.92)' : 'rgba(20,14,40,0.4)', on ? '#5d4f86' : '#2e2b3e', 2); this.txt(label, x + w / 2, by + bh / 2, 16, on ? '#e9d7a6' : '#5d5878', 'center', { sw: 3 }); if (on) this.campRects.push({ x, y: by, w, h: bh, key: 'rmpg', i: d }); };
      pb(560, 130, page > 0, '◀ 上一页', -1); this.txt(`${page + 1} / ${pages}`, 745, by + bh / 2, 16, '#bfb3d6', 'center', { sw: 3 }); pb(800, 120, page < pages - 1, '下一页 ▶', 1);
    }
  };
  G.drawHaggleT = function () {
    const cp = this.camp, m = cp.modal, h = m.hg; if (!h) return;
    const q = h.qs[h.i];
    panel(this, 12, 20, 936, 500);
    this.drawRougePortrait(50, 40, 96, (cp.shop.line && cp.shop.line.f) || 'brow', cp.shop.line);
    this.txt(`砍价 · 第 ${h.i + 1} / ${h.qs.length} 题`, 520, 50, 22, '#ffd23c', 'center', { sw: 4 });
    this.txt('不限时 · 全对随机打 9～7 折 · 答错不扣东西，但本次不能再砍', 530, 82, 16, '#e9d7a6', 'center', { sw: 3, weight: 700, maxW: 740 });
    for (let k = 0; k < h.qs.length; k++) { const done = k < h.i || (k === h.i && h.pick != null && h.ok); this.box(450 + k * 50, 100, 40, 12, done ? '#7dff9a' : k === h.i && h.pick != null ? '#ff6a6a' : '#3a2a4a', null); }
    this.txt(q.word, 520, 150, 40, '#ffffff', 'center', { font: C.FONT_TITLE, sw: 7, maxW: 640 });
    if (q.pos) this.txt(q.pos, 520, 184, 16, '#bfb3d6', 'center', { sw: 3 });
    const bw = 400, bh = 80;
    q.options.slice(0, 4).forEach((op, k) => {
      const x = 70 + (k % 2) * (bw + 20), y = 204 + Math.floor(k / 2) * (bh + 12), sel = h.pick == null && (h.sel || 0) === k;
      let col = sel ? '#ffd23c' : '#5d4f86', bg = 'rgba(24,16,44,0.95)';
      if (h.pick != null) { if (k === q.correct) { col = '#7dff9a'; bg = 'rgba(20,70,30,0.95)'; } else if (k === h.pick) { col = '#ff6a6a'; bg = 'rgba(80,20,24,0.95)'; } }
      this.box(x, y, bw, bh, bg, col, sel || h.pick != null ? 3 : 2);
      this.campRects.push({ x, y, w: bw, h: bh, key: 'hg', i: k });
      this.wrapLines(op, bw - 32, 17, 2).forEach((ln, j, arr) => this.txt(ln, x + 16, y + bh / 2 + (j - (arr.length - 1) / 2) * 22, 17, '#ffffff', 'left', { sw: 3, weight: 700 }));
    });
    this.box(50, 440, 280, 64, 'rgba(60,20,30,0.95)', '#ff9a9a', 2); this.campRects.push({ x: 50, y: 440, w: 280, h: 64, key: 'hgquit' });
    this.txt('放弃（算失败）', 190, 472, 18, '#ffffff', 'center', { sw: 3 });
  };
})();
