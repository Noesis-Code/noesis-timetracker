// Horaire, étape 1 : import direct du rapport Dayforce des disponibilités et congés (server/lib/horaire-dispo-import.js), sans IA.
// Format liste, format grille, xlsx, AM/PM, « Nom, Prénom », vacances, congé sur plusieurs jours, lignes non comprises comptées.
// Données entièrement FICTIVES. Usage : node test/horaire-dispo-import-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-dispo-');
const zlib = require('zlib');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const dispo = require('../server/lib/horaire-dispo-import');
const U = 'uD';
db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(U, U, new Date().toISOString());
const W = '2026-11-02'; // lundi
const file = (fileName, content) => ({ fileName, mimeType: '', dataUrl: 'data:application/octet-stream;base64,' + Buffer.from(content).toString('base64') });
const lines = (r) => r.text.split('\n').slice(1);

function zip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name, 'utf8'), crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

(async () => {
  // ---- Liste : « Nom, Prénom », dates ISO et JJ/MM/AAAA, AM/PM, « 17h30 », après minuit, vacances, statut refusé, autre semaine ----
  const csv = [
    'Rapport des disponibilités et congés',
    '',
    'Employé;Date;Début;Fin;Type;Statut',
    'Fictive, Alice;2026-11-02;4:00 PM;11:00 PM;;',
    'Fictive, Alice;03/11/2026;17h30;2h;;',
    'Fictive, Alice;2026-11-05;;;Vacances;Approuvé',
    'Exemple, Bruno;mercredi;10:00;14:00;;',
    'Exemple, Bruno;2026-11-06;;;Congé;Refusé',
    'Exemple, Bruno;2026-11-12;10:00;14:00;;',
    'Exemple, Bruno;jeudi;midi;soir;;',
  ].join('\n');
  let r = await dispo.fromFile(file('dayforce.csv', csv), W);
  assert(r.text.split('\n')[0] === 'nom;jour;début;fin;type', 'liste : en-tête du bloc');
  assert(lines(r).includes('Alice Fictive;2026-11-02;16:00;23:00;'), 'liste : « Nom, Prénom » -> « Prénom Nom », AM/PM -> 24 h');
  assert(lines(r).includes('Alice Fictive;2026-11-03;17:30;23:59;'), 'liste : JJ/MM/AAAA, « 17h30 », fin après minuit -> 23:59');
  assert(lines(r).includes('Alice Fictive;2026-11-05;;;vacances'), 'liste : congé approuvé -> ;;;vacances');
  assert(lines(r).includes('Bruno Exemple;2026-11-04;10:00;14:00;'), 'liste : nom du jour rapporté à la semaine affichée');
  assert(!r.text.includes('2026-11-06') && !r.text.includes('2026-11-12'), 'liste : congé refusé et autre semaine non repris');
  assert(r.employees === 2 && r.lines === 4 && r.ignored === 2 && r.otherWeek === 1, 'liste : comptes (2 employés, 4 lignes, 2 ignorées, 1 autre semaine)');

  // ---- Le bloc produit s'importe tel quel (bouton d'envoi existant) ----
  h.createEmployee(U, { name: 'Alice Fictive' }); h.createEmployee(U, { name: 'Bruno Exemple' });
  const imp = h.importAvailabilitiesCsv(U, W, r.text);
  assert(imp.employees === 2 && imp.timeoff === 1 && imp.intervals === 3 && !imp.skipped.length, 'bloc : relu sans perte par l\'import des disponibilités');

  // ---- Grille : une ligne par employé, une colonne par jour ----
  const grid = 'Nom\tLun 2 nov.\tMar 3 nov.\tMer 4 nov.\tJeu 5 nov.\n'
    + 'Témoin, Chloé\t16:00-23:00\tVacances\t\tOff\n'
    + 'Denis Modèle\t9 AM - 3 PM, 5 PM - 10 PM\t?\t11h à 15h\t\n';
  r = await dispo.fromFile(file('grille.txt', grid), W);
  assert(lines(r).includes('Chloé Témoin;2026-11-02;16:00;23:00;') && lines(r).includes('Chloé Témoin;2026-11-03;;;vacances'), 'grille : plage et vacances');
  assert(lines(r).includes('Denis Modèle;2026-11-02;09:00;15:00;') && lines(r).includes('Denis Modèle;2026-11-02;17:00;22:00;'), 'grille : deux plages dans une cellule, AM/PM');
  assert(lines(r).includes('Denis Modèle;2026-11-04;11:00;15:00;'), 'grille : « 11h à 15h »');
  assert(r.lines === 5 && r.ignored === 1 && !r.text.includes('2026-11-05'), 'grille : « Off » sans ligne, cellule illisible comptée');

  // ---- xlsx : prénom et nom séparés, date en numéro de série, heures en fraction de jour ----
  const cell = (ref, v) => (typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`);
  const row = (n, vals) => `<row r="${n}">${vals.map((v, i) => cell(String.fromCharCode(65 + i) + n, v)).join('')}</row>`;
  const serial = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
  const sheet = '<worksheet><sheetData>' + row(1, ['Prénom', 'Nom', 'Date', 'Heure de début', 'Heure de fin'])
    + row(2, ['Élise', 'Fictif', serial('2026-11-07'), 0.6875, 0.9583333333]) + row(3, ['Élise', 'Fictif', serial('2026-11-08'), '8:00 AM', '12:00 PM']) + '</sheetData></worksheet>';
  r = await dispo.fromFile({ fileName: 'dispo.xlsx', mimeType: '', dataUrl: 'data:application/octet-stream;base64,' + zip({ 'xl/worksheets/sheet1.xml': sheet }).toString('base64') }, W);
  assert(lines(r).includes('Élise Fictif;2026-11-07;16:30;23:00;'), 'xlsx : date en série, heures en fraction de jour');
  assert(lines(r).includes('Élise Fictif;2026-11-08;08:00;12:00;'), 'xlsx : 12:00 PM = midi');

  // ---- Congé sur plusieurs jours (Date de début / Date de fin), rapport groupé par employé ----
  const conges = 'Employé,Date de début,Date de fin,Type,Statut\nGaston Exemple\n,2026-10-30,2026-11-03,Vacances,Approuvé\n';
  r = await dispo.fromFile(file('conges.csv', conges), W);
  assert(lines(r).join('|') === 'Gaston Exemple;2026-11-02;;;vacances|Gaston Exemple;2026-11-03;;;vacances', 'congé sur plusieurs jours : seuls les jours de la semaine, nom repris de la ligne de groupe');

  // ---- Fichier déjà au format du bloc, sans en-tête ----
  r = await dispo.fromFile(file('bloc.txt', 'Alice Fictive;2026-11-02;16:00;23:00;\n'), W);
  assert(r.lines === 1 && r.ignored === 0, 'sans en-tête : bloc nom;jour;début;fin;type relu');

  // ---- Rien de compris : aucune ligne inventée ----
  r = await dispo.fromFile(file('vide.csv', 'Bonjour\nCeci n\'est pas un rapport\n'), W);
  assert(r.text === '' && r.lines === 0 && r.ignored === 2, 'texte sans rapport : aucune ligne inventée, 2 ignorées');
  let err = null; try { await dispo.fromFile(file('vieux.xls', 'x'), W); } catch (e) { err = e; }
  assert(err && err.statusCode === 400, '.xls : format refusé (400)');

  console.log(failed ? `horaire-dispo-import-test : ${failed} échec(s)` : 'horaire-dispo-import-test : tout passe');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
