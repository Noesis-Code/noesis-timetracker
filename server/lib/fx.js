// Change USD/CAD : SEUL endroit du dépôt. Décision d'Émilien (20 oct. 2026) : les plafonds et seuils de coût IA sont en DOLLARS CANADIENS (CAD) ;
// l'API Anthropic facture et le journal ai_usage_log (colonne costUsd) comptent en dollars AMÉRICAINS (USD). Toute comparaison convertit CAD -> USD ici.
// USD_PER_CAD = nombre d'USD pour 1 CAD. 0,72 est une ESTIMATION, pas une donnée vérifiée (à confirmer : docs/questions-emilien-credits.md).
// FX_UPDATED = date de la dernière vérification ; le rapport et test/ia-fx-test.js avertissent au-delà de 90 jours.
// Surcharge sans code : variable d'environnement AI_USD_PER_CAD (nombre > 0).
const USD_PER_CAD = 0.72;
const FX_UPDATED = '2026-10-20';

function usdPerCad() {
  const n = Number(process.env.AI_USD_PER_CAD);
  return Number.isFinite(n) && n > 0 ? n : USD_PER_CAD;
}
const toUsd = (cad) => cad * usdPerCad();
const toCad = (usd) => usd / usdPerCad();
function fxAgeDays(now) {
  return Math.floor(((now == null ? Date.now() : now) - Date.parse(FX_UPDATED + 'T12:00:00Z')) / 86400000);
}
// Montants affichés : la devise est toujours écrite.
const fmtCad = (n) => (n || 0).toFixed(2) + ' CAD';
const fmtUsd = (n) => (n || 0).toFixed(2) + ' USD';
// Ligne de rapport : taux utilisé, date, avertissement si périmé (> 90 jours) ou surchargé.
function fxLine(now) {
  const age = fxAgeDays(now);
  let s = 'Change : 1 CAD = ' + usdPerCad() + ' USD (estimation, mise à jour le ' + FX_UPDATED + ', ' + age + ' j)';
  if (process.env.AI_USD_PER_CAD && Number(process.env.AI_USD_PER_CAD) > 0) s += ' — taux surchargé par AI_USD_PER_CAD';
  if (!(age <= 90)) s += '\nAVERTISSEMENT : taux de change de plus de 90 jours, à confirmer (USD_PER_CAD dans server/lib/fx.js).';
  return s;
}
module.exports = { USD_PER_CAD, FX_UPDATED, usdPerCad, toUsd, toCad, fxAgeDays, fmtCad, fmtUsd, fxLine };
