// Modules activables par utilisateur (socle, 19 oct. 2026). Désactiver un module ne supprime AUCUNE donnée.
// Ce lot ne masque encore rien : il ne fait que stocker et valider le choix (users.modules, JSON ; NULL = défaut).
const db = require('../db');

// Un seul endroit à changer pour décider quels modules un NOUVEAU compte reçoit (décision d'Émilien en attente : tout actif pour l'instant).
// Ensembles A et B actifs ; Communauté et Profil (optionnels) inactifs.
const NEW_ACCOUNT_DEFAULT_MODULES = ['stats', 'stats-tasks', 'roadmap', 'sharing', 'calendar', 'ai', 'notifications'];

// Ensembles (décision d'Émilien) : au moins UN des deux doit rester actif (Chrono, dans core, fait partie de A côté produit).
// A « Chrono » : statistiques du chrono / feuille de temps. B « Feuille de route » : statistiques des tâches + Feuille de route.
// `anchor` = module dont l'état dit si l'ensemble est actif.
const BUNDLES = {
  time: { label: 'Chrono', anchor: 'stats', modules: ['stats'], all: ['stats'] },
  tasks: { label: 'Feuille de route', anchor: 'roadmap', modules: ['roadmap', 'stats-tasks'], all: ['roadmap', 'stats-tasks', 'calendar', 'ai'] },
};
// Optionnels, indépendants des ensembles.
const OPTIONAL = ['community', 'profile'];
// Communauté et Profil vont ensemble (un seul module côté usage) : les deux clés sont toujours égales.
const LINKED = ['community', 'profile'];
function linkPair(m, preferred) {
  const v = preferred === undefined ? !!(m.community && m.profile) : !!preferred;
  LINKED.forEach((k) => { m[k] = v; });
  return m;
}

// id -> { label, requires }. core toujours actif ; offer1 listé mais jamais activable ici (droit géré par l'offre/paiement).
const MODULES = {
  core: { label: 'Noyau', requires: [] },
  stats: { label: 'Statistiques', requires: [] },
  'stats-tasks': { label: 'Statistiques des tâches', requires: ['roadmap'] },
  sharing: { label: 'Activités partagées', requires: [] },
  community: { label: 'Communauté', requires: [] },
  profile: { label: 'Profil', requires: [] },
  roadmap: { label: 'Feuille de route', requires: [] },
  calendar: { label: 'Calendrier', requires: ['roadmap'] },
  ai: { label: 'Assistant IA', requires: ['roadmap'] },
  notifications: { label: 'Notifications', requires: [] },
  offer1: { label: 'Offre payante', requires: ['roadmap', 'ai'] },
};
const ALWAYS_ON = ['core'];
const NOT_TOGGLEABLE = ['core', 'offer1'];

function defaults() {
  const out = {};
  for (const id of Object.keys(MODULES)) out[id] = ALWAYS_ON.includes(id) || NEW_ACCOUNT_DEFAULT_MODULES.includes(id);
  out.offer1 = false;
  return linkPair(out);
}

// Comptes existants (colonne NULL) : tout actif, comme avant ce socle.
function legacyDefaults() {
  const out = {};
  for (const id of Object.keys(MODULES)) out[id] = id !== 'offer1';
  return out;
}

function normalize(raw) {
  const base = legacyDefaults();
  if (raw && typeof raw === 'object') {
    for (const id of Object.keys(raw)) {
      if (MODULES[id] && !NOT_TOGGLEABLE.includes(id)) base[id] = !!raw[id];
    }
  }
  return linkPair(base);
}

function getModules(userId) {
  const row = db.prepare('SELECT modules FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  let raw = null;
  if (row.modules) { try { raw = JSON.parse(row.modules); } catch (e) { raw = null; } }
  return normalize(raw);
}

function isEnabled(userId, name) {
  if (!MODULES[name]) return false;
  if (ALWAYS_ON.includes(name)) return true;
  const m = getModules(userId);
  return !!(m && m[name]);
}

// Valide un état complet ; renvoie { ok, error? }.
function validate(next) {
  for (const id of Object.keys(MODULES)) {
    if (!next[id]) continue;
    for (const dep of MODULES[id].requires) {
      if (!next[dep]) {
        return { ok: false, error: `Impossible : « ${MODULES[id].label} » a besoin de « ${MODULES[dep].label} ». Désactive d'abord « ${MODULES[id].label} ».` };
      }
    }
  }
  if (!Object.keys(BUNDLES).some((b) => next[BUNDLES[b].anchor])) {
    return { ok: false, error: 'Garde au moins un ensemble : « Chrono » ou « Feuille de route ».' };
  }
  return { ok: true };
}

// patch = { id: bool, ... } ; refuse un id inconnu, core/offer1, ou une dépendance rompue.
function setModules(userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, status: 400, error: 'Modules invalides.' };
  const current = getModules(userId);
  if (!current) return { ok: false, status: 404, error: 'Profil introuvable.' };
  const next = Object.assign({}, current);
  for (const id of Object.keys(patch)) {
    if (!MODULES[id]) return { ok: false, status: 400, error: `Module inconnu : ${id}.` };
    if (typeof patch[id] !== 'boolean') return { ok: false, status: 400, error: 'Modules invalides.' };
    if (NOT_TOGGLEABLE.includes(id)) {
      if (patch[id] !== current[id] && !(id === 'core' && patch[id] === true)) {
        return { ok: false, status: 400, error: id === 'core' ? 'Le noyau ne peut pas être désactivé.' : "L'offre payante ne s'active pas ici." };
      }
      continue;
    }
    next[id] = patch[id];
  }
  // Dépendances automatiques : activer un module active ce dont il a besoin ; un module resté actif sans son prérequis
  // (état hérité ou partiel) est coupé, au lieu de refuser l'enregistrement.
  const need = (id) => { for (const d of MODULES[id].requires) { if (!next[d]) { next[d] = true; need(d); } } };
  Object.keys(patch).forEach((id) => { if (patch[id] === true && MODULES[id] && !NOT_TOGGLEABLE.includes(id)) need(id); });
  for (let changed = true; changed;) {
    changed = false;
    for (const id of Object.keys(MODULES)) {
      if (next[id] && !NOT_TOGGLEABLE.includes(id) && MODULES[id].requires.some((d) => !next[d])) { next[id] = false; changed = true; }
    }
  }
  // Règle croisée : si ce patch coupe un ensemble et que l'autre était déjà coupé, l'autre est réactivé (jamais une erreur).
  const bs = Object.keys(BUNDLES);
  if (!bs.some((b) => next[BUNDLES[b].anchor])) {
    const touched = bs.filter((b) => BUNDLES[b].all.some((id) => id in patch));
    if (touched.length === 1) bs.filter((b) => b !== touched[0]).forEach((b) => BUNDLES[b].all.forEach((id) => { next[id] = true; }));
  }
  const linked = LINKED.find((k) => k in patch);
  if (linked) linkPair(next, patch[linked]);
  const v = validate(next);
  if (!v.ok) return { ok: false, status: 409, error: v.error };
  db.prepare('UPDATE users SET modules = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return { ok: true, modules: next };
}

function list() {
  return Object.keys(MODULES).map((id) => ({ id, bundle: Object.keys(BUNDLES).find((b) => BUNDLES[b].modules.includes(id)) || (OPTIONAL.includes(id) ? 'optional' : null), label: MODULES[id].label, requires: MODULES[id].requires, toggleable: !NOT_TOGGLEABLE.includes(id) }));
}

module.exports = { BUNDLES, OPTIONAL, MODULES, NEW_ACCOUNT_DEFAULT_MODULES, defaults, getModules, isEnabled, setModules, validate, list };
