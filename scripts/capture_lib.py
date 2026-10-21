"""Socle commun des scripts de capture (capture-pages.py, capture-element.py, capture-chantier.py).
Fabrique tout : base temporaire (scripts/dev-seed.js, staging), serveur TMT (PORT, défaut 3999), serveur Trade Tracker
(TRADE_PORT, défaut 3980, TOTP activé sur base jetable). Chromium déjà installé (/opt/pw-browsers), rien à installer.
Viewport 390x844, thème sombre. Montre le code du dossier où le script est lancé (origin/staging, ou un worktree jetable)."""
import sys, os, json, re, time, shutil, tempfile, subprocess, hmac, hashlib, struct, base64, secrets, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = os.environ.get('PORT', '3999'); TPORT = os.environ.get('TRADE_PORT', '3980')
CHROME = os.environ.get('TT_CHROME', '/opt/pw-browsers/chromium')
# États de modules (PUT /api/profile/:id/modules). SOLO = un seul module installé ; TOUS = app normale (Communauté + Profil actifs).
TOUS = {'stats': True, 'stats-tasks': True, 'roadmap': True, 'calendar': True, 'ai': True, 'community': True, 'profile': True}
SOLO = {
    'chrono': {'stats': True, 'stats-tasks': False, 'roadmap': False, 'calendar': False, 'ai': False, 'community': False, 'profile': False},
    'objectifs': {'stats': False, 'stats-tasks': True, 'roadmap': True, 'calendar': True, 'ai': True, 'community': False, 'profile': False},
}
PAGES = ('chrono', 'objectifs', 'trade', 'communaute', 'reglages')


class Capture:
    def __init__(self):
        self.D = tempfile.mkdtemp(prefix='capture-')
        self.procs = []

    def close(self):
        for p in self.procs: p.terminate()
        shutil.rmtree(self.D, ignore_errors=True)

    def attendre(self, url):
        for _ in range(100):
            try:
                urllib.request.urlopen(url, timeout=1); return
            except Exception:
                time.sleep(0.2)
        raise RuntimeError('serveur injoignable : ' + url)

    def lancer(self, cmd, env):
        p = subprocess.Popen(cmd, cwd=ROOT, env=dict(os.environ, **env), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.procs.append(p); return p

    @staticmethod
    def totp(key):
        k = key.replace(' ', '').upper(); k = base64.b32decode(k + '=' * ((8 - len(k) % 8) % 8))
        h = hmac.new(k, struct.pack('>Q', int(time.time() // 30)), hashlib.sha1).digest(); o = h[-1] & 15
        return '%06d' % ((struct.unpack('>I', h[o:o + 4])[0] & 0x7fffffff) % 10 ** 6)

    def contexte(self, p, base, standalone=False):
        b = p.chromium.launch(executable_path=CHROME, timeout=90000)
        c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True,
                          base_url=base, locale='fr-CA', service_workers='block')
        if standalone:
            c.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
        return b, c

    # ---- TMT ----
    def demarrer_tmt(self):
        env = {'NOESIS_DATA_DIR': self.D + '/tmt', 'RAILWAY_ENVIRONMENT_NAME': 'staging'}
        os.makedirs(env['NOESIS_DATA_DIR'])
        seed = subprocess.run(['node', 'scripts/dev-seed.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
        m = re.search(r'Emilien id = (\S+)', seed.stdout)
        if not m: sys.exit('dev-seed sans id : ' + seed.stdout + seed.stderr)
        self.uid = m.group(1)
        # Activité riche « Scénarios Feuille de route (test) » (pôles, secteurs, tâches, objectifs) : staging seulement, données fictives.
        subprocess.run(['node', 'scripts/seed-scenarios.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
        self.lancer(['node', 'server/index.js'], dict(env, PORT=PORT))
        self.base = 'http://localhost:' + PORT
        self.attendre(self.base + '/api/health')

    def ouvrir_tmt(self, p, seed=None, modules=None):
        """Retourne (browser, page) connecté en Emilien, invites fermées, sur l'écran d'accueil."""
        b, c = self.contexte(p, self.base, standalone=True)
        prof = c.request.post('/api/profile/%s/verify-pin' % self.uid, data={'pin': '1234'}).json()
        pg = c.new_page(); pg.goto('/')
        pg.evaluate("([k,v])=>localStorage.setItem(k,v)", ['noesis_profile', json.dumps(prof)])
        if seed == 'precision': self.seed_precision(c)
        if modules is not None: c.request.put('/api/profile/%s/modules' % self.uid, data={'modules': modules})  # ex. Chrono seul
        pg.reload(); pg.wait_for_timeout(2500)
        self.fermer_invites(pg)
        return b, pg

    def seed_precision(self, c):
        act = c.request.get('/api/activities?userId=%s' % self.uid).json()
        act = act if isinstance(act, list) else act.get('activities', [])
        aid = act[0]['id']
        cats = c.request.post('/api/activities/%d/goals/categories' % aid, data={'label': 'Time Tracker'}).json()['categories']
        key = [x for x in cats if x.get('label') == 'Time Tracker'][0]['key']
        sec = c.request.post('/api/activities/%d/goals/categories/%s/secteurs' % (aid, key), data={'label': 'Précision des tâches générées'}).json()['secteurs']
        skey = [x for x in sec if x.get('label') == 'Précision des tâches générées'][0]['key']
        today = time.strftime('%Y-%m-%d')
        for t in ('Relire les corrections de la veille', 'Mesurer la précision sur le jeu d\'évaluation', 'Ajuster les consignes de reformulation'):
            c.request.post('/api/activities/%d/goals/categories/%s/tasks' % (aid, skey), data={'label': t, 'dueDate': today})

    @staticmethod
    def fermer_invites(pg):
        for _ in range(3):  # l'avis IA peut recouvrir l'invitation marketing : le plus haut d'abord
            for i in ('aiNoticeAck', 'marketingInviteNo'):
                if pg.locator('#' + i).is_visible():
                    pg.click('#' + i); pg.wait_for_timeout(500)

    def aller(self, pg, ecran):
        """Va à un écran TMT (chrono, objectifs, communaute, reglages)."""
        if ecran == 'chrono': pg.click('.tabBtn[data-tab=chrono]')
        elif ecran == 'objectifs': pg.click('.tabBtn[data-tab=goals]')
        elif ecran == 'communaute': pg.click('.tabBtn[data-tab=community]')
        elif ecran == 'reglages': pg.click('#profileSettingsBtn')
        else: raise ValueError('écran inconnu : ' + ecran)
        pg.wait_for_timeout(1200); self.fermer_invites(pg); pg.wait_for_timeout(1500)

    # ---- Trade ----
    def ouvrir_trade(self, p):
        secret = secrets.token_hex(16)
        env = {'PORT': TPORT, 'NOESIS_DATA_DIR': self.D + '/trade', 'TRADE_LINK_SECRET': secret, 'TRADE_TOKEN_KEY': secrets.token_hex(24),
               'TRADE_EXPERT_TMT_IDS': 'demo-expert'}
        os.makedirs(env['NOESIS_DATA_DIR'])
        seed = subprocess.run(['node', 'trade-tracker/seed-demo.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
        m = re.search(r'expert : (http\S+/link\?token=\S+)', seed.stdout)
        if not m: sys.exit('seed-demo Trade sans lien : ' + seed.stdout + seed.stderr)
        self.lancer(['node', 'trade-tracker/server/index.js'], env)
        base = 'http://127.0.0.1:' + TPORT
        self.attendre(base + '/api/health')
        b, c = self.contexte(p, base); pg = c.new_page()
        pg.goto(m.group(1).replace('localhost', '127.0.0.1'))
        # Sécurité Trade : TOTP obligatoire avant toute donnée ; activé avec la clé affichée (base jetable).
        pg.wait_for_selector('#totpKey')
        pg.fill('#enrollCode', self.totp(pg.inner_text('#totpKey'))); pg.click('#enrollCodeSend'); pg.wait_for_selector('#backupGrid')
        pg.click('#codesDone'); pg.wait_for_selector('#screen .card, #screen .stateScreen'); pg.wait_for_timeout(1500)
        return b, pg

    def page(self, p, nom):
        """Ouvre l'app sur la page `nom` et rend (browser, page)."""
        if nom == 'trade': return self.ouvrir_trade(p)
        self.demarrer_tmt() if not hasattr(self, 'uid') else None
        b, pg = self.ouvrir_tmt(p)
        self.aller(pg, nom)
        return b, pg


def jouer_etapes(pg, etapes):
    for e in etapes:
        if 'clic' in e: pg.click(e['clic'])
        elif 'remplir' in e: pg.fill(e['remplir'][0], e['remplir'][1])
        elif 'eval' in e: pg.evaluate(e['eval'])
        elif 'visible' in e: pg.wait_for_selector(e['visible'], state='visible', timeout=8000)
        elif 'appui_long' in e:
            box = pg.locator(e['appui_long']).bounding_box()
            x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up()
        elif 'recharger' in e: pg.reload(); pg.wait_for_timeout(3000); Capture.fermer_invites(pg)
        elif 'attendre' in e: pg.wait_for_timeout(e['attendre'])
        else: raise ValueError('étape inconnue : %r' % e)
