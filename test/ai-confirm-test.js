// Test HTTP : réglage « Confirmer chaque tâche ajoutée par l'IA » (actif par défaut, par profil). Usage : node test/ai-confirm-test.js
const { startServer, makeCounter, newUser, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
(async () => {
  const s = await startServer();
  try {
    const { c, id } = await newUser(s.base, 'aic');
    const other = await newUser(s.base, 'aic2');
    const url = `/api/profile/${id}/ai-confirm`;
    assert((await c.get(url)).body.enabled === true, 'actif par défaut');
    assert((await c.put(url, { enabled: false })).body.enabled === false, 'PUT désactive');
    assert((await c.get(url)).body.enabled === false, 'GET relit désactivé');
    assert((await other.c.get(`/api/profile/${other.id}/ai-confirm`)).body.enabled === true, 'autre profil inchangé');
    assert((await c.get(`/api/profile/${other.id}/ai-confirm`)).status === 403, "pas d'accès au profil d'un autre");
    assert((await client(s.base).get(url)).status === 401, 'sans session = 401');
    assert((await c.put(url, { enabled: true })).body.enabled === true, 'PUT réactive');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
