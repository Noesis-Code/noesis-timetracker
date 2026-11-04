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

// ---- Règle de charge : +20 % toléré en silence, au-delà une marque ; la référence s'adapte au rythme tenu ----
assert(!overload.isOverloaded(66, 60), '+10 % de la référence : rien (toléré en silence)');
assert(overload.isOverloaded(75, 60), '+25 % : la marque se pose');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u9', 'u9', datetime('now'))").run();
const act2 = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('B', 'u9', '')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, 'u9', '#fff', '', 0)").run(act2);
const g2 = goals.addCategory(act2, 'Prod'); const key2 = (g2 && g2.key) || goals.categoriesForActivity(act2)[0].key;
const addB = (label) => { const it = goalstasks.addCategoryTask(act2, 'u9', key2, label, {}); db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = 0 WHERE id = ?').run(today, it.id); return it.id; };
const manualB = [addB('m1'), addB('m2'), addB('m3'), addB('m4')]; // 4 x 30 min = 120 min, dates posées à la main
overload.rebalance('u9', act2, { force: true });
assert(overload.getMarks('u9', act2)[key2] === true, 'charge de 120 min pour une référence de 60 (plancher) : marque sur le secteur');
assert(manualB.every((id) => due(id) === today), 'date saisie à la main : jamais déplacée, même en surcharge');
// rythme soutenu : 8 jours ouvrés avec 4 tâches (120 min) terminées chaque jour
let dd = 0, n = 0;
while (n < 8) { dd += 1; const d = goals.addDays(today, -dd); const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue; n += 1;
  for (let k = 0; k < 4; k++) { const it = goalstasks.addCategoryTask(act2, 'u9', key2, 'fait ' + n + '-' + k, {}); db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, dueDate = ? WHERE id = ?').run(d + 'T15:00:00.000Z', d, it.id); } }
assert(overload.referenceFor(act2, 'u9') === 120, 'rythme réellement tenu (médiane 120 min par jour ouvré sur 8 jours) : la référence s\'y adapte');
overload.rebalance('u9', act2, { force: true });
assert(!overload.getMarks('u9', act2)[key2], 'la situation redevient équilibrée : la marque disparaît');
assert(manualB.every((id) => due(id) === today), 'toujours aucune date manuelle déplacée');

// ---- Reprise silencieuse des objectifs hebdomadaires non atteints ----
const carry = require('../server/lib/goalscarryover');
const ins = (periodId, wi, text, est, source, status) => db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, description, estimateMinutes, estimateSource, status, createdAt) VALUES (?,?,?,?,?,?,?,?)").run(periodId, wi, text, 'desc ' + wi, est, source, status || null, new Date().toISOString()).lastInsertRowid;
const per = (start, end, num) => db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run(actId, goals.resolveToPole(actId, key), num, 1, num, start, end, 'P', '').lastInsertRowid;
const st = goals.addDays(today, -9);
const P1 = per(st, goals.addDays(st, 27), 51);
const w1 = ins(P1, 1, 'Objectif S1', 120, null, 'non_atteint'), w2 = ins(P1, 2, 'Objectif S2', 60, null), w3 = ins(P1, 3, 'Objectif S3', 60, 'manual'), w4 = ins(P1, 4, 'Objectif S4', 0, null);
const get = (id) => db.prepare('SELECT * FROM goal_weekly WHERE id = ?').get(id);
const before1 = JSON.stringify(get(w1));
carry.repriseUnmet(actId, today);
assert(JSON.stringify(get(w1)) === before1, 'reprise : la semaine PASSÉE n\'est jamais modifiée');
assert(get(w2).text === 'Objectif S2' && (get(w2).description.match(/Reprise de S\d+ : Objectif S1/g) || []).length === 1, 'semaine à venir : texte inchangé, ligne « Reprise » ajoutée une seule fois');
assert(get(w2).estimateMinutes === 100 && get(w4).estimateMinutes === 40, 'temps estimé de l\'objectif non atteint (120 min) réparti sur les 3 semaines à venir (+40 chacune)');
assert(get(w3).estimateMinutes === 60 && /Reprise de S\d+ : Objectif S1/.test(get(w3).description), 'temps saisi à la main : respecté (seule la ligne de reprise s\'ajoute)');
carry.repriseUnmet(actId, today); carry.repriseUnmet(actId, today);
assert(get(w2).estimateMinutes === 100 && (get(w2).description.match(/Reprise de/g) || []).length === 1, 'idempotent : jamais cumulé ni empilé');
db.prepare("UPDATE goal_weekly SET status = 'atteint' WHERE id = ?").run(w1); carry.repriseUnmet(actId, today);
assert(get(w2).estimateMinutes === 60 && !/Reprise/.test(get(w2).description) && get(w2).description === 'desc 2', 'objectif atteint depuis : la reprise disparaît, estimation et description reviennent');
db.prepare("UPDATE goal_weekly SET status = 'non_atteint' WHERE id = ?").run(w1);
// Pas de semaine à venir (avec objectif) dans la période : rien n'est fait, jamais au-delà de la fin
const st2 = goals.addDays(today, -20);
const P2 = per(st2, today, 52);
const a1 = ins(P2, 1, 'Objectif A1', 90, null, 'non_atteint'), a2 = ins(P2, 2, 'Objectif A2', 30, null, 'atteint');
carry.repriseUnmet(actId, today);
assert(get(a1).description === 'desc 1' && get(a2).description === 'desc 2' && get(a2).estimateMinutes === 30, 'aucune semaine à venir dans la période : rien n\'est reporté au-delà de son échéance');
const dec = carry.decoratePlanning({ category: key, periods: [Object.assign(db.prepare('SELECT * FROM goal_periods WHERE id = ?').get(P2), { weeklies: [get(a1), get(a2)] })] }, 'u1', actId);
assert(dec.periods[0].weeklies[0].noRoomToCarry === true, 'et l\'objectif concerné est marqué (noRoomToCarry → liseré)');

// ---- Recalcul silencieux des temps estimés ----
const recalc = require('../server/lib/goalsrecalc');
assert(typeof recalc.runForUser === 'function' && recalc.runForUser('u1', actId, today) === 0, 'recalcul : rien à faire sans période (aucune proposition créée)');
assert(db.prepare("SELECT COUNT(*) AS c FROM goal_recalc_proposals WHERE status = 'pending'").get().c === 0, 'plus aucune proposition en attente');

if (failed) { console.log('\nrebalance-silencieux-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nrebalance-silencieux-test : OK');
