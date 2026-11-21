# 巴黎镜像对手「换色版玛戈」的临时图集（v2.2，2026-11-22）：读锁定的 assets/margot*.png（只读），按下面的调色板逐像素换色，
# 写 assets/skins/margot_mirror{,_white,_red}.png。只换颜色：alpha、描边 #25202E、皮肤 3 色、眼睛、命中红都不动，形状一个像素不改。
# _white / _red 是纯色剪影（与原版同一个 alpha），直接沿用原版的两张。
# TODO(Codex)：Codex 的正式换色图集到了，直接覆盖 assets/skins/margot_mirror{,_white,_red}.png（同尺寸同布局），不用再跑本脚本。
# 配色说明见 /workspace/wordfight/paris_int/玛戈皮肤设计.md「镜像对手」。
import os, shutil
from PIL import Image
import numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
MAP = {   # 原色 → 镜像色（外套变浅、头发变深：和原版、各皮肤的明暗结构反过来，一眼能分开）
    '943F53': 'BDB8CF', '603144': '827D9C',   # 外套 酒红 → 浅灰紫
    '49665A': '3F6A96', '2B4846': '2A4A6E',   # 词典封皮 墨绿 → 钢蓝
    '605F84': '943F53', '3E3C62': '603144',   # 围裙 靛蓝 → 酒红（原版外套色）
    'D6D4CF': '5E5878', '787783': '403C56',   # 头发 银白 → 深灰紫
    'D4A452': '7FC4C8', '936235': '4A8C92',   # 围巾 / 书签 金 → 青
}
h2 = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
a = np.array(Image.open(os.path.join(ROOT, 'assets/margot.png')).convert('RGBA')); out = a.copy()
for s, d in MAP.items():
    sel = (a[..., :3] == h2(s)).all(-1) & (a[..., 3] > 0); out[sel, :3] = h2(d)
assert ((out[..., 3] > 0) == (a[..., 3] > 0)).all()
dst = os.path.join(ROOT, 'assets/skins')
Image.fromarray(out).save(os.path.join(dst, 'margot_mirror.png'), optimize=True)
for v in ('_white', '_red'): shutil.copyfile(os.path.join(ROOT, 'assets/margot%s.png' % v), os.path.join(dst, 'margot_mirror%s.png' % v))
print('ok', [os.path.getsize(os.path.join(dst, 'margot_mirror%s.png' % v)) for v in ('', '_white', '_red')])
