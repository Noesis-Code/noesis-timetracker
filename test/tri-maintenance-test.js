// Tri des tâches de l'offre gratuite : type (maintenance / développement) calculé en silence, récurrence silencieuse (texte, historique, IA),
// doublon à zone grise, placement de la maintenance, ordre de la liste du jour. Faux client IA, aucun réseau.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-tri-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'faux-client-test';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const classify = require('../server/lib/goalstaskclassify');
const rec = require('../server/lib/taskrecurrence');
const tk = require('../server/lib/taskkind');
const cp = require('../server/lib/goalscaptureplace');
const dp = require('../server/lib/goalsdailypriority');
const today = require('../server/lib/dates').userToday();
require('../server/lib/silentspellfix').setCaller(async (t) => t);

// Faux client IA : réponses réglables par feature
const calls = {}; let dupAnswer = 'NON'; let recAnswer = 'NON'; let matchAnswer = '{"index":null}';
classify.callModel = async (prompt, max, feature) => {
  calls[feature] = (calls[feature] || 0) + 1;
  if (feature === 'doublon-tache') { if (dupAnswer === 'PANNE') throw new Error('HTTP 500'); return dupAnswer; }
  if (feature === 'recurrence-tache') return recAnswer;
  if (feature === 'rapprochement-objectif') return typeof matchAnswer === 'function' ? matchAnswer(prompt) : matchAnswer;
  return 'NON';
};

const mkUser = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
const mkAct = (name, owner) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, owner).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return id; };
const mkPole = (act) => { const g = goals.addCategory(act, 'Production'); return (g && g.key) || goals.categoriesForActivity(act)[0].key; };
const insP = db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
const insW = db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, description, createdAt) VALUES (?,?,?,?,?)');
const mkWeekly = (act, key, num, text) => {
  const start = goals.mostRecentMonday(today);
  const p = insP.run(act, goals.resolveToPole(act, key), num, 1, 1, start, goals.addDays(start, 27), '', new Date().toISOString()).lastInsertRowid;
  return insW.run(p, 1, text, text, new Date().toISOString()).lastInsertRowid;
};
const col = (id) => db.prepare('SELECT taskKind, maintType, maintUrgent, goalWeeklyId, dueDate FROM sub_project_items WHERE id = ?').get(id);

(async () => {
  // ---- S1 : type calculé (pur) ----
  const c0 = (label, extra) => tk.compute(Object.assign({ label, repeatCount: 0, sectorShare: null }, extra || {}));
  let r = c0("Payer la facture d'électricité");
  assert(r.kind === 'maintenance' && r.maintType === 'finances' && !r.urgent, 'S1 : « Payer la facture » = maintenance, finances, non urgente');
  r = c0('Créer le nouveau site web');
  assert(r.kind === 'developpement' && r.maintType === null, 'S1 : « Créer le nouveau site » = développement');
  r = c0('Panne du serveur de courriel');
  assert(r.kind === 'maintenance' && r.urgent && r.maintType === 'depannage', 'S1 : panne = maintenance urgente (dépannage)');
  r = c0('Mise à jour de sécurité du système');
  assert(r.kind === 'maintenance' && r.urgent, 'S1 : mise à jour de sécurité = urgente');
  r = c0('Contrat Alpha', { objectiveMatched: true });
  assert(r.kind === 'developpement', 'S1 : objectif retrouvé = développement');
  r = c0('Réfléchir un peu');
  assert(r.kind === null && r.maintType === null && !r.urgent, 'S1 : sans signal net = neutre (null)');
  r = c0('Truc', { sectorShare: 0.9 });
  assert(r.kind === null, 'S1 : le signal « secteur » seul ne tranche pas');
  r = c0('Bidule', { recurrence: { every: 1, unit: 'month' } });
  assert(r.kind === 'maintenance', 'S1 : récurrence = maintenance');
  r = c0('Bidule', { repeatCount: 2 });
  assert(r.kind === 'maintenance', 'S1 : même titre terminé 2 fois = maintenance');
  r = c0('Pay the invoice') ; const r2 = c0('Design the launch plan');
  assert(r.kind === 'maintenance' && r2.kind === 'developpement', 'S1 : lexiques anglais');
  assert(c0('Ranger le bureau', { minutes: 300, capacity: 120 }).long === true && c0('Ranger le bureau', { minutes: 30, capacity: 120 }).long === false, 'S1 : durée > capacité du jour = longue');
  assert(tk.ESSENTIAL_RANK.legal === 1 && tk.ESSENTIAL_RANK.finances === 2 && tk.ESSENTIAL_RANK.personnel === 11 && Object.keys(tk.ESSENTIAL_RANK).length === 11, 'S1 : rang d\'essentiel 1 à 11');
  assert(c0('Renouveler le permis').maintType === 'legal' && c0('Nettoyer et ranger le local').maintType === 'rangement', 'S1 : types legal / rangement');

  // Historique en base
  mkUser('u1');
  const actA = mkAct('A', 'u1'); const keyA = mkPole(actA);
  const addDone = (label, doneAt) => {
    const it = goalstasks.addCategoryTask(actA, 'u1', keyA, label, {});
    db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ? WHERE id = ?').run(doneAt, it.id);
    return it.id;
  };
  addDone('Vider les bacs', '2026-08-01T12:00:00.000Z'); addDone('Vider les bacs', '2026-09-01T12:00:00.000Z');
  r = tk.compute({ label: 'Vider les bacs', activityId: actA, categoryKey: keyA });
  assert(r.kind === 'maintenance', 'S1 : répétition lue en base (2 fois terminée dans l\'activité)');
  assert(tk.sectorDevShare(actA, keyA) === null, 'S1 : moins de 10 tâches d\'historique : signal secteur absent');
  const it0 = goalstasks.addCategoryTask(actA, 'u1', keyA, 'Colonnes', {});
  tk.write(it0.id, { kind: 'maintenance', maintType: 'legal', urgent: true });
  assert(JSON.stringify(tk.read(it0.id)) === JSON.stringify({ kind: 'maintenance', maintType: 'legal', urgent: true }), 'S1 : colonnes taskKind / maintType / maintUrgent lues et écrites');

  // ---- S2 : récurrence silencieuse ----
  assert(rec.frequencyFromDates(['2026-01-01', '2026-01-08', '2026-01-15']).unit === 'week' && rec.frequencyFromDates(['2026-01-01', '2026-01-31', '2026-03-02']).unit === 'month', 'S2 : écarts réguliers 7 j = semaine, 30 j = mois');
  assert(rec.frequencyFromDates(['2026-01-01', '2026-01-08', '2026-02-20']) === null && rec.frequencyFromDates(['2026-01-01', '2026-01-08']) === null, 'S2 : irrégulier ou moins de 3 fois = rien');
  const f14 = rec.frequencyFromDates(['2026-01-01', '2026-01-15', '2026-01-29']); const f91 = rec.frequencyFromDates(['2026-01-01', '2026-04-02', '2026-07-02']); const f365 = rec.frequencyFromDates(['2024-01-01', '2025-01-01', '2026-01-01']);
  assert(f14.every === 2 && f14.unit === 'week' && f91.every === 3 && f91.unit === 'month' && f365.every === 12 && f365.unit === 'month', 'S2 : 14 j = 2 semaines, 91 j = 3 mois, 365 j = 12 mois');
  ['2026-06-01', '2026-07-01', '2026-07-31'].forEach((d) => addDone('Payer le loyer du local', d + 'T12:00:00.000Z'));
  let before = calls['recurrence-tache'] || 0;
  let s = await rec.suggest('Payer le loyer du local', actA);
  assert(s && s.every === 1 && s.unit === 'month' && (calls['recurrence-tache'] || 0) === before, 'S2 : 3 fois terminée à ~30 jours d\'écart => chaque mois, sans appel IA');
  ['2026-06-01', '2026-06-04', '2026-08-30'].forEach((d) => addDone('Arroser le jardin', d + 'T12:00:00.000Z'));
  recAnswer = 'NON';
  assert(await rec.suggest('Arroser le jardin', actA) === null, 'S2 : historique irrégulier, IA dit NON => aucune proposition');
  recAnswer = '{"every":1,"unit":"week","confidence":85}';
  s = await rec.suggest('Inventaire de la boutique', actA);
  assert(s && s.unit === 'week', 'S2 : IA avec confiance 85 : acceptée (seuil du classement)');
  recAnswer = '{"every":1,"unit":"week","confidence":60}';
  assert(await rec.suggest('Inventaire de la boutique', actA) === null, 'S2 : IA avec confiance 60 : ignorée');
  recAnswer = '{"every":1,"unit":"week"}';
  assert(await rec.suggest('Inventaire de la boutique', actA) === null, 'S2 : IA sans confiance : ignorée');

  // ---- S3 : capture (mode Partiel) ----
  const wk = mkWeekly(actA, keyA, 9201, 'Plan Alpha de lancement');
  matchAnswer = (p) => { const l = p.split('\n').find((x) => /^\d+\. \[/.test(x) && /Alpha/.test(x)); return l ? JSON.stringify({ index: Number(l.split('.')[0]), confidence: 0.95, reason: 'même sujet' }) : '{"index":null}'; };
  const cap = async (label, mode, extra) => (await classify.captureTaskForActivities([actA], 'u1', label, Object.assign({ aiMode: mode, forcedCategory: keyA, allowDuplicate: true }, extra || {}))).pop();
  let c = await cap('Créer le plan Alpha', 'partiel');
  assert(c.ok && c.taskKind === 'developpement' && c.devIdea === false && col(c.id).goalWeeklyId === wk, 'S3 : développement avec objectif => goalWeeklyId posé, pas d\'idée');
  matchAnswer = '{"index":null}';
  c = await cap('Imaginer une gamme zébrée', 'partiel');
  assert(c.ok && c.taskKind === 'developpement' && c.devIdea === true, 'S3 : développement sans objectif => devIdea: true');
  c = await cap('Payer la facture du fournisseur', 'partiel');
  const sunday = goals.addDays(goals.mostRecentMonday(today), 13);
  assert(c.ok && c.taskKind === 'maintenance' && col(c.id).taskKind === 'maintenance' && col(c.id).maintType === 'finances' && col(c.id).maintUrgent === 0, 'S3 : maintenance enregistrée dans les colonnes');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate) && c.dueDate >= today && c.dueDate <= sunday, 'S5 : courte non urgente non récurrente => un JOUR de la semaine en cours (ou la suivante)');
  c = await cap('Panne urgente du serveur de courriel', 'partiel');
  assert(c.ok && col(c.id).maintUrgent === 1 && c.dueDate === today, 'S5 : urgente => aujourd\'hui');
  recAnswer = 'NON';
  c = await cap('Payer le loyer récurrente tous les mois', 'partiel');
  const due = rec.nextDueDate(today, 1, 'month', today);
  assert(c.ok && c.taskKind === 'maintenance' && c.recurrenceSuggestion && c.dueDate === due, 'S5 : récurrente => première échéance de la fréquence (' + due + ')');
  c = await cap('Payer la facture du fournisseur', 'absence');
  assert(c.ok && c.taskKind === null && col(c.id).taskKind === null && c.devIdea === false, 'mode Absent : aucun type calculé');

  // ---- S5 : longues (placement direct) ----
  mkUser('u2'); const actC = mkAct('C', 'u2'); const keyC = mkPole(actC);
  const busy = goalstasks.addCategoryTask(actC, 'u2', keyC, 'Déjà prévue', {});
  db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(today, busy.id);
  const d1 = cp.maintenanceDate('u2', actC, keyC, null, 'Grand ménage', { urgent: false, minutes: 1000 });
  const d2 = cp.maintenanceDate('u2', actC, keyC, null, 'Panne totale', { urgent: true, minutes: 1000 });
  const d3 = cp.maintenanceDate('u2', actC, keyC, null, 'Panne mineure', { urgent: true, minutes: 20 });
  assert(d1 > today && /^\d{4}-\d{2}-\d{2}$/.test(d1), 'S5 : longue non urgente => premiers jours entiers libres (pas le jour déjà occupé)');
  assert(d2 >= today && /^\d{4}-\d{2}-\d{2}$/.test(d2) && d3 === today, 'S5 : urgente longue = jours libres de suite dès aujourd\'hui ; urgente courte = aujourd\'hui');

  // ---- S4 : doublon à zone grise ----
  mkUser('u3'); const actD = mkAct('D', 'u3'); const keyD = mkPole(actD);
  goalstasks.addCategoryTask(actD, 'u3', keyD, 'Appeler le plombier pour la fuite', {});
  const nl = 'Rappeler plombier fuite cuisine';
  assert(classify.hasOpenDuplicate(actD, nl) === false, 'S4 : la comparaison locale dit NON (zone grise)');
  dupAnswer = 'OUI: 1'; let n0 = calls['doublon-tache'] || 0;
  assert(await classify.hasOpenDuplicateAsync(actD, nl) === true && calls['doublon-tache'] === n0 + 1, 'S4 : zone grise + « OUI: 1 » => doublon (un seul appel)');
  dupAnswer = 'NON';
  assert(await classify.hasOpenDuplicateAsync(actD, nl + ' bis') === false, 'S4 : « NON » => pas un doublon');
  dupAnswer = 'PANNE';
  assert(await classify.hasOpenDuplicateAsync(actD, nl + ' ter') === false, 'S4 : panne IA => pas un doublon, jamais d\'erreur');
  n0 = calls['doublon-tache'];
  dupAnswer = 'OUI: 1';
  assert(await classify.hasOpenDuplicateAsync(actD, 'Faire la comptabilité du trimestre') === false && calls['doublon-tache'] === n0, 'S4 : titre sans ressemblance => aucun appel IA');
  assert(await classify.hasOpenDuplicateAsync(actD, nl + ' quater', { skipAi: true }) === false && calls['doublon-tache'] === n0, 'S4 : mode Absent => aucun appel IA');
  assert(await classify.hasOpenDuplicateAsync(actD, 'Appeler le plombier pour la fuite') === true, 'S4 : doublon exact détecté sans IA');
  const dr = (await classify.captureTaskForActivities([actD], 'u3', 'Rappeler plombier fuite', { aiMode: 'partiel', forcedCategory: keyD })).pop();
  assert(!dr.ok && dr.needs === 'duplicate', 'S4 : la capture demande confirmation quand l\'IA voit un doublon');

  // ---- S6 : liste du jour ----
  mkUser('u4'); const actE = mkAct('E', 'u4'); const keyE = mkPole(actE);
  const wkE = mkWeekly(actE, keyE, 9301, 'Objectif de développement');
  const mk = (label, kind, extra) => {
    const it = goalstasks.addCategoryTask(actE, 'u4', keyE, label, {});
    db.prepare('UPDATE sub_project_items SET taskKind = ?, maintType = ?, maintUrgent = ?, goalWeeklyId = ? WHERE id = ?')
      .run(kind, (extra && extra.type) || null, (extra && extra.urgent) ? 1 : 0, (extra && extra.weekly) || null, it.id);
    return it.id;
  };
  const ids = {
    rangement: mk('M courte rangement', 'maintenance', { type: 'rangement' }),
    finances: mk('M courte finances', 'maintenance', { type: 'finances' }),
    neutre: mk('N neutre', null),
    devObj: mk('D avec objectif', 'developpement', { weekly: wkE }),
    devSans: mk('D sans objectif', 'developpement'),
    urgFin: mk('U urgente finances', 'maintenance', { type: 'finances', urgent: true }),
    urgLegal: mk('U urgente legal', 'maintenance', { type: 'legal', urgent: true }),
  };
  const list = dp.computeDailyPriorityList(actE, 'u4');
  const order = list.items.map((i) => i.id);
  const pos = (k) => order.indexOf(ids[k]);
  assert(pos('urgLegal') === 0 && pos('urgFin') === 1, 'S6 : maintenance urgente en tête, départagée par rang d\'essentiel (legal avant finances)');
  assert(pos('devSans') === 2, 'S6 : développement sans objectif juste après');
  assert(pos('devObj') > 2 && pos('neutre') > 2 && pos('devObj') < pos('finances') && pos('neutre') < pos('finances'), 'S6 : développement avec objectif et tâche sans type avant la maintenance courte');
  assert(pos('finances') === 5 && pos('rangement') === 6, 'S6 : maintenance courte en dernier, par rang d\'essentiel à durée égale');
  const it = (k) => list.items.find((i) => i.id === ids[k]);
  assert(it('urgLegal').taskKind === 'maintenance' && it('urgLegal').maintUrgent === true && it('neutre').taskKind === null, 'S6 : taskKind / maintUrgent exposés');
  assert(dp.tierOf({ taskKind: 'maintenance', maintUrgent: false, estimatedMinutes: 500 }, 120) === 1 && dp.tierOf({ taskKind: 'maintenance', maintUrgent: false, estimatedMinutes: 30 }, 120) === 4 && dp.tierOf({ taskKind: null, hasObjective: false, estimatedMinutes: 30 }, 120) === 3, 'S6 : paliers (longue = 1, courte = 4, sans type = 3)');
  // Sans aucun type : ordre d'avant (importance, puis score)
  mkUser('u5'); const actF = mkAct('F', 'u5'); const keyF = mkPole(actF);
  ['Aa', 'Bb', 'Cc'].forEach((l) => goalstasks.addCategoryTask(actF, 'u5', keyF, l, {}));
  const lf = dp.computeDailyPriorityList(actF, 'u5').items;
  const sorted = lf.slice().sort((a, b) => (b.importance.score - a.importance.score) || (b.score - a.score));
  assert(lf.every((i) => i.tier === 3) && lf.map((i) => i.id).join() === sorted.map((i) => i.id).join(), 'S6 : tâches sans taskKind : tri inchangé (palier 3)');

  console.log(failed ? '\ntri-maintenance-test : ' + failed + ' échec(s)' : '\ntri-maintenance-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
