#!/usr/bin/env node
// Précision du rattachement tâche -> objectif (9 nov. 2026, Émilien : cible 99 % sur les tâches claires).
// Usage : node scripts/eval-objective-match.js            (fournisseur simulé, sans réseau ni coût : vérifie le harnais et la règle de décision)
//         node scripts/eval-objective-match.js --live     (modèle réel, ANTHROPIC_API_KEY requise : coûte des appels, lancé par Émilien seulement)
//         options : --json (détail), --verbose (liste des écarts), --min=99 (code de sortie 1 si les clairs sont sous ce score)
// Jeu : test/fixtures/task-precision/objectifs.json (clairs, ambigus, vagues, hors sujet). Chaîne évaluée = celle de la production :
// goalscaptureplace.buildMatchPrompt -> modèle -> parseMatchAnswer -> decideAnswer (seuil de confiance, hésitation = deux propositions).
// Attendu : clair -> le bon objectif ; ambigu -> hésitation sur les DEUX bons objectifs (jamais une devinette) ; vague / hors sujet -> aucun rattachement.
// Un « faux rattachement » = un objectif choisi alors que l'attendu était autre chose : c'est l'erreur à éviter en priorité.
const path = require('path');
const fs = require('fs');
process.env.TZ = process.env.TZ || 'America/Montreal';
if (!process.env.NOESIS_DATA_DIR) process.env.NOESIS_DATA_DIR = require('../test/lib/tmpdir').mkTmp('tmt-eval-obj-');
const cp = require('../server/lib/goalscaptureplace');
const goals = require('../server/lib/goals');
const SET = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'task-precision', 'objectifs.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };

// Fournisseur simulé : recouvrement de racines (cp.lexScore) -> réponse JSON comme celle du modèle.
const fakeProvider = {
  name: 'simulé',
  async answer(task, cands) {
    const ts = cp.stemSet(task);
    const sc = cands.map((c, i) => ({ i, s: cp.lexScore(ts, c.text, c.description) })).sort((a, b) => b.s - a.s);
    const [a, b] = sc;
    if (!a || a.s < 0.3) return '{"index":null}';
    if (b && b.s > 0 && b.s >= 0.6 * a.s) return JSON.stringify({ index: a.i + 1, confidence: 0.4, second: b.i + 1, reason: 'deux objectifs possibles' });
    return JSON.stringify({ index: a.i + 1, confidence: 0.9, second: null, reason: 'même sujet' });
  },
};
function liveProvider() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('--live exige ANTHROPIC_API_KEY.');
  const cls = require('../server/lib/goalstaskclassify');
  return { name: 'réel', answer: (task, cands) => cls.callModel(cp.buildMatchPrompt(task, cands), 120, 'eval-precision') };
}

async function run(provider) {
  const monday = goals.mostRecentMonday(require('../server/lib/dates').userToday());
  const res = { provider: provider.name, types: {}, falseMatches: 0, errors: [] };
  const bump = (t, ok) => { const r = res.types[t] || (res.types[t] = { ok: 0, n: 0 }); r.n += 1; if (ok) r.ok += 1; };
  for (const set of SET.sets) {
    const cands = set.objectives.map((text, i) => ({ kind: 'weekly', weeklyId: i + 1, text, description: '', weekStart: monday, period: { startDate: monday, endDate: monday } }));
    for (const [task, type, expected] of set.cases) {
      let dec;
      try { dec = cp.decideAnswer(cands, cp.parseMatchAnswer(await provider.answer(task, cands), cands.length)); } catch (e) { dec = { kind: 'none', error: e.message }; }
      const got = dec.kind === 'match' ? [dec.cand.weeklyId] : dec.kind === 'hesitate' ? dec.cands.map((c) => c.weeklyId).sort() : [];
      let ok;
      if (type === 'clair') ok = dec.kind === 'match' && got[0] === expected;
      else if (type === 'ambigu') ok = dec.kind === 'hesitate' && got.join() === expected.slice().sort().join();
      else ok = dec.kind === 'none';
      if (dec.kind === 'match' && !(type === 'clair' && got[0] === expected)) res.falseMatches += 1;
      bump(type, ok);
      if (!ok) res.errors.push({ set: set.id, type, task, expected, got: dec.kind + (got.length ? ' ' + got.join('+') : ''), error: dec.error || null });
    }
  }
  const all = Object.values(res.types).reduce((a, r) => ({ ok: a.ok + r.ok, n: a.n + r.n }), { ok: 0, n: 0 });
  res.total = all; res.percent = Math.round((1000 * all.ok) / all.n) / 10;
  res.clairPercent = res.types.clair ? Math.round((1000 * res.types.clair.ok) / res.types.clair.n) / 10 : null;
  return res;
}

function line(r) {
  const t = (k) => (r.types[k] ? r.types[k].ok + '/' + r.types[k].n : '—');
  return 'Rattachement tâche→objectif (' + r.provider + ') : ' + r.total.ok + '/' + r.total.n + ' corrects (' + r.percent + ' %) · clairs ' + t('clair') + ' (' + r.clairPercent + ' %) · ambigus proposés ' + t('ambigu') + ' · vagues ' + t('vague') + ' · hors sujet ' + t('hors-sujet') + ' · faux rattachements ' + r.falseMatches;
}

module.exports = { run, line, fakeProvider };
if (require.main === module) {
  (async () => {
    const r = await run(flag('live') ? liveProvider() : fakeProvider);
    if (flag('json')) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(line(r));
      if (flag('verbose')) r.errors.forEach((e) => console.log('  écart [' + e.set + ' · ' + e.type + '] « ' + e.task + ' » attendu ' + JSON.stringify(e.expected) + ', obtenu ' + e.got + (e.error ? ' (' + e.error + ')' : '')));
    }
    const min = Number(opt('min', 0));
    process.exit(min && r.clairPercent < min ? 1 : 0);
  })().catch((e) => { console.error(e.message); process.exit(2); });
}
