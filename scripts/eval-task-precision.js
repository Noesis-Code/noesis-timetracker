#!/usr/bin/env node
// Jeu d'évaluation de la précision des tâches classées/générées (chantier permanent n°6).
// Usage : node scripts/eval-task-precision.js [--fake] [--json] [--min-confidence=80]
//         node scripts/eval-task-precision.js --live --only=h  (--only=<préfixe d'id> limite aux cas voulus ; ici les 60 cas à l'aveugle h01-h60)
//         node scripts/eval-task-precision.js --live   (clé ANTHROPIC_API_KEY requise ; coûte des appels réels : lancé par Émilien seulement)
// Par défaut --fake : fournisseur déterministe (recouvrement de mots), sans réseau ni coût. Le fournisseur est INJECTABLE :
// run({ provider, cases, minConfidence }) accepte tout objet { classify({ label, candidates, strategy }) -> { key, uncertain, confidence } }.
// Chaîne évaluée (ordre de production) : titre nettoyé -> « à ignorer » (tâches proposées par l'IA seulement) -> doublon -> fournisseur -> seuil de confiance.
const fs = require('fs');
const path = require('path');
const tp = require('../server/lib/taskprecision');

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'task-precision', 'cases.json');

// Fournisseur simulé : score = mots utiles du titre présents dans libellé+description du candidat. Ex æquo ou score nul -> incertain.
const fakeProvider = {
  name: 'fake',
  async classify({ label, candidates }) {
    // Multi-actions « A et B » : si les deux moitiés désignent des catégories différentes, incertain (même règle que le prompt réel).
    const halves = label.split(/\s+et\s+/i);
    if (halves.length === 2) {
      const sub = await Promise.all(halves.map((h) => fakeProvider.classify({ label: h, candidates })));
      if (sub[0].key && sub[1].key && sub[0].key !== sub[1].key) return { key: null, uncertain: [sub[0].key, sub[1].key], confidence: 40 };
    }
    const t = new Set(tp.tokens(label));
    const scored = candidates.map((c) => {
      const words = new Set(tp.tokens(c.label + ' ' + (c.description || '')));
      const hints = tp.actionHints(label);
      return { key: c.key, score: [...t].filter((w) => words.has(w)).length + 2 * hints.filter((w) => words.has(w)).length };
    }).sort((a, b) => b.score - a.score);
    const [a, b] = scored;
    if (!a || a.score === 0) return { key: null, uncertain: scored.slice(0, 2).map((x) => x.key), confidence: 0 };
    if (b && b.score === a.score) return { key: null, uncertain: [a.key, b.key], confidence: 40 };
    return { key: a.key, uncertain: null, confidence: Math.min(95, 55 + 25 * (a.score - (b ? b.score : 0))) };
  },
};

// Fournisseur réel : même prompt que la production (goalstaskclassify.buildPrompt). Jamais lancé par les tests.
function liveProvider() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('--live exige ANTHROPIC_API_KEY.');
  if (!process.env.NOESIS_DATA_DIR) process.env.NOESIS_DATA_DIR = require('../test/lib/tmpdir').mkTmp('tmt-eval-');
  const cls = require('../server/lib/goalstaskclassify');
  return {
    name: 'live',
    async classify({ label, candidates }) {
      const text = String(await cls.callModel(cls.buildPrompt(label, candidates, [], { allowUncertain: true, confidence: true }), 92, 'eval-precision', undefined) || '');
      if (/^\s*["'`]*INCERTAIN/i.test(text)) return { key: null, uncertain: candidates.filter((c) => text.includes(c.key)).map((c) => c.key).slice(0, 2), confidence: 0 };
      const m = /\|\s*(\d{1,3})/.exec(text);
      const key = candidates.map((c) => c.key).sort((x, y) => y.length - x.length).find((k) => text.split('|')[0].includes(k)) || null;
      return { key, uncertain: null, confidence: m ? Number(m[1]) : 0 };
    },
  };
}

async function decide(c, ctx, provider, minConfidence) {
  const label = tp.cleanTitle(c.label);
  if (c.kind === 'generate' && ctx.strategy && ctx.strategy.ignore && tp.matchesIgnore(label, ctx.strategy.ignore)) return { outcome: 'reject' };
  if (c.kind === 'generate') {
    // Règles pures sur les tâches PROPOSÉES (jamais une saisie manuelle) : sans objet, antécédent absent, contradiction dans le lot.
    const chk = tp.checkGenerated(label, []);
    if (['sansSens', 'sansObjet', 'sansAntecedent'].includes(chk.reason)) return { outcome: 'reject', reason: chk.reason };
    if ((c.batch || []).some((o) => tp.contradicts(label, o))) return { outcome: 'reject', reason: 'contradiction' };
  }
  if (tp.isDuplicate(label, c.existing, c.kind === 'generate')) return { outcome: 'duplicate' };
  const r = await provider.classify({ label, candidates: ctx.candidates, strategy: ctx.strategy });
  if (!r || !r.key || r.uncertain || r.confidence < minConfidence) return { outcome: 'uncertain', suggested: r && r.uncertain ? r.uncertain : null };
  return { outcome: 'place', key: r.key };
}

async function run({ provider, cases, minConfidence } = {}) {
  const data = cases || JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const prov = provider || fakeProvider;
  const min = Number.isFinite(minConfidence) ? minConfidence : 80;
  const rows = [];
  for (const c of data.cases) {
    const got = await decide(c, data.contexts[c.context], prov, min);
    const exp = c.expect;
    const ok = got.outcome === exp.outcome && (exp.outcome !== 'place' || got.key === exp.key);
    rows.push({ id: c.id, label: c.label, expected: exp, got, ok });
  }
  const n = rows.length, count = (f) => rows.filter(f).length;
  const placed = count((r) => r.got.outcome === 'place');
  const placedRight = count((r) => r.got.outcome === 'place' && r.ok);
  const shouldPlace = count((r) => r.expected.outcome === 'place');
  const ratio = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const metrics = {
    cas: n,
    precision: ratio(placedRight, placed),            // parmi les tâches placées, % au bon endroit
    rappel: ratio(placedRight, shouldPlace),          // parmi celles à placer, % placées au bon endroit
    tauxRefus: ratio(count((r) => r.got.outcome === 'reject' || r.got.outcome === 'duplicate'), n),
    refusJustes: ratio(count((r) => (r.got.outcome === 'reject' || r.got.outcome === 'duplicate') && r.ok), count((r) => r.got.outcome === 'reject' || r.got.outcome === 'duplicate')),
    tauxIncertitude: ratio(count((r) => r.got.outcome === 'uncertain'), n),
    incertitudeJuste: ratio(count((r) => r.got.outcome === 'uncertain' && r.expected.outcome === 'uncertain'), count((r) => r.got.outcome === 'uncertain')),
    exactitude: ratio(count((r) => r.ok), n),
  };
  return { provider: prov.name, minConfidence: min, metrics, rows };
}

module.exports = { run, decide, fakeProvider };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (k) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : undefined; };
  (async () => {
    const provider = args.includes('--live') ? liveProvider() : fakeProvider;
    const mc = arg('min-confidence');
    const only = arg('only'); // préfixe d'id (ex. --only=h : lots à l'aveugle h01-h60) pour limiter le coût d'un --live
    const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const cases = only ? { ...all, cases: all.cases.filter((c) => c.id.startsWith(only)) } : undefined;
    const out = await run({ provider, cases, minConfidence: mc !== undefined ? Number(mc) : undefined });
    if (args.includes('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
    console.log(`Fournisseur : ${out.provider} · seuil de confiance : ${out.minConfidence}`);
    out.rows.filter((r) => !r.ok).forEach((r) => console.log(`  ÉCART ${r.id} « ${r.label} » attendu ${JSON.stringify(r.expected)} obtenu ${JSON.stringify(r.got)}`));
    console.log(out.metrics);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
