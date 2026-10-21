"""Captures 390 px : UNE image PAR PAGE de CHAQUE module, + captures d'éléments précis (voir docs/fonctionnalites/captures-chantiers.md).
Usage :
  python3 scripts/capture-pages.py --toutes [code ...] [--sortie dossier]     un PNG par page ; codes : chrono objectifs communaute reglages trade (défaut : tous)
  python3 scripts/capture-pages.py --element --liste                          éléments connus (pop-ups, menus, confirmations)
  python3 scripts/capture-pages.py --element <identifiant> [...]              un PNG par élément, dans docs/img/chantiers/elements/
  python3 scripts/capture-pages.py --element "Nom lisible" --depuis chrono --etapes '[{"clic":"#x"},{"attendre":800}]'   élément sur mesure
Chrono et Objectifs sont capturés « comme seul module installé » (état de modules SOLO de capture_lib.py : barre à un seul volet) ;
Communauté et Réglages dans l'app normale ; Trade Tracker = son app autonome (trade-tracker/). Thème sombre, 390x844 (x2 réduit en 390 de large).
Sortie : docs/img/chantiers/<code>/<nn>-<slug>.png et docs/img/chantiers/manifest.json. Données : scripts/dev-seed.js + scripts/seed-scenarios.js
(fictives), seed-demo.js pour Trade. Rien n'est modifié dans public/."""
import sys, os, io, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture_lib import Capture, ROOT, SOLO, TOUS, TPORT, jouer_etapes, sync_playwright
try:
    from PIL import Image
except ImportError:
    Image = None

CODES = ('chrono', 'objectifs', 'communaute', 'reglages', 'trade')
OUT_DEFAUT = os.path.join(ROOT, 'docs', 'img', 'chantiers')
SCEN = '.goalsCaptureActivityChip:has-text("Scénarios")'
POSE = {'attendre': 1500}

# ---- Pages TMT : (slug, nom lisible, étapes depuis l'écran d'accueil du module) ----
CHRONO = [
    ('accueil', 'Chrono : choix de l\'activité', []),
    ('historique', 'Historique de la semaine', [{'clic': '#chronoHistoryHeader'}, POSE]),
    ('statistiques', 'Statistiques du temps (camembert)', [{'eval': "TMT.openStats('chrono')"}, {'attendre': 2500}]),
    ('en-cours', 'Chrono en marche', [{'eval': "document.querySelector('#chronoRunning.hidden') && document.querySelector('.activityChoiceBtn').click()"}, POSE]),
    ('confirmer-arret', 'Confirmer l\'arrêt', [{'eval': "document.querySelector('#chronoRunning.hidden') && document.querySelector('.activityChoiceBtn').click()"}, POSE, {'clic': '#stopBtn'}, {'attendre': 2000}, {'eval': 'document.activeElement && document.activeElement.blur()'}]),
]
OBJECTIFS = [
    ('capture', 'Page 1 : capture d\'une tâche', []),
    ('poles', 'Page 2 : pôles et avancement quotidien', [{'clic': SCEN}, POSE]),
    ('alerte-plafond', 'Page 2 : alerte « plafond atteint » dépliée', [{'clic': SCEN}, POSE, {'clic': '.goalsAlertToggle >> nth=0'}, POSE]),
    ('avancement-quotidien', 'Page 2 : avancement quotidien (tâches du jour)', [{'clic': SCEN}, POSE, {'clic': 'text=Avancement quotidien'}, POSE]),
    ('pole-deplie', 'Page 2 : un pôle déplié (ses tâches)', [{'clic': SCEN}, POSE, {'clic': 'text=Juridique >> nth=0'}, POSE]),
    ('archives', 'Page 2 : archives', [{'clic': SCEN}, POSE, {'clic': 'text=Archives'}, POSE]),
    ('periode-arbre', 'Page 2 : objectif périodique et hebdomadaires', [{'clic': SCEN}, POSE, {'clic': '.goalsDotBtn:visible >> nth=1'}, POSE]),
    ('annee', 'Page 2 : grille annuelle', [{'clic': SCEN}, POSE, {'clic': '.goalsDotBtn:visible >> nth=2'}, POSE]),
    ('strategie', 'Stratégie de l\'activité', [{'clic': SCEN}, POSE, {'clic': '#goalsStrategyBtn'}, {'attendre': 3500}]),
    ('stats-taches', 'Statistiques des tâches', [{'eval': "TMT.openStats('goals', 2)"}, {'attendre': 2500}]),
    ('stats-objectifs', 'Statistiques des objectifs', [{'eval': "TMT.openStats('goals', 3)"}, {'attendre': 2500}]),
]
COMMUNAUTE = [
    ('accueil', 'Communauté : fil et cercles de découverte', []),
    ('recherche', 'Recherche de membres : résultats', [{'remplir': ['#communitySearchInput', 'Léo']}, {'clic': '#communitySearchBtn'}, POSE]),
    ('profil-membre', 'Profil d\'un membre (visite)', [{'remplir': ['#communitySearchInput', 'Léo']}, {'clic': '#communitySearchBtn'}, POSE, {'clic': '#communitySearchResults >> text=Léo >> nth=0'}, POSE]),
    ('profil', 'Mon profil', [{'clic': '#whoami'}, POSE]),
    ('abonnements', 'Profil : abonnements et abonnés', [{'clic': '#whoami'}, POSE, {'clic': '#profileFollowsBtn'}, POSE]),
    ('notifications', 'Profil : notifications', [{'clic': '#whoami'}, POSE, {'clic': '#profileNotifBtn'}, POSE]),
]
# Réglages : une page par section (générée à l'exécution), en plus de l'en-tête.
ELEMENTS = {
    'confirmation-suppression': ('Fenêtre de confirmation TMT.ui.confirm (suppression d\'un enregistrement)', 'chrono',
                                 [{'clic': '#chronoHistoryHeader'}, POSE, {'clic': '#historyList .historyRowIconBtn:not(.danger) >> nth=0'}, POSE, {'clic': '#historyList .historyRowIconBtn.danger'}, {'attendre': 1200}]),
    'menu-epingle': ('Menu de l\'épingle (pièce jointe / sondage) dans la discussion du profil', 'communaute',
                     [{'clic': '#whoami'}, POSE, {'clic': '#profileDiscussionAttachBtn'}, {'attendre': 1000}]),
    'popup-barre': ('Pop-up « Ajouter à la barre » (bouton + de la barre des volets ; Communauté retirée de la barre pour le montrer)', 'tous',
                    [{'eval': "localStorage.setItem('noesis-bar:' + TMT.getProfile().id, '[\"chrono\",\"goals\"]')"}, {'recharger': 1}, {'clic': '#tabbarAdd'}, {'attendre': 1000}]),
}


def reduire(png_bytes, chemin):
    """PNG 390 px de large, quantifié si > 250 Ko, puis JPEG q80 en dernier recours (chemin .jpg alors rendu)."""
    if Image is None:
        open(chemin, 'wb').write(png_bytes); return chemin
    im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    im = im.resize((390, round(im.height * 390 / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    if buf.tell() > 250 * 1024:
        buf = io.BytesIO(); im.quantize(128, method=Image.MEDIANCUT, dither=Image.NONE).save(buf, 'PNG', optimize=True)
    open(chemin, 'wb').write(buf.getvalue()); return chemin


def retour_accueil(cap, pg, code):
    pg.reload(); pg.wait_for_timeout(2500); cap.fermer_invites(pg)
    if code == 'objectifs':  # démarrage à froid en « Objectifs seul » : TMT.loadGoalsTab n'existe pas encore à l'ouverture (erreur console) ; on rouvre l'onglet à la main
        pg.evaluate("TMT.switchTab('goals')"); pg.wait_for_timeout(2500); cap.fermer_invites(pg)
    if code == 'communaute': cap.aller(pg, 'communaute')
    elif code == 'reglages': cap.aller(pg, 'reglages')


def nom_fichier(out, code, n, slug): return os.path.join(out, code, '%02d-%s.png' % (n, slug))


def sections_reglages(pg):
    """Liste (index, titre, titre du groupe parent ou None) des sections visibles de Réglages."""
    return pg.evaluate("""()=>[...document.querySelectorAll('#profileSettingsPanel .settingsSectionHeader')].map((h,i)=>{
      const g=h.closest('.settingsGroup'); const gh=g&&g.querySelector(':scope>.settingsSectionHeader');
      return [i, h.innerText.trim().split('\\n')[0], gh&&gh!==h?gh.innerText.trim().split('\\n')[0]:null, h.offsetParent!==null||!!gh]})""")


def capturer_tmt(cap, p, code, out, manifest):
    solo = SOLO.get(code)
    b, pg = cap.ouvrir_tmt(p, modules=solo or TOUS)
    pg.set_default_timeout(8000)
    n = 0
    def enreg(slug, nom):
        nonlocal n
        n += 1
        os.makedirs(os.path.join(out, code), exist_ok=True)
        f = nom_fichier(out, code, n, slug)
        reduire(pg.screenshot(), f)
        manifest.setdefault(code, []).append({'nom': nom, 'fichier': os.path.relpath(f, out).replace(os.sep, '/')})
        print('OK', f, flush=True)
    if code in ('chrono', 'objectifs', 'communaute'):
        spec = {'chrono': CHRONO, 'objectifs': OBJECTIFS, 'communaute': COMMUNAUTE}[code]
        for i, (slug, nom, etapes) in enumerate(spec):
            retour_accueil(cap, pg, code)
            try:
                jouer_etapes(pg, etapes); pg.wait_for_timeout(800); enreg(slug, nom)
            except Exception as e:
                print('MANQUE %s/%s : %s' % (code, slug, str(e).splitlines()[0])); manifest.setdefault('_manquant', []).append('%s/%s' % (code, slug))
    elif code == 'reglages':
        retour_accueil(cap, pg, 'reglages')
        enreg('en-tete', 'Réglages : activités et liste des sections')
        for idx, titre, groupe, _vis in sections_reglages(pg):
            retour_accueil(cap, pg, 'reglages')
            try:
                if groupe:
                    pg.evaluate("t=>[...document.querySelectorAll('#profileSettingsPanel .settingsGroup>.settingsSectionHeader')].find(h=>h.innerText.trim().startsWith(t)).click()", groupe); pg.wait_for_timeout(500)
                pg.evaluate("i=>document.querySelectorAll('#profileSettingsPanel .settingsSectionHeader')[i].click()", idx); pg.wait_for_timeout(900)
                pg.evaluate("i=>document.querySelectorAll('#profileSettingsPanel .settingsSectionHeader')[i].scrollIntoView({block:'start'})", idx); pg.wait_for_timeout(500)
                slug = re.sub(r'[^a-z0-9]+', '-', titre.lower().replace('é', 'e').replace('è', 'e').replace('ê', 'e')).strip('-')
                enreg(slug, 'Réglages : ' + titre)
            except Exception as e:
                print('MANQUE reglages/%s : %s' % (titre, str(e).splitlines()[0])); manifest.setdefault('_manquant', []).append('reglages/' + titre)
    try: pg.context.request.post(cap.base + '/api/timer/stop', data={})  # un chrono resté en marche fausserait les modules suivants
    except Exception: pass
    b.close()


def capturer_trade(cap, p, out, manifest):
    """Trade Tracker autonome : chaque route (#/<écran>) après l'activation TOTP (base jetable). L'écran d'activation lui-même est capturé avant."""
    code = 'trade'
    import secrets, subprocess
    from capture_lib import TPORT as TP
    secret = secrets.token_hex(16)
    env = {'PORT': TP, 'NOESIS_DATA_DIR': cap.D + '/trade', 'TRADE_LINK_SECRET': secret, 'TRADE_TOKEN_KEY': secrets.token_hex(24), 'TRADE_EXPERT_TMT_IDS': 'demo-expert'}
    os.makedirs(env['NOESIS_DATA_DIR'])
    seed = subprocess.run(['node', 'trade-tracker/seed-demo.js'], cwd=ROOT, env=dict(os.environ, **env), capture_output=True, text=True)
    m = re.search(r'expert : (http\S+/link\?token=\S+)', seed.stdout)
    if not m: sys.exit('seed-demo Trade sans lien : ' + seed.stdout + seed.stderr)
    cap.lancer(['node', 'trade-tracker/server/index.js'], env)
    base = 'http://127.0.0.1:' + TP
    cap.attendre(base + '/api/health')
    b, c = cap.contexte(p, base); pg = c.new_page()
    n = 0
    def enreg(slug, nom):
        nonlocal n
        n += 1
        os.makedirs(os.path.join(out, code), exist_ok=True)
        f = nom_fichier(out, code, n, slug)
        reduire(pg.screenshot(), f)
        manifest.setdefault(code, []).append({'nom': nom, 'fichier': os.path.relpath(f, out).replace(os.sep, '/')})
        print('OK', f)
    pg.goto(m.group(1).replace('localhost', '127.0.0.1'))
    pg.wait_for_selector('#totpKey'); pg.wait_for_timeout(800)
    enreg('activation-totp', 'Premier accès : activation de la vérification en deux étapes')
    pg.fill('#enrollCode', cap.totp(pg.inner_text('#totpKey'))); pg.click('#enrollCodeSend'); pg.wait_for_selector('#backupGrid'); pg.wait_for_timeout(600)
    enreg('codes-secours', 'Premier accès : codes de secours')
    pg.click('#codesDone'); pg.wait_for_selector('#screen .card, #screen .stateScreen'); pg.wait_for_timeout(1500)
    for slug, nom in (('dashboard', 'Accueil'), ('positions', 'Positions'), ('allocation', 'Répartition'), ('history', 'Historique'), ('expert', 'Expert'),
                      ('settings', 'Réglages'), ('security', 'Sécurité'), ('broker', 'Connecter mon courtier'), ('invite', 'Invitation'), ('sync', 'Synchronisation')):
        try:
            pg.evaluate("h=>{location.hash='#/'+h}", slug); pg.wait_for_timeout(1800)
            enreg(slug, 'Trade Tracker : ' + nom)
        except Exception as e:
            print('MANQUE trade/%s : %s' % (slug, str(e).splitlines()[0])); manifest.setdefault('_manquant', []).append('trade/' + slug)
    b.close()


def capturer_element(cap, p, nom, depuis, etapes, out, slug):
    code = depuis
    solo = SOLO.get(code)
    b, pg = cap.ouvrir_tmt(p, modules=solo or TOUS)
    pg.set_default_timeout(8000)
    retour_accueil(cap, pg, code)
    jouer_etapes(pg, etapes); pg.wait_for_timeout(600)
    os.makedirs(out, exist_ok=True)
    f = os.path.join(out, slug + '.png'); reduire(pg.screenshot(), f); print('OK', f)
    b.close(); return {'nom': nom, 'fichier': 'elements/' + slug + '.png'}


def main(argv):
    out = OUT_DEFAUT
    if '--sortie' in argv:
        i = argv.index('--sortie'); out = os.path.abspath(argv[i + 1]); del argv[i:i + 2]
    if '--element' in argv:
        argv.remove('--element')
        if '--liste' in argv or not argv:
            for k, (nom, dep, _) in ELEMENTS.items(): print('%-26s %s  [%s]' % (k, nom, dep))
            return
        depuis = None; etapes = None
        if '--depuis' in argv: i = argv.index('--depuis'); depuis = argv[i + 1]; del argv[i:i + 2]
        if '--etapes' in argv: i = argv.index('--etapes'); etapes = json.loads(argv[i + 1]); del argv[i:i + 2]
        eout = os.path.join(out, 'elements'); cap = Capture(); res = []
        try:
            cap.demarrer_tmt()
            with sync_playwright() as p:
                for a in argv:
                    if a in ELEMENTS: nom, dep, et = ELEMENTS[a]; slug = a
                    elif etapes is not None and (depuis in CODES or depuis == 'tous'):
                        nom, dep, et = a, depuis, etapes; slug = re.sub(r'[^a-z0-9]+', '-', a.lower()).strip('-') or 'element'
                    else: sys.exit('Élément inconnu : %s (voir --element --liste ; sur mesure : --depuis <code> --etapes \'[...]\')' % a)
                    res.append(capturer_element(cap, p, nom, dep, et, eout, slug))
        finally:
            cap.close()
        return
    if '--toutes' not in argv: sys.exit(__doc__)
    argv.remove('--toutes')
    codes = argv or list(CODES)
    for c in codes:
        if c not in CODES: sys.exit('code inconnu : ' + c)
    mpath = os.path.join(out, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    manifest.pop('_manquant', None)
    cap = Capture()
    try:
        with sync_playwright() as p:
            for c in codes:
                manifest[c] = []
                if c == 'trade': capturer_trade(cap, p, out, manifest)
                else:
                    if not hasattr(cap, 'uid'): cap.demarrer_tmt()
                    capturer_tmt(cap, p, c, out, manifest)
    finally:
        cap.close()
    manque = manifest.pop('_manquant', None)
    os.makedirs(out, exist_ok=True)
    ordre = {k: manifest[k] for k in CODES if k in manifest}
    json.dump(ordre, open(mpath, 'w'), ensure_ascii=False, indent=1); open(mpath, 'a').write('\n')
    print('manifest : ' + mpath + ' ; manquants : ' + (', '.join(manque) if manque else 'aucun'))


main(sys.argv[1:])
