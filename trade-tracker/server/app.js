// Trade Tracker — application Express (lecture seule + liens/invitations).
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const express = require('express');
const { importSheet, ensureUser } = require('./lib/importsheet');
const A = require('./lib/auth');
const { createLimiter } = require('./lib/ratelimit');
const C = require('./lib/calc');
const { buildPortfolio, latestUsdCad } = require('./lib/portfolio');
const { compareProportions } = require('./lib/compare');
const BT = require('./lib/brokertoken');

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformé ignoré */ } }
  }
  return out;
}

function createApp(db, { env = process.env, limits = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const tmtOrigin = (() => { try { return env.TMT_BASE_URL ? new URL(env.TMT_BASE_URL).origin : null; } catch { return null; } })();
  // Cookie de session : SameSite=None; Secure en HTTPS (ou TRADE_COOKIE_CROSS_SITE=1) pour survivre à l'iframe TMT ; Lax en HTTP local.
  const sessionCookie = (req, value, maxAge) => {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' || env.TRADE_COOKIE_CROSS_SITE === '1';
    return `tt_session=${value}; HttpOnly; ${secure ? 'SameSite=None; Secure' : 'SameSite=Lax'}; Path=/; Max-Age=${maxAge}`;
  };
  app.set('trust proxy', 1); // Railway : un saut de proxy ; req.ip = vrai client
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Intégration en iframe : seul TMT (origine de TMT_BASE_URL) peut afficher l'app ; sinon personne.
    // CSP complète : aucun script ni ressource externe (l'app n'en charge aucune) ; styles en ligne tolérés (attributs style générés).
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${tmtOrigin || "'none'"}`);
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    if (!tmtOrigin) res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer'); // le jeton de lien est dans l'URL
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Limitation de débit : /link (jetons), écritures (POST), échecs d'authentification admin, lecture générale.
  const ip = (req) => req.ip || 'inconnu';
  const rlLink = createLimiter({ max: limits.link || 20 })(ip);
  const rlWrite = createLimiter({ max: limits.write || 30 })(ip);
  const rlAdmin = createLimiter({ max: limits.admin || 10 })(ip);
  const rlRead = createLimiter({ max: limits.read || 300 })(ip);
  const rlBroker = createLimiter({ max: limits.broker || 10 })(ip); // en plus de la limite d'écriture générale
  // CSRF : le cookie peut être SameSite=None (iframe TMT). Toute écriture portant un en-tête Origin doit venir de cette app ou de TMT.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const o = req.headers.origin;
    if (o == null) return next(); // client non navigateur (les navigateurs envoient toujours Origin sur une écriture)
    let host = null; try { host = new URL(o).host; } catch { /* Origin invalide ou « null » */ }
    if (host && (host === req.headers.host || (tmtOrigin && o === tmtOrigin))) return next();
    res.status(403).json({ error: 'bad_origin', message: 'Origine refusée.' });
  });
  app.use('/link', rlLink);
  app.use('/api', (req, res, next) => (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' ? rlWrite : rlRead)(req, res, next));
  // Réponse JSON avec ETag fort (empreinte du corps) : If-None-Match identique => 304 sans corps.
  const sendJson = (req, res, obj) => {
    const body = JSON.stringify(obj);
    const tag = '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"';
    res.setHeader('ETag', tag);
    const inm = String(req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === tag)) return res.status(304).end();
    res.type('application/json').send(body);
  };
  const err = (res, status, error, message) => res.status(status).json({ error, message: message || error });

  // Admin (hors session) : import d'un export CSV du Sheet. Protégé par TRADE_ADMIN_TOKEN
  // (en-tête X-Admin-Token, comparaison à temps constant) ; absent => route inexistante (404).
  app.post('/api/admin/import-sheet', rlAdmin, express.json({ limit: '5mb' }), (req, res) => {
    const want = env.TRADE_ADMIN_TOKEN;
    if (!want || want.length < 16) return err(res, 404, 'not_found');
    const given = Buffer.from(String(req.headers['x-admin-token'] || ''));
    const exp = Buffer.from(want);
    if (given.length !== exp.length || !crypto.timingSafeEqual(given, exp)) return err(res, 401, 'unauthorized');
    const b = req.body || {};
    if (typeof b.tmtUserId !== 'string' || !b.tmtUserId || !b.files || typeof b.files !== 'object') return err(res, 400, 'bad_request', 'tmtUserId et files requis');
    try {
      const user = ensureUser(db, b.tmtUserId, b.role || 'expert', typeof b.name === 'string' ? b.name : '');
      res.json(importSheet(db, user, b.files));
    } catch (e) { err(res, 400, 'import_failed', e.message); }
  });

  app.use(express.json({ limit: '50kb' }));

  app.get(['/health', '/api/health'], (req, res) => res.json({ ok: true }));

  app.get('/link', (req, res) => {
    const r = A.consumeLink(db, String(req.query.token || ''), { invite: req.query.invite ? String(req.query.invite) : undefined, env });
    if (!r.ok) return res.redirect(302, '/?linkError=' + encodeURIComponent(r.error));
    res.setHeader('Set-Cookie', sessionCookie(req, r.session, r.maxAgeSec));
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
    sendJson(req, res, {
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
    sendJson(req, res, { positions: list });
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
    sendJson(req, res, C.indexSeries(rows));
  });

  app.get('/api/sync-log', (req, res) => {
    const s = scopeUserId(req, res); if (!s) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const entries = db.prepare('SELECT id, at, accountId, kind, status, message, itemsCount FROM sync_log WHERE userId = ? ORDER BY id DESC LIMIT ?').all(s.userId, limit);
    sendJson(req, res, { entries });
  });

  // Portefeuille de l'utilisateur comparé à celui de l'expert (écarts en points de %, client - expert).
  app.get('/api/compare', (req, res) => {
    const e = expertUser();
    if (!e) return err(res, 404, 'no_expert');
    const cmp = compareProportions(buildPortfolio(db, req.user.id), buildPortfolio(db, e.id));
    sendJson(req, res, { expertSyncedAt: (db.prepare("SELECT at FROM sync_log WHERE userId = ? AND kind='sync' AND status='OK' ORDER BY id DESC LIMIT 1").get(e.id) || {}).at || null, ...cmp });
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
    sendJson(req, res, { purchases, limit, offset, hasMore: more });
  });

  // Jeton courtier : chiffré (TRADE_TOKEN_KEY), propre à l'utilisateur connecté, jamais renvoyé ni journalisé.
  app.post('/api/broker/token', rlBroker, (req, res) => {
    const token = req.body && req.body.token;
    if (typeof token !== 'string' || !BT.isValidTokenFormat(token.trim())) return err(res, 422, 'invalid_token', 'Format de jeton refusé.');
    if (!BT.hasEncryptionKey(env)) return err(res, 503, 'broker_unavailable', 'Connexion du courtier indisponible : la clé de chiffrement TRADE_TOKEN_KEY n’est pas configurée sur le serveur.');
    try { BT.saveBrokerToken(db, req.user.id, token.trim(), { env }); } catch { return err(res, 500, 'store_failed', 'Jeton non enregistré.'); }
    res.json({ ok: true, brokerConnected: true });
  });

  // État de la connexion courtier : aucun secret. error = message de la dernière synchro si elle a échoué.
  app.get('/api/broker/status', (req, res) => {
    const last = db.prepare("SELECT at, status, message FROM sync_log WHERE userId = ? AND kind = 'sync' ORDER BY id DESC LIMIT 1").get(req.user.id);
    const ok = db.prepare("SELECT at FROM sync_log WHERE userId = ? AND kind = 'sync' AND status != 'ECHEC' ORDER BY id DESC LIMIT 1").get(req.user.id);
    const out = { connected: BT.hasBrokerToken(db, req.user.id), lastSyncAt: ok ? ok.at : null };
    if (last && last.status === 'ECHEC') out.error = last.message;
    res.json(out);
  });

  // Suppression RÉELLE : jeton + données de synchro de l'utilisateur (comptes, positions, soldes, transactions, historique, journal, événements). La confirmation est faite côté client.
  app.delete('/api/broker/token', rlBroker, (req, res) => {
    try { BT.deleteBrokerToken(db, req.user.id); BT.purgeSyncData(db, req.user.id); } catch { return err(res, 500, 'delete_failed', 'Suppression non terminée.'); }
    res.json({ ok: true, brokerConnected: false });
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
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => err(res, 404, 'not_found'));
  // Erreurs (ex. JSON mal formé) : message générique, jamais le corps de la requête.
  app.use((e, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = e && e.status >= 400 && e.status < 500 ? e.status : 500;
    err(res, status, status === 500 ? 'server_error' : 'bad_request', status === 500 ? 'Erreur du serveur.' : 'Requête invalide.');
  });
  const pub = path.join(__dirname, '..', 'public');
  if (fs.existsSync(pub)) app.use(express.static(pub));
  return app;
}

module.exports = { createApp };
