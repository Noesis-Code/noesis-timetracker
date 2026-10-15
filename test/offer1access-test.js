// Usage : node test/offer1access-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-o1-'));
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { hasOffer1Access, requireOffer1Access } = require('../server/lib/offer1access');
const E = '2fcf8f91-5ce5-43bb-9d1b-03f793343bfb', G = 'f73bc6f7-7f87-48ea-9b94-a868e3c2073b';

delete process.env.OFFER1_EARLY_ACCESS_USER_IDS;
assert(hasOffer1Access(E) && hasOffer1Access(G), 'liste par défaut : Émilien et Gaspard');
assert(!hasOffer1Access('inconnu'), 'identifiant inconnu refusé');
assert(!hasOffer1Access(undefined) && !hasOffer1Access(''), 'identifiant vide refusé');
process.env.OFFER1_EARLY_ACCESS_USER_IDS = ' a1 , b2 ';
assert(hasOffer1Access('a1') && hasOffer1Access('b2'), 'variable d\'environnement (virgules, espaces)');
assert(!hasOffer1Access(E), 'la variable remplace la liste par défaut');
process.env.OFFER1_EARLY_ACCESS_USER_IDS = '';
assert(!hasOffer1Access(E) && !hasOffer1Access(''), 'variable vide : personne');

let status = 0, body = null, nexted = false;
const res = { status(s) { status = s; return this; }, json(b) { body = b; } };
requireOffer1Access({ userId: 'zzz' }, res, () => { nexted = true; });
assert(status === 403 && body.error === 'offer1_required' && !nexted, 'middleware : 403 offer1_required');
process.env.OFFER1_EARLY_ACCESS_USER_IDS = 'zzz';
requireOffer1Access({ userId: 'zzz' }, res, () => { nexted = true; });
assert(nexted, 'middleware : laisse passer un compte autorisé');
process.exit(failed ? 1 : 0);
