// Bilan, une activité à plusieurs membres : UN bouton (même composant que Jour / Semaine) fait passer les trois tableaux (Feuille de temps, Répartition, Graphique,
// par pôle et par secteur) d'un membre à l'autre. Données existantes seulement : GET /api/member-times (liste des membres) et les routes category-* avec ?memberId=.
// Usage : node test/bilan-membre-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const bb = rd('public/js/bilan-blocs.js'), app = rd('public/app.js'), routes = rd('server/routes/categorystats.js'), css = rd('public/css/stats-avance.css');
assert(bb.includes('a.membersCount > 1') && bb.includes("'/api/member-times?activityId=' + scope") && bb.includes("el('button', 'iconBtn', list[0].name)"), 'option affichée seulement pour une activité à plusieurs membres ; membres lus par la route existante ; bouton iconBtn (comme Jour / Semaine)');
assert(bb.includes('list[i].userId === d.me ? null : list[i].userId') && bb.includes('TMT.bilanCategoryStats.open(chronoHost, scope, name, '), 'le choix recharge les tableaux avec le membre (soi-même = sans memberId)');
assert(app.includes('open: function (hostEl, activityId, name, memberId)') && app.includes('memberId: memberId && memberId !== profile.id ? memberId : null'), 'pont app.js : memberId transmis à la fenêtre Chrono déplacée dans le Bilan');
assert(/memberId: opts\.memberId \|\| null/.test(app) && app.split("csCtx.memberId ? '&memberId='").length === 4, 'les trois routes (feuille, répartition du jour, graphique) reçoivent déjà ?memberId=');
assert(routes.includes('checkAccess(userId, activityId, req.query.memberId || null)') && routes.includes('checkAccess(req.userId, activityId, req.query.memberId || null)'), 'serveur : accès au membre réservé aux membres de l\'activité (inchangé)');
assert(!/#[0-9a-fA-F]{6}/.test(css.slice(css.indexOf('Bilan : nouveaux blocs'))) && !bb.slice(bb.indexOf('function memberSwitch'), bb.indexOf('var DEFS')).includes('style'),'aucune couleur ni style nouveau');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-membre-test OK'); process.exit(failed ? 1 : 0);
