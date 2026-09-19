// Accès aux 4 formulaires persistants de l'Offre 1 (9 septembre 2026) — 3 par
// activité (discovery/means/strategy) et 1 par client (profil, partagé entre
// toutes ses activités abonnées). Jamais transportés par le paiement (voir
// server/routes/offercheckout.js) : lus et écrits indépendamment, à tout
// moment, avant ou après un abonnement — jamais "resoumis" de zéro, toujours
// mis à jour en place (upsert).
//
// Séparé de server/lib/subprojects.js (le découpage d'une activité) et de
// server/lib/offerdelivery.js (la génération IA à partir de CES formulaires) :
// ce fichier ne fait QUE l'accès aux données des formulaires eux-mêmes.
const db = require('../db');

const ACTIVITY_FORM_KINDS = ['discovery', 'means', 'strategy'];

function parseAnswers(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

// ===================== FORMULAIRES PAR ACTIVITÉ =====================

// Toujours les 3 kinds, même ceux jamais enregistrés ({} par défaut) — le
// client n'a pas à distinguer "pas encore rempli" de "vide", les deux se
// comportent pareil à l'affichage.
function activityForms(activityId) {
  const rows = db.prepare('SELECT kind, answers FROM activity_forms WHERE activityId = ?').all(activityId);
  const byKind = {};
  rows.forEach((r) => { byKind[r.kind] = parseAnswers(r.answers); });
  const out = {};
  ACTIVITY_FORM_KINDS.forEach((kind) => { out[kind] = byKind[kind] || {}; });
  return out;
}

function saveActivityForm(activityId, kind, userId, answers) {
  db.prepare(`
    INSERT INTO activity_forms (activityId, kind, answers, updatedBy, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(activityId, kind) DO UPDATE SET
      answers = excluded.answers, updatedBy = excluded.updatedBy, updatedAt = excluded.updatedAt
  `).run(activityId, kind, JSON.stringify(answers || {}), userId, new Date().toISOString());
  return parseAnswers(db.prepare('SELECT answers FROM activity_forms WHERE activityId = ? AND kind = ?').get(activityId, kind).answers);
}

// ===================== FORMULAIRE PROFIL CLIENT =====================

function clientProfileForm(userId) {
  const row = db.prepare('SELECT answers FROM client_profile_forms WHERE userId = ?').get(userId);
  return row ? parseAnswers(row.answers) : {};
}

function saveClientProfileForm(userId, answers) {
  db.prepare(`
    INSERT INTO client_profile_forms (userId, answers, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET answers = excluded.answers, updatedAt = excluded.updatedAt
  `).run(userId, JSON.stringify(answers || {}), new Date().toISOString());
  return clientProfileForm(userId);
}

module.exports = {
  ACTIVITY_FORM_KINDS,
  activityForms,
  saveActivityForm,
  clientProfileForm,
  saveClientProfileForm,
};
