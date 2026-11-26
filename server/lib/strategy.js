// Stratégie d'une activité (décision d'Émilien). Depuis le 18 nov. 2026 la fiche « stratégie » (but, échéance, 3 priorités) n'est PLUS LUE : ses données restent en base (jamais supprimées, S6) mais
// seul « à ignorer » est lu par la génération de tâches. « À ignorer » se remplit TOUT SEUL : après deux refus d'un même type de proposition de tâche (noterRefus), le motif s'y ajoute.
// La stratégie par type d'objectif (construction / progression) reste silencieuse (taches-place.js). L'IA suit « à ignorer » exactement :
//  - effet 1 : bloc <strategie> (seulement « à ignorer ») ajouté au prompt existant (documenttasks.buildUserParts), l'IA n'écarte que les tâches à ignorer ;
//  - effet 2 : après une modification, la section « c » (changeproposals) peut demander le retrait de tâches devenues hors stratégie.
//    Suppression SILENCIEUSE seulement pour une tâche d'origine 'ai' que l'utilisateur n'a ni cochée ni modifiée ; sinon proposition
//    validée (« Modifications proposées », avant/après). Une tâche saisie par l'utilisateur (origin 'user') n'est jamais touchée en silence.
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS activity_strategies (
  activityId INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
  goal TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',
  priorities TEXT NOT NULL DEFAULT '[]',
  ignore TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  updatedBy TEXT
)`);
// Origine d'une tâche : 'user' (saisie directe, par défaut) ou 'ai' (créée par la surveillance Drive / « Ajouter des tâches »). Migration additive.
if (!db.prepare('PRAGMA table_info(sub_project_items)').all().some((c) => c.name === 'origin')) {
  db.exec("ALTER TABLE sub_project_items ADD COLUMN origin TEXT NOT NULL DEFAULT 'user'");
}

const LIMITS = { goal: 300, deadline: 60, priority: 200, ignore: 500 };
const clean = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

function get(activityId) {
  const r = db.prepare('SELECT * FROM activity_strategies WHERE activityId = ?').get(activityId);
  let priorities = [];
  try { priorities = JSON.parse(r && r.priorities); } catch (e) { /* illisible : vide */ }
  priorities = (Array.isArray(priorities) ? priorities : []).map((p) => clean(p, LIMITS.priority)).slice(0, 3);
  while (priorities.length < 3) priorities.push('');
  return { goal: r ? r.goal : '', deadline: r ? r.deadline : '', priorities, ignore: r ? r.ignore : '', updatedAt: r ? r.updatedAt : null, updatedBy: r ? r.updatedBy : null };
}

// Vide = rien à ignorer : le but, l'échéance et les priorités ne sont plus lus (18 nov. 2026).
function isEmpty(s) { return !s.ignore; }

function set(activityId, userId, body) {
  const b = body || {};
  const cur = get(activityId);
  const next = {
    goal: b.goal !== undefined ? clean(b.goal, LIMITS.goal) : cur.goal,
    deadline: b.deadline !== undefined ? clean(b.deadline, LIMITS.deadline) : cur.deadline,
    priorities: Array.isArray(b.priorities) ? b.priorities.slice(0, 3).map((p) => clean(p, LIMITS.priority)) : cur.priorities,
    ignore: b.ignore !== undefined ? clean(b.ignore, LIMITS.ignore) : cur.ignore,
  };
  while (next.priorities.length < 3) next.priorities.push('');
  const changed = JSON.stringify(next) !== JSON.stringify({ goal: cur.goal, deadline: cur.deadline, priorities: cur.priorities, ignore: cur.ignore });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO activity_strategies (activityId, goal, deadline, priorities, ignore, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(activityId) DO UPDATE SET goal = excluded.goal, deadline = excluded.deadline, priorities = excluded.priorities, ignore = excluded.ignore, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
    .run(activityId, next.goal, next.deadline, JSON.stringify(next.priorities), next.ignore, now, userId);
  return { strategy: get(activityId), changed };
}

// Bloc inséré dans la partie STABLE du prompt (cache conservé tant que la stratégie ne change pas). '' si aucune stratégie.
function promptBlock(activityId, tagsOut) {
  const s = get(activityId);
  if (isEmpty(s)) return '';
  const t = tagsOut || ((x) => x);
  const lines = ['<strategie>'];
  lines.push('À NE PAS faire / à ignorer : ' + t(s.ignore));
  lines.push('</strategie>');
  return lines.join('\n');
}

// ---- « À ignorer » rempli tout seul (18 nov. 2026, décision d'Émilien) ----
// Un refus = une tâche proposée par la génération et décochée par la personne. Après DEUX refus d'un même type de proposition (même motif générique : taches-apprentissage.motifOf, jamais un chiffre
// ni un nom propre), le motif s'ajoute à « à ignorer » ; la génération le lit ensuite (taskprecision.matchesIgnore). Aucun écran, aucun réglage. Rien n'est supprimé.
db.exec(`CREATE TABLE IF NOT EXISTS task_proposal_refus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  motif TEXT NOT NULL,
  createdAt TEXT NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_task_proposal_refus_motif ON task_proposal_refus(activityId, motif)');
const REFUS_SEUIL = 2;
function ajouterIgnorer(activityId, userId, terme) {
  const cur = get(activityId);
  const t = clean(terme, 80);
  if (!t) return false;
  const deja = cur.ignore.split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (deja.includes(t.toLowerCase())) return false;
  const next = clean(cur.ignore ? cur.ignore + ', ' + t : t, LIMITS.ignore);
  if (next.toLowerCase() === cur.ignore.toLowerCase()) return false;
  set(activityId, userId, { ignore: next });
  return true;
}
// titres : les tâches proposées puis décochées. Renvoie les motifs ajoutés à « à ignorer ».
function noterRefus(userId, activityId, titres) {
  const ajoutes = [];
  try {
    const { motifOf } = require('./taches-apprentissage');
    const vus = new Set(), now = new Date().toISOString();
    (Array.isArray(titres) ? titres : []).slice(0, 25).forEach((titre) => {
      const m = motifOf(titre);
      if (!m || vus.has(m)) return;
      vus.add(m);
      db.prepare('INSERT INTO task_proposal_refus (activityId, userId, motif, createdAt) VALUES (?, ?, ?, ?)').run(activityId, userId, m, now);
    });
    vus.forEach((m) => {
      const n = db.prepare('SELECT COUNT(*) AS n FROM task_proposal_refus WHERE activityId = ? AND motif = ?').get(activityId, m).n;
      if (n >= REFUS_SEUIL && ajouterIgnorer(activityId, userId, m)) ajoutes.push(m);
    });
  } catch (e) { /* jamais bloquant */ }
  return ajoutes;
}

// Tâche retirable en silence : créée par l'IA, ni cochée ni modifiée par l'utilisateur.
function isSilentlyRemovable(itemId) {
  const r = db.prepare('SELECT origin, done FROM sub_project_items WHERE id = ?').get(itemId);
  return !!r && r.origin === 'ai' && !r.done;
}

// Après une modification de la stratégie : analyse en arrière-plan (délai), via le même appel que les modifications proposées.
const timers = new Map();
const DELAY = () => (process.env.STRATEGY_DEBOUNCE_MS !== undefined ? Number(process.env.STRATEGY_DEBOUNCE_MS) : 8000);
function scheduleReview(userId, activityId) {
  clearTimeout(timers.get(activityId));
  const t = setTimeout(() => {
    timers.delete(activityId);
    Promise.resolve().then(() => require('./changeproposals').generate(userId, activityId, { strategy: true })).catch(() => {});
  }, DELAY());
  if (t.unref) t.unref();
  timers.set(activityId, t);
}

module.exports = { get, set, isEmpty, promptBlock, isSilentlyRemovable, scheduleReview, noterRefus, ajouterIgnorer, REFUS_SEUIL };
