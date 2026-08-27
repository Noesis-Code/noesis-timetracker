// Logique des STATISTIQUES personnelles (onglet Statistiques). C'est le
// fichier "de Gaspard" : la Communauté vit désormais dans lib/community.js,
// séparé exprès pour que les deux chantiers ne touchent jamais le même
// fichier en même temps.

const db = require('../db');
const { periodRange } = require('./period');

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

module.exports = { breakdownForUser, dailyBreakdownForUser };