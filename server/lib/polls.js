// Noèsis TimeTracker — sondages (socle générique)
//
// Propriété : discussion "Sondages" (11ᵉ discussion, 3 septembre 2026).
//
// ---------------------------------------------------------------------------
// POURQUOI UN SOCLE PLUTÔT QUE QUATRE IMPLÉMENTATIONS
// ---------------------------------------------------------------------------
// Emilien veut pouvoir lancer un sondage depuis plusieurs endroits de l'app.
// Plutôt que de recopier le même mécanisme dans chaque zone (ce que le projet
// s'interdit depuis la directive anti-doublon du 29 août 2026), un seul jeu de
// tables et un seul jeu de routes servent tout le monde, distingués par un
// couple (scope, scopeId) :
//
//   scope = 'profile'     -> scopeId = l'id (UUID texte) du profil auteur.
//                            Le sondage défile comme un "post" : chez son
//                            auteur (zone Discussion du Profil et zone
//                            « écrire à sa communauté » de #tab-community),
//                            dans le flux Suivi de ses abonnés, et sur sa
//                            page de visite de profil.
//   scope = 'subproject'  -> scopeId = l'id du sous-projet (server/lib/
//                            subprojects.js, discussion "Sous-projets").
//
// ⚠️ Cadrage explicite d'Emilien (3 septembre 2026) : « Les sondages
// n'apparaissent jamais dans les discussions, ils sont toujours des post qui
// défile sur le volet communauté, sur le profil ou dans un sous projet d'une
// activité. » Le fil de discussion d'une activité partagée (activity_messages,
// discussion "Activité — général") n'est donc PAS un hôte de sondage — c'est un
// changement par rapport au cadrage initial du 3 septembre, qui listait quatre
// consommateurs dont ce fil.
//
// ---------------------------------------------------------------------------
// LE POINT D'ARCHITECTURE LE PLUS IMPORTANT : LE CONTRÔLE D'ACCÈS N'EST PAS ICI
// ---------------------------------------------------------------------------
// Ce fichier ne sait PAS, et ne doit jamais savoir, qui a le droit de voir un
// sondage. Un sondage de sous-projet se lit si on est membre de l'activité qui
// le porte ; un sondage de profil se lit selon les deux niveaux d'accès de
// server/routes/profile.js. Ces règles appartiennent aux discussions hôtes.
//
// Le socle expose donc un REGISTRE de gardes : chaque hôte enregistre la
// sienne (voir registerScopeGuard, appelé depuis server/routes/polls.js), et
// le socle se contente de l'appeler. Trois propriétés voulues :
//
//   1. FERMÉ PAR DÉFAUT — un scope sans garde enregistrée est refusé, jamais
//      autorisé. Ajouter un scope sans écrire sa garde ne peut donc pas ouvrir
//      un trou par distraction.
//   2. UNE GARDE QUI PLANTE REFUSE — si la garde d'un hôte lève une exception
//      (table pas encore créée, migration pas encore passée, appelant inconnu),
//      on répond 403 plutôt que de laisser passer. C'est l'exact inverse du
//      principe « une notification ne doit jamais faire échouer l'action qui
//      l'a déclenchée » (server/lib/push.js) : là-bas l'échec est bénin, ici il
//      porte sur des droits.
//   3. LIRE ET CRÉER SONT DEUX DROITS DIFFÉRENTS — la garde renvoie
//      `canCreate`, ce qui permet à un hôte d'ouvrir la lecture/le vote
//      largement tout en réservant la création (cas du profil : tout membre
//      identifié peut voter sur le sondage d'Emilien, seul Emilien peut en
//      créer un sur SON profil).

const db = require('../db');

// Bornes de saisie. Généreuses pour une vraie question, mais bornées : le
// corps de requête d'Express est déjà limité globalement (server/index.js),
// ce n'est pas une raison pour laisser stocker un roman par option.
const MAX_QUESTION_LENGTH = 300;
const MAX_OPTION_LENGTH = 120;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

// ===================== REGISTRE DES GARDES PAR SCOPE =====================

// Object.create(null) plutôt que {} : une clé de scope venant d'une requête
// ne peut ainsi jamais tomber par hasard sur une propriété héritée d'Object
// ('constructor', 'toString'...) et se faire prendre pour une garde.
const scopeGuards = Object.create(null);

// guard(userId, scopeId) doit renvoyer :
//   { error: { status, body } }  -> refus, relayé tel quel au client
//   { canCreate: bool }          -> accès en lecture/vote accordé
function registerScopeGuard(scope, guard) {
  scopeGuards[scope] = guard;
}

function knownScopes() {
  return Object.keys(scopeGuards);
}

function checkScopeAccess(scope, scopeId, userId) {
  if (!userId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  if (!scope || scopeId === undefined || scopeId === null || scopeId === '') {
    return { error: { status: 400, body: { error: 'scope et scopeId requis.' } } };
  }

  const guard = scopeGuards[scope];
  if (typeof guard !== 'function') {
    // Fermé par défaut (propriété 1 ci-dessus). Un scope prévu mais dont
    // l'hôte n'a pas encore fourni sa garde tombe ici.
    return { error: { status: 400, body: { error: 'Type de sondage inconnu.' } } };
  }

  let verdict;
  try {
    verdict = guard(userId, scopeId);
  } catch (err) {
    // Propriété 2 : une garde en échec REFUSE. Journalisé pour que la panne
    // soit visible côté serveur, jamais silencieuse.
    console.error('[polls] garde du scope "' + scope + '" en échec :', err && err.message);
    return { error: { status: 403, body: { error: "Accès impossible à vérifier pour l'instant." } } };
  }

  if (!verdict) return { error: { status: 403, body: { error: 'Accès refusé.' } } };
  if (verdict.error) return verdict;
  return { ok: true, canCreate: !!verdict.canCreate };
}

// ===================== LECTURE =====================

function nowIso() {
  return new Date().toISOString();
}

// Un sondage est clos soit parce que son auteur l'a clos à la main
// (closedAt), soit parce que sa date de clôture est passée. Les deux dates
// sont stockées au même format ISO/UTC, donc une comparaison de chaînes
// suffit et donne le même résultat qu'une comparaison de dates.
function isPollClosed(row, at) {
  if (row.closedAt) return true;
  if (row.closesAt && row.closesAt <= (at || nowIso())) return true;
  return false;
}

function optionsOf(pollId) {
  return db.prepare('SELECT id, label, position FROM poll_options WHERE pollId = ? ORDER BY position, id').all(pollId);
}

function votesOf(pollId) {
  return db.prepare(`
    SELECT v.optionId, v.userId, u.name AS userName, u.color AS userColor
    FROM poll_votes v
    JOIN users u ON u.id = v.userId
    WHERE v.pollId = ?
    ORDER BY v.votedAt, v.id
  `).all(pollId);
}

// Forme renvoyée au client. LE point sensible est `resultsVisible` :
//
// Emilien a tranché le 3 septembre 2026 que quelqu'un qui n'a pas encore voté
// ne voit RIEN — pas les pourcentages, pas les noms, pas même le nombre de
// participants (l'option « N personnes ont voté » lui a été proposée et
// écartée). Quand les résultats sont cachés, on ne renvoie donc pas des
// chiffres que le client aurait la charge de masquer : `count`, `voters` et
// `totalVoters` valent littéralement null dans la réponse HTTP. Un curieux qui
// ouvre l'inspecteur réseau ne voit rien de plus que la page.
//
// Trois cas ouvrent les résultats :
//   - on a voté (c'est le mécanisme voulu : voter pour voir) ;
//   - le sondage est clos (sinon un non-votant n'aurait jamais accès au
//     résultat, une fois le vote devenu impossible) ;
//   - on est l'auteur (il doit pouvoir suivre son propre sondage sans être
//     obligé d'y voter — décision du socle, signalée à Emilien).
//
// Le vote anonyme (3 septembre 2026, demande d'Emilien) se superpose à cette
// règle sans la remplacer : `anonymous` ne change RIEN à la visibilité des
// compteurs, il supprime seulement les NOMS — pour tout le monde, l'auteur du
// sondage compris. Là encore par omission : `voters` vaut null dans la
// réponse, il n'est pas envoyé puis caché côté client. La contrepartie
// honnête, écrite ici pour qu'aucune session future ne la découvre trop tard :
// `poll_votes` garde le lien vote↔personne, seul moyen d'empêcher un second
// vote. C'est un anonymat vis-à-vis des autres utilisateurs, pas vis-à-vis de
// la base de données.
function serializePoll(row, viewerId, at) {
  const closed = isPollClosed(row, at);
  const isMine = row.authorId === viewerId;
  const anonymous = !!row.anonymous;
  const options = optionsOf(row.id);
  const votes = votesOf(row.id);

  const myVote = votes.filter((v) => v.userId === viewerId).map((v) => v.optionId);
  const hasVoted = myVote.length > 0;
  const resultsVisible = hasVoted || closed || isMine;

  const voterIds = {};
  votes.forEach((v) => { voterIds[v.userId] = true; });

  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scopeId,
    question: row.question,
    multiChoice: !!row.multiChoice,
    anonymous: anonymous,
    closesAt: row.closesAt || null,
    closedAt: row.closedAt || null,
    createdAt: row.createdAt,
    author: { id: row.authorId, name: row.authorName, color: row.authorColor },
    isMine: isMine,
    isClosed: closed,
    hasVoted: hasVoted,
    myVote: myVote,
    resultsVisible: resultsVisible,
    totalVoters: resultsVisible ? Object.keys(voterIds).length : null,
    options: options.map((o) => {
      const forThis = votes.filter((v) => v.optionId === o.id);
      return {
        id: o.id,
        label: o.label,
        position: o.position,
        count: resultsVisible ? forThis.length : null,
        // Deux conditions, pas une : les résultats ouverts NE suffisent pas à
        // livrer les noms si le sondage est anonyme.
        voters: (resultsVisible && !anonymous)
          ? forThis.map((v) => ({ id: v.userId, name: v.userName, color: v.userColor }))
          : null,
      };
    }),
  };
}

const SELECT_POLL = `
  SELECT p.*, u.name AS authorName, u.color AS authorColor
  FROM polls p
  JOIN users u ON u.id = p.authorId
`;

function getPollRow(pollId) {
  return db.prepare(SELECT_POLL + ' WHERE p.id = ?').get(pollId) || null;
}

function pollsForScope(scope, scopeId, viewerId, limit) {
  const rows = db.prepare(SELECT_POLL + ' WHERE p.scope = ? AND p.scopeId = ? ORDER BY p.createdAt DESC LIMIT ?')
    .all(scope, String(scopeId), limit || 100);
  const at = nowIso();
  return rows.map((r) => serializePoll(r, viewerId, at));
}

function pollForViewer(pollId, viewerId) {
  const row = getPollRow(pollId);
  return row ? serializePoll(row, viewerId) : null;
}

// Sondages des profils que JE suis (abonnement accepté) et qui partagent leur
// profil — pendant exact de followingFeedForUser (server/lib/community.js,
// propriété de Communauté) pour les sondages.
//
// ⚠️ Volontairement écrit ici plutôt qu'en modifiant followingFeedForUser :
// aucune ligne de Communauté n'est touchée côté serveur, et le jour où elle
// voudra fusionner les deux flux en une seule réponse, elle n'aura qu'à
// appeler cette fonction — exactement comme server/routes/profile.js appelle
// breakdownForRange() sans toucher à server/lib/stats.js. La seule chose
// dupliquée est la condition « abonné accepté + shareProfile », trois lignes
// de SQL, et c'est le prix à payer pour ne pas éditer le fichier d'une autre
// discussion.
function pollsForFollowing(viewerId, limit) {
  // ⚠️ Débordement signalé (Communauté, 3 septembre 2026, sixième passage) :
  // cette requête ne renvoyait QUE les sondages des personnes suivies —
  // jamais les MIENS. Or `followingFeedForUser` (server/lib/community.js),
  // qui fusionne ce résultat avec les messages pour construire le flux
  // "Suivi", inclut explicitement mes propres posts (p.userId = ?) en plus
  // de ceux des personnes suivies. Un sondage que je crée moi-même
  // n'apparaissait donc jamais dans mon propre flux, alors que mes messages
  // y apparaissent — cause du signalement d'Emilien (« les sondages ne
  // défilent pas correctement dans le flux »). Corrigé en ajoutant la même
  // condition alternative "p.authorId = ?" que followingFeedForUser, plutôt
  // que de la deviner : deux fonctions séparées (voir le commentaire plus
  // haut sur la duplication volontaire), même règle. Le tri par date reste
  // inchangé et correct par ailleurs (les deux tables datent avec
  // new Date().toISOString(), comparable telle quelle) — seule l'ABSENCE de
  // mes propres sondages faisait paraître le flux mal trié.
  const rows = db.prepare(SELECT_POLL + `
    WHERE p.scope = 'profile'
      AND (
        p.authorId = ?
        OR (
          u.shareProfile = 1
          AND EXISTS (
            SELECT 1 FROM follows f
            WHERE f.followerId = ? AND f.followeeId = p.authorId AND f.status = 'accepted'
          )
        )
      )
    ORDER BY p.createdAt DESC
    LIMIT ?
  `).all(viewerId, viewerId, limit || 100);
  const at = nowIso();
  return rows.map((r) => serializePoll(r, viewerId, at));
}

// ===================== ÉCRITURE =====================

// Une date de clôture arrive du client au format d'un <input type="date">
// ('AAAA-MM-JJ'). On la fait courir jusqu'à la toute fin de cette journée :
// « clôture le 10 » veut dire « on peut encore voter le 10 », pas « le vote
// se ferme à minuit le 9 au soir ». Le fuseau est celui du processus, fixé à
// America/Toronto en tête de server/index.js — donc la fin de journée
// d'Emilien, pas celle d'UTC.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseClosesAt(value) {
  if (value === undefined || value === null || value === '') return { closesAt: null };
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return { error: 'Date de clôture invalide.' };
  }
  const parts = value.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
  if (isNaN(d.getTime())) return { error: 'Date de clôture invalide.' };
  if (d.getTime() <= Date.now()) return { error: 'La date de clôture doit être dans le futur.' };
  return { closesAt: d.toISOString() };
}

// Renvoie { error } ou { poll }.
function createPoll(params) {
  const question = typeof params.question === 'string' ? params.question.trim() : '';
  if (!question) return { error: { status: 400, body: { error: 'La question est obligatoire.' } } };
  if (question.length > MAX_QUESTION_LENGTH) {
    return { error: { status: 400, body: { error: 'Question trop longue (300 caractères maximum).' } } };
  }

  const rawOptions = Array.isArray(params.options) ? params.options : [];
  const labels = rawOptions
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o) => o.length > 0);
  if (labels.length < MIN_OPTIONS) {
    return { error: { status: 400, body: { error: 'Il faut au moins deux réponses possibles.' } } };
  }
  if (labels.length > MAX_OPTIONS) {
    return { error: { status: 400, body: { error: 'Dix réponses possibles au maximum.' } } };
  }
  if (labels.some((l) => l.length > MAX_OPTION_LENGTH)) {
    return { error: { status: 400, body: { error: 'Réponse trop longue (120 caractères maximum).' } } };
  }
  // Deux options identiques rendraient les résultats illisibles (« Oui » à
  // 40% et « Oui » à 20%) sans qu'aucune erreur ne soit visible.
  const seen = {};
  for (const l of labels) {
    const key = l.toLowerCase();
    if (seen[key]) return { error: { status: 400, body: { error: 'Deux réponses possibles sont identiques.' } } };
    seen[key] = true;
  }

  const closes = parseClosesAt(params.closesAt);
  if (closes.error) return { error: { status: 400, body: { error: closes.error } } };

  const createdAt = nowIso();
  db.exec('BEGIN');
  try {
    const info = db.prepare(`
      INSERT INTO polls (scope, scopeId, authorId, question, multiChoice, anonymous, closesAt, closedAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(params.scope, String(params.scopeId), params.authorId, question,
      params.multiChoice ? 1 : 0, params.anonymous ? 1 : 0, closes.closesAt, createdAt);
    const pollId = info.lastInsertRowid;
    const insertOption = db.prepare('INSERT INTO poll_options (pollId, label, position) VALUES (?, ?, ?)');
    labels.forEach((label, i) => insertOption.run(pollId, label, i));
    db.exec('COMMIT');
    return { poll: pollForViewer(pollId, params.authorId) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Le vote est DÉFINITIF (choix d'Emilien du 3 septembre 2026 : « Non, mais
// demande de validation préalable avant enregistrement » — la confirmation se
// fait côté client, avant d'appeler cette route). Une deuxième tentative est
// donc refusée plutôt que d'écraser le vote précédent : ce refus est la seule
// chose qui rend la règle vraie, un client modifié ne doit pas pouvoir la
// contourner.
function votePoll(pollId, userId, optionIds) {
  const row = getPollRow(pollId);
  if (!row) return { error: { status: 404, body: { error: 'Sondage introuvable.' } } };
  if (isPollClosed(row)) return { error: { status: 409, body: { error: 'Ce sondage est clos.' } } };

  const already = db.prepare('SELECT 1 FROM poll_votes WHERE pollId = ? AND userId = ?').get(pollId, userId);
  if (already) return { error: { status: 409, body: { error: 'Tu as déjà voté à ce sondage.' } } };

  const ids = Array.isArray(optionIds) ? optionIds.map(Number).filter((n) => !isNaN(n)) : [];
  const unique = ids.filter((v, i) => ids.indexOf(v) === i);
  if (unique.length === 0) return { error: { status: 400, body: { error: 'Choisis une réponse.' } } };
  if (!row.multiChoice && unique.length > 1) {
    return { error: { status: 400, body: { error: 'Une seule réponse possible pour ce sondage.' } } };
  }

  // Chaque option doit appartenir à CE sondage : sans ce contrôle, un id
  // d'option d'un autre sondage passerait et créerait une ligne incohérente.
  const valid = optionsOf(pollId).map((o) => o.id);
  if (unique.some((id) => valid.indexOf(id) === -1)) {
    return { error: { status: 400, body: { error: 'Réponse inconnue pour ce sondage.' } } };
  }

  const votedAt = nowIso();
  db.exec('BEGIN');
  try {
    const insert = db.prepare('INSERT INTO poll_votes (pollId, optionId, userId, votedAt) VALUES (?, ?, ?, ?)');
    unique.forEach((optionId) => insert.run(pollId, optionId, userId, votedAt));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { poll: pollForViewer(pollId, userId) };
}

// Clôture anticipée et suppression : l'AUTEUR SEUL (choix d'Emilien du
// 3 septembre 2026). Même règle que partout ailleurs dans l'app — chacun ne
// supprime que ses propres traces, le propriétaire d'une activité n'a aucun
// droit particulier (voir DELETE /community/activity-messages).
function closePoll(pollId, userId) {
  const row = getPollRow(pollId);
  if (!row) return { error: { status: 404, body: { error: 'Sondage introuvable.' } } };
  if (row.authorId !== userId) {
    return { error: { status: 403, body: { error: "Seul l'auteur peut clore ce sondage." } } };
  }
  if (row.closedAt) return { poll: pollForViewer(pollId, userId) }; // idempotent
  db.prepare('UPDATE polls SET closedAt = ? WHERE id = ?').run(nowIso(), pollId);
  return { poll: pollForViewer(pollId, userId) };
}

function deletePoll(pollId, userId) {
  const row = getPollRow(pollId);
  if (!row) return { error: { status: 404, body: { error: 'Sondage introuvable.' } } };
  if (row.authorId !== userId) {
    return { error: { status: 403, body: { error: "Seul l'auteur peut supprimer ce sondage." } } };
  }
  // poll_options et poll_votes partent en cascade (voir server/db.js).
  db.prepare('DELETE FROM polls WHERE id = ?').run(pollId);
  return { ok: true };
}

module.exports = {
  MAX_QUESTION_LENGTH,
  MAX_OPTION_LENGTH,
  MIN_OPTIONS,
  MAX_OPTIONS,
  registerScopeGuard,
  knownScopes,
  checkScopeAccess,
  isPollClosed,
  pollsForScope,
  pollsForFollowing,
  pollForViewer,
  getPollRow,
  createPoll,
  votePoll,
  closePoll,
  deletePoll,
};
