// Migration des SOUS-PROJETS en PÔLES (11 oct. 2026, décision d'Émilien :
// « chaque sous-projet devient un pôle », même nom, avec ses tâches et son
// temps déjà chronométré).
//
// Contexte : la prod tournait avec l'ancien code où les sous-projets étaient
// visibles. Le code actuel les a remplacés par des pôles/secteurs
// (activity_goal_categories) et masque l'UI sous-projets, sans transformer les
// données. Ce module comble l'écart, UNE FOIS par activité.
//
// Contrat réutilisé (aucune nouvelle structure côté pôles) :
//  - un pôle = ligne de activity_goal_categories (parentKey NULL, color '' =
//    couleur automatique par rang, voir goals.js) ;
//  - les tâches d'un pôle = les sub_projects dont goalCategory = clé du pôle
//    (goalstasks.js#subProjectsForCategory) : on pose donc goalCategory sur le
//    sous-projet lui-même, qui devient le « domicile » de son pôle ;
//  - le temps d'un pôle = time_entries/running_timers.goalCategory
//    (entrycategory.js) : renseigné SANS effacer subProjectId.
//
// Additif et idempotent : rien n'est supprimé. Un marqueur par activité
// (activity_subproject_migration) évite tout second passage. Plafond de pôles
// actifs = goals.MAX_CUSTOM_CATEGORIES (5) ; au-delà, les sous-projets ouverts
// excédentaires ne sont PAS migrés (console.warn) et restent intacts. Les
// sous-projets clos deviennent des pôles GELÉS (removedAt posé : masqués, temps
// et tâches conservés, hors plafond). Les pôles par défaut vides
// (« Nouveau pôle » sans temps/tâche/objectif) sont gelés, jamais supprimés.

const db = require('../db');

const MAX_POLES = 5;            // = goals.MAX_CUSTOM_CATEGORIES (dupliqué : pas de dépendance à goals.js au démarrage)
const DEFAULT_LABEL = 'Nouveau pôle'; // = goals.DEFAULT_CATEGORY_LABEL

function ensureTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS activity_subproject_migration (
    activityId INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
    migratedAt TEXT NOT NULL,
    migratedCount INTEGER NOT NULL DEFAULT 0,
    skippedCount INTEGER NOT NULL DEFAULT 0
  )`);
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function poleHasData(activityId, row) {
  const key = row.key;
  const one = (sql, ...args) => !!db.prepare(sql).get(...args);
  if (one('SELECT 1 FROM activity_goal_categories WHERE activityId = ? AND parentKey = ?', activityId, key)) return true;
  if (one('SELECT 1 FROM time_entries WHERE activityId = ? AND goalCategory = ? LIMIT 1', activityId, key)) return true;
  if (one('SELECT 1 FROM running_timers WHERE activityId = ? AND goalCategory = ? LIMIT 1', activityId, key)) return true;
  if (one(`SELECT 1 FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
           WHERE sp.activityId = ? AND sp.goalCategory = ? LIMIT 1`, activityId, key)) return true;
  if (one(`SELECT 1 FROM goal_periods WHERE activityId = ? AND category = ? AND (TRIM(mainGoalText) != ''
           OR EXISTS (SELECT 1 FROM goal_weekly w WHERE w.periodId = goal_periods.id AND TRIM(w.text) != '')) LIMIT 1`, activityId, key)) return true;
  return false;
}

function migrateActivity(activityId) {
  const subs = db.prepare(
    'SELECT * FROM sub_projects WHERE activityId = ? AND goalCategory IS NULL ORDER BY pinned DESC, position, id'
  ).all(activityId);
  const now = new Date().toISOString();
  const todayStr = today();
  const result = { activityId, migrated: 0, frozen: 0, skipped: [], replacedDefaults: 0 };

  if (subs.length) {
    const activePoles = db.prepare(
      'SELECT * FROM activity_goal_categories WHERE activityId = ? AND removedAt IS NULL AND parentKey IS NULL ORDER BY position, id'
    ).all(activityId);
    const emptyDefaults = activePoles.filter((r) => r.label === DEFAULT_LABEL && !poleHasData(activityId, r));
    const keptCount = activePoles.length - emptyDefaults.length;
    let free = Math.max(0, MAX_POLES - keptCount);

    const isClosed = (sp) => !!sp.closesAt && sp.closesAt < todayStr;
    const toOpen = [];
    const toFreeze = [];
    subs.forEach((sp) => {
      if (isClosed(sp)) toFreeze.push(sp);
      else if (free > 0) { toOpen.push(sp); free--; }
      else result.skipped.push(sp.name);
    });

    let rowCount = db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(activityId).n;
    // Jamais 'c1' : clé réservée au pôle synthétique par défaut (goals.js).
    let seq = Math.max(rowCount, 1);
    const nextKey = () => {
      let key;
      do { seq += 1; key = 'c' + seq; }
      while (db.prepare('SELECT 1 FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key));
      return key;
    };
    let nextPos = activePoles.reduce((m, r) => Math.max(m, r.position + 1), 0);
    const ins = db.prepare(`INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt, description, removedAt)
                            VALUES (?, ?, ?, '', ?, ?, ?, ?)`);
    const attach = (sp, frozen) => {
      const key = nextKey();
      const label = String(sp.name || '').trim().slice(0, 40) || 'Sous-projet ' + sp.id;
      const desc = String(sp.description || '').trim().slice(0, 200) || null;
      ins.run(activityId, key, label, frozen ? 0 : nextPos++, now, desc, frozen ? now : null);
      db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(key, sp.id);
      db.prepare('UPDATE time_entries SET goalCategory = ? WHERE subProjectId = ? AND goalCategory IS NULL').run(key, sp.id);
      db.prepare('UPDATE running_timers SET goalCategory = ? WHERE subProjectId = ? AND goalCategory IS NULL').run(key, sp.id);
    };

    toOpen.forEach((sp) => { attach(sp, false); result.migrated++; });
    toFreeze.forEach((sp) => { attach(sp, true); result.frozen++; });

    if (toOpen.length) {
      emptyDefaults.forEach((r) => {
        db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE id = ?').run(now, r.id);
        result.replacedDefaults++;
      });
    }
  }

  db.prepare('INSERT OR IGNORE INTO activity_subproject_migration (activityId, migratedAt, migratedCount, skippedCount) VALUES (?, ?, ?, ?)')
    .run(activityId, now, result.migrated + result.frozen, result.skipped.length);
  return result;
}

function migrateSubProjectsToPoles() {
  ensureTable();
  const acts = db.prepare(`SELECT DISTINCT activityId FROM sub_projects
    WHERE goalCategory IS NULL AND activityId NOT IN (SELECT activityId FROM activity_subproject_migration)`).all();
  const out = [];
  acts.forEach(({ activityId }) => {
    db.exec('BEGIN');
    try {
      const r = migrateActivity(activityId);
      db.exec('COMMIT');
      out.push(r);
      if (r.skipped.length) {
        console.warn('[subproject-migration] activité ' + activityId + ' : plafond de ' + MAX_POLES +
          ' pôles atteint, sous-projets NON migrés (conservés intacts) : ' + r.skipped.join(' | '));
      }
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) { /* déjà annulé */ }
      console.error('[subproject-migration] activité ' + activityId + ' échouée (rien modifié) :', e.message);
    }
  });
  return out;
}

module.exports = { migrateSubProjectsToPoles };
