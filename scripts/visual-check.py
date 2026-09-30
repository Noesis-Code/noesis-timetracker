"""Captures d'écran mobile de l'app locale (Playwright/Chromium préinstallé).
Prérequis : serveur lancé sur le port 3999 avec la base préparée par scripts/dev-seed.js.
Usage : python3 scripts/visual-check.py <UID_EMILIEN> <sortie_dir> [dark|light]
Ouvre chaque onglet + Profil + Réglages et enregistre des PNG. Adapter/étendre pour l'écran visé.
Astuces : le gate PWA est contourné par navigator.standalone=true ; la session vient de POST /api/profile/:id/verify-pin (NIP 1234) ;
le profil est mis dans localStorage['noesis_profile']. Le thème réel vient du profil serveur (users.theme) : pour tester le clair,
faire `document.documentElement.removeAttribute('data-theme')` après chargement."""
import sys, json, os
from playwright.sync_api import sync_playwright
uid, out = sys.argv[1], sys.argv[2]
theme = sys.argv[3] if len(sys.argv) > 3 else 'dark'
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, base_url='http://localhost:3999')
    c.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
    prof = c.request.post('/api/profile/%s/verify-pin' % uid, data={'pin': '1234'}).json()
    pg = c.new_page(); pg.goto('/')
    pg.evaluate("([k,v])=>localStorage.setItem(k,v)", ['noesis_profile', json.dumps(prof)])
    pg.reload(); pg.wait_for_timeout(2500)
    if theme == 'light': pg.evaluate("document.documentElement.removeAttribute('data-theme')")
    for t in ['chrono', 'stats', 'goals', 'community', 'activity']:
        pg.click('.tabBtn[data-tab=%s]' % t); pg.wait_for_timeout(1200); pg.screenshot(path='%s/%s.png' % (out, t))
    pg.click('#whoami'); pg.wait_for_timeout(1000); pg.screenshot(path='%s/profil.png' % out)
    b.close()
