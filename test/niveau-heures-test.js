// Suggestion d'heures de l'étape Temps (10 nov. 2026) : l'IA estime une fourchette d'heures totales, le code fait l'arithmétique (semaines, milieu, division, quart d'heure, plafond 168 h),
// facteur de correction à 1 faute de données, repli sans phrase, enregistrement avec l'objectif, phrase de l'écran 1. Usage : node test/niveau-heures-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-heures-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* données de base facultatives */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const h = require('../server/lib/objectifs-heures');
const aicache = require('../server/lib/aicache');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // Validation de la fourchette
  assert(h.validRange({ min: 90, max: 140 }) && !h.validRange({ min: 0, max: 5 }) && !h.validRange({ min: 10, max: 5 }) && !h.validRange({ min: 'a', max: 5 }) && !h.validRange({ min: 1, max: 1e9 }) && !h.validRange(null) && !h.validRange({ min: NaN, max: 4 }), 'fourchette : nombres finis, 0 < min <= max, bornée ; sinon rejet');
  // Arithmétique : milieu, division, quart d'heure, plafond
  let c = h.compute({ min: 90, max: 140 }, 30, 1);
  assert(c.weeks === 30 && c.perWeekMin.lo === 180 && c.perWeekMin.hi === 285 && c.perWeekMin.mid === 225 && c.totalMin.min === 5400 && c.totalMin.max === 8400, '90–140 h ÷ 30 sem : 3h – 4h45, milieu 3h45');
  c = h.compute({ min: 100, max: 100 }, 7, 1);
  assert(c.perWeekMin.mid === 855, '100 h ÷ 7 sem = 14,29 h arrondi au quart d’heure (14h15)');
  c = h.compute({ min: 5000, max: 9000 }, 1, 1);
  assert(c.perWeekMin.hi === 168 * 60 && c.perWeekMin.mid === 168 * 60, 'plafond : 168 h par semaine');
  c = h.compute({ min: 90, max: 140 }, 0.2, 1);
  assert(c.weeks === 1, 'au moins une semaine');
  // Facteur de correction : 1 sans données suffisantes ; moyenne (fait ÷ suggéré) au-delà ; compte d'abord, sinon agrégat
  const mk = (n, ratio) => Array.from({ length: n }, () => ({ suggested: 100, actual: 100 * ratio }));
  assert(h.factor([]) === 1 && h.factor(mk(19, 0.5)) === 1 && h.factor(null) === 1, 'facteur 1 sans assez d’objectifs terminés (20 requis)');
  assert(Math.abs(h.factor(mk(20, 1.25)) - 1.25) < 1e-9 && Math.abs(h.factor(mk(20, 1.25).concat([{ suggested: 0, actual: 5 }, { suggested: 10, actual: NaN }])) - 1.25) < 1e-9, 'facteur = moyenne fait ÷ suggéré ; paires invalides ignorées');
  assert(h.factorFor(mk(20, 2), mk(40, 1.5)) === 2 && Math.abs(h.factorFor(mk(5, 2), mk(40, 1.5)) - 1.5) < 1e-9 && h.factorFor(mk(5, 2), mk(5, 1.5)) === 1, 'le compte d’abord, sinon l’agrégat anonyme, sinon 1');
  c = h.compute({ min: 90, max: 140 }, 30, 1.5);
  assert(c.totalMin.min === 8100 && c.perWeekMin.mid === 345, 'le facteur multiplie la fourchette (décalage), calculé par le code');

  // Repli : aucune suggestion (jamais de blocage)
  const body = { title: 'Courir un marathon', endDate: '2027-06-01', startDate: '2026-11-10', activityName: 'Sport', niveau: { answers: [{ q: 'a', a: 'b', i: 2 }, { q: 'c', a: 'd', i: 2 }, { q: 'e', a: 'f', i: 1 }] } };
  assert((await h.suggest('u1', body, '2026-11-10')).suggestion === null, 'sans clé IA : aucune suggestion');
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL;
  const realFetch = global.fetch, calls = [];
  let mode = 'sure';
  global.fetch = async (url, init) => {
    const b = JSON.parse(init.body); calls.push(b.model);
    if (mode === 'down') throw new TypeError('réseau');
    const conf = mode === 'unsure' && calls.length === 1 ? 40 : 90;
    const out = mode === 'bad' ? { min: 0, max: -3, confidence: 95 } : { min: 90, max: 140, raison: 'Écart important', confidence: conf };
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: JSON.stringify(out) }] }) };
  };
  try {
    aicache.memoClear(); mode = 'sure';
    let r = (await h.suggest('u1', body, '2026-11-10')).suggestion;
    assert(r && r.level === 'intermediaire' && r.range.min === 90 && r.weeks === 29 && r.perWeekMin.mid === 240 && r.factor === 1 && calls.length === 1 && /haiku/.test(calls[0]), 'Haiku sûr : fourchette, semaines jusqu’à l’échéance (29), milieu 4h, facteur 1');
    await h.suggest('u1', body, '2026-11-10');
    assert(calls.length === 1, 'mémo : même objectif, même niveau, aucun nouvel appel');
    aicache.memoClear(); calls.length = 0; mode = 'unsure';
    r = (await h.suggest('u1', body, '2026-11-10')).suggestion;
    assert(r && calls.length === 2 && /sonnet/.test(calls[1]), 'confiance < 80 : modèle fort');
    aicache.memoClear(); calls.length = 0; mode = 'bad';
    assert((await h.suggest('u1', body, '2026-11-10')).suggestion === null, 'fourchette invalide : aucune suggestion');
    aicache.memoClear(); mode = 'down';
    assert((await h.suggest('u1', body, '2026-11-10')).suggestion === null, 'panne : aucune suggestion');
    aicache.memoClear(); mode = 'sure';
    assert((await h.suggest('u1', Object.assign({}, body, { endDate: null }), '2026-11-10')).suggestion === null && (await h.suggest('u1', Object.assign({}, body, { endDate: '2026-11-01' }), '2026-11-10')).suggestion === null && (await h.suggest('u1', Object.assign({}, body, { niveau: undefined }), '2026-11-10')).suggestion === null, 'sans échéance, échéance passée ou sans réponses de niveau : aucune suggestion');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }

  // Enregistrement avec l'objectif
  const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
  if (m) {
    o.setTasksCheck(() => true);
    const prop = o.proposer(m.userId, { title: 'Courir un marathon', activityId: m.activityId, level: 'activite', endDate: '2027-06-01' });
    const sug = { range: { min: 90, max: 140 }, perWeekMin: { mid: 240 }, factor: 1, weeks: 30, reason: 'Écart important' };
    const made = o.creer(m.userId, { title: 'Courir un marathon', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], hoursPerWeek: 5, suggestion: sug });
    const meta = JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(made.id).metaJson);
    assert(meta.suggestion && meta.suggestion.suggestedMin === 240 && meta.suggestion.range.max === 140 && meta.suggestion.factor === 1 && meta.suggestion.weeks === 30 && meta.hoursPerWeek === 5, 'objectif créé : suggestion (milieu, fourchette, facteur) et heures choisies enregistrées');
    const sans = o.creer(m.userId, { title: 'Objectif sans suggestion', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-12-01', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], suggestion: { range: { min: 0, max: 1 }, perWeekMin: { mid: 5 }, factor: 1, weeks: 3 } });
    assert(!JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(sans.id).metaJson).suggestion, 'suggestion invalide : non enregistrée');
  }

  // Phrase de l'écran 1 (code client exécuté) et interface inchangée
  const js = read('public/js/objectifs-creer.js'), css = read('public/css/objectifs-creer.css'), doc = read('docs/ia/ia-appels.md');
  const hhSrc = js.slice(js.indexOf('  function hh(min)'), js.indexOf('\n', js.indexOf('  function hh(min)')));
  const sSrc = js.slice(js.indexOf('    function tpSentence()'), js.indexOf('    function tpScreen1()'));
  const mkS = new Function('tp', 'tr', hhSrc + '\n' + sSrc + '\nreturn tpSentence;');
  const tr = (s) => s;
  const sg = { level: 'intermediaire', totalMin: { min: 5400, max: 8400 }, weeks: 30, perWeekMin: { lo: 180, mid: 240, hi: 285 } };
  assert(mkS({ sugg: sg, e: { me: { passeMin: 360 } } }, tr)() === 'Intermédiaire : 90–140h ÷ 30 sem = 3h–4h45 · Chrono 6h (−2h)', 'phrase : niveau : totaux ÷ semaines = fourchette par semaine · Chrono (écart signé du milieu)');
  assert(mkS({ sugg: sg, e: { me: { passeMin: 120 } } }, tr)() === 'Intermédiaire : 90–140h ÷ 30 sem = 3h–4h45 · Chrono 2h (+2h)', 'écart positif : « + »');
  assert(mkS({ sugg: sg, e: { me: { passeMin: null } } }, tr)() === 'Intermédiaire : 90–140h ÷ 30 sem = 3h–4h45', 'sans Chrono : pas de partie « Chrono »');
  assert(js.includes("if (tp.sugg) page.appendChild(el('p', 'hint objTNote', tpSentence()))") && js.includes('tp.valueMin = g ? g.perWeekMin.mid'), 'phrase grise sous le tableau (classe existante) ; valeur de départ = milieu, sinon Chrono');
  assert(!/niveau-heures|objTSug/.test(css) && doc.includes('`niveau-heures`'), 'aucune classe ni couleur nouvelle ; appel documenté');
  console.log(failed ? '\nniveau-heures-test : ' + failed + ' ÉCHEC(S)' : '\nniveau-heures-test : OK'); process.exit(failed ? 1 : 0);
})();
