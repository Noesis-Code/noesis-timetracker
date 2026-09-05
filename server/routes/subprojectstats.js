// Détail par sous-projet d'une activité — route du chantier
// « Chrono — sous-projets » (4 septembre 2026, second passage).
//
// Une seule route sert les DEUX écrans demandés par Emilien :
//   - onglet Statistiques : appuyer sur la couleur d'une activité (case de la
//     Feuille de temps, part du camembert, ligne de légende) ouvre le détail
//     de SON propre temps sur cette activité ;
//   - section Statistiques d'une activité partagée : le camembert y compare
//     les MEMBRES entre eux, donc appuyer sur la couleur d'un membre ouvre le
//     détail de SON temps à LUI — d'où le paramètre `memberId`.
//
// ⚠️ Chemin volontairement HORS de `/stats/*` : ce préfixe appartient aux trois
// discussions Statistiques (server/routes/stats.js). Y ajouter une route
// depuis un autre fichier rendrait impossible de savoir qui sert quoi en
// lisant un seul fichier.
//
// ⚠️ Le GRAPHIQUE n'est pas concerné (décision d'Emilien, 4 septembre 2026 :
// « sauf sur le graphique car je souhaite conserver l'option d'afficher le
// nombre d'heures enregistré lorsque l'utilisateur appuie sur le graphique »).
// Aucune route, aucun écouteur, aucune ligne de ce chantier ne le touche.

const express = require('express');
const db = require('../db');
const {
  subProjectBreakdownForRange,
  subProjectTimesheet,
  activitiesWithSubProjectTime,
  checkAccess,
} = require('../lib/subprojectstats');
// ⚠️ 5 septembre 2026 (Activité solo, débordement signalé, additif) :
// periodRange est la source unique des périodes du projet
// (server/lib/period.js, fichier vivant et partagé). Aucune de ses lignes
// n'est modifiée, elle est seulement appelée — comme le font déjà
// community.js, history.js et profile.js.
const { periodRange } = require('../lib/period');

const router = express.Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/sub-project-stats', (req, res) => {
  const userId = req.query.userId;
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ error: 'Activité invalide.' });
  }

  // Les bornes viennent de la fenêtre RÉELLEMENT affichée par la Feuille de
  // temps, transmises telles quelles par le client (`start`/`end` de sa
  // réponse). C'est la même discipline que le camembert depuis le
  // 1er septembre 2026 : on ne recalcule jamais une période de son côté, sinon
  // le détail et la grille au-dessus finissent par ne plus parler des mêmes
  // jours.
  let from = String(req.query.from || '');
  let to = String(req.query.to || '');
  let periodLabel = null;

  // ⚠️ 5 septembre 2026 (Activité solo) — ajout ADDITIF : `?period=`.
  // La section Statistiques d'une activité SOLO n'a aucune grille au-dessus
  // d'elle pour lui donner une fenêtre de jours ; elle envoie donc une période,
  // que periodRange convertit — la même fonction que partout ailleurs, plutôt
  // qu'un second calcul de dates côté client.
  // `from`/`to` restent PRIORITAIRES : aucun appelant existant ne change de
  // comportement, et la discipline « on ne recalcule jamais une période quand
  // l'écran d'où l'on vient en affiche déjà une » reste intacte.
  if (!from && !to && ['day', 'week', 'month', 'year'].includes(String(req.query.period || ''))) {
    const range = periodRange(String(req.query.period));
    from = range.start;
    to = range.end;
    periodLabel = range.label;
  }

  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) {
    return res.status(400).json({ error: 'Période invalide.' });
  }

  const access = checkAccess(userId, activityId, req.query.memberId || null);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const targetId = access.targetId;
  const member = db.prepare('SELECT name, lastName FROM users WHERE id = ?').get(targetId);
  // La couleur de base est CELLE DU MEMBRE regardé : chacun choisit sa propre
  // couleur pour une activité partagée (activity_members.color). Les nuances
  // en découlent, donc le détail d'un membre se lit dans SA couleur, la même
  // que celle de sa part dans le camembert d'où l'on vient.
  const membership = db.prepare(
    'SELECT color FROM activity_members WHERE activityId = ? AND userId = ?'
  ).get(activityId, targetId);

  const data = subProjectBreakdownForRange(targetId, activityId, from, to);

  res.json(Object.assign({
    activityName: access.activity.name,
    // null quand les bornes ont été fournies en clair : l'appelant qui envoie
    // ses propres dates a déjà son libellé à l'écran.
    periodLabel: periodLabel,
    memberId: targetId,
    memberName: member ? member.name : '',
    memberLastName: member ? member.lastName : null,
    isSelf: targetId === userId,
    baseColor: membership ? membership.color : '#3498db',
  }, data));
});

// ===================== FEUILLE DE TEMPS DE LA FENÊTRE =====================
// Même contrat que GET /stats/timesheet : la grille, ET la répartition de la
// fenêtre de jours réellement affichée, dans UNE seule réponse. C'est ce qui
// rend la synchronisation impossible à casser — les deux sections ne peuvent
// pas parler de deux périodes différentes puisqu'elles sortent du même appel.
router.get('/sub-project-timesheet', (req, res) => {
  const userId = req.query.userId;
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ error: 'Activité invalide.' });
  }

  const access = checkAccess(userId, activityId, req.query.memberId || null);
  if (access.error) return res.status(access.error.status).json(access.error.body);
  const targetId = access.targetId;

  const period = req.query.period === 'month' ? 'month' : 'week';
  const rawOffset = Number(period === 'month' ? req.query.monthOffset : req.query.weekOffset);
  const offset = Number.isFinite(rawOffset) ? rawOffset : 0;

  const grid = subProjectTimesheet(targetId, activityId, period, offset);
  // La répartition porte sur EXACTEMENT les bornes de la grille ci-dessus.
  const breakdown = subProjectBreakdownForRange(targetId, activityId, grid.start, grid.end);

  const member = db.prepare('SELECT name, lastName FROM users WHERE id = ?').get(targetId);
  const membership = db.prepare(
    'SELECT color FROM activity_members WHERE activityId = ? AND userId = ?'
  ).get(activityId, targetId);

  res.json(Object.assign({
    activityName: access.activity.name,
    memberId: targetId,
    memberName: member ? member.name : '',
    memberLastName: member ? member.lastName : null,
    isSelf: targetId === userId,
    baseColor: membership ? membership.color : '#3498db',
    breakdown,
  }, grid));
});

// Les activités qui ont du temps rattaché sur la fenêtre affichée — celles,
// et seulement celles, dont la couleur doit être cliquable.
router.get('/sub-project-stats/activities', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) {
    return res.status(400).json({ error: 'Période invalide.' });
  }

  res.json({ from, to, activityIds: activitiesWithSubProjectTime(userId, from, to) });
});

module.exports = router;
