// Fusion : source unique = les liens directs ; groupe, dominante, absorption, séparation DÉRIVÉS (comportement, pas des chaînes de texte). Usage : node test/objectifs-absorption-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-abso-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* base déjà semée */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const o = require('../server/lib/objectifs'), goals = require('../server/lib/goals'), ab = require('../server/lib/objectifs-absorption');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const u = m.userId, ACT = m.activityId;
o.setTasksCheck(() => false);
const bad = (f) => { try { f(); return null; } catch (e) { return e; } };
const fresh = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); ['Un', 'Deux', 'Trois'].forEach((l) => goals.addCategory(id, l)); return { id, k: goals.categoriesForActivity(id).map((p) => p.key).slice(-3) }; };
const mkx = (a, title, pole, start, end) => o.creer(u, { title, activityId: a, level: 'pole', poleKey: pole, startDate: start, endDate: end, noBridge: true });
const TODAY = require('../server/lib/dates').userToday();
const cat = (id) => db.prepare('SELECT goalCategory FROM sub_projects WHERE id = ?').get(id).goalCategory;
const tache = (act, pole) => { const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, goalCategory, position, createdAt, createdBy) VALUES (?, 'Tâche', ?, 0, '2026-11-01T00:00:00.000Z', ?)").run(act, pole, u).lastInsertRowid); db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, position, createdAt) VALUES (?, 'ouverte', 0, 0, '2026-11-01T00:00:00.000Z')").run(sp); return sp; };

// 1. Fusion à venir : tout se DÉRIVE des liens ; l'absorption n'est effective qu'une fois l'échéance PASSÉE
const F1 = fresh('Fus 1'), [P1, P2] = F1.k, one = mkx(F1.id, 'P1 fusion', P1, '2026-11-09', '2027-01-15'), two = mkx(F1.id, 'P2 fusion', P2, '2026-11-09', '2027-01-20');
const tFutur = tache(F1.id, P2);
const f = o.fusionnerEnMacro(u, { level: 'pole', childIds: [one.id, two.id], title: 'P1 · P2' });
assert(o.get(u, f.id).absorbing.key === P1 && o.get(u, f.id).mergePast === false, 'dominante = le premier choisi ; fusion non passée');
assert(ab.absorbedOf(u, F1.id).length === 0 && ab.survivor(u, 'pole', F1.id, P2, TODAY).key === P2, 'avant l’échéance : aucune absorption (le Chrono et les Réglages gardent les deux branches)');
assert(ab.survivor(u, 'pole', F1.id, P2, '2030-01-01').key === P1, 'échéance passée (date future simulée) : seule la dominante subsiste');
ab.appliquer(u, TODAY); assert(cat(tFutur) === P2, 'avant l’échéance : les tâches ne bougent pas');
assert(db.prepare('SELECT COUNT(*) AS n FROM fusion_absorption WHERE userId = ? AND absorbedActivityId = ?').get(u, F1.id).n === 0, 'aucun état dupliqué écrit à la fusion (plus de fromDate figé)');
// l'autre ordre de sélection : l'autre branche domine
const R1 = fresh('Fus R'), [R1a, R1b] = R1.k, ra = mkx(R1.id, 'Ra', R1a, '2026-11-09', '2027-01-15'), rb = mkx(R1.id, 'Rb', R1b, '2026-11-09', '2027-01-15');
const fr = o.fusionnerEnMacro(u, { level: 'pole', childIds: [rb.id, ra.id], title: 'Rb · Ra' });
assert(o.get(u, fr.id).absorbing.key === R1b, 'sélectionnée en premier = dominante (ordre de sélection, pas ordre des colonnes)');
assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE userId = ? AND isMacro = 0 AND activityId = ?').get(u, R1.id).n === 2 && o.get(u, fr.id).macroColumns.length === 2, 'fusionner ne crée aucun objectif (2 objectifs, 1 lien de 2 colonnes)');

// 2. Colonne ajoutée après coup : absorbée aussi (dérivé) ; retirée : plus absorbée, rien à annuler à la main
const F2 = fresh('Fus 2'), [Q1, Q2, Q3] = F2.k, q1 = mkx(F2.id, 'Q1', Q1, '2026-11-09', '2027-02-15'), q2 = mkx(F2.id, 'Q2', Q2, '2026-11-09', '2027-02-16'), q3 = mkx(F2.id, 'Q3', Q3, '2026-11-09', '2027-02-14');
const fq = o.fusionnerEnMacro(u, { level: 'pole', childIds: [q1.id, q2.id], title: 'Q1 · Q2' });
assert(ab.survivor(u, 'pole', F2.id, Q3, '2030-01-01').key === Q3, 'Q3 pas encore reliée');
o.lier(u, q3.id, fq.id, 'apres');
assert(ab.survivor(u, 'pole', F2.id, Q3, '2030-01-01').key === Q1, 'colonne ajoutée après coup : absorbée par la dominante');
o.lier(u, q3.id, null);
assert(ab.survivor(u, 'pole', F2.id, Q3, '2030-01-01').key === Q3 && ab.survivor(u, 'pole', F2.id, Q2, '2030-01-01').key === Q1, 'colonne retirée : seule elle est libérée, les autres restent absorbées (plus d’annulation globale)');

// 3. Liens indépendants : A-B puis B-C = groupe de trois, VISIBLE (le lien du dessus couvre les trois colonnes)
const F3 = fresh('Fus 3'), [C1, C2, C3] = F3.k;
const ch = (n, a, b, e1, e2) => o.fusionnerEnMacro(u, { level: 'pole', childIds: [mkx(F3.id, n + 'a', a, '2026-11-09', e1).id, mkx(F3.id, n + 'b', b, '2026-11-09', e2).id], title: n });
const mAB = ch('AB', C1, C2, '2027-02-10', '2027-02-11'), mBC = ch('BC', C2, C3, '2027-07-10', '2027-07-11');
const gBC = o.get(u, mBC.id);
assert(gBC.macroColumns.length === 3 && gBC.absorbing.key === C1 && o.get(u, mAB.id).parentId === mBC.id, 'groupe de trois lu par le lien du dessus : 3 colonnes, dominante A ; A-B est un lien indépendant dessous');
assert(ab.survivor(u, 'pole', F3.id, C3, '2040-01-01').key === C1, 'A, B et C ensemble (survivante A)');
assert(o.supprimer(u, mAB.id, true).ok, 'A-B se sépare avant l’échéance même si B-C existe');
assert(ab.survivor(u, 'pole', F3.id, C1, '2040-01-01').key === C1 && ab.survivor(u, 'pole', F3.id, C2, '2040-01-01').key === C2 && ab.survivor(u, 'pole', F3.id, C3, '2040-01-01').key === C2 && o.get(u, mBC.id).macroColumns.length === 2, 'cas « par B » : C n’était lié à A que par B, il est détaché de A ; B-C reste');
assert(o.supprimer(u, mBC.id, true).ok && ab.survivor(u, 'pole', F3.id, C3, '2040-01-01').key === C3, 'séparer B-C : tout est séparé');
// cas « direct » : A liée à B ET à C par deux liens directs ; séparer A-B laisse A-C
const F4 = fresh('Fus 4'), [D1, D2, D3] = F4.k, dA1 = mkx(F4.id, 'dA1', D1, '2026-11-09', '2027-02-10'), dB = mkx(F4.id, 'dB', D2, '2026-11-09', '2027-02-11'), dA2 = mkx(F4.id, 'dA2', D1, '2026-11-09', '2027-07-10'), dC = mkx(F4.id, 'dC', D3, '2026-11-09', '2027-07-11');
const lAB = o.fusionnerEnMacro(u, { level: 'pole', childIds: [dA1.id, dB.id], title: 'A-B' });
o.fusionnerEnMacro(u, { level: 'pole', childIds: [dA2.id, dC.id], title: 'A-C' });
assert(ab.survivor(u, 'pole', F4.id, D2, '2040-01-01').key === D1 && ab.survivor(u, 'pole', F4.id, D3, '2040-01-01').key === D1, 'A liée directement à B et à C : A absorbe les deux');
o.supprimer(u, lAB.id, true);
assert(ab.survivor(u, 'pole', F4.id, D2, '2040-01-01').key === D2 && ab.survivor(u, 'pole', F4.id, D3, '2040-01-01').key === D1, 'cas « direct » : séparer A-B laisse A-C');

// 4. Échéance PASSÉE : absorption effective, tâches vers la survivante, séparation impossible (aucune action)
const F5 = fresh('Fus 5'), [V1, V2] = F5.k, old1 = mkx(F5.id, 'Old1', V1, '2024-01-10', '2024-02-10'), old2 = mkx(F5.id, 'Old2', V2, '2024-01-10', '2024-02-11');
const tPasse = tache(F5.id, V2);
const fv = o.fusionnerEnMacro(u, { level: 'pole', childIds: [old1.id, old2.id], title: 'Passée' });
assert(o.get(u, fv.id).mergePast === true && ab.absorbedOf(u, F5.id).length === 1 && ab.absorbedOf(u, F5.id)[0].key === V2 && ab.absorbedOf(u, F5.id)[0].absorbedInto === V1, 'échéance passée : V2 absorbée (le Chrono et les Réglages ne montrent plus que V1)');
ab.appliquer(u, TODAY); assert(cat(tPasse) === V1, 'échéance passée : les tâches ouvertes passent à la dominante');
const neuf = mkx(F5.id, 'Neuf', V2, '2024-03-01', '2024-03-02');
const e1 = bad(() => o.lier(u, old2.id, null)), e2 = bad(() => o.supprimer(u, fv.id, true)), e3 = bad(() => o.setMacro(u, fv.id, false)), e4 = bad(() => o.lier(u, neuf.id, fv.id, 'apres'));
assert([e1, e2, e3, e4].every((x) => x && /passée/.test(x.message)) && o.get(u, old2.id).parentId === fv.id, 'après l’échéance : délier, séparer, défaire et rejoindre sont refusés, rien ne bouge');

// Registre de tâches d'une fusion qui n'est plus effective (données existantes) : les tâches reviennent
const F6 = fresh('Fus 6'), [W1, W2] = F6.k, w1 = mkx(F6.id, 'W1', W1, '2026-11-09', '2027-02-15'), w2 = mkx(F6.id, 'W2', W2, '2026-11-09', '2027-02-16');
const tW = tache(F6.id, W2), fw = o.fusionnerEnMacro(u, { level: 'pole', childIds: [w1.id, w2.id], title: 'W' });
db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(W1, tW);
db.prepare("INSERT INTO fusion_absorption (userId, level, absorbingActivityId, absorbingPoleKey, absorbingKey, absorbedActivityId, absorbedPoleKey, absorbedKey, fromDate, macroId, createdAt, movedJson) VALUES (?, 'pole', ?, ?, ?, ?, ?, ?, '2026-11-05', ?, '2026-11-18T00:00:00.000Z', ?)").run(u, F6.id, W1, W1, F6.id, W2, W2, fw.id, JSON.stringify([{ id: tW, from: W2 }]));
ab.appliquer(u, TODAY);
assert(cat(tW) === W2, 'ancienne absorption (fromDate figé) d’une fusion non passée : les tâches reviennent, le registre est marqué annulé (jamais supprimé)');
assert(db.prepare('SELECT COUNT(*) AS n FROM fusion_absorption WHERE absorbedActivityId = ? AND cancelledAt IS NOT NULL').get(F6.id).n === 1, 'registre conservé');

// 5. Conflit refusé AVANT d'écrire (appel de contrôle sans écriture, utilisé par l'écran à chaque case cochée)
const F7 = fresh('Fus 7'), F8 = fresh('Fus 8'), x1 = mkx(F7.id, 'X1', F7.k[0], '2026-11-09', '2027-01-15'), y1 = mkx(F8.id, 'Y1', F8.k[0], '2026-11-09', '2027-01-20');
mkx(F7.id, 'X-2028', F7.k[0], '2028-01-10', '2028-12-01'); mkx(F8.id, 'Y-2028', F8.k[0], '2028-02-10', '2028-11-15');
const countAll = () => db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE userId = ?').get(u).n, avant = countAll();
const ec = bad(() => o.fusionnerEnMacro(u, { level: 'pole', childIds: [x1.id, y1.id], dryRun: true }));
assert(ec && /Vous devez déplacer/.test(ec.message) && /« X-2028 »/.test(ec.message) && /« Y-2028 »/.test(ec.message), 'contrôle sans écriture : « Vous devez déplacer « X » et « Y » » : ' + (ec && ec.message));
assert(countAll() === avant, 'le contrôle n’écrit rien');
const z1 = mkx(F7.id, 'Z1', F7.k[1], '2026-11-09', '2027-01-15'), z2 = mkx(F8.id, 'Z2', F8.k[1], '2026-11-09', '2027-01-16'), avant2 = countAll();
const ok = o.fusionnerEnMacro(u, { level: 'pole', childIds: [z1.id, z2.id], dryRun: true });
assert(ok && ok.ok === true && countAll() === avant2, 'sans conflit : le contrôle répond ok sans créer de lien');
// Couleur attribuée à la PLACE : fusionner le pôle 1 et le pôle 3 les rend voisins (1, 3, 2) ; le rang de nuance de l’arbre suit la place, pas le pôle
const F9 = fresh('Fus 9'), [S1, S2, S3] = F9.k, s1 = mkx(F9.id, 'S1', S1, '2026-11-09', '2027-01-15'), s3 = mkx(F9.id, 'S3', S3, '2026-11-09', '2027-01-16');
const rk = () => { const a = o.structure(u).activities.find((x) => x.id === F9.id); return Object.fromEntries(a.poles.map((p) => [p.key, p.shadeRank])); };
const avantRk = rk(); o.fusionnerEnMacro(u, { level: 'pole', childIds: [s1.id, s3.id], title: 'S1 · S3' });
const apresRk = rk();
assert(avantRk[S3] === 2 && apresRk[S3] === 1 && apresRk[S2] === 2 && apresRk[S1] === 0, 'le rang (donc la couleur) suit la place : ' + JSON.stringify(apresRk));
// Niveau activité : jamais d'absorption (pas de remontée en catégorie)
assert(ab.paires(u, '2040-01-01', true).every((p) => p.level !== 'activite'), 'niveau activité : jamais d’absorption');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
