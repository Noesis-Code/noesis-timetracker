"""Capture 390 px de la page principale d'un chantier permanent (voir docs/fonctionnalites/captures-chantiers.md).
Usage : python3 scripts/capture-chantier.py <basic|expansion|simpl|precision|trade> [dossier]
        python3 scripts/capture-chantier.py --toutes [chrono|objectifs|communaute|reglages|trade ...]   (une capture par page de chaque module)
        python3 scripts/capture-chantier.py --element <identifiant|--liste>   (pop-up, menu, confirmation)
Sortie : <dossier>/<chantier>.png (défaut : docs/img/chantiers). Montre le code du dossier où le script est lancé
(donc `origin/staging` seul, ou staging + plan anticipé dans un worktree jetable jamais poussé).
Tout est fabriqué ici : base temporaire (scripts/dev-seed.js, staging), serveur TMT sur PORT (défaut 3999),
serveur Trade Tracker sur TRADE_PORT (défaut 3980). Playwright/Chromium déjà installés (/opt/pw-browsers), rien à installer.
Viewport 390x844, thème sombre."""
import sys, os, json, re, time, shutil, tempfile, subprocess, hmac, hashlib, struct, base64, secrets, urllib.request
from playwright.sync_api import sync_playwright

if '--toutes' in sys.argv or '--element' in sys.argv:  # une capture PAR PAGE de chaque module / un élément précis : voir capture-pages.py
    sys.argv[0] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'capture-pages.py')
    exec(compile(open(sys.argv[0], encoding='utf-8').read(), sys.argv[0], 'exec'))
    sys.exit(0)
CHANTIERS = ('basic', 'expansion', 'simpl', 'precision', 'trade')
if len(sys.argv) < 2 or sys.argv[1] not in CHANTIERS:
    sys.exit(__doc__)
chantier = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'img', 'chantiers')
os.makedirs(out, exist_ok=True)
PORT = os.environ.get('PORT', '3999'); TPORT = os.environ.get('TRADE_PORT', '3980')
CHROME = os.environ.get('TT_CHROME', '/opt/pw-browsers/chromium')
D = tempfile.mkdtemp(prefix='capture-chantier-')
procs = []

def attendre(url):
    for _ in range(100):
        try:
            urllib.request.urlopen(url, timeout=1); return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError('serveur injoignable : ' + url)

def lancer(cmd, env):
    p = subprocess.Popen(cmd, cwd=ROOT, env=dict(os.environ, **env), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procs.append(p); return p

def totp(key):
    k = key.replace(' ', '').upper(); k = base64.b32decode(k + '=' * ((8 - len(k) % 8) % 8))
    h = hmac.new(k, struct.pack('>Q', int(time.time() // 30)), hashlib.sha1).digest(); o = h[-1] & 15
    return '%06d' % ((struct.unpack('>I', h[o:o + 4])[0] & 0x7fffffff) % 10 ** 6)

def contexte(p, base):
    b = p.chromium.launch(executable_path=CHROME, timeout=90000)
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True,
                      base_url=base, locale='fr-CA', service_workers='block')
    return b, c

def capture_trade():
    secret = secrets.token_hex(16)
    env = {'PORT': TPORT, 'NOESIS_DATA_DIR': D + '/trade', 'TRADE_LINK_SECRET': secret, 'TRADE_TOKEN_KEY': secrets.token_hex(24),
           'TRADE_EXPERT_TMT_IDS': 'demo-expert'}
    os.makedirs(env['NOESIS_DATA_DIR'])
    seed = subprocess.run(['node', 'trade-tracker/seed-demo.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
    m = re.search(r'expert : (http\S+/link\?token=\S+)', seed.stdout)
    if not m: sys.exit('seed-demo Trade sans lien : ' + seed.stdout + seed.stderr)
    lancer(['node', 'trade-tracker/server/index.js'], env)
    base = 'http://127.0.0.1:' + TPORT
    attendre(base + '/api/health')
    link = m.group(1).replace('localhost', '127.0.0.1')
    with sync_playwright() as p:
        b, c = contexte(p, base); pg = c.new_page()
        pg.goto(link)
        # Sécurité Trade : l'expert doit activer le TOTP avant toute donnée. On l'active avec la clé affichée (base de test jetable).
        pg.wait_for_selector('#totpKey')
        key = pg.inner_text('#totpKey')
        pg.fill('#enrollCode', totp(key)); pg.click('#enrollCodeSend'); pg.wait_for_selector('#backupGrid')
        pg.click('#codesDone'); pg.wait_for_selector('#screen .card, #screen .stateScreen'); pg.wait_for_timeout(1500)
        pg.screenshot(path=os.path.join(out, 'trade.png'))
        b.close()

def capture_tmt():
    env = {'NOESIS_DATA_DIR': D + '/tmt', 'RAILWAY_ENVIRONMENT_NAME': 'staging'}
    os.makedirs(env['NOESIS_DATA_DIR'])
    seed = subprocess.run(['node', 'scripts/dev-seed.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
    m = re.search(r'Emilien id = (\S+)', seed.stdout)
    if not m: sys.exit('dev-seed sans id : ' + seed.stdout + seed.stderr)
    uid = m.group(1)
    lancer(['node', 'server/index.js'], dict(env, PORT=PORT))
    base = 'http://localhost:' + PORT
    attendre(base + '/api/health')
    with sync_playwright() as p:
        b, c = contexte(p, base)
        c.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
        prof = c.request.post('/api/profile/%s/verify-pin' % uid, data={'pin': '1234'}).json()
        pg = c.new_page(); pg.goto('/')
        pg.evaluate("([k,v])=>localStorage.setItem(k,v)", ['noesis_profile', json.dumps(prof)])
        if chantier == 'precision':  # pôle + secteur + tâches du jour fictifs (la base de départ n'en a pas)
            act = c.request.get('/api/activities?userId=%s' % uid).json()
            act = act if isinstance(act, list) else act.get('activities', [])
            aid = act[0]['id']
            cats = c.request.post('/api/activities/%d/goals/categories' % aid, data={'label': 'Time Tracker'}).json()['categories']
            key = [x for x in cats if x.get('label') == 'Time Tracker'][0]['key']
            sec = c.request.post('/api/activities/%d/goals/categories/%s/secteurs' % (aid, key), data={'label': 'Précision des tâches générées'}).json()['secteurs']
            skey = [x for x in sec if x.get('label') == 'Précision des tâches générées'][0]['key']
            today = time.strftime('%Y-%m-%d')
            for t in ('Relire les corrections de la veille', 'Mesurer la précision sur le jeu d\'évaluation', 'Ajuster les consignes de reformulation'):
                c.request.post('/api/activities/%d/goals/categories/%s/tasks' % (aid, skey), data={'label': t, 'dueDate': today})
        pg.reload(); pg.wait_for_timeout(2500)

        def fermer_invites():
            for i in ('marketingInviteNo', 'aiNoticeAck'):
                if pg.locator('#' + i).is_visible():
                    pg.click('#' + i); pg.wait_for_timeout(500)
        fermer_invites()
        if chantier == 'basic':
            pg.click('.tabBtn[data-tab=chrono]')
        elif chantier == 'expansion':
            pg.click('.tabBtn[data-tab=goals]'); fermer_invites()
        elif chantier == 'simpl':
            pg.click('#profileSettingsBtn')
        elif chantier == 'precision':
            pg.click('.tabBtn[data-tab=goals]'); fermer_invites()
            pg.click('.goalsCaptureActivityChip >> nth=0')
        pg.wait_for_timeout(2000)
        pg.screenshot(path=os.path.join(out, chantier + '.png'))
        b.close()

try:
    (capture_trade if chantier == 'trade' else capture_tmt)()
    print('OK ' + os.path.join(out, chantier + '.png'))
finally:
    for p in procs: p.terminate()
    shutil.rmtree(D, ignore_errors=True)
