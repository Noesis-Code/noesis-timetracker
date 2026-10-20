// Import CSV : formats d'export variés (BOM, séparateur « ; » ou tabulation, décimale virgule, milliers, négatifs entre parenthèses,
// dates JJ/MM/AAAA et variantes, fins de ligne CR, en-têtes entre guillemets). Chaque variante, importée sur une base neuve,
// donne EXACTEMENT les mêmes données que la forme canonique ; une ligne invalide est signalée, jamais devinée.
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { parseCsv, importSheet, ensureUser } = require('../server/lib/importsheet');

const D = { // données de référence
  comptes: [['compte', 'type', 'libelle', 'courtier'], ['X-1', 'CELI', 'Mon CELI', 'Questrade']],
  positions: [['compte', 'symbole', 'nom', 'secteur', 'devise', 'quantite', 'prix_moyen', 'prix_actuel'], ['X-1', 'XEQT.TO', 'iShares', 'ETF', 'CAD', 1234.5, 31.25, 36.8]],
  soldes: [['compte', 'devise', 'encaisse'], ['X-1', 'CAD', 12345.67]],
  transactions: [['compte', 'date', 'type', 'symbole', 'quantite', 'prix', 'montant', 'devise'],
    ['X-1', '2026-03-05', 'Achat', 'XEQT.TO', 100, 30, 3000.5, 'CAD'], ['X-1', '2026-04-18', 'Dividende', 'XEQT.TO', '', '', 45.1, 'CAD']],
};
// rendu : sep, décimale, milliers, format de date, fin de ligne, BOM, guillemets d'en-tête, négatif/symbole $
function render(tab, o) {
  const fmtNum = (n) => { if (n === '') return ''; let s = String(n); const [i, f] = s.split('.'); const g = o.thousands ? i.replace(/\B(?=(\d{3})+(?!\d))/g, o.thousands) : i; s = f ? g + o.dec + f : g; return o.dollar ? s + ' $' : s; };
  const fmtDate = (v) => { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return v; return o.date.replace('AAAA', m[1]).replace('MM', m[2]).replace('JJ', m[3]); };
  const rows = D[tab].map((r, i) => r.map((c) => (i === 0 ? (o.quoteHead ? '"' + c + '"' : c) : typeof c === 'number' ? fmtNum(c) : /^\d{4}-\d{2}-\d{2}$/.test(c) ? fmtDate(c) : c)));
  return (o.bom ? '﻿' : '') + rows.map((r) => r.join(o.sep)).join(o.eol) + o.eol;
}
const VARIANTS = {
  canonique: { sep: ',', dec: '.', thousands: '', date: 'AAAA-MM-JJ', eol: '\n' },
  'québécois ; virgule décimale, espace insécable, BOM, CRLF, $': { sep: ';', dec: ',', thousands: ' ', date: 'JJ/MM/AAAA', eol: '\r\n', bom: true, dollar: true },
  'tabulation, AAAA/MM/JJ, CR seul': { sep: '\t', dec: '.', thousands: '', date: 'AAAA/MM/JJ', eol: '\r' },
  'européen ; virgule décimale, point des milliers': { sep: ';', dec: ',', thousands: '.', date: 'JJ.MM.AAAA', eol: '\n' },
  'en-têtes entre guillemets, JJ-MM-AAAA': { sep: ';', dec: ',', thousands: '', date: 'JJ-MM-AAAA', eol: '\n', quoteHead: true },
  'milliers par virgule, décimale point (séparateur ;)': { sep: ';', dec: '.', thousands: ',', date: 'AAAA-MM-JJ', eol: '\n' },
};
const snap = (db) => JSON.stringify({
  a: db.prepare('SELECT type, label, broker, externalId FROM accounts ORDER BY id').all(),
  p: db.prepare('SELECT symbol, quantity, avgCost, lastPrice, currency FROM positions').all(),
  b: db.prepare('SELECT currency, cash FROM balances').all(),
  t: db.prepare('SELECT date, type, symbol, quantity, price, amount, currency FROM transactions ORDER BY date').all(),
});
function load(o) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const u = ensureUser(db, 'tmt-e', 'expert');
  const rep = importSheet(db, u, { comptes: render('comptes', o), positions: render('positions', o), soldes: render('soldes', o), transactions: render('transactions', o) });
  return { db, rep };
}
const ref = load(VARIANTS.canonique);
assert.deepStrictEqual(ref.rep.skipped, [], 'canonique : rien d\'ignoré');
const REF = snap(ref.db);
assert(/1234\.5/.test(REF) && /12345\.67/.test(REF) && /"2026-04-18"/.test(REF), 'canonique : valeurs attendues');
for (const [name, o] of Object.entries(VARIANTS)) {
  const { db, rep } = load(o);
  assert.deepStrictEqual(rep.skipped, [], name + ' : lignes ignorées : ' + rep.skipped.join(' | '));
  assert.strictEqual(snap(db), REF, name + ' : données différentes de la forme canonique');
}

// Nombres isolés (via soldes) : parenthèses = négatif, signe moins typographique, devise accolée, espaces fines.
const bal = (v) => { const db = new DatabaseSync(':memory:'); migrate(db); const u = ensureUser(db, 'e', 'expert');
  importSheet(db, u, { comptes: 'compte;type\nX;CELI\n', soldes: 'compte;devise;encaisse\nX;CAD;"' + v + '"\n' }); const r = db.prepare('SELECT cash FROM balances').get(); return r ? r.cash : null; };
for (const [raw, want] of [['(1 234,50)', -1234.5], ['−300', -300], ['12,5 $', 12.5], ['1 234,56', 1234.56], ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['CA$ 99', 99], ['USD 10', 10], ['12,5', 12.5], ['abc', null]]) {
  assert.strictEqual(bal(raw), want, 'nombre « ' + raw + ' »');
}
// Ambiguïté connue, figée : « 1,234 » (une virgule suivie de 3 chiffres, sans autre séparateur) = décimale (1,234), convention du Sheet ; jamais 1234 en silence.
assert.strictEqual(bal('1,234'), 1.234, '« 1,234 » = décimale (convention du Sheet)');
assert.strictEqual(bal('3.000'), 3, '« 3.000 » = décimale aussi (un export européen « 3.000 » pour trois mille doit porter une partie décimale ou un autre séparateur)');

// Dates : jamais MM/JJ/AAAA ; une date impossible est signalée et la ligne ignorée (pas corrigée en silence).
{
  const db = new DatabaseSync(':memory:'); migrate(db); const u = ensureUser(db, 'e', 'expert');
  const rep = importSheet(db, u, { comptes: 'compte;type\nX;CELI\n', transactions: 'compte;date;type;montant;devise\nX;13/25/2026;Apport;10;CAD\nX;31/02/2026;Apport;10;CAD\nX;05/03/2026 14:30;Apport;10;CAD\nX;2026-03-06T10:00:00;Apport;11;CAD\n' });
  assert.strictEqual(rep.transactions, 2, 'deux dates valides (JJ/MM/AAAA avec heure, ISO avec heure)');
  assert.strictEqual(rep.skipped.length, 2, 'deux dates impossibles signalées : ' + rep.skipped.join(' | '));
  assert.deepStrictEqual(db.prepare('SELECT date FROM transactions ORDER BY date').all().map((r) => r.date), ['2026-03-05', '2026-03-06']);
}
// Séparateur : une virgule entre guillemets dans l'en-tête ne trompe pas la détection.
assert.deepStrictEqual(parseCsv('"a,b";c\n1;2\n')[0], { a_b: '1', c: '2' });
assert.deepStrictEqual(parseCsv('x\ty\n1\t2\n')[0], { x: '1', y: '2' });
console.log('import-formats-test OK');
