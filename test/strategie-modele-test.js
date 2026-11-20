// Modèle modulable de la stratégie (19 nov. 2026) : migration sans perte, défauts = valeurs actuelles, héritage descendant sans remontée, droits, validation, seuils câblés.
// Usage : node test/strategie-modele-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-stratmod-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories');
require('../server/lib/objectifs');
const CS = require('../server/lib/categorie-strategie'), R = require('../server/lib/responsables');
const ecart = require('../server/lib/objectifs-ecart'), ajuste = require('../server/lib/objectifs-ajuste'), late = require('../server/lib/goalsperiodlate'), over = require('../server/lib/goalsoverload');
['own', 'mem', 'mgr', 'pm'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'own', '')").run().lastInsertRowid);
['own', 'mem', 'mgr', 'pm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(act, u));
const lastKey = (l) => l[l.length - 1].key;
const sport = lastKey(categories.addCategory(act, 'Sport')), course = lastKey(categories.addCategory(act, 'Course', sport)), autre = lastKey(categories.addCategory(act, 'Maison'));
const threw = (f) => { try { f(); return false; } catch (e) { return e.statusCode === 400 && !!e.code; } };

// ---- migration sans perte : une ligne ancienne (colonnes seulement, sans docJson) ----
db.prepare("INSERT INTO category_strategies (activityId, key, kind, sens, famille, rythme, dateFixe, reformer, updatedAt) VALUES (?, '', 'progression', 'descendre', 'poids', 'espaces', NULL, 1, 'x')").run(act);
delete require.cache[require.resolve('../server/lib/categorie-strategie')];
const CS2 = require('../server/lib/categorie-strategie'); // rechargé : la migration reprend les lignes sans docJson
const row = db.prepare("SELECT * FROM category_strategies WHERE activityId = ? AND key = ''").get(act), d0 = JSON.parse(row.docJson);
assert(d0.v === 1 && d0.nature.kind === 'progression' && d0.nature.sens === 'descendre' && d0.nature.famille === 'poids' && d0.nature.rythme === 'espaces' && d0.nature.reformer === true && d0.nature.dateFixe === undefined, 'migration : kind/sens/famille/rythme/reformer reprennent dans nature');
assert(row.kind === 'progression' && row.famille === 'poids' && row.reformer === 1, 'migration : les colonnes anciennes restent');
const e0 = CS2.effective(act, course);
assert(e0.kind === 'progression' && e0.sens === 'descendre' && e0.origine === 'activité', 'les lecteurs historiques voient les mêmes réponses (héritées de l\'activité)');
db.prepare('DELETE FROM category_strategies').run();

// ---- défauts = valeurs codées en dur ----
const d = CS.DEFAUTS.ajustement.regles;
assert(d['chrono-ecart'].seuil === 20 && d['chrono-ecart'].duree === 4 && ecart.THRESHOLD === 0.2 && ecart.WEEKS === 4, 'défauts du Chrono : 20 %, 4 semaines (= objectifs-ecart.js)');
assert(d['planifie-ecart'].seuil === ajuste.THRESHOLD * 100 && d['retard-periode'].seuil === Math.round((late.LIMITE - 1) * 100) && d['surcharge-jour'].seuil === over.TOLERANCE * 100, 'défauts planifié 20 %, capacité 120 %, jour 20 % (= code)');
const v0 = CS.view(act, course);
assert(CS.isEmpty(CS.own(act, course)) && v0.effective.kind === null && Object.keys(v0.modifie).length === 0 && v0.doc.ajustement.mode === 'propose', 'sans rien : aucun champ modifié, mode Propose');
assert(v0.regles.length === 4 && v0.regles.every((r) => r.origine === 'noesis' && r.moteur && !r.modifie && r.actif), 'quatre règles de Noèsis, actives, non modifiées');
const sans = CS.regleActive(act, course, 'chrono-ecart');
assert(sans.actif && sans.seuil === 20 && sans.duree === 4, 'sans stratégie : le moteur lit exactement 20 % et 4 semaines');

// ---- héritage descendant, jamais de remontée ----
CS.set(act, '_', 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { seuil: 30 } } }, temps: { heuresSemaine: 6 } } });
assert(CS.regleActive(act, course, 'chrono-ecart').seuil === 30 && CS.regleActive(act, sport, 'chrono-ecart').seuil === 30, 'l\'activité fournit le défaut aux pôles et secteurs');
CS.set(act, sport, 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { duree: 2 } } } } });
const rs = CS.regleActive(act, course, 'chrono-ecart');
assert(rs.seuil === 30 && rs.duree === 2, 'le pôle surcharge un champ (durée), garde le seuil de l\'activité (fusion profonde)');
CS.set(act, course, 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { seuil: 45 } } } } });
assert(CS.regleActive(act, course, 'chrono-ecart').seuil === 45 && CS.regleActive(act, sport, 'chrono-ecart').seuil === 30 && CS.regleActive(act, '_', 'chrono-ecart').seuil === 30, 'le secteur surcharge sans toucher le pôle ni l\'activité');
assert(CS.regleActive(act, autre, 'chrono-ecart').seuil === 30 && CS.regleActive(act, autre, 'chrono-ecart').duree === 4, 'une autre catégorie : activité puis défaut Noèsis');
const vc = CS.view(act, course);
assert(vc.source['ajustement.regles.chrono-ecart.seuil'] === 'propre' && vc.source['ajustement.regles.chrono-ecart.duree'] === 'pôle' && vc.source['temps.heuresSemaine'] === 'activité' && vc.modifie['temps.heuresSemaine'] === true, 'origine de chaque valeur et drapeaux modifié');
assert(vc.regles.find((r) => r.id === 'chrono-ecart').modifie === true && vc.regles.find((r) => r.id === 'planifie-ecart').modifie === false, 'drapeau modifié par règle');
CS.set(act, course, 'own', { doc: { ajustement: { regles: { 'chrono-ecart': null } } } });
assert(CS.regleActive(act, course, 'chrono-ecart').seuil === 30, 'Revenir à la valeur de Noèsis : efface la surcharge du niveau (reste l\'héritage)');
CS.set(act, sport, 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { actif: false } } } } });
assert(CS.regleActive(act, course, 'chrono-ecart').actif === false && CS.regleActive(act, '_', 'chrono-ecart').actif === true, 'désactiver au pôle ne désactive pas l\'activité');

// ---- règles de l'utilisateur ----
CS.set(act, '_', 'own', { doc: { ajustement: { regles: { u_ab12: { signal: 'taches_reportees', seuil: 3, duree: 0, action: 'proposer_revision', actif: true, label: 'Trois reports' } } } } });
const mine = CS.regles(act, course).find((r) => r.id === 'u_ab12');
assert(mine && mine.origine === 'moi' && mine.pasActive === true && mine.moteur === false, 'une règle à moi est enregistrée et marquée pas encore active');
assert(threw(() => CS.set(act, '_', 'own', { doc: { ajustement: { regles: { u_zz: { seuil: 5 } } } } })), 'une règle à moi sans signal ni action est refusée');
assert(threw(() => CS.set(act, '_', 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { signal: 'regularite' } } } } })), 'une règle de Noèsis ne change pas de signal');
CS.set(act, '_', 'own', { doc: { ajustement: { regles: { u_ab12: null } } } });
assert(!CS.regles(act, '_').some((r) => r.id === 'u_ab12'), 'une règle à moi se supprime');

// ---- validation stricte ----
assert(threw(() => CS.set(act, '_', 'own', { doc: { ajustement: { regles: { 'chrono-ecart': { seuil: 5000 } } } } })), 'seuil hors bornes refusé');
assert(threw(() => CS.set(act, '_', 'own', { doc: { ajustement: { mode: 'chaos' } } })), 'mode inconnu refusé');
assert(threw(() => CS.set(act, '_', 'own', { doc: { temps: { heuresSemaine: -5 } } })), 'heures négatives refusées (plus de plafond d’heures)');
assert(threw(() => CS.set(act, '_', 'own', { doc: { taches: { phases: ['zzz'] } } })), 'phase inconnue refusée');
assert(threw(() => CS.set(act, '_', 'own', { doc: { nature: { structure: 'x' } } })), 'structure inconnue refusée');
assert(threw(() => CS.set(act, '_', 'own', { doc: { temps: { inconnue: 1 } } })), 'variable inconnue refusée');
CS.set(act, '_', 'own', { doc: { ajustement: { mode: 'auto' }, personne: { niveau: 'avance' }, taches: { phases: ['reformer'], parSemaine: 5 } } });
assert(CS.view(act, '_').doc.ajustement.mode === 'auto' && CS.view(act, '_').doc.personne.niveau === 'avance', 'les autres familles sont enregistrées');
CS.set(act, '_', 'own', { doc: { ajustement: { mode: null } } });
assert(CS.view(act, '_').doc.ajustement.mode === 'propose', 'effacer le mode revient au défaut Propose');

// ---- ancien client : champs à plat ----
CS.set(act, autre, 'own', { kind: 'projet', dateFixe: true });
assert(CS.own(act, autre).kind === 'projet' && CS.own(act, autre).dateFixe === true && CS.view(act, autre).doc.nature.kind === 'projet', 'champs à plat (ancien client) = famille Nature');
assert(db.prepare('SELECT kind, dateFixe FROM category_strategies WHERE activityId = ? AND key = ?').get(act, autre).kind === 'projet', 'colonnes historiques tenues à jour');

// ---- droits ----
R.ajouter('own', act, 'mgr');
R.ajouterCategorie('own', act, course, 'pm');
const open = (u, k) => { try { return !!R.listeCategorie(u, act, k).canOpen; } catch (e) { return false; } };
assert(open('own', '_') && open('mgr', '_') && open('mgr', course), 'propriétaire et responsable d\'activité : peuvent modifier');
assert(!open('mem', '_') && !open('mem', course), 'un simple membre ne modifie pas');
assert(open('pm', course) && !open('pm', '_') && !open('pm', sport), 'responsable d\'un secteur : seulement son secteur (jamais le niveau supérieur)');

// ---- seuils câblés : comportement modifié quand la stratégie change la valeur, identique sinon ----
const W = (r) => ({ planned: 60, real: 60 * (1 + r) });
const quatre = (r) => [W(r), W(r), W(r), W(r)];
assert(ecart.evaluateWeeks(quatre(0.25)) && ecart.evaluateWeeks(quatre(0.25)).direction === 'depasse', 'écart : défaut 20 %, +25 % pendant 4 semaines : dépassement');
assert(ecart.evaluateWeeks(quatre(0.25), { threshold: 0.3, weeks: 4 }) === null, 'écart : seuil relevé à 30 % : plus de dépassement');
assert(ecart.evaluateWeeks(quatre(0.15), { threshold: 0.1, weeks: 4 }) && ecart.evaluateWeeks(quatre(0.15)) === null, 'écart : seuil baissé à 10 %');
assert(ecart.evaluateWeeks(quatre(0.25).slice(0, 2), { threshold: 0.2, weeks: 2 }) && ecart.evaluateWeeks(quatre(0.25).slice(0, 2)) === null, 'écart : durée de 2 semaines au lieu de 4');
assert(ecart.lastWeeks('2026-11-19').length === 4 && ecart.lastWeeks('2026-11-19', 2).length === 2, 'semaines de lecture : défaut 4, réglable');
assert(ajuste.evaluatePlanned(800, 1, 10) && ajuste.evaluatePlanned(800, 1, 10, 0.5) === null && ajuste.evaluatePlanned(800, 1, 10, 0.2) !== null, 'planifié : seuil de la stratégie');
const T = (id, m) => ({ id, minutes: m, week: 0, tier: 4 });
assert(late.placerSemaines([100], [T(1, 70), T(2, 70)]).overflow.length === 1, 'capacité : défaut 120 % (140 min ne rentrent pas dans 120)');
assert(late.placerSemaines([100], [T(1, 70), T(2, 70)], 1.5).overflow.length === 0, 'capacité : 150 % laisse tout rentrer');
const per = [{ weeks: [100], tasks: [T(1, 70), T(2, 70)] }, { weeks: [0], tasks: [] }];
const p1 = late.evaluerRetard({ periods: per }), p2 = late.evaluerRetard({ periods: per, limite: 1.5 });
assert(p1.gapMinutes > 0 && p1.decision !== 'rentre', 'retard : à 120 %, du travail ne rentre pas dans la période');
assert(p2.gapMinutes === 0 && p2.decision === 'rentre', 'retard : capacité 150 % de la stratégie : tout rentre');
assert(late.reprendre([{ weeks: [100] }], [[115]], [T(1, 10)]).length === 0 && late.reprendre([{ weeks: [100] }], [[115]], [T(1, 10)], 1.5).length === 1, 'reprise : même capacité');
assert(over.isOverloaded(130, 100) && !over.isOverloaded(130, 100, 0.4) && over.isOverloaded(115, 100, 0.1), 'surcharge d\'un jour : tolérance de la stratégie');
CS.set(act, course, 'own', { doc: { ajustement: { regles: { 'surcharge-jour': { seuil: 50 } } } } });
assert(CS.regleActive(act, course, 'surcharge-jour').seuil === 50 && CS.regleActive(act, autre, 'surcharge-jour').seuil === 20, 'surcharge-jour : lu par catégorie');
assert(CS.keyOfObjective({ level: 'secteur', categoryKey: 'k1' }) === 'k1' && CS.keyOfObjective({ level: 'pole', poleKey: 'p1' }) === 'p1' && CS.keyOfObjective({ level: 'activite' }) === '_', 'clé de catégorie d\'un objectif');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
