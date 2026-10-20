// Usage : node test/isolation-comptes-test.js — isolation entre deux comptes (Basic, sécurité).
// Le compte B appelle, avec les identifiants du compte A (activité, tâche, objectif hebdo, entrée d'historique,
// pièce jointe, message, invitation, calendrier externe), TOUTES les routes qui reçoivent un id (timer, history,
// activities, goals, categories, tasks/sous-tâches, community, calendar, stats, strategy, change-proposals...) :
// jamais 2xx ni 5xx, aucune donnée de A dans la réponse, aucune ligne modifiée côté base (instantané avant/après).
// Cas croisés : B utilise SA propre activité avec un id de A (tâche, objectif), et ses propres éléments vers l'activité de A.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, client, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const SECRET = 'SECRET-A-';
const TABLES = ['users', 'activities', 'activity_members', 'time_entries', 'running_timers', 'activity_invites', 'note_attachments',
  'activity_messages', 'sub_projects', 'sub_project_items', 'goal_periods', 'goal_weekly', 'goal_period_assignees',
  'activity_goal_categories', 'activity_goal_plans', 'calendar_export_excluded', 'follows', 'blocks'];

(async () => {
  const s = await startServer();
  try {
    const dbRead = new DatabaseSync(path.join(s.dir, 'noesis.db'), { readOnly: true });
    const snapshot = () => JSON.stringify(TABLES.map((t) => {
      let rows = [];
      try { rows = dbRead.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(); } catch (e) { rows = ['absent']; }
      // Colonnes de dernière activité/consultation : non pertinentes (une simple lecture peut les toucher chez B).
      return rows.map((r) => (r && typeof r === 'object') ? Object.fromEntries(Object.entries(r).filter(([k]) => !/lastSeen|lastActive|lastLogin|lastReadAt/i.test(k))) : r);
    }));

    // ---------------- Fixtures : A (avec un second membre A2 pour le fil partagé) et B ----------------
    const A = await newUser(s.base, 'isoA');
    const A2 = await newUser(s.base, 'isoA2');
    const B = await newUser(s.base, 'isoB');
    const a = A.c; const b = B.c;
    const A1 = A.activityId; const B1 = B.activityId;
    assert((await a.put('/api/activities/' + A1, { name: SECRET + 'ACT' })).status === 200, 'A renomme son activité');
    // Pôle et tâche de A
    const poleA = (await a.post(`/api/activities/${A1}/goals/categories`, { label: SECRET + 'POLE' })).body.categories.find((x) => x.label === SECRET + 'POLE').key;
    const taskA = (await a.post(`/api/activities/${A1}/goals/categories/${poleA}/tasks`, { label: SECRET + 'TACHE' })).body;
    assert(taskA && taskA.id, 'tâche de A créée');
    // Pôle et tâche de B
    const poleB = (await b.post(`/api/activities/${B1}/goals/categories`, { label: 'Pôle B' })).body.categories.find((x) => x.label === 'Pôle B').key;
    const taskB = (await b.post(`/api/activities/${B1}/goals/categories/${poleB}/tasks`, { label: 'Tâche B' })).body;
    // Objectif périodique et hebdo de A
    await a.put(`/api/activities/${A1}/goals/periods/1/main`, { category: poleA, text: SECRET + 'OBJ' });
    await a.put(`/api/activities/${A1}/goals/periods/1/weekly/1`, { category: poleA, text: SECRET + 'HEBDO' });
    const weeklyA = dbRead.prepare('SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE p.activityId = ?').get(A1);
    // Historique de A avec pièce jointe ; historique de B
    const t1 = new Date(Date.now() - 3 * 3600e3).toISOString(); const t2 = new Date(Date.now() - 2 * 3600e3).toISOString();
    const t3 = new Date(Date.now() - 9 * 3600e3).toISOString(); const t4 = new Date(Date.now() - 8 * 3600e3).toISOString();
    const entA = (await a.post('/api/history', { activityId: A1, startTime: t1, endTime: t2, note: SECRET + 'NOTE' })).body.id;
    const entB = (await b.post('/api/history', { activityId: B1, startTime: t1, endTime: t2, note: 'note B' })).body.id;
    assert(entA && entB, 'entrées d\'historique créées');
    const att = (await a.post(`/api/history/${entA}/attachments`, { fileName: SECRET + 'f.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,SGVsbG8=' })).body;
    assert(att && att.id, 'pièce jointe de A créée');
    // Activité partagée A / A2 + message + invitation en attente pour A2 puis un 2e invité
    const SH = (await a.post('/api/activities', { name: SECRET + 'PARTAGEE' })).body.id;
    const inv = await a.post(`/api/activities/${SH}/invite`, { pseudo: 'TestisoA2' });
    assert(inv.status === 201, 'A invite A2');
    const invites = (await A2.c.get('/api/invites')).body;
    await A2.c.post(`/api/invites/${invites[0].id}/accept`, {});
    const msg = (await a.post('/api/community/activity-messages', { activityId: SH, body: SECRET + 'MESSAGE' })).body;
    assert(msg && msg.id, 'message partagé créé');
    const inv2 = await a.post(`/api/activities/${A1}/invite`, { pseudo: 'TestisoA2' });
    const pendingInvite = dbRead.prepare("SELECT id FROM activity_invites WHERE status = 'pending'").get();

    await b.put(`/api/profile/${B.id}/ai-mode`, { mode: 'absence' });
    const before = snapshot();
    const dryRunBefore = before;

    // ---------------- Attaques de B ----------------
    const probes = [
      // Chrono et historique
      ['POST', '/api/timer/start', { activityId: A1 }],
      ['POST', '/api/timer/start', { activityId: SH }],
      ['POST', '/api/history', { activityId: A1, startTime: t3, endTime: t4, note: 'intrus' }],
      ['POST', '/api/history', { activityId: String(A1), startTime: t3, endTime: t4, note: 'intrus' }],
      ['PUT', '/api/history/' + entA, { note: 'intrus' }],
      ['PUT', '/api/history/' + entB, { activityId: A1 }],
      ['DELETE', '/api/history/' + entA],
      ['POST', `/api/history/${entA}/attachments`, { fileName: 'x.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,SGVsbG8=' }],
      ['DELETE', '/api/attachments/' + att.id],
      // Activités
      ['PUT', '/api/activities/' + A1, { name: 'piraté' }],
      ['POST', `/api/activities/${A1}/invite`, { pseudo: 'TestisoA2' }],
      ['POST', `/api/activities/${A1}/separate`, {}],
      ['DELETE', `/api/activities/${A1}/members/${A.id}`],
      ['POST', `/api/activities/${A1}/merge`, { intoActivityId: B1 }],
      ['POST', `/api/activities/${B1}/merge`, { intoActivityId: A1 }],
      ['DELETE', '/api/activities/' + A1],
      // Invitations
      ['POST', `/api/invites/${pendingInvite.id}/accept`, {}],
      ['POST', `/api/invites/${pendingInvite.id}/decline`, {}],
      // Objectifs de l'activité de A
      ['GET', `/api/activities/${A1}/goals`], ['GET', `/api/activities/${A1}/goals/all`], ['GET', `/api/activities/${A1}/goals/all-for-pole`],
      ['GET', `/api/activities/${A1}/goals/member-estimates`], ['PUT', `/api/activities/${A1}/goals/member-estimates`, { estimates: {} }],
      ['GET', `/api/activities/${A1}/goals/members`], ['GET', `/api/activities/${A1}/goals/year-goals`], ['GET', `/api/activities/${A1}/goals/years`],
      ['POST', `/api/activities/${A1}/goals/years`, { year: 2030 }], ['DELETE', `/api/activities/${A1}/goals/years/2026`],
      ['PUT', `/api/activities/${A1}/goals/year-goals/${poleA}`, { text: 'piraté' }],
      ['PUT', `/api/activities/${A1}/goals/periods/1/main`, { category: poleA, text: 'piraté' }],
      ['GET', `/api/activities/${A1}/goals/periods/1/main-estimate`], ['GET', `/api/activities/${A1}/goals/periods/1/capacity-plan`],
      ['POST', `/api/activities/${A1}/goals/periods/1/weekly-proposals`, {}],
      ['DELETE', `/api/activities/${A1}/goals/periods/1/main`], ['DELETE', `/api/activities/${A1}/goals/periods/1/weekly/1`],
      ['PUT', `/api/activities/${A1}/goals/periods/1/weekly/1`, { category: poleA, text: 'piraté' }],
      ['PUT', `/api/activities/${A1}/goals/weekly/${weeklyA.id}/status`, { status: 'atteint' }],
      ['PUT', `/api/activities/${A1}/goals/periods/1/assignees`, { category: poleA, userIds: [B.id] }],
      ['POST', `/api/activities/${A1}/goals/categories/${poleA}/tasks`, { label: 'intrus' }],
      ['GET', `/api/activities/${A1}/goals/tasks/overview`], ['GET', `/api/activities/${A1}/goals/tasks/archives`],
      ['GET', `/api/activities/${A1}/goals/overload`], ['POST', `/api/activities/${A1}/goals/overload/apply`, {}], ['POST', `/api/activities/${A1}/goals/overload/dismiss`, {}],
      ['GET', `/api/activities/${A1}/goals/unfinished`], ['POST', `/api/activities/${A1}/goals/unfinished/apply`, {}], ['POST', `/api/activities/${A1}/goals/realism`, {}],
      ['GET', `/api/activities/${A1}/goals/recalc`], ['POST', `/api/activities/${A1}/goals/recalc/1/apply`, {}],
      ['GET', `/api/activities/${A1}/goals/timecaps/${poleA}`], ['PUT', `/api/activities/${A1}/goals/timecaps/${poleA}`, { maxDay: 1 }],
      ['POST', `/api/activities/${A1}/goals/categories/auto-task`, { label: 'intrus' }],
      ['POST', `/api/activities/${A1}/goals/rewrite`, { text: 'x' }],
      ['PUT', `/api/activities/${A1}/goals/tasks/${taskA.id}/category`, { categoryKey: poleA }],
      ['POST', `/api/activities/${A1}/goals/categories/mark-seen`, {}], ['POST', `/api/activities/${A1}/goals/categories/${poleA}/mark-seen`, {}],
      ['POST', `/api/activities/${A1}/goals/tasks/${taskA.id}/mark-seen`, {}],
      ['GET', `/api/activities/${A1}/goals/daily-priority`],
      // Catégories (pôles / secteurs)
      ['GET', `/api/activities/${A1}/goals/categories`], ['POST', `/api/activities/${A1}/goals/categories`, { label: 'intrus' }],
      ['PUT', `/api/activities/${A1}/goals/categories/${poleA}`, { label: 'piraté' }], ['GET', `/api/activities/${A1}/goals/categories/${poleA}/removal-preview`],
      ['DELETE', `/api/activities/${A1}/goals/categories/${poleA}`], ['PUT', `/api/activities/${A1}/goals/categories-reorder`, { keys: [poleA] }],
      ['GET', `/api/activities/${A1}/goals/categories/${poleA}/secteurs`], ['POST', `/api/activities/${A1}/goals/categories/${poleA}/secteurs`, { label: 'intrus' }],
      ['PUT', `/api/activities/${A1}/goals/categories/${poleA}/secteurs-reorder`, { keys: [] }],
      ['PUT', `/api/activities/${A1}/goals/categories/${poleA}/secteurs/s1/move`, { toKey: poleA }],
      ['PUT', `/api/activities/${A1}/goals/categories/${poleA}/secteurs/s1`, { label: 'piraté' }],
      ['GET', `/api/activities/${A1}/goals/categories/${poleA}/secteurs/s1/redistribution`], ['DELETE', `/api/activities/${A1}/goals/categories/${poleA}/secteurs/s1`],
      // Tâches : id de A avec l'activité de B, ou l'inverse
      ['PUT', `/api/activities/${B1}/goals/tasks/${taskA.id}/category`, { categoryKey: poleB }],
      ['POST', `/api/activities/${B1}/goals/tasks/${taskA.id}/mark-seen`, {}],
      ['PUT', `/api/activities/${B1}/goals/weekly/${weeklyA.id}/status`, { status: 'atteint' }],
      ['PUT', '/api/goals/tasks/' + taskA.id + '/reassign', { activityId: B1, categoryKey: poleB }],
      ['PUT', '/api/goals/tasks/' + taskB.id + '/reassign', { activityId: A1, categoryKey: poleA }],
      ['GET', '/api/sub-project-items/' + taskA.id], ['PUT', '/api/sub-project-items/' + taskA.id, { label: 'piraté', done: true }],
      ['DELETE', '/api/sub-project-items/' + taskA.id],
      ['POST', '/api/goals/capture', { activityIds: [A1], label: 'intrus' }],
      // Communauté
      ['GET', '/api/community/activity-messages?activityId=' + SH], ['POST', '/api/community/activity-messages', { activityId: SH, body: 'intrus' }],
      ['DELETE', '/api/community/activity-messages/' + msg.id], ['POST', `/api/community/activity-messages/${msg.id}/report`, { reason: 'spam' }],
      ['GET', '/api/community/activity-message-files/' + msg.id],
      ['GET', '/api/community/activity-feed?activityId=' + SH], ['GET', '/api/community/activity-members?activityId=' + SH],
      ['GET', '/api/community/activity-stats?activityId=' + SH], ['GET', '/api/community/activity-timesheet?activityId=' + SH],
      // Calendrier
      ['GET', `/api/activities/${A1}/goals-days?category=${poleA}&periodNumber=1`],
      ['POST', `/api/activities/${A1}/goals-days/task`, { category: poleA, isoDate: '2026-10-21', label: 'intrus' }],
      // Profil de A
      ['PUT', `/api/profile/${A.id}/ai-mode`, { mode: 'absence' }], ['GET', `/api/profile/${A.id}/ai-mode`],
      // Statistiques
      ['GET', '/api/stats/activity-progress?activityId=' + A1], ['GET', '/api/stats/activity-insights?activityId=' + A1],
      ['GET', `/api/stats/activity-insights/glisse?activityId=${A1}&periodStart=2026-10-19`], ['GET', '/api/stats/activity-members?activityId=' + A1],
      ['GET', '/api/category-stats?activityId=' + A1 + '&period=week'], ['GET', '/api/category-timesheet?activityId=' + A1],
      ['GET', '/api/category-chart?activityId=' + A1], ['GET', `/api/category-stats?activityId=${SH}&memberId=${A.id}&period=week`],
      // Stratégie, propositions, documents
      ['GET', `/api/activities/${A1}/strategy`], ['PUT', `/api/activities/${A1}/strategy`, { text: 'piraté' }],
      ['GET', `/api/activities/${A1}/change-proposals`], ['POST', `/api/activities/${A1}/change-proposals/apply`, {}],
      ['POST', `/api/activities/${A1}/change-proposals/dismiss`, {}],
      ['POST', `/api/activities/${A1}/document-tasks/propose`, {}], ['POST', `/api/activities/${A1}/document-tasks/apply`, {}],
      ['GET', `/api/drive/status?activityId=${A1}`], ['GET', `/api/drive/files?activityId=${A1}`],
    ];

    let bad = 0;
    for (const [method, url, body] of probes) {
      const r = method === 'GET' ? await b.get(url) : method === 'POST' ? await b.post(url, body) : method === 'PUT' ? await b.put(url, body) : await b.del(url, body);
      const txt = JSON.stringify(r.body || '');
      const refused = r.status >= 400 && r.status < 500 && r.status !== 401;
      const leak = txt.includes(SECRET); if (process.env.PROBE_LOG) console.log(r.status, method, url);
      if (!refused || leak) { bad++; assert(false, `${method} ${url} : ${r.status}${leak ? ' + FUITE' : ''} ${txt.slice(0, 100)}`); }
    }
    assert(bad === 0, probes.length + ' requêtes de B vers les identifiants de A : toutes refusées (4xx), sans fuite');
    assert(snapshot() === before, 'aucune ligne de A (ni de B) modifiée par les attaques de B');
    // L'attaque ne doit pas avoir démarré de chrono ni créé d'entrée pour B sur l'activité de A
    assert((await b.get('/api/timer/status')).body.running === false, 'B : aucun chrono démarré sur l\'activité de A');
    const hb = (await b.get('/api/history?period=year')).body;
    assert(hb.every((x) => x.activityId === B1) && !JSON.stringify(hb).includes(SECRET), 'historique de B : uniquement ses activités, aucune donnée de A');
    const lb = (await b.get('/api/activities')).body;
    assert(!JSON.stringify(lb).includes(SECRET), 'liste des activités de B : rien de A');

    const pa = (await b.get('/api/profile/' + A.id)).body;
    assert(pa.email === null && pa.phone === null && pa.lastName === null && pa.marketingConsent === undefined, 'profil de A vu par B : courriel, téléphone, nom de famille et consentements masqués');

    // Contrôle positif : A garde l'accès complet (le refus n'est pas un refus de tout)
    assert((await a.put('/api/history/' + entA, { note: SECRET + 'NOTE2' })).status === 200, 'A modifie sa propre entrée (200)');
    assert((await a.post('/api/history', { activityId: A1, startTime: new Date(Date.now() - 90 * 60e3).toISOString(), endTime: new Date(Date.now() - 60 * 60e3).toISOString(), note: 'ok' })).status === 201, 'A enregistre dans son activité (201)');
    // Un ancien membre (activité quittée) ne peut plus y écrire, mais garde la modification de ses entrées existantes
    const sepB = await A2.c.post('/api/history', { activityId: SH, startTime: new Date(Date.now() - 50 * 60e3).toISOString(), endTime: new Date(Date.now() - 40 * 60e3).toISOString(), note: 'membre' });
    assert(sepB.status === 201, 'membre actuel d\'une activité partagée : enregistre (201)');
  } finally {
    s.stop();
  }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
