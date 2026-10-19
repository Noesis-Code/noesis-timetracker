// Connecteur de démonstration : données fictives, aucun réseau.
// Interface commune des connecteurs : async fetchPortfolio(user) -> {
//   usdCad?: number,
//   accounts: [{ externalId, type: 'CELI'|'REER'|'CELIAPP', label,
//     balances: [{ currency, cash }],
//     positions: [{ symbol, name, sector, currency, quantity, avgCost, lastPrice }],
//     transactions: [{ externalId, date, type, symbol?, quantity?, price?, amount, currency }] }] }
// `user` = ligne tt_users ({ id, tmtUserId, role, ... }). Le connecteur Questrade réel
// implémentera la même fonction (jeton par utilisateur via brokertoken.getBrokerToken).

const EXPERT = {
  usdCad: 1.37,
  accounts: [
    { externalId: 'DEMO-E-CELI', type: 'CELI', label: 'CELI (démo)', balances: [{ currency: 'CAD', cash: 1200 }],
      positions: [
        { symbol: 'AAA.TO', name: 'Aurifère Démo', sector: 'Or', currency: 'CAD', quantity: 400, avgCost: 12.5, lastPrice: 15.2 },
        { symbol: 'CUU.TO', name: 'Cuivre Démo', sector: 'Cuivre', currency: 'CAD', quantity: 250, avgCost: 8.1, lastPrice: 7.4 },
      ],
      transactions: [
        { externalId: 'E1', date: '2026-03-02', type: 'APPORT', amount: 6000, currency: 'CAD' },
        { externalId: 'E2', date: '2026-03-03', type: 'ACHAT', symbol: 'AAA.TO', quantity: 400, price: 12.5, amount: 5000, currency: 'CAD' },
        { externalId: 'E3', date: '2026-04-10', type: 'ACHAT', symbol: 'CUU.TO', quantity: 250, price: 8.1, amount: 2025, currency: 'CAD' },
      ] },
    { externalId: 'DEMO-E-REER', type: 'REER', label: 'REER (démo)', balances: [{ currency: 'CAD', cash: 300 }, { currency: 'USD', cash: 150 }],
      positions: [
        { symbol: 'LIT', name: 'Lithium Démo', sector: 'Lithium', currency: 'USD', quantity: 120, avgCost: 30, lastPrice: 34.5 },
        { symbol: 'AAA.TO', name: 'Aurifère Démo', sector: 'Or', currency: 'CAD', quantity: 100, avgCost: 13, lastPrice: 15.2 },
      ],
      transactions: [
        { externalId: 'E4', date: '2026-03-05', type: 'APPORT', amount: 5000, currency: 'CAD' },
        { externalId: 'E5', date: '2026-05-01', type: 'DIVIDENDE', symbol: 'AAA.TO', amount: 40, currency: 'CAD' },
      ] },
  ],
};

const CLIENT = {
  usdCad: 1.37,
  accounts: [
    { externalId: 'DEMO-C-CELI', type: 'CELI', label: 'CELI (démo client)', balances: [{ currency: 'CAD', cash: 900 }],
      positions: [
        { symbol: 'AAA.TO', name: 'Aurifère Démo', sector: 'Or', currency: 'CAD', quantity: 200, avgCost: 13.1, lastPrice: 15.2 },
        { symbol: 'BNK.TO', name: 'Banque Démo', sector: 'Financier', currency: 'CAD', quantity: 60, avgCost: 90, lastPrice: 94 },
      ],
      transactions: [
        { externalId: 'C1', date: '2026-03-10', type: 'APPORT', amount: 8000, currency: 'CAD' },
        { externalId: 'C2', date: '2026-03-11', type: 'ACHAT', symbol: 'AAA.TO', quantity: 200, price: 13.1, amount: 2620, currency: 'CAD' },
      ] },
  ],
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// `fixtures` : { <tmtUserId>: données } ; par défaut l'expert reçoit EXPERT, les autres CLIENT.
function createDemoConnector({ fixtures = {}, expertTmtIds = [] } = {}) {
  return {
    name: 'demo',
    async fetchPortfolio(user) {
      if (fixtures[user.tmtUserId]) return clone(fixtures[user.tmtUserId]);
      return clone(user.role === 'expert' || expertTmtIds.includes(user.tmtUserId) ? EXPERT : CLIENT);
    },
  };
}

module.exports = { createDemoConnector, EXPERT_FIXTURE: EXPERT, CLIENT_FIXTURE: CLIENT };
