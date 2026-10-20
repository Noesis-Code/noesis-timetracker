// Taux de succès du mémo IA (aicache.memoStats). Usage : node test/ia-memo-stats-test.js
const aicache = require('../server/lib/aicache');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
(async () => {
  aicache.memoClear();
  let calls = 0;
  const fn = async () => { calls++; return 'x'; };
  await aicache.memoize(['a'], fn); await aicache.memoize(['a'], fn); await aicache.memoize(['b'], fn);
  await Promise.all([aicache.memoize(['c'], fn), aicache.memoize(['c'], fn)]);
  const s = aicache.memoStats();
  assert(calls === 3, 'appels réels = 3 (' + calls + ')');
  assert(s.hits === 2 && s.misses === 3 && s.total === 5, 'succès 2 / échecs 3 (' + JSON.stringify(s) + ')');
  assert(Math.abs(s.rate - 0.4) < 1e-9, 'taux 40 %');
  aicache.memoClear();
  assert(aicache.memoStats().total === 0, 'remise à zéro');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
})();
