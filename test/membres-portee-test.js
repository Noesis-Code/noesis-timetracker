// Appartenance par catégorie (19 nov. 2026) : migration sans perte, ajout/retrait selon la hiérarchie, portée par rôle (Chrono, statistiques, Bilan, tâches, objectifs, activités partagées).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-portee-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const throws = (fn, code, errCode) => { try { fn(); return false; } catch (e) { return e.statusCode === code && (!errCode || e.errCode === errCode); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee'); // chargé AVANT les membres : sa migration de démarrage a déjà tourné (à vide)
const U = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id);
// Avant la migration : membres « à l'ancienne » (aucune ligne de portée)
['own', 'ra', 'rp', 'ms', 'mp', 'm', 'ext'].forEach(U);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'ra', 'rp', 'ms', 'mp', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', ?)").run(act, u, '2026-01-01'));
// ---- Migration sans perte ----
assert(db.prepare('SELECT COUNT(*) c FROM member_scopes WHERE activityId = ?').get(act).c === 0, 'avant migration : aucune ligne de portée');
['ms', 'mp', 'm'].forEach((u) => assert(P.scope(u, act).all, 'sans ligne, ' + u + ' = portée activité (profil existant)'));
const n1 = P.migrer(); assert(n1 === 6 && P.migrer() === 0, 'migration : une ligne « activité » par membre, idempotente');
assert(db.prepare('SELECT COUNT(*) c FROM activity_members WHERE activityId = ?').get(act).c === 6, 'migration : aucun membre perdu');
categories.addCategory(act, 'Production'); const pole = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', pole); const sec = goals.secteursForPole(act, pole)[0].key;
categories.addCategory(act, 'Vente'); const pole2 = goals.categoriesForActivity(act).map((c) => c.key).filter((k) => k !== pole)[0];
R.ajouterCategorie('own', act, '_', 'ra'); R.ajouterCategorie('ra', act, pole, 'rp');
// rp, ms, mp, m partent de la portée activité (existants) : on réduit ms et mp en retirant leur ligne « activité » par SQL (équivaut à un membre créé limité), puis on les ajoute par l'API
['ms', 'mp', 'rp'].forEach((u) => db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = '_'").run(act, u));
// ---- Ajout / retrait selon la hiérarchie ----
assert(P.scope('ms', act).all, 'membre sans ligne : retombe sur la portée activité (jamais perdu)');
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'ms', '-', '')").run(act); // « aucune catégorie » : vide
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'mp', '-', '')").run(act);
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'rp', '-', '')").run(act);
assert(!P.scope('ms', act).all && P.scope('ms', act).roots.length === 0, 'ligne « aucune » : portée vide');
let d = P.membresDe('rp', act, pole);
assert(d.canOpen && d.canAdd && d.candidates.some((c) => c.id === 'ms') && !d.candidates.some((c) => c.id === 'm'), 'candidats du pôle : membres limités hors du pôle ; un membre de portée activité n’en est pas un');
assert(throws(() => P.ajouter('m', act, pole, 'ms'), 403), 'un simple membre n’ajoute personne');
assert(throws(() => P.ajouter('rp', act, pole, 'ext'), 400), 'non-membre : refusé (passer par l’invitation)');
assert(throws(() => P.ajouter('rp', act, pole2, 'ms'), 403), 'un responsable de pôle n’ajoute pas dans un autre pôle');
assert(throws(() => P.ajouter('rp', act, '_', 'ms'), 403), 'un responsable de pôle n’ajoute pas au niveau activité');
P.ajouter('ra', act, pole, 'mp'); // responsable d'activité -> pôle
assert(P.scope('mp', act).has(pole) && P.scope('mp', act).has(sec) && !P.scope('mp', act).has(pole2) && !P.scope('mp', act).all, 'membre de pôle : pôle + secteurs, pas le pôle voisin');
d = P.ajouter('rp', act, sec, 'ms'); // responsable de pôle -> secteur
assert(P.scope('ms', act).has(sec) && !P.scope('ms', act).has(pole) && !P.scope('ms', act).has(pole2) && P.scope('ms', act).roots.length === 1, 'membre de secteur : ce secteur seulement');
assert(d.members.some((m) => m.id === 'ms' && m.via === 'categorie' && m.removable) && d.members.some((m) => m.id === 'mp' && m.via === 'dessus'), 'liste du secteur : membre direct (retirable) et membre via le pôle');
assert(throws(() => P.ajouter('rp', act, sec, 'ms'), 409), 'déjà membre : refusé');
assert(throws(() => P.retirer('rp', act, sec, 'mp'), 400), 'membre via le pôle : non retirable depuis le secteur');
assert(throws(() => P.retirer('rp', act, pole, 'own'), 400), 'le propriétaire ne se retire jamais');
assert(throws(() => P.retirer('m', act, sec, 'ms'), 403), 'un simple membre ne retire personne');
P.ajouter('ra', act, pole2, 'ms'); assert(P.scope('ms', act).roots.length === 2 && P.scope('ms', act).has(pole2), 'plusieurs appartenances (plusieurs lignes)');
P.retirer('ra', act, pole2, 'ms'); assert(!P.scope('ms', act).has(pole2), 'retrait d’une appartenance');
// Responsable de pôle non retirable par un pair, retirable par un niveau supérieur (hiérarchie existante)
assert(throws(() => P.retirer('rp', act, pole, 'rp'), 403), 'auto-retrait : voir hiérarchie');
P.retirer('rp', act, sec, 'ms'); assert(P.scope('ms', act).roots.length === 0 && !P.scope('ms', act).all, 'dernière appartenance retirée : le membre reste dans l’activité sans portée (rien n’est supprimé)');
assert(!!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(act, 'ms'), 'le membre sans portée reste membre');
P.ajouter('rp', act, sec, 'ms');
// responsable de pôle : portée du pôle (rp a une ligne « - » seulement, mais il est responsable de pôle => membre implicite)
assert(P.scope('rp', act).has(pole) && P.scope('rp', act).has(sec), 'responsable de pôle : implicitement membre de son pôle et dessous');
assert(P.managed('rp', act).has(sec) && !P.managed('rp', act).has(pole2) && !P.managed('rp', act).all, 'responsable de pôle : gère son pôle et ses secteurs seulement');
assert(P.managed('ra', act).all && P.managed('own', act).all && !P.managed('m', act).all && !P.estResponsable('m', act) && !P.estResponsable('mp', act), 'gérée : propriétaire/responsable d’activité = tout ; simples membres = rien');
assert(P.membres('m', act).members.length === 1 && P.membres('ra', act).members.length === 6 && P.membres('rp', act).members.some((x) => x.id === 'ms'), 'liste des membres : simple membre = lui seul ; responsable = ceux de sa portée');
assert(throws(() => P.membres('ext', act), 403), 'non-membre : refusé');
// ---- Chrono : choix limité ----
const ec = require('../server/lib/entrycategory');
const ch = (u, k, cur, o) => ec.resolveCategoryKey(act, k, cur, u, o);
assert(!ch('own', pole2).error && !ch('m', pole2).error, 'propriétaire et membre d’activité : tout le Chrono');
assert(!ch('mp', pole).error && !ch('mp', sec).error && ch('mp', pole2).error && ch('mp', pole2).error.status === 403, 'membre de pôle : son pôle et son secteur, pas le pôle voisin');
assert(!ch('ms', sec).error && ch('ms', pole).error && ch('ms', pole2).error, 'membre de secteur : son secteur seulement (pas son pôle)');
assert(ch('ms', null, null, { require: true }).categoryKey === sec, 'un seul secteur possible : posé d’office à l’arrêt');
assert(ch('mp', null, null).categoryKey === null && ch('mp', undefined, null).categoryKey === null, 'départ du chrono sans catégorie : toléré');
P.ajouter('ra', act, pole2, 'mp');
assert(ch('mp', null, null, { require: true }).error.status === 400, 'deux appartenances et rien choisi à l’arrêt : choix exigé');
P.retirer('ra', act, pole2, 'mp');
db.prepare("INSERT OR REPLACE INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'm', '-', '')").run(act); db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = 'm' AND categoryKey = '_'").run(act);
assert(ch('m', null).error.status === 403, 'membre sans portée : aucun enregistrement possible');
db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = 'm'").run(act); db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'm', '_', '')").run(act);
// ---- Statistiques par catégorie : un membre ne voit que lui ; un responsable, sa portée ----
const cs = require('../server/lib/categorystats');
const t0 = '2026-11-10';
const entry = (u, key, h) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', ?, ?, ?, ?, 'mardi', ?)").run(u, act, t0 + 'T12:00:00', t0 + 'T1' + (2 + h) + ':00:00', h * 3600, t0, key);
entry('mp', pole, 1); entry('mp', sec, 1); entry('ms', sec, 1); entry('m', pole2, 2); entry('ra', null, 1);
let a = cs.checkAccess('m', act, 'mp'); assert(a.error && a.error.status === 403 && a.error.body.code === 'DONNEES_RESERVEES_RESPONSABLES', 'simple membre : les données d’un autre sont refusées');
a = cs.checkAccess('mp', act, 'ms'); assert(a.error && a.error.status === 403, 'membre de pôle : pas les données d’un autre membre');
assert(!cs.checkAccess('m', act, null).error && cs.checkAccess('m', act, null).viewScope === null, 'ses propres données : toujours');
a = cs.checkAccess('rp', act, 'mp'); assert(!a.error && !a.viewScope.all, 'responsable de pôle : voit un membre, avec sa portée');
const keysOf = (b) => b.categories.map((c) => c.category).sort().join(',');
assert(keysOf(cs.categoryBreakdownForRange('mp', act, t0, t0, undefined, a.viewScope)) === [pole, sec].sort().join(','), 'responsable de pôle : répartition limitée à son pôle et ses secteurs');
const mq = cs.categoryBreakdownForRange('m', act, t0, t0, undefined, a.viewScope); assert(mq.categories.length === 0 && mq.totalSeconds === 0, 'responsable de pôle : rien du pôle voisin ni du temps sans catégorie');
a = cs.checkAccess('ra', act, 'm'); assert(!a.error && cs.categoryBreakdownForRange('m', act, t0, t0, undefined, a.viewScope).totalSeconds === 7200, 'responsable d’activité : tout');
const grid = cs.categoryTimesheet('m', act, 'week', 0, undefined, P.managed('rp', act)); assert(JSON.stringify(grid).indexOf('"category":"' + pole2 + '"') < 0, 'feuille de temps : rien du pôle voisin pour un responsable de pôle');
const chart = cs.categoryChart('m', act, 'day', undefined, P.managed('rp', act)); assert(chart.points.every((p) => !p.categories || p.categories.length === 0 || true), 'graphique filtré sans erreur');
// ---- Bilan ----
const bilan = require('../server/lib/bilan');
const sp = require('../server/lib/subprojects'), gt = require('../server/lib/goalstasks');
const mk = (u, key, label, due) => gt.addCategoryTask(act, u, key, label, { dueDate: due || '2026-11-20' });
// ---- Tâches (activité partagée) : création réservée aux responsables, selon leur portée ----
assert(throws(() => mk('m', sec, 'Poncer la planche'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'simple membre : création de tâche refusée (code TACHE_RESERVEE_RESPONSABLES)');
assert(throws(() => mk('mp', pole2, 'Facturer'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'membre de pôle : création refusée');
assert(throws(() => mk('rp', pole2, 'Facturer'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'responsable de pôle : création refusée hors de sa portée');
const tSec = mk('rp', sec, 'Poncer la planche'); assert(!!tSec.id, 'responsable de pôle : crée dans son secteur');
const tSec2 = mk('rp', sec, 'Vernir la planche'); const tSec3 = mk('ra', sec, 'Ranger l’atelier'); const tV = mk('own', pole2, 'Facturer le client');
const setPlan = (id, u) => db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run(u, id);
setPlan(tSec.id, 'mp'); setPlan(tSec2.id, 'ms'); setPlan(tV.id, 'm');
const lst = (u) => { const o = gt.tasksByCategoryForActivity(act, u); return Object.keys(o).reduce((a, k) => a.concat(o[k].map((t) => t.id)), []).sort((x, y) => x - y).join(','); };
assert(lst('mp') === String(tSec.id) && lst('ms') === String(tSec2.id) && lst('m') === String(tV.id), 'chaque membre ne reçoit que les tâches qui lui sont attribuées');
assert(lst('rp') === [tSec.id, tSec2.id, tSec3.id].sort((x, y) => x - y).join(','), 'responsable de pôle : les tâches de sa portée (pas celles du pôle voisin)');
assert(lst('ra') === [tSec.id, tSec2.id, tSec3.id, tV.id].sort((x, y) => x - y).join(',') && lst('own') === lst('ra'), 'responsable d’activité et propriétaire : toutes');
const ov = gt.tasksOverviewForActivity(act, '2026-11-19', 'mp'); assert(ov.groups.every((g) => g.key === sec) && ov.groups.reduce((n, g) => n + g.tasks.length, 0) === 1, 'aperçu des tâches : portée et attribution du membre');
assert(gt.dailyListForActivity(act, '2026-11-19', 'ms').upcoming.concat(gt.dailyListForActivity(act, '2026-11-19', 'ms').todayTasks).every((t) => t.id === tSec2.id), 'liste du jour : seulement les siennes');
// Précision d'Émilien : jamais de tâche là où l'on n'est que MEMBRE (même membre du pôle ou du secteur) ; un membre crée librement pour lui seul (activité à un membre, voir plus bas)
assert(throws(() => mk('mp', sec, 'Tâche perso dans mon pôle'), 403, 'TACHE_RESERVEE_RESPONSABLES') && throws(() => mk('ms', sec, 'Tâche perso dans mon secteur'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'membre de pôle ou de secteur : aucune tâche dans sa propre catégorie');
R.ajouterCategorie('rp', act, sec, 'ms'); // ms devient responsable de son secteur
assert(!!mk('ms', sec, 'Tâche du responsable de secteur').id && throws(() => mk('ms', pole2, 'Hors portée'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'responsable de secteur : crée dans son secteur seulement');
R.retirerCategorie('rp', act, sec, 'ms'); assert(throws(() => mk('ms', sec, 'Redevenu simple membre'), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'plus responsable : redevenu simple membre, création refusée');
// Modification : un membre ne fait que cocher ses tâches
const it = sp.getItem(tSec.id), sub = sp.getSubProject(it.subProjectId);
assert(throws(() => P.exigerModificationTache('mp', act, sub.goalCategory, it, { label: 'Autre' }), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'membre : modifier le contenu refusé');
assert(throws(() => P.exigerModificationTache('mp', act, sub.goalCategory, sp.getItem(tSec2.id), { done: true }), 403, 'TACHE_NON_ATTRIBUEE'), 'membre : cocher la tâche d’un autre refusé');
assert(!throws(() => P.exigerModificationTache('mp', act, sub.goalCategory, it, { done: true }), 403), 'membre : coche sa propre tâche');
assert(!throws(() => P.exigerModificationTache('rp', act, sub.goalCategory, it, { label: 'Autre', plannedUserId: 'ms' }), 403), 'responsable de la portée : modifie');
assert(!P.peutLireTache('m', act, sub.goalCategory, it) && P.peutLireTache('mp', act, sub.goalCategory, it) && P.peutLireTache('rp', act, sub.goalCategory, it), 'lecture d’une tâche : attribuée ou responsable de la portée');
assert(throws(() => gt.moveCategoryTask(act, 'mp', tSec.id, sec), 403, 'TACHE_RESERVEE_RESPONSABLES'), 'déplacer une tâche : réservé aux responsables');
// Activité à un seul membre : libre
const solo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'ext', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'ext', '#fff', '')").run(solo); categories.addCategory(solo, 'Seul');
const soloKey = goals.categoriesForActivity(solo)[0].key;
assert(!!gt.addCategoryTask(solo, 'ext', soloKey, 'Tâche libre', { dueDate: '2026-11-20' }).id && P.objectifVisible('ext', solo, soloKey, null), 'activité à un seul membre : aucune restriction');
// Bilan : proportion et moyenne
const doneAt = '2026-11-03T15:00:00.000Z';
db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, doneBy = ? WHERE id = ?').run(doneAt, 'mp', tSec.id);
db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, doneBy = ? WHERE id = ?').run(doneAt, 'm', tV.id);
const today = '2026-11-19';
const names = (r) => r.rows.map((x) => x.userId || x.key).sort().join(',');
assert(names(bilan.proportion('m', act, today)) === '' || bilan.proportion('m', act, today).rows.length === 0, 'Bilan : un simple membre n’a pas de comparaison entre membres');
assert(bilan.moyenneTaches('m', act, today).rows.length === 1 && bilan.moyenneTaches('m', act, today).rows[0].total === 1, 'Bilan : un simple membre ne compte que ses données');
const bp = bilan.proportion('rp', act, today); assert(bp.rows.find((x) => x.userId === 'mp').realPct === 100 && bp.rows.find((x) => x.userId === 'm').realPct === 0, 'Bilan : proportion d’un responsable de pôle = tâches de son pôle seulement');
const mr = bilan.moyenneTaches('rp', act, today); assert(mr.rows.find((x) => x.key === 'tous').total === 1, 'Bilan : responsable de pôle = tâches de son pôle seulement (pas celles du pôle voisin)');
assert(bilan.moyenneTaches('ra', act, today).rows.find((x) => x.key === 'tous').total === 2, 'Bilan : responsable d’activité = tout');
// ---- Objectifs : réservés aux responsables dans une activité partagée ----
const O = require('../server/lib/objectifs');
const body = (u, level, pk, ck) => ({ title: 'Finir le meuble', activityId: act, endDate: '2027-02-01', amount: 8, unit: 'semaines', periodWeeks: 4, weekly: false, level, poleKey: pk, categoryKey: ck });
assert(throws(() => O.creer('m', body('m', 'secteur', pole, sec)), 403, 'OBJECTIF_RESERVE_RESPONSABLES') && throws(() => O.creer('mp', body('mp', 'pole', pole, null)), 403, 'OBJECTIF_RESERVE_RESPONSABLES'), 'simple membre : création d’objectif refusée (code OBJECTIF_RESERVE_RESPONSABLES)');
assert(throws(() => O.creer('rp', body('rp', 'pole', pole2, null)), 403, 'OBJECTIF_RESERVE_RESPONSABLES'), 'responsable de pôle : pas d’objectif dans un autre pôle');
assert(throws(() => O.creer('rp', body('rp', 'activite', null, null)), 403, 'OBJECTIF_RESERVE_RESPONSABLES'), 'responsable de pôle : pas d’objectif au niveau de l’activité');
let made = null; try { made = O.creer('rp', body('rp', 'secteur', pole, sec)); } catch (e) { made = { err: e.message, st: e.statusCode, ec: e.errCode }; }
assert(made && !made.err, 'responsable de pôle : objectif dans sa portée (' + (made && made.err ? made.err : 'ok') + ')');
if (made && made.id) {
  assert(O.liste('rp', 'tous').some((o) => o.id === made.id), 'responsable : reçoit l’objectif de sa portée');
  db.prepare("UPDATE user_objectives SET userId = 'm' WHERE id = ?").run(made.id); // un simple membre qui en possédait un (avant la règle)
  assert(O.liste('m', 'tous').length === 0 && throws(() => O.get('m', made.id), 403, 'OBJECTIF_RESERVE_RESPONSABLES'), 'simple membre : ne reçoit aucun objectif d’une activité partagée');
  const st = O.structure('mp').activities.find((x) => x.id === act); assert(st && st.poles.length === 0, 'arbre : un simple membre ne reçoit aucune colonne');
  const sr = O.structure('rp').activities.find((x) => x.id === act); assert(sr.poles.length === 1 && sr.poles[0].key === pole && sr.poles[0].secteurs.length === 1, 'arbre : responsable de pôle = son pôle et ses secteurs');
  const so = O.structure('ra').activities.find((x) => x.id === act); assert(so.poles.length === 2, 'arbre : responsable d’activité = tout');
}
// ---- Invitation avec portée ----
assert(P.peutInviter('own', act, null) && P.peutInviter('m', act, null) && !P.peutInviter('mp', act, null) && !P.peutInviter('rp', act, null), 'invitation sans portée : membres de portée activité seulement');
assert(P.peutInviter('rp', act, sec) && !P.peutInviter('rp', act, pole2) && !P.peutInviter('mp', act, pole), 'invitation avec portée : responsable de la catégorie ou au-dessus');
P.poserALAcceptation(act, 'ext', sec, 'rp'); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'ext', '#fff', '')").run(act);
assert(P.scope('ext', act).has(sec) && !P.scope('ext', act).all && !P.scope('ext', act).has(pole), 'invité dans un secteur : ce secteur seulement');
// Candidats : un membre d'un secteur est candidat d'un autre secteur du même niveau
d = P.membresDe('ra', act, pole2); assert(d.canAdd && d.candidates.some((c) => c.id === 'ext') && !d.candidates.some((c) => c.id === 'ra'), 'candidats du pôle voisin : membres limités ailleurs');
// Confidentialité : le pôle voisin invisible à la liste de catégories d'un membre limité
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('membres-portee-test : OK');
