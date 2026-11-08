// Temps par membre d'une activité partagée : tableau de tous les temps (activité, pôles, membres) et historique continu
// des changements de temps prévu (décisions d'Émilien, 8 nov. 2026 ; docs/objectifs/creation-objectif-tache.md).
// - Temps passé : heures par semaine, moyenne des 4 dernières semaines (28 jours), secteurs remontés au pôle.
// - Temps prévu d'un PÔLE = la capacité hebdo de la Feuille de route (goal_capacity_overrides, lue par la planification) :
//   le tableau la lit et l'écrit, chaque changement garde aussi sa ligne d'historique (member_time_changes).
//   Activité avec pôles : prévu = somme des pôles ; sans pôle : dernière ligne d'historique.
// - Responsables : server/lib/responsables.js (propriétaire + ajoutés, égaux, valables pour tous les pôles et secteurs).
// - Le membre modifié par quelqu'un d'autre reçoit une notification (avant → après, par qui).
// Calcul sans IA. Tables additives, idempotentes.
const db = require('../db');
const goals = require('./goals');
const { isActivityMember } = require('./subprojects');
const responsables = require('./responsables');

db.exec(`
CREATE TABLE IF NOT EXISTS member_time_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  poleKey TEXT,
  memberId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changedBy TEXT NOT NULL,
  beforeMin INTEGER,
  afterMin INTEGER NOT NULL,
  origin TEXT NOT NULL,
  fromActivityId INTEGER,
  fromPoleKey TEXT,
  withMemberId TEXT,
  groupId INTEGER,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_time_changes ON member_time_changes(activityId, at);
`);

// Origines d'un changement : s'ajoute · pris sur une autre activité (son propre temps seulement) ·
// pris sur un autre pôle ou secteur de la même activité · échangé entre responsables (total constant).
const ORIGINS = ['ajout', 'autre-activite', 'meme-activite', 'echange'];
const ORIGIN_LABELS = { ajout: "S'ajoute", 'autre-activite': 'Pris sur une autre activité', 'meme-activite': 'Pris sur un autre pôle ou secteur', echange: 'Échangé entre responsables' };
const WEEKS = 4;
const MAX_MIN = 168 * 60;

// Responsables : module unique server/lib/responsables.js (activity_managers), jamais dupliqué ici.
function isResponsable(activityId, userId) { return !!userId && responsables.isManager(userId, Number(activityId)); }
function responsablesFor(activityId) {
  const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(Number(activityId));
  const ids = db.prepare('SELECT userId FROM activity_managers WHERE activityId = ?').all(Number(activityId)).map((r) => r.userId);
  if (a && a.ownerId && !ids.includes(a.ownerId)) ids.unshift(a.ownerId);
  return ids;
}

// Clé de pôle normalisée : null = l'activité entière ; un secteur remonte à son pôle (règle verrouillée).
function normPole(activityId, key) {
  if (key === null || key === undefined || key === '') return null;
  return goals.resolveToPole(Number(activityId), String(key));
}
function validPole(activityId, key) {
  if (key === null) return true;
  return (goals.categoriesForActivity(Number(activityId)) || []).some((p) => p.key === key);
}
function hasPoles(activityId) { return (goals.categoriesForActivity(Number(activityId)) || []).length > 0; }
function plannedMin(activityId, poleKey, memberId) {
  if (poleKey !== null) {
    const cap = db.prepare('SELECT weeklyMinutes FROM goal_capacity_overrides WHERE activityId = ? AND category = ? AND userId = ?').get(Number(activityId), poleKey, memberId);
    if (cap) return cap.weeklyMinutes;
  } else if (hasPoles(activityId)) {
    const vals = goals.categoriesForActivity(Number(activityId)).map((p) => plannedMin(activityId, p.key, memberId)).filter((v) => v !== null);
    return vals.length ? vals.reduce((x, y) => x + y, 0) : null;
  }
  const row = db.prepare(`SELECT afterMin FROM member_time_changes WHERE activityId = ? AND memberId = ? AND poleKey IS ? ORDER BY id DESC LIMIT 1`)
    .get(Number(activityId), memberId, poleKey);
  return row ? row.afterMin : null;
}

function fmtMin(m) {
  if (m === null || m === undefined) return '—';
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? h + ' h ' + String(r).padStart(2, '0') : h ? h + ' h' : r + ' min';
}

function userName(id) { const u = db.prepare('SELECT name FROM users WHERE id = ?').get(id); return u ? u.name : '?'; }

function insertLine(o, groupId, at) {
  const before = plannedMin(o.activityId, o.poleKey, o.memberId);
  const info = db.prepare(`INSERT INTO member_time_changes (activityId, poleKey, memberId, changedBy, beforeMin, afterMin, origin, fromActivityId, fromPoleKey, withMemberId, groupId, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(Number(o.activityId), o.poleKey, o.memberId, o.changedBy, before, o.afterMin, o.origin,
    o.fromActivityId || null, o.fromPoleKey === undefined ? null : o.fromPoleKey, o.withMemberId || null, groupId, at);
  // Feuille de route : la capacité hebdo du membre sur ce pôle prend la nouvelle valeur.
  if (o.poleKey !== null) {
    db.prepare(`INSERT INTO goal_capacity_overrides (activityId, category, userId, weeklyMinutes, updatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(activityId, category, userId) DO UPDATE SET weeklyMinutes = excluded.weeklyMinutes, updatedAt = excluded.updatedAt`).run(Number(o.activityId), o.poleKey, o.memberId, o.afterMin, at);
  }
  return { id: Number(info.lastInsertRowid), before };
}

// Change le temps prévu (minutes par semaine) d'un membre, à un niveau (activité ou pôle).
// opts : { activityId, poleKey, memberId, changedBy, afterMin, origin, fromActivityId?, fromPoleKey?, withMemberId? }
// La contrepartie est écrite dans le même lot : « pris sur » retire le même écart à la source, « échangé » le retire à l'autre membre.
function changePlanned(opts, notify) {
  const activityId = Number(opts.activityId);
  const by = opts.changedBy, memberId = opts.memberId;
  const origin = ORIGINS.includes(opts.origin) ? opts.origin : null;
  const afterMin = Math.round(Number(opts.afterMin));
  if (!origin) return { status: 400, error: 'Origine inconnue.' };
  if (!Number.isFinite(afterMin) || afterMin < 0 || afterMin > MAX_MIN) return { status: 400, error: 'Temps invalide.' };
  if (!db.prepare('SELECT 1 FROM activities WHERE id = ?').get(activityId)) return { status: 404, error: 'Activité introuvable.' };
  if (!isActivityMember(by, activityId)) return { status: 403, error: "Tu n'es pas membre de cette activité." };
  if (!isActivityMember(memberId, activityId)) return { status: 403, error: "Cette personne n'est pas membre de cette activité." };
  if (by !== memberId && !isResponsable(activityId, by)) return { status: 403, error: 'Seul un responsable modifie le temps d\'un autre membre.' };
  const poleKey = normPole(activityId, opts.poleKey);
  if (!validPole(activityId, poleKey)) return { status: 400, error: 'Pôle inconnu.' };
  if (poleKey === null && hasPoles(activityId)) return { status: 400, error: 'Le temps prévu se règle par pôle.' };
  const before = plannedMin(activityId, poleKey, memberId) || 0;
  const delta = afterMin - before;

  const lines = [];
  if (origin === 'autre-activite') {
    if (by !== memberId) return { status: 403, error: 'Pris sur une autre activité : seulement pour son propre temps.' };
    const src = Number(opts.fromActivityId);
    if (!Number.isInteger(src) || src === activityId || !isActivityMember(memberId, src)) return { status: 400, error: 'Activité source invalide.' };
    if (hasPoles(src)) return { status: 400, error: 'Activité source avec pôles : choisis le pôle depuis son propre tableau.' };
    lines.push({ activityId: src, poleKey: null, memberId, afterMin: Math.max(0, (plannedMin(src, null, memberId) || 0) - delta) });
  } else if (origin === 'meme-activite') {
    const fromPole = normPole(activityId, opts.fromPoleKey);
    if (fromPole === poleKey || !validPole(activityId, fromPole)) return { status: 400, error: 'Pôle source invalide.' };
    lines.push({ activityId, poleKey: fromPole, memberId, afterMin: Math.max(0, (plannedMin(activityId, fromPole, memberId) || 0) - delta) });
  } else if (origin === 'echange') {
    if (!isResponsable(activityId, by)) return { status: 403, error: 'Réservé aux responsables.' };
    const other = opts.withMemberId;
    if (!other || other === memberId || !isActivityMember(other, activityId)) return { status: 400, error: 'Membre de l\'échange invalide.' };
    lines.push({ activityId, poleKey, memberId: other, afterMin: Math.max(0, (plannedMin(activityId, poleKey, other) || 0) - delta) });
  }

  const at = new Date().toISOString();
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const out = tx(() => {
    const main = insertLine({ activityId, poleKey, memberId, changedBy: by, afterMin, origin,
      fromActivityId: origin === 'autre-activite' ? Number(opts.fromActivityId) : null,
      fromPoleKey: origin === 'meme-activite' ? normPole(activityId, opts.fromPoleKey) : null,
      withMemberId: origin === 'echange' ? opts.withMemberId : null }, null, at);
    db.prepare('UPDATE member_time_changes SET groupId = ? WHERE id = ?').run(main.id, main.id);
    const extra = lines.map((l) => Object.assign(insertLine(Object.assign({ changedBy: by, origin }, l,
      origin === 'echange' ? { withMemberId: memberId } : origin === 'meme-activite' ? { fromPoleKey: poleKey } : { fromActivityId: activityId }), main.id, at), l));
    return { main, extra };
  });

  // Notification au(x) membre(s) modifié(s) par quelqu'un d'autre (avant → après, par qui).
  const send = notify || defaultNotify;
  const targets = [{ activityId, poleKey, memberId, before: out.main.before, afterMin }].concat(out.extra.map((e) => ({ activityId: e.activityId, poleKey: e.poleKey, memberId: e.memberId, before: e.before, afterMin: e.afterMin })));
  targets.forEach((t) => { if (t.memberId !== by) { try { send(t, by); } catch (e) { /* une notification ne bloque jamais l'écriture */ } } });
  return { ok: true, id: out.main.id };
}

function levelLabel(activityId, poleKey) {
  if (poleKey === null) { const a = db.prepare('SELECT name FROM activities WHERE id = ?').get(Number(activityId)); return a ? a.name : ''; }
  return goals.categoryLabelFor(Number(activityId), poleKey) || poleKey;
}

function defaultNotify(t, by) {
  const push = require('./push');
  push.sendToUsers([t.memberId], {
    module: 'notifications',
    title: 'Temps prévu modifié',
    body: levelLabel(t.activityId, t.poleKey) + ' : ' + fmtMin(t.before) + ' → ' + fmtMin(t.afterMin) + ' par semaine, par ' + userName(by),
    tag: 'member-time-' + t.activityId + '-' + (t.poleKey || ''),
    url: '/?notif=member-time&activityId=' + t.activityId,
  });
}

// Temps passé : minutes par semaine, moyenne des 4 dernières semaines ; clé « membre|pôle » (pôle vide = non rattaché).
function pastMinutes(activityId, todayIso) {
  const end = todayIso || new Date().toISOString().slice(0, 10);
  const d = new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (WEEKS * 7 - 1));
  const start = d.toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT userId, goalCategory AS cat, SUM(durationSeconds) AS s FROM time_entries
    WHERE activityId = ? AND isoDate BETWEEN ? AND ? GROUP BY userId, goalCategory`).all(Number(activityId), start, end);
  const byPole = new Map(), byMember = new Map(), byCat = new Map();
  rows.forEach((r) => {
    const m = (r.s || 0) / 60 / WEEKS;
    byMember.set(r.userId, (byMember.get(r.userId) || 0) + m);
    if (r.cat) { const kc = r.userId + '|' + r.cat; byCat.set(kc, (byCat.get(kc) || 0) + m); }
    const p = r.cat ? normPole(activityId, r.cat) : null;
    if (p) { const k = r.userId + '|' + p; byPole.set(k, (byPole.get(k) || 0) + m); }
  });
  return { byPole, byMember, byCat, start, end };
}

// Tableau complet + historique, pour un membre de l'activité.
function tableFor(activityId, callerId, todayIso) {
  activityId = Number(activityId);
  const act = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  if (!act) return { status: 404, error: 'Activité introuvable.' };
  if (!isActivityMember(callerId, activityId)) return { status: 403, error: "Tu n'es pas membre de cette activité." };
  const members = db.prepare(`SELECT m.userId, m.color, u.name FROM activity_members m JOIN users u ON u.id = m.userId
    WHERE m.activityId = ? ORDER BY m.joinedAt ASC`).all(activityId);
  const resp = responsablesFor(activityId);
  const past = pastMinutes(activityId, todayIso);
  const poles = (goals.categoriesForActivity(activityId) || []).map((p) => ({ key: p.key, label: p.label }));
  const row = (poleKey, m) => {
    const pm = poleKey === null ? past.byMember.get(m.userId) : past.byPole.get(m.userId + '|' + poleKey);
    return { userId: m.userId, pastMin: Math.round(pm || 0), plannedMin: plannedMin(activityId, poleKey, m.userId) };
  };
  const levels = [{ key: null, label: act.name }].concat(poles).map((l) => {
    const rows = members.map((m) => row(l.key, m));
    const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
    return { key: l.key, label: l.label, rows, pastMin: sum('pastMin'), plannedMin: rows.some((r) => r.plannedMin !== null) ? sum('plannedMin') : null };
  });
  // Barres (8 nov. 2026) : temps travaillé par membre pour l'activité, chaque pôle (secteurs compris) et chaque secteur.
  const barRows = (map, key) => members.map((m) => ({ userId: m.userId, pastMin: Math.round(map.get(m.userId + '|' + key) || 0) }));
  const bars = [{ key: null, label: act.name, kind: 'activite', rows: members.map((m) => ({ userId: m.userId, pastMin: Math.round(past.byMember.get(m.userId) || 0) })) }];
  poles.forEach((p) => {
    bars.push({ key: p.key, label: p.label, kind: 'pole', rows: barRows(past.byPole, p.key) });
    (goals.secteursForPole(activityId, p.key) || []).forEach((s) => bars.push({ key: s.key, label: s.label, kind: 'secteur', rows: barRows(past.byCat, s.key) }));
  });
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const nameOf = (id) => names.get(id) || userName(id);
  const history = db.prepare('SELECT * FROM member_time_changes WHERE activityId = ? ORDER BY id DESC LIMIT 300').all(activityId).map((h) => ({
    id: h.id, at: h.at, level: levelLabel(activityId, h.poleKey), poleKey: h.poleKey,
    memberId: h.memberId, member: nameOf(h.memberId), changedBy: h.changedBy, by: nameOf(h.changedBy),
    beforeMin: h.beforeMin, afterMin: h.afterMin, origin: h.origin, originLabel: ORIGIN_LABELS[h.origin] || h.origin,
    from: h.origin === 'autre-activite' && h.fromActivityId ? levelLabel(h.fromActivityId, null) : h.origin === 'meme-activite' && h.fromPoleKey ? levelLabel(activityId, h.fromPoleKey) : null,
    withMember: h.withMemberId ? nameOf(h.withMemberId) : null,
    requested: h.changedBy !== h.memberId,
    counterpart: !!h.groupId && h.groupId !== h.id, // ligne de contrepartie : le temps part VERS « from »
  }));
  return {
    activity: { id: act.id, name: act.name },
    weeks: WEEKS, from: past.start, to: past.end,
    members: members.map((m) => ({ userId: m.userId, name: m.name, color: m.color, responsable: resp.includes(m.userId) })),
    isResponsable: resp.includes(callerId),
    me: callerId,
    plannedByPole: poles.length > 0, // le prévu se règle par pôle (Feuille de route) ; sinon au niveau de l'activité
    levels,
    bars,
    history,
    requested: history.filter((h) => h.requested),
  };
}

module.exports = { ORIGINS, ORIGIN_LABELS, isResponsable, responsablesFor, changePlanned, plannedMin, pastMinutes, tableFor, fmtMin };
