#!/usr/bin/env python3
"""巴黎关素材打包（Gray，2026-11-21）。可重复运行，只追加、不重打其它城市。

读取：/workspace/wordfight/incoming/paris_final/（Codex 已锁定的成品帧：R3 玛戈 + 擂台 / 长街 / 图钉 / 特效，
      R3.1 卢克 / 伊娜，R3.2 + R3.2.1 巴斯蒂安）。工作底图（bj_xuetu / sl_yellowbelt / eg_priest、Mr.J、拳皇参考）不读、不打包。
输出：assets/<id>.png / _white / _red、assets/margot_fx_*.png、assets/campaign/stages/paris/、assets/runs/paris/、
      assets/campaign/map/pin_paris.png、assets/paris.js（追加到 WF_ASSETS / WF_CAMPAIGN_DATA）。
打包逻辑和 demo_v1.11/src/pack_campaign.py 的 pack() 一致（命中红 → hit，hit_reach → hr，fx_spawns → fx）。
"""
import json, os, shutil, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.environ.get('PARIS_SRC', '/workspace/wordfight/incoming/paris_final')
OUT = os.path.join(ROOT, 'assets')
COLS = 16
HIT_RED = {(172, 37, 47), (251, 70, 71)}
BEHIND = ('behind_actor', 'behind_char')
CHARS = [
    {'id': 'margot', 'name': '玛戈', 'base': 'chars/margot', 'json': 'margot.json', 'credit': 'Word Punch 原创（Codex 绘）', 'body': 'heavy'},
    {'id': 'pa_newsboy', 'name': '卢克', 'base': 'minions/pa_newsboy', 'json': 'pa_newsboy.json', 'credit': 'JKLLIN（Mr.J 男身改绘，Codex 换装）', 'body': 'standard'},
    {'id': 'pa_sketcher', 'name': '伊娜', 'base': 'minions/pa_sketcher', 'json': 'pa_sketcher.json', 'credit': 'JKLLIN（苏绫女身改绘，Codex 换装）', 'body': 'standard'},
    {'id': 'pa_porter', 'name': '巴斯蒂安', 'base': 'minions/pa_porter', 'json': 'pa_porter.json', 'credit': 'JKLLIN（Mr.J 壮硕身改绘，Codex 换装）', 'body': 'heavy'},
]
# 经实机复测后的命中距离（hit_reach，脚底起算）。None = 用素材里写的值
HR_OVERRIDE = {('margot', 'mega_charge_b'): None}


def analyse(img):
    px = img.load(); w, h = img.size
    xs, ys, red = [], [], []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                xs.append(x); ys.append(y)
                if (r, g, b) in HIT_RED: red.append((x, y))
    bbox = [min(xs), min(ys), max(xs), max(ys)] if xs else None
    hit = None
    if len(red) >= 6:
        mx = max(x for x, _ in red)
        near = [(x, y) for x, y in red if x >= mx - 9]
        hit = [round(sum(x for x, _ in near) / len(near)), round(sum(y for _, y in near) / len(near)), mx]
    return bbox, hit


def silhouette(img, rgb):
    s = Image.new('RGBA', img.size, (0, 0, 0, 0))
    s.paste(Image.new('RGBA', img.size, rgb + (255,)), (0, 0), img.getchannel('A').point(lambda v: 255 if v else 0))
    return s


def pack(c):
    base = os.path.join(SRC, c['base'])
    d = json.load(open(os.path.join(base, c['json']), encoding='utf-8'))
    cell = int(d.get('cell_w', 50)); assert cell == int(d.get('cell_h', 50))
    foot = list(d.get('foot_origin') or [24, 40])
    cells, anims, missing = [], {}, []
    for name, a in d['animations'].items():
        frames = []
        for i, f in enumerate(a.get('frames', [])):
            fp = os.path.join(base, f['file'])
            if not os.path.exists(fp): missing.append(f['file']); continue
            img = Image.open(fp).convert('RGBA')
            if img.size != (cell, cell): missing.append(f'{f["file"]} size={img.size}'); continue
            bbox, hit = analyse(img)
            ev = list(f.get('events') or [])
            if i in (a.get('active_frames') or []) and 'active' not in ev: ev.append('active')
            cells.append(img)
            fr = {'c': len(cells) - 1, 't': int(f.get('duration_ticks') or a.get('ticks_per_frame') or 2), 'bb': bbox}
            fo = f.get('foot_origin')
            if fo and list(fo) != foot: fr['fo'] = list(fo)
            if ev: fr['ev'] = ev
            if hit: fr['hit'] = hit
            hr = f.get('hit_reach')
            ov = HR_OVERRIDE.get((c['id'], name))
            if hr is not None: fr['hr'] = int(ov if ov is not None else hr)
            sp = []
            for x in (f.get('fx_spawns') or []):
                if x.get('asset') not in (d.get('fx') or {}): continue
                sp.append([x['asset'], int(x.get('offset', [0, 0])[0]), int(x.get('offset', [0, 0])[1])])
            if sp: fr['fx'] = sp
            frames.append(fr)
        if frames: anims[name] = {'loop': bool(a.get('loop')), 'frames': frames}
    assert not missing, (c['id'], missing)
    rows = (len(cells) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * cell, rows * cell)); white = Image.new('RGBA', sheet.size); red = Image.new('RGBA', sheet.size)
    for i, img in enumerate(cells):
        xy = ((i % COLS) * cell, (i // COLS) * cell)
        sheet.paste(img, xy); white.paste(silhouette(img, (255, 255, 255)), xy); red.paste(silhouette(img, (251, 70, 71)), xy)
    cid = c['id']
    sheet.save(os.path.join(OUT, f'{cid}.png'), optimize=True); white.save(os.path.join(OUT, f'{cid}_white.png'), optimize=True); red.save(os.path.join(OUT, f'{cid}_red.png'), optimize=True)
    bb = anims['idle']['frames'][0]['bb']; ps = round(20 * cell / 50); cx = (bb[0] + bb[2]) // 2
    fxd = {}
    for name, fx in (d.get('fx') or {}).items():
        fp = os.path.join(base, fx['file']); strip = Image.open(fp).convert('RGBA'); w, h = fx['cell_size']
        fn = f'{cid}_fx_{name}.png'; strip.save(os.path.join(OUT, fn), optimize=True)
        fxd[name] = {'src': 'assets/' + fn, 'w': w, 'h': h, 'n': int(fx['frames']), 't': int(fx.get('ticks_per_frame', 2)), 'o': list(fx.get('origin', [w // 2, h // 2])), 'behind': fx.get('layer') in BEHIND}
    body = c['body']
    data = {'id': cid, 'name': c['name'], 'credit': c['credit'], 'cell': cell, 'cols': COLS, 'foot': foot,
            'portrait': [cx - ps // 2, max(0, bb[1] - 1), ps], 'heavy': body == 'heavy', 'body': body, 'anims': anims, 'fx': fxd}
    print(f'[{cid}] cell={cell} foot={foot} anims={len(anims)} cells={len(cells)} fx={list(fxd)}')
    return data


def stage():
    s = os.path.join(SRC, 'stages', 'paris'); dst = os.path.join(OUT, 'campaign', 'stages', 'paris')
    if os.path.isdir(dst): shutil.rmtree(dst)
    os.makedirs(dst)
    st = json.load(open(os.path.join(s, 'stage.json'), encoding='utf-8'))
    for L in st['layers']: shutil.copy(os.path.join(s, L['file']), os.path.join(dst, L['file']))
    for D in st.get('dynamic_elements') or []: shutil.copy(os.path.join(s, D['file']), os.path.join(dst, D['file']))
    return st


def run():
    s = os.path.join(SRC, 'runs', 'paris'); dst = os.path.join(OUT, 'runs', 'paris')
    if os.path.isdir(dst): shutil.rmtree(dst)
    os.makedirs(dst)
    for f in os.listdir(s):
        if f == 'seam_check.png' or f.startswith('preview') or f.startswith('transition'): continue
        if f.endswith('.png') or f == 'run.json': shutil.copy(os.path.join(s, f), os.path.join(dst, f))
    data = json.load(open(os.path.join(s, 'run.json'), encoding='utf-8'))
    b = 'assets/runs/paris/'; data['base'] = b; data['placeholder'] = False
    for k in ('layers', 'props', 'dynamic_elements'):
        for x in data.get(k) or []: x['src'] = b + x['file']
    return data


def main():
    chars = {c['id']: pack(c) for c in CHARS}
    st = stage(); rn = run()
    shutil.copy(os.path.join(SRC, 'map', 'pin_paris.png'), os.path.join(OUT, 'campaign', 'map', 'pin_paris.png'))
    W, H = Image.open(os.path.join(SRC, 'map', 'pin_paris.png')).size; assert (W, H) == (54, 12), (W, H)
    pin = {'file': 'pin_paris.png', 'frame_size': [9, 12], 'frames': 6, 'anchor': [4, 11], 'layout': 'horizontal',
           'current': [0, 1, 2, 3], 'locked': 4, 'cleared': 5, 'suggested_ticks_per_frame_at_30fps': 5}
    with open(os.path.join(OUT, 'paris.js'), 'w', encoding='utf-8') as f:
        f.write('// 由 tools/pack_paris.py 生成，勿手改。巴黎关（玛戈 + 卢克 / 伊娜 / 巴斯蒂安、擂台、长街、图钉）\n')
        f.write('window.WF_ASSETS = window.WF_ASSETS || {};\nObject.assign(window.WF_ASSETS, ')
        json.dump(chars, f, ensure_ascii=False, separators=(',', ':'))
        f.write(');\n(function (D) {\n  D.stages = D.stages || {}; D.stages.paris = ')
        json.dump(st, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n  D.runs = D.runs || {}; D.runs.paris = ')
        json.dump(rn, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n  if (D.map) { D.map.cities = D.map.cities || {}; D.map.cities.paris = D.map.cities.paris || [20, 39]; D.map.sprites = D.map.sprites || {}; D.map.sprites.pin_paris = ')
        json.dump(pin, f, ensure_ascii=False, separators=(',', ':'))
        f.write('; D.map.city_pins = D.map.city_pins || {}; D.map.city_pins.paris = \'boss_pin\'; }\n})(window.WF_CAMPAIGN_DATA = window.WF_CAMPAIGN_DATA || {});\n')
    print('wrote assets/paris.js')


if __name__ == '__main__':
    main()
