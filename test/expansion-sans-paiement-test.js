// Interrupteur EXPANSION_SANS_PAIEMENT (24 oct. 2026) : production fermée sans paiement ; staging ouvert ; staging + valeur de réactivation fermé.
// Usage : node test/expansion-sans-paiement-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-sanspaiement-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { hasOffer1Access } = require('../server/lib/offer1access');
const set = (env, v) => { if (env === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME; else process.env.RAILWAY_ENVIRONMENT_NAME = env; if (v === undefined) delete process.env.EXPANSION_SANS_PAIEMENT; else process.env.EXPANSION_SANS_PAIEMENT = v; };
const u = 'utilisateur-sans-abonnement';

['production', 'Production', 'staging-2', undefined].forEach((env) => ['1', 'true', 'on', undefined].forEach((v) => {
  set(env, v);
  assert(!hasOffer1Access(u), 'hors staging (' + env + ', variable ' + v + ') : fermé sans paiement');
}));
set('staging', undefined); assert(hasOffer1Access(u), 'staging, variable absente : ouvert');
['1', 'true', 'on', 'TRUE', ' On '].forEach((v) => { set('staging', v); assert(hasOffer1Access(u), 'staging, ' + JSON.stringify(v) + ' : ouvert'); });
['0', 'false', 'off', 'non', 'FALSE', 'Off', 'NON', ' non '].forEach((v) => { set('staging', v); assert(!hasOffer1Access(u), 'staging, ' + JSON.stringify(v) + ' : paiement rétabli, fermé'); });
set('staging', 'peut-etre'); assert(!hasOffer1Access(u), 'staging, valeur inconnue : fermé (prudence)');
console.log(failed ? failed + ' échec(s)' : 'tout passe');
process.exit(failed ? 1 : 0);
