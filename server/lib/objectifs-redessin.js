// Redessin des objectifs ENFANTS d'un parent (12 nov. 2026, décision d'Émilien) : fenêtre « Modifications proposées » entre l'étape Temps et le dernier panneau.
// Quand la création d'un objectif prend la place d'un enfant AUTOMATIQUE (créé par le plan proposé, meta.inferieur), les enfants automatiques du MÊME parent se redessinent : leurs périodes sont
// réattribuées dans l'ordre. Les objectifs ÉCRITS par la personne et les cases passées ne bougent JAMAIS ; seuls les enfants de PREMIER niveau du parent sont concernés. Rien n'est écrit ici.
// Cases d'un parent : annuel -> 13 périodes de son année ; périodique -> 4 semaines ; pluriannuel -> les années de son bloc.
const db = require('../db');
const O = require('./objectifs');
const T = require('./objectifs-trou');
const crypto = require('crypto');

const CHILD_TYPE = { pluriannuel: 'annuel', annuel: 'periodique', periodique: 'hebdomadaire' };
const parseMeta = (r) => { try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } };

// ---- Noyau pur : rows = [{ id, kind: 'auto' | 'you' | 'new', a (case avant, null pour un ajout), p (case après), locked }] ; n = nombre de cases ; les cases 1-based ----
const isMovable = (r) => r.kind === 'auto' && !r.locked;
function occupiedBy(rows, except) { const s = new Set(); rows.forEach((r) => { if (r !== except && !isMovable(r) && r.p != null) s.add(r.p); }); return s; }
// Redessin initial : chaque enfant automatique garde sa case si elle est libre, sinon prend la prochaine case libre APRÈS la précédente ; à défaut, les cases libres lui sont réparties dans l'ordre.
function redessiner(rows, n) {
  const out = rows.map((r) => Object.assign({}, r, { p: r.kind === 'auto' && !r.locked ? null : (r.p != null ? r.p : r.a) }));
  const fixed = occupiedBy(out), autos = out.filter(isMovable).sort((x, y) => x.a - y.a), used = new Set(fixed);
  const free = []; for (let c = 1; c <= n; c += 1) if (!fixed.has(c)) free.push(c);
  let prev = 0, ok = true;
  autos.forEach((r) => { let c = Math.max(r.a, prev + 1); while (c <= n && used.has(c)) c += 1; if (c > n) { ok = false; return; } r.p = c; used.add(c); prev = c; });
  if (!ok) { autos.forEach((r, i) => { r.p = free[i] != null ? free[i] : null; }); } // pas assez de place après : compaction dans les cases libres (au plus autant de lignes que de cases)
  return out;
}
// Glisser-déposer : les cases des lignes mobiles sont réattribuées DANS L'ORDRE de la liste (ordre = ids de haut en bas).
function reorder(rows, orderIds) {
  const mov = rows.filter(isMovable), slots = mov.map((r) => r.p).sort((a, b) => a - b), byId = new Map(rows.map((r) => [String(r.id), r]));
  const order = orderIds.map(String).filter((id) => byId.has(id) && isMovable(byId.get(id)));
  const next = new Map(); order.forEach((id, i) => next.set(id, slots[i]));
  return rows.map((r) => (next.has(String(r.id)) ? Object.assign({}, r, { p: next.get(String(r.id)) }) : r));
}
// « Place » : une ligne mobile prend une case libre ; refusé (null) si la case est prise, passée, ou la ligne n'est pas mobile.
function place(rows, id, cell, n, minCell) {
  const r = rows.find((x) => String(x.id) === String(id));
  if (!r || !isMovable(r) || !Number.isInteger(cell) || cell < Math.max(1, minCell || 1) || cell > n) return null;
  if (rows.some((x) => x !== r && x.p === cell)) return null;
  return rows.map((x) => (x === r ? Object.assign({}, x, { p: cell }) : x));
}
const moved = (r) => r.kind === 'auto' && !r.locked && r.a !== r.p;

// ---- Cases du parent ----
function cellsOf(parent) {
  const t = T.typeOfRow(parent);
  if (t === 'annuel') { const y = O.gridOf(parent.endDate).year; return { level: 'periode', cells: Array.from({ length: 13 }, (_, k) => T.periodCell(y * 13 + k)) }; }
  if (t === 'periodique') { const ps = O.periodStartOf(parent.endDate); return { level: 'semaine', cells: Array.from({ length: 4 }, (_, k) => T.weekCell(O.addDays(ps, 7 * k))) }; }
  if (t === 'pluriannuel') { const y0 = Number(parent.endDate.slice(0, 4)) - 4; return { level: 'annee', cells: Array.from({ length: 5 }, (_, k) => T.yearCell(y0 + k)) }; }
  return null;
}
const indexOf = (cells, iso) => { const i = cells.findIndex((c) => iso >= c.start && iso <= c.endDate); return i < 0 ? null : i + 1; };

// ---- Refus mémorisé : MÊME mécanisme que « Modifications proposées » (table change_proposals, clé unique activité + hash, statut 'dismissed') : un redessin refusé n'est jamais re-proposé à l'identique ----
const hashOf = (parentId, endDate, rows) => crypto.createHash('sha256').update('redessin|' + parentId + '|' + endDate + '|' + rows.filter((r) => r.id !== 0).map((r) => r.id + ':' + r.p).sort().join(',')).digest('hex');
function isDismissed(activityId, hash) { require('./changeproposals'); /* crée la table partagée */ return !!db.prepare("SELECT 1 FROM change_proposals WHERE activityId = ? AND hash = ? AND status = 'dismissed'").get(activityId, hash); }
function refuser(userId, body) {
  require('./changeproposals');
  const parent = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(body && body.parentId), userId);
  if (!parent || !O.isDay(body.endDate)) throw Object.assign(new Error('Objectif introuvable.'), { statusCode: 404 });
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 20).map((r) => ({ id: Number(r.id), p: Number(r.p) })), now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO change_proposals (activityId, userId, target, targetId, field, beforeValue, afterValue, reason, hash, status, createdAt, resolvedAt) VALUES (?, ?, 'redessin', ?, 'plan', NULL, ?, '', ?, 'dismissed', ?, ?)")
    .run(parent.activityId, userId, parent.id, JSON.stringify(rows), hashOf(parent.id, body.endDate, rows), now, now);
  return { ok: true };
}

// ---- Application (après la création de l'objectif, à « Terminer ») : déplace SEULEMENT les enfants automatiques, jamais un écrit, jamais une case passée ; chaque case finale est unique ----
function appliquer(userId, body, today) {
  const parent = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(body && body.parentId), userId);
  if (!parent) throw Object.assign(new Error('Objectif introuvable.'), { statusCode: 404 });
  const geo = cellsOf(parent); if (!geo) return { moved: [] };
  const want = new Map((Array.isArray(body.rows) ? body.rows : []).slice(0, 20).map((r) => [Number(r.id), { p: Number(r.p), hoursPerWeek: r.hoursPerWeek != null ? Number(r.hoursPerWeek) : null }]));
  const kids = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND parentId = ? AND isMacro = 0').all(userId, parent.id).filter((r) => !parseMeta(r).abandoned);
  const final = new Map(); // id -> case finale
  kids.forEach((k) => { const a = indexOf(geo.cells, k.endDate); if (a != null) final.set(k.id, a); });
  const plan = [];
  want.forEach((w, id) => {
    const k = kids.find((x) => x.id === id); if (!k) return;
    const a = indexOf(geo.cells, k.endDate), isAuto = !!parseMeta(k).inferieur;
    if (!isAuto || a == null || geo.cells[a - 1].endDate < today || k.status === 'atteint') return; // écrit par la personne ou passé : jamais touché
    if (!Number.isInteger(w.p) || w.p < 1 || w.p > geo.cells.length || geo.cells[w.p - 1].endDate < today) throw Object.assign(new Error('Case indisponible.'), { statusCode: 400 });
    final.set(id, w.p); plan.push({ k, p: w.p, hpw: w.hoursPerWeek });
  });
  const seen = new Set(); final.forEach((p) => { if (seen.has(p)) throw Object.assign(new Error('Deux objectifs dans la même case.'), { statusCode: 400 }); seen.add(p); });
  const moved = [];
  plan.sort((x, y) => x.p - y.p).forEach((x) => {
    if (indexOf(geo.cells, x.k.endDate) !== x.p) { O.modifierEcheance(userId, x.k.id, geo.cells[x.p - 1].endDate); moved.push(x.k.id); }
    if (x.hpw != null && x.hpw > 0 && x.hpw <= 168) O.parametres(userId, x.k.id, { hoursPerWeek: x.hpw });
  });
  return { moved };
}

// ---- Proposition : body { parentId, endDate (de l'objectif créé), title, type } -> { needed, level, cells, rows } ----
function proposer(userId, body, today) {
  const none = { needed: false, rows: [], cells: [] };
  const parent = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(body && body.parentId), userId);
  if (!parent || !O.isDay(body.endDate)) return none;
  const geo = cellsOf(parent); if (!geo) return none;
  if (CHILD_TYPE[T.typeOfRow(parent)] !== body.type) return none; // l'objectif créé n'est pas un enfant de premier niveau de ce parent
  const newCell = indexOf(geo.cells, body.endDate); if (newCell == null) return none;
  const kids = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND parentId = ? AND isMacro = 0').all(userId, parent.id).filter((r) => !parseMeta(r).abandoned);
  const rows = [];
  kids.forEach((r) => {
    const a = indexOf(geo.cells, r.endDate); if (a == null) return;
    const m = parseMeta(r), past = geo.cells[a - 1].endDate < today || r.status === 'atteint';
    rows.push({ id: r.id, title: r.title, kind: m.inferieur ? 'auto' : 'you', a, p: a, locked: past, hoursPerWeek: m.hoursPerWeek != null ? Number(m.hoursPerWeek) : null });
  });
  rows.push({ id: 0, title: String(body.title || ''), kind: 'new', a: null, p: newCell, locked: false, hoursPerWeek: null });
  const out = redessiner(rows, geo.cells.length);
  const needed = out.some(moved) && !isDismissed(parent.activityId, hashOf(parent.id, body.endDate, out));
  return { needed, level: geo.level, cells: geo.cells.map((c, i) => ({ n: i + 1, label: c.label, start: c.start, endDate: c.endDate })), minCell: Math.max(1, (geo.cells.findIndex((c) => c.endDate >= today) + 1) || 1), rows: needed ? out.map((r) => Object.assign({}, r, { moved: moved(r) })) : [] };
}

module.exports = { redessiner, reorder, place, moved, cellsOf, proposer, refuser, appliquer, hashOf, CHILD_TYPE };
