// Absorption (Émilien, 18 nov. 2026) : DÉRIVÉE à chaque lecture des liens de fusion, jamais stockée.
// SOURCE UNIQUE = les liens directs de fusion : un macro (user_objectives, isMacro = 1) = un lien { colonnes reliées dans l'ordre de sélection, échéance }. La première colonne est la DOMINANTE (elle absorbe les autres).
// Tout le reste est calculé ici : absorption effective = l'échéance du lien (sa période de l'arbre) est PASSÉE (pas avant) ; branche qui subsiste = on suit les liens effectifs (A-B puis B-C : A absorbe B et C) ; le groupe = composantes connexes des liens.
// Séparer = supprimer le lien, seulement avant l'échéance (objectifs.js) ; rien ne s'écrit ici, sauf le registre des tâches déplacées (fusion_absorption.movedJson), seul état qui ne se déduit pas, qui permet de les remettre en place.
// Les colonnes fromDate / cancelledAt / macroId de fusion_absorption sont conservées pour les données existantes (jamais supprimées) mais ne décident plus de rien.
// Pas de remontée en catégorie : seuls les niveaux pôle et secteur absorbent. Les tâches OUVERTES de l'absorbée passent à la survivante (même activité) une fois l'échéance passée ; le temps déjà enregistré ne bouge pas.
const db = require('../db');
const fusion = require('./objectifs-fusion');
db.exec(`CREATE TABLE IF NOT EXISTS fusion_absorption (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  level TEXT NOT NULL,
  absorbingActivityId INTEGER NOT NULL, absorbingPoleKey TEXT, absorbingKey TEXT NOT NULL,
  absorbedActivityId INTEGER NOT NULL, absorbedPoleKey TEXT, absorbedKey TEXT NOT NULL,
  fromDate TEXT NOT NULL,
  macroId INTEGER,
  createdAt TEXT NOT NULL,
  cancelledAt TEXT,
  movedJson TEXT,
  UNIQUE (userId, level, absorbedActivityId, absorbedKey)
)`);
if (!db.prepare('PRAGMA table_info(fusion_absorption)').all().some((c) => c.name === 'cancelledAt')) { db.exec('ALTER TABLE fusion_absorption ADD COLUMN cancelledAt TEXT'); db.exec('ALTER TABLE fusion_absorption ADD COLUMN movedJson TEXT'); }
const todayOf = () => require('./dates').userToday();
const addDay = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const same = (a, b) => a.activityId === b.activityId && a.key === b.key;
// Les liens directs de l'utilisateur (pôles et secteurs) : [{ id, level, endDate, mergeEnd, cols: [{ activityId, poleKey, key }] }], cols dans l'ordre de sélection (la première est dominante).
function liens(userId) {
  return require('./objectifs').liensDirects(userId).filter((l) => l.level === 'pole' || l.level === 'secteur').map((l) => {
    const cols = l.columns.map((c) => ({ activityId: c.activityId, poleKey: c.poleKey || null, key: l.level === 'pole' ? c.poleKey : c.categoryKey })).filter((c) => c.key);
    return { id: l.id, level: l.level, endDate: l.endDate, mergeEnd: fusion.state(l.endDate, '0000-00-00').mergeEnd, cols };
  }).filter((l) => l.cols.length > 1 && l.mergeEnd);
}
// Paires « absorbée -> absorbante » de tous les liens ; effectives = échéance passée à `date` (aujourd'hui par défaut).
function paires(userId, date, effectiveOnly) {
  const d = date || todayOf(), out = [];
  liens(userId).forEach((l) => {
    if (effectiveOnly && !(d > l.mergeEnd)) return;
    l.cols.slice(1).forEach((c) => { if (!same(c, l.cols[0])) out.push({ level: l.level, macroId: l.id, absorbed: c, absorbing: l.cols[0], mergeEnd: l.mergeEnd }); });
  });
  return out;
}
// Branche qui subsiste pour (activityId, key) : on suit les paires (transitif : B absorbée par A, A absorbée par C => C).
function chaine(ps, level, activityId, key) {
  let cur = { activityId: Number(activityId), key: String(key) }, n = 0;
  const rows = ps.filter((p) => p.level === level);
  for (;;) {
    const p = rows.find((x) => same(x.absorbed, cur));
    if (!p || n++ > 50) return cur;
    cur = { activityId: p.absorbing.activityId, key: p.absorbing.key };
  }
}
// Branche qui subsiste à `date` : seules les fusions dont l'échéance est passée comptent.
const survivor = (userId, level, activityId, key, date) => chaine(paires(userId, date, true), level, activityId, key);
// Branche dominante d'un lien (lue par l'arbre pour la couleur et la colonne qui subsiste) : sa première colonne, suivie à travers les autres liens (A-B puis B-C : A). null sans lien pôle/secteur.
function dominante(userId, macroId) {
  const l = liens(userId).find((x) => x.id === Number(macroId)); if (!l) return null;
  const s = chaine(paires(userId, null, false), l.level, l.cols[0].activityId, l.cols[0].key), c = l.cols.find((x) => same(x, s)) || l.cols[0];
  return { level: l.level, activityId: s.activityId, poleKey: c.poleKey, key: s.key };
}
// Branches absorbées d'une activité, EFFECTIVES seulement (lues par le Chrono et les Réglages) : [{ key, level, absorbedInto, absorbingActivityId, fromDate }] ; fromDate = lendemain de l'échéance.
function absorbedOf(userId, activityId) {
  const ps = paires(userId, null, true);
  return ps.filter((p) => p.absorbed.activityId === Number(activityId)).map((p) => { const s = chaine(ps, p.level, p.absorbed.activityId, p.absorbed.key); return { key: p.absorbed.key, level: p.level, absorbedInto: s.key, absorbingActivityId: s.activityId, fromDate: addDay(p.mergeEnd) }; });
}
function tasksOf(activityId, key, level) {
  const ks = [key].concat(level === 'pole' ? db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ? AND parentKey = ?').all(activityId, key).map((x) => x.key) : []);
  return db.prepare(`SELECT sp.id, sp.goalCategory FROM sub_projects sp WHERE sp.activityId = ? AND sp.goalCategory IN (${ks.map(() => '?').join(',')}) AND EXISTS (SELECT 1 FROM sub_project_items i WHERE i.subProjectId = sp.id AND i.done = 0)`).all(activityId, ...ks);
}
const rowOfAbsorbed = (userId, level, a) => db.prepare('SELECT * FROM fusion_absorption WHERE userId = ? AND level = ? AND absorbedActivityId = ? AND absorbedKey = ?').get(userId, level, a.activityId, a.key);
// Remet les tâches en accord avec les liens (idempotent, appelé à la lecture) : (1) un registre dont la fusion n'est plus effective (lien séparé ou supprimé, échéance non passée) -> les tâches reviennent ; (2) fusion effective -> tâches ouvertes de l'absorbée vers la survivante.
function appliquer(userId, today) {
  const ps = paires(userId, today, true);
  let moved = 0;
  db.prepare('SELECT * FROM fusion_absorption WHERE userId = ? AND cancelledAt IS NULL AND movedJson IS NOT NULL').all(userId).forEach((r) => {
    if (ps.some((p) => p.level === r.level && p.absorbed.activityId === r.absorbedActivityId && p.absorbed.key === r.absorbedKey)) return;
    JSON.parse(r.movedJson || '[]').forEach((m) => { db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ? AND goalCategory = ?').run(m.from, m.id, r.absorbingKey); });
    db.prepare('UPDATE fusion_absorption SET cancelledAt = ? WHERE id = ?').run(new Date().toISOString(), r.id);
  });
  ps.forEach((p) => {
    const s = chaine(ps, p.level, p.absorbed.activityId, p.absorbed.key);
    if (s.activityId !== p.absorbed.activityId || s.key === p.absorbed.key) return;
    const homes = tasksOf(p.absorbed.activityId, p.absorbed.key, p.level); if (!homes.length) return;
    let row = rowOfAbsorbed(userId, p.level, p.absorbed);
    if (!row) {
      db.prepare('INSERT INTO fusion_absorption (userId, level, absorbingActivityId, absorbingPoleKey, absorbingKey, absorbedActivityId, absorbedPoleKey, absorbedKey, fromDate, macroId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, p.level, s.activityId, p.absorbing.poleKey, s.key, p.absorbed.activityId, p.absorbed.poleKey, p.absorbed.key, addDay(p.mergeEnd), p.macroId, new Date().toISOString());
      row = rowOfAbsorbed(userId, p.level, p.absorbed);
    } else if (row.cancelledAt) { db.prepare('UPDATE fusion_absorption SET cancelledAt = NULL, movedJson = NULL, macroId = ? WHERE id = ?').run(p.macroId, row.id); row.movedJson = null; }
    const was = JSON.parse(row.movedJson || '[]');
    homes.forEach((h) => { was.push({ id: h.id, from: h.goalCategory }); moved += db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(s.key, h.id).changes; });
    db.prepare('UPDATE fusion_absorption SET movedJson = ?, absorbingKey = ? WHERE id = ?').run(JSON.stringify(was), s.key, row.id);
  });
  return moved;
}
module.exports = { dominante, absorbedOf, survivor, appliquer, paires };
