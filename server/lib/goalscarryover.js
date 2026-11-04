// Cible irréaliste (drapeau posé sur l'objectif du calendrier) et reprise SILENCIEUSE des objectifs hebdomadaires non atteints (repriseUnmet). Plus de propositions ni de cartes :
// les anciens reports « Non réalisées » et choix « réduire / répartir » ont été retirés (décision d'Émilien).

const db = require('../db');
const goals = require('./goals');
const overload = require('./goalsoverload');
const timecaps = require('./timecaps');
const goalscapacity = require('./goalscapacity');

const HORIZON = 60;
const MARGIN = 1.15;

function todayLocal() {
  return require('./dates').userToday(); // jour de la requête en cours (fuseau du téléphone), sinon jour du processus
}

function httpError(msg, code) { return Object.assign(new Error(msg), { statusCode: code }); }

function planStartOf(activityId, category) {
  const p = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, category);
  return p ? p.startDate : null;
}






// ---------------------------------------------------------------------------
// Cible irréaliste. « Disponible » = moyenne hebdo du temps réellement chronométré sur 4 semaines pour la catégorie
// (capacityMinutesForMember est dérivée du grand objectif lui-même quand il est posé : la comparer
// à lui-même ne détecterait jamais rien), plafonnée par le max hebdo du pôle s'il existe.
function realism(userId, activityId, category) {
  const today = todayLocal();
  const plan = planStartOf(activityId, category);
  if (!plan) return null;
  const n = goals.periodNumberFor(activityId, category, plan, today);
  const p = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, n);
  if (!p || !p.mainGoalText) return null;
  const weeklySum = db.prepare("SELECT COALESCE(SUM(estimateMinutes), 0) AS s FROM goal_weekly WHERE periodId = ? AND carriedToId IS NULL").get(p.id).s;
  const target = p.mainGoalEstimateMinutes > 0 ? p.mainGoalEstimateMinutes : weeklySum; // le maximum de la période prime
  if (target <= 0) return null;
  const done = timecaps.minutesInRange(userId, activityId, category, p.startDate, today);
  const remaining = Math.max(0, target - done);
  const weeksLeft = Math.max(1, Math.ceil((goals.daysBetween(today, p.endDate) + 1) / 7));
  // Capacité réelle de CETTE catégorie (secteur, ou pôle = ses secteurs cumulés), pas de toute l'activité.
  let have = timecaps.averages(userId, activityId, category).avgWeekMinutes;
  const cap = timecaps.weeklyCapFor(userId, activityId, category);
  if (cap != null) have = cap; // le maximum posé prime sur la moyenne
  if (have <= 0) return null; // aucun historique ni maximum : pas de jugement
  const needPerWeek = Math.round(remaining / weeksLeft);
  const unrealistic = remaining > 0 && needPerWeek > have * MARGIN;
  return {
    periodId: p.id, category, poleKey: goals.resolveToPole(activityId, category), periodNumber: n, text: p.mainGoalText,
    targetMinutes: target, remainingMinutes: remaining, weeksLeft, needPerWeekMinutes: needPerWeek, havePerWeekMinutes: have,
    unrealistic,
  };
}



// ---------------------------------------------------------------------------
// REPRISE EN SILENCE des objectifs hebdomadaires non atteints (décision d'Émilien) : les semaines PASSÉES ne sont jamais modifiées ; ce sont les semaines À VENIR (celle en cours
// comprise) de la MÊME période qui incluent le non-réalisé : une ligne « Reprise de S45 : <texte> » dans leur description (le texte de l'objectif ne change pas) et le temps estimé
// de l'objectif non atteint réparti à parts égales sur ces semaines. Idempotent : tout est reconstruit à chaque passage (la ligne « Reprise » est remplacée, la part ajoutée est
// retranchée de estimateCarried avant d'être recalculée). Jamais au-delà de la fin de la période : sans semaine à venir (avec objectif), rien n'est fait et l'objectif est marqué (noRoomToCarry).
// Un temps estimé saisi à la main (estimateSource = 'manual') n'est jamais touché : seule la ligne de reprise s'ajoute.
if (!db.prepare('PRAGMA table_info(goal_weekly)').all().some((c) => c.name === 'estimateCarried')) db.exec('ALTER TABLE goal_weekly ADD COLUMN estimateCarried INTEGER NOT NULL DEFAULT 0');
const REPRISE_RE = /^Reprise de S\d+ : .*$/;
function weekLabel(p, weekIndex) { return 'S' + (goals.weekOfYear ? goals.weekOfYear(p.periodIndexInCycle, weekIndex) : ((p.periodNumber - 1) % 13) * 4 + weekIndex); }
function repriseUnmet(activityId, todayArg) {
  const today = todayArg || todayLocal();
  let changed = 0;
  db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND startDate <= ? AND endDate >= ?').all(activityId, today, today).forEach((p) => {
    const weeks = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND carriedToId IS NULL ORDER BY weekIndex').all(p.id);
    const end = (w) => goals.weekBoundsIn(p, w.weekIndex).end;
    const unmet = weeks.filter((w) => w.text && w.status !== 'atteint' && end(w) < today);
    const future = weeks.filter((w) => w.text && end(w) >= today);
    const total = unmet.reduce((s, w) => s + (w.estimateMinutes || 0), 0);
    const share = future.length ? Math.round(total / future.length) : 0;
    const lines = unmet.map((w) => 'Reprise de ' + weekLabel(p, w.weekIndex) + ' : ' + w.text);
    future.forEach((w) => {
      const kept = String(w.description || '').split('\n').filter((l) => !REPRISE_RE.test(l.trim()));
      const desc = kept.concat(lines).join('\n').replace(/^\n+/, '');
      const manual = w.estimateSource === 'manual';
      const carried = manual ? 0 : share;
      const est = manual ? w.estimateMinutes : Math.max(0, (w.estimateMinutes || 0) - (w.estimateCarried || 0)) + carried;
      if (desc === (w.description || '') && carried === (w.estimateCarried || 0) && (manual || est === (w.estimateMinutes || 0))) return;
      db.prepare('UPDATE goal_weekly SET description = ?, estimateMinutes = ?, estimateCarried = ? WHERE id = ?').run(desc, manual ? w.estimateMinutes : ((w.estimateMinutes == null && est === 0) ? null : est), carried, w.id);
      changed += 1;
    });
    // Semaines passées qui ne sont plus à reprendre (atteintes depuis) : la reprise disparaît des semaines à venir (même passage, lignes retirées ci-dessus).
  });
  return changed;
}


// Ajoute `lateDays` aux objectifs hebdo passés non atteints et `realism` (drapeaux) au planning d'une catégorie.
function decoratePlanning(planning, userId, activityId) {
  const today = todayLocal();
  (planning.periods || []).forEach((p) => {
    (p.weeklies || []).forEach((w) => {
      if (!w.text || w.status === 'atteint' || w.carriedToId) return;
      const end = goals.weekBoundsIn(p, w.weekIndex).end;
      if (end < today) w.lateDays = goals.daysBetween(end, today);
      if (end < today) { const hasFuture = (p.weeklies || []).some((x) => x.text && !x.carriedToId && goals.weekBoundsIn(p, x.weekIndex).end >= today); if (!hasFuture && p.startDate <= today && p.endDate >= today) w.noRoomToCarry = true; } // pas de semaine à venir dans la période : l'objectif est marqué (liseré)
    });
  });
  try { // charge au-delà de +20 % du rythme tenu : même marque sur l'objectif de la semaine en cours (voir goalsoverload.overloadMarks)
    const marks = overload.getMarks(userId, activityId);
    if (marks[planning.category] || marks[goals.resolveToPole(activityId, planning.category)]) (planning.periods || []).forEach((p) => (p.weeklies || []).forEach((w) => { if (w.text) { const b = goals.weekBoundsIn(p, w.weekIndex); if (b.start <= today && today <= b.end) w.overloaded = true; } }));
  } catch (e) { /* non bloquant */ }
  try { planning.realism = realism(userId, activityId, planning.category); } catch (e) { planning.realism = null; }
  return planning;
}

module.exports = { realism, decoratePlanning, repriseUnmet };
