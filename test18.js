// test18.js — suite API : détail du temps par sous-projet dans les
// statistiques (chantier « Chrono — sous-projets », second passage,
// 4 septembre 2026).
//
// Ce que cette suite protège en priorité :
//   1. que le détail par sous-projet soit TOUJOURS réconciliable avec la
//      Répartition juste au-dessus — la somme des sous-projets d'une activité
//      doit valoir exactement ce que breakdownForRange donne pour elle ;
//   2. que le temps NON rattaché ne disparaisse jamais (part « Sans
//      sous-projet ») ;
//   3. qu'aucun de ces chiffres de temps ne touche à l'AVANCEMENT ;
//   4. que le détail d'un autre membre n'ouvre rien de plus que ce que la
//      section Statistiques d'une activité partagée montre déjà.
//
// Lancement :
//   NOESIS_DATA_DIR=/tmp/nd node server/index.js   (base VIERGE)
//   NOESIS_DATA_DIR=/tmp/nd node test18.js

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:' + (process.env.PORT || 3000) + '/api';
const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, 'data');
const sql = new DatabaseSync(path.join(DATA_DIR, 'noesis.db'));

let passed = 0, failed = 0;
function ok(cond, label) { if (cond) passed++; else { failed++; console.log('  ✗ ' + label); } }
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label + ' — attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a));
}

async function call(method, p, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + p, opts);
  let json = null;
  try { json = await r.json(); } catch (e) { /* 204 */ }
  return { status: r.status, body: json };
}

let n = 0;
function uniq(prefix) { n++; return prefix + '-' + Date.now() + '-' + n; }

async function makeUser(prefix) {
  const name = uniq(prefix);
  const r = await call('POST', '/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234', lang: 'fr',
  });
  if (r.status !== 201) throw new Error('profil : ' + JSON.stringify(r));
  return r.body;
}
async function makeActivity(user, name) {
  const r = await call('POST', '/activities', { userId: user.id, name: name || uniq('Act') });
  if (r.status !== 201) throw new Error('activité : ' + JSON.stringify(r));
  return r.body;
}
async function addMember(activity, from, to) {
  const inv = await call('POST', '/activities/' + activity.id + '/invite', { userId: from.id, pseudo: to.name });
  if (inv.status !== 201 && inv.status !== 200) throw new Error('invitation : ' + JSON.stringify(inv));
  const list = await call('GET', '/invites?userId=' + to.id);
  const mine = list.body.find((i) => String(i.activityId) === String(activity.id));
  await call('POST', '/invites/' + mine.id + '/accept', { userId: to.id });
}
async function makeSubProject(user, activity, name, closesAt) {
  const r = await call('POST', '/activities/' + activity.id + '/sub-projects',
    { userId: user.id, name: name || uniq('SP'), closesAt });
  if (r.status !== 201) throw new Error('sous-projet : ' + JSON.stringify(r));
  return r.body;
}

function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const TODAY = isoOf(new Date());

// Enregistre `minutes` sur une activité, éventuellement rattachées, en posant
// des heures explicites pour que la durée soit déterministe.
//
// ⚠️ PIÈGE DE BAC À SABLE, rencontré pour de vrai en écrivant cette suite :
// les heures doivent rester en PLEINE JOURNÉE. Le serveur range une session
// au jour de son DÉBUT en heure locale (isoDateOf), alors que startTime est
// transmis en UTC : une session posée à 01 h retombe sur la VEILLE dès que le
// fuseau du serveur est derrière UTC, et le détail du jour la perd. Rien à
// voir avec le code testé — mais une heure choisie au hasard produit un échec
// qui ressemble à un vrai défaut. On reste donc entre 9 h et 17 h.
let clockHour = 9;
async function record(user, activity, subProjectId, minutes) {
  const s = await call('POST', '/timer/start', { userId: user.id, activityId: activity.id });
  if (s.status !== 200) throw new Error('start : ' + JSON.stringify(s));
  if (subProjectId !== undefined) {
    const a = await call('POST', '/timer/sub-project', { userId: user.id, subProjectId });
    if (a.status !== 200) throw new Error('rattachement : ' + JSON.stringify(a));
  }
  const start = new Date(); start.setHours(clockHour, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60000);
  clockHour = clockHour + 2 > 16 ? 9 : clockHour + 2;
  const stop = await call('POST', '/timer/stop', {
    userId: user.id, startTime: start.toISOString(), endTime: end.toISOString(),
  });
  if (stop.status !== 200) throw new Error('stop : ' + JSON.stringify(stop));
  return stop.body;
}

async function detail(caller, activityId, opts) {
  const o = opts || {};
  return call('GET', '/sub-project-stats?userId=' + caller.id
    + '&activityId=' + activityId
    + '&from=' + (o.from || TODAY) + '&to=' + (o.to || TODAY)
    + (o.memberId ? '&memberId=' + o.memberId : ''));
}

(async () => {
  console.log('--- Détail du temps par sous-projet : suite API ---\n');

  const alice = await makeUser('Alice');
  const bob = await makeUser('Bob');
  const mallory = await makeUser('Mallory');

  // ============ 1. Répartition de base, et la part « Sans sous-projet » ============
  console.log('1. Répartition par sous-projet, temps non rattaché compris');
  const act = await makeActivity(alice, uniq('Solo'));
  const sp1 = await makeSubProject(alice, act, 'Cadrage');
  const sp2 = await makeSubProject(alice, act, 'Développement');

  await record(alice, act, sp1.id, 60);
  await record(alice, act, sp2.id, 30);
  await record(alice, act, undefined, 30);   // NON rattaché

  let r = await detail(alice, act.id);
  eq(r.status, 200, '1.1 route accessible à un membre');
  eq(r.body.totalSeconds, 7200, '1.2 total = 2 h');
  eq(r.body.subProjects.length, 3, '1.3 trois parts : deux sous-projets + le non-rattaché');

  const byName = {};
  r.body.subProjects.forEach((p) => { byName[p.subProjectId === null ? 'none' : p.name] = p; });
  eq(byName['Cadrage'].seconds, 3600, '1.4 Cadrage : 1 h');
  eq(byName['Cadrage'].percent, 50, '1.5 soit 50 %');
  eq(byName['Développement'].seconds, 1800, '1.6 Développement : 30 min');
  ok(!!byName.none, '1.7 ⭐ le temps NON rattaché forme une part à part entière');
  eq(byName.none.seconds, 1800, '1.8 30 min sans sous-projet');
  eq(byName.none.subProjectId, null, '1.9 identifiée par subProjectId null');
  eq(byName.none.shadeIndex, null, '1.10 sans rang de nuance : elle garde la couleur de base');
  eq(r.body.subProjects.reduce((s, p) => s + p.seconds, 0), r.body.totalSeconds,
    '1.11 la somme des parts fait exactement le total affiché');
  ok(/^#[0-9a-f]{6}$/i.test(r.body.baseColor), '1.12 la couleur de base de l\'activité est renvoyée');
  eq(r.body.isSelf, true, '1.13 marqué comme son propre temps');

  // ============ 2. ⭐ Réconciliation avec la Répartition ============
  console.log('2. ⭐ Le détail est réconciliable avec le camembert au-dessus');
  const { breakdownForRange } = require('./server/lib/stats');
  const global = breakdownForRange(alice.id, TODAY, TODAY);
  const line = global.activities.find((a) => a.activityId === act.id);
  ok(!!line, '2.1 l\'activité apparaît bien dans la Répartition globale');
  eq(r.body.totalSeconds, line.seconds,
    '2.2 ⭐⭐ la somme des sous-projets vaut EXACTEMENT le total de l\'activité dans breakdownForRange');
  // C'est ce test-là, et lui seul, qui empêche les deux règles de découpe aux
  // bords de diverger en silence (duplication assumée et signalée dans
  // server/lib/subprojectstats.js).

  // ============ 3. Rangs de nuance ============
  console.log('3. Rangs de nuance : stables, pris sur TOUS les sous-projets');
  eq(byName['Cadrage'].shadeIndex, 0, '3.1 premier sous-projet = rang 0');
  eq(byName['Développement'].shadeIndex, 1, '3.2 second = rang 1');
  eq(r.body.shadeCount, 2, '3.3 deux sous-projets au total');

  // Un troisième sous-projet SANS temps décale-t-il les rangs ? Il ne doit pas
  // changer ceux des deux premiers, mais il compte dans shadeCount.
  const sp3 = await makeSubProject(alice, act, 'Recette');
  r = await detail(alice, act.id);
  const b3 = {}; r.body.subProjects.forEach((p) => { b3[p.subProjectId === null ? 'none' : p.name] = p; });
  eq(b3['Cadrage'].shadeIndex, 0, '3.4 un sous-projet sans temps ne décale pas les rangs existants');
  eq(r.body.shadeCount, 3, '3.5 mais il compte dans le total de nuances');
  ok(!b3['Recette'], '3.6 et il n\'apparaît pas comme une part vide');

  // ============ 4. Clôture et suppression ============
  console.log('4. Sous-projet clôturé, puis supprimé');
  const hier = new Date(Date.now() - 86400000);
  await call('PUT', '/sub-projects/' + sp2.id, { userId: alice.id, closesAt: isoOf(hier) });
  r = await detail(alice, act.id);
  const b4 = {}; r.body.subProjects.forEach((p) => { b4[p.subProjectId === null ? 'none' : p.name] = p; });
  ok(!!b4['Développement'], '4.1 ⭐ le temps d\'un sous-projet clôturé reste compté');
  eq(b4['Développement'].closed, true, '4.2 et il est marqué comme clôturé');
  eq(r.body.shadeCount, 3, '4.3 un clôturé garde son rang de nuance (la couleur ne bouge pas)');

  const totalAvant = r.body.totalSeconds;
  await call('DELETE', '/sub-projects/' + sp2.id + '?userId=' + alice.id);
  r = await detail(alice, act.id);
  eq(r.body.totalSeconds, totalAvant,
    '4.4 ⭐ supprimer un sous-projet ne fait perdre AUCUNE seconde');
  const b5 = {}; r.body.subProjects.forEach((p) => { b5[p.subProjectId === null ? 'none' : p.name] = p; });
  eq(b5.none.seconds, 3600, '4.5 ⭐ son temps retombe dans « Sans sous-projet » (ON DELETE SET NULL)');
  ok(!b5['Développement'], '4.6 aucune part orpheline ne subsiste');

  // ============ 5. Droits ============
  console.log('5. Droits d\'accès');
  r = await detail(mallory, act.id);
  eq(r.status, 403, '5.1 un non-membre est refusé');

  r = await call('GET', '/sub-project-stats?userId=' + alice.id + '&activityId=999999&from=' + TODAY + '&to=' + TODAY);
  eq(r.status, 404, '5.2 activité inexistante : 404');

  r = await call('GET', '/sub-project-stats?userId=' + alice.id + '&activityId=' + act.id + '&from=hier&to=' + TODAY);
  eq(r.status, 400, '5.3 période mal formée : 400');

  r = await call('GET', '/sub-project-stats?userId=' + alice.id + '&activityId=' + act.id
    + '&from=' + TODAY + '&to=2020-01-01');
  eq(r.status, 400, '5.4 période à l\'envers : 400');

  r = await call('GET', '/sub-project-stats?activityId=' + act.id + '&from=' + TODAY + '&to=' + TODAY);
  eq(r.status, 400, '5.5 sans userId : 400');

  // ============ 6. Le cas « section Statistiques d'une activité partagée » ============
  console.log('6. Détail du temps d\'un AUTRE membre (activité partagée)');
  const shared = await makeActivity(alice, uniq('Partagee'));
  await addMember(shared, alice, bob);
  const spShared = await makeSubProject(alice, shared, 'Commun');
  await record(alice, shared, spShared.id, 60);
  await record(bob, shared, spShared.id, 120);
  await record(bob, shared, undefined, 60);

  r = await detail(alice, shared.id, { memberId: bob.id });
  eq(r.status, 200, '6.1 un membre peut ouvrir le détail d\'un autre membre');
  eq(r.body.isSelf, false, '6.2 marqué comme n\'étant pas son propre temps');
  eq(r.body.memberId, bob.id, '6.3 le membre regardé est bien celui demandé');
  eq(r.body.totalSeconds, 10800, '6.4 3 h pour Bob, pas le total de l\'activité');
  ok(r.body.subProjects.some((p) => p.subProjectId === null && p.seconds === 3600),
    '6.5 son heure non rattachée est comptée');

  // La couleur de base suit LE MEMBRE regardé, pas l'appelant : chacun a sa
  // propre couleur sur une activité partagée.
  const bobColor = sql.prepare('SELECT color FROM activity_members WHERE activityId = ? AND userId = ?')
    .get(shared.id, bob.id).color;
  eq(r.body.baseColor, bobColor, '6.6 ⭐ la couleur de base est celle du membre regardé');

  r = await detail(mallory, shared.id, { memberId: bob.id });
  eq(r.status, 403, '6.7 un non-membre ne peut pas regarder le temps d\'un membre');

  r = await detail(alice, shared.id, { memberId: mallory.id });
  eq(r.status, 403, '6.8 ⭐ et on ne peut pas demander le détail de quelqu\'un qui n\'est PAS membre');

  r = await detail(alice, act.id, { memberId: bob.id });
  eq(r.status, 403, '6.9 ni sur une activité dont l\'autre n\'est pas membre');

  // ============ 7. ⛔ Aucun effet sur l'avancement ============
  console.log('7. ⛔ Ces chiffres de temps ne touchent PAS à l\'avancement');
  const mes = await makeActivity(alice, uniq('Mesure'));
  const spM = await makeSubProject(alice, mes, 'Avec tâches');
  const sec = await call('POST', '/sub-projects/' + spM.id + '/sections', { userId: alice.id, kind: 'tasks' });
  const it = await call('POST', '/sub-project-sections/' + sec.body.section.id + '/items',
    { userId: alice.id, label: 'a' });
  await call('POST', '/sub-project-sections/' + sec.body.section.id + '/items', { userId: alice.id, label: 'b' });

  let before = (await call('GET', '/activities/' + mes.id + '/sub-projects?userId=' + alice.id)).body.progress;
  await record(alice, mes, spM.id, 240);
  r = await detail(alice, mes.id);
  eq(r.body.totalSeconds, 14400, '7.1 4 h bien comptées côté TEMPS');
  let after = (await call('GET', '/activities/' + mes.id + '/sub-projects?userId=' + alice.id)).body.progress;
  eq(after, before, '7.2 ⭐ l\'avancement est strictement inchangé');
  eq(after.percent, 0, '7.3 toujours 0 % : aucune case cochée');

  await call('PUT', '/sub-project-items/' + it.body.id, { userId: alice.id, done: true });
  after = (await call('GET', '/activities/' + mes.id + '/sub-projects?userId=' + alice.id)).body.progress;
  eq(after.percent, 50, '7.4 seule une case cochée fait bouger le pourcentage');
  eq(Object.keys(after).sort(),
    ['activityId', 'completedSubProjectCount', 'done', 'percent', 'percentBySubProject', 'subProjectCount', 'total'],
    '7.5 ⭐ la forme du contrat d\'avancement est intacte — aucun champ de temps ajouté');

  // ============ 8. Non-régression ============
  console.log('8. Non-régression sur l\'existant');
  r = await call('GET', '/stats?userId=' + alice.id);
  eq(r.status, 200, '8.1 GET /stats répond toujours');

  r = await call('GET', '/stats/timesheet?userId=' + alice.id);
  eq(r.status, 200, '8.2 GET /stats/timesheet répond toujours');
  ok(r.body.breakdown && r.body.breakdown.start && r.body.breakdown.end,
    '8.3 elle expose toujours les bornes réellement affichées');
  const filled = (r.body.days || []).flatMap((d) => d.slots).filter(Boolean);
  ok(filled.length > 0 && filled.every((s) => typeof s.activityId === 'number'),
    '8.4 ⭐ chaque case remplie porte son activityId (cible de l\'appui)');

  r = await call('GET', '/stats/today?userId=' + alice.id);
  eq(r.status, 200, '8.5 GET /stats/today répond toujours');

  r = await call('GET', '/community/activity-stats?userId=' + alice.id + '&activityId=' + shared.id + '&period=week');
  eq(r.status, 200, '8.6 GET /community/activity-stats répond toujours');
  ok(r.body.breakdown && r.body.breakdown.start && r.body.breakdown.end,
    '8.7 et expose ses bornes (nécessaires à l\'appui sur un membre)');
  ok(r.body.dailyBreakdown !== undefined, '8.8 le graphique de la page d\'activité est intact');

  r = await call('GET', '/history?userId=' + alice.id + '&period=week');
  eq(r.status, 200, '8.9 GET /history répond toujours');

  r = await call('GET', '/timer/status?userId=' + alice.id);
  eq(r.status, 200, '8.10 GET /timer/status répond toujours');

  r = await call('GET', '/activities?userId=' + alice.id);
  ok(r.body.every((a) => 'progress' in a), '8.11 le contrat d\'avancement est toujours servi');

  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
