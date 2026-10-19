// Masquage côté serveur des modules désactivés (lots 7a/7b). Les données ne sont JAMAIS supprimées : une route d'un module
// désactivé répond 403 {error, code:'module_off', module} (jamais 500). Tout actif = aucun effet. `core` n'est jamais bloqué.
// Les routeurs sont tous montés sur /api sans préfixe propre : le filtrage se fait donc ici, par chemin, avant eux (un seul endroit).
const modules = require('./modules');

const ID = '[^/]+';
// Catégories (pôles/secteurs) = noyau, jamais masquées, même si leurs URLs vivent sous /goals/.
const CATEGORY_CRUD = new RegExp('^/api/activities/' + ID + '/goals/categories(-reorder)?(/' + ID + '(/(removal-preview|secteurs(-reorder)?(/' + ID + '(/(move|redistribution))?)?))?)?$');
const CATEGORY_TASK = /\/(tasks|auto-task|mark-seen)(\/|$)/;

// [module, regex du chemin complet] ; le premier qui correspond décide. `fn` = exception éventuelle (true = ne pas bloquer).
const RULES = [
  ['stats-tasks', /^\/api\/stats\/activity-(progress|insights)(\/|$)/],
  ['stats', /^\/api\/(stats\/timesheet|category-stats|category-timesheet|category-chart)(\/|$)/],
  ['roadmap', /^\/api\/goals(\/|$)/],
  [['roadmap', 'ai'], /^\/api\/activities\/[^/]+\/(document-tasks|change-proposals|strategy)(\/|$)/],
  [['roadmap', 'ai'], /^\/api\/activities\/[^/]+\/goals\/(rewrite|categories\/auto-task|periods\/[^/]+\/weekly-proposals|weekly\/[^/]+\/daily-plan)$/],
  ['calendar', /^\/api\/(calendar\/(feed|export-selection|external|external-settings)|activities\/[^/]+\/goals-days)(\/|$)/],
  ['ai', /^\/api\/drive(\/|$)/],
  // Jetons de connexion IA : lister et révoquer restent toujours possibles (Loi 25) ; seule la création dépend du module.
  ['ai', /^\/api\/ai-tokens(\/|$)/, (p, m) => m !== 'POST'],
  ['roadmap', /^\/api\/activities\/[^/]+\/goals(\/|$)/, (p) => CATEGORY_CRUD.test(p) && !CATEGORY_TASK.test(p)],
  ['sharing', /^\/api\/(invites(\/|$)|community\/(activity-[a-z-]+|unread-messages))/],
  ['community', /^\/api\/(community(\/(shared-feed|following-feed))?|follows|blocks|users\/search|polls)(\/|$)/],
  ['profile', /^\/api\/profile\/(posts|post-attachments|projects)(\/|$)/],
  ['profile', /^\/api\/profile\/[^/]+\/(public|projects|posts)$/],
];

function blockedModule(userId, path, method) {
  for (const [mod, re, exempt] of RULES) {
    if (!re.test(path)) continue;
    if (exempt && exempt(path, method)) return null;
    return [].concat(mod).find((m) => !modules.isEnabled(userId, m)) || null;
  }
  return null;
}

// Réponse commune (routes, MCP) : 403 clair, jamais 500.
function moduleOff(res, mod) {
  const label = (modules.MODULES[mod] || {}).label || mod;
  return res.status(403).json({ error: `Module désactivé : « ${label} ». Réactive-le dans Réglages > Modules.`, code: 'module_off', module: mod });
}

// Middleware global (après la session). Non connecté ou profil introuvable : on laisse les routes répondre elles-mêmes.
function moduleGate(req, res, next) {
  if (!req.userId || !req.path.startsWith('/api/')) return next();
  let mod = null;
  try { mod = blockedModule(req.userId, req.path, req.method); } catch (e) { return next(); }
  if (mod) return moduleOff(res, mod);
  next();
}

// Middleware par routeur/route : requireModule('ai').
function requireModule(name) {
  return (req, res, next) => (!req.userId || modules.isEnabled(req.userId, name) ? next() : moduleOff(res, name));
}

module.exports = { moduleGate, requireModule, blockedModule, moduleOff, RULES };
