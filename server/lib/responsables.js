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
  return { activityId: a.id, name: a.name, members, canManage: isManager(userId, a.id) };
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
  db.prepare('DELETE FROM activity_managers WHERE activityId = ? AND userId = ?').run(a.id, String(targetId));
  return lister(userId, a.id);
}
module.exports = { ids, migrerAncienneTable, lister, ajouter, retirer, isManager };
