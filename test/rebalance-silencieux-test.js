// Rééquilibrage SILENCIEUX (plus de cartes d'alerte) : journée surchargée, retards urgents en cascade, recalcul des temps estimés.
// Règles : seules les dates posées par le moteur (dueDateAuto = 1) bougent ; date manuelle, date par défaut/suggérée (2) et réforme : jamais ; jamais au-delà de l'échéance.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-rebal-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const overload = require('../server/lib/goalsoverload');
const reform = require('../server/lib/reform');
const today = require('../server/lib/dates').userToday();

// ---- Pur : computeProposal ----
const imp = (score) => ({ score, level: score >= 70 ? 'haute' : 'normale', reasons: [] });
const mk = (id, score, extra) => Object.assign({ id, label: 't' + id, category: 'c', dueDate: today, minutes: 30, dueDateAuto: 1, importance: imp(score) }, extra || {});
let p = overload.computeProposal({ today, budgetMinutes: 60, tasks: [mk(1, 90), mk(2, 80), mk(3, 20), mk(4, 10)] });
assert(p && p.moves.map((m) => m.id).sort().join() === '3,4', 'journée surchargée : les MOINS importantes (3 et 4) sont décalées, les plus importantes restent');
assert(p.moves.every((m) => m.to > today), 'elles passent à un jour suivant');
p = overload.computeProposal({ today, budgetMinutes: 60, tasks: [mk(1, 90), mk(2, 80), mk(3, 20, { dueDateAuto: 0 }), mk(4, 10, { dueDateAuto: 0 })] });
assert(!p || p.moves.every((m) => m.id !== 3 && m.id !== 4), 'date posée à la main : jamais déplacée (seules les tâches du moteur cèdent la place)');
p = overload.computeProposal({ today, budgetMinutes: 60, tasks: [mk(1, 90), mk(2, 80), mk(3, 20, { pinned: true }), mk(4, 10, { dueDateAuto: 2, pinned: true })] }); // en silence, une date par défaut ou suggérée (2) est épinglée (buildProposal strict)
assert(!p || p.moves.every((m) => m.id !== 3 && m.id !== 4), 'réforme / maintenance urgente (épinglées) et date par défaut ou suggérée : jamais déplacées');
p = overload.computeProposal({ today, budgetMinutes: 60, tasks: [mk(1, 90), mk(2, 80), mk(3, 20, { deadline: today }), mk(4, 10, { deadline: goals.addDays(today, 2) })] });
assert(p && p.moves.length === 1 && p.moves[0].id === 4 && p.moves[0].to <= goals.addDays(today, 2), 'jamais au-delà de l\'échéance : la tâche dont l\'échéance est aujourd\'hui reste, l\'autre reste dans sa limite');
// Cascade : un retard urgent (importance haute) a repris la place d'aujourd'hui ; les moins importantes posées par le moteur sont décalées
p = overload.computeProposal({ today, budgetMinutes: 60, tasks: [mk(1, 95, { dueDate: today }), mk(2, 85, { dueDate: goals.addDays(today, -3) }), mk(3, 30), mk(4, 25)] });
assert(p && p.moves.map((m) => m.id).sort().join() === '3,4', 'retard urgent : les autres tâches du moteur sont décalées en cascade pour lui faire de la place');

// ---- Base : rebalance ----
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const actId = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u1', '')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, 'u1', '#fff', '', 0)").run(actId);
const g = goals.addCategory(actId, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(actId)[0].key;
const add = (label, auto) => { const it = goalstasks.addCategoryTask(actId, 'u1', key, label, {}); db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = ? WHERE id = ?').run(today, auto, it.id); return it.id; };
const auto = [add('auto 1', 1), add('auto 2', 1), add('auto 3', 1), add('auto 4', 1)];
const manual = add('manuelle', 0), suggested = add('suggérée', 2), refo = add('réforme', 1);
reform.write(refo, { reform: true, keys: [key] });
const due = (id) => db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(id).dueDate;
const r = overload.rebalance('u1', actId, { force: true });
assert(r.applied >= 1 && auto.some((id) => due(id) > today), 'surcharge : au moins une tâche posée par Noèsis passe à un jour suivant');
assert(due(manual) === today, 'date saisie à la main : jamais déplacée');
assert(due(suggested) === today, 'date par défaut/suggérée : jamais déplacée en silence');
assert(due(refo) === today, 'réforme : jamais déplacée');
assert(overload.rebalance('u1', actId).skipped === true, 'au plus une fois par 30 s et par activité (pas de calcul répété)');

// ---- Recalcul silencieux des temps estimés ----
const recalc = require('../server/lib/goalsrecalc');
assert(typeof recalc.runForUser === 'function' && recalc.runForUser('u1', actId, today) === 0, 'recalcul : rien à faire sans période (aucune proposition créée)');
assert(db.prepare("SELECT COUNT(*) AS c FROM goal_recalc_proposals WHERE status = 'pending'").get().c === 0, 'plus aucune proposition en attente');

if (failed) { console.log('\nrebalance-silencieux-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nrebalance-silencieux-test : OK');
