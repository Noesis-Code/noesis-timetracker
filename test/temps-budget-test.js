// Étape « Temps » de la création : le « Prévu » d'un niveau = hoursPerWeek de l'OBJECTIF qui occupe sa case (niveau + période), AUCUNE table de budget.
// 3 niveaux, ligne du dessus = objectif parent, cases voisines, hausse / baisse, Ajouter, Prendre sur… équilibré / non, plafond 168 h, capacité manuelle / non.
// Serveur en processus (aucun réseau). Rien n'est écrit sans apply (« Valider »).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-budget-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const wp = require('../server/lib/weekplanner');
const tb = require('../server/lib/tempsbudget');
const today = require('../server/lib/dates').userToday();
const H = (h) => Math.round(h * 60);
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const END = add(today, 60); // échéance commune : la même case de l'arbre à chaque niveau

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(id); return id; };
const A = mkAct('Marketing'), B = mkAct('Atelier'), C = mkAct('Vide');
['Web', 'Réseaux', 'Salons'].forEach((n) => categories.addCategory(A, n));
const [P1, P2, P3] = goals.categoriesForActivity(A).map((p) => p.key);
const s1 = categories.addCategory(A, 'Site', P1), s2 = categories.addCategory(A, 'Blog', P1);
const S1 = (s1 && s1.key) || goals.secteursForPole(A, P1)[0].key, S2 = (s2 && s2.key) || goals.secteursForPole(A, P1)[1].key;
const mon = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
for (let k = 1; k <= 4; k++) { // Chrono des 4 dernières semaines complètes : 6 h par semaine sur A (Web), 2 h sur B
  const day = add(mon, -7 * k + 1);
  const ins = (act, cat, sec) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory, source) VALUES ('u1', ?, ?, ?, ?, ?, 2, ?, 'manual')").run(act, day + 'T10:00:00Z', day + 'T16:00:00Z', sec, day, cat);
  ins(A, P1, 6 * 3600); ins(B, null, 2 * 3600);
}
let n = 0;
const obj = (act, level, pk, ck, hours) => { // un objectif qui occupe la case (niveau + période) avec ses heures par semaine
  n += 1;
  const id = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, stepsJson, taskIdsJson, createdAt) VALUES ('u1', ?, ?, 8, 'semaines', ?, ?, 4, 0, '[]', '[]', '')").run(act, 'Objectif ' + n, today, END).lastInsertRowid);
  db.prepare('UPDATE user_objectives SET level = ?, poleKey = ?, categoryKey = ?, isMacro = 0, metaJson = ? WHERE id = ?').run(level, pk, ck, JSON.stringify(hours == null ? {} : { hoursPerWeek: hours }), id);
  return id;
};
const hours = (id) => { const m = JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id).metaJson || '{}'); return m.hoursPerWeek === undefined ? null : m.hoursPerWeek; };
const spec = (level, extra) => Object.assign({ activityId: A, level, poleKey: level === 'activite' ? null : P1, categoryKey: level === 'secteur' ? S1 : null, endDate: END }, extra || {});

(async () => {
  assert(!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'temps_budgets'").get(), 'aucune table de budget par niveau');
  // ---- Sans objectif : Prévu inconnu, valeur par défaut = Passé ----
  let e = tb.etat('u1', spec('activite'));
  assert(e.up.kind === 'total' && e.me.label === 'Marketing' && e.me.passeMin === H(6) && e.me.prevuMin === null && e.valueMin === H(6), 'activité sans objectif : valeur par défaut = Passé (6 h)');
  e = tb.etat('u1', spec('pole'));
  assert(e.up.kind === 'activite' && e.up.label === 'Marketing' && e.up.prevuMin === null && e.me.label === 'Web', 'pôle : ligne du dessus = l’activité (sans objectif : inconnu)');
  assert(tb.etat('u1', spec('secteur')).up.kind === 'pole' && tb.etat('u1', spec('pole')).maxMin === 168 * 60, 'secteur : ligne du dessus = le pôle ; seul plafond 168 h');

  // ---- Objectifs existants : Prévu = hoursPerWeek de l'objectif de la case ----
  const oA = obj(A, 'activite', null, null, 20), oB = obj(B, 'activite', null, null, 5), oP2 = obj(A, 'pole', P2, null, 3), oP3 = obj(A, 'pole', P3, null, null);
  e = tb.etat('u1', spec('pole'));
  assert(e.up.prevuMin === H(20) && e.me.prevuMin === null && e.valueMin === H(6), 'pôle : ligne du dessus = objectif de l’activité (20 h) ; sans objectif propre, défaut = Passé');
  assert(e.others.length === 2 && e.takeLines.deplacer.map((l) => l.key).join() === P2 + ',' + P3 + ',reste' && e.takeLines.deplacer[0].avantMin === H(3) && e.takeLines.deplacer[1].avantMin === 0 && e.takeLines.deplacer[1].objectifId === oP3 && e.takeLines.deplacer[2].label === 'Reste de l’activité' && e.takeLines.deplacer[2].avantMin === H(17), '« Déplacer » : UN tableau = TOUS les autres pôles, même à 0 h (Salons : objectif sans heures, 0 h), + « Reste de l’activité » (20 − 3 = 17 h)');
  assert(e.restMin === H(17) && e.modes.join() === 'ajouter,deplacer', '« Sans pôle » = objectif de l’activité (20 h) − les autres pôles (3 h) − le pôle lui-même (0 h) = 17 h ; deux possibilités seulement');
  assert(tb.etat('u1', spec('pole', { ownMin: H(9) })).valueMin === H(9), 'la valeur déjà validée remplace le défaut (retour à l’écran 1)');

  // ---- Baisse : un seul écran, rien n'est écrit ----
  let r = tb.plan('u1', spec('pole', { newMin: H(4) }), true);
  assert(r.increase === false && r.effects.length === 0 && hours(oA) === 20 && hours(oP2) === 3, 'baisse validée : aucun autre niveau ne bouge (le temps libéré reste libre)');

  // ---- Ajouter : l'objectif parent grandit de la différence ----
  r = tb.plan('u1', spec('pole', { newMin: H(9), mode: 'ajouter' }), false);
  assert(r.increase && r.deltaMin === H(3) && r.effects.map((x) => x.level).join() === 'pole,activite,total' && r.effects[1].beforeMin === H(20) && r.effects[1].afterMin === H(23), 'Ajouter : le pôle passe de 6 h à 9 h, l’activité de 20 h à 23 h, le total grandit');
  assert(hours(oA) === 20, 'aperçu : rien n’est écrit avant « Valider »');
  let bad = false; try { tb.plan('u1', spec('pole', { newMin: H(9) }), true); } catch (x) { bad = x.statusCode === 400; }
  assert(bad, 'hausse sans choix d’origine : « Valider » refusé');
  tb.plan('u1', spec('pole', { newMin: H(9), mode: 'ajouter' }), true);
  assert(hours(oA) === 23 && hours(oP2) === 3, 'Ajouter validé : l’objectif de l’activité passe à 23 h, les voisins ne bougent pas');

  // ---- Déplacer depuis un autre pôle : équilibré / non ----
  r = tb.plan('u1', spec('pole', { newMin: H(7), mode: 'deplacer', apres: { [P2]: H(2) } }), false);
  assert(r.balanced === true && r.takenMin === H(1), 'équilibré : 1 h prise sur Réseaux = 1 h de hausse (6 → 7)');
  r = tb.plan('u1', spec('pole', { newMin: H(7), mode: 'deplacer', apres: { [P2]: H(1) } }), false);
  assert(r.balanced === false, 'non équilibré : validation impossible');
  bad = false; try { tb.plan('u1', spec('pole', { newMin: H(7), mode: 'deplacer', apres: { [P2]: H(1) } }), true); } catch (x) { bad = x.statusCode === 400; }
  assert(bad && hours(oP2) === 3, 'non équilibré refusé côté serveur, rien n’est modifié');
  assert(tb.plan('u1', spec('pole', { newMin: H(7), mode: 'deplacer', apres: { [P2]: H(9) } }), false).balanced === false, 'un « Après » au-dessus du « Avant » est refusé');
  tb.plan('u1', spec('pole', { newMin: H(7), mode: 'deplacer', apres: { [P2]: H(2) } }), true);
  assert(hours(oP2) === 2 && hours(oA) === 23, 'équilibré validé : l’objectif du voisin baisse ; le total du dessus reste constant');

  // ---- Déplacer depuis « Sans pôle » et un autre pôle à la fois : le total du dessus ne bouge pas ----
  e = tb.etat('u1', spec('pole', { ownMin: H(7) }));
  r = tb.plan('u1', spec('pole', { ownMin: H(7), newMin: H(8), mode: 'deplacer', apres: { reste: e.restMin - H(1) } }), true);
  assert(r.balanced && hours(oA) === 23 && hours(oP2) === 2, '« Sans pôle » seul : 1 h prise sur la part sans pôle, aucune autre case modifiée');
  e = tb.etat('u1', spec('pole', { ownMin: H(7) }));
  r = tb.plan('u1', spec('pole', { ownMin: H(7), newMin: H(10), mode: 'deplacer', apres: { [P2]: H(1), reste: e.restMin - H(2) } }), true);
  assert(r.balanced && r.takenMin === H(3) && hours(oP2) === 1 && hours(oA) === 23, 'une source mixte (Réseaux −1 h, Sans pôle −2 h) : équilibré, seul l’objectif de Réseaux est écrit');
  bad = false; try { tb.plan('u1', spec('pole', { newMin: H(9), mode: 'autres', apres: {} }), true); } catch (x) { bad = x.statusCode === 400; }
  assert(bad, 'les anciens modes (« autres », « reste ») n’existent plus');

  // ---- Niveau secteur : ligne du dessus = objectif du pôle ----
  const oPole1 = obj(A, 'pole', P1, null, 10), oS2 = obj(A, 'secteur', P1, S2, 2);
  e = tb.etat('u1', spec('secteur'));
  assert(e.up.kind === 'pole' && e.up.prevuMin === H(10) && e.me.prevuMin === null, 'secteur : ligne du dessus = objectif du pôle (10 h)');
  assert(e.takeLines.deplacer.length === 2 && e.takeLines.deplacer[0].key === S2 && e.takeLines.deplacer[0].avantMin === H(2) && e.takeLines.deplacer[1].key === 'reste' && e.takeLines.deplacer[1].label === 'Reste du pôle' && e.takeLines.deplacer[1].avantMin === H(8), 'secteur : les autres secteurs (2 h) + « Reste du pôle » (pôle 10 h − 2 h = 8 h)');
  tb.plan('u1', spec('secteur', { newMin: H(8), mode: 'ajouter' }), true);
  assert(hours(oPole1) === 18 && hours(oA) === 31, 'secteur, Ajouter : le pôle (10 → 18 h) et l’activité (23 → 31 h) grandissent de la différence (0 → 8 h)');

  // ---- Hebdomadaire / Périodique : deux cases différentes ----
  const oH = obj(A, 'secteur', P1, S1, 4); db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify({ hoursPerWeek: 4, inner: 'hebdomadaires' }), oH);
  assert(tb.etat('u1', spec('secteur', { inner: 'hebdomadaires' })).me.prevuMin === H(4) && tb.etat('u1', spec('secteur', { inner: 'periodiques' })).me.prevuMin === null, 'secteur : la case Hebdomadaire et la case Périodique sont distinctes (le Prévu suit le choix)');
  // ---- Arrondi au quart d'heure (Prévu par défaut et Passé) ----
  assert(tb.roundQuarter(790) === 795 && tb.roundQuarter(797) === 795 && tb.roundQuarter(780) === 780 && tb.roundQuarter(0) === 0 && tb.roundQuarter(null) === null, 'arrondi au quart d’heure : 790 et 797 min donnent 13,25 h (795), 780 reste 13 h, 0 et null inchangés');
  assert(tb.etat('u1', spec('pole', { poleKey: P3 })).me.passeMin === null && tb.passeMin('u1', A, P1) % 15 === 0, 'Passé : multiple de 15 min, null sans temps');
  // ---- Plafond 168 h, décimales ----
  bad = false; try { tb.plan('u1', spec('activite', { newMin: H(169) }), false); } catch (x) { bad = x.statusCode === 400; }
  assert(bad, 'plafond : plus de 168 h refusé');
  assert(tb.plan('u1', spec('activite', { newMin: H(168) }), false).ok && tb.plan('u1', spec('activite', { newMin: 90 }), false).newMin === 90, '168 h acceptées (pas de limite à 80) ; décimales permises (1,5 h)');

  // ---- Niveau activité : « Prendre sur les autres activités » toujours proposé ----
  e = tb.etat('u1', spec('activite'));
  assert(e.manualCapacity === false && e.modes.join() === 'ajouter,deplacer' && e.me.prevuMin === H(31) && e.takeLines.deplacer.map((l) => l.key).join() === 'a' + B + ',a' + C + ',reste' && e.takeLines.deplacer[2].label === 'Reste de ta capacité' && e.takeLines.deplacer.some((l) => l.key === 'a' + B && l.avantMin === H(5)), 'activité : TOUTES les autres activités (même à 0 h) + « Reste de ta capacité »');
  assert(tb.etat('u1', spec('activite', { activityId: C })).modes.join() === 'ajouter,deplacer', 'une activité sans objectif propre : les deux cartes sont proposées aussi');
  const capBefore = wp.getWeeklyCapacity('u1').minutes;
  tb.plan('u1', spec('activite', { newMin: H(35), mode: 'deplacer', apres: { ['a' + B]: H(1) } }), true);
  assert(hours(oB) === 1 && wp.getWeeklyCapacity('u1').minutes === capBefore, 'Déplacer depuis une autre activité : son objectif baisse, le total reste constant');
  wp.setWeeklyCapacity('u1', H(30));
  assert(tb.etat('u1', spec('activite')).up.prevuMin === H(30) && tb.etat('u1', spec('activite')).manualCapacity === true, 'capacité manuelle : ligne du dessus = capacité');
  tb.plan('u1', spec('activite', { newMin: H(36), mode: 'ajouter' }), true);
  assert(wp.getWeeklyCapacity('u1').minutes === H(30) + (H(36) - H(31)), 'Ajouter avec capacité manuelle : elle grandit de la différence');
  let other = false; try { tb.etat('autre', spec('pole')); } catch (x) { other = x.statusCode === 400; }
  assert(other, 'un autre utilisateur n’a pas accès à ces niveaux');
  console.log(failed ? '\ntemps-budget-test : ' + failed + ' ÉCHEC(S)' : '\ntemps-budget-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
