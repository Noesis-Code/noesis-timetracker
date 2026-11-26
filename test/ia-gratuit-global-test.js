// Garde-fou global mensuel de l'IA gratuite (7 nov. 2026) : pool de 120 $ USD/mois, coupure à 80 % (réserve 20 %), alertes à 50 % et 90 % (une fois par mois), alerte annuelle,
// rappel du 1er ; comptes Expansion exclus ; variables réglables ; administrateur seulement. Usage : node test/ia-gratuit-global-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iaglob-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0';
for (const k of ['IA_GRATUITE_POOL_MENSUEL_USD', 'IA_GRATUITE_RESERVE_PCT', 'IA_GRATUITE_CREDIT_MENSUEL_USD', 'IA_GRATUITE_PERTE_ANNUELLE_MAX', 'IA_EXPANSION_MARGE_ANNUELLE_USD', 'IA_ALERTE_ADMIN_USER_IDS', 'IA_ALERTE_ADMIN_EMAILS']) delete process.env[k];
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const access = require('../server/lib/offer1access');
const push = require('../server/lib/push');
for (const id of ['g-exp', 'g-admin']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
access.grantAccess('g-exp', 'test');
const sent = []; push.sendToUsers = (ids, payload) => { sent.push({ ids: [].concat(ids), payload }); };
const warns = []; const realWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
const reset = () => { db.prepare('DELETE FROM ai_free_cost').run(); db.prepare('DELETE FROM ai_alerts_sent').run(); sent.length = 0; };
let k = 0; const fresh = () => 'g-x' + (++k); // un nouveau compte gratuit à chaque appel (le crédit par utilisateur reste hors sujet ici)
let calls = 0;
global.fetch = async (url, init) => { calls++; const m = JSON.parse(init.body).model; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: m, usage: { input_tokens: 1e6, output_tokens: 0 }, content: [] }; } }; }; // haiku : 1 $ par appel
const call = (uid) => ab.runAs(uid, () => ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }) }));
const blocked = async () => { try { await call(fresh()); return null; } catch (e) { return e; } };

(async () => {
  let m = ab.freeMonthCost();
  assert(m.pool === 120 && m.reservePct === 20 && Math.abs(m.cutoff - 96) < 1e-9, 'défauts : pool 120 $, réserve 20 %, coupure à 96 $ (80 %)');
  await call(fresh()); await call('g-exp');
  assert(Math.abs(ab.freeMonthCost().cost - 1) < 1e-6, 'coût du mois : comptes gratuits seulement (1 $), compte Expansion exclu');
  // garde-fou : variables modifiées (pool 10 $, réserve 20 % -> coupure à 8 $)
  reset(); process.env.IA_GRATUITE_POOL_MENSUEL_USD = '10'; process.env.IA_GRATUITE_RESERVE_PCT = '20';
  m = ab.freeMonthCost(); assert(m.pool === 10 && Math.abs(m.cutoff - 8) < 1e-9, 'variables IA_GRATUITE_POOL_MENSUEL_USD et IA_GRATUITE_RESERVE_PCT lues sans coder');
  for (let i = 0; i < 8; i++) await call(fresh());
  const c0 = calls; const err = await blocked();
  assert(err && err.aiBlocked && err.freeCap && /Disponible avec Expansion/.test(err.message) && /reprend le 1er/.test(err.message) && calls === c0, 'coût du mois à 80 % du pool : l’IA gratuite se coupe (repli sans IA), sans appeler l’API, reprise le 1er du mois suivant');
  await call('g-exp'); assert(calls === c0 + 1, 'compte Expansion : jamais coupé par le garde-fou');
  // alertes à 50 % et 90 % : une fois chacune, par mois, à l'administrateur seulement
  reset(); process.env.IA_GRATUITE_POOL_MENSUEL_USD = '10'; process.env.IA_GRATUITE_RESERVE_PCT = '0'; process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-admin';
  for (let i = 0; i < 4; i++) await call(fresh());
  assert(sent.length === 0, 'aucune alerte avant 50 %');
  await call(fresh());
  assert(sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'g-admin' && /50 %/.test(sent[0].payload.title) && /5,00 \$/.test(sent[0].payload.body) && /50 % du pool de 10,00 \$/.test(sent[0].payload.body), 'alerte à 50 % : coût du mois en USD et pourcentage, administrateur seulement : ' + (sent[0] && sent[0].payload.body));
  for (let i = 0; i < 3; i++) await call(fresh());
  assert(sent.length === 1, 'pas de nouvelle alerte entre 50 % et 90 %');
  await call(fresh());
  assert(sent.length === 2 && /90 %/.test(sent[1].payload.title) && /9,00 \$/.test(sent[1].payload.body), 'alerte à 90 % : une notification, 9,00 $');
  await call(fresh());
  assert(sent.length === 2, 'chaque alerte une seule fois par mois (le pool n’a pas d’alerte à 100 %)');
  const ym = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  const mem = db.prepare("SELECT kind, day FROM ai_alerts_sent WHERE kind IN ('ia-gratuit-50', 'ia-gratuit-90')").all();
  assert(mem.length === 2 && mem.every((r) => r.day === ym), 'alertes mémorisées par mois (remises à zéro le 1er) : ' + JSON.stringify(mem));
  assert(!sent.some((s) => s.ids.some((i) => i !== 'g-admin')), 'aucun envoi aux utilisateurs');
  // alerte annuelle conservée (alerte seulement, plus de coupure)
  reset(); delete process.env.IA_GRATUITE_POOL_MENSUEL_USD; delete process.env.IA_GRATUITE_RESERVE_PCT; process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX = '4';
  await call(fresh()); assert(sent.length === 0, 'perte annuelle : rien avant 50 %');
  await call(fresh()); assert(sent.length === 1 && /perte annuelle/.test(sent[0].payload.title), 'alerte annuelle à 50 % de la perte maximale, une seule fois');
  await call(fresh()); await call(fresh()); await call(fresh()); assert(sent.length === 1, 'alerte annuelle : jamais deux fois la même année, et aucune coupure (le pool mensuel décide)');
  delete process.env.IA_GRATUITE_PERTE_ANNUELLE_MAX;
  // administrateur par courriel, union avec les ids, sans doublon
  db.prepare("UPDATE users SET email = ? WHERE id = 'g-admin'").run('Admin@CompagnieNoesis.com');
  delete process.env.IA_ALERTE_ADMIN_USER_IDS; process.env.IA_ALERTE_ADMIN_EMAILS = ' admin@compagnienoesis.com , inconnu@x.com ';
  reset(); db.prepare('INSERT INTO ai_free_cost (day, costUsd) VALUES (?, ?)').run('2026-09-10', 4); db.prepare('INSERT INTO ai_free_cost (day, costUsd) VALUES (?, ?)').run('2026-10-10', 5);
  const body = ab.monthlyFreeReminder(new Date(2026, 10, 1, 9));
  assert(sent.length === 1 && sent[0].ids.length === 1 && sent[0].ids[0] === 'g-admin', 'rappel du 1er : une notification, administrateur trouvé par courriel (casse et espaces ignorés)');
  assert(/5,00 \$ le mois écoulé \(4 % du pool de 120,00 \$\), précédent 4,00 \$, hausse de 25 %/.test(body), 'rappel : coût du mois écoulé en USD, % du pool, tendance : ' + body);
  assert(ab.monthlyFreeReminder(new Date(2026, 10, 1, 9)) === null && sent.length === 1, 'une seule notification par rappel');
  process.env.IA_ALERTE_ADMIN_USER_IDS = 'g-admin'; reset(); db.prepare('INSERT INTO ai_free_cost (day, costUsd) VALUES (?, ?)').run('2026-10-10', 5);
  ab.monthlyFreeReminder(new Date(2026, 10, 1, 9)); assert(sent.length === 1 && sent[0].ids.length === 1, 'trouvé par id ET par courriel : une seule notification pour le compte');
  process.env.IA_ALERTE_ADMIN_EMAILS = 'personne@nulle-part.com'; delete process.env.IA_ALERTE_ADMIN_USER_IDS; reset();
  const none = ab.monthlyFreeReminder(new Date(2026, 10, 1, 9)); assert(typeof none === 'string' && sent.length === 0, 'aucun compte ne correspond : journal seulement, sans erreur');
  delete process.env.IA_ALERTE_ADMIN_EMAILS;
  const cr = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'lib', 'subscriptioncron.js'), 'utf8');
  assert(/cron\.schedule\('0 9 1 \* \*'[\s\S]{0,200}monthlyFreeReminder/.test(cr), 'rappel mensuel branché sur le cron existant (le 1er, 9 h)');
  console.warn = realWarn;
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.warn = realWarn; console.error(e); process.exit(1); });
