// Module « Horaire » : note d'un employé = cases des six formules exactes (lues par la génération) + texte libre (jamais appliqué,
// rappelé dans « À vérifier »). Teste les fonctions de l'écran (public/js/horaire.js) avec la lecture du serveur
// (server/lib/horaire-note.js). Données FICTIVES. Usage : node test/horaire-notes-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseNote, RULES } = require('../server/lib/horaire-note');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

// Fonctions de l'écran, extraites telles quelles (de « var NOTE_RULES » à « function openNoteMenu »).
const src = fs.readFileSync(path.join(__dirname, '../public/js/horaire.js'), 'utf8');
const a = src.indexOf('  var NOTE_RULES'), b = src.indexOf('  function openNoteMenu');
assert(a > 0 && b > a, 'fonctions de la note trouvées dans public/js/horaire.js');
const ctx = {};
vm.runInNewContext(src.slice(a, b) + '\nthis.noteChecked = noteChecked; this.noteJoin = noteJoin; this.noteRest = noteRest; this.NOTE_LABELS = NOTE_LABELS;', ctx);
const { noteChecked, noteJoin, noteRest, NOTE_LABELS } = ctx;

// Les formules de l'écran sont exactement celles du serveur.
assert(NOTE_LABELS.join('|') === RULES.map((r) => r[1]).join('|'), 'formules de l’écran = RULES du serveur (même texte, même ordre)');

// Cocher / décocher écrit la formule exacte, lue par la génération.
const none = [false, false, false, false, false, false];
const two = none.slice(); two[0] = true; two[1] = true;
const n1 = noteJoin(two, '');
assert(n1 === 'Jamais de double; Repos après un quart', 'cocher deux règles : « Jamais de double; Repos après un quart »');
const p1 = parseNote(n1);
assert(p1.rules.has('noDouble') && p1.rules.has('restAfterShift') && p1.rules.size === 2 && p1.rest === '', 'la génération lit les deux règles, aucun reste');
const one = none.slice(); one[1] = true;
assert(noteJoin(one, '') === 'Repos après un quart', 'décocher « Jamais de double » : il ne reste que « Repos après un quart »');
assert(noteJoin(none, '') === '', 'tout décoché : note vide');
const all = none.map(() => true);
const pAll = parseNote(noteJoin(all, ''));
assert(pAll.rules.size === 6 && pAll.rest === '', 'les six cases cochées : six règles lues par la génération');

// Note libre : ajoutée après les règles, jamais appliquée, rappelée dans « À vérifier » (noteRest).
const n2 = noteJoin(two, 'Préfère la terrasse le samedi');
assert(n2 === 'Jamais de double; Repos après un quart; Préfère la terrasse le samedi', 'note libre ajoutée après les règles');
const p2 = parseNote(n2);
assert(p2.rules.size === 2 && p2.rest === 'Préfère la terrasse le samedi', 'note libre : jamais une règle pour la génération');
assert(noteRest(n2) === 'Préfère la terrasse le samedi', '« À vérifier » : seule la note libre est rappelée');
assert(noteJoin(none, 'x'.repeat(500)).length === 500, 'note libre de 500 caractères gardée entière');

// Texte importé (ou écrit par l'IA) : formule exacte cochée (casse, accents, point final ignorés) ; texte inconnu conservé.
const imported = 'JAMAIS DE DOUBLE. ; pas de soir\nSoirs d\'abord; Arrive en vélo';
const c = noteChecked(imported);
assert(c[0] && c[3] && c[4] && !c[1] && !c[2] && !c[5], 'import : « JAMAIS DE DOUBLE. », « pas de soir », « Soirs d\'abord » cochées');
assert(noteRest(imported) === 'Arrive en vélo', 'import : texte inconnu conservé comme note libre');
const unknown = 'Pas de soir le lundi seulement';
assert(noteChecked(unknown).every((x) => !x) && noteRest(unknown) === unknown, 'phrase non reconnue : aucune case cochée, texte gardé tel quel');
// Réécrite seulement si l'utilisateur agit : rien coché, même texte libre -> même note.
assert(noteJoin(noteChecked(unknown), noteRest(unknown)) === unknown, 'sans action de l’utilisateur, la note ne change pas');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
process.exit(failed ? 1 : 0);
