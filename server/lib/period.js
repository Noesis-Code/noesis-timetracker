// Utilitaire de période, partagé par les Statistiques et la Communauté.
// Fichier volontairement minuscule et stable : ni Gaspard (Statistiques)
// ni Emilien (Communauté/reste de l'app) ne devraient avoir besoin d'y
// toucher souvent — ça évite que les deux chantiers se marchent dessus ici.

const { mondayOf, isoDateOf, isValidTimezone, localPartsOf } = require('./dates');

// Renvoie les bornes ISO [start, end] (inclusives) pour une période donnée,
// ancrée sur `refDate` (aujourd'hui par défaut).
//
// `tz` (fuseau IANA) est OPTIONNEL — 9 septembre 2026, chantier "fuseau
// horaire automatique" : absent ou invalide, comportement strictement
// inchangé (bornes calculées dans le fuseau du processus). Fourni (voir
// req.timezone, résolu par server/lib/session.js depuis l'en-tête envoyé par
// le client), "aujourd'hui"/"cette semaine"/... sont calculés dans CE
// fuseau plutôt que dans celui du serveur.
function periodRange(period, refDate, tz) {
  // 28 septembre 2026 — bug corrigé, signalé par Emilien : « après dimanche
  // soir, je ne peux pas voir les enregistrements du lundi avant le mardi ».
  // `new Date('2026-09-28')` (une chaîne AAAA-MM-JJ nue, sans heure) est
  // interprétée par JS comme minuit **UTC**, pas minuit local — un piège
  // classique. Minuit UTC un lundi correspond à dimanche ~20h à Toronto (UTC
  // moins 4/5h) : `mondayOf`/`localPartsOf`, appelés plus bas avec `tz`,
  // relisaient donc systématiquement la veille (dimanche) au lieu du jour
  // réellement demandé. Un jour ordinaire, "hier" reste dans la même semaine
  // calendaire lundi-dimanche — le décalage passait inaperçu. Mais un lundi,
  // "hier" (dimanche) appartient à la semaine PRÉCÉDENTE : `mondayOf`
  // ancrait alors la semaine "en cours" sur le lundi d'il y a 8 jours,
  // excluant le lundi réel (aujourd'hui) de la plage retournée — jusqu'au
  // lendemain (mardi), où le même décalage d'un jour retombe encore dans la
  // semaine courante et cesse d'être visible. Reproduit et vérifié en bac à
  // sable avant correctif (voir noesis-timetracker-chrono.md, 28 sept.).
  // Correctif : ajouter une heure locale explicite force JS à interpréter la
  // chaîne comme minuit LOCAL (fuseau du processus serveur, déjà fixé sur
  // America/Toronto par server/index.js) plutôt que minuit UTC — comportement
  // strictement inchangé quand `refDate` est absent (branche `new Date()`,
  // non touchée).
  const ref = refDate ? new Date(refDate + 'T00:00:00') : new Date();
  const hasTz = tz && isValidTimezone(tz);

  if (period === 'day') {
    const iso = isoDateOf(ref, tz);
    return { start: iso, end: iso, label: 'Aujourd\'hui' };
  }
  if (period === 'week') {
    const monday = mondayOf(ref, tz);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: isoDateOf(monday), end: isoDateOf(sunday), label: 'Cette semaine' };
  }
  if (period === 'month') {
    const { year, month } = hasTz ? localPartsOf(ref, tz) : { year: ref.getFullYear(), month: ref.getMonth() + 1 };
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return { start: isoDateOf(start), end: isoDateOf(end), label: 'Ce mois-ci' };
  }
  // year
  const { year } = hasTz ? localPartsOf(ref, tz) : { year: ref.getFullYear() };
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return { start: isoDateOf(start), end: isoDateOf(end), label: 'Cette année' };
}

module.exports = { periodRange };