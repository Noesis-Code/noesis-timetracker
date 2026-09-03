// test14.js — suite API dédiée aux sous-projets d'une activité (discussion "Sous-projets",
// 3 septembre 2026). Serveur Express réel + SQLite jetable, appels HTTP directs.
// Justifiée par la convention du 29 août 2026 : ce chantier ajoute trois tables
// ET des droits d'accès entre membres d'une activité.
//
// Lancement : node test14.js  (le serveur doit tourner sur :3000
// avec une base VIERGE — voir le script d'exécution)

const BASE = 'http://localhost:3000/api';
let passed = 0, failed = 0;

function ok(cond, label) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label + ' — attendu ' + JSON.stringify(expected) + ', obtenu ' + JSON.stringify(actual));
}

async function call(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let json = null;
  try { json = await r.json(); } catch (e) { /* 204 etc. */ }
  return { status: r.status, body: json };
}

let n = 0;
function uniq(prefix) { n++; return prefix + '-' + Date.now() + '-' + n; }

async function makeUser(prefix) {
  const name = uniq(prefix);
  const r = await call('POST', '/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234',
  });
  if (r.status !== 201) throw new Error('création de profil ratée : ' + JSON.stringify(r));
  return r.body;
}

async function makeActivity(user, name) {
  const r = await call('POST', '/activities', { userId: user.id, name: name || uniq('Activite') });
  if (r.status !== 201) throw new Error('création activité ratée : ' + JSON.stringify(r));
  return r.body;
}

async function addMember(activity, from, to) {
  const inv = await call('POST', '/activities/' + activity.id + '/invite', { userId: from.id, pseudo: to.name });
  if (inv.status !== 201 && inv.status !== 200) throw new Error('invitation ratée : ' + JSON.stringify(inv));
  const list = await call('GET', '/invites?userId=' + to.id);
  const mine = list.body.find((i) => String(i.activityId) === String(activity.id));
  const acc = await call('POST', '/invites/' + mine.id + '/accept', { userId: to.id });
  if (acc.status !== 200 && acc.status !== 201) throw new Error('acceptation ratée : ' + JSON.stringify(acc));
}

(async () => {
  console.log('--- Sous-projets : suite API ---\n');

  const alice = await makeUser('Alice');
  const bob = await makeUser('Bob');
  const mallory = await makeUser('Mallory');   // membre d'aucune activité d'Alice

  // ============ 1. Activité SOLO — le cas d'usage principal ============
  console.log('1. Activité solo');
  const solo = await makeActivity(alice, uniq('Solo'));

  let r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.status, 200, '1.1 liste accessible sur une activité SOLO (pas de membersCount >= 2)');
  eq(r.body.subProjects, [], '1.2 aucune liste au départ');
  eq(r.body.progress, null, '1.3 progress null tant qu\'aucun sous-projet (règle R3)');

  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: 'Refonte du site', description: 'V2' });
  eq(r.status, 201, '1.4 création d\'un sous-projet');
  const sp1 = r.body;
  ok(sp1.id > 0 && sp1.activityId === solo.id, '1.5 sous-projet rattaché à l\'activité');

  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: '' });
  eq(r.status, 400, '1.6 nom vide refusé');
  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: 'x'.repeat(121) });
  eq(r.status, 400, '1.7 nom trop long refusé');

  // ============ 2. Todolist et avancement ============
  console.log('2. Todolist et avancement');
  const items = [];
  for (const label of ['Maquettes', 'Intégration', 'Contenus', 'Mise en ligne']) {
    const c = await call('POST', '/sub-projects/' + sp1.id + '/items', { userId: alice.id, label });
    ok(c.status === 201, '2.x création tâche « ' + label + ' »');
    items.push(c.body);
  }

  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.total, 4, '2.1 total = 4 tâches');
  eq(r.body.progress.done, 0, '2.2 done = 0');
  eq(r.body.progress.percent, 0, '2.3 percent = 0 quand il y a des tâches mais rien de coché');
  eq(r.body.subProjects[0].percent, 0, '2.4 percent du sous-projet = 0');

  // Une case cochée sur 4 = 25 %
  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: true });
  eq(r.status, 200, '2.5 cocher une tâche');
  eq(r.body.done, true, '2.6 la tâche est cochée');
  eq(r.body.doneBy, alice.id, '2.7 doneBy renseigné');
  ok(!!r.body.doneAt, '2.8 doneAt renseigné');

  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.percent, 25, '2.9 avancement 1/4 = 25 %');

  // Décocher remet doneBy/doneAt à null
  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: false });
  eq(r.body.done, false, '2.10 décochée');
  eq(r.body.doneBy, null, '2.11 doneBy remis à null au décochage');
  eq(r.body.doneAt, null, '2.12 doneAt remis à null au décochage');

  // Renommer sans toucher à l'état coché
  await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: true });
  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, label: 'Maquettes v2' });
  eq(r.body.label, 'Maquettes v2', '2.13 renommage');
  eq(r.body.done, true, '2.14 le renommage ne décoche pas');

  // ============ 3. ⭐ Contrat "Général" : R1, R2, R3 ============
  console.log('3. Contrat d\'avancement (R1, R2, R3)');

  // R1 : un sous-projet SANS aucune tâche -> percent null, jamais 0
  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: 'Sans tâche' });
  const spEmpty = r.body;
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  const empty = r.body.subProjects.find((s) => s.id === spEmpty.id);
  eq(empty.total, 0, '3.1 sous-projet sans tâche : total = 0');
  eq(empty.percent, null, '3.2 R1 — percent vaut null (et PAS 0) quand total = 0');

  // R2 : les deux pondérations existent et diffèrent bien
  // sp1 : 1/4 coché ; spEmpty : 0 tâche (exclu de la moyenne)
  eq(r.body.progress.done, 1, '3.3 done agrégé sur l\'activité');
  eq(r.body.progress.total, 4, '3.4 total agrégé sur l\'activité');
  eq(r.body.progress.percent, 25, '3.5 R2 — percent pondéré à la case');
  eq(r.body.progress.percentBySubProject, 25, '3.6 R2 — moyenne des sous-projets (le vide est exclu)');
  eq(r.body.progress.subProjectCount, 2, '3.7 subProjectCount compte aussi le sous-projet vide');
  eq(r.body.progress.completedSubProjectCount, 0, '3.8 aucun sous-projet terminé');

  // Les deux pondérations DIVERGENT dès que les tailles diffèrent : c'est
  // tout l'intérêt d'exposer les deux (un sous-projet à 1 tâche terminée
  // ne doit pas peser autant qu'un sous-projet à 4 tâches à peine entamé).
  const spSmall = (await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: 'Petit' })).body;
  const smallItem = (await call('POST', '/sub-projects/' + spSmall.id + '/items', { userId: alice.id, label: 'Une seule' })).body;
  await call('PUT', '/sub-project-items/' + smallItem.id, { userId: alice.id, done: true });
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.done, 2, '3.9 done = 2 (1 sur 4 + 1 sur 1)');
  eq(r.body.progress.total, 5, '3.10 total = 5');
  eq(r.body.progress.percent, 40, '3.11 pondéré à la case : 2/5 = 40 %');
  eq(r.body.progress.percentBySubProject, 63, '3.12 moyenne des sous-projets : (25 + 100)/2 = 63 %');
  ok(r.body.progress.percent !== r.body.progress.percentBySubProject, '3.13 les deux pondérations divergent bien');
  eq(r.body.progress.completedSubProjectCount, 1, '3.14 un sous-projet terminé');

  // R3 : une activité sans AUCUN sous-projet n'a pas de progress
  const vide = await makeActivity(alice, uniq('Vide'));
  r = await call('GET', '/activities/' + vide.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress, null, '3.15 R3 — activité sans sous-projet : pas d\'objet d\'avancement');

  // R4 : la fonction elle-même, appelée directement (c'est l'interface de Général)
  const { progressForActivities } = require('./server/lib/subprojects');
  const map = progressForActivities(alice.id, [solo.id, vide.id, 999999]);
  eq(map.size, 1, '3.16 R3/R4 — seule l\'activité qui a des sous-projets est dans la Map');
  eq(map.get(solo.id).percent, 40, '3.17 la Map porte le même percent que la route HTTP');
  const mapMallory = progressForActivities(mallory.id, [solo.id]);
  eq(mapMallory.size, 0, '3.18 R4 — un non-membre obtient une Map vide, sans exception');
  eq(progressForActivities(alice.id, []).size, 0, '3.19 tableau vide -> Map vide');
  eq(progressForActivities(null, [solo.id]).size, 0, '3.20 userId absent -> Map vide');

  // ============ 4. Droits d'accès ============
  console.log('4. Droits');
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + mallory.id);
  eq(r.status, 403, '4.1 non-membre : lecture refusée');
  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: mallory.id, name: 'Intrusion' });
  eq(r.status, 403, '4.2 non-membre : création refusée');
  r = await call('GET', '/sub-projects/' + sp1.id + '/items?userId=' + mallory.id);
  eq(r.status, 403, '4.3 non-membre : todolist refusée');
  r = await call('PUT', '/sub-project-items/' + items[1].id, { userId: mallory.id, done: true });
  eq(r.status, 403, '4.4 non-membre : impossible de cocher');
  r = await call('GET', '/sub-projects/' + sp1.id + '/messages?userId=' + mallory.id);
  eq(r.status, 403, '4.5 non-membre : fil refusé');
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=inconnu-xyz');
  eq(r.status, 404, '4.6 profil inexistant : 404');
  r = await call('GET', '/sub-projects/999999/items?userId=' + alice.id);
  eq(r.status, 404, '4.7 sous-projet inexistant : 404');

  // ============ 5. Activité PARTAGÉE : sous-projets communs ============
  console.log('5. Activité partagée');
  const shared = await makeActivity(alice, uniq('Partagee'));
  await addMember(shared, alice, bob);

  const spShared = (await call('POST', '/activities/' + shared.id + '/sub-projects', { userId: alice.id, name: 'Lancement' })).body;

  r = await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + bob.id);
  eq(r.status, 200, '5.1 Bob voit les sous-projets créés par Alice');
  eq(r.body.subProjects.length, 1, '5.2 sous-projets COMMUNS à l\'activité');
  eq(r.body.subProjects[0].createdByName, alice.name, '5.3 l\'origine est affichée');

  const sharedItem = (await call('POST', '/sub-projects/' + spShared.id + '/items', { userId: bob.id, label: 'Bob ajoute une tâche' })).body;
  ok(!!sharedItem.id, '5.4 Bob peut ajouter une tâche');
  r = await call('PUT', '/sub-project-items/' + sharedItem.id, { userId: bob.id, done: true });
  eq(r.body.doneBy, bob.id, '5.5 doneBy = Bob');
  r = await call('GET', '/sub-projects/' + spShared.id + '/items?userId=' + alice.id);
  eq(r.body.items[0].doneByName, bob.name, '5.6 Alice voit QUI a coché');

  // L'avancement est le même pour les deux membres
  const pA = (await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + alice.id)).body.progress;
  const pB = (await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + bob.id)).body.progress;
  eq(pA, pB, '5.7 même avancement vu par les deux membres');
  eq(pA.percent, 100, '5.8 1/1 = 100 %');

  // ============ 6. Fil de discussion par sous-projet ============
  console.log('6. Fil de discussion');
  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: 'On commence lundi ?' });
  eq(r.status, 201, '6.1 Alice écrit');
  const mAlice = r.body;
  eq(mAlice.userName, alice.name, '6.2 le message porte le nom de son auteur (multi-auteur)');
  ok(!!mAlice.userColor, '6.3 et sa couleur');

  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: bob.id, body: 'Oui, ça marche.' });
  const mBob = r.body;
  eq(r.status, 201, '6.4 Bob répond');

  r = await call('GET', '/sub-projects/' + spShared.id + '/messages?userId=' + bob.id);
  eq(r.body.messages.length, 2, '6.5 les deux messages sont dans le fil');
  eq(r.body.messages[0].id, mAlice.id, '6.6 ordre chronologique');

  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: '   ' });
  eq(r.status, 400, '6.7 message vide refusé');
  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: 'x'.repeat(2001) });
  eq(r.status, 400, '6.8 message trop long refusé (même plafond que le fil d\'activité)');

  r = await call('DELETE', '/sub-project-messages/' + mBob.id + '?userId=' + alice.id);
  eq(r.status, 403, '6.9 Alice ne peut pas supprimer le message de Bob');
  r = await call('DELETE', '/sub-project-messages/' + mBob.id + '?userId=' + bob.id);
  eq(r.status, 200, '6.10 Bob supprime son propre message');
  r = await call('GET', '/sub-projects/' + spShared.id + '/messages?userId=' + alice.id);
  eq(r.body.messages.length, 1, '6.11 il ne reste qu\'un message');

  // Le fil du sous-projet est BIEN DISTINCT de celui de l'activité
  r = await call('GET', '/community/activity-messages?userId=' + alice.id + '&activityId=' + shared.id);
  eq(r.body.messages.length, 0, '6.12 le fil de l\'ACTIVITÉ (Général) est resté vide : deux systèmes distincts');

  // ============ 7. Réordonnancement ============
  console.log('7. Réordonnancement');
  const order = (await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id)).body.subProjects.map((s) => s.id);
  const reversed = order.slice().reverse();
  r = await call('PUT', '/sub-projects/reorder', { userId: alice.id, activityId: solo.id, ids: reversed });
  eq(r.status, 200, '7.1 réordonnancement accepté');
  eq(r.body.subProjects.map((s) => s.id), reversed, '7.2 nouvel ordre appliqué');
  ok(!r.body.error, '7.3 "reorder" n\'a PAS été pris pour un :id (ordre des routes Express)');

  // Un id étranger ne peut pas être déplacé dans une autre activité
  await call('PUT', '/sub-projects/reorder', { userId: alice.id, activityId: solo.id, ids: [spShared.id] });
  r = await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.subProjects.length, 1, '7.4 le sous-projet de l\'activité partagée est intact');

  const itemIds = (await call('GET', '/sub-projects/' + sp1.id + '/items?userId=' + alice.id)).body.items.map((i) => i.id);
  r = await call('PUT', '/sub-projects/' + sp1.id + '/items/reorder', { userId: alice.id, ids: itemIds.slice().reverse() });
  eq(r.body.items.map((i) => i.id), itemIds.slice().reverse(), '7.5 réordonnancement des tâches');

  // ============ 8. Suppression ============
  console.log('8. Suppression');
  // Bob n'est ni créateur du sous-projet ni propriétaire de l'activité
  r = await call('DELETE', '/sub-projects/' + spShared.id + '?userId=' + bob.id);
  eq(r.status, 403, '8.1 un membre lambda ne supprime pas un sous-projet créé par un autre');
  const spByBob = (await call('POST', '/activities/' + shared.id + '/sub-projects', { userId: bob.id, name: 'De Bob' })).body;
  r = await call('DELETE', '/sub-projects/' + spByBob.id + '?userId=' + bob.id);
  eq(r.status, 200, '8.2 le créateur supprime son propre sous-projet');
  r = await call('DELETE', '/sub-projects/' + spShared.id + '?userId=' + alice.id);
  eq(r.status, 200, '8.3 le propriétaire de l\'activité peut supprimer');

  // Cascade : items et messages partent avec
  r = await call('GET', '/sub-projects/' + spShared.id + '/items?userId=' + alice.id);
  eq(r.status, 404, '8.4 le sous-projet supprimé n\'existe plus');
  const db = require('./server/db');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_items WHERE subProjectId = ?').get(spShared.id).n, 0, '8.5 cascade : tâches supprimées');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_messages WHERE subProjectId = ?').get(spShared.id).n, 0, '8.6 cascade : messages supprimés');

  // Suppression de l'ACTIVITÉ -> cascade sur les sous-projets
  const doomed = await makeActivity(alice, uniq('Ephemere'));
  const spDoomed = (await call('POST', '/activities/' + doomed.id + '/sub-projects', { userId: alice.id, name: 'Condamné' })).body;
  await call('POST', '/sub-projects/' + spDoomed.id + '/items', { userId: alice.id, label: 'tâche' });
  r = await call('DELETE', '/activities/' + doomed.id + '?userId=' + alice.id + '&keepHistory=0');
  ok(r.status === 200, '8.7 suppression de l\'activité');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_projects WHERE id = ?').get(spDoomed.id).n, 0, '8.8 cascade : sous-projets supprimés avec l\'activité');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_items WHERE subProjectId = ?').get(spDoomed.id).n, 0, '8.9 cascade : leurs tâches aussi');

  // ============ 9. Non-régression sur l'existant ============
  console.log('9. Non-régression');
  r = await call('GET', '/activities?userId=' + alice.id);
  eq(r.status, 200, '9.1 GET /activities répond toujours');
  r = await call('GET', '/stats?userId=' + alice.id);
  eq(r.status, 200, '9.2 GET /stats répond toujours');
  r = await call('GET', '/stats/timesheet?userId=' + alice.id + '&period=week');
  eq(r.status, 200, '9.3 GET /stats/timesheet répond toujours');
  r = await call('GET', '/community?userId=' + alice.id);
  eq(r.status, 200, '9.4 GET /community répond toujours');
  r = await call('GET', '/profile/posts?userId=' + alice.id);
  eq(r.status, 200, '9.5 GET /profile/posts répond toujours');
  r = await call('GET', '/notes?userId=' + alice.id);
  eq(r.status, 200, '9.6 GET /notes répond toujours');
  r = await call('GET', '/timer/status?userId=' + alice.id);
  eq(r.status, 200, '9.7 GET /timer/status répond toujours');
  // Le Chrono n'a PAS été touché : aucune colonne subProjectId (phase 2)
  const cols = db.prepare('PRAGMA table_info(time_entries)').all().map((c) => c.name);
  ok(cols.indexOf('subProjectId') === -1, '9.8 time_entries inchangée (phase 2 non commencée)');
  const cols2 = db.prepare('PRAGMA table_info(running_timers)').all().map((c) => c.name);
  ok(cols2.indexOf('subProjectId') === -1, '9.9 running_timers inchangée');

  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
