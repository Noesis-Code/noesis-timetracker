// Routes passkeys (WebAuthn), montées par app.js. Toutes derrière la session (cookie) ; /api/auth/* reste ouvert au niveau 0 (connexion).
// - Inscription et suppression : ré-authentification récente (needStepUp) + journal d'audit chaîné + alerte push TMT.
// - Connexion / ré-authentification : défi à usage unique lié à la session ; mêmes verrouillages (compte, IP) que les codes.
// - Toute erreur de vérification renvoie la même réponse (aucun détail exploitable).
const P = require('./passkeys');
const L = require('./lockout');

function mount(app, { db, env, aud, alertUser, err, codeGate, codeFailed, needStepUp, elevate }) {
  const cfgOf = (req, res) => {
    const cfg = P.getConfig(env, req);
    if (!cfg) { err(res, 503, 'passkey_unavailable', 'Passkeys indisponibles : TRADE_RP_ID n’est pas configuré sur le serveur.'); return null; }
    return cfg;
  };
  const verified = (req) => req.session.authLevel >= 1;

  app.get('/api/auth/passkeys', (req, res) => {
    if (!verified(req)) return err(res, 403, 'mfa_required', 'Vérification requise.');
    res.json({ available: !!P.getConfig(env, req), passkeys: P.list(db, req.user.id) });
  });

  // --- Inscription (ré-authentification récente exigée, TOTP déjà activé = récupération garantie) ---
  app.post('/api/auth/passkey/register/options', async (req, res) => {
    if (!verified(req)) return err(res, 403, 'mfa_required', 'Vérification requise.');
    const cfg = cfgOf(req, res); if (!cfg) return;
    if (!needStepUp(req, res)) return;
    try { res.json(await P.registrationOptions(db, req.user, cfg, req.session.hash)); }
    catch (e) { if (e.code === 'limit') return err(res, 409, 'passkey_limit', 'Nombre maximal de passkeys atteint.'); err(res, 500, 'server_error', 'Erreur du serveur.'); }
  });
  app.post('/api/auth/passkey/register/verify', async (req, res) => {
    if (!verified(req)) return err(res, 403, 'mfa_required', 'Vérification requise.');
    const cfg = cfgOf(req, res); if (!cfg) return;
    if (!needStepUp(req, res)) return;
    if (!codeGate(req, res)) return;
    const b = req.body || {};
    const r = await P.finishRegistration(db, req.user, cfg, req.session.hash, b.response, { label: b.label });
    if (!r.ok) {
      if (r.reason === 'limit') return err(res, 409, 'passkey_limit', 'Nombre maximal de passkeys atteint.');
      return codeFailed(req, res, 'passkey_register_failed', 'invalid_passkey', r.reason);
    }
    aud(req, 'passkey_added', { total: P.count(db, req.user.id) });
    alertUser(req.user.id, 'passkey_added');
    res.json({ ok: true, passkeys: P.list(db, req.user.id) });
  });

  // --- Suppression (ré-authentification récente exigée) ---
  app.delete('/api/auth/passkeys/:id', (req, res) => {
    if (!verified(req)) return err(res, 403, 'mfa_required', 'Vérification requise.');
    if (!needStepUp(req, res)) return;
    if (!/^\d{1,9}$/.test(req.params.id) || !P.remove(db, req.user.id, req.params.id)) return err(res, 404, 'not_found');
    aud(req, 'passkey_removed', { total: P.count(db, req.user.id) });
    alertUser(req.user.id, 'passkey_removed');
    res.json({ ok: true, passkeys: P.list(db, req.user.id) });
  });

  // --- Connexion (niveau 0 -> 1) ET ré-authentification (5 min) : même route, comme /api/auth/verify ---
  app.post('/api/auth/passkey/auth/options', async (req, res) => {
    const cfg = cfgOf(req, res); if (!cfg) return;
    if (!codeGate(req, res)) return;
    try { res.json(await P.authenticationOptions(db, req.user, cfg, req.session.hash)); }
    catch (e) { if (e.code === 'none') return err(res, 404, 'no_passkey', 'Aucune passkey enregistrée.'); err(res, 500, 'server_error', 'Erreur du serveur.'); }
  });
  app.post('/api/auth/passkey/auth/verify', async (req, res) => {
    const cfg = cfgOf(req, res); if (!cfg) return;
    if (!codeGate(req, res)) return;
    const wasLogin = req.session.authLevel < 1;
    const r = await P.finishAuthentication(db, req.user, cfg, req.session.hash, req.body && req.body.response);
    if (!r.ok) {
      if (r.reason === 'counter') { aud(req, 'passkey_clone_suspected', { credential: r.credentialRowId }); alertUser(req.user.id, 'passkey_clone'); }
      return codeFailed(req, res, wasLogin ? 'passkey_failed' : 'passkey_stepup_failed', 'invalid_passkey', r.reason);
    }
    L.clear(db, 'acct:' + req.user.id);
    const fresh = elevate(req, res);
    aud(req, wasLogin ? 'passkey_verified' : 'passkey_stepup_ok', {});
    if (wasLogin) alertUser(req.user.id, 'login');
    res.json({ ok: true, method: 'passkey', ...(req.headers.authorization ? { session: fresh } : {}) });
  });
}

module.exports = { mount };
