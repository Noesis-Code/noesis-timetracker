// Type d'une tâche, calculé EN SILENCE (jamais montré ni proposé) : « développement » (fait avancer un objectif) ou
// « maintenance » (entretien, sans objectif). Sert seulement au rangement (goalscaptureplace.js) et à l'ordre des tâches
// (tierOf / compareTasks ci-dessous, prêts pour la page « Aujourd'hui »). Sans signal assez net : null = neutre (aucun effet, comportement d'avant). Aucune IA, aucun réseau.
// NATURE et PHASE (12 nov. 2026, décision d'Émilien) : nature = Développer (taskKind 'developpement') | Maintenir (taskKind 'maintenance') ; phase (taskPhase) = Réformer, Cadrage, Réalisation, Finition, SEULEMENT sous Développer,
// jamais sur la maintenance ; Réformer = première phase (avant le cadrage, voir reform.js). Calcul INTERNE : aucune étiquette, aucun champ, aucune proposition, aucun défaut « Réalisation » (sans signal net : null, ordonnée comme la réalisation).
// Mode IA « Partiel » seulement (l'appelant ne calcule rien en mode « Absent »).
const db = require('../db');

const KINDS = ['maintenance', 'developpement'];
const PHASES = ['reformer', 'cadrage', 'realisation', 'finition'];

// Rang d'essentiel : plus petit = plus essentiel.
const ESSENTIAL_RANK = {
  legal: 1, finances: 2, depannage: 3, outils: 4, routine: 5, suivi: 6, controle: 7, rangement: 8, materiel: 9, veille: 10, personnel: 11,
};
const DEFAULT_RANK = 12;
const MIN_HISTORY = 10; // tâches terminées du pôle nécessaires avant que le signal « secteur » compte
const MIN_MARGIN = 2;   // écart de points minimal entre les deux types pour trancher

function ensureColumns() {
  const cols = db.prepare('PRAGMA table_info(sub_project_items)').all().map((c) => c.name);
  if (!cols.includes('taskKind')) db.exec('ALTER TABLE sub_project_items ADD COLUMN taskKind TEXT');
  if (!cols.includes('maintType')) db.exec('ALTER TABLE sub_project_items ADD COLUMN maintType TEXT');
  if (!cols.includes('maintUrgent')) db.exec('ALTER TABLE sub_project_items ADD COLUMN maintUrgent INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('taskPhase')) db.exec('ALTER TABLE sub_project_items ADD COLUMN taskPhase TEXT'); // phase d'une tâche de développement : reformer | cadrage | realisation | finition | null (jamais montrée)
}
ensureColumns();

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s) { const n = norm(s); return n ? n.split(' ') : []; }

// Débuts de mots (FR/EN) : un mot du titre correspond quand il commence par le radical (et reste court après).
const MAINT_VERBS = ['pay', 'paie', 'renouvel', 'renew', 'verif', 'check', 'relanc', 'follow', 'sauvegard', 'backup', 'nettoy', 'clean', 'rang', 'tidy', 'class', 'organis',
  'declar', 'factur', 'invoice', 'rapproch', 'reconcil', 'repond', 'reply', 'answer', 'control', 'repar', 'fix', 'corrig', 'correct', 'archiv', 'trier', 'renouv', 'entretien', 'maintenance'];
const MAINT_PHRASES = ['mettre a jour', 'mise a jour', 'mets a jour', 'met a jour', 'remettre en ordre', 'follow up', 'catch up'];
const DEV_VERBS = ['concev', 'concoi', 'design', 'creat', 'creer', 'creation', 'cree', 'lanc', 'launch', 'developp', 'develop', 'redig', 'write', 'draft', 'constru', 'build', 'ouvrir', 'open',
  'imagin', 'defin', 'define', 'invent', 'prototyp', 'conceptualis', 'etablir', 'elabor'];
const URGENT_WORDS = ['panne', 'bris', 'casse', 'cassee', 'cassees', 'cassé', 'urgent', 'urgente', 'bug', 'erreur', 'incident', 'plante', 'plantee', 'bloque', 'bloquee', 'bloquant', 'broken', 'outage', 'crash', 'crashed', 'blocked', 'blocker'];
const URGENT_PHRASES = ['ne fonctionne plus', 'ne marche plus', 'mise a jour de securite', 'mise a jour securite', 'mise a jour systeme', 'security update', 'system update', 'stopped working', 'not working', 'doesn t work'];

function startsWith(tok, stem) {
  if (!tok.startsWith(stem)) return false;
  return tok.length <= stem.length + 8;
}
function hasStem(toks, stems) { return toks.findIndex((t) => stems.some((s) => startsWith(t, s))); }

// Score d'une famille de verbes : 2 si le premier mot du titre en est un, 1 si c'est ailleurs, plafonné à 2.
function verbScore(toks, norml, stems, phrases) {
  const idx = hasStem(toks, stems);
  const phrase = (phrases || []).some((p) => (' ' + norml + ' ').includes(' ' + p + ' '));
  if (phrase) return 2;
  if (idx === 0) return 2;
  if (idx > 0) return 1;
  return 0;
}

function isUrgentText(label) {
  const n = norm(label);
  const toks = n.split(' ');
  if (URGENT_WORDS.some((w) => toks.includes(norm(w)))) return true;
  return URGENT_PHRASES.some((p) => (' ' + n + ' ').includes(' ' + p + ' '));
}

// Types d'entretien : testés dans l'ordre d'essentialité, le premier qui correspond l'emporte.
const TYPE_LEX = [
  ['legal', ['impot', 'taxe', 'tps', 'tvq', 'declar', 'licence', 'permis', 'assurance', 'contrat', 'juridique', 'legal', 'tax', 'license', 'insurance', 'permit', 'compliance', 'conformite', 'notaire', 'avocat']],
  ['finances', ['pay', 'paie', 'facture', 'factur', 'invoice', 'compta', 'banque', 'bank', 'budget', 'rapproch', 'depense', 'expense', 'salaire', 'loyer', 'rent', 'virement', 'rembours', 'financ', 'reconcil']],
  ['depannage', ['panne', 'bris', 'cass', 'repar', 'repair', 'urgent', 'bug', 'erreur', 'error', 'incident', 'depann', 'fix', 'broken', 'probleme', 'problem', 'plante', 'crash', 'bloqu']],
  ['outils', ['logiciel', 'software', 'application', 'serveur', 'server', 'sauvegard', 'backup', 'abonnement', 'subscription', 'password', 'passe', 'systeme', 'system', 'outil', 'tool', 'configur', 'install', 'update', 'mise a jour', 'mettre a jour']],
  ['routine', ['quotidien', 'hebdo', 'routine', 'rituel', 'habitude', 'daily', 'weekly', 'monthly', 'mensuel']],
  ['suivi', ['relanc', 'suivi', 'follow', 'repond', 'courriel', 'email', 'mail', 'rappel', 'rappeler', 'reply', 'answer', 'message']],
  ['controle', ['verif', 'control', 'inspect', 'audit', 'check', 'review', 'valid', 'revoir']],
  ['rangement', ['rang', 'class', 'nettoy', 'trier', 'tri', 'organis', 'clean', 'tidy', 'sort', 'archiv', 'ordre']],
  ['materiel', ['materiel', 'equipement', 'equipment', 'stock', 'inventaire', 'inventory', 'commande', 'achat', 'acheter', 'buy', 'order', 'fourniture', 'supplies']],
  ['veille', ['veille', 'lecture', 'lire', 'article', 'watch', 'monitor', 'surveill', 'tendance', 'trend']],
  ['personnel', ['dentiste', 'medecin', 'doctor', 'famille', 'family', 'perso', 'personal', 'maison', 'home', 'anniversaire', 'birthday', 'vacances', 'sante', 'health']],
];
function maintTypeOf(label) {
  const n = norm(label);
  const toks = n.split(' ');
  for (const [type, stems] of TYPE_LEX) {
    if (stems.some((s) => (s.includes(' ') ? (' ' + n + ' ').includes(' ' + s + ' ') : toks.some((t) => t === s || (s.length >= 4 && t.startsWith(s) && t.length <= s.length + 6))))) return type;
  }
  return 'routine';
}

// Phase d'une tâche de DÉVELOPPEMENT, d'après son titre (lexique, aucun réseau) : cadrage = décider, définir, planifier, étudier, concevoir avant de faire ; finition = terminer, relire, tester, corriger le détail, publier, livrer ;
// réalisation = produire (verbes de fabrication) ; sans signal net : null. Réformer vient de reform.js (setPhase). Un seul verbe en tête de titre l'emporte ; sinon la phase la mieux représentée ; égalité : null.
const PHASE_STEMS = {
  cadrage: ['defin', 'planifi', 'plan', 'etudi', 'analys', 'cadr', 'esquiss', 'specif', 'cahier', 'brainstorm', 'recherch', 'estim', 'evalu', 'prepar', 'organis', 'imagin', 'concev', 'concoi', 'design', 'scope', 'outline', 'research', 'plann', 'roadmap', 'strateg'],
  realisation: ['redig', 'ecri', 'write', 'draft', 'constru', 'build', 'develop', 'developp', 'cod', 'cre', 'creat', 'produi', 'produc', 'fabriqu', 'monter', 'enregistr', 'record', 'dessin', 'implement', 'realis', 'install', 'integr', 'tourn', 'film'],
  finition: ['finalis', 'finit', 'relis', 'relir', 'polir', 'peaufin', 'tester', 'test', 'corrig', 'correct', 'verif', 'valid', 'publi', 'livr', 'lanc', 'launch', 'deploy', 'soumett', 'envoy', 'proofread', 'polish', 'finish', 'ship', 'submit', 'review', 'qa'],
};
function phaseOf(label) {
  const toks = tokens(label); if (!toks.length) return null;
  const score = { cadrage: 0, realisation: 0, finition: 0 };
  Object.keys(PHASE_STEMS).forEach((ph) => {
    toks.forEach((t, i) => { if (PHASE_STEMS[ph].some((s) => t === s || startsWith(t, s))) score[ph] += i === 0 ? 2 : 1; });
  });
  const best = Object.keys(score).sort((a, b) => score[b] - score[a]);
  if (score[best[0]] === 0 || score[best[0]] === score[best[1]]) return null;
  return best[0];
}

// --- Historique (base) ---
function normalizeTitle(s) { return require('./goalstaskclassify').normalizeTitle(s); }

// Dates (AAAA-MM-JJ, triées) où la même tâche (titre normalisé) a été terminée dans l'activité.
function doneDatesForTitle(activityId, label) {
  const target = normalizeTitle(label);
  if (!target || activityId == null) return [];
  const rows = db.prepare(`
    SELECT i.label, i.doneAt FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.done = 1 AND i.doneAt IS NOT NULL
  `).all(activityId);
  return rows.filter((r) => normalizeTitle(r.label) === target).map((r) => String(r.doneAt).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

// Part (0 à 1) des tâches terminées du pôle/secteur qui étaient liées à un objectif hebdomadaire ; null sous MIN_HISTORY tâches.
function sectorDevShare(activityId, categoryKey) {
  if (activityId == null || !categoryKey) return null;
  const goals = require('./goals');
  const pole = goals.resolveToPole(activityId, categoryKey);
  const keys = [pole].concat((goals.secteursForPole(activityId, pole) || []).map((s) => s.key));
  const row = db.prepare(`
    SELECT COUNT(*) AS n, SUM(CASE WHEN i.goalWeeklyId IS NOT NULL THEN 1 ELSE 0 END) AS linked
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.done = 1 AND sp.goalCategory IN (${keys.map(() => '?').join(',')})
  `).get(activityId, ...keys);
  if (!row || row.n < MIN_HISTORY) return null;
  return (row.linked || 0) / row.n;
}

// Pur quand repeatCount / sectorShare sont fournis ; sinon lus en base à partir de activityId / categoryKey.
// -> { kind: 'maintenance' | 'developpement' | null, confidence (0-100), maintType, urgent, long }
function compute(p) {
  const o = p || {};
  const label = String(o.label || '');
  const n = norm(label);
  const toks = n ? n.split(' ') : [];
  let dev = 0; let maint = 0;

  if (o.objectiveMatched) dev += 3; // (a)
  const rec = !!o.recurrence;
  let repeats = o.repeatCount;
  if (repeats == null) { try { repeats = doneDatesForTitle(o.activityId, label).length; } catch (e) { repeats = 0; } }
  if (rec || repeats >= 2) maint += 3; // (b)
  maint += verbScore(toks, n, MAINT_VERBS, MAINT_PHRASES); // (c)
  dev += verbScore(toks, n, DEV_VERBS, null);
  const urgentText = isUrgentText(label);
  if (urgentText) maint += 3;
  let share = o.sectorShare;
  if (share === undefined) { try { share = sectorDevShare(o.activityId, o.categoryKey); } catch (e) { share = null; } }
  if (share != null) { if (share >= 0.6) dev += 1; else if (share <= 0.2) maint += 1; } // (e)

  const minutes = Number(o.minutes) || 0; const capacity = Number(o.capacity) || 0;
  const long = !!(minutes > 0 && capacity > 0 && minutes > capacity); // (d)

  const diff = Math.abs(dev - maint);
  const hint = KINDS.includes(o.natureHint) ? o.natureHint : null; // nature choisie sur l'objectif de la tâche (Avancé) : elle l'emporte ; vide = l'IA (calcul ci-dessus) décide en silence
  const kind = hint || (diff >= MIN_MARGIN ? (dev > maint ? 'developpement' : 'maintenance') : null);
  const confidence = hint ? 100 : kind ? Math.min(100, 40 + diff * 15) : 0;
  const isMaint = kind === 'maintenance';
  return { kind, confidence, maintType: isMaint ? maintTypeOf(label) : null, urgent: isMaint && urgentText, long, phase: kind === 'developpement' ? phaseOf(label) : null };
}

function rankOf(maintType) { return ESSENTIAL_RANK[maintType] || DEFAULT_RANK; }

// Palier de tri (avant l'importance) : 0 maintenance urgente ; 1 maintenance longue non urgente ; 2 développement sans objectif ;
// 3 développement avec objectif ou tâche sans type (comportement d'avant) ; 4 maintenance courte non urgente.
// t : { taskKind, maintUrgent, hasObjective, estimatedMinutes } ; capacityMinutes : temps disponible du jour.
function tierOf(t, capacityMinutes) {
  if (t.taskKind === 'maintenance') {
    if (t.maintUrgent) return 0;
    return t.estimatedMinutes > capacityMinutes ? 1 : 4;
  }
  if (t.taskKind === 'developpement' && !t.hasObjective) return 2;
  return 3;
}

// Comparateur de rang par paliers (pur) : à appeler sur des tâches qui portent déjà .tier (tierOf), .maintType, .estimatedMinutes.
// Renvoie 0 à égalité : l'appelant départage ensuite (importance, score, etc.).
// Palier 3, développement de continuité (lié à un objectif) : d'abord l'objectif PÉRIODIQUE (fin de période la plus proche, puis son numéro),
// puis l'objectif HEBDOMADAIRE (semaine la plus proche). Les tâches sans objectif viennent après (ordre d'avant). Décision d'Émilien, 3 nov. 2026.
function compareContinuity(a, b) {
  const oa = a.hasObjective && a.periodEnd ? 0 : 1; const ob = b.hasObjective && b.periodEnd ? 0 : 1;
  if (oa !== ob) return oa - ob;
  if (oa === 0) return (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0) || ((a.periodNumber || 0) - (b.periodNumber || 0)) || ((a.weekIndex || 0) - (b.weekIndex || 0));
  return 0;
}
function compareTasks(a, b) {
  return (a.tier - b.tier)
    || (a.tier === 3 ? compareContinuity(a, b) : 0)
    || (a.tier <= 1 ? rankOf(a.maintType) - rankOf(b.maintType) : 0)
    || (a.tier === 4 ? (a.estimatedMinutes - b.estimatedMinutes) || (rankOf(a.maintType) - rankOf(b.maintType)) : 0);
}

// ORDRE DU PLAN DU JOUR (12 nov. 2026, décision d'Émilien) : rang 1 maintenance urgente > rang 2 Réformer > rang 3 Cadrage > rang 4 Réalisation, Finition et maintenance non urgente MÉLANGÉES (une tâche sans phase y est aussi).
// USURE : une tâche repoussée (en retard sur sa date) monte d'un rang à intervalles égaux et atteint le rang 1 après la durée de la période de son objectif (hebdomadaire 7 j, périodique 28 j, annuel / pluriannuel plafonné à 28 j ;
// sans objectif : 28 j). Du rang r au rang 1 il y a r - 1 marches, chacune dure (durée / (r - 1)) jours de retard. La place choisie à la main par la personne n'est jamais remise en question (l'ordre ne sert qu'à proposer).
const DAY_MS = 86400000;
function baseDayRank(t) {
  if (t.taskKind === 'maintenance') return t.maintUrgent ? 1 : 4;
  if (t.phase === 'reformer' || t.reform) return 2;
  if (t.taskKind === 'developpement' && t.phase === 'cadrage') return 3;
  return 4;
}
function periodDays(t) { return t.hasObjective ? (t.objectiveDays === 7 ? 7 : 28) : 28; } // tâche liée à un objectif hebdomadaire : 7 j ; sinon 28 j (périodique, annuel / pluriannuel plafonné, sans objectif)
function dayRank(t, today) {
  const base = baseDayRank(t);
  if (base <= 1 || !t.dueDate || !today) return base;
  const late = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(String(t.dueDate).slice(0, 10) + 'T00:00:00Z')) / DAY_MS);
  if (!(late > 0)) return base;
  const D = periodDays(t), steps = base - 1;
  if (late >= D) return 1;
  return Math.max(1, base - Math.floor(late / (D / steps)));
}
// Comparateur du jour (pur) : rang du jour, puis l'essentiel pour la maintenance urgente, puis la continuité (objectif périodique puis hebdomadaire) ; l'appelant départage ensuite (échéance, création).
function compareDay(a, b) {
  return (a.dayRank - b.dayRank) || (a.dayRank === 1 ? rankOf(a.maintType) - rankOf(b.maintType) : 0) || (a.dayRank > 1 ? compareContinuity(a, b) : 0);
}

// Palier de PLACEMENT (ordre d'Émilien, 10 nov. 2026) : le même que tierOf, avec la réforme juste après la maintenance urgente (0 puis 0,5). Seule l'importance compte :
// une date saisie à la main n'est pas plus importante qu'une autre. UN SEUL classement, du plus urgent au moins urgent, pour l'ajout, le report et le retrait d'une tâche.
function placementTier(t, capacityMinutes) { return t.reform ? 0.5 : tierOf(t, capacityMinutes); }
// Comparateur de placement (pur) : paliers, puis (palier 0 et réformes) l'essentiel (rankOf) puis l'échéance ; palier 3 : continuité ; en dernier recours score d'importance, échéance, id.
// a, b : { tier (placementTier), maintType, estimatedMinutes, hasObjective, periodEnd, periodNumber, weekIndex, score?, dueDate?, id }. Plus petit = plus important.
function comparePlacement(a, b) {
  const da = String(a.dueDate || '9999'), db2 = String(b.dueDate || '9999');
  return compareTasks(a, b) || ((b.score || 0) - (a.score || 0)) || (da < db2 ? -1 : da > db2 ? 1 : 0) || ((a.id || 0) - (b.id || 0));
}
// { [id]: rang } pour plusieurs tâches (type, objectif lié et sa continuité, réforme, palier de placement). minutesOf(id) : durée de la tâche ; capacityMinutes : temps d'une journée.
function rankInfoMany(ids, capacityMinutes, minutesOf) {
  const out = {};
  if (!ids || !ids.length) return out;
  const kinds = readMany(ids), reforms = require('./reform').readMany(ids), weekly = {};
  db.prepare('SELECT id, goalWeeklyId FROM sub_project_items WHERE id IN (' + ids.map(() => '?').join(',') + ')').all(...ids).forEach((r) => { weekly[r.id] = r.goalWeeklyId; });
  const info = {};
  const wids = Array.from(new Set(Object.values(weekly).filter((w) => w != null)));
  if (wids.length) db.prepare('SELECT w.id, w.weekIndex, p.endDate, p.periodNumber FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE w.id IN (' + wids.map(() => '?').join(',') + ')').all(...wids).forEach((r) => { info[r.id] = r; });
  ids.forEach((id) => {
    const k = kinds[id] || {}, oi = info[weekly[id]] || {};
    const r = { id, taskKind: k.kind, maintType: k.maintType, maintUrgent: k.urgent, estimatedMinutes: (minutesOf ? minutesOf(id) : 0) || 0, hasObjective: weekly[id] != null, reform: !!reforms[id],
      periodEnd: oi.endDate, periodNumber: oi.periodNumber, weekIndex: oi.weekIndex };
    r.tier = placementTier(r, capacityMinutes);
    out[id] = r;
  });
  return out;
}

function write(itemId, res) {
  const r = res || {};
  db.prepare('UPDATE sub_project_items SET taskKind = ?, maintType = ?, maintUrgent = ?, taskPhase = ? WHERE id = ?')
    .run(KINDS.includes(r.kind) ? r.kind : null, r.kind === 'maintenance' ? (r.maintType || null) : null, r.kind === 'maintenance' && r.urgent ? 1 : 0, r.kind === 'developpement' && PHASES.includes(r.phase) ? r.phase : null, itemId);
}
// Réformer = première phase de Développer (jamais sur la maintenance) : posée par la détection de réforme (reform.js).
function setPhase(itemId, phase) {
  db.prepare("UPDATE sub_project_items SET taskPhase = ? WHERE id = ? AND taskKind = 'developpement'").run(PHASES.includes(phase) ? phase : null, itemId);
}
function readPhaseMany(ids) {
  const out = {}, sel = db.prepare('SELECT taskPhase FROM sub_project_items WHERE id = ?');
  (ids || []).forEach((id) => { const r = sel.get(id); out[id] = (r && r.taskPhase) || null; });
  return out;
}
function read(itemId) {
  const r = db.prepare('SELECT taskKind, maintType, maintUrgent FROM sub_project_items WHERE id = ?').get(itemId) || {};
  return { kind: r.taskKind || null, maintType: r.maintType || null, urgent: !!r.maintUrgent };
}
// { [id]: { kind, maintType, urgent } } pour plusieurs tâches.
function readMany(ids) {
  const out = {};
  const sel = db.prepare('SELECT taskKind, maintType, maintUrgent FROM sub_project_items WHERE id = ?');
  (ids || []).forEach((id) => { const r = sel.get(id) || {}; out[id] = { kind: r.taskKind || null, maintType: r.maintType || null, urgent: !!r.maintUrgent }; });
  return out;
}

module.exports = { dayRank, compareDay, baseDayRank, PHASES, phaseOf, setPhase, readPhaseMany, KINDS, ESSENTIAL_RANK, MIN_HISTORY, compute, rankOf, tierOf, compareTasks, placementTier, comparePlacement, rankInfoMany, maintTypeOf, isUrgentText, doneDatesForTitle, sectorDevShare, write, read, readMany };
