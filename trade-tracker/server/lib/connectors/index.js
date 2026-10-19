// Registre des connecteurs. Le connecteur Questrade réel n'est pas encore branché
// (en attente des jetons) : le squelette documenté est dans questrade.js (sans réseau, client HTTP injecté) ; l'ajouter ici avec la même interface fetchPortfolio(user).
const { createDemoConnector } = require('./demo');

// Registre : nom -> fabrique. Un connecteur qui lit le jeton de l'utilisateur déclare `requiresToken: true`
// (la synchro l'ignore alors tant que l'utilisateur n'a pas connecté son courtier). Questrade s'ajoutera ici
// (`questrade: (opts) => createQuestradeConnector({ db: opts.db, env: opts.env, http })`) avec les vrais jetons.
const REGISTRY = {
  demo: () => createDemoConnector(),
};

function getConnector(name = process.env.TRADE_CONNECTOR || 'demo', opts = {}) {
  if (Object.prototype.hasOwnProperty.call(REGISTRY, name)) return REGISTRY[name](opts);
  throw new Error('connecteur inconnu ou non disponible : ' + name);
}

module.exports = { getConnector };
