// 5 oct. 2026 (Emilien) : notification « Noèsis » au responsable quand une tâche
// lui est attribuée par quelqu'un d'autre (activité partagée) à la création.
// Contenu : tâche, activité, pôle › secteur, date. Clic → Feuille de route, page 2,
// onglet du détail de période, à l'objectif périodique et à l'objectif hebdomadaire
// où la tâche est répertoriée (adresse ?notif=taskassigned&...).
const db = require('../db');
const goals = require('./goals');
const push = require('./push');

const TEXTS = {
  fr: { title: 'Noèsis · tâche attribuée' },
  en: { title: 'Noèsis · task assigned' },
};

function langOf(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  return row && row.lang === 'fr' ? 'fr' : 'en';
}

// Période et semaine (1..4) qui contiennent la date, pour le pôle de la tâche.
function periodForDate(activityId, poleKey, dueDate) {
  if (!dueDate) return null;
  try {
    const plan = goals.planningForActivity(activityId, poleKey);
    const periods = (plan && plan.periods) || [];
    const p = periods.find((x) => dueDate >= x.startDate && dueDate <= x.endDate);
    if (!p) return null;
    const days = Math.floor((Date.parse(dueDate + 'T00:00:00Z') - Date.parse(p.startDate + 'T00:00:00Z')) / 86400000);
    return { periodNumber: p.periodNumber, weekIndex: Math.min(4, Math.max(1, Math.floor(days / 7) + 1)) };
  } catch (e) {
    return null;
  }
}

// itemId : la tâche ; actorId : celui qui l'attribue. Jamais bloquant.
function notifyAssigned(itemId, actorId) {
  try {
    const row = db.prepare(`
      SELECT i.id, i.label, i.dueDate, i.plannedUserId, sp.activityId, sp.goalCategory
      FROM sub_project_items i
      JOIN sub_project_sections s ON s.id = i.sectionId
      JOIN sub_projects sp ON sp.id = s.subProjectId
      WHERE i.id = ?
    `).get(itemId);
    if (!row || !row.plannedUserId || row.plannedUserId === actorId) return false;
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(row.activityId, row.plannedUserId);
    if (!member) return false;
    const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(row.activityId) || {};
    let place = '';
    let poleKey = row.goalCategory;
    try {
      poleKey = goals.resolveToPole(row.activityId, row.goalCategory);
      const poleLabel = goals.categoryLabelFor(row.activityId, poleKey);
      const secLabel = poleKey !== row.goalCategory ? goals.categoryLabelFor(row.activityId, row.goalCategory) : '';
      place = [poleLabel, secLabel].filter(Boolean).join(' › ');
    } catch (e) { /* libellé facultatif */ }
    const lang = langOf(row.plannedUserId);
    const when = row.dueDate ? (lang === 'fr' ? row.dueDate.split('-').reverse().join('/') : row.dueDate) : '';
    const body = [row.label, act.name, place, when].filter(Boolean).join(' · ');
    const per = periodForDate(row.activityId, poleKey, row.dueDate);
    let url = '/?notif=taskassigned&activityId=' + row.activityId + '&taskId=' + row.id;
    if (poleKey) url += '&category=' + encodeURIComponent(poleKey);
    if (per) url += '&periodNumber=' + per.periodNumber + '&weekIndex=' + per.weekIndex;
    push.sendToUsers([row.plannedUserId], { title: TEXTS[lang].title, body, tag: 'task-assigned-' + row.id, url });
    return true;
  } catch (e) {
    console.warn('[taskassignnotif] échec :', e.message);
    return false;
  }
}

module.exports = { notifyAssigned };
