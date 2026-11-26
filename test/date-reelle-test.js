// Date impossible (20 nov. 2026) : un seul validateur serveur (dates.isRealDay), réutilisé par les routes .
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dates = require('../server/lib/dates');
['2026-11-20', '2028-02-29', '2026-12-31'].forEach((d) => assert(dates.isRealDay(d), d + ' valide'));
['2026-02-31', '2026-13-01', '2026-00-10', '2027-02-29', 'demain', '', null, undefined, 20261120, '2026-1-1', '0001-01-01', '9999-12-31', '1999-12-31', '2026-11-20T10:00'].forEach((d) => assert(!dates.isRealDay(d), String(d) + ' refusée'));
assert.strictEqual(dates.DATE_INVALIDE, 'Date invalide.');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
assert(/isRealDay\(dueDate\)/.test(read('server/routes/goals.js')), 'auto-task : date réelle');
assert(/isRealDay\(req\.body\.dueDate\)/.test(read('server/routes/goals.js')), 'création de tâche : date réelle');
assert(/isRealDay\(req\.body\.dueDate\)/.test(read('server/routes/subprojects.js')), 'modification de tâche : date réelle');
assert(read('server/lib/objectifs.js').includes("require('./dates').isRealDay(s)"), 'objectifs : isDay = date réelle');
console.log('date-reelle-test OK');
