// Confidentialité des journaux et des sauvegardes (Loi 25, 30 oct. 2026). Données entièrement FICTIVES.
// 1. Des erreurs provoquées sur les routes Horaire d'import, de collage et de courriel n'écrivent dans la sortie
//    (stdout/stderr) ni les noms envoyés, ni le bloc collé, ni le texte du courriel, ni le jeton secret de l'adresse.
// 2. L'instantané de sauvegarde (server/lib/backup.js) ne contient plus aucune ligne des tables horaire_* (fichier
//    compris : VACUUM), schéma conservé, autres données intactes.
// Usage : node test/journaux-confidentialite-test.js
const path = require('path');
const fs = require('fs');
const tmp = require('./lib/tmpdir').mkTmp('tmt-journaux-');
process.env.NOESIS_DATA_DIR = tmp;
process.env.HORAIRE_INBOUND_ENABLED = '1'; // réception désactivée par défaut (30 oct. 2026) : la logique reste testée interrupteur allumé
process.env.HORAIRE_TODAY = '2026-10-29';
process.env.HORAIRE_INBOUND_DOMAIN = 'exemple.test';
const http = require('http');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

let failed = 0;
const results = [];
function assert(c, l) { results.push((c ? '  ok  ' : '  FAIL ') + l); if (!c) failed++; }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const { errorHandler } = require('../server/lib/errorlog');
db.prepare("INSERT INTO users (id, name, createdAt, accountType, email) VALUES ('uJ', 'uJ', ?, 'entreprise', 'gerant@exemple.test')").run(new Date().toISOString());

const SECRETS = ['Zéphirine Bouchard-Tremblay', 'Anatole Quessy', 'Banquet Lavoie-Sirois', 'note-privee-7731'];

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
require('../server/lib/session').requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use('/api', require('../server/routes/horaire'));
app.use(errorHandler);
const server = app.listen(0);
const port = server.address().port;

function send(method, p, raw, user) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path: '/api/horaire/' + p, headers: Object.assign(user ? { 'x-user': user } : {}, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }) }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, text: t }));
    });
    r.on('error', reject); r.write(raw); r.end();
  });
}

// Sortie capturée : console.* et écritures directes sur stdout/stderr.
let captured = '';
const ow = { out: process.stdout.write, err: process.stderr.write };
function capture() { captured = ''; process.stdout.write = process.stderr.write = (c, ...a) => { captured += String(c); const cb = a.find((x) => typeof x === 'function'); if (cb) cb(); return true; }; }
function release() { process.stdout.write = ow.out; process.stderr.write = ow.err; return captured; }

(async () => {
  const tok = /^horaire-([0-9a-f]{64})@/.exec(h.inboundInfo('uJ').address)[1];
  const paste = SECRETS[0] + ';lundi;11:00;19:00;dispo\n' + SECRETS[1] + ';mardi;16:00;23:00;dispo';
  const broken = (o) => JSON.stringify(o).slice(0, -1) + ',"x":'; // JSON tronqué : erreur d'analyse côté Express

  // Erreur levée DANS une route (message portant des données) : seul le type et l'emplacement sont journalisés.
  const realImport = h.importEmployeesCsv;
  h.importEmployeesCsv = (u, t) => { throw new Error('ligne illisible : ' + t); };

  capture();
  const r = [];
  r.push(await send('POST', 'import/employees', broken({ csv: paste }), 'uJ'));
  r.push(await send('POST', 'import/employees', JSON.stringify({ csv: paste }), 'uJ'));
  r.push(await send('POST', 'import/reservations', broken({ csv: SECRETS[2] + ';2026-12-12;30' }), 'uJ'));
  r.push(await send('POST', 'weeks/2026-10-26/import/availabilities', broken({ csv: paste }), 'uJ'));
  r.push(await send('POST', 'import/employees-doc', broken({ file: { fileName: SECRETS[0] + '.csv', dataUrl: 'data:text/csv;base64,' + Buffer.from(paste).toString('base64') } }), 'uJ'));
  r.push(await send('POST', 'weeks/2026-10-26/import/availabilities-doc', JSON.stringify({ file: { fileName: 'x.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from(paste).toString('base64') } }), 'uJ'));
  r.push(await send('POST', 'inbound/mail/' + tok, broken({ from: 'client@ailleurs.test', subject: SECRETS[2], 'body-plain': SECRETS[2] + ' le 12 décembre, contact ' + SECRETS[3] }), null));
  r.push(await send('POST', 'inbound/reservations/' + tok, broken({ text: SECRETS[1] + ';2026-12-12;19:00;8' }), null));
  r.push(await send('POST', 'notes', broken({ text: SECRETS[3] }), 'uJ'));
  const out = release();
  h.importEmployeesCsv = realImport;

  assert(r[0].status === 400 && r[2].status === 400 && r[3].status === 400 && r[6].status === 400, 'JSON illisible : 400 (import, réservations, dispos, courriel)');
  assert(r[1].status === 500 && /Erreur serveur/.test(r[1].text), 'erreur levée dans la route : 500 générique');
  assert(r.every((x) => !SECRETS.some((s) => x.text.includes(s))), 'aucune réponse ne renvoie les données envoyées');
  assert(/\[http\] POST \/api\/horaire\/import\/employees -> 400/.test(out), 'la route et le code sont journalisés');
  assert(/\[http\] POST \/api\/horaire\/import\/employees -> 500 Error @ test[\\/]journaux-confidentialite-test\.js:\d+/.test(out), 'erreur interne : type et emplacement journalisés');
  for (const s of SECRETS) assert(!out.includes(s), 'sortie sans la donnée fictive « ' + s + ' »');
  assert(!out.includes(tok), 'sortie sans le jeton secret de l’adresse entrante');
  assert(!/lundi;11:00|ligne illisible|is not valid JSON|Unexpected/.test(out), 'sortie sans extrait de bloc collé ni message d’erreur brut');

  // Le gestionnaire est bien branché en dernier dans le vrai serveur.
  const idx = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  const at = idx.indexOf("app.use(require('./lib/errorlog').errorHandler)");
  assert(at > idx.indexOf("app.get('/*splat'") && at < idx.indexOf('app.listen('), 'server/index.js : gestionnaire d’erreurs après toutes les routes');

  // ---- 2. Sauvegarde : tables Horaire vidées dans l'instantané ----
  db.prepare("INSERT INTO horaire_employees (userId, name, createdAt) VALUES ('uJ', ?, ?)").run(SECRETS[0], new Date().toISOString());
  db.prepare("INSERT INTO horaire_notes (userId, text, createdAt) VALUES ('uJ', ?, ?)").run(SECRETS[3], new Date().toISOString());
  const backup = require('../server/lib/backup');
  const snap = path.join(tmp, 'instantane.db');
  await backup.snapshotDatabase(snap);
  assert(fs.readFileSync(snap).toString('utf8').includes(SECRETS[0]), 'témoin : l’instantané brut contient le nom fictif avant nettoyage');
  const n = backup.scrubHoraireTables(snap);
  const raw = fs.readFileSync(snap).toString('utf8');
  assert(n > 10, 'les tables horaire_* sont toutes traitées (' + n + ')');
  assert(!SECRETS.some((s) => raw.includes(s)), 'fichier nettoyé : aucune trace des noms ni des notes (VACUUM)');
  const c = new DatabaseSync(snap, { readOnly: true });
  assert(c.prepare('SELECT COUNT(*) AS n FROM horaire_employees').get().n === 0 && c.prepare('SELECT COUNT(*) AS n FROM horaire_notes').get().n === 0, 'tables Horaire présentes et vides (restauration cohérente)');
  assert(c.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'uJ'").get().n === 1, 'les autres données restent dans la copie');
  assert(c.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'copie nettoyée intègre');
  c.close();
  assert(db.prepare('SELECT COUNT(*) AS n FROM horaire_employees').get().n === 1, 'base vivante intacte (seule la copie est vidée)');

  server.close();
  console.log(results.join('\n'));
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTous les tests passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { release(); console.error(e); process.exit(1); });
