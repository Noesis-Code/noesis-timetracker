// Ordre des colonnes de l'arbre des objectifs, par utilisateur (mode Étendre).
// ORDRE DE BASE : mémorisé dans objectifs_ordre (userId, level, scopeKey, orderJson, updatedAt), jamais modifié par un macro. Seul PUT /objectifs/ordre l'écrit
// (si la personne change plus tard l'ordre de base). level : activite | pole | secteur ; scopeKey : '' (activités), activityId (pôles d'une activité),
// activityId:poleKey (secteurs d'un pôle). Les colonnes absentes de la liste mémorisée viennent à la fin, dans l'ordre existant.
// ORDRE DE PRÉSENTATION : DÉRIVÉ à chaque lecture des LIENS DIRECTS de fusion (un macro = un lien ; objectifs.js liensDirects, source unique) : les colonnes de CHAQUE lien sont rendues voisines, donc aussi celles
// d'une chaîne (A-B puis B-D : A, B, D se suivent). Chaque lien se rassemble à la place de sa colonne ancre ; l'ordre relatif des autres colonnes est conservé. Fusion réversible : délier un lien (ou le supprimer)
// rend aux colonnes leur ordre de base ; aucune donnée de base n'est touchée. Colonne ancre = l'objectif touché (paramètre anchor), sinon la première du lien dans l'ordre courant.
// LIENS CROISÉS (impossible de garder voisines toutes les branches de tous les liens, ex. A-C, B-C et A-B ne tiennent pas côte à côte autrement qu'en triangle) : les liens sont traités par priorité, le plus proche d'aujourd'hui
// (le plus bas dans l'arbre) d'abord, puis le plus récent ; un lien ne peut pas défaire le voisinage d'un lien plus prioritaire : s'il n'y a aucune place qui les garde tous, il reste séparé (aucune donnée touchée).
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
// Clés des colonnes (du périmètre) reliées par chaque LIEN DIRECT du niveau, du plus prioritaire au moins prioritaire.
function groupsIn(userId, level, scope) {
  const sc = scopeOf(level, scope);
  const t = Date.parse(require('./dates').userToday() + 'T00:00:00Z'), dist = (g) => Math.abs(Date.parse(String(g.endDate) + 'T00:00:00Z') - t) || 0;
  // priorité : le lien le plus proche d'aujourd'hui (le plus bas), puis le plus récent (ordre stable, jamais d'erreur)
  return require('./objectifs').liensDirects(userId).filter((g) => g.level === level).sort((x, y) => dist(x) - dist(y) || y.id - x.id).map((g) => {
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
// Ordre de présentation = ordre de base réarrangé pour que les colonnes de chaque lien soient voisines (groups : du lien le plus prioritaire au moins prioritaire).
const contigu = (order, keys) => { const ix = keys.map((k) => order.indexOf(k)); return ix.every((i) => i >= 0) && Math.max(...ix) - Math.min(...ix) === keys.length - 1; };
function rassembler(order, members, a, inverse) { // les colonnes du lien en un bloc, à la place de `a` ; bloc dans l'ordre courant ou inversé
  const blk = inverse ? members.slice().reverse() : members, rest = order.filter((k) => !members.includes(k)), at = rest.filter((k) => order.indexOf(k) < order.indexOf(a)).length;
  return rest.slice(0, at).concat(blk, rest.slice(at));
}
function arrange(base, groups, anchor) {
  let order = base.slice();
  const tenus = []; // liens plus prioritaires déjà rendus voisins : jamais défaits par un lien suivant
  groups.forEach((keys) => {
    const members = order.filter((k) => keys.includes(k));
    if (members.length < 2) return;
    const as = (anchor != null && members.includes(String(anchor)) ? [String(anchor)] : []).concat(members), essais = [];
    as.forEach((a) => [false, true].forEach((inv) => essais.push(rassembler(order, members, a, inv))));
    const bon = essais.find((o) => contigu(o, members) && tenus.every((t) => contigu(o, t)));
    if (!bon) return; // aucune place ne garde voisins tous les liens plus prioritaires : ce lien reste séparé
    order = bon; tenus.push(members);
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
// COULEUR ATTRIBUÉE À LA PLACE (Émilien, 18 nov. 2026) : le rang de nuance d'un pôle dans l'arbre = sa place dans l'ordre de présentation (ordre de base réarrangé par les fusions), pas une propriété du pôle. Map clé -> rang ; null si illisible (repli : rang du serveur).
function placeRanks(userId, activityId) {
  try { const ord = orderFor(userId, 'pole', String(activityId)), m = new Map(); ord.forEach((k, i) => m.set(k, i)); return m; } catch (e) { return null; }
}
module.exports = { placeRanks, baseOrder, orderFor, lire, ecrire, forMacro, arrange };
