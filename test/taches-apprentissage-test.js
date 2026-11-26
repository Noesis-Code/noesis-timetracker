// Apprentissage du rangement : journal personnel, motifs génériques anonymes (seuil de 5 personnes, 90 %), consentement, délais réels. Usage : node test/taches-apprentissage-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-apprentissage-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), A = require('../server/lib/taches-apprentissage');
const user = (id) => db.prepare("INSERT OR IGNORE INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
// ---- motif générique ----
assert(A.motifOf('Appeler Paul') === 'appeler', 'motif : le nom propre saute (« Appeler Paul » -> appeler)');
assert(A.motifOf('Appeler quelqu\'un') === 'appeler quelqu un', 'motif : « appeler quelqu un »');
assert(A.motifOf('Payer la facture 1234') === 'payer facture', 'motif : le chiffre saute, l\'article aussi');
assert(A.motifOf('Écrire à jean@exemple.com') === null && A.motifOf('Voir https://x.y') === null, 'motif : jamais d\'adresse ni de lien');
assert(A.motifOf('') === null && A.motifOf(null) === null, 'motif : vide = null');
assert(A.motifOf('Acheter le pain et le fromage artisanal') === 'acheter pain', 'motif : deux mots courants au plus');
// ---- journal personnel ----
user('u1');
assert(A.recordCorrection('u1', 7, 'Appeler Paul', 'category', 'c1', 'c2') === true, 'une correction de catégorie est enregistrée');
assert(A.recordCorrection('u1', 7, 'Appeler Paul', 'category', 'c2', 'c2') === false, 'une « correction » sans changement est ignorée');
assert(A.recordCorrection('u1', 7, 'Courir 5 km', 'objective', null, 'Courir un 21 km') && A.recordCorrection('u1', 7, 'Courir 5 km', 'rank', '3', '1') && A.recordCorrection('u1', 7, 'Acheter carottes', 'group', null, 'Faire les courses'), 'objectif, rang et regroupement sont aussi enregistrés');
assert(A.recordCorrection('u1', 7, 'x', 'inconnu', 'a', 'b') === false, 'un champ inconnu est refusé');
const ex = A.recentExamples('u1', 7, 'category');
assert(ex.length === 1 && ex[0].label === 'Appeler Paul' && ex[0].value === 'c2', 'les exemples réinjectés viennent du journal de la personne');
assert(A.recentExamples('u2', 7, 'category').length === 0, 'jamais les exemples d\'une autre personne');
assert(A.lastChoiceFor('u1', 7, 'appeler paul', 'category') === 'c2', 'même titre : même place, sans appel IA (insensible à la casse)');
// ---- consentement et motifs globaux ----
assert(A.hasConsent('u1') === false && db.prepare('SELECT COUNT(*) AS n FROM rangement_motifs').get().n === 0, 'sans consentement, aucune ligne globale');
for (let i = 1; i <= 4; i++) { const id = 'g' + i; user(id); A.setConsent(id, true, 'test'); A.recordCorrection(id, 100 + i, 'Appeler Jean', 'category', null, 'famille'); }
assert(A.globalSuggestion('Appeler Marc', 'category') === null, 'seuil : 4 personnes ne suffisent pas');
user('g5'); A.setConsent('g5', true, 'test'); A.recordCorrection('g5', 105, 'Appeler Jean', 'category', null, 'famille');
const s5 = A.globalSuggestion('Appeler Marc', 'category');
assert(s5 && s5.value === 'famille' && s5.users === 5 && s5.share === 1, 'seuil atteint : 5 personnes, 100 % -> « famille » pour un titre vague');
user('g6'); A.setConsent('g6', true, 'test'); A.recordCorrection('g6', 106, 'Appeler Jean', 'category', null, 'travail');
assert(A.globalSuggestion('Appeler Marc', 'category') === null, 'convergence : 5 sur 6 = 83 % < 90 % : pas de suggestion');
A.setConsent('g6', false, 'test');
assert(A.globalSuggestion('Appeler Marc', 'category') && A.globalSuggestion('Appeler Marc', 'category').users === 5, 'retrait du consentement : sa contribution sort de l\'agrégat');
assert(db.prepare('SELECT COUNT(*) AS n FROM rangement_motifs WHERE userKey = ?').get('g1').n === 0, 'aucun identifiant brut dans l\'agrégat (empreinte salée seulement)');
const brut = db.prepare("SELECT COUNT(*) AS n FROM rangement_motifs WHERE motif LIKE '%jean%' OR userKey LIKE 'g%'").get().n;
assert(brut === 0, 'aucun nom propre ni identifiant en clair dans les motifs');
// ---- délais réels ----
user('p1'); A.recordPalierDelay('p1', 'course', 5, 10, 6); A.recordPalierDelay('p1', 'course', 5, 10, 8);
assert(A.personalDelay('p1', 'course', 5, 10).semaines === 7 && A.personalDelay('p1', 'course', 5, 10).source === 'personnel', 'délai personnel : médiane de ses écarts réels (6 et 8 -> 7)');
assert(A.personalDelay('p2', 'course', 5, 10) === null, 'sans donnée : null (le tableau général s\'applique)');
for (let i = 1; i <= 5; i++) { user('q' + i); A.setConsent('q' + i, true, 'test'); A.recordPalierDelay('q' + i, 'course', 5, 10, 4 + i); }
const gd = A.personalDelay('p9', 'course', 5, 10);
assert(gd && gd.source === 'global' && gd.n === 5 && gd.semaines === 7, 'délai global : médiane de 5 personnes (5..9 -> 7)');
assert(A.recordPalierDelay('p1', 'course', 5, 10, -3) === false && A.recordPalierDelay('p1', 'course', 5, 10, 9999) === false, 'délais absurdes refusés');
A.resetForUser('u1');
assert(A.recentExamples('u1', 7, 'category').length === 0, 'remise à zéro : le journal de la personne est vidé');
process.exit(failed ? 1 : 0);
