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

    {
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

// Une seule fois (drapeau en base) : gèle tout pôle « Nouveau pôle » VIDE, pour
// toutes les activités. Plus aucun pôle par défaut n'existe (11 oct. 2026) ;
// un pôle de ce nom portant des données est conservé tel quel.
function freezeEmptyDefaultPoles() {
  db.exec('CREATE TABLE IF NOT EXISTS migration_flags (name TEXT PRIMARY KEY, doneAt TEXT NOT NULL)');
  if (db.prepare("SELECT 1 FROM migration_flags WHERE name = 'freeze-empty-default-pole'").get()) return 0;
  const rows = db.prepare(
    "SELECT * FROM activity_goal_categories WHERE label = ? AND removedAt IS NULL AND parentKey IS NULL").all(DEFAULT_LABEL);
  const now = new Date().toISOString();
  let n = 0;
  rows.forEach((r) => {
    if (!poleHasData(r.activityId, r)) {
      db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE id = ?').run(now, r.id);
      n++;
    }
  });
  db.prepare("INSERT INTO migration_flags (name, doneAt) VALUES ('freeze-empty-default-pole', ?)").run(now);
  return n;
}

function flagDone(name) {
  db.exec('CREATE TABLE IF NOT EXISTS migration_flags (name TEXT PRIMARY KEY, doneAt TEXT NOT NULL)');
  return !!db.prepare('SELECT 1 FROM migration_flags WHERE name = ?').get(name);
}
function setFlag(name) {
  db.prepare('INSERT OR IGNORE INTO migration_flags (name, doneAt) VALUES (?, ?)').run(name, new Date().toISOString());
}

// UNIQUE : 1re passe (sous-projets -> pôles) et 2e passe (excédent -> secteurs) ne
// s'exécutent qu'UNE fois chacune (drapeaux globaux), à la mise en prod. Un
// sous-projet ou une activité créés ensuite (ex. Offre 1) ne sont JAMAIS touchés.
// Si la 1re passe a déjà tourné avant l'introduction du drapeau (marqueurs par
// activité présents), on pose simplement le drapeau sans rien retraiter.
function migrateSubProjectsToPoles() {
  ensureTable();
  try { freezeEmptyDefaultPoles(); } catch (e) { console.error('[subproject-migration] pôles par défaut :', e.message); }
  const out = [];
  if (!flagDone('subproject-pass1')) {
    if (db.prepare('SELECT 1 FROM activity_subproject_migration LIMIT 1').get()) {
      setFlag('subproject-pass1');
    } else {
      out.push(...runPass1());
      setFlag('subproject-pass1');
    }
  }
  if (!flagDone('subproject-pass2')) {
    try { migrateOverflowToSectors(); setFlag('subproject-pass2'); }
    catch (e) { console.error('[subproject-migration] 2e passe :', e.message); }
  }
  return out;
}

function runPass1() {
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
          ' pôles atteint, sous-projets excédentaires renvoyés en secteurs (2e passe) : ' + r.skipped.join(' | '));
      }
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) { /* déjà annulé */ }
      console.error('[subproject-migration] activité ' + activityId + ' échouée (rien modifié) :', e.message);
    }
  });
  return out;
}

// 2e PASSE (décision d'Émilien, 11 oct. 2026) : les sous-projets restés non migrés
// à cause du plafond de 5 pôles (goalCategory NULL, activité déjà marquée migrée)
// deviennent des SECTEURS du dernier pôle actif (le 5e). Un pôle avec secteurs ne
// portant pas de tâches en direct, ses tâches/objectifs directs basculent d'abord
// vers un premier secteur de MÊME NOM (goals.migratePoleDirectDataToSecteur ; le
// temps du pôle reste sur le pôle, comme addCategory). Clos = secteur gelé.
// Idempotent (sélection sur goalCategory NULL). Plafond de secteurs par pôle
// respecté : le surplus est loggé et laissé intact.
function migrateOverflowToSectors() {
  const goals = require('./goals');
  const MAX_SEC = goals.MAX_SECTEURS_PER_POLE;
  const acts = db.prepare(`SELECT DISTINCT sp.activityId FROM sub_projects sp
    WHERE sp.goalCategory IS NULL AND sp.activityId IN (SELECT activityId FROM activity_subproject_migration)`).all();
  const out = [];
  acts.forEach(({ activityId }) => {
    const host = db.prepare(`SELECT * FROM activity_goal_categories WHERE activityId = ? AND removedAt IS NULL AND parentKey IS NULL
      ORDER BY position DESC, id DESC LIMIT 1`).get(activityId);
    const subs = db.prepare('SELECT * FROM sub_projects WHERE activityId = ? AND goalCategory IS NULL ORDER BY pinned DESC, position, id').all(activityId);
    if (!host) {
      console.warn('[subproject-migration] activité ' + activityId + ' : aucun pôle actif pour accueillir les secteurs, sous-projets laissés intacts : ' + subs.map((x) => x.name).join(' | '));
      return;
    }
    db.exec('BEGIN');
    try {
      const todayStr = today();
      const year = new Date().getFullYear();
      const now = new Date().toISOString();
      const isClosed = (sp) => !!sp.closesAt && sp.closesAt < todayStr;
      let siblings = db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND removedAt IS NULL AND parentKey = ? ORDER BY position, id')
        .all(activityId, host.key);
      let seq = db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(activityId).n;
      const nextKey = () => {
        let key;
        do { seq += 1; key = 'c' + seq; }
        while (db.prepare('SELECT 1 FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key));
        return key;
      };
      const ins = db.prepare(`INSERT INTO activity_goal_categories
        (activityId, key, label, color, position, parentKey, createdAt, fromYear, description, removedAt, removedYear, removedFromDate)
        VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`);
      let free = MAX_SEC - siblings.length;
      const open = subs.filter((x) => !isClosed(x));
      const closed = subs.filter(isClosed);
      const res = { activityId, host: host.key, sectors: [], frozen: [], skipped: [] };
      const needHome = !siblings.length;
      if (needHome) free -= 1;           // le secteur « même nom que le pôle »
      const take = open.slice(0, Math.max(0, free));
      open.slice(take.length).forEach((x) => res.skipped.push(x.name));
      if (take.length || closed.length) {
        let pos = siblings.length;
        if (needHome) {
          const k = nextKey();
          ins.run(activityId, k, host.label, 0, host.key, now, year, host.description || null, null, null, null);
          goals.migratePoleDirectDataToSecteur(activityId, host.key, k);
          pos = 1; res.homeSector = k;
        }
        const attach = (sp, frozen) => {
          const k = nextKey();
          const label = String(sp.name || '').trim().slice(0, 40) || 'Sous-projet ' + sp.id;
          ins.run(activityId, k, label, frozen ? 0 : pos++, host.key, now, year, String(sp.description || '').trim().slice(0, 200) || null,
            frozen ? now : null, frozen ? year : null, frozen ? todayStr : null);
          db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(k, sp.id);
          db.prepare('UPDATE time_entries SET goalCategory = ? WHERE subProjectId = ? AND goalCategory IS NULL').run(k, sp.id);
          db.prepare('UPDATE running_timers SET goalCategory = ? WHERE subProjectId = ? AND goalCategory IS NULL').run(k, sp.id);
          (frozen ? res.frozen : res.sectors).push(label);
        };
        take.forEach((sp) => attach(sp, false));
        closed.forEach((sp) => attach(sp, true));
      }
      db.exec('COMMIT');
      out.push(res);
      console.log('[subproject-migration] activité ' + activityId + ' : secteurs sous le pôle « ' + host.label + ' » : ' +
        res.sectors.concat(res.frozen.map((x) => x + ' (gelé)')).join(' | '));
      if (res.skipped.length) console.warn('[subproject-migration] activité ' + activityId + ' : plafond de ' + MAX_SEC + ' secteurs atteint, NON migrés (intacts) : ' + res.skipped.join(' | '));
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) { /* déjà annulé */ }
      console.error('[subproject-migration] 2e passe activité ' + activityId + ' échouée (rien modifié) :', e.message);
    }
  });
  return out;
}

module.exports = { migrateSubProjectsToPoles, migrateOverflowToSectors };
