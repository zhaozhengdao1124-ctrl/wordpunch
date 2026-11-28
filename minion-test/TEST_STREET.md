# 临时测试街：九只小怪 + 三位城市对手高清全套

仓库：https://github.com/zhaozhengdao1124-ctrl/wordpunch
范围：只改 `minion-test/`。正式 `/hd/`、`/optimize/`、`/suling-hd-preview/` 相对 `3c997c8` 没有改动。不发邮件、不发消息。

这是一份临时测试街，测完会删除整个 `minion-test/` 目录。不要把它当成正式版。正式高清仍在 `/wordpunch/hd/`。

## 打开（GitHub Pages：`/minion-test/hd/`）

街战（进城后按正式版流程：街上 20 只小怪，第 10 / 20 只是精英，街尾打城市对手）：

- 北京街：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?beijing=1
  - 混混、学徒交替；第 10 / 20 只是武馆大师兄；街尾照正式版打陈半山。
- 首尔街：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?seoul=1
  - 舞者与黄带交替；第 10 / 20 只是夜店保镖；街尾照正式版打韩多蔚。
- 东京街：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?tokyo=1
  - 不良少年与剑道部女生交替；第 10 / 20 只是相扑力士；街尾照正式版打雪乃。

直接和城市对手对打（进城后撤掉第一只小怪，跑到街尾，走正式的城市对手登场镜头）：

- 陈半山：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanfight=1
- 韩多蔚：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweifight=1
- 雪乃：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinofight=1

小怪姿势台（冻结街战，数字键不答题；`1–9` 钉动作，`[` `]` 步进，`G` 地面线）：

- 胡同混混：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?hunhunlab=1
- 练功学徒：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?xuetulab=1
- 武馆大师兄：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?dashixionglab=1
- 不良少年：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?badboylab=1
- 相扑力士：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?sumolab=1
- 剑道部女生：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?kendolab=1
- 街头舞者：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?dancerlab=1
- 跆拳道黄带：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yellowbeltlab=1
- 夜店保镖：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?bouncerlab=1

城市对手姿势台（冻结街战，数字键不答题；可逐动作包括庆祝）：

- 陈半山：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanlab=1
- 韩多蔚：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweilab=1
- 雪乃：https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinolab=1

城市对手姿势台按键：`1` 待机 `2` 走 `3` 跑 `4` 出场 `5` 连击A `6` 重拳 `7` 受击 `8` 倒地 `9` 庆祝 `0` 超必杀；`,` `.` 切换上/下一个动作（31 个动作全覆盖，含庆祝）；`[` `]` 步进；`P` 按原表节奏连播当前动作；`G` 地面线。

对照旧图可加 `&hdchar=0`；只退某位城市对手可加 `&hdchenbanshan=0` / `&hdhandawei=0` / `&hdyukino=0`。`/minion-test/` 根路径没有 index，打开会 404，请走上面的 `/hd/?…` 地址。说明也写在 `minion-test/README.md`。

玩家输给小怪时不播小怪庆祝（小怪包里没有庆祝帧）。城市对手赢时播高清 celebrate 全 18 帧；玩家赢时苏绫照原表庆祝。

## 挂钩方式

沿用卢克的固定脚位，不按每帧测到的 fx 重新居中。绘制：`foot = fo || d.foot || 角色默认`。朝左仍是 `translate(X+1)` 再 `scale(-1,1)`。城市对手高清帧按需加载（进对应城市 / 姿势台 / 直打入口 / 首次绘制时才拉）。

| 角色 | 槽位 | 画布 | 逻辑格 | 默认脚点 | 着地末行 | 帧数 |
| --- | --- | --- | --- | --- | --- | --- |
| 陈半山 | chenbanshan（北京街尾） | 750 | 50 | (24, 40) / (360, 600) | 599 | 236（31 动作，含庆祝 18 帧） |
| 韩多蔚 | handawei（首尔街尾） | 750 | 50 | (24, 40) / (360, 600) | 599 | 236（31 动作，含庆祝 18 帧） |
| 雪乃 | yukino（东京街尾） | 750 | 50 | (24, 40) / (360, 600) | 599 | 236（31 动作，含庆祝 18 帧） |

源 PNG：`/workspace/wordfight/art_review/{id}_fullset_astra_20261128/frames/`。导出为无损 exact WebP（`lossless=True, exact=True, quality=100, method=6`），708 帧逐像素回读全部通过。脚本：`minion-test/hd/js/v26_minions_hd.js`（只在这份副本里）。Service Worker 缓存名：`core-nf-v1.25-minion-test-city3`，范围 `./`（即 `…/minion-test/hd/`），不和正式 `/hd/` 串缓存。

`minion-test/hd/js/config.js` 已把三城 `opponent` 从精英小怪改回正式版的陈半山 / 韩多蔚 / 雪乃。`game.js` 里只有胜者带 `minion` 标记才跳过庆祝，所以城市对手赢时会播 celebrate。
