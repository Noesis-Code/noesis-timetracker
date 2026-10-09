// Test de la route GET /api/stats/profile-insights (statistiques tâches/objectifs d'un profil visité).
// Prouve : activité confidentielle exclue (liste + accès direct), non-abonné refusé, abonné accepté OK,
// réponse sans titres de tâches. Usage : node test/stats-profile-insights-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-spi-'));
const db = require('../server/db');
const goals = require('../server/lib/goals');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const now = new Date().toISOString();
const today = now.slice(0, 10);
['own', 'fol', 'str'].forEach((id) => db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang) VALUES (?, ?, '', '', '', '#674EA7', ?, '', 'dark', 1, 'fr')").run(id, id, now));
function mkActivity(name, confidential) {
  const a = db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)').run(name, 'own', 'tok' + name, now).lastInsertRowid;
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt, confidential) VALUES (?, ?, ?, ?, ?)').run(a, 'own', '#4CAF50', now, confidential ? 1 : 0);
  const cat = goals.ensureDefaultCategory(Number(a))[0].key;
  const sp = db.prepare('INSERT INTO sub_projects (activityId, name, description, createdBy, position, createdAt, goalCategory) VALUES (?, ?, ?, ?, 0, ?, ?)').run(a, 'Projet ' + name, '', 'own', now, cat).lastInsertRowid;
  db.prepare('INSERT INTO sub_project_items (subProjectId, label, done, doneAt, position, createdAt, dueDate) VALUES (?, ?, 1, ?, 0, ?, ?)').run(sp, 'TITRE-SECRET-' + name, now, now, today);
  return Number(a);
}
const pub = mkActivity('Pub', false);
const conf = mkActivity('Secret', true);
db.prepare("INSERT INTO follows (followerId, followeeId, status, createdAt, respondedAt) VALUES ('fol', 'own', 'accepted', ?, ?)").run(now, now);

const app = express();
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
app.use('/api', require('../server/routes/statsactivityprogress'));
const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const get = async (user, qs) => { const r = await fetch(base + '/api/stats/profile-insights?' + qs, { headers: user ? { 'x-user': user } : {} }); let j = null; try { j = await r.json(); } catch (e) { /* vide */ } return { s: r.status, j }; };
  try {
    let r = await get('fol', 'userId=own');
    assert(r.s === 200, 'abonné accepté : 200');
    assert(r.j.activities.length === 1 && r.j.activities[0].id === pub, 'seule l’activité publique est listée');
    assert(r.j.activityId === pub && r.j.data && r.j.data.tasks, 'activité publique sélectionnée par défaut, données présentes');
    assert(r.j.data.tasks.onTime && r.j.data.tasks.streak && r.j.data.tasks.streak.days >= 1, 'carte à la date prévue + série en cours');
    assert(!JSON.stringify(r.j).includes('TITRE-SECRET'), 'aucun titre de tâche dans la réponse');
    assert(!('estimate' in r.j.data.tasks) && !('capacity' in r.j.data.tasks) && !('assignees' in r.j.data.tasks) && !('busy' in r.j.data.tasks), 'pas de durées estimées / capacité / responsable / agenda');
    r = await get('fol', 'userId=own&activityId=' + conf);
    assert(r.s === 403, 'activité confidentielle demandée directement : 403');
    r = await get('fol', 'userId=own&activityId=' + pub + '&year=all&scope=year&kind=all');
    assert(r.s === 200 && r.j.data.chart.objectives.all, 'vue « Tout » acceptée');
    r = await get('str', 'userId=own');
    assert(r.s === 403, 'non-abonné : 403');
    r = await get('str', 'userId=own&activityId=' + pub);
    assert(r.s === 403, 'non-abonné avec activité publique : 403');
    r = await get(null, 'userId=own');
    assert(r.s === 401, 'sans session : 401');
    r = await get('fol', 'userId=inconnu');
    assert(r.s === 404, 'profil inconnu : 404');
    // Détail « Où ça glisse » : réservé aux membres de l'activité (jamais un visiteur de profil).
    const g = async (u) => (await fetch(base + '/api/stats/activity-insights/glisse?activityId=' + pub + '&periodStart=' + today.slice(0, 8) + '01', { headers: { 'x-user': u } })).status;
    assert(await g('fol') === 403, 'glisse : non-membre (visiteur) refusé');
    assert(await g('own') === 200, 'glisse : membre accepté');
    // Activité partagée : le visiteur membre de l'activité « Secret » la voit (même règle que le camembert).
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(conf, 'fol', '#111111', now);
    r = await get('fol', 'userId=own');
    assert(r.s === 200 && r.j.activities.length === 2, 'activité confidentielle partagée avec le visiteur : visible (règle du camembert)');
  } catch (e) { failed += 1; console.log('  FAIL exception ' + e.stack); }
  srv.close();
  console.log(failed ? failed + ' échec(s)' : 'Tout est vert.');
  process.exit(failed ? 1 : 0);
});
