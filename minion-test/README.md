# 小怪临时测试街

这是一份临时测试街，用来试玩已通过的九只小怪全套高清帧：胡同混混、练功学徒、武馆大师兄、不良少年、剑道部女生、相扑力士、街头舞者、跆拳道黄带、夜店保镖；以及三位城市对手的高清全套（31 个动作 236 帧，含庆祝）：陈半山（北京）、韩多蔚（首尔）、雪乃（东京）。测完会删除整个 `minion-test/` 目录。

不要把它当成正式版。正式高清仍在 `/wordpunch/hd/`。本目录不会改仓库里已有的 `hd/`、`optimize/` 或根目录游戏文件。

打开：

- 北京街（混混、学徒交替；第 10 / 20 只是大师兄；街尾照正式版打城市对手陈半山）：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?beijing=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?beijing=1)
- 东京街（不良少年与剑道部女生交替；第 10 / 20 只是相扑；街尾照正式版打城市对手雪乃）：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?tokyo=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?tokyo=1)
- 首尔街（舞者与黄带交替；第 10 / 20 只是夜店保镖；街尾照正式版打城市对手韩多蔚）：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?seoul=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?seoul=1)

玩家输给小怪时不播小怪庆祝（小怪包里没有庆祝帧）。城市对手赢时播高清 celebrate 全 18 帧；玩家赢时苏绫照原表庆祝。

直接和城市对手对打（进城后撤掉第一只小怪，跑到街尾，走正式的城市对手登场镜头）：

- 陈半山：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanfight=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanfight=1)
- 韩多蔚：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweifight=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweifight=1)
- 雪乃：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinofight=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinofight=1)

可选姿势台（不破坏街上查询参数）：

- 胡同混混：`?hunhunlab=1`
- 练功学徒：`?xuetulab=1`
- 武馆大师兄：`?dashixionglab=1`
- 不良少年：`?badboylab=1`
- 相扑力士：`?sumolab=1`
- 剑道部女生：`?kendolab=1`
- 街头舞者：`?dancerlab=1`
- 跆拳道黄带：`?yellowbeltlab=1`
- 夜店保镖：`?bouncerlab=1`

- 陈半山：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanlab=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?chenbanshanlab=1)
- 韩多蔚：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweilab=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?handaweilab=1)
- 雪乃：[https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinolab=1](https://zhaozhengdao1124-ctrl.github.io/wordpunch/minion-test/hd/?yukinolab=1)

小怪姿势台：`1–9` 钉动作（待机 / 走 / 连击 / 重击 / 出场 / 防御 / 受击 / 倒地 / 倒地消散），`[` `]` 步进，`G` 地面线。

城市对手姿势台：`1` 待机 `2` 走 `3` 跑 `4` 出场 `5` 连击A `6` 重拳 `7` 受击 `8` 倒地 `9` 庆祝 `0` 超必杀；`,` `.` 切换上/下一个动作（31 个动作全覆盖，含庆祝）；`[` `]` 步进；`P` 按原表节奏连播当前动作；`G` 地面线。

对照旧图可加 `&hdchar=0`；只退某位城市对手可加 `&hdchenbanshan=0` / `&hdhandawei=0` / `&hdyukino=0`。城市对手的高清帧按需加载（每位约 30–40 MB），只在进对应城市、开姿势台或直打入口时才拉。

姿势台打开后街战已冻结（不再出题、不会被数字键答题带进普通街战），左下角有绿字提示当前角色和动作帧；背景仍是该城街景。
