// Horaire : import des employés depuis un document (Paramètres > Employés). csv, en-têtes variées, xlsx minimal, docx (tableau),
// aperçu sans écriture, fusion par nom sans suppression ni champ vidé, quarts ignorés. Données entièrement FICTIVES.
// Usage : node test/horaire-import-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-import-');
const zlib = require('zlib');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const imp = require('../server/lib/horaire-import');
const now = new Date().toISOString();
db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run('uA', 'uA', now);
db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run('uB', 'uB', now);
const U = 'uA';
h.ensureDefaultPositions(U); h.ensureDefaultPositions('uB');
const pos = (n) => h.listPositions(U).find((p) => p.name === n);
const SRV = pos('Serveur').id, BAR = pos('Barman').id;
const file = (fileName, content) => ({ fileName, mimeType: '', dataUrl: 'data:application/octet-stream;base64,' + Buffer.from(content).toString('base64') });
const emp = (name) => h.listEmployees(U).find((e) => e.name === name);
const rank = (name, pid) => { const e = emp(name); const q = e && h.listQualifications(U).find((x) => x.employeeId === e.id && x.positionId === pid); return q ? q.rank : null; };

// Zip minimal (entrées stockées) pour .xlsx et .docx, sans dépendance.
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
  // ---- CSV (point-virgule), aperçu sans écriture ----
  const csv = 'Nom;Catégorie;Poste;Heures min;Heures cible;Heures max;Note\nAlice Fictive;1;Serveur;20;30;35;pas de matin\nBruno Exemple;2;;15;;25;\n;1;Serveur;10;;;\n';
  let p = await imp.preview(U, file('equipe.csv', csv), SRV);
  assert(p.added.length === 2 && p.updated.length === 0, 'csv : 2 ajoutés à l\'aperçu');
  assert(p.ignored.some((x) => x.reason === 'nom manquant'), 'csv : ligne sans nom ignorée et signalée');
  assert(h.listEmployees(U).length === 0, 'aperçu : rien n\'est écrit');
  p = await imp.apply(U, file('equipe.csv', csv), SRV);
  assert(p.applied && emp('Alice Fictive') && emp('Alice Fictive').wantHoursMax === 35 && emp('Alice Fictive').constraintNote === 'pas de matin', 'csv : champs appliqués');
  assert(rank('Alice Fictive', SRV) === 1 && rank('Bruno Exemple', SRV) === 2, 'csv : catégorie au poste (poste vide = poste choisi)');

  // ---- Fusion : champ absent jamais vidé, personne supprimée, avant -> après ----
  h.createEmployee(U, { name: 'Chloé Témoin', wantHoursMax: 40 });
  h.setQualification(U, emp('Chloé Témoin').id, SRV, 3);
  const csv2 = 'nom,max\nalice fictive,32\n';
  p = await imp.preview(U, file('maj.csv', csv2), SRV);
  assert(p.updated.length === 1 && p.updated[0].changes.some((c) => c.label === 'Heures max' && c.before === '35' && c.after === '32'), 'fusion : avant -> après par champ (nom sans casse)');
  await imp.apply(U, file('maj.csv', csv2), SRV);
  const a = emp('Alice Fictive');
  assert(a.wantHoursMax === 32 && a.wantHoursMin === 20 && a.wantHoursTarget === 30 && a.constraintNote === 'pas de matin' && rank('Alice Fictive', SRV) === 1, 'fusion : champs absents du document inchangés');
  assert(emp('Chloé Témoin') && emp('Chloé Témoin').wantHoursMax === 40 && h.listEmployees(U).length === 3, 'fusion : personne n\'est supprimé');

  // ---- Format réel : nom;max;postes;quarts min;quarts max;contrainte (Serveur:1), accents, quarts ignorés ----
  const real = 'nom;max;postes;quarts min;quarts max;contrainte\nDavid Essai;30;Serveur:1 | Barmans:2;3;5;repos après un quart\nÉmile Test;;Hôtesses:4;;;\nFélix Inconnu;20;Plongeur:1;;;\n';
  p = await imp.preview(U, file('reel.txt', real), SRV);
  assert(p.notes.some((n) => /quarts/.test(n)), 'quarts : colonnes ignorées et signalées');
  await imp.apply(U, file('reel.txt', real), SRV);
  assert(rank('David Essai', SRV) === 1 && rank('David Essai', BAR) === 2 && emp('David Essai').wantHoursMax === 30 && emp('David Essai').wantShiftsMin == null, 'postes « Serveur:1 | Barmans:2 », max en heures, quarts non stockés');
  assert(rank('Émile Test', pos('Hôte/Hôtesse').id) === 4, 'pluriel « Hôtesses » = poste Hôte/Hôtesse');
  assert(!emp('Félix Inconnu') && p.ignored.some((x) => x.name === 'Félix Inconnu' && /poste inconnu/.test(x.reason)), 'poste inconnu : ligne ignorée et signalée');

  // ---- En-tête variée : tableau Markdown, titre avant, Prénom + Nom, « Catégorie N » en titre de section ----
  const md = 'Liste du personnel\n\nCatégorie 2\n| Prénom | Nom | Heures désirées | Max. |\n|---|---|---|---|\n| Gaëlle | Modèle | 28 | 33 |\n';
  await imp.apply(U, file('liste.md', md), SRV);
  assert(emp('Gaëlle Modèle') && emp('Gaëlle Modèle').wantHoursTarget === 28 && rank('Gaëlle Modèle', SRV) === 2, 'markdown, prénom + nom, catégorie en titre de section');
  // Espaces multiples, min > max refusé (heures ignorées, rien d'autre)
  const sp = 'Employé    Cat    Min    Max\nHugo Factice    1    30    20\n';
  p = await imp.preview(U, file('sp.txt', sp), SRV);
  assert(p.added.length === 1 && p.ignored.some((x) => /min > max/.test(x.reason)) && !p.added[0].changes.some((c) => /Heures/.test(c.label)), 'espaces multiples ; min > max : heures ignorées');

  // ---- xlsx minimal (textes partagés + nombres) ----
  const shared = '<sst><si><t>Nom</t></si><si><t>Catégorie</t></si><si><t>Heures max</t></si><si><t>Iris Imaginaire</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1</v></c><c r="C2"><v>37.5</v></c></row></sheetData></worksheet>';
  const xlsx = zip({ 'xl/sharedStrings.xml': shared, 'xl/worksheets/sheet1.xml': sheet });
  await imp.apply(U, file('equipe.xlsx', xlsx), SRV);
  assert(emp('Iris Imaginaire') && emp('Iris Imaginaire').wantHoursMax === 37.5 && rank('Iris Imaginaire', SRV) === 1, 'xlsx : lu sans dépendance');

  // ---- docx : tableau Word (une cellule = un paragraphe) ----
  const tc = (t) => '<w:tc><w:p><w:r><w:t>' + t + '</w:t></w:r></w:p></w:tc>';
  const tr = (...c) => '<w:tr>' + c.map(tc).join('') + '</w:tr>';
  const docXml = '<w:document><w:body><w:p><w:r><w:t>Équipe de salle</w:t></w:r></w:p><w:tbl>' + tr('Nom', 'Poste', 'Catégorie', 'Note')
    + tr('Jade Inventée', 'Commis', '2', 'soirs d&apos;abord') + '</w:tbl></w:body></w:document>';
  await imp.apply(U, file('equipe.docx', zip({ 'word/document.xml': docXml })), SRV);
  assert(emp('Jade Inventée') && rank('Jade Inventée', pos('Commis').id) === 2 && emp('Jade Inventée').constraintNote === "soirs d'abord", 'docx : tableau lu, poste Commis');

  // ---- Refus clairs ----
  let err = null; try { await imp.preview(U, file('vide.txt', 'bonjour\nrien ici\n'), SRV); } catch (e) { err = e; }
  assert(err && err.statusCode === 400 && /En-tête/.test(err.message), 'sans en-tête : refus clair');
  err = null; try { await imp.preview(U, file('vieux.xls', 'x'), SRV); } catch (e) { err = e; }
  assert(err && err.statusCode === 400 && /Format non pris en charge/.test(err.message), '.xls : format refusé');
  assert(h.listEmployees('uB').length === 0, 'un autre compte n\'est pas touché');

  console.log(failed ? `horaire-import-test : ${failed} échec(s)` : 'horaire-import-test : tout passe');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
