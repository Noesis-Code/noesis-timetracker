// Trade Tracker — application Express (lecture seule + liens/invitations).
const path = require('path');
const fs = require('fs');
const express = require('express');
const A = require('./lib/auth');
const C = require('./lib/calc');
const { buildPortfolio, latestUsdCad } = require('./lib/portfolio');
const { compareProportions } = require('./lib/compare');

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createApp(db, { env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  const err = (res, status, error, message) => res.status(status).json({ error, message: message || error });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/link', (req, res) => {
    const r = A.consumeLink(db, String(req.query.token || ''), { invite: req.query.invite ? String(req.query.invite) : undefined, env });
    if (!r.ok) return res.redirect(302, '/?linkError=' + encodeURIComponent(r.error));
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `tt_session=${r.session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${r.maxAgeSec}${secure ? '; Secure' : ''}`);
    res.redirect(302, '/');
  });

  const sessionToken = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : parseCookies(req.headers.cookie).tt_session;
  };
  const auth = (req, res, next) => {
    const u = A.getSessionUser(db, sessionToken(req));
    if (!u) return err(res, 401, 'unauthenticated');
    req.user = u; next();
  };
  const expertOnly = (req, res, next) => (req.user.role === 'expert' ? next() : err(res, 403, 'forbidden'));
  const expertUser = () => db.prepare("SELECT * FROM tt_users WHERE role = 'expert' ORDER BY id LIMIT 1").get();

  // scope=me (défaut) | expert ; retourne l'id utilisateur dont on lit le portefeuille
  const scopeUserId = (req, res) => {
    const scope = req.query.scope === 'expert' ? 'expert' : 'me';
    if (req.query.scope && !['me', 'expert'].includes(req.query.scope)) { err(res, 400, 'bad_scope'); return null; }
    if (scope === 'me') return { scope, userId: req.user.id };
    const e = expertUser();
    if (!e) { err(res, 404, 'no_expert'); return null; }
    return { scope, userId: e.id };
  };

  app.use('/api', (req, res, next) => (req.path === '/health' ? next() : auth(req, res, next)));

  app.get('/api/me', (req, res) => {
    const connected = !!db.prepare('SELECT 1 FROM broker_tokens WHERE userId = ?').get(req.user.id);
    res.json({ id: req.user.id, name: req.user.name, role: req.user.role, brokerConnected: connected });
  });

  app.get('/api/portfolio', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    const pf = buildPortfolio(db, s.userId);
    const lastPrice = pf.positions.map((p) => p.priceUpdatedAt).filter(Boolean).sort().pop() || null;
    res.json({
      scope: s.scope, asOf: lastPrice, usdCad: pf.usdCad, fxMissing: pf.fxMissing,
      totalValueCad: C.round2(pf.totalValueCad), cashCad: C.round2(pf.cashCad), investedCad: C.round2(pf.investedCad),
      costCad: C.round2(pf.costCad), pnlCad: C.round2(pf.pnlCad), pnlPct: C.round2(pf.pnlPct), dayChangeCad: null,
      lastSync: pf.lastSync,
      accounts: pf.accounts.map((a) => ({
        id: a.id, type: a.type, label: a.label, valueCad: C.round2(a.valueCad), cashCad: C.round2(a.cashCad),
        pnlCad: C.round2(a.investedCad - a.costCad), pnlPct: C.round2(a.costCad ? ((a.investedCad - a.costCad) / a.costCad) * 100 : 0),
        weightPct: C.round2(pf.totalValueCad ? (a.valueCad / pf.totalValueCad) * 100 : 0),
      })),
    });
  });

  app.get('/api/positions', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    let list = buildPortfolio(db, s.userId).positions;
    if (req.query.accountId) list = list.filter((p) => String(p.accountId) === String(req.query.accountId));
    if (req.query.sector) list = list.filter((p) => (p.sector || 'Non classé') === req.query.sector);
    list = list.map(({ priced, ...p }) => p).sort((a, b) => (b.valueCad || 0) - (a.valueCad || 0));
    res.json({ positions: list });
  });

  app.get('/api/allocation', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    const by = req.query.by === 'account' ? 'account' : 'sector';
    if (req.query.by && !['sector', 'account'].includes(req.query.by)) return err(res, 400, 'bad_by');
    const pf = buildPortfolio(db, s.userId);
    const a = by === 'account' ? C.allocationByAccount(pf.accounts) : C.allocationBySector(pf.positions, pf.cashCad);
    res.json({ by, ...a });
  });

  app.get('/api/history', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const from = re.test(req.query.from || '') ? req.query.from : '0000-01-01';
    const to = re.test(req.query.to || '') ? req.query.to : '9999-12-31';
    const rows = db.prepare('SELECT date, valueCad, netFlowCad FROM history WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date').all(s.userId, from, to);
    res.json(C.indexSeries(rows));
  });

  app.get('/api/sync-log', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const entries = db.prepare('SELECT id, at, accountId, kind, status, message, itemsCount FROM sync_log WHERE userId = ? ORDER BY id DESC LIMIT ?').all(s.userId, limit);
    res.json({ entries });
  });

  // Portefeuille de l'utilisateur comparé à celui de l'expert (écarts en points de %, client - expert).
  app.get('/api/compare', (req, res) => {
    const e = expertUser();
    if (!e) return err(res, 404, 'no_expert');
    const cmp = compareProportions(buildPortfolio(db, req.user.id), buildPortfolio(db, e.id));
    res.json({ expertSyncedAt: (db.prepare("SELECT at FROM sync_log WHERE userId = ? AND kind='sync' AND status='OK' ORDER BY id DESC LIMIT 1").get(e.id) || {}).at || null, ...cmp });
  });

  // Derniers achats de l'expert (lisibles par tous les utilisateurs connectés). Pagination courte.
  app.get('/api/purchases', (req, res) => {
    const e = expertUser();
    if (!e) return err(res, 404, 'no_expert');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 10000);
    const usdCad = latestUsdCad(db);
    const rows = db.prepare(`SELECT t.id, t.date, t.symbol, t.quantity, t.price, t.amount, t.currency, a.type AS accountType,
        p.name AS name, s.name AS sector
      FROM transactions t JOIN accounts a ON a.id = t.accountId
      LEFT JOIN positions p ON p.accountId = t.accountId AND p.symbol = t.symbol
      LEFT JOIN sectors s ON s.id = p.sectorId
      WHERE a.userId = ? AND t.type = 'ACHAT' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`).all(e.id, limit + 1, offset);
    const more = rows.length > limit;
    const purchases = rows.slice(0, limit).map((r) => ({
      id: r.id, symbol: r.symbol, name: r.name || r.symbol, sector: r.sector || 'Non classé', accountType: r.accountType,
      quantity: r.quantity, price: r.price, currency: r.currency,
      amountCad: (() => { const c = C.toCad(r.amount, r.currency, usdCad); return c == null ? null : C.round2(c); })(),
      at: r.date,
    }));
    res.json({ purchases, limit, offset, hasMore: more });
  });

  app.post('/api/invitations', expertOnly, (req, res) => {
    const role = req.body && req.body.role;
    const email = req.body && req.body.email;
    if (!['client', 'expert'].includes(role)) return err(res, 400, 'bad_role');
    if (email != null && (typeof email !== 'string' || email.length > 200)) return err(res, 400, 'bad_email');
    res.status(201).json(A.createInvitation(db, { invitedBy: req.user.id, email, role }));
  });
  app.get('/api/invitations', expertOnly, (req, res) => res.json({ invitations: A.listInvitations(db) }));

  app.post('/api/logout', (req, res) => {
    A.destroySession(db, sessionToken(req));
    res.setHeader('Set-Cookie', 'tt_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => err(res, 404, 'not_found'));
  const pub = path.join(__dirname, '..', 'public');
  if (fs.existsSync(pub)) app.use(express.static(pub));
  return app;
}

module.exports = { createApp };
