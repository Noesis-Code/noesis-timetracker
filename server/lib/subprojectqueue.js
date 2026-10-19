// Backlog de tâches et remplacement différé (abonnement Offre 1, 9 septembre
// 2026) — voir le commentaire de sub_project_item_queue et de
// sub_project_items.replacementRevealedAt dans server/db.js pour le schéma.
//
// Séparé de server/lib/subprojects.js à dessein : ce fichier-là porte un
// contrat explicite avec la discussion "Général" (progressForActivities) et
// un périmètre volontairement restreint au découpage d'une activité — la
// mécanique d'abonnement n'y a pas sa place, elle s'appuie dessus (createItem,
// getSection...) sans le modifier.
const db = require('../db');
const sp = require('./subprojects');
const offerquota = require('./offerquota');

// Remplace ENTIÈREMENT le backlog d'une section par une nouvelle liste de
// libellés, dans l'ordre donné. Utilisée aussi bien à l'activation (backlog
// initial, sur une section neuve donc vide) qu'à la régénération mensuelle
// (le backlog existant est jeté et reconstruit à partir du plan IA frais) —
// dans les deux cas, ne touche JAMAIS aux sub_project_items déjà visibles.
function replaceQueue(sectionId, labels) {
  db.prepare('DELETE FROM sub_project_item_queue WHERE sectionId = ?').run(sectionId);
  const insert = db.prepare('INSERT INTO sub_project_item_queue (sectionId, label, position, createdAt) VALUES (?, ?, ?, ?)');
  const now = new Date().toISOString();
  (labels || []).forEach((label, index) => insert.run(sectionId, label, index, now));
}

// La prochaine tâche en attente d'une section (la plus ancienne par
// position), ou null si le backlog est vide.
function nextQueuedItem(sectionId) {
  return db.prepare('SELECT * FROM sub_project_item_queue WHERE sectionId = ? ORDER BY position ASC, id ASC LIMIT 1').get(sectionId) || null;
}

// ===================== RÉVÉLATION DIFFÉRÉE =====================
// Appelée par le balayage horaire de server/lib/subscriptioncron.js. Pour
// chaque tâche cochée depuis au moins 24h et dont le remplacement n'a pas
// encore été révélé : si le backlog de sa section a un prochain élément, le
// fait apparaître comme un sub_project_items normal et marque la tâche
// cochée comme "remplacée" — jamais deux fois (garde replacementRevealedAt
// IS NULL). Si le backlog est vide, ne marque RIEN : le prochain passage
// retentera automatiquement dès que la régénération mensuelle réalimente la
// section, sans logique de rattrapage séparée à écrire.
//
// Chaque item traité dans sa propre transaction : un remplacement révélé et
// sa tâche source marquée "remplacée" doivent réussir ou échouer ENSEMBLE,
// sinon une panne entre les deux ferait réapparaître le même remplaçant à
// chaque passage suivant.
//
// ⚠️ Modèle pool partagé (9 septembre 2026) : un backlog non-vide ne suffit
// plus — il faut aussi que le PÔLE (sub_projects.slot, via subProjectId) ait
// encore du budget sur la période en cours (server/lib/offerquota.js). Un
// pôle plafonné se comporte EXACTEMENT comme un backlog vide (on ne pose pas
// `replacementRevealedAt`, le prochain passage retente tout seul) : c'est ce
// qui laisse la tâche cochée affichée en l'état, la carte "Plafond atteint"
// se déduisant à la lecture (doneAt > 24h + toujours pas révélé + budget
// atteint), jamais stockée ici.
function revealDueReplacements() {
  const due = db.prepare(`
    SELECT i.id, i.sectionId, s.subProjectId AS subProjectId
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    WHERE i.done = 1 AND i.doneAt IS NOT NULL AND i.doneAt <= datetime('now', '-24 hours')
      AND i.replacementRevealedAt IS NULL AND i.sectionId IS NOT NULL
  `).all();

  let revealed = 0;
  for (const item of due) {
    const queued = nextQueuedItem(item.sectionId);
    if (!queued) continue; // backlog vide : on retentera au prochain passage
    if (!offerquota.canRevealReplacement(item.subProjectId)) continue; // plafond atteint : idem

    db.exec('BEGIN');
    try {
      // section minimale : sp.createItem ne lit que .id et .subProjectId.
      const section = db.prepare('SELECT id, subProjectId FROM sub_project_sections WHERE id = ?').get(item.sectionId);
      if (section) {
        sp.createItem(section, queued.label, { noSpellfix: true });
        db.prepare('DELETE FROM sub_project_item_queue WHERE id = ?').run(queued.id);
        offerquota.incrementRenewalsUsed(item.subProjectId);
      }
      db.prepare('UPDATE sub_project_items SET replacementRevealedAt = ? WHERE id = ?')
        .run(new Date().toISOString(), item.id);
      db.exec('COMMIT');
      revealed += 1;
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[subprojectqueue] échec de révélation pour item', item.id, ':', e.message);
    }
  }
  return revealed;
}

module.exports = {
  replaceQueue,
  revealDueReplacements,
};
