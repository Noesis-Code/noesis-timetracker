// Temps des objectifs (modèle SIMPLIFIÉ validé par Émilien, 6 nov. 2026) : périodes FIXES de 13 × 4 semaines (l'utilisateur ne règle rien) ;
// le niveau de temps d'un objectif (période, année, pluriannuel) se DÉDUIT de son échéance, il n'est ni choisi ni validé ; le TYPE d'un objectif se déduit de sa
// STRUCTURE (a des sous-objectifs = « grand objectif », isBig). Seule règle de hiérarchie : l'échéance du parent est au moins celle de l'enfant.
// La colonne user_objectives.timeLevel reste en base (données intactes, inutilisée).
const PERIODS_PER_YEAR = 13;
const PERIOD_WEEKS = 4; // semaines par période : constante unique (création, proposition, contexte)
const PERIOD_DAYS = PERIOD_WEEKS * 7;
const TIME_LEVELS = ['periode', 'annee', 'pluriannuel'];
const MAX_WEEKS = { periode: 13, annee: 156 };
const weeksBetween = (start, end) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 604800000 * 100) / 100;
// Affichage seulement : <= 13 semaines : 'periode' ; <= 3 ans : 'annee' ; au-delà : 'pluriannuel'.
function deduce(start, end) {
  const w = weeksBetween(start, end);
  return w <= MAX_WEEKS.periode ? 'periode' : w <= MAX_WEEKS.annee ? 'annee' : 'pluriannuel';
}
module.exports = { PERIODS_PER_YEAR, PERIOD_WEEKS, PERIOD_DAYS, TIME_LEVELS, deduce, weeksBetween };
