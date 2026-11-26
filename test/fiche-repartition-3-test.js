// Fiche d'une catégorie, retours du 19 nov. 2026 : (1) « Part des tâches (%) » fusionnée dans la Répartition des tâches (migration sans perte, le Bilan lit la répartition) ; (2) Répartition en tableau, enregistrée par le bouton du bas ;
// (3) le bouton du bas remplace la barre des volets ET le « + » ; (4) séparateurs sous Responsables et Stratégie, aucun sous la dernière option. Usage : node test/fiche-repartition-3-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-fiche3-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
// ---- Serveur : migration et lecture par le Bilan ----
const db = require('../server/db'); require('../server/lib/partagetaches');
const B = require('../server/lib/bilan'), RM = require('../server/lib/repartition-membres');
['u1', 'u2', 'u3'].forEach((id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id.toUpperCase()));
const mk = (name, ms) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(name, ms[0]).lastInsertRowid); ms.forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(id, u)); return id; };
const wanted = (act) => Object.fromEntries(B.proportion('u1', act, '2027-03-10').rows.map((r) => [r.userId, r.wantedPct]));
// 1. parts saisies dans l'ancien bloc, aucune répartition : copiées (total 100)
const A = mk('Duo', ['u1', 'u2']);
db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)').run(A, 'u1', 60); db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)').run(A, 'u2', 40);
let w = wanted(A);
assert(w.u1 === 60 && w.u2 === 40, 'migration : les parts saisies deviennent la répartition de l’activité, lues par le Bilan');
const lu = RM.lire(A, '_');
assert(lu.own && lu.own.u1 === 60 && lu.own.u2 === 40, 'la Répartition des tâches (niveau « _ ») les contient');
assert(db.prepare('SELECT COUNT(*) AS n FROM task_share_pct WHERE activityId = ?').get(A).n === 2, 'la table d’origine n’est pas effacée');
// 2. total inférieur à 100 : ramené à 100 sans perte de proportion
const C = mk('Trio', ['u1', 'u2', 'u3']);
db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)').run(C, 'u1', 30); db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)').run(C, 'u2', 10);
w = wanted(C);
assert(w.u1 + w.u2 + w.u3 === 100 && w.u1 === 75 && w.u2 === 25 && w.u3 === 0, 'migration : 30/10 devient 75/25/0 (total 100)');
// 3. une répartition existe déjà : les anciennes parts ne l'écrasent pas
const D = mk('Duo2', ['u1', 'u2']);
RM.poser(D, '_', { u1: 50, u2: 50 }); db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)').run(D, 'u1', 90);
w = wanted(D);
assert(w.u1 === 50 && w.u2 === 50, 'la répartition existante prime : le Bilan la lit');
// 4. sans aucune part : demandée vide (rien d'inventé)
const E = mk('Duo3', ['u1', 'u2']); w = wanted(E);
assert(w.u1 == null && w.u2 == null, 'sans répartition ni part : demandée vide');
// 5. une répartition posée change la demandée du Bilan
RM.poser(E, '_', { u1: 20, u2: 80 }); w = wanted(E);
assert(w.u1 === 20 && w.u2 === 80, 'répartition posée : le Bilan la lit (affichage inchangé : rows[].wantedPct)');
// ---- Interface : sources ----
const app = read('public/app.js'), cr = read('public/js/objectifs-creer.js'), css = read('public/css/objectifs-creer.css');
const a = app.indexOf('function buildRepartitionBlock('), rep = app.slice(a, app.indexOf('TMT.buildStrategieBlock = ', a));
assert(!/Part des tâches \(%\)/.test(cr) && !/\/api\/bilan\/proportion/.test(cr), 'fiche : plus de « Part des tâches (%) » (interface et appel)');
assert(/t\('Total'\)/.test(rep) && /TMT\.ui\.chev/.test(rep) && /repPct/.test(rep) && /hours: h/.test(rep), 'Répartition : ligne Total, pourcentage calculé, menu déroulant standard');
// Tableau standard : les MÊMES classes que « Ajuste ton temps » (composant partagé de composants.css, R29), sans cases encadrées ni ancien .objTimeRow
const comp = read('public/css/composants.css'), retardCss = read('public/css/objectifs-retard.css'), retardJs = read('public/js/objectifs-retard.js');
assert(/'retTable retTable--3'/.test(rep) && /'retTRow'/.test(rep) && /retTotal/.test(rep) && /cell\('span'/.test(rep) && /'retVal'/.test(rep) && !/objTimeRow|objHoursVal/.test(rep), 'Répartition : tableau .retTable / .retTRow / .retVal (trois colonnes nom | heures | pourcentage), Total en pied');
assert(/'retTable'/.test(retardJs) && /'retTRow'/.test(retardJs), '« Ajuste ton temps » utilise les mêmes classes');
assert(/\.retTable \{/.test(comp) && /\.retTRow \{/.test(comp) && !/\.retTable \{|\.retTRow \{/.test(retardCss), 'le tableau standard est défini UNE fois, dans composants.css (plus dans objectifs-retard.css)');
assert(/retInput/.test(rep) && /retInput \{[^}]*border: 0/.test(comp), 'heures : champ discret dans la cellule (sans bordure ni fond), pas de case encadrée');
assert(/\.catStrategieBody \.msg:empty/.test(css) && /objPanelFoot:has\(> \.objMsg:empty\)/.test(css) && /\.catStrategieBody \{ padding-bottom: 0; \}/.test(css), 'espace du bas = celui du haut (12 px du panneau) : message vide, pied vide et padding-bas retirés');
// Comportement du pourcentage (même algorithme que pcts() de app.js : heures / total, somme 100, plus grand reste) : 30 / 20 / 10 h -> 50 / 33 / 17 %
(function () { const hrs = { a: 30, b: 20, c: 10 }, T = 60, base = {}, rest = []; Object.keys(hrs).forEach((u) => { const v = hrs[u] * 100 / T; base[u] = Math.floor(v); rest.push([u, v - base[u]]); }); let miss = 100 - Object.values(base).reduce((x, y) => x + y, 0); rest.sort((x, y) => y[1] - x[1]).forEach((r) => { if (miss > 0) { base[r[0]]++; miss--; } }); assert(base.a === 50 && base.b === 33 && base.c === 17 && base.a + base.b + base.c === 100, 'pourcentages dérivés des heures : 50 / 33 / 17 = 100'); })();
assert(/function pcts\(\)[\s\S]*hrs\(u\) \* 100 \/ T/.test(rep) && /i\.addEventListener\('input'[\s\S]*refresh\(\)/.test(rep), 'le pourcentage est recalculé à chaque frappe');
const ficheSrc = cr.slice(cr.indexOf('function openFiche('), cr.indexOf('function proposeReorg('));
assert(!/Temps prévu/.test(ficheSrc) && !/member-times/.test(ficheSrc), 'fiche : plus de bloc « Temps prévu » (absorbé par la Répartition)');
assert(!/suggestion/.test(rep), 'plus de proposition de changer le niveau du dessus');
assert(!/data-role', 'save'|textContent = t\('Enregistrer'\)/.test(rep), 'Répartition : plus de bouton « Enregistrer » propre au bloc');
assert(/Pour garder le total, ajuster/.test(rep) && /Accepter/.test(rep) && /Refuser/.test(rep), 'propositions d’ajustement vers le bas conservées (Accepter / Refuser)');
assert(/Reprendre celle du dessus/.test(rep) && /className = 'activityEditRow cmpSepRow'/.test(rep), '« Reprendre celle du dessus » : ligne discrète au composant existant, séparateur commun (R22/R51 : jamais sous la dernière)');
assert(/rep\.valid\(\)/.test(cr) && /repBlock\.rep\.save/.test(cr), 'fiche : le bouton du bas enregistre la répartition, seulement si le total d’heures est > 0');
const strat = app.slice(app.indexOf('function buildStrategieBlock('), app.indexOf('function buildRepartitionBlock('));
assert(/activityEditRow cmpSepRow/.test(strat) && rep.indexOf("head.className = 'activityEditRow cmpSepRow'") < 0, 'séparateurs : un trait sous Stratégie, aucun sous l’en-tête Répartition des tâches (dernière option)');
assert(/activityEditRow cmpSepRow/.test(read('public/js/responsables-ui.js')), 'séparateur sous Responsables (inchangé)');
// ---- Dock : tout bouton du bas remplace la barre ET le « + » ----
const fiche = cr.slice(cr.indexOf('function openFiche('), cr.indexOf('function openEdit(') > 0 ? cr.indexOf('function proposeReorg(') : undefined);
assert(/expSave', 'objDockBar'\)/.test(fiche), 'fiche : le dock porte objDockBar (barre masquée)');
const edit = cr.slice(cr.indexOf('function openEdit('));
assert(/dock\.classList\.add\('expSave', 'objDockBar'\)/.test(edit), 'Modifier l’objectif : le dock porte objDockBar');
assert(/'expSave', 'expExtend', 'objDockBar'/.test(cr), 'mode étendre : le dock porte objDockBar');
assert(/dock\.classList\.add\('expSave', 'objDockBar'\); stepLabel\.textContent = i < tot/.test(cr.replace(/\n\s*/g, ' ')) || /'expSave', 'objDockBar'\);/.test(cr), 'étapes de création : objDockBar');
assert(/:root\.objBarOn \.tabbar \{ visibility: hidden; \}/.test(css) && /:root\.dockSaveOn \.tabbar \{ visibility: hidden; \}/.test(read('public/css/composants.css')), '.tabbar (pilule ET « + ») masquée par objBarOn et dockSaveOn');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout passe'); process.exit(failed ? 1 : 0);
