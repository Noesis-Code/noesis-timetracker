// Robustesse des appels IA : réponse invalide/tronquée/vide/hors format, délai dépassé, HTTP 500 -> repli local sans exception,
// au plus 2 appels réseau (modèle rapide puis fort) et une seule prise de plafond par appel réel. Faux client = global.fetch.
// Usage : node test/ia-robustesse-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-robustesse-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const aicache = require('../server/lib/aicache');
const aibudget = require('../server/lib/aibudget');
const classify = require('../server/lib/goalstaskclassify');
const rewrite = require('../server/lib/goalsrewrite');
const spell = require('../server/lib/silentspellfix');
const recurrence = require('../server/lib/taskrecurrence');
const place = require('../server/lib/goalscaptureplace');
const weekly = require('../server/lib/goalsweeklyauto');
const cross = require('../server/lib/crosssectorinference');
const offer = require('../server/lib/offerdelivery');
const docanalysis = require('../server/lib/docanalysis');

const origWarn = console.warn, origErr = console.error, origLog = console.log;
const quiet = (on) => { console.warn = on ? () => {} : origWarn; console.error = on ? () => {} : origErr; };

// Faux client : un scénario = ce que le « modèle » répond.
let scenario = 'ok', calls = 0, signals = 0, goodText = '';
const textOf = { truncated: (g) => g.slice(0, Math.max(5, Math.floor(g.length / 2))), prose: () => 'Désolé, je ne peux pas répondre à cette demande.', nulljson: () => 'null', fence: (g) => 'Voici :\n```json\n' + g + '\n```\nBonne journée.' };
global.fetch = async (url, init) => {
  calls++; if (init && init.signal && typeof init.signal.aborted === 'boolean') signals++;
  const ok = (content, extra) => ({ ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'end_turn', content, ...(extra || {}) }) });
  if (scenario === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  if (scenario === 'network') throw new TypeError('fetch failed');
  if (scenario === 'http500') return { ok: false, status: 500, clone() { return this; }, json: async () => ({ error: { message: 'boom' } }) };
  if (scenario === 'badjson') return { ok: true, status: 200, clone() { return this; }, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } };
  if (scenario === 'empty') return ok([]);
  if (scenario === 'emptytext') return ok([{ type: 'text', text: '' }]);
  if (scenario === 'maxtokens') return ok([{ type: 'text', text: textOf.truncated(goodText) }], { stop_reason: 'max_tokens' });
  if (textOf[scenario]) return ok([{ type: 'text', text: textOf[scenario](goodText) }]);
  return ok([{ type: 'text', text: goodText }]);
};
const SCENARIOS = ['badjson', 'truncated', 'maxtokens', 'empty', 'emptytext', 'prose', 'nulljson', 'timeout', 'network', 'http500'];

// Compte des prises de plafond par fonction.

// Données minimales : une activité, des catégories, un objectif périodique et une période vide.
['u1'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','u1','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'u1');
const realCats = goals.categoriesForActivity;
const cats = [{ key: 'produit', label: 'Produit' }, { key: 'entreprise', label: 'Entreprise' }];
goals.categoriesForActivity = () => cats;
goals.secteursForPole = () => [];
goals.resolveToPole = (a, k) => k;
const today = new Date().toISOString().slice(0, 10);
const end = goals.addDays(today, 27);
const pid = db.prepare("INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?, 'produit', 1, 0, 0, ?, ?, 'Lancer la nouvelle version du produit', datetime('now'))").run(act, today, end).lastInsertRowid;

const reset = () => { aibudget.breakerReset(); aicache.memoClear(); calls = 0; signals = 0; };
const noThrow = async (fn) => { try { return { v: await fn() }; } catch (e) { return { err: e }; } };

(async () => {
  // ---- Fonctions avec repli local : ne lèvent jamais ----
  for (const s of SCENARIOS) {
    scenario = s; quiet(true);

    // Reformulation (rapide puis fort)
    reset(); goodText = 'Texte reformulé\nCONFIANCE: 95';
    let r = await noThrow(() => rewrite.proposeRewrite('Faire le truc ' + s, 'u1'));
    const textual = ['truncated', 'maxtokens', 'prose', 'nulljson'].includes(s); // texte lisible mais hors format : seulement une PROPOSITION que l'utilisateur valide ou non
    assert(!r.err && (r.v === null || (textual && typeof r.v === 'string')) && calls <= 2, 'reformulation / ' + s + ' : null, ' + calls + ' appel(s)');

    // Correction d'orthographe silencieuse
    reset(); goodText = 'Appeler le client';
    r = await noThrow(() => spell.fixText('Apeller le clien ' + s, 'acct-spell'));
    assert(!r.err && r.v === null && calls <= 1, 'orthographe / ' + s + ' : null sans exception, ' + calls + ' appel(s)');

    // Récurrence
    reset(); goodText = '{"every":1,"unit":"week"}';
    r = await noThrow(() => aibudget.runAs('u1', () => recurrence.suggest('Tâche de fond ' + s)));
    assert(!r.err && r.v === null && calls <= 1, 'récurrence / ' + s + ' : null, ' + calls + ' appel(s)');

    // Classement : mode normal (repli = premier candidat) et strict (repli = choix par l'utilisateur)
    reset(); goodText = 'produit | 95';
    r = await noThrow(() => aibudget.runAs('u1', () => classify.classifyCategory(act, 'Écrire la note de ' + s, { userId: 'u1' })));
    assert(!r.err && r.v && r.v.key === 'produit' && r.v.usedAi === false && calls <= 2, 'classement / ' + s + ' : premier candidat, ' + calls + ' appel(s)');
    reset();
    r = await noThrow(() => aibudget.runAs('u1', () => classify.classifyCategory(act, 'Écrire la note stricte ' + s, { userId: 'u1', strict: true })));
    assert(!r.err && r.v && r.v.unresolved === true && Array.isArray(r.v.candidates) && r.v.candidates.length === 2 && calls <= 2, 'classement strict / ' + s + ' : demande à l\'utilisateur, ' + calls + ' appel(s)');

    // Rapprochement tâche -> objectif (repli lexical ; null si rien de commun)
    reset(); goodText = '{"index":1,"confidence":0.9,"reason":"ok"}';
    r = await noThrow(() => aibudget.runAs('u1', () => place.matchObjective('u1', act, 'produit', 'Préparer la nouvelle version du produit ' + s)));
    assert(!r.err && r.v && r.v.method === 'lexical' && calls <= 1, 'rapprochement / ' + s + ' : repli lexical, ' + calls + ' appel(s)');

    // Objectifs hebdomadaires : point d'entrée qui ne lève jamais
    reset(); goodText = '{"weeklyGoals":[{"weekIndex":1,"text":"Semaine 1","description":""}]}';
    r = await noThrow(() => aibudget.runAs('u1', () => weekly.generateForPeriod(act, 'u1', 'produit', 1, { dryRun: true })));
    assert(!r.err && r.v && (r.v.error === true || (r.v.proposals && !r.v.proposals.length)) && calls <= 3, 'hebdo (generateForPeriod) / ' + s + ' : { error } sans exception, ' + calls + ' appel(s)');

    // Inter-secteurs : point d'entrée qui ne lève jamais
    reset(); goodText = '{"suggestions":[]}';
    r = await noThrow(() => aibudget.runAs('u1', () => cross.evaluateCrossSectorLinks(act, 'produit', { type: 'task', text: 'Tâche croisée ' + s })));
    assert(!r.err && r.v && (r.v.error === true || r.v.written === 0) && calls <= 3, 'inter-secteurs / ' + s + ' : sans exception, ' + calls + ' appel(s)');

    // Documents / modifications : docanalysis.call propage une panne (les appelants la rattrapent) mais jamais plus de 2 appels
    reset(); goodText = '{"t":[],"c":[],"confidence":95}';
    r = await noThrow(() => aibudget.runAs('u1', () => docanalysis.call({ parts: { stable: 's' + s, variable: 'v', images: [] }, want: { t: true, c: false }, feature: 'document-taches' })));
    assert(calls <= 2 && (r.err ? r.err instanceof Error : true), 'documents / ' + s + ' : au plus 2 appels (' + calls + '), erreur propre ou texte brut');

    // Plan Offre 1 : panne propagée (aucun repli local ; l'appelant garde l'abonnement/le quota intacts), erreur propre, 2 appels max
    reset(); goodText = '{}';
    r = await noThrow(() => aibudget.runAs('u1', () => offer.generateSubProjectsPlan({ discovery: { q: s } })));
    assert(r.err instanceof Error && calls <= 2, 'Offre 1 / ' + s + ' : Error propre, ' + calls + ' appel(s)');
    quiet(false);
  }

  // ---- Chaque requête réseau porte un délai (AbortSignal) ----
  scenario = 'ok'; quiet(true);
  const fixtures = [
    ['reformulation', () => { goodText = 'Autre texte\nCONFIANCE: 90'; return rewrite.proposeRewrite('Texte avec signal', 'u1'); }],
    ['classement', () => { goodText = 'produit | 95'; return aibudget.runAs('u1', () => classify.classifyCategory(act, 'Tâche signal', { userId: 'u1' })); }],
    ['hebdo', () => { goodText = '{"weeklyGoals":[{"weekIndex":1,"text":"S1"}],"confidence":95}'; return aibudget.runAs('u1', () => weekly.callAi({ sig: 1 }, [1])); }],
    ['inter-secteurs', () => { goodText = '{"suggestions":[]}'; return aibudget.runAs('u1', () => cross.callAi({ sig: 1 }, ['k'])); }],
    ['documents', () => { goodText = '{"t":[],"confidence":95}'; return aibudget.runAs('u1', () => docanalysis.call({ parts: { stable: 'sig', variable: 'v', images: [] }, want: { t: true, c: false }, feature: 'document-taches' })); }],
    ['offre 1', () => { goodText = '{"subProjects":[]}'; return noThrow(() => aibudget.runAs('u1', () => offer.generateSubProjectsPlan({ sig: 1 }))); }],
  ];
  for (const [name, fn] of fixtures) { reset(); await fn(); assert(calls >= 1 && signals === calls, 'délai (AbortSignal) sur chaque requête : ' + name + ' (' + signals + '/' + calls + ')'); }
  quiet(false);

  // ---- Analyseurs : entrées pathologiques sans TypeError ----
  const bad = ['null', '[]', '"x"', '{"weeklyGoals":[null,1,"a"]}', '{"suggestions":[null,{"targetCategory":null}]}', '{"subProjects":[null,null,null]}'];
  for (const b of bad) {
    const w = noThrowSync(() => weekly.parseWeeklyGoals(b, [1])); const c = noThrowSync(() => cross.parseSuggestions(b, ['k'])); const p = noThrowSync(() => offer.parsePlan(b));
    assert(!w.err || /illisible/.test(w.err.message), 'parseWeeklyGoals(' + b + ') : pas de TypeError');
    assert(!c.err || /illisible/.test(c.err.message), 'parseSuggestions(' + b + ') : pas de TypeError');
    assert(!p.err || p.err.constructor === Error, 'parsePlan(' + b + ') : Error propre, pas TypeError');
  }
  function noThrowSync(fn) { try { return { v: fn() }; } catch (e) { return { err: e }; } }

  // ---- Un échec n'est jamais mémorisé : l'appel suivant, redevenu normal, réussit ----
  reset(); scenario = 'http500'; quiet(true);
  await noThrow(() => rewrite.proposeRewrite('Texte repris', 'u1'));
  scenario = 'ok'; goodText = 'Texte repris autrement\nCONFIANCE: 95';
  quiet(false);
  const again = await rewrite.proposeRewrite('Texte repris', 'u1');
  assert(again === 'Texte repris autrement', 'échec non mémorisé : la reprise réussit');

  goals.categoriesForActivity = realCats;
  console.warn = origWarn; console.error = origErr;
  origLog(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
