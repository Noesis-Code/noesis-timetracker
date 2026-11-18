// Une échéance à ~15 ans (789 semaines, faute de frappe d'année) est refusée ; 10 ans reste accepté.
// Usage : node test/objectifs-horizon-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-hor-');
delete process.env.ANTHROPIC_API_KEY;
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const o = require('../server/lib/objectifs');
const start = new Date().toISOString().slice(0, 10), fin15 = new Date(Date.now() + 789 * 7 * 86400000).toISOString().slice(0, 10);
const refuse = (e) => { try { o.checkEcheance({ endDate: e, startDate: start }, start); return false; } catch (x) { return /trop lointaine/.test(x.message); } };
assert(refuse(fin15), '789 semaines (' + fin15 + ') refusées');
assert(refuse(new Date(Date.now() + 16 * 365 * 86400000).toISOString().slice(0, 10)), '16 ans refusés');
assert(!refuse(new Date(Date.now() + 14 * 365 * 86400000).toISOString().slice(0, 10)), '14 ans acceptés');
assert(!refuse('2027-03-01'), 'échéance normale acceptée');
(async () => {
  let msg = ''; try { await o.proposer(1, { title: 'Refaire mon plan', startDate: start, endDate: fin15 }); } catch (x) { msg = x.message; }
  assert(/trop lointaine/.test(msg), 'la proposition refuse aussi 789 semaines');
  process.exit(failed ? 1 : 0);
})();
