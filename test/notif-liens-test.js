// Chaque adresse ?notif=type&... envoyée par le serveur mène à un écran qui existe (analyse de texte).
// Table type -> écran : docs/audits/notifications-liens-2026-10-20.md.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const all = [app, html, ...fs.readdirSync(path.join(root, 'public/js')).map((f) => read('public/js/' + f))].join('\n');
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };

// 1. Types émis par le serveur (hors commentaires de ligne).
const types = new Set();
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).forEach((e) => {
  const rel = d + '/' + e.name;
  if (e.isDirectory()) return walk(rel);
  if (!e.name.endsWith('.js')) return;
  read(rel).split('\n').forEach((l) => {
    if (/^\s*\/\//.test(l)) return;
    for (const m of l.matchAll(/\?notif=([a-z]+)/g)) types.add(m[1]);
  });
});
walk('server');
if (types.size < 10) fail('trop peu de types détectés : ' + [...types].join(','));

// 2. Une branche du client par type.
const body = app.slice(app.indexOf('function openTabFromNotification'));
for (const t of types) if (!new RegExp("target === '" + t + "'").test(body)) fail('?notif=' + t + ' : aucune branche dans openTabFromNotification');

// 3. Écrans visés qui existent.
for (const id of ['followRequestsList', 'invitesList', 'goalsTasksGroups', 'tradePageTitle', 'followingFeed', 'viewProfilePostsList', 'activitiesList']) {
  if (!all.includes(id)) fail('élément visé introuvable : #' + id);
}
// 4. ?notif=activity : l'écran Discussion n'existe plus, la branche ne doit plus l'attendre.
const act = body.slice(body.indexOf("target === 'activity'"), body.indexOf("target === 'subproject'"));
if (/ModeDiscBtn|setGoalsPage2Mode/.test(act)) fail('?notif=activity vise encore l\'écran Discussion retiré');
if (!/switchTab\('goals'\)/.test(act) || !/openGoalsActivityFromNotification/.test(act)) fail('?notif=activity doit ouvrir la Page 2 de l\'activité');
if (bad) process.exit(1);
console.log('  ✓ ' + types.size + ' types de notification (' + [...types].sort().join(', ') + ') : branche et écran existants');
