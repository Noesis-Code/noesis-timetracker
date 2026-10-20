// Entrée inter-secteurs bornée : objectifs actuels et descriptions des candidats coupés avant envoi. Usage : node test/ia-entree-bornee-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-entree-bornee-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const cross = require('../server/lib/crosssectorinference');
const long = 'mot '.repeat(125).trim(); // 499 caractères
const cands = Array.from({ length: 30 }, (_, i) => ({ key: 'k' + i, label: 'S' + i, description: long }));
const p = cross.buildPayload({ key: 's', label: 'S', description: '' }, 'task', 'Tâche', cands, () => long);
const after = JSON.stringify(p).length;
const before = JSON.stringify({ source: { category: { key: 's', label: 'S' }, type: 'task', text: 'Tâche' }, candidates: cands.map((c) => ({ key: c.key, label: c.label, description: long, currentMainGoalText: long })) }).length;
console.log('  pire cas 30 candidats : ' + Math.round(before / 4) + ' -> ' + Math.round(after / 4) + ' jetons estimés');
assert(p.candidates.every((c) => c.currentMainGoalText.length <= 241 && c.description.length <= 161), 'objectif et description coupés');
assert(after < before * 0.55, 'entrée réduite de plus de 45 %');
const short = cross.buildPayload({ key: 's', label: 'S' }, 'task', 'T', [{ key: 'a', label: 'A', description: 'Court' }], () => 'Objectif court');
assert(short.candidates[0].description === 'Court' && short.candidates[0].currentMainGoalText === 'Objectif court', 'textes courts inchangés');
// Troncature sûre : ni identifiant ni mot coupé, début conservé, clés/libellés/source intacts (fuzz déterministe).
let seed = 7; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
const words = ['objectif', 'client', 'sec-1a2b3c4d5e', 'cat_00042', 'trimestre', 'finance', 'Édition', 'x'.repeat(30), 'lancer', 'la', 'de'];
let okPrefix = true, okWord = true, okShort = true, okIds = true;
for (let i = 0; i < 500; i++) {
  const n = 1 + rnd(120), t = Array.from({ length: n }, () => words[rnd(words.length)]).join(' ');
  const c = cross.buildPayload({ key: 'src-' + i, label: 'Lé ' + i }, 'task', t, [{ key: 'cat_' + i, label: 'L' + i, description: t }], () => t).candidates[0];
  for (const [out, max] of [[c.description, 160], [c.currentMainGoalText, 240]]) {
    if (t.length <= max) { if (out !== t) okShort = false; continue; }
    const body = out.replace(/…$/, '');
    if (!t.startsWith(body) || out.length > max + 1) okPrefix = false;
    if (body.length < t.length && !/\s/.test(t[body.length])) okWord = false;
    if (body.split(' ').some((w) => !words.includes(w))) okIds = false;
  }
  if (c.key !== 'cat_' + i || c.label !== 'L' + i) okIds = false;
}
assert(okPrefix, 'texte coupé = début exact du texte, borne respectée');
assert(okWord, 'coupe toujours à une frontière de mot');
assert(okIds, 'aucun identifiant ni mot tronqué ; clés et libellés intacts');
assert(okShort, 'textes sous la borne identiques');
const srcP = cross.buildPayload({ key: 'k', label: 'S' }, 'main_goal', 'Texte source très long '.repeat(100), [], () => '');
assert(srcP.source.text.length === 2300, 'texte source jamais tronqué');
if (failed) process.exit(1);
