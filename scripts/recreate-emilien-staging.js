// Recrée le compte « Emilien Staging » (NIP 1234) s'il a été supprimé : node scripts/recreate-emilien-staging.js (dans la console du service staging).
const db = require('../server/db');
const r = require('../server/lib/seed-staging').recreateEmilienAccount(db);
console.log(r.created ? 'Compte recréé : ' + r.id + ' (' + r.follows + ' abonnements, ' + r.activities + ' activités partagées).' : 'Le compte existe déjà : ' + r.id);
