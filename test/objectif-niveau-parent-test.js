// Page Activité de la création, avec des données réelles (activité de 5 pôles, échéances en 2050) :
// (1) la phrase en direct suit le NIVEAU (activité / pôle = année de l'échéance, secteur = période, secteur + hebdomadaire = semaine) ; (2) le rattachement reçoit le niveau, le pôle et le secteur :
// le parent d'un pôle est l'objectif d'activité qui le couvre, celui d'un secteur l'objectif de son pôle (ou de l'activité) ; « sans parent » quand rien ne couvre l'échéance ;
// (3) les cinq pôles portent cinq rangs de nuance distincts (couleur de donnée, comme l'arbre).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-niveau-');
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

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Marketing', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const names = ['Web', 'Réseaux', 'Courriel', 'Salons', 'Presse'];
names.forEach((n) => categories.addCategory(act, n));
const poles = goals.categoriesForActivity(act);
const webKey = poles.filter((p) => p.label === 'Web')[0].key, resKey = poles.filter((p) => p.label === 'Réseaux')[0].key;
const sec = categories.addCategory(act, 'Site', webKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, webKey)[0].key;

(async () => {
  // (3) cinq pôles = cinq rangs de nuance distincts, avec le nombre de pôles
  const ctxA = o.contexte('u1', { text: 'Lancer la campagne marketing' }).activities.filter((x) => x.id === act)[0];
  assert(ctxA.poles.length === 5 && ctxA.poles.map((p) => p.shadeRank).join() === '0,1,2,3,4' && ctxA.poles.every((p) => p.shadeCount === 5), 'cinq pôles : rangs de nuance 0 à 4 et nombre 5 arrivent dans ctx.activities[].poles');

  // données : un objectif d'activité (2051) et un objectif du pôle Web (2050)
  const A = o.creer('u1', { title: 'Lancer la campagne marketing', activityId: act, startDate: today, endDate: '2034-06-01', inner: 'periodiques' });
  const B = o.creer('u1', { title: 'Refaire le site web marketing', activityId: act, startDate: today, endDate: '2033-06-01', inner: 'periodiques', level: 'pole', poleKey: webKey });
  const base = { activityId: act };
  let r = await o.rattachement('u1', Object.assign({ title: 'Lancer la presse marketing', endDate: '2033-12-01', level: 'pole', poleKey: resKey }, base));
  assert(r.candidate && r.candidate.id === A.id, '(2) objectif de pôle, échéance 2033 : le parent est l’objectif d’activité qui la couvre (2034)');
  r = await o.rattachement('u1', Object.assign({ title: 'Lancer la presse marketing', endDate: '2050-12-01', level: 'pole', poleKey: resKey }, base));
  assert(r.candidate === null, '(2) échéance 2050 : aucun objectif ne la couvre (la durée est limitée à 140 périodes, environ 10 ans) : « sans parent » est correct');
  r = await o.rattachement('u1', Object.assign({ title: 'Site web marketing mobile', endDate: '2033-03-01', level: 'secteur', poleKey: webKey, categoryKey: secKey }, base));
  assert(r.candidate && r.candidate.id === B.id, '(2) objectif de secteur : le parent est l’objectif de son pôle (Web)');
  r = await o.rattachement('u1', Object.assign({ title: 'Lancer le courriel marketing', endDate: '2033-03-01', level: 'secteur', poleKey: resKey, categoryKey: secKey }, base));
  assert(r.candidate && r.candidate.id === A.id, '(2) secteur d’un pôle sans objectif : le parent est l’objectif de l’activité');
  r = await o.rattachement('u1', Object.assign({ title: 'Refaire le site web marketing', endDate: '2033-03-01', level: 'pole', poleKey: webKey }, base));
  assert(r.candidate && r.candidate.id === A.id, '(2) un objectif de pôle n’a jamais pour parent un autre objectif de pôle');

  // Interface : même corps de requête pour la phrase et la création, niveau envoyé ; libellé selon le niveau
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  assert(src.includes("level: form.level || 'activite', poleKey: form.poleKey || null, categoryKey: form.categoryKey || null") && (src.match(/rattBody\(\)/g) || []).length >= 3, '(2) fetchParent et loadRatt envoient le niveau, le pôle et le secteur choisis (même requête)');
  assert(src.includes("var key = rattKey() + '|' + form.endDate;") && src.includes('form.ratt.key !== rattKey()'), '(2) le parent affiché se recalcule quand le niveau, le pôle ou le secteur change');
  assert(src.includes("form.level === 'secteur' ? (weeklyPossible(form) && form.weeklyOn ? tr('semaine') + ' ' + weekNo(form.endDate) : tr('période') + ' ' + periodNo(form.endDate)) : tr('année') + ' ' + form.endDate.slice(0, 4)"), '(1) phrase : activité et pôle = année de l’échéance, secteur = période, secteur + hebdomadaire = semaine');
  // calcul du libellé (même formules que l'écran) pour l'échéance 2050
  const when = (level, weekly, end) => level === 'secteur' ? (weekly ? 'semaine ' + Math.min(52, Math.floor((Date.parse(end) - Date.parse(end.slice(0, 4) + '-01-01')) / 86400000 / 7) + 1) : 'période ' + Math.min(13, Math.floor((Date.parse(end) - Date.parse(end.slice(0, 4) + '-01-01')) / 86400000 / 28) + 1)) : 'année ' + end.slice(0, 4);
  assert(when('activite', false, '2050-12-31') === 'année 2050' && when('pole', false, '2050-12-31') === 'année 2050' && when('secteur', false, '2050-12-31') === 'période 13' && when('secteur', true, '2050-12-31') === 'semaine 52', '(1) échéance 2050 : activité = année 2050, pôle = année 2050, secteur = période, hebdomadaire = semaine');
  console.log(failed ? '\nobjectif-niveau-parent-test : ' + failed + ' ÉCHEC(S)' : '\nobjectif-niveau-parent-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
