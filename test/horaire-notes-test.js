// Module « Horaire » : notes d'un employé = pastilles ; la liste propose les six formules exactes (seules lues par la génération) puis
// les notes du compte (créées par « + Ajouter une note », réutilisables pour tous, jamais appliquées, rappelées dans « À vérifier »).
// Teste les fonctions de l'écran (public/js/horaire.js), la lecture de la génération (server/lib/horaire-note.js) et la liste du
// compte (server/lib/horaire.js). Données FICTIVES. Usage : node test/horaire-notes-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-notes-');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseNote, RULES } = require('../server/lib/horaire-note');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

// Fonctions de l'écran, extraites telles quelles (de « var NOTE_RULES » à la cellule Note, qui touche au DOM).
const src = fs.readFileSync(path.join(__dirname, '../public/js/horaire.js'), 'utf8');
const a = src.indexOf('  var NOTE_RULES'), b = src.indexOf('  // Cellule Note d\'un employé');
assert(a > 0 && b > a, 'fonctions de la note trouvées dans public/js/horaire.js');
const ctx = {};
vm.runInNewContext(src.slice(a, b) + '\nthis.f = { noteParts, noteAdd, noteRemove, noteRest, NOTE_LABELS };', ctx);
const { noteParts, noteAdd, noteRemove, noteRest, NOTE_LABELS } = ctx.f;

assert(NOTE_LABELS.join('|') === RULES.map((r) => r[1]).join('|'), 'formules de l’écran = RULES du serveur (même texte, même ordre)');

// Ajout et retrait par clic : forme exacte, « ; », jamais en double.
let n = noteAdd('', 'Jamais de double');
n = noteAdd(n, 'Repos après un quart');
assert(n === 'Jamais de double; Repos après un quart', 'clic sur deux règles : « Jamais de double; Repos après un quart »');
assert(noteAdd(n, 'jamais de DOUBLE') === n, 'règle déjà là : pas ajoutée deux fois');
const p1 = parseNote(n);
assert(p1.rules.has('noDouble') && p1.rules.has('restAfterShift') && p1.rest === '', 'la génération applique les deux règles');
assert(noteRemove(n, 0) === 'Repos après un quart', 'clic sur la pastille « Jamais de double » : retirée');
assert(noteRemove('Repos après un quart', 0) === '', 'dernière pastille retirée : note vide');

// Note existante écrite autrement : formule rendue sous sa forme exacte, texte libre gardé tel quel (rien de perdu).
const old = 'JAMAIS DE DOUBLE. ; Arrive en vélo ; Pas de matin sauf samedi';
assert(noteParts(old).join('|') === 'Jamais de double|Arrive en vélo|Pas de matin sauf samedi', 'note existante : trois pastilles, texte libre intact');

// Notes du compte : créées une fois, réutilisables pour un autre employé, jamais appliquées, dans « À vérifier ».
const db = require('../server/db');
const h = require('../server/lib/horaire');
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uN', 'uN', ?, 'entreprise')").run(new Date().toISOString());
const c1 = h.createNote('uN', 'Préfère la terrasse');
assert(c1 && c1.id && h.listNotes('uN').length === 1, 'nouvelle note ajoutée à la liste du compte');
assert(h.createNote('uN', '  préfère   la TERRASSE. ').id === c1.id && h.listNotes('uN').length === 1, 'même note (casse, espaces, point) : pas de doublon');
assert(h.createNote('uN', "soirs d'abord").text === 'Soirs d’abord' && h.listNotes('uN').length === 1, 'texte égal à une formule : la formule est utilisée, pas de note créée');
assert(h.createNote('uN', 'Pas le lundi; ni le mardi').text === 'Pas le lundi, ni le mardi', '« ; » remplacé (il sépare les notes)');
const e1 = h.createEmployee('uN', { name: 'Alex Fictif' }), e2 = h.createEmployee('uN', { name: 'Brook Fictif' });
h.updateEmployee('uN', e1.id, { constraintNote: noteAdd('', c1.text) });
h.updateEmployee('uN', e2.id, { constraintNote: noteAdd(noteAdd('', 'Pas de soir'), c1.text) });
const n2 = h.listEmployees('uN').find((x) => x.id === e2.id).constraintNote;
assert(h.listEmployees('uN').find((x) => x.id === e1.id).constraintNote === 'Préfère la terrasse' && n2 === 'Pas de soir; Préfère la terrasse', 'note du compte réutilisée par un autre employé');
const p2 = parseNote(n2);
assert(p2.rules.size === 1 && p2.rules.has('noEvening') && p2.rest === 'Préfère la terrasse', 'note du compte : jamais appliquée par la génération');
assert(noteRest(n2) === 'Préfère la terrasse', '« À vérifier » : la note du compte est rappelée (avec l’employé et la semaine à l’écran)');
// Phrase qui contient une formule : jamais appliquée (règles exactes seulement), rappelée dans « À vérifier ».
assert(parseNote('Pas de matin sauf samedi').rules.size === 0 && noteRest('Pas de matin sauf samedi') === 'Pas de matin sauf samedi', '« Pas de matin sauf samedi » : non appliqué, dans « À vérifier »');

// Export et suppression du compte.
const out = require('../server/lib/dataexport').buildUserExport('uN');
assert(out.horaire.notes.length === 2 && out.horaire.notes[0].text === 'Préfère la terrasse', 'export du compte : notes du compte');
// Supprimer une note du compte : quitte la liste et les employés qui l'utilisent ; les six règles et le reste des notes intacts ;
// un autre compte n'est pas touché (404).
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uO', 'uO', ?, 'entreprise')").run(new Date().toISOString());
const other = h.createNote('uO', 'Préfère la terrasse');
const eo = h.createEmployee('uO', { name: 'Autre Fictif', constraintNote: 'Préfère la terrasse' });
const e3 = h.createEmployee('uN', { name: 'Charlie Fictif', constraintNote: 'Jamais de double ; préfère la TERRASSE. ; Arrive en vélo' });
assert(h.deleteNote('uN', other.id) === null && h.listNotes('uO').length === 1, 'note d’un autre compte : refusée (404), rien supprimé');
const del = h.deleteNote('uN', c1.id);
const noteOf = (u, id) => h.listEmployees(u).find((x) => x.id === id).constraintNote;
assert(del && del.removedFrom === 3 && !h.listNotes('uN').some((x) => x.id === c1.id), 'note supprimée de la liste, retirée chez 3 employés');
assert(noteOf('uN', e1.id) === null && noteOf('uN', e2.id) === 'Pas de soir' && noteOf('uN', e3.id) === 'Jamais de double; Arrive en vélo', 'chez les employés : seule la note supprimée part, le reste intact');
const pr = parseNote(noteOf('uN', e3.id));
assert(pr.rules.has('noDouble') && pr.rest === 'Arrive en vélo', 'six règles intactes (« Jamais de double » toujours appliquée)');
assert(h.listNotes('uO').length === 1 && noteOf('uO', eo.id) === 'Préfère la terrasse', 'autre compte : sa note et ses employés intacts');
assert(h.deleteNote('uN', c1.id) === null, 'note déjà supprimée : 404');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uO'").get());
require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uN'").get());
assert(!db.prepare("SELECT 1 FROM horaire_notes WHERE userId = 'uN'").get(), 'suppression du compte : notes du compte parties');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
process.exit(failed ? 1 : 0);
