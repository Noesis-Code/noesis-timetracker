// Redessin des objectifs enfants (calcul serveur). Usage : node test/objectifs-redessin-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-redessin-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const R = require('../server/lib/objectifs-redessin');
const P = (rows) => rows.map((r) => r.id + ':' + r.p).join(' ');
const auto = (id, a) => ({ id, kind: 'auto', a, p: a, locked: false }), you = (id, a) => ({ id, kind: 'you', a, p: a, locked: false }), neu = (p) => ({ id: 0, kind: 'new', a: null, p, locked: false });
// 1. aucune collision : rien ne bouge
let r = R.redessiner([auto(1, 3), you(2, 4), auto(3, 6), neu(5)], 13);
assert(P(r) === '1:3 2:4 3:6 0:5' && !r.some(R.moved), 'sans collision : rien ne bouge');
// 2. un ajout sur la case d'un enfant automatique : il prend la prochaine case libre
r = R.redessiner([auto(1, 3), you(2, 4), auto(3, 6), neu(6)], 13);
assert(P(r) === '1:3 2:4 3:7 0:6', 'ajout sur la case de 3 : 3 passe en 7');
// 3. effet en chaîne : la case suivante est écrite par la personne (4) -> saute par-dessus
r = R.redessiner([auto(1, 3), you(2, 4), auto(3, 6), neu(3)], 13);
assert(P(r) === '1:5 2:4 3:6 0:3', 'ajout en 3 : 1 saute l\'écrit (4) et va en 5 ; 3 reste en 6');
// 4. les objectifs écrits par la personne et les cases passées ne bougent jamais
r = R.redessiner([{ id: 1, kind: 'auto', a: 2, p: 2, locked: true }, auto(2, 3), you(3, 5), neu(2)], 13);
assert(r.find((x) => x.id === 1).p === 2 && r.find((x) => x.id === 3).p === 5 && r.find((x) => x.id === 2).p === 3, 'écrits et passés : jamais déplacés');
// 5. fin de frise : plus de case libre après -> compaction dans les cases libres, jamais deux lignes dans la même case
r = R.redessiner([auto(1, 12), auto(2, 13), neu(12)], 13);
assert(new Set(r.map((x) => x.p)).size === r.length && r.every((x) => x.p >= 1 && x.p <= 13), 'fin de frise : une ligne par case');
// 6. glisser-déposer : les cases des lignes mobiles sont réattribuées dans l'ordre de la liste
let base = R.redessiner([auto(1, 2), you(2, 4), auto(3, 6), auto(4, 9), neu(5)], 13);
let d = R.reorder(base, [4, 2, 3, 1, 0]);
assert(d.find((x) => x.id === 4).p === 2 && d.find((x) => x.id === 3).p === 6 && d.find((x) => x.id === 1).p === 9 && d.find((x) => x.id === 2).p === 4, 'glisser : 4 prend la première case mobile, 1 la dernière ; l\'écrit reste en 4');
// 7. « Place » : case libre seulement
assert(R.place(base, 1, 3, 13, 1).find((x) => x.id === 1).p === 3 && R.place(base, 1, 4, 13, 1) === null && R.place(base, 2, 7, 13, 1) === null && R.place(base, 1, 1, 13, 2) === null, 'Place : libre seulement, jamais une ligne écrite, jamais avant la première case permise');
// 8. de bout en bout sur la base : parent annuel, enfants automatiques et écrits
(async () => {
  const db = require('../server/db'), O = require('../server/lib/objectifs'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals');
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
  const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(actId);
  const pole = categories.addCategory(actId, 'Pôle A'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(actId)[0].key;
  const Y = 2027, gs = goals.yearGridStart(Y + '-07-01'), pend = (p) => O.addDays(gs, 28 * p - 1), TODAY = '2027-01-10';
  const parent = O.creer('u1', { title: 'Annuel', activityId: actId, level: 'pole', poleKey, startDate: TODAY, endDate: Y + '-12-31', hoursPerWeek: 4, weekTasks: [] });
  const mk = (title, p, auto) => { const c = O.creer('u1', { title, activityId: actId, level: 'pole', poleKey, cadence: 'periodique', startDate: TODAY, endDate: pend(p), hoursPerWeek: 2, parentId: parent.id, parentRel: 'apres', weekTasks: [] }); if (auto) { const row = db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(c.id), m = JSON.parse(row.metaJson || '{}'); m.inferieur = { hoursMin: 120 }; db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(m), c.id); } return c; };
  const a3 = mk('Auto P3', 3, true), w4 = mk('Écrit P4', 4, false), a6 = mk('Auto P6', 6, true);
  const body = { parentId: parent.id, type: 'periodique', title: 'Nouveau', endDate: pend(6) };
  const out = R.proposer('u1', body, TODAY);
  assert(out.needed && out.cells.length === 13 && out.rows.find((x) => x.id === a6.id).p === 7 && out.rows.find((x) => x.id === a6.id).moved && out.rows.find((x) => x.id === w4.id).kind === 'you' && !out.rows.find((x) => x.id === w4.id).moved && out.rows.find((x) => x.id === 0).p === 6, 'base : l\'ajout en P6 décale l\'automatique P6 en P7, l\'écrit reste');
  assert(!R.proposer('u1', Object.assign({}, body, { endDate: pend(9) }), TODAY).needed, 'aucune collision : la fenêtre ne s\'affiche pas');
  assert(!R.proposer('u1', Object.assign({}, body, { type: 'hebdomadaire' }), TODAY).needed, 'seulement les enfants de premier niveau du parent');
  const before = JSON.stringify(db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(w4.id));
  R.proposer('u1', body, TODAY); assert(JSON.stringify(db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(w4.id)) === before, 'rien n\'est écrit à la proposition');
  // 9. Appliquer : seul l'automatique bouge, l'écrit jamais ; deux lignes dans une même case refusé
  const endOf = (id) => db.prepare('SELECT endDate FROM user_objectives WHERE id = ?').get(id).endDate;
  const ap = R.appliquer('u1', { parentId: parent.id, rows: [{ id: a6.id, p: 7 }, { id: w4.id, p: 9 }, { id: a3.id, p: 3 }] }, TODAY);
  assert(ap.moved.length === 1 && endOf(a6.id) === pend(7) && endOf(w4.id) === pend(4) && endOf(a3.id) === pend(3), 'appliquer : l\'automatique P6 passe en P7, l\'écrit et les autres restent');
  let bad = false; try { R.appliquer('u1', { parentId: parent.id, rows: [{ id: a3.id, p: 4 }] }, TODAY); } catch (e) { bad = true; }
  assert(bad && endOf(a3.id) === pend(3), 'appliquer : une case déjà prise est refusée sans rien écrire');
  // 10. refus mémorisé (table partagée avec « Modifications proposées ») : jamais re-proposé à l'identique
  const b2 = { parentId: parent.id, type: 'periodique', title: 'Autre', endDate: pend(7) };
  const o2 = R.proposer('u1', b2, TODAY);
  assert(o2.needed, 'avant refus : redessin proposé');
  R.refuser('u1', Object.assign({}, b2, { rows: o2.rows }));
  assert(!R.proposer('u1', b2, TODAY).needed && db.prepare("SELECT status FROM change_proposals WHERE target = 'redessin'").get().status === 'dismissed', 'après refus : plus jamais proposé à l\'identique (statut dismissed)');
  // 11. fenêtre et branchement (source) : après Temps, avant les sous-objectifs ; Appliquer écrit à Terminer ; refus mémorisé ; poignée = appui long 500 ms
  const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
  const win = js.slice(js.indexOf('function openRedessin'), js.indexOf('function offerBtn'));
  assert(js.includes("if (cur === 'temps' && form.parentId && form._rdKey !== rdKey())") && js.includes('TMT.ui.attente(redessinStep())'), 'fenêtre : ouverte à la sortie de Temps (avant les sous-objectifs), seulement s\'il y a un redessin');
  assert(js.includes('.then(function () { return rdApply(); })') && js.includes("action: 'appliquer'") && js.includes("action: 'refus'"), 'Appliquer écrit à Terminer ; Annuler / ✕ = refus mémorisé');
  assert(win.includes('TMT.ui.holdDrag(w, { holdMs: 500') && win.includes("call('reorder'") && win.includes("call('place'"), 'appui long 500 ms (mécanique existante), glisser = reorder et Place = place côté serveur');
  assert(win.includes("[['auto', 'Automatique'], ['you', 'Écrit par toi'], ['new', 'Ton ajout'], ['mv', 'Déplacé']]") && !/explicat/i.test(win), 'légende : pastilles et un mot, aucune phrase explicative');
  console.log(failed ? '\n' + failed + ' échec(s)' : 'objectifs-redessin-test OK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
