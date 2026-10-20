// Panne fournisseur IA : 30 min d'erreurs 529 (faux fetch, horloge simulée) sur toutes les fonctions, disjoncteur, aucun coût doublé, aucune file de relances.
// Seuil hebdomadaire adaptatif (calcul pur seuilAlerte) : 10 intensifs / 100 moyens / 1. Aucun appel payant. Usage : node test/ia-panne-fournisseur-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-panne-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000'; process.env.AI_BUDGET_SYSTEM_DAY_USD = '1000'; process.env.AI_BUDGET_MONTH_USD = '100000';
process.env.AI_RETRY_BASE_MS = '1'; process.env.AI_RETRY_MAX_WAIT_MS = '2'; delete process.env.AI_BREAKER_N; delete process.env.AI_BREAKER_OPEN_MS;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aibudget = require('../server/lib/aibudget');
const { seuilAlerte } = require('../server/lib/aialertthreshold');
const db = require('../server/db');
console.warn = () => {};

// (1) Seuil adaptatif : semaine seulement (décision d'Émilien : pas de seuil quotidien)
assert(seuilAlerte(10).semaineCad === 35 && Math.abs(seuilAlerte(10).semaineUsd - 35 * 0.72) < 1e-9 && seuilAlerte(10).jourUsd === undefined, '10 comptes intensifs : 35 CAD/semaine, aucun seuil quotidien');
assert(seuilAlerte(100).semaineCad === 350, '100 comptes moyens : 350 CAD/semaine');
assert(seuilAlerte(1).semaineCad === 3.5, '1 compte : 3,50 CAD/semaine');
assert(seuilAlerte(0).semaineCad === 3.5 && seuilAlerte(NaN).semaineCad === 3.5 && seuilAlerte(-4).semaineCad === 3.5, '0, NaN, négatif : au moins 1 compte');
process.env.AI_ALERT_ADAPTIVE = '1';
assert(aibudget.alertDayCad() === 8, 'même avec le drapeau : le seuil quotidien reste 8 CAD (inchangé)');
delete process.env.AI_ALERT_ADAPTIVE;
db.exec('DELETE FROM ai_usage_log');

// (2) Panne 529 de 30 min
const FEATURES = ['classement-tache', 'reformulation', 'hebdo', 'documents', 'inter-secteurs', 'rapprochement', 'plan-semaine', 'orthographe'];
let netCalls = 0, mode = 'down';
const realNow = Date.now; let clock = realNow.call(Date);
Date.now = () => clock;
const okBody = { model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: '{}' }] };
global.fetch = async () => {
  netCalls++;
  if (mode === 'down') return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }), { status: 529 });
  return new Response(JSON.stringify(okBody), { status: 200, headers: { 'content-type': 'application/json' } });
};
const call = (u, f) => aibudget.runAs(u, () => aibudget.fetchAnthropic(f, 'x', { method: 'POST', body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'a' }] }) }));
(async () => {
  aibudget.breakerReset();
  let throwsBreaker = 0, returns529 = 0, i = 0;
  const end = clock + 30 * 60000;
  while (clock < end) { // un appel par fonction toutes les 10 s pendant 30 min
    for (const f of FEATURES) {
      try { const r = await call('u' + (i++ % 3), f); if (r.status === 529) returns529++; }
      catch (e) { if (e.breakerOpen && e.status === 529) throwsBreaker++; }
    }
    clock += 10000;
  }
  const tentatives = 30 * 6 * FEATURES.length;
  const spent = db.prepare('SELECT COALESCE(SUM(costUsd),0) AS c, COALESCE(SUM(calls),0) AS n FROM ai_usage_log').get();
  console.log('  info ' + tentatives + ' tentatives, ' + netCalls + ' appels réseau réels, ' + returns529 + ' réponses 529, ' + throwsBreaker + ' refus du disjoncteur');
  assert(returns529 > 0 && throwsBreaker > 0, 'le disjoncteur s\'ouvre après des échecs de suite');
  assert(netCalls < tentatives / 5, 'appels réseau réduits de plus de 80 % pendant la panne (sondes seulement)');
  assert(spent.c === 0 && spent.n === 0, 'aucun coût ni appel comptabilisé pendant la panne (529 jamais facturés)');
  assert(aibudget.status('u0').spentDay === 0 && aibudget.status('system').spentDay === 0, 'aucune réservation en vol laissée (budget du jour intact)');
  // Aucune file de relances : tout est synchrone et borné, rien en attente
  assert(process._getActiveHandles().filter((h) => h.constructor && h.constructor.name === 'Timeout').length === 0, 'aucun minuteur de relance en attente (pas de file)');
  // Reprise sondée
  clock += 61000; await call('u0', 'hebdo').catch(() => {}); // sonde encore en panne : rouvre à l'instant
  mode = 'up'; const before = netCalls;
  let blocked = false; try { await call('u0', 'hebdo'); } catch (e) { blocked = !!e.breakerOpen; }
  assert(blocked && netCalls === before, 'juste après la panne : encore suspendu, aucun appel réseau');
  clock += 61000;
  const r = await call('u0', 'hebdo');
  assert(r.status === 200 && netCalls === before + 1, 'après le délai : une seule sonde, succès, refermé');
  const r2 = await call('u1', 'classement-tache');
  assert(r2.status === 200, 'appels normaux rétablis');
  const row = db.prepare('SELECT SUM(calls) AS n FROM ai_usage_log').get();
  assert(row.n === 2, 'coût comptabilisé une fois par appel réussi (2 appels = 2 lignes)');
  // Sonde qui échoue : rouvre, un seul appel réseau
  mode = 'down'; aibudget.breakerReset();
  for (let k = 0; k < 5; k++) await call('u0', 'hebdo').catch(() => {});
  clock += 61000; const n0 = netCalls;
  await Promise.all(['a', 'b', 'c'].map((f) => call('u0', f).catch(() => {})));
  assert(netCalls - n0 <= 3 && netCalls - n0 >= 1, 'sonde échouée : un seul appel (relances comprises) parmi 3 concurrents');
  let again = false; try { await call('u0', 'hebdo'); } catch (e) { again = !!e.breakerOpen; }
  assert(again, 'sonde échouée : disjoncteur rouvert');
  // Message utilisateur existant
  const msg = require('../server/lib/usermessage').userMessage(Object.assign(new Error('HTTP 529 (appels IA suspendus après des échecs répétés)'), { status: 529 }));
  assert(msg === 'Génération indisponible pour le moment.', 'message utilisateur existant « Génération indisponible… »');
  Date.now = realNow;
  console.log(failed ? '\n' + failed + ' ÉCHEC(S)' : '\nTout est vert.');
  process.exit(failed ? 1 : 0);
})();
