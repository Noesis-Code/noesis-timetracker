// Registre des connecteurs. Le connecteur Questrade réel n'est pas encore branché
// (en attente des jetons) : le squelette documenté est dans questrade.js (sans réseau, client HTTP injecté) ; l'ajouter ici avec la même interface fetchPortfolio(user).
const { createDemoConnector } = require('./demo');

function getConnector(name = process.env.TRADE_CONNECTOR || 'demo') {
  if (name === 'demo') return createDemoConnector();
  throw new Error('connecteur inconnu ou non disponible : ' + name);
}

module.exports = { getConnector };
