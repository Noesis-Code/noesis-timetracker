// Appartenance par catégorie, SUITE (19 nov. 2026) : endpoints qui restaient non filtrés dans une activité PARTAGÉE
// (tâches urgentes, temps par membre, budget d'heures, résumé annuel, allocation, calendrier) + départ du propriétaire.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-portee2-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const throws = (fn, code, errCode) => { try { fn(); return false; } catch (e) { return e.statusCode === code && (!errCode || e.errCode === errCode); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee');
const gt = require('../server/lib/goalstasks');
const U = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id);
['own', 'ra', 'rp', 'mp', 'm', 'ext'].forEach(U);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'ra', 'rp', 'mp', 'm'].forEach((u, i) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', ?)").run(act, u, '2026-01-0' + (i + 1)));
P.migrer();
categories.addCategory(act, 'Production'); const pole = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', pole); const sec = goals.secteursForPole(act, pole)[0].key;
categories.addCategory(act, 'Vente'); const pole2 = goals.categoriesForActivity(act).map((c) => c.key).filter((k) => k !== pole)[0];
R.ajouterCategorie('own', act, '_', 'ra'); R.ajouterCategorie('ra', act, pole, 'rp');
['rp', 'mp'].forEach((u) => db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = '_'").run(act, u));
['rp', 'mp'].forEach((u) => db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, ?, '-', '')").run(act, u));
P.ajouter('ra', act, pole, 'mp');
const today = '2026-11-19';

// ---- /bilan/urgentes ----
const bilan = require('../server/lib/bilan');
const total = (u) => [0, 1, 2].reduce((n, o) => n + bilan.urgentes(u, o, today).weeks.reduce((a, w) => a + w.count, 0), 0);
const avant = {}; ['own', 'ra', 'rp', 'mp', 'm'].forEach((u) => { avant[u] = total(u); });
const mk = (key, label, who) => { const t = gt.addCategoryTask(act, 'own', key, label, { dueDate: '2026-12-02' }); db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run(who, t.id); return t; };
mk(sec, 'Poncer la planche', 'mp'); mk(pole2, 'Facturer le client', 'm');
const delta = (u) => total(u) - avant[u];
assert(delta('m') === 1 && delta('mp') === 1, 'urgentes : un simple membre ne compte que ses tâches');
assert(delta('rp') === 1, 'urgentes : responsable de pôle = tâches de sa portée seulement');
assert(delta('ra') === 2 && delta('own') === 2, 'urgentes : responsable d’activité et propriétaire = tout');

// ---- /member-times ----
const TM = require('../server/lib/tempsmembres'), nop = () => {};
const tb = (u) => TM.tableFor(act, u, today);
assert(tb('m').members.length === 1 && tb('mp').members.length === 1 && tb('m').members[0].userId === 'm', 'temps par membre : un simple membre ne voit que lui');
const trp = tb('rp');
assert(trp.members.length === 5 && trp.levels.every((l) => l.key === pole) && trp.bars.every((b) => b.key === pole || b.key === sec), 'temps par membre : responsable de pôle = membres de sa portée, pôles de sa portée seulement');
assert(tb('ra').levels.some((l) => l.key === null) && tb('ra').levels.some((l) => l.key === pole2), 'temps par membre : responsable d’activité = tout');
const ch = (by, member, pk) => TM.changePlanned({ activityId: act, poleKey: pk, memberId: member, changedBy: by, afterMin: 120, origin: 'ajout' }, nop);
assert(ch('rp', 'mp', pole).ok, 'temps prévu : un responsable de pôle règle celui d’un membre de sa portée');
assert(ch('rp', 'mp', pole2).status === 403, 'temps prévu : refusé hors de sa portée (pôle voisin)');
assert(ch('mp', 'm', pole).status === 403 && ch('m', 'mp', pole).status === 403, 'temps prévu : un simple membre ne règle que le sien');
assert(ch('mp', 'mp', pole).ok, 'temps prévu : un membre règle le sien');
assert(tb('m').history.every((h) => h.memberId === 'm') && tb('mp').history.every((h) => h.memberId === 'mp') && tb('mp').history.length > 0, 'temps par membre : l’historique d’un simple membre est le sien');

// ---- /objectifs/temps (budget d'heures) ----
const TB = require('../server/lib/tempsbudget');
const etat = (u, level, pk, ck) => { try { return TB.etat(u, { activityId: act, level, poleKey: pk, categoryKey: ck, endDate: '2027-03-01' }); } catch (e) { return { err: e }; } };
assert(etat('m', 'pole', pole).err && etat('m', 'pole', pole).err.errCode === 'OBJECTIF_RESERVE_RESPONSABLES', 'budget d’heures : refusé à un simple membre');
assert(etat('rp', 'pole', pole2).err && etat('rp', 'pole', pole2).err.errCode === 'OBJECTIF_RESERVE_RESPONSABLES', 'budget d’heures : refusé hors de la portée du responsable');
assert(etat('rp', 'pole', pole).err === undefined && etat('ra', 'pole', pole2).err === undefined, 'budget d’heures : permis dans la portée');
assert(etat('rp', 'pole', pole).others.every((x) => x.key !== pole2), 'budget d’heures : les lignes voisines hors portée sont absentes');

// ---- /objectifs/allocation (lignes, repartition, set) ----
const AL = require('../server/lib/allocation');
const rows = [{ start: '2026-11-02', end: '2026-11-29' }];
assert(AL.lignes('m', { activityId: act, level: 'pole' }, rows)[0].cols.length === 0, 'allocation : un simple membre ne reçoit aucune colonne');
assert(AL.lignes('rp', { activityId: act, level: 'pole' }, rows)[0].cols.map((c) => c.poleKey).join() === pole && AL.lignes('ra', { activityId: act, level: 'pole' }, rows)[0].cols.length === 2, 'allocation : responsable de pôle = son pôle ; responsable d’activité = tout');
assert(throws(() => AL.set('m', { activityId: act, level: 'pole', poleKey: pole }, '2026-11-02', 60), 403, 'OBJECTIF_RESERVE_RESPONSABLES') && throws(() => AL.set('rp', { activityId: act, level: 'pole', poleKey: pole2 }, '2026-11-02', 60), 403), 'allocation : écriture refusée hors portée');
const entry = (u, key, h) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', '2026-11-10T12:00:00', '2026-11-10T13:00:00', ?, '2026-11-10', 'mardi', ?)").run(u, act, h * 3600, key);
entry('mp', sec, 2); entry('m', pole, 1);
const rep = (u) => AL.repartition(u, { activityId: act, level: 'pole' }, rows[0], today).categories.find((c) => c.poleKey === pole);
assert(rep('rp').membres.map((x) => x.userId).sort().join() === 'm,mp' && AL.repartition('m', { activityId: act, level: 'pole' }, rows[0], today).categories.length === 0, 'répartition : membres de la portée seulement ; simple membre : rien');
assert(rep('ra').membres.length === 2, 'répartition : responsable d’activité = tous les membres actifs');

// ---- Calendrier : flux .ics ----
const feed = require('../server/lib/calendarfeed');
const ics = (u) => feed.buildFeedForUser(u, new Date('2026-11-19T12:00:00Z'));
assert(ics('m').includes('Facturer le client') && !ics('m').includes('Poncer la planche'), 'calendrier : un simple membre ne reçoit que ses tâches');
assert(ics('rp').includes('Poncer la planche') && !ics('rp').includes('Facturer le client'), 'calendrier : responsable de pôle = tâches de sa portée');
assert(ics('ra').includes('Poncer la planche') && ics('ra').includes('Facturer le client'), 'calendrier : responsable d’activité = tout');

// ---- Départ du propriétaire ----
assert(P.exigerSuccesseur(act, 'own') === 'ra', 'propriétaire qui part : le plus ancien responsable d’activité reprend');
assert(P.exigerSuccesseur(act, 'm') === null, 'un non-propriétaire part sans condition');
const sans = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sans resp', 'own', '')").run().lastInsertRowid);
['own', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(sans, u));
assert(throws(() => P.exigerSuccesseur(sans, 'own'), 409, 'PROPRIETAIRE_SANS_SUCCESSEUR'), 'propriétaire seul responsable avec d’autres membres : départ refusé');
const seul = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Seul', 'own', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'own', '#fff', '')").run(seul);
assert(P.exigerSuccesseur(seul, 'own') === null, 'propriétaire seul dans l’activité : part librement');
P.oublier(act, 'rp');
assert(!db.prepare('SELECT 1 FROM member_scopes WHERE activityId = ? AND userId = ?').get(act, 'rp') && !db.prepare('SELECT 1 FROM category_managers WHERE activityId = ? AND userId = ?').get(act, 'rp'), 'départ : portées et responsabilités de catégorie effacées');

// ---- Activité à un seul membre : tout libre ----
const solo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'ext', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'ext', '#fff', '')").run(solo);
assert(P.membresVisibles('ext', solo) === null && TM.tableFor(solo, 'ext', today).members.length === 1, 'activité à un seul membre : aucune restriction');

// ---- /objectifs/resume-annuel (asynchrone) ----
const RS = require('../server/lib/objectifs-resume');
(async () => {
  const r = await RS.resumeAnnuel('m', act, 2027);
  assert(r.count === 0, 'résumé annuel : un simple membre ne reçoit aucun objectif');
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('membres-portee-endpoints-test : OK');
})();
