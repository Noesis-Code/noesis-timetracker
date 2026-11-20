// Appartenance par catégorie, CLIENT (19 nov. 2026) : ce que l'interface reçoit et montre selon le rôle (propriétaire, responsable de pôle, simple membre).
// Serveur : champs de rôle (activities.canManage, categories.managed/inScope, tasks canEdit, lieux de capture). Client : sélecteur du Chrono, TMT.portee, lignes de tâche, Bilan.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-membres-client-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path'), vm = require('vm');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee');
const gt = require('../server/lib/goalstasks');
const U = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id);
['own', 'rp', 'mp', 'm'].forEach(U);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'rp', 'mp', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '2026-01-01')").run(act, u));
categories.addCategory(act, 'Production'); const pole = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', pole); const sec = goals.secteursForPole(act, pole)[0].key;
categories.addCategory(act, 'Vente'); const pole2 = goals.categoriesForActivity(act).map((c) => c.key).filter((k) => k !== pole)[0];
P.migrer();
['mp', 'rp', 'm'].forEach((u) => db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = '_'").run(act, u));
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'mp', ?, '')").run(act, pole);
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'rp', '-', '')").run(act);
db.prepare("INSERT INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'm', ?, '')").run(act, sec);
R.ajouterCategorie('own', act, pole, 'rp'); // rp : responsable du premier pôle ; m : simple membre du secteur ; mp : simple membre du pôle

// Appel d'une route Express sans réseau
function call(router, method, url, userId) {
  return new Promise((resolve) => {
    const req = { method, url, userId, query: {}, body: {}, headers: {}, params: {}, get: () => '' };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, setHeader() {}, getHeader() {} };
    router.handle(req, res, () => resolve({ status: 404, body: null }));
  });
}
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const slice = (src, from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); if (i < 0 || j < 0) throw new Error('extrait introuvable : ' + from); return src.slice(i, j); };

(async () => {
  // ---- Serveur : champs de rôle ----
  const cat = require('../server/routes/categories');
  const cats = async (u) => (await call(cat, 'GET', '/activities/' + act + '/goals/categories', u)).body;
  const cOwn = await cats('own'), cRp = await cats('rp'), cM = await cats('m');
  assert(cOwn.managed && cOwn.managed.all && cOwn.managed.shared, 'propriétaire : managed.all');
  assert(cRp.managed && !cRp.managed.all && cRp.managed.keys.indexOf(pole) >= 0 && cRp.managed.keys.indexOf(pole2) < 0, 'responsable de pôle : managed = son pôle et ses secteurs');
  assert(cM.managed && !cM.managed.all && cM.managed.keys.length === 0 && cM.categories.length === 1 && cM.categories[0].inScope === false && cM.categories[0].secteurs.length === 1, 'membre de secteur : pôle conteneur non sélectionnable (inScope false), son secteur seul, rien à gérer');
  const acts = require('../server/routes/activities');
  const lst = async (u) => { const b = (await call(acts, 'GET', '/activities', u)).body; return b.activities || b; };
  const cm = async (u, id) => ((await lst(u)).find((a) => a.id === id) || {}).canManage;
  assert((await cm('own', act)) === true && (await cm('rp', act)) === true && (await cm('mp', act)) === false && (await cm('m', act)) === false, 'liste des activités : canManage vrai pour propriétaire et responsable, faux pour un simple membre');
  const solo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'mp', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'mp', '#fff', '')").run(solo);
  assert((await cm('mp', solo)) === true, 'activité à un seul membre : canManage vrai (créations libres)');

  // ---- Tâches : canEdit ----
  const mk = (u, k, l) => gt.addCategoryTask(act, u, k, l, { dueDate: '2026-11-20' });
  const t1 = mk('rp', sec, 'Poncer la planche'); db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run('m', t1.id);
  const t2 = mk('rp', sec, 'Vernir'); db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run('rp', t2.id);
  const t3 = mk('own', pole2, 'Facturer'); db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run('own', t3.id);
  const today = require('../server/lib/goalstoday');
  const day = (u) => (today.tasksToday(u, '2026-11-19', null).tasks || []);
  const mine = day('m').filter((t) => t.id === t1.id)[0];
  assert(mine && mine.canEdit === false, 'simple membre : sa tâche attribuée porte canEdit false (il la coche seulement)');
  const rpT = day('rp').filter((t) => t.id === t2.id)[0];
  assert(rpT && rpT.canEdit === true, 'responsable de la portée : canEdit vrai');
  assert(day('own').length > 0 && day('own').every((t) => t.canEdit === true), 'propriétaire : canEdit vrai partout');

  // ---- Lieux de capture : seulement là où l'on gère ----
  const cl = require('../server/lib/goalstaskclassify');
  const places = async (u) => (await cl.proposePlacement(u, 'Acheter du bois', { skipAi: true })).options.filter((o) => o.activityId === act).map((o) => o.categoryKey);
  assert((await places('m')).length === 0 && (await places('mp')).length === 0, 'capture : un simple membre n’a aucun lieu où ranger dans l’activité partagée');
  const pr = await places('rp'); assert(pr.length > 0 && pr.every((k) => k === pole || k === sec), 'capture : un responsable de pôle ne range que dans sa portée');
  assert((await places('own')).indexOf(pole2) >= 0, 'capture : le propriétaire range partout');

  // ---- Client : code réel de app.js / taches-ligne.js / bilan-blocs.js ----
  const app = rd('public/app.js');
  const sb = {}; vm.runInNewContext(slice(app, '  function chronoScopeList', '  function fetchChronoCategories') + '\nout = chronoScopeList;', sb);
  const lc = sb.out([{ key: 'p1', label: 'Production', inScope: false, secteurs: [{ key: 's1', label: 'Bois' }] }, { key: 'p2', label: 'Vente', inScope: true, secteurs: [{ key: 's2', label: 'Web' }] }, { key: 'p3', label: 'Solo' }]);
  assert(lc.length === 3 && lc[0].key === 's1' && lc[0].label === 'Bois' && lc[1].key === 'p2' && lc[1].secteurs.length === 1 && lc[2].key === 'p3', 'Chrono : conteneur hors portée remplacé par ses secteurs, pôle de la portée gardé avec ses secteurs, ancienne liste (sans inScope) inchangée');
  assert(app.indexOf('list = chronoScopeList(list);') > 0 && app.indexOf('list = chronoScopeList(list);') < app.indexOf("offlineStoreSet('cats:' + activityId, list)"), 'Chrono : le filtre de portée précède la copie hors ligne');

  const ctx = { window: { TMT: {} } };
  vm.runInNewContext('var porteeCache = {}, activitiesCache = [{ id: 1, canManage: true }, { id: 2, canManage: false }, { id: 3 }];\n' + slice(app, '  window.TMT.portee = {', '  window.TMT.getCaState') + '\nthis.set = function (l) { activitiesCache = l; };', ctx);
  const po = ctx.window.TMT.portee;
  assert(po.canManage(1) && !po.canManage(2) && po.canManage(3) && po.canManage(99), 'TMT.portee.canManage : lit le champ de l’activité (inconnu = permis)');
  assert(po.anyManage() === true, 'TMT.portee.anyManage : au moins une activité où créer');
  po.note(2, { shared: true, all: false, keys: ['p1', 's1'] });
  assert(po.canWrite(2, 's1') && po.canWrite(2, 'p1') && !po.canWrite(2, 'p2') && !po.canWrite(2, null), 'TMT.portee.canWrite : seulement les catégories gérées');
  po.note(1, { shared: false, all: false, keys: [] }); assert(po.canWrite(1, 'zz'), 'canWrite : activité à un seul membre, libre');
  po.note(1, { shared: true, all: true, keys: [] }); assert(po.canWrite(1, 'zz'), 'canWrite : propriétaire, libre');
  ctx.set([{ id: 2, canManage: false }]); assert(po.anyManage() === false, 'anyManage faux si toutes les activités sont celles d’un simple membre (le « + » disparaît)');

  const nsb = {}; vm.runInNewContext('var porteeCache = {};\n' + slice(app, '  function notePortee', '  // 19 oct. 2026 (anti-rebond IA)') + '\nnotePortee("/api/activities/7/goals/categories?userId=u", { managed: { shared: true, all: false, keys: ["a"] } }); notePortee("/api/activities/8/goals/categories/x/tasks", { managed: { all: true } }); out = porteeCache;', nsb);
  assert(nsb.out['7'] && nsb.out['7'].keys[0] === 'a' && !nsb.out['8'], 'la réponse de goals/categories alimente la portée (et seulement elle)');

  const tl = rd('public/js/taches-ligne.js');
  const mb = { TMT: { portee: { canWrite: (a, k) => a === 1 && k === 'k1' }, currentGoalsActivityId: '1' } };
  vm.runInNewContext('var TMT = this.TMT;\n' + slice(tl, '  function mayEdit', '  function buildGoalsTaskRow') + '\nout = mayEdit;', mb);
  assert(mb.out({ canEdit: false }) === false && mb.out({ canEdit: true }) === true && mb.out({ activityId: 1, catKey: 'k1' }) === true && mb.out({ activityId: 1, catKey: 'k2' }) === false, 'ligne de tâche : canEdit du serveur d’abord, sinon portée connue');
  assert(tl.includes('if (mayEdit(task)) row.appendChild(edit);'), 'ligne de tâche : pas de bouton grisé, le crayon est absent');
  assert(rd('public/js/aujourdhui.js').includes('!t.justAdded && t.canEdit !== false'), 'vue Tâches : crayon absent si canEdit false (la case à cocher reste)');

  const bb = rd('public/js/bilan-blocs.js');
  assert(bb.includes('a.canManage === false) { if (TMT.bilanCategoryStats)'), 'Bilan : le sélecteur de membre n’existe que pour un responsable');
  const fb = {}; vm.runInNewContext('var tr = function (s) { return s; }; function el(tag, cls, text) { return { tag: tag, cls: cls, text: text, children: [], appendChild: function (c) { this.children.push(c); } }; }\n' + slice(bb, '  function failed', '  // Tableau de traits') + '\nout = failed;', fb);
  const slot = { textContent: 'x', children: [], appendChild(c) { this.children.push(c); } };
  fb.out(slot, { status: 403, code: 'DONNEES_RESERVEES_RESPONSABLES' }); assert(slot.children[0].text === '—', 'Bilan : 403 DONNEES_RESERVEES_RESPONSABLES = « — », sans casser la page');
  slot.children = []; fb.out(slot, { status: 500 }); assert(slot.children[0].text === 'Impossible pour le moment.', 'Bilan : toute autre erreur garde le message habituel');

  assert(rd('public/js/barre-volets.js').includes('!TMT.portee.anyManage()) return null;'), 'barre des volets : « + » absent pour qui ne peut rien créer');
  assert(rd('public/js/objectifs-arbre.js').includes('TMT.portee.canManage(a.id)'), 'arbre des objectifs : l’activité d’un simple membre n’y figure pas (état vide existant)');
  assert(app.includes('if (data.code) apiErr.code = data.code;'), 'les erreurs de l’API portent leur code');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nmembres-client-test : OK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
