// Stratégie d'une activité (19 oct. 2026, décision d'Émilien) : consignes d'organisation saisies par l'utilisateur (but global,
// échéance, 3 priorités, ce qui est à ignorer), dès la version gratuite. L'IA les suit exactement :
//  - effet 1 : bloc <strategie> ajouté au prompt existant (documenttasks.buildUserParts), l'IA n'écarte que les tâches hors stratégie ;
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

function isEmpty(s) { return !s.goal && !s.deadline && !s.ignore && !s.priorities.some(Boolean); }

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
  if (s.goal) lines.push('But global : ' + t(s.goal));
  if (s.deadline) lines.push('Échéance : ' + t(s.deadline));
  s.priorities.filter(Boolean).forEach((p, i) => lines.push('Priorité ' + (i + 1) + ' : ' + t(p)));
  if (s.ignore) lines.push('À NE PAS faire / à ignorer : ' + t(s.ignore));
  lines.push('</strategie>');
  return lines.join('\n');
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

module.exports = { get, set, isEmpty, promptBlock, isSilentlyRemovable, scheduleReview };
