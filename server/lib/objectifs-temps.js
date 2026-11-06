// Niveaux de TEMPS des objectifs (décision d'Émilien, 6 nov. 2026) : l'utilisateur ne règle plus la longueur des périodes.
// Trois niveaux FIXES, du court au long : PÉRIODE (13 périodes de 4 semaines par an, comme l'arbre périodique) -> ANNÉE -> PLURIANNUEL.
// Chaque objectif se place à l'échelle de son choix (timeLevel) ; sa place dans l'arbre dépend de ce niveau.
// Règle de DÉDUCTION (création sans niveau, migration des anciens objectifs) selon la durée entre le début et l'échéance :
//   <= 13 semaines : 'periode' ; <= 3 ans (156 semaines) : 'annee' ; au-delà : 'pluriannuel'.
// COHÉRENCE échéance / niveau (refus sinon) : 'periode' <= 13 semaines ; 'annee' <= 156 semaines ; 'pluriannuel' > 52 semaines.
// Un macro a un niveau de temps au moins égal à celui de ses enfants.
const PERIODS_PER_YEAR = 13;
const PERIOD_WEEKS = 4; // semaines par période : constante unique (création, proposition, contexte)
const PERIOD_DAYS = PERIOD_WEEKS * 7;
const TIME_LEVELS = ['periode', 'annee', 'pluriannuel'];
const MAX_WEEKS = { periode: 13, annee: 156, pluriannuel: Infinity };
const MIN_WEEKS = { periode: 0, annee: 0, pluriannuel: 52 };
const rank = (l) => Math.max(0, TIME_LEVELS.indexOf(l));
const weeksBetween = (start, end) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 604800000 * 100) / 100;
function deduce(start, end) {
  const w = weeksBetween(start, end);
  return w <= MAX_WEEKS.periode ? 'periode' : w <= MAX_WEEKS.annee ? 'annee' : 'pluriannuel';
}
// Retourne un message court si l'échéance ne correspond pas au niveau, sinon null.
function incoherence(level, start, end) {
  const w = weeksBetween(start, end);
  if (w > MAX_WEEKS[level]) return 'Cette échéance est trop lointaine pour le niveau « ' + level + ' » : choisis un niveau plus long.';
  if (w <= MIN_WEEKS[level]) return 'Cette échéance est trop proche pour le niveau « ' + level + ' » : choisis un niveau plus court.';
  return null;
}
module.exports = { PERIODS_PER_YEAR, PERIOD_WEEKS, PERIOD_DAYS, TIME_LEVELS, rank, deduce, incoherence, weeksBetween };
