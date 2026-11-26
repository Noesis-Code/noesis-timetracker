// Contrôle de conflit de la fusion (Émilien, 18 nov. 2026) : une fusion n'est possible que si, APRÈS sa période, les deux colonnes n'ont pas d'objectif dans la même case.
// Usage : node test/objectifs-fusion-conflit-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-fusc-');
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
const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
const mk = (title, act, start, end) => o.creer(u, { title, activityId: act, startDate: start, endDate: end, noBridge: true });
const bad = (f) => { try { f(); return null; } catch (e) { return e; } };
const [A, B, C] = [newAct('Fus A'), newAct('Fus B'), newAct('Fus C')];
// Conflit : A et B ont chacun un objectif en 2028 (même année), la fusion se fait en 2026.
const a1 = mk('A-2026', A, '2026-11-09', '2027-01-15'), b1 = mk('B-2026', B, '2026-11-09', '2027-01-20');
const a2 = mk('A-2028', A, '2028-01-10', '2028-12-01'), b2 = mk('B-2028', B, '2028-02-10', '2028-11-15');
let e = bad(() => o.fusionnerEnMacro(u, { childIds: [a1.id, b1.id], title: 'Conflit' }));
assert(e && /Vous devez déplacer/.test(e.message) && /A-2028/.test(e.message) && /B-2028/.test(e.message), 'conflit : message « Vous devez déplacer » nommant les deux objectifs : ' + (e && e.message));
assert(!db.prepare("SELECT 1 FROM user_objectives WHERE isMacro = 1 AND title = 'Conflit'").get(), 'conflit : rien n’est créé');
assert(o.get(u, a2.id) && o.get(u, b2.id), 'conflit : aucune donnée supprimée');
// Non-conflit : B déplacé en 2029 : la fusion se fait, les deux objectifs restent.
o.reprogrammer(u, b2.id, '2029-02-10', '2029-11-15');
const f1 = o.fusionnerEnMacro(u, { childIds: [a1.id, b1.id], title: 'Fusion ok' });
assert(f1.isMacro && f1.macroChildren === 2, 'non-conflit : la fusion se fait');
assert(o.get(u, a2.id).title === 'A-2028' && o.get(u, b2.id).title === 'B-2028', 'non-conflit : les deux objectifs restent, sans écrasement');
// Un objectif de C à la même case que A-2028 n'est pas un conflit pour une fusion A+B (C n'est pas relié)
const c1 = mk('C-2028', C, '2028-01-10', '2028-12-01');
assert(c1 && o.get(u, c1.id), 'colonne non reliée : aucun contrôle');
// Même colonne : deux objectifs de A dans la même case ne sont pas un conflit.
const [D, E] = [newAct('Fus D'), newAct('Fus E')], g1 = mk('D-2026', D, '2026-11-09', '2027-01-10'), g2 = mk('E-2026', E, '2026-11-09', '2027-01-12'); mk('D-2031', D, '2031-01-10', '2031-12-01'); mk('D-2031b', D, '2031-02-10', '2031-12-02');
assert(!bad(() => o.fusionnerEnMacro(u, { childIds: [g1.id, g2.id], title: 'Même colonne' })), 'deux objectifs de la même colonne dans la même case : pas un conflit');
// Transitivité : A-B déjà fusionnées ; B-C (autres objectifs, non reliés) : le groupe entier A,B,C est contrôlé (C-2028 contre A-2028).
const b3 = mk('B-2026c', B, '2026-11-09', '2027-02-10'), c2 = mk('C-2026b', C, '2026-11-09', '2027-02-12'), c3 = mk('C-2028', C, '2028-03-10', '2028-10-15');
e = bad(() => o.fusionnerEnMacro(u, { childIds: [b3.id, c2.id], title: 'B-C' }));
assert(e && /Vous devez déplacer/.test(e.message) && /C-2028/.test(e.message) && /A-2028/.test(e.message), 'transitivité : B-C refusée car C entre en conflit avec A (groupe A-B-C) : ' + (e && e.message));
o.reprogrammer(u, c3.id, '2032-03-10', '2032-10-15'); o.reprogrammer(u, c1.id, '2033-01-10', '2033-12-01');
assert(!bad(() => o.fusionnerEnMacro(u, { childIds: [b3.id, c2.id], title: 'B-C ok' })), 'transitivité : conflit levé, B-C se fait');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
