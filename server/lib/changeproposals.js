// « Modifications proposées » (Essor, 16 oct. 2026). Décision d'Émilien : une saisie manuelle
// ne change que PAR PROPOSITION VALIDÉE, montrant l'avant et l'après, champ par champ.
//
// L'IA propose de modifier des éléments existants (texte ou date d'une tâche ; temps estimé ou
// consigne d'un objectif hebdomadaire) compte tenu des tâches déjà réalisées, des accomplissements,
// de la capacité et, si fourni, d'un document. Rien n'est écrit à la proposition : seules des lignes
// 'pending' de change_proposals sont créées. `apply` n'écrit QUE les lignes cochées, via les
// fonctions existantes (subprojects.updateItem, goals.setWeekly, recomputeForWeeklies), en
// respectant les verrous. Un refus (dismissed) est mémorisé par hash : jamais re-proposé à
// l'identique. Le document est une DONNÉE, jamais une instruction ; la sortie JSON est revalidée
// (cible appartenant à l'activité, valeurs, « avant » relu en base et non fourni par l'IA).
// Coût : chaque appel IA consomme le plafond quotidien partagé avec la surveillance Drive
// (drivesync.takeCall / DRIVE_SYNC_MAX_AI_CALLS_PER_DAY). Prompt en cache Anthropic (aicache.js : système + partie stable).
const aibudget = require('./aibudget');
const docanalysis = require('./docanalysis');
const crypto = require('crypto');
const db = require('../db');
const goals = require('./goals');
const subprojects = require('./subprojects');
const classify = require('./goalstaskclassify');
const weekplanner = require('./weekplanner');
const spellfix = require('./silentspellfix');

const MAX_DOC_CHARS = 12000;
const MAX_CHANGES = 30;
const WEEKS_AHEAD = 12;

db.exec(`CREATE TABLE IF NOT EXISTS change_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  target TEXT NOT NULL,
  targetId INTEGER NOT NULL,
  field TEXT NOT NULL,
  beforeValue TEXT,
  afterValue TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  resolvedAt TEXT
)`);
// 16 oct. 2026 : état coché/décoché mémorisé côté serveur (suit l'utilisateur d'un appareil à l'autre). Migration additive.
if (!db.prepare('PRAGMA table_info(change_proposals)').all().some((c) => c.name === 'checked')) {
  db.exec('ALTER TABLE change_proposals ADD COLUMN checked INTEGER NOT NULL DEFAULT 1');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_change_proposals_hash ON change_proposals(activityId, hash)');
db.exec('CREATE INDEX IF NOT EXISTS idx_change_proposals_act ON change_proposals(activityId, status)');

function setCaller(fn) { docanalysis.setCaller(fn); } // appelant injectable (tests), partagé avec documenttasks
function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }
function todayIso() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normText = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const FIELDS = {
  task: { date: 'date', text: 'text' },
  weekly: { time: 'time', instruction: 'instruction' },
};
const FIELD_LABEL = { date: 'Date', text: 'Texte', time: 'Temps estimé', instruction: 'Consigne' };

// ---------- Contexte ----------
function buildContext(userId, activityId) {
  const today = todayIso();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const monday = goals.mostRecentMonday(today);
  const horizonEnd = goals.addDays(monday, WEEKS_AHEAD * 7 + 6);
  const open = db.prepare(`SELECT i.id, i.label, i.dueDate, i.dueDateAuto, sp.goalCategory AS cat
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 ORDER BY i.dueDate, i.id LIMIT 80`).all(activityId);
  const done = db.prepare(`SELECT i.label, substr(i.doneAt,1,10) AS doneDay, sp.goalCategory AS cat
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 1 AND i.doneAt >= ? ORDER BY i.doneAt DESC LIMIT 40`).all(activityId, since);
  const weeklies = db.prepare(`SELECT w.id, w.text, w.description, w.estimateMinutes, w.estimateSource, w.weekIndex, p.startDate, p.category AS cat
    FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND w.carriedOverFromId IS NULL AND w.text != ''`).all(activityId)
    .map((w) => ({ ...w, weekStart: goals.addDays(w.startDate, (w.weekIndex - 1) * 7) }))
    .filter((w) => w.weekStart >= goals.addDays(monday, -7) && w.weekStart <= horizonEnd)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.id - b.id).slice(0, 60);
  let logs = [];
  try {
    logs = db.prepare('SELECT text, minutes, substr(createdAt,1,10) AS day FROM accomplishment_logs WHERE activityId = ? AND createdAt >= ? ORDER BY createdAt DESC LIMIT 30').all(activityId, since);
  } catch (e) { /* table absente : sans accomplissements */ }
  const cap = weekplanner.getWeeklyCapacity(userId);
  return { today, monday, horizonEnd, open, done, weeklies, logs, capacityMinutes: cap && cap.minutes ? cap.minutes : null };
}

const SYSTEM = docanalysis.SYSTEM; // prompt commun aux tâches et aux modifications proposées (docanalysis.js)

const strip = (s) => String(s == null ? '' : s).replace(/<\/?\s*(document|donnees)\s*>/gi, '');

// Deux parties : STABLE (données de l'activité : mises en cache) puis VARIABLE (document éventuel).
function buildUserParts(ctx, docText) {
  const lines = [];
  lines.push('Date du jour : ' + ctx.today + '. Capacité hebdomadaire : ' + (ctx.capacityMinutes ? ctx.capacityMinutes + ' min' : 'inconnue') + '.');
  lines.push('', '<donnees>', 'Tâches ouvertes (id | libellé | date) :');
  ctx.open.forEach((t) => lines.push(`${t.id} | ${strip(t.label)} | ${t.dueDate || '-'}`));
  lines.push('', 'Tâches terminées ces 14 derniers jours :');
  ctx.done.forEach((t) => lines.push(`${t.doneDay} | ${strip(t.label)}`));
  lines.push('', 'Accomplissements déclarés :');
  ctx.logs.forEach((l) => lines.push(`${l.day} | ${strip(l.text)}${l.minutes ? ' | ' + l.minutes + ' min' : ''}`));
  lines.push('', 'Objectifs hebdomadaires (id | semaine du | texte | temps estimé en min | consigne) :');
  ctx.weeklies.forEach((w) => lines.push(`${w.id} | ${w.weekStart} | ${strip(w.text)} | ${w.estimateMinutes == null ? '-' : w.estimateMinutes} | ${strip(w.description) || '-'}`));
  lines.push('</donnees>');
  return { stable: lines.join('\n'), variable: docText ? '<document>\n' + strip(docText).slice(0, MAX_DOC_CHARS) + '\n</document>' : '' };
}

function buildUser(ctx, docText) {
  const p = buildUserParts(ctx, docText);
  return p.variable ? p.stable + '\n\n' + p.variable : p.stable;
}

// ---------- Revalidation de la sortie IA ----------
function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// 16 oct. 2026 : une correction d'orthographe/grammaire/ponctuation n'est plus une proposition.
const SPELL_REASON = /orthograph|grammat|ponctuat|accord\b|accords|typograph|conjugaison|coquille|faute|accent|majuscule|espace/i;
function isSpellingOnly(field, before, after, reason) {
  if (field !== 'text' && field !== 'instruction') return false;
  if (!before) return false;
  // Motif donné par l'IA (« Correction orthographique/grammaticale… ») : correction, jamais proposée.
  if (reason && SPELL_REASON.test(String(reason))) return true;
  const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const a = fold(before), b = fold(after);
  if (a === b || spellfix.isPureSpellingFix(String(before), String(after))) return true;
  // Même suite de chiffres et écart minime de lettres (singulier/pluriel, accord, espace autour d'une barre…) : correction.
  const nums = (s) => (String(s).match(/\d+/g) || []).join(',');
  if (nums(before) === nums(after) && spellfix.editDistance(a, b) <= Math.max(2, Math.round(Math.max(a.length, b.length) * 0.06))) return true;
  return false;
}

// Ligne courte ["t"|"w"|"task"|"weekly", id, champ, après, raison] -> objet {target,id,field,after,reason} ; l'objet de l'ancien format passe tel quel.
function changeFromRow(r) {
  if (!Array.isArray(r)) return r;
  const tg = String(r[0]).toLowerCase();
  return { target: tg === 't' || tg === 'task' ? 'task' : tg === 'w' || tg === 'weekly' ? 'weekly' : null, id: r[1], field: r[2], after: r[3], reason: r[4] };
}

// Renvoie [{ target, targetId, field, before, after, reason }] — « avant » vient de la base, jamais de l'IA.
function validate(text, ctx) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
  const rows = j && (Array.isArray(j.c) ? j.c : Array.isArray(j.changes) ? j.changes : null); // format court {"c":[[cible,id,champ,après,raison]]} ou ancien {"changes":[{…}]}
  if (!rows) return null;
  const tasks = new Map(ctx.open.map((t) => [t.id, t]));
  const weeklies = new Map(ctx.weeklies.map((w) => [w.id, w]));
  const seen = new Set(), out = [];
  for (const c of rows.map(changeFromRow)) {
    if (out.length >= MAX_CHANGES) break;
    if (!c || typeof c !== 'object') continue;
    const target = c.target === 'task' || c.target === 'weekly' ? c.target : null;
    const field = target && FIELDS[target][c.field];
    const id = Number(c.id);
    if (!target || !field || !Number.isInteger(id)) continue;
    const reason = String(c.reason || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    let before, after;
    if (target === 'task') {
      const t = tasks.get(id); if (!t) continue;
      if (field === 'date') {
        // Date déjà passée : le report relève de l'avertissement de la page 2, jamais des « Modifications proposées ».
        if (t.dueDate && t.dueDate < ctx.today) continue;
        after = String(c.after || '').trim();
        if (!isRealDate(after) || after < ctx.today || after > ctx.horizonEnd) continue;
        before = t.dueDate || '';
      } else {
        after = String(c.after == null ? '' : c.after).replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!after) continue;
        before = t.label;
      }
    } else {
      const w = weeklies.get(id); if (!w) continue;
      if (field === 'time') {
        const n = Math.round(Number(c.after));
        if (!Number.isFinite(n) || n < 5 || n > 6000) continue;
        after = String(n); before = w.estimateMinutes == null ? '' : String(w.estimateMinutes);
      } else {
        after = String(c.after == null ? '' : c.after).trim().slice(0, 600);
        if (!after) continue;
        before = w.description || '';
      }
    }
    if (normText(before) === normText(after) && before === after) continue;
    if (before === after) continue;
    if (isSpellingOnly(field, before, after, c.reason)) continue; // correction orthographique : posée en silence, jamais proposée
    const key = target + '|' + id + '|' + field;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target, targetId: id, field, before, after, reason });
  }
  return out;
}

const hashOf = (c) => sha(c.target + '|' + c.targetId + '|' + c.field + '|' + normText(c.after));

function rowOut(r) {
  return { id: r.id, target: r.target, targetId: r.targetId, field: r.field, fieldLabel: FIELD_LABEL[r.field] || r.field, before: r.beforeValue || '', after: r.afterValue, reason: r.reason, checked: r.checked === 0 ? 0 : 1, label: r.label || '', createdAt: r.createdAt || '', forUserId: r.forUserId || null, forName: r.forName || '', mine: !!r.mine };
}

// Libellé lisible de la cible (tâche ou objectif) pour l'affichage.
// viewerId : l'utilisateur qui consulte ; « pour qui » = personne planifiée/assignée sur la cible, sinon celui qui a lancé la proposition.
function withLabels(rows, viewerId) {
  const task = db.prepare('SELECT label, plannedUserId AS uid FROM sub_project_items WHERE id = ?');
  const weekly = db.prepare('SELECT text, assignedUserId AS uid FROM goal_weekly WHERE id = ?');
  const user = db.prepare('SELECT name FROM users WHERE id = ?');
  return rows.map((r) => {
    const t = r.target === 'task' ? task.get(r.targetId) : weekly.get(r.targetId);
    const forUserId = (t && t.uid) || r.userId || null;
    const u = forUserId ? user.get(forUserId) : null;
    return rowOut({ ...r, label: t ? (t.label || t.text) : '', forUserId, forName: u ? u.name : '', mine: !!viewerId && forUserId === viewerId });
  });
}

function list(activityId, viewerId) {
  const today = todayIso();
  // Exclut les reports dont la cause est une date déjà passée (y compris les lignes déjà stockées).
  const rows = db.prepare("SELECT * FROM change_proposals WHERE activityId = ? AND status = 'pending' ORDER BY createdAt DESC, id DESC").all(activityId)
    .filter((r) => !(r.target === 'task' && r.field === 'date' && r.beforeValue && r.beforeValue < today))
    .filter((r) => !isSpellingOnly(r.field, r.beforeValue, r.afterValue, r.reason)); // corrections orthographiques déjà stockées : masquées
  return withLabels(rows, viewerId);
}

// Stocke des changements validés ('pending' uniquement) ; renvoie le nombre de nouvelles lignes.
function store(userId, activityId, changes) {
  const find = db.prepare('SELECT id FROM change_proposals WHERE activityId = ? AND hash = ?');
  const ins = db.prepare(`INSERT INTO change_proposals (activityId, userId, target, targetId, field, beforeValue, afterValue, reason, hash, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`);
  const now = new Date().toISOString();
  let added = 0;
  changes.forEach((c) => {
    const h = hashOf(c);
    if (find.get(activityId, h)) return; // déjà en attente, refusée (mémorisée) ou appliquée : jamais re-proposée
    ins.run(activityId, userId, c.target, c.targetId, c.field, c.before, c.after, c.reason, h, now);
    added++;
  });
  console.log(`[changeproposals] proposees=${changes.length} nouvelles=${added}`); // compteurs seulement
  return added;
}

// Section "c" d'une réponse fusionnée : revalide puis stocke. Réponse sans section exploitable => 0 (non bloquant).
function storeFromText(userId, activityId, text, ctx) {
  const changes = validate(text, ctx);
  return changes ? store(userId, activityId, changes) : 0;
}

// Génère des propositions seules (route manuelle ; la surveillance et « Ajouter des tâches » passent par l'appel fusionné de documenttasks).
// opts.docText : texte d'un document (donnée). Silencieux si l'IA est absente ou le plafond atteint.
// Retourne { added, capReached, configured }.
async function generate(userId, activityId, opts) {
  const o = opts || {};
  if (!docanalysis.hasCaller() && !classify.configured()) return { added: 0, configured: false };
  const ctx = buildContext(userId, activityId);
  if (!ctx.open.length && !ctx.weeklies.length) return { added: 0 };
  const drivesync = require('./drivesync'); // chargé à l'usage : drivesync dépend de documenttasks
  if (!drivesync.takeCall(userId)) return { added: 0, capReached: true };
  const want = { t: false, c: true };
  let out;
  try {
    const tctx = require('./documenttasks').buildContext(userId, activityId);
    const parts = docanalysis.buildParts(tctx, ctx, { instruction: '', doc: String(o.docText || '').slice(0, 24000), want });
    out = await docanalysis.call({ parts, want, feature: 'modifications-proposees' });
  } catch (e) { return e && e.aiBlocked ? { added: 0, aiBlocked: true, aiResumesOn: e.resumesOn, message: e.message } : { added: 0, failed: true }; }
  const changes = validate(out && out.text, ctx);
  if (!changes) return { added: 0, failed: true };
  return { added: store(userId, activityId, changes) };
}

// ---------- Application / refus ----------
function cleanIds(ids) {
  return Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : [];
}
function pendingRows(activityId, ids, onlyChecked) {
  const get = db.prepare("SELECT * FROM change_proposals WHERE id = ? AND activityId = ? AND status = 'pending'" + (onlyChecked ? ' AND checked = 1' : ''));
  return cleanIds(ids).map((id) => get.get(id, activityId)).filter(Boolean); // id hors activité / déjà traité : ignoré
}
// Mémorise l'état coché d'une proposition en attente (jamais de suppression automatique).
function setChecked(activityId, id, checked) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'Proposition invalide.');
  const r = db.prepare("UPDATE change_proposals SET checked = ? WHERE id = ? AND activityId = ? AND status = 'pending'").run(checked ? 1 : 0, n, activityId);
  if (!r.changes) throw httpError(404, 'Proposition introuvable.');
  return { id: n, checked: checked ? 1 : 0 };
}
function mark(id, status) {
  db.prepare('UPDATE change_proposals SET status = ?, resolvedAt = ? WHERE id = ?').run(status, new Date().toISOString(), id);
}

function applyOne(userId, activityId, r) {
  if (r.target === 'task') {
    const cur = db.prepare(`SELECT i.id, i.label, i.dueDate, i.done FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
      WHERE i.id = ? AND sp.activityId = ?`).get(r.targetId, activityId);
    if (!cur || cur.done) return 'tâche introuvable ou terminée';
    const now = r.field === 'date' ? (cur.dueDate || '') : cur.label;
    if (now !== (r.beforeValue || '')) return 'déjà modifiée depuis la proposition';
    // updateItem refuse une tâche verrouillée (403) ; une date modifiée repasse dueDateAuto à 0 (choix validé de l'utilisateur).
    subprojects.updateItem(r.targetId, r.field === 'date' ? { dueDate: r.afterValue } : { label: r.afterValue }, userId);
    return null;
  }
  const w = db.prepare(`SELECT w.*, p.category AS cat, p.periodNumber FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ? AND w.carriedOverFromId IS NULL`).get(r.targetId, activityId);
  if (!w) return 'objectif introuvable';
  const now = r.field === 'time' ? (w.estimateMinutes == null ? '' : String(w.estimateMinutes)) : (w.description || '');
  if (now !== (r.beforeValue || '')) return 'déjà modifié depuis la proposition';
  if (r.field === 'time') goals.setWeekly(activityId, w.cat, w.periodNumber, w.weekIndex, w.text, undefined, Number(r.afterValue));
  else goals.setWeekly(activityId, w.cat, w.periodNumber, w.weekIndex, w.text, r.afterValue);
  goals.recomputeForWeeklies([w.id]);
  return null;
}

// N'applique QUE les ids fournis (cochés). Une proposition non applicable est refusée (mémorisée) avec sa raison.
function apply(userId, activityId, ids) {
  const rows = pendingRows(activityId, ids, true); // une ligne décochée n'est jamais appliquée (et reste affichée)
  const applied = [], skipped = [];
  rows.forEach((r) => {
    let why;
    try { why = applyOne(userId, activityId, r); }
    catch (e) { why = e.statusCode ? e.message : 'erreur'; }
    if (why) { mark(r.id, 'dismissed'); skipped.push({ id: r.id, reason: why }); }
    else { mark(r.id, 'accepted'); applied.push(r.id); }
  });
  return { appliedCount: applied.length, appliedIds: applied, skipped };
}

function dismiss(activityId, ids) {
  const rows = pendingRows(activityId, ids);
  rows.forEach((r) => mark(r.id, 'dismissed'));
  return { dismissedCount: rows.length };
}

module.exports = { setChecked, list, generate, store, storeFromText, apply, dismiss, setCaller, validate, buildContext, buildUser, buildUserParts, SYSTEM, hashOf, isSpellingOnly };
