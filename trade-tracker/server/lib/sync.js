// Trade Tracker — synchro planifiée : connecteur -> base, journal, événements d'achat.
// La toute première synchro d'un utilisateur ne crée AUCUN événement (historique de départ).
const { getConnector } = require('./connectors');
const { notifyPending } = require('./notifier');
const { hasBrokerToken, getBrokerToken } = require('./brokertoken');

const iso = (ms) => new Date(ms).toISOString();

function upsertSector(db, name) {
  if (!name) return null;
  db.prepare('INSERT OR IGNORE INTO sectors (name) VALUES (?)').run(name);
  return db.prepare('SELECT id FROM sectors WHERE name = ?').get(name).id;
}

function applyData(db, user, data, now) {
  const first = !db.prepare("SELECT 1 FROM sync_log WHERE userId = ? AND kind = 'sync' AND status != 'ECHEC'").get(user.id);
  const stamp = iso(now);
  const newPurchases = [];
  let items = 0;
  db.exec('BEGIN');
  try {
    if (data.usdCad > 0) db.prepare("INSERT INTO fx_rates (date, pair, rate) VALUES (?, 'USDCAD', ?) ON CONFLICT(date, pair) DO UPDATE SET rate = excluded.rate").run(stamp.slice(0, 10), data.usdCad);
    for (const a of data.accounts || []) {
      let acc = db.prepare('SELECT id FROM accounts WHERE userId = ? AND externalId = ?').get(user.id, a.externalId);
      if (!acc) {
        const r = db.prepare('INSERT INTO accounts (userId, type, label, broker, externalId) VALUES (?,?,?,?,?)').run(user.id, a.type, a.label || '', data.broker || null, a.externalId);
        acc = { id: Number(r.lastInsertRowid) };
      } else db.prepare('UPDATE accounts SET type = ?, label = ? WHERE id = ?').run(a.type, a.label || '', acc.id);
      // positions : reflet exact du courtier (celles qui disparaissent sont supprimées) ; sans prix reçu (marché fermé, symbole inconnu),
      // le dernier prix connu et son horodatage sont conservés (la mention « Prix mis à jour » reste exacte)
      const seen = [];
      for (const p of a.positions || []) {
        seen.push(p.symbol);
        db.prepare(`INSERT INTO positions (accountId, symbol, name, sectorId, currency, quantity, avgCost, lastPrice, priceUpdatedAt) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(accountId, symbol) DO UPDATE SET name=excluded.name, sectorId=excluded.sectorId, currency=excluded.currency, quantity=excluded.quantity, avgCost=excluded.avgCost, lastPrice=COALESCE(excluded.lastPrice, lastPrice), priceUpdatedAt=CASE WHEN excluded.lastPrice IS NULL THEN priceUpdatedAt ELSE excluded.priceUpdatedAt END`)
          .run(acc.id, p.symbol, p.name || '', upsertSector(db, p.sector), p.currency || 'CAD', p.quantity, p.avgCost, p.lastPrice ?? null, p.lastPrice != null ? stamp : null);
        items++;
      }
      const existing = db.prepare('SELECT id, symbol FROM positions WHERE accountId = ?').all(acc.id);
      for (const e of existing) if (!seen.includes(e.symbol)) db.prepare('DELETE FROM positions WHERE id = ?').run(e.id);
      for (const b of a.balances || []) {
        db.prepare(`INSERT INTO balances (accountId, currency, cash, updatedAt) VALUES (?,?,?,?)
          ON CONFLICT(accountId, currency) DO UPDATE SET cash = excluded.cash, updatedAt = excluded.updatedAt`).run(acc.id, b.currency, b.cash, stamp);
      }
      for (const t of a.transactions || []) {
        const r = db.prepare(`INSERT OR IGNORE INTO transactions (accountId, date, type, symbol, quantity, price, amount, currency, externalId) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(acc.id, t.date, t.type, t.symbol ?? null, t.quantity ?? null, t.price ?? null, t.amount, t.currency || 'CAD', t.externalId ?? null);
        if (Number(r.changes) > 0) {
          items++;
          if (t.type === 'ACHAT' && !first) newPurchases.push({ txId: Number(r.lastInsertRowid), t, account: a });
        }
      }
    }
    // événements d'achat (idempotents par transaction)
    for (const n of newPurchases) {
      const body = { userId: user.tmtUserId, symbol: n.t.symbol, quantity: n.t.quantity, price: n.t.price, account: n.account.type, occurredAt: n.t.date };
      db.prepare("INSERT OR IGNORE INTO events (type, userId, transactionId, payload) VALUES ('purchase', ?, ?, ?)").run(user.id, n.txId, JSON.stringify(body));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { items, purchases: newPurchases.length, first };
}

// Synchronise un utilisateur ; ne lève jamais : l'échec est journalisé (ECHEC).
async function syncUser(db, user, { connector = getConnector(undefined, { db }), notifier = null, now = Date.now() } = {}) {
  // Connecteur réel : le jeton est celui de l'utilisateur ; sans jeton, rien à synchroniser (pas d'échec journalisé).
  if (connector.requiresToken && !hasBrokerToken(db, user.id)) return { ok: false, skipped: true, error: 'aucun jeton courtier' };
  try {
    const data = await connector.fetchPortfolio(user);
    const r = applyData(db, user, data, now);
    db.prepare("INSERT INTO sync_log (userId, at, kind, status, message, itemsCount) VALUES (?,?,'sync','OK',?,?)")
      .run(user.id, iso(now), `Synchro ${connector.name || ''} : ${r.items} nouveauté(s)` + (r.purchases ? `, ${r.purchases} achat(s)` : ''), r.items);
    if (notifier && user.role === 'expert') await notifyPending(db, notifier);
    return { ok: true, ...r };
  } catch (e) {
    // jamais de secret dans le journal : le jeton de l'utilisateur est masqué s'il apparaît dans le message
    let msg = String((e && e.message) || e);
    try { const t = getBrokerToken(db, user.id); if (t) msg = msg.split(t).join('[jeton]'); } catch { /* clé absente : rien à masquer */ }
    db.prepare("INSERT INTO sync_log (userId, at, kind, status, message, itemsCount) VALUES (?,?,'sync','ECHEC',?,0)").run(user.id, iso(now), 'Échec de synchro : ' + msg);
    return { ok: false, error: msg };
  }
}

// Délai croissant après des échecs consécutifs (fournisseur en 429 / 5xx / réponse invalide) : base x 2^(n-1), plafonné à 6 h.
// État en mémoire par base ; la dernière valeur de prix reste en place (un échec n'écrit rien). Une synchro réussie remet à zéro.
const failState = new WeakMap(); // db -> Map(userId -> { n, nextAt })
const MAX_BACKOFF_MS = 6 * 3600e3;

async function syncAll(db, opts = {}) {
  const out = [];
  const now = opts.now ?? Date.now();
  const base = opts.backoffBaseMs ?? 15 * 60e3;
  if (!failState.has(db)) failState.set(db, new Map());
  const st = failState.get(db);
  // l'expert d'abord : les clients se comparent à son portefeuille à jour
  for (const u of db.prepare("SELECT * FROM tt_users ORDER BY CASE role WHEN 'expert' THEN 0 ELSE 1 END, id").all()) {
    const f = st.get(u.id);
    if (f && now < f.nextAt) { out.push({ userId: u.id, ok: false, skipped: true, backoff: true, retryAt: iso(f.nextAt) }); continue; }
    let r;
    try { r = await syncUser(db, u, opts); } catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
    if (r.ok) st.delete(u.id);
    else if (!r.skipped) { const n = (f ? f.n : 0) + 1; st.set(u.id, { n, nextAt: now + Math.min(base * 2 ** (n - 1), MAX_BACKOFF_MS) }); }
    out.push({ userId: u.id, ...r });
  }
  return out;
}

function startSyncScheduler(db, { intervalMin = Number(process.env.TRADE_SYNC_INTERVAL_MIN) || 15, notifier, log = console.log } = {}) {
  if (process.env.TRADE_SYNC_DISABLE === '1') return null;
  const tick = () => syncAll(db, { notifier }).catch((e) => log('synchro : ' + e.message));
  const t = setInterval(tick, intervalMin * 60e3);
  t.unref();
  return t;
}

module.exports = { syncUser, syncAll, startSyncScheduler };
