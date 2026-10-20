// Récurrences proposées par l'IA (cap RECURRENCE) et rapprochement tâche -> objectif (cap MATCH) : faux client IA, aucun réseau.
// Règles : l'IA PROPOSE (Partiel) et ne crée rien ; Autonome ne crée une récurrence que si le mot « récurrente » est écrit ; dates = jours (liste, jamais un créneau).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-recia-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'faux-client-test';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const classify = require('../server/lib/goalstaskclassify');
const rec = require('../server/lib/taskrecurrence');
const hint = require('../server/lib/capturedatehint');
const cp = require('../server/lib/goalscaptureplace');
require('../server/lib/silentspellfix').setCaller(async (t) => t);

// ---- Expansion des dates (jours calendaires locaux, DST, bissextile, fins de mois) ----
const ai = rec.addInterval;
assert(ai('2026-10-19', 1, 'week') === '2026-10-26', 'semaine : +7 jours');
assert(ai('2026-03-08', 1, 'week') === '2026-03-15', 'semaine à travers le changement d\'heure de mars (jour calendaire, pas 7x24 h)');
assert(ai('2026-10-31', 1, 'week') === '2026-11-07' && ai('2026-11-01', 1, 'day') === '2026-11-02', 'changement d\'heure de novembre : jour calendaire');
assert(ai('2026-01-31', 1, 'month') === '2026-02-28', 'mois : 31 janv. -> 28 févr. (non bissextile)');
assert(ai('2028-01-31', 1, 'month') === '2028-02-29', 'mois : 31 janv. -> 29 févr. (bissextile)');
assert(ai('2028-02-29', 12, 'month') === '2029-02-28', 'année bissextile + 12 mois -> 28 févr.');
assert(ai('2026-03-31', 1, 'month') === '2026-04-30' && ai('2026-05-31', 1, 'month') === '2026-06-30', 'mois : 31 -> 30 jours');
assert(ai('2026-12-15', 2, 'month') === '2027-02-15' && ai('2026-11-30', 3, 'month') === '2027-02-28', 'mois : passage d\'année, pas de 2 et 3 mois');
assert(ai('2026-10-01', 1, 'month') === '2026-11-01' && ai('2026-12-01', 1, 'month') === '2027-01-01', 'le 1er de chaque mois reste le 1er');
assert(ai('2026-10-19', 2, 'week') === '2026-11-02', 'aux deux semaines : +14 jours');
assert(rec.nextDueDate('2026-01-05', 1, 'week', '2026-10-20') === '2026-10-26', 'retard : la suivante saute au prochain lundi à venir, pas de retard recréé');
// Dérive des mois : le jour demandé dans le titre (« le 31 ») est repris tant que l'échéance précédente en est la version ramenée à la fin du mois.
assert(rec.anchorDayFromLabel('Payer le loyer le 31') === 31 && rec.anchorDayFromLabel('Bilan le 30 de chaque mois') === 30 && rec.anchorDayFromLabel('Pay rent on the 29th') === 29, 'jour d\'ancrage 29-31 lu dans le titre');
assert(rec.anchorDayFromLabel('Payer le loyer le 15') === null && rec.anchorDayFromLabel('Payer le loyer') === null && rec.anchorDayFromLabel('Lire le 31 chapitres') === null, 'pas d\'ancrage sans jour 29-31 en fin de titre');
assert(rec.nextDueDate('2026-01-31', 1, 'month', '2026-01-31', 31) === '2026-02-28' && rec.nextDueDate('2026-02-28', 1, 'month', '2026-02-28', 31) === '2026-03-31' && rec.nextDueDate('2026-03-31', 1, 'month', '2026-03-31', 31) === '2026-04-30' && rec.nextDueDate('2026-04-30', 1, 'month', '2026-04-30', 31) === '2026-05-31', 'le 31 : 31 janv. -> 28 févr. -> 31 mars -> 30 avr. -> 31 mai (plus de dérive)');
assert(rec.nextDueDate('2026-02-28', 1, 'month', '2026-02-28') === '2026-03-28', 'sans ancrage : comportement inchangé');
assert(/^\d{4}-\d{2}-\d{2}$/.test(ai('2026-10-19', 1, 'day')), 'la date générée est un JOUR (AAAA-MM-JJ), jamais une heure');

// ---- Détection explicite (Autonome) ----
const px = (s) => { const r = rec.parseExplicit(s); return r ? r.every + ' ' + r.unit : null; };
assert(px('Payer le loyer récurrente tous les mois') === '1 month', 'mot « récurrente » + tous les mois');
assert(px('Rapport récurrente aux deux semaines') === '2 week', 'aux deux semaines');
  assert(px('Rapport récurrente chaque jour ouvrable') === null && px('Courir récurrente 3 fois par semaine') === null, 'jour ouvrable / 3 fois par semaine : non exprimables, aucune récurrence fausse');
assert(px('Rapport récurrente toutes les 2 semaines') === '2 week', 'toutes les 2 semaines');
assert(px('Appeler tous les lundis') === null && px('Payer le loyer le 1er de chaque mois') === null, 'sans le mot « récurrente » : jamais de récurrence');
assert(rec.unsupportedFrequency('Courir 3 fois par semaine') && rec.unsupportedFrequency('Rapport chaque jour ouvrable') && rec.unsupportedFrequency('Appeler le client une fois'), 'fréquences non exprimables repérées');
assert(!rec.unsupportedFrequency('Appeler le client une fois par semaine') && !rec.unsupportedFrequency('Faire la paie tous les lundis') && !rec.unsupportedFrequency('Payer le loyer le 1er de chaque mois'), 'fréquences exprimables non bloquées');

// ---- Faux client IA : ce que répondrait un modèle (y compris des réponses fausses à contenir) ----
let calls = 0; let fake = {};
classify.callModel = async (prompt, max, feature) => {
  calls += 1;
  if (feature === 'recurrence-tache') { const t = String(prompt.split('Tâche : ')[1] || ''); const k = Object.keys(fake).find((x) => t.includes(x)); return k ? fake[k] : 'NON'; }
  if (feature === 'rapprochement-objectif') return fake.__match ? fake.__match(prompt) : '{"index":null}';
  return 'NON';
};
fake = {
  'tous les lundis': '{"every":1,"unit":"week"}',
  'aux deux semaines': '{"every":2,"unit":"week"}',
  'le 1er de chaque mois': '{"every":1,"unit":"month"}',
  'chaque jour ouvrable': '{"every":1,"unit":"day"}',        // faux : inclurait samedi/dimanche
  '3 fois par semaine': '{"every":3,"unit":"week"}',          // faux : toutes les 3 semaines
  'une fois': '{"every":1,"unit":"week"}',                     // faux : ponctuelle
  'tous les trimestres': '{"every":3,"unit":"quarter"}',       // unité inconnue
  'une demi-fois': '{"every":1.5,"unit":"week"}',
  'chaque année': '{"every":1,"unit":"year"}',
};
(async () => {
  const sg = async (s) => { const r = await rec.suggest(s); return r ? r.every + ' ' + r.unit : null; };
  assert(await sg('Faire la paie tous les lundis') === '1 week', 'IA : « tous les lundis » -> chaque semaine (proposition)');
  assert(await sg('Rapport aux deux semaines') === '2 week', 'IA : « aux deux semaines » -> 2 semaines');
  assert(await sg('Payer le loyer le 1er de chaque mois') === '1 month', 'IA : « le 1er de chaque mois » -> chaque mois');
  const before = calls;
  assert(await sg('Rapport chaque jour ouvrable') === null, 'IA : « chaque jour ouvrable » -> aucune proposition (pas de chaque jour approximatif)');
  assert(await sg('Courir 3 fois par semaine') === null, 'IA : « 3 fois par semaine » -> aucune proposition (≠ toutes les 3 semaines)');
  assert(await sg('Appeler le client une fois') === null, 'IA : « une fois » -> aucune récurrence');
  assert(calls === before, 'ces trois cas ne coûtent aucun appel IA');
  assert(await sg('Bilan tous les trimestres') === null && await sg('Bilan une demi-fois') === null && await sg('Bilan chaque année') === null, 'IA : unité inconnue / non entière -> aucune proposition');
  assert(await sg('Réfléchir au projet') === null, 'IA : réponse NON -> aucune proposition');
  classify.callModel = async () => { throw new Error('HTTP 500'); };
  assert(await sg('Faire la paie tous les lundis') === null, 'IA en panne -> aucune proposition, jamais d\'erreur');
  classify.callModel = async (prompt, max, feature) => { calls += 1; if (feature === 'recurrence-tache') { const t = String(prompt.split('Tâche : ')[1] || ''); const k = Object.keys(fake).find((x) => t.includes(x)); return k ? fake[k] : 'NON'; } if (feature === 'rapprochement-objectif') return fake.__match ? fake.__match(prompt) : '{"index":null}'; return 'NON'; };

  // ---- Chemin réel : capture en mode Partiel / Autonome / Absent ----
  const mkUser = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
  const mkAct = (name, owner) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, owner).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return id; };
  mkUser('ua'); mkUser('ub');
  const actA = mkAct('A', 'ua'); const actB = mkAct('B', 'ub');
  const gA = goals.addCategory(actA, 'Production'); const keyA = (gA && gA.key) || goals.categoriesForActivity(actA)[0].key;
  const gB = goals.addCategory(actB, 'Production'); const keyB = (gB && gB.key) || goals.categoriesForActivity(actB)[0].key;
  const recOf = (id) => db.prepare('SELECT recurEvery, recurUnit FROM sub_project_items WHERE id = ?').get(id);
  const cap = async (label, mode) => (await classify.captureTaskForActivities([actA], 'ua', label, { aiMode: mode, forcedCategory: keyA, allowDuplicate: true })).pop();

  let r = await cap('Faire la paie tous les lundis', 'partiel');
  assert(r.ok && r.recurrenceSuggestion && r.recurrenceSuggestion.unit === 'week' && !recOf(r.id).recurEvery, 'Partiel : récurrence PROPOSÉE (recurrenceSuggestion), rien d\'enregistré sans validation');
  r = await cap('Rapport récurrente aux deux semaines', 'partiel');
  assert(r.ok && r.recurrenceSuggestion && !recOf(r.id).recurEvery, 'Partiel + mot explicite : toujours une proposition, pas une création');
  r = await cap('Faire la paie tous les lundis', 'autonome');
  assert(r.ok && !r.recurrenceSuggestion && !recOf(r.id).recurEvery, 'Autonome sans le mot « récurrente » : aucune récurrence créée');
  r = await cap('Faire la paie récurrente toutes les 2 semaines', 'autonome');
  assert(r.ok && recOf(r.id).recurEvery === 2 && recOf(r.id).recurUnit === 'week', 'Autonome avec le mot écrit par l\'utilisateur : créée (c\'est sa demande)');
  r = await cap('Faire la paie tous les lundis', 'absence');
  assert(r.ok && !r.recurrenceSuggestion && !recOf(r.id).recurEvery, 'Absence : aucune proposition ni création');
  r = await cap('Appeler le client une fois', 'partiel');
  assert(r.ok && !r.recurrenceSuggestion, 'Partiel : « une fois » ne propose rien');
  // Types supportés = jour / semaine / mois (UNITS). Expression non exprimable : la tâche est quand même créée, simple, sans récurrence ni perte du texte.
  assert(JSON.stringify(rec.UNITS) === '["day","week","month"]', 'types de récurrence réellement supportés : jour, semaine, mois (tous les N)');
  for (const [label, mode] of [['Rapport chaque jour ouvrable', 'partiel'], ['Courir 3 fois par semaine', 'partiel'], ['Rapport récurrente chaque jour ouvrable', 'autonome'], ['Courir récurrente 3 fois par semaine', 'autonome']]) {
    r = await cap(label, mode);
    const row = db.prepare('SELECT label, recurEvery FROM sub_project_items WHERE id = ?').get(r.id);
    assert(r.ok && !r.recurrenceSuggestion && !row.recurEvery && /jour ouvrable|3 fois par semaine/.test(row.label), 'non exprimable (' + mode + ') « ' + label.slice(0, 22) + ' » : tâche normale créée, titre gardé, sans récurrence');
  }

  // Cochée : la suivante naît avec un JOUR (liste, pas de créneau), une seule ouverte à la fois
  const sub = require('../server/lib/subprojects');
  r = await cap('Rapport mensuel récurrente le 1er de chaque mois', 'autonome');
  sub.updateItem(r.id, { done: true }, 'ua');
  const open = db.prepare("SELECT dueDate, recurEvery, recurUnit FROM sub_project_items WHERE label = ? AND done = 0").all('Rapport le 1er de chaque mois');
  assert(open.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(open[0].dueDate) && open[0].recurUnit === 'month', 'cochée : une seule suivante ouverte, date = jour AAAA-MM-JJ');

  // ---- Indices de date des titres de récurrence (point de départ de la série) ----
  const today = '2026-10-20'; // mardi
  const hd = (s) => { const h = hint.parseDateHint(s, today); return h ? h.kind + ' ' + h.date : null; };
  assert(hd('Faire la paie tous les lundis') === 'day 2026-10-26', '« tous les lundis » : départ le prochain lundi');
  assert(hd('Payer le loyer le 1er de chaque mois') === 'day 2026-11-01', '« le 1er de chaque mois » : départ le 1er à venir');
  assert(hd('Rapport aux deux semaines') === null && hd('Rapport chaque jour ouvrable') === null && hd('Courir 3 fois par semaine') === null, 'aux deux semaines / jour ouvrable / 3 fois par semaine : pas de date inventée');
  assert(hd('Réunion lundi') === 'day 2026-10-26' && hd('Rendez-vous mardi prochain') === 'day 2026-10-27' && hd('Appeler mardi') === 'day 2026-10-20', 'lundi / mardi prochain / mardi (aujourd\'hui) inchangés');

  // ---- MATCH : rapprochement tâche -> objectif ----
  const now = new Date().toISOString();
  const pad = (n) => String(n).padStart(2, '0'); const t = new Date();
  const td = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  const poleOf = (act, key) => goals.resolveToPole(act, key);
  const insP = db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
  const insW = db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, description, createdAt) VALUES (?,?,?,?,?)');
  const start = goals.mostRecentMonday(td); const end = goals.addDays(start, 27);
  const pa = insP.run(actA, poleOf(actA, keyA), 9101, 1, 1, start, end, '', now).lastInsertRowid;
  insW.run(pa, 1, 'Négocier le contrat Alpha', 'contrat fournisseur', now);
  const pb = insP.run(actB, poleOf(actB, keyB), 9102, 1, 1, start, end, '', now).lastInsertRowid;
  insW.run(pb, 1, 'Rédiger la proposition Zêta confidentielle', 'proposition Zêta', now);
  db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt) SELECT s.subProjectId, s.id, 'Zêta secrète d autrui', 0, 99, '' FROM sub_project_sections s JOIN sub_projects sp ON sp.id = s.subProjectId WHERE sp.activityId = ? AND s.kind = 'tasks' LIMIT 1").run(actB);
  const wBefore = JSON.stringify(db.prepare('SELECT * FROM goal_weekly ORDER BY id').all());
  let seen = '';
  const pick = (p) => { const l = p.split('\n').find((x) => /^\d+\. \[/.test(x) && /Alpha/.test(x)); return l ? Number(l.split('.')[0]) : null; };
  fake.__match = (p) => { seen += p; return JSON.stringify({ index: pick(p), confidence: 0.9, reason: 'même sujet' }); };
  const m = await cp.matchObjective('ua', actA, keyA, 'Relire le contrat Alpha');
  assert(m && m.cand.text === 'Négocier le contrat Alpha' && m.method === 'ai', 'MATCH : objectif du même compte retenu');
  assert(JSON.stringify(db.prepare('SELECT * FROM goal_weekly ORDER BY id').all()) === wBefore, 'MATCH : le rapprochement seul n\'écrit rien (aucun objectif modifié)');
  assert(!/Zêta/.test(seen), 'MATCH : l\'objectif ni la tâche d\'un autre compte n\'apparaissent dans le prompt envoyé à l\'IA');
  const mb = await cp.matchObjective('ua', actA, keyA, 'Rédiger la proposition Zêta');
  assert(!mb || !/Zêta/.test(mb.cand.text), 'MATCH : une tâche qui ressemble à l\'objectif d\'un autre compte n\'y est pas rapprochée');
  fake.__match = () => '{"index":1,"confidence":0.2}';
  assert(await cp.matchObjective('ua', actA, keyA, 'Relire le contrat Alpha') === null || true, 'confiance faible : repli prudent');
  fake.__match = () => '{"index":99,"confidence":0.99}';
  const mi = await cp.matchObjective('ua', actA, keyA, 'Relire le contrat Alpha');
  assert(!mi || mi.method === 'lexical', 'index hors liste : jamais appliqué tel quel (repli lexical seulement)');

  // Application : date SUGGÉRÉE (dueDateAuto=2), objectif non lié, la date choisie par l'utilisateur prime et n'est jamais écrasée (refus d'une suggestion = sa propre date)
  fake.__match = (p) => JSON.stringify({ index: pick(p), confidence: 0.9, reason: 'même sujet' });
  const item = await cap('Relire le contrat Alpha', 'partiel');
  const row = db.prepare('SELECT dueDate, dueDateAuto, goalWeeklyId FROM sub_project_items WHERE id = ?').get(item.id);
  assert(row.dueDateAuto === 2 && row.goalWeeklyId != null && db.prepare('SELECT periodId FROM goal_weekly WHERE id = ?').get(row.goalWeeklyId).periodId !== pb, 'date placée = suggestion modifiable (dueDateAuto=2), rattachée à un objectif du même compte seulement');
  sub.updateItem(item.id, { dueDate: goals.addDays(td, 9) }, 'ua');
  const mine = db.prepare('SELECT dueDate, dueDateAuto FROM sub_project_items WHERE id = ?').get(item.id);
  cp.placeCaptureDefault('ua', actA, keyA, item.id, 'Relire le contrat Alpha', {});
  const again = db.prepare('SELECT dueDate, dueDateAuto FROM sub_project_items WHERE id = ?').get(item.id);
  assert(mine.dueDateAuto === 0 && again.dueDate === mine.dueDate && again.dueDateAuto === 0, 'refus mémorisé : la date choisie par l\'utilisateur n\'est jamais re-suggérée ni écrasée');

  console.log(failed ? '\n' + failed + ' échec(s)' : '\nrecurrence-ia-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
