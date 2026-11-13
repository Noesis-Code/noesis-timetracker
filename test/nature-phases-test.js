// Nature (Développer | Maintenir) et phases (Réformer, Cadrage, Réalisation, Finition) des tâches : calcul EN SILENCE, jamais de phase sur la maintenance. Usage : node test/nature-phases-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-nature-phases-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), K = require('../server/lib/taskkind');
// colonne en base
assert(db.prepare('PRAGMA table_info(sub_project_items)').all().some((c) => c.name === 'taskPhase'), 'colonne taskPhase en base (migration additive, idempotente)');
// phases d'après le titre (développement)
const dev = (label) => K.compute({ label, objectiveMatched: true, repeatCount: 0, sectorShare: null });
assert(dev('Définir le plan de la page de vente').phase === 'cadrage' && dev('Étudier les options de prix').phase === 'cadrage', 'cadrage : définir, planifier, étudier');
assert(dev('Rédiger le texte de la page').phase === 'realisation' && dev('Construire la maquette').phase === 'realisation', 'réalisation : rédiger, construire');
assert(dev('Relire et publier la page').phase === 'finition' && dev('Finaliser le dossier').phase === 'finition', 'finition : relire, publier, finaliser');
assert(dev('Faire des choses').phase === null, 'sans signal net : aucune phase (aucun défaut « Réalisation » affiché ou stocké)');
// jamais de phase sur la maintenance
const m = K.compute({ label: 'Payer la facture de téléphone', repeatCount: 3, recurrence: true, sectorShare: null });
assert(m.kind === 'maintenance' && m.phase === null, 'maintenance : jamais de phase');
// écriture / lecture : la phase n'est écrite que sous Développer
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const goals = require('../server/lib/goals'), goalstasks = require('../server/lib/goalstasks');
const pk = (goals.addCategory(act, 'Pôle') && goals.categoriesForActivity(act)[0].key);
const mk = (label) => goalstasks.addCategoryTask(act, 'u1', pk, label).id;
const a = mk('Définir le plan'), b = mk('Payer la facture'), c = mk('Repenser toute la stratégie');
K.write(a, dev('Définir le plan')); K.write(b, m); K.write(c, dev('Repenser toute la stratégie'));
K.setPhase(c, 'reformer'); K.setPhase(b, 'reformer'); // réformer sur la maintenance : refusé
const ph = K.readPhaseMany([a, b, c]);
assert(ph[a] === 'cadrage' && ph[b] === null && ph[c] === 'reformer', 'écrit sous Développer seulement ; Réformer = première phase ; refusé sur la maintenance');
// rien de visible : aucune sortie du serveur ni de l'interface ne porte la phase
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const shown = walk(path.join(__dirname, '..', 'public')).filter((f) => /\.(js|html)$/.test(f)).filter((f) => fs.readFileSync(f, 'utf8').includes('taskPhase'));
assert(shown.length === 0, 'aucune étiquette, aucun champ : « taskPhase » n\'apparaît dans aucun fichier de l\'interface');
// ---- Ordre du plan du jour et usure ----
const T0 = '2026-11-12', back = (n) => new Date(Date.parse(T0 + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
const dev1 = (phase, extra) => Object.assign({ taskKind: 'developpement', phase, dueDate: T0, hasObjective: true, objectiveDays: 7 }, extra);
const R = (t) => K.dayRank(t, T0);
assert(R({ taskKind: 'maintenance', maintUrgent: true, dueDate: T0 }) === 1 && R(dev1('reformer')) === 2 && R(dev1('cadrage')) === 3 && R(dev1('realisation')) === 4 && R(dev1('finition')) === 4 && R(dev1(null)) === 4 && R({ taskKind: 'maintenance', dueDate: T0 }) === 4, 'rangs : 1 maintenance urgente, 2 Réformer, 3 Cadrage, 4 Réalisation + Finition + maintenance non urgente (+ sans phase)');
const order = [dev1('realisation', { id: 1 }), dev1('cadrage', { id: 2 }), { taskKind: 'maintenance', maintUrgent: true, maintType: 'legal', dueDate: T0, id: 3 }, dev1('reformer', { id: 4 }), { taskKind: 'maintenance', dueDate: T0, id: 5 }].map((t) => Object.assign(t, { dayRank: R(t) })).sort(K.compareDay).map((t) => t.id);
assert(order.slice(0, 3).join() === '3,4,2' && order.slice(3).sort().join() === '1,5', 'ordre : maintenance urgente > Réformer > Cadrage > le reste mélangé');
// usure : objectif hebdomadaire (7 j) : rang 4 -> 3 -> 2 -> 1 à intervalles égaux, rang 1 après 7 jours de retard
assert(R(dev1('realisation', { dueDate: back(1) })) === 4 && R(dev1('realisation', { dueDate: back(3) })) === 3 && R(dev1('realisation', { dueDate: back(5) })) === 2 && R(dev1('realisation', { dueDate: back(7) })) === 1, 'usure hebdomadaire : 4 -> 3 -> 2 -> 1, rang 1 après 7 jours');
// périodique / sans objectif / annuel : 28 jours (plafond)
const per = (phase, late) => dev1(phase, { objectiveDays: null, dueDate: back(late) });
assert(R(per('cadrage', 13)) === 3 && R(per('cadrage', 14)) === 2 && R(per('cadrage', 27)) === 2 && R(per('cadrage', 28)) === 1, 'usure périodique : 28 jours, jamais plus (annuel / pluriannuel plafonnés)');
assert(R({ taskKind: 'maintenance', maintUrgent: true, dueDate: back(40) }) === 1 && R(dev1('realisation', { dueDate: T0 })) === 4 && R(dev1('realisation', { dueDate: '2026-12-01' })) === 4, 'rang 1 reste 1 ; une tâche à jour ou à venir ne s’use pas');
// ---- Choix « Nature » dans « Avancé » (12 nov. 2026) : vide par défaut, l'IA décide en silence ; aucun choix de phase ----
const creer = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
assert(!creer.includes("key: 'nature'") && !creer.includes("choices: ['Maintenir', 'Développer']"), 'la nature concerne les TÂCHES, pas les objectifs : plus aucun choix « Nature » dans la création d’un objectif (13 nov. 2026)');
assert(!creer.includes("key: 'phase'") && !creer.includes('taskPhase'), 'aucun choix de phase dans l’interface');
assert(creer.includes("nature: form.natureIdx === 0 ? 'maintenance' : form.natureIdx === 1 ? 'developpement' : undefined"), 'envoyée à la création seulement si choisie');
const O = require('../server/lib/objectifs'), T = require('../server/lib/dates').userToday(), addD = (n) => O.addDays(T, n);
const objA = O.creer('u1', { title: 'Entretien du site', activityId: act, level: 'pole', poleKey: pk, cadence: 'periodique', nature: 'maintenance', startDate: T, endDate: addD(60), weekTasks: [] });
const objB = O.creer('u1', { title: 'Sans choix', activityId: act, level: 'pole', poleKey: pk, cadence: 'hebdomadaire', startDate: T, endDate: addD(10), weekTasks: [] });
const mt = (id) => JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id).metaJson);
assert(mt(objA.id).nature === 'maintenance' && mt(objB.id).nature === undefined, 'la nature choisie est gardée sur l\u2019objectif ; sans choix : rien (l\u2019IA décide en silence)');
assert(O.natureOfCategory(act, pk) === 'maintenance', 'la nature de l\u2019objectif qui porte la catégorie sert de signal aux tâches');
assert(K.compute({ label: 'Rédiger le texte', natureHint: 'maintenance', repeatCount: 0, sectorShare: null }).kind === 'maintenance' && K.compute({ label: 'Payer la facture', natureHint: 'developpement', repeatCount: 3, sectorShare: null }).kind === 'developpement' && K.compute({ label: 'Rédiger le texte', objectiveMatched: true, repeatCount: 0, sectorShare: null }).kind === 'developpement', 'nature choisie : elle l\u2019emporte ; sans choix : calcul silencieux d\u2019avant');
assert(K.compute({ label: 'Définir le plan', natureHint: 'maintenance', repeatCount: 0, sectorShare: null }).phase === null, 'maintenance choisie : jamais de phase');
console.log(failed ? '\n' + failed + ' échec(s)' : 'nature-phases-test OK'); process.exit(failed ? 1 : 0);
