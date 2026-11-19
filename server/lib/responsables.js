// Responsables d'une activité (8 nov. 2026, décision d'Émilien) : le propriétaire (activities.ownerId) et les responsables ajoutés.
// Un responsable d'activité l'est aussi de tous ses pôles et secteurs (un seul niveau stocké : l'activité). Tous sont égaux :
// ils peuvent modifier directement le temps prévu de n'importe quel membre, propriétaire compris. Seuls les membres de l'activité peuvent être responsables.
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS activity_managers (
  activityId INTEGER NOT NULL,
  userId TEXT NOT NULL,
  addedBy TEXT,
  addedAt TEXT NOT NULL,
  PRIMARY KEY (activityId, userId)
)`);

// Migration sans perte (S6), UNE seule fois : la première version du tableau des temps créait `activity_responsables`. Ses lignes sont COPIÉES ici (membres seulement,
// jamais écrasées), puis l'ancienne table est RENOMMÉE `activity_responsables_migre` (conservée, jamais supprimée) : elle ne peut pas ressusciter un responsable retiré plus tard.
function migrerAncienneTable() {
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'activity_responsables'").get()) return 0;
    const r = db.prepare(`INSERT OR IGNORE INTO activity_managers (activityId, userId, addedBy, addedAt)
      SELECT o.activityId, o.userId, o.addedBy, o.addedAt FROM activity_responsables o
      WHERE EXISTS (SELECT 1 FROM activity_members m WHERE m.activityId = o.activityId AND m.userId = o.userId)`).run();
    db.exec('ALTER TABLE activity_responsables RENAME TO activity_responsables_migre');
    return Number(r.changes) || 0;
  } catch (e) { console.error('[responsables] migration', e.message); return 0; }
}
migrerAncienneTable();

function err(code, msg) { const e = new Error(msg); e.statusCode = code; return e; }
function activity(activityId) {
  const a = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ? AND active = 1').get(Number(activityId));
  if (!a) throw err(404, 'Activité introuvable.');
  return a;
}
function isMember(userId, activityId) { return !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId); }
function isManager(userId, activityId) {
  const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(Number(activityId));
  if (!a) return false;
  return a.ownerId === userId || (isMember(userId, Number(activityId)) && !!db.prepare('SELECT 1 FROM activity_managers WHERE activityId = ? AND userId = ?').get(Number(activityId), userId)); // un ancien membre (exclu ou parti) n'est plus responsable
}
// Identifiants des responsables (propriétaire en tête) : source unique, utilisée par server/lib/tempsmembres.js.
function ids(activityId) {
  const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(Number(activityId));
  const list = db.prepare('SELECT g.userId FROM activity_managers g JOIN activity_members m ON m.activityId = g.activityId AND m.userId = g.userId WHERE g.activityId = ? ORDER BY g.addedAt, g.userId').all(Number(activityId)).map((r) => r.userId);
  if (a && a.ownerId) return [a.ownerId].concat(list.filter((x) => x !== a.ownerId));
  return list;
}
function lister(userId, activityId) {
  const a = activity(activityId);
  if (!isMember(userId, a.id)) throw err(403, 'Tu ne fais pas partie de cette activité.');
  const mgr = new Set(db.prepare('SELECT userId FROM activity_managers WHERE activityId = ?').all(a.id).map((r) => r.userId));
  const members = db.prepare('SELECT u.id, u.name FROM activity_members m JOIN users u ON u.id = m.userId WHERE m.activityId = ? ORDER BY m.joinedAt, u.name').all(a.id)
    .map((u) => ({ id: u.id, name: u.name, owner: u.id === a.ownerId, manager: u.id === a.ownerId || mgr.has(u.id) }));
  return { activityId: a.id, name: a.name, members, canManage: isManager(userId, a.id), isOwner: a.ownerId === userId };
}
function ajouter(userId, activityId, targetId) {
  const a = activity(activityId);
  if (!isManager(userId, a.id)) throw err(403, 'Seul un responsable peut ajouter un responsable.');
  if (!isMember(String(targetId), a.id)) throw err(400, 'Seul un membre de l’activité peut être responsable.');
  db.prepare('INSERT OR IGNORE INTO activity_managers (activityId, userId, addedBy, addedAt) VALUES (?, ?, ?, ?)').run(a.id, String(targetId), userId, new Date().toISOString());
  return lister(userId, a.id);
}
function retirer(userId, activityId, targetId) {
  const a = activity(activityId);
  if (!isManager(userId, a.id)) throw err(403, 'Seul un responsable peut retirer un responsable.');
  if (a.ownerId === String(targetId)) throw err(400, 'Le propriétaire reste toujours responsable.');
  if (a.ownerId !== userId) throw err(403, 'Seul le propriétaire peut retirer un responsable de l’activité (deux responsables de même niveau ne se retirent pas entre eux).');
  db.prepare('DELETE FROM activity_managers WHERE activityId = ? AND userId = ?').run(a.id, String(targetId));
  return lister(userId, a.id);
}
// ---- Responsable d'une CATÉGORIE (pôle ou secteur), décision d'Émilien du 13-14 nov. 2026 : un seul responsable par catégorie, avec héritage (secteur -> son pôle -> responsables de l'activité). 17 nov. 2026 ----
// 18 nov. 2026 : PLUSIEURS responsables par catégorie (clé primaire = activité + catégorie + personne). Migration sans perte (S6), une seule fois : l'ancienne table (un seul responsable par catégorie)
// est copiée puis renommée `category_managers_migre` (conservée, jamais supprimée).
(function migrerCategoryManagers() {
  try {
    const cols = db.prepare('PRAGMA table_info(category_managers)').all();
    if (cols.length && cols.filter((c) => c.pk > 0).length === 2) {
      db.exec('ALTER TABLE category_managers RENAME TO category_managers_migre');
      db.exec('CREATE TABLE category_managers (activityId INTEGER NOT NULL, categoryKey TEXT NOT NULL, userId TEXT NOT NULL, setBy TEXT, setAt TEXT NOT NULL, PRIMARY KEY (activityId, categoryKey, userId))');
      db.exec('INSERT OR IGNORE INTO category_managers (activityId, categoryKey, userId, setBy, setAt) SELECT activityId, categoryKey, userId, setBy, setAt FROM category_managers_migre');
    }
  } catch (e) { console.error('[responsables] migration categories', e.message); }
})();
db.exec(`CREATE TABLE IF NOT EXISTS category_managers (
  activityId INTEGER NOT NULL,
  categoryKey TEXT NOT NULL,
  userId TEXT NOT NULL,
  setBy TEXT,
  setAt TEXT NOT NULL,
  PRIMARY KEY (activityId, categoryKey, userId)
)`);
// Responsable effectif : propre à la catégorie, sinon celui de son pôle (poleKey), sinon le propriétaire de l'activité (les autres responsables d'activité le restent aussi, voir ids()).
function categorie(userId, activityId, categoryKey, poleKey) {
  const a = activity(activityId);
  if (!isMember(userId, a.id)) throw err(403, 'Tu ne fais pas partie de cette activité.');
  const get = (k) => k ? db.prepare('SELECT userId FROM category_managers WHERE activityId = ? AND categoryKey = ? ORDER BY setAt, userId').get(a.id, String(k)) : null;
  const own = get(categoryKey), up = !own && poleKey && poleKey !== categoryKey ? get(poleKey) : null;
  const uid = own ? own.userId : up ? up.userId : a.ownerId;
  const inherited = !own;
  const name = db.prepare('SELECT name FROM users WHERE id = ?').get(uid);
  return { activityId: a.id, categoryKey: String(categoryKey), userId: uid, name: name ? name.name : '', inherited, from: own ? 'categorie' : up ? 'pole' : 'activite', canManage: isManager(userId, a.id) };
}
function definirCategorie(userId, activityId, categoryKey, targetId, poleKey) {
  const a = activity(activityId);
  if (!isManager(userId, a.id)) throw err(403, 'Seul un responsable peut choisir le responsable d’une catégorie.');
  if (targetId == null || targetId === '') { db.prepare('DELETE FROM category_managers WHERE activityId = ? AND categoryKey = ?').run(a.id, String(categoryKey)); return categorie(userId, a.id, categoryKey, poleKey); } // retour à l'héritage
  if (!isMember(String(targetId), a.id)) throw err(400, 'Seul un membre de l’activité peut être responsable.');
  db.prepare('DELETE FROM category_managers WHERE activityId = ? AND categoryKey = ?').run(a.id, String(categoryKey)); // un seul responsable choisi par cette ancienne route
  db.prepare('INSERT OR REPLACE INTO category_managers (activityId, categoryKey, userId, setBy, setAt) VALUES (?, ?, ?, ?, ?)').run(a.id, String(categoryKey), String(targetId), userId, new Date().toISOString());
  return categorie(userId, a.id, categoryKey, poleKey);
}
// ---- Fiche d'une catégorie : LISTE des responsables, avec hiérarchie (18 nov. 2026, décision d'Émilien) ----
// Niveaux : propriétaire (4) > activité (3) > pôle (2) > secteur (1). Le propriétaire est responsable à tous les niveaux, jamais retirable. Un responsable d'un niveau est responsable de tous les niveaux en dessous.
// Retirer : seulement par un niveau STRICTEMENT supérieur (deux responsables de même niveau ne se retirent pas). Ajouter : pour un niveau inférieur au sien ; les responsables d'activité (et le propriétaire)
// peuvent aussi ajouter au niveau de l'activité (comportement antérieur conservé). Voir la fiche : seulement les responsables de cette catégorie ou d'un niveau supérieur.
const RANG = { secteur: 1, pole: 2, activite: 3 };
function niveauDe(a, key) {
  if (key == null || key === '' || key === '_') return { niveau: 'activite', key: '_' };
  let pole = null;
  try { pole = require('./goals').parentKeyFor(a.id, String(key)) || null; } catch (e) { pole = null; }
  return pole ? { niveau: 'secteur', key: String(key), poleKey: pole } : { niveau: 'pole', key: String(key) };
}
function aLigne(a, k, userId) { return !!db.prepare('SELECT 1 FROM category_managers WHERE activityId = ? AND categoryKey = ? AND userId = ?').get(a.id, k, userId); }
function rangSur(userId, a, n) {
  if (a.ownerId === userId) return 4;
  if (!isMember(userId, a.id)) return 0;
  if (db.prepare('SELECT 1 FROM activity_managers WHERE activityId = ? AND userId = ?').get(a.id, userId)) return 3;
  if (n.niveau === 'pole') return aLigne(a, n.key, userId) ? 2 : 0;
  if (n.niveau === 'secteur') return aLigne(a, n.poleKey, userId) ? 2 : aLigne(a, n.key, userId) ? 1 : 0;
  return 0;
}
function etat(userId, a, n) {
  const moi = rangSur(userId, a, n), propre = RANG[n.niveau], entrees = new Map();
  const mettre = (id, rang) => { if (id !== a.ownerId && !isMember(id, a.id)) return; const e = entrees.get(id); if (!e || e.rang < rang) entrees.set(id, { rang }); };
  mettre(a.ownerId, 4);
  db.prepare('SELECT userId FROM activity_managers WHERE activityId = ? ORDER BY addedAt, userId').all(a.id).forEach((r) => mettre(r.userId, 3));
  const lignes = (k) => db.prepare('SELECT userId FROM category_managers WHERE activityId = ? AND categoryKey = ? ORDER BY setAt, userId').all(a.id, k).map((r) => r.userId);
  if (n.niveau === 'pole') lignes(n.key).forEach((u) => mettre(u, 2));
  if (n.niveau === 'secteur') { lignes(n.poleKey).forEach((u) => mettre(u, 2)); lignes(n.key).forEach((u) => mettre(u, 1)); }
  const nom = (id) => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || '';
  const ordre = [...entrees.entries()].sort((x, y) => y[1].rang - x[1].rang);
  const peutAjouter = moi > 0 && (moi >= 3 || moi > propre);
  const responsables = ordre.map(([id, e]) => ({ id, name: nom(id), owner: id === a.ownerId, rang: e.rang, removable: id !== a.ownerId && e.rang === propre && moi > propre }));
  const candidats = peutAjouter ? db.prepare('SELECT u.id, u.name FROM activity_members m JOIN users u ON u.id = m.userId WHERE m.activityId = ? ORDER BY m.joinedAt, u.name').all(a.id).filter((u) => !entrees.has(u.id)).map((u) => ({ id: u.id, name: u.name })) : [];
  return { activityId: a.id, key: n.key, niveau: n.niveau, canOpen: moi > 0, canAdd: peutAjouter, responsables, candidates: candidats, moi, propre };
}
function listeCategorie(userId, activityId, key) {
  const a = activity(activityId);
  if (!isMember(userId, a.id)) throw err(403, 'Tu ne fais pas partie de cette activité.');
  const s = etat(userId, a, niveauDe(a, key));
  if (!s.canOpen) return { activityId: a.id, key: s.key, niveau: s.niveau, canOpen: false, canAdd: false, responsables: [], candidates: [] };
  return s;
}
function ajouterCategorie(userId, activityId, key, targetId) {
  const a = activity(activityId), n = niveauDe(a, key), s = etat(userId, a, n);
  if (!isMember(userId, a.id)) throw err(403, 'Tu ne fais pas partie de cette activité.');
  if (!s.canAdd) throw err(403, 'Seul un responsable d’un niveau supérieur peut ajouter un responsable ici.');
  if (!isMember(String(targetId), a.id)) throw err(400, 'Seul un membre de l’activité peut être responsable.');
  if (s.responsables.some((r) => r.id === String(targetId))) throw err(400, 'Cette personne est déjà responsable ici.');
  const now = new Date().toISOString();
  if (n.niveau === 'activite') db.prepare('INSERT OR IGNORE INTO activity_managers (activityId, userId, addedBy, addedAt) VALUES (?, ?, ?, ?)').run(a.id, String(targetId), userId, now);
  else db.prepare('INSERT OR IGNORE INTO category_managers (activityId, categoryKey, userId, setBy, setAt) VALUES (?, ?, ?, ?, ?)').run(a.id, n.key, String(targetId), userId, now);
  return listeCategorie(userId, a.id, key);
}
function retirerCategorie(userId, activityId, key, targetId) {
  const a = activity(activityId), n = niveauDe(a, key), s = etat(userId, a, n);
  if (!isMember(userId, a.id)) throw err(403, 'Tu ne fais pas partie de cette activité.');
  if (a.ownerId === String(targetId)) throw err(400, 'Le propriétaire reste toujours responsable.');
  const cible = s.responsables.find((r) => r.id === String(targetId));
  if (!cible || !cible.removable) throw err(403, 'Seul un responsable d’un niveau supérieur peut retirer ce responsable.');
  if (n.niveau === 'activite') db.prepare('DELETE FROM activity_managers WHERE activityId = ? AND userId = ?').run(a.id, String(targetId));
  else db.prepare('DELETE FROM category_managers WHERE activityId = ? AND categoryKey = ? AND userId = ?').run(a.id, n.key, String(targetId));
  return listeCategorie(userId, a.id, key);
}
module.exports = { categorie, definirCategorie, ids, migrerAncienneTable, lister, ajouter, retirer, isManager, listeCategorie, ajouterCategorie, retirerCategorie };
