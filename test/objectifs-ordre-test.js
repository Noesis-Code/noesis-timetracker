// Ordre des colonnes (mode Étendre) : ordre de base mémorisé, ordre de présentation dérivé des macros (réversible), colonne déjà reliée, chaînage. Usage : node test/objectifs-ordre-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ordre-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const ord = require('../server/lib/objectifs-ordre');
const { buildUserExport } = require('../server/lib/dataexport');
const u = 'ord-u', v = 'ord-v';
for (const id of [u, v]) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
const newAct = (name, uid) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, uid || u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, uid || u); return id; };
const [A, B, C, D] = ['Ordre A', 'Ordre B', 'Ordre C', 'Ordre D'].map((n) => newAct(n)), V1 = newAct('Ordre V', v);
const mk = (title, aid, extra) => o.creer(u, Object.assign({ title, activityId: aid, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));
const bad = (fn) => { try { fn(); return null; } catch (x) { return x; } };
const S = (...ids) => ids.map(String);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rowsOrdre = () => db.prepare('SELECT COUNT(*) AS n FROM objectifs_ordre WHERE userId = ?').get(u).n;

(async () => {
  // ordre de base
  assert(eq(ord.lire(u, 'activite', '').base, S(A, B, C, D)) && eq(ord.lire(u, 'activite', '').order, S(A, B, C, D)), 'ordre de base par défaut : ordre existant des activités');
  assert(eq(ord.ecrire(u, { level: 'activite', scope: '', order: S(C, A) }).base, S(C, A, B, D)), 'PUT : ordre de base mémorisé ; colonnes absentes de la liste en fin, dans l’ordre existant');
  let e = bad(() => ord.ecrire(u, { level: 'activite', scope: '', order: S(A, V1) })); assert(e && e.statusCode === 404, 'PUT : une colonne qui n’appartient pas à l’utilisateur est refusée');
  e = bad(() => ord.ecrire(u, { level: 'pole', scope: String(V1), order: [] })); assert(e && e.statusCode === 404, 'PUT : périmètre d’une autre personne refusé');
  e = bad(() => ord.lire(u, 'ciel', '')); assert(e && e.statusCode === 400, 'niveau invalide : 400');
  ord.ecrire(u, { level: 'activite', scope: '', order: S(A, B, C, D) }); // retour à l'ordre d'origine
  const written = rowsOrdre();
  // macro reliant des colonnes non voisines : A et C ; ordre de présentation dérivé, ancre = colonne touchée
  const a1 = mk('Objectif A1', A), c1 = mk('Objectif C1', C);
  const fus = o.fusionnerEnMacro(u, { title: 'Macro A+C', childIds: [a1.id, c1.id], anchor: String(C) });
  assert(eq(fus.order, S(B, A, C, D)), 'fusion : colonnes reliées voisines, ancre C (ordre dérivé renvoyé) : ' + JSON.stringify(fus.order));
  assert(eq(ord.lire(u, 'activite', '').order, S(A, C, B, D)), 'sans ancre : le groupe se rassemble à la première colonne du groupe');
  assert(eq(ord.lire(u, 'activite', '', String(C)).order, S(B, A, C, D)), 'ancre C : le groupe prend la place de C, l’ordre relatif des autres est conservé');
  assert(eq(ord.lire(u, 'activite', '').base, S(A, B, C, D)) && rowsOrdre() === written, 'aucune écriture de l’ordre : l’ordre de base reste intact');
  // délier : l'ordre d'origine revient (réversible)
  o.lier(u, c1.id, null);
  const lone = o.get(u, fus.id);
  assert(eq(ord.lire(u, 'activite', '').order, S(A, B, C, D)), 'délier : les colonnes retrouvent leur ordre d’origine');
  // refusionner dans un autre ordre (C avec D, puis A avec D impossible tant que D relié)
  const d1 = mk('Objectif D1', D);
  const f2 = o.fusionnerEnMacro(u, { title: 'Macro C+D', childIds: [c1.id, d1.id], anchor: String(D) });
  assert(eq(f2.order, S(A, B, C, D)), 'refusion : C et D déjà voisines, ordre inchangé');
  assert(eq(ord.lire(u, 'activite', '').order, S(A, B, C, D)), 'ordre de présentation recalculé à chaque lecture');
  // colonne déjà reliée à un macro : refus
  const b1 = mk('Objectif B1', B), b2 = mk('Objectif B2', B), c2 = mk('Objectif C2', C), d2 = mk('Objectif D2', D);
  e = bad(() => o.fusionnerEnMacro(u, { title: 'Autre macro', childIds: [b1.id, c2.id] })); assert(e && e.statusCode === 400 && /Délie d’abord ce macro/.test(e.message), 'fusion : une colonne déjà reliée à un macro ne peut pas rejoindre un autre macro séparé');
  assert(db.prepare("SELECT COUNT(*) AS n FROM user_objectives WHERE title = 'Autre macro'").get().n === 0, 'refus avant toute création');
  const m3 = o.creer(u, { title: 'Macro B+?', activityId: B, startDate: '2026-11-09', endDate: '2027-03-01', isMacro: true, noBridge: true });
  e = bad(() => o.lier(u, d2.id, m3.id, 'apres')); assert(e && /Délie d’abord ce macro/.test(e.message), 'lier : colonne D déjà reliée à un autre macro : refus');
  e = bad(() => mk('Enfant refusé', D, { parentId: m3.id })); assert(e && /Délie d’abord ce macro/.test(e.message), 'creer : nouvel enfant dans une colonne déjà reliée à un autre macro : refus');
  assert(o.lier(u, b1.id, m3.id, 'apres').parentId === m3.id && mk('Enfant B bis', B, { parentId: m3.id }).parentId === m3.id, 'colonne libre : rattachement accepté, et la même colonne dans le même macro aussi');
  // délier le macro C+D (supprimer sans cascade) libère les colonnes
  o.supprimer(u, f2.id, true);
  assert(o.lier(u, d2.id, m3.id, 'apres').parentId === m3.id, 'après avoir délié (macro supprimé), la colonne D peut être reliée à un autre macro');
  // chaînage : le groupe entier entre
  const m4 = o.get(u, fus.id), x = mk('Objectif A2', A); // le macro A+C est resté relié à la colonne A (a1) ; x : un autre objectif de la colonne A, libre
  const chained = o.lier(u, m3.id, m4.id, 'apres');
  assert(chained.parentId === m4.id, 'chaînage : un macro entre sous un autre macro');
  const g4 = o.get(u, m4.id);
  assert(g4.macroColumns.length === 3 && [A, B, D].every((k) => g4.macroColumns.some((c) => c.activityId === k)), 'chaînage : le groupe entier entre (colonnes du macro enfant comprises)');
  assert(eq(ord.lire(u, 'activite', '').order, S(A, B, D, C)), 'ordre dérivé : le groupe chaîné (A, B, D) est voisin, C reste à sa place relative');
  assert(eq(ord.lire(u, 'activite', '').order.slice(0, 3).sort(), S(A, B, D).sort()), 'les trois colonnes du groupe chaîné se suivent');
  // la colonne du groupe ne peut pas être reliée à un macro séparé
  const m5 = o.creer(u, { title: 'Macro séparé', activityId: C, startDate: '2026-11-09', endDate: '2027-03-01', isMacro: true, noBridge: true });
  e = bad(() => o.lier(u, x.id, m5.id, 'apres')); assert(e && /Délie d’abord ce macro/.test(e.message), 'une colonne du groupe chaîné ne rejoint pas un macro séparé');
  // niveau pôle : ordre des pôles d'une activité
  const goalsLib = require('../server/lib/goals'); goalsLib.addCategory(B, 'Pôle un'); goalsLib.addCategory(B, 'Pôle deux'); goalsLib.addCategory(B, 'Pôle trois');
  const poles = goalsLib.categoriesForActivity(B).map((p) => p.key);
  const pm = mk('Macro de pôles', B, { isMacro: true, level: 'pole' });
  const q1 = mk('Objectif pôle 1', B, { level: 'pole', poleKey: poles[0], parentId: pm.id }), q3 = mk('Objectif pôle 3', B, { level: 'pole', poleKey: poles[2], parentId: pm.id });
  assert(q1.parentId === pm.id && q3.parentId === pm.id, 'macro de pôles créé');
  const po = ord.lire(u, 'pole', String(B), poles[2]);
  assert(eq(po.base, poles) && eq(po.order, [poles[1], poles[0], poles[2]]), 'pôles : ancre sur le 3e pôle, le 1er le rejoint : ' + JSON.stringify(po.order));
  // export
  const ex = buildUserExport(u);
  assert(Array.isArray(ex.objectiveColumnOrder) && ex.objectiveColumnOrder.some((r) => r.level === 'activite' && eq(r.order, S(A, B, C, D))), 'export : ordre de base des colonnes');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
