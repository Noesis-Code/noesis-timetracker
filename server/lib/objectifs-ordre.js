// Ordre des colonnes de l'arbre des objectifs, par utilisateur (mode Étendre).
// ORDRE DE BASE : mémorisé dans objectifs_ordre (userId, level, scopeKey, orderJson, updatedAt), jamais modifié par un macro. Seul PUT /objectifs/ordre l'écrit
// (si la personne change plus tard l'ordre de base). level : activite | pole | secteur ; scopeKey : '' (activités), activityId (pôles d'une activité),
// activityId:poleKey (secteurs d'un pôle). Les colonnes absentes de la liste mémorisée viennent à la fin, dans l'ordre existant.
// ORDRE DE PRÉSENTATION : DÉRIVÉ à chaque lecture des macros existants : les colonnes reliées par un même groupe de macros (macros enchaînés compris) sont rendues voisines
// (le groupe se rassemble à la place de la colonne ancre, l'ordre relatif des autres colonnes est conservé). Fusion réversible : délier un macro (ou le supprimer)
// rend aux colonnes leur ordre de base ; aucune donnée de base n'est touchée. Colonne ancre = l'objectif touché (paramètre anchor), sinon la première du groupe dans l'ordre de base.
const db = require('../db');
const goals = require('./goals');

db.exec(`CREATE TABLE IF NOT EXISTS objectifs_ordre (
  userId TEXT NOT NULL,
  level TEXT NOT NULL,
  scopeKey TEXT NOT NULL,
  orderJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (userId, level, scopeKey)
)`);

const LEVELS = ['activite', 'pole', 'secteur'];
function err(msg, code) { return Object.assign(new Error(msg), { statusCode: code || 400 }); }

// Colonnes existantes du périmètre, dans l'ordre existant (clés texte).
function existingColumns(userId, level, scope) {
  if (level === 'activite') {
    return db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1 ORDER BY COALESCE(m.position, 0), a.id').all(userId).map((r) => String(r.id));
  }
  if (level === 'pole') {
    const aid = Number(scope);
    if (!Number.isInteger(aid) || !db.prepare('SELECT 1 FROM activity_members WHERE userId = ? AND activityId = ?').get(userId, aid)) throw err('Activité introuvable.', 404);
    return goals.categoriesForActivity(aid).map((p) => p.key);
  }
  const m = /^(\d+):(.+)$/.exec(String(scope || ''));
  if (!m || !db.prepare('SELECT 1 FROM activity_members WHERE userId = ? AND activityId = ?').get(userId, Number(m[1]))) throw err('Pôle introuvable.', 404);
  if (!goals.categoriesForActivity(Number(m[1])).some((p) => p.key === m[2])) throw err('Pôle introuvable.', 404);
  return goals.secteursForPole(Number(m[1]), m[2]).map((s) => s.key);
}
function checkLevel(level) { if (!LEVELS.includes(level)) throw err('Niveau invalide (activite, pole ou secteur).'); }
function scopeOf(level, scope) { return level === 'activite' ? '' : String(scope == null ? '' : scope); }

// Ordre de base : mémorisé (colonnes encore existantes) puis les colonnes non mémorisées, dans l'ordre existant.
function baseOrder(userId, level, scope) {
  checkLevel(level);
  const sc = scopeOf(level, scope), all = existingColumns(userId, level, sc);
  const row = db.prepare('SELECT orderJson FROM objectifs_ordre WHERE userId = ? AND level = ? AND scopeKey = ?').get(userId, level, sc);
  let saved = []; try { saved = JSON.parse((row && row.orderJson) || '[]'); } catch (e) { saved = []; }
  const known = saved.filter((k) => all.includes(k));
  return known.concat(all.filter((k) => !known.includes(k)));
}
// Clés des colonnes (du périmètre) reliées par chaque groupe de macros du niveau.
function groupsIn(userId, level, scope) {
  const sc = scopeOf(level, scope);
  return require('./objectifs').macroGroups(userId).filter((g) => g.level === level).map((g) => {
    const keys = [];
    g.columns.forEach((c) => {
      let k = null;
      if (level === 'activite') k = String(c.activityId);
      else if (level === 'pole' && String(c.activityId) === sc) k = c.poleKey;
      else if (level === 'secteur' && sc === c.activityId + ':' + c.poleKey) k = c.categoryKey;
      if (k != null && !keys.includes(k)) keys.push(k);
    });
    return keys;
  }).filter((keys) => keys.length > 1);
}
// Ordre de présentation = ordre de base réarrangé pour que les colonnes reliées soient voisines.
function arrange(base, groups, anchor) {
  let order = base.slice();
  groups.forEach((keys) => {
    const members = order.filter((k) => keys.includes(k));
    if (members.length < 2) return;
    const a = anchor != null && members.includes(String(anchor)) ? String(anchor) : members[0];
    const next = [];
    order.forEach((k) => { if (!members.includes(k)) next.push(k); else if (k === a) next.push(...members); });
    order = next;
  });
  return order;
}
function orderFor(userId, level, scope, anchor) {
  checkLevel(level);
  return arrange(baseOrder(userId, level, scope), groupsIn(userId, level, scopeOf(level, scope)), anchor);
}
// GET /objectifs/ordre?level=&scope=&anchor= : { order: ordre de présentation, base: ordre de base }
function lire(userId, level, scope, anchor) {
  checkLevel(level);
  const base = baseOrder(userId, level, scope);
  return { level, scope: scopeOf(level, scope), base, order: arrange(base, groupsIn(userId, level, scopeOf(level, scope)), anchor) };
}
// PUT /objectifs/ordre { level, scope, order[] } : mémorise l'ORDRE DE BASE ; les colonnes doivent appartenir à l'utilisateur.
function ecrire(userId, body) {
  const level = body && body.level; checkLevel(level);
  const sc = scopeOf(level, body.scope), all = existingColumns(userId, level, sc);
  if (!Array.isArray(body.order)) throw err('Ordre invalide.');
  const order = [...new Set(body.order.map(String))];
  const stranger = order.find((k) => !all.includes(k));
  if (stranger !== undefined) throw err('Colonne inconnue : « ' + stranger + ' ».', 404);
  db.prepare(`INSERT INTO objectifs_ordre (userId, level, scopeKey, orderJson, updatedAt) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(userId, level, scopeKey) DO UPDATE SET orderJson = excluded.orderJson, updatedAt = excluded.updatedAt`).run(userId, level, sc, JSON.stringify(order), new Date().toISOString());
  return lire(userId, level, sc);
}
// Pour un macro : périmètre et ordre de présentation dérivé (aucune écriture), en ancrant sur la colonne touchée.
function forMacro(userId, columns, anchorKey) {
  if (!columns || !columns.length) return null;
  const level = columns[0].level;
  let scope = '';
  if (level === 'pole') { if (new Set(columns.map((c) => c.activityId)).size > 1) return null; scope = String(columns[0].activityId); }
  if (level === 'secteur') { if (new Set(columns.map((c) => c.activityId + ':' + c.poleKey)).size > 1) return null; scope = columns[0].activityId + ':' + columns[0].poleKey; }
  try { return { orderLevel: level, orderScope: scope, order: orderFor(userId, level, scope, anchorKey) }; } catch (e) { return null; }
}
module.exports = { baseOrder, orderFor, lire, ecrire, forMacro, arrange };
