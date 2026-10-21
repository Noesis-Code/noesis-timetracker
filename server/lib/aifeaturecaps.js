// Jour des compteurs IA (budget, alertes, Drive) : jour civil de Montréal (America/Toronto, même fuseau), jamais UTC ni le fuseau du processus.
// (Les plafonds par fonction ont été retirés le 21 oct. 2026 : seuls restent les plafonds hebdomadaire et mensuel de aibudget.js.)
function dayKey(now) {
  const d = now instanceof Date ? now : new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
module.exports = { dayKey };
