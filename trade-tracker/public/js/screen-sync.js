(function () {
  window.TTScreens = window.TTScreens || {};
  var LABEL = { OK: 'À jour', PARTIEL: 'Partielle', ECHEC: 'Échec' };
  var CLS = { OK: 'ok', PARTIEL: 'warn', ECHEC: 'error' };
  function badge(s) { return '<span class="statusBadge ' + CLS[s] + '"><span class="syncDot"></span>' + LABEL[s] + '</span>'; }
  var KIND = { synchro: 'Synchronisation', prix: 'Prix', taux: 'Taux USD/CAD', transactions: 'Transactions' };
  window.TTScreens.sync = {
    render: function (el, state, raw) {
      var last = raw.portfolio.lastSync, conns = raw.connections || [];
      el.innerHTML =
        '<div class="screenTitle">Synchronisation</div>' +
        '<div class="card"><div class="cardHead"><div><div class="cardLabel">Dernière mise à jour</div><div class="cardValue">' + (last ? TTF.ago(last.at) : 'Jamais') + '</div></div>' + (last ? badge(last.status) : '') + '</div>' +
        (last ? '<div class="cardMeta">' + TTF.dateTime(last.at) + '</div>' : '') + '<div class="cardMeta">Prix et taux USD/CAD : ' + TTF.num(raw.portfolio.usdCad) + (raw.portfolio.fxMissing ? ' (taux manquant)' : '') + '</div></div>' +
        '<div class="sectionTitle">Connexion du courtier</div>' +
        '<div class="card"><div class="cardLabel">' + TTF.esc(raw.broker || 'Courtier') + '</div>' +
        (conns.length ? conns.map(function (c) {
          return '<div class="detailRow"><span>' + TTF.esc(c.label) + '<span class="hint"> · ' + TTF.ago(c.lastSync) + '</span></span>' + badge(c.status) + '</div>';
        }).join('') : '<div class="emptyState">Aucun compte connecté.</div>') +
        '<a class="btnGhost linkBtn" href="#/broker">' + (raw.me && raw.me.brokerConnected ? 'Gérer ma connexion' : 'Connecter mon courtier') + '</a></div>' +
        '<div class="sectionTitle">Journal</div>' +
        '<div class="card">' + (raw.syncLog.length ? raw.syncLog.map(function (e) {
          return '<div class="logRow"><div class="logTop">' + badge(e.status) + '<span class="hint">' + TTF.dateTime(e.at) + '</span></div><div class="logMsg">' + TTF.esc(KIND[e.kind] || e.kind) + ' · ' + TTF.esc(e.message) + '</div></div>';
        }).join('') : '<div class="emptyState">Journal vide.</div>') + '</div>';
    }
  };
})();
