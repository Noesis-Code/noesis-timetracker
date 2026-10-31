const express = require('express');
const db = require('../db');
const textlimits = require('../lib/textlimits');
const { isoDateOf, dayNameOf, formatElapsed } = require('../lib/dates');
// Rattachement OPTIONNEL du temps à une CATÉGORIE Objectifs (17 septembre
// 2026, suppression totale des sous-projets — remplace le rattachement
// sous-projet du 4 septembre 2026, retiré). Toute la validation vit dans
// ce module partagé avec server/routes/history.js — voir son en-tête.
const { resolveCategoryKey, categorySummary } = require('../lib/entrycategory');
const { checkEntryTimes } = require('../lib/entryguard');

const router = express.Router();

function requireUser(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) { res.status(404).json({ error: 'Profil introuvable. Réinitialise ton profil dans Paramètres.' }); return null; }
  return user;
}

// La couleur vient de l'appartenance (activity_members) : chacun a SA propre
// couleur pour SES activités. Si l'appelant n'est pas membre (ne devrait pas
// arriver, /timer/start l'empêche), on retombe sur une couleur neutre.
function activityWithColor(activityId, userId) {
  const a = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  if (!a) return null;
  const membership = db.prepare('SELECT color FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  return { id: a.id, name: a.name, color: membership ? membership.color : '#3498db', requiresNote: !!a.requiresNote };
}

// Statut courant (repris à chaque ouverture d'app / retour au premier plan).
// L'activité est connue dès le démarrage : pas de phase intermédiaire.
router.get('/timer/status', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  // serverNow : le téléphone en déduit l'écart de son horloge (voir clockSkewMs, public/app.js).
  if (!running) return res.json({ running: false, serverNow: Date.now() });

  res.json({
    running: true,
    serverNow: Date.now(),
    startTime: running.startTime,
    activity: activityWithColor(running.activityId, user.id),
    // null est le cas NORMAL : le choix d'une catégorie est optionnel.
    category: categorySummary(running.activityId, running.goalCategory),
  });
});

// Démarrer le chrono = choisir directement l'activité (un seul clic).
// Sécurité : on ne peut démarrer QUE ses propres activités (celles dont on
// est membre) — jamais celle de quelqu'un d'autre, même en connaissant son id.
router.post('/timer/start', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND active = 1').get(req.body.activityId);
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });

  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, user.id);
  if (!membership) return res.status(403).json({ error: "Cette activité ne t'appartient pas." });

  const existing = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (existing) {
    return res.json({
      alreadyRunning: true,
      serverNow: Date.now(),
      startTime: existing.startTime,
      activity: activityWithColor(existing.activityId, user.id),
      category: categorySummary(existing.activityId, existing.goalCategory),
    });
  }

  // Catégorie OPTIONNELLE au démarrage (même convention que le sous-projet
  // qu'elle remplace, décision d'Emilien du 3 septembre 2026). Champ absent
  // = aucune catégorie, et c'est le cas normal : rien n'est bloqué, le
  // démarrage reste un clic. Le client ne l'envoie d'ailleurs pas ici — il
  // propose le choix pendant que le chrono tourne (POST /timer/category) —
  // mais la route l'accepte pour qu'un autre appelant puisse démarrer
  // directement rattaché.
  const resolved = resolveCategoryKey(activity.id, req.body.category, null);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

  // 23 septembre 2026 (chrono hors ligne) : un chrono démarré sans réseau
  // arrive ici plus tard avec SON heure de départ (voir flushOfflineChrono,
  // public/app.js). Facultatif : absent, rien ne change. Refusé s'il est
  // invalide ou dans le futur (1 min de tolérance d'horloge), ou plus vieux
  // que 7 jours.
  let startTime = new Date().toISOString();
  if (req.body.startTime !== undefined) {
    const parsed = new Date(req.body.startTime);
    const now = Date.now();
    if (isNaN(parsed.getTime()) || parsed.getTime() > now + 60 * 1000 || parsed.getTime() < now - 7 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'Heure de début invalide.' });
    }
    startTime = parsed.toISOString();
  }
  db.prepare('INSERT INTO running_timers (userId, activityId, startTime, note, goalCategory) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, activity.id, startTime, '', resolved.categoryKey);
  res.json({
    alreadyRunning: false,
    serverNow: Date.now(),
    startTime,
    activity: activityWithColor(activity.id, user.id),
    category: categorySummary(activity.id, resolved.categoryKey),
  });
});

// Choisir / changer / retirer la catégorie PENDANT que le chrono tourne.
// C'est le point d'entrée réellement utilisé par l'écran : le clic sur une
// activité démarre le chrono immédiatement (décision du 27 août 2026,
// « démarrage en un clic »), et le sélecteur apparaît ensuite sous le
// chronomètre. Le choix est ainsi vraiment optionnel — ne rien choisir ne
// coûte aucun geste — et il survit à un rechargement de page ou à un autre
// appareil, puisqu'il est stocké sur le chrono en cours et pas dans l'écran.
//
// `category: null` détache. Champ absent : ne change rien. Route renommée
// depuis /timer/sub-project (17 septembre 2026, suppression totale des
// sous-projets) — /timer/sub-project n'existe plus.
router.post('/timer/category', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  const resolved = resolveCategoryKey(running.activityId, req.body.category, running.goalCategory);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

  db.prepare('UPDATE running_timers SET goalCategory = ? WHERE userId = ?').run(resolved.categoryKey, user.id);
  res.json({ category: categorySummary(running.activityId, resolved.categoryKey) });
});

// Supprime une pièce jointe déjà rattachée à un enregistrement validé
// (ajoutée depuis le panneau "Historique", voir server/routes/history.js).
// Toujours scopée au propriétaire réel de la pièce jointe (sa colonne
// userId), jamais à l'utilisateur de l'enregistrement si jamais les deux
// différaient un jour.
//
// La zone "Note" du Chrono (note de session en direct + pièces jointes "en
// attente" + envoi "en direct" aux membres/à la communauté) a été retirée le
// 31 août 2026 (demande d'Emilien) — voir la zone Discussion du Profil, qui
// la remplace (server/routes/profile.js pour la partie "Communauté",
// /community/activity-messages, déjà existante, pour la partie "Membres").
// Les pièces jointes "en attente" (timeEntryId NULL) n'existent donc plus :
// une pièce jointe de session s'ajoute désormais uniquement depuis le
// panneau "Historique", sur un enregistrement déjà validé — cette route de
// suppression reste néanmoins générique (elle ne dépend pas de timeEntryId).
router.delete('/attachments/:id', (req, res) => {
  const attachment = db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  if (attachment.userId !== req.userId) return res.status(403).json({ error: "Ce n'est pas ta pièce jointe." });

  db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachment.id);
  res.json({ message: 'Pièce jointe supprimée.' });
});

// STOP = enregistre directement la session (l'activité était déjà choisie
// au démarrage). Le client affiche désormais un récapitulatif avant de
// valider, avec la possibilité de corriger l'heure de début et/ou l'heure de
// fin — startTime/endTime (ISO) sont donc optionnels dans le corps de la
// requête et remplacent, si fournis, l'heure de début enregistrée au
// démarrage / l'heure actuelle du serveur. `note` reste accepté (optionnel,
// vide par défaut) pour compatibilité, mais le Chrono ne propose plus de
// champ pour la remplir depuis le retrait de la zone "Note" le 31 août 2026
// (demande d'Emilien) — voir la zone Discussion du Profil, qui la remplace.
router.post('/timer/stop', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  let startTime = new Date(running.startTime);
  if (req.body.startTime !== undefined) {
    const parsed = new Date(req.body.startTime);
    if (isNaN(parsed.getTime())) return res.status(400).json({ error: 'Heure de début invalide.' });
    startTime = parsed;
  }

  let stopTime = new Date();
  if (req.body.endTime !== undefined) {
    const parsed = new Date(req.body.endTime);
    if (isNaN(parsed.getTime())) return res.status(400).json({ error: 'Heure de fin invalide.' });
    stopTime = parsed;
    // Horloge d'un téléphone en avance (ou arrêt hors ligne rejoué avec un écart périmé) : une fin plus d'une minute dans le futur
    // est ramenée à l'heure du serveur au lieu d'être refusée (la session n'est pas perdue) ; sans cela l'entrée déborderait sur la suivante.
    const nowTs = Date.now();
    if (stopTime.getTime() > nowTs + 60 * 1000 && startTime.getTime() <= nowTs + 60 * 1000) stopTime = new Date(nowTs);
  }

  if (stopTime <= startTime) {
    return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début." });
  }
  // Anti-triche : mêmes règles que l'historique (pas de chevauchement, 24 h au plus, pas de futur). Un début
  // corrigé à l'arrêt est une saisie manuelle : plafonné à 48 h dans le passé. Le chrono reste en cours si refusé.
  const guardMsg = checkEntryTimes(user.id, startTime, stopTime, 0, undefined, { manual: req.body.startTime !== undefined, overlapToleranceMs: 60 * 1000 });
  if (guardMsg) return res.status(400).json({ error: guardMsg });

  const durationSeconds = Math.max(0, Math.round((stopTime - startTime) / 1000));
  const noteChk = textlimits.clean(req.body.note !== undefined ? req.body.note : running.note, { max: textlimits.LIMITS.SESSION_NOTE, word: 'Note', fem: true, kind: 'text' });
  if (noteChk.error) return res.status(400).json({ error: noteChk.error });
  const note = noteChk.text;

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(running.activityId);

  // Dernière chance de corriger la catégorie, au moment de valider l'arrêt
  // (demande d'Emilien, même convention que pour le sous-projet qu'elle
  // remplace). Champ absent : on garde celle choisie pendant la session —
  // c'est ce qui permet à l'écran de ne rien envoyer quand il n'a pas pu
  // afficher le sélecteur, plutôt que d'effacer un rattachement par
  // omission. `null` détache explicitement.
  const resolved = resolveCategoryKey(running.activityId, req.body.category, running.goalCategory);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

  // isoDate/dayOfWeek calculés dans le fuseau du TÉLÉPHONE de la personne
  // (req.timezone, résolu par server/lib/session.js depuis l'en-tête envoyé
  // par le client), pas dans celui, fixe, du serveur — 9 septembre 2026,
  // chantier "fuseau horaire automatique". Sans ça, une session commencée en
  // fin de soirée pour un membre hors du fuseau de l'Est (Colombie-
  // Britannique, Alberta...) resterait datée du mauvais jour calendaire,
  // exactement le bug déjà corrigé le 30 août 2026 pour le fuseau du
  // serveur lui-même (voir server/index.js) mais qui reste entier pour
  // quiconque n'est pas à l'heure de l'Est.
  const info = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, running.activityId, note, startTime.toISOString(), stopTime.toISOString(), durationSeconds,
      isoDateOf(startTime, req.timezone), dayNameOf(startTime, req.timezone), resolved.categoryKey);

  db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);

  res.json({
    message: `Activité enregistrée : ${activity ? activity.name : ''}`,
    elapsed: formatElapsed(durationSeconds * 1000),
    entryId: info.lastInsertRowid,
    category: categorySummary(running.activityId, resolved.categoryKey),
  });
});

module.exports = router;