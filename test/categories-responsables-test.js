// Pôles et secteurs : créer, renommer, retirer, déplacer, réordonner = responsables seulement (20 nov. 2026, décision d'Émilien).
// Usage : node test/categories-responsables-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-catresp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee');
const express = require('express');
const U = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id);
['own', 'ra', 'rp', 'm'].forEach(U);
const A = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'ra', 'rp', 'm'].forEach((u, i) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', ?)").run(A, u, '2026-01-0' + (i + 1)));
P.migrer();
goals.addCategory(A, 'Production'); goals.addCategory(A, 'Vente');
const pk = (l) => goals.categoriesForActivity(A).find((p) => p.label === l).key;
const p1 = pk('Production'), p2 = pk('Vente');
goals.addCategory(A, 'Bois', p1);
const s1 = goals.secteursForPole(A, p1)[0].key;
R.ajouterCategorie('own', A, '_', 'ra'); R.ajouterCategorie('ra', A, p1, 'rp');

const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = req.get('x-u'); next(); });
app.use(require('../server/routes/categories'));
const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/activities/' + A + '/goals/categories';
  const call = async (u, method, path, body) => { const r = await fetch(base + path, { method, headers: { 'x-u': u, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  try {
    // simple membre : tout est refusé
    let r = await call('m', 'POST', '', { label: 'Nouveau' });
    assert(r.status === 403 && r.body.code === 'CATEGORIE_RESERVEE_RESPONSABLES', 'simple membre : créer un pôle refusé');
    assert((await call('m', 'PUT', '/' + p1, { label: 'X' })).status === 403, 'simple membre : renommer un pôle refusé');
    assert((await call('m', 'DELETE', '/' + p1)).status === 403, 'simple membre : retirer un pôle refusé');
    assert((await call('m', 'POST', '/' + p1 + '/secteurs', { label: 'Y' })).status === 403, 'simple membre : créer un secteur refusé');
    assert((await call('m', 'PUT', '/' + p1 + '/secteurs/' + s1, { label: 'Z' })).status === 403, 'simple membre : renommer un secteur refusé');
    assert((await call('m', 'DELETE', '/' + p1 + '/secteurs/' + s1)).status === 403, 'simple membre : retirer un secteur refusé');
    assert((await call('m', 'PUT', '-reorder', { keys: [p2, p1] })).status === 403, 'simple membre : réordonner les pôles refusé');
    assert(goals.categoriesForActivity(A).length === 2 && goals.secteursForPole(A, p1).length === 1, 'simple membre : rien n’a changé');
    assert((await call('m', 'GET', '')).status === 200, 'simple membre : la lecture reste permise');
    // responsable de pôle : ses secteurs, son pôle ; pas le pôle voisin, pas de nouveau pôle
    assert((await call('rp', 'POST', '', { label: 'Nouveau' })).status === 403, 'responsable de pôle : créer un pôle refusé');
    assert((await call('rp', 'POST', '/' + p1 + '/secteurs', { label: 'Colle' })).status === 200, 'responsable de pôle : crée un secteur dans son pôle');
    assert((await call('rp', 'PUT', '/' + p1 + '/secteurs/' + s1, { label: 'Bois dur' })).status === 200, 'responsable de pôle : renomme son secteur');
    assert((await call('rp', 'POST', '/' + p2 + '/secteurs', { label: 'Web' })).status === 403, 'responsable de pôle : secteur dans un pôle voisin refusé');
    assert((await call('rp', 'PUT', '/' + p2, { label: 'Autre' })).status === 403, 'responsable de pôle : renommer le pôle voisin refusé');
    assert((await call('rp', 'PUT', '-reorder', { keys: [p2, p1] })).status === 403, 'responsable de pôle : réordonner les pôles refusé');
    // responsable d'activité et propriétaire : tout
    assert((await call('ra', 'POST', '', { label: 'Achats' })).status === 200, 'responsable d’activité : crée un pôle');
    assert((await call('own', 'PUT', '/' + p2, { label: 'Ventes' })).status === 200, 'propriétaire : renomme un pôle');
    assert((await call('own', 'POST', '/' + p2 + '/secteurs', { label: 'Web' })).status === 200, 'propriétaire : crée un secteur partout');
  } catch (e) { failed += 1; console.log('  FAIL exception ' + e.message); }
  srv.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); } else console.log('categories-responsables : OK');
});
