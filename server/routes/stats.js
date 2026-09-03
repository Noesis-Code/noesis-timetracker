const express = require('express');
const db = require('../db');
const { breakdownForRange, chartBreakdownForUser, timesheetForUser, timesheetMonthForUser } = require('../lib/stats');
const { isoDateOf } = require('../lib/dates');

const router = express.Router();

// Bornes des jours RÉELLEMENT affichés par la Feuille de temps, lues dans sa
// propre réponse plutôt que recalculées ici. Volontaire : la Répartition
// (camembert) doit suivre la grille quoi qu'il arrive, y compris si la
// discussion Feuille de temps change un jour sa façon de choisir sa fenêtre
// — aucune règle de fenêtrage n'est dupliquée de ce côté.
//
// Vue Semaine : `days` est la semaine calendaire affichée (lundi→dimanche)
// telle quelle.
// Vue Mois : on prend les bornes de la GRILLE (weeks), pas `start`/`end` qui
// sont le 1er et le dernier jour du mois — le calendrier affiche des
// semaines complètes et déborde donc sur le mois précédent/suivant. Ces
// jours de débordement sont atténués mais bien visibles et coloriés : les
// inclure est ce qui rend le camembert réconciliable à l'œil avec ce que la
// grille montre.
function displayedRange(result) {
  if (result.weeks && result.weeks.length) {
    const firstWeek = result.weeks[0];
    const lastWeek = result.weeks[result.weeks.length - 1];
    return { start: firstWeek[0].isoDate, end: lastWeek[lastWeek.length - 1].isoDate };
  }
  if (result.days && result.days.length) {
    return { start: result.days[0].isoDate, end: result.days[result.days.length - 1].isoDate };
  }
  return null;
}

function withBreakdown(userId, result) {
  const range = displayedRange(result);
  return Object.assign({}, result, {
    breakdown: range ? breakdownForRange(userId, range.start, range.end) : { start: null, end: null, totalSeconds: 0, activities: [] },
  });
}

// Données du GRAPHIQUE. Cette route servait historiquement deux sections à la
// fois : la Répartition (champs `week`/`month`/`year`) et le Graphique
// (`dailyBreakdown`). Depuis le 1er septembre 2026, la Répartition est
// alimentée par GET /stats/timesheet (voir plus bas) et ces trois champs
// n'avaient plus aucun lecteur — retirés le même jour sur confirmation
// d'Emilien, avec la fonction breakdownForUser et le paramètre `period` qui
// allaient avec. La route n'a donc plus qu'un seul consommateur, le
// Graphique, et n'est plus partagée entre deux discussions.
router.get('/stats', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const refDate = req.query.date || null;

  // Le Graphique n'a pas de "période" au sens plage : il couvre toujours tout
  // l'historique (voir chartBreakdownForUser/totalRangeForUser dans
  // lib/stats.js). Un éventuel `?period=` encore envoyé par un vieux client
  // est simplement ignoré.
  // Granularité du Graphique : regroupe les points de tout l'historique par
  // jour (défaut, comportement historique), semaine ou mois calendaire.
  const VALID_GRANULARITIES = ['day', 'week', 'month'];
  const granularity = VALID_GRANULARITIES.includes(req.query.granularity) ? req.query.granularity : 'day';

  res.json({
    // Nom de champ conservé tel quel (historique) même si ce n'est plus
    // forcément "journalier" : le client (app.js) le lit sous ce nom.
    dailyBreakdown: chartBreakdownForUser(userId, granularity, refDate),
  });
});

// Feuille de temps : soit une grille jour × quart d'heure pour UNE semaine
// donnée (period=week, par défaut — weekOffset=0 = semaine en cours, 1 =
// précédente, etc.), soit un calendrier mensuel jour × créneau de 2h
// (period=month, monthOffset=0 = mois en cours) — ajouté le 30 août 2026 à
// la demande d'Emilien (pas d'option "année" pour la Feuille de temps, voir
// lib/stats.js). Toujours personnelle, jamais mélangée avec les entrées
// d'un autre membre même sur une activité partagée.
//
// ⚠️ 1er septembre 2026 (discussion Répartition, débordement autorisé par
// Emilien sur cette route qui appartient à la Feuille de temps) : la réponse
// porte désormais un champ `breakdown` en plus — la répartition par activité
// des jours affichés par cette même grille, qui alimente le camembert
// (#statsPieBlock). Les deux sections viennent donc de la MÊME réponse et ne
// peuvent structurellement plus diverger ; c'est aussi une requête HTTP de
// moins qu'avant, le camembert n'appelant plus GET /stats de son côté.
// Aucune ligne de la logique Feuille de temps existante n'est modifiée :
// timesheetForUser/timesheetMonthForUser sont appelées telles quelles et
// leur résultat seulement enrichi (voir withBreakdown en haut du fichier).
router.get('/stats/timesheet', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = req.query.period === 'month' ? 'month' : 'week';

  if (period === 'month') {
    const monthOffset = parseInt(req.query.monthOffset, 10);
    if (req.query.monthOffset !== undefined && (isNaN(monthOffset) || monthOffset < 0)) {
      return res.status(400).json({ error: 'monthOffset invalide.' });
    }
    return res.json(Object.assign({ period }, withBreakdown(userId, timesheetMonthForUser(userId, isNaN(monthOffset) ? 0 : monthOffset))));
  }

  // `weekOffset` : 0 = semaine en cours, 1 = la précédente, etc. Depuis le
  // 2 septembre 2026, une semaine est une semaine CALENDAIRE lundi→dimanche
  // (voir timesheetForUser dans lib/stats.js) et non plus les 7 derniers
  // jours. Le paramètre et sa validation ne changent pas : un onglet resté
  // ouvert sur l'ancien JavaScript continue de fonctionner, il verra
  // simplement des semaines calées sur le lundi.
  //
  // ⚠️ 2 septembre 2026 — les paramètres `endDate`/`days` (tranches de la
  // liste continue) et `breakdownFrom`/`breakdownTo` (répartition des seuls
  // jours visibles à l'écran) qui vivaient ici ont été retirés avec le
  // défilement vertical qu'ils servaient, annulé à la demande d'Emilien.
  const weekOffset = parseInt(req.query.weekOffset, 10);
  if (req.query.weekOffset !== undefined && (isNaN(weekOffset) || weekOffset < 0)) {
    return res.status(400).json({ error: 'weekOffset invalide.' });
  }

  res.json(Object.assign({ period }, withBreakdown(userId, timesheetForUser(userId, isNaN(weekOffset) ? 0 : weekOffset))));
});

// Répartition en mode "Aujourd'hui" — 3 septembre 2026, demande d'Emilien :
// un bouton qui DÉSYNCHRONISE le camembert de la Feuille de temps pour
// n'afficher que la journée en cours (00h00 → 23h59), et qui le
// resynchronise au second clic.
//
// Route dédiée plutôt qu'un paramètre ajouté ailleurs : GET /stats/timesheet
// appartient à la Feuille de temps (le champ `breakdown` y est déjà un
// débordement signalé) et GET /stats appartient au Graphique depuis le
// 1er septembre. Celle-ci est entièrement à la Répartition, ce qui évite
// d'élargir encore une zone partagée pour un mode qui ne concerne qu'elle.
//
// La journée est calculée SERVEUR (isoDateOf sur l'heure du process, fixée à
// America/Toronto par server/index.js) et non envoyée par le client : c'est
// la même horloge que celle qui a écrit `isoDate` sur chaque entrée, donc le
// même "aujourd'hui" que partout ailleurs dans l'app, quel que soit le
// réglage du téléphone.
//
// Même fonction de calcul que le mode synchronisé (breakdownForRange, sur une
// plage d'un seul jour) : les totaux d'"Aujourd'hui" et ceux de la colonne du
// jour dans la grille viennent donc exactement de la même règle — y compris
// sur le point délicat des sessions à cheval sur minuit, rattachées au jour
// où elles ont DÉMARRÉ, comme la grille les dessine.
router.get('/stats/today', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const today = isoDateOf(new Date());
  // Forme volontairement identique à celle de GET /stats/timesheet ({ label,
  // breakdown }) pour que le client repeigne le camembert par le même chemin,
  // sans code de rendu en double.
  res.json({ day: today, label: "Aujourd'hui", breakdown: breakdownForRange(userId, today, today) });
});

module.exports = router;