// Type d'une tâche, calculé EN SILENCE (jamais montré ni proposé) : « développement » (fait avancer un objectif) ou
// « maintenance » (entretien, sans objectif). Sert seulement au rangement (goalscaptureplace.js) et à l'ordre de la liste du jour
// (goalsdailypriority.js). Sans signal assez net : null = neutre (aucun effet, comportement d'avant). Aucune IA, aucun réseau.
// Mode IA « Partiel » seulement (l'appelant ne calcule rien en mode « Absent »).
const db = require('../db');

const KINDS = ['maintenance', 'developpement'];

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
  const kind = diff >= MIN_MARGIN ? (dev > maint ? 'developpement' : 'maintenance') : null;
  const confidence = kind ? Math.min(100, 40 + diff * 15) : 0;
  const isMaint = kind === 'maintenance';
  return { kind, confidence, maintType: isMaint ? maintTypeOf(label) : null, urgent: isMaint && urgentText, long };
}

function rankOf(maintType) { return ESSENTIAL_RANK[maintType] || DEFAULT_RANK; }

function write(itemId, res) {
  const r = res || {};
  db.prepare('UPDATE sub_project_items SET taskKind = ?, maintType = ?, maintUrgent = ? WHERE id = ?')
    .run(KINDS.includes(r.kind) ? r.kind : null, r.kind === 'maintenance' ? (r.maintType || null) : null, r.kind === 'maintenance' && r.urgent ? 1 : 0, itemId);
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

module.exports = { KINDS, ESSENTIAL_RANK, MIN_HISTORY, compute, rankOf, maintTypeOf, isUrgentText, doneDatesForTitle, sectorDevShare, write, read, readMany };
