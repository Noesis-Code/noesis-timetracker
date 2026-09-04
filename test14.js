// test14.js — suite API dédiée aux sous-projets d'une activité
// (discussion "Sous-projets", 3 septembre 2026).
//
// Serveur Express réel + SQLite jetable, appels HTTP directs. Justifiée par la
// convention du 29 août 2026 : ce chantier ajoute des tables ET des droits
// d'accès entre membres d'une activité.
//
// Lancement : node test14.js  (le serveur doit tourner sur :3000 avec une base
// VIERGE — sinon les profils d'une exécution précédente faussent les
// assertions, piège du bac à sable documenté dans chantiers-en-cours.md)

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

async function makeSubProject(user, activity, name) {
  const r = await call('POST', '/activities/' + activity.id + '/sub-projects', { userId: user.id, name: name || uniq('SP') });
  if (r.status !== 201) throw new Error('création sous-projet ratée : ' + JSON.stringify(r));
  return r.body;
}

async function addSection(user, subProject, payload) {
  return call('POST', '/sub-projects/' + subProject.id + '/sections', Object.assign({ userId: user.id }, payload));
}

async function detail(user, subProject) {
  return (await call('GET', '/sub-projects/' + subProject.id + '?userId=' + user.id)).body;
}

(async () => {
  console.log('--- Sous-projets : suite API ---\n');

  const alice = await makeUser('Alice');
  const bob = await makeUser('Bob');
  const mallory = await makeUser('Mallory');   // membre d'aucune activité d'Alice

  // ============ 1. Activité SOLO, et un sous-projet qui naît VIDE ============
  console.log('1. Activité solo, sous-projet vide par défaut');
  const solo = await makeActivity(alice, uniq('Solo'));

  let r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.status, 200, '1.1 liste accessible sur une activité SOLO (pas de membersCount >= 2)');
  eq(r.body.subProjects, [], '1.2 aucun sous-projet au départ');
  eq(r.body.progress, null, '1.3 progress null tant qu\'aucun sous-projet (règle R3)');

  const sp1 = await makeSubProject(alice, solo, 'Refonte du site');
  ok(sp1.id > 0 && sp1.activityId === solo.id, '1.4 sous-projet rattaché à l\'activité');

  let d = await detail(alice, sp1);
  eq(d.sections, [], '1.5 ⭐ un sous-projet neuf n\'a AUCUNE section (pas de section vide par défaut)');
  eq(d.hasDiscussion, false, '1.6 ni discussion');

  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: '' });
  eq(r.status, 400, '1.7 nom vide refusé');
  r = await call('POST', '/activities/' + solo.id + '/sub-projects', { userId: alice.id, name: 'x'.repeat(121) });
  eq(r.status, 400, '1.8 nom trop long refusé');

  // ============ 2. Sections : les trois types, et leurs règles ============
  console.log('2. Sections');
  r = await addSection(alice, sp1, { kind: 'nimportequoi' });
  eq(r.status, 400, '2.1 type de section inconnu refusé');

  r = await addSection(alice, sp1, { kind: 'tasks' });
  eq(r.status, 201, '2.2 ajout d\'une section de tâches');
  const tasksSection = r.body.section;
  eq(tasksSection.kind, 'tasks', '2.3 la section créée est bien de type tasks');
  eq(tasksSection.items, [], '2.4 elle démarre sans tâche');
  eq(tasksSection.percent, null, '2.5 R1 — percent null tant qu\'aucune tâche');

  // Plusieurs sections de tâches sont autorisées
  r = await addSection(alice, sp1, { kind: 'tasks', title: 'Deuxième liste' });
  eq(r.status, 201, '2.6 plusieurs sections de tâches autorisées');
  const tasksSection2 = r.body.section;
  eq(tasksSection2.title, 'Deuxième liste', '2.7 titre de section conservé');

  // ⭐ Une SEULE discussion par sous-projet
  r = await addSection(alice, sp1, { kind: 'discussion' });
  eq(r.status, 201, '2.8 ajout de la discussion');
  r = await addSection(alice, sp1, { kind: 'discussion' });
  eq(r.status, 409, '2.9 ⭐ une SEULE discussion par sous-projet (deuxième refusée)');
  r = await addSection(bob, sp1, { kind: 'discussion' });
  eq(r.status, 403, '2.10 et un non-membre ne peut de toute façon rien ajouter');

  d = await detail(alice, sp1);
  eq(d.hasDiscussion, true, '2.11 hasDiscussion passe à vrai');
  eq(d.sections.length, 3, '2.12 trois sections');

  // ⭐ La discussion est TOUJOURS la dernière, alors que la section de sondages
  // est ajoutée APRÈS elle. Une section 'poll' ne porte aucune question : ce
  // n'est qu'un conteneur qui dit « ce sous-projet affiche ses sondages », les
  // sondages eux-mêmes appartenant au socle commun (server/lib/polls.js).
  r = await addSection(alice, sp1, { kind: 'poll' });
  eq(r.status, 201, '2.13 ajout de la section de sondages');
  const pollSection = r.body.section;
  r = await addSection(alice, sp1, { kind: 'poll' });
  eq(r.status, 409, '2.13b une seule section de sondages par sous-projet');

  d = await detail(alice, sp1);
  eq(d.sections.length, 4, '2.14 quatre sections');
  eq(d.sections[d.sections.length - 1].kind, 'discussion',
    '2.15 ⭐ la discussion est en DERNIER, bien qu\'elle ait été créée avant le sondage');
  eq(d.sections.filter((s) => s.kind === 'discussion').length, 1, '2.16 une seule discussion dans la liste');
  ok(d.sections.slice(0, 3).every((s) => s.kind === 'tasks' || s.kind === 'poll'),
    '2.17 ⭐ tâches et sondages sont tous au-dessus de la discussion');

  // ============ 3. Todolist et avancement ============
  console.log('3. Todolist et avancement');
  const items = [];
  for (const label of ['Maquettes', 'Intégration', 'Contenus', 'Mise en ligne']) {
    const c = await call('POST', '/sub-project-sections/' + tasksSection.id + '/items', { userId: alice.id, label });
    ok(c.status === 201, '3.x création tâche « ' + label + ' »');
    items.push(c.body);
  }

  r = await call('POST', '/sub-project-sections/' + pollSection.id + '/items', { userId: alice.id, label: 'Nope' });
  eq(r.status, 400, '3.1 on n\'ajoute pas une tâche à une section de sondage');

  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.total, 4, '3.2 total = 4 tâches');
  eq(r.body.progress.percent, 0, '3.3 percent = 0 quand il y a des tâches mais rien de coché');

  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: true });
  eq(r.status, 200, '3.4 cocher une tâche');
  eq(r.body.done, true, '3.5 la tâche est cochée (booléen, pas 0/1)');
  eq(r.body.doneBy, alice.id, '3.6 doneBy renseigné');

  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.percent, 25, '3.7 avancement 1/4 = 25 %');

  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: false });
  eq(r.body.doneBy, null, '3.8 doneBy remis à null au décochage');
  eq(r.body.doneAt, null, '3.9 doneAt remis à null au décochage');

  await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: true });
  r = await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, label: 'Maquettes v2' });
  eq(r.body.label, 'Maquettes v2', '3.10 renommage');
  eq(r.body.done, true, '3.11 le renommage ne décoche pas');

  // L'avancement additionne bien PLUSIEURS sections de tâches du même sous-projet
  const other = (await call('POST', '/sub-project-sections/' + tasksSection2.id + '/items', { userId: alice.id, label: 'Ailleurs' })).body;
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.total, 5, '3.12 les deux sections de tâches comptent dans le même total');
  await call('PUT', '/sub-project-items/' + other.id, { userId: alice.id, done: true });
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.done, 2, '3.13 done additionné sur les deux sections');
  eq(r.body.progress.percent, 40, '3.14 2/5 = 40 %');

  // ============ 4. ⭐ Contrat "Général" — forme INCHANGÉE par la restructuration ============
  console.log('4. Contrat d\'avancement (R1 à R4)');
  const spEmpty = await makeSubProject(alice, solo, 'Sans tâche');
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  const empty = r.body.subProjects.find((s) => s.id === spEmpty.id);
  eq(empty.total, 0, '4.1 sous-projet sans section de tâches : total = 0');
  eq(empty.percent, null, '4.2 R1 — percent vaut null (et PAS 0) quand total = 0');
  eq(r.body.progress.subProjectCount, 2, '4.3 subProjectCount compte aussi le sous-projet vide');

  // Un troisième sous-projet, petit et terminé : c'est ce qui fait DIVERGER
  // les deux pondérations, et c'est tout l'intérêt de les exposer toutes les
  // deux (un sous-projet à 1 tâche finie ne doit pas peser autant qu'un
  // sous-projet à 5 tâches à moitié fait).
  const spSmall = await makeSubProject(alice, solo, 'Petit');
  const smallSection = (await addSection(alice, spSmall, { kind: 'tasks' })).body.section;
  const smallItem = (await call('POST', '/sub-project-sections/' + smallSection.id + '/items', { userId: alice.id, label: 'Une seule' })).body;
  await call('PUT', '/sub-project-items/' + smallItem.id, { userId: alice.id, done: true });

  const { progressForActivities } = require('./server/lib/subprojects');
  const map = progressForActivities(alice.id, [solo.id, 999999]);
  eq(map.size, 1, '4.4 R3/R4 — seule l\'activité qui a des sous-projets est dans la Map');
  const prog = map.get(solo.id);
  eq(Object.keys(prog).sort(), ['activityId', 'completedSubProjectCount', 'done', 'percent', 'percentBySubProject', 'subProjectCount', 'total'],
    '4.5 ⭐ la forme de retour du contrat est INCHANGÉE malgré la restructuration en sections');
  eq(prog.done, 3, '4.6 done agrégé sur toute l\'activité');
  eq(prog.total, 6, '4.7 total agrégé sur toute l\'activité');
  eq(prog.percent, 50, '4.8 R2 — pondéré à la case : 3/6 = 50 %');
  eq(prog.percentBySubProject, 70, '4.9 R2 — moyenne des sous-projets : (40 + 100)/2 = 70 %');
  ok(prog.percent !== prog.percentBySubProject, '4.10 les deux pondérations divergent bien');
  eq(prog.subProjectCount, 3, '4.11 trois sous-projets');
  eq(prog.completedSubProjectCount, 1, '4.12 un seul terminé');
  eq(progressForActivities(mallory.id, [solo.id]).size, 0, '4.13 R4 — un non-membre obtient une Map vide, sans exception');
  eq(progressForActivities(alice.id, []).size, 0, '4.14 tableau vide -> Map vide');
  eq(progressForActivities(null, [solo.id]).size, 0, '4.15 userId absent -> Map vide');

  const vide = await makeActivity(alice, uniq('Vide'));
  r = await call('GET', '/activities/' + vide.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress, null, '4.16 R3 — activité sans sous-projet : pas d\'objet d\'avancement');

  // ============ 5. Sondages : SOCLE COMMUN, pas de réimplémentation ============
  // ⚠️ Les sondages d'un sous-projet sont servis par la discussion "Sondages"
  // (server/lib/polls.js + server/routes/polls.js), scope 'subproject'. Ce
  // volet n'écrit aucune table ni route de sondage : ces assertions vérifient
  // le BRANCHEMENT (la garde d'accès du scope passe bien par
  // checkSubProjectAccess), pas le socle lui-même.
  console.log('5. Sondages (socle commun, scope subproject)');

  r = await call('GET', '/polls?userId=' + alice.id + '&scope=subproject&scopeId=' + sp1.id);
  eq(r.status, 200, '5.1 les sondages du sous-projet sont servis par le socle commun');
  eq(r.body.polls, [], '5.2 aucun sondage au départ');
  eq(r.body.canCreate, true, '5.3 un membre de l\'activité peut en créer');

  r = await call('POST', '/polls', {
    userId: alice.id, scope: 'subproject', scopeId: String(sp1.id),
    question: 'Quelle date de mise en ligne ?', options: ['Le 10', 'Le 17'],
  });
  eq(r.status, 201, '5.4 création d\'un sondage dans le sous-projet');
  const poll = r.body;

  r = await call('GET', '/polls?userId=' + alice.id + '&scope=subproject&scopeId=' + sp1.id);
  eq(r.body.polls.length, 1, '5.5 il apparaît dans la liste du sous-projet');

  // ⭐ Le branchement de la garde : un NON-MEMBRE est refusé par le socle,
  // parce que la garde du scope 'subproject' appelle checkSubProjectAccess.
  r = await call('GET', '/polls?userId=' + mallory.id + '&scope=subproject&scopeId=' + sp1.id);
  eq(r.status, 403, '5.6 ⭐ un non-membre est refusé : la garde du scope passe par ce volet');
  r = await call('POST', '/polls', {
    userId: mallory.id, scope: 'subproject', scopeId: String(sp1.id),
    question: 'Intrusion', options: ['a', 'b'],
  });
  eq(r.status, 403, '5.7 et il ne peut pas en créer non plus');

  // Un sous-projet inexistant : la garde répond "introuvable", pas "accès ok"
  r = await call('GET', '/polls?userId=' + alice.id + '&scope=subproject&scopeId=999999');
  eq(r.status, 404, '5.8 sous-projet inexistant : la garde refuse');

  // Aucune table de sondage n'a été créée par ce volet : une seule table polls
  const dbCheck = require('./server/db');
  const pollTables = dbCheck.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'poll%'").all().map((t) => t.name).sort();
  eq(pollTables, ['poll_options', 'poll_votes', 'polls'],
    '5.9 ⭐ un seul jeu de tables de sondage dans la base (aucune implémentation parallèle)');

  // ============ 6. Droits ============
  console.log('6. Droits');
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + mallory.id);
  eq(r.status, 403, '6.1 non-membre : lecture de la liste refusée');
  r = await call('GET', '/sub-projects/' + sp1.id + '?userId=' + mallory.id);
  eq(r.status, 403, '6.2 non-membre : contenu du sous-projet refusé');
  r = await call('POST', '/sub-project-sections/' + tasksSection.id + '/items', { userId: mallory.id, label: 'Intrusion' });
  eq(r.status, 403, '6.3 non-membre : impossible d\'ajouter une tâche');
  r = await call('PUT', '/sub-project-items/' + items[1].id, { userId: mallory.id, done: true });
  eq(r.status, 403, '6.4 non-membre : impossible de cocher');
  // Le vote passe par le socle commun ; la route /sub-project-sections/:id/vote
  // n'existe pas dans ce volet (aucune réimplémentation) — d'où le 404 attendu.
  r = await call('POST', '/sub-project-sections/' + pollSection.id + '/vote', { userId: mallory.id, optionIds: [] });
  eq(r.status, 404, '6.5 ce volet n\'expose AUCUNE route de vote (socle commun uniquement)');
  r = await call('GET', '/sub-projects/' + sp1.id + '/messages?userId=' + mallory.id);
  eq(r.status, 403, '6.6 non-membre : fil refusé');
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=inconnu-xyz');
  eq(r.status, 404, '6.7 profil inexistant : 404');
  r = await call('GET', '/sub-projects/999999?userId=' + alice.id);
  eq(r.status, 404, '6.8 sous-projet inexistant : 404');
  r = await call('DELETE', '/sub-project-sections/999999?userId=' + alice.id);
  eq(r.status, 404, '6.9 section inexistante : 404');

  // ============ 7. Activité PARTAGÉE ============
  console.log('7. Activité partagée');
  const shared = await makeActivity(alice, uniq('Partagee'));
  await addMember(shared, alice, bob);
  const spShared = await makeSubProject(alice, shared, 'Lancement');
  const sharedTasks = (await addSection(alice, spShared, { kind: 'tasks' })).body.section;

  r = await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + bob.id);
  eq(r.status, 200, '7.1 Bob voit les sous-projets créés par Alice');
  eq(r.body.subProjects.length, 1, '7.2 sous-projets COMMUNS à l\'activité');
  eq(r.body.subProjects[0].createdByName, alice.name, '7.3 l\'origine est affichée');

  const sharedItem = (await call('POST', '/sub-project-sections/' + sharedTasks.id + '/items', { userId: bob.id, label: 'Bob ajoute' })).body;
  ok(!!sharedItem.id, '7.4 Bob peut ajouter une tâche');
  r = await call('PUT', '/sub-project-items/' + sharedItem.id, { userId: bob.id, done: true });
  eq(r.body.doneBy, bob.id, '7.5 doneBy = Bob');
  d = await detail(alice, spShared);
  eq(d.sections[0].items[0].doneByName, bob.name, '7.6 Alice voit QUI a coché');

  const pA = (await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + alice.id)).body.progress;
  const pB = (await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + bob.id)).body.progress;
  eq(pA, pB, '7.7 même avancement vu par les deux membres');
  eq(pA.percent, 100, '7.8 1/1 = 100 %');

  // Les deux membres accèdent aux sondages du sous-projet via le socle commun
  const sharedPollSection = (await addSection(alice, spShared, { kind: 'poll' })).body.section;
  r = await call('POST', '/polls', {
    userId: alice.id, scope: 'subproject', scopeId: String(spShared.id),
    question: 'On lance quand ?', options: ['Vite', 'Plus tard'],
  });
  eq(r.status, 201, '7.9 Alice crée un sondage dans le sous-projet partagé');
  r = await call('GET', '/polls?userId=' + bob.id + '&scope=subproject&scopeId=' + spShared.id);
  eq(r.status, 200, '7.10 Bob y accède aussi (membre de l\'activité)');
  eq(r.body.polls.length, 1, '7.11 il voit le sondage d\'Alice');

  // Bob n'est ni créateur de la section ni propriétaire de l'activité
  r = await call('DELETE', '/sub-project-sections/' + sharedPollSection.id + '?userId=' + bob.id);
  eq(r.status, 403, '7.12 un membre lambda ne retire pas la section d\'un autre');

  // ============ 8. Fil de discussion ============
  console.log('8. Fil de discussion');
  // Sans section 'discussion', on n'écrit pas — même par une requête fabriquée
  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: 'Coucou' });
  eq(r.status, 409, '8.1 ⭐ pas de discussion sur ce sous-projet : écriture refusée');

  const sharedDiscussion = (await addSection(alice, spShared, { kind: 'discussion' })).body.section;
  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: 'On commence lundi ?' });
  eq(r.status, 201, '8.2 une fois la discussion ajoutée, Alice écrit');
  const mAlice = r.body;
  eq(mAlice.userName, alice.name, '8.3 le message porte le nom de son auteur (multi-auteur)');
  ok(!!mAlice.userColor, '8.4 et sa couleur');

  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: bob.id, body: 'Oui, ça marche.' });
  const mBob = r.body;
  eq(r.status, 201, '8.5 Bob répond');

  r = await call('GET', '/sub-projects/' + spShared.id + '/messages?userId=' + bob.id);
  eq(r.body.messages.length, 2, '8.6 les deux messages sont dans le fil');

  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: '   ' });
  eq(r.status, 400, '8.7 message vide refusé');
  r = await call('POST', '/sub-projects/' + spShared.id + '/messages', { userId: alice.id, body: 'x'.repeat(2001) });
  eq(r.status, 400, '8.8 message trop long refusé');

  r = await call('DELETE', '/sub-project-messages/' + mBob.id + '?userId=' + alice.id);
  eq(r.status, 403, '8.9 Alice ne peut pas supprimer le message de Bob');
  r = await call('DELETE', '/sub-project-messages/' + mBob.id + '?userId=' + bob.id);
  eq(r.status, 200, '8.10 Bob supprime son propre message');

  // Retirer la SECTION discussion ne détruit pas les messages : elle masque
  // le fil, et il revient intact si on la remet.
  r = await call('DELETE', '/sub-project-sections/' + sharedDiscussion.id + '?userId=' + alice.id);
  eq(r.status, 200, '8.11 la section discussion est retirée');
  d = await detail(alice, spShared);
  eq(d.hasDiscussion, false, '8.12 le sous-projet n\'a plus de discussion');
  await addSection(alice, spShared, { kind: 'discussion' });
  r = await call('GET', '/sub-projects/' + spShared.id + '/messages?userId=' + alice.id);
  eq(r.body.messages.length, 1, '8.13 ⭐ les messages sont retrouvés intacts après remise de la discussion');

  // Le fil du sous-projet est BIEN DISTINCT de celui de l'activité
  r = await call('GET', '/community/activity-messages?userId=' + alice.id + '&activityId=' + shared.id);
  eq(r.body.messages.length, 0, '8.14 le fil de l\'ACTIVITÉ (Général) est resté vide : deux systèmes distincts');

  // ============ 9. Réordonnancement ============
  console.log('9. Réordonnancement');
  const order = (await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id)).body.subProjects.map((s) => s.id);
  const reversed = order.slice().reverse();
  r = await call('PUT', '/sub-projects/reorder', { userId: alice.id, activityId: solo.id, ids: reversed });
  eq(r.status, 200, '9.1 réordonnancement accepté');
  eq(r.body.subProjects.map((s) => s.id), reversed, '9.2 nouvel ordre appliqué');
  ok(!r.body.error, '9.3 "reorder" n\'a PAS été pris pour un :id (ordre des routes Express)');

  await call('PUT', '/sub-projects/reorder', { userId: alice.id, activityId: solo.id, ids: [spShared.id] });
  r = await call('GET', '/activities/' + shared.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.subProjects.length, 1, '9.4 un id étranger n\'a pas été déplacé dans une autre activité');

  const itemIds = (await detail(alice, sp1)).sections.find((s) => s.id === tasksSection.id).items.map((i) => i.id);
  r = await call('PUT', '/sub-project-sections/' + tasksSection.id + '/items/reorder', { userId: alice.id, ids: itemIds.slice().reverse() });
  eq(r.body.items.map((i) => i.id), itemIds.slice().reverse(), '9.5 réordonnancement des tâches');

  // ============ 10. Suppressions et cascades ============
  console.log('10. Suppressions et cascades');
  const db = require('./server/db');

  // Retirer une section de tâches emporte ses tâches
  const doomedSection = (await addSection(alice, sp1, { kind: 'tasks' })).body.section;
  const doomedItem = (await call('POST', '/sub-project-sections/' + doomedSection.id + '/items', { userId: alice.id, label: 'condamnée' })).body;
  await call('DELETE', '/sub-project-sections/' + doomedSection.id + '?userId=' + alice.id);
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_items WHERE id = ?').get(doomedItem.id).n, 0,
    '10.1 cascade : les tâches partent avec leur section');

  // Retirer la SECTION de sondages ne supprime AUCUN sondage : ils
  // appartiennent au socle commun et reviennent si on remet la section.
  await call('DELETE', '/sub-project-sections/' + pollSection.id + '?userId=' + alice.id);
  eq(db.prepare("SELECT COUNT(*) AS n FROM polls WHERE scope = 'subproject' AND scopeId = ?").get(String(sp1.id)).n, 1,
    '10.2 retirer la section de sondages ne détruit pas les sondages');
  await addSection(alice, sp1, { kind: 'poll' });
  r = await call('GET', '/polls?userId=' + alice.id + '&scope=subproject&scopeId=' + sp1.id);
  eq(r.body.polls.length, 1, '10.3 ⭐ ils sont retrouvés intacts quand on la remet');

  // Suppression du sous-projet
  r = await call('DELETE', '/sub-projects/' + spShared.id + '?userId=' + bob.id);
  eq(r.status, 403, '10.4 un membre lambda ne supprime pas le sous-projet d\'un autre');
  const spByBob = await (async () => (await call('POST', '/activities/' + shared.id + '/sub-projects', { userId: bob.id, name: 'De Bob' })).body)();
  r = await call('DELETE', '/sub-projects/' + spByBob.id + '?userId=' + bob.id);
  eq(r.status, 200, '10.5 le créateur supprime son propre sous-projet');
  r = await call('DELETE', '/sub-projects/' + spShared.id + '?userId=' + alice.id);
  eq(r.status, 200, '10.6 le propriétaire de l\'activité peut supprimer');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_sections WHERE subProjectId = ?').get(spShared.id).n, 0,
    '10.7 cascade : sections supprimées avec le sous-projet');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_messages WHERE subProjectId = ?').get(spShared.id).n, 0,
    '10.8 cascade : messages supprimés avec le sous-projet');
  eq(db.prepare("SELECT COUNT(*) AS n FROM polls WHERE scope = 'subproject' AND scopeId = ?").get(String(spShared.id)).n, 0,
    '10.8b les sondages du sous-projet sont nettoyés (pas de clé étrangère : fait à la main)');

  // Suppression de l'ACTIVITÉ -> cascade complète
  const doomedAct = await makeActivity(alice, uniq('Ephemere'));
  const spDoomed = await makeSubProject(alice, doomedAct, 'Condamné');
  const secDoomed = (await addSection(alice, spDoomed, { kind: 'tasks' })).body.section;
  await call('POST', '/sub-project-sections/' + secDoomed.id + '/items', { userId: alice.id, label: 'tâche' });
  r = await call('DELETE', '/activities/' + doomedAct.id + '?userId=' + alice.id + '&keepHistory=0');
  ok(r.status === 200, '10.9 suppression de l\'activité');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_projects WHERE id = ?').get(spDoomed.id).n, 0,
    '10.10 cascade : sous-projets supprimés avec l\'activité');
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_project_sections WHERE id = ?').get(secDoomed.id).n, 0,
    '10.11 cascade : leurs sections aussi');

  // ============ 12. ⭐ CLÔTURE : la date qui fait disparaître (sans effacer) ==
  // Demande d'Emilien du 3 septembre 2026. Ce qui est verrouillé ici : la
  // disparition est un MASQUAGE, la donnée survit, et le sous-projet clôturé
  // sort AUSSI du contrat d'avancement — sinon l'anneau compterait des tâches
  // qui ne sont plus à l'écran.
  console.log('12. Clôture d\'un sous-projet');
  const actC = await makeActivity(alice, uniq('Cloture'));
  const spLive = (await call('POST', '/activities/' + actC.id + '/sub-projects',
    { userId: alice.id, name: 'Toujours là' })).body;
  const spPast = (await call('POST', '/activities/' + actC.id + '/sub-projects',
    { userId: alice.id, name: 'Échue', closesAt: '2020-01-01' })).body;
  eq(spPast.closesAt, '2020-01-01', '12.1 la date de clôture est enregistrée telle quelle');
  eq(spLive.closesAt, null, '12.2 pas de date = pas d\'échéance');

  // Une date au format douteux ne doit pas faire échouer la création : elle est
  // simplement ignorée. Un sous-projet perdu vaut mieux qu'un refus obscur.
  const spJunk = (await call('POST', '/activities/' + actC.id + '/sub-projects',
    { userId: alice.id, name: 'Date bancale', closesAt: 'demain' })).body;
  eq(spJunk.closesAt, null, '12.3 une date mal formée est ignorée, pas refusée');

  r = await call('GET', '/activities/' + actC.id + '/sub-projects?userId=' + alice.id);
  const visibleIds = r.body.subProjects.map((s) => s.id);
  ok(visibleIds.indexOf(spPast.id) === -1, '12.4 le sous-projet échu a disparu de la liste');
  ok(visibleIds.indexOf(spLive.id) !== -1, '12.5 les autres sont toujours là');
  eq(r.body.closedCount, 1, '12.6 closedCount dit combien sont masqués');

  // ⭐ Il n'est PAS supprimé : c'est toute la différence entre une clôture et
  // une suppression, et c'est ce qui rend une date saisie de travers réversible.
  eq(db.prepare('SELECT COUNT(*) AS n FROM sub_projects WHERE id = ?').get(spPast.id).n, 1,
    '12.7 ⭐ le sous-projet clôturé existe toujours en base');

  r = await call('GET', '/activities/' + actC.id + '/sub-projects?userId=' + alice.id + '&includeClosed=1');
  const withClosed = r.body.subProjects.filter((s) => s.id === spPast.id)[0];
  ok(!!withClosed, '12.8 includeClosed=1 le fait revenir');
  eq(withClosed.closed, true, '12.9 il est marqué closed');
  eq(r.body.subProjects.filter((s) => s.id === spLive.id)[0].closed, false,
    '12.10 les autres ne le sont pas');

  // Retirer la date le fait revenir pour de bon.
  await call('PUT', '/sub-projects/' + spPast.id, { userId: alice.id, closesAt: '' });
  r = await call('GET', '/activities/' + actC.id + '/sub-projects?userId=' + alice.id);
  ok(r.body.subProjects.map((s) => s.id).indexOf(spPast.id) !== -1,
    '12.11 échéance retirée : le sous-projet est de retour');
  eq(r.body.closedCount, 0, '12.12 plus rien de clôturé');

  // La date du JOUR ne clôture pas : « après quoi il va disparaître ».
  const today = new Date().toISOString().slice(0, 10);
  await call('PUT', '/sub-projects/' + spPast.id, { userId: alice.id, closesAt: today });
  r = await call('GET', '/activities/' + actC.id + '/sub-projects?userId=' + alice.id);
  ok(r.body.subProjects.map((s) => s.id).indexOf(spPast.id) !== -1,
    '12.13 le jour même de la clôture, le sous-projet est encore visible');

  // ⭐ Et l'avancement suit : les tâches d'un sous-projet clôturé sortent du
  // total exposé à "Général".
  await call('PUT', '/sub-projects/' + spPast.id, { userId: alice.id, closesAt: '2020-01-01' });
  const secLive = (await addSection(alice, spLive, { kind: 'tasks' })).body.section;
  const secPast = (await addSection(alice, spPast, { kind: 'tasks' })).body.section;
  await call('POST', '/sub-project-sections/' + secLive.id + '/items', { userId: alice.id, label: 'Visible' });
  await call('POST', '/sub-project-sections/' + secPast.id + '/items', { userId: alice.id, label: 'Cachée' });
  const progC = progressForActivities(alice.id, [actC.id]).get(actC.id);
  eq(progC.total, 1, '12.14 ⭐ les tâches d\'un sous-projet clôturé ne comptent plus');
  eq(progC.subProjectCount, 2, '12.15 et il n\'est plus compté dans les sous-projets');
  eq(Object.keys(progC).sort(), ['activityId', 'completedSubProjectCount', 'done', 'percent', 'percentBySubProject', 'subProjectCount', 'total'],
    '12.16 ⭐ la FORME du contrat reste inchangée (R6)');

  // ============ 11. Non-régression sur l'existant ============
  console.log('11. Non-régression');
  for (const [path, label] of [
    ['/activities?userId=' + alice.id, 'GET /activities'],
    ['/stats?userId=' + alice.id, 'GET /stats'],
    ['/stats/timesheet?userId=' + alice.id + '&period=week', 'GET /stats/timesheet'],
    ['/community?userId=' + alice.id, 'GET /community'],
    ['/profile/posts?userId=' + alice.id, 'GET /profile/posts'],
    ['/notes?userId=' + alice.id, 'GET /notes'],
    ['/timer/status?userId=' + alice.id, 'GET /timer/status'],
  ]) {
    r = await call('GET', path);
    ok(r.status === 200, '11.x ' + label + ' répond toujours');
  }
  // ⚠️ MISE À JOUR DU 4 SEPTEMBRE 2026 — débordement signalé, fait par le
  // chantier « Chrono — sous-projets ». Ces deux assertions vérifiaient que la
  // PHASE 2 n'avait pas commencé (aucune colonne subProjectId sur les deux
  // tables du Chrono). Elle a commencé, et elle est livrée : les garder telles
  // quelles rendrait cette suite rouge pour une raison qui n'a rien d'un
  // défaut. Elles sont donc retournées — elles vérifient maintenant que la
  // phase 2 a été faite SANS RIEN CASSER de ce que ce fichier protège :
  // colonne présente, NULLABLE (le choix reste optionnel) et surtout
  // ON DELETE **SET NULL** et jamais CASCADE, pour qu'une suppression de
  // sous-projet n'efface jamais de temps enregistré.
  // Détail complet, et 111 assertions dédiées : test16.js.
  const teCols = db.prepare('PRAGMA table_info(time_entries)').all();
  const rtCols = db.prepare('PRAGMA table_info(running_timers)').all();
  const teSub = teCols.find((c) => c.name === 'subProjectId');
  const rtSub = rtCols.find((c) => c.name === 'subProjectId');
  ok(!!teSub && teSub.notnull === 0, '11.1 time_entries.subProjectId existe et est NULLABLE (choix optionnel)');
  ok(!!rtSub && rtSub.notnull === 0, '11.2 running_timers.subProjectId existe et est NULLABLE');
  ok(db.prepare('PRAGMA foreign_key_list(time_entries)').all()
    .some((f) => f.from === 'subProjectId' && f.table === 'sub_projects' && f.on_delete === 'SET NULL'),
    '11.2b ⭐ SET NULL et PAS CASCADE : supprimer un sous-projet n\'efface pas de temps');

  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
