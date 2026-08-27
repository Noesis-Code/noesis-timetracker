// Logique de la COMMUNAUTÉ (classements des activités partagées). Séparé
// de lib/stats.js exprès : ce fichier reste "à Emilien", Gaspard n'a jamais
// besoin d'y toucher pour travailler sur les Statistiques.

const db = require('../db');
const { periodRange } = require('./period');

function sharedActivitiesForUser(userId, period, refDate) {
  const { start, end, label } = periodRange(period, refDate);

  const activityRows = db.prepare(`
    SELECT a.id AS activityId, a.name AS name, a.ownerId AS ownerId
    FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ?
      AND (SELECT COUNT(*) FROM activity_members m2 WHERE m2.activityId = a.id) >= 2
    ORDER BY a.id
  `).all(userId);

  const memberStmt = db.prepare(`
    SELECT u.id AS userId, u.name AS name, am.color AS color,
           COALESCE(SUM(t.durationSeconds), 0) AS seconds
    FROM activity_members am
    JOIN users u ON u.id = am.userId
    LEFT JOIN time_entries t ON t.userId = am.userId AND t.activityId = am.activityId AND t.isoDate BETWEEN ? AND ?
    WHERE am.activityId = ?
    GROUP BY u.id
    ORDER BY seconds DESC, u.name COLLATE NOCASE ASC
  `);

  const activities = activityRows.map((a) => {
    const members = memberStmt.all(start, end, a.activityId);
    const activityTotal = members.reduce((sum, m) => sum + m.seconds, 0);

    return {
      activityId: a.activityId,
      name: a.name,
      isOwner: a.ownerId === userId,
      totalSeconds: activityTotal,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.name,
        color: m.color,
        seconds: m.seconds,
        percent: activityTotal > 0 ? Math.round((m.seconds / activityTotal) * 100) : 0,
      })),
    };
  });

  return { period, label, start, end, activities };
}

module.exports = { sharedActivitiesForUser };