// Aide aux tests : enrôle le TOTP d'une session (niveau 0) et renvoie le cookie élevé. Pas de test lui-même (le lanceur ne prend que *-test.js).
const T = require('../server/lib/totp');
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];

// base : URL du serveur ; cookie : « tt_session=... » ; retourne { cookie, secret, backupCodes }
async function enrollAndVerify(base, cookie, headers = {}) {
  const h = { cookie, 'content-type': 'application/json', ...headers };
  const e = await (await fetch(base + '/api/auth/totp/enroll', { method: 'POST', headers: h, body: '{}' })).json();
  const confirmCode = T.totpAt(e.secret, Date.now()); // code du pas consommé à l'enrôlement (sert aux tests de rejeu)
  const r = await fetch(base + '/api/auth/totp/confirm', { method: 'POST', headers: h, body: JSON.stringify({ code: confirmCode }) });
  const j = await r.json();
  if (!r.ok) throw new Error('confirm TOTP refusé : ' + JSON.stringify(j));
  return { cookie: cookieOf(r) || cookie, secret: e.secret, backupCodes: j.backupCodes, confirmCode };
}
module.exports = { enrollAndVerify, cookieOf };
