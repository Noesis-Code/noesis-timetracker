// Module « Horaire » : données de la semaine ÉPHÉMÈRES (confidentialité, demande d'Émilien du 30 oct. 2026 : « aucun horaire ne se
// stocke dans l'app ; il ne s'enregistre jamais »). Horaire généré (quarts), disponibilités et congés collés ou importés, couverts
// OpenTable et rotation vivent UNIQUEMENT dans la mémoire du serveur, par compte : jamais dans SQLite, jamais dans l'export, jamais
// dans les journaux. Effacement : au retour dans le volet (POST /api/horaire/ephemeral/clear, premier chargement de la page), à la
// déconnexion (server/routes/session.js), après 2 h sans activité Horaire, et à tout redémarrage du serveur.
const IDLE_MS = 2 * 3600 * 1000;
const store = new Map(); // userId -> { at, avail, timeoff, covers, schedules: Map(weekStart -> schedule), assignments, rotation }
let seq = 0; // identifiants des quarts et des horaires, uniques pour tout le processus (jamais réutilisés après un effacement)
const nextId = () => { seq += 1; return seq; };

function fresh() { return { at: Date.now(), avail: [], timeoff: [], covers: [], schedules: new Map(), assignments: [], rotation: {} }; }
// Données du compte (créées vides au besoin) ; chaque accès compte comme une activité Horaire.
function get(u) {
  purgeIdle();
  let s = store.get(u);
  if (!s) { s = fresh(); store.set(u, s); }
  s.at = Date.now();
  return s;
}
function clear(u) { sessions.delete(u); return u ? store.delete(u) : false; }
// Session expirée (comptes entreprise, 1 heure sans appel : server/lib/session.js) : la mémoire part avec elle. Dernier appel vu par
// le middleware de session (sessionSeen) ; une session expirée détectée au retour du témoin appelle clear directement.
const SESSION_IDLE_MS = 60 * 60 * 1000;
const sessions = new Map(); // userId -> dernier appel d'une session entreprise
function sessionSeen(u) { if (u) sessions.set(u, Date.now()); }
// Comptes sans activité Horaire depuis plus de 2 h, ou dont la session entreprise a expiré : effacés.
function purgeIdle(now) {
  const t = now || Date.now();
  for (const [u, s] of store) if (t - s.at > IDLE_MS) store.delete(u);
  for (const [u, at] of sessions) if (t - at > SESSION_IDLE_MS) { store.delete(u); sessions.delete(u); }
}
setInterval(purgeIdle, 60 * 1000).unref();

module.exports = { get, clear, purgeIdle, nextId, sessionSeen, IDLE_MS, SESSION_IDLE_MS, has: (u) => store.has(u), _store: store, _sessions: sessions };
