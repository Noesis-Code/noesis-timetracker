// Étape Niveau : le bloc « Avancé » est TOUJOURS présent (11 nov. 2026), même quand le Chrono (ou un objectif similaire) a déjà répondu à la régularité et à l'ancienneté :
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-niv-adv-');
// ces questions restent affichées, réponse connue pré-sélectionnée et modifiable ; nivBody envoie toujours les trois réponses. Usage : node test/niveau-avance-chrono-test.js
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
const srv = require('../server/lib/objectifs-niveau');
const grab = (name) => { const a = js.indexOf('    function ' + name + '('); const b = js.indexOf('\n    }\n', a); return js.slice(a, b + 6); };
const make = (niv) => new Function('niv', 'tr', 'NIV_KEYS', [grab('nivMain'), grab('nivAdv'), grab('nivDone'), grab('nivBody'), 'return { nivAdv: nivAdv, nivBody: nivBody, nivDone: nivDone };'].join('\n').replace(/^\s*function nivMain\(\) \{.*\n/, (m) => m))(niv, (x) => x, ['accompli', 'regularite', 'anciennete']);
const FIXED = srv.FIXED.map((x) => ({ key: x.key, q: x.q, choices: x.choices.slice() }));
// Chrono connu : le serveur ne pose que « accompli » ; régularité (2) et ancienneté (1) sont « connues »
const niv = { qs: [{ key: 'accompli', q: 'Ce que tu as accompli', choices: ['5 km', '10 km', '15 km', '20 km'] }], picks: [null], known: [{ key: 'regularite', q: FIXED[1].q, a: FIXED[1].choices[2], i: 2 }, { key: 'anciennete', q: FIXED[2].q, a: FIXED[2].choices[1], i: 1 }], fixed: FIXED, kp: {}, source: 'ia' };
const f = make(niv);
const adv = f.nivAdv();
assert(adv.length === 2 && adv[0].key === 'regularite' && adv[1].key === 'anciennete', 'Chrono connu : « Avancé » contient régularité et ancienneté (pas seulement les questions manquantes)');
assert(adv[0].get() === 2 && adv[1].get() === 1 && adv.every((x) => x.known && x.choices.length === 4), 'valeurs connues pré-sélectionnées, quatre choix chacune');
assert(!f.nivDone(), 'Suivant reste grisé tant que la question générale n’a pas de réponse');
niv.picks[0] = 3; assert(f.nivDone(), 'la question générale suffit');
let b = f.nivBody(); assert(b && b.answers.length === 3 && b.answers[1].i === 2 && b.answers[2].i === 1, 'nivBody envoie les trois réponses (valeurs du Chrono)');
adv[0].set(3); b = f.nivBody(); assert(b.answers[1].i === 3 && b.answers[1].a === FIXED[1].choices[3], 'la valeur connue est modifiable dans « Avancé »');
// Rien posé ni connu : questions fixes en complément
const n2 = { qs: [{ key: 'accompli', q: 'A', choices: ['a', 'b', 'c', 'd'] }], picks: [1], known: [], fixed: FIXED, kp: {}, source: 'fixe' }, g = make(n2);
assert(g.nivAdv().length === 2 && g.nivBody().answers.length === 3, 'ni posées ni connues : questions fixes ajoutées, trois réponses');
// serveur : la réponse porte les questions fixes
(async () => { delete process.env.ANTHROPIC_API_KEY; const r = await srv.questions(1, { title: 'Courir un 21 km' }); assert(Array.isArray(r.fixed) && r.fixed.length === 3 && r.fixed.every((x) => x.choices.length === 4), 'le serveur renvoie `fixed` (trois questions, quatre choix)');
  assert(/niv\.fixed = r\.fixed/.test(js) && /if \(mi >= 0 && adv\.length\)/.test(js) && !/niv\.qs\.length > \(mi >= 0 \? 1 : 0\)/.test(js), 'l’écran dessine « Avancé » d’après nivAdv (plus de condition niv.qs.length > 1)');
  if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe'); })();
