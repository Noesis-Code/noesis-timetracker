// RÉPARTITION DES TÂCHES PAR MEMBRE, partie base de données (18 nov. 2026, décision d'Émilien). Le calcul pur est dans repartition-parts.js (testé sans base).
// Une part en pour cent par membre, PAR CATÉGORIE (activité '_', pôle, secteur), posée dans la gestion des catégories, juste après la Stratégie ; seulement pour une activité à PLUSIEURS membres.
// Héritage : sans réponse, la catégorie reprend celle du dessus. Quand une part change, l'app PROPOSE (jamais silencieusement) d'ajuster les autres ; chaque ligne se valide une à une, un refus est mémorisé.
// Les parts décident ensuite le responsable des tâches rangées (taches-responsable.js). Aucune donnée existante n'est touchée (task_share_wanted reste lue en repli).
const db = require('../db');
const P = require('./repartition-parts');

db.exec(`CREATE TABLE IF NOT EXISTS category_shares (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pct INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (activityId, key, userId)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS category_share_refusals (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  signature TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (activityId, signature)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS task_share_pct (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pct INTEGER NOT NULL,
  PRIMARY KEY (activityId, userId)
)`); // ancien bloc « Part des tâches (%) » : table gardée (lecture pour la migration), même définition que bilan.js

try { db.exec('ALTER TABLE category_shares ADD COLUMN hours REAL'); } catch (e) { /* colonne déjà là */ } // 19 nov. 2026 : heures par semaine de chaque membre (le pourcentage en est calculé) ; NULL = parts sans heures (anciennes données, lignes acceptées)

db.exec('CREATE TABLE IF NOT EXISTS task_share_pct_migre (activityId INTEGER PRIMARY KEY)');

const storeKey = (key) => (key === '_' || key == null ? '' : String(key));
const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });

function membres(activityId) {
  return db.prepare('SELECT u.id AS userId, u.name AS name FROM activity_members am JOIN users u ON u.id = am.userId WHERE am.activityId = ? ORDER BY COALESCE(am.position, 0), am.joinedAt, u.id').all(activityId);
}
function tableHours(activityId) {
  const out = {};
  db.prepare('SELECT key, userId, hours FROM category_shares WHERE activityId = ? AND hours IS NOT NULL').all(activityId).forEach((r) => { (out[r.key] = out[r.key] || {})[r.userId] = r.hours; });
  return out;
}
function tableOwn(activityId) {
  const out = {};
  db.prepare('SELECT key, userId, pct FROM category_shares WHERE activityId = ?').all(activityId).forEach((r) => { (out[r.key] = out[r.key] || {})[r.userId] = r.pct; });
  return out;
}
// Arbre de l'activité pour le calcul pur : activité '', pôles, secteurs ; minutes = temps alloué (somme des allocations des membres, aujourd'hui).
function noeuds(activityId) {
  const goals = require('./goals'), own = tableOwn(activityId), ms = membres(activityId), nodes = [];
  let alloc = null; try { alloc = require('./allocation'); } catch (e) { alloc = null; }
  const today = new Date().toISOString().slice(0, 10);
  const minutes = (spec) => { let t = 0; if (alloc) ms.forEach((m) => { try { const e = alloc.effective(m.userId, Object.assign({ activityId }, spec), today); if (e && e.minutes > 0) t += e.minutes; } catch (e) { /* sans allocation */ } }); return t; };
  nodes.push({ key: '', label: (db.prepare('SELECT name FROM activities WHERE id = ?').get(activityId) || {}).name || '', parent: null, minutes: minutes({ level: 'activite' }), own: own[''] || null });
  (goals.categoriesForActivity(activityId) || []).forEach((p) => {
    nodes.push({ key: p.key, label: p.label, parent: '', minutes: minutes({ level: 'pole', poleKey: p.key }), own: own[p.key] || null });
    (goals.secteursForPole(activityId, p.key) || []).forEach((s) => { nodes.push({ key: s.key, label: s.label, parent: p.key, minutes: minutes({ level: 'secteur', poleKey: p.key, categoryKey: s.key }), own: own[s.key] || null }); });
  });
  return nodes;
}
const ids = (activityId) => membres(activityId).map((m) => m.userId);
const signature = (key, apres) => storeKey(key) + '|' + Object.keys(apres).sort().map((u) => u + ':' + apres[u]).join(',');

function ecrire(activityId, key, shares, hours) {
  const k = storeKey(key), now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM category_shares WHERE activityId = ? AND key = ?').run(activityId, k);
    if (shares) Object.keys(shares).forEach((u) => db.prepare('INSERT INTO category_shares (activityId, key, userId, pct, updatedAt, hours) VALUES (?, ?, ?, ?, ?, ?)').run(activityId, k, u, shares[u], now, hours && hours[u] != null ? hours[u] : null));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function valider(activityId, shares) {
  const ms = ids(activityId);
  if (ms.length < 2) throw bad('La répartition existe seulement pour une activité à plusieurs membres.');
  if (!shares || typeof shares !== 'object') throw bad('Parts invalides.');
  const out = {};
  Object.keys(shares).forEach((u) => { if (!ms.includes(u)) throw bad('Membre inconnu.'); const v = Math.round(Number(shares[u])); if (!Number.isFinite(v) || v < 0 || v > 100) throw bad('Une part va de 0 à 100 %.'); out[u] = v; });
  ms.forEach((u) => { if (out[u] == null) out[u] = 0; });
  if (ms.reduce((s, u) => s + out[u], 0) !== 100) throw bad('Les parts font 100 % au total.');
  return out;
}

// Heures saisies -> { hours (1 décimale), shares (pour cent, total 100) } ; au moins une heure > 0.
function depuisHeures(activityId, hours) {
  const ms = ids(activityId);
  if (ms.length < 2) throw bad('La répartition existe seulement pour une activité à plusieurs membres.');
  if (!hours || typeof hours !== 'object') throw bad('Heures invalides.');
  const h = {};
  Object.keys(hours).forEach((u) => { if (!ms.includes(u)) throw bad('Membre inconnu.'); const v = Number(String(hours[u]).replace(',', '.')); if (!Number.isFinite(v) || v < 0) throw bad('Heures invalides.'); h[u] = Math.round(v * 10) / 10; });
  ms.forEach((u) => { if (h[u] == null) h[u] = 0; });
  const total = ms.reduce((s, u) => s + h[u], 0); if (!(total > 0)) throw bad('Le total des heures doit être supérieur à 0.');
  const brut = {}; ms.forEach((u) => { brut[u] = h[u] * 100 / total; });
  return { hours: h, shares: P.round100(brut, ms) };
}

// Lecture d'une catégorie : parts propres, parts en vigueur (héritées sinon), moyenne calculée des sous-catégories ; heures propres / héritées ; pour un pôle sans heures, le temps prévu déjà saisi (member-times) en repli.
function lire(activityId, key, userId) {
  migrerPartsSaisies(activityId);
  const nodes = noeuds(activityId), ms = membres(activityId), k = storeKey(key), me = nodes.find((n) => n.key === k);
  const eff = P.effective(nodes, k), cal = P.computed(nodes, k, ms.map((m) => m.userId));
  const round = (o) => (o ? P.round100(o, ms.map((m) => m.userId)) : null);
  const th = tableHours(activityId), ownHours = th[k] || null, effHours = eff && eff.origin !== k ? (th[eff.origin] || null) : null;
  let planned = null;
  if (!ownHours && me && me.parent === '' && userId) { // niveau pôle : le temps prévu par semaine déjà saisi (Temps prévu, retiré de la fiche) initialise les heures
    try { const t = require('./tempsmembres').tableFor(activityId, userId), lv = ((t && t.levels) || []).find((l) => l.key === k), o = {}; ((lv && lv.rows) || []).forEach((r) => { if (r.plannedMin > 0) o[r.userId] = Math.round(r.plannedMin / 6) / 10; }); if (Object.keys(o).length) planned = o; } catch (e) { planned = null; }
  }
  return { multi: ms.length > 1, membres: ms, hours: ownHours, effectiveHours: effHours, plannedHours: planned, own: me && me.own ? me.own : null, effective: eff ? eff.shares : null, origine: eff ? (eff.origin === k ? 'propre' : (eff.origin === '' ? 'activité' : 'pôle')) : null, calculee: round(cal) };
}

// Pose (ou efface, shares null) les parts d'une catégorie, puis calcule l'équilibrage : { lecture, proposition: { statut, lignes, suggestion } } ; les lignes déjà refusées ne reviennent pas.
function poser(activityId, key, shares, hours, userId) {
  const k = storeKey(key);
  if (hours != null) { const d = depuisHeures(activityId, hours); ecrire(activityId, k, d.shares, d.hours); shares = d.shares; } // heures + pourcentages calculés
  else if (shares == null) ecrire(activityId, k, null); else ecrire(activityId, k, valider(activityId, shares));
  const nodes = noeuds(activityId), ms = ids(activityId);
  const prop = shares == null ? { statut: 'rien', lignes: [] } : P.ajuster(nodes, ms, k);
  const refus = new Set(db.prepare('SELECT signature FROM category_share_refusals WHERE activityId = ?').all(activityId).map((r) => r.signature));
  const nom = (key) => (nodes.find((n) => n.key === key) || {}).label || '';
  const lignes = (prop.lignes || []).filter((l) => !refus.has(signature(l.key, l.apres))).map((l) => Object.assign({ nom: nom(l.key) }, l));
  return { lecture: lire(activityId, k, userId), proposition: { statut: prop.statut === 'proposition' && !lignes.length ? 'ok' : prop.statut, lignes } };
}
// Lignes ACCEPTÉES une à une : [{ key, apres }] ; chacune est écrite telle que montrée. Refusées : mémorisées pour ne pas être reproposées.
function appliquer(activityId, userId, acceptees, refusees) {
  (Array.isArray(acceptees) ? acceptees : []).forEach((l) => {
    const k = storeKey(l && l.key);
    if (k && !require('./goals').isValidCategoryOrSecteurForActivity(activityId, k)) throw bad('Catégorie introuvable.');
    ecrire(activityId, k, valider(activityId, l && l.apres));
  });
  const now = new Date().toISOString();
  (Array.isArray(refusees) ? refusees : []).forEach((l) => {
    try { db.prepare('INSERT OR IGNORE INTO category_share_refusals (activityId, signature, userId, createdAt) VALUES (?, ?, ?, ?)').run(activityId, signature(l && l.key, valider(activityId, l && l.apres)), userId, now); } catch (e) { /* ligne invalide ignorée */ }
  });
  return { ok: true };
}

// Pour l'attribution des tâches : parts en vigueur d'une catégorie (secteur, sinon pôle, sinon activité) ou null sans part.
function partsEnVigueur(activityId, categoryKey, poleKey) {
  try {
    const nodes = noeuds(activityId);
    const e = P.effective(nodes, categoryKey && nodes.some((n) => n.key === categoryKey) ? categoryKey : (poleKey && nodes.some((n) => n.key === poleKey) ? poleKey : ''));
    return e ? e.shares : null;
  } catch (err) { return null; }
}

// Parts DEMANDÉES de l'activité (niveau « _ ») : lues par la comparaison du Bilan (« Proportion réelle contre demandée »). null sans répartition posée.
function partsActivite(activityId) { return tableOwn(activityId)[''] || null; }
// Migration sans perte (19 nov. 2026) : l'ancien bloc « Part des tâches (%) » (task_share_pct) est fusionné dans la Répartition des tâches. Sans répartition au niveau « _ », les parts déjà saisies y sont copiées
// (ramenées à 100 % si leur total était inférieur) ; la table d'origine n'est jamais effacée. Retourne true si une copie a eu lieu.
function migrerPartsSaisies(activityId) {
  try {
    const ms = ids(activityId); if (ms.length < 2 || partsActivite(activityId) || db.prepare('SELECT 1 FROM task_share_pct_migre WHERE activityId = ?').get(activityId)) return false;
    const rows = db.prepare('SELECT userId, pct FROM task_share_pct WHERE activityId = ?').all(activityId).filter((r) => ms.includes(r.userId) && r.pct > 0);
    const total = rows.reduce((s, r) => s + r.pct, 0); if (!total) return false;
    const brut = {}; rows.forEach((r) => { brut[r.userId] = r.pct * 100 / total; });
    ecrire(activityId, '', P.round100(brut, ms)); db.prepare('INSERT OR IGNORE INTO task_share_pct_migre (activityId) VALUES (?)').run(activityId); return true; // marqué : « Reprendre celle du dessus » ne ressuscite pas l'ancienne saisie
  } catch (e) { return false; }
}
function migrerToutes() { try { db.prepare('SELECT DISTINCT activityId FROM task_share_pct').all().forEach((r) => migrerPartsSaisies(r.activityId)); } catch (e) { /* table absente : rien à migrer */ } }

module.exports = { lire, poser, appliquer, partsEnVigueur, membres, noeuds, signature, partsActivite, migrerPartsSaisies, migrerToutes };
