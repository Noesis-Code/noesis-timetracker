// Statistiques de la Feuille de route : cartes par défaut, bouton-menu Tâches/Objectifs, semaine navigable, carte « Capacité » (seuil 120 %).
// Usage : node test/stats-feuille-test.js
const fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-sf-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) {}
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'stats-avance.js'), 'utf8');
const block = (key) => { const i = js.indexOf("{ key: '" + key + "'"); return i < 0 ? '' : js.slice(i, i + 60); };
// Cartes par défaut (le reste reste disponible dans « Ajouter une information »)
['onTime', 'weekdays'].forEach((k) => assert(/def: true/.test(block(k)), 'Tâches : « ' + k + ' » affichée par défaut'));
['remaining', 'workload'].forEach((k) => assert(block(k) && !/def: true/.test(block(k)), 'Tâches : « ' + k + ' » dans « Ajouter une information » (plus par défaut ; l\'alerte de capacité reste indépendante)'));
['estimate', 'postponed', 'capacity', 'urgent'].forEach((k) => assert(block(k) && !/def: true/.test(block(k)), 'Tâches : « ' + k + ' » dans « Ajouter une information » (code conservé)'));
['target', 'weeks'].forEach((k) => assert(block(k) && !/def: true/.test(block(k)), 'Objectifs : « ' + k + ' » dans « Ajouter une information » (code conservé)'));
['rhythm', 'streak', 'busy', 'assignees', 'achieved', 'carried', 'linked', 'pressure'].forEach((k) => assert(!new RegExp("key: '" + k + "'").test(js), 'Carte « ' + k + ' » supprimée définitivement du code et du rendu'));
assert(!/els\.selBtn|saSel/.test(js) && /iconBtn saModeBtn/.test(js) && !/statsPeriodMenuItem[^\n]*dataset\.tab/.test(js) && /key: 'advance', def: true/.test(js), 'plus de sélecteur en haut : bouton Tâches / Objectifs (comme Aujourd hui de la Répartition) dans la carte du graphique, distinct du menu ⋮ ; Objectifs affiche le graphique + Avancement');
assert(/tmt\.statsInfo\.|infoStore/.test(js) && /loadAdded\(tab\)/.test(js), 'préférences d\'ajout enregistrées (localStorage tmt.statsInfo.*) respectées');
const db = require('../server/db'), goals = require('../server/lib/goals'), ins = require('../server/lib/statsinsights');
assert(ins.CAPACITY_ALERT_PCT === 120, 'seuil d\'alerte de la carte Capacité : 120 %');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : tests serveur ignorés)'); process.exit(failed ? 1 : 0); }
let cat = goals.categoriesForActivity(m.activityId)[0];
if (!cat) { goals.addCategory(m.activityId, 'PoleTest'); cat = goals.categoriesForActivity(m.activityId)[0]; }
const goalstasks = require('../server/lib/goalstasks');
const pad = (n) => String(n).padStart(2, '0'), d = new Date(), today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
for (let i = 0; i < 4; i += 1) goalstasks.addCategoryTask(m.activityId, m.userId, cat.key, 'Tâche de test ' + i + ' capacité', { dueDate: today });
const addTime = (h) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, ?, ?, ?, ?, 'x', ?)").run(m.userId, m.activityId, today + 'T01:00:00Z', today + 'T02:00:00Z', Math.round(h * 3600), today, cat.key);
const get = (extra) => ins.insightsForActivity(m.activityId, m.userId, null, undefined, Object.assign({ scope: 'year', kind: 'weekly' }, extra || {}));
let r = get(); let w = r.tasks.workload;
assert(w && w.estimatedMin > 0, 'carte Capacité : temps estimé des tâches de la période (défaut 30 min par tâche sans estimation)');
const est = w.estimatedMin;
addTime(est * 1.1 / 60);
w = get().tasks.workload;
assert(w.pct >= 105 && w.pct <= 115 && w.over === false, 'temps passé à ~110 % de l\'estimé : pas d\'alerte');
addTime(est * 0.2 / 60); // ~130 %
w = get().tasks.workload;
assert(w.pct > 120 && w.over === true, 'au-delà de 120 % de l\'estimé : alerte (une fois par période côté client)');
// Répartition des tâches : SYNCHRONISÉE avec le graphique (même portée Année / Période / Semaine), sans navigation ni bouton « Aujourd'hui »
const oY = get().tasks.onTime, oW = get({ scope: 'week' }).tasks.onTime;
assert(oY && /^\d{4}$/.test(oY.label) && oY.total === oY.onTime + oY.late + oY.postponed, 'Répartition : portée Année par défaut (libellé = l\'année)');
assert(oW && /^\d\d\/\d\d – \d\d\/\d\d$/.test(oW.label) && oW.start <= oW.end, 'Répartition : portée Semaine = libellé de la semaine du graphique');
assert(js.indexOf("put(byKey('onTime'), false); put(byKey('advance'), false);") > 0, 'ordre des cartes : Répartition sous le graphique, puis Avancement');
assert(!/saTodayBtn/.test(js) && /function splitBody/.test(js) && /cmpEmpty/.test(js), 'Répartition : plus de bouton Aujourd\'hui, état vide commun (.cmpEmpty)');
const sp = get({ kind: 'weekly' }).objectives.split;
assert(sp && sp.total === sp.atteint + sp.partiel + sp.non, 'Répartition des objectifs : atteints / partiels / non atteints (Périodiques ou Hebdomadaires selon le ⋮)');
// Avancement (objectifs) : durée des tâches restantes vs temps réellement disponible (historique Chrono 4 semaines), seuil 20 %
assert(ins.ADVANCE_LATE_PCT === 20, 'Avancement : seuil de retard 20 % (même règle que le bilan)');
const sub = goals.secteursForPole(m.activityId, cat.key)[0] || { key: cat.key };
const dayMinus = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const histAdd = (h) => [3, 10, 17, 24].forEach((n) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, ?, ?, ?, ?, 'x', ?)").run(m.userId, m.activityId, dayMinus(n) + 'T01:00:00Z', dayMinus(n) + 'T02:00:00Z', Math.round(h * 3600), dayMinus(n), sub.key));
let adv = get({ kind: 'weekly' }).objectives.advance;
assert(!adv || !adv.list.some((x) => x.key === sub.key), "Avancement : sans historique de temps, rien n'est jugé");
histAdd(0.1); // très peu de temps disponible face aux tâches restantes
adv = get({ kind: 'weekly' }).objectives.advance;
const line = adv && adv.list.filter((x) => x.key === sub.key)[0];
assert(line && line.needMin > line.availMin * 1.2 && line.state === 'retard', 'Avancement : temps nécessaire > temps disponible + 20 % -> En retard');
histAdd(40); // beaucoup de temps disponible
adv = get({ kind: 'weekly' }).objectives.advance; const l2 = adv.list.filter((x) => x.key === sub.key)[0];
assert(l2.state === 'avance' && l2.pct === 100, 'Avancement : temps disponible >= temps nécessaire -> En avance');
console.log(failed ? '\nstats-feuille-test : ' + failed + ' échec(s)' : '\nstats-feuille-test : OK');
process.exit(failed ? 1 : 0);
