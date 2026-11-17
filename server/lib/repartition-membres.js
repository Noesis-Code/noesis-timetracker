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

const storeKey = (key) => (key === '_' || key == null ? '' : String(key));
const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });

function membres(activityId) {
  return db.prepare('SELECT u.id AS userId, u.name AS name FROM activity_members am JOIN users u ON u.id = am.userId WHERE am.activityId = ? ORDER BY COALESCE(am.position, 0), am.joinedAt, u.id').all(activityId);
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

function ecrire(activityId, key, shares) {
  const k = storeKey(key), now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM category_shares WHERE activityId = ? AND key = ?').run(activityId, k);
    if (shares) Object.keys(shares).forEach((u) => db.prepare('INSERT INTO category_shares (activityId, key, userId, pct, updatedAt) VALUES (?, ?, ?, ?, ?)').run(activityId, k, u, shares[u], now));
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

// Lecture d'une catégorie : parts propres, parts en vigueur (héritées sinon), moyenne calculée des sous-catégories.
function lire(activityId, key) {
  const nodes = noeuds(activityId), ms = membres(activityId), k = storeKey(key), me = nodes.find((n) => n.key === k);
  const eff = P.effective(nodes, k), cal = P.computed(nodes, k, ms.map((m) => m.userId));
  const round = (o) => (o ? P.round100(o, ms.map((m) => m.userId)) : null);
  return { multi: ms.length > 1, membres: ms, own: me && me.own ? me.own : null, effective: eff ? eff.shares : null, origine: eff ? (eff.origin === k ? 'propre' : (eff.origin === '' ? 'activité' : 'pôle')) : null, calculee: round(cal) };
}

// Pose (ou efface, shares null) les parts d'une catégorie, puis calcule l'équilibrage : { lecture, proposition: { statut, lignes, suggestion } } ; les lignes déjà refusées ne reviennent pas.
function poser(activityId, key, shares) {
  const k = storeKey(key);
  if (shares == null) ecrire(activityId, k, null); else ecrire(activityId, k, valider(activityId, shares));
  const nodes = noeuds(activityId), ms = ids(activityId);
  const prop = shares == null ? { statut: 'rien', lignes: [] } : P.ajuster(nodes, ms, k);
  const refus = new Set(db.prepare('SELECT signature FROM category_share_refusals WHERE activityId = ?').all(activityId).map((r) => r.signature));
  const nom = (key) => (nodes.find((n) => n.key === key) || {}).label || '';
  const lignes = (prop.lignes || []).filter((l) => !refus.has(signature(l.key, l.apres))).map((l) => Object.assign({ nom: nom(l.key) }, l));
  const suggestion = prop.suggestion && !refus.has(signature(prop.suggestion.key, prop.suggestion.apres)) ? Object.assign({ nom: nom(prop.suggestion.key) }, prop.suggestion) : null;
  return { lecture: lire(activityId, k), proposition: { statut: prop.statut === 'proposition' && !lignes.length ? 'ok' : (prop.statut === 'impossible' && !suggestion ? 'rien' : prop.statut), lignes, suggestion } };
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

module.exports = { lire, poser, appliquer, partsEnVigueur, membres, noeuds, signature };
