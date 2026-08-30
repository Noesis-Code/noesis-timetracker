// test10.js — Suivi (follows) + flux Communauté "Partagée"/"Suivi"
//
// Comme test7/test9 : appels API directs (fetch) contre un serveur déjà
// lancé, + assertions SQLite directes pour vérifier l'état exact des lignes
// sans dépendre de ce que l'UI affiche.
//
// À FAIRE AVANT DE LANCER CE FICHIER (comme les précédents) :
//   1. Arrêter le serveur s'il tourne.
//   2. Supprimer (ou déplacer) data/noesis.db pour repartir d'une base vide
//      — plusieurs scénarios créent des profils à pseudo fixe et se
//      percutent sinon sur la contrainte d'unicité des pseudos.
//   3. Relancer le serveur : npm start
//   4. Dans un autre terminal, à la racine du projet : node test10.js
//
// Ce fichier ne touche jamais data/noesis.db lui-même en écriture directe
// (uniquement en lecture, via node:sqlite) — toutes les écritures passent
// par l'API, exactement comme le ferait l'app.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const BASE = 'http://localhost:3000';
const DB_PATH = path.join(__dirname, 'data', 'noesis.db');

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { passed++; console.log('  OK   ' + label); }
  else { failed++; console.log('  FAIL ' + label); }
}

async function api(method, urlPath, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + urlPath, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* pas de corps JSON */ }
  return { status: res.status, data };
}

function pin() { return '1234'; }

async function createProfile(name) {
  const r = await api('POST', '/api/profile', { name, pin: pin(), color: '#3498db' });
  if (r.status !== 201) throw new Error('Création profil "' + name + '" échouée : ' + JSON.stringify(r.data));
  return r.data; // { id, name, color, createdAt, theme, shareProfile }
}

async function createActivity(userId, name) {
  const r = await api('POST', '/api/activities', { userId, name, color: null, requiresNote: false });
  if (r.status !== 201) throw new Error('Création activité "' + name + '" échouée : ' + JSON.stringify(r.data));
  return r.data;
}

async function inviteAndAccept(activityId, fromUserId, toUserId, toName) {
  const inv = await api('POST', '/api/activities/' + activityId + '/invite', { userId: fromUserId, pseudo: toName });
  if (inv.status !== 201) throw new Error('Invitation échouée : ' + JSON.stringify(inv.data));
  const pending = await api('GET', '/api/invites?userId=' + toUserId);
  const found = pending.data.find((i) => i.activityId === activityId);
  if (!found) throw new Error('Invitation introuvable côté destinataire.');
  const acc = await api('POST', '/api/invites/' + found.id + '/accept', { userId: toUserId });
  if (acc.status !== 200) throw new Error('Acceptation invitation échouée : ' + JSON.stringify(acc.data));
}

async function logSession(userId, activityId, note, durationSeconds) {
  const now = new Date();
  const start = new Date(now.getTime() - durationSeconds * 1000);
  const r = await api('POST', '/api/history', {
    userId, activityId,
    startTime: start.toISOString(), endTime: now.toISOString(),
    note: note || '',
  });
  if (r.status !== 201) throw new Error('Création session échouée : ' + JSON.stringify(r.data));
  return r.data.id;
}

function rawUser(id) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  db.close();
  return row;
}

function rawFollow(id) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const row = db.prepare('SELECT * FROM follows WHERE id = ?').get(id);
  db.close();
  return row;
}

function rawFollowCount(followerId, followeeId, status) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const row = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followerId = ? AND followeeId = ? AND status = ?').get(followerId, followeeId, status);
  db.close();
  return row.n;
}

async function main() {
  console.log('=== test10.js — Suivi + flux Communauté ===\n');

  const suffix = Date.now();
  const alice = await createProfile('Alice' + suffix);
  const bob = await createProfile('Bob' + suffix);
  const carol = await createProfile('Carol' + suffix);

  // ----- 1. Recherche -----
  console.log('-- Recherche --');
  {
    const r = await api('GET', '/api/users/search?userId=' + alice.id + '&q=' + suffix);
    ok('la recherche renvoie Bob et Carol', r.data.some((u) => u.id === bob.id) && r.data.some((u) => u.id === carol.id));
    ok("la recherche exclut l'appelant lui-même (Alice)", !r.data.some((u) => u.id === alice.id));
    ok("chaque résultat a un statut 'none' par défaut", r.data.every((u) => u.followStatus === 'none'));
  }

  // ----- 2. Demande de suivi : cas limites -----
  console.log('-- Demandes de suivi : cas limites --');
  {
    const self = await api('POST', '/api/follows', { followerId: alice.id, followeeId: alice.id });
    ok('auto-suivi refusé (400)', self.status === 400);
  }

  let followAliceToBobId;
  {
    const r = await api('POST', '/api/follows', { followerId: alice.id, followeeId: bob.id });
    ok('demande Alice → Bob créée (201)', r.status === 201);
    followAliceToBobId = r.data.id;
    ok('la ligne follows est bien "pending" en base', rawFollow(followAliceToBobId).status === 'pending');

    const dup = await api('POST', '/api/follows', { followerId: alice.id, followeeId: bob.id });
    ok('doublon de demande en attente refusé (409)', dup.status === 409);
  }

  // ----- 3. Un tiers ne peut ni accepter ni refuser -----
  console.log('-- Contrôle d\'accès sur accept/decline --');
  {
    const wrongAccept = await api('POST', '/api/follows/' + followAliceToBobId + '/accept', { userId: carol.id });
    ok("Carol ne peut pas accepter une demande qui ne lui est pas destinée (403)", wrongAccept.status === 403);
    const wrongDecline = await api('POST', '/api/follows/' + followAliceToBobId + '/decline', { userId: carol.id });
    ok("Carol ne peut pas refuser une demande qui ne lui est pas destinée (403)", wrongDecline.status === 403);
  }

  // ----- 4. Annulation d'une demande en attente par son auteur -----
  console.log('-- Annulation d\'une demande envoyée --');
  {
    const r = await api('POST', '/api/follows', { followerId: carol.id, followeeId: bob.id });
    ok('demande Carol → Bob créée (201)', r.status === 201);
    const followId = r.data.id;

    const wrongCancel = await api('DELETE', '/api/follows/' + followId + '?userId=' + bob.id);
    ok("Bob (le followee) ne peut pas annuler la demande de Carol (403)", wrongCancel.status === 403);

    const cancel = await api('DELETE', '/api/follows/' + followId + '?userId=' + carol.id);
    ok("Carol peut annuler sa propre demande (200)", cancel.status === 200);
    ok('la ligne a bien disparu de la base', rawFollow(followId) === undefined);
  }

  // ----- 5. Refus d'une demande, puis nouvelle demande possible -----
  console.log('-- Refus puis nouvel envoi --');
  let followCarolToAliceId;
  {
    const r1 = await api('POST', '/api/follows', { followerId: carol.id, followeeId: alice.id });
    followCarolToAliceId = r1.data.id;
    const decline = await api('POST', '/api/follows/' + followCarolToAliceId + '/decline', { userId: alice.id });
    ok('Alice refuse la demande de Carol (200)', decline.status === 200);
    ok('la ligne est bien "declined" en base', rawFollow(followCarolToAliceId).status === 'declined');

    const r2 = await api('POST', '/api/follows', { followerId: carol.id, followeeId: alice.id });
    ok('une nouvelle demande peut être envoyée après un refus (201)', r2.status === 201);
    followCarolToAliceId = r2.data.id;
  }

  // ----- 6. Acceptation : Alice suit Bob -----
  console.log('-- Acceptation --');
  {
    const accept = await api('POST', '/api/follows/' + followAliceToBobId + '/accept', { userId: bob.id });
    ok('Bob accepte la demande de suivi d\'Alice (200)', accept.status === 200);
    ok('la ligne est bien "accepted" en base', rawFollow(followAliceToBobId).status === 'accepted');

    const already = await api('POST', '/api/follows', { followerId: alice.id, followeeId: bob.id });
    ok('renvoyer une demande alors que déjà abonné est refusé (409)', already.status === 409);

    const following = await api('GET', '/api/follows/following?userId=' + alice.id);
    ok('Bob apparaît dans "Mes abonnements" d\'Alice', following.data.some((f) => f.userId === bob.id));
  }

  // ----- 7. Flux "Suivi" : vide tant que shareProfile=0, peuplé une fois activé -----
  console.log('-- Flux Suivi (shareProfile) --');
  {
    const bobActivity = await createActivity(bob.id, 'Sport-' + suffix);
    await logSession(bob.id, bobActivity.id, 'séance de sport', 1800);

    const feedBefore = await api('GET', '/api/community/following-feed?userId=' + alice.id);
    ok("le flux Suivi d'Alice est vide tant que Bob n'a pas activé shareProfile", !feedBefore.data.some((e) => e.userId === bob.id));

    const enable = await api('PUT', '/api/profile/' + bob.id, { shareProfile: true });
    ok('Bob active "Partager mon profil" (200)', enable.status === 200 && enable.data.shareProfile === true);
    ok('shareProfile=1 est bien enregistré en base', rawUser(bob.id).shareProfile === 1);

    const feedAfter = await api('GET', '/api/community/following-feed?userId=' + alice.id);
    const entry = feedAfter.data.find((e) => e.userId === bob.id && e.activityId === bobActivity.id);
    ok("le flux Suivi d'Alice montre maintenant la session de Bob", !!entry);
    ok('la note de cette session est bien incluse', !!entry && entry.note === 'séance de sport');

    const feedCarol = await api('GET', '/api/community/following-feed?userId=' + carol.id);
    ok('Carol (qui ne suit pas Bob) ne voit rien de Bob dans son flux Suivi', !feedCarol.data.some((e) => e.userId === bob.id));
  }

  // ----- 8. Suivre =/= partager : isolation croisée -----
  console.log('-- Indépendance Suivi / Partage --');
  {
    // Carol suit Alice (acceptée) mais ne partage aucune activité avec elle.
    const acceptCarol = await api('POST', '/api/follows/' + followCarolToAliceId + '/accept', { userId: alice.id });
    ok('Alice accepte la demande de Carol (200)', acceptCarol.status === 200);

    const aliceActivity = await createActivity(alice.id, 'Lecture-' + suffix);
    await logSession(alice.id, aliceActivity.id, '', 600);
    await api('PUT', '/api/profile/' + alice.id, { shareProfile: false }); // par défaut, resté désactivé

    const sharedFeedCarol = await api('GET', '/api/community/shared-feed?userId=' + carol.id);
    ok("le fait de SUIVRE Alice ne fait pas apparaître son activité dans le flux PARTAGÉE de Carol (aucune activité en commun)",
      !sharedFeedCarol.data.some((e) => e.userId === alice.id));

    const followingFeedCarol = await api('GET', '/api/community/following-feed?userId=' + carol.id);
    ok("Alice n'ayant pas activé shareProfile, Carol ne la voit pas non plus dans son flux Suivi malgré le suivi accepté",
      !followingFeedCarol.data.some((e) => e.userId === alice.id));
  }

  // ----- 9. Flux "Partagée" : limité aux co-membres actuels, indépendant du suivi -----
  console.log('-- Flux Partagée --');
  {
    const sharedActivity = await createActivity(alice.id, 'Projet-' + suffix);
    await inviteAndAccept(sharedActivity.id, alice.id, carol.id, carol.name);
    await logSession(carol.id, sharedActivity.id, 'avancement du projet', 900);

    const sharedFeedAlice = await api('GET', '/api/community/shared-feed?userId=' + alice.id);
    const entry = sharedFeedAlice.data.find((e) => e.userId === carol.id && e.activityId === sharedActivity.id);
    ok("Alice voit la session de Carol sur l'activité partagée dans son flux Partagée", !!entry);

    const sharedFeedBob = await api('GET', '/api/community/shared-feed?userId=' + bob.id);
    ok("Bob (non-membre de cette activité) ne voit rien de cette session", !sharedFeedBob.data.some((e) => e.activityId === sharedActivity.id));

    // Partager une activité avec Carol ne l'a pas ajoutée à "Mes abonnements" d'Alice.
    const followingAlice = await api('GET', '/api/follows/following?userId=' + alice.id);
    ok("partager une activité avec Carol ne fait pas suivre Carol automatiquement", !followingAlice.data.some((f) => f.userId === carol.id));
  }

  // ----- 10. Désabonnement -----
  console.log('-- Désabonnement --');
  {
    const wrongUnfollow = await api('DELETE', '/api/follows/' + followAliceToBobId + '?userId=' + bob.id);
    ok('Bob (le suivi) ne peut pas retirer la relation à la place d\'Alice (403)', wrongUnfollow.status === 403);

    const unfollow = await api('DELETE', '/api/follows/' + followAliceToBobId + '?userId=' + alice.id);
    ok("Alice se désabonne de Bob (200)", unfollow.status === 200);
    ok('la ligne follows a bien disparu', rawFollow(followAliceToBobId) === undefined);

    const feedAfterUnfollow = await api('GET', '/api/community/following-feed?userId=' + alice.id);
    ok("le flux Suivi d'Alice ne montre plus les sessions de Bob après désabonnement", !feedAfterUnfollow.data.some((e) => e.userId === bob.id));
  }

  console.log('\n=== Résultat : ' + passed + ' passés, ' + failed + ' échoués ===');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erreur inattendue pendant les tests :', err);
  process.exit(1);
});
