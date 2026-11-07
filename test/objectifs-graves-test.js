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

(async () => {
// ---- 1. Export et suppression de compte ----
{
  const a = mk('Objectif A', { description: 'Ma description privée' });
  const b = mk('Objectif B', { parentId: a.id, parentRel: 'avant', refus: [a.id] });
  const ex = require('../server/lib/dataexport').buildUserExport(u);
  assert(Array.isArray(ex.objectives) && ex.objectives.length >= 2, 'export : objectifs présents');
  const eb = (ex.objectives || []).find((x) => x.id === b.id), ea = (ex.objectives || []).find((x) => x.id === a.id);
  assert(eb && eb.parentId === a.id && eb.parentRel === 'avant', 'export : lien parent/enfant');
  assert(ea && ea.description === 'Ma description privée' && Array.isArray(ea.periodes) && ea.periodes.length > 0, 'export : description et périodes dépliées');
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
  assert(src.includes('function sameAct(o, id)') && src.includes('t.isMacro ||') && !src.includes('arUnlinkZone'), 'interface : la règle « même activité » reste (sauf sous un macro) ; le glisser-lier et la zone « Délier » ont été retirés (la règle est tenue par le serveur)');
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
  const i1 = Number(ins.run(u, m.activityId, 'Ancien sans date', '2026-10-01', '', JSON.stringify([{ n: 1, startDate: '2026-10-01', weeks: [{ i: 1, startDate: '2026-10-01', endDate: '2026-10-07' }] }]), '{}').lastInsertRowid);
  const i2 = Number(ins.run(u, m.activityId, 'Ancien avec étapes', '2026-10-01', 'n/a', JSON.stringify([{ n: 1, startDate: '2026-10-01', endDate: '2026-12-15', weeks: [{ i: 1, startDate: '2026-10-01', endDate: '2026-10-07' }] }]), '{}').lastInsertRowid);
  const i3 = Number(ins.run(u, m.activityId, 'Courir un 10 km', '2026-10-01', '', JSON.stringify([{ n: 1, startDate: '2026-10-01', weeks: [{ i: 1, startDate: '2026-10-01', endDate: '2026-10-07' }] }]), JSON.stringify({ cat: 'course10k' })).lastInsertRowid);
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

// ---- 6. Objectifs MACRO : plusieurs activités sous un objectif commun ----
{
  const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
  const A1 = newAct('Macro A1'), A2 = newAct('Macro A2'), A3 = newAct('Macro A3');
  const mkIn = (title, activityId, extra) => o.creer(u, Object.assign({ title, activityId, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));
  const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
  const macro = mkIn('Macro santé', A1, { isMacro: true });
  assert(macro.isMacro === true && macro.macroEmpty === true && macro.macroChildren === 0, 'macro créé : visible, sans enfant, signalé (macroEmpty)');
  assert(macro.macroActivities.length === 1 && macro.macroActivities[0].id === A1, 'macro sans enfant : son activité d’attache');
  const m1 = mkIn('Micro A1', A1, { parentId: macro.id }), m2 = mkIn('Micro A2', A2, { parentId: macro.id });
  const m3 = mkIn('Micro A3', A3);
  assert(m2.parentId === macro.id, 'macro : un enfant d’une AUTRE activité est accepté');
  assert(o.lier(u, m3.id, macro.id, 'apres').parentId === macro.id, 'macro : lier un enfant d’une troisième activité (colonnes non adjacentes) accepté');
  let g = o.get(u, macro.id);
  assert(g.macroActivities.map((a) => a.id).sort().join() === [A1, A2, A3].sort().join() && g.macroChildren === 3 && !g.macroEmpty, 'macro : activités = celles de ses enfants (liste : macroActivities)');
  const normal = mkIn('Parent ordinaire A1', A1), x2 = mkIn('Enfant A2', A2);
  let e = bad(() => o.lier(u, x2.id, normal.id, 'apres')); assert(e && e.statusCode === 400 && /même activité/.test(e.message), 'parent ordinaire d’une autre activité : toujours refusé (L03)');
  e = bad(() => mkIn('Enfant refusé', A2, { parentId: normal.id })); assert(e && e.statusCode === 400, 'creer : parent ordinaire d’une autre activité refusé');
  // garde : macro = sommet ou étape de macro
  const m5 = mkIn('Macro étape', A1, { isMacro: true });
  e = bad(() => o.lier(u, m5.id, normal.id, 'apres')); assert(e && /macro/.test(e.message), 'un macro ne devient pas l’étape d’un objectif ordinaire');
  assert(o.lier(u, m5.id, macro.id, 'apres').parentId === macro.id, 'un macro peut être l’étape d’un macro');
  const kidOfNormal = mkIn('Fils ordinaire', A1, { parentId: normal.id });
  e = bad(() => o.setMacro(u, kidOfNormal.id, true)); assert(e && e.statusCode === 400, 'un objectif étape d’un objectif ordinaire ne peut pas devenir macro');
  e = bad(() => o.setMacro(u, macro.id, false)); assert(e && /autres activités/.test(e.message), 'macro avec enfants d’autres activités : retour en ordinaire refusé');
  // achèvement
  const done = (id) => { const r = o.get(u, id); r.periods.forEach((p) => p.weeks.forEach((w) => o.semaine(u, id, p.n, w.i, true))); };
  done(m1.id); done(m2.id);
  assert(o.get(u, macro.id).status === 'en_cours', 'macro : pas atteint tant qu’un enfant ne l’est pas');
  o.abandonner(u, m5.id, true); done(m3.id);
  g = o.get(u, macro.id);
  assert(g.status === 'atteint' && g.progress === 1, 'macro : atteint quand tous ses enfants non abandonnés le sont (calcul à l’affichage)');
  assert(o.liste(u, 'tous').find((x) => x.id === macro.id).status === 'atteint' && o.macroDe(u, macro.id).status === 'atteint', 'macro : même état dans liste() et dans la route macro');
  // tous les enfants abandonnés
  const A4 = newAct('Macro A4'), A5 = newAct('Macro A5'), A6 = newAct('Macro A6'); // colonnes libres : une colonne déjà reliée à un macro ne peut pas être reliée à un autre
  const m6 = mkIn('Macro tout abandonné', A1, { isMacro: true }), c1 = mkIn('Enfant abandonné', A4, { parentId: m6.id });
  o.abandonner(u, c1.id, true);
  g = o.get(u, m6.id); assert(g.macroAllAbandoned === true && g.status === 'en_cours', 'macro dont tous les enfants sont abandonnés : jamais atteint, signalé');
  // enfant déplacé vers une autre activité
  const moved = o.deplacer(u, m2.id, A3); assert(moved.activity.id === A3 && moved.parentId === macro.id, 'enfant de macro : déplaçable vers une autre activité, garde son parent macro');
  e = bad(() => o.deplacer(u, kidOfNormal.id, A2)); assert(e && e.statusCode === 400, 'enfant d’un parent ordinaire : déplacement vers une autre activité refusé');
  e = bad(() => o.deplacer(u, normal.id, A2)); assert(e && /rattachés/.test(e.message), 'objectif ayant des enfants ordinaires : ne change pas d’activité');
  const free = mkIn('Libre', A1); assert(o.deplacer(u, free.id, A2).activity.id === A2, 'objectif sans parent : déplaçable');
  // activité supprimée avec macro : ses enfants sont archivés, le macro reste avec les autres
  db.prepare("UPDATE activities SET active = 0, deletedAt = '2026-11-06T00:00:00.000Z' WHERE id = ?").run(A3);
  g = o.get(u, macro.id);
  assert(!g.macroActivities.some((a) => a.id === A3) && g.macroChildren === 2 && g.macroActivities.length === 1 && g.macroActivities[0].id === A1, 'activité supprimée : ses enfants sortent du macro, le macro reste avec ses autres enfants');
  db.prepare("UPDATE activities SET active = 0, deletedAt = '2026-11-06T00:00:00.000Z' WHERE id = ?").run(A1);
  g = o.get(u, macro.id);
  assert(g.macroEmpty === true && g.macroActivities.length === 0 && g.title === 'Macro santé', 'toutes les activités supprimées : le macro reste visible, vide, signalé');
  db.prepare('UPDATE activities SET active = 1, deletedAt = NULL WHERE id IN (?, ?)').run(A1, A3);
  // proposition de macro à la création + fusion validée
  const p1 = mkIn('Courir un semi-marathon', A5), p2 = mkIn('Courir un semi-marathon bis', A6);
  const rt = await o.rattachement(u, { title: 'Préparer un semi-marathon', activityId: A3 });
  assert(rt.macro && rt.macro.candidates.length >= 2 && rt.macro.candidates.every((c) => c.activityId !== A3), 'création : objectifs ressemblants dans plusieurs autres activités : macro proposé (jamais écrit)');
  assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE title = ?').get('Préparer un semi-marathon').n === 0, 'la proposition n’écrit rien');
  e = bad(() => o.fusionnerEnMacro(u, { title: 'Semi', childIds: [p1.id] })); assert(e && e.statusCode === 400, 'fusion : au moins deux objectifs');
  const fus = o.fusionnerEnMacro(u, { title: 'Semi-marathon (macro)', childIds: [p1.id, p2.id] });
  assert(fus.isMacro && fus.macroChildren === 2 && fus.macroActivities.length === 2 && o.get(u, p1.id).parentId === fus.id, 'fusion validée : macro créé, objectifs rattachés à cheval sur deux activités');
  const sc = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'user_objectives'").get().n; assert(sc === 1, 'table user_objectives intacte');
  assert(db.prepare('PRAGMA table_info(user_objectives)').all().some((c) => c.name === 'isMacro'), 'migration : colonne isMacro');
}

// ---- 7. Macros : niveaux, macro d'un macro, cycles, échéance, suppression, périodes, activité unique ----
{
  const goalsLib = require('../server/lib/goals');
  const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
  const B1 = newAct('Niveau B1'), B2 = newAct('Niveau B2'), B3 = newAct('Niveau B3');
  const mkB = (title, activityId, extra) => o.creer(u, Object.assign({ title, activityId, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));
  const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
  // macro d'un macro, colonnes non adjacentes
  const mA = mkB('Macro A+B', B1, { isMacro: true }), a1 = mkB('Objectif B1', B1, { parentId: mA.id }), a2 = mkB('Objectif B2', B2, { parentId: mA.id });
  const mB = mkB('Macro (A+B)+C', B1, { isMacro: true }), a3 = mkB('Objectif B3', B3, { parentId: mB.id });
  assert(o.lier(u, mA.id, mB.id, 'avant').parentId === mB.id, 'macro d’un macro : un macro relie (A+B) avec C');
  const gB = o.get(u, mB.id);
  assert(gB.macroLevel === 'activite' && gB.childMacroIds.length === 1 && gB.childMacroIds[0] === mA.id, 'liste/get : macroLevel et childMacroIds');
  assert(gB.macroColumns.length === 3 && [B1, B2, B3].every((a) => gB.macroColumns.some((c) => c.activityId === a)) && gB.macroActivities.length === 3, 'macro enchaîné : colonnes reliées à travers les macros (A, B et C)');
  assert(o.liste(u, 'tous').find((x) => x.id === mB.id).macroColumns.length === 3, 'liste() expose macroColumns');
  // cycles macro <-> macro
  let e = bad(() => o.lier(u, mB.id, mA.id, 'apres')); assert(e && e.statusCode === 400 && /propres/.test(e.message), 'cycle macro <-> macro refusé');
  e = bad(() => o.lier(u, mA.id, mA.id, 'apres')); assert(e && e.statusCode === 400, 'un macro n’est pas son propre parent');
  // échéance d'un macro
  const late = bad(() => mkB('Trop tard', B2, { parentId: mA.id, endDate: '2027-06-01' }));
  assert(late && late.statusCode === 400 && /dépasse celle du macro/.test(late.message), 'création d’un enfant plus lointain que le macro : refus 400');
  const far = mkB('Libre lointain', B2, { endDate: '2027-09-01' });
  e = bad(() => o.lier(u, far.id, mA.id, 'apres')); assert(e && e.statusCode === 400 && /dépasse celle du macro/.test(e.message), 'rattacher un enfant plus lointain que le macro : refus 400');
  e = bad(() => o.modifierEcheance(u, mA.id, '2027-01-15')); assert(e && e.statusCode === 400 && /au moins celle/.test(e.message), 'macro : échéance plus proche que celle d’un enfant refusée');
  e = bad(() => o.modifierEcheance(u, mA.id, '2027-10-01')); assert(e && /dépasse celle du macro/.test(e.message), 'macro enfant d’un macro : pas au-delà du macro parent');
  o.modifierEcheance(u, mB.id, '2027-12-01');
  const pushed = o.modifierEcheance(u, mA.id, '2027-10-01'); assert(pushed.endDate === '2027-10-01' && pushed.periods.length > 1, 'macro : échéance repoussée, périodes recalculées');
  assert(o.lier(u, far.id, mA.id, 'apres').parentId === mA.id, 'après avoir repoussé le macro, l’enfant plus lointain se rattache');
  e = bad(() => o.modifierEcheance(u, far.id, '2028-01-01')); assert(e && /dépasse celle du macro/.test(e.message), 'enfant : échéance au-delà du macro refusée');
  e = bad(() => o.modifierEcheance(u, a1.id, '')); assert(e && e.statusCode === 400, 'échéance vide refusée en modification');
  const edge = mkB('Au bord', B1, { parentId: mA.id, endDate: '2027-10-01' });
  e = bad(() => o.bilan(u, edge.id, 'prolonger', 1)); assert(e && e.statusCode === 400 && /macro/.test(e.message), 'prolonger un enfant au-delà du macro : refus');
  // niveau pôle : un macro relie des pôles d'une activité
  goalsLib.addCategory(B1, 'Pôle test 1'); goalsLib.addCategory(B1, 'Pôle test 2');
  const poles = goalsLib.categoriesForActivity(B1);
  const pm = mkB('Macro de pôles', B1, { isMacro: true, level: 'pole' });
  const p1 = mkB('Objectif pôle 1', B1, { level: 'pole', poleKey: poles[0].key, parentId: pm.id }), p2 = mkB('Objectif pôle 2', B1, { level: 'pole', poleKey: poles[1].key, parentId: pm.id });
  const gp = o.get(u, pm.id);
  assert(gp.macroLevel === 'pole' && gp.macroColumns.length === 2 && gp.macroColumns.every((c) => c.level === 'pole' && c.activityId === B1) && gp.macroColumns[0].poleKey !== gp.macroColumns[1].poleKey, 'macro de niveau pôle : relie deux pôles d’une même activité');
  e = bad(() => mkB('Mauvais niveau', B1, { parentId: pm.id })); assert(e && e.statusCode === 400 && /niveau/.test(e.message), 'enfant d’un autre niveau refusé');
  // suppression d'un macro intermédiaire : rien en cascade, les enfants deviennent sommets
  e = bad(() => o.supprimer(u, mA.id, false)); assert(e && e.statusCode === 409 && e.extra.children.length >= 3, 'macro intermédiaire : suppression refusée sans confirmation, enfants listés');
  const rr = o.supprimer(u, mA.id, true);
  assert(rr.ok && rr.detached.includes(a1.id) && o.get(u, a1.id).parentId === null && o.get(u, a2.id).title === 'Objectif B2', 'macro intermédiaire supprimé : ses enfants deviennent des sommets, aucun supprimé');
  assert(o.get(u, mB.id).childMacroIds.length === 0 && o.get(u, mB.id).macroChildren === 1, 'le macro parent reste, sans le macro supprimé');
  // réglage des périodes supprimé : échéances inchangées, périodes fixes 13 × 4 (section 8)
  assert(typeof o.setPeriods === 'undefined' && o.get(u, mB.id).periodWeeks === '4', 'périodes fixes 13 × 4 : plus de réglage global');
  // activité unique : pas de macro d'activités proposé
  const mine = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1').all(u).map((r) => r.id);
  db.prepare('UPDATE activities SET active = 0 WHERE id IN (' + mine.map(() => '?').join(',') + ')').run(...mine); db.prepare('UPDATE activities SET active = 1 WHERE id = ?').run(B1); // une seule activité active
  const rs = await o.rattachement(u, { title: 'Courir un semi-marathon', activityId: B1 });
  db.prepare('UPDATE activities SET active = 1 WHERE id IN (' + mine.map(() => '?').join(',') + ')').run(...mine);
  assert(!rs.macro, 'activité unique : aucun macro d’activités proposé');
}

// ---- 8. Modèle simplifié : le niveau se déduit de l'échéance, le type de la structure ; seule règle de hiérarchie : échéance du parent >= celle de l'enfant ----
{
  const fs = require('fs'), T = require('../server/lib/objectifs-temps');
  const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
  const E1 = newAct('Simplifié E1');
  const mkE = (title, extra) => o.creer(u, Object.assign({ title, activityId: E1, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));
  const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
  assert(T.PERIODS_PER_YEAR === 13 && T.PERIOD_WEEKS === 4 && T.deduce('2026-11-09', '2027-01-04') === 'periode' && T.deduce('2026-11-09', '2027-09-01') === 'annee', 'constante 13 x 4 ; niveau déduit de l’échéance');
  assert(typeof o.modifierNiveauTemps === 'undefined', 'plus de modification du niveau de temps');
  const rt = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(!rt.includes('niveau-temps') && !rt.includes("'/objectifs/periodes'"), 'routes niveau-temps et periodes supprimées');
  assert(db.prepare('PRAGMA table_info(user_objectives)').all().some((c) => c.name === 'timeLevel'), 'colonne timeLevel conservée en base (inutilisée)');
  const free = mkE('Niveau libre', { timeLevel: 'decennie', endDate: '2027-09-01' });
  assert(free.timeLevel === 'annee', 'un timeLevel envoyé est ignoré : niveau déduit de l’échéance, jamais validé');
  // isBig
  const big = mkE('Grand objectif', { endDate: '2027-09-01' }), kid = mkE('Petit', { endDate: '2027-01-04' });
  assert(o.get(u, big.id).isBig === false && o.get(u, kid.id).isBig === false, 'sans sous-objectif : pas un grand objectif');
  assert(o.lier(u, kid.id, big.id, 'apres').parentId === big.id && o.get(u, big.id).isBig === true && o.get(u, kid.id).isBig === false, 'avec un sous-objectif : isBig vrai pour le parent seulement');
  assert(o.liste(u, 'tous').find((x) => x.id === big.id).isBig === true, 'liste() expose isBig');
  assert(!('parentLevel' in o.get(u, kid.id)) && o.get(u, kid.id).parent.id === big.id, 'parent exposé (id, titre), plus de niveau du parent');
  // échéance du parent >= enfant (parent ordinaire)
  const shortP = mkE('Parent court', { endDate: '2027-01-04' }), longK = mkE('Enfant long', { endDate: '2027-09-01' });
  let e = bad(() => o.lier(u, longK.id, shortP.id, 'apres')); assert(e && e.statusCode === 400 && /dépasse celle de son parent/.test(e.message), 'lier : enfant plus lointain que son parent ordinaire refusé');
  e = bad(() => mkE('Création trop lointaine', { parentId: shortP.id, endDate: '2027-09-01' })); assert(e && e.statusCode === 400 && /dépasse celle de son parent/.test(e.message), 'creer : enfant plus lointain que le parent refusé');
  assert(mkE('Même échéance', { parentId: shortP.id, endDate: '2027-01-04' }).parentId === shortP.id, 'même échéance que le parent : accepté');
  e = bad(() => o.modifierEcheance(u, shortP.id, '2026-12-20')); assert(e && e.statusCode === 400 && /au moins celle de son objectif le plus lointain/.test(e.message), 'parent ordinaire : échéance plus proche que celle d’un enfant refusée');
  e = bad(() => o.modifierEcheance(u, kid.id, '2028-01-01')); assert(e && /dépasse celle de son parent/.test(e.message), 'enfant : échéance au-delà du parent refusée');
  assert(o.modifierEcheance(u, big.id, '2028-06-01').endDate === '2028-06-01', 'parent : échéance repoussée (acceptée)');
  assert(o.modifierEcheance(u, kid.id, '2028-01-01').endDate === '2028-01-01', 'puis l’enfant peut aller jusque-là (aucune règle de niveau)');
  const edge = mkE('Au bord du parent', { parentId: shortP.id, endDate: '2027-01-04' });
  e = bad(() => o.bilan(u, edge.id, 'prolonger', 1)); assert(e && e.statusCode === 400 && /dépasserait l’échéance du parent/.test(e.message), 'prolonger au-delà du parent : refusé');
  // un petit parent peut avoir un enfant plus long en durée mais pas en échéance : seule l'échéance compte
  const annualChild = mkE('Enfant de durée annuelle', { parentId: big.id, endDate: '2028-05-01' });
  assert(annualChild.parentId === big.id, 'aucune notion de niveau : un enfant de longue durée sous un parent qui finit plus tard est accepté');
  // rattachement : candidats = même activité, échéance >= celle du nouvel objectif
  const cLate = mkE('Courir le grand marathon', { endDate: '2027-09-01' }), cSoon = mkE('Courir le petit marathon', { endDate: '2027-01-04' });
  const rr1 = await o.rattachement(u, { title: 'Préparer le grand marathon', activityId: E1, startDate: '2026-11-09', endDate: '2027-03-01' });
  assert(rr1.candidate && rr1.candidate.id === cLate.id, 'rattachement : candidat dont l’échéance est au moins celle du nouvel objectif');
  const rr2 = await o.rattachement(u, { title: 'Préparer le petit marathon', activityId: E1, startDate: '2026-11-09', endDate: '2027-03-01' });
  assert(!rr2.candidate || rr2.candidate.id !== cSoon.id, 'rattachement : jamais un candidat dont l’échéance est avant celle du nouvel objectif');
  // macros : même règle
  const mac = mkE('Macro simplifié', { isMacro: true, endDate: '2027-03-01' });
  e = bad(() => mkE('Enfant trop lointain du macro', { parentId: mac.id, endDate: '2027-09-01' })); assert(e && /dépasse celle du macro/.test(e.message), 'macro : même règle d’échéance, message propre');
  // le parent supprimé : enfant détaché
  assert(o.supprimer(u, shortP.id, true).ok, 'parent supprimé (confirmé) : enfants détachés');
}

// ---- Mode édition : titre, description « pour l'IA », échéance ----
{
  const p = mk('Parent édition'), k = mk('Enfant édition', { parentId: p.id, endDate: '2027-02-01' });
  const bad = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  let e = await bad(() => o.renommer(u, p.id, '   '));
  assert(e && e.statusCode === 400 && /vide/.test(e.message), 'titre vide refusé');
  e = await bad(() => o.renommer(u, p.id, 'x'.repeat(141)));
  assert(e && e.statusCode === 400 && /trop long/.test(e.message), 'titre de plus de 140 caractères refusé');
  const r = await o.renommer(u, p.id, '  Nouveau   titre  ');
  assert(r.title === 'Nouveau titre' && o.get(u, p.id).title === 'Nouveau titre', 'titre enregistré, espaces nettoyés (aucune autre modification)');
  e = await bad(() => o.decrire(u, p.id, 'y'.repeat(1001)));
  assert(e && e.statusCode === 400 && /trop longue/.test(e.message), 'description de plus de 1000 caractères refusée');
  assert(o.decrire(u, p.id, '  Contexte pour l’IA ').description === 'Contexte pour l’IA', 'description enregistrée');
  assert(o.decrire(u, p.id, '').description === '', 'description vidée');
  e = await bad(() => o.modifierEcheance(u, p.id, '2027-01-01'));
  assert(e && /au moins celle/.test(e.message), 'échéance du parent avant celle de son enfant refusée (règle existante)');
  assert(o.modifierEcheance(u, p.id, '2027-06-01').endDate === '2027-06-01', 'échéance modifiée');
  assert(o.get(u, k.id).parentId === p.id, 'les rattachements ne bougent pas');
}
// ---- Fusion dans le temps : période de fusion, état dérivé, refus de délier une fusion passée ----
{
  const F = require('../server/lib/objectifs-fusion');
  const p = F.periodOf('2026-11-15');
  assert(p.year === 2026 && p.number >= 1 && p.start <= '2026-11-15' && p.end >= '2026-11-15', 'période de fusion : la période de l’arbre qui contient l’échéance');
  assert(F.periodOf('2026-12-31').number === 13 && F.periodOf('2026-12-31').end === '2026-12-31', 'la 13e période va jusqu’au 31 décembre');
  let st = F.state('2026-11-15', '2026-09-01');
  assert(!st.mergeReached && !st.mergePast, 'avant la période : colonnes séparées (ni atteinte ni passée)');
  st = F.state('2026-11-15', p.start);
  assert(st.mergeReached && !st.mergePast, 'à l’entrée dans la période : atteinte, pas passée');
  assert(!F.state('2026-11-15', p.end).mergePast && F.state('2026-11-15', '2027-12-31').mergePast, 'dernier jour : pas encore passée ; le lendemain : passée (changement de jour à minuit)');
  const a1 = mk('Fusion A', { endDate: '2027-02-01' });
  const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Autre fusion', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act2, u);
  const c1 = o.creer(u, { title: 'Fusion C', activityId: act2, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true });
  const m1 = o.fusionnerEnMacro(u, { childIds: [a1.id, c1.id], title: 'Macro futur' });
  assert(m1.mergeStart && m1.mergeEnd && m1.mergePast === false, 'le macro porte sa période de fusion (calculée à la lecture)');
  assert(o.lier(u, a1.id, null).parentId === null, 'avant la date : délier défait la fusion'); o.lier(u, c1.id, null);
  const m2 = o.fusionnerEnMacro(u, { childIds: [a1.id, c1.id], title: 'Macro chaîné' });
  const bad = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  db.prepare("UPDATE user_objectives SET endDate = '2026-01-20', startDate = '2026-01-05' WHERE id IN (?, ?, ?)").run(m2.id, a1.id, c1.id);
  assert(o.get(u, m2.id).mergePast === true, 'macro dont la période est passée : fusion passée');
  let e = bad(() => o.lier(u, a1.id, null));
  assert(e && e.message === 'Fusion passée : impossible de délier.', 'fusion passée : délier refusé avec le message court');
  e = bad(() => o.supprimer(u, m2.id, true));
  assert(e && e.message === 'Fusion passée : impossible de délier.', 'fusion passée : supprimer le macro (tout délier) refusé aussi');
  e = bad(() => o.setMacro(u, m2.id, false));
  assert(e && /Fusion passée/.test(e.message), 'fusion passée : le macro ne redevient pas un objectif ordinaire');
  assert(o.get(u, a1.id).parentId === m2.id && o.get(u, c1.id).parentId === m2.id, 'aucune donnée supprimée ni détachée');
}
// ---- Macro séparé : plus de macro orphelin ----
{
  const act4 = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Orph act A', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act4, u);
  const a = o.creer(u, { title: 'Orph A', activityId: act4, startDate: '2026-11-09', endDate: '2027-04-01', noBridge: true });
  const act3 = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Orph act', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act3, u);
  const b = o.creer(u, { title: 'Orph B', activityId: act3, startDate: '2026-11-09', endDate: '2027-04-01', noBridge: true });
  const m = o.fusionnerEnMacro(u, { childIds: [a.id, b.id], title: 'Macro orphelin' });
  o.lier(u, a.id, null);
  assert(db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(m.id), 'un enfant détaché : le macro reste tant qu’il a un objectif relié');
  o.lier(u, b.id, null);
  assert(!db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(m.id), 'dernier enfant détaché : le macro vide disparaît (aucun macro orphelin)');
  assert(o.get(u, a.id).parentId === null && o.get(u, b.id).parentId === null && o.get(u, a.id).isMacro === false, 'les anciens enfants restent des objectifs normaux');
  db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, isMacro, createdAt) VALUES (?, ?, 'Macro vide ancien', 1, 'mois', '2026-11-09', '2027-04-01', 1, '2026-11-09T00:00:00.000Z')").run(u, m.activity.id);
  assert(o.purgeOrphanMacros(u) >= 1 && !db.prepare("SELECT 1 FROM user_objectives WHERE title = 'Macro vide ancien'").get(), 'nettoyage des macros vides existants (démo)');
}
// MARK-FIN
const nRef = (id) => db.prepare('SELECT (SELECT COUNT(*) FROM user_objectives WHERE userId = ?) + (SELECT COUNT(*) FROM objectifs_refus WHERE userId = ?) AS n').get(id, id).n;
assert(nRef(u) > 0, 'avant suppression : objectifs et refus du compte présents');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(u));
assert(nRef(u) === 0, 'suppression de compte : plus aucun objectif ni refus');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
})();
