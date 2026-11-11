// Interrupteur « Hebdomadaire » de la création (9 nov. 2026) : possible SEULEMENT au niveau secteur ET si l'échéance tombe dans la semaine en cours ou la suivante ; éteint par défaut
// (= périodique) ; absent sinon (l'échéance décide : une seule période = hebdomadaires). Serveur en processus (aucun réseau).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-hebdo-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = goals.mostRecentMonday(today);

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const pole = categories.addCategory(act, 'Production'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
const sec = categories.addCategory(act, 'Atelier bois', poleKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, poleKey)[0].key;
const mk = (extra) => o.creer('u1', Object.assign({ title: 'Objectif ' + Math.random().toString(36).slice(2, 6), activityId: act, startDate: today, level: 'secteur', poleKey, categoryKey: secKey }, extra));

(async () => {
  const nextWeekEnd = addDays(monday, 13), soon = addDays(today, 1); // demain est toujours dans la semaine en cours ou la suivante
  // échéance dans la semaine en cours ou la suivante, niveau secteur : l'interrupteur décide
  let r = mk({ endDate: soon, inner: 'periodiques' });
  assert(r.innerGoals === 'periodiques' && r.level === 'secteur', 'secteur + échéance proche, interrupteur éteint : objectif périodique');
  r = mk({ endDate: nextWeekEnd, inner: 'hebdomadaires' });
  assert(r.innerGoals === 'hebdomadaires', 'secteur + échéance proche, interrupteur allumé : objectif hebdomadaire (jusqu’à la fin de la semaine suivante)');
  // hebdomadaire impossible : échéance au-delà de la semaine suivante (≤ 28 jours = une seule période) : l'échéance décide
  const far = addDays(nextWeekEnd, 3);
  r = mk({ endDate: far, inner: 'periodiques' });
  assert(r.innerGoals === 'periodiques', 'échéance au-delà de la semaine suivante : le choix de l’utilisateur est respecté (Périodique)');
  r = mk({ endDate: far, inner: 'hebdomadaires' });
  assert(r.innerGoals === 'hebdomadaires', 'échéance au-delà de la semaine suivante : « Hebdomadaire » reste possible');
  // échéance très lointaine (2039) : l'échéance PLACE l'objectif (sa semaine / sa période), le serveur le crée sans « Trop de périodes »
  const lointaine = '2039-06-15';
  const rowOf = (id) => db.prepare('SELECT startDate, endDate, stepsJson, metaJson FROM user_objectives WHERE id = ?').get(id);
  r = mk({ endDate: lointaine, inner: 'hebdomadaires', hoursPerWeek: 3 });
  let row = rowOf(r.id), steps = JSON.parse(row.stepsJson);
  assert(row.startDate === '2039-06-13' && row.endDate === lointaine && steps.length === 1 && steps[0].weeks.length === 1 && JSON.parse(row.metaJson).hoursPerWeek === 3, 'hebdomadaire 2039 : la semaine qui contient l’échéance (lundi 13 juin), une seule semaine, heures par semaine gardées');
  r = mk({ endDate: lointaine, inner: 'periodiques' });
  row = rowOf(r.id); steps = JSON.parse(row.stepsJson);
  assert(row.startDate === '2039-05-23' && row.endDate === lointaine && steps.length === 1, 'périodique 2039 : la période (28 jours depuis le 1er janvier) qui contient l’échéance, une seule période (' + row.startDate + ')');
  // case occupée : la semaine et la période sont deux cases différentes ; la même semaine est occupée
  const caseOf = (inner, endDate) => o.occupant('u1', { activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate, inner });
  assert(caseOf('hebdomadaires', '2039-06-17') && caseOf('hebdomadaires', '2039-06-17').id, 'case occupée : la même semaine (hebdomadaire)');
  assert(!caseOf('hebdomadaires', '2039-06-20'), 'case libre : la semaine suivante');
  assert(caseOf('periodiques', '2039-06-01') && !caseOf('periodiques', '2039-07-01'), 'case occupée : la même période (périodique) ; libre : la période suivante');
  // autre niveau : jamais d'interrupteur
  r = o.creer('u1', { title: 'Niveau pôle', activityId: act, startDate: today, level: 'pole', poleKey, endDate: addDays(today, 3), inner: 'periodiques' });
  assert(r.innerGoals === 'hebdomadaires', 'niveau pôle : pas d’interrupteur, l’échéance décide');
  r = o.creer('u1', { title: 'Niveau activité', activityId: act, startDate: today, endDate: addDays(today, 3), inner: 'periodiques' });
  assert(r.innerGoals === 'hebdomadaires', 'niveau activité : pas d’interrupteur, l’échéance décide');
  // échéance lointaine : choix habituels des objectifs inclus
  r = mk({ endDate: addDays(today, 120), inner: 'periodiques' });
  assert(r.innerGoals === 'periodiques', 'échéance lointaine : « Objectifs inclus » comme avant');

  // Interface : affiché seulement au niveau secteur et si l'échéance est proche ; éteint par défaut ; remplace « Objectifs inclus »
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  assert(src.includes("function weeklyPossible(f) { return f.level === 'secteur'; }"), '« Hebdomadaire » : possible dès qu’un secteur est choisi, quelle que soit l’échéance (même sans date : l’échéance vient plus tard)');
  // Bloc « Type d'objectif » (11 nov. 2026, maquette d'Émilien) : .cmpSeg Annuel | Périodique | Hebdomadaire, TOUJOURS visible, EN HAUT de l'étape ; remplace « Cet objectif est-il » ; plus d'interrupteur
  const iType = src.indexOf('function paintTypeBlock()'), iAct = src.indexOf("actBox.appendChild(el('p', 'cmpBlockTitle', tr(TITRES_EMPLACEMENT.cadre)))"), iLive = src.indexOf('// Phrase en direct (texte seul)');
  assert(iType > 0 && iAct > iType && iLive > iAct && src.includes('      paintTypeBlock();') && !src.includes('Cet objectif est-il') && !src.includes('toggleSwitch') && !src.includes("'switch'"), 'le bloc « Type d’objectif » est en haut (avant le sous-titre « Cadre » et les listes), toujours dessiné ; « Cet objectif est-il » et l’ancien interrupteur sont retirés');
  assert(src.includes("var TYPES = [['pluriannuel', 'Pluriannuel'], ['annuel', 'Annuel'], ['periodique', 'Périodique'], ['hebdomadaire', 'Hebdomadaire']];") && src.includes("form.weeklyOn = t === 'hebdomadaire' && form.level === 'secteur';"), 'quatre types en tableau 2 × 2 (Pluriannuel, Annuel / Périodique, Hebdomadaire) ; l’interrupteur hebdomadaire de secteur reste lié au niveau secteur');
  assert(src.includes("form.level === 'pole' || (form.level === 'secteur' && !!form.categoryKey);") && src.includes("t === 'pluriannuel' ? form.level === 'activite'") && src.includes("t === 'annuel' ? form.level === 'pole'") && src.includes('Un objectif périodique ou hebdomadaire se range sur un pôle ou un secteur : choisis-en un.') && !src.includes('se range sur un secteur.') && src.includes("cur === 'activite' ? !typeOk()"), 'périodique / hebdomadaire acceptés sur un pôle (avec ou sans secteurs) ou un secteur ; seule l’activité seule reste impossible : message juste et Suivant grisé');
  {
    const a1 = src.indexOf('  function isoAdd(iso, n)'), a2 = src.indexOf('\n', src.indexOf('  function weeklyPossible(f) {'));
    const wp = new Function(src.slice(a1, a2) + '\nreturn weeklyPossible;')();
    const t0 = today, mon = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const lim = addDays(mon(t0), 13);
    assert(wp({ level: 'secteur', startDate: t0, endDate: addDays(t0, 3) }) === true && wp({ level: 'secteur', startDate: t0, endDate: lim }) === true, 'hebdomadaire possible : échéance dans la semaine en cours ou la suivante');
    assert(wp({ level: 'secteur', startDate: t0, endDate: addDays(lim, 1) }) === true && wp({ level: 'secteur', startDate: t0, endDate: '2039-06-15' }) === true, 'hebdomadaire possible aussi pour une échéance lointaine (plus de grisé lié à la date)');
    assert(wp({ level: 'pole', startDate: t0, endDate: addDays(t0, 3) }) === false && wp({ level: 'activite', startDate: t0, endDate: addDays(t0, 3) }) === false, 'hebdomadaire impossible hors niveau secteur');
    // bascule et changement d'échéance (même règle que l'écran)
    const st = { level: 'secteur', startDate: t0, endDate: addDays(t0, 3), weeklyOn: false };
    st.weeklyOn = true; assert(wp(st) && st.weeklyOn, 'bascule : Hebdomadaire sélectionné');
    st.endDate = addDays(t0, 60); if (st.weeklyOn && !wp(st)) st.weeklyOn = false;
    assert(st.weeklyOn === true, 'changement d’échéance : « Hebdomadaire » reste sélectionné');
  }
  assert(src.includes("if (weeklyPossible(form)) return form.weeklyOn ? 'hebdomadaires' : 'periodiques'") && src.includes('if (form._switchShown) return;'), 'périodique/hebdomadaire décidé par l’interrupteur quand il est affiché ; « Objectifs inclus » masqué (aucune contradiction)');
  // Phrase en direct sous les choix de la page Activité : activité › pôle › secteur · période ou semaine · sous « parent » / sans parent (texte seul, lecture seule)
  assert(src.includes("path.join(' › ')") && src.includes("tr('sous') + ' « ' + p.title + ' »' : tr('sans parent')") && src.includes("tr('semaine') + ' ' + weekNo(form.endDate) : tr('période') + ' ' + periodNo(form.endDate)"), 'phrase en direct : chemin, période ou semaine, parent ou « sans parent »');
  const fp = src.slice(src.indexOf('    function fetchParent()'), src.indexOf('    function refreshHints()'));
  assert(fp.includes("'/api/objectifs/rattachement'") && !/'PUT'|'DELETE'/.test(fp) && fp.includes('return Promise.resolve(null)'), 'parent retenu : même appel de rattachement, lecture seule ; absent = « sans parent »');
  assert(src.includes('TMT.calNums.period(iso)') && src.includes('TMT.calNums.week(iso)'), 'numéro de période et de semaine : la fonction partagée du calendrier (premier lundi de janvier), voir numerotation-creation-test');
  // Choix pôle/secteur : couleur du pôle (donnée), secteurs de la même couleur et décalés d'un cran, retoucher un parent replie et désélectionne ses enfants
  const ctxA = (await o.contexte('u1', { text: 'Poncer la table en 3 mois' })).activities.filter((x) => x.id === act)[0];
  assert(ctxA && ctxA.poles.length >= 1 && ctxA.poles.every((p) => Number.isInteger(p.shadeRank) && Number.isInteger(p.shadeCount)), 'les pôles portent leur rang de nuance (couleur de donnée, même règle que l’arbre)');
  assert(src.includes('TMT.poleColor(a.color, p.shadeRank)') && src.includes('r.style.color = pc') && src.includes('r2.style.color = pc') && src.includes("r2.classList.add('objSub')"), 'nom du pôle dans sa couleur ; secteurs dans la couleur de leur pôle, décalés');
  assert(fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'objectifs-creer.css'), 'utf8').includes('.objAct > .objChoice.objSub { padding-left: 32px; }'), 'secteur décalé d’un pas de 16 px');
  assert(src.includes("if (form.poleOpen) { form.poleKey = null; form.categoryKey = null; form.level = 'activite'; } form.poleOpen = !form.poleOpen; refresh();") && src.includes("form.poleKey = sel ? null : p.key; form.categoryKey = null; form.level = sel ? 'activite' : 'pole'") && src.includes("form.categoryKey = on2 ? null : x.key; form.level = on2 ? 'pole' : 'secteur'"), 'retoucher un parent le désélectionne et replie ses enfants ; niveau recalculé (activité / pôle / secteur)');
  assert(src.includes("var TITRES_EMPLACEMENT = { etape: 'Emplacement', type: 'Type', cadre: 'Cadre' };") && src.includes('activite: TITRES_EMPLACEMENT.etape') && src.includes('tr(TITRES_EMPLACEMENT.type)'), 'titres finaux : panneau « Emplacement », bloc « Type », sous-titre « Cadre » (une seule source)');
  console.log(failed ? '\nobjectif-hebdo-test : ' + failed + ' ÉCHEC(S)' : '\nobjectif-hebdo-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
