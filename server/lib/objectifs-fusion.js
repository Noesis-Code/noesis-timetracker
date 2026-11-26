// Fusion (macro) dans le TEMPS : règle d'AFFICHAGE dérivée à chaque lecture, jamais de suppression de données (l'historique reste dans l'export).
// La période de fusion est la période de l'arbre (13 par an, 28 jours ; la 13e va jusqu'au 31 décembre) qui contient l'échéance du macro.
//   - avant la période : colonnes séparées, voisines (ordre de présentation du serveur) ;
//   - dans la période : une carte large relie les colonnes fusionnées ; au-dessus (périodes plus tardives) une seule colonne ;
//   - quand la période est PASSÉE : la fusion est définitive : une seule colonne, et DÉLIER est refusé (« Fusion passée : impossible de délier. »).
// Délier avant la fin de la période défait tout.
const PER_DAYS = 28, PER_YEAR = 13;
const MSG_PASSEE = 'Fusion passée : impossible de délier.';
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function periodOf(endDate) {
  const y = Number(String(endDate).slice(0, 4)), jan1 = y + '-01-01';
  const doy = Math.round((Date.parse(endDate + 'T00:00:00Z') - Date.parse(jan1 + 'T00:00:00Z')) / 86400000);
  const p = Math.min(PER_YEAR, Math.floor(doy / PER_DAYS) + 1), start = addDays(jan1, (p - 1) * PER_DAYS);
  return { year: y, number: p, start, end: p < PER_YEAR ? addDays(start, PER_DAYS - 1) : y + '-12-31' };
}
// État de fusion d'un macro à la date « today » : { mergeYear, mergePeriod, mergeStart, mergeEnd, mergeReached, mergePast }.
function state(endDate, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || '')) || Number.isNaN(Date.parse(endDate + 'T00:00:00Z'))) { // échéance illisible : aucun état de fusion (jamais d'erreur serveur à la lecture)
    return { mergeYear: null, mergePeriod: null, mergeStart: null, mergeEnd: null, mergeReached: false, mergePast: false };
  }
  const p = periodOf(endDate);
  return { mergeYear: p.year, mergePeriod: p.number, mergeStart: p.start, mergeEnd: p.end, mergeReached: today >= p.start, mergePast: today > p.end };
}
module.exports = { periodOf, state, MSG_PASSEE };
