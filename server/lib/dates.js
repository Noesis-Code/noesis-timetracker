// Petits utilitaires de date/heure — pas de dépendance externe (dayjs/moment)
// pour garder le projet léger.

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
  'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function pad2(n) { return n < 10 ? '0' + n : String(n); }

// Fuseau de repli (9 septembre 2026, chantier "fuseau horaire automatique") :
// utilisé quand aucun fuseau IANA valide n'est fourni à isoDateOf/dayNameOf/
// mondayOf (voir plus bas) — par exemple un appelant qui n'est pas un
// navigateur (import CSV, migration, script). C'est le même fuseau que celui
// posé sur tout le processus par server/index.js (process.env.TZ), donc le
// comportement d'un appel sans fuseau explicite ne change pas.
const DEFAULT_TIMEZONE = 'America/Toronto';

// Un fuseau IANA est valide si Intl accepte de construire un formateur avec
// lui — pas de liste à tenir à jour à la main.
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch (err) {
    return false;
  }
}

// {year, month (1-12), day} de l'instant `d` TEL QU'IL S'AFFICHE dans le
// fuseau IANA `tz` — contrairement à d.getFullYear()/getMonth()/getDate(),
// qui lisent le fuseau du PROCESSUS Node (process.env.TZ), pas un fuseau
// arbitraire choisi à l'appel. Locale 'en-CA' : c'est celle dont le format
// numérique par défaut est déjà année-mois-jour, pratique à relire sans
// dépendre de l'ordre des jetons.
function localPartsOf(d, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// `tz` (fuseau IANA, ex. "America/Vancouver") est OPTIONNEL : absent, ou
// invalide, isoDateOf/dayNameOf/mondayOf se comportent EXACTEMENT comme
// avant (fuseau du processus) — aucun appel existant qui ne le fournit pas
// n'est affecté. Fourni, la date calendaire est celle du fuseau demandé,
// pas celle du serveur — c'est ce qui permet à l'app de s'ajuster
// automatiquement au fuseau du téléphone de chaque personne plutôt que de
// rester figée sur l'heure de l'Est pour tout le monde (chantier du
// 9 septembre 2026, demande d'Emilien : l'app doit rester correcte pour un
// membre ailleurs au Canada, pas seulement au Québec/en Ontario).
function isoDateOf(d, tz) {
  if (tz && isValidTimezone(tz)) {
    const { year, month, day } = localPartsOf(d, tz);
    return year + '-' + pad2(month) + '-' + pad2(day);
  }
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function dayNameOf(d, tz) {
  if (tz && isValidTimezone(tz)) {
    const { year, month, day } = localPartsOf(d, tz);
    // Date locale (sans heure) construite à partir des seules composantes
    // calendaires déjà résolues dans `tz` : getDay() ne dépend alors plus
    // d'aucun fuseau, seulement du triplet année/mois/jour.
    return DAY_NAMES[new Date(year, month - 1, day).getDay()];
  }
  return DAY_NAMES[d.getDay()];
}

// Lundi 00:00:00 de la semaine contenant `d`, dans le fuseau `tz` si fourni
// (sinon comportement inchangé : fuseau du processus).
function mondayOf(d, tz) {
  let year, month, day;
  if (tz && isValidTimezone(tz)) {
    ({ year, month, day } = localPartsOf(d, tz));
  } else {
    year = d.getFullYear(); month = d.getMonth() + 1; day = d.getDate();
  }
  const copy = new Date(year, month - 1, day);
  const dow = copy.getDay(); // 0 = dimanche
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function formatElapsed(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function formatHM(decimalHours) {
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${pad2(m)}`;
}

module.exports = {
  DAY_NAMES, MONTH_NAMES_FR, isoDateOf, dayNameOf, mondayOf, formatElapsed, formatHM, pad2,
  DEFAULT_TIMEZONE, isValidTimezone, localPartsOf,
};
