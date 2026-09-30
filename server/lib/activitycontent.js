// Conservation du contenu Objectifs d'une activité (pôles, secteurs, tâches,
// plans/périodes) quand l'activité est fusionnée, séparée, exclue ou
// supprimée (demande de Gaspard, 30 septembre 2026 — AC·04, AC·21, AC·22).
// Règle : on TRANSFÈRE ou on COPIE, on ne détruit jamais sans conservation.
// Les secteurs suivent leur pôle (parentKey remappé) ; seuls les pôles
// portent une couleur (la colonne color est recopiée telle quelle).
//
// Les clés de catégorie (c1, c2...) ne sont uniques que PAR activité : on
// crée donc toujours de nouvelles clés dans la cible et on remappe toutes les
// références (time_entries, sub_projects, plans, périodes,
// capacités, suggestions). Aucune collision possible, rien à fusionner.
const db = require('../db');

function sourceKeys(fromId, userId, includeShared) {
  const keys = new Set();
  const add = (rows) => rows.forEach((r) => { if (r.k) keys.add(r.k); });
  db.prepare('SELECT key AS k FROM activity_goal_categories WHERE activityId = ?').all(fromId).forEach((r) => keys.add(r.k));
  add(db.prepare('SELECT DISTINCT goalCategory AS k FROM time_entries WHERE activityId = ?' + (userId ? ' AND userId = ?' : '')).all(...(userId ? [fromId, userId] : [fromId])));
  add(db.prepare('SELECT DISTINCT goalCategory AS k FROM sub_projects WHERE activityId = ?' + (userId ? ' AND createdBy = ?' : '')).all(...(userId ? [fromId, userId] : [fromId])));
  if (includeShared) {
    add(db.prepare('SELECT DISTINCT category AS k FROM activity_goal_plans WHERE activityId = ?').all(fromId));
    add(db.prepare('SELECT DISTINCT category AS k FROM goal_capacity_overrides WHERE activityId = ?').all(fromId));
  }
  return keys;
}

// mode 'move' : tout le contenu de fromId passe à toId (fusion, la source est
//   ensuite effacée — aucun autre membre).
// mode 'copy' : le quitteur emporte la STRUCTURE (pôles/secteurs) et ses
//   propres sous-projets/tâches ; l'activité partagée garde tout (séparation,
//   exclusion). Appeler DANS une transaction.
function transferActivityContent(fromId, toId, opts) {
  const move = opts.mode === 'move';
  const userId = move ? null : opts.userId;
  const keys = sourceKeys(fromId, userId, move);
  if (!keys.size) return { categories: 0 };

  const srcRows = db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? ORDER BY position, id').all(fromId);
  const byKey = new Map(srcRows.map((r) => [r.key, r]));
  // Clé sans ligne (activité jamais personnalisée) : pôle synthétique.
  keys.forEach((k) => {
    if (!byKey.has(k)) byKey.set(k, { key: k, label: k === 'c1' ? 'Catégorie 1' : k, color: '', position: 0, removedAt: null, parentKey: null, description: null });
  });

  const used = new Set(db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ?').all(toId).map((r) => r.key));
  const labels = new Set(db.prepare('SELECT label FROM activity_goal_categories WHERE activityId = ? AND removedAt IS NULL').all(toId).map((r) => String(r.label).toLowerCase()));
  let pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM activity_goal_categories WHERE activityId = ?').get(toId).p;
  let n = used.size;
  const map = new Map();
  const nextKey = () => { let k; do { n += 1; k = 'c' + n; } while (used.has(k)); used.add(k); return k; };
  byKey.forEach((r, k) => map.set(k, nextKey()));

  const fromName = (db.prepare('SELECT name FROM activities WHERE id = ?').get(fromId) || {}).name || '';
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT INTO activity_goal_categories
    (activityId, key, label, color, position, createdAt, removedAt, parentKey, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // Pôles d'abord pour garder l'ordre ; le parentKey est remappé.
  const ordered = Array.from(byKey.values()).sort((a, b) => (a.parentKey ? 1 : 0) - (b.parentKey ? 1 : 0));
  ordered.forEach((r) => {
    let label = r.label;
    if (!r.parentKey && !r.removedAt && labels.has(String(label).toLowerCase())) {
      label = label + (fromName ? ' (' + fromName + ')' : ' (2)');
    }
    if (!r.parentKey && !r.removedAt) labels.add(String(label).toLowerCase());
    ins.run(toId, map.get(r.key), label, r.color || '', pos++, r.createdAt || now, r.removedAt || null,
      r.parentKey ? (map.get(r.parentKey) || null) : null, r.description || null);
  });

  const remap = (sql, extra) => map.forEach((nk, ok) => db.prepare(sql).run(nk, ...extra(ok)));

  // Sous-projets (porteurs des tâches) et leurs tâches.
  const spWhere = userId ? ' AND createdBy = ?' : '';
  const spIds = db.prepare('SELECT id, slot FROM sub_projects WHERE activityId = ?' + spWhere).all(...(userId ? [fromId, userId] : [fromId]));
  spIds.forEach((sp) => {
    const slotTaken = sp.slot != null && db.prepare('SELECT 1 FROM sub_projects WHERE activityId = ? AND slot = ?').get(toId, sp.slot);
    db.prepare('UPDATE sub_projects SET activityId = ?' + (slotTaken ? ', slot = NULL' : '') + ' WHERE id = ?').run(toId, sp.id);
    map.forEach((nk, ok) => {
      db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ? AND goalCategory = ?').run(nk, sp.id, ok);
    });
  });

  // Temps déjà enregistré : la catégorie suit. ⚠️ À appeler AVANT de déplacer
  // les time_entries vers la cible (on ne touche que celles de la source).
  const entWhere = userId ? ' AND userId = ?' : '';
  map.forEach((nk, ok) => {
    db.prepare('UPDATE time_entries SET goalCategory = ? WHERE activityId = ? AND goalCategory = ?' + entWhere)
      .run(nk, fromId, ok, ...(userId ? [userId] : []));
  });

  if (move) {
    map.forEach((nk, ok) => {
      db.prepare('UPDATE activity_goal_plans SET activityId = ?, category = ? WHERE activityId = ? AND category = ?').run(toId, nk, fromId, ok);
      db.prepare('UPDATE goal_periods SET activityId = ?, category = ? WHERE activityId = ? AND category = ?').run(toId, nk, fromId, ok);
      db.prepare('UPDATE goal_capacity_overrides SET activityId = ?, category = ? WHERE activityId = ? AND category = ?').run(toId, nk, fromId, ok);
      db.prepare('UPDATE goal_cross_sector_suggestions SET activityId = ?, sourceCategory = ? WHERE activityId = ? AND sourceCategory = ?').run(toId, nk, fromId, ok);
    });
    // targetCategory : second passage (les deux colonnes peuvent différer).
    map.forEach((nk, ok) => {
      db.prepare('UPDATE goal_cross_sector_suggestions SET targetCategory = ? WHERE activityId = ? AND targetCategory = ?').run(nk, toId, ok);
    });
  }
  // Déplacement : les lignes de la source ont été recopiées, on les retire
  // pour que la source (vide) puisse être effacée sans rien perdre.
  if (move) db.prepare('DELETE FROM activity_goal_categories WHERE activityId = ?').run(fromId);
  return { categories: map.size };
}

// Une activité qui porte encore du contenu Objectifs ne doit jamais être
// effacée (les ON DELETE CASCADE l'emporteraient) : on la masque à la place.
function hasGoalContent(activityId) {
  return !!(db.prepare('SELECT 1 FROM activity_goal_categories WHERE activityId = ? LIMIT 1').get(activityId)
    || db.prepare('SELECT 1 FROM sub_projects WHERE activityId = ? LIMIT 1').get(activityId)
    || db.prepare('SELECT 1 FROM activity_goal_plans WHERE activityId = ? LIMIT 1').get(activityId));
}

module.exports = { transferActivityContent, hasGoalContent };
