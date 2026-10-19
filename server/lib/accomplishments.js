// Accomplissements (lot C) : l'utilisateur écrit ce qu'il a fait
// (texte libre, minutes facultatives, fichiers texte joints). L'application
// PROPOSE des rapprochements (tâches non faites + objectifs hebdomadaires de la
// semaine) par similarité de mots (goals.tokenize/jaccard) — aucune IA, aucun
// texte inventé — puis n'applique QUE ce que l'utilisateur a validé.
//
// Garde-fous :
//  - estimateSource 'manual' (cibles saisies) jamais modifié ici ;
//  - aucun time_entry créé : le temps chronométré reste la seule source du
//    « temps réalisé » ; les minutes déclarées sont journalisées à part
//    (accomplishment_logs) et seul l'EXCÉDENT sur le chrono de la semaine est
//    signalé (pas de double compte) ;
//  - les pièces jointes ne sont pas stockées : seul leur texte (fichiers texte)
//    sert à l'aperçu.

const db = require('../db');
const goals = require('./goals');
const subprojects = require('./subprojects');
const timecaps = require('./timecaps');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('./attachments');

db.exec(`
CREATE TABLE IF NOT EXISTS accomplishment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  text TEXT NOT NULL,
  minutes INTEGER,
  itemIds TEXT NOT NULL DEFAULT '[]',
  weeklyIds TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accomplishment_logs_act ON accomplishment_logs(activityId, createdAt);
`);

const MIN_SCORE = 0.2;
const MAX_TEXT = 2000;
const MAX_ENTRIES = 20;
const TEXT_MIMES = /^(text\/|application\/json$)/;

function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function textFromAttachment(att) {
  const v = validateAttachmentPayload(att || {});
  if (v.error) throw httpError(400, v.error);
  const isText = TEXT_MIMES.test(v.mimeType) || /\.(txt|md|csv)$/i.test(v.fileName);
  if (!isText) return '';
  const comma = v.dataUrl.indexOf(',');
  const head = v.dataUrl.slice(0, comma);
  const body = v.dataUrl.slice(comma + 1);
  const raw = /;base64/i.test(head) ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body);
  return raw.slice(0, 20000);
}

// [{ text, minutes?, attachments? }] -> [{ index, text, minutes, matchText, filesCount }]
function normalizeEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) throw httpError(400, 'Écris au moins un accomplissement.');
  if (entries.length > MAX_ENTRIES) throw httpError(400, 'Trop d’accomplissements à la fois.');
  const out = [];
  entries.forEach((e, index) => {
    const text = String((e && e.text) || '').trim().slice(0, MAX_TEXT);
    const atts = Array.isArray(e && e.attachments) ? e.attachments : [];
    if (atts.length > MAX_ATTACHMENTS_PER_NOTE) throw httpError(400, `${MAX_ATTACHMENTS_PER_NOTE} fichiers maximum.`);
    const fromFiles = [];
    atts.forEach((a) => {
      const t = textFromAttachment(a).trim();
      if (t) fromFiles.push(t);
    });
    let minutes = null;
    if (e && e.minutes !== undefined && e.minutes !== null && e.minutes !== '') {
      const n = Math.round(Number(e.minutes));
      if (!Number.isFinite(n) || n < 0 || n > 1440) throw httpError(400, 'Minutes invalides (0 à 1440).');
      minutes = n;
    }
    const matchText = (text + ' ' + fromFiles.join(' ')).trim();
    if (!matchText) return;
    out.push({ index, text, minutes, matchText, filesCount: atts.length });
  });
  if (!out.length) throw httpError(400, 'Écris au moins un accomplissement.');
  return out;
}

function currentWeeklies(activityId) {
  const today = todayIso();
  const rows = db.prepare(`
    SELECT w.id, w.text, w.status, w.weekIndex, w.estimateSource, w.estimateMinutes, p.category, p.startDate
    FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND w.carriedOverFromId IS NULL AND TRIM(w.text) <> ''
  `).all(activityId);
  const out = [];
  rows.forEach((w) => {
    const b = goals.weekBounds(w.startDate, w.weekIndex);
    if (b.start <= today && today <= b.end) out.push({ ...w, weekStart: b.start, weekEnd: b.end });
  });
  return out;
}

function openTasks(activityId) {
  return db.prepare(`
    SELECT i.id, i.label, i.goalWeeklyId, sp.goalCategory AS category
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0
  `).all(activityId);
}

function bestMatches(tokens, candidates, limit) {
  return candidates
    .map((c) => ({ c, score: goals.jaccard(tokens, new Set(goals.tokenize(c.label))) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function preview(userId, activityId, entries) {
  const list = normalizeEntries(entries);
  const weeklies = currentWeeklies(activityId);
  const tasks = openTasks(activityId);
  const used = new Set();
  const results = list.map((e) => {
    const tokens = new Set(goals.tokenize(e.matchText));
    const taskMatches = bestMatches(tokens, tasks.filter((t) => !used.has(t.id)), 3)
      .map((x) => ({ itemId: x.c.id, label: x.c.label, category: x.c.category, goalWeeklyId: x.c.goalWeeklyId, score: Math.round(x.score * 100) / 100 }));
    if (taskMatches[0]) used.add(taskMatches[0].itemId);
    const weeklyMatches = bestMatches(tokens, weeklies.map((w) => ({ ...w, label: w.text })), 2)
      .map((x) => ({ weeklyId: x.c.id, text: x.c.text, category: x.c.category, status: x.c.status, score: Math.round(x.score * 100) / 100 }));
    return { index: e.index, text: e.text || '(texte des fichiers joints)', minutes: e.minutes, filesCount: e.filesCount, tasks: taskMatches, weeklies: weeklyMatches };
  });
  return { results };
}

// `validated` : [{ text, minutes?, itemIds: [], weeklyIds: [] }] — uniquement ce que l'utilisateur a coché.
function apply(userId, activityId, validated) {
  if (!Array.isArray(validated) || !validated.length) throw httpError(400, 'Rien à appliquer.');
  const myTasks = new Map(openTasks(activityId).map((t) => [t.id, t]));
  const myWeeklies = new Map(currentWeeklies(activityId).map((w) => [w.id, w]));
  const touched = new Set();
  const doneIds = [];
  const logs = [];
  let declared = 0;
  validated.forEach((v) => {
    const itemIds = (Array.isArray(v.itemIds) ? v.itemIds : []).map(Number).filter((id) => myTasks.has(id));
    const weeklyIds = (Array.isArray(v.weeklyIds) ? v.weeklyIds : []).map(Number).filter((id) => myWeeklies.has(id));
    itemIds.forEach((id) => {
      if (doneIds.includes(id)) return;
      subprojects.updateItem(id, { done: true }, userId); // recalcule déjà le statut des objectifs liés
      doneIds.push(id);
      if (myTasks.get(id).goalWeeklyId != null) touched.add(myTasks.get(id).goalWeeklyId);
    });
    weeklyIds.forEach((id) => touched.add(id));
    const minutes = v.minutes != null && v.minutes !== '' && Number(v.minutes) > 0 ? Math.round(Number(v.minutes)) : null;
    if (minutes) declared += minutes;
    if (itemIds.length || weeklyIds.length || minutes) logs.push({ text: String(v.text || '').slice(0, MAX_TEXT), minutes, itemIds, weeklyIds });
  });
  goals.recomputeForWeeklies([...touched]);
  const now = new Date().toISOString();
  const ins = db.prepare('INSERT INTO accomplishment_logs (activityId, userId, text, minutes, itemIds, weeklyIds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  logs.forEach((l) => ins.run(activityId, userId, l.text, l.minutes, JSON.stringify(l.itemIds), JSON.stringify(l.weeklyIds), now));

  // Pas de double compte : on compare au chrono de la semaine ; seul l'excédent
  // déclaré est signalé, rien n'est écrit dans le chrono.
  let timedMinutes = 0;
  const w0 = [...myWeeklies.values()][0];
  if (w0) {
    const cats = new Set([...myWeeklies.values()].map((w) => w.category));
    cats.forEach((c) => { try { timedMinutes += timecaps.minutesInRange(userId, activityId, c, w0.weekStart, w0.weekEnd); } catch (e) { /* non bloquant */ } });
  }
  const totalDeclaredWeek = db.prepare('SELECT COALESCE(SUM(minutes),0) AS m FROM accomplishment_logs WHERE activityId = ? AND userId = ? AND createdAt >= ?')
    .get(activityId, userId, w0 ? w0.weekStart : '0000').m;
  return {
    doneTaskIds: doneIds,
    updatedWeeklyIds: [...touched],
    declaredMinutes: declared,
    timedMinutes,
    extraMinutes: Math.max(0, totalDeclaredWeek - timedMinutes),
  };
}

module.exports = { preview, apply, normalizeEntries };
