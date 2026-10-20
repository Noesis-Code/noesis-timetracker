const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { parseCsv, importSheet, ensureUser } = require('../server/lib/importsheet');
const { buildPortfolio } = require('../server/lib/portfolio');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.csv'), 'utf8');
const files = { comptes: fx('comptes'), positions: fx('positions'), transactions: fx('transactions'), soldes: fx('soldes') };
assert.deepStrictEqual(parseCsv('a;b\n"x;1";2\r\n')[0], { a: 'x;1', b: '2' });

const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
const u = ensureUser(db, 'tmt-e', 'expert');
db.prepare("INSERT INTO fx_rates (date, pair, rate) VALUES ('2026-06-01','USDCAD',1.37)").run();
const r1 = importSheet(db, u, files);
assert.strictEqual(r1.accounts, 2); assert.strictEqual(r1.positions, 2); assert.strictEqual(r1.balances, 2); assert.strictEqual(r1.transactions, 3);
assert.strictEqual(r1.skipped.length, 1);
const snap = () => JSON.stringify(['accounts', 'positions', 'balances', 'transactions'].map((t) => db.prepare('SELECT COUNT(*) n FROM ' + t).get().n));
const before = snap();
const r2 = importSheet(db, u, files);
assert.strictEqual(r2.accounts, 0); assert.strictEqual(r2.transactions, 0); assert.strictEqual(snap(), before, 'idempotent');
const pf = buildPortfolio(db, u.id);
assert.strictEqual(pf.positions.find((p) => p.symbol === 'AAA.TO').avgCost, 12.5);
assert.strictEqual(db.prepare("SELECT cash FROM balances WHERE currency='CAD'").get().cash, 1200);
assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
assert(pf.totalValueCad > 0);

// Cas limites : fichier vide, BOM UTF-8, point-virgule, décimales à virgule, dates JJ/MM/AAAA, doublons (idempotent)
{
  const d2 = new DatabaseSync(':memory:'); d2.exec('PRAGMA foreign_keys = ON'); migrate(d2);
  const u2 = ensureUser(d2, 'tmt-q', 'expert');
  const vide = importSheet(d2, u2, { comptes: '', positions: '', transactions: '', soldes: '' });
  assert.deepStrictEqual([vide.accounts, vide.positions, vide.balances, vide.transactions, vide.skipped.length], [0, 0, 0, 0, 0], 'fichiers vides');
  const q = {
    comptes: '\uFEFFcompte;type;libelle;courtier\r\nQ1;CELI;Mon CELI;Questrade\r\n',
    positions: 'compte;symbole;devise;quantite;prix_moyen;prix_actuel\r\nQ1;AAA.TO;CAD;10,5;12,25;13,1\r\n',
    transactions: 'compte;date;type;symbole;quantite;prix;montant;devise\r\nQ1;05/03/2026;Achat;AAA.TO;10,5;12,25;"1 286,25";CAD\r\nQ1;31/02/2026;Achat;AAA.TO;1;1;1;CAD\r\n',
    soldes: 'compte;devise;encaisse\r\nQ1;CAD;"1 234,50"\r\n',
  };
  const a = importSheet(d2, u2, q);
  assert.deepStrictEqual([a.accounts, a.positions, a.balances, a.transactions, a.skipped.length], [1, 1, 1, 1, 1], JSON.stringify(a));
  const p = d2.prepare('SELECT quantity, avgCost FROM positions').get(); assert.deepStrictEqual([p.quantity, p.avgCost], [10.5, 12.25]);
  assert.strictEqual(d2.prepare('SELECT date, amount FROM transactions').get().date, '2026-03-05');
  assert.strictEqual(d2.prepare('SELECT amount FROM transactions').get().amount, 1286.25);
  assert.strictEqual(d2.prepare('SELECT cash FROM balances').get().cash, 1234.5);
  const n = () => JSON.stringify(['accounts', 'positions', 'balances', 'transactions'].map((t) => d2.prepare('SELECT COUNT(*) n FROM ' + t).get().n));
  const b4 = n(); const again = importSheet(d2, u2, q);
  assert.strictEqual(n(), b4, 'réimport idempotent'); assert.strictEqual(again.transactions, 0);
  assert.strictEqual(require('../server/lib/importsheet').parseCsv('a,b\n1.234,50,x')[0].a, '1.234');
}


// Doublons sans colonne id : clé naturelle + rang d'occurrence (deux achats identiques légitimes conservés, réimport jamais doublé, même réordonné)
{
  const d3 = new DatabaseSync(':memory:'); d3.exec('PRAGMA foreign_keys = ON'); migrate(d3);
  const u3 = ensureUser(d3, 'tmt-d', 'expert');
  const hdr = 'compte;date;type;symbole;quantite;prix;montant;devise\n';
  const L = (d, q) => `D1;${d};Achat;AAA.TO;${q};10;${q * 10};CAD\n`;
  const mk = (rows) => ({ comptes: 'compte;type\nD1;CELI\n', positions: '', soldes: '', transactions: hdr + rows });
  const n3 = () => d3.prepare('SELECT COUNT(*) n FROM transactions').get().n;
  const f1 = mk(L('2026-03-05', 5) + L('2026-03-05', 5) + L('2026-03-06', 1));
  const r = importSheet(d3, u3, f1);
  assert.strictEqual(r.transactions, 3, 'deux achats identiques le même jour : deux opérations'); assert.strictEqual(r.possibleDuplicates.length, 1);
  assert.strictEqual(importSheet(d3, u3, f1).transactions, 0, 'réimport identique : rien de nouveau');
  const f2 = mk(L('2026-03-04', 2) + L('2026-03-06', 1) + L('2026-03-05', 5) + L('2026-03-05', 5)); // ligne ajoutée, ordre changé
  assert.strictEqual(importSheet(d3, u3, f2).transactions, 1, 'réimport décalé : seule la ligne nouvelle est ajoutée'); assert.strictEqual(n3(), 4);
  const f3 = mk(L('2026-03-05', 5) + L('2026-03-05', 5) + L('2026-03-05', 5) + L('2026-03-06', 1)); // un 3e achat identique réellement nouveau
  assert.strictEqual(importSheet(d3, u3, f3).transactions, 1); assert.strictEqual(n3(), 5);
}
console.log('import-test OK');
