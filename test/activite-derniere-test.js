// Règle produit (9 nov. 2026, Émilien) : la DERNIÈRE activité d'un compte ne se supprime pas. 2 activités : suppression possible ; 1 seule : refus serveur (400, rien touché)
// et croix de suppression absente de Réglages > Activités (R26). Seule la suppression du compte retire tout (autre chemin).
const fs = require('fs');
const path = require('path');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const U = await newUser(s.base, 'derniere');
    const c = U.c;
    const first = U.activityId;
    const list = async () => { const r = await c.get('/api/activities'); return (r.body.activities || r.body || []).map((a) => a.id); };
    assert((await list()).includes(first), 'départ : une activité');
    let r = await c.del('/api/activities/' + first);
    assert(r.status === 400 && /au moins une activité/.test(r.body.error || ''), 'une seule activité : suppression refusée (400, message court)');
    assert((await list()).includes(first), 'refus : l’activité est toujours là, rien n’est touché');
    const second = (await c.post('/api/activities', { name: 'Seconde' })).body.id;
    assert((await list()).length === 2, 'deux activités');
    r = await c.del('/api/activities/' + first);
    assert(r.status === 200, 'deux activités : suppression possible');
    const left = await list();
    assert(left.length === 1 && left[0] === second, 'il reste la seconde');
    r = await c.del('/api/activities/' + second);
    assert(r.status === 400 && (await list()).includes(second), 'devenue la dernière : refusée à son tour');
  } finally { await s.stop(); }

  // Interface : la croix n'est ajoutée que s'il reste plus d'une activité (R26)
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8').split('\r\n').join('\n');
  assert(/if \(\(acts \|\| \[\]\)\.length > 1\) row\.appendChild\(trash\);/.test(app), 'Réglages > Activités : croix de suppression absente quand il ne reste qu’une activité');
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'activities.js'), 'utf8');
  assert(srv.includes('activeCount <= 1'), 'route de suppression : garde sur la dernière activité');
  T.done && T.done();
  console.log(T.failed ? '\nactivite-derniere-test : ' + T.failed + ' ÉCHEC(S)' : '\nactivite-derniere-test : OK');
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
