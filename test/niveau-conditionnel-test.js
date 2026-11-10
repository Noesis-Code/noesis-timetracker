// Page Niveau CONDITIONNELLE (10 nov. 2026) : sautée si l'objectif est sans progression (pertinent = non) ou si un objectif similaire récent donne déjà le niveau ; seules les questions manquantes sont posées
// (le Chrono répond à la régularité et à l'ancienneté dès 4 semaines de données) ; IA en panne : trois questions fixes. Usage : node test/niveau-conditionnel-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-niveau-cond-');
delete process.env.ANTHROPIC_API_KEY;
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
require('../server/lib/objectifs'); // crée la table user_objectives
const nv = require('../server/lib/objectifs-niveau');
const aicache = require('../server/lib/aicache');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const TODAY = '2026-11-10';
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sport', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const entry = (iso) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES ('u1', ?, '', ?, ?, 1800, ?, 'x')").run(act, iso + 'T08:00:00Z', iso + 'T08:30:00Z', iso);
const objective = (title, created, meta, level) => { const id = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, stepsJson, taskIdsJson, createdAt) VALUES ('u1', ?, ?, 6, 'mois', ?, ?, 4, 0, '[]', '[]', ?)").run(act, title, TODAY, add(TODAY, 200), created + 'T10:00:00.000Z').lastInsertRowid); db.prepare('UPDATE user_objectives SET level = ?, metaJson = ? WHERE id = ?').run(level || 'activite', JSON.stringify(meta), id); return id; };
const ANS = [{ q: 'Ce que tu as déjà accompli', a: '10 km', i: 2 }, { q: 'Ta régularité par semaine', a: '2 ou 3 fois', i: 2 }, { q: 'Ton ancienneté', a: '1 à 3 ans', i: 2 }];
const scope = { activityId: act, activity: 'Sport', level: 'activite', poleKey: null, categoryKey: null };

(async () => {
  // (b) Chrono : moins de 4 semaines de données => inutilisable
  entry(add(TODAY, -10)); entry(add(TODAY, -3));
  assert(nv.chronoDims('u1', scope, TODAY) === null, 'Chrono de moins de 4 semaines : les questions sont demandées');
  // Chrono >= 4 semaines : régularité (séances par semaine sur 28 jours) et ancienneté (premier temps)
  entry(add(TODAY, -100)); // premier temps : ~3,3 mois
  let c = nv.chronoDims('u1', scope, TODAY);
  assert(c && c.regularite === 1 && c.anciennete === 1, 'Chrono >= 4 semaines : 2 séances en 4 semaines = 1 fois par semaine ; premier temps de 3 à 12 mois');
  for (let k = 0; k < 8; k++) entry(add(TODAY, -k * 3)); // 8 de plus sur 28 jours : 10 séances en 4 semaines = 2,5 par semaine
  c = nv.chronoDims('u1', scope, TODAY);
  assert(c.regularite === 2, '10 séances en 4 semaines : 2 ou 3 fois par semaine');
  for (let k = 0; k < 8; k++) entry(add(TODAY, -k * 3 - 1)); // 18 séances : 4,5 par semaine
  assert(nv.chronoDims('u1', scope, TODAY).regularite === 3, '18 séances en 4 semaines : 4 fois ou plus');
  const other = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Vide', 'u1', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(other);
  assert(nv.chronoDims('u1', Object.assign({}, scope, { activityId: other }), TODAY) === null, 'activité sans temps : null');

  // (a) Objectif similaire récent du même périmètre avec un niveau
  objective('Courir le semi', add(TODAY, -100), { niveau: { level: 'intermediaire', answers: ANS }, type: 'course à pied' });
  let s = nv.findSimilar('u1', scope, 'Courir un marathon', 'Course à pied', TODAY);
  assert(s && s.answers.length === 3 && s.answers[0].i === 2 && s.answers[1].key === 'regularite', 'même type (accents et casse ignorés), moins de 12 mois : niveau repris');
  assert(nv.findSimilar('u1', scope, 'Apprendre le piano', 'instrument', TODAY) === null, 'autre type : rien à reprendre');
  assert(nv.findSimilar('u1', Object.assign({}, scope, { level: 'pole', poleKey: 'p1' }), 'Courir un marathon', 'course à pied', TODAY) === null, 'autre pôle / niveau : rien à reprendre');
  objective('Apprendre la guitare', add(TODAY, -400), { niveau: { level: 'debutant', answers: ANS }, type: 'instrument' });
  assert(nv.findSimilar('u1', scope, 'Jouer de la guitare', 'instrument', TODAY) === null, 'objectif de plus de 12 mois : demandé');
  objective('Nager deux kilomètres sans arrêt', add(TODAY, -30), { niveau: { level: 'intermediaire', answers: ANS } });
  assert(nv.findSimilar('u1', scope, 'Nager plus longtemps sans arrêt', 'natation', TODAY) !== null, 'ancien objectif sans type : titre proche (mêmes fonctions que goals.estimateCompute)');
  assert(nv.findSimilar('u1', scope, 'Peindre la cuisine', 'bricolage', TODAY) === null, 'ancien objectif sans type : titre éloigné, rien à reprendre');
  objective('Objectif sans niveau enregistré', add(TODAY, -5), { type: 'cuisine' });
  assert(nv.findSimilar('u1', scope, 'Cuisiner', 'cuisine', TODAY) === null, 'objectif sans niveau enregistré : ignoré');

  // questions() : IA simulée
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL;
  const realFetch = global.fetch, seen = [];
  let reply = null, down = false;
  const q4 = (key, q) => ({ key, q, choices: ['a ' + key, 'b ' + key, 'c ' + key, 'd ' + key] });
  global.fetch = async (url, init) => {
    const b = JSON.parse(init.body); const payload = JSON.parse(b.messages[0].content); seen.push(payload);
    if (down) throw new TypeError('réseau');
    const out = typeof reply === 'function' ? reply(payload) : reply;
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(Object.assign({ confidence: 90 }, out)) }] }) };
  };
  const body = (title, extra) => Object.assign({ title, endDate: add(TODAY, 200), activityId: act, level: 'activite' }, extra || {});
  try {
    // Chrono >= 4 semaines : seule « accompli » est demandée ; les valeurs dérivées partent à l'IA, jamais les données brutes
    aicache.memoClear(); seen.length = 0;
    reply = (p) => ({ pertinent: true, type: 'danse', questions: p.dimensions.map((k) => q4(k, 'Question ' + k)) });
    let r = await nv.questions('u1', body('Danser la salsa'), TODAY);
    assert(r.source === 'ia' && !r.skip && r.questions.length === 1 && r.questions[0].key === 'accompli' && r.known.length === 2 && r.known.map((x) => x.key).join() === 'regularite,anciennete' && r.type === 'danse', 'Chrono >= 4 semaines : une seule question (accompli), régularité et ancienneté connues');
    assert(JSON.stringify(seen[0].dimensions) === '["accompli"]' && seen[0].connues && seen[0].connues.regularite === '4 fois ou plus' && seen[0].connues.anciennete === '3 à 12 mois' && !JSON.stringify(seen[0]).includes('isoDate'), 'l’IA reçoit les dimensions manquantes et les tranches connues, pas les données brutes');
    // Chrono insuffisant (autre activité sans temps) : trois questions
    aicache.memoClear(); seen.length = 0;
    r = await nv.questions('u1', body('Danser la salsa', { activityId: other }), TODAY);
    assert(r.questions.length === 3 && r.known.length === 0 && JSON.stringify(seen[0].dimensions) === '["accompli","regularite","anciennete"]', 'Chrono insuffisant : les trois questions sont demandées');
    // Pertinent = non : sautée
    aicache.memoClear(); reply = { pertinent: false, type: 'administratif', questions: [] };
    r = await nv.questions('u1', body('Payer la facture d’électricité'), TODAY);
    assert(r.skip === true && r.questions.length === 0 && r.known.length === 0 && r.pertinent === false, 'objectif sans progression (pertinent = non) : page sautée, aucun niveau');
    // Objectif similaire récent : sautée, niveau repris
    aicache.memoClear(); reply = (p) => ({ pertinent: true, type: 'course à pied', questions: p.dimensions.map((k) => q4(k, 'Question ' + k)) });
    r = await nv.questions('u1', body('Courir un marathon'), TODAY);
    assert(r.skip === true && r.questions.length === 0 && r.known.length === 3 && r.known[0].i === 2 && r.source === 'objectif', 'objectif similaire récent : page sautée, niveau repris');
    // Réponse invalide, panne : trois questions fixes
    aicache.memoClear(); reply = { pertinent: true, type: 'x', questions: [] };
    r = await nv.questions('u1', body('Danser la salsa'), TODAY);
    assert(r.source === 'fixe' && r.questions.length === 3 && !r.skip && r.known.length === 0, 'réponse invalide : trois questions fixes');
    aicache.memoClear(); reply = { type: 'x' };
    assert((await nv.questions('u1', body('Danser la salsa'), TODAY)).source === 'fixe', 'pertinent absent : trois questions fixes');
    aicache.memoClear(); down = true;
    r = await nv.questions('u1', body('Danser la salsa'), TODAY);
    assert(r.source === 'fixe' && r.questions.length === 3 && !r.skip, 'IA en panne : trois questions fixes, jamais de blocage');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
  assert(nv.validAnswer({ pertinent: false, type: 'x' }, ['accompli']).questions.length === 0 && nv.validAnswer({ pertinent: true, questions: [q4('regularite', 'q')] }, ['accompli']) === null, 'validation : pertinent = non sans question, clé manquante refusée');

  // Interface, doc, pas de doublon de la fonction de similarité
  const js = read('public/js/objectifs-creer.js'), doc = read('docs/ia/ia-appels.md'), src = read('server/lib/objectifs-niveau.js');
  assert(js.includes(".concat(niv.skip ? [] : ['niveau'])") && js.includes('loadRatt().then(nivFetch)') && js.includes('if (niv.skip) { show(\'temps\'); return; }') && js.includes('niveauType: niv.type'), 'client : page sautée quand rien n’est à demander, demande faite avant d’entrer dans l’étape, type envoyé à la création');
  assert(doc.includes('`pertinent`') && doc.includes('`type`'), 'ia-appels.md : pertinent, type et dimensions connues documentés');
  assert(/goals\.tokenize/.test(src) && /goals\.jaccard/.test(src) && !/function (tokenize|jaccard)\b/.test(src), 'similarité : mêmes fonctions que goals.estimateCompute (aucun doublon)');
  console.log(failed ? '\nniveau-conditionnel-test : ' + failed + ' ÉCHEC(S)' : '\nniveau-conditionnel-test : OK'); process.exit(failed ? 1 : 0);
})();
