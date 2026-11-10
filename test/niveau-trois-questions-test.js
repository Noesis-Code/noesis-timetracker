// Page « Ton niveau » (10 nov. 2026) : règle de déduction du niveau, réponses enregistrées avec l'objectif, questions IA (Haiku puis fort) avec repli sur trois questions fixes, interface.
// Usage : node test/niveau-trois-questions-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-niveau3-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* données de base facultatives */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const nv = require('../server/lib/objectifs-niveau');
const aicache = require('../server/lib/aicache');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // Règle de déduction : somme des trois index (0 à 9) ; 0-2 débutant, 3-6 intermédiaire, 7-9 avancé
  assert(nv.derive([0, 0, 0]) === 'debutant' && nv.derive([1, 1, 0]) === 'debutant' && nv.derive([2, 0, 0]) === 'debutant', 'somme 0 à 2 : débutant');
  assert(nv.derive([1, 1, 1]) === 'intermediaire' && nv.derive([3, 3, 0]) === 'intermediaire' && nv.derive([2, 2, 2]) === 'intermediaire', 'somme 3 à 6 : intermédiaire');
  assert(nv.derive([3, 3, 1]) === 'avance' && nv.derive([3, 3, 3]) === 'avance', 'somme 7 à 9 : avancé');
  assert(nv.derive([0, 1]) === null && nv.derive([0, 1, 4]) === null && nv.derive([0, 1, 'a']) === null && nv.derive(null) === null, 'réponses incomplètes ou hors plage : aucun niveau');
  assert(nv.FIXED.length === 3 && nv.FIXED.every((q, k) => q.key === nv.KEYS[k] && q.choices.length === 4), 'trois questions fixes, quatre choix chacune');

  // Sans clé IA : trois questions fixes, jamais de blocage
  let r = await nv.questions('u1', { title: 'Courir un marathon', activityName: 'Sport' });
  assert(r.source === 'fixe' && r.questions.length === 3 && r.questions[0].choices.length === 4, 'sans clé IA : questions fixes');
  r = await nv.questions('u1', { title: '' });
  assert(r.source === 'fixe', 'titre vide : questions fixes');

  // Avec clé IA (réseau simulé) : Haiku sûr, Haiku peu sûr -> modèle fort, panne -> fixes, plafond atteint -> fixes
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL;
  const realFetch = global.fetch, calls = [];
  const good = (c) => ({ questions: [{ key: 'accompli', q: 'Ta plus longue course ?', choices: ['Jamais couru', '5 km', '10 km', '21 km ou plus'] }, { key: 'regularite', q: 'Tu cours combien de fois ?', choices: ['Aucune', '1 fois', '2 ou 3 fois', '4 fois ou plus'] }, { key: 'anciennete', q: 'Depuis quand ?', choices: ['Moins de 3 mois', '3 à 12 mois', '1 à 3 ans', 'Plus de 3 ans'] }], confidence: c });
  let mode = 'sure';
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body.model);
    if (mode === 'down') throw new TypeError('réseau');
    const conf = mode === 'unsure' && calls.length === 1 ? 40 : 90;
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: body.model, usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(mode === 'bad' ? { questions: [], confidence: 95 } : good(conf)) }] }) };
  };
  try {
    aicache.memoClear(); mode = 'sure';
    r = await nv.questions('u1', { title: 'Courir un marathon', activityName: 'Sport' });
    assert(r.source === 'ia' && r.questions[0].choices[3] === '21 km ou plus' && calls.length === 1 && /haiku/.test(calls[0]), 'Haiku sûr : un seul appel, questions de l’IA');
    r = await nv.questions('u1', { title: 'Courir un marathon', activityName: 'Sport' });
    assert(r.source === 'ia' && calls.length === 1, 'même titre et même activité : mémo, aucun nouvel appel');
    aicache.memoClear(); calls.length = 0; mode = 'unsure';
    r = await nv.questions('u1', { title: 'Apprendre le piano', activityName: 'Musique' });
    assert(r.source === 'ia' && calls.length === 2 && /haiku/.test(calls[0]) && /sonnet/.test(calls[1]), 'confiance < 80 : modèle fort, puis questions de l’IA');
    aicache.memoClear(); calls.length = 0; mode = 'bad';
    r = await nv.questions('u1', { title: 'Écrire un livre', activityName: 'Écriture' });
    assert(r.source === 'fixe' && calls.length === 2, 'réponse invalide aux deux modèles : questions fixes');
    aicache.memoClear(); calls.length = 0; mode = 'down';
    r = await nv.questions('u1', { title: 'Écrire un livre', activityName: 'Écriture' });
    assert(r.source === 'fixe' && r.questions.length === 3, 'panne réseau : questions fixes');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
  assert(nv.validQuestions({ questions: good(90).questions.map((q) => Object.assign({}, q, { choices: ['a', 'a', 'b', 'c'] })) }) === null, 'choix en double : questions refusées');

  // Création : les réponses et le niveau déduit sont enregistrés dans l'objectif (le niveau est recalculé côté serveur)
  const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
  if (m) {
    o.setTasksCheck(() => true);
    const prop = o.proposer(m.userId, { title: 'Courir un marathon', activityId: m.activityId, level: 'activite', endDate: '2027-06-01' });
    const ans = [{ q: 'Ta plus longue course ?', a: '10 km', i: 2 }, { q: 'Tu cours combien de fois ?', a: '2 ou 3 fois', i: 2 }, { q: 'Depuis quand ?', a: '1 à 3 ans', i: 2 }];
    const made = o.creer(m.userId, { title: 'Courir un marathon', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], niveau: { answers: ans, level: 'avance' } });
    const got = o.get(m.userId, made.id);
    assert(got.niveau && got.niveau.level === 'intermediaire' && got.niveau.answers.length === 3 && got.niveau.answers[0].i === 2 && got.niveau.answers[0].a === '10 km', 'objectif créé : niveau déduit (intermédiaire) et réponses gardés, le niveau envoyé est ignoré');
    let bad = false; try { o.creer(m.userId, { title: 'Un autre objectif', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-09-01', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [], niveau: { answers: [{ q: 'x', a: 'y', i: 9 }, ans[1], ans[2]] } }); } catch (e) { bad = true; } assert(bad, 'réponse hors plage : création refusée');
    const sans = o.creer(m.userId, { title: 'Objectif sans niveau', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-12-01', amount: 6, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [] });
    assert(o.get(m.userId, sans.id).niveau === null, 'sans réponses : aucun niveau enregistré (anciens clients)');
  }

  // Interface et doc
  const js = read('public/js/objectifs-creer.js'), css = read('public/css/objectifs-creer.css'), doc = read('docs/ia/ia-appels.md'), routes = read('server/routes/objectifs.js');
  assert(js.includes(".concat(['niveau', 'temps'])") && !js.includes('needsLevel') && !js.includes('Passer (je suis débutant)') && !js.includes("levelIn"), 'ordre Description, Activité, Niveau, Temps ; page toujours affichée ; plus de champ texte ni de « Passer »');
  assert(js.includes("'/api/objectifs/niveau/questions'") && js.includes("niveau: nivDone()") && !js.includes("skill: form.skill || ''"), 'la création envoie les trois réponses, plus le texte libre');
  assert(js.includes("k === 'niveau' && !nivDone()") && js.includes("(qi + 1) + '/3'") && js.includes("'cmpBtn' + (on ? '' : ' cmpBtnIdle')"), 'Suivant grisé tant que les trois questions n’ont pas de réponse ; compteur 1/3 ; choisi violet, non choisi verre calme');
  assert(css.includes('.objNivQ') && css.includes('border-left: 1px solid var(--sep)') && css.includes('min-height: 44px') && !/\.objNiv[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/.test(css), 'style : trait fin à gauche, choix de 44 px, aucune couleur codée en dur');
  assert(routes.includes("'/objectifs/niveau/questions'") && doc.includes('`niveau-questions`'), 'route déclarée et appel documenté dans ia-appels.md');
  console.log(failed ? '\nniveau-trois-questions-test : ' + failed + ' ÉCHEC(S)' : '\nniveau-trois-questions-test : OK'); process.exit(failed ? 1 : 0);
})();
