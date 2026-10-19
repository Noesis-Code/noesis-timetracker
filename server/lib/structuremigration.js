// Alignement UNIQUE de la STRUCTURE (pôles/secteurs + descriptions) d'une
// activité de prod sur celle d'un fichier exporté de staging
// (data/structure-noesis.json, voir scripts/export-activity-structure.js).
//
// Décisions d'Émilien : structure seulement (aucun temps, tâche
// ni objectif du staging) ; les éléments de prod de même nom sont mis à jour
// EN PLACE (clé de prod conservée -> données rattachées intactes) ; ceux
// absents du fichier sont GELÉS (removedAt), jamais supprimés.
// Drapeau global `structure-noesis-v1` (migration_flags) : une seule passe.
// Fichier absent : no-op, drapeau NON posé (la migration pourra tourner plus tard).
// Ne jette jamais : le démarrage ne doit pas casser.

const fs = require('fs');
const path = require('path');
const db = require('../db');
const goals = require('./goals');

const FLAG = 'structure-noesis-v1';
const FILE = path.join(__dirname, '..', '..', 'data', 'structure-noesis.json');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function loadFile(file) {
  if (!fs.existsSync(file)) return null;
  const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!j || j.version !== 1 || !j.activityName || !Array.isArray(j.categories)) throw new Error('format invalide');
  return j;
}

function newKey(activityId) {
  let n = db.prepare('SELECT COUNT(*) n FROM activity_goal_categories WHERE activityId = ?').get(activityId).n + 1;
  while (db.prepare('SELECT 1 FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, 'c' + n)) n++;
  return 'c' + n;
}

function alignActivity(activity, cats, log, warn) {
  const id = activity.id;
  const tag = '[structure] « ' + activity.name + ' » (#' + id + ') : ';
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const rows = () => db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ?').all(id);
  const stats = { updated: 0, created: 0, frozen: 0, skipped: 0 };
  const desc = (c) => {
    const d = String(c.description || '').trim();
    if (d.length > 200) { warn(tag + 'description de « ' + c.label + ' » = ' + d.length + ' car. (> 200) : NON appliquée, description actuelle conservée.'); return null; }
    return d;
  };
  const keyMap = new Map(); // clé du fichier -> clé de prod
  const touched = new Set(); // clés de prod alignées

  // ---- Pôles ----
  const poles = cats.filter((c) => !c.parentKey && !c.removed).sort((a, b) => a.position - b.position);
  poles.forEach((c, i) => {
    const hit = rows().find((r) => !r.parentKey && norm(r.label) === norm(c.label) && !touched.has(r.key));
    const d = desc(c);
    if (hit) {
      db.prepare('UPDATE activity_goal_categories SET label = ?, position = ?, color = ?, removedAt = NULL' + (d === null ? '' : ', description = ?') + ' WHERE id = ?')
        .run(...[c.label, i, c.color || '', ...(d === null ? [] : [d]), hit.id]);
      keyMap.set(c.key, hit.key); touched.add(hit.key); stats.updated++;
      return;
    }
    // Les pôles de prod non alignés seront gelés plus bas : seuls les pôles alignés comptent.
    if ([...touched].filter((k) => !rows().find((r) => r.key === k).parentKey).length >= goals.MAX_CUSTOM_CATEGORIES) {
      warn(tag + 'plafond de ' + goals.MAX_CUSTOM_CATEGORIES + ' pôles atteint : pôle « ' + c.label + ' » NON créé.'); stats.skipped++; return;
    }
    const k = newKey(id);
    db.prepare('INSERT INTO activity_goal_categories (activityId, key, label, color, position, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, k, c.label, c.color || '', i, d || '', now);
    keyMap.set(c.key, k); touched.add(k); stats.created++;
  });

  // ---- Secteurs ----
  poles.forEach((p) => {
    const poleKey = keyMap.get(p.key);
    if (!poleKey) return;
    const secs = cats.filter((c) => c.parentKey === p.key && !c.removed).sort((a, b) => a.position - b.position);
    secs.forEach((c, j) => {
      const d = desc(c);
      // même libellé sous ce pôle, sinon sous un autre pôle de prod (déplacement), sinon création
      const hit = rows().find((r) => r.parentKey && norm(r.label) === norm(c.label) && !touched.has(r.key) && r.parentKey === poleKey)
        || rows().find((r) => r.parentKey && norm(r.label) === norm(c.label) && !touched.has(r.key));
      if (hit) {
        db.prepare('UPDATE activity_goal_categories SET label = ?, position = ?, parentKey = ?, color = \'\', removedAt = NULL' + (d === null ? '' : ', description = ?') + ' WHERE id = ?')
          .run(...[c.label, j, poleKey, ...(d === null ? [] : [d]), hit.id]);
        touched.add(hit.key); stats.updated++;
        return;
      }
      const siblings = rows().filter((r) => r.parentKey === poleKey && !r.removedAt && touched.has(r.key)).length;
      if (siblings >= goals.MAX_SECTEURS_PER_POLE) { warn(tag + 'plafond de secteurs atteint sous « ' + p.label + ' » : « ' + c.label + ' » NON créé.'); stats.skipped++; return; }
      const firstOfPole = !rows().some((r) => r.parentKey === poleKey && !r.removedAt);
      const k = newKey(id);
      db.prepare("INSERT INTO activity_goal_categories (activityId, key, label, color, position, parentKey, description, createdAt, fromYear) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)")
        .run(id, k, c.label, j, poleKey, d || '', now, year);
      touched.add(k); stats.created++;
      // Le pôle portait des tâches/objectifs en direct : ils basculent sur ce premier secteur.
      if (firstOfPole) goals.migratePoleDirectDataToSecteur(id, poleKey, k);
    });
  });

  // ---- Absents du fichier -> gelés ----
  rows().filter((r) => !r.removedAt && !touched.has(r.key)).forEach((r) => {
    db.prepare('UPDATE activity_goal_categories SET removedAt = ?, removedYear = ? WHERE id = ?').run(now, r.parentKey ? year : null, r.id);
    log(tag + (r.parentKey ? 'secteur' : 'pôle') + ' « ' + r.label + ' » absent du fichier : gelé (données conservées).');
    stats.frozen++;
  });
  log(tag + stats.updated + ' mis à jour, ' + stats.created + ' créé(s), ' + stats.frozen + ' gelé(s), ' + stats.skipped + ' ignoré(s).');
  return stats;
}

function migrateStructure(opts) {
  const o = opts || {};
  const log = o.log || ((m) => console.log(m));
  const warn = o.warn || ((m) => console.warn(m));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS migration_flags (name TEXT PRIMARY KEY, doneAt TEXT NOT NULL)');
    if (db.prepare('SELECT 1 FROM migration_flags WHERE name = ?').get(FLAG)) return { skipped: 'flag' };
    const file = loadFile(o.file || FILE);
    if (!file) return { skipped: 'nofile' };
    const cats = file.categories.filter((c) => c && c.key && c.label);
    const acts = db.prepare('SELECT id, name FROM activities').all().filter((a) => norm(a.name) === norm(file.activityName));
    const results = [];
    db.exec('BEGIN');
    try {
      acts.forEach((a) => results.push(alignActivity(a, cats, log, warn)));
      db.prepare('INSERT OR IGNORE INTO migration_flags (name, doneAt) VALUES (?, ?)').run(FLAG, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    if (!acts.length) log('[structure] aucune activité « ' + file.activityName + ' » : rien à faire (drapeau posé).');
    return { activities: acts.length, results };
  } catch (e) {
    console.error('[structure-migration]', e.message);
    return { error: e.message };
  }
}

module.exports = { migrateStructure };
