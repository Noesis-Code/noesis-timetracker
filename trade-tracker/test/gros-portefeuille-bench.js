// Mesure manuelle : node test/gros-portefeuille-bench.js  (temps des routes de lecture + plans de requête sur la base de volume).
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { seedBig } = require('./lib-gros-portefeuille');
const { buildPortfolio } = require('../server/lib/portfolio');
const C = require('../server/lib/calc');
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON');
const noIdx = process.argv.includes('--sans-index-nouveaux');
migrate(db); seedBig(db);
const time = (label, fn, n = 20) => { fn(); const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(); console.log(label.padEnd(34), (Number(process.hrtime.bigint() - t) / 1e6 / n).toFixed(2), 'ms'); };
time('accueil/positions (buildPortfolio)', () => buildPortfolio(db, 1));
time('rendement/historique (history)', () => C.indexSeries(db.prepare('SELECT date, valueCad, netFlowCad FROM history WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date').all(1, '0000-01-01', '9999-12-31')));
time('achats (purchases)', () => db.prepare(`SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.accountId LEFT JOIN positions p ON p.accountId = t.accountId AND p.symbol = t.symbol LEFT JOIN sectors s ON s.id = p.sectorId WHERE a.userId = ? AND t.type = 'ACHAT' ORDER BY t.date DESC, t.id DESC LIMIT 11 OFFSET 0`).all(1));
time('journal synchro', () => db.prepare('SELECT id FROM sync_log WHERE userId = ? ORDER BY id DESC LIMIT 50').all(1));
for (const [l, q] of [
  ['positions', 'SELECT p.*, a.type FROM positions p JOIN accounts a ON a.id = p.accountId LEFT JOIN sectors s ON s.id = p.sectorId WHERE a.userId = 1 AND p.quantity != 0'],
  ['soldes', 'SELECT b.accountId FROM balances b JOIN accounts a ON a.id = b.accountId WHERE a.userId = 1'],
  ['historique', 'SELECT date FROM history WHERE userId = 1 AND date >= \'0\' AND date <= \'9\' ORDER BY date'],
  ['achats', "SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.accountId LEFT JOIN positions p ON p.accountId = t.accountId AND p.symbol = t.symbol WHERE a.userId = 1 AND t.type = 'ACHAT' ORDER BY t.date DESC, t.id DESC LIMIT 11"],
  ['snapshot flux', "SELECT t.type, t.amount, t.currency FROM transactions t JOIN accounts a ON a.id = t.accountId WHERE a.userId = 1 AND t.date = '2026-01-01'"],
  ['synchro', 'SELECT id FROM sync_log WHERE userId = 1 ORDER BY id DESC LIMIT 1'],
]) console.log(l.padEnd(14), db.prepare('EXPLAIN QUERY PLAN ' + q).all().map((r) => r.detail).join(' | '));
