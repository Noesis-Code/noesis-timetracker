// Déclenchement manuel de la tâche des comptes inactifs (trame 6), p. ex. sur staging :
//   INACTIVE_ACCOUNT_THRESHOLD_MS=60000 INACTIVE_ACCOUNT_NOTICE_MS=120000 INACTIVE_ACCOUNT_REMINDER_MS=60000 \
//   RAILWAY_ENVIRONMENT_NAME=staging node scripts/run-inactive-accounts.js
// Les durées raccourcies sont ignorées en production. Ignore l'intervalle de 24 h.
const { runInactiveAccounts } = require('../server/lib/inactiveaccounts');
runInactiveAccounts().then((s) => { console.log(JSON.stringify(s)); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
