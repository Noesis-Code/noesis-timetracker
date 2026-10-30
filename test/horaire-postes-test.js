// Module « Horaire » : postes gérés par le gestionnaire (ajout, renommage, retrait en cascade), postes par défaut créés une seule fois,
// au moins un poste gardé, un poste ajouté qui participe à la génération et à l'export Dayforce. Données FICTIVES.
// Usage : node test/horaire-postes-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-postes-');
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uM', 'uM', ?, 'entreprise')").run(now);
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uV', 'uV', ?, 'entreprise')").run(now);
const names = (u) => h.listPositions(u).map((p) => p.name).join(',');

// ---- Postes par défaut : seulement au tout premier chargement d'un compte sans poste ----
h.ensureDefaultPositions('uM');
assert(names('uM') === 'Serveur,Barman,Commis,Hôte/Hôtesse,Suiteur', 'premier chargement d’un compte vide : 5 postes par défaut');
const suiteur = h.listPositions('uM').find((p) => p.name === 'Suiteur');
assert(h.deletePosition('uM', suiteur.id) === true, 'retirer Suiteur');
h.ensureDefaultPositions('uM');
assert(!/Suiteur/.test(names('uM')), 'chargement suivant : Suiteur n’est pas recréé');
// Compte qui avait déjà des postes (avant le 29 oct.) : marqué initialisé, rien n'est ajouté.
h.createPosition('uV', { name: 'Serveur' });
h.ensureDefaultPositions('uV');
assert(names('uV') === 'Serveur', 'compte ayant déjà des postes : aucun poste par défaut ajouté (migration douce)');

// ---- Ajout, renommage, doublon (casse et accents ignorés), retrait en cascade, au moins un poste ----
const app = express(); app.use(express.json());
app.use((req, res, next) => { req.userId = 'uM'; next(); });
app.use('/api', require('../server/routes/horaire'));
const server = app.listen(0); const port = server.address().port;
const call = (method, path, body) => new Promise((res) => {
  const data = body ? JSON.stringify(body) : '';
  const r = http.request({ port, method, path: '/api/horaire/' + path, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (x) => { let t = ''; x.on('data', (c) => { t += c; }); x.on('end', () => res({ status: x.statusCode, body: t ? JSON.parse(t) : {} })); });
  if (data) r.write(data); r.end();
});

(async () => {
  const a = await call('POST', 'positions', { name: 'Sommelier' });
  assert(a.status === 201 && a.body.position.name === 'Sommelier', 'ajout : « Sommelier » créé');
  const dup = await call('POST', 'positions', { name: 'SERVEUR' });
  assert(dup.status === 409, 'ajout refusé : « SERVEUR » existe déjà (casse ignorée)');
  const dup2 = await call('POST', 'positions', { name: 'Hote/Hotesse' });
  assert(dup2.status === 409, 'ajout refusé : « Hote/Hotesse » existe déjà (accents ignorés)');
  const long = await call('POST', 'positions', { name: 'x'.repeat(120) });
  assert(long.status === 201 && long.body.position.name.length === 80, 'nom libre limité à 80 caractères');
  await call('DELETE', 'positions/' + long.body.position.id);
  const som = a.body.position.id;
  const rn = await call('PUT', 'positions/' + som, { name: 'Sommelière' });
  assert(rn.status === 200 && rn.body.position.name === 'Sommelière', 'renommage : « Sommelière »');
  const rnDup = await call('PUT', 'positions/' + som, { name: 'barman' });
  assert(rnDup.status === 409, 'renommage refusé vers un nom pris (« barman »)');
  const same = await call('PUT', 'positions/' + som, { name: 'sommeliere' });
  assert(same.status === 200, 'renommer un poste vers sa propre graphie : permis');
  await call('PUT', 'positions/' + som, { name: 'Sommelière', dayforceCode: 'SOMM' });

  // Le poste ajouté participe : employé qualifié, besoin, génération, export Dayforce.
  const W = '2026-10-26';
  const e = h.createEmployee('uM', { name: 'Employé Fictif', dayforceId: 'E900' });
  h.setQualification('uM', e.id, som, 1);
  h.setAvailabilities('uM', W, e.id, [{ day: W, start: '00:00', end: '23:59' }]);
  h.createNeed('uM', { positionId: som, weekday: 0, start: '17:00', end: '23:00', count: 1 });
  const sched = h.generate('uM', W);
  assert(sched.assignments.some((x) => x.positionId === som && x.employeeId === e.id), 'génération : l’employé est placé sur le poste ajouté');
  h.setSettings('uM', { dayforceLocation: 'MTL-01' });
  const csv = h.exportDayforce('uM', W);
  assert(csv && /E900,2026-10-26,17:00,.*,SOMM,MTL-01/.test(csv.csv), 'export Dayforce : code de poste du poste ajouté');

  // Règle de type d'événement et nombre de plancher sur ce poste : partent avec lui.
  const ty = h.listEventTypes('uM')[0];
  db.prepare('INSERT INTO horaire_event_type_ratios (userId, typeId, positionId, perClients) VALUES (?, ?, ?, 20)').run('uM', ty.id, som);
  // Retrait en cascade (besoins, qualifications, quarts, règles de types).
  const del = await call('DELETE', 'positions/' + som);
  const left = (t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t + ' WHERE userId = ? AND positionId = ?').get('uM', som).n;
  assert(del.status === 200 && !h.ownPosition('uM', som), 'retrait : poste parti');
  assert(left('horaire_needs') === 0 && left('horaire_qualifications') === 0 && left('horaire_assignments') === 0 && left('horaire_event_type_ratios') === 0, 'retrait en cascade : besoins, qualifications, quarts, règles de types');
  assert(h.getSchedule('uM', W) && !(h.getSchedule('uM', W).assignments || []).some((x) => x.positionId === som), 'horaire relu : plus aucun quart sur le poste retiré');

  // Au moins un poste reste.
  for (const p of h.listPositions('uM').slice(1)) await call('DELETE', 'positions/' + p.id);
  const last = h.listPositions('uM');
  const lastDel = await call('DELETE', 'positions/' + last[0].id);
  assert(last.length === 1 && lastDel.status === 409 && h.listPositions('uM').length === 1, 'dernier poste : retrait refusé (409), il reste un poste');
  const again = await call('POST', 'positions/defaults', {});
  assert(again.body.positions.length === 1, 'rechargement : aucun poste par défaut recréé');

  server.close();
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
  process.exit(failed ? 1 : 0);
})();
