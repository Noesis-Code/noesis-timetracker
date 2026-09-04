// Rattachement d'un temps enregistré à un sous-projet — validation partagée
// par le Chrono (server/routes/timer.js) et l'historique modifiable
// (server/routes/history.js).
//
// Propriété : chantier « Chrono — sous-projets » (4 septembre 2026). Ce
// fichier existe pour une seule raison : les deux routes ci-dessus doivent
// appliquer EXACTEMENT la même règle, et une règle d'accès recopiée à deux
// endroits finit toujours par diverger.
//
// ⚠️ CE FICHIER N'INTERROGE JAMAIS LES TABLES DE « SOUS-PROJETS ».
// Tout passe par les deux fonctions qu'elle expose déjà :
//   - checkSubProjectAccess(userId, subProjectId) -> { error } | { subProject }
//   - subProjectsForActivity(activityId, includeClosed)
// Si Sous-projets resserre un jour ses règles (accès, clôture), ce fichier
// suit automatiquement — c'est le même principe que le socle des sondages,
// qui appelle la garde de son hôte au lieu de la recopier.
//
// ⚠️ CE FICHIER NE CALCULE AUCUN AVANCEMENT et ne doit jamais en calculer.
// Le pourcentage d'un sous-projet vient uniquement des cases cochées de sa
// todolist (noesis-timetracker-contrat-avancement.md). Le temps se compte À
// CÔTÉ, jamais dedans.

const { checkSubProjectAccess, subProjectsForActivity, getSubProject } = require('./subprojects');

// Le corps d'une requête peut vouloir dire trois choses différentes, et les
// confondre ferait perdre des rattachements en silence :
//   - champ ABSENT (undefined)        -> ne rien changer, garder `current`
//   - champ vide (null, '', 0, '0')   -> détacher explicitement
//   - un identifiant                  -> rattacher, après validation
function isDetachValue(raw) {
  return raw === null || raw === '' || raw === 0 || raw === '0' || raw === 'null';
}

// Renvoie { error: { status, body } } ou { subProjectId: Number|null }.
//
// `activityId` est l'activité RÉELLE de l'enregistrement (celle qui sera
// écrite en base), pas celle annoncée ailleurs dans la requête : c'est elle
// qui fait autorité pour la cohérence.
//
// `current` est le rattachement actuel (null si aucun). Il sert à deux
// choses : décider quoi faire quand le champ est absent, et autoriser un
// sous-projet CLÔTURÉ à rester attaché s'il l'était déjà — un sous-projet
// clôturé ne doit plus pouvoir être CHOISI, mais ce qui y est déjà rattaché
// garde son lien (la clôture masque, elle ne supprime pas).
function resolveSubProjectId(userId, activityId, raw, current) {
  const currentId = current === undefined || current === null ? null : Number(current);

  if (raw === undefined) return { subProjectId: currentId };
  if (isDetachValue(raw)) return { subProjectId: null };

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: { status: 400, body: { error: 'Sous-projet invalide.' } } };
  }

  // Existence + « membre de l'activité qui le porte », par LEUR garde.
  const access = checkSubProjectAccess(userId, id);
  if (access.error) return access;

  // ⭐ COHÉRENCE ACTIVITÉ / SOUS-PROJET, validée ICI, côté serveur — pas
  // seulement dans l'écran. Sans ce contrôle, un client fabriqué à la main
  // (ou un écran resté ouvert pendant que l'activité changeait) rattacherait
  // du temps d'une activité au sous-projet d'une autre, et l'enregistrement
  // n'aurait plus aucun sens nulle part.
  if (Number(access.subProject.activityId) !== Number(activityId)) {
    return {
      error: {
        status: 400,
        body: { error: "Ce sous-projet n'appartient pas à cette activité." },
      },
    };
  }

  // Clôture : refusée à l'attachement, tolérée si elle était déjà là.
  if (id !== currentId) {
    const open = subProjectsForActivity(activityId, false);
    if (!open.some((s) => Number(s.id) === id)) {
      return { error: { status: 400, body: { error: 'Ce sous-projet est clôturé.' } } };
    }
  }

  return { subProjectId: id };
}

// Ce que les routes renvoient au client pour afficher le rattachement :
// juste de quoi l'écrire à l'écran et le repérer dans un sélecteur.
// `closed: true` sert au client à garder l'option épinglée dans sa liste au
// lieu de la faire disparaître — sans quoi ouvrir le sélecteur suffirait à
// effacer un rattachement existant.
function subProjectSummary(activityId, subProjectId) {
  if (!subProjectId) return null;
  const row = getSubProject(subProjectId);
  if (!row) return null;
  const open = subProjectsForActivity(row.activityId, false);
  return {
    id: row.id,
    name: row.name,
    activityId: row.activityId,
    closed: !open.some((s) => Number(s.id) === Number(row.id)),
  };
}

module.exports = { resolveSubProjectId, subProjectSummary };
