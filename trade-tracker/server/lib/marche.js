// Trade Tracker — séance de marché (TSX et NYSE : 9 h 30 à 16 h, heure de l'Est, du lundi au vendredi).
// Le marché a UNE heure, celle de Toronto/New York, quel que soit le fuseau de la personne ou du serveur : tout se calcule à partir
// de l'instant (UTC) avec Intl, donc l'heure d'été (2e dim. de mars, 1er dim. de novembre, les mêmes pour le Canada et les États-Unis)
// est suivie sans table. CONSIGNE : les jours fériés boursiers ne sont PAS gérés (un jour férié compte comme séance ouverte :
// la synchro tourne alors à rythme normal, au pire un peu de travail inutile ; jamais une ouverture ratée).
const ZONE = 'America/Toronto';
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

function parts(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { dow: DAYS[o.weekday], min: Number(o.hour) * 60 + Number(o.minute) };
}

function isMarketOpen(ms) {
  const { dow, min } = parts(ms);
  return dow >= 1 && dow <= 5 && min >= OPEN_MIN && min < CLOSE_MIN;
}

// Prochaine ouverture (ms) : `ms` si ouvert, sinon le premier instant ouvert (au plus 8 jours plus tard). L'ouverture tombe toujours
// sur une demi-heure UTC (9 h 30 heure de l'Est, décalage en heures entières) : on avance par demi-heures, pas par minutes.
function nextOpen(ms) {
  if (isMarketOpen(ms)) return ms;
  const HALF = 30 * 60e3;
  let t = (Math.floor(ms / HALF) + 1) * HALF;
  for (let i = 0; i < 8 * 48; i++, t += HALF) if (isMarketOpen(t)) return t;
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

module.exports = { ZONE, isMarketOpen, nextOpen, shouldSync, localTime };
