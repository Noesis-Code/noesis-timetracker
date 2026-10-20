// Projection de cout IA mensuel a partir d'HYPOTHESES (aucun appel reseau, aucun secret, aucune base).
// Usage : node scripts/ai-cost-projection.js [--hyp fichier.json] [--detail]
// Tarifs : PRICES de server/lib/aimodels.js. Hypotheses : scripts/ai-cost-hypotheses.json (modifiable).
const fs = require('fs');
const path = require('path');
const { PRICES } = require('../server/lib/aimodels');
const fx = require('../server/lib/fx');
// Devises : coûts calculés en USD (tarifs Anthropic) ; prix Expansion (Stripe) et plafond mensuel en CAD, convertis par fx.js pour la marge et le %.

const PROFILES = ['leger', 'moyen', 'intensif'];
const SIZES = [10, 100, 1000];
const MILLION = 10 ** 6; // jetons par unite de tarif (PRICES est en $ / million)

// Cout (USD) d'UN appel de la fonction f (memo, relance, repli fort, cache de prompt, remise inclus).
function callCost(f) {
  const one = (price) => ((f.in * (1 - (f.cached || 0) * 0.9) * price.in) + (f.out * price.out)) / MILLION;
  const base = one(PRICES[f.model] || PRICES.haiku);
  const strong = one(PRICES.sonnet);
  return (1 - (f.memo || 0)) * ((1 + (f.retry || 0)) * base + (f.fallback || 0) * strong) * (f.discount == null ? 1 : f.discount);
}

// Cout mensuel (USD) par utilisateur pour un profil (index 0..2) : { total, byFn }.
function perUser(h, profileIdx) {
  const byFn = {};
  let total = 0;
  for (const [name, f] of Object.entries(h.functions)) {
    const c = f.calls[profileIdx] * callCost(f) * h.daysPerMonth;
    byFn[name] = c; total += c;
  }
  return { total, byFn };
}

function project(h) {
  return PROFILES.map((p, i) => {
    const u = perUser(h, i);
    const top = Object.entries(u.byFn).sort((a, b) => b[1] - a[1])[0];
    return { profile: p, perUser: u.total, byFn: u.byFn, top: top[0], topShare: u.total ? top[1] / u.total : 0,
      totals: SIZES.map((n) => n * u.total), margin: (fx.toUsd(h.expansionCadPerMonth) - u.total) / fx.toUsd(h.expansionCadPerMonth) };
  });
}

function main() {
  const a = process.argv.slice(2);
  const hi = a.indexOf('--hyp');
  const file = hi >= 0 ? a[hi + 1] : path.join(__dirname, 'ai-cost-hypotheses.json');
  const h = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = project(h);
  const m = (n) => n.toFixed(2).padStart(9) + ' USD';
  const out = [];
  out.push('Projection IA mensuelle (hypotheses : ' + path.basename(file) + ' ; tarifs Haiku ' + PRICES.haiku.in + '/' + PRICES.haiku.out + ', Sonnet ' + PRICES.sonnet.in + '/' + PRICES.sonnet.out + ' USD/M)');
  out.push('Coûts en USD. ' + fx.fxLine());
  out.push('profil     USD/util/mois    10 util.     100 util.    1000 util.  %plafond ' + h.capCadPerMonth + ' CAD  marge/' + h.expansionCadPerMonth + ' CAD  1re fonction');
  r.forEach((x) => out.push(x.profile.padEnd(9) + m(x.perUser) + m(x.totals[0]) + m(x.totals[1]) + m(x.totals[2]) +
    (' ' + Math.round(100 * x.perUser / fx.toUsd(h.capCadPerMonth)) + ' %').padStart(10) + (' ' + Math.round(100 * x.margin) + ' %').padStart(12) + '  ' + x.top + ' (' + Math.round(100 * x.topShare) + ' %)'));
  out.push('Marge brute = (prix Expansion en CAD converti en USD - cout IA en USD) / prix, par abonne a 1 activite, avant frais Stripe et hebergement.');
  if (a.includes('--detail')) {
    const names = Object.keys(h.functions).sort((x, y) => r[1].byFn[y] - r[1].byFn[x]);
    out.push('Detail profil moyen (USD/util/mois) :');
    names.forEach((n) => out.push('  ' + n.padEnd(26) + r[1].byFn[n].toFixed(3) + ' USD  (' + Math.round(100 * r[1].byFn[n] / r[1].perUser) + ' %)'));
  }
  console.log(out.join('\n'));
}

if (require.main === module) main();
module.exports = { callCost, perUser, project, PROFILES, SIZES };
