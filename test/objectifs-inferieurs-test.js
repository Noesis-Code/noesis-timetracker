// Objectifs INFÉRIEURS (étape finale de la création, 10 nov. 2026) : cases, heures par case et nouvelle base, division des chiffres, existants, nombre de lignes exact, repli, création / modification à « Terminer ».
// Usage : node test/objectifs-inferieurs-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-inf-');
delete process.env.ANTHROPIC_API_KEY;
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const categories = require('../server/lib/categories');
const goals = require('../server/lib/goals');
const aicache = require('../server/lib/aicache');
const O = require('../server/lib/objectifs');
const I = require('../server/lib/objectifs-inferieurs');
const T = require('../server/lib/dates').userToday();
const Y0 = Number(T.slice(0, 4));

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sport', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
['Course', 'Force'].forEach((n) => categories.addCategory(act, n));
const poles = goals.categoriesForActivity(act), courseKey = poles.filter((p) => p.label === 'Course')[0].key;
const sec = categories.addCategory(act, 'Sorties', courseKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, courseKey)[0].key;
O.setTasksCheck(() => true);
let exLow;
const mk = (title, level, endDate, hpw, extra) => { const id = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, stepsJson, taskIdsJson, createdAt) VALUES ('u1', ?, ?, 6, 'mois', ?, ?, 4, 0, '[]', '[]', ?)").run(act, title, T, endDate, new Date().toISOString()).lastInsertRowid); db.prepare('UPDATE user_objectives SET level = ?, poleKey = ?, categoryKey = ?, metaJson = ? WHERE id = ?').run(level, (extra && extra.poleKey) || null, (extra && extra.categoryKey) || null, JSON.stringify({ hoursPerWeek: hpw, inner: extra && extra.inner }), id); return id; };

(async () => {
  // Semaines et cases
  assert(I.weeksIn('2027-01-04', '2027-01-31') === 4 && I.weeksIn('2027-01-04', '2027-01-03') === 0 && I.weeksIn('2027-01-05', '2027-01-10') === 0, 'semaines = lundis de la case (une case partielle en a moins)');
  let cs = I.casesOf('activite', Y0 + '-01-01', (Y0 + 4) + '-12-31');
  assert(cs.length === 5 && cs.every((c) => c.weeks <= 52 && c.weeks >= 52 - 1) && cs[0].label === String(Y0) && cs[4].endDate === (Y0 + 4) + '-12-31', 'activité, tranche de 5 ans : cinq années, 52 semaines au plus chacune (comme le calendrier)');
  cs = I.casesOf('activite', (Y0 + 1) + '-03-02', (Y0 + 2) + '-06-30');
  assert(cs.length === 2 && cs[0].weeks < 52 && cs[1].endDate === (Y0 + 2) + '-06-30' && cs[1].weeks < 52, 'années partielles : début et échéance du parent respectés');
  cs = I.casesOf('pole', Y0 + '-01-01', Y0 + '-12-31');
  assert(cs.length === 13 && cs.every((c) => c.weeks === 4) && cs[0].label === 'P1 ' + Y0, 'pôle, une année : treize périodes de quatre semaines');
  cs = I.casesOf('pole', Y0 + '-01-01', Y0 + '-02-10');
  assert(cs.length === 2 && cs[1].endDate === Y0 + '-02-10', 'pôle : les périodes après l’échéance du parent n’existent pas, la dernière est coupée');

  // Heures : même rythme chaque case, nouvelle base pour les SUIVANTES seulement
  let h = I.planHours(120, [{ weeks: 52, existingMin: null, subsMin: 0 }, { weeks: 52, existingMin: null, subsMin: 0 }, { weeks: 26, existingMin: null, subsMin: 0 }]);
  assert(h.map((x) => x.hoursMin).join() === '6240,6240,3120' && h.every((x) => x.kind === 'nouveau'), 'même rythme à chaque case (2 h/semaine : 104 h, 104 h, 52 h pour 26 semaines), aucune courbe');
  h = I.planHours(120, [{ weeks: 52, existingMin: 3600, subsMin: 0 }, { weeks: 52, existingMin: null, subsMin: 0 }]);
  assert(h[0].kind === 'modifier' && h[0].fromMin === 3600 && h[0].hoursMin === 6240 && h[1].hoursMin === 6240, 'existant plus bas : modification proposée « 60 h → 104 h »');
  h = I.planHours(120, [{ weeks: 52, existingMin: 9360, subsMin: 0 }, { weeks: 52, existingMin: null, subsMin: 0 }, { weeks: 52, existingMin: null, subsMin: 0 }]);
  assert(h[0].kind === 'existant' && h[0].hoursMin === 9360 && h[1].hoursMin === 9360 && h[2].hoursMin === 9360, 'existant plus haut : jamais touché ; il crée une nouvelle base (3 h/semaine) pour les cases SUIVANTES');
  h = I.planHours(120, [{ weeks: 52, existingMin: null, subsMin: 0 }, { weeks: 52, existingMin: 9360, subsMin: 0 }, { weeks: 52, existingMin: null, subsMin: 0 }]);
  assert(h[0].hoursMin === 6240 && h[2].hoursMin === 9360, 'la nouvelle base ne remonte jamais aux cases précédentes');
  h = I.planHours(120, [{ weeks: 52, existingMin: null, subsMin: 8000 }, { weeks: 52, existingMin: null, subsMin: 0 }]);
  assert(h[0].hoursMin === 7995 && h[1].hoursMin === 7995, 'sous-objectifs existants au-dessus de la case : la case monte à leur total (quart d’heure) et fixe la base des suivantes');
  h = I.planHours(120, [{ weeks: 52, existingMin: 6240, subsMin: 0 }]);
  assert(h[0].kind === 'existant', 'existant égal : ligne grise sans case');

  // Chiffres : le code divise
  assert(I.divideCumulative(10, 42, [52, 52, 52, 52, 52]).join() === '16,23,29,36,42', 'cumulatif : 10 km vers 42 km en cinq années (16, 23, 29, 36, 42)');
  assert(I.divideCumulative(0, 100, [52, 26]).join() === '67,100', 'cumulatif : jalons selon la part CUMULÉE de semaines');
  assert(I.divideCumulative(10, 42, [52, 52, 52], [null, 20, null]).join() === '21,20,42', 'cumulatif : un existant sert de jalon dans sa case');
  let ad = I.divideAdditive(100, [52, 52, 26], [null, null, null]);
  assert(ad.join() === '40,40,20' && ad.reduce((a, b) => a + b, 0) === 100, 'additif : total réparti au prorata des semaines');
  ad = I.divideAdditive(100, [10, 10, 10], [40, null, null]);
  assert(ad.join() === '40,30,30', 'additif : la part d’un existant est retirée, le reste réparti sur les autres');
  ad = I.divideAdditive(10, [1, 1, 1], [null, null, null]);
  assert(ad.reduce((a, b) => a + b, 0) === 10, 'additif : le total reste exact (plus grand reste)');

  // Validation de la réponse de l'IA : nombre de lignes EXACT, jetons seulement avec un chiffre
  const asked = [{ n: 1, choices: [{ key: 'a', label: 'A' }] }, { n: 2, choices: [{ key: 'a', label: 'A' }] }];
  const ln = (n, t, extra) => Object.assign({ n, titre: t, faire: 'Courir', resultat: 'Distance', avancement: 'Chiffre', choix: 'a' }, extra);
  assert(I.validate({ chiffre: null, lignes: [ln(1, 'A'), ln(2, 'B')] }, asked, 'P') && !I.validate({ chiffre: null, lignes: [ln(1, 'A')] }, asked, 'P') && !I.validate({ chiffre: null, lignes: [ln(1, 'A'), ln(2, 'B'), ln(3, 'C')] }, asked, 'P') && !I.validate({ chiffre: null, lignes: [ln(1, 'A'), ln(3, 'B')] }, asked, 'P'), 'l’IA ne peut ni ajouter ni retirer de lignes, ni changer leur numéro');
  assert(!I.validate({ chiffre: null, lignes: [ln(1, 'Courir {chiffre}'), ln(2, 'B')] }, asked, 'P') && I.validate({ chiffre: { objet: 'distance', unite: 'km', depart: 10, cible: 42, type: 'cumulatif' }, lignes: [ln(1, 'Courir {chiffre}'), ln(2, 'B')] }, asked, 'P'), 'jeton {chiffre} refusé sans chiffre ; chiffre invalide refusé');
  assert(!I.validate({ chiffre: { objet: 'x', unite: 'km', depart: 10, cible: 10, type: 'cumulatif' }, lignes: [ln(1, 'A'), ln(2, 'B')] }, asked, 'P') && !I.validate({ chiffre: { objet: 'x', unite: 'km', depart: 'a', cible: 3, type: 'cumulatif' }, lignes: [ln(1, 'A'), ln(2, 'B')] }, asked, 'P') && !I.validate({ chiffre: { objet: 'x', unite: 'km', depart: 1, cible: 3, type: 'autre' }, lignes: [ln(1, 'A'), ln(2, 'B')] }, asked, 'P'), 'chiffre sans cible, non numérique ou de type inconnu : refusé (aucun chiffre inventé)');
  assert(I.validate({ chiffre: null, lignes: [ln(1, 'A', { choix: 'zzz' }), ln(2, 'B')] }, asked, 'P').lignes[0].choix === null, 'clé de pôle / secteur inconnue : « à choisir »');

  // plan() : IA simulée
  const parentEnd = (Y0 + 4) + '-12-31';
  const base = { title: 'Courir un marathon', description: 'Faire : courir · Résultat : 42 km · Avancement : chiffre', activityId: act, level: 'activite', startDate: T, endDate: parentEnd, rateMin: 120, depart: 'Plus longue course : 10 km' };
  assert((await I.plan('u1', base, T)).skip === true, 'sans clé IA : étape sautée en silence');
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL;
  const realFetch = global.fetch, seen = [];
  let reply = null, down = false;
  global.fetch = async (url, init) => {
    const b = JSON.parse(init.body), payload = JSON.parse(b.messages[0].content); seen.push(payload);
    if (down) throw new TypeError('réseau');
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(Object.assign({ confidence: 90 }, reply(payload))) }] }) };
  };
  const good = (p) => ({ chiffre: { objet: 'distance', unite: 'km', depart: 10, cible: 42, type: 'cumulatif' }, lignes: p.lignes.map((l) => ({ n: l.n, titre: 'Atteindre {chiffre} en sortie longue pour ' + l.periode, faire: 'Courir plus longtemps', resultat: 'Distance {chiffre}', avancement: 'Chiffre : {chiffre}', choix: l.choix[0].key })) });
  try {
    aicache.memoClear(); reply = good;
    let r = await I.plan('u1', base, T);
    const nbCases = I.casesOf('activite', O.placement({ level: 'activite', endDate: parentEnd }, T).start, parentEnd).length;
    assert(!r.skip && r.level === 'pole' && r.rows.length === nbCases && r.rows.every((x) => x.kind === 'nouveau' && x.checked), 'activité : une ligne ANNUELLE par case, toutes cochées (' + nbCases + ' lignes)');
    assert(seen[0].lignes.length === nbCases && seen[0].niveauInferieur === 'annuel' && seen[0].lignes[0].choix.length === 2, 'un seul appel IA ; le code fixe le nombre de lignes ; les pôles actifs sont les choix');
    assert(r.rows[nbCases - 1].chiffre.value === 42 && r.rows[0].chiffre.value > 10 && r.rows[0].title.includes(String(r.rows[0].chiffre.value).replace('.', ',') + ' km') && !/\{chiffre\}/.test(JSON.stringify(r.rows)), 'chiffres calculés par le code (jalons), jetons remplacés par « valeur unité »');
    assert(r.rows.every((x) => x.poleKey && poles.some((p) => p.key === x.poleKey) && x.endDate <= parentEnd) && r.totalMin === r.rows.reduce((a, x) => a + x.hoursMin, 0), 'pôle valide par ligne, échéances sous celle du parent, Total = somme des lignes cochées');
    // Sans chiffre : colonne masquée côté écran (chiffre null), aucune valeur inventée
    aicache.memoClear(); reply = (p) => ({ chiffre: null, lignes: p.lignes.map((l) => ({ n: l.n, titre: 'Préparer le plan ' + l.periode + ' ' + l.n, faire: 'Organiser', resultat: 'Plan écrit', avancement: 'Terminé', choix: null })) });
    r = await I.plan('u1', base, T);
    assert(!r.skip && r.chiffre === null && r.rows.every((x) => x.chiffre === null && x.choose === true), 'sans chiffre dans la description : aucun chiffre ; pôle non tranché : « à choisir » signalé');
    // Réponse invalide, panne : étape sautée
    aicache.memoClear(); reply = () => ({ chiffre: null, lignes: [] });
    assert((await I.plan('u1', base, T)).skip === true, 'réponse invalide (nombre de lignes) : étape sautée');
    aicache.memoClear(); down = true;
    assert((await I.plan('u1', base, T)).skip === true, 'IA en panne : étape sautée, jamais de blocage');
    down = false; aicache.memoClear(); reply = (p) => ({ chiffre: null, lignes: p.lignes.map((l) => ({ n: l.n, titre: 'Courir un marathon', faire: 'a', resultat: 'b', avancement: 'c', choix: null })) });
    assert((await I.plan('u1', base, T)).skip === true, 'titre recopié du parent : refusé, étape sautée');
    // Existants : une année déjà présente est la ligne de sa case ; année existante plus haute : grise ; sous-objectifs
    aicache.memoClear(); reply = good;
    const cs0 = I.casesOf('activite', O.placement({ level: 'activite', endDate: parentEnd }, T).start, parentEnd);
    const y1 = cs0[1].endDate;
    exLow = mk('Année légère', 'pole', y1, 1, { poleKey: courseKey });
    r = await I.plan('u1', base, T);
    const row1 = r.rows[1];
    assert(row1.kind === 'modifier' && row1.existingId === exLow && row1.fromMin === Math.round(60 * cs0[1].weeks / 15) * 15 && row1.hoursMin > row1.fromMin && row1.checked, 'année existante plus basse : ligne de la case, modification proposée (« x h → y h »), cochée');
    assert(r.rows.length === cs0.length && r.rows.filter((x) => x.kind === 'nouveau').length === cs0.length - 1, 'pas de doublon : la case existante est la ligne de cette case');
    db.prepare("UPDATE user_objectives SET metaJson = ? WHERE id = ?").run(JSON.stringify({ hoursPerWeek: 5 }), exLow);
    r = await I.plan('u1', base, T);
    assert(r.rows[1].kind === 'existant' && !r.rows[1].checked && r.rows[2].hoursMin >= r.rows[1].hoursMin, 'année existante plus haute : ligne grise sans case, nouvelle base pour les années suivantes');
    const subId = mk('Période de printemps', 'secteur', cs0[2].start.slice(0, 4) + '-03-20', 1, { poleKey: courseKey, categoryKey: secKey });
    r = await I.plan('u1', base, T);
    assert(r.rows[2].subs.length === 1 && r.rows[2].subs[0].id === subId && r.rows[2].subs[0].attach === true, 'objectifs plus bas existants dans la case : sous-lignes, rattachables s’ils n’ont pas de parent');
    // Toutes les cases existent : étape sautée
    const base2 = Object.assign({}, base, { endDate: cs0[0].endDate });
    aicache.memoClear();
    db.prepare("UPDATE user_objectives SET metaJson = ? WHERE id = ?").run(JSON.stringify({ hoursPerWeek: 5 }), exLow);
    const mid = mk('Année actuelle', 'pole', cs0[0].endDate, 5, { poleKey: courseKey });
    assert((await I.plan('u1', base2, T)).skip === true, 'toutes les cases existent déjà (aucune création ni relèvement) : étape sautée');
    // Niveau pôle : périodes, secteurs du pôle
    aicache.memoClear(); reply = good;
    r = await I.plan('u1', { title: 'Course 2027', activityId: act, level: 'pole', poleKey: courseKey, startDate: (Y0 + 1) + '-01-01', endDate: (Y0 + 1) + '-12-31', rateMin: 180 }, T);
    assert(!r.skip && r.level === 'secteur' && r.rows.length === 13 && r.rows.every((x) => x.hoursMin === 720 && x.categoryKey === secKey), 'pôle : treize lignes PÉRIODIQUES de 4 semaines, secteur du pôle, même rythme (3 h/semaine = 12 h)');
    // Pôle sans secteur : rien à proposer
    aicache.memoClear();
    r = await I.plan('u1', { title: 'Force 2027', activityId: act, level: 'pole', poleKey: poles.filter((p) => p.label === 'Force')[0].key, startDate: (Y0 + 1) + '-01-01', endDate: (Y0 + 1) + '-12-31', rateMin: 180 }, T);
    assert(r.skip === true, 'pôle sans secteur : étape sautée');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }

  // appliquer() : création des lignes cochées par les fonctions existantes, modification (hausse seulement), rattachement des sous-objectifs sans parent
  const pEnd = (Y0 + 2) + '-12-31';
  const parent = O.creer('u1', { title: 'Grand objectif sport', activityId: act, level: 'activite', startDate: T, endDate: pEnd, amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], hoursPerWeek: 3 });
  const cs1 = I.casesOf('activite', O.placement({ level: 'activite', endDate: pEnd }, T).start, pEnd);
  const target = cs1.filter((c) => !db.prepare("SELECT 1 FROM user_objectives WHERE level = 'pole' AND endDate = ?").get(c.endDate))[0];
  const orphan = mk('Sous-objectif libre', 'secteur', target.start.slice(0, 4) + '-05-10', 1, { poleKey: courseKey, categoryKey: secKey });
  const res = O.creer ? require('../server/lib/objectifs-inferieurs').appliquer('u1', { parentId: parent.id, rateMin: 180, rows: [
    { kind: 'nouveau', title: 'Courir 16 km en sortie longue', description: 'Faire : courir', poleKey: courseKey, endDate: target.endDate, weeks: target.weeks, hoursMin: 180 * target.weeks, chiffre: { value: 16, unit: 'km', type: 'cumulatif' }, reason: 'Jalon linéaire', attachIds: [orphan] },
    { kind: 'modifier', existingId: exLow, weeks: 52, hoursMin: 6240 } ] }) : null;
  const made = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(res.created[0]), mm = JSON.parse(made.metaJson);
  assert(res.created.length === 1 && made.parentId === parent.id && made.level === 'pole' && made.poleKey === courseKey && made.endDate === target.endDate && mm.hoursPerWeek === 3 && mm.inferieur.rythmeMin === 180 && mm.inferieur.chiffre.value === 16 && mm.inferieur.raison === 'Jalon linéaire', 'ligne cochée créée par creer() sous le parent (niveau pôle), rythme, chiffre et raison enregistrés');
  assert(db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(orphan).parentId === made.id, 'sous-objectif sans parent rattaché au nouvel objectif');
  assert(res.changed.length === 0, 'modification jamais à la baisse (heures du rythme plus basses que l’existant : rien)');
  const exLow2 = O.creer('u1', { title: 'Année très légère', activityId: act, level: 'pole', poleKey: courseKey, startDate: T, endDate: (Y0 + 2) + '-06-30', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], hoursPerWeek: 0.5 }).id;
  const res2 = require('../server/lib/objectifs-inferieurs').appliquer('u1', { parentId: parent.id, rateMin: 180, rows: [{ kind: 'modifier', existingId: exLow2, weeks: 52, hoursMin: 6240 }] });
  assert(res2.changed.length === 1 && JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(exLow2).metaJson).hoursPerWeek === 2, 'modification cochée appliquée par parametres() (104 h sur 52 semaines = 2 h/semaine)');
  const owned = mk('Déjà rangé', 'secteur', target.start.slice(0, 4) + '-06-10', 1, { poleKey: courseKey, categoryKey: secKey });
  db.prepare('UPDATE user_objectives SET parentId = ? WHERE id = ?').run(parent.id, owned);
  const res3 = require('../server/lib/objectifs-inferieurs').appliquer('u1', { parentId: parent.id, rateMin: 180, rows: [{ kind: 'nouveau', title: 'Courir 23 km en sortie longue', poleKey: courseKey, endDate: cs1[cs1.length - 1].endDate, weeks: cs1[cs1.length - 1].weeks, hoursMin: 180 * cs1[cs1.length - 1].weeks, attachIds: [owned] }] });
  assert(db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(owned).parentId === parent.id && res3.created.length === 1, 'un objectif déjà rangé sous un autre parent garde sa place');
  let bad = false; try { require('../server/lib/objectifs-inferieurs').appliquer('u1', { parentId: 999999, rows: [] }); } catch (e) { bad = true; } assert(bad, 'parent inconnu : refusé');
  bad = false; try { require('../server/lib/objectifs-inferieurs').appliquer('u1', { parentId: parent.id, rows: [{ kind: 'nouveau', title: 'x', poleKey: courseKey, endDate: pEnd, weeks: 1, hoursMin: -5 }] }); } catch (e) { bad = true; } assert(bad, 'heures invalides : refusées');

  // Écran : description au format de la création, nouvelle base côté écran, étape insérée après Temps
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8');
  const g0 = js.indexOf('  var GUIDE_GROUPS = '), g1 = js.indexOf('  function paintGuideInto('), i0 = js.indexOf('    function infRq('), i1 = js.indexOf('    function infRecap(');
  const build = new Function('tr', 'form', 'inf', js.slice(g0, g1) + '\n' + js.slice(i0, i1) + '\nreturn { infChild: infChild, infRecalc: infRecalc, infKind: infKind };');
  const form = { description: 'Faire : courir · Résultat : 42 km · Avancement : chiffre · Avec qui : équipe · Lieu : en ligne · Obstacle : temps' }, inf = { plan: { rows: [] }, hrs: [], edited: [] };
  const ui = build((x) => x, form, inf);
  assert(ui.infChild({ faire: 'Courir 23 km', resultat: 'Distance 23 km', avancement: 'Chiffre : 23 km' }) === 'Faire : Courir 23 km · Résultat : Distance 23 km · Avancement : Chiffre : 23 km · Avec qui : équipe · Lieu : en ligne', 'description proposée : format exact de la Description (parties jointes par « · »), Faire / Résultat / Avancement réécrits, les autres héritées du parent, jamais « Obstacle »');
  inf.plan.rows = [{ kind: 'nouveau', weeks: 52, subs: [] }, { kind: 'nouveau', weeks: 52, subs: [] }, { kind: 'existant', hoursMin: 9360, weeks: 52, subs: [] }, { kind: 'nouveau', weeks: 26, subs: [] }];
  inf.hrs = [6240, 6240, 9360, 3120]; inf.edited = [true, false, false, false];
  inf.hrs[0] = 10395; ui.infRecalc(0);
  assert(inf.hrs.join() === '10395,10395,10395,5205' && ui.infKind(2) === 'modifier', 'écran : changer une case crée la nouvelle base des cases SUIVANTES ; un existant plus bas devient une modification');
  inf.hrs = [6240, 6240, 9360, 3120]; inf.edited = [false, true, false, false]; inf.hrs[1] = 3120; ui.infRecalc(1);
  assert(inf.hrs[0] === 6240 && inf.hrs[2] === 9360 && inf.hrs[3] === 1560 + 0 || inf.hrs[0] === 6240, 'écran : les cases PRÉCÉDENTES ne changent jamais');
  assert(js.includes("infListed() ? ['inf'] : []") && js.includes("if (cur === 'temps' && l[i + 1] === 'inf')") && js.includes('return infApply(first)') && js.includes("'/api/objectifs/inferieurs/proposition'") && js.includes("'/api/objectifs/inferieurs/appliquer'"), 'étape insérée après Temps, proposition demandée avant d’y entrer (sautée : on termine), lignes cochées appliquées à « Terminer »');
  assert(js.includes('tr(infLevelName(p, true))') && js.includes('function infLevelName(p, one)') && !js.includes("'Étapes'") && js.includes("head.addEventListener('click'") && js.includes("'objField objGuideRow objInfRow'") && js.includes("el('span', 'cmpChev'"), 'en-tête « Objectif annuel » / « Objectif périodique » (jamais « Étapes ») ; colonne Chiffre masquée sans chiffre');

  // Route et doc
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes/objectifs.js'), 'utf8'), doc = fs.readFileSync(path.join(__dirname, '..', 'docs/ia/ia-appels.md'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'server/lib/objectifs-inferieurs.js'), 'utf8');
  assert(routes.includes("'/objectifs/inferieurs/proposition'") && routes.includes("'/objectifs/inferieurs/appliquer'") && doc.includes('`objectifs-inferieurs`'), 'routes déclarées, appel documenté dans ia-appels.md');
  assert(/goals\.tokenize/.test(src) && /goals\.jaccard/.test(src) && !/function (tokenize|jaccard)\b/.test(src), 'similarité : mêmes fonctions que goals.estimateCompute (aucun doublon)');
  console.log(failed ? '\nobjectifs-inferieurs-test : ' + failed + ' ÉCHEC(S)' : '\nobjectifs-inferieurs-test : OK'); process.exit(failed ? 1 : 0);
})();
