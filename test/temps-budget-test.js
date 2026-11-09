// Étape « Temps » de la création : budget hebdomadaire (« Prévu ») d'un niveau — 3 niveaux, hausse / baisse, Ajouter, Prendre sur… équilibré / non, plafond 168 h, capacité manuelle / non.
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

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(id); return id; };
const A = mkAct('Marketing'), B = mkAct('Atelier');
['Web', 'Réseaux', 'Salons'].forEach((n) => categories.addCategory(A, n));
const poles = goals.categoriesForActivity(A); const [P1, P2, P3] = poles.map((p) => p.key);
const s1 = categories.addCategory(A, 'Site', P1), s2 = categories.addCategory(A, 'Blog', P1);
const S1 = (s1 && s1.key) || goals.secteursForPole(A, P1)[0].key, S2 = (s2 && s2.key) || goals.secteursForPole(A, P1)[1].key;
// temps Chrono des 4 dernières semaines complètes : 6 h par semaine sur l'activité A (Web), 2 h sur B
const mon = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
for (let k = 1; k <= 4; k++) {
  const day = add(mon, -7 * k + 1);
  const ins = (act, cat, sec) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory, source) VALUES ('u1', ?, ?, ?, ?, ?, 2, ?, 'manual')").run(act, day + 'T10:00:00Z', day + 'T16:00:00Z', sec, day, cat);
  ins(A, P1, 6 * 3600); ins(B, null, 2 * 3600);
}
const spec = (level, extra) => Object.assign({ activityId: A, level, poleKey: level === 'activite' ? null : P1, categoryKey: level === 'secteur' ? S1 : null }, extra || {});
const budgetRows = () => db.prepare('SELECT COUNT(*) AS n FROM temps_budgets').get().n;

(async () => {
  // ---- Écran 1 : lignes du niveau et du dessus, valeur par défaut = Prévu existant, à défaut Passé ----
  let e = tb.etat('u1', spec('activite'));
  assert(e.up.kind === 'total' && e.me.label === 'Marketing' && e.me.passeMin === H(6), 'niveau activité : ligne du dessus = total, ligne = l’activité, Passé = Chrono (6 h)');
  assert(e.me.prevuMin === null && e.valueMin === H(6), 'sans Prévu : valeur par défaut = Passé (« 6 / 6 »)');
  e = tb.etat('u1', spec('pole'));
  assert(e.up.kind === 'activite' && e.up.label === 'Marketing' && e.me.label === 'Web' && e.me.passeMin === H(6), 'niveau pôle : ligne du dessus = l’activité, ligne = le pôle');
  e = tb.etat('u1', spec('secteur'));
  assert(e.up.kind === 'pole' && e.up.label === 'Web' && e.me.key === S1, 'niveau secteur : ligne du dessus = le pôle, ligne = le secteur');
  assert(tb.etat('u1', spec('pole')).maxMin === 168 * 60, 'seul plafond : 168 h');

  // ---- Baisse : un seul écran, rien d'autre ne bouge, le temps libéré reste libre ----
  assert(budgetRows() === 0, 'rien n’est stocké avant « Valider »');
  let r = tb.plan('u1', spec('pole', { newMin: H(4) }), false);
  assert(r.increase === false && r.effects.length === 0 && r.balanced === true && budgetRows() === 0, 'baisse : aucun écran « d’où vient ce temps », aperçu sans écriture');
  tb.plan('u1', spec('pole', { newMin: H(4) }), true);
  assert(tb.budgetOf('u1', A, P1) === H(4) && tb.budgetOf('u1', A, P2) === null, 'baisse validée : seul le pôle change');
  assert(tb.etat('u1', spec('pole')).valueMin === H(4), 'le Prévu existant devient la valeur par défaut');

  // ---- Hausse + Ajouter : le parent grandit de la différence, le total aussi ----
  e = tb.etat('u1', spec('pole'));
  assert(e.modes.includes('ajouter'), 'hausse : « Ajouter » proposé');
  r = tb.plan('u1', spec('pole', { newMin: H(7), mode: 'ajouter' }), false);
  assert(r.increase && r.deltaMin === H(3) && r.effects[0].beforeMin === H(4) && r.effects[0].afterMin === H(7), 'Ajouter : le pôle passe de 4 h à 7 h');
  assert(r.effects.map((x) => x.level).join() === 'pole,activite,total' && r.effects[1].afterMin - r.effects[1].beforeMin === H(3) && r.effects[2].afterMin - r.effects[2].beforeMin === H(3), 'le parent (activité) et le total grandissent de la différence');
  tb.plan('u1', spec('pole', { newMin: H(7), mode: 'ajouter' }), true);
  assert(tb.budgetOf('u1', A, P1) === H(7) && tb.budgetOf('u1', A, null) >= H(7), 'Ajouter validé : le pôle est à 7 h, l’activité a grandi (au moins 7 h)');
  const capRow = db.prepare('SELECT weeklyMinutes FROM goal_capacity_overrides WHERE activityId = ? AND category = ? AND userId = ?').get(A, P1, 'u1');
  assert(capRow && capRow.weeklyMinutes === H(7), 'le budget d’un pôle est aussi lu par la planification (goal_capacity_overrides)');
  let bad = false; try { tb.plan('u1', spec('pole', { newMin: H(9) }), true); } catch (x) { bad = x.statusCode === 400; }
  assert(bad, 'hausse sans choix d’origine : « Valider » refusé');

  // ---- Prendre sur… : équilibré / non équilibré ----
  tb.plan('u1', spec('pole', { poleKey: P2, newMin: H(3), mode: 'ajouter' }), true); // le pôle Réseaux a 3 h
  e = tb.etat('u1', spec('pole'));
  assert(e.modes.includes('autres') && e.takeLines.autres.some((l) => l.key === P2 && l.avantMin === H(3)), '« Prendre sur les autres pôles » : liste limitée aux lignes qui ont du temps');
  r = tb.plan('u1', spec('pole', { newMin: H(8), mode: 'autres', apres: { [P2]: H(2) } }), false);
  assert(r.balanced === true && r.takenMin === H(1), 'équilibré : 1 h prise sur Réseaux = 1 h de hausse');
  r = tb.plan('u1', spec('pole', { newMin: H(8), mode: 'autres', apres: { [P2]: H(1) } }), false);
  assert(r.balanced === false, 'non équilibré (2 h prises pour 1 h de hausse) : validation impossible');
  bad = false; try { tb.plan('u1', spec('pole', { newMin: H(8), mode: 'autres', apres: { [P2]: H(1) } }), true); } catch (x) { bad = x.statusCode === 400; }
  assert(bad && tb.budgetOf('u1', A, P2) === H(3), 'non équilibré refusé côté serveur, rien n’est modifié');
  const actBefore = tb.budgetOf('u1', A, null);
  tb.plan('u1', spec('pole', { newMin: H(8), mode: 'autres', apres: { [P2]: H(2) } }), true);
  assert(tb.budgetOf('u1', A, P1) === H(8) && tb.budgetOf('u1', A, P2) === H(2) && tb.budgetOf('u1', A, null) === actBefore, 'équilibré validé : le pôle monte, l’autre baisse, le total du dessus reste constant');
  r = tb.plan('u1', spec('pole', { newMin: H(9), mode: 'autres', apres: { [P2]: H(9) } }), false);
  assert(r.balanced === false, 'un « Après » au-dessus du « Avant » est refusé');

  // ---- Reste de l'activité ----
  e = tb.etat('u1', spec('pole', { poleKey: P3 }));
  const rest = e.restMin;
  assert(rest >= 0 && (rest > 0) === e.modes.includes('reste'), '« Prendre sur le reste de l’activité » seulement s’il reste du temps (' + rest + ' min)');

  // ---- Niveau secteur : le budget du secteur n'existait pas ----
  e = tb.etat('u1', spec('secteur'));
  assert(e.me.prevuMin === null && e.modes.includes('ajouter'), 'secteur : pas encore de budget stocké, valeur par défaut = Passé');
  tb.plan('u1', spec('secteur', { newMin: H(2), mode: 'ajouter' }), true);
  assert(tb.budgetOf('u1', A, S1) === H(2) && tb.budgetOf('u1', A, P1) >= H(8), 'secteur : budget enregistré (table additive temps_budgets) ; le pôle parent ne diminue jamais');
  e = tb.etat('u1', spec('secteur', { categoryKey: S2 }));
  assert(e.others.some((x) => x.key === S1 && x.prevuMin === H(2)) && e.takeLines.autres.some((l) => l.key === S1), 'autres secteurs : ceux qui ont du temps');

  // ---- Plafond 168 h ----
  bad = false; try { tb.plan('u1', spec('activite', { newMin: H(169) }), false); } catch (x) { bad = x.statusCode === 400; }
  assert(bad, 'plafond : plus de 168 h refusé');
  r = tb.plan('u1', spec('activite', { newMin: H(168) }), false);
  assert(r.ok && r.newMin === H(168), '168 h acceptées (aucune autre limite : pas de 80)');
  r = tb.plan('u1', spec('activite', { newMin: 90 }), false);
  assert(r.ok && r.newMin === 90, 'décimales permises (1,5 h)');

  // ---- Niveau activité : capacité hebdomadaire manuelle / non ----
  e = tb.etat('u1', spec('activite'));
  assert(e.manualCapacity === false && e.modes.join() === 'ajouter', 'capacité non fixée à la main : une seule possibilité, « Ajouter » (écran 2 sauté)');
  r = tb.plan('u1', spec('activite', { newMin: H(15), mode: 'ajouter' }), false);
  assert(r.effects.map((x) => x.level).join() === 'activite,total', 'effets : l’activité, puis le total');
  wp.setWeeklyCapacity('u1', H(30));
  e = tb.etat('u1', spec('activite'));
  assert(e.manualCapacity === true && e.up.prevuMin === H(30) && e.modes.join() === 'ajouter,autres' || e.modes.join() === 'ajouter', 'capacité manuelle : « Prendre sur les autres activités » proposé s’il y a du temps ailleurs');
  tb.plan('u1', spec('activite', { activityId: B, newMin: H(5), mode: 'ajouter' }), true);
  assert(wp.getWeeklyCapacity('u1').minutes === H(30) + (H(5) - H(2)), 'Ajouter avec capacité manuelle : la capacité grandit de la différence (30 h → 33 h)');
  e = tb.etat('u1', spec('activite'));
  assert(e.manualCapacity && e.modes.includes('autres') && e.takeLines.autres.some((l) => l.key === 'a' + B), 'capacité manuelle : « Prendre sur les autres activités »');
  const capBefore = wp.getWeeklyCapacity('u1').minutes;
  tb.plan('u1', spec('activite', { newMin: H(16), mode: 'autres', apres: { ['a' + B]: H(1) } }), true); // l'activité passe de 12 h à 16 h : 4 h prises sur Atelier (5 h → 1 h)
  assert(tb.budgetOf('u1', B, null) === H(1) && wp.getWeeklyCapacity('u1').minutes === capBefore, 'Prendre sur les autres activités : l’autre baisse, la capacité (total) reste constante');
  let other = false; try { tb.etat('autre', spec('pole')); } catch (x) { other = x.statusCode === 400; }
  assert(other, 'un autre utilisateur n’a pas accès à ces niveaux');
  console.log(failed ? '\ntemps-budget-test : ' + failed + ' ÉCHEC(S)' : '\ntemps-budget-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
