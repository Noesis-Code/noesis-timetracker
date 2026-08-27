// Petits utilitaires de date/heure — pas de dépendance externe (dayjs/moment)
// pour garder le projet léger.

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
  'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function isoDateOf(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function dayNameOf(d) {
  return DAY_NAMES[d.getDay()];
}

// Lundi 00:00:00 de la semaine contenant `d`
function mondayOf(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
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

module.exports = { DAY_NAMES, MONTH_NAMES_FR, isoDateOf, dayNameOf, mondayOf, formatElapsed, formatHM, pad2 };
