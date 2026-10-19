// Registre des connecteurs. `demo` par défaut ; `questrade` (lecture seule, requiresToken) n'est
// utilisé que si TRADE_CONNECTOR=questrade : la synchro ignore alors les utilisateurs sans jeton.
const { createDemoConnector } = require('./demo');
const { createQuestradeConnector, createFetchHttp } = require('./questrade');

// nom -> fabrique(opts). opts.db est requis par Questrade ; opts.http (client injectable) vaut createFetchHttp() par défaut.
const REGISTRY = {
  demo: () => createDemoConnector(),
  questrade: (opts) => {
    if (!opts.db) throw new Error('connecteur questrade : base de données requise');
    return createQuestradeConnector({ db: opts.db, env: opts.env || process.env, http: opts.http || createFetchHttp(), sleep: opts.sleep, now: opts.now });
  },
};

// Les connecteurs à session (Questrade) sont gardés par base : l'access_token en mémoire évite un renouvellement à chaque synchro.
const CACHE = new WeakMap();

function getConnector(name = process.env.TRADE_CONNECTOR || 'demo', opts = {}) {
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, name)) throw new Error('connecteur inconnu ou non disponible : ' + name);
  const cacheable = name === 'questrade' && opts.db && !opts.http && !opts.sleep && !opts.now && !opts.env;
  if (!cacheable) return REGISTRY[name](opts);
  const per = CACHE.get(opts.db) || {};
  CACHE.set(opts.db, per);
  return per[name] || (per[name] = REGISTRY[name](opts));
}

module.exports = { getConnector };
