// Lecture de l'état « retard » d'un membre pour les tests (l'application n'en a plus besoin : le retard est silencieux, 15 nov. 2026).
const db = require('../../server/db');
const goals = require('../../server/lib/goals');
const parse = (json, dflt) => { try { const v = JSON.parse(json); return v == null ? dflt : v; } catch (e) { return dflt; } };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
module.exports = function etat(userId) {
  return db.prepare(`SELECT r.*, o.title AS objectifTitle, a.name AS activityName FROM objectif_retards r JOIN user_objectives o ON o.id = r.objectifId LEFT JOIN activities a ON a.id = r.activityId
    WHERE r.userId = ? ORDER BY r.periodEnd, r.id`).all(userId).map((r) => {
    let pole = null; try { pole = goals.resolveToPole(r.activityId, r.categoryKey || r.poleKey) || r.poleKey; } catch (e) { pole = r.poleKey; }
    const label = (k) => { try { return k ? goals.categoryLabelFor(r.activityId, k) : null; } catch (e) { return k; } };
    const secteurKey = r.categoryKey && pole && r.categoryKey !== pole ? r.categoryKey : null;
    const tasks = parse(r.tasksJson, []).map((t) => ({ id: t.id, titre: t.titre || '', minutes: num(t.minutes) }));
    return { id: r.id, niveau: r.niveau === 'B' ? 'B' : 'A', objectifId: r.objectifId, titre: r.objectifTitle, activite: r.activityName, pole: label(pole), secteur: label(secteurKey), poleId: pole,
      heuresManquantes: Math.round((num(r.missingMinutes) / 60) * 10) / 10, depassementPct: num(r.depassementPct), tachesRetirees: tasks, totalRetireMinutes: tasks.reduce((s, t) => s + t.minutes, 0),
      tempsPoleMinutesSemaine: num(r.tempsPoleMinutes), necessaireMinutesSemaine: num(r.necessaireMinutes) };
  });
};
