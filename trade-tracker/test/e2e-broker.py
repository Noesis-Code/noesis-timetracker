"""Parcours e2e « Connecter mon courtier » contre le vrai serveur trade-tracker (aucun mock, aucun réseau externe).
Entrées (env) : TT_BASE (http://127.0.0.1:port), TT_LINK (chemin /link?token=…), TT_DB (fichier SQLite du serveur),
TT_SHOTS (dossier de captures, facultatif). Code de sortie 0 = OK, 77 = Playwright/Chromium absent (test ignoré)."""
import os, sys, sqlite3, re, hmac, hashlib, struct, time, base64
try:
    from playwright.sync_api import sync_playwright
except Exception:
    sys.exit(77)
CHROME = os.environ.get('TT_CHROME', '/opt/pw-browsers/chromium')
if not os.path.exists(CHROME): sys.exit(77)
base, link, dbf, shots = os.environ['TT_BASE'], os.environ['TT_LINK'], os.environ['TT_DB'], os.environ.get('TT_SHOTS')
link2 = os.environ.get('TT_LINK2')
SECRET = 'Zq9-e2eSecretToken-0123456789abcdef'
if shots: os.makedirs(shots, exist_ok=True)
def shot(pg, name):
    if shots: pg.screenshot(path='%s/trade-e2e-%s.png' % (shots, name))
def sshot(pg, name):
    if shots: pg.screenshot(path='%s/trade-secu-%s.png' % (shots, name))
def totp(key, off=0):
    k = key.replace(' ', '').upper(); k = base64.b32decode(k + '=' * ((8 - len(k) % 8) % 8))
    h = hmac.new(k, struct.pack('>Q', int(time.time() // 30) + off), hashlib.sha1).digest(); o = h[-1] & 15
    return '%06d' % ((struct.unpack('>I', h[o:o + 4])[0] & 0x7fffffff) % 10 ** 6)
def ok(c, m):
    if not c: raise AssertionError(m)
bodies = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, base_url=base, locale='fr-CA', service_workers='block')
    pg = c.new_page()
    pg.on('request', lambda r: bodies.append(r.post_data or '') if r.method == 'POST' else None)
    ext = []
    pg.on('request', lambda r: ext.append(r.url) if not r.url.startswith(base) and not r.url.startswith('data:') else None)
    # --- Sécurité : l'expert doit activer le TOTP avant toute donnée (QR local, clé, codes de secours) ---
    pg.goto(link); pg.wait_for_selector('#totpKey'); sshot(pg, '1-activation')
    ok(pg.locator('.qrBox svg').count() == 1, 'QR local (SVG)'); ok(not pg.is_visible('.tabbar'), 'barre masquée tant que la vérification manque')
    key = pg.inner_text('#totpKey'); ok(len(key.replace(' ', '')) == 32, 'clé base32 affichée')
    pg.fill('#enrollCode', '000000'); pg.click('#enrollCodeSend'); pg.wait_for_selector('#enrollCodeMsg.error:has-text("invalide")'); sshot(pg, '2-code-refuse')
    pg.fill('#enrollCode', totp(key)); pg.click('#enrollCodeSend'); pg.wait_for_selector('#backupGrid'); sshot(pg, '3-codes-secours')
    backups = [t.strip() for t in pg.locator('#backupGrid code').all_inner_texts()]; ok(len(backups) == 10, '10 codes de secours')
    pg.click('#codesDone'); pg.wait_for_selector('#screen .stateScreen, #screen .card'); pg.wait_for_timeout(600); ok(pg.is_visible('.tabbar'), 'accès après activation')
    # --- nouvelle connexion : vérification (code de secours), puis ré-authentification plus bas ---
    if link2:
        c.clear_cookies(); pg.goto(link2); pg.wait_for_selector('#gateCode'); sshot(pg, '4-verification')
        pg.fill('#gateCode', '111111'); pg.click('#gateCodeSend'); pg.wait_for_selector('#gateCodeMsg.error:has-text("invalide")'); sshot(pg, '5-verification-refusee')
        pg.fill('#gateCode', backups[0]); pg.click('#gateCodeSend'); pg.wait_for_selector('#screen .stateScreen, #screen .card'); pg.wait_for_timeout(600)
        pg.goto(base + '/#/security'); pg.wait_for_selector('#secAudit .logRow'); sshot(pg, '6-page-securite')
        ok('Chaîne intacte' in pg.inner_text('#secAudit'), 'journal : chaîne intacte'); ok('Code de secours utilisé' in pg.inner_text('#secAudit'), 'journal : code de secours')
    pg.goto(base + '/#/broker'); pg.wait_for_selector('#brokerToken')
    ok(pg.inner_text('.syncBannerVal') == 'Non connecté', 'état initial')
    ok(pg.get_attribute('#brokerToken', 'type') == 'password', 'champ masqué')
    shot(pg, '1-non-connecte')
    # jeton invalide -> erreur claire, champ réactivé
    pg.fill('#brokerToken', 'court'); pg.click('#brokerSend'); pg.wait_for_selector('#brokerMsg.error:has-text("Jeton refusé")')
    ok(pg.is_enabled('#brokerToken'), 'champ réactivé après erreur'); shot(pg, '2-erreur-jeton')
    # connexion
    pg.fill('#brokerToken', SECRET); pg.click('#brokerSend')
    pg.wait_for_selector('.syncBannerVal:has-text("Connecté")')
    pg.wait_for_selector('#brokerSyncInfo:has-text("Jamais")'); ok(pg.is_visible('#brokerDisc'), 'bouton déconnecter')
    ok(pg.input_value('#brokerToken') == '', 'champ vidé')
    ok(pg.evaluate("JSON.stringify(localStorage)+document.cookie+document.body.innerHTML").find(SECRET) < 0, 'jeton absent du navigateur')
    shot(pg, '3-connecte')
    # statut : synchro réussie
    d = sqlite3.connect(dbf); uid = d.execute('SELECT id FROM tt_users LIMIT 1').fetchone()[0]
    d.execute("INSERT INTO sync_log (userId, kind, status, message, at) VALUES (?, 'sync', 'OK', 'Synchro OK', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes'))", (uid,)); d.commit()
    pg.reload(); pg.wait_for_selector('#brokerSyncInfo:has-text("il y a")'); shot(pg, '4-synchro-ok')
    # statut : échec
    d.execute("INSERT INTO sync_log (userId, kind, status, message) VALUES (?, 'sync', 'ECHEC', 'Échec de synchro : jeton expiré')", (uid,)); d.commit()
    pg.reload(); pg.wait_for_selector('#brokerSyncInfo [role=alert]:has-text("jeton expiré")'); shot(pg, '5-synchro-echec')
    # déconnexion : annuler, puis confirmer
    pg.click('#brokerDisc'); pg.wait_for_selector('.modalCard'); ok(pg.is_visible('.modalClose'), 'croix ✕ de la pop-up'); shot(pg, '6-confirmation')
    pg.click('#discNo'); ok(pg.locator('.modalCard').count() == 0, 'annulation ferme'); ok(pg.inner_text('.syncBannerVal') == 'Connecté', 'toujours connecté')
    n = d.execute('SELECT COUNT(*) FROM broker_tokens').fetchone()[0]; ok(n == 1, 'jeton conservé après annulation')
    # ré-authentification expirée : la suppression redemande un code (pop-up centrée avec ✕), puis aboutit
    d.execute("UPDATE sessions SET stepUpAt = strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')"); d.commit()
    pg.click('#brokerDisc'); pg.click('#discYes'); pg.wait_for_selector('#stepCode'); ok(pg.is_visible('.modalClose'), 'croix ✕ de la ré-authentification'); sshot(pg, '7-reauthentification')
    pg.fill('#stepCode', totp(key, 1)); pg.click('#stepCodeSend'); pg.wait_for_selector('.syncBannerVal:has-text("Non connecté")')
    pg.wait_for_selector('#brokerMsg.ok:has-text("déconnecté")'); shot(pg, '7-deconnecte')
    d.close(); d = sqlite3.connect(dbf)
    ok(d.execute('SELECT COUNT(*) FROM broker_tokens').fetchone()[0] == 0, 'jeton supprimé')
    ok(d.execute('SELECT COUNT(*) FROM sync_log').fetchone()[0] == 0, 'journal purgé')
    ok(not ext, 'aucun appel externe : %s' % ext)
    b.close()
print('e2e broker OK')
