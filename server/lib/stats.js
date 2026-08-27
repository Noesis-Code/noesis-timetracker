// Logique des STATISTIQUES personnelles (onglet Statistiques). C'est le
// fichier "de Gaspard" : la Communauté vit désormais dans lib/community.js,
// séparé exprès pour que les deux chantiers ne touchent jamais le même
// fichier en même temps.

const db = require('../db');
const { periodRange } = require('./period');

// Répartition du temps par activité pour un utilisateur sur une période.
// Utilise SA couleur personnelle pour chaque activité (activity_members),
// celle qu'il/elle voit dans le chrono.
function breakdownForUser(userId, period, refDate) {
  const { start, end, label } = periodRange(period, refDate);
  const rows = db.prepare(`
    SELECT a.id AS activityId, a.name AS activity, COALESCE(am.color, '#3498db') AS color,
           SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY a.id
    ORDER BY seconds DESC
  `).all(userId, start, end);

  const totalSeconds = rows.reduce((sum, r) => sum + r.seconds, 0);
  return {
    period, label, start, end, totalSeconds,
    activities: rows.map((r) => ({
      activityId: r.activityId,
      name: r.activity,
      color: r.color,
      seconds: r.seconds,
      percent: totalSeconds > 0 ? Math.round((r.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

// Détail jour par jour (pour le graphique de l'onglet Semaine), borné à la période demandée.
function dailyBreakdownForUser(userId, period, refDate) {
  const { start, end } = periodRange(period, refDate);
  const rows = db.prepare(`
    SELECT t.isoDate AS isoDate, t.dayOfWeek AS dayOfWeek, a.id AS activityId,
           a.name AS activity, COALESCE(am.color, '#3498db') AS color, SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY t.isoDate, a.id
    ORDER BY t.isoDate ASC, seconds DESC
  `).all(userId, start, end);

  const byDay = {};
  rows.forEach((r) => {
    if (!byDay[r.isoDate]) byDay[r.isoDate] = { isoDate: r.isoDate, dayOfWeek: r.dayOfWeek, totalSeconds: 0, activities: [] };
    byDay[r.isoDate].totalSeconds += r.seconds;
    byDay[r.isoDate].activities.push({ activityId: r.activityId, name: r.activity, color: r.color, seconds: r.seconds });
  });
  return Object.values(byDay).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
}

// --- Utilitaires de date locaux à ce fichier (on ne touche pas à lib/period.js ni lib/dates.js,
// partagés avec Émilien : voir BRIEF_GASPARD_STATISTIQUES.md, section 4).
function localIsoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// Lundi (au format ISO) de la semaine calendaire contenant isoDate.
function mondayKeyOf(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDay(); // 0 = dimanche ... 6 = samedi
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return localIsoDate(d);
}

function formatShortDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
}

// Répartition par semaine calendaire (lundi -> dimanche) sur le MOIS contenant refDate,
// par activité. Sert au graphique "temps par semaine par activité" de l'onglet Mois.
function weeklyBreakdownForUser(userId, refDate) {
  const { start, end } = periodRange('month', refDate);
  const rows = db.prepare(`
    SELECT t.isoDate AS isoDate, a.id AS activityId, a.name AS activity,
           COALESCE(am.color, '#3498db') AS color, SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY t.isoDate, a.id
    ORDER BY t.isoDate ASC
  `).all(userId, start, end);

  const byWeek = {};
  rows.forEach((r) => {
    const weekKey = mondayKeyOf(r.isoDate);
    if (!byWeek[weekKey]) byWeek[weekKey] = { weekStart: weekKey, totalSeconds: 0, activities: {} };
    const bucket = byWeek[weekKey];
    bucket.totalSeconds += r.seconds;
    if (!bucket.activities[r.activityId]) {
      bucket.activities[r.activityId] = { activityId: r.activityId, name: r.activity, color: r.color, seconds: 0 };
    }
    bucket.activities[r.activityId].seconds += r.seconds;
  });

  return Object.values(byWeek)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .map((w, i) => ({
      label: 'Sem. ' + (i + 1) + ' (' + formatShortDate(w.weekStart) + ')',
      weekStart: w.weekStart,
      totalSeconds: w.totalSeconds,
      activities: Object.values(w.activities).sort((a, b) => b.seconds - a.seconds),
    }));
}

const MONTH_NAMES_SHORT_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Répartition par mois calendaire sur l'ANNÉE contenant refDate, par activité (les 12 mois
// sont toujours présents, même à zéro). Sert au graphique de l'onglet Année.
function monthlyBreakdownForUser(userId, refDate) {
  const { start, end } = periodRange('year', refDate);
  const rows = db.prepare(`
    SELECT t.isoDate AS isoDate, a.id AS activityId, a.name AS activity,
           COALESCE(am.color, '#3498db') AS color, SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY t.isoDate, a.id
  `).all(userId, start, end);

  const byMonth = {};
  for (let m = 0; m < 12; m++) byMonth[m] = { monthIndex: m, totalSeconds: 0, activities: {} };

  rows.forEach((r) => {
    const monthIndex = parseInt(r.isoDate.slice(5, 7), 10) - 1;
    const bucket = byMonth[monthIndex];
    bucket.totalSeconds += r.seconds;
    if (!bucket.activities[r.activityId]) {
      bucket.activities[r.activityId] = { activityId: r.activityId, name: r.activity, color: r.color, seconds: 0 };
    }
    bucket.activities[r.activityId].seconds += r.seconds;
  });

  return Object.values(byMonth).map((m) => ({
    label: MONTH_NAMES_SHORT_FR[m.monthIndex],
    monthIndex: m.monthIndex,
    totalSeconds: m.totalSeconds,
    activities: Object.values(m.activities).sort((a, b) => b.seconds - a.seconds),
  }));
}

module.exports = { breakdownForUser, dailyBreakdownForUser, weeklyBreakdownForUser, monthlyBreakdownForUser };
