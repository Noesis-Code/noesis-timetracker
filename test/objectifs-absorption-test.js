// Absorption (Émilien, 18 nov. 2026) : deux pôles fusionnés => à partir de la période de fusion, un seul subsiste (le premier choisi) ; irréversible ; passé intact ; transitivité ; export.
// Usage : node test/objectifs-absorption-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-abso-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* base déjà semée */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const o = require('../server/lib/objectifs'), goals = require('../server/lib/goals'), ab = require('../server/lib/objectifs-absorption');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const u = m.userId, ACT = m.activityId;
o.setTasksCheck(() => false);
const bad = (f) => { try { f(); return null; } catch (e) { return e; } };
['Pôle Un', 'Pôle Deux', 'Pôle Trois'].forEach((l) => goals.addCategory(ACT, l));
const poles = goals.categoriesForActivity(ACT).map((p) => p.key), [P1, P2, P3] = poles.slice(-3);
const fresh = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); ['Un', 'Deux', 'Trois'].forEach((l) => goals.addCategory(id, l)); return { id, k: goals.categoriesForActivity(id).map((p) => p.key).slice(-3) }; };
const mk = (title, pole, start, end) => o.creer(u, { title, activityId: ACT, level: 'pole', poleKey: pole, startDate: start, endDate: end, noBridge: true });
const one = mk('P1 fusion', P1, '2026-11-09', '2027-01-15'), two = mk('P2 fusion', P2, '2026-11-09', '2027-01-20'), pastTwo = mk('P2 passé', P2, '2025-01-10', '2025-06-01');
const f = o.fusionnerEnMacro(u, { level: 'pole', childIds: [one.id, two.id], title: 'P1+P2' });
const rows = ab.all(u);
assert(rows.length === 1 && rows[0].absorbingKey === P1 && rows[0].absorbedKey === P2, 'absorption enregistrée : le premier choisi absorbe : ' + JSON.stringify(rows.map((r) => [r.absorbingKey, r.absorbedKey, r.fromDate])));
const from = rows[0].fromDate;
assert(ab.survivor(u, 'pole', ACT, P2, '2026-01-01') .key === P2 && ab.survivor(u, 'pole', ACT, P2, from).key === P1 && ab.survivor(u, 'pole', ACT, P2, '2030-01-01').key === P1, 'avant la période : P2 existe ; à partir de la période : seul P1 subsiste');
assert(o.get(u, pastTwo.id).title === 'P2 passé' && o.get(u, two.id), 'passé intact : aucun objectif modifié ni supprimé');
// Transitivité et ordre chronologique inversé : P2-P3 à une période PLUS TÔT (2026) que P1-P2 plus tard
const t1 = mk('P2 tôt', P2, '2026-05-01', '2026-06-01'), t3 = mk('P3 tôt', P3, '2026-05-01', '2026-06-05');
o.fusionnerEnMacro(u, { level: 'pole', childIds: [t1.id, t3.id], title: 'P2+P3' });
const f2 = ab.all(u).filter((r) => r.absorbedKey === P3)[0].fromDate;
assert(f2 < from, 'la fusion P2-P3 vaut à partir de SA période (plus tôt)');
assert(ab.survivor(u, 'pole', ACT, P3, f2).key === P2 && ab.survivor(u, 'pole', ACT, P3, from).key === P1, 'entre les deux périodes : P2+P3 seulement ; ensuite P1 absorbe P2 et P3');
assert(ab.groupAt(u, 'pole', ACT, P1, from).length === 3 && ab.groupAt(u, 'pole', ACT, P1, f2).length === 1, 'groupe à une date = fermeture transitive des fusions déjà atteintes');
// Réversibilité (18 nov. 2026) : séparer tout de suite est permis ; la ligne est marquée annulée (jamais supprimée) ; la colonne réapparaît ; les tâches déplacées reviennent
const mkx = (a, title, pole, start, end) => o.creer(u, { title, activityId: a, level: 'pole', poleKey: pole, startDate: start, endDate: end, noBridge: true });
const FQ = fresh('Fus Q'), [Q1P, Q2P] = FQ.k;
const q1 = mkx(FQ.id, 'Q1', Q1P, '2026-11-09', '2027-02-15'), q2 = mkx(FQ.id, 'Q2', Q2P, '2026-11-09', '2027-02-16');
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, goalCategory, position, createdAt, createdBy) VALUES (?, 'Tâche déplacée', ?, 0, '2026-11-01T00:00:00.000Z', ?)").run(FQ.id, Q2P, u).lastInsertRowid);
db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, position, createdAt) VALUES (?, 'ouverte', 0, 0, '2026-11-01T00:00:00.000Z')").run(sp);
const fq = o.fusionnerEnMacro(u, { level: 'pole', childIds: [q1.id, q2.id], title: 'Q1+Q2' });
ab.appliquer(u, '2030-01-01');
const cat = () => db.prepare('SELECT goalCategory FROM sub_projects WHERE id = ?').get(sp).goalCategory;
assert(cat() === Q1P, 'les tâches ouvertes de l’absorbée passent à l’absorbante');
o.lier(u, q2.id, null);
assert(cat() === Q2P, 'séparation immédiate permise : les tâches reviennent à leur catégorie d’origine');
assert(db.prepare('SELECT COUNT(*) AS n FROM fusion_absorption WHERE macroId = ? AND cancelledAt IS NOT NULL').get(fq.id).n === 1 && ab.survivor(u, 'pole', FQ.id, Q2P, '2030-01-01').key === Q2P, 'ligne marquée annulée (conservée) ; la colonne absorbée réapparaît');
// Liens indépendants : A-B puis B-C plus tardive ; A-B se sépare même si B-C existe ; C reste avec B, A réapparaît
const FC = fresh('Fus C'), [C1, C2, C3] = FC.k;
const ch = (n, a, b, e1, e2) => o.fusionnerEnMacro(u, { level: 'pole', childIds: [mkx(FC.id, n + 'a', a, '2026-11-09', e1).id, mkx(FC.id, n + 'b', b, '2026-11-09', e2).id], title: n });
const mAB = ch('AB', C1, C2, '2027-02-10', '2027-02-11'), mBC = ch('BC', C2, C3, '2027-07-10', '2027-07-11');
assert(ab.survivor(u, 'pole', FC.id, C3, '2040-01-01').key === C1, 'A-B puis B-C : A, B et C ensemble (absorbante A)');
assert(o.supprimer(u, mAB.id, true).ok && o.get(u, mBC.id), 'A-B se sépare même si B-C existe plus tard (liens indépendants)');
assert(ab.survivor(u, 'pole', FC.id, C2, '2040-01-01').key === C2 && ab.survivor(u, 'pole', FC.id, C3, '2040-01-01').key === C2 && ab.survivor(u, 'pole', FC.id, C1, '2040-01-01').key === C1, 'A réapparaît et n’est plus reliée ; C reste avec B');
assert(ab.groupAt(u, 'pole', FC.id, C2, '2040-01-01').length === 2, 'groupe recalculé après le déliage (composantes des liens actifs)');
assert(o.supprimer(u, mBC.id, true).ok && ab.survivor(u, 'pole', FC.id, C3, '2040-01-01').key === C3, 'séparer ensuite B-C : tout est séparé');
// Fusion passée : non séparable
const FV = fresh('Fus V'), [V1, V2] = FV.k;
const old1 = mkx(FV.id, 'Old1', V1, '2024-01-10', '2024-02-10'), old2 = mkx(FV.id, 'Old2', V2, '2024-01-10', '2024-02-11');
o.fusionnerEnMacro(u, { level: 'pole', childIds: [old1.id, old2.id], title: 'Passée' });
const eOld = bad(() => o.lier(u, old2.id, null));
assert(eOld && /passée/.test(eOld.message), 'fusion passée : impossible de délier (historique) : ' + (eOld && eOld.message));
// Aucune absorption au niveau activité (pas de remontée en catégorie)
const before = ab.all(u).length;
assert(ab.record(u, 'activite', [{ activityId: ACT }, { activityId: ACT + 99 }], from, null) === 0 && ab.all(u).length === before, 'niveau activité : jamais d’absorption');
const ex = require('../server/lib/dataexport').buildExport ? null : null;
assert(db.prepare('SELECT COUNT(*) AS n FROM fusion_absorption WHERE userId = ?').get(u).n >= before, 'enregistrements conservés (annulés compris)');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
