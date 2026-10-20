// Plafonds quotidiens par compte et par fonction IA (nombre d'appels), pour le rapport de coût et l'alerte. Module pur (sans base).
// Doit rester aligné sur les plafonds réels (test/ia-plafonds-visibles-test.js le vérifie contre le code source).
const FEATURE_CAPS = [
  { feature: 'offre1-plan', env: 'OFFER_MAX_PER_DAY', dflt: 10, label: 'Plan Offre 1' },
  { feature: 'modifications-proposees', env: 'CHANGES_MAX_PER_DAY', dflt: 100, label: 'Modifications proposées' },
  { feature: 'redistribution-objectif', env: 'REDISTRIB_MAX_PER_DAY', dflt: 60, label: 'Redistribution' },
  { feature: 'objectifs-hebdo', env: 'HEBDO_MAX_PER_DAY', dflt: 60, label: 'Objectifs hebdo' },
  { feature: 'classement-tache', env: 'CLASSIFY_MAX_PER_DAY', dflt: 500, label: 'Classement' },
  { feature: 'recurrence-tache', env: 'RECURRENCE_MAX_PER_DAY', dflt: 300, label: 'Récurrence' },
  { feature: 'rapprochement-objectif', env: 'MATCH_MAX_PER_DAY', dflt: 500, label: 'Rapprochement' },
  { feature: 'reformulation', env: 'REWRITE_MAX_PER_DAY', dflt: 150, label: 'Reformulation' },
  { feature: 'correction-orthographe', env: 'SPELLFIX_MAX_PER_DAY', dflt: 200, label: 'Orthographe' },
];
// Jour des compteurs IA (plafonds, budget, alertes) : jour civil de Montréal (America/Toronto, même fuseau), jamais UTC ni le fuseau du processus.
function dayKey(now) {
  const d = now instanceof Date ? now : new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
const baseFeature = (f) => String(f || '').replace(/:repli$/, '');
// Plafond effectif (0 = désactivé -> null).
function capOf(entry, env) {
  const n = parseInt((env || process.env)[entry.env], 10);
  const v = Number.isFinite(n) && n >= 0 ? n : entry.dflt;
  return v > 0 ? v : null;
}
const capFor = (feature, env) => { const e = FEATURE_CAPS.find((x) => x.feature === baseFeature(feature)); return e ? capOf(e, env) : null; };
// Part du plafond (0-1+) atteinte par la plus forte journée d'un compte : lignes {userId, day, feature, calls}. Les replis comptent comme appels (borne haute).
function capUsage(rows, env) {
  const per = {};
  (rows || []).forEach((r) => {
    const f = baseFeature(r.feature), k = f + '|' + r.userId + '|' + r.day;
    per[k] = (per[k] || 0) + (Number(r.calls) || 0);
  });
  return FEATURE_CAPS.map((e) => {
    const cap = capOf(e, env);
    let max = 0;
    Object.keys(per).forEach((k) => { if (k.startsWith(e.feature + '|')) max = Math.max(max, per[k]); });
    return { feature: e.feature, label: e.label, env: e.env, cap, maxCallsPerAccountDay: max, share: cap ? max / cap : null };
  });
}
module.exports = { dayKey, FEATURE_CAPS, capFor, capUsage, baseFeature };
