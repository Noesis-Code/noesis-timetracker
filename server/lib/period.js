// Utilitaire de période, partagé par les Statistiques et la Communauté.
// Fichier volontairement minuscule et stable : ni Gaspard (Statistiques)
// ni Emilien (Communauté/reste de l'app) ne devraient avoir besoin d'y
// toucher souvent — ça évite que les deux chantiers se marchent dessus ici.

const { mondayOf, isoDateOf } = require('./dates');

// Renvoie les bornes ISO [start, end] (inclusives) pour une période donnée,
// ancrée sur `refDate` (aujourd'hui par défaut).
function periodRange(period, refDate) {
  const ref = refDate ? new Date(refDate) : new Date();

  if (period === 'day') {
    const iso = isoDateOf(ref);
    return { start: iso, end: iso, label: 'Aujourd\'hui' };
  }
  if (period === 'week') {
    const monday = mondayOf(ref);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: isoDateOf(monday), end: isoDateOf(sunday), label: 'Cette semaine' };
  }
  if (period === 'month') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { start: isoDateOf(start), end: isoDateOf(end), label: 'Ce mois-ci' };
  }
  // year
  const start = new Date(ref.getFullYear(), 0, 1);
  const end = new Date(ref.getFullYear(), 11, 31);
  return { start: isoDateOf(start), end: isoDateOf(end), label: 'Cette année' };
}

module.exports = { periodRange };