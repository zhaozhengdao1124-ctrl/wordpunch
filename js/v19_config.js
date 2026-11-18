// v1.9 道具大改（设计稿 standard/道具大改方案.md v4）：全部可调数值。紧跟 config.js 加载，后面的模块都从这里读。
// 改数值只改这里；规则判定在 v19_rules.js（纯函数，node 自检 /workspace/wftest/item_rules_check.js 直接加载）。
(function () {
  const C = WF.CFG, K = C.CAMPAIGN;
  const pct = v => Math.round(v * 100);
  // ---------- 掉落 / 翻牌 / 休息点 / 金币 / 商店 ----------
  K.DROP_NORMAL = 0.04;                       // v4：小怪掉道具 6% → 4%
  K.SLOTS = 10;                               // 只剩「道具栏第一行的宽度（格）」这一个排版含义；容量上限已取消（§1-2）
  K.FLIP = Object.assign(K.FLIP || {}, {
    GRID: 9,
    COMP: { easy: 'IIIIGGHHE', normal: 'IIIIGHHDE', hard: 'IIIIGHXDE', shura: 'IIIIGHXDE' },
    TIER: { elite: { gold: 55, heal: 0.20, hurt: 0.08 }, city: { gold: 110, heal: 0.30, hurt: 0.12 } },
    GOLD_JITTER: 0.2,
    HURT_MUL: { easy: 0.5, normal: 1, hard: 1.25, shura: 1.35 }, HURT_FLOOR: 0.10,
    PITY: { badRun: 2, noGoodRun: 3 },
    REVEAL: { own: 38, pause: 14, others: 20 },      // 自己那张（翻面 12 + 光框 26）→ 停顿 → 其余 8 张同时翻开
    ERASER_P: { elite: 0.03, city: 0.05 },            // 每盘一次判定：命中则 1 张道具牌换成神奇橡皮擦（沿用原 精英 3% / 对手 5%）
  });
  WF.FLIP19 = K.FLIP;   // v17_fx.js 会把 CAMPAIGN.FLIP 换成它自己的动画参数，v19_core.js 加载时再合并回来
  K.REST = { HEAL: 0.35, UPGRADE_PRICE: { common: 70, rare: 140, legend: 280, curse: 105 }, UPGRADE_FLOAT: false };
  K.GOLD = {
    DROP: { minion: [1, 3], elite: [15, 25], opponent: [40, 70], final: [100, 140] },
    DIFF_MUL: { easy: 1.25, normal: 1, hard: 0.85, shura: 0.75 },   // v1.10.1：修罗 0.7 → 0.75
    CITY_MUL: i => 1 + 0.1 * i,
  };
  K.SHOP = {
    P: 0.25, PITY_MISS: 3, STOCK: 5, NO_CITY: ['beijing'],
    PRICE: { common: 70, rare: 140, legend: 280, curse: 105 },
    REFRESH: [40, 80, 120],
    FLOAT: { min: -0.50, max: 0.50, step: 0.05, round: 5, minPrice: 5 },
    REMOVE_DEBUFF: { base: 60, step: 30 },
    REMOVE_OTHER: { base: 100, step: 60 },
    HAGGLE: { N: 3, DISC: [0.10, 0.15, 0.20, 0.25, 0.30], TIMED: false, FILL_FROM_BANK: true },
    CHAT_MAX: 3,
  };
  K.DEBUFF = { CAP: Infinity };
  K.ITEMS_V19 = { BAN_MAX: 2, BAN_EXTRA: 1, SAW_MAX: 5, PAUSE_PER_PAGE: 8, HIDDEN_WEIGHT: 0.5, MULT_CAP: 3 };
  K.STRIP = { X0: 80, X1: 440, Y0: 74, TIERS: [{ upTo: 10, sc: 2, dx: 36, dy: 38 }, { upTo: Infinity, sc: 1.5, dx: 28, dy: 30 }] };   // §3.1：1–10 件 32px 一行；11 件起 24px（含边框 28px，一行 12 件）自动换行，永不折叠

  C.RARITY_COLOR.debuff = '#a08a68'; C.RARITY_NAME.debuff = '霉运';

  // ---------- 霉运道具（9 件，§2A.1）----------
  const DEBUFF = [
    { id: 'rusty_clock', name: '生锈的闹钟', timeout: -2, desc: () => '每题超时上限 −2 秒' },
    { id: 'sleepy_pillow', name: '瞌睡枕头', fastWin: -1, desc: () => '速答窗 −1 秒（不低于 3 秒）' },
    { id: 'foggy_glasses', name: '起雾的眼镜', everyQ: 4, desc: () => '每 4 题有 1 题看不到例句' },
    { id: 'leaky_pen', name: '漏墨的钢笔', everyQ: 5, minLen: 5, desc: () => '每 5 题有 1 题单词缺 1 个字母' },
    { id: 'wobbly_desk', name: '摇晃的课桌', everyQ: 6, shuffleAt: 3.0, warn: 0.4, desc: () => '每 6 题有 1 题：3 秒后选项换一次位置' },
    { id: 'old_exam', name: '皱巴巴的旧卷子', everyQ: 8, desc: () => '每 8 题有 1 题换成错题本里的词' },
    { id: 'holey_wallet', name: '破洞钱包', goldMul: 0.85, desc: () => '所有金币收入 −15%' },
    { id: 'heavy_bag', name: '沉甸甸的书包', dmgDealt: 0.95, desc: () => '你造成的伤害 −5%' },
    { id: 'glass_heart', name: '玻璃心', dmgTaken: 1.08, desc: () => '受到的伤害 +8%' },
  ];
  C.DEBUFF_IDS = DEBUFF.map(d => d.id);
  for (const d of DEBUFF) C.ITEMS.push(Object.assign({ rarity: 'debuff', kind: 'debuff', lv: [0], noUpgrade: true, banable: true, shop: false }, d));

  // ---------- 新道具（可见 15 件，§7.2）----------
  const NEW = [
    { id: 'neuro_blade', name: '神经刀', rarity: 'curse', lv: [0.5], noUpgrade: true, set: 'gambler', desc: () => '普通 / 连击 / 慢答命中：50% 伤害 ×2，50% 伤害 ×0.5' },
    { id: 'highlighter', name: '荧光笔', rarity: 'common', lv: [6, 9, 12], set: 'scholar', desc: v => `速答窗内答对，额外 +${v} 伤害` },
    { id: 'scratch_paper', name: '草稿纸', rarity: 'common', lv: [1, 2, 3], desc: v => `每城 ${v} 次：答错后下一题自动排除 1 个错误选项` },
    { id: 'jacket', name: '校服外套', rarity: 'common', lv: [30, 50, 80], set: 'pe', desc: v => `每城开场获得 ${v} 点护盾（先扣护盾）` },
    { id: 'gum', name: '口香糖', rarity: 'common', lv: [1.0, 1.5, 2.0], desc: v => `答错后下一题速答窗 +${v} 秒` },
    { id: 'milktea', name: '奶茶', rarity: 'common', lv: [20, 35, 50], set: 'snack', desc: v => `每进一座新城，最大血量 +${v} 并回同量` },
    { id: 'spicy', name: '辣条', rarity: 'common', lv: [0.10, 0.15, 0.20], set: 'snack', desc: v => `打倒小怪后，下一次答对伤害 +${pct(v)}%` },
    { id: 'magnet', name: '磁铁', rarity: 'common', lv: [0.04, 0.07, 0.10], desc: v => `小怪掉道具率 +${pct(v)} 个百分点` },
    { id: 'lucky_cat', name: '招财猫', rarity: 'common', lv: [0.15, 0.20, 0.25], desc: v => `所有金币收入 +${pct(v)}%` },
    { id: 'magnifier', name: '放大镜', rarity: 'rare', lv: [0.5, 0.8, 1.2], desc: v => `精英 / 城市对手战中，速答窗 +${v} 秒` },
    { id: 'whistle', name: '哨子', rarity: 'rare', lv: [1, 2, 3], desc: v => `每城 ${v} 次：超时不挨打` },
    { id: 'twins', name: '双胞胎', rarity: 'rare', lv: [0.12, 0.18, 0.25], desc: v => `答对时 ${pct(v)}% 概率再打一下（伤害 50%）` },
    { id: 'swiss_knife', name: '瑞士军刀', rarity: 'rare', lv: [1, 1.3, 1.6], desc: v => `每答对 10 题随机一项：回 ${Math.round(30 * v)} 血 / 护盾 ${Math.round(40 * v)} / 下一击 ×${(1.5 * v).toFixed(1).replace(/\.0$/, '')}` },
    { id: 'dice', name: '骰子', rarity: 'curse', lv: [1, 2, 3], set: 'gambler', desc: (v, l) => `每城开场掷骰：1 点受伤 +20%${l === 2 ? '（1 点重掷一次）' : l === 3 ? '（1 点当 2 点）' : ''}；4–5 点速答窗 +0.5 秒；6 点伤害 +30%` },
    { id: 'alarm', name: '闹钟', rarity: 'curse', lv: [0.15, 0.22, 0.30], desc: v => `超时上限 −6 秒；速答窗内答对伤害 +${pct(v)}%` },
  ];
  // ---------- 隐藏道具（8 件，§7.3；条件只在代码里）----------
  const HIDDEN = [
    { id: 'broken_saw', name: '断掉的电锯', rarity: 'curse', lv: [1, 2, 3], hidden: { flag: 'sawSurvive' }, desc: v => `被锯掉的道具少失效 ${v} 题；但米雷霸的伤害 +10%` },
    { id: 'remote', name: '失灵的遥控器', rarity: 'rare', lv: [0.15, 0.25, 0.35], hidden: { flag: 'rocketBlock' }, desc: v => `Boss 必杀对你的伤害 −${pct(v)}%` },
    { id: 'passport', name: '环球护照', rarity: 'rare', lv: [0.1, 0.15, 0.2], hidden: { charClear: 3 }, desc: v => `每进新城，速答窗永久 +${v} 秒（本局最多 +0.6）` },
    { id: 'teddy', name: '小熊枕头', rarity: 'rare', lv: [1, 2, 3], hidden: { flag: 'owl' }, desc: v => `血量首次低于 30%：接下来 ${v} 题敌人打不到你（一局一次）` },
    { id: 'full_score', name: '满分卷', rarity: 'legend', lv: [1, 2, 3], hidden: { flag: 'acc100' }, desc: v => `每城 ${v} 次：连击 ≥10 时答错不断连击` },
    { id: 'golden_pencil', name: '金色铅笔', rarity: 'legend', lv: [0.01, 0.015, 0.02], hidden: { correct: 3000 }, desc: v => `本局每答对 100 题伤害永久 +${(v * 100).toFixed(1).replace(/\.0$/, '')}%（最多 +20%）` },
    { id: 'last_second', name: '最后一秒', rarity: 'curse', lv: [2, 2.5, 3], hidden: { flag: 'buzzer' }, desc: v => `倒计时最后 1 秒内答对伤害 ×${v}；速答窗 −0.3 秒` },
    { id: 'centurion', name: '百连奖状', rarity: 'legend', lv: [0.65, 0.80, 1.00], hidden: { maxCombo: 100 }, desc: v => `连击加成上限 +50% → +${pct(v)}%` },
  ];
  for (const d of NEW.concat(HIDDEN)) C.ITEMS.push(Object.assign({ isNew: true }, d));
  // 旧道具的套装归属（§8）
  const OLD_SET = { glasses: 'scholar', root_sheet: 'scholar', wristguard: 'pe', helmet: 'pe', wraps: 'boxer', big_gloves: 'boxer', champ_belt: 'boxer', coffee: 'exam', final_bell: 'exam', retake: 'exam', blindbox: 'gambler', last_candy: 'snack' };
  for (const d of C.ITEMS) { if (OLD_SET[d.id]) d.set = OLD_SET[d.id]; if (d.id === 'eraser') d.banable = false; if (d.rarity === 'curse') d.edge = true; }

  C.ITEM_SETS = {
    scholar: { name: '学霸书包', color: '#8fd0ff', members: ['glasses', 'root_sheet', 'highlighter'], b2: '速答窗 +0.3 秒', b3: '答对生词本里的词回 5 血，速答伤害 +10%' },
    pe: { name: '体育课', color: '#7dff9a', members: ['wristguard', 'helmet', 'jacket'], b2: '受伤 −5%', b3: '每城开场再 +40 护盾；头盔挡住后下一击 +20%' },
    boxer: { name: '拳击手', color: '#ff8a5a', members: ['wraps', 'big_gloves', 'champ_belt'], b2: '连击伤害 +5%，角力伤害 +20', b3: '必杀伤害 +15%，角力获胜回 30 血' },
    exam: { name: '考试周', color: '#ffd23c', members: ['coffee', 'final_bell', 'retake'], b2: '暴击率 +3%', b3: '每城前 3 题伤害 +30%；双刃剑坏处 ×0.8' },
    gambler: { name: '赌徒', color: '#ff5a8a', members: ['neuro_blade', 'dice', 'blindbox'], b2: '随机里有利的概率 +5 个百分点', b3: '骰子最低算 2 点；神经刀半伤改成 ×0.75' },
    snack: { name: '零食柜', color: '#ffb6d5', members: ['milktea', 'spicy', 'last_candy'], b2: '休息点回血 +10 个百分点', b3: '每进新城再回 5% 最大血量；辣条可叠 2 次' },
  };
  // 美术占位：Codex 的图到了以后，把文件放进 assets/campaign/<路径>，再把 id 加进 data/art_manifest.js 对应数组即可（不改代码）
})();
