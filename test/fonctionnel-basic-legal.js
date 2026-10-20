// Test fonctionnel Basic (volet légal/Loi 25) : prouve que les tâches déjà livrées marchent.
// Tâches : #1253 sauvegardes, #1260/#1293 mentions légales, #1294 conditions, #1269/#1292 confidentialité,
// #1291 consentement commercial, #1262/#1277 consentement parental, #1284 âge, #1263 export, #1283 résiliation, #1280 signalement.
// Usage : node test/fonctionnel-basic-legal.js (serveur réel sur dossier temporaire, aucun appel réseau externe).
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
// Config Stripe factice (jamais appelée : on s'arrête avant la création de session) pour atteindre la validation d'âge.
process.env.STRIPE_SECRET_KEY = 'sk_test_factice';
process.env.STRIPE_OFFER1_PRICE_ID = 'price_factice';
const { startServer, makeCounter, newUser, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

(async () => {
  const s = await startServer();
  try {
    const html = pub('index.html'), app = pub('app.js');

    // --- #1260 #1293 (mentions légales), #1294 (conditions), #1269 #1292 (confidentialité) : textes servis et boutons câblés ---
    const home = await (await fetch(s.base + '/')).text();
    for (const [id, modal, label] of [['openLegalNoticesBtn', 'legalNoticesModal', 'mentions légales (#1260, #1293)'],
      ['openLegalTermsBtn', 'legalTermsModal', "conditions d'utilisation (#1294)"],
      ['openPrivacyPolicyBtn', 'privacyPolicyModal', 'politique de confidentialité (#1269, #1292)']]) {
      assert(home.includes('id="' + id + '"') && home.includes('id="' + modal + '"'), label + ' : bouton et fenêtre servis');
      assert(app.includes("$('" + id + "')") && app.includes("$('" + modal + "').classList.remove('hidden')"), label + ' : bouton ouvre la fenêtre');
    }
    assert(/Mentions légales/i.test(html) && /Conditions d.utilisation/i.test(html) && /Politique de confidentialité/i.test(html), 'textes juridiques présents dans la page');

    // --- #1284 vérification de l'âge : case 16 ans+ obligatoire à la création, déclaration d'âge à l'achat ---
    assert(/j'ai 16 ans ou plus/.test(html), 'case « 16 ans ou plus » à l\'inscription');
    const raw = client(s.base);
    const sansCase = await raw.post('/api/profile', { name: 'SansCase', lastName: 'X', phone: '5145550111', email: 'sc@exemple.test', pin: '1234' });
    assert(sansCase.status === 400, 'création sans acceptation (16 ans+) refusée');

    // --- #1291 consentement commercial distinct ---
    assert(home.includes('id="onbMarketingCheckbox"') && home.includes('id="settingsMarketingConsent"'), 'interrupteurs de consentement commercial présents');
    const m1 = client(s.base);
    const c1 = await m1.post('/api/profile', { name: 'MarkOui', lastName: 'Fonc', phone: '5145550112', email: 'mo@exemple.test', pin: '1234', termsAccepted: true, marketingConsent: true });
    assert(c1.status === 201 && c1.body.marketingConsent === true, 'consentement commercial donné à la création');
    const m2 = client(s.base);
    const c2 = await m2.post('/api/profile', { name: 'MarkNon', lastName: 'Fonc', phone: '5145550113', email: 'mn@exemple.test', pin: '1234', termsAccepted: true });
    assert(c2.status === 201 && c2.body.marketingConsent === false, 'consentement commercial absent = faux (distinct des conditions)');
    assert((await client(s.base).put('/api/profile/marketing-consent', { consent: true })).status === 401, 'changement sans session = 401');
    assert((await m2.put('/api/profile/marketing-consent', { consent: 'oui' })).status === 400, 'valeur non booléenne refusée');
    const on = await m2.put('/api/profile/marketing-consent', { consent: true });
    assert(on.status === 200 && on.body.marketingConsent === true && !!on.body.marketingConsentAt, 'activation depuis Réglages, horodatée');
    assert((await m2.get('/api/profile/' + c2.body.id)).body.marketingConsent === true, 'état relu sur le profil');
    const off = await m2.put('/api/profile/marketing-consent', { consent: false });
    assert(off.body.marketingConsent === false && (await m2.get('/api/profile/' + c2.body.id)).body.marketingConsent === false, 'retrait possible à tout moment');

    // --- #1284 (suite) : déclaration d'âge à l'achat Expansion ; #1262 #1277 consentement parental ---
    const u = await newUser(s.base, 'age');
    const noAge = await u.c.post('/api/offer/checkout', { activityChoice: { activityId: u.activityId } });
    assert(noAge.status === 400 && /ageDeclaration/.test(noAge.body.error), "achat sans déclaration d'âge refusé");
    const noGuardian = await u.c.post('/api/offer/checkout', { ageDeclaration: 'minor', activityChoice: { activityId: u.activityId } });
    assert(noGuardian.status === 400 && /représentant légal/i.test(noGuardian.body.error), 'mineur sans représentant légal refusé');
    const badGuardian = await u.c.post('/api/offer/checkout', { ageDeclaration: 'minor', guardianName: 'Parent', guardianEmail: 'pasuncourriel', activityChoice: { activityId: u.activityId } });
    assert(badGuardian.status === 400, 'courriel du représentant invalide refusé');
    const mailDown = await u.c.post('/api/offer/checkout', { ageDeclaration: 'minor', guardianName: 'Parent', guardianEmail: 'parent@exemple.test', activityChoice: { activityId: u.activityId } });
    assert(mailDown.status === 502, 'mineur : pas de session de paiement si le courriel de consentement ne part pas');
    assert((await client(s.base).get('/api/offer/parental-consent/inconnu')).status === 404, 'jeton de consentement inconnu = 404');

    // Page publique du représentant légal (jeton inséré en base comme le fait createOrReuse).
    const dbc = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    const now = new Date();
    const ins = (tok, exp) => dbc.prepare('INSERT INTO parental_consent_requests (token, activityId, userId, guardianName, guardianEmail, createdAt, expiresAt) VALUES (?,?,?,?,?,?,?)')
      .run(tok, u.activityId, u.id, 'Parent Test', 'parent@exemple.test', now.toISOString(), exp);
    ins('jeton-valide', new Date(now.getTime() + 864e5).toISOString());
    ins('jeton-expire', new Date(now.getTime() - 864e5).toISOString());
    const anon = client(s.base);
    const pg = await fetch(s.base + '/api/offer/parental-consent/jeton-valide');
    const pgHtml = await pg.text();
    assert(pg.status === 200 && pgHtml.includes('Je consens à cet abonnement') && pgHtml.includes('Parent Test'), 'page de consentement affichée sans compte');
    assert((await fetch(s.base + '/api/offer/parental-consent/jeton-expire')).status === 410, 'lien expiré = 410');
    const conf = await fetch(s.base + '/api/offer/parental-consent/jeton-valide', { method: 'POST' });
    assert(conf.status === 200 && (await conf.text()).includes('confirmé'), 'consentement confirmé');
    const row = dbc.prepare('SELECT confirmedAt, consumedAt FROM parental_consent_requests WHERE token = ?').get('jeton-valide');
    assert(!!row.confirmedAt && !row.consumedAt, 'confirmation horodatée en base, non consommée');
    assert((await (await fetch(s.base + '/api/offer/parental-consent/jeton-valide')).text()).includes('déjà confirmé'), 'seconde visite : déjà confirmé');
    assert((await fetch(s.base + '/api/offer/parental-consent/jeton-expire', { method: 'POST' })).status === 410, 'confirmation d\'un lien expiré refusée');
    void anon;

    // --- #1263 bouton d'export ---
    assert(home.includes('id="exportDataBtn"') && app.includes("api('GET', '/api/profile/export')"), "bouton d'export présent et câblé");
    const ex = await u.c.get('/api/profile/export');
    assert(ex.status === 200 && ex.body.user && ex.body.user.id === u.id, "export renvoie les données du compte");

    // --- #1280 signalement de message privé (fil d'activité partagée) ---
    const a = await newUser(s.base, 'sigA'), b = await newUser(s.base, 'sigB');
    dbc.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(a.activityId, b.id, now.toISOString());
    const msg = await a.c.post('/api/community/activity-messages', { activityId: a.activityId, body: 'message à signaler' });
    assert(msg.status === 201, 'message posté dans le fil partagé');
    const own = await a.c.post(`/api/community/activity-messages/${msg.body.id}/report`, { reason: 'spam' });
    assert(own.status === 400, 'signaler son propre message refusé');
    const bad = await b.c.post(`/api/community/activity-messages/${msg.body.id}/report`, { reason: 'bidon' });
    assert(bad.status === 400, 'motif invalide refusé');
    const rep = await b.c.post(`/api/community/activity-messages/${msg.body.id}/report`, { reason: 'spam', detail: 'test' });
    assert(rep.status === 201 && rep.body.ok, 'signalement créé');
    assert((await b.c.post(`/api/community/activity-messages/${msg.body.id}/report`, { reason: 'spam' })).status === 409, 'un seul signalement par message et par membre');
    const seenB = await b.c.get(`/api/community/activity-messages?activityId=${a.activityId}&markRead=0`);
    const seenA = await a.c.get(`/api/community/activity-messages?activityId=${a.activityId}&markRead=0`);
    assert(!seenB.body.messages.some((m) => m.id === msg.body.id) && seenA.body.messages.some((m) => m.id === msg.body.id), 'message masqué pour le signaleur seulement');
    assert(dbc.prepare('SELECT COUNT(*) AS n FROM message_reports').get().n === 1, 'ligne conservée en base pour l\'administrateur');

    // --- #1283 résiliation du compte depuis les paramètres ---
    assert(home.includes('id="deleteAccountBtn"') && home.includes('id="deleteAccountPin"'), 'zone de suppression du compte présente');
    const d = await newUser(s.base, 'del');
    assert((await client(s.base).del('/api/profile/' + d.id, { pin: '1234' })).status === 401, 'suppression sans session = 401');
    assert((await a.c.del('/api/profile/' + d.id, { pin: '1234' })).status === 403, "suppression du compte d'un autre = 403");
    assert((await d.c.del('/api/profile/' + d.id, { pin: '9999' })).status === 401, 'mauvais code refusé');
    assert((await d.c.get('/api/profile/' + d.id)).status === 200, 'compte intact après refus');
    const del = await d.c.del('/api/profile/' + d.id, { pin: '1234' });
    assert(del.status === 200, 'suppression avec le bon code');
    assert(dbc.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(d.id).n === 0, 'compte retiré de la base');
    assert(dbc.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE userId = ?').get(d.id).n === 0, 'appartenances retirées');
    dbc.close();

    // --- #1253 sauvegardes automatiques (chiffrées, rétention) : cycle complet contre un faux serveur S3 local ---
    const puts = [];
    const fake = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        if (req.method === 'PUT') { puts.push({ url: req.url, body: Buffer.concat(chunks) }); res.writeHead(200).end(); }
        else { res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'); }
      });
    });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    const keyHex = 'ab'.repeat(32);
    Object.assign(process.env, {
      NOESIS_DATA_DIR: s.dir, S3_ENDPOINT: 'http://127.0.0.1:' + fake.address().port, S3_REGION: 'auto', S3_BUCKET: 'test',
      S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', NOESIS_BACKUP_KEY: keyHex, NOESIS_BACKUP_INTERVAL_HOURS: '24',
    });
    const backup = require('../server/lib/backup');
    const logs = [];
    const logger = { log: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };
    assert(backup.isConfigured(), 'sauvegardes configurées');
    backup.startBackupSchedule(logger);
    assert(logs.some((l) => /Activées.*toutes les 24 h.*14 j \/ 8 sem\. \/ 12 mois/.test(l)), 'planification quotidienne annoncée avec rétention 14 j / 8 sem. / 12 mois');
    const r = await backup.runBackupOnce(logger);
    assert(r && !r.skipped && !r.error && /\.db\.gz\.enc$/.test(r.key), 'sauvegarde envoyée : ' + (r && (r.error || r.key)));
    assert(puts.length === 1 && puts[0].body.subarray(0, 5).toString() === 'NOBK1', 'objet chiffré (en-tête NOBK1)');
    const plain = zlib.gunzipSync(backup.decryptBuffer(puts[0].body, Buffer.from(keyHex, 'hex')));
    assert(plain.subarray(0, 15).toString() === 'SQLite format 3', 'déchiffrée puis décompressée = base SQLite valide');
    let wrong = false;
    try { backup.decryptBuffer(puts[0].body, Buffer.from('cd'.repeat(32), 'hex')); } catch (e) { wrong = true; }
    assert(wrong, 'mauvaise clé refusée');
    await new Promise((r2) => fake.close(r2));
    const { planRetention } = require('../server/lib/backupretention');
    const t0 = Date.UTC(2026, 9, 20, 12);
    const objs = []; for (let i = 0; i < 40; i++) objs.push({ key: 'p/' + new Date(t0 - i * 864e5).toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z') + '.db.gz.enc' });
    const plan = planRetention(objs, t0);
    assert(plan.keep.includes(objs[0].key) && plan.keep.includes(objs[13].key) && plan.remove.length > 0, 'rétention : récentes gardées, anciennes purgées');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
