// Jeu de précision du rattachement tâche -> objectif : le harnais tourne (fournisseur simulé, sans réseau), les quatre types de cas sont présents,
// la ligne de score a le bon format et la règle de décision ne régresse pas (plancher du score simulé).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-evalobj-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const ev = require('../scripts/eval-objective-match');
(async () => {
  const r = await ev.run(ev.fakeProvider);
  assert(r.total.n >= 50, 'au moins 50 cas');
  assert(['clair', 'ambigu', 'vague', 'hors-sujet'].every((t) => r.types[t] && r.types[t].n >= 5), 'clairs, ambigus, vagues et hors sujet présents');
  assert(/^Rattachement tâche→objectif \(simulé\) : \d+\/\d+ corrects \(\d+(\.\d)? %\) · clairs/.test(ev.line(r)), 'score en une ligne');
  assert(r.percent >= 85 && r.clairPercent >= 90, 'plancher du score simulé (règle de décision)');
  assert(r.types.vague.ok === r.types.vague.n && r.types['hors-sujet'].ok === r.types['hors-sujet'].n, 'jamais de rattachement sur une tâche vague ou hors sujet');
  const bad = await ev.run({ name: 'faux', answer: async () => '{"index":1,"confidence":0.95,"second":null}' });
  assert(bad.falseMatches > 20 && bad.percent < 40, 'un fournisseur qui devine toujours est détecté (faux rattachements comptés)');
  console.log(failed ? '\neval-objective-match-test : ' + failed + ' ÉCHEC(S)' : '\neval-objective-match-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
