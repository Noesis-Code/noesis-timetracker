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
  assert(src.includes('function sameAct(o, id)') && src.includes('!sameAct(o, id)') && src.includes('!below[id] && !!sameAct(o, id)') && src.includes('t.isMacro ||'), 'interface : cibles de dépôt d’une autre activité non valides');
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
  const m6 = mkIn('Macro tout abandonné', A1, { isMacro: true }), c1 = mkIn('Enfant abandonné', A2, { parentId: m6.id });
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
  const p1 = mkIn('Courir un semi-marathon', A1), p2 = mkIn('Courir un semi-marathon bis', A2);
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

// ---- 8. Niveaux de temps fixes : période -> année -> pluriannuel ----
{
  const T = require('../server/lib/objectifs-temps');
  const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
  const C1 = newAct('Temps C1');
  const mkT = (title, extra) => o.creer(u, Object.assign({ title, activityId: C1, startDate: '2026-11-09', endDate: '2027-01-04', noBridge: true }, extra || {}));
  const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
  assert(T.PERIODS_PER_YEAR === 13 && T.PERIOD_WEEKS === 4 && JSON.stringify(T.TIME_LEVELS) === '["periode","annee","pluriannuel"]', 'constante unique 13 × 4 et trois niveaux fixes');
  assert(T.deduce('2026-11-09', '2027-02-08') === 'periode' && T.deduce('2026-11-09', '2027-02-09') === 'annee' && T.deduce('2026-11-09', '2029-11-01') === 'annee' && T.deduce('2026-11-09', '2030-01-01') === 'pluriannuel', 'déduction : <= 13 semaines période, <= 3 ans année, au-delà pluriannuel');
  const s = mkT('Court'), y = mkT('Annuel', { endDate: '2027-09-01' }), pl = mkT('Long', { endDate: '2031-01-01' });
  assert(s.timeLevel === 'periode' && y.timeLevel === 'annee' && pl.timeLevel === 'pluriannuel', 'création : niveau déduit de l’échéance, exposé par get()');
  assert(o.liste(u, 'tous').find((x) => x.id === y.id).timeLevel === 'annee', 'liste() expose timeLevel');
  assert(s.periodWeeks === '4' && y.periodWeeks === '4', 'périodes toujours de 4 semaines (13 × 4)');
  const choice = mkT('Choisi année', { timeLevel: 'annee', endDate: '2027-06-01' }); assert(choice.timeLevel === 'annee', 'création : niveau choisi accepté');
  let e = bad(() => mkT('Niveau inconnu', { timeLevel: 'decennie' })); assert(e && e.statusCode === 400 && /Niveau de temps invalide/.test(e.message), 'niveau de temps invalide refusé');
  e = bad(() => mkT('Période trop longue', { timeLevel: 'periode', endDate: '2027-09-01' })); assert(e && e.statusCode === 400 && /trop lointaine/.test(e.message), 'échéance trop lointaine pour le niveau période : refus');
  e = bad(() => mkT('Pluriannuel trop court', { timeLevel: 'pluriannuel', endDate: '2027-03-01' })); assert(e && e.statusCode === 400 && /trop proche/.test(e.message), 'échéance trop proche pour le niveau pluriannuel : refus');
  // modification
  e = bad(() => o.modifierEcheance(u, s.id, '2027-09-01')); assert(e && /niveau de temps/.test(e.message), 'modifier l’échéance au-delà du niveau : refus (changer d’abord le niveau)');
  assert(o.modifierNiveauTemps(u, s.id, 'annee').timeLevel === 'annee' && o.modifierEcheance(u, s.id, '2027-09-01').endDate === '2027-09-01', 'niveau changé puis échéance allongée');
  e = bad(() => o.modifierNiveauTemps(u, y.id, 'periode')); assert(e && e.statusCode === 400, 'niveau incohérent avec l’échéance : refusé');
  // macro : niveau >= enfants
  const mac = mkT('Macro court', { isMacro: true }), kidLong = mkT('Enfant annuel', { endDate: '2027-01-04', timeLevel: 'periode' });
  assert(o.lier(u, kidLong.id, mac.id, 'apres').parentId === mac.id, 'macro période : enfant de même niveau accepté');
  const kidAnn = mkT('Enfant plus long', { timeLevel: 'annee', endDate: '2027-01-04' });
  e = bad(() => o.lier(u, kidAnn.id, mac.id, 'apres')); assert(e && e.statusCode === 400 && /niveau de temps du macro/.test(e.message), 'macro plus court que son enfant : refus (lier)');
  e = bad(() => mkT('Création plus longue', { timeLevel: 'annee', endDate: '2027-01-04', parentId: mac.id })); assert(e && /niveau de temps du macro/.test(e.message), 'macro plus court que son enfant : refus (création)');
  assert(o.modifierNiveauTemps(u, mac.id, 'annee').timeLevel === 'annee' && o.lier(u, kidAnn.id, mac.id, 'apres').parentId === mac.id, 'macro monté au niveau année : l’enfant annuel se rattache');
  e = bad(() => o.modifierNiveauTemps(u, mac.id, 'periode')); assert(e && /niveau de temps du macro/.test(e.message), 'macro : niveau abaissé sous celui d’un enfant refusé');
  e = bad(() => o.modifierNiveauTemps(u, kidAnn.id, 'pluriannuel')); assert(e && e.statusCode === 400, 'enfant : niveau plus long que le macro refusé');
  // fusion : le macro prend le niveau le plus long
  const f1 = mkT('Fusion courte A'), f2 = mkT('Fusion longue B', { endDate: '2027-09-01' });
  assert(o.fusionnerEnMacro(u, { title: 'Fusion macro', childIds: [f1.id, f2.id] }).timeLevel === 'annee', 'fusion : macro au niveau le plus long de ses enfants');
  // migration : colonne ajoutée, anciens objectifs déduits (une seule fois), idempotente
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'lib', 'objectifs.js'), 'utf8');
  assert(src.includes("if (!cols.includes('timeLevel'))") && src.includes('temps.deduce(r.startDate, r.endDate)'), 'migration : niveau de temps déduit à l’ajout de la colonne');
  assert(db.prepare('PRAGMA table_info(user_objectives)').all().some((c) => c.name === 'timeLevel') && db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'objPerYear'), 'colonne timeLevel posée ; colonnes users.objPerYear... conservées, inutilisées');
  // migration réelle : base à l'ancien schéma (sans timeLevel), relancée dans un processus séparé
  {
    const cp = require('child_process'), dir = require('./lib/tmpdir').mkTmp('tmt-objg-mig-');
    const script = "process.env.NOESIS_DATA_DIR = process.argv[1]; const db = require('./server/db');"
      + "db.exec(\"CREATE TABLE IF NOT EXISTS user_objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, activityId INTEGER NOT NULL, title TEXT NOT NULL, amount INTEGER NOT NULL, unit TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, periodWeeks TEXT NOT NULL DEFAULT '4', weekly INTEGER NOT NULL DEFAULT 1, parentId INTEGER, stepsJson TEXT NOT NULL DEFAULT '[]', taskIdsJson TEXT NOT NULL DEFAULT '[]', metaJson TEXT NOT NULL DEFAULT '{}', createdAt TEXT NOT NULL)\");"
      + "const ins = db.prepare(\"INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, stepsJson, createdAt) VALUES ('x', 1, ?, 1, 'mois', ?, ?, '[]', '2026-10-01T00:00:00.000Z')\");"
      + "ins.run('court', '2026-11-01', '2026-12-15'); ins.run('annuel', '2026-11-01', '2027-11-01'); ins.run('long', '2026-11-01', '2031-11-01');"
      + "require('./server/lib/objectifs');"
      + "const l = () => db.prepare('SELECT title, timeLevel FROM user_objectives ORDER BY id').all().map((r) => r.title + ':' + r.timeLevel).join();"
      + "const first = l(); require('child_process'); console.log('RES ' + first);";
    const run = () => cp.execFileSync('node', ['-e', script, dir], { cwd: require('path').join(__dirname, '..'), encoding: 'utf8', env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging', SEED_OBJECTIFS_DEMO: '0' }) });
    const out = run();
    assert(/RES court:periode,annuel:annee,long:pluriannuel/.test(out), 'migration réelle : anciens objectifs déduits (période, année, pluriannuel), 2 sur 3 changent de niveau');
  }
  // routes
  const rt = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(!rt.includes("'/objectifs/periodes'") && rt.includes("'/objectifs/:id/niveau-temps'"), 'routes : /objectifs/periodes supprimées, niveau-temps ajoutée');
}

// ---- 9. Le rattachement traverse les niveaux de temps : parent de niveau >= enfant ----
{
  const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
  const D1 = newAct('Traversée D1');
  const mkD = (title, extra) => o.creer(u, Object.assign({ title, activityId: D1, startDate: '2026-11-09', endDate: '2027-01-04', noBridge: true }, extra || {}));
  const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
  const plur = mkD('Cap pluriannuel', { endDate: '2031-01-01' }), ann = mkD('Objectif annuel', { endDate: '2027-09-01' }), per = mkD('Objectif de période');
  assert([plur, ann, per].map((x) => x.timeLevel).join() === 'pluriannuel,annee,periode', 'trois niveaux de temps créés');
  assert(o.lier(u, per.id, ann.id, 'apres').parentId === ann.id, 'période -> année : rattachement accepté');
  assert(o.lier(u, ann.id, plur.id, 'apres').parentId === plur.id, 'année -> pluriannuel : rattachement accepté');
  let g = o.get(u, per.id);
  assert(g.parent && g.parent.id === ann.id && g.parent.timeLevel === 'annee' && g.parentLevel === 'annee', 'get() expose le parent complet (id, titre, timeLevel) et parentLevel');
  assert(o.liste(u, 'tous').find((x) => x.id === ann.id).parentLevel === 'pluriannuel', 'liste() expose parentLevel');
  // parent de niveau inférieur refusé (parent ordinaire)
  const per2 = mkD('Autre période'), ann2 = mkD('Autre annuel', { endDate: '2027-09-01' });
  let e = bad(() => o.lier(u, ann2.id, per2.id, 'apres')); assert(e && e.statusCode === 400 && /niveau de temps du parent/.test(e.message), 'lier : parent de niveau inférieur refusé (annuel sous période)');
  e = bad(() => mkD('Création sous période', { timeLevel: 'annee', endDate: '2027-09-01', parentId: per2.id })); assert(e && e.statusCode === 400 && /niveau de temps du parent/.test(e.message), 'creer : parent de niveau inférieur refusé');
  e = bad(() => o.lier(u, plur.id, ann2.id, 'apres')); assert(e && e.statusCode === 400, 'pluriannuel sous annuel refusé');
  // changement de niveau
  const shortAnn = mkD('Parent annuel court', { timeLevel: 'annee' }), shortKid = mkD('Enfant annuel court', { timeLevel: 'annee' });
  o.lier(u, shortKid.id, shortAnn.id, 'apres');
  e = bad(() => o.modifierNiveauTemps(u, shortAnn.id, 'periode')); assert(e && e.statusCode === 400 && /change d’abord/.test(e.message), 'abaisser un parent sous son enfant : refusé (change d’abord le niveau de l’enfant)');
  const pe = mkD('Période à relever', { timeLevel: 'periode', endDate: '2027-01-04' });
  assert(o.lier(u, pe.id, ann2.id, 'apres').parentId === ann2.id, 'période sous annuel');
  e = bad(() => o.modifierNiveauTemps(u, plur.id, 'annee')); assert(e && e.statusCode === 400, 'abaisser un parent pluriannuel : refusé (échéance ou enfant)');
  const per3 = mkD('Période seule', { endDate: '2027-01-04' }), ann3 = mkD('Annuel parent', { endDate: '2027-09-01' });
  o.lier(u, per3.id, ann3.id, 'apres');
  e = bad(() => o.modifierEcheance(u, per3.id, '2027-09-01')); assert(e && /niveau de temps/.test(e.message), 'allonger un enfant : refus tant que son niveau ne change pas');
  o.modifierNiveauTemps(u, per3.id, 'annee'); assert(o.get(u, per3.id).timeLevel === 'annee', 'enfant relevé au niveau de son parent : accepté');
  // relever un enfant au-dessus de son parent
  const lone = mkD('Annuel parent bis', { endDate: '2027-09-01' }), kid = mkD('Enfant période');
  o.lier(u, kid.id, lone.id, 'apres');
  e = bad(() => o.modifierNiveauTemps(u, kid.id, 'pluriannuel')); assert(e && e.statusCode === 400, 'relever un enfant au-dessus de son parent : refusé');
  // proposition de rattachement : candidats de niveau supérieur, jamais inférieur
  const rp = await o.rattachement(u, { title: 'Préparer le cap pluriannuel', activityId: D1, startDate: '2026-11-09', endDate: '2027-01-04' });
  assert(rp.candidate && rp.candidate.id === plur.id, 'rattachement d’un objectif de période : l’objectif de niveau supérieur (pluriannuel) est proposé');
  const rp2 = await o.rattachement(u, { title: 'Objectif annuel de plus', activityId: D1, startDate: '2026-11-09', endDate: '2027-09-01' });
  assert(!rp2.candidate || (o.get(u, rp2.candidate.id).timeLevel !== 'periode'), 'rattachement d’un objectif annuel : jamais un parent de niveau période');
  const rp3 = await o.rattachement(u, { title: 'Cap pluriannuel suite', activityId: D1, startDate: '2026-11-09', endDate: '2031-06-01' });
  assert(!rp3.candidate || o.get(u, rp3.candidate.id).timeLevel === 'pluriannuel', 'rattachement d’un pluriannuel : seulement un parent pluriannuel');
  // parent supprimé : l'enfant est détaché, rien d'autre ne change
  const rm = o.supprimer(u, ann3.id, true);
  assert(rm.ok && o.get(u, per3.id).parentId === null && o.get(u, per3.id).timeLevel === 'annee', 'parent d’un autre niveau supprimé : enfant détaché, niveau conservé');
}

// MARK-FIN
const nRef = (id) => db.prepare('SELECT (SELECT COUNT(*) FROM user_objectives WHERE userId = ?) + (SELECT COUNT(*) FROM objectifs_refus WHERE userId = ?) AS n').get(id, id).n;
assert(nRef(u) > 0, 'avant suppression : objectifs et refus du compte présents');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(u));
assert(nRef(u) === 0, 'suppression de compte : plus aucun objectif ni refus');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
})();
