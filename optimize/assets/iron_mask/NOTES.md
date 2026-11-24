# 铁面人 3× 240 帧 · 动作级修正（key-poses-full-v2）

目录：`/workspace/paris-art-direction-refs/3x-locked/key-poses-full-v2/`

这是在 `key-poses-full/`（v1，技术齐、动作未过目视）之上的动作级修正，**不覆盖** v1 或更早任何目录。本轮仍未导入仓库、未合并、未上线、未购买。未做最终美术验收。

规格不变：192×192，脚 (96,162)，16 色硬边，无半透明，朝右，脚底像素 ≤162。角力接触 (144,126)，heavy_kick 命中 (177,84)。idle/000 与锁定 idle 像素一致。无书。槽名 / 帧数 / cell 0–239 与玛戈对齐。

## 允许的两处定型例外（已写入 JSON）

- `knocked_down_get_up` 定型从格号 /002 移到 **/003**（文件仍是 master 的 `*-002-3x-rev.png` 原样拷贝）。原因：定型放在 /002 时视觉上比后续帧更抬起，起身不单调。JSON 字段 `typifying_moved`。
- `block/001` 在 v2 里是 **新文件**：在 (144,85) 补 1px 连接，使 4-连通 cc=1；观感与定型相同。`key-poses/` 原定型未改。JSON 字段 `block_001_cc_fix`。

其余定型均为现行最佳的精确拷贝。`idle_alt` /003 钉词、/006 收链精确拷贝，只修了中间帧右臂。

## 技术 QA（QA-REPORT.json）

- 240/240 通过。`fail_count` 0。
- odd_alpha 0，extra_colors 0，below_foot 无正值，cc 全部 =1（含新的 block/001），颜色 15–16 且均在角色调色板。
- 图幅全部 192×192。idle/000 与锁定 idle 像素一致。
- 图集：`atlas/iron-mask-3x-atlas-240.png` 3072×2880（16×15），JSON 240 格。
- 总览：`atlas/iron-mask-3x-atlas-overview.png` 1024×960（及 overview-grid）。
- GIF 预览时长按 `duration_ms_approx = ticks * 1000 / 30` 估算，仅供预览。

## 对照板

`compare/compare-seven-slots.png`（及 `-half.png`）以及分条：

`compare/compare-{run,walk,mega_charge_b,combo_b,heavy_kick,knocked_down_get_up,celebrate}.png`

上排 v1，下排 v2。定型帧保持（get_up 在 v2 改放到 /003）。

## 六项动作要求：是否真的改好

1. **中间帧弹回通用 painter 站姿**：有改进，作为动作基本成立，仍有收势残留。  
   combo_b / heavy_kick / combo_a / mega_charge_a / hit_swap / clash_impact 等：预备是定型的反向蓄力，中间保持定型体量、面具、披风语言，收势从定型逐步靠近 idle，不再突然换成另一套体型。  
   **仍弱**：最后一两帧会开始像 idle 轮廓靠拢；part morph 偶有接缝或小块填补，不是手绘级光滑。

2. **run / walk 步态**：有真正的交替步态，定型 run/004-rev、walk/004 保持，循环首尾可接。  
   walk：接触（宽站，如 typ /004 与对侧 /009）→ 过渡/抬腿（/003、/008）→ 经过（脚收到身体下方，/001–002、/006–007），身体有上下起伏。  
   run： typ /004 右脚前掌着地、后脚抬起；对侧接触 /000（换脚后仍是前掌在右侧着地，侧视必然如此）；左右各一次腾空（/002 与 /006，双脚离地收在身下）；/001 /003 /005 /007 为腾空前后过渡。  
   **仍弱**：中间帧脚与胯交接仍有杂点、细碎残柱和少量躯干空洞填补痕迹；run 腾空轮廓偏扁，披风/腿有拖丝。不像定型那么干净，但已经不是「腿几乎不动」。

3. **mega_charge_b 高度跳变**：有连续弧线，定型 /008-rev 保持，顶点在格内（standing 峰值 161），脚底 ≤162。  
   弧线：/000–001 typ 语言下蹲蓄力 → /002 typ 姿态离地 → /003–007 上升/顶点/开始下砸 → /008 定型下砸 → /009–012 下砸到着地冲击 → /013–016 从着地姿收向 idle（不再跳回半空定型）。  
   **仍弱**：/002→/003 standing 128→147，仍有约 19px 的起跳台阶（同一套 typ 语言，已不是 v1 的 109→147 换体型跳变）。收势 /013–016 仍偏 typ 下砸姿，只是逐渐靠近 idle。

4. **knocked_down_get_up 顺序**：已单调。定型在 /003。  
   standing 77 → 95 → 103 → 109 → 115；面具顶 85 → 67 → 59 → 53 → 47。/004 明显比定型更接近直立 idle。  
   **仍弱**：/000→/001 一步跨度较大（从倒地抬到半起），方向正确。

5. **celebrate / intro**：celebrate 不再是 18 帧同一站姿。  
   /000–001 从偏 idle 进入；/002–005 披风甩开（/004 最开）；/006–008 落下并在 /008 定型站定（双拳在腰侧）；之后腕链轻晃、收势回 idle。没有影片式双臂上举，也不是 intro 的拷贝。  
   intro：/000–002 从左侧走入，/003–005 抬拳，/006 定型（拳到面具旁），/007–011 收势。  
   **仍弱**：celebrate 披风加厚甩开略显块面；intro /003–005 略糊。

6. **grab / back_launch / clash_win 收势 / stunned**：在不伤定型的前提下顺过。  
   grab：全程 typ 语言，/004 定型保持，收势不再弹回 idle 站姿。  
   back_launch：高度连续（114→123→131→…→117 定型→下落到 94），不再有 56px 换体型跳变。  
   clash_win：推击 typ 语言贯穿到收势。  
   stunned：进入 typ 后 1–2px 晃，再收向 idle。  
   **仍弱**：grab 下砸幅度偏小，更像维持抓姿；launch /000 已是 typ 腾空姿，离地蹲起不够清楚；stunned 中段动作幅度很小。

## 其它

- `idle` / `dodge_roll` / `block_hit` / `block_recover` / `knocked_down` / `knocked_down_death` / `burned` / `clash_lock` / `clash_lose`：沿用 v1 帧（已够用的循环/定格/倒地）。
- `idle_alt`：钉词 /003、收链 /006 未改；中间帧右臂已收细。
- `block` 其余帧由 cc 修好的 typifying 派生，循环可接。
- 1 帧真定格：block_hit、block_recover（时长来自 paris.js t）。
- 空中槽（脚可离线、像素仍 ≤162）：见 QA-REPORT `airborne_slots`。含 run 腾空帧、mega_charge_b 升/砸段、back_launch 等。

## 仍偏弱、若再修优先看的槽

1. walk / run 中间帧的腿胯清洁（步态已可读，像素还糙）。
2. mega_charge_b /002→/003 起跳台阶。
3. grab 下砸幅度、intro 中段、部分攻击收势的 morph 接缝。
4. typifying 本身仍带各批次留下的造型问题（本轮只修正动作，不定型重画）。

构建脚本：`build_v2.py`（导入 v1 模块但把输出重定向到本目录）。工作检查图在 `_insp/`，非正式交付。

本轮完成后即停，不自行再开一轮，不导入仓库。
