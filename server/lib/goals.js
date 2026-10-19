// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026, noesis-timetracker-feuille-de-route-produit.md).
//
// Cadré avec Emilien avant tout code (AskUserQuestion, plusieurs allers-
// retours) — règles à respecter strictement par tout chantier futur sur ce
// volet :
//
//  1. Le planning est propre à CHAQUE (ACTIVITÉ, CATÉGORIE), jamais global à
//     la personne (une activité partagée a UN SEUL plan par catégorie,
//     visible et modifiable par tous ses membres actuels — même principe
//     que Sous-projets, pas un plan par membre).
//  2. Les objectifs hebdomadaires d'une période se fixent INDÉPENDAMMENT par
//     l'utilisateur — CE FICHIER ne décompose JAMAIS un grand objectif en
//     objectifs hebdomadaires. L'estimation par similarité ci-dessous ne
//     fait que SUGGÉRER UNE DURÉE pour un objectif déjà écrit par
//     l'utilisateur ; elle ne génère ni ne modifie jamais le texte d'un
//     objectif.
//     ⚠️ RENVERSÉ le 26 septembre 2026 (reconfirmé par Emilien, discussion A
//     — Offre1) : la clause d'origine allait plus loin, présentant cette
//     décomposition comme « le différenciateur de l'offre payante MANAGER »
//     — ce n'est plus le cas, le remplissage IA hebdomadaire est désormais
//     GRATUIT, non gaté par activity_offre1. La décomposition elle-même
//     n'est toujours PAS codée ICI (ce fichier reste pur/synchrone, sans
//     dépendance IA) : voir le nouveau server/lib/goalsweeklyauto.js, séparé,
//     déclenché depuis server/routes/goals.js juste après setMainGoal.
//
// 14 septembre 2026 (deuxième passage, demande d'Emilien) : le planning
// n'est plus un mais TROIS par activité, un par catégorie fixe — les 3
// sous-catégories identifiées pour structurer une entreprise, reprises du
// concept CRM historique (voir noesis-timetracker-contexte-technique.md,
// section « Origine ») : Entreprise / Communauté / Produit. Chaque catégorie
// a son propre cycle de 13 périodes de 4 semaines, sa propre bande de
// tendance, son propre arbre de grands objectifs — trois plannings
// indépendants, pas un seul planning étiqueté. Ajouté dans la foulée, sur
// demande d'Emilien : chaque objectif hebdomadaire peut être confié à UN
// membre de l'activité (assignedUserId), pour que le travail à faire dans
// chaque catégorie se répartisse visiblement entre les membres — le grand
// objectif de période, lui, reste collectif (jamais assigné à une seule
// personne, même principe que le reste du plan).
//
// Structure (par catégorie) : un cycle de 13 périodes de 4 semaines (52
// semaines), démarré le jour où l'utilisateur crée son premier objectif
// dans CETTE catégorie sur cette activité (pas forcément le 1er janvier, et
// les 3 catégories démarrent chacune à leur propre date, indépendamment).
// Un deuxième cycle s'enchaîne automatiquement après la période 13
// (periodNumber continue, cycleIndex passe à 2).

const db = require('../db');
const { postActivityMessage } = require('./community');

// Objectif de l'année : un texte libre par secteur (ou par pôle
// sans secteur) et par année, saisi par l'utilisateur. Gratuit : jamais
// réécrit par Noèsis ; c'est la cible des recalculs de l'Offre 1.
db.exec(`CREATE TABLE IF NOT EXISTS goal_year_goals (
  activityId INTEGER NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  text TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (activityId, category, year)
)`);

// Secteurs par année : un secteur est visible dans l'arbre d'une
// année Y si fromYear est NULL ou ≤ Y, et s'il n'est pas retiré ou Y ≤ removedYear.
// removedFromDate : début de la période en cours au retrait (périodes suivantes supprimées).
(function ensureSectorYearColumns() {
  const cols = db.prepare('PRAGMA table_info(activity_goal_categories)').all().map((c) => c.name);
  if (!cols.includes('fromYear')) db.exec('ALTER TABLE activity_goal_categories ADD COLUMN fromYear INTEGER');
  if (!cols.includes('removedYear')) db.exec('ALTER TABLE activity_goal_categories ADD COLUMN removedYear INTEGER');
  if (!cols.includes('removedFromDate')) db.exec('ALTER TABLE activity_goal_categories ADD COLUMN removedFromDate TEXT');
})();

function currentYear() { return Number(todayLocal().slice(0, 4)); }

// Années d'arbre périodique créées pour une activité (au-delà de l'année en cours,
// toujours présente). « Nouveau + » crée toujours l'année suivant la plus haute.
db.exec(`CREATE TABLE IF NOT EXISTS goal_years (
  activityId INTEGER NOT NULL,
  year INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (activityId, year)
)`);

function maxYearFor(activityId) {
  const r = db.prepare('SELECT MAX(year) AS y FROM goal_years WHERE activityId = ?').get(activityId);
  return Math.max(currentYear(), r && r.y ? r.y : 0);
}

function listYears(activityId) {
  const cur = currentYear();
  const plans = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ?').all(activityId);
  const first = plans.length ? Math.min(...plans.map((p) => yearOfPlanStart(p.startDate))) : cur;
  const years = [];
  for (let y = maxYearFor(activityId); y >= Math.min(first, cur); y -= 1) years.push(y);
  const max = maxYearFor(activityId);
  return { years, currentYear: cur, maxYear: max, deletable: max > cur && yearIsEmpty(activityId, max) };
}

function createNextYear(activityId) {
  const year = maxYearFor(activityId) + 1;
  db.prepare('INSERT OR IGNORE INTO goal_years (activityId, year, createdAt) VALUES (?, ?, ?)')
    .run(activityId, year, new Date().toISOString());
  return year;
}

function yearIsEmpty(activityId, year) {
  const rows = db.prepare('SELECT id, periodNumber, category, mainGoalText FROM goal_periods WHERE activityId = ?').all(activityId);
  const plans = {};
  db.prepare('SELECT category, startDate FROM activity_goal_plans WHERE activityId = ?').all(activityId).forEach((p) => { plans[p.category] = p.startDate; });
  for (const r of rows) {
    if (!plans[r.category]) continue;
    const cycleYear = yearOfPlanStart(plans[r.category]) + Math.floor((r.periodNumber - 1) / PERIODS_PER_CYCLE);
    if (cycleYear !== year) continue;
    if (String(r.mainGoalText || '').trim()) return false;
    const w = db.prepare("SELECT 1 FROM goal_weekly WHERE periodId = ? AND TRIM(COALESCE(text, '')) <> '' LIMIT 1").get(r.id);
    if (w) return false;
  }
  return !db.prepare('SELECT 1 FROM goal_year_goals WHERE activityId = ? AND year = ?').get(activityId, year);
}

// Retire une année FUTURE et vide (jamais l'année en cours ni une année passée).
function deleteYear(activityId, year) {
  if (year <= currentYear()) throw Object.assign(new Error('Seules les années futures peuvent être supprimées.'), { statusCode: 400 });
  if (year !== maxYearFor(activityId)) throw Object.assign(new Error('Supprimez d’abord les années suivantes.'), { statusCode: 400 });
  if (!yearIsEmpty(activityId, year)) throw Object.assign(new Error('Cette année contient déjà des objectifs.'), { statusCode: 400 });
  const plans = db.prepare('SELECT category, startDate FROM activity_goal_plans WHERE activityId = ?').all(activityId);
  plans.forEach((pl) => {
    const k = year - yearOfPlanStart(pl.startDate);
    if (k < 0) return;
    const lo = k * PERIODS_PER_CYCLE + 1, hi = lo + PERIODS_PER_CYCLE - 1;
    const ids = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber BETWEEN ? AND ?').all(activityId, pl.category, lo, hi).map((r) => r.id);
    ids.forEach((id) => {
      detachCarryLinks([id]);
      db.prepare('DELETE FROM goal_weekly WHERE periodId = ?').run(id);
      db.prepare('DELETE FROM goal_periods WHERE id = ?').run(id);
    });
  });
  db.prepare('DELETE FROM goal_years WHERE activityId = ? AND year = ?').run(activityId, year);
}

function getYearGoals(activityId, year) {
  const out = {};
  db.prepare('SELECT category, text FROM goal_year_goals WHERE activityId = ? AND year = ?')
    .all(activityId, Number(year) || currentYear()).forEach((r) => { out[r.category] = r.text; });
  return out;
}

function setYearGoal(activityId, category, text, year) {
  const y = Number(year) || currentYear();
  if (y < currentYear()) throw Object.assign(new Error('Une année passée ne se modifie plus.'), { statusCode: 400 });
  const clean = String(text || '').trim().slice(0, 300);
  if (!clean) {
    db.prepare('DELETE FROM goal_year_goals WHERE activityId = ? AND category = ? AND year = ?').run(activityId, category, y);
    return '';
  }
  db.prepare(`INSERT INTO goal_year_goals (activityId, category, year, text, updatedAt) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(activityId, category, year) DO UPDATE SET text = excluded.text, updatedAt = excluded.updatedAt`)
    .run(activityId, category, y, clean, new Date().toISOString());
  return clean;
}

const PERIOD_DAYS = 28;
const WEEK_DAYS = 7;
const WEEKS_PER_PERIOD = 4;
const PERIODS_PER_CYCLE = 13;
const STATUSES = ['non_atteint', 'partiel', 'atteint'];

const CATEGORIES = ['entreprise', 'communaute', 'produit'];
const CATEGORY_LABELS = { entreprise: 'Entreprise', communaute: 'Communauté', produit: 'Produit' };

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

const {
  MAX_CUSTOM_CATEGORIES,
  MAX_SECTEURS_PER_POLE,
  DEFAULT_CATEGORY_KEY,
  DEFAULT_CATEGORY_LABEL,
  isCustomized,
  categoriesForActivity,
  isValidCategoryForActivity,
  assertCategoryForActivity,
  isReadableCategory,
  assertReadableCategory,
  categoryEverExisted,
  frozenCategoriesForActivity,
  categoryLabelFor,
  ensureDefaultCategory,
  addCategory,
  migratePoleDirectDataToSecteur,
  renameCategory,
  detachCarryLinks,
  removeCategory,
  secteurRemovalInfo,
  previewCategoryRemoval,
  reorderCategories,
  secteursForPole,
  reorderSecteurs,
  moveSecteurToPole,
  isValidSecteurForActivity,
  isValidCategoryOrSecteurForActivity,
  assertCategoryOrSecteurForActivity,
  gridColumnsForPole,
  parentKeyFor,
  resolveToPole,
} = require('./categories');
// Gestion des pôles/secteurs : voir server/lib/categories.js (ré-exportée plus bas).
// ---------------------------------------------------------------------------
// Dates — même précaution qu'ailleurs dans le projet (calendarfeed.js,
// duereminders.js) : arithmétique en UTC, jamais en heure locale, pour
// qu'un changement d'heure ne décale rien.
//
// ⚠️ Dupliqué délibérément depuis server/lib/duereminders.js (todayLocal/
// daysBetween y sont identiques) plutôt qu'importé : duereminders.js
// entraînerait avec lui server/lib/push.js (VAPID, web-push) comme
// dépendance de ce fichier, pour deux fonctions de date qui n'ont rien à voir
// avec les notifications. Même raisonnement que period.js, volontairement
// minuscule et sans dépendance inutile.
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

function addDays(isoDay, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 16 septembre 2026 (discussion Objectifs — D, 3ᵉ passage, sur demande directe
// d'Emilien : « je souhaite que l'objectif hebdomadaire soit fixé le dimanche
// et non le lundi », cadré par AskUserQuestion avant tout code, option retenue
// « nouveaux plans seulement »). weekBounds()/periodBounds() restent un pur
// décalage depuis planStartDate (aucune logique calendaire dans ces deux
// fonctions, volontairement inchangées : partagées avec B et la fenêtre de
// capacité 8 semaines de C, qui suppose des semaines de 7 jours uniformes).
// Ramène isoDay au lundi de sa semaine calendaire (convention ISO, jour 1 =
// lundi) : un plan qui démarre un lundi voit chacune de ses semaines de 7
// jours se terminer un vrai dimanche calendaire — exactement le jour déjà
// traité comme « dernier jour de semaine / dimanche » côté UI (voir encart
// (12)). N'affecte QUE les plans créés à partir de maintenant, via ensurePlan
// ci-dessous : les plans déjà actifs gardent leur startDate existant, non
// retouché (ensurePlan reste par ailleurs strictement idempotent).
function mostRecentMonday(isoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return isoDay;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dow = d.getUTCDay(); // 0 = dimanche .. 6 = samedi
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// Grille calendaire : la semaine 1 de chaque année commence au PREMIER LUNDI de
// janvier (lundi du 1er au 7 janvier) ; 13 périodes de 4 semaines = 52 semaines
// par an. Les jours avant l'ancre ou après la semaine 52 n'appartiennent à aucune
// semaine (rattachés à la période la plus proche pour la logique, jamais affichés
// comme une semaine).
function yearAnchor(year) {
  const jan1 = String(year) + '-01-01';
  const m = mostRecentMonday(jan1);
  return m === jan1 ? jan1 : addDays(m, 7);
}
// Ancienne ancre (jusqu'au 16 oct. 2026) : lundi de la semaine du 1er janvier.
function legacyYearAnchor(year) {
  return mostRecentMonday(String(year) + '-01-01');
}
function yearGridStart(isoDay) {
  let y = Number(String(isoDay).slice(0, 4));
  if (isoDay >= yearAnchor(y + 1)) return yearAnchor(y + 1);
  while (isoDay < yearAnchor(y)) y -= 1;
  return yearAnchor(y);
}

// Année (calendaire) de la grille d'un plan : le startDate d'un plan est l'ancre
// (premier lundi de janvier) de sa première année.
function yearOfPlanStart(planStartDate) {
  return Number(String(planStartDate).slice(0, 4));
}

// Période n (continue : 13 par année) : l'année k du plan commence au premier
// lundi de janvier de (première année + k), 13 périodes de 28 jours.
function periodBounds(planStartDate, periodNumber) {
  const y0 = yearOfPlanStart(planStartDate);
  const k = Math.floor((periodNumber - 1) / PERIODS_PER_CYCLE);
  const i = (periodNumber - 1) % PERIODS_PER_CYCLE;
  const anchor = yearAnchor(y0 + k);
  const start = addDays(anchor, i * PERIOD_DAYS);
  const end = addDays(anchor, (i + 1) * PERIOD_DAYS - 1);
  return { start, end, cycleIndex: k + 1, periodIndexInCycle: i + 1 };
}

// Numéro de semaine dans l'année (1 à 52) : (période du cycle - 1) * 4 + weekIndex.
function weekOfYear(periodIndexInCycle, weekIndex) {
  return (Number(periodIndexInCycle) - 1) * 4 + Number(weekIndex);
}

function weekBounds(periodStart, weekIndex) {
  const start = addDays(periodStart, (weekIndex - 1) * WEEK_DAYS);
  const end = addDays(periodStart, weekIndex * WEEK_DAYS - 1);
  return { start, end };
}

// Numéro de période (1-based, continu sur toute la vie du plan) contenant le
// jour `isoDay`. Un jour antérieur au démarrage du plan (ne devrait pas
// arriver) retombe sur la période 1 plutôt que sur un nombre négatif.
function periodNumberForDate(planStartDate, isoDay) {
  const y0 = yearOfPlanStart(planStartDate);
  const dayYear = Number(String(isoDay).slice(0, 4));
  if (!dayYear) return 1;
  let y = dayYear + 1;
  while (y > y0 && yearAnchor(y) > isoDay) y -= 1;
  const k = y - y0;
  if (k < 0) return 1;
  const days = daysBetween(yearAnchor(y), isoDay);
  if (days === null || days < 0) return 1;
  // Les jours après la semaine 52 (hors grille) retombent sur la période 13.
  const i = Math.min(PERIODS_PER_CYCLE - 1, Math.floor(days / PERIOD_DAYS));
  return k * PERIODS_PER_CYCLE + i + 1;
}

// ---------------------------------------------------------------------------
// Le plan (une ligne par (activité, catégorie), jamais recréée)

function getPlan(activityId, category) {
  return db.prepare('SELECT * FROM activity_goal_plans WHERE activityId = ? AND category = ?')
    .get(activityId, category) || null;
}

// Démarre le plan de cette catégorie au jour d'aujourd'hui s'il n'existe pas
// encore. Idempotent : un plan déjà démarré n'est jamais réinitialisé, même
// si cette fonction est appelée à nouveau.
function ensurePlan(activityId, category) {
  const existing = getPlan(activityId, category);
  if (existing) return existing;
  // 16 septembre 2026 : lundi de la semaine en cours plutôt que le jour exact
  // d'activation — voir le commentaire de mostRecentMonday() ci-dessus. Ne
  // s'applique qu'à cette toute première création du plan (idempotent).
  const startDate = yearGridStart(todayLocal());
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, category, startDate, createdAt);
  return getPlan(activityId, category);
}

// ---------------------------------------------------------------------------
// Réalignement rétroactif ponctuel (16 septembre 2026, discussion Objectifs —
// D, 6ᵉ passage) — sur demande explicite d'Emilien, après qu'il a vu l'effet
// pratique du choix « nouveaux plans seulement » du 3ᵉ passage (voir
// noesis-timetracker-chantiers-en-cours.md, encart D 5ᵉ/6ᵉ passage) :
// mostRecentMonday() ci-dessus ne s'applique qu'aux plans créés à partir de ce
// changement — un plan démarré avant garde son ancien repère tant que cette
// fonction n'est pas appelée explicitement (jamais automatiquement, jamais
// depuis une route HTTP — réservée à scripts/realign-goals-monday.js, lancé à
// la main par Emilien pour le ou les plans concernés).
//
// Décale UNIQUEMENT le plan visé et TOUTES ses périodes déjà matérialisées
// (goal_periods.startDate/endDate, posées une fois pour toutes à la création
// de chaque période — voir ensurePeriodRow — jamais recalculées depuis
// plan.startDate par la suite, d'où la nécessité de les reprendre une par une
// ici plutôt que de se contenter de changer plan.startDate) du même delta
// CONSTANT (0 à -6 jours, jamais plus) que celui qui ramènerait la date de
// départ du plan à son lundi. Ne touche JAMAIS periodNumber, mainGoalText, le
// statut, les objectifs hebdomadaires eux-mêmes (texte/estimation/assignation)
// ni goal_weekly — seules les fenêtres de dates (stockées sur goal_periods,
// lues en direct pour goal_weekly via weekBounds) se déplacent.
//
// Risque expliqué à Emilien et accepté par lui avant tout code
// (`AskUserQuestion`) : actualMinutes n'est jamais stocké, toujours recalculé
// à la volée depuis ces dates (actualSecondsForRange) — le temps déjà
// chronométré aux abords d'une frontière de semaine/période peut donc se
// retrouver comptabilisé dans une période/semaine adjacente après ce décalage.
// Idempotent : un plan déjà démarré un lundi n'est pas modifié (delta = 0,
// aucune écriture).
function realignPlanToMonday(activityId, category) {
  const plan = getPlan(activityId, category);
  if (!plan) return null;
  const newStart = mostRecentMonday(plan.startDate);
  if (newStart === plan.startDate) {
    return { changed: false, deltaDays: 0, periodsShifted: 0 };
  }
  const delta = daysBetween(plan.startDate, newStart);
  db.prepare('UPDATE activity_goal_plans SET startDate = ? WHERE activityId = ? AND category = ?')
    .run(newStart, activityId, category);
  const periods = db.prepare('SELECT id, startDate, endDate FROM goal_periods WHERE activityId = ? AND category = ?')
    .all(activityId, category);
  const updatePeriod = db.prepare('UPDATE goal_periods SET startDate = ?, endDate = ? WHERE id = ?');
  periods.forEach((p) => {
    updatePeriod.run(addDays(p.startDate, delta), addDays(p.endDate, delta), p.id);
  });
  return { changed: true, deltaDays: delta, periodsShifted: periods.length, oldStartDate: plan.startDate, newStartDate: newStart };
}

// Liste, pour un usage en script CLI uniquement, tous les plans dont le
// repère n'est pas (encore) un lundi — jamais appelée depuis une route HTTP.
function plansNeedingRealignment() {
  const plans = db.prepare(`
    SELECT p.activityId AS activityId, p.category AS category, p.startDate AS startDate, a.name AS activityName
    FROM activity_goal_plans p
    JOIN activities a ON a.id = p.activityId
    ORDER BY a.name, p.category
  `).all();
  return plans
    .filter((p) => mostRecentMonday(p.startDate) !== p.startDate)
    .map((p) => ({ ...p, wouldBecome: mostRecentMonday(p.startDate) }));
}

// Migration (à lancer explicitement : scripts/migrate-year-grid.js) : cale
// chaque plan existant sur la grille de l'année (décalage constant de ses
// périodes, renumérotation). Idempotent ; `dryRun` ne modifie rien.
function isYearAnchor(isoDay) {
  const y = Number(String(isoDay).slice(0, 4));
  return isoDay === yearAnchor(y);
}
function migratePlansToYearGrid(dryRun) {
  const plans = db.prepare('SELECT activityId, category, startDate FROM activity_goal_plans').all();
  const report = [];
  plans.forEach((pl) => {
    if (isYearAnchor(pl.startDate)) return;
    // Cas courant : plan calé sur l'ancienne ancre (lundi de la semaine
    // du 1er janvier) -> recalage sur le premier lundi de janvier. Les numéros de
    // période ne changent pas ; seules les dates (décalage de 0 ou 7 jours) bougent.
    const legacyYear = Number(addDays(pl.startDate, 6).slice(0, 4));
    if (pl.startDate === legacyYearAnchor(legacyYear)) {
      const newStart = yearAnchor(legacyYear);
      report.push({ activityId: pl.activityId, category: pl.category, oldStart: pl.startDate, newStart, shiftDays: daysBetween(pl.startDate, newStart) });
      if (dryRun) return;
      db.exec('BEGIN');
      try {
        const rows = db.prepare('SELECT id, periodNumber FROM goal_periods WHERE activityId = ? AND category = ?').all(pl.activityId, pl.category);
        const upd = db.prepare('UPDATE goal_periods SET startDate = ?, endDate = ? WHERE id = ?');
        rows.forEach((p) => { const b = periodBounds(newStart, p.periodNumber); upd.run(b.start, b.end, p.id); });
        db.prepare('UPDATE activity_goal_plans SET startDate = ? WHERE activityId = ? AND category = ?').run(newStart, pl.activityId, pl.category);
        db.exec('COMMIT');
      } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
      return;
    }
    const A = yearGridStart(pl.startDate);
    const d = ((daysBetween(A, pl.startDate) % PERIOD_DAYS) + PERIOD_DAYS) % PERIOD_DAYS;
    const delta = d <= PERIOD_DAYS / 2 ? -d : PERIOD_DAYS - d;
    report.push({ activityId: pl.activityId, category: pl.category, oldStart: pl.startDate, newStart: A, shiftDays: delta });
    if (dryRun) return;
    const periods = db.prepare('SELECT id, startDate FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber').all(pl.activityId, pl.category);
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE goal_periods SET periodNumber = -periodNumber WHERE activityId = ? AND category = ?').run(pl.activityId, pl.category);
      const upd = db.prepare('UPDATE goal_periods SET startDate = ?, endDate = ?, periodNumber = ?, cycleIndex = ?, periodIndexInCycle = ? WHERE id = ?');
      periods.forEach((p) => {
        const num = Math.round(daysBetween(A, addDays(p.startDate, delta)) / PERIOD_DAYS) + 1;
        const b = periodBounds(A, num);
        upd.run(b.start, b.end, num, b.cycleIndex, b.periodIndexInCycle, p.id);
      });
      db.prepare('UPDATE activity_goal_plans SET startDate = ? WHERE activityId = ? AND category = ?').run(A, pl.activityId, pl.category);
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  });
  return report;
}

// ---------------------------------------------------------------------------
// Membres de l'activité — pour l'assignation des objectifs hebdomadaires et
// la vue de répartition côté client. Toujours renvoyé avec le planning
// (planningForActivity) plutôt que par un nouvel appel séparé.
function membersForActivity(activityId) {
  return db.prepare(`
    SELECT u.id AS id, u.name AS name, m.color AS color
    FROM activity_members m JOIN users u ON u.id = m.userId
    WHERE m.activityId = ?
    ORDER BY m.position, m.joinedAt
  `).all(activityId);
}

// ---------------------------------------------------------------------------
// Temps réel chronométré — SUR TOUTE L'ACTIVITÉ (tous les membres actuels
// confondus, pas seulement l'auteur de l'objectif) : le planning est propre
// à l'activité, pas à la personne (règle 1 ci-dessus), donc son bilan de
// temps l'est aussi. Non scindé par catégorie : le temps chronométré ne
// distingue pas dans quelle catégorie d'objectif il a été passé (aucune
// demande d'Emilien en ce sens ; le chrono reste à un seul niveau, celui de
// l'activité).
function actualSecondsForRange(activityId, startDate, endDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE activityId = ? AND isoDate BETWEEN ? AND ?
  `).get(activityId, startDate, endDate);
  return row.seconds;
}

// ---------------------------------------------------------------------------
// Estimation par similarité — cadré avec Emilien le 12 septembre 2026.
//
// Ne compare QUE des objectifs du même niveau (grand objectif entre eux,
// hebdomadaires entre eux), de la même activité ET de la même catégorie :
// comparer un grand objectif de 4 semaines à un objectif hebdomadaire, ou un
// objectif "Produit" à un objectif "Communauté", n'aurait aucun sens
// d'échelle ni de nature.
const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'à', 'au',
  'aux', 'pour', 'sur', 'en', 'dans', 'par', 'avec', 'sans', 'ce', 'cette',
  'ces', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'plus', 'que', 'qui',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS_FR.has(t));
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter += 1; });
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

// Objectifs passés DE CETTE ACTIVITÉ ET DE CETTE CATÉGORIE, du même niveau,
// dont le temps réel est déjà connu (la semaine/période correspondante est
// terminée) — comparer à un objectif encore en cours donnerait un temps réel
// tronqué, trompeur.
function pastSamplesFor(activityId, category, scope) {
  const today = todayLocal();
  if (scope === 'main') {
    const rows = db.prepare(`
      SELECT mainGoalText AS text, startDate, endDate
      FROM goal_periods
      WHERE activityId = ? AND category = ? AND endDate < ? AND mainGoalText != ''
    `).all(activityId, category, today);
    return rows.map((r) => ({
      text: r.text,
      minutes: Math.round(actualSecondsForRange(activityId, r.startDate, r.endDate) / 60),
    }));
  }
  const rows = db.prepare(`
    SELECT w.text AS text, w.weekIndex AS weekIndex, p.startDate AS periodStart
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.text != ''
  `).all(activityId, category);
  return rows
    .map((r) => {
      const b = weekBounds(r.periodStart, r.weekIndex);
      if (b.end >= today) return null; // semaine pas encore terminée
      return { text: r.text, minutes: Math.round(actualSecondsForRange(activityId, b.start, b.end) / 60) };
    })
    .filter(Boolean);
}

// Renvoie { minutes, confidence, basedOn, source } — `minutes` est null si
// rien de comparable n'existe encore (l'utilisateur saisit alors lui-même).
// `confidence` grandit avec le nombre de cas déjà vécus (idée d'Emilien au
// cadrage initial), jamais au-delà de 1.
function estimateForGoal(activityId, category, scope, text) {
  const samples = pastSamplesFor(activityId, category, scope);
  if (!samples.length) return { minutes: null, confidence: 0, basedOn: 0, source: 'none' };

  const targetTokens = new Set(tokenize(text));
  const scored = samples
    .map((s) => ({ ...s, score: jaccard(targetTokens, new Set(tokenize(s.text))) }))
    .filter((s) => s.score > 0.15);

  if (scored.length) {
    const totalWeight = scored.reduce((sum, s) => sum + s.score, 0);
    const minutes = Math.round(scored.reduce((sum, s) => sum + s.score * s.minutes, 0) / totalWeight);
    return { minutes, confidence: Math.min(1, scored.length / 5), basedOn: scored.length, source: 'similarity' };
  }

  // Rien d'assez proche par les mots-clés : repli sur la moyenne générale des
  // objectifs passés de cette activité/catégorie, à niveau de confiance
  // réduit — toujours une suggestion, jamais un texte généré.
  const avg = Math.round(samples.reduce((sum, s) => sum + s.minutes, 0) / samples.length);
  return { minutes: avg, confidence: Math.min(0.4, samples.length / 10), basedOn: samples.length, source: 'similarity-fallback' };
}

// ---------------------------------------------------------------------------
// Score de justesse personnel (estimé vs réel), idée d'Emilien au cadrage
// initial, incluse dès la v1. null tant qu'il n'y a rien à comparer (pas
// d'estimation, ou temps réel pas encore connu).
function accuracyScore(estimateMinutes, actualMinutes) {
  if (estimateMinutes == null || actualMinutes == null) return null;
  if (estimateMinutes <= 0 && actualMinutes <= 0) return 1;
  const denom = Math.max(estimateMinutes, actualMinutes, 1);
  return Math.max(0, 1 - Math.abs(estimateMinutes - actualMinutes) / denom);
}

// ---------------------------------------------------------------------------
// Lecture / création des périodes

function rowToPeriod(row) {
  return row ? { ...row } : null;
}

function ensurePeriodRow(activityId, category, periodNumber, planStartDate) {
  const existing = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);
  if (existing) return rowToPeriod(existing);

  const bounds = periodBounds(planStartDate, periodNumber);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO goal_periods
      (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run(activityId, category, periodNumber, bounds.cycleIndex, bounds.periodIndexInCycle, bounds.start, bounds.end, createdAt);

  return rowToPeriod(db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber));
}

// Garantit l'existence de toutes les périodes de 1 jusqu'à `upToPeriodNumber`
// inclus (pas de trou dans la séquence, même si l'utilisateur n'ouvre le
// planning qu'après plusieurs périodes écoulées).
function ensurePeriodsUpTo(activityId, category, upToPeriodNumber, planStartDate) {
  for (let n = 1; n <= upToPeriodNumber; n += 1) ensurePeriodRow(activityId, category, n, planStartDate);
}

function weeklyForPeriod(periodId) {
  return db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? ORDER BY weekIndex, id').all(periodId);
}

// ---------------------------------------------------------------------------
// Report automatique d'un objectif hebdomadaire non atteint (12 septembre
// 2026, décidé par Emilien) — calculé À LA VOLÉE (pas de tâche planifiée
// dédiée) chaque fois que le planning d'une (activité, catégorie) est
// ouvert : plus simple que d'ajouter un nouveau minuteur serveur, et le
// résultat est identique puisque rien n'affiche jamais un objectif dont la
// semaine n'est pas encore terminée.
//
// Ne déplace QUE ce que l'utilisateur avait déjà écrit (texte, estimation,
// assignation) — ne génère jamais un nouvel objectif ni n'en modifie le
// contenu.
function carryOverWeekly(activityId, category, planStartDate) {
  const today = todayLocal();

  const pending = db.prepare(`
    SELECT w.*, p.startDate AS periodStart, p.periodNumber AS periodNumber
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.carriedToId IS NULL AND w.text != ''
  `).all(activityId, category);

  pending.forEach((w) => {
    const bounds = weekBounds(w.periodStart, w.weekIndex);
    if (bounds.end >= today) return; // semaine pas encore terminée

    // Statut toujours non tranché à la fin de la semaine : compte comme non
    // atteint (l'utilisateur n'est jamais venu le marquer), condition de
    // report. Un objectif explicitement marqué "atteint" ou "partiel" par
    // l'utilisateur n'est jamais reporté.
    if (w.status == null) {
      db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run('non_atteint', w.id);
      recomputePeriodStatus(w.periodId);
    }
    if (w.status !== null && w.status !== 'non_atteint') return;

    // Semaine cible : la suivante dans la même période, ou la semaine 1 de
    // la période suivante si on était déjà en semaine 4.
    let targetPeriodNumber = w.periodNumber;
    let targetWeekIndex = w.weekIndex + 1;
    if (targetWeekIndex > WEEKS_PER_PERIOD) {
      targetPeriodNumber += 1;
      targetWeekIndex = 1;
    }
    const targetPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);

    // Semaine cible déjà occupée : on cherche la première semaine libre de
    // cette même période plutôt que d'écraser l'objectif qui s'y trouve déjà
    // — s'il n'y en a aucune, l'objectif attend la période suivante.
    while (true) {
      const occupied = db.prepare('SELECT 1 FROM goal_weekly WHERE periodId = ? AND weekIndex = ?')
        .get(targetPeriod.id, targetWeekIndex);
      if (!occupied) break;
      targetWeekIndex += 1;
      if (targetWeekIndex > WEEKS_PER_PERIOD) {
        targetPeriodNumber += 1;
        targetWeekIndex = 1;
        const nextPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);
        targetPeriod.id = nextPeriod.id;
      }
    }

    const createdAt = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO goal_weekly (periodId, weekIndex, text, description, estimateMinutes, estimateSource, estimateConfidence, assignedUserId, carriedOverFromId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(targetPeriod.id, targetWeekIndex, w.text, w.description || '', w.estimateMinutes, w.estimateSource, w.estimateConfidence, w.assignedUserId, w.id, createdAt);

    db.prepare('UPDATE goal_weekly SET carriedToId = ? WHERE id = ?').run(Number(info.lastInsertRowid), w.id);
  });
}

// ---------------------------------------------------------------------------
// Bilan automatique de fin de période — ENVOI AUTOMATIQUE (décision
// d'Emilien, 12 septembre 2026 : pas de bouton "Partager", le bilan part de
// lui-même dans le fil de discussion de l'activité dès que la période se
// termine). Publié une seule fois par période (bilanPostedAt) et seulement
// pour une activité PARTAGÉE (>= 2 membres) : une activité solo n'a pas de
// fil de discussion, voir noesis-timetracker-activite.md. Le nom de la
// catégorie est indiqué dans le texte (14 septembre 2026) puisqu'une
// activité publie désormais jusqu'à 3 bilans indépendants par période
// écoulée, un par catégorie.
function buildBilanText(activityName, category, period, weeklies) {
  const doneCount = weeklies.filter((w) => w.status === 'atteint').length;
  const actualMinutes = Math.round(actualSecondsForRange(period.activityId, period.startDate, period.endDate) / 60);
  const estH = period.mainGoalEstimateMinutes != null ? (period.mainGoalEstimateMinutes / 60).toFixed(1) : null;
  const realH = (actualMinutes / 60).toFixed(1);

  const lines = [];
  // 8ᵉ passage : categoryLabelFor() plutôt que CATEGORY_LABELS[category] —
  // corrige le libellé affiché pour une catégorie personnalisée (active ou
  // gelée), qui affichait auparavant sa clé brute (voir categoryLabelFor).
  const categoryLabel = categoryLabelFor(period.activityId, category);
  lines.push('📊 Bilan automatique — ' + categoryLabel + ' — Période ' + period.periodIndexInCycle + ' (' + period.startDate + ' – ' + period.endDate + ')');
  if (period.mainGoalText) {
    lines.push('Objectif périodique : « ' + period.mainGoalText + ' » — ' + statusLabel(period.mainGoalStatus));
    if (period.mainGoalDescription) lines.push('Description : ' + period.mainGoalDescription);
  }
  lines.push(doneCount + ' objectif(s) hebdomadaire(s) sur ' + weeklies.length + ' atteint(s).');
  if (estH != null) {
    lines.push(estH + 'h estimées contre ' + realH + 'h réelles.');
  } else {
    lines.push(realH + 'h réelles sur cette période.');
  }
  return lines.join('\n');
}

function statusLabel(status) {
  if (status === 'atteint') return 'atteint';
  if (status === 'partiel') return 'partiellement atteint';
  if (status === 'non_atteint') return 'non atteint';
  return 'non évalué';
}

function postBilanIfDue(activity, category, planStartDate) {
  // Plus AUCUN bilan automatique de fin de période dans la discussion ni la communauté.
  return;
  // eslint-disable-next-line no-unreachable
  const today = todayLocal();
  const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activity.id).n;

  const due = db.prepare(`
    SELECT * FROM goal_periods
    WHERE activityId = ? AND category = ? AND endDate < ? AND bilanPostedAt IS NULL
  `).all(activity.id, category, today);

  due.forEach((period) => {
    const weeklies = weeklyForPeriod(period.id);
    const hasContent = !!(period.mainGoalText || weeklies.length);
    // ⚠️ Période jamais touchée par l'utilisateur (ni grand objectif, ni
    // objectif hebdomadaire) : on ne marque PAS bilanPostedAt, pour laisser
    // une chance à un contenu ajouté en retard d'être bilanné plus tard —
    // sans ça, une période créée automatiquement (ensurePeriodsUpTo) puis
    // jamais remplie se verrait fermée pour de bon dès le premier balayage,
    // avant même que l'utilisateur ait eu l'occasion d'y écrire quoi que ce
    // soit. Coût négligeable : cette requête reste bornée aux périodes déjà
    // terminées et sans bilan, jamais toute la table.
    if (!hasContent) return;

    // Statut du grand objectif toujours non tranché à la fin de la période :
    // compte comme non atteint, même logique que les objectifs hebdomadaires.
    // Statut de période dérivé des objectifs hebdomadaires (voir recomputePeriodStatus) ; plus de règle « sans statut -> non atteint ».
    recomputePeriodStatus(period.id);
    period.mainGoalStatus = db.prepare('SELECT mainGoalStatus FROM goal_periods WHERE id = ?').get(period.id).mainGoalStatus;

    // Publication seulement si l'activité est PARTAGÉE : une activité solo
    // n'a pas de fil de discussion (noesis-timetracker-activite.md). Le
    // bilan reste malgré tout consultable dans la page de bilan de l'app.
    if (membersCount >= 2) {
      const text = buildBilanText(activity.name, category, { ...period, activityId: activity.id }, weeklies);
      // Publié au nom du propriétaire de l'activité : il n'existe pas de
      // compte "système" dans ce projet (activity_messages.userId est
      // NOT NULL, voir server/db.js) — même principe que les autres
      // publications automatiques de l'app, toujours rattachées à une vraie
      // personne.
      if (activity.ownerId) postActivityMessage(activity.id, activity.ownerId, text);
    }

    db.prepare('UPDATE goal_periods SET bilanPostedAt = ? WHERE id = ?').run(new Date().toISOString(), period.id);
  });
}

// ---------------------------------------------------------------------------
// Point d'entrée principal, appelé par la route GET : garantit que le plan
// de cette catégorie existe, que toutes les périodes jusqu'à aujourd'hui
// sont créées, fait tourner le report automatique et l'envoi du bilan, puis
// renvoie l'état complet du planning de cette (activité, catégorie), plus la
// liste des membres de l'activité (pour l'assignation et la répartition).
// Statut automatique des objectifs, calculé par Noèsis.
// OBJECTIF HEBDOMADAIRE : ratio = temps estimé des tâches terminées / temps estimé total des tâches liées
// (sub_project_items.goalWeeklyId ; une tâche « glissée » garde son goalWeeklyId : elle compte toujours pour
// l'objectif d'origine). Le temps réel ne compte pas. >= 90 % atteint ; 75 à 90 % partiel ; sinon non atteint.
// Tâche sans estimation historique : DEFAULT_TASK_MINUTES (30 min). Sans tâche liée : statut inchangé.
// Un choix manuel (pastille page 3) dure jusqu'au prochain changement d'une tâche liée (recalcul ci-dessous).
// OBJECTIF DE PÉRIODE : statut dérivé (aucun réglage manuel), stocké dans mainGoalStatus : atteint si tous les
// objectifs hebdomadaires sont atteints, partiel s'il en manque un seul, non atteint s'il en manque 2 ou plus.
const WEEKLY_ATTEINT_MIN = 0.9;
const WEEKLY_PARTIEL_MIN = 0.75;
const DEFAULT_TASK_MINUTES = 30;

// Pur. tasks : [{ done, minutes }] ; minutes absent/<=0 -> DEFAULT_TASK_MINUTES. Renvoie null s'il n'y a aucune tâche.
// Ratio de temps fait (0..1) : SOURCE UNIQUE, réutilisée par le statut ET par les statistiques « Où ça glisse ».
function weeklyRatioFromTasks(tasks) {
  if (!tasks || !tasks.length) return null;
  let total = 0; let done = 0;
  tasks.forEach((t) => {
    const m = t.minutes > 0 ? t.minutes : DEFAULT_TASK_MINUTES;
    total += m;
    if (t.done) done += m;
  });
  return done / total;
}

function weeklyStatusFromRatio(r) {
  if (r == null) return null;
  return r >= WEEKLY_ATTEINT_MIN ? 'atteint' : (r >= WEEKLY_PARTIEL_MIN ? 'partiel' : 'non_atteint');
}

function weeklyStatusFromTasks(tasks) {
  return weeklyStatusFromRatio(weeklyRatioFromTasks(tasks));
}

// Minutes d'une tâche liée à un objectif hebdomadaire (catégorie de l'objectif) : estimation historique, sinon défaut.
function weeklyTaskMinutes(activityId, category, label) {
  const est = estimateForGoal(activityId, category, 'weekly', label);
  return est && est.minutes > 0 ? est.minutes : DEFAULT_TASK_MINUTES;
}

// Pur. statuses : statuts des objectifs hebdomadaires de la période. null si aucun objectif hebdomadaire.
function periodStatusFromWeeklies(statuses) {
  if (!statuses || !statuses.length) return null;
  const missing = statuses.filter((st) => st !== 'atteint').length;
  return missing === 0 ? 'atteint' : (missing === 1 ? 'partiel' : 'non_atteint');
}

function recomputePeriodStatus(periodId) {
  if (periodId == null) return;
  // Seules les semaines PASSÉES comptent (fin de semaine < aujourd'hui) ; la semaine en cours et celles à venir sont ignorées.
  const per = db.prepare('SELECT startDate FROM goal_periods WHERE id = ?').get(periodId);
  if (!per) return;
  const today = todayLocal();
  const rows = db.prepare("SELECT status, weekIndex FROM goal_weekly WHERE periodId = ? AND TRIM(text) <> ''").all(periodId)
    .filter((r) => addDays(per.startDate, r.weekIndex * WEEK_DAYS - 1) < today);
  const st = periodStatusFromWeeklies(rows.map((r) => r.status));
  if (st == null) return;
  db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE id = ? AND (mainGoalStatus IS NOT ?)').run(st, periodId, st);
}

function recomputeWeeklyStatus(weeklyId) {
  if (weeklyId == null) return;
  const w = db.prepare(`
    SELECT w.id, w.status, w.periodId, p.activityId, p.category
    FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE w.id = ?
  `).get(weeklyId);
  if (!w) return;
  const rows = db.prepare('SELECT label, done FROM sub_project_items WHERE goalWeeklyId = ?').all(weeklyId);
  const st = weeklyStatusFromTasks(rows.map((r) => ({ done: !!r.done, minutes: weeklyTaskMinutes(w.activityId, w.category, r.label) })));
  if (st != null && st !== w.status) db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run(st, weeklyId);
  recomputePeriodStatus(w.periodId);
}

// Crochet : à appeler quand une tâche liée change (coche, création, suppression, déplacement, libellé).
// `weeklyIds` : objectifs hebdomadaires touchés (avant ET après le changement). Ne lève jamais.
function recomputeForWeeklies(weeklyIds) {
  const seen = new Set();
  (weeklyIds || []).forEach((id) => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    try { recomputeWeeklyStatus(id); } catch (e) { /* non bloquant */ }
  });
}

function planningForActivity(activityId, category) {
  assertReadableCategory(activityId, category);
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  const plan = ensurePlan(activityId, category);
  const currentPeriodNumber = periodNumberForDate(plan.startDate, todayLocal());
  // 13 septembre 2026 (correction, demande d'Emilien) : on matérialise tout
  // le CYCLE de 13 périodes en cours, pas seulement les périodes jusqu'à
  // aujourd'hui. ensurePeriodRow() ne fait que poser les dates de la période
  // (aucun texte d'objectif, aucune suggestion) : matérialiser une période à
  // l'avance ne viole donc pas la règle verrouillée « aucune génération
  // automatique d'objectif ».
  const cycleIndexForCurrent = Math.floor((currentPeriodNumber - 1) / PERIODS_PER_CYCLE) + 1;
  const maxCycle = Math.max(cycleIndexForCurrent, maxYearFor(activityId) - yearOfPlanStart(plan.startDate) + 1);
  const cycleLastPeriodNumber = maxCycle * PERIODS_PER_CYCLE;
  ensurePeriodsUpTo(activityId, category, cycleLastPeriodNumber, plan.startDate);
  carryOverWeekly(activityId, category, plan.startDate);
  postBilanIfDue(activity, category, plan.startDate);

  const periods = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber')
    .all(activityId, category)
    // Borne : jamais de période au-delà de la dernière année créée (un report
    // ou un étalement peut avoir matérialisé la période 14+ ; elle reste cachée tant que
    // l'utilisateur n'a pas créé l'année suivante).
    .filter((p) => p.periodNumber <= cycleLastPeriodNumber)
    .map((p) => {
      const weeklies = weeklyForPeriod(p.id).map((w) => ({
        ...w,
        weekOfYear: weekOfYear(p.periodIndexInCycle, w.weekIndex),
        // Un objectif reporté est, par définition, non réalisé : pastille rouge.
        status: (w.status == null && w.carriedOverFromId) ? 'non_atteint' : w.status,
        taskTotal: db.prepare('SELECT COUNT(*) AS n FROM sub_project_items WHERE goalWeeklyId = ?').get(w.id).n,
        actualMinutes: weekIsOver(p.startDate, w.weekIndex)
          ? Math.round(actualSecondsForRange(activityId, weekBounds(p.startDate, w.weekIndex).start, weekBounds(p.startDate, w.weekIndex).end) / 60)
          : null,
      }));
      weeklies.forEach((w) => { w.accuracy = accuracyScore(w.estimateMinutes, w.actualMinutes); });

      const periodOver = p.endDate < todayLocal();
      const actualMinutes = periodOver
        ? Math.round(actualSecondsForRange(activityId, p.startDate, p.endDate) / 60)
        : null;
      return {
        ...p,
        firstWeekOfYear: weekOfYear(p.periodIndexInCycle, 1),
        weeklies,
        assignees: periodAssigneesFor(p.id),
        actualMinutes,
        accuracy: accuracyScore(p.mainGoalEstimateMinutes, actualMinutes),
        isCurrent: p.periodNumber === currentPeriodNumber,
        isPast: p.endDate < todayLocal(),
      };
    });

  return {
    plan,
    category,
    currentPeriodNumber,
    periods,
    members: membersForActivity(activityId),
  };
}

function weekIsOver(periodStart, weekIndex) {
  return weekBounds(periodStart, weekIndex).end < todayLocal();
}

// ---------------------------------------------------------------------------
// Écritures

// Description détaillée : undefined = conserver l'existante ;
// trim + 600 caractères max. L'IA ne la change que par PROPOSITION validée (server/lib/changeproposals.js).
const GOAL_DESCRIPTION_MAX = 600;
function cleanDescription(description) {
  const d = String(description).trim();
  if (d.length > GOAL_DESCRIPTION_MAX) throw Object.assign(new Error('Description trop longue (' + GOAL_DESCRIPTION_MAX + ' caractères maximum).'), { statusCode: 400 });
  return d;
}

// estimateMinutes : undefined = on garde une valeur saisie à la main pour CETTE
// période (source 'manual'), sinon estimation automatique ; nombre = valeur manuelle (valable
// pour cette période seulement : les périodes suivantes recalculent d'après le temps passé) ;
// null = revenir à l'estimation automatique.
function setMainGoal(activityId, category, periodNumber, text, description, estimateMinutes) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const cleanText = String(text || '').trim();
  let estimate;
  if (typeof estimateMinutes === 'number' && isFinite(estimateMinutes) && estimateMinutes >= 0) {
    estimate = { minutes: Math.round(estimateMinutes), source: 'manual', confidence: 1 };
  } else {
    const cur = db.prepare('SELECT mainGoalEstimateMinutes AS m, mainGoalEstimateSource AS s, mainGoalEstimateConfidence AS c FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
      .get(activityId, category, periodNumber);
    estimate = (estimateMinutes === undefined && cur && cur.s === 'manual' && cur.m != null)
      ? { minutes: cur.m, source: 'manual', confidence: cur.c == null ? 1 : cur.c }
      : estimateForGoal(activityId, category, 'main', cleanText);
  }
  db.prepare(`
    UPDATE goal_periods
    SET mainGoalText = ?, mainGoalEstimateMinutes = ?, mainGoalEstimateSource = ?, mainGoalEstimateConfidence = ?
    WHERE activityId = ? AND category = ? AND periodNumber = ?
  `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, activityId, category, periodNumber);
  if (description !== undefined) {
    db.prepare('UPDATE goal_periods SET mainGoalDescription = ? WHERE activityId = ? AND category = ? AND periodNumber = ?')
      .run(cleanDescription(description), activityId, category, periodNumber);
  }
  return { ...estimate };
}

// Suppression d'un objectif périodique : vide le grand objectif de la période
// et supprime ses objectifs hebdomadaires. La période elle-même reste (case vide).
function deleteWeeklyRows(ids) {
  ids.forEach((id) => {
    db.prepare('UPDATE goal_weekly SET carriedOverFromId = NULL WHERE carriedOverFromId = ?').run(id);
    db.prepare('UPDATE goal_weekly SET carriedToId = NULL WHERE carriedToId = ?').run(id);
    db.prepare('DELETE FROM goal_weekly WHERE id = ?').run(id);
  });
}

function deleteMainGoal(activityId, category, periodNumber) {
  assertCategoryOrSecteurForActivity(activityId, category);
  const period = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, periodNumber);
  if (!period) return;
  deleteWeeklyRows(db.prepare('SELECT id FROM goal_weekly WHERE periodId = ?').all(period.id).map((r) => r.id));
  db.prepare(`UPDATE goal_periods SET mainGoalText = '', mainGoalDescription = '', mainGoalEstimateMinutes = NULL,
    mainGoalEstimateSource = NULL, mainGoalEstimateConfidence = NULL, mainGoalStatus = NULL WHERE id = ?`).run(period.id);
}

function deleteWeekly(activityId, category, periodNumber, weekIndex) {
  assertCategoryOrSecteurForActivity(activityId, category);
  const period = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, periodNumber);
  if (!period) return;
  deleteWeeklyRows(db.prepare('SELECT id FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL').all(period.id, weekIndex).map((r) => r.id));
  recomputePeriodStatus(period.id);
}

// Crée ou remplace le texte de l'objectif hebdomadaire (weekIndex 1-4) de
// cette période. Un seul objectif "actif" (non issu d'un report) par
// (période, semaine) — la contrainte est vérifiée ici, pas en base, pour ne
// pas gêner le report automatique qui, lui, peut avoir besoin de chercher une
// semaine libre au-delà de la 4e (voir carryOverWeekly).
function setWeekly(activityId, category, periodNumber, weekIndex, text, description, estimateOverride) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, periodNumber);
  const cleanText = String(text || '').trim();
  let estimate = estimateForGoal(activityId, category, 'weekly', cleanText);

  const existing = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL')
    .get(period.id, weekIndex);
  // Capacité de la semaine saisie par l'utilisateur : prime sur le calcul ;
  // 0/null la rend à l'automatique ; un enregistrement de texte seul ne
  // l'écrase jamais.
  if (estimateOverride !== undefined && estimateOverride !== null && Number(estimateOverride) > 0) {
    estimate = { minutes: Math.round(Number(estimateOverride)), source: 'manual', confidence: 1 };
  } else if (estimateOverride === undefined && existing && existing.estimateSource === 'manual' && existing.estimateMinutes > 0) {
    estimate = { minutes: existing.estimateMinutes, source: 'manual', confidence: 1 };
  }
  const createdAt = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE goal_weekly SET text = ?, estimateMinutes = ?, estimateSource = ?, estimateConfidence = ?
      WHERE id = ?
    `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, existing.id);
    if (description !== undefined) db.prepare('UPDATE goal_weekly SET description = ? WHERE id = ?').run(cleanDescription(description), existing.id);
    return { ...estimate, id: existing.id };
  }

  const info = db.prepare(`
    INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(period.id, weekIndex, cleanText, estimate.minutes, estimate.source, estimate.confidence, createdAt);
  if (description !== undefined) db.prepare('UPDATE goal_weekly SET description = ? WHERE id = ?').run(cleanDescription(description), Number(info.lastInsertRowid));
  recomputePeriodStatus(period.id);
  return { ...estimate, id: Number(info.lastInsertRowid) };
}

function setWeeklyStatus(activityId, weeklyId, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide.'), { statusCode: 400 });
  // Scopé par activité : vérifie que cet objectif hebdomadaire appartient
  // bien à une période de CETTE activité avant d'écrire, comme partout
  // ailleurs dans le projet (R4 du contrat d'avancement de Sous-projets).
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });
  db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run(status, weeklyId);
  recomputePeriodStatus(db.prepare('SELECT periodId FROM goal_weekly WHERE id = ?').get(weeklyId).periodId);
}

// Assigne (ou retire, si userId est null) UN membre de l'activité à cet
// objectif hebdomadaire — 14 septembre 2026, demande d'Emilien, pour que le
// travail de chaque catégorie se répartisse visiblement entre les membres.
// Le grand objectif de période n'est volontairement pas assignable (règle 1
// en tête de fichier : le plan appartient à l'activité).
function setWeeklyAssignee(activityId, weeklyId, userId) {
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });

  const cleanUserId = userId ? String(userId) : null;
  if (cleanUserId) {
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, cleanUserId);
    if (!member) throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
  }
  db.prepare('UPDATE goal_weekly SET assignedUserId = ? WHERE id = ?').run(cleanUserId, weeklyId);
}

// ---------------------------------------------------------------------------
// Assignation de l'objectif périodique (ex-« grand objectif ») — 14 septembre
// 2026, troisième passage, demande d'Emilien : contrairement à l'objectif
// hebdomadaire (UN SEUL assigné, ci-dessus), PLUSIEURS membres de l'activité
// peuvent travailler sur un même objectif périodique. Remplace toujours la
// liste complète (plus simple côté client : une case à cocher par membre)
// plutôt que d'ajouter/retirer un par un.
function periodAssigneesFor(periodId) {
  return db.prepare(`
    SELECT u.id AS id, u.name AS name, m.color AS color
    FROM goal_period_assignees a
    JOIN users u ON u.id = a.userId
    JOIN goal_periods p ON p.id = a.periodId
    JOIN activity_members m ON m.activityId = p.activityId AND m.userId = a.userId
    WHERE a.periodId = ?
    ORDER BY m.position, m.joinedAt
  `).all(periodId);
}

function setPeriodAssignees(activityId, category, periodNumber, userIds) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);

  const ids = Array.isArray(userIds) ? userIds : [];
  const cleanIds = [...new Set(ids.map((id) => String(id)))];
  cleanIds.forEach((userId) => {
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
    if (!member) throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
  });

  db.prepare('DELETE FROM goal_period_assignees WHERE periodId = ?').run(period.id);
  const insert = db.prepare('INSERT INTO goal_period_assignees (periodId, userId) VALUES (?, ?)');
  cleanIds.forEach((userId) => insert.run(period.id, userId));

  return periodAssigneesFor(period.id);
}

// ---------------------------------------------------------------------------
// Balayage global — ENVOI AUTOMATIQUE du bilan (décision d'Emilien, 12
// septembre 2026) : ne doit pas dépendre de l'ouverture de l'app par
// quelqu'un. Même principe que server/lib/duereminders.js (minuteur démarré
// APRÈS l'écoute du serveur, jamais la seule raison qui garde le processus
// en vie). Fréquence large (6h) : une période dure 28 jours, inutile de
// balayer plus souvent — le report automatique, lui, reste aussi calculé à
// la volée à chaque ouverture du planning (voir planningForActivity), donc
// aucune perte entre deux balayages. Parcourt maintenant chaque (activité,
// catégorie) ayant un plan démarré, plutôt que chaque activité seule.
function runGoalsSweepAll() {
  const plans = db.prepare(`
    SELECT DISTINCT a.id AS activityId, a.name AS activityName, a.ownerId AS ownerId, p.category AS category
    FROM activities a
    JOIN activity_goal_plans p ON p.activityId = a.id
    WHERE a.active = 1
  `).all();

  let posted = 0;
  plans.forEach((row) => {
    try {
      const activity = { id: row.activityId, name: row.activityName, ownerId: row.ownerId };
      if (!require('./modules').isEnabled(row.ownerId, 'roadmap')) return; // module désactivé : ni report ni bilan automatique
      const plan = getPlan(activity.id, row.category);
      if (!plan) return;
      carryOverWeekly(activity.id, row.category, plan.startDate);
      const before = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      postBilanIfDue(activity, row.category, plan.startDate);
      const after = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      posted += Math.max(0, after - before);
    } catch (err) {
      console.warn('[objectifs] balayage échoué pour l\'activité ' + row.activityId + ' / ' + row.category + ' :', err.message);
    }
  });
  return { posted };
}

const SWEEP_MS = 6 * 60 * 60 * 1000;
const FIRST_SWEEP_MS = 25 * 1000;
let sweepTimer = null;

function startGoalsSweep() {
  if (sweepTimer) return;
  const tick = () => {
    try {
      const res = runGoalsSweepAll();
      if (res.posted) console.log('Objectifs : ' + res.posted + ' bilan(s) publié(s) automatiquement');
    } catch (err) {
      console.warn('[objectifs] balayage échoué :', err.message);
    }
  };
  setTimeout(tick, FIRST_SWEEP_MS).unref();
  sweepTimer = setInterval(tick, SWEEP_MS);
  sweepTimer.unref();
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  // Utilisés paresseusement par server/lib/categories.js.
  todayLocal,
  currentYear,
  PERIODS_PER_CYCLE,
  STATUSES,
  planningForActivity,
  membersForActivity,
  setMainGoal,
  setWeekly,
  setWeeklyStatus,
  weeklyStatusFromTasks,
  weeklyRatioFromTasks,
  weeklyStatusFromRatio,
  weeklyTaskMinutes,
  periodStatusFromWeeklies,
  recomputeWeeklyStatus,
  recomputePeriodStatus,
  recomputeForWeeklies,
  DEFAULT_TASK_MINUTES,
  setWeeklyAssignee,
  setPeriodAssignees,
  runGoalsSweepAll,
  startGoalsSweep,
  // Catégories personnalisables par activité (15 septembre 2026, discussion
  // Objectifs — B, cadré avec Emilien — voir noesis-timetracker-objectifs.md).
  // 8ᵉ passage (16 septembre 2026) : activateCustomCategories remplacée par
  // ensureDefaultCategory ; DEFAULT_CATEGORY_KEY/LABEL et categoryLabelFor
  // ajoutés (catégorie par défaut générique, couleur 100% automatique).
  MAX_CUSTOM_CATEGORIES,
  MAX_SECTEURS_PER_POLE,
  migratePoleDirectDataToSecteur,
  DEFAULT_CATEGORY_KEY,
  DEFAULT_CATEGORY_LABEL,
  isCustomized,
  categoriesForActivity,
  frozenCategoriesForActivity,
  categoryLabelFor,
  isValidCategoryForActivity,
  isReadableCategory,
  categoryEverExisted,
  ensureDefaultCategory,
  addCategory,
  renameCategory,
  removeCategory,
  previewCategoryRemoval,
  reorderCategories,
  // Secteurs (18 septembre 2026, « Pôles & secteurs » — voir le commentaire
  // au-dessus de secteursForPole dans ce fichier). Exposés par
  // server/routes/goals.js depuis le 20 septembre 2026.
  secteursForPole,
  isValidSecteurForActivity,
  isValidCategoryOrSecteurForActivity,
  parentKeyFor,
  resolveToPole,
  reorderSecteurs,
  moveSecteurToPole,
  // Secteurs dans l'arbre périodique (21 septembre 2026 — voir le commentaire
  // au-dessus de gridColumnsForPole dans ce fichier). Exposés par
  // server/routes/goals.js.
  assertCategoryOrSecteurForActivity,
  gridColumnsForPole,
  secteurRemovalInfo,
  deleteMainGoal,
  deleteWeekly,
  // Exportés pour les tests (bac à sable) — mêmes fonctions, pas de doublon.
  periodBounds,
  yearAnchor,
  weekOfYear,
  yearGridStart,
  getYearGoals,
  listYears,
  createNextYear,
  deleteYear,
  maxYearFor,
  yearOfPlanStart,
  setYearGoal,
  migratePlansToYearGrid,
  weekBounds,
  periodNumberForDate,
  estimateForGoal,
  buildBilanText,
  addDays,
  // Exportés pour server/lib/goalsauto.js (chantier Objectifs — C,
  // auto-planification Offre1, 15 septembre 2026) — mêmes fonctions
  // internes, pas de doublon, pour éviter de réimplémenter la gestion des
  // périodes/semaines dans un second fichier.
  WEEKS_PER_PERIOD,
  tokenize,
  jaccard,
  actualSecondsForRange,
  ensurePlan,
  ensurePeriodRow,
  weeklyForPeriod,
  // Exportée pour server/lib/goalsdailypriority.js (Brief B, liste
  // quotidienne priorisée, 22 septembre 2026) — même fonction interne que
  // ci-dessus, pas de doublon.
  daysBetween,
  // Réalignement rétroactif ponctuel (16 septembre 2026, discussion Objectifs
  // — D, 6ᵉ passage) — réservées à scripts/realign-goals-monday.js, jamais
  // exposées via une route HTTP.
  realignPlanToMonday,
  plansNeedingRealignment,
  mostRecentMonday,
  getPlan,
};
