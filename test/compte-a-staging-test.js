// Compte A (staging) : créé une seule fois, structure et temps Chrono attendus, absent en production. Usage : node test/compte-a-staging-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-comptea-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
const db = require('../server/db');
const seed = require('../server/lib/seed-staging');
const auth = require('../server/lib/auth');
const goals = require('../server/lib/goals');
require('../server/lib/objectifs'); // crée la table des objectifs
const MDP = 'Factice-test#' + Date.now(), MDP2 = MDP + 'bis'; // valeurs factices, propres au test
process.env.COMPTE_A_PASSWORD = MDP;
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const A = seed.COMPTE_A_SEED_ACCOUNT;
const nbA = () => db.prepare('SELECT COUNT(*) AS n FROM users WHERE name = ? AND lastName = ?').get(A.name, A.lastName).n;

assert(seed.seedCompteAOnStaging(db) === null && nbA() === 0, 'production : aucun compte créé');
delete process.env.RAILWAY_ENVIRONMENT_NAME;
assert(seed.seedCompteAOnStaging(db) === null && nbA() === 0, 'variable absente (local) : aucun compte créé');

process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin) VALUES ('autre', 'Autre', 'Profil', '', '', '#000', ?, '')").run(new Date().toISOString()); // table users déjà peuplée
const r1 = seed.seedCompteAOnStaging(db);
assert(r1 && r1.created && nbA() === 1, 'staging (base déjà peuplée) : compte créé');
const u = db.prepare('SELECT id FROM users WHERE name = ? AND lastName = ?').get(A.name, A.lastName);
const acts = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ?').all(u.id);
assert(acts.length === 1, '1 activité');
const cats = goals.categoriesForActivity(acts[0].id);
const poles = cats.filter((c) => !c.parentKey);
assert(poles.length === 2, '2 pôles : ' + poles.map((p) => p.label).join(', '));
const secteurs = poles.map((p) => goals.secteursForPole(acts[0].id, p.key));
assert(secteurs.every((s) => s.length === 1) && secteurs.flat().length === 2, '1 secteur par pôle : ' + secteurs.flat().map((s) => s.label).join(', '));
assert(secteurs.flat().every((s) => !s.color), 'secteurs sans couleur');
const rows = db.prepare('SELECT goalCategory, isoDate, durationSeconds FROM time_entries WHERE userId = ?').all(u.id);
assert(rows.length >= 12 && new Set(rows.map((x) => x.goalCategory)).size === 1, 'temps Chrono sur un seul secteur (' + rows.length + ' séances)');
assert(rows[0].goalCategory === secteurs[0][0].key, 'ce secteur est « Endurance »');
const monday = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return Math.round(d.getTime() / 604800000); };
const weeks = [...new Set(rows.map((x) => monday(x.isoDate)))].sort((a, b) => a - b);
let run = 1, best = 1; for (let i = 1; i < weeks.length; i++) { run = weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
assert(best >= 4, 'au moins 4 semaines consécutives (' + best + ')');
assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives WHERE userId = ?').get(u.id).n === 0, 'aucun objectif');
const row = () => db.prepare('SELECT id, pin, passwordStrong FROM users WHERE name = ? AND lastName = ?').get(A.name, A.lastName);
assert(row().passwordStrong === 1 && auth.checkPin(row(), MDP) === 'ok' && auth.checkPin(row(), 'mauvais') === 'bad', 'connexion simulée (checkPin) : bon mot de passe accepté, mauvais refusé');
db.prepare('UPDATE users SET pin = ?, pinFailCount = 5, pinLockedUntil = ? WHERE id = ?').run(auth.makePinRecord('ancien!Mdp1'), new Date(Date.now() + 3600000).toISOString(), u.id);
const r3 = seed.seedCompteAOnStaging(db);
assert(r3 && r3.passwordUpdated && auth.checkPin(row(), MDP) === 'ok', 'ancien hachage remplacé : le nouveau mot de passe fonctionne, compte déverrouillé');
process.env.COMPTE_A_PASSWORD = MDP2;
const r4 = seed.seedCompteAOnStaging(db);
assert(r4 && r4.passwordUpdated && auth.checkPin(row(), MDP2) === 'ok' && auth.checkPin(row(), MDP) === 'bad', 'variable changée : hachage mis à jour');
process.env.COMPTE_A_PASSWORD = '';
const h0 = row().pin; seed.seedCompteAOnStaging(db);
assert(row().pin === h0, 'variable retirée : compte existant intact');
process.env.COMPTE_A_PASSWORD = MDP2;
const hashAvant = row().pin; seed.seedCompteAOnStaging(db);
assert(row().pin === hashAvant, 'bon mot de passe déjà en place : hachage intact');
const entriesBefore = rows.length;
const r2 = seed.seedCompteAOnStaging(db);
assert(r2 && r2.created === false && nbA() === 1 && db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE userId = ?').get(u.id).n === entriesBefore, 'relancé : rien recréé ni écrasé');
console.log(failed ? failed + ' ECHEC(S)' : 'OK');
process.exit(failed ? 1 : 0);
