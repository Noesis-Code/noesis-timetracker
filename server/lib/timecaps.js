// Lectures du temps chronométré d'une catégorie (moyennes, minutes d'une plage).
// Les plafonds de temps facultatifs par catégorie (max/jour, max/semaine) ont été RETIRÉS le 20 nov. 2026 (décision d'Émilien :
// une catégorie peut dépasser 168 h par semaine si plusieurs personnes y travaillent). La table goal_time_caps reste
// créée et conservée telle quelle (S6 : aucune donnée supprimée) mais plus aucun code ne la lit.

const db = require('../db');
const goals = require('./goals');

db.exec(`CREATE TABLE IF NOT EXISTS goal_time_caps (
  userId TEXT NOT NULL, activityId INTEGER NOT NULL, category TEXT NOT NULL,
  maxDayMinutes INTEGER, maxWeekMinutes INTEGER,
  PRIMARY KEY (userId, activityId, category)
)`);

const AVG_DAYS = 28;

function todayLocal() {
  return require('./dates').userToday(); // jour de la requête en cours (fuseau du téléphone), sinon jour du processus
}

// Moyenne historique (4 dernières semaines, les 2 dernières comptées double : weeklyavg) du temps chronométré de l'utilisateur,
// via categorystats.categoryBreakdownForRange (déjà utilisé par la Répartition).
// Un pôle cumule ses secteurs.
function averages(userId, activityId, key) {
  const today = todayLocal();
  const week = require('./weeklyavg').weeklyAverage(today, (s, e) => minutesInRange(userId, activityId, key, s, e)) || 0; // 4 semaines, les 2 dernières comptées double (fonction partagée)
  return { avgDayMinutes: Math.round(week / 7), avgWeekMinutes: Math.round(week) };
}

// Minutes réellement chronométrées dans [startIso, endIso] pour UN pôle (secteurs cumulés) ou UN secteur.
function minutesInRange(userId, activityId, key, startIso, endIso) {
  const categorystats = require('./categorystats');
  const bd = categorystats.categoryBreakdownForRange(userId, activityId, startIso, endIso);
  const isPole = goals.isValidCategoryForActivity(activityId, key);
  const seconds = bd.categories.reduce((s, c) => s + ((c.category === key || (isPole && c.parentKey === key)) ? c.seconds : 0), 0);
  return Math.round(seconds / 60);
}

// Moyenne historique du temps chronométré par période de 4 semaines (28 jours) pour un pôle
// (secteurs cumulés) ou un secteur : on remonte jusqu'à 13 fenêtres terminées et on moyenne
// depuis la plus ancienne fenêtre où du temps existe. null tant qu'aucun temps n'est enregistré.
function periodAverage(userId, activityId, key) {
  const today = todayLocal();
  const wins = [];
  for (let i = 0; i < 13; i++) {
    const end = goals.addDays(today, -1 - i * AVG_DAYS);
    const start = goals.addDays(end, -(AVG_DAYS - 1));
    wins.push(minutesInRange(userId, activityId, key, start, end));
  }
  let oldest = -1;
  wins.forEach((m, i) => { if (m > 0) oldest = i; });
  if (oldest < 0) return null;
  const used = wins.slice(0, oldest + 1);
  return Math.round(used.reduce((a, b) => a + b, 0) / used.length);
}

module.exports = { periodAverage, averages, minutesInRange };
