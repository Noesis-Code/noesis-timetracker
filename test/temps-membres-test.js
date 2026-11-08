// Temps par membre (8 nov. 2026) : tableau (passé = moyenne 4 semaines, prévu = dernière ligne d'historique), responsables,
// 4 origines avec contrepartie, notification au membre modifié par un autre, « Changements demandés ». Aucun réseau.
const fs = require('fs');
const dir = require('./lib/tmpdir').mkTmp('tmt-tempsmembres-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const tm = require('../server/lib/tempsmembres');
const resp = require('../server/lib/responsables');
const now = new Date().toISOString();
['e', 'c', 'x'].forEach((id, i) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, ['Émilien', 'Camille', 'Xavier'][i], now));
const act = (owner) => Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Maison', ?, ?)").run(owner, now).lastInsertRowid);
const member = (a, u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', ?)").run(a, u, now);
const cat = (a, key, label, parent, pos) => db.prepare("INSERT INTO activity_goal_categories (activityId, key, label, parentKey, position, color, createdAt) VALUES (?, ?, ?, ?, ?, '#674EA7', ?)").run(a, key, label, parent || null, pos, now);
const today = '2026-11-08';
const chrono = (a, u, day, min, c) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', ?, ?, ?, ?, 'x', ?)").run(u, a, day + 'T09:00:00Z', day + 'T10:00:00Z', min * 60, day, c || null);

const A = act('e'); member(A, 'e'); member(A, 'c'); member(A, 'x');
cat(A, 'cuisine', 'Cuisine', null, 0); cat(A, 'linge', 'Linge', null, 1); cat(A, 'repas', 'Repas', 'cuisine', 2);
const B = act('c'); member(B, 'c'); member(B, 'e');

// Passé : 4 semaines, 480 min de Camille (dont 240 sur un secteur de Cuisine) → 120 min/sem ; une entrée hors fenêtre ignorée.
chrono(A, 'c', '2026-11-02', 240, 'repas'); chrono(A, 'c', '2026-10-20', 240, 'linge'); chrono(A, 'c', '2026-10-01', 600, 'linge');
let t = tm.tableFor(A, 'c', today);
const lvl = (k) => t.levels.find((l) => l.key === k);
const rowOf = (l, u) => l.rows.find((r) => r.userId === u);
assert(rowOf(lvl(null), 'c').pastMin === 120, '1. passé activité : 480 min / 4 semaines = 120 min');
assert(rowOf(lvl('cuisine'), 'c').pastMin === 60, '2. secteur Repas remonte au pôle Cuisine : 60 min/sem');
assert(t.levels.length === 3 && !t.levels.some((l) => l.key === 'repas'), '3. niveaux : activité + 2 pôles, jamais de secteur');
assert(t.isResponsable === false && tm.isResponsable(A, 'e'), '4. propriétaire responsable, Camille non');

const notes = [];
const N = (tg, by) => notes.push({ to: tg.memberId, by, before: tg.before, after: tg.afterMin });
let r = tm.changePlanned({ activityId: A, poleKey: 'cuisine', memberId: 'x', changedBy: 'c', afterMin: 60, origin: 'ajout' }, N);
assert(r.status === 403, '5. un membre non responsable ne modifie pas le temps d\'un autre');
assert(tm.changePlanned({ activityId: A, poleKey: null, memberId: 'c', changedBy: 'c', afterMin: 300, origin: 'ajout' }, N).status === 400, '5b. activité avec pôles : le prévu se règle par pôle');
r = tm.changePlanned({ activityId: A, poleKey: 'linge', memberId: 'c', changedBy: 'c', afterMin: 300, origin: 'ajout' }, N);
assert(r.ok && notes.length === 0, '6. son propre temps : permis, sans notification');
r = tm.changePlanned({ activityId: A, poleKey: 'linge', memberId: 'c', changedBy: 'e', afterMin: 360, origin: 'ajout' }, N);
assert(r.ok && notes.length === 1 && notes[0].to === 'c' && notes[0].before === 300 && notes[0].after === 360 && notes[0].by === 'e', '7. responsable → membre : notification avant → après, par qui');
assert(tm.plannedMin(A, 'linge', 'c') === 360, '8. prévu = dernière valeur');
const cap = (a, k, u) => (db.prepare('SELECT weeklyMinutes FROM goal_capacity_overrides WHERE activityId = ? AND category = ? AND userId = ?').get(a, k, u) || {}).weeklyMinutes;
assert(cap(A, 'linge', 'c') === 360, '8b. Feuille de route : capacité hebdo du membre mise à jour');
db.prepare("UPDATE goal_capacity_overrides SET weeklyMinutes = 345 WHERE activityId = ? AND category = 'linge' AND userId = 'c'").run(A);
assert(tm.plannedMin(A, 'linge', 'c') === 345, '8c. une capacité changée dans la Feuille de route se lit dans le tableau');

// Responsable ajouté (module responsables.js) : égal au propriétaire, modifie le propriétaire.
let thrown = false; try { resp.ajouter('c', A, 'x'); } catch (e) { thrown = true; }
assert(thrown, '9. un non-responsable n\'ajoute pas de responsable');
resp.ajouter('e', A, 'c');
assert(tm.isResponsable(A, 'c'), '10. responsable ajouté');
r = tm.changePlanned({ activityId: A, poleKey: 'cuisine', memberId: 'e', changedBy: 'c', afterMin: 120, origin: 'ajout' }, N);
assert(r.ok, '11. un responsable ajouté modifie le temps du propriétaire');

// Même activité : pris sur un autre pôle (secteur accepté, remonte au pôle).
tm.changePlanned({ activityId: A, poleKey: 'linge', memberId: 'x', changedBy: 'e', afterMin: 100, origin: 'ajout' }, N);
r = tm.changePlanned({ activityId: A, poleKey: 'repas', memberId: 'x', changedBy: 'e', afterMin: 30, origin: 'meme-activite', fromPoleKey: 'linge' }, N);
assert(r.ok && tm.plannedMin(A, 'cuisine', 'x') === 30 && tm.plannedMin(A, 'linge', 'x') === 70, '12. pris sur un autre pôle : +30 Cuisine, −30 Linge');

// Échange entre responsables : total constant.
r = tm.changePlanned({ activityId: A, poleKey: 'cuisine', memberId: 'x', changedBy: 'e', afterMin: 90, origin: 'echange', withMemberId: 'c' }, N);
assert(tm.plannedMin(A, 'cuisine', 'x') === 90 && tm.plannedMin(A, 'cuisine', 'c') === 0, '13. échange : +60 à Xavier, Camille plafonnée à 0');

// Autre activité : seulement pour son propre temps.
r = tm.changePlanned({ activityId: A, poleKey: 'linge', memberId: 'x', changedBy: 'e', afterMin: 500, origin: 'autre-activite', fromActivityId: B }, N);
assert(r.status === 403, '14. pris sur une autre activité refusé pour le temps d\'un autre');
tm.changePlanned({ activityId: B, poleKey: null, memberId: 'e', changedBy: 'e', afterMin: 200, origin: 'ajout' }, N);
r = tm.changePlanned({ activityId: A, poleKey: 'linge', memberId: 'e', changedBy: 'e', afterMin: 50, origin: 'autre-activite', fromActivityId: B }, N);
assert(r.ok && tm.plannedMin(B, null, 'e') === 150, '15. pris sur une autre activité : −50 sur Maison de Camille');

assert(tm.changePlanned({ activityId: A, poleKey: null, memberId: 'e', changedBy: 'e', afterMin: 10, origin: 'magie' }, N).status === 400, '16. origine inconnue refusée');
assert(tm.changePlanned({ activityId: A, poleKey: null, memberId: 'e', changedBy: 'e', afterMin: -5, origin: 'ajout' }, N).status === 400, '17. temps négatif refusé');

t = tm.tableFor(A, 'e', today);
assert(t.history.length >= 8 && t.history[0].id > t.history[t.history.length - 1].id, '18. historique continu, du plus récent au plus ancien');
assert(t.requested.length && t.requested.every((h) => h.changedBy !== h.memberId), '19. Changements demandés = modifications faites par un autre');
assert(lvl && t.levels[0].plannedMin === tm.plannedMin(A, null, 'c') + tm.plannedMin(A, null, 'e') + tm.plannedMin(A, null, 'x'), '20. total prévu du niveau = somme des membres');
assert(tm.tableFor(A, 'zz', today).status === 403, '21. non-membre : 403');

// Activité à UN SEUL membre : même tableau, avec lui seul ; « pris sur une autre activité » pour son propre temps ; jamais l'échange (personne d'autre).
const S1 = act('x'); member(S1, 'x'); const S2 = act('x'); member(S2, 'x');
const ts = tm.tableFor(S1, 'x', today);
assert(!ts.error && ts.levels.length === 1 && ts.levels[0].rows.length === 1 && ts.levels[0].rows[0].userId === 'x', '22. activité non partagée : le même tableau, avec le seul membre');
let rs = tm.changePlanned({ activityId: S2, poleKey: null, memberId: 'x', changedBy: 'x', afterMin: 300, origin: 'ajout' }, () => {});
assert(rs.ok, '23. non partagée : s’ajoute');
rs = tm.changePlanned({ activityId: S1, poleKey: null, memberId: 'x', changedBy: 'x', afterMin: 120, origin: 'autre-activite', fromActivityId: S2 }, () => {});
assert(rs.ok && tm.plannedMin(S1, null, 'x') === 120 && tm.plannedMin(S2, null, 'x') === 180, '24. non partagée : pris sur une autre activité à soi (300 → 180, 120 ajoutés)');
rs = tm.changePlanned({ activityId: S1, poleKey: null, memberId: 'x', changedBy: 'x', afterMin: 200, origin: 'autre-activite', fromActivityId: A }, () => {});
assert(rs.error && rs.status === 400, '25. une activité dont on n’est pas membre ne peut pas être source');
rs = tm.changePlanned({ activityId: S1, poleKey: null, memberId: 'x', changedBy: 'x', afterMin: 200, origin: 'echange', withMemberId: 'c' }, () => {});
assert(rs.error, '26. non partagée : pas d’échange (personne d’autre)');

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* Windows : base encore ouverte */ }
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
process.exit(0);
