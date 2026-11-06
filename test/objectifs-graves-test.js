// Cas graves du dossier docs/objectifs/cas-de-figure-objectifs.md : export et suppression de compte (Loi 25), rattachement hors activité (L03),
// 11e objectif sans pont (C12), abandon / réactivation / suppression (E03). Usage : node test/objectifs-graves-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-objg-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* base déjà semée */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const u = m.userId;
o.setTasksCheck(() => false);
const mk = (title, extra) => o.creer(u, Object.assign({ title, activityId: m.activityId, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));

// ---- 1. Export et suppression de compte ----
{
  const a = mk('Objectif A', { description: 'Ma description privée' });
  const b = mk('Objectif B', { parentId: a.id, parentRel: 'avant', refus: [a.id] });
  const ex = require('../server/lib/dataexport').buildUserExport(u);
  assert(Array.isArray(ex.objectives) && ex.objectives.length >= 2, 'export : objectifs présents');
  const eb = (ex.objectives || []).find((x) => x.id === b.id), ea = (ex.objectives || []).find((x) => x.id === a.id);
  assert(eb && eb.parentId === a.id && eb.parentRel === 'avant', 'export : lien parent/enfant');
  assert(ea && ea.description === 'Ma description privée' && Array.isArray(ea.steps) && ea.steps.length > 0, 'export : description et étapes');
  assert((ex.objectiveRefusals || []).some((r) => r.objectifId === b.id && r.candidateId === a.id), 'export : refus de fusion');
  // MARK-SUPPRESSION
}

// ---- 2. L03 : jamais de parent d’une autre activité ----
{
  const other = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Autre activité L03', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(other, u);
  const here = mk('Objectif ici'), there = o.creer(u, { title: 'Objectif là-bas', activityId: other, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true });
  let e1 = null; try { o.lier(u, here.id, there.id, 'apres'); } catch (e) { e1 = e; }
  assert(e1 && e1.statusCode === 400 && /même activité/.test(e1.message), 'lier : parent d’une autre activité refusé (400, message clair)');
  assert(o.get(u, here.id).parentId === null, 'lier refusé : aucun lien posé');
  let e2 = null; try { mk('Enfant hors activité', { parentId: there.id }); } catch (e) { e2 = e; }
  assert(e2 && e2.statusCode === 400 && /même activité/.test(e2.message), 'creer : parent d’une autre activité refusé');
  const sameParent = mk('Parent même activité'), kid = mk('Enfant même activité', { parentId: sameParent.id });
  assert(kid.parentId === sameParent.id, 'même activité : rattachement accepté');
  assert(o.lier(u, here.id, sameParent.id, 'apres').parentId === sameParent.id, 'lier dans la même activité : accepté');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'objectifs-arbre.js'), 'utf8');
  assert(src.includes('!all.byId[id]; }); }, // !all.byId') && src.includes('!below[id] && !!all.byId[id]'), 'interface : cibles de dépôt d’une autre activité non valides');
}

// ---- 3. C12 : le 11e objectif ne perd pas son pont en silence ----
{
  const act = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Activité C12', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act, u);
  const made = [];
  for (let i = 1; i <= 12; i++) made.push(o.creer(u, { title: 'Objectif C12 numéro ' + i, activityId: act, startDate: '2026-11-09', endDate: '2027-03-01' }));
  const ok = made.filter((x) => !x.bridgeFailed), ko = made.filter((x) => x.bridgeFailed);
  assert(ok.length >= 1 && ok.length <= 10, 'C12 : les premiers objectifs sont reliés à l’arbre périodique (' + ok.length + ')');
  assert(ko.length >= 2 && made.slice(ok.length).every((x) => x.bridgeFailed), 'C12 : les suivants sont signalés (bridgeFailed), jamais silencieux (' + ko.length + ')');
  assert(o.get(u, ko[0].id).bridgeFailed === true && !!ko[0].title, 'C12 : l’objectif sans pont existe et reste signalé à l’ouverture du détail');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
  assert(src.includes('bridgeFailed'), 'C12 : l’interface affiche le message');
}

// ---- 4. E03 : abandonner, réactiver, supprimer ----
{
  const a = mk('Objectif E03'), kid = mk('Enfant E03', { parentId: a.id }), solo = mk('Seul E03');
  assert(o.get(u, a.id).abandoned === false, 'E03 : un objectif neuf n’est pas abandonné');
  assert(o.abandonner(u, a.id, true).abandoned === true, 'E03 : abandonner');
  assert(o.get(u, kid.id).abandoned === false, 'E04 : l’abandon n’entraîne jamais les objectifs rattachés');
  assert(o.abandonner(u, a.id, false).abandoned === false, 'E05 : réactiver');
  let e = null; try { o.supprimer(u, a.id, false); } catch (x) { e = x; }
  assert(e && e.statusCode === 409 && e.extra && e.extra.children.length === 1 && e.extra.children[0].id === kid.id, 'E03 : suppression avec enfants refusée sans confirmation, liste des enfants rendue');
  assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE id IN (?, ?)').get(a.id, kid.id).n === 2, 'E03 : rien supprimé sans confirmation');
  const r = o.supprimer(u, a.id, true);
  assert(r.ok && !db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(a.id), 'E03 : suppression confirmée');
  const k2 = o.get(u, kid.id);
  assert(k2.parentId === null && k2.title === 'Enfant E03', 'E03 : l’enfant est détaché, jamais supprimé');
  assert(o.supprimer(u, solo.id, false).ok, 'E03 : un objectif sans enfant se supprime sur confirmation de l’interface');
  let e2 = null; try { o.supprimer(u, solo.id, true); } catch (x) { e2 = x; }
  assert(e2 && e2.statusCode === 404, 'E03 : objectif déjà supprimé : 404');
  const rt = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(rt.includes("'/objectifs/:id/abandon'") && rt.includes("'/objectifs/:id/reactiver'") && rt.includes("router.delete('/objectifs/:id'"), 'E03 : routes abandon, reactiver, suppression');
}

// ---- 5. Échéance obligatoire (règle d'Émilien, 6 nov. 2026) ----
{
  const base = { title: 'Sans échéance', activityId: m.activityId, startDate: '2026-11-09', noBridge: true };
  const tryIt = (b, route) => { try { if (route) o.checkEcheance(b, null, true); o.creer(u, b); return null; } catch (x) { return x; } };
  let e = tryIt(base); assert(e && e.statusCode === 400 && /échéance/.test(e.message), 'échéance absente : refusée (400, message clair)');
  e = tryIt(Object.assign({}, base, { endDate: '' })); assert(e && e.statusCode === 400, 'échéance vide : refusée');
  e = tryIt(Object.assign({}, base, { endDate: '2026-02-31' })); assert(e && e.statusCode === 400 && /valide/.test(e.message), 'date impossible (31 février) : refusée');
  e = tryIt(Object.assign({}, base, { endDate: 'demain' })); assert(e && e.statusCode === 400, 'texte non ISO : refusé');
  e = tryIt(Object.assign({}, base, { startDate: '2020-01-01', endDate: '2020-06-01' }), true); assert(e && e.statusCode === 400 && /passé/.test(e.message), 'saisie utilisateur : échéance passée refusée');
  e = tryIt(Object.assign({}, base, { endDate: '2027-06-01' }), true); assert(e === null, 'échéance valide et future : acceptée');
  const before = db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE userId = ?').get(u).n;
  // migration : anciens objectifs sans échéance valide
  const ins = db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, stepsJson, metaJson, createdAt) VALUES (?, ?, ?, 1, 'mois', ?, ?, ?, ?, '2026-10-01T00:00:00.000Z')");
  const i1 = Number(ins.run(u, m.activityId, 'Ancien sans date', '2026-10-01', '', '[]', '{}').lastInsertRowid);
  const i2 = Number(ins.run(u, m.activityId, 'Ancien avec étapes', '2026-10-01', 'n/a', JSON.stringify([{ n: 1, startDate: '2026-10-01', endDate: '2026-12-15', weeks: [] }]), '{}').lastInsertRowid);
  const i3 = Number(ins.run(u, m.activityId, 'Courir un 10 km', '2026-10-01', '', '[]', JSON.stringify({ cat: 'course10k' })).lastInsertRowid);
  const n1 = o.migrateEcheances();
  const g = (id) => db.prepare('SELECT endDate, metaJson FROM user_objectives WHERE id = ?').get(id);
  assert(n1 === 3, 'migration : 3 objectifs sans échéance traités (' + n1 + ')');
  assert(g(i1).endDate === '2027-10-01', 'migration : ni étapes ni catégorie : début + 1 an');
  assert(g(i2).endDate === '2026-12-15', 'migration : dernière date connue des périodes');
  assert(g(i3).endDate === '2026-12-10', 'migration : début + durée typique de la catégorie (10 semaines)');
  assert(JSON.parse(g(i1).metaJson).echeanceDefaut === true, 'migration : marqué échéance par défaut');
  assert(o.migrateEcheances() === 0, 'migration idempotente');
  assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE userId = ?').get(u).n === before + 3, 'migration : rien supprimé');
  const cs = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
  assert(cs.includes('!form.dateOk || !form.endDate') && cs.includes('MSG_PASSE'), 'interface : Suivant/Terminer grisé sans date valide, message pour une date passée');
}

// MARK-FIN
const nRef = (id) => db.prepare('SELECT (SELECT COUNT(*) FROM user_objectives WHERE userId = ?) + (SELECT COUNT(*) FROM objectifs_refus WHERE userId = ?) AS n').get(id, id).n;
assert(nRef(u) > 0, 'avant suppression : objectifs et refus du compte présents');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(u));
assert(nRef(u) === 0, 'suppression de compte : plus aucun objectif ni refus');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
