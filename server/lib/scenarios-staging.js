// Activité de test « Scénarios Feuille de route (test) » (7 oct. 2026, demande d'Emilien) : fait apparaître d'un
// coup TOUS les messages/cartes complexes du volet Feuille de route pour régler design et format.
// STAGING UNIQUEMENT (RAILWAY_ENVIRONMENT_NAME défini et != "production") ; au démarrage seulement si SEED_SCENARIOS=1.
// Idempotent : l'activité est retrouvée par son nom (propriétaire = Emilien), ses seules données sont supprimées puis
// recréées ; aucune autre activité n'est touchée. Dates relatives à aujourd'hui. Reset : node scripts/seed-scenarios.js --reset
//
// Situations créées (sur Emilien, en tant que membre unique) :
//  1 Journée surchargée : tâches Finance/Communauté auto-datées aujourd'hui au-delà du budget + 1 tâche à date fixée.
//  2 Plafond atteint : pôle Produit (jour 60 / semaine 150) et secteur Juridique (jour 30), tâches qui les dépassent.
//  3 Non réalisées : tâches en retard (dont une à date fixée) ; objectifs de période non atteints (Juridique : période
//    suivante libre ; Produit : période suivante déjà remplie).
//  4 Cible irréaliste : Produit (pôle sans secteur) et Finance (secteur), historique chronométré 4 semaines.
//  5 Badge « en retard de N j » : tâches en retard + objectif hebdomadaire passé non atteint (Finance).
//  6 Proposition de recalcul (goalsrecalc) : Communauté (en avance) et Finance (en retard).
//  7 Moyennes + plafonds dans la fiche ✎ (historique présent sur tous les pôles/secteurs).

const db = require('../db');

const NAME = 'Scénarios Feuille de route (test)';

function isStaging() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  return !!env && env !== 'production';
}

function emilien() {
  return db.prepare("SELECT id, name FROM users WHERE name = 'Emilien'").get()
    || db.prepare("SELECT id, name FROM users WHERE name LIKE 'Emilien%' ORDER BY createdAt LIMIT 1").get() || null;
}

function findActivities(userId) {
  return db.prepare('SELECT id FROM activities WHERE name = ? AND ownerId = ?').all(NAME, userId);
}

// Supprime l'activité de test et SES données uniquement (clé = id d'activité).
function removeActivity(activityId) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM running_timers WHERE activityId = ?').run(activityId);
    db.prepare('DELETE FROM time_entries WHERE activityId = ?').run(activityId);
    // Toute autre table qui porte activityId sans cascade (plafonds, propositions, refus...).
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    tables.forEach((t) => {
      if (t.name === 'activities') return;
      const cols = db.prepare('PRAGMA table_info(' + t.name + ')').all();
      if (!cols.some((c) => c.name === 'activityId')) return;
      const fk = db.prepare('PRAGMA foreign_key_list(' + t.name + ')').all().find((f) => f.from === 'activityId' && f.table === 'activities');
      if (fk && /cascade/i.test(fk.on_delete)) return; // supprimée par la cascade
      try { db.prepare('DELETE FROM ' + t.name + ' WHERE activityId = ?').run(activityId); } catch (e) { /* table liée : cascade */ }
    });
    db.prepare('DELETE FROM activities WHERE id = ?').run(activityId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function resetScenarios() {
  const u = emilien();
  if (!u) return 0;
  const found = findActivities(u.id);
  found.forEach((a) => removeActivity(a.id));
  return found.length;
}

function seedScenarios() {
  const goals = require('./goals');
  const goalstasks = require('./goalstasks');
  const timecaps = require('./timecaps');
  const overload = require('./goalsoverload');
  const goalsrecalc = require('./goalsrecalc');
  const u = emilien();
  if (!u) return { skipped: 'profil Emilien introuvable' };
  resetScenarios();

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayIso = iso(today);
  const day = (offset) => goals.addDays(todayIso, offset);
  const monday = goals.mostRecentMonday(todayIso);
  const planStart = goals.addDays(monday, -28); // période 1 terminée, période 2 = cette semaine -> +3 sem.

  // ---- Activité + membre
  const now = new Date().toISOString();
  const color = db.prepare('SELECT color FROM activity_members WHERE userId = ? LIMIT 1').get(u.id);
  const aid = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, 0, 1, ?, ?)').run(NAME, u.id, now).lastInsertRowid);
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(aid, u.id, color ? color.color : '#A04B52', now);

  // ---- Pôles et secteurs : Entreprise (secteurs Juridique, Finance), Produit, Communauté
  const first = goals.ensureDefaultCategory(aid)[0];
  goals.renameCategory(aid, first.key, 'Entreprise');
  goals.addCategory(aid, 'Produit');
  goals.addCategory(aid, 'Communauté');
  goals.addCategory(aid, 'Juridique', first.key);
  goals.addCategory(aid, 'Finance', first.key);
  const keyOf = (label) => {
    const all = goals.categoriesForActivity(aid).flatMap((p) => [p].concat(goals.secteursForPole(aid, p.key)));
    return all.find((c) => c.label === label).key;
  };
  const K = { entreprise: first.key, produit: keyOf('Produit'), communaute: keyOf('Communauté'), juridique: keyOf('Juridique'), finance: keyOf('Finance') };

  // ---- Historique chronométré (28 jours) : moyennes visibles dans la fiche ✎ et base du réalisme / recalcul.
  const ins = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory)
    VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const DOW = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const habits = [ // [clé, minutes, jours (0=dim)]
    [K.juridique, 50, [1, 3, 5]], [K.finance, 30, [2, 4]], [K.produit, 60, [1, 2, 3, 4, 5]], [K.communaute, 50, [2, 4]],
  ];
  for (let off = -28; off <= -1; off += 1) {
    const dIso = day(off);
    const [y, m, dd] = dIso.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    habits.forEach(([key, mins, days]) => {
      if (!days.includes(dow)) return;
      const s = new Date(y, m - 1, dd, 9, 0, 0);
      const e = new Date(s.getTime() + mins * 60000);
      ins.run(u.id, aid, s.toISOString(), e.toISOString(), mins * 60, dIso, DOW[dow], key);
    });
  }
  // Un peu de temps cette semaine (périodes en cours) : le « réalisé » n'est pas nul.
  [[K.produit, 90], [K.communaute, 40]].forEach(([key, mins]) => {
    const dIso = monday; const [y, m, dd] = dIso.split('-').map(Number);
    const s = new Date(y, m - 1, dd, 14, 0, 0);
    ins.run(u.id, aid, s.toISOString(), new Date(s.getTime() + mins * 60000).toISOString(), mins * 60, dIso, DOW[s.getDay()], key);
  });

  // ---- Plans et objectifs de période (période 1 terminée, période 2 en cours)
  const mkPlan = db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)');
  [K.juridique, K.finance, K.produit, K.communaute].forEach((k) => mkPlan.run(aid, k, planStart, now));
  const done2 = Math.round(goals.actualSecondsForRange(aid, monday, todayIso) / 60);
  // Période 1 : objectifs non atteints.
  goals.setMainGoal(aid, K.juridique, 1, 'Réviser et publier les nouvelles conditions d\'utilisation', '', 600);
  goals.setMainGoal(aid, K.produit, 1, 'Lancer la bêta fermée à dix testeurs', '', 900);
  // Objectif hebdomadaire passé non atteint (badge « en retard de N j »). Sur Finance : l'estimation par similarité
  // (temps réel de la semaine) gonflerait les tâches de la catégorie qui le porte et les rendrait « longues ».
  goals.setWeekly(aid, K.finance, 1, 4, 'Classer les pièces comptables du trimestre');
  // Période 2 : Produit (rempli : la période suivante d'un report est déjà occupée), cible irréaliste ;
  // Finance : cible irréaliste ET en retard (recalcul) ; Communauté : en avance (recalcul). Juridique : période 2 vide.
  goals.setMainGoal(aid, K.produit, 2, 'Livrer la version 1.0 publique', '', 4000);
  goals.setMainGoal(aid, K.finance, 2, 'Boucler le budget annuel et la déclaration', '', 1800);
  goals.setMainGoal(aid, K.communaute, 2, 'Animer deux rencontres de la communauté', '', done2 + 150);

  // ---- Plafonds de temps (pôle Produit : jour + semaine ; secteur Juridique : jour)
  timecaps.setCaps(u.id, aid, K.produit, { maxDayMinutes: 60, maxWeekMinutes: 150 });
  timecaps.setCaps(u.id, aid, K.juridique, { maxDayMinutes: 30, maxWeekMinutes: null });

  // ---- Tâches
  const budget = overload.budgetFor(aid, u.id);
  // Les 4 tâches en retard comptent aussi dans la charge du jour : juste assez pour dépasser le budget sans tout éparpiller.
  const nOver = Math.max(2, Math.ceil(budget / 30) - 3);
  const insTask = db.prepare(`INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, dueDate, dueDateAuto)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)`);
  let pos = 0;
  const addTask = (key, label, dueOffset, auto) => {
    const { subProject, section } = goalstasks.ensureCategoryTaskSection(aid, u.id, key);
    insTask.run(subProject.id, section.id, label, pos += 1, now, day(dueOffset), auto);
  };
  // 1 Journée surchargée (aujourd'hui) : tâches déplaçables (auto) + 1 tâche à date fixée qui ne bouge pas.
  for (let i = 1; i <= nOver; i += 1) addTask(K.communaute, 'Message aux membres n°' + i, 0, 1);
  addTask(K.communaute, 'Rencontre des membres (date fixée)', 0, 0);
  // 2 Plafonds : Produit 4 tâches dans la même journée (+2) et 3 de plus la même semaine ; Juridique 3 tâches un jour.
  for (let i = 1; i <= 4; i += 1) addTask(K.produit, 'Maquette de l\'écran n°' + i, 2, 1);
  for (let i = 5; i <= 6; i += 1) addTask(K.produit, 'Maquette de l\'écran n°' + i, 3, 1);
  for (let i = 1; i <= 3; i += 1) addTask(K.juridique, 'Clause à relire n°' + i, 4, 1);
  // 3 / 5 Non réalisées + badge « en retard de N j » : dates par défaut (2) et une date fixée (0).
  addTask(K.communaute, 'Relancer les partenaires du printemps', -3, 2);
  addTask(K.finance, 'Envoyer la facture de septembre', -2, 2);
  addTask(K.produit, 'Corriger le bogue du chronomètre', -6, 2);
  addTask(K.juridique, 'Signer chez le notaire (date fixée)', -5, 0);

  // ---- 6 Propositions de recalcul : on ne garde que Communauté (en avance) et Finance (en retard).
  goalsrecalc.runForUser(u.id, aid, todayIso);
  db.prepare("DELETE FROM goal_recalc_proposals WHERE activityId = ? AND category NOT IN (?, ?)").run(aid, K.communaute, K.finance);

  return { activityId: aid, keys: K, budget };
}

// Au démarrage : staging + SEED_SCENARIOS=1 seulement, sinon rien.
function seedScenariosOnStaging() {
  if (!isStaging() || process.env.SEED_SCENARIOS !== '1') return null;
  const r = seedScenarios();
  console.log('[scenarios-staging]', JSON.stringify(r));
  return r;
}

module.exports = { NAME, isStaging, seedScenarios, resetScenarios, seedScenariosOnStaging };
