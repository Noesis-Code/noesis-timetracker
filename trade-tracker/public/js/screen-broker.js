/* Connecter mon courtier. Le jeton n'est envoyé qu'à POST /api/broker/token, jamais stocké côté client
   (ni localStorage, ni cache du service worker, ni variable conservée : le champ est vidé dès l'envoi). */
(function () {
  window.TTScreens = window.TTScreens || {};
  var SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var STEPS = [
    'Dans ton compte chez le courtier, ouvre les réglages d’accès à l’API.',
    'Crée un jeton en lecture seule (aucune opération d’achat ou de vente).',
    'Colle-le ci-dessous. Il est envoyé chiffré au serveur et jamais gardé dans ce navigateur.'
  ];
  var msg = { cls: '', text: '' };

  function send(el, raw) {
    var input = el.querySelector('#brokerToken'), btn = el.querySelector('#brokerSend'), out = el.querySelector('#brokerMsg');
    var token = input.value.trim();
    if (!token) { out.className = 'formMsg error'; out.textContent = 'Colle d’abord ton jeton.'; input.focus(); return; }
    input.value = ''; btn.disabled = true; input.disabled = true; out.className = 'formMsg'; out.textContent = 'Envoi…';
    fetch('/api/broker/token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) })
      .then(function (r) {
        token = null;
        if (r.ok) { msg = { cls: 'ok', text: 'Courtier connecté. La première synchro démarre.' }; TTD.reset(); TTApp.refresh(); return; }
        var text = r.status === 404 ? 'Connexion du courtier pas encore disponible sur ce serveur.' : r.status === 400 || r.status === 422 ? 'Jeton refusé. Vérifie-le et réessaie.' : r.status === 401 ? 'Session expirée.' : 'Échec de l’envoi (' + r.status + ').';
        fail(text);
      }, function () { token = null; fail('Hors ligne : le jeton n’a pas été envoyé.'); });
    function fail(text) { msg = { cls: 'error', text: text }; input.disabled = false; btn.disabled = false; out.className = 'formMsg error'; out.textContent = text; input.focus(); }
  }
  function confirmDisconnect() {
    var m = TTUI.modal('Déconnecter le courtier ?',
      '<p class="hint" style="margin:0 0 14px">Le jeton sera effacé du serveur et la synchronisation s’arrêtera. Tes données déjà lues restent affichées.</p>' +
      '<div class="btnRow"><button type="button" class="btnGhost" id="discNo">Annuler</button><button type="button" class="btnDanger" id="discYes">Déconnecter</button></div>');
    m.root.querySelector('#discNo').addEventListener('click', m.close);
    m.root.querySelector('#discYes').addEventListener('click', function () {
      var b = this; b.disabled = true;
      fetch('/api/broker/token', { method: 'DELETE', credentials: 'same-origin' }).then(function (r) {
        m.close();
        msg = r.ok ? { cls: 'ok', text: 'Courtier déconnecté.' } : { cls: 'error', text: r.status === 404 ? 'Déconnexion pas encore disponible sur ce serveur.' : 'Échec de la déconnexion (' + r.status + ').' };
        TTD.reset(); TTApp.refresh();
      }, function () { m.close(); msg = { cls: 'error', text: 'Hors ligne : rien n’a changé.' }; TTApp.refresh(); });
    });
  }
  window.TTScreens.broker = {
    render: function (el, state, raw) {
      var connected = !!(raw.me && raw.me.brokerConnected), demo = raw.source === 'demo';
      el.innerHTML =
        '<div class="pageHead"><div class="screenTitle">Connecter mon courtier</div><button type="button" class="topIconBtn" id="closePage" aria-label="Fermer">✕</button></div>' +
        '<div class="card"><div class="cardHead" style="margin:0"><div><div class="cardLabel">État</div><div class="syncBannerVal">' + (connected ? 'Connecté' : 'Non connecté') + '</div></div>' +
        '<span class="statusBadge ' + (connected ? 'ok' : '') + '"><span class="syncDot"></span>' + (connected ? 'Actif' : 'Inactif') + '</span></div></div>' +
        '<div class="card"><div class="cardLabel">En 3 étapes</div><ol class="stepList">' + STEPS.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>' +
        '<div class="card"><label class="cardLabel" for="brokerToken">' + (connected ? 'Remplacer le jeton' : 'Jeton d’accès') + '</label>' +
        '<div class="sendField"><input id="brokerToken" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Colle ton jeton ici"' + (demo ? ' disabled' : '') + ' aria-describedby="brokerMsg">' +
        '<button type="button" class="sendBtn" id="brokerSend" aria-label="Envoyer le jeton"' + (demo ? ' disabled' : '') + '>' + SEND + '</button></div>' +
        '<div id="brokerMsg" class="formMsg ' + msg.cls + '" role="status">' + TTF.esc(demo ? 'Mode démonstration : aucune connexion possible.' : msg.text) + '</div></div>' +
        (connected ? '<button type="button" class="btnDangerOutline" id="brokerDisc">Déconnecter le courtier</button>' : '');
      msg = { cls: '', text: '' };
      el.querySelector('#closePage').addEventListener('click', function () { location.hash = '#/sync'; });
      el.querySelector('#brokerSend').addEventListener('click', function () { send(el, raw); });
      el.querySelector('#brokerToken').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(el, raw); });
      var d = el.querySelector('#brokerDisc'); if (d) d.addEventListener('click', confirmDisconnect);
    }
  };
})();
