// Seuil d'alerte de coût IA adaptatif (calcul pur, aucun accès base ni réseau).
// Décision d'Émilien (20 oct. 2026) : PAS de seuil quotidien (0,50 $/jour jugé trop strict) ; coût limité par SEMAINE : 3,50 CAD x comptes actifs de la semaine (le seuil est en CAD ; semaineUsd = équivalent USD, à comparer aux coûts réels, voir fx.js).
// Branché dans scripts/ai-cost-weekly.js SEULEMENT si AI_ALERT_ADAPTIVE=1 (désactivé par défaut, en attente de validation du montant) ; au moins 1 compte compté.
const fx = require('./fx');
const PAR_COMPTE_SEMAINE_CAD = 3.5;
function seuilAlerte(comptesActifs) {
  const n = Math.max(1, Math.floor(Number(comptesActifs)) || 0);
  const semaineCad = Math.round(PAR_COMPTE_SEMAINE_CAD * n * 100) / 100;
  return { semaineCad, semaineUsd: fx.toUsd(semaineCad) };
}
module.exports = { seuilAlerte, PAR_COMPTE_SEMAINE_CAD };
