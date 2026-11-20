# 四级 / 六级词难度分级：用 ECDICT 的柯林斯星级、牛津 3000、词频排名、考试标签和词长打分，
# 再在每个词库内部按名次切成 1–5 级（约 15/25/30/20/10%）。输出 data/word_levels.js 和审阅用 json。
# 用法：python3 tools/word_levels.py <ecdict.csv> <words.json> <输出目录>
import csv, json, math, sys, os
csv.field_size_limit(10**9)
ecdict, words_json, outdir = sys.argv[1:4]
banks = json.load(open(words_json))
need = {w['w'].lower() for ws in banks.values() for w in ws}
E = {}
for r in csv.DictReader(open(ecdict, encoding='utf-8')):
    k = r['word'].lower()
    if k not in E and k.isalpha() and (k in need or r['frq'] not in ('', '0') or r['bnc'] not in ('', '0')): E[k] = r
# 派生词（puzzling、rearrange、beginner、needy…）认得词根就不难：找词根，按词根难度打折
PRE = ['re', 'un', 'dis', 'in', 'im', 'mis', 'over', 'under', 'out', 'non']
SUF = ['ingly', 'edly', 'fully', 'ness', 'ment', 'ation', 'tion', 'ful', 'less', 'ly', 'er', 'or', 'ing', 'ed', 'y', 'al', 'ity', 'ous', 'ive', 'able', 'ist', 's']
def bases(word):
    r = E.get(word); out = []
    if r:
        for part in (r['exchange'] or '').split('/'):
            if part.startswith('0:'): out.append(part[2:].lower())
    for p in PRE:
        if word.startswith(p) and len(word) - len(p) >= 4: out.append(word[len(p):])
    for x in SUF:
        if word.endswith(x) and len(word) - len(x) >= 3:
            st = word[:-len(x)]; out += [st, st + 'e']
            if len(st) > 3 and st[-1] == st[-2]: out.append(st[:-1])
            if st.endswith('i'): out.append(st[:-1] + 'y')
    return [b for b in dict.fromkeys(out) if b != word and b in E]
SPLIT = [0.15, 0.25, 0.30, 0.20, 0.10]
def factors(word):
    r = E.get(word.lower())
    if r and not r['tag'] and not r['frq'] and word.lower() not in need: return {'missing': 1, 'len': len(word)}
    if not r: return {'missing': 1, 'len': len(word)}
    tags = set((r['tag'] or '').split())
    num = lambda v: int(v) if (v or '').strip().isdigit() else 0
    return {'collins': num(r['collins']), 'oxford': 1 if num(r['oxford']) else 0, 'bnc': num(r['bnc']), 'frq': num(r['frq']), 'tags': sorted(tags), 'len': len(word)}
def score(f, word=None, depth=0):
    s = raw(f)
    if word and depth == 0:
        bs = [raw(factors(b)) for b in bases(word)]
        if bs and min(bs) + 0.45 < s: s = 0.4 * s + 0.6 * (min(bs) + 0.45)
    return s
def raw(f):
    if f.get('missing'): return 4.6 + 0.04 * f['len']
    ranks = [x for x in (f['frq'], f['bnc']) if x > 0]
    fr = min(ranks) if ranks else 60000
    s = math.log10(fr)                       # 词频：常见词约 2–3，生僻词 4.5 以上
    s -= 0.22 * f['collins'] + 0.35 * f['oxford']
    t = set(f['tags'])
    s -= 0.55 * ('zk' in t) + 0.40 * ('gk' in t)
    s += 0.25 * ('cet4' not in t and 'cet6' not in t and 'ky' not in t)   # 连大学考纲都不收
    s += 0.10 * ('gre' in t and 'gk' not in t and 'cet4' not in t) + 0.10 * ('toefl' in t and 'cet6' not in t and 'gk' not in t)
    s += 0.06 * max(0, f['len'] - 7)
    return s
out, data = {}, {}
for bid, ws in banks.items():
    rows = []
    for w in ws:
        f = factors(w['w']); rows.append((score(f, w['w'].lower()), w['w'], f, w))
    rows.sort(key=lambda x: (x[0], x[1]))
    n, cut, acc = len(rows), [], 0
    for p in SPLIT: acc += p; cut.append(round(acc * n))
    res = {}
    for i, (s, word, f, w) in enumerate(rows):
        lv = next(j + 1 for j, c in enumerate(cut) if i < c)
        res[word] = dict(level=lv, score=round(s, 3), meaning=w['m'], **f)
    out[bid] = res
    data[bid] = {str(l): ' '.join(sorted(k for k, v in res.items() if v['level'] == l)) for l in range(1, 6)}
    json.dump(res, open(os.path.join(outdir, f'{bid}_levels.json'), 'w'), ensure_ascii=False, indent=0)
js = ('// 由 tools/word_levels.py 生成（ECDICT 词频 / 柯林斯 / 牛津 / 考试标签 / 词长），勿手改\n'
      '// 四级、六级每个词的难度 1–5（词库内相对，约 15/25/30/20/10%），出题按难度挑词见 js/v20_wordlevel.js\n'
      'window.WF_WORD_LEVELS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(os.path.join(outdir, 'word_levels.js'), 'w').write(js)
for bid, res in out.items():
    from collections import Counter
    print(bid, len(res), sorted(Counter(v['level'] for v in res.values()).items()), 'missing', sum(1 for v in res.values() if v.get('missing')))
