// Simple membre (20 nov. 2026) : ne crée, ne modifie, ne déplace ni ne supprime aucune tâche d'une activité partagée ; il coche seulement. Barre d'ajout absente pour lui. Jour du titre proposé. Barre hors ligne.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-membre-taches-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee');
const gt = require('../server/lib/goalstasks');
const U = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id);
['own', 'rp', 'm'].forEach(U);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'rp', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '2026-01-01')").run(act, u));
categories.addCategory(act, 'Production'); const pole = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Vente'); const pole2 = goals.categoriesForActivity(act).map((c) => c.key).filter((k) => k !== pole)[0];
P.migrer();
['rp', 'm'].forEach((u) => db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = '_'").run(act, u));
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'm', ?, '')").run(act, pole);
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'rp', ?, '')").run(act, pole);
R.ajouterCategorie('own', act, pole, 'rp');
const today = require('../server/lib/dates').userToday();
const due = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10); })();

function call(router, method, url, userId, body) {
  return new Promise((resolve) => {
    const req = { method, url, userId, query: {}, body: body || {}, headers: {}, params: {}, get: () => '' };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, setHeader() {}, getHeader() {} };
    router.handle(req, res, () => resolve({ status: 404, body: null }));
  });
}
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  const sub = require('../server/routes/subprojects'), goalsR = require('../server/routes/goals');
  const t = gt.addCategoryTask(act, 'rp', pole, 'Poncer la planche', { dueDate: due });
  db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run('m', t.id);
  // Création : route HTTP
  const post = (u, k) => call(goalsR, 'POST', '/activities/' + act + '/goals/categories/' + k + '/tasks', u, { label: 'Nouvelle', dueDate: due });
  assert((await post('m', pole)).status === 403 && (await post('m', pole2)).status === 403, 'simple membre : création refusée (HTTP 403), même dans sa catégorie');
  assert((await post('rp', pole)).status === 201 && (await post('own', pole2)).status === 201, 'responsable (sa catégorie) et propriétaire (partout) : création permise');
  assert((await post('rp', pole2)).status === 403, 'responsable : refusé hors de sa catégorie');
  // File hors ligne : le rejeu (POST auto-task) garde la date et l'exécutant ; date passée refusée AVANT toute création
  const auto = (u, b) => call(goalsR, 'POST', '/activities/' + act + '/goals/categories/auto-task', u, b);
  const nbAvant = db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n;
  const okAuto = await auto('own', { label: 'Rejouée avec date', dueDate: due, plannedUserId: 'rp' });
  const rowAuto = okAuto.body && db.prepare('SELECT dueDate, plannedUserId FROM sub_project_items WHERE id = ?').get(okAuto.body.id);
  assert(okAuto.status === 201 && rowAuto && rowAuto.dueDate === due && rowAuto.plannedUserId === 'rp', 'auto-task : date et exécutant choisis hors ligne conservés');
  const nbMid = db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n;
  const past = await auto('own', { label: 'Trop tard', dueDate: '2020-01-01' });
  assert(past.status === 400 && past.body.error === 'Pas de date dans le passé.', 'auto-task : date passée refusée avec le message du serveur');
  assert((await auto('own', { label: 'Inconnu', plannedUserId: 'personne' })).status === 400, 'auto-task : exécutant hors activité refusé');
  assert(db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n === nbMid && nbMid === nbAvant + 1, 'auto-task : un refus ne crée aucune tâche');
  assert((await auto('m', { label: 'Par un membre', dueDate: due })).status === 403, 'auto-task : simple membre, aucune création');
  // Modification / suppression
  const put = (u, b) => call(sub, 'PUT', '/sub-project-items/' + t.id, u, b);
  for (const f of [{ label: 'Autre' }, { dueDate: due }, { plannedUserId: 'rp' }, { recurrence: { freq: 'daily' } }, { done: true, label: 'x' }]) {
    const r = await put('m', f); assert(r.status === 403 && r.body.code === 'TACHE_RESERVEE_RESPONSABLES', 'simple membre : modifier ' + Object.keys(f).join('+') + ' refusé');
  }
  assert((await call(sub, 'DELETE', '/sub-project-items/' + t.id, 'm')).status === 403, 'simple membre : suppression refusée');
  assert((await put('m', { done: true })).status === 200, 'simple membre : coche sa tâche');
  assert((await put('m', { done: false })).status === 200, 'simple membre : décoche sa tâche');
  assert((await put('rp', { label: 'Poncer la planche à la main' })).status === 200, 'responsable : modifie');
  // Déplacement / réaffectation : refusés aussi (catégorie de départ comprise)
  const mv = (u, k) => call(goalsR, 'PUT', '/activities/' + act + '/goals/tasks/' + t.id + '/category', u, { categoryKey: k });
  assert((await mv('m', pole)).status === 403, 'simple membre : déplacement refusé');
  const perso = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Perso', 'm', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'm', '#fff', '')").run(perso); categories.addCategory(perso, 'Moi');
  const pk = goals.categoriesForActivity(perso)[0].key;
  const mvOut = await call(goalsR, 'PUT', '/activities/' + perso + '/goals/tasks/' + t.id + '/category', 'm', { categoryKey: pk });
  assert(mvOut.status !== 200, 'simple membre : déplacement par une autre activité refusé');
  assert((await call(goalsR, 'POST', '/activities/' + perso + '/goals/categories/' + pk + '/tasks', 'm', { label: 'Perso', dueDate: due })).status === 201, 'activité personnelle (un seul membre) : il crée librement');
  // Lieux de rangement : jamais une catégorie interdite
  const cl = require('../server/lib/goalstaskclassify');
  const pr = await cl.proposePlacement('m', 'Appeler le client vendredi', { skipAi: true });
  assert(pr.options.length > 0 && pr.options.every((o) => o.activityId === perso), 'rangement : seulement son activité personnelle');
  // Jour écrit dans le titre
  const p2 = await cl.proposePlacement('own', 'Appeler le client demain', { skipAi: true });
  const dem = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  assert(p2.date === dem, 'proposition : « demain » dans le titre = le jour de demain');
  assert((await cl.proposePlacement('own', 'Appeler le client', { skipAi: true })).date === null, 'proposition : aucun jour écrit = null');
  // Client
  const au = rd('public/js/aujourdhui.js'), bv = rd('public/js/barre-volets.js'), app = rd('public/app.js');
  assert(au.includes('v = !!v; if (v && !canAddHere()) v = false;') && au.includes('TMT.portee.canManage(filt.act)') && au.includes('canAdd: function'), 'barre d’ajout : ne s’ouvre pas pour un simple membre (partout ou filtre sur son activité)');
  assert(bv.includes('TMT.todayView.canAdd()'), '« + » : absent quand l’ajout est interdit dans le contexte');
  assert(au.includes('queueOffline(label, offlineActivity(), {') && au.includes('err.offline') && app.includes('window.TMT.offlineTask'), 'barre d’ajout : passe par la file d’attente hors ligne');
  assert(au.includes('state.date = r.date || null'), 'barre d’ajout : le jour du titre remplit le champ Date');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nmembre-taches-test : OK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
