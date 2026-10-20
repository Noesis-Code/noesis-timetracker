// A9 — import d'un export CSV du Sheet « Portefeuille Emilien » (onglets Comptes, Positions,
// Transactions, Soldes). Idempotent : réimporter le même export ne change rien (upsert par
// compte+externalId / compte+symbole / compte+devise ; transactions dédupliquées). Ne supprime
// jamais rien et ne crée AUCUN événement d'achat (historique de départ).
//
// Colonnes (insensibles à la casse et aux accents ; séparateur « , » ou « ; ») :
//   Comptes       : compte (identifiant/numéro), type (CELI|REER|CELIAPP), libelle, courtier
//   Positions     : compte, symbole, nom, secteur, devise (CAD|USD), quantite, prix_moyen, prix_actuel
//   Transactions  : compte, id (facultatif), date (AAAA-MM-JJ ou JJ/MM/AAAA), type (Achat|Vente|Dividende|Apport|Retrait),
//                   symbole, quantite, prix, montant, devise
//   Soldes        : compte, devise, encaisse
const crypto = require('node:crypto');

const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(fold);
  return rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
}

function num(v) {
  if (v == null || String(v).trim() === '') return null;
  let s = String(v).replace(/[\s  $]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); // « 1.234,50 » ou « 1,234.50 »
  else if (s.includes(',')) s = s.replace(',', '.'); // « 12,5 » (format québécois)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== '') return o[k]; return ''; };
const accType = (v) => { const t = fold(v).replace(/_/g, ''); return ['celi', 'reer', 'celiapp'].includes(t) ? t.toUpperCase() : null; };
const cur = (v) => { const c = String(v || 'CAD').trim().toUpperCase(); return c === 'USD' ? 'USD' : c === 'CAD' || c === '' ? 'CAD' : null; };
const TX = { achat: 'ACHAT', vente: 'VENTE', dividende: 'DIVIDENDE', apport: 'APPORT', depot: 'APPORT', retrait: 'RETRAIT' };
const txType = (v) => TX[fold(v)] || null;
const isoDate = (v) => {
  const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); let y, mo, d;
  if (m) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [y, mo, d] = [m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0')]; // JJ/MM/AAAA
  else return null;
  const t = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return t.getUTCFullYear() == y && t.getUTCMonth() + 1 == Number(mo) && t.getUTCDate() == Number(d) ? `${y}-${mo}-${d}` : null;
};

function importSheet(db, user, files, { now = Date.now() } = {}) {
  const stamp = new Date(now).toISOString();
  const rep = { accounts: 0, positions: 0, balances: 0, transactions: 0, skipped: [], possibleDuplicates: [] };
  const skip = (tab, i, why) => rep.skipped.push(`${tab} ligne ${i + 2} : ${why}`);
  const comptes = parseCsv(files.comptes), positions = parseCsv(files.positions), txs = parseCsv(files.transactions), soldes = parseCsv(files.soldes);
  db.exec('BEGIN');
  try {
    const accIds = new Map();
    const ensureAccount = (ext, type, label, broker) => {
      const key = String(ext);
      let a = db.prepare('SELECT id FROM accounts WHERE userId = ? AND externalId = ?').get(user.id, key);
      if (!a) {
        if (!type) return null;
        a = { id: Number(db.prepare('INSERT INTO accounts (userId, type, label, broker, externalId) VALUES (?,?,?,?,?)').run(user.id, type, label || '', broker || null, key).lastInsertRowid) };
        rep.accounts++;
      } else if (type) db.prepare('UPDATE accounts SET type = ?, label = COALESCE(NULLIF(?, \'\'), label), broker = COALESCE(?, broker) WHERE id = ?').run(type, label || '', broker || null, a.id);
      accIds.set(key, a.id);
      return a.id;
    };
    const accOf = (ext) => { if (!ext) return null; const k = String(ext); return accIds.get(k) || ensureAccount(k, null); };
    comptes.forEach((r, i) => {
      const ext = pick(r, 'compte', 'id', 'numero', 'numero_de_compte'); const t = accType(pick(r, 'type'));
      if (!ext || !t) return skip('Comptes', i, 'compte ou type invalide');
      ensureAccount(ext, t, pick(r, 'libelle', 'nom', 'label'), pick(r, 'courtier', 'broker') || null);
    });
    positions.forEach((r, i) => {
      const acc = accOf(pick(r, 'compte')), sym = pick(r, 'symbole', 'symbol', 'ticker'), q = num(pick(r, 'quantite', 'qte')), c = cur(pick(r, 'devise'));
      if (!acc || !sym || q == null || !c) return skip('Positions', i, 'compte, symbole, quantité ou devise invalide');
      let sectorId = null; const sec = pick(r, 'secteur');
      if (sec) { db.prepare('INSERT OR IGNORE INTO sectors (name) VALUES (?)').run(sec); sectorId = db.prepare('SELECT id FROM sectors WHERE name = ?').get(sec).id; }
      const last = num(pick(r, 'prix_actuel', 'prix', 'dernier_prix'));
      db.prepare(`INSERT INTO positions (accountId, symbol, name, sectorId, currency, quantity, avgCost, lastPrice, priceUpdatedAt) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(accountId, symbol) DO UPDATE SET name=excluded.name, sectorId=excluded.sectorId, currency=excluded.currency, quantity=excluded.quantity, avgCost=excluded.avgCost, lastPrice=excluded.lastPrice, priceUpdatedAt=excluded.priceUpdatedAt`)
        .run(acc, sym, pick(r, 'nom', 'name'), sectorId, c, q, num(pick(r, 'prix_moyen', 'cout_moyen')) || 0, last, last != null ? stamp : null);
      rep.positions++;
    });
    soldes.forEach((r, i) => {
      const acc = accOf(pick(r, 'compte')), c = cur(pick(r, 'devise')), cash = num(pick(r, 'encaisse', 'solde', 'cash'));
      if (!acc || !c || cash == null) return skip('Soldes', i, 'compte, devise ou encaisse invalide');
      db.prepare(`INSERT INTO balances (accountId, currency, cash, updatedAt) VALUES (?,?,?,?)
        ON CONFLICT(accountId, currency) DO UPDATE SET cash = excluded.cash, updatedAt = excluded.updatedAt`).run(acc, c, cash, stamp);
      rep.balances++;
    });
    const seen = new Map();
    txs.forEach((r, i) => {
      const acc = accOf(pick(r, 'compte')), type = txType(pick(r, 'type')), date = isoDate(pick(r, 'date')), c = cur(pick(r, 'devise'));
      let amount = num(pick(r, 'montant', 'amount')); const q = num(pick(r, 'quantite')), p = num(pick(r, 'prix'));
      if (amount == null && q != null && p != null) amount = q * p;
      if (!acc || !type || !date || !c || amount == null) return skip('Transactions', i, 'compte, type, date, devise ou montant invalide');
      const sym = pick(r, 'symbole', 'symbol') || null;
      // Sans colonne id : clé naturelle (compte + date + type + symbole + quantité + prix + montant + devise) + rang de l'occurrence dans le fichier.
      // Deux achats identiques le même jour restent deux opérations (rangs 1 et 2) ; un réimport, même réordonné, ne les double jamais.
      let ext = pick(r, 'id', 'id_transaction');
      let dup = false;
      if (!ext) {
        const nat = [acc, date, type, sym, q, p, Math.abs(amount), c].join('|');
        const rank = (seen.get(nat) || 0) + 1; seen.set(nat, rank);
        if (rank > 1) rep.possibleDuplicates.push(`Transactions ligne ${i + 2} : identique à une ligne précédente du fichier (conservée comme opération distincte)`);
        ext = 'sheet-' + crypto.createHash('sha256').update(nat + '|' + rank).digest('hex').slice(0, 16);
        // anciens imports (clé liée au numéro de ligne) : déjà présent si la base compte au moins `rank` opérations identiques importées du Sheet
        const known = db.prepare("SELECT COUNT(*) n FROM transactions WHERE accountId = ? AND date = ? AND type = ? AND symbol IS ? AND quantity IS ? AND price IS ? AND amount = ? AND currency = ? AND externalId LIKE 'sheet-%'")
          .get(acc, date, type, sym, q, p, Math.abs(amount), c).n;
        dup = known >= rank;
      }
      if (dup) return;
      const res = db.prepare('INSERT OR IGNORE INTO transactions (accountId, date, type, symbol, quantity, price, amount, currency, externalId) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(acc, date, type, sym, q, p, Math.abs(amount), c, ext);
      if (Number(res.changes) > 0) rep.transactions++;
    });
    db.prepare("INSERT INTO sync_log (userId, at, kind, status, message, itemsCount) VALUES (?,?,'import',?,?,?)")
      .run(user.id, stamp, rep.skipped.length ? 'PARTIEL' : 'OK', `Import du Sheet : ${rep.accounts} compte(s), ${rep.positions} position(s), ${rep.balances} solde(s), ${rep.transactions} transaction(s) nouvelle(s)` + (rep.skipped.length ? `, ${rep.skipped.length} ligne(s) ignorée(s)` : ''), rep.accounts + rep.positions + rep.balances + rep.transactions);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return rep;
}

// Trouve (ou crée, avec le rôle donné) l'utilisateur cible par identifiant TMT.
function ensureUser(db, tmtUserId, role = 'expert', name = '') {
  let u = db.prepare('SELECT * FROM tt_users WHERE tmtUserId = ?').get(String(tmtUserId));
  if (!u) {
    if (!['expert', 'client'].includes(role)) throw new Error('rôle invalide');
    const r = db.prepare('INSERT INTO tt_users (tmtUserId, name, role) VALUES (?,?,?)').run(String(tmtUserId), name, role);
    u = db.prepare('SELECT * FROM tt_users WHERE id = ?').get(Number(r.lastInsertRowid));
  }
  return u;
}

module.exports = { parseCsv, importSheet, ensureUser };
