"""Relevé des valeurs de design réellement utilisées (rayons, tailles de police, espacements,
transitions, ombres) dans public/styles.css et public/css/*.css, hors bloc :root.
Usage : python3 scripts/ecarts-jetons.py [--detail rayons]"""
import re, glob, sys, collections
files = ['public/styles.css'] + sorted(glob.glob('public/css/*.css'))
cnt = {k: collections.Counter() for k in ('radius', 'font', 'space', 'trans', 'shadow')}
where = collections.defaultdict(list)
for f in files:
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group()), s, flags=re.S)
    s = re.sub(r':root\s*\{[^}]*\}', lambda m: re.sub(r'[^\n]', ' ', m.group()), s)
    for m in re.finditer(r'(?<![-\w])(border-radius|font-size|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap|transition|box-shadow)\s*:\s*([^;{}]+)', s):
        p, v = m.group(1), m.group(2).strip()
        line = s.count('\n', 0, m.start()) + 1
        if 'var(' in v and p in ('border-radius', 'transition', 'box-shadow') and not re.search(r'\d', re.sub(r'var\([^)]*\)', '', v)): continue
        k = {'border-radius': 'radius', 'font-size': 'font', 'transition': 'trans', 'box-shadow': 'shadow'}.get(p, 'space')
        if k in ('radius', 'font'): vals = [v]
        elif k == 'space': vals = re.findall(r'-?[\d.]+px', v)
        elif k == 'trans': vals = re.findall(r'(?<![\w.-])(\.?\d*\.?\d+m?s)(?:\s+(ease(?:-in-out|-out|-in)?|linear))?', v) and [a + ((' ' + b) if b else '') for a, b in re.findall(r'(?<![\w.-])(\.?\d*\.?\d+m?s)(?:\s+(ease(?:-in-out|-out|-in)?|linear))?', v)]
        else: vals = [v]
        for x in vals:
            cnt[k][x] += 1; where[(k, x)].append('%s:%d' % (f.split('/')[-1], line))
out = []
for k, c in cnt.items():
    out.append('## ' + k)
    for x, n in c.most_common(): out.append('%5d  %s' % (n, x))
print('\n'.join(out))
if len(sys.argv) > 2:
    for (k, x), w in where.items():
        if k == sys.argv[2]: print(x, ' '.join(w))
