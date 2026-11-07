// Plafond global annuel NET de l'IA gratuite (6 nov. 2026) : coupure au-delà de ~100 $ net, marge Expansion déduite, alerte à 50 % (une fois), rappel du 1er (administrateur seulement).
// Usage : node test/ia-gratuit-global-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iaglob-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0';
process.env.AI_USD_PER_CAD = '1';
process.env.IA_GRATUIT_CREDIT_MOIS_CAD = '1000'; // crédit par utilisateur très large : ce test ne mesure que le plafond global
delete process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX; delete process.env.IA_EXPANSION_MARGE_ANNUELLE_USD; delete process.env.IA_ALERTE_ADMIN_USER_IDS;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const access = require('../server/lib/offer1access');
const push = require('../server/lib/push');
for (const id of ['g-a', 'g-b', 'g-exp', 'g-admin']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
access.grantAccess('g-exp', 'test');
const sent = []; push.sendToUsers = (ids, payload) => { sent.push({ ids: [].concat(ids), payload }); };
const warns = []; const realWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };

let calls = 0;
global.fetch = async (url, init) => { calls++; const m = JSON.parse(init.body).model; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: m, usage: { input_tokens: 1e6, output_tokens: 0 }, content: [] }; } }; }; // haiku : 1 $ par appel
const call = (uid, model) => ab.runAs(uid, () => ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: model || 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }) }));

let k = 0; const fresh = () => 'g-x' + (++k); // un nouveau compte gratuit à chaque appel (le budget par compte, 3,5 CAD par semaine, reste hors sujet)
(async () => {
  assert(ab.freeNetYear().cap === 100 && ab.freeNetYear().readable === false, 'plafond par défaut 100 $ ; marge Expansion non lisible (aucun revenu en base) : valeur fixe');
  await call(fresh()); await call('g-exp');
  let n = ab.freeNetYear();
  assert(Math.abs(n.cost - 1) < 1e-6 && Math.abs(n.net - 1) < 1e-6, 'coût cumulé : comptes gratuits seulement (1 $), compte Expansion exclu');
  // sous le plafond : seul le crédit par utilisateur s'applique -> toujours autorisé
  const c0 = calls; await call(fresh()); assert(calls === c0 + 1, 'sous 100 $ net : l’IA gratuite continue');
  // alerte à 50 % : une seule fois, administrateur seulement
  process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-admin';
  process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX = '10'; // 50 % = 5 $
  sent.length = 0;
  for (let i = 0; i < 3; i++) await call(fresh()); // net 2 -> 5 : franchit 50 % au 3e appel
  assert(sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'g-admin' && /50 %/.test(sent[0].payload.body), 'alerte à 50 % : une notification, à l’administrateur seulement');
  await call(fresh()); await call(fresh());
  assert(sent.length === 1, 'alerte à 50 % : jamais deux fois la même année');
  assert(!sent.some((s) => s.ids.some((i) => i !== 'g-admin')), 'aucun envoi aux utilisateurs');
  // marge Expansion déduite : réouvre l'IA
  process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX = '5'; // net 7 > 5 : coupée
  let err = null; try { await call(fresh()); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.freeCap && /suspendue/.test(err.message), 'net au-dessus du plafond : l’IA gratuite se coupe (repli sans IA)');
  const before = calls; await call('g-exp'); assert(calls === before + 1, 'compte Expansion : jamais coupé');
  process.env.IA_EXPANSION_MARGE_ANNUELLE_USD = '50'; // marge nette 50 $ : net = 7 - 50 < 0
  n = ab.freeNetYear(); assert(n.readable && n.net < 0, 'marge Expansion lisible déduite du coût');
  const b2 = calls; await call(fresh()); assert(calls === b2 + 1, 'marge Expansion déduite : l’IA gratuite repart (coupure seulement si le net dépasse le plafond)');
  delete process.env.IA_EXPANSION_MARGE_ANNUELLE_USD;
  // sans administrateur configuré : journal seulement
  delete process.env.IA_ALERTE_ADMIN_USER_IDS; sent.length = 0;
  const body0 = ab.monthlyFreeReminder(new Date(2026, 10, 1, 9)); // 1er nov.
  assert(typeof body0 === 'string' && sent.length === 0, 'rappel sans administrateur configuré : journal seulement, aucun envoi');
  // rappel du 1er : coûts de octobre et septembre
  process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-admin';
  db.prepare('DELETE FROM ai_free_cost').run(); db.prepare('DELETE FROM ai_alerts_sent').run();
  const put = (d, v) => db.prepare('INSERT INTO ai_free_cost (day, costUsd) VALUES (?, ?)').run(d, v);
  put('2026-01-15', 10); put('2026-09-10', 4); put('2026-10-10', 5);
  process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX = '100'; sent.length = 0;
  const body = ab.monthlyFreeReminder(new Date(2026, 10, 1, 9));
  assert(sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'g-admin', 'rappel du 1er : une notification, à l’administrateur seulement');
  assert(/19,00 \$ net depuis le 1er janvier \(19 % de 100,00 \$\)/.test(body) && /marge Expansion non lisible/.test(body) && /Mois écoulé : 5,00 \$ \(précédent 4,00 \$, hausse de 25 %\)/.test(body), 'rappel : net cumulé, % du plafond, marge (ou valeur fixe), tendance : ' + body);
  assert(ab.monthlyFreeReminder(new Date(2026, 10, 1, 9)) === null && sent.length === 1, 'une seule notification par rappel (pas de doublon dans le mois)');
  assert(typeof ab.monthlyFreeReminder(new Date(2026, 11, 1, 9)) === 'string' && sent.length === 2, 'rappel du mois suivant : une nouvelle notification');
  // administrateur par courriel (insensible à la casse et aux espaces), union avec les ids, sans doublon
  db.prepare("UPDATE users SET email = ? WHERE id = 'g-admin'").run('Admin@CompagnieNoesis.com');
  db.prepare("UPDATE users SET email = ? WHERE id = 'g-a'").run('autre@exemple.com');
  delete process.env.IA_ALERTE_ADMIN_USER_IDS; process.env.IA_ALERTE_ADMIN_EMAILS = ' admin@compagnienoesis.com , inconnu@x.com ';
  db.prepare('DELETE FROM ai_alerts_sent').run(); sent.length = 0;
  ab.monthlyFreeReminder(new Date(2027, 0, 1, 9));
  assert(sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'g-admin', 'administrateur trouvé par courriel (casse et espaces ignorés), jamais un autre compte');
  process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-admin'; db.prepare('DELETE FROM ai_alerts_sent').run(); sent.length = 0;
  ab.monthlyFreeReminder(new Date(2027, 0, 1, 9));
  assert(sent.length === 1 && sent[0].ids.length === 1, 'trouvé par id ET par courriel : une seule notification pour le compte');
  process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-a'; db.prepare('DELETE FROM ai_alerts_sent').run(); sent.length = 0;
  ab.monthlyFreeReminder(new Date(2027, 0, 1, 9));
  assert(sent.length === 1 && sent[0].ids.slice().sort().join() === 'g-a,g-admin', 'union des comptes trouvés par id et par courriel');
  process.env.IA_ALERTE_ADMIN_EMAILS = 'personne@nulle-part.com'; delete process.env.IA_ALERTE_ADMIN_USER_IDS; db.prepare('DELETE FROM ai_alerts_sent').run(); sent.length = 0;
  const none = ab.monthlyFreeReminder(new Date(2027, 0, 1, 9));
  assert(typeof none === 'string' && sent.length === 0, 'aucun compte ne correspond : journal seulement, sans erreur');
  delete process.env.IA_ALERTE_ADMIN_EMAILS;
  // cron existant réutilisé
  const cr = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'lib', 'subscriptioncron.js'), 'utf8');
  assert(/cron\.schedule\('0 9 1 \* \*'[\s\S]{0,200}monthlyFreeReminder/.test(cr), 'rappel mensuel branché sur le cron existant (le 1er, 9 h)');
  console.warn = realWarn;
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.warn = realWarn; console.error(e); process.exit(1); });
