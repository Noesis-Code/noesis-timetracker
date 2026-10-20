// Trade Tracker — séance de marché (TSX et NYSE : 9 h 30 à 16 h, heure de l'Est, du lundi au vendredi).
// Le marché a UNE heure, celle de Toronto/New York, quel que soit le fuseau de la personne ou du serveur : tout se calcule à partir
// de l'instant (UTC) avec Intl, donc l'heure d'été (2e dim. de mars, 1er dim. de novembre, les mêmes pour le Canada et les États-Unis)
// est suivie sans table. JOURS FÉRIÉS : le marché n'est « fermé » un jour férié que si le TSX ET le NYSE le sont (Trade suit les deux) :
// Jour de l'An, Fête de la famille / Presidents' Day (3e lundi de février), Vendredi saint, Fête du Travail (1er lundi de septembre),
// Noël. Un jour férié d'un seul des deux (Victoria, Fête du Canada, Memorial Day, Action de grâce...) reste une séance ouverte. En cas
// de doute (férié tombant un samedi, fermetures exceptionnelles) : séance ouverte, au pire un peu de travail inutile, jamais une
// ouverture ratée. Seul un dimanche férié se reporte au lundi.
// CONSIGNE 24/7 : le rythme est global (une tournée pour tous les symboles). Trade ne suit aucun actif coté 24/7 (Questrade seul) ; si un jour
// un tel actif est branché, il ne doit PAS être ralenti hors séance (le sortir de ce calcul).
const ZONE = 'America/Toronto';
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

function parts(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { dow: DAYS[o.weekday], min: Number(o.hour) * 60 + Number(o.minute), y: Number(o.year), m: Number(o.month), d: Number(o.day) };
}

// Dimanche de Pâques (calcul grégorien) -> mois, jour.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}
// n-ième lundi (n >= 1) d'un mois, en jour du mois.
function nthMonday(y, m, n) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}
// Jour férié commun au TSX et au NYSE ? (y, m 1-12, d)
function isHoliday(y, m, d) {
  const same = (mm, dd) => m === mm && d === dd;
  const shifted = (mm, dd) => { // fixe ; dimanche -> lundi ; samedi : non géré (séance ouverte)
    const dow = new Date(Date.UTC(y, mm - 1, dd)).getUTCDay();
    if (dow === 0) return same(mm, dd + 1);
    return dow !== 6 && same(mm, dd);
  };
  if (shifted(1, 1) || shifted(12, 25)) return true;
  if (m === 2 && d === nthMonday(y, 2, 3)) return true;
  if (m === 9 && d === nthMonday(y, 9, 1)) return true;
  const [em, ed] = easter(y);
  const gf = new Date(Date.UTC(y, em - 1, ed - 2));
  return m === gf.getUTCMonth() + 1 && d === gf.getUTCDate();
}

function isMarketOpen(ms) {
  const { dow, min, y, m, d } = parts(ms);
  return dow >= 1 && dow <= 5 && min >= OPEN_MIN && min < CLOSE_MIN && !isHoliday(y, m, d);
}

// Prochaine ouverture (ms) : `ms` si ouvert, sinon le premier instant ouvert (au plus 10 jours plus tard). L'ouverture tombe toujours
// sur une demi-heure UTC (9 h 30 heure de l'Est, décalage en heures entières) : on avance par demi-heures, pas par minutes.
function nextOpen(ms) {
  if (isMarketOpen(ms)) return ms;
  const HALF = 30 * 60e3;
  let t = (Math.floor(ms / HALF) + 1) * HALF;
  for (let i = 0; i < 10 * 48; i++, t += HALF) if (isMarketOpen(t)) return t;
  return null;
}

// La synchro planifiée doit-elle tourner à ce tick ? En séance : toujours (rythme normal). Hors séance : au plus une fois par offMin,
// SAUF si le tick suivant tomberait après l'ouverture : on synchronise alors maintenant, et le premier tick en séance synchronise aussi,
// donc des prix frais à l'ouverture et jamais plus d'un intervalle de retard après elle.
function shouldSync(now, lastAt, { intervalMin = 15, offMin = 60 } = {}) {
  if (!lastAt) return true;
  if (isMarketOpen(now)) return true;
  if (now - lastAt >= offMin * 60e3) return true;
  const no = nextOpen(now);
  return no != null && no - now <= intervalMin * 60e3;
}

// Heure locale d'un instant dans le fuseau de la personne (ex. ouverture à Paris), pour l'affichage.
function localTime(ms, tz, locale = 'fr-CA') {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

module.exports = { ZONE, isHoliday, isMarketOpen, nextOpen, shouldSync, localTime };
