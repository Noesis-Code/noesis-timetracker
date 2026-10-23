"""Capture quasi instantanée d'un écran TMT (outil de dev, pas une fonction de l'app).
Un démon garde en arrière-plan : serveur de test + seed (capture_lib.Capture) et un Chromium déjà connecté en Emilien.
Chaque capture = nouvelle page dans ce navigateur chaud, navigation jusqu'à l'écran, CSS/JS injectés, PNG : ~1 à 3 s.
Rechargement à chaud : si un fichier de public/ a changé (mtime), le cache du navigateur est vidé ; le code est donc relu du disque sans redémarrer.

  python3 scripts/shot.py <écran> [--css f.css] [--js f.js] [--w 390|360] [--out f.png] [--hd]
  python3 scripts/shot.py --liste | --start | --stop | --status
  python3 scripts/shot.py --depuis communaute --etapes '[{"clic":"#whoami"},{"attendre":500}]' --out x.png   (écran sur mesure)
Le démon démarre seul à la première capture (et redémarre s'il est mort). Il montre le code du dossier où shot.py est lancé.
Ajouter un écran = 3 lignes dans ECRANS ci-dessous : 'nom': ('onglet de départ', [étapes], 'description').
Étapes (capture_lib.jouer_etapes) : clic, remplir, eval, visible, appui_long, attendre (ms, plafonné à ATT_MAX), recharger.
Sortie par défaut : <TMPDIR>/tmt-shot/<écran>-<largeur>.png (chemin affiché)."""
import sys, os, json, time, hashlib, tempfile, subprocess, argparse, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE = os.path.join(tempfile.gettempdir(), 'tmt-shot-' + hashlib.md5(ROOT.encode()).hexdigest()[:8])
OUTDIR = os.path.join(tempfile.gettempdir(), 'tmt-shot')
DPORT = int(os.environ.get('SHOT_PORT', '3990'))   # port du démon
os.environ.setdefault('PORT', '3997')              # port du serveur TMT de test (distinct de 3999 pour ne pas gêner les autres scripts)
ATT_MAX = 400                                      # une pause d'étape « attendre » ne dépasse pas ça (les scripts lents posent 1500-2500)

# ---- Écrans : nom -> (onglet de départ, étapes, description) ---- Onglets : chrono, objectifs, communaute, reglages.
POSE = {'attendre': 250}
RUN = "document.querySelector('#chronoRunning.hidden') && document.querySelector('.activityChoiceBtn').click()"
STATS = [{'eval': "TMT.openStats('chrono')"}, {'visible': '#tsPeriodBtn'}]
SCEN = '.goalsCaptureActivityChip:has-text("Scénarios")'
ECRANS = {
    'chrono': ('chrono', [], 'Chrono : choix de l\'activité'),
    'chrono-historique': ('chrono', [{'clic': '#chronoHistoryHeader'}, POSE], 'Historique de la semaine'),
    'chrono-stats': ('chrono', [{'eval': "TMT.openStats('chrono')"}, {'attendre': 1500}], 'Statistiques du temps (camembert)'),
    'chrono-partagees': ('chrono', [{'eval': "TMT.openStats('chrono')"}, {'visible': '#statsVisBtn'}, {'clic': '#statsVisBtn'}, POSE], 'Statistiques : menu de visibilité (Tous / partagées)'),
    'chrono-en-cours': ('chrono', [{'eval': RUN}, {'attendre': 800}], 'Chrono en marche'),
    'confirmer-arret': ('chrono', [{'eval': RUN}, {'attendre': 800}, {'clic': '#stopBtn'}, {'visible': '#stopConfirmPanel'}, {'attendre': 500},
                                   {'eval': 'document.activeElement && document.activeElement.blur()'}], 'Confirmer l\'arrêt'),
    'feuille-mois': ('chrono', STATS + [{'clic': '#tsPeriodBtn'}, {'clic': '#tsPeriodMenu [data-period=month]'}, {'attendre': 400}], 'Feuille de temps : mois'),
    'feuille-annee': ('chrono', STATS + [{'clic': '#tsPeriodBtn'}, {'clic': '#tsPeriodMenu [data-period=year]'}, {'attendre': 400}], 'Feuille de temps : année'),
    'communaute-fil': ('communaute', [], 'Communauté : fil et cercles de découverte'),
    'communaute-recherche': ('communaute', [{'remplir': ['#communitySearchInput', 'Léo']}, {'clic': '#communitySearchBtn'}, POSE], 'Recherche de membres'),
    'communaute-profil': ('communaute', [{'remplir': ['#communitySearchInput', 'Léo']}, {'clic': '#communitySearchBtn'}, POSE,
                                         {'clic': '#communitySearchResults >> text=Léo >> nth=0'}, POSE], 'Profil d\'un membre'),
    'communaute-mon-profil': ('communaute', [{'clic': '#whoami'}, POSE], 'Mon profil'),
    'communaute-abonnements': ('communaute', [{'clic': '#whoami'}, POSE, {'clic': '#profileFollowsBtn'}, POSE], 'Abonnements et abonnés'),
    'communaute-notifications': ('communaute', [{'clic': '#whoami'}, POSE, {'clic': '#profileNotifBtn'}, POSE], 'Notifications'),
    'objectifs': ('objectifs', [], 'Objectifs : Page 1, capture d\'une tâche'),
    'objectifs-poles': ('objectifs', [{'clic': SCEN}, POSE], 'Objectifs : Page 2, pôles'),
    'objectifs-avancement': ('objectifs', [{'clic': SCEN}, POSE, {'clic': 'text=Avancement quotidien'}, POSE], 'Objectifs : avancement quotidien'),
    'objectifs-periode': ('objectifs', [{'clic': SCEN}, POSE, {'clic': '.goalsDotBtn:visible >> nth=1'}, POSE], 'Objectifs : arbre périodique'),
    'objectifs-annee': ('objectifs', [{'clic': SCEN}, POSE, {'clic': '.goalsDotBtn:visible >> nth=2'}, POSE], 'Objectifs : grille annuelle'),
    'reglages': ('reglages', [], 'Réglages'),
    # exemple : 'stats-taches': ('objectifs', [{'eval': "TMT.openStats('goals', 2)"}, {'attendre': 1500}], 'Statistiques des tâches'),
}
TABS = {'chrono': '.tabBtn[data-tab=chrono]', 'objectifs': '.tabBtn[data-tab=goals]', 'communaute': '.tabBtn[data-tab=community]', 'reglages': '#profileSettingsBtn'}


# =============================== DÉMON ===============================
def demon():
    sys.path.insert(0, HERE)
    from capture_lib import Capture, TOUS, jouer_etapes, sync_playwright
    from http.server import HTTPServer, BaseHTTPRequestHandler
    cap = Capture(); cap.demarrer_tmt()
    pw = sync_playwright().start()
    br = pw.chromium.launch(executable_path=os.environ.get('TT_CHROME', '/opt/pw-browsers/chromium'), timeout=90000)
    ctxs = {}

    def contexte(w, dsf):
        k = (w, dsf)
        if k not in ctxs:
            c = br.new_context(viewport={'width': w, 'height': 844}, device_scale_factor=dsf, has_touch=True, is_mobile=True,
                               base_url=cap.base, locale='fr-CA', service_workers='block')
            c.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
            # L'écran de démarrage impose ~2,5 s d'ident : on le masque et on attend le signal « app prête » (window.hideBootSplash) à la place.
            c.add_init_script("Object.defineProperty(window,'hideBootSplash',{configurable:true,set(){},get(){return ()=>{window.__appPrete=1}}});"
                              "document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='#bootSplash{display:none!important}';document.head.appendChild(st)});")
            prof = c.request.post('/api/profile/%s/verify-pin' % cap.uid, data={'pin': '1234'}).json()
            c.request.put('/api/profile/%s/modules' % cap.uid, data={'modules': TOUS})
            p0 = c.new_page(); p0.goto('/')
            p0.evaluate("([k,v])=>localStorage.setItem(k,v)", ['noesis_profile', json.dumps(prof)])
            p0.close(); ctxs[k] = c
        return ctxs[k]

    vu = [0]
    def code_modifie():
        m = 0
        for d, _, fs in os.walk(os.path.join(ROOT, 'public')):
            for f in fs:
                if f.endswith(('.js', '.css', '.html')):
                    try: m = max(m, os.stat(os.path.join(d, f)).st_mtime)
                    except OSError: pass
        ch = m != vu[0]; vu[0] = m; return ch

    def invites(pg):  # ferme l'avis IA puis l'invitation marketing s'ils sont là (version rapide de Capture.fermer_invites)
        for _ in range(3):
            if not pg.evaluate("""['aiNoticeAck','marketingInviteNo'].some(i=>{const e=document.getElementById(i);if(e&&e.offsetParent!==null){e.click();return true}})"""): return
            pg.wait_for_timeout(150)

    def prete(pg):
        pg.goto('/', wait_until='load')
        pg.wait_for_selector('.tabBtn[data-tab=chrono]', state='visible', timeout=15000)
        pg.wait_for_function('window.__appPrete', timeout=15000); pg.wait_for_timeout(150)  # app prête (signal de hideBootSplash)
        invites(pg)

    def capturer(req):
        t0 = time.time(); ph = []
        def mark(n): ph.append('%s=%d' % (n, (time.time() - t0) * 1000))
        w, dsf = int(req.get('w', 390)), (2 if req.get('hd') else 1)
        if req.get('ecran') in ECRANS and not req.get('etapes'):
            onglet, etapes, _ = ECRANS[req['ecran']]
        else:
            onglet, etapes = req.get('depuis', 'chrono'), json.loads(req.get('etapes') or '[]')
        c = contexte(w, dsf)
        pg = c.new_page(); pg.set_default_timeout(8000)
        try:
            cdp = c.new_cdp_session(pg)
            if code_modifie(): cdp.send('Network.clearBrowserCache')  # public/ a changé sur disque : on repart d'un cache vide (sinon cache chaud, plus rapide)
            mark('cdp'); prete(pg); mark('charge')
            if onglet != 'chrono':
                pg.dispatch_event(TABS[onglet], 'click'); mark('clic'); pg.wait_for_timeout(500 if onglet == 'objectifs' else 200); mark('att'); invites(pg)
            mark('onglet')
            if req.get('css'): pg.add_style_tag(content=req['css'])
            if req.get('js'): pg.evaluate(req['js'])
            for e in etapes:  # clic par événement (sans les contrôles d'actionnabilité de Playwright : gagne ~1 s par clic) ; le reste vient de capture_lib
                if 'clic' in e: pg.dispatch_event(e['clic'], 'click')
                else: jouer_etapes(pg, [dict(e, attendre=min(e['attendre'], ATT_MAX)) if 'attendre' in e else e])
            if req.get('css'): pg.add_style_tag(content=req['css'])  # le DOM recréé par les étapes garde ainsi la couche
            mark('etapes'); pg.wait_for_timeout(100)
            out = req['out']; os.makedirs(os.path.dirname(out), exist_ok=True)
            pg.screenshot(path=out); mark('png')
        finally:
            pg.close()
            try: c.request.post('/api/timer/stop', data={})  # un chrono resté en marche fausserait la capture suivante
            except Exception: pass
        return {'ok': True, 'out': req['out'], 'ms': int((time.time() - t0) * 1000), 'phases': ' '.join(ph)}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def rep(self, code, obj):
            b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            self.rep(200, {'ok': True, 'pid': os.getpid(), 'root': ROOT, 'tmt': cap.base, 'ecrans': sorted(ECRANS)})
        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            if self.path == '/stop':
                self.rep(200, {'ok': True}); self.wfile.flush(); raise SystemExit
            try: self.rep(200, capturer(req))
            except Exception as e: self.rep(500, {'ok': False, 'erreur': str(e).splitlines()[0] if str(e) else repr(e)})

    srv = HTTPServer(('127.0.0.1', DPORT), H)
    try:
        srv.serve_forever()
    finally:
        try: br.close(); pw.stop()
        except Exception: pass
        cap.close()


# =============================== CLIENT ===============================
def appel(chemin, obj=None, timeout=60):
    url = 'http://127.0.0.1:%d%s' % (DPORT, chemin)
    rq = urllib.request.Request(url, data=json.dumps(obj).encode() if obj is not None else None, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(rq, timeout=timeout) as r: return json.loads(r.read())


def statut():
    try: return appel('/', timeout=2)
    except Exception: return None


def demarrer():
    s = statut()
    if s and s.get('root') != ROOT:
        sys.exit('Un démon d\'un autre dépôt (%s) occupe le port %d : --stop dans ce dépôt ou SHOT_PORT=autre.' % (s['root'], DPORT))
    if s: return s
    os.makedirs(STATE, exist_ok=True)
    log = open(os.path.join(STATE, 'demon.log'), 'w')
    subprocess.Popen([sys.executable, os.path.abspath(__file__), '--demon'], cwd=ROOT, stdout=log, stderr=log, start_new_session=True)
    for _ in range(150):
        time.sleep(0.2)
        s = statut()
        if s: return s
    sys.exit('Démon injoignable, voir ' + os.path.join(STATE, 'demon.log'))


def main():
    a = argparse.ArgumentParser(description='Capture rapide TMT')
    a.add_argument('ecran', nargs='?'); a.add_argument('--css'); a.add_argument('--js'); a.add_argument('--w', type=int, default=390, choices=(390, 360))
    a.add_argument('--out'); a.add_argument('--hd', action='store_true', help='x2 (780 px de large)'); a.add_argument('--depuis', help='onglet de départ (écran sur mesure)')
    a.add_argument('--etapes', help='étapes JSON (écran sur mesure)')
    a.add_argument('--start', action='store_true'); a.add_argument('--stop', action='store_true'); a.add_argument('--status', action='store_true')
    a.add_argument('--liste', action='store_true'); a.add_argument('--demon', action='store_true')
    o = a.parse_args()
    if o.demon: return demon()
    if o.liste:
        for k, v in ECRANS.items(): print('%-26s %s' % (k, v[2]))
        return
    if o.status:
        s = statut(); print(('démon actif pid %s, TMT %s, dépôt %s' % (s['pid'], s['tmt'], s['root'])) if s else 'démon arrêté'); return
    if o.stop:
        if statut():
            try: appel('/stop', {}, timeout=5)
            except Exception: pass
            for _ in range(50):  # attendre que le démon ET son serveur TMT aient libéré leurs ports
                time.sleep(0.2)
                try: urllib.request.urlopen('http://localhost:%s/api/health' % os.environ['PORT'], timeout=1)
                except Exception:
                    if not statut(): break
            print('démon arrêté')
        else: print('démon déjà arrêté')
        return
    if o.start:
        s = demarrer(); print('démon actif pid %s, TMT %s' % (s['pid'], s['tmt'])); return
    if not o.ecran and not o.etapes: a.error('écran requis (--liste pour les voir)')
    if o.ecran and o.ecran not in ECRANS and not o.etapes: a.error('écran inconnu : %s (--liste)' % o.ecran)
    t0 = time.time(); demarrer()
    nom = o.ecran or 'sur-mesure'
    req = {'ecran': o.ecran, 'w': o.w, 'hd': o.hd, 'depuis': o.depuis or 'chrono', 'etapes': o.etapes,
           'out': os.path.abspath(o.out or os.path.join(OUTDIR, '%s-%d.png' % (nom, o.w))),
           'css': open(o.css, encoding='utf-8').read() if o.css else None, 'js': open(o.js, encoding='utf-8').read() if o.js else None}
    try: r = appel('/capture', req)
    except urllib.error.HTTPError as e: r = json.loads(e.read())
    except Exception:  # démon mort en cours de route : un redémarrage et un seul essai
        demarrer(); r = appel('/capture', req)
    if not r.get('ok'): sys.exit('échec : ' + r.get('erreur', '?'))
    if os.environ.get('SHOT_DEBUG'): print(r.get('phases'))
    print('%s  (%d ms démon, %d ms total)' % (r['out'], r['ms'], (time.time() - t0) * 1000))


if __name__ == '__main__':
    main()
