// v1.9 道具大改的「规则」：全部是纯函数（不碰画面 / 存档 / 游戏对象），随机数一律从参数 rng 传入（种子化，可重放）。
// 游戏里由 v19_*.js 调用；/workspace/wftest/item_rules_check.js 在 node 里直接加载本文件做自动检查。
(function () {
  const WF = (typeof window !== 'undefined' ? window : globalThis).WF;
  const R = WF.R19 = {};
  const CFG = () => WF.CFG, K = () => WF.CFG.CAMPAIGN;
  const ITEM = id => CFG().ITEMS.find(i => i.id === id);

  // ---------- 随机数 ----------
  // mulberry32：一局一个种子；派生子种子 = 种子 ^ 字符串哈希（翻牌第 n 盘、第 n 家店……互不干扰，读档 / 重放一致）
  R.rng = function (seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  R.hash = function (s) { let h = 2166136261 >>> 0; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  R.sub = (seed, tag) => R.rng((seed ^ R.hash(tag)) >>> 0);
  R.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  R.shuffle = (rng, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  R.int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

  // ---------- 牌的分类 ----------
  R.GOOD = 'IGH'; R.BAD = 'XD';
  R.cls = k => R.GOOD.includes(k) ? 'good' : R.BAD.includes(k) ? 'bad' : 'empty';
  R.pityDue = p => !!p && (p.bad >= K().FLIP.PITY.badRun || p.nogood >= K().FLIP.PITY.noGoodRun);
  // 翻到某张牌之后更新保底计数（计数用玩家实际翻到的那张）
  R.pityAfter = function (p, k) {
    const c = R.cls(k);
    if (c === 'good') return { bad: 0, nogood: 0 };
    if (c === 'bad') return { bad: p.bad + 1, nogood: p.nogood + 1 };
    return { bad: 0, nogood: p.nogood + 1 };   // 空牌：打断「连续坏牌」，但算「没翻到好的」
  };

  // ---------- 翻牌盘（§2.1–2.4） ----------
  // o = { rng, diff, tier:'elite'|'city', pity:{bad,nogood}, drawItem(rng, exclude)->id|null, debuffPool:[ids], eraserOK:bool, goldMul:number }
  // 返回 { cards:[{k,id?,gold?,pct?}], forced, comp }。整盘在出盘时就定好，玩家选哪张只是选下标。
  R.makeBoard = function (o) {
    const F = K().FLIP, rng = o.rng, diff = F.COMP[o.diff] ? o.diff : 'normal', T = F.TIER[o.tier] || F.TIER.elite;
    let letters = F.COMP[diff].split('');
    const forced = R.pityDue(o.pity);
    if (forced) {   // 保底：坏牌 / 空牌全部换成好牌，换成的类型按本构成里好牌的比例抽
      const goods = letters.filter(k => R.cls(k) === 'good');
      letters = letters.map(k => R.cls(k) === 'good' ? k : R.pick(rng, goods));
    }
    letters = R.shuffle(rng, letters);
    const usedI = [], usedD = [], dpool = (o.debuffPool || []).slice();
    const EP = F.ERASER_P, ep = typeof EP === 'number' ? EP : (EP[o.tier] || 0);
    let eraserDone = !o.eraserOK || !(rng() < ep);   // 每盘只判定一次
    const cards = letters.map(k => {
      if (k === 'I') {
        if (!eraserDone) { eraserDone = true; usedI.push('eraser'); return { k: 'I', id: 'eraser' }; }
        const id = o.drawItem ? o.drawItem(rng, usedI) : null;
        if (id) { usedI.push(id); return { k: 'I', id }; }
        k = 'G';   // 奖池不够：多出来的道具牌改成金币牌
      }
      if (k === 'D') {
        const left = dpool.filter(id => !usedD.includes(id));
        if (!left.length) return { k: 'E', was: 'D' };   // 霉运池抽空 → 空牌
        const id = R.pick(rng, left); usedD.push(id); return { k: 'D', id };
      }
      if (k === 'G') { const j = 1 + (rng() * 2 - 1) * F.GOLD_JITTER; return { k: 'G', gold: R.goldAmount(T.gold * j, o.diff, 0, o.goldMul == null ? 1 : o.goldMul) }; }
      if (k === 'H') return { k: 'H', pct: T.heal };
      if (k === 'X') return { k: 'X', pct: +(T.hurt * (F.HURT_MUL[o.diff] || 1)).toFixed(4) };
      return { k: 'E' };
    });
    return { cards, forced, comp: letters.join('') };
  };
  // 翻牌「掉血」不致死：最低保留 10% 血量
  R.hurtTo = function (hp, maxHp, pct) { const floor = Math.ceil(maxHp * K().FLIP.HURT_FLOOR); if (hp <= floor) return hp; return Math.max(floor, hp - Math.round(maxHp * pct)); };

  // 本局每次开摇后翻倍。机台金额单独按当前费用同比放大。
  R.lootPrice = spinCount => K().LOOT_MACHINE.PRICE * 2 ** spinCount;
  R.makeLootMachineBoard = function (rng, price) {
    const { PRICE, GOLD_PAYTABLE } = K().LOOT_MACHINE;
    return R.shuffle(rng, GOLD_PAYTABLE.map(([amount, weight]) => ({ k: 'G', gold: amount * (price / PRICE), weight })));
  };
  R.pickLootSlot = function (rng, board) {
    let roll = rng() * board.reduce((total, card) => total + card.weight, 0);
    for (const [index, card] of board.entries()) {
      roll -= card.weight;
      if (roll < 0) return index;
    }
    return board.length - 1;
  };

  // ---------- 金币（§2B） ----------
  // 金币收入统一入口：基础 × 难度 × 城市 × 道具（招财猫 ×(1+v)、破洞钱包 ×0.85 相乘），四舍五入，至少 1
  R.goldAmount = function (base, diff, ci, mul) {
    const G = K().GOLD, d = G.DIFF_MUL[diff] || 1, c = ci == null ? 1 : G.CITY_MUL(ci);
    const m = mul == null ? 1 : mul, v = base * d * c * m;
    return Math.max(1, m < 1 ? Math.floor(v + 1e-9) : Math.round(v));   // 破洞钱包（总倍率 < 1）向下取整，至少 1（§2B）
  };
  R.goldMul = function (luckyVal, hasWallet) { return (1 + (luckyVal || 0)) * (hasWallet ? ITEM('holey_wallet').goldMul : 1); };
  R.goldDrop = function (rng, kind, diff, ci, mul) { const [a, b] = K().GOLD.DROP[kind]; return R.goldAmount(R.int(rng, a, b), diff, ci, mul); };

  // ---------- 商店（§2C） ----------
  // 出现：北京（或路线第 1 站）不出且不计入保底；25%；连续 3 个休息点没出 → 下一个必出
  R.shopRoll = function (rng, cityId, ci, miss) {
    const S = K().SHOP;
    if (ci === 0 || S.NO_CITY.includes(cityId)) return { show: false, miss, counted: false };
    const show = miss >= S.PITY_MISS || rng() < S.P;
    return { show, miss: show ? 0 : miss + 1, counted: true, pity: show && miss >= S.PITY_MISS };
  };
  // 浮动档：−50%…+50%，5% 一档共 21 档等概率
  R.rollPct = function (rng) { const F = K().SHOP.FLOAT, n = Math.round((F.max - F.min) / F.step) + 1; return +(F.min + Math.floor(rng() * n) * F.step).toFixed(2); };
  R.round5 = v => { const r = K().SHOP.FLOAT.round; return Math.round(v / r + 1e-9) * r; };
  // 价格 = max(5, round5(标价 × (1 + pct) × (1 − 砍价折扣)))；折扣在浮动之后再乘（§2C.3、§2C.8）
  R.price = function (list, pct, disc) { const F = K().SHOP.FLOAT; return Math.max(F.minPrice, R.round5(list * (1 + (pct || 0)) * (1 - (disc || 0)))); };
  R.listPrice = function (id) { const d = ITEM(id); return K().SHOP.PRICE[d.rarity] || K().SHOP.PRICE.rare; };
  // 进货：o = { rng, pool:[{id, up}] 候选（已过滤）, weightOf(id)->number, n }。不放回、按权重；不足就有几件上几件
  R.stock = function (o) {
    const out = [], left = o.pool.slice(), n = o.n || K().SHOP.STOCK;
    while (out.length < n && left.length) {
      const ws = left.map(c => o.weightOf(c.id)), tot = ws.reduce((a, b) => a + b, 0); if (tot <= 0) break;
      let r = o.rng() * tot, i = 0; while (i < left.length - 1 && (r -= ws[i]) >= 0) i++;
      const c = left.splice(i, 1)[0], pct = R.rollPct(o.rng), list = R.listPrice(c.id);
      out.push({ id: c.id, up: c.up ? 1 : 0, list, pct, sold: false });
    }
    return out;
  };
  // 「拿掉」服务：基础价 = base + step × 已用次数（整局累计、两档分开）；pct 每次进店 roll 一次
  R.removeBase = function (kind, used) { const S = K().SHOP[kind === 'debuff' ? 'REMOVE_DEBUFF' : 'REMOVE_OTHER']; return S.base + S.step * (used || 0); };
  R.removePrice = function (kind, used, pct, disc) { return R.price(R.removeBase(kind, used), pct, disc); };
  R.refreshPrice = function (n) { const L = K().SHOP.REFRESH; return n < L.length ? L[n] : null; };   // 不浮动、不打折；最多 3 次
  R.upgradePrice = function (id) { return K().REST.UPGRADE_PRICE[ITEM(id).rarity] || K().REST.UPGRADE_PRICE.rare; };   // 休息点升级：标价、不浮动、不砍价

  // 商店与战利品共用的抽词顺序。一个拼写在同轮只出一次，保留入选记录的词库与义项。
  R.reviewWords = function (rng, wrong, fillSeen, fillAny, count) {
    const words = [], seen = new Set();
    function take(entries) {
      if (words.length === count) return;
      for (const e of R.shuffle(rng, entries || [])) {
        if (!e || e.kind === 'phrase' || !e.word || seen.has(e.word)) continue;
        words.push(e);
        seen.add(e.word);
        if (words.length === count) break;
      }
    }
    take(wrong);
    const fromBook = words.length;
    take(fillSeen);
    take(fillAny);
    const ok = words.length === count;
    return { words: ok ? words : [], fromBook, filled: ok ? count - fromBook : 0, ok };
  };
  R.haggleWords = (rng, wrong, seen, other) => R.reviewWords(rng, wrong, seen, other, K().SHOP.HAGGLE.N);
  R.haggleDisc = function (rng) { return R.pick(rng, K().SHOP.HAGGLE.DISC); };

  // ---------- 开局禁用（§5） ----------
  R.banUnlocked = function (life) { if (!life) return false; const cl = life.clears || {}; return Object.values(cl).some(n => n > 0) || Object.values(life.charClear || {}).some(n => n > 0) || Object.values(life.dclear || {}).some(n => n > 0); };
  R.banable = function (id) { const d = ITEM(id); return !!d && d.banable !== false && d.id !== 'eraser' && !d.special; };
  // 点选一个：返回连带禁用的那一件（只从非霉运、非橡皮擦、非隐藏未解锁、还没被禁的可见道具里抽）
  R.banExtra = function (rng, picked, extra, candidates) {
    const pool = candidates.filter(id => { const d = ITEM(id); return d && d.kind !== 'debuff' && d.id !== 'eraser' && !d.special && !picked.includes(id) && !extra.includes(id); });
    return pool.length ? R.pick(rng, pool) : null;
  };

  // ---------- 单件规则 ----------
  R.neuro = function (rng, bonusP, halfMul) { const dbl = rng() < 0.5 + (bonusP || 0); return { dbl, mul: dbl ? 2 : (halfMul || 0.5) }; };   // 固定 50%（赌徒套 2 件 +5 个百分点）
  R.sawCount = function (held) { return Math.min(K().ITEMS_V19.SAW_MAX, Math.ceil(held / 2)); };
  R.setCount = function (setId, ownedIds) { const S = CFG().ITEM_SETS[setId]; return S ? S.members.filter(id => ownedIds.includes(id)).length : 0; };
  // 道具栏排版（§3.1）：返回每件的 {x, y, sc, w}；1–10 件 32px 一行；11 件起 24px，13 件一行自动换行
  R.stripLayout = function (n) {
    const S = K().STRIP, t = S.TIERS.find(t => n <= t.upTo), out = [];
    const cell = Math.round(16 * t.sc + Math.max(2, t.sc) * 2), per = Math.max(1, Math.floor((S.X1 - S.X0 - cell) / t.dx) + 1);
    for (let i = 0; i < n; i++) out.push({ x: S.X0 + (i % per) * t.dx, y: S.Y0 + Math.floor(i / per) * t.dy, sc: t.sc, w: cell });
    const rows = Math.ceil(n / per);
    return { cells: out, per, rows, bottom: S.Y0 + (Math.max(1, rows) - 1) * t.dy + cell, dx: t.dx, dy: t.dy, sc: t.sc, cell };
  };
})();
