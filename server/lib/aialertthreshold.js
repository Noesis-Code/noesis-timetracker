// Seuil d'alerte de coût IA adaptatif (calcul pur, aucun accès base ni réseau).
// Décision d'Émilien (20 oct. 2026) : PAS de seuil quotidien (0,50 $/jour jugé trop strict) ; coût limité par SEMAINE : 3,50 $ x comptes actifs de la semaine.
// Branché dans scripts/ai-cost-weekly.js SEULEMENT si AI_ALERT_ADAPTIVE=1 (désactivé par défaut, en attente de validation du montant) ; au moins 1 compte compté.
const PAR_COMPTE_SEMAINE_USD = 3.5;
function seuilAlerte(comptesActifs) {
  const n = Math.max(1, Math.floor(Number(comptesActifs)) || 0);
  return { semaineUsd: Math.round(PAR_COMPTE_SEMAINE_USD * n * 100) / 100 };
}
module.exports = { seuilAlerte, PAR_COMPTE_SEMAINE_USD };
