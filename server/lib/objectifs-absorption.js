// Absorption (Émilien, 18 nov. 2026) : fusionner deux pôles (ou secteurs) à une période = à partir de cette période, il n'existe plus que l'ABSORBANT (la branche choisie en premier).
// Un ENREGISTREMENT par branche absorbée (fusion_absorption), jamais une ligne d'objectif ou de catégorie modifiée ou supprimée : le passé (statistiques, objectifs, temps) reste lisible et dans l'export.
// La fusion est IRRÉVERSIBLE (délier est refusé). Chaque fusion vaut à partir de SA période vers le haut ; à une date, le groupe = fermeture transitive des fusions dont la période est antérieure ou égale.
// Les tâches ouvertes de la branche absorbée passent à l'absorbante (même activité) dès que la période est atteinte. Pas de remontée en catégorie : seuls les niveaux pôle et secteur absorbent.
const db = require('../db');
db.exec(`CREATE TABLE IF NOT EXISTS fusion_absorption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  level TEXT NOT NULL,
  absorbingActivityId INTEGER NOT NULL, absorbingPoleKey TEXT, absorbingKey TEXT NOT NULL,
  absorbedActivityId INTEGER NOT NULL, absorbedPoleKey TEXT, absorbedKey TEXT NOT NULL,
  fromDate TEXT NOT NULL,
  macroId INTEGER,
  createdAt TEXT NOT NULL,
  UNIQUE (userId, level, absorbedActivityId, absorbedKey)
)`);
const MSG_IRREVERSIBLE = 'Fusion définitive : impossible de délier.';
const colOf = (level, c) => ({ activityId: c.activityId, poleKey: level === 'pole' ? c.poleKey : c.poleKey || null, key: level === 'pole' ? c.poleKey : c.categoryKey });
// cols : colonnes reliées dans l'ordre de sélection ; la première absorbe. Rien n'est écrit pour deux colonnes identiques ni pour un niveau « activité ».
function record(userId, level, cols, fromDate, macroId) {
  if (level === 'activite' || !cols || cols.length < 2) return 0;
  const first = colOf(level, cols[0]); let n = 0;
  cols.slice(1).forEach((c) => {
    const x = colOf(level, c); if (x.activityId === first.activityId && x.key === first.key) return;
    const r = db.prepare('INSERT OR IGNORE INTO fusion_absorption (userId, level, absorbingActivityId, absorbingPoleKey, absorbingKey, absorbedActivityId, absorbedPoleKey, absorbedKey, fromDate, macroId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, level, first.activityId, first.poleKey, first.key, x.activityId, x.poleKey, x.key, fromDate, macroId || null, new Date().toISOString());
    n += r.changes;
  });
  return n;
}
const all = (userId) => db.prepare('SELECT * FROM fusion_absorption WHERE userId = ? ORDER BY fromDate, id').all(userId);
// Branche qui subsiste à `date` pour (activityId, key) : on suit les absorptions dont la période est atteinte (transitif : B absorbée par A, A absorbée par C => C).
function survivor(userId, level, activityId, key, date) {
  let cur = { activityId: Number(activityId), key: String(key) }, n = 0;
  const rows = all(userId).filter((r) => r.level === level && r.fromDate <= date);
  for (;;) {
    const r = rows.find((x) => x.absorbedActivityId === cur.activityId && x.absorbedKey === cur.key);
    if (!r || n++ > 50) return cur;
    cur = { activityId: r.absorbingActivityId, key: r.absorbingKey };
  }
}
// Groupe à `date` : toutes les branches (y compris l'absorbant) dont survivor() est la même ; sert à l'affichage de l'arbre.
function groupAt(userId, level, activityId, key, date) {
  const s = survivor(userId, level, activityId, key, date), out = [{ activityId: s.activityId, key: s.key }];
  all(userId).filter((r) => r.level === level && r.fromDate <= date).forEach((r) => { const t = survivor(userId, level, r.absorbedActivityId, r.absorbedKey, date); if (t.activityId === s.activityId && t.key === s.key) out.push({ activityId: r.absorbedActivityId, key: r.absorbedKey }); });
  return out;
}
// Branches absorbées d'une activité (lues par le Chrono, les Réglages et l'arbre) : [{ key, level, absorbedInto, fromDate }]
function absorbedOf(userId, activityId) {
  return all(userId).filter((r) => r.absorbedActivityId === Number(activityId)).map((r) => ({ key: r.absorbedKey, level: r.level, absorbedInto: r.absorbingKey, absorbingActivityId: r.absorbingActivityId, fromDate: r.fromDate }));
}
const isAbsorbed = (userId, activityId, key, date) => all(userId).some((r) => r.absorbedActivityId === Number(activityId) && r.absorbedKey === key && r.fromDate <= date);
// Tâches OUVERTES de la branche absorbée -> absorbante (même activité) quand la période est atteinte. Idempotent ; rien n'est supprimé, le temps déjà enregistré ne bouge pas.
function appliquer(userId, today) {
  let moved = 0;
  all(userId).filter((r) => r.fromDate <= today && r.absorbedActivityId === r.absorbingActivityId).forEach((r) => {
    const keys = [r.absorbedKey].concat(r.level === 'pole' ? db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ? AND parentKey = ?').all(r.absorbedActivityId, r.absorbedKey).map((x) => x.key) : []);
    const ph = keys.map(() => '?').join(',');
    const homes = db.prepare(`SELECT sp.id FROM sub_projects sp WHERE sp.activityId = ? AND sp.goalCategory IN (${ph}) AND EXISTS (SELECT 1 FROM sub_project_items i WHERE i.subProjectId = sp.id AND i.done = 0)`).all(r.absorbedActivityId, ...keys);
    homes.forEach((h) => { moved += db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(r.absorbingKey, h.id).changes; });
  });
  return moved;
}
const lockedByMacro = (userId, macroId) => !!db.prepare('SELECT 1 FROM fusion_absorption WHERE userId = ? AND macroId = ? LIMIT 1').get(userId, macroId);
module.exports = { record, all, survivor, groupAt, absorbedOf, isAbsorbed, appliquer, lockedByMacro, MSG_IRREVERSIBLE };
