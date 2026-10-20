// Seuil d'alerte de coût IA adaptatif (calcul pur, aucun accès base ni réseau).
// Règle proposée : jour = 0,50 $ x comptes actifs du jour ; semaine = 3,50 $ x comptes actifs de la semaine (= 7 x 0,50 $).
// Branché dans aibudget.alertDayUsd SEULEMENT si AI_ALERT_ADAPTIVE=1 (désactivé par défaut) ; au moins 1 compte compté.
const PAR_COMPTE_JOUR_USD = 0.5;
const PAR_COMPTE_SEMAINE_USD = 3.5;
function seuilAlerte(comptesActifs) {
  const n = Math.max(1, Math.floor(Number(comptesActifs)) || 0);
  return { jourUsd: Math.round(PAR_COMPTE_JOUR_USD * n * 100) / 100, semaineUsd: Math.round(PAR_COMPTE_SEMAINE_USD * n * 100) / 100 };
}
module.exports = { seuilAlerte, PAR_COMPTE_JOUR_USD, PAR_COMPTE_SEMAINE_USD };
