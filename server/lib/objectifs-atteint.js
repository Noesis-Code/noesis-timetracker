// « Objectif atteint ? » (décision d'Émilien, 20 nov. 2026). Un objectif n'est ATTEINT que si la PERSONNE le confirme : faire toutes ses tâches ne suffit pas (on peut en découvrir d'autres).
// Quand la personne coche la DERNIÈRE tâche ouverte rangée dans un objectif, l'app propose UNE fois (le client ouvre TMT.ui.confirm) ; l'app propose, elle ne décide jamais.
//  - OUI : metaJson.atteintConfirme = date du jour ; l'objectif sort des objectifs « en cours » (ses heures sont libérées : objectifs-capacite.js) ; rien n'est supprimé (S6).
//  - PAS ENCORE : il reste en cours ; metaJson.atteintDemande = nombre de tâches au moment de la question : elle ne se repose que lorsqu'une tâche a été AJOUTÉE puis terminée.
//  - Décocher une tâche d'un objectif atteint propose « Rouvrir l'objectif ? » (jamais de réouverture silencieuse). Une nouvelle tâche rangée dans un objectif atteint : pas de question (voir docs/objectifs/heures-et-taches.md).
// Seul le PROPRIÉTAIRE de l'objectif dont la portée couvre la catégorie (responsable) voit la question : un simple membre coche sa tâche sans jamais la voir (contrôle ici, côté serveur).
const db = require('../db');
const today = () => require('./dates').userToday();
const parse = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };

function liees(itemId) {
  return db.prepare("SELECT * FROM user_objectives WHERE taskIdsJson LIKE ?").all('%' + Number(itemId) + '%')
    .filter((r) => (parse(r.taskIdsJson, []) || []).includes(Number(itemId)));
}
function tachesDe(r) {
  const ids = (parse(r.taskIdsJson, []) || []).filter(Number.isInteger);
  return ids.length ? db.prepare('SELECT id, done FROM sub_project_items WHERE id IN (' + ids.map(() => '?').join(',') + ')').all(...ids) : [];
}
const voit = (userId, r) => { try { require('./portee').exigerObjectif(userId, r.activityId, r.poleKey, r.categoryKey); return true; } catch (e) { return false; } };

// Après qu'une tâche a été cochée / décochée par `userId` : null, ou { type: 'atteint' | 'rouvrir', id, title }.
function apresCoche(userId, itemId, done) {
  for (const r of liees(itemId)) {
    if (r.userId !== userId || r.isMacro || !voit(userId, r)) continue;
    const m = parse(r.metaJson || '{}', {}); if (m.abandoned) continue;
    const tasks = tachesDe(r);
    if (done && !m.atteintConfirme) {
      if (tasks.length && tasks.every((t) => t.done) && !(Number(m.atteintDemande) >= tasks.length)) return { type: 'atteint', id: r.id, title: r.title };
    } else if (!done && m.atteintConfirme) return { type: 'rouvrir', id: r.id, title: r.title };
  }
  return null;
}
// Réponse de la personne : 'oui' | 'pas_encore' | 'rouvrir'.
function repondre(userId, id, action) {
  const r = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(id), userId), e = (msg, code) => Object.assign(new Error(msg), { statusCode: code });
  if (!r) throw e('Objectif introuvable.', 404);
  require('./portee').exigerObjectif(userId, r.activityId, r.poleKey, r.categoryKey); // un simple membre ne confirme rien
  if (r.isMacro) throw e('Action invalide.', 400);
  const m = parse(r.metaJson || '{}', {}), n = tachesDe(r).length;
  if (action === 'oui') { if (!m.atteintConfirme) m.atteintConfirme = today(); m.atteintDemande = n; }
  else if (action === 'pas_encore') m.atteintDemande = n;
  else if (action === 'rouvrir') { delete m.atteintConfirme; delete m.atteintDemande; }
  else throw e('Action invalide.', 400);
  db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(m), r.id);
  return { id: r.id, atteint: !!m.atteintConfirme, atteintConfirme: m.atteintConfirme || null };
}
module.exports = { apresCoche, repondre };
