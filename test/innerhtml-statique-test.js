// Usage : node test/innerhtml-statique-test.js — garde statique : tout innerHTML / outerHTML / insertAdjacentHTML de public/ qui reçoit une donnée
// d'utilisateur (titre de tâche, nom d'activité, note, message, nom de membre...) passe par une fonction d'échappement (escapeHtml, esc, ...).
// Le relevé (test/lib/innerhtml-scan.js) découpe chaque expression en opérandes ; tout opérande qui n'est ni un littéral, ni un appel d'échappement,
// ni dans la liste relue ci-dessous FAIT ÉCHOUER le test : ajouter une insertion non échappée oblige à la justifier ici.
const fs = require('fs'), os = require('os'), path = require('path');
const { scanAll, scanFile } = require('./lib/innerhtml-scan');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

// Opérandes relus à la main (20 oct. 2026), jamais du texte saisi : [motif, raison].
const REVIEWED = [
  [/^(?:\w+\.)*(?:color|userColor|followerColor)$/, 'couleur de profil/membre : validée côté serveur contre la palette (isInPalette) à la création et à la modification'],
  [/^authorHtml$/, 'auteur d\'un message : nom passé par escapeHtml, couleur validée (relu, app.js "authorHtml =")'],
  [/^a\.id$/, 'identifiant numérique d\'activité'],
  [/^(?:i|idx|n|periodIndex|\w+\.maxCallsPerDay|\w+\.minutes|\w+\.capacityMinutes)$/, 'indice ou nombre calculé'],
  [/^(?:pad|formatHM|\w*\.getDate|\w*\.getMonth)\(/, 'date ou durée formatée'],
  [/^(?:dateObj|firstDate|lastDate)\.(?:getDate|getMonth)\(\)(?: \+ 1)?$/, 'date calculée'],
  [/^(?:dateLabel|timeLabel)$/, 'date et heure locales (toLocaleDateString / pad)'],
  [/^t\((?:day\.dayOfWeek|name)\)\.slice\(0, 3\)$/, 'nom de jour : constante du serveur (Lundi...), traduite'],
  [/^h$/, 'durée formatée en heures (nombre)'],
  [/^(?:weekLabel|dayOrWeekLabel|formatGoalPeriodDates)\(/, 'libellé de date calculé à partir d\'une date ISO validée'],
  [/^(?:svg|qr\.createSvgTag\(.*\))$/, 'SVG généré par le code (graphique : étiquettes de date échappées ; QR : bibliothèque)'],
  [/^(?:paneHtml|folderFilesHtml)\(/, 'fonction du même fichier dont les opérandes sont relevés séparément (esc partout)'],
  [/^TMT\.goalsTaskEditIcon\(\)$/, 'icône SVG constante'],
  [/^r\[0\]$/, 'motif de signalement : constante du code'],
  [/^f\[0\]$|^tr\(f\[1\]\)$/, 'champs de la stratégie : constantes du code'],
  [/^folderRemoveId === f\.id \? /, 'test de comparaison ; ses branches sont des littéraux et des appels déjà relevés'],
  [/^info \? '<b>'$|^'<b>'$/, 'littéral'],
  [/^\/\/ /, 'commentaire pris à tort pour un opérande'],
];
const sites = scanAll();
assert(sites.length > 150, 'le relevé voit les insertions HTML (' + sites.length + ' trouvées)');
const unreviewed = [];
sites.forEach((st) => st.unsafe.forEach((u) => { const one = u.replace(/\s+/g, ' ').trim(); if (!REVIEWED.some(([re]) => re.test(one))) unreviewed.push(st.file + ':' + st.line + '  ' + one.slice(0, 120)); }));
assert(unreviewed.length === 0, 'aucune insertion HTML non échappée ni relue' + (unreviewed.length ? '\n    ' + unreviewed.join('\n    ') : ''));

// Garde-fou du relevé lui-même : il doit signaler une insertion non échappée et laisser passer une insertion échappée.
const dir = fs.mkdtempSync(path.join(require('./lib/tmpdir').mkTmp('tmt-ih-'), 'x'));
function probe(code) { const f = path.join(dir, 'p.js'); fs.writeFileSync(f, code); return scanFile(f).flatMap((s) => s.unsafe); }
assert(probe("el.innerHTML = '<b>' + task.label + '</b>';").length === 1, 'relevé : titre concaténé sans échappement signalé');
assert(probe("el.innerHTML = '<b>' + escapeHtml(task.label) + '</b>';").length === 0, 'relevé : titre échappé accepté');
assert(probe("el.innerHTML = `<b>${a.name}</b>`;").length === 1, 'relevé : gabarit ${} sans échappement signalé');
assert(probe("el.insertAdjacentHTML('beforeend', '<i>' + m.body + '</i>');").length === 1, 'relevé : insertAdjacentHTML signalé');
assert(probe("var html = ''; html += '<p>' + n.note + '</p>'; el.innerHTML = html;").length >= 1, 'relevé : variable accumulatrice non échappée signalée');
assert(probe("el.innerHTML = '<p>' + t(userText) + '</p>';").length === 1, 'relevé : t() sur un texte non littéral signalé (non traduit = renvoyé tel quel)');
assert(probe("el.innerHTML = list.map(function (x) { return '<li>' + x.title + '</li>'; }).join('');").length === 1, 'relevé : rappel de .map sans échappement signalé');
try { fs.rmSync(path.dirname(dir), { recursive: true, force: true }); } catch (e) { /* ignoré */ }
process.exit(failed ? 1 : 0);
