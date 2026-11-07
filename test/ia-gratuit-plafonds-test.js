// Plafonds de l'IA gratuite (6 nov. 2026) : global mensuel, par utilisateur, modèle léger seul, repli sans IA, compte Expansion non limité, alerte à 80 %.
// Usage : node test/ia-gratuit-plafonds-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iagr-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // sans cela, tout profil de staging a l'accès Expansion
delete process.env.IA_GRATUIT_PLAFOND_USER_USD; delete process.env.IA_GRATUIT_PLAFOND_GLOBAL_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const access = require('../server/lib/offer1access');
const aicache = require('../server/lib/aicache');
for (const id of ['free-a', 'free-b', 'exp-u']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
access.grantAccess('exp-u', 'test');

const sonnet = 'claude-sonnet-4-5';
let calls = 0, lastModel = null;
global.fetch = async (url, init) => {
  calls++; try { lastModel = JSON.parse(init.body).model; } catch (e) { lastModel = null; }
  return { ok: true, status: 200, clone() { return this; }, async json() { return { model: lastModel, usage: { input_tokens: 100000, output_tokens: 20000 }, content: [{ type: 'text', text: '{}' }] }; } };
};
const call = (uid, model) => ab.runAs(uid, () => ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: model || sonnet, max_tokens: 100, messages: [{ role: 'user', content: 'x' }] }) }));
const warns = []; const realWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };

(async () => {
  assert(!access.hasOffer1Access('free-a') && access.hasOffer1Access('exp-u'), 'comptes : free-a sans Expansion, exp-u avec');
  // modèle léger seul
  await call('free-a', sonnet);
  assert(calls === 1 && /haiku/i.test(lastModel), 'compte gratuit : le modèle fort est remplacé par le modèle léger');
  await call('exp-u', sonnet);
  assert(/sonnet/i.test(lastModel), 'compte Expansion : modèle demandé inchangé');
  // dépense gratuite suivie
  const spent = db.prepare('SELECT costUsd AS s FROM ai_free_spend').get().s;
  assert(spent > 0.15 && spent < 0.25, 'dépense de l’IA gratuite cumulée (compte Expansion exclu) : ' + spent.toFixed(3));
  // plafond par utilisateur (défaut 2 $) : 0,1 + 0,1 par appel -> bloqué au-delà de 2 $
  let n = 0; for (let i = 0; i < 30; i++) { try { await call('free-a'); n++; } catch (e) { if (e.aiBlocked && e.freeCap) break; throw e; } }
  assert(n >= 7 && n <= 11, 'plafond par utilisateur gratuit (2 $ par défaut) atteint après ' + n + ' appels');
  const before = calls;
  let err = null; try { await call('free-a'); } catch (e) { err = e; }
  assert(err && err.aiBlocked === true && err.freeCap === true && /Disponible avec Expansion/.test(err.message) && calls === before, 'au-delà : refus sans appeler l’API, message « Disponible avec Expansion »');
  // un autre compte gratuit n'est pas touché ; un compte Expansion non plus
  await call('free-b'); assert(calls === before + 1, 'un autre compte gratuit continue (plafond par utilisateur)');
  process.env.IA_GRATUIT_PLAFOND_USER_USD = '0.001';
  await call('exp-u'); assert(calls === before + 2, 'compte Expansion : jamais limité, même sous un plafond gratuit minuscule');
  delete process.env.IA_GRATUIT_PLAFOND_USER_USD;
  // clé par activité : les dépenses « utilisateur#aActivité » comptent dans le plafond de l'utilisateur
  err = null; try { await ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: '{}' }, ab.keyFor('free-a', 7)); } catch (e) { err = e; }
  assert(err && err.freeCap === true, 'dépenses par activité comptées dans le plafond de l’utilisateur gratuit');
  // plafond global + alerte à 80 %
  warns.length = 0;
  const gs = () => db.prepare('SELECT costUsd AS s FROM ai_free_spend').get().s;
  process.env.IA_GRATUIT_PLAFOND_GLOBAL_USD = String(gs() + 100);
  await call('free-b'); // loin de 80 % du plafond
  assert(!warns.some((w) => /80 %/.test(w)), 'pas d’alerte avant 80 % du plafond global');
  process.env.IA_GRATUIT_PLAFOND_GLOBAL_USD = String((gs() + 0.1) / 0.8); // le prochain appel (+0,2 $) franchit 80 %
  await call('free-b');
  assert(warns.some((w) => /ALERTE IA gratuite : 80 %/.test(w)), 'alerte au journal à 80 % du plafond global');
  process.env.IA_GRATUIT_PLAFOND_GLOBAL_USD = '0.01';
  err = null; try { await call('free-b'); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.freeCap, 'plafond global atteint : tout compte gratuit passe en repli');
  await call('exp-u'); assert(true, 'plafond global atteint : le compte Expansion continue');
  // repli sans IA : le rapprochement d'objectif retombe sur les règles locales
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const o = require('../server/lib/objectifs');
  db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Repli', 'free-b', 1, '2026-11-01T00:00:00.000Z')").run();
  const act = db.prepare("SELECT id FROM activities WHERE name = 'Repli'").get().id;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'free-b', '#674EA7', '2026-11-01T00:00:00.000Z')").run(act);
  o.creer('free-b', { title: 'Courir un semi-marathon', activityId: act, startDate: '2026-11-09', endDate: '2027-06-01', noBridge: true });
  const rt = await o.rattachement('free-b', { title: 'Préparer un semi-marathon', activityId: act, startDate: '2026-11-09', endDate: '2027-01-04' });
  assert(rt.candidate && rt.source === 'regles', 'plafond atteint : repli sans IA (règles de ressemblance), aucune erreur bloquante');
  // cache de réponse 24 h
  let runs = 0; const fn = async () => { runs++; return { v: 1 }; };
  await aicache.memoize(['k-plafond'], fn); await aicache.memoize(['k-plafond'], fn);
  assert(runs === 1, 'cache 24 h (aicache.memoize) : le second appel identique n’appelle pas l’IA');
  console.warn = realWarn;
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.warn = realWarn; console.error(e); process.exit(1); });
