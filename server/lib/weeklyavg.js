// Moyenne hebdomadaire du temps chronométré : UNE SEULE fonction, partagée (décision d'Émilien, 9 nov. 2026).
// 4 semaines (28 jours terminés, la veille incluse) ; les 2 plus récentes comptent DOUBLE : poids 2, 2, 1, 1 (du plus récent au plus ancien), divisé par 6.
// Historique de moins de 4 semaines : on remonte jusqu'à la plus ancienne semaine où du temps existe, et seules ces semaines-là portent un poids (jamais de semaine « vide » avant le début).
// Aucun temps : null. Utilisée par la capacité du planificateur (weekplanner), les moyennes des plafonds (timecaps), le « Passé » de l'étape Temps et la valeur de départ des heures par semaine (objectifs).
const WEIGHTS = [2, 2, 1, 1];

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// minutesByWeek : minutes de chaque semaine, de la plus récente à la plus ancienne (4 valeurs).
function weightedAverage(minutesByWeek) {
  let oldest = -1;
  WEIGHTS.forEach((w, i) => { if ((minutesByWeek[i] || 0) > 0) oldest = i; });
  if (oldest < 0) return null;
  let sum = 0, weight = 0;
  for (let i = 0; i <= oldest; i += 1) { sum += (minutesByWeek[i] || 0) * WEIGHTS[i]; weight += WEIGHTS[i]; }
  return sum / weight;
}

// todayIso : le jour courant ; minutesIn(startIso, endIso) : minutes chronométrées entre ces deux jours (inclus). Renvoie des minutes par semaine (décimales) ou null.
function weeklyAverage(todayIso, minutesIn) {
  const mins = WEIGHTS.map((w, i) => { const end = addDays(todayIso, -1 - 7 * i); return minutesIn(addDays(end, -6), end); });
  return weightedAverage(mins);
}

module.exports = { weeklyAverage, weightedAverage, WEIGHTS };
