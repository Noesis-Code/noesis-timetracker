/* Données FICTIVES (aucune donnée réelle). Même forme que le contrat d'API (trade-tracker/API.md, piste A). */
window.TT_DEMO = {
  sync: {
    broker: 'Courtier démo', status: 'ok',
    lastSync: new Date(Date.now() - 12 * 60000).toISOString(), log: []
  }
};
