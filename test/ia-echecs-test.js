// Coût des échecs IA : délais maximaux (faux serveur lent), relances 429/529 (Retry-After, reculade bornée), arrêt immédiat sur 400/401/403
// et sur délai dépassé (pas de repli payant), réparation locale d'un JSON abîmé (taux mesuré), mémo après abandon du client.
// Faux serveur = vrai serveur HTTP local ; global.fetch y redirige les appels. Aucun appel payant. Usage : node test/ia-echecs-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-echecs-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
process.env.AI_RETRY_BASE_MS = '10'; process.env.AI_RETRY_MAX_WAIT_MS = '200';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const http = require('http');
const aicache = require('../server/lib/aicache');
const aibudget = require('../server/lib/aibudget');
const classify = require('../server/lib/goalstaskclassify');
const weekly = require('../server/lib/goalsweeklyauto');
const docanalysis = require('../server/lib/docanalysis');
const jsonrepair = require('../server/lib/jsonrepair');
const origFetch = global.fetch;
const q = (on) => { console.warn = on ? () => {} : console.warn; };

let hits = 0, behave = () => ({ status: 200, body: {} });
const server = http.createServer((req, res) => {
  hits++;
  req.on('data', () => {}); req.on('end', () => {
    const b = behave(hits);
    const send = () => { res.writeHead(b.status, Object.assign({ 'content-type': 'application/json' }, b.headers || {})); res.end(JSON.stringify(b.body)); };
    if (b.delay) setTimeout(send, b.delay).unref(); else send();
  });
});
const okBody = (text, stop) => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: stop || 'end_turn', content: [{ type: 'text', text }] });
const GOOD = JSON.stringify({ weeklyGoals: [{ weekIndex: 1, text: 'Lancer', description: 'Faire' }], confidence: 95 });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/v1/messages';
  global.fetch = (url, init) => origFetch(base, init);
  const reset = () => { aicache.memoClear(); hits = 0; };
  const fetchOnce = () => aibudget.runAs('u1', () => aibudget.fetchAnthropic('test', 'x', { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'a' }] }) }));

  // (2) Délais maximaux : un faux serveur lent ne bloque jamais au-delà du délai, et le délai dépassé ne déclenche pas de repli payant.
  process.env.AI_TIMEOUT_HEBDO_MS = '300'; process.env.AI_TIMEOUT_CLASSEMENT_MS = '300'; process.env.AI_TIMEOUT_DOCUMENTS_MS = '300';
  behave = () => ({ status: 200, delay: 3000, body: okBody(GOOD) });
  for (const [label, run] of [
    ['hebdo', () => weekly.callAi({ p: 1 }, [1])],
    ['classement', () => classify.callModel('p', 50, 'classement-tache', 'claude-haiku-4-5')],
    ['documents', () => docanalysis.call({ parts: { stable: 's', variable: 'v', images: [] }, want: { t: true, c: false }, feature: 'document-taches' })],
  ]) {
    reset(); const t0 = Date.now(); let err = null;
    try { await aibudget.runAs('u1', run); } catch (e) { err = e; }
    const dt = Date.now() - t0;
    // Marge proportionnelle au faux serveur (délai 3000 ms) : échec bien avant la réponse = le délai de 300 ms a joué ; insensible à la charge machine.
    assert(err && dt < 2500, label + ' : serveur lent (3 s) => échec au délai de 0,3 s, bien avant la réponse (' + dt + ' ms), pas d\'attente sans fin');
    assert(hits === 1, label + ' : délai dépassé => un seul appel, aucun repli vers le modèle fort (' + hits + ')');
  }
  delete process.env.AI_TIMEOUT_HEBDO_MS; delete process.env.AI_TIMEOUT_CLASSEMENT_MS; delete process.env.AI_TIMEOUT_DOCUMENTS_MS;
  const am = require('../server/lib/aimodels');
  assert(Object.values(am.TIMEOUTS_MS).every((v) => v > 0 && v <= 120000) && am.timeoutMs('inconnu') === 30000, 'chaque fonction a un délai <= 120 s (défaut 30 s)');
  // Marge : délai >= 1,8 x la durée d'une sortie maximale (max_tokens / 50 jetons par seconde pour un modèle fort) ; hebdo 1600 jetons, inter-secteurs 2500, Offre 1 4096
  assert(am.TIMEOUTS_MS.hebdo >= 1.8 * 1600 / 50 * 1000 * 0.9 && am.TIMEOUTS_MS['inter-secteurs'] >= 1.8 * 2500 / 50 * 1000 && am.TIMEOUTS_MS.offre1 >= 1.4 * 4096 / 50 * 1000, 'délais : marge suffisante sur la durée de sortie maximale');

  // Clé refusée (401/403) : une alerte au journal par heure au plus
  { const logs = []; const oe = console.error; console.error = (m) => logs.push(String(m));
    const a = aibudget.alertKeyRefused(401, 10e9), b = aibudget.alertKeyRefused(403, 10e9 + 60000), c = aibudget.alertKeyRefused(401, 10e9 + 3600001);
    console.error = oe;
    assert(a === true && b === false && c === true && logs.length === 2 && /ALERTE clé API/.test(logs[0]) && !/sk-/.test(logs.join('')), '401/403 : alerte claire au journal, une par heure au plus, sans secret'); }
  // (3) Relances 429/529
  reset(); behave = (n) => (n < 3 ? { status: 429, headers: { 'retry-after': '0' }, body: { error: {} } } : { status: 200, body: okBody('x') });
  let r = await fetchOnce(); assert(r.ok && hits === 3, '429 + Retry-After 0 deux fois puis succès : 3 requêtes, résultat obtenu (' + hits + ')');
  { const d0 = aibudget.spentWeek('u1'); reset(); behave = (n) => (n < 3 ? { status: 429, headers: { 'retry-after': '0' }, body: { error: {} } } : { status: 200, body: okBody('x') });
    await fetchOnce(); const paid = aibudget.spentWeek('u1') - d0, one = aibudget.computeCost('claude-haiku-4-5', { input_tokens: 5, output_tokens: 5 });
    assert(hits === 3 && Math.abs(paid - one) < 1e-9, 'budget : 2 relances 429 + 1 succès = UN seul coût enregistré (' + paid + ' vs ' + one + ')');
    const st = aibudget.status('u1'); assert(Math.abs(st.spentWeek - aibudget.spentWeek('u1')) < 1e-9, 'budget : aucune réservation résiduelle après relances'); }
  reset(); behave = () => ({ status: 429, headers: { 'retry-after': '30' }, body: { error: {} } });
  r = await fetchOnce(); assert(!r.ok && hits === 1, 'Retry-After 30 s > plafond d\'attente : abandon sans relance (' + hits + ')');
  reset(); behave = () => ({ status: 529, body: { error: {} } });
  let t0 = Date.now(); r = await fetchOnce(); let dt = Date.now() - t0;
  assert(!r.ok && r.status === 529 && hits === 3 && dt < 2500, '529 persistant : 1 + 2 relances au plus, reculade courte bornée (' + hits + ', ' + dt + ' ms)');
  reset(); behave = (n) => (n === 1 ? { status: 529, body: {} } : { status: 200, body: okBody('x') });
  r = await fetchOnce(); assert(r.ok && hits === 2, '529 puis succès : une seule relance');
  for (const st of [400, 401, 403, 500]) {
    reset(); behave = () => ({ status: st, body: { error: { message: 'non' } } });
    r = await fetchOnce(); assert(!r.ok && hits === 1, st + ' : aucune relance (' + hits + ')');
  }
  reset(); behave = () => ({ status: 429, headers: { 'retry-after': '5' }, body: {} });
  const ctl = AbortSignal.timeout(100); process.env.AI_RETRY_MAX_WAIT_MS = '10000';
  t0 = Date.now(); let ab = null;
  try { await aibudget.runAs('u1', () => aibudget.fetchAnthropic('t', 'x', { method: 'POST', signal: ctl, body: '{"model":"claude-haiku-4-5","max_tokens":5,"messages":[]}' })); } catch (e) { ab = e; }
  assert(ab && Date.now() - t0 < 3500, 'l\'attente d\'une relance s\'interrompt avec le délai de l\'appelant');
  process.env.AI_RETRY_MAX_WAIT_MS = '200';

  // Repli payant : 400/401/403 sur le modèle rapide => pas de second appel au modèle fort ; 500 => repli conservé
  for (const st of [400, 401, 403]) {
    reset(); behave = () => ({ status: st, body: { error: { message: 'non' } } }); q(true);
    try { await aibudget.runAs('u1', () => weekly.callAi({ p: st }, [1])); } catch (e) { /* attendu */ }
    q(false); assert(hits === 1, st + ' sur le modèle rapide : pas de repli vers le modèle fort (' + hits + ')');
  }
  reset(); behave = () => ({ status: 500, body: {} }); q(true);
  try { await aibudget.runAs('u1', () => weekly.callAi({ p: 'e500' }, [1])); } catch (e) { /* attendu */ }
  q(false); assert(hits === 2, '500 : repli conservé (2 appels, aucun jeton facturé sur un 500)');

  // (4) JSON invalide : réparation locale avant tout re-appel
  reset(); behave = () => ({ status: 200, body: okBody('Voici le plan :\n```json\n' + GOOD + '\n```\nBonne journée') });
  let g = await aibudget.runAs('u1', () => weekly.callAi({ p: 'fence' }, [1]));
  assert(g.length === 1 && hits === 1, 'clôtures + prose autour : réparé sans second appel (' + hits + ')');
  reset(); behave = () => ({ status: 200, body: okBody(GOOD.replace('"confidence":95}', '"confidence":95,}').replace('}]', ',}]')) }); // virgules finales
  g = await aibudget.runAs('u1', () => weekly.callAi({ p: 'comma' }, [1]));
  assert(g.length === 1 && hits === 1, 'virgules finales : réparé sans second appel (' + hits + ')');
  reset(); behave = () => ({ status: 200, body: okBody(GOOD.slice(0, GOOD.indexOf(',"confidence"'))) }); // fermeture manquante, arrêt normal
  g = await aibudget.runAs('u1', () => weekly.callAi({ p: 'close' }, [1])).catch(() => null);
  assert(hits >= 1, 'accolade finale manquante (arrêt normal) : lisible localement, confiance absente => repli habituel, pas de boucle (' + hits + ')');
  reset(); behave = () => ({ status: 200, body: okBody(GOOD.slice(0, 40), 'max_tokens') }); q(true);
  try { await aibudget.runAs('u1', () => weekly.callAi({ p: 'trunc' }, [1])); } catch (e) { /* attendu */ }
  q(false); assert(hits <= 3, 'sortie tronquée (max_tokens) : jamais « complétée », au plus 3 appels payants (' + hits + ')');

  // Taux de réparation sur sorties simulées abîmées (sans appel)
  const full = JSON.stringify({ suggestions: [{ targetCategory: 'a', text: 'Un "objectif" concret', reason: 'Parce que' }, { targetCategory: 'b', text: 'Autre', reason: 'Lien' }] });
  const damage = {
    clotures: (s) => '```json\n' + s + '\n```',
    prose_avant_apres: (s) => 'Voici la réponse : ' + s + ' J\'espère que cela aide.',
    virgule_finale: (s) => s.replace(/\}\]\}$/, '},]}'),
    accolade_manquante: (s) => s.slice(0, -1),
    crochet_accolade_manquants: (s) => s.slice(0, -2),
    guillemet_ouvert: (s) => s.slice(0, s.lastIndexOf('Lien') + 2),
    clotures_non_fermees: (s) => '```json\n' + s,
    deux_blocs: (s) => s + '\n\n' + s,
    tronque_milieu: (s) => s.slice(0, 60),
    prose_seule: () => 'Désolé, je ne peux pas.',
  };
  let fixed = 0, fixable = 0, wrongOk = 0; const rows = [];
  for (const [k, f] of Object.entries(damage)) {
    const out = jsonrepair.parse(f(full), { truncated: k === 'tronque_milieu' });
    const ok = !!out && JSON.stringify(out.value) === full;
    const partialOk = !!out; // lisible mais pas identique (ex. fermeture)
    if (k !== 'tronque_milieu' && k !== 'prose_seule') fixable++;
    if (ok) fixed++; else if (partialOk) wrongOk++;
    rows.push(k + ':' + (ok ? 'identique' : partialOk ? 'lisible (contenu partiel)' : 'irréparable'));
  }
  console.log('  taux : ' + fixed + '/' + fixable + ' sorties abîmées réparables rendues IDENTIQUES ; détail : ' + rows.join(' | '));
  assert(jsonrepair.parse(damage.tronque_milieu(full), { truncated: true }) === null, 'sortie tronquée max_tokens : jamais réparée (aucun élément perdu en silence)');
  assert(jsonrepair.parse(damage.guillemet_ouvert(full)) === null, 'chaîne restée ouverte : jamais fermée (aucune valeur inventée)');
  assert(jsonrepair.parse('{"a":1,"b":') === null && jsonrepair.parse('{"a":1,"b"') === null, 'clé sans valeur : jamais complétée par null');
  // Entrées pathologiques de 1 Mo : temps CPU borné (aucune regex quadratique), aucune exécution de code
  const big = 1e6, evil = { accolades: '{'.repeat(10000), accolades_1mo: '{'.repeat(big), guillemets: '{"a":"' + '"x'.repeat(big / 2), chaine_ouverte: '{"a":"' + 'x'.repeat(big), virgules: '[' + ','.repeat(big), espaces: '{"a":1' + ' '.repeat(big) + 'x', cloture_espaces: '```json' + ' '.repeat(big) + 'x', antislash: '{"a":"' + '\\'.repeat(big), crochets: '['.repeat(big), proto: '{"__proto__":{"polluted":1}}' };
  for (const [k, v] of Object.entries(evil)) { const c0 = process.cpuUsage(); jsonrepair.parse(v); const u = process.cpuUsage(c0); assert((u.user + u.system) / 1000 < 4000, 'jsonrepair ' + k + ' : CPU < 4 s (' + Math.round((u.user + u.system) / 1000) + ' ms)'); }
  assert(({}).polluted === undefined, 'jsonrepair : aucune pollution de prototype');
  assert(jsonrepair.parse(damage.prose_seule(full)) === null, 'prose sans JSON : irréparable (repli habituel)');
  assert(fixed >= 6, 'au moins 6 types d\'abîmage sur 8 réparés à l\'identique (' + fixed + ')');

  // (5) Utilisateur parti : le résultat payé est mémorisé pour la prochaine tentative
  reset(); behave = () => ({ status: 200, delay: 100, body: okBody(GOOD) });
  const first = aibudget.runAs('u1', () => weekly.callAi({ p: 'parti' }, [1])); // personne n'attend le résultat (client fermé)
  await new Promise((r2) => setTimeout(r2, 400)); await first.catch(() => {});
  const h1 = hits; await aibudget.runAs('u1', () => weekly.callAi({ p: 'parti' }, [1]));
  assert(h1 === 1 && hits === 1, 'appel terminé après départ du client : la reprise ne repaie pas (mémo, ' + hits + ' requête)');

  server.close(); console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
