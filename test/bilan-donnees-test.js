// Bilan : données des nouveaux blocs (moyenne des tâches réalisées, tâches urgentes par période, proportion réelle contre demandée). Usage : node test/bilan-donnees-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-bilan-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), goals = require('../server/lib/goals'), goalstasks = require('../server/lib/goalstasks'), B = require('../server/lib/bilan'), O = require('../server/lib/objectifs');
require('../server/lib/partagetaches');
['u1', 'u2'].forEach((id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id === 'u1' ? 'Émilien' : 'Gaspard'));
const mkAct = (name, owner, members) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(name, owner).lastInsertRowid); members.forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#A04B52', datetime('now'))").run(id, u)); goals.addCategory(id, 'Pôle'); return { id, pk: goals.categoriesForActivity(id)[0].key }; };
const TODAY = '2027-03-10', add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const P = B.lastPeriods(TODAY);
assert(P.length === 4 && P[3].end < O.periodStartOf(TODAY) && P[0].start === add(P[3].start, -84), 'les 4 dernières périodes complètes avant la période en cours');
// activité partagée à deux : tâches faites sur les 4 périodes (16 semaines)
const A = mkAct('Maison', 'u1', ['u1', 'u2']);
function done(c, user, day) { const id = goalstasks.addCategoryTask(c.id, 'u1', c.pk, 'T' + Math.random()).id; db.prepare("UPDATE sub_project_items SET done = 1, doneBy = ?, doneAt = ? WHERE id = ?").run(user, day + 'T12:00:00.000Z', id); }
// chaque lundi des 16 semaines : 2 tâches par u1 ; chaque mercredi : 1 tâche par u2 ; la semaine 1 de chaque période compte 1 tâche de plus par u1 (un mardi)
for (let w = 0; w < 16; w++) { const mon = add(P[0].start, 7 * w); done(A, 'u1', mon); done(A, 'u1', mon); done(A, 'u2', add(mon, 2)); if (w % 4 === 0) done(A, 'u1', add(mon, 1)); }
const mt = B.moyenneTaches('u1', A.id, TODAY);
const tous = mt.rows[0], u1 = mt.rows.find((r) => r.userId === 'u1'), u2 = mt.rows.find((r) => r.userId === 'u2');
assert(mt.rows.length === 3 && tous.label === 'Tous' && u1.label === 'Émilien' && u2.label === 'Gaspard', 'lignes : Tous + chaque membre');
assert(u1.jour[0] === 2 && u1.jour[1] === 0.3 && u1.jour[2] === 0 && u2.jour[2] === 1 && tous.jour[0] === 2 && tous.jour[2] === 1, 'colonnes Jour (lundi à dimanche) : moyenne par semaine sur les 4 dernières périodes');
assert(u1.semaine.join() === '3,2,2,2' && u2.semaine.join() === '1,1,1,1' && tous.semaine.join() === '4,3,3,3', 'colonnes Semaine 1 à 4 : moyenne par période (la semaine 1 compte la tâche de plus)');
// activité seule : une seule ligne « Vous »
const S = mkAct('Solo', 'u1', ['u1']); done(S, 'u1', add(P[1].start, 3));
const ms = B.moyenneTaches('u1', S.id, TODAY);
assert(ms.rows.length === 1 && ms.rows[0].label === 'Vous' && ms.rows[0].total === 1, 'activité sans autre membre : une seule ligne « Vous »');
let refused = false; try { B.moyenneTaches('u2', S.id, TODAY); } catch (e) { refused = e.statusCode === 403; }
assert(refused, 'un membre ne lit que ses activités (403 sinon)');
// tâches urgentes : tableau par période, vrai numéro de semaine, nombre de tâches ouvertes à échéance
const cur = O.periodStartOf(TODAY);
const open = (c, day) => { const id = goalstasks.addCategoryTask(c.id, 'u1', c.pk, 'O' + Math.random()).id; db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(day, id); };
open(A, add(cur, 1)); open(A, add(cur, 2)); open(S, add(cur, 9)); open(A, add(cur, 30));
const u0 = B.urgentes('u1', 0, TODAY), u1p = B.urgentes('u1', 1, TODAY);
assert(u0.weeks.length === 4 && u0.weeks.map((w) => w.count).join() === '2,1,0,0' && /^S\d+$/.test(u0.weeks[0].label) && u0.weeks[0].week === O.gridOf(cur).week && u0.period === O.gridOf(cur).period && u0.year === O.gridOf(cur).year, 'période en cours : S{n} réel de l’année, période, année, nombre par semaine');
assert(u1p.start === add(cur, 28) && u1p.weeks[0].count === 1, 'période suivante : navigation par 4 semaines');
assert(B.urgentes('u1', -3, TODAY).offset === 0, 'jamais avant la période en cours');
// proportion réelle contre demandée
db.prepare("INSERT INTO task_share_wanted (activityId, userId, minutes) VALUES (?, 'u1', 360), (?, 'u2', 240)").run(A.id, A.id);
const pr = B.proportion('u1', A.id, TODAY), p1 = pr.rows.find((r) => r.userId === 'u1'), p2 = pr.rows.find((r) => r.userId === 'u2');
assert(p1.wantedPct === 60 && p2.wantedPct === 40 && p1.realPct + p2.realPct >= 99 && p1.realPct > p2.realPct, 'proportion : demandée 60 / 40 (temps voulu de « Partager les tâches »), réelle = part des tâches faites');
db.prepare('DELETE FROM task_share_wanted').run();
assert(B.proportion('u1', A.id, TODAY).rows.every((r) => r.wantedPct === null) && B.proportion('u1', S.id, TODAY).rows.length === 0, 'rien de voulu : demandée vide (rien d’inventé) ; activité seule : pas de tableau');
// proportion demandée saisie dans l'arbre (« toi 60 %, moi 40 % »)
const setP = (u, parts) => B.setProportion(u, A.id, parts);
let r2 = setP('u1', { u1: 60, u2: 40 });
assert(r2.rows.find((x) => x.userId === 'u1').wantedPct === 60 && r2.rows.find((x) => x.userId === 'u2').wantedPct === 40 && r2.rows.find((x) => x.userId === 'u1').enteredPct === 60, 'un responsable (propriétaire) règle la part de tous : 60 % / 40 %');
const bad = (u, parts, code) => { try { setP(u, parts); return false; } catch (e) { return code ? e.statusCode === code : true; } };
assert(bad('u2', { u1: 10 }, 403), 'un non-responsable ne règle pas la part d’un autre (403)');
assert(!bad('u2', { u2: 30 }) && B.proportion('u1', A.id, TODAY).rows.find((x) => x.userId === 'u2').enteredPct === 30, 'un membre règle seulement la sienne');
assert(bad('u1', { u1: 80 }) && bad('u1', { u1: 101 }) && bad('u1', { u1: -5 }), 'le total ne dépasse pas 100 % ; une part est un pourcentage de 0 à 100');
setP('u1', { u2: null }); setP('u1', { u1: null });
assert(B.proportion('u1', A.id, TODAY).rows.every((x) => x.enteredPct === null), 'une part retirée (null) est effacée');
const crSrc = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
assert(crSrc.includes("tr('Part des tâches (%)')") && crSrc.includes("api('PUT', '/api/bilan/proportion'") && crSrc.includes("if (spec.level === 'activite') membersP.then"), 'fiche de l’activité dans l’arbre : champ « Part des tâches (%) » modifiable par membre, enregistré avec le bouton Enregistrer');
// routes
const rt = fs.readFileSync(path.join(__dirname, '..', 'server/routes/bilan.js'), 'utf8'), ix = fs.readFileSync(path.join(__dirname, '..', 'server/index.js'), 'utf8');
assert(rt.includes("'/bilan/moyenne-taches'") && rt.includes("'/bilan/urgentes'") && rt.includes("'/bilan/proportion'") && ix.includes("require('./routes/bilan')"), 'routes montées');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-donnees-test OK'); process.exit(failed ? 1 : 0);
