// Étape « Temps » de la création, refaite (9 nov. 2026) : UNE seule question « Heures par semaine » (0 à 80 h, décimale permise, vide si inconnu) ; plus d'« Objectifs inclus », de terme ni de lignes multi-activités ;
// les valeurs par défaut des données (terme déduit du niveau, objectifs inclus « les deux », périodes) sont inchangées : même résultat côté serveur qu'avant.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-temps-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');

// ---- Heures par semaine : saisie ----
const a = src.indexOf('  function parseHours(raw) {'), b = src.indexOf('  function multiOf(days)');
assert(a > 0 && b > a, 'validation des heures trouvée');
const parseHours = new Function(src.slice(a, b) + '\nreturn parseHours;')();
const P = (x) => JSON.stringify(parseHours(x));
assert(P('') === '{"ok":true,"value":null}' && P('   ') === '{"ok":true,"value":null}' && P(null) === '{"ok":true,"value":null}', 'vide : accepté, valeur inconnue (null)');
assert(P('0') === '{"ok":true,"value":null}', '0 : aucune heure (null)');
assert(P('7') === '{"ok":true,"value":7}' && P('12') === '{"ok":true,"value":12}' && P('80') === '{"ok":true,"value":80}', 'entiers de 1 à 80 acceptés (80 compris)');
assert(P('7.5') === '{"ok":true,"value":7.5}' && P('7,5') === '{"ok":true,"value":7.5}' && P('2.') === '{"ok":true,"value":2}', 'décimale permise (point ou virgule)');
assert(parseHours('80.5').ok === false && parseHours('81').ok === false && parseHours('100').ok === false && parseHours('999').ok === false, 'au-delà de 80 : refusé');
assert(parseHours('abc').ok === false && parseHours('-3').ok === false && parseHours('1.25').ok === false && parseHours('1e2').ok === false, 'texte illisible, négatif ou plus d’une décimale : refusé');

// ---- La page ne contient plus que cette question ----
const t0 = src.indexOf('    // Étape « Temps » (refaite le 9 nov. 2026'), t1 = src.indexOf('    function refresh() { renderActivities(); syncTerm(); paintHours(); }');
const page = src.slice(t0, t1);
assert(t0 > 0 && t1 > t0, 'bloc de l’étape Temps trouvé');
assert(!/Objectifs inclus|Périodiques|Hebdomadaires|tr\('Terme'\)|paintTermInto\(|goalCounts|objTimeRow|fmtH\(/.test(page.replace(/\/\/.*$/gm, '')), 'plus d’« Objectifs inclus », de terme, de nombres ni de lignes multi-activités sur la page');
assert((page.match(/field\(tr\('Heures par semaine'\), inp\)/g) || []).length === 1 && (page.match(/el\('input'\)/g) || []).length === 1, 'une seule question « Heures par semaine », un seul champ');
assert(page.includes('var t = targets()[0]') && page.includes('ctx.weeklyHours ? ctx.weeklyHours[t.id] : null') && page.includes('form.hoursBy[t.key] = adv || null'), 'pour l’activité choisie ; valeur de départ = historique Chrono (ctx.weeklyHours), vide si inconnu');
assert(page.includes("if (!h.ok) { inp.value = last; return; }"), 'un nombre refusé (80+) ne s’inscrit pas : la dernière valeur valide reste');
assert(src.includes('refresh() { renderActivities(); syncTerm(); paintHours(); }') && !src.includes('paintPeriods'), 'la page Activité et le terme restent synchronisés (le terme se déduit du niveau, sans affichage)');

// ---- Valeurs par défaut des données inchangées ----
assert(page.includes("form.innerGoals = form.innerGoals || 'les_deux';") && page.includes("{ activite: 'pluriannuel', pole: 'annee', secteur: 'periode' }[form.level || 'activite']") && page.includes('if (form.weekly === undefined) form.weekly = true;'), 'valeurs par défaut conservées : objectifs inclus « les deux », terme déduit du niveau (long / moyen / court)');
assert(src.includes("term: form.term, inner: innerOf(), level: form.level, poleKey: form.poleKey, categoryKey: form.categoryKey, hoursPerWeek: form.hoursBy[t.key] || null"), 'la requête de création est inchangée (terme, objectifs inclus, niveau, heures)');
assert(src.includes('function paintTermInto(box, form, days, onChange)') && src.includes('paintTermInto(tBox, form, daysOf(form.endDate), sync)'), 'la page de modification d’un objectif existant est intacte (paintTermInto conservée pour la règle de durée à rebrancher)');

// ---- Création complète côté serveur : mêmes périodes et semaines qu'avant, heures saisies / vides ----
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const pole = categories.addCategory(act, 'Production'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
const sec = categories.addCategory(act, 'Atelier bois', poleKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, poleKey)[0].key;
const end = addDays(today, 119); // 17 semaines : 5 périodes de 4 semaines, les deux sortes d'objectifs
const mk = (extra) => o.creer('u1', Object.assign({ title: 'Obj ' + Math.random().toString(36).slice(2, 6), activityId: act, startDate: today, endDate: end, inner: 'les_deux' }, extra));
const base = mk({ level: 'secteur', poleKey, categoryKey: secKey, term: 'periode' });
const periods = base.periods || base.steps;
const nWeeks = (periods || []).reduce((n, p) => n + (p.weeks ? p.weeks.length : 0), 0);
assert(periods && periods.length === 5 && nWeeks === 18 && JSON.stringify(periods.map((p) => p.weeks.length)) === '[4,4,4,4,2]' && base.innerGoals === 'les_deux' && base.term === 'periode', 'création par défaut (secteur, 119 jours) : 5 périodes (4 × 4 semaines + 2) et 18 semaines, objectifs inclus « les deux », terme court — comme avant');
const hPlain = mk({ level: 'pole', poleKey, term: 'annee', hoursPerWeek: 7.5 });
const hEmpty = mk({ level: 'activite', term: 'pluriannuel' });
const hBig = mk({ level: 'activite', term: 'pluriannuel', hoursPerWeek: 95 });
assert(hPlain.hoursPerWeek === 7.5, 'heures saisies : enregistrées');
assert(hEmpty.hoursPerWeek == null, 'heures vides : aucune valeur enregistrée');
assert(hBig.hoursPerWeek == null, 'heures hors 0 à 80 : jamais enregistrées (le serveur refuse aussi)');
assert([base, hPlain, hEmpty].map((x) => x.level).join() === 'secteur,pole,activite', 'création complète à chaque niveau : activité, pôle, secteur');
console.log(failed ? '\netape-temps-test : ' + failed + ' ÉCHEC(S)' : '\netape-temps-test : OK');
process.exit(failed ? 1 : 0);
