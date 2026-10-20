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
// Construire un Intl.DateTimeFormat coûte cher (dizaines de µs) : validité et formateurs sont mis en cache par fuseau
// (cache borné, l'en-tête de fuseau venant du client). Résultats strictement identiques.
const tzValidCache = new Map();
const fmtCache = new Map();
function cachePut(map, key, value) {
  if (map.size >= 500) map.clear();
  map.set(key, value);
  return value;
}
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const hit = tzValidCache.get(tz);
  if (hit !== undefined) return hit;
  let ok = true;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch (err) {
    ok = false;
  }
  return cachePut(tzValidCache, tz, ok);
}
// kind 'd' = année/mois/jour ; 'dt' = date + heure:minute:seconde.
function formatterFor(tz, kind) {
  const key = kind + '|' + tz;
  let f = fmtCache.get(key);
  if (!f) {
    const o = kind === 'dt'
      ? { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
    f = cachePut(fmtCache, key, new Intl.DateTimeFormat('en-CA', o));
  }
  return f;
}

// {year, month (1-12), day} de l'instant `d` TEL QU'IL S'AFFICHE dans le
// fuseau IANA `tz` — contrairement à d.getFullYear()/getMonth()/getDate(),
// qui lisent le fuseau du PROCESSUS Node (process.env.TZ), pas un fuseau
// arbitraire choisi à l'appel. Locale 'en-CA' : c'est celle dont le format
// numérique par défaut est déjà année-mois-jour, pratique à relire sans
// dépendre de l'ordre des jetons.
function localPartsOf(d, tz) {
  const parts = formatterFor(tz, 'd').formatToParts(d);
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

// Minuit (00:00) du jour calendaire `iso` (« AAAA-MM-JJ ») tel qu'il se vit dans le fuseau `tz`, en vrai instant.
// Sert aux fenêtres de la grille et de la Répartition : leurs bornes suivent le fuseau de la personne, pas celui du serveur.
// Sans `tz` valide : minuit du fuseau du processus (comportement d'avant).
function zonedMidnight(iso, tz) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!tz || !isValidTimezone(tz)) return new Date(y, m - 1, d);
  const wall = Date.UTC(y, m - 1, d);
  let t = wall;
  for (let i = 0; i < 3; i++) {
    const p = formatterFor(tz, 'dt').formatToParts(new Date(t)).reduce((o, x) => { o[x.type] = Number(x.value); return o; }, {});
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (shown === wall) break;
    t -= shown - wall;
  }
  return new Date(t);
}

// « Maintenant » vu dans le fuseau `tz`, porté par un Date dont les champs locaux du PROCESSUS (getDate, setHours...) affichent
// l'heure murale de `tz`. Permet de réutiliser tel quel le calcul de jours calendaires (aujourd'hui, lundi, 1er du mois) en suivant
// la personne. Sans `tz` valide : new Date() (comportement d'avant). Ne sert qu'à lire une date calendaire, jamais à mesurer un temps.
function calendarNow(tz) {
  const now = new Date();
  if (!tz || !isValidTimezone(tz)) return now;
  const { year, month, day } = localPartsOf(now, tz);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(now).reduce((o, x) => { o[x.type] = Number(x.value); return o; }, {});
  return new Date(year, month - 1, day, p.hour, p.minute, p.second);
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
  DEFAULT_TIMEZONE, isValidTimezone, localPartsOf, zonedMidnight, calendarNow,
};
