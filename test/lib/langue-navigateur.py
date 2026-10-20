"""Parcours navigateur réel (Chromium via Playwright) pour test/langue-bascule-test.js — Basic n°19.
Usage : python3 langue-navigateur.py <base_url> <chemin_chromium>   -> JSON sur stdout : {"etats": {nom: [textes]}, "infos": {...}}
Bascule FR -> EN chrono démarré (vrai bouton de langue, rechargement), parcourt Chrono / Historique / Statistiques en EN,
revient en FR et vérifie que le chrono n'a pas été perdu. Les noms (profil, activités, notes) sont volontairement ANGLAIS neutres :
tout texte français visible en mode EN vient donc de l'application."""
import sys, json, urllib.request
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

base, chromium = sys.argv[1], sys.argv[2]

def api(path, data, cookie=None, method='POST'):
    req = urllib.request.Request(base + path, data=json.dumps(data).encode(), method=method,
                                 headers={'Content-Type': 'application/json', **({'Cookie': cookie} if cookie else {})})
    r = urllib.request.urlopen(req)
    return json.loads(r.read()), '; '.join(c.split(';')[0] for c in r.headers.get_all('Set-Cookie') or [])

prof, cookie = api('/api/profile', {'name': 'Zoe', 'lastName': 'Lang', 'phone': '5145550111', 'email': 'zoe@exemple.test', 'pin': '1234', 'termsAccepted': True})
uid = prof['id']
work, _ = api('/api/activities', {'name': 'Work'}, cookie)
api('/api/activities', {'name': 'Study'}, cookie)
pole = api('/api/activities/%d/goals/categories' % work['id'], {'label': 'Deep work'}, cookie)[0]['categories'][0]['key']
now = datetime.now(timezone.utc)
def iso(d): return d.strftime('%Y-%m-%dT%H:%M:%S.000Z')
for days, note in ((1, 'first note'), (2, 'second note')):
    s = now - timedelta(days=days, hours=3)
    api('/api/history', {'activityId': work['id'], 'startTime': iso(s), 'endTime': iso(s + timedelta(hours=1)), 'note': note, 'category': pole}, cookie)

JS_TEXT = """() => { const out = []; const hidden = (el) => { for (let p = el; p; p = p.parentElement) { if (p.classList && p.classList.contains('hidden')) return true; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return true; } return false; };
 const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
 while ((n = w.nextNode())) { const t = n.nodeValue.trim(); const el = n.parentElement; if (!t || !el || el.closest('script,style,noscript') || hidden(el)) continue; out.push(t); }
 document.querySelectorAll('[placeholder],[title],[aria-label],option').forEach((e) => { if (hidden(e)) return;
   ['placeholder', 'title', 'aria-label'].forEach((a) => { const v = e.getAttribute(a); if (v && v.trim()) out.push(v.trim()); }); });
 return out; }"""

etats, infos = {}, {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=chromium)
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, base_url=base)
    c.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
    pj = c.request.post('/api/profile/%s/verify-pin' % uid, data={'pin': '1234'}).json()
    pg = c.new_page()
    pg.on('dialog', lambda d: d.accept())
    pg.goto('/')
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)", ['noesis_profile', json.dumps(pj)])
    pg.reload(); pg.wait_for_timeout(2500)
    def grab(name): etats[name] = pg.evaluate(JS_TEXT)
    def tab(name): pg.click('.tabBtn[data-tab=%s]' % name); pg.wait_for_timeout(900)
    def click(sel, wait=500):
        try: pg.click(sel, timeout=3000); pg.wait_for_timeout(wait); return True
        except Exception: return False

    # 1. Chrono démarré en français
    pg.locator('#activityButtons button', has_text='Work').click(); pg.wait_for_timeout(1000)
    infos['startFr'] = pg.inner_text('#liveTimer')
    # 2. Bascule vers l'anglais par le vrai bouton de langue (enregistrement serveur puis rechargement de la page)
    with pg.expect_navigation():
        pg.evaluate("document.querySelector('#langSwitch [data-lang-choice=en]').click()")
    pg.wait_for_timeout(3000)
    infos['langEn'] = pg.evaluate("document.documentElement.lang")
    infos['runningEn'] = pg.is_visible('#chronoRunning')
    infos['activityEn'] = pg.inner_text('#runningActivityLabel') if pg.is_visible('#runningActivityLabel') else ''
    infos['timerEn'] = pg.inner_text('#liveTimer')
    grab('chrono en cours')
    # 3. Historique (entrées avec note et pôle), menus et édition
    click('#chronoHistoryHeader', 900); grab('historique')
    if click('#historyList .historyRowIconBtn:not(.danger) >> nth=0', 800): grab('historique modification')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    click('#historyPrevWeek', 700); grab('historique semaine précédente')
    click('#chronoHistoryHeader', 400)
    # 4. Récapitulatif d'arrêt, erreur serveur, annulation
    click('#stopBtn', 800); grab('arrêt')
    pg.fill('#stopEndTimeInput', '00:00:01'); pg.fill('#stopEndDateInput', '2020-01-01')
    click('#stopConfirmBtn', 900); grab('arrêt refusé')
    click('#stopCancelBtn', 500)
    infos['runningAfterCancel'] = pg.is_visible('#chronoRunning')
    # 5. Statistiques : feuille de temps, périodes, répartition, graphique, filtre
    tab('stats'); grab('statistiques')
    for name, sel in (('menu période', '#tsPeriodBtn'), ('menu graphique', '#chartPeriodBtn'), ('filtre', '#statsVisBtn')):
        if click(sel, 500): grab('statistiques ' + name); pg.keyboard.press('Escape'); click('#statsLabel', 200)
    for per in ('month', 'year'):
        click('#tsPeriodBtn', 300); click('#tsPeriodMenu [data-period=%s]' % per, 1000); grab('statistiques ' + per)
    click('#statsPieTodayBtn', 800); grab('statistiques aujourd’hui')
    click('#tsPrevWeek', 800); grab('statistiques période précédente')
    # 6. Retour en français : le chrono tourne toujours (un seul chrono, pas de perte)
    tab('chrono')
    with pg.expect_navigation():
        pg.evaluate("document.querySelector('#langSwitch [data-lang-choice=fr]').click()")
    pg.wait_for_timeout(3000)
    infos['langFr'] = pg.evaluate("document.documentElement.lang")
    infos['runningFr'] = pg.is_visible('#chronoRunning')
    infos['timerFr'] = pg.inner_text('#liveTimer')
    grab('retour français: chrono')
    click('#chronoHistoryHeader', 900); grab('retour français: historique')
    tab('stats'); grab('retour français: statistiques')
    b.close()
status = json.loads(urllib.request.urlopen(urllib.request.Request(base + '/api/timer/status', headers={'Cookie': cookie})).read())
infos['serveurChronoEnCours'] = status.get('running')
print(json.dumps({'etats': etats, 'infos': infos}, ensure_ascii=False))
