// 单词格斗 试玩版 —— 全部可调数值都在这里
window.WF = window.WF || {};
WF.CFG = {
  // 画面：世界按原生像素画在 192×108 的小画布上，再 ×5 放大到 960×540（最近邻）
  SCALE: 5, VIEW_W: 192, VIEW_H: 108, SCREEN_W: 960, SCREEN_H: 540,
  STAGE_W: 320,            // 擂台总宽（原生像素），镜头跟随两人中点
  GROUND_Y: 76,            // 地面线（原生像素，脚底原点落在这里）
  WALL_MARGIN: 14,         // 人物脚底离擂台边最小距离
  GAP: 28,                 // 两人脚底间距（贴身站位；=角力规范 14+14，进角力无缝）
  FPS: 30,

  // 血量与伤害
  HP: 800,
  COMBO_DMG: [50, 60, 70, 80],   // 速答连击第 1~4 下
  SLOW_DMG: 50,                  // 5~10 秒答对：普通一击，连击清零
  ULT_DMG: 250,                  // 第 5 次连续速答：必杀总伤害（分摊到每一段）
  ULT_FINAL_SHARE: 0.32,         // 必杀最后一击占总伤害比例
  CLASH_DMG: 120,                // 角力输家
  CRIT_CHANCE: 0.15, CRIT_MULT: 1.5,
  GUTS_RATIO: 0.10,              // 血量 ≤10%：受伤 ×0.8
  GUTS_MULT: 0.8,                // 并且 >10% 时单下打不死，最多剩 1 血

  // 答题时间（秒）
  FAST_S: 5, SLOW_S: 10, Q_TIMEOUT_S: 20,
  // v1.2.1 出题时的对峙 / 虚晃（纯表现，零伤害；只改画面位移和覆盖动作，不影响血量和计时）
  STANDOFF: {
    on: true, campaign: true, cpu: true, versus: true, // 各模式开关
    START_T: 10,            // 题目出来多少帧后才开始晃
    BEAT_S: [0.6, 1.2],     // 每一小段（逼近 / 试探 / 空挥 / 对拳 / 架拳 / 碎步）随机时长
    WEIGHTS: { shuffle: 0.7, press: 1.1, probe: 1.0, whiff: 0.8, trade: 0.45, guard: 0.6 },
    HEAT_S: 10,             // 答题拖到这么多秒时敌方最躁
    HEAT_AGGR: 0.35,        // 拖得越久，敌方当主动方 / 试探的加成（双人模式两边对等）
    MAX_DX: 6,              // 画面位移上限（像素，原生 192 宽）
    MAX_CLOSE: 4, MAX_OPEN: 8, // 相对正常间距最多贴近 / 拉开
    STEP_SPEED: 0.6,        // 碎步速度（像素/帧）
    RETURN_K: 0.35,         // 真出招时位移每帧剩下的比例（约 3 帧收回）
  },
  // v1.2.1 答对后的出招分档（只换动作，伤害照旧）：速答=短连段，普通=重拳，慢答=轻拳被架
  // versus=false：双人 / 电脑陪练保持 v1.2 的出招（换动作会改变出招时长，进而让血量轨迹和 v1.2 不再逐帧一致）
  HIT_TIERS: { campaign: true, versus: false, chainLead: ['combo_a', 'combo_b', 'combo_c'], chainN: [1, 2, 2, 2], normal: 'heavy_punch', slow: 'combo_a', leadSpeed: 2.2 },
  CLASH_WINDOW_S: 0.3, CLASH_WIN_COUNT: 3, CLASH_CAP_S: 15,
  NEXT_Q_DELAY: 12,              // 动作结束后多少 tick 出下一题（命中后）
  REVEAL_MIN: 30,                // 命中/揭晓后至少亮多少 tick
  REVEAL_WRONG: 28,              // 答错揭晓正确答案后到下一题（约 0.93 秒）

  // 题型
  MIX_MATH_RATIO: 0.5,           // 混合模式中数学题占比
  ROUND_TIMES: [0, 60, 90, 120, 180],  // 回合时限（秒），0 为不限时
  QMODES: [
    { id: 'word', name: '单词' },
    { id: 'math', name: '数学' },
    { id: 'mix',  name: '混合' },
  ],

  // 打击感
  HITSTOP: { light: 4, mid: 5, heavy: 7, crit: 10, ult: 4, ultFinal: 18, block: 3, clash: 8, clashWin: 12, ko: 26 },
  SHAKE:   { light: 5, mid: 7, heavy: 11, crit: 18, ult: 10, ultFinal: 34, block: 3, clash: 14, clashWin: 22, ko: 30, ultRumble: 4 },
  KNOCK:   { light: 4, mid: 5, heavy: 9, crit: 13, ult: 2, ultFinal: 34, block: 3, clashLose: 30, ko: 38 },

  // 按键
  KEYS_P1: { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 },
  KEYS_P2: { Digit7: 0, Digit8: 1, Digit9: 2, Digit0: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 },

  // 角色出招表
  MOVES: {
    suling: { name: '苏绫', combo: [['combo_a', 'light_kick'], ['combo_b', 'dash_punch', 'light_kick'], ['combo_c', 'uppercut', 'heavy_kick'], ['heavy_punch', 'heavy_kick', 'uppercut']], slow: ['light_kick', 'combo_b', 'heavy_kick'], late: 'combo_a',
              ult: ['hyper_combo', 'mega_charge_b'], ultName: '千铃落花', color: '#2fd6c3', intro: 'intro', blurb: '拳脚兼修，腿法凌厉' },
    mrj:    { name: 'Mr.J', combo: [['combo_a', 'dash_punch'], ['combo_b', 'dash_punch'], ['combo_c', 'uppercut'], ['heavy_punch', 'uppercut']], slow: ['combo_c', 'combo_b', 'uppercut'], late: 'combo_a',
              ult: ['hyper_combo', 'mega_charge_b'], ultName: '怒涛破天拳', color: '#ff8a3d', intro: null, blurb: '拳击手，只用拳头说话' },
    // v1.2 闯关：北京小怪 + 城市对手（小怪只有 10 个动作，不放必杀、不角力）
    bj_hunhun:     { name: '胡同混混', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#c8553d', intro: null, minion: true },
    bj_xuetu:      { name: '练功学徒', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#d94a3a', intro: null, minion: true },
    bj_dashixiong: { name: '武馆大师兄', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#e3b34a', intro: null, minion: true, elite: true },
    chenbanshan:   { name: '陈半山', combo: [['combo_a', 'dash_punch'], ['combo_b', 'light_kick'], ['combo_c', 'uppercut'], ['heavy_punch', 'heavy_kick']], slow: ['combo_b', 'combo_c', 'uppercut'], late: 'combo_a',
                     ult: ['hyper_combo', 'mega_charge_b'], ultName: '浑圆桩', color: '#c99e5b', intro: 'intro',
                     title: null, city: '北京', catchphrase: null, blurb: '北京武馆的白须老拳师' },
    // v1.3 首尔 / 东京 / 华盛顿 小怪（10 个动作；女身 50 格、脚底 24,40；壮硕 64 格）
    sl_dancer:     { name: '街头舞者', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#5aa0ff', intro: null, minion: true },
    sl_yellowbelt: { name: '跆拳道黄带', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#ffd04a', intro: null, minion: true },
    sl_bouncer:    { name: '夜店保镖', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#b36bff', intro: null, minion: true, elite: true },
    ty_badboy:     { name: '不良少年', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#ff6a8a', intro: null, minion: true },
    ty_kendo:      { name: '剑道部女生', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#8fb6ff', intro: null, minion: true },
    ty_sumo:       { name: '相扑力士', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#e3b34a', intro: null, minion: true, elite: true },
    dc_suit:       { name: '西装保镖', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#9aa4b8', intro: null, minion: true },
    // 记者：不打人。combo_a = 举话筒，heavy_punch = 拍照；答对 3 个把她挤开，答错被闪光晃一下（下一题速答窗 -1 秒）
    dc_reporter:   { name: '记者', combo: [['combo_a'], ['combo_a'], ['combo_a'], ['combo_a']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#e9d7a6', intro: null, minion: true,
                     reporter: { toClear: 3, fastCut: 1 } },
    dc_captain:    { name: '特勤队长', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#5a7bd5', intro: null, minion: true, elite: true },
    // 城市对手（苏绫女身）
    handawei:      { name: '韩多蔚', combo: [['combo_a', 'light_kick'], ['combo_b', 'light_kick'], ['combo_c', 'heavy_kick'], ['heavy_kick', 'uppercut']], slow: ['light_kick', 'combo_b', 'heavy_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '旋风横踢', color: '#ff5aa8', intro: 'intro', title: null, city: '首尔', catchphrase: null, blurb: '首尔的跆拳道高手' },
    yukino:        { name: '雪乃', combo: [['combo_a', 'light_kick'], ['combo_b', 'dash_punch'], ['combo_c', 'heavy_kick'], ['heavy_kick', 'uppercut']], slow: ['light_kick', 'combo_b', 'heavy_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '樱岚连踢', color: '#8fb6ff', intro: 'intro', title: null, city: '东京', catchphrase: null, blurb: '东京的踢技少女' },
    // 金霸霸：最终 Boss（壮硕身 64 格；金权冲击 = mega_charge_a 蓄势 + mega_charge_b 连击，第 008 帧出金色冲击环）
    jinbawang:     { name: '金霸霸', combo: [['combo_a', 'dash_punch'], ['combo_b', 'combo_c'], ['heavy_punch', 'uppercut'], ['heavy_kick', 'uppercut']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '金权冲击', intro: 'intro',
                     title: '最终 Boss', city: '华盛顿', color: '#ffd23c', catchphrase: "YOU'RE FIRED!", catchColor: '#ffd23c', boss: true, finalBoss: true, blurb: '华盛顿的金权拳霸' },
    // v1.7 布宜诺斯艾利斯小怪 / 火箭基地小怪
    ar_gaucho:     { name: '牧场少年', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#6ec6e8', intro: null, minion: true },
    ar_tango:      { name: '探戈舞女', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#e85a6a', intro: null, minion: true },
    ar_ranchero:   { name: '牧场壮汉', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#c98a4a', intro: null, minion: true, elite: true },
    rb_engineer:   { name: '发射场工程师', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#ff8a2a', intro: null, minion: true },
    rb_intern:     { name: '实习生', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#9ad0ff', intro: null, minion: true },
    rb_security:   { name: '基地安保', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#7a8296', intro: null, minion: true, elite: true },
    // v1.7 城市 Boss：米雷霸（Mr.J 男身 + 电锯，64 格）/ 马西克（壮硕身 + 喷火枪）；最终 Boss 仍是华盛顿的金霸霸。grab_and_beatdown = 投技
    mileiba:       { name: '米雷霸', combo: [['combo_a', 'dash_punch'], ['combo_b', 'light_kick'], ['combo_c', 'heavy_kick'], ['heavy_punch', 'grab_and_beatdown', 'uppercut']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['saw_strip'], ultPose: 'saw_strip', ultName: '全面削减', ultKind: 'saw', intro: 'intro', idleAlt: true,
                     title: '布宜诺斯艾利斯 Boss', city: '布宜诺斯艾利斯', color: '#e6962a', catchphrase: '¡AFUERA!', catchColor: '#ffd23c', blurb: '电锯狂人，专砍你的道具' },
    maxike:        { name: '马西克', combo: [['combo_a', 'dash_punch'], ['combo_b', 'combo_c'], ['heavy_punch', 'uppercut'], ['heavy_kick', 'grab_and_beatdown']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '星舰升空', ultKind: 'rocket', intro: 'intro', idleAlt: true, burns: true,
                     title: '火箭基地 Boss', city: '火箭基地', color: '#c8ccd6', catchphrase: null, blurb: '火箭基地的喷火狂人' },
    // v1.7.2 挑战模式城市池三城（不进剧情路线、不进选角）：埃及·法老王 / 河南·玄铁 / 佛山·黄师傅，各带 2 普通 + 1 精英小怪
    eg_mummy:      { name: '木乃伊', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#d8c79a', intro: null, minion: true },
    eg_guard:      { name: '持矛卫兵', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#e0b04a', intro: null, minion: true },
    eg_priest:     { name: '豺狼面具祭司', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#5a6a8a', intro: null, minion: true, elite: true },
    sl_sweeper:    { name: '扫地僧徒', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#c9a24a', intro: null, minion: true },
    sl_staffmonk:  { name: '棍僧', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#e0a83a', intro: null, minion: true },
    sl_bronze:     { name: '铜人', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#5aa08a', intro: null, minion: true, elite: true },
    fs_lion:       { name: '醒狮队员', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#ff9a3a', intro: null, minion: true },
    fs_coolie:     { name: '码头苦力', combo: [['combo_a'], ['combo_a', 'heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['combo_a'], late: 'combo_a', ult: null, color: '#d88a4a', intro: null, minion: true },
    fs_thug:       { name: '洋行打手', combo: [['combo_a'], ['heavy_punch'], ['heavy_punch'], ['heavy_punch']], slow: ['heavy_punch'], late: 'combo_a', ult: null, color: '#8a7a6a', intro: null, minion: true, elite: true },
    // 法老王：远程施法、本体脆；heavy_kick 槽 = 沙暴（命中帧 cover_options：下一题选项被沙子盖住）
    falaowang:     { name: '法老王', combo: [['combo_a', 'light_kick'], ['heavy_kick', 'combo_b'], ['heavy_kick', 'combo_c', 'uppercut'], ['heavy_kick', 'grab_and_beatdown', 'heavy_punch']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '太阳神之怒', intro: 'intro', idleAlt: true, newCity: 'pharaoh',
                     title: '埃及 Boss', city: '埃及·金字塔', color: '#f0c040', catchphrase: null, blurb: '飘在半空的法老，会召木乃伊、扬沙暴' },
    // 玄铁：超远程齐眉棍、起收都慢、有霸体（金钟罩）
    xuantie:       { name: '玄铁', combo: [['combo_a', 'light_kick'], ['combo_b', 'dash_punch'], ['combo_c', 'heavy_punch'], ['heavy_kick', 'grab_and_beatdown', 'uppercut']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '金钟罩·千佛手', intro: 'intro', idleAlt: true, newCity: 'xuantie',
                     title: '少林寺 Boss', city: '河南·少林寺', color: '#e8b04a', catchphrase: null, blurb: '少林武僧，齐眉棍一扫半屏，金钟罩护身' },
    // 黄师傅：最近最快，碎步 + 闪避（慢答会被他闪开）
    huangshifu:    { name: '黄师傅', combo: [['combo_a', 'light_kick'], ['combo_b', 'dash_punch'], ['combo_c', 'heavy_kick'], ['heavy_punch', 'grab_and_beatdown', 'uppercut']], slow: ['combo_b', 'heavy_punch', 'light_kick'], late: 'combo_a',
                     ult: ['mega_charge_a', 'mega_charge_b'], ultName: '佛山无影脚', intro: 'intro', idleAlt: true, newCity: 'huang',
                     title: '佛山 Boss', city: '佛山·宝芝林', color: '#7ad0a0', catchphrase: null, blurb: '长衫雨伞的医馆师傅，慢答会被他闪开' },
  },
  P1_CHAR: 'suling', P2_CHAR: 'mrj',   // 双人对战的默认角色（v1.4 起可在选角界面换）

  // ================= v1.4 可选角色 + 解锁 =================
  // 选角界面从左到右的顺序。金霸霸、小怪永远不能选。
  ROSTER: ['suling', 'mrj', 'chenbanshan', 'handawei', 'yukino', 'mileiba', 'maxike'],
  // 解锁条件（按玩家存档分别记）：start = 一开始就有；clear = 闯关全部通关过一次；
  // flawless = 单局打通四城且正确率 ≥ acc；master = banks 里任一词库每个词都「连续答对 streak 次」过
  UNLOCK: {
    suling: { start: true },
    mrj: { start: true },
    chenbanshan: { type: 'clear', hint: '闯关打通全部六城（打败金霸霸）', card: ['闯关打通全部六城', '（打败金霸霸）'] },
    handawei: { type: 'flawless', acc: 0.9, hint: '一局打通六城，且正确率 90% 以上', card: ['一局打通六城', '正确率 90% 以上'] },
    // v1.7：打败过一次就能选（玩家版必杀效果反过来作用在对手身上）
    mileiba: { type: 'beat', boss: 'mileiba', hint: '闯关打败布宜诺斯艾利斯的米雷霸', card: ['闯关打败', '布宜诺斯艾利斯', '的米雷霸'] },
    maxike: { type: 'beat', boss: 'maxike', hint: '闯关打败火箭基地的马西克', card: ['闯关打败', '火箭基地', '的马西克'] },
    yukino: { type: 'master', banks: ['senior', 'cet4', 'cet6', 'gre'], streak: 3, hint: '完整掌握高中 / 四级 / 六级 / GRE 任一词库：每个词都连续答对 3 次', card: ['掌握高中及以上', '任一词库', '（每词连对 3 次）'] },
  },
  // 闯关积分：每局（死了也算）按打到哪、正确率、最高连击结算，累计在玩家存档里。
  // 现在还没有角色用积分解锁；futureUnlockCost 留给以后新增的角色（预计十几局攒够一个）。
  // v1.6：每城 20 只小怪依次上场，单只敌人分仍是 2；评价改到半程休息和街尾，每段没掉血「完美！」+8。
  // combo 仍按「速答连击」（必杀进度）计，避免整局连对把积分拉爆。
  POINTS: {
    city: 100,        // 每打通一城
    enemy: 2,         // 每打倒一个敌人（20 只小怪 + 城市对手）
    accMax: 60,       // 正确率满分（正确率 × 60；本局答题少于 accFullAt 题时按比例打折，防止答 1 题拿满分）
    accFullAt: 20,
    combo: 8,         // 最高速答连击 × 8
    fullClear: 100,   // 全部通关额外奖励
    segPerfect: 8,    // 一段（休息前 / 街尾）没掉血「完美！」
    wavePerfect: 8,   // 兼容旧存档字段名
    futureUnlockCost: 1500,
  },
  // v1.5 打击爽感（连击加成、速答必暴击、小怪击飞、清场评价）
  FEEL: {
    COMBO_STEP: 0.05,     // 每多连对 1 题，伤害 +5%（第 1 题不加）
    COMBO_CAP: 0.50,      // 最多 +50%
    FAST_CRIT: true,      // 速答窗口内答对必暴击
    FLY_VX: 5.4, FLY_VY: 3.6, FLY_G: 0.38,
    WAVE_TEXT: 40,        // 段落评价字停留（约 1.3 秒），叠在休息或跑向街尾上
  },
  // v1.4 出题：例句固定用最常见的义项（第一个义项）；它没有能用的例句才换别的义项，都没有就只显示单词 + 词性
  QUIZ: { firstSense: true },

  // 电脑对手（单人练习）
  CPU: { accuracy: 0.72, delayMin: 1.6, delayMax: 9.0, clashDelayMin: 1.2, clashDelayMax: 4.5 },

  // ================= v1.2 单人闯关（肉鸽）——数值以《肉鸽闯关玩法设计 v0.4》为准 =================
  CAMPAIGN: {
    // v1.3 航线：北京 → 首尔 → 东京 → 华盛顿（按地图上的地理位置；设计稿 v0.4 写的是 北京→东京→首尔）
    // v1.7：六城，剧情模式 北京→首尔→东京→布宜诺斯艾利斯（米雷霸）→火箭基地（马西克，城市 Boss）→华盛顿（金霸霸，最终 Boss）
    ROUTE: ['beijing', 'seoul', 'tokyo', 'buenosaires', 'rocketbase', 'washington'],
    OPEN: ['beijing', 'seoul', 'tokyo', 'buenosaires', 'rocketbase', 'washington'],
    CITY_NAMES: { beijing: '北京', tokyo: '东京', seoul: '首尔', washington: '华盛顿', buenosaires: '布宜诺斯艾利斯', rocketbase: '火箭基地', pyramid: '金字塔', shaolin: '少林寺', foshan: '佛山' },
    // v1.7.2 挑战模式的随机城市池：剧情路线前 5 城 + 这三城，每局抽 5 城打乱，最后一站固定华盛顿（金霸霸）。剧情路线不变
    POOL: ['pyramid', 'shaolin', 'foshan'],
    PLAYER_HP: 800,
    CITY_HEAL: 0.30,                 // 每过一个城市（飞往下一城时）回复 30%
    CITY_MULT: 1.1,                  // 每往后一城，小怪血量和伤害 ×1.1
    Q_TIMEOUT_S: 20,                 // 小怪战超时 = 被反击
    // 北京：20 只小怪沿街依次上场（血量减半，一题大约一只）+ 城市对手
    CITIES: {
      beijing: {
        stage: 'beijing', normals: ['bj_hunhun', 'bj_xuetu'], elite: 'bj_dashixiong', opponent: 'chenbanshan',
        opponentHp: 800, cine: 'city',
      },
      // stage：incoming/stages/<city>/ 的 5 层 PNG（四城都已到位）；tint 只在 PNG 缺失时给程序擂台染色兜底
      // ai：城市对手答题（accuracy 正确率，delay 作答秒数区间）；不写则用 CPU 默认
      seoul: {
        stage: 'seoul', normals: ['sl_dancer', 'sl_yellowbelt'], elite: 'sl_bouncer', opponent: 'handawei',
        opponentHp: 950, cine: 'city', tint: { c: '#6a3cff', a: 0.26 }, ai: { accuracy: 0.76, delay: [1.5, 8.0] },
      },
      tokyo: {
        stage: 'tokyo', normals: ['ty_badboy', 'ty_kendo'], elite: 'ty_sumo', opponent: 'yukino',
        opponentHp: 1100, cine: 'city', tint: { c: '#ff5a8a', a: 0.22 }, ai: { accuracy: 0.8, delay: [1.4, 7.0] },
      },
      // 金霸霸：v1.7 回到最终 Boss（第 6 站）。每站难度曲线不变：第 4 站 1800/0.88、第 5 站 1950/0.89、第 6 站 2100/0.90
      washington: {
        stage: 'washington', normals: ['dc_suit', 'dc_reporter'], elite: 'dc_captain', opponent: 'jinbawang',
        opponentHp: 2100, cine: 'boss', final: true, tint: { c: '#d9a63a', a: 0.2 }, ai: { accuracy: 0.9, delay: [1.1, 4.6] },
      },
      // v1.7 新城：第 4、5 站
      buenosaires: {
        stage: 'buenosaires', normals: ['ar_gaucho', 'ar_tango'], elite: 'ar_ranchero', opponent: 'mileiba',
        opponentHp: 1800, cine: 'city', ai: { accuracy: 0.88, delay: [1.2, 5.0] },
      },
      // v1.7.2 挑战模式城市池（只在挑战模式出现）。血量 / 答题水平按「第几站」取剧情同一站的数值，再乘 hpMult、加 accAdj（都封顶在金霸霸之下）
      pyramid: {
        stage: 'pyramid', normals: ['eg_mummy', 'eg_guard'], elite: 'eg_priest', opponent: 'falaowang', poolOnly: true,
        opponentHp: 1500, cine: 'city', hpMult: 0.85, accAdj: -0.01, ai: { accuracy: 0.86, delay: [1.3, 5.2] },
      },
      shaolin: {
        stage: 'shaolin', normals: ['sl_sweeper', 'sl_staffmonk'], elite: 'sl_bronze', opponent: 'xuantie', poolOnly: true,
        opponentHp: 1850, cine: 'city', hpMult: 1.05, accAdj: -0.02, delayMult: 1.05, ai: { accuracy: 0.86, delay: [1.6, 6.0] },
      },
      foshan: {
        stage: 'foshan', normals: ['fs_lion', 'fs_coolie'], elite: 'fs_thug', opponent: 'huangshifu', poolOnly: true,
        opponentHp: 1650, cine: 'city', hpMult: 0.95, accAdj: -0.03, delayMult: 0.85, ai: { accuracy: 0.85, delay: [1.0, 4.2] },
      },
      rocketbase: {
        stage: 'rocketbase', normals: ['rb_engineer', 'rb_intern'], elite: 'rb_security', opponent: 'maxike',
        opponentHp: 1950, cine: 'car', final: false, bgm: 'maxike', ai: { accuracy: 0.89, delay: [1.2, 4.8] },
      },
    },
    // v1.6：每城 20 只小怪，同一时刻只出现 1 只。前半 1–9 血量 60→100，后半 11–19 为 100→140；
    // 第 10 / 20 只是精英（175 / 225）。伤害同理。乘 CITY_MULT。
    WAVES: 20,
    WAVE_HP: { a: [60, 100], b: [100, 140], elite5: 175, elite10: 225 },
    WAVE_DMG: { a: 40, b: 50, elite5: 60, elite10: 70 },
    ELITE_AT: [10, 20],
    ELITE_EVERY: 3,                  // 精英每 3 题主动出手一次
    ELITE_ACT_S: [2.6, 4.6],         // 精英主动出手的时刻（秒，区间随机）；玩家要在这之前答对
    ELITE_GUARD: 0.5,                // 精英格挡：开场和每次主动出手后，挨的第一下伤害 ×0.5
    MINION_GUTS: false,              // 小怪不吃“根性”规则（一下打不死）
    // v1.6 街上击倒后马上接着跑，约 1 秒后下一只从小路右边跑来；倒地不放慢动作
    MINION_KO_HITSTOP: 4,            // 命中顿帧（和普通短顿帧同级）
    MINION_OUT: 2,                   // 击倒后几乎立刻接着跑（不等飞出镜头）
    REST_AFTER: 10,                  // 第 10 只之后在街上休息
    // 跑街（地面约 60 像素/秒；玩家停在镜头左侧约 1/3 处）
    RUN: {
      SPEED: 60,                     // 地面滚动 / 玩家前进，像素每秒
      MOB_SPEED: 60,                 // 小怪迎面跑来（相对接近约 120 像素/秒，约 1 秒碰上）
      ANIM: 1.2,                     // 主角跑动动画速率
      END_PAD: 160,                  // 最后一只之后再跑到擂台入口的距离
      FADE: 10,                      // 切进擂台的白闪帧数
      SLOT: 1 / 3,                   // 玩家在画面里的水平位置
      PAD: 34,                       // 对词时两人脚底离镜头左右边的最小距离，防止被挤出画面
    },
    REST_HEAL: 0.35,
    REVIEW_N: 5,
    // 掉落
    DROP_NORMAL: 0.06,               // v1.7：普通小怪 6% 掉 1 件普通道具（原 30%；精英必掉、休息点抽道具不变）
    ELITE_RARE_PLUS: 0.40,           // 精英必掉，稀有及以上 40%
    RARITY_W: { common: 60, rare: 30, legend: 10 },   // 休息点抽道具 / 对手三选一的权重；双刃剑算在稀有档
    ERASER_P: { normal: 0.01, elite: 0.03, pick: 0.05 },
    SLOTS: 10, STRIP_X0: 80, STRIP_DX: 36,   // v1.7 道具栏 10 格：x 80 起、间距 36（最右格到 440，避开中间计时圈）
                          // v1.7：背包 8 → 10 格
    CAPS: { dmg: 0.80, reduce: 0.30, fastMax: 7, fastMin: 3, crit: 0.30 },
    TOAST_TICKS: 60,                 // 拾取 / 升级提示 2 秒，不打断战斗
    // 城市对手 / Boss 进场镜头（tick）。boss 变体：多一段探照灯扫场、金色大字、全屏震动，整体 +1 秒
    CINE: {
      city: { dark: 15, walk: 30, zoom: 36, card: 30, back: 24, zoomTo: 1.5, searchlight: 0, gold: false, bigShake: false },
      boss: { dark: 15, search: 30, walk: 30, zoom: 30, card: 36, back: 24, zoomTo: 1.5, searchlight: 1, gold: true, bigShake: true },
      // v1.7 马西克：压暗 → 远处车灯 → 跑车滑进甩尾 → 鸥翼门 → 下车(intro_car) → 整理夹克(intro) → 推近 + 名字卡 + 火箭喷白烟 → 跑车倒车离场
      car: { dark: 15, lights: 18, drive: 42, door: 14, exit: 30, intro: 26, zoom: 24, card: 36, carOut: 30, back: 20, zoomTo: 1.5, searchlight: 0, gold: false, bigShake: true },
    },
    MAP: { ticks: 78, longTicks: 108, zoom: 2.2, hold: 18 },
    // v1.4 玩家选了某城的城市对手时，那一城的对手换成「同体型的原版角色」（避免自己打自己）：
    // 陈半山（Mr.J 男身改绘）→ Mr.J；韩多蔚、雪乃（苏绫女身改绘）→ 苏绫。血量、答题水平、进场镜头仍按那一城。
    MIRROR_SUB: { chenbanshan: 'mrj', handawei: 'suling', yukino: 'suling', mileiba: 'mrj', maxike: 'jinbawang' },   // 飞行 ~2.6 秒（跨太平洋 ~3.6 秒），可按键跳过
  },

  // v1.7 两个新大招（触发规则不变：连续 5 次速答，带金腰带 4 次）。数值是初稿，试打后再调
  ULT2: {
    SAW: { DISABLE_Q: 3, TOUGH_Q: 3, TOUGH_MULT: 1.5 },   // 全面削减：随机一半道具失效 3 题 / 玩家版：对手韧性减半 3 题（受伤 ×1.5）
    ROCKET: { SECONDS: 10, QUESTIONS: 5, BASE: 0.40, BLOCK: 0.20, EASY_BANK: 'junior', TIERS: [2, 4], BACKFIRE: 0.40, CPU_ACC: 0.72 },
    // v1.7.1 玩家版（用户定）：3 秒绿色点火倒计时，不再出题（3 秒读不完题；大招本来就是连续 5 次速答换来的）；
    // 每过 1 秒火力升一档 Ⅰ→Ⅱ→Ⅲ，倒计时结束 = 满火力起飞，伤害 = 必杀伤害 × 连击加成（相当于原来的 5/5）。飞行也压短。
    ROCKET_PLAYER: { SECONDS: 3, STEP: 0.7, CHARGE: 12, RISE: 8, HOVER: 4, DIVE: 6 },
  },
  // v1.7.2 三城 Boss 的出题机制（规范 §1.6 / 2.8 / 3.8 / 4.8 的初稿数值；只在和该 Boss 对打时生效）
  NEWCITY: {
    pharaoh: { MUMMY_EVERY: 4, LOOKALIKE: 2, SAND_S: 1.5 },        // 木乃伊在场：最多 2 个干扰项换成拼写相近词的意思；打掉后隔 4 题再召；沙暴命中 → 下一题选项盖沙 1.5 秒
    xuantie: { TIME_PLUS: 2, WRONG_MULT: 1.5, BREAK_N: 2, CHARGE_LEFT: 2 },        // 速答窗口 / 超时 +2 秒；你答错挨他打 ×1.5；他离必杀差 2 次速答时蓄力，要连对 2 题才打断
    huang: { TIME_MINUS: 1.5, DODGE: 0.30 },                        // 速答窗口 / 超时 −1.5 秒；慢答答对有 30% 被他闪开（不掉血）
  },

  // 道具（全部被动）。lv: [Lv1, Lv2, Lv3]；rarity: common / rare / legend / curse（双刃剑，紫框）
  ITEMS: [
    { id: 'mint', name: '提神薄荷', rarity: 'common', lv: [0.3, 0.6, 1.0], desc: v => `速答时间窗 +${v} 秒` },
    { id: 'wristguard', name: '体育课护腕', rarity: 'common', lv: [0.04, 0.07, 0.10], desc: v => `受伤 -${Math.round(v * 100)}%` },
    { id: 'wraps', name: '缠手绷带', rarity: 'common', lv: [0.05, 0.10, 0.15], desc: v => `连击伤害 +${Math.round(v * 100)}%` },
    { id: 'flashcard', name: '抽认卡', rarity: 'common', lv: [20, 30, 40], desc: v => `每答对 15 个词回 ${v} 血` },
    { id: 'sportsdrink', name: '电解质饮料', rarity: 'common', lv: [15, 25, 35], desc: v => `打倒一个敌人回 ${v} 血` },
    { id: 'glasses', name: '学霸眼镜', rarity: 'common', lv: [0, 3, 6], desc: (v, l) => l === 1 ? '显示词性提示' : `词性提示 + 首字提示（每城 ${v} 次）` },
    { id: 'coin', name: '考前锦鲤币', rarity: 'common', lv: [0.03, 0.05, 0.08], desc: v => `暴击率 +${Math.round(v * 100)}%` },
    { id: 'champ_belt', name: '拳王金腰带', rarity: 'rare', lv: [-0.20, -0.10, 0], desc: v => `必杀只要 4 次速答${v ? `，必杀伤害 ${Math.round(v * 100)}%` : '，伤害不减'}` },
    { id: 'helmet', name: '自行车头盔', rarity: 'rare', lv: [0.10, 0.15, 0.20], desc: v => `答错时 ${Math.round(v * 100)}% 不被打` },
    { id: 'slow_shoes', name: '慢半拍运动鞋', rarity: 'rare', lv: [1, 2, 3], desc: (v, l) => ['慢答不打断连击（不计入必杀进度）', '慢答不断连击，慢答伤害 +10%', '慢答不断连击、伤害 +10%，也计入必杀进度'][l - 1] },
    { id: 'root_sheet', name: '词根速查表', rarity: 'rare', lv: [0.10, 0.15, 0.25], desc: v => `同词根连续出现时伤害 +${Math.round(v * 100)}%` },
    { id: 'big_gloves', name: '大号拳套', rarity: 'rare', lv: [20, 40, 60], desc: v => `角力获胜额外 ${v} 伤害` },
    { id: 'repeater', name: '复读机', rarity: 'rare', lv: [0.10, 0.20, 0.30], desc: v => `错题本里的词答对时伤害 +${Math.round(v * 100)}%` },
    { id: 'coffee', name: '早八咖啡', rarity: 'rare', lv: [15, 25, 40], desc: v => `每个新敌人第一下伤害 +${v}` },
    { id: 'firstaid', name: '急救箱', rarity: 'rare', lv: [80, 120, 160], desc: v => `血量首次低于 20% 回 ${v} 血` },
    { id: 'eraser', name: '神奇橡皮擦', rarity: 'rare', lv: [1], noUpgrade: true, special: true, desc: () => '本局一直生效：每道选择题自动少一个错误选项' },
    { id: 'king_bomb', name: '王炸', rarity: 'legend', lv: [0.15, 0.25, 0.40], desc: v => `必杀伤害 +${Math.round(v * 100)}%，震屏更强` },
    { id: 'tumbler', name: '不倒翁', rarity: 'legend', lv: [0.10, 0.15, 0.25], desc: v => `一局一次：被打倒后以 ${Math.round(v * 100)}% 血站起` },
    { id: 'genius', name: '学霸附体', rarity: 'legend', lv: [0.5, 1.0, 1.5], desc: v => `速答时间窗 +${v} 秒` },
    { id: 'domino', name: '多米诺骨牌', rarity: 'legend', lv: [0.05, 0.08, 0.12], desc: v => `连击打到第 4 下后，下一个小怪开场掉 ${Math.round(v * 100)}% 血` },
    { id: 'last_candy', name: '最后一颗糖', rarity: 'legend', lv: [100, 150, 200], desc: v => `血量低于 10% 时回 ${v} 血（一次性）` },
    { id: 'hachimaki', name: '必胜头带', rarity: 'curse', lv: [[0.15, 15], [0.30, 25], [0.50, 40]], desc: v => `伤害 +${Math.round(v[0] * 100)}%；答错多扣 ${v[1]} 血` },
    { id: 'retake', name: '挂科重修', rarity: 'curse', lv: [[0.25, 0.25], [0.50, 0.50], [0.75, 0.75]], desc: v => `掉宝率 +${Math.round(v[0] * 100)}%；${['1/4', '1/2', '3/4'][Math.round(v[1] * 4) - 1]} 题目来自生词本` },
    { id: 'final_bell', name: '交卷铃', rarity: 'curse', lv: [[0.06, 0.5], [0.10, 1.0], [0.15, 1.5]], desc: v => `暴击率 +${Math.round(v[0] * 100)}%；速答窗 -${v[1]} 秒` },
    { id: 'blindbox', name: '盲盒', rarity: 'curse', lv: [[20, 0.5], [40, 0.55], [60, 0.6]], desc: v => `打倒敌人随机 ±${v[0]} 血（加血概率 ${Math.round(v[1] * 100)}%）` },
    { id: 'adrenaline', name: '肾上腺素', rarity: 'curse', lv: [[0.15, 0.03], [0.25, 0.05], [0.40, 0.08]], desc: v => `血量低于 25% 时伤害 +${Math.round(v[0] * 100)}%；高于 50% 时 -${Math.round(v[1] * 100)}%` },
  ],
  RARITY_COLOR: { common: '#e8e6f0', rare: '#4fa3ff', legend: '#ffc93c', curse: '#b36bff' },
  RARITY_NAME: { common: '普通', rare: '稀有', legend: '传说', curse: '双刃剑' },

  FONT: '"Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei","Noto Sans Mono CJK SC",sans-serif',
  FONT_TITLE: '"Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif',
};
