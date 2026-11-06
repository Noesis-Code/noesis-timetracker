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

// MARK-FIN
const nRef = (id) => db.prepare('SELECT (SELECT COUNT(*) FROM user_objectives WHERE userId = ?) + (SELECT COUNT(*) FROM objectifs_refus WHERE userId = ?) AS n').get(id, id).n;
assert(nRef(u) > 0, 'avant suppression : objectifs et refus du compte présents');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(u));
assert(nRef(u) === 0, 'suppression de compte : plus aucun objectif ni refus');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
