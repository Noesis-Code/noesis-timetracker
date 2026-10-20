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
    function post() {
      return fetch('/api/broker/token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) })
        .then(function (r) {
          if (r.ok) { token = null; msg = { cls: 'ok', text: 'Courtier connecté. La première synchro démarre.' }; TTD.reset(); TTApp.refresh(); return; }
          return r.json().catch(function () { return {}; }).then(function (j) {
            // Ré-authentification TOTP (5 min) avant de remplacer le jeton : le jeton reste en mémoire le temps du code, jamais stocké.
            if (r.status === 403 && j.error === 'stepup_required') return TTSec.stepUp().then(post, function () { token = null; fail('Ré-authentification annulée : le jeton n’a pas été envoyé.'); });
            token = null;
            if (r.status === 403 && j.error === 'mfa_enroll_required') { fail('Active d’abord la vérification en deux étapes (page Sécurité).'); setTimeout(function () { location.hash = '#/security'; }, 1200); return; }
            if (r.status === 503) return fail(j.message || 'Connexion du courtier indisponible sur ce serveur.');
            var text = r.status === 404 ? 'Connexion du courtier pas encore disponible sur ce serveur.' : r.status === 400 || r.status === 422 ? 'Jeton refusé (16 à 512 caractères, sans espace). Vérifie-le et réessaie.' : r.status === 401 ? 'Session expirée.' : r.status === 429 ? 'Trop d’essais. Réessaie dans une minute.' : 'Échec de l’envoi (' + r.status + ').';
            fail(text);
          });
        }, function () { token = null; fail('Hors ligne : le jeton n’a pas été envoyé.'); });
    }
    post();
    function fail(text) { msg = { cls: 'error', text: text }; input.disabled = false; btn.disabled = false; out.className = 'formMsg error'; out.textContent = text; input.focus(); }
  }
  // GET /api/broker/status : dernière synchro réussie et, s'il y en a un, message d'erreur de la dernière tentative.
  function loadStatus(el) {
    var box = el.querySelector('#brokerSyncInfo'); if (!box) return;
    fetch('/api/broker/status', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).then(function (st) {
      if (!box.isConnected) return;
      box.innerHTML = '<span>Dernière synchro :</span> <span>' + (st.lastSyncAt ? TTF.esc(TTF.ago(st.lastSyncAt)) : 'Jamais') + '</span>' +
        (st.lastSyncAt ? '<div class="hint">' + TTF.esc(TTF.dateTime(st.lastSyncAt)) + '</div>' : '') +
        (st.error ? '<div class="formMsg error" role="alert"><span>Dernière synchro en échec :</span> <span>' + TTF.esc(st.error) + '</span></div>' : '');
    }).catch(function () { if (box.isConnected) box.innerHTML = '<span class="formMsg error">État de la synchro indisponible.</span>'; });
  }
  function confirmDisconnect() {
    var m = TTUI.modal('Déconnecter le courtier ?',
      '<p class="hint" style="margin:0 0 14px">Le jeton sera effacé du serveur, la synchronisation s’arrêtera et les données synchronisées de ton compte (positions, historique, journal) seront supprimées définitivement.</p>' +
      '<div class="btnRow"><button type="button" class="btnGhost" id="discNo">Annuler</button><button type="button" class="btnDanger" id="discYes">Déconnecter</button></div>');
    m.root.querySelector('#discNo').addEventListener('click', m.close);
    m.root.querySelector('#discYes').addEventListener('click', function () {
      var b = this; b.disabled = true;
      function del() {
        return fetch('/api/broker/token', { method: 'DELETE', credentials: 'same-origin' }).then(function (r) {
          if (r.status === 403) return r.json().catch(function () { return {}; }).then(function (j) {
            if (j.error === 'stepup_required') { m.close(); return TTSec.stepUp().then(del, function () { msg = { cls: 'error', text: 'Ré-authentification annulée : rien n’a changé.' }; TTApp.refresh(); }); }
            m.close(); msg = { cls: 'error', text: 'Échec de la déconnexion (403).' }; TTD.reset(); TTApp.refresh();
          });
          m.close();
          msg = r.ok ? { cls: 'ok', text: 'Courtier déconnecté.' } : { cls: 'error', text: r.status === 404 ? 'Déconnexion pas encore disponible sur ce serveur.' : 'Échec de la déconnexion (' + r.status + ').' };
          TTD.reset(); TTApp.refresh();
        }, function () { m.close(); msg = { cls: 'error', text: 'Hors ligne : rien n’a changé.' }; TTApp.refresh(); });
      }
      del();
    });
  }
  window.TTScreens.broker = {
    render: function (el, state, raw) {
      var connected = !!(raw.me && raw.me.brokerConnected), demo = raw.source === 'demo';
      el.innerHTML =
        '<div class="pageHead"><div class="screenTitle">Connecter mon courtier</div><button type="button" class="cmpClose" id="closePage" aria-label="Fermer">✕</button></div>' +
        '<div class="card"><div class="cardHead" style="margin:0"><div><div class="cardLabel">État</div><div class="syncBannerVal">' + (connected ? 'Connecté' : 'Non connecté') + '</div></div>' +
        '<span class="statusBadge ' + (connected ? 'ok' : '') + '"><span class="syncDot"></span>' + (connected ? 'Actif' : 'Inactif') + '</span></div>' +
        (connected && !demo ? '<div class="cardMeta" id="brokerSyncInfo" aria-live="polite">Lecture de l’état…</div>' : '') + '</div>' +
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
      if (connected && !demo) loadStatus(el);
      var d = el.querySelector('#brokerDisc'); if (d) d.addEventListener('click', confirmDisconnect);
    }
  };
})();
