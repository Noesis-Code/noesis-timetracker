// Livraison de l'Offre 1 — génère et tient à jour les 3 sous-projets promis
// à un client abonné, avec des tâches produites par IA à partir de ses 4
// formulaires persistants.
//
// Pivot du 9 septembre 2026 (achat ponctuel -> abonnement Stripe récurrent
// PAR ACTIVITÉ, 20$/mois) : ce fichier expose désormais DEUX points d'entrée
// distincts au lieu d'un seul "generateOfferSubProjects" :
// - activateActivitySubscription() : UNE SEULE FOIS, au premier paiement
//   réussi — crée les 3 sous-projets (slot 0/1/2) et révèle leurs toutes
//   premières tâches.
// - regenerateActivityRoadmap() : CHAQUE MOIS (server/lib/subscriptioncron.js),
//   à partir de l'état COURANT des formulaires — mets à jour le nom/la
//   description des 3 sous-projets existants et REMPLACE leur backlog
//   (sub_project_item_queue), sans jamais toucher aux tâches déjà visibles.
//   Voir server/lib/subprojectqueue.js pour le mécanisme de révélation
//   différée (24h après qu'une tâche visible est cochée).
//
// Résolution/création de l'activité (achat) : déplacée entièrement dans
// server/routes/offercheckout.js, qui la fait AVANT le paiement — les deux
// fonctions ci-dessous reçoivent donc toujours un activityId déjà garanti
// valide, plus besoin de le refaire ici.

const db = require('../db');
const sp = require('./subprojects');
const { replaceQueue } = require('./subprojectqueue');
const offerquota = require('./offerquota');

const SUBPROJECT_COUNT = 3;
const REVEAL_BATCH_SIZE = 3; // tâches visibles d'un coup par sous-projet à l'activation — 9 au total sur les 3
const MAX_NAME_LENGTH = 120;         // même plafond que server/routes/subprojects.js
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ITEM_LABEL_LENGTH = 300;

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ===================== FORMULAIRES =====================
// Les 4 formulaires persistants (jamais transportés par le paiement, voir
// server/db.js) forment ensemble le contexte envoyé à l'IA — remplace
// l'ancien `answers` unique soumis une fois au moment de l'achat.
function loadFormsPayload(activityId, userId) {
  const activityForms = db.prepare('SELECT kind, answers FROM activity_forms WHERE activityId = ?').all(activityId);
  const forms = {};
  for (const row of activityForms) {
    try { forms[row.kind] = JSON.parse(row.answers); } catch (e) { forms[row.kind] = {}; }
  }
  const profile = db.prepare('SELECT answers FROM client_profile_forms WHERE userId = ?').get(userId);
  let clientProfile = {};
  if (profile) {
    try { clientProfile = JSON.parse(profile.answers); } catch (e) { clientProfile = {}; }
  }
  return {
    discovery: forms.discovery || {},
    means: forms.means || {},
    strategy: forms.strategy || {},
    clientProfile,
  };
}

// ===================== GÉNÉRATION IA DU PLAN =====================
// Un seul appel pour les 3 sous-projets plutôt que 3 appels séparés : plus
// cohérent entre eux (l'IA voit l'ensemble du plan), un seul point de
// défaillance réseau, et moins coûteux. Sortie strictement contrainte en
// JSON — aucune tentative de parser du texte libre ou du Markdown.
//
// Chaque sous-projet demande PLUS de tâches qu'un affichage ponctuel n'en
// montrerait : au-delà des REVEAL_BATCH_SIZE premières (révélées tout de
// suite à l'activation), le reste alimente le backlog (sub_project_item_queue)
// consommé au fil des mois par le remplacement différé — voir
// server/lib/subprojectqueue.js.
const SYSTEM_PROMPT = `Tu prépares la feuille de route de l'Offre 1 de Noèsis pour un client abonné.
À partir de l'état courant de ses 4 formulaires (discovery, means, strategy, clientProfile), propose exactement ${SUBPROJECT_COUNT} sous-projets concrets et actionnables, chacun avec une liste de tâches ORDONNÉES (les premières sont les plus urgentes/prioritaires — elles seront montrées en premier).
Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte ni Markdown autour :
{"subProjects":[{"name":"...","description":"...","tasks":["...","..."]}]}
Contraintes : exactement ${SUBPROJECT_COUNT} sous-projets ; chaque "name" fait moins de ${MAX_NAME_LENGTH} caractères ; chaque "description" fait moins de ${MAX_DESCRIPTION_LENGTH} caractères ; chaque tâche fait moins de ${MAX_ITEM_LABEL_LENGTH} caractères ; entre ${REVEAL_BATCH_SIZE} et 15 tâches par sous-projet (une vraie feuille de route, pas juste les 3 premières étapes).`;

async function generateSubProjectsPlan(formsPayload) {
  if (!aiConfigured()) {
    throw new Error("Génération IA indisponible : ANTHROPIC_API_KEY n'est pas configurée côté serveur.");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(formsPayload || {}) }],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body && body.error && body.error.message ? body.error.message : '';
    } catch (err) {
      // Réponse non-JSON — pas d'information supplémentaire, on continue
      // avec seulement le code HTTP.
    }
    throw new Error(`L'IA a refusé de générer le plan (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
  }

  const body = await res.json();
  const text = (body.content || []).map((block) => block.text || '').join('');
  return parsePlan(text);
}

// Validation stricte de la réponse IA : elle contourne les routes HTTP (on
// appelle sp.createSubProject/createSection/createItem directement), donc
// les plafonds normalement posés par server/routes/subprojects.js n'existent
// plus en amont — ils sont réappliqués ici.
function parsePlan(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("Réponse de l'IA illisible (JSON invalide).");
  }

  const subProjects = Array.isArray(parsed.subProjects) ? parsed.subProjects : null;
  if (!subProjects || subProjects.length !== SUBPROJECT_COUNT) {
    throw new Error(`L'IA doit renvoyer exactement ${SUBPROJECT_COUNT} sous-projets (reçu : ${subProjects ? subProjects.length : 0}).`);
  }

  return subProjects.map((raw, index) => {
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!name) throw new Error(`Sous-projet #${index + 1} : nom manquant dans la réponse de l'IA.`);

    const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '';

    const tasks = Array.isArray(raw.tasks)
      ? raw.tasks.map((t) => (typeof t === 'string' ? t.trim().slice(0, MAX_ITEM_LABEL_LENGTH) : '')).filter(Boolean)
      : [];
    if (!tasks.length) throw new Error(`Sous-projet #${index + 1} ("${name}") : aucune tâche exploitable dans la réponse de l'IA.`);

    return { name, description, tasks };
  });
}

// ===================== ACTIVATION (une seule fois) =====================
// Appelée par server/routes/stripewebhook.js au premier
// checkout.session.completed d'un abonnement. Idempotente : si les 3
// sous-projets de cette activité existent déjà (slot posé), ne fait RIEN de
// plus — une relivraison Stripe du même événement ne doit jamais dupliquer
// la feuille de route.
async function activateActivitySubscription(activityId, userId) {
  const already = db.prepare('SELECT 1 FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL LIMIT 1').get(activityId);
  if (already) return { activityId, alreadyActivated: true };

  const plan = await generateSubProjectsPlan(loadFormsPayload(activityId, userId));

  const created = [];
  db.exec('BEGIN');
  try {
    plan.forEach((item, slot) => {
      const subProject = sp.createSubProject(activityId, userId, item.name, item.description, null, /* pinned */ true);
      db.prepare('UPDATE sub_projects SET slot = ? WHERE id = ?').run(slot, subProject.id);
      const section = sp.createSection(subProject.id, userId, 'tasks', '');

      const revealed = item.tasks.slice(0, REVEAL_BATCH_SIZE).map((label) => sp.createItem(section, label));
      const backlog = item.tasks.slice(REVEAL_BATCH_SIZE);
      replaceQueue(section.id, backlog);
      // Les REVEAL_BATCH_SIZE tâches qui viennent d'être révélées comptent
      // dans le palier de base du pôle (modèle pool partagé, 9 septembre 2026)
      // — voir server/lib/offerquota.js.
      offerquota.seedRenewalsUsed(subProject.id, revealed.length);

      created.push({ subProject, section, revealed, queued: backlog.length });
    });
    // Démarre le cycle mensuel de L'ACTIVITÉ (pas de l'abonnement individuel) :
    // c'est cette horloge, pas Stripe, qui décide désormais quand
    // server/lib/subscriptioncron.js régénère et remet les quotas à zéro.
    offerquota.ensureCycleStarted(activityId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { activityId, subProjects: created };
}

// ===================== RÉGÉNÉRATION MENSUELLE =====================
// Appelée par server/lib/subscriptioncron.js pour une activité dont
// l'abonnement est dû. Ne touche JAMAIS aux sub_project_items déjà visibles
// (cochés ou non) : seuls name/description des 3 sous-projets et le backlog
// de chaque section 'tasks' sont rafraîchis. Si l'activation n'a encore
// jamais eu lieu (aucun slot posé — ne devrait pas arriver puisque le cron
// ne traite que des abonnements déjà actifs), active plutôt que de planter.
//
// ⚠️ Ne touche PAS au cycle/quota (activity_billing_cycles,
// sub_projects.renewalsUsedThisPeriod) : c'est server/lib/subscriptioncron.js,
// l'APPELANT, qui décide de les avancer/remettre à zéro — uniquement une fois
// que cet appel a réussi. Sinon un échec IA laisserait le quota remis à zéro
// sans feuille de route fraîche derrière.
async function regenerateActivityRoadmap(activityId, userId) {
  const existingSlots = db.prepare('SELECT id, slot FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').all(activityId);
  if (!existingSlots.length) {
    return activateActivitySubscription(activityId, userId);
  }

  const plan = await generateSubProjectsPlan(loadFormsPayload(activityId, userId));
  const bySlot = new Map(existingSlots.map((row) => [row.slot, row.id]));

  db.exec('BEGIN');
  try {
    plan.forEach((item, slot) => {
      const subProjectId = bySlot.get(slot);
      if (!subProjectId) return; // slot manquant (ne devrait pas arriver) : on laisse tel quel plutôt que d'inventer un sous-projet hors activation
      sp.updateSubProject(subProjectId, { name: item.name, description: item.description });
      const section = db.prepare("SELECT id FROM sub_project_sections WHERE subProjectId = ? AND kind = 'tasks'").get(subProjectId);
      if (section) replaceQueue(section.id, item.tasks);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { activityId, regenerated: true };
}

module.exports = {
  activateActivitySubscription,
  regenerateActivityRoadmap,
  // Exportés séparément pour les tests et un futur outil d'admin.
  loadFormsPayload,
  generateSubProjectsPlan,
};
