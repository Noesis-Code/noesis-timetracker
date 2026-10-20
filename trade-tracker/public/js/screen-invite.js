/* Inviter (expert seulement) : POST /api/invitations { email, role }, GET /api/invitations.
   Le code d'invitation n'est montré qu'une fois ; il n'est gardé qu'en mémoire le temps de l'écran. */
(function () {
  window.TTScreens = window.TTScreens || {};
  var SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ROLES = [['client', 'Client'], ['expert', 'Expert']];
  var role = 'client', fresh = null, list = null, listErr = false;

  function statusOf(i) {
    if (i.used) return ['Acceptée', 'ok'];
    return new Date(i.expiresAt).getTime() < Date.now() ? ['Expirée', 'error'] : ['En attente', ''];
  }
  function listHtml() {
    if (listErr) return '<div class="emptyState">Impossible de charger les invitations.</div>';
    if (!list) return '<div class="skel" style="height:48px"></div><div class="skel" style="height:48px;margin-top:10px"></div>';
    if (!list.length) return '<div class="emptyState">Aucune invitation envoyée.</div>';
    return list.map(function (i) {
      var st = statusOf(i);
      return '<div class="detailRow"><span class="invMail">' + TTF.esc(i.email) + '<span class="hint">' + (i.role === 'expert' ? 'Expert' : 'Client') + ' · ' + TTF.date(i.createdAt) + '</span></span><span class="statusBadge ' + st[1] + '"><span class="syncDot"></span>' + st[0] + '</span></div>';
    }).join('');
  }
  function loadList(el) {
    fetch('/api/invitations', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { list = j.invitations; listErr = false; }, function () { listErr = true; })
      .then(function () { var b = el.querySelector('#invList'); if (b) b.innerHTML = listHtml(); });
  }
  function submit(el) {
    var input = el.querySelector('#invEmail'), btn = el.querySelector('#invSend'), out = el.querySelector('#invMsg');
    var email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.className = 'formMsg error'; out.textContent = 'Entre une adresse courriel valide.'; input.focus(); return; }
    btn.disabled = true; out.className = 'formMsg'; out.textContent = 'Envoi…';
    function post() {
      return fetch('/api/invitations', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, role: role }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) {
          // Inviter est une action sensible : ré-authentification TOTP (valide 5 min), puis on rejoue la demande.
          if (x.r.status === 403 && x.j.error === 'stepup_required') return TTSec.stepUp().then(post, function () { btn.disabled = false; out.className = 'formMsg error'; out.textContent = 'Ré-authentification annulée : l’invitation n’a pas été créée.'; });
          btn.disabled = false;
          if (x.r.ok) { fresh = x.j; list = null; TTApp.refresh(); return; }
          out.className = 'formMsg error';
          out.textContent = x.r.status === 403 && x.j.error === 'mfa_enroll_required' ? 'Active d’abord la vérification en deux étapes (page Sécurité).' : x.r.status === 403 ? 'Réservé à l’expert.' : x.r.status === 400 || x.r.status === 422 ? 'Invitation refusée : vérifie l’adresse.' : 'Échec de l’envoi (' + x.r.status + ').';
        }, function () { btn.disabled = false; out.className = 'formMsg error'; out.textContent = 'Hors ligne : l’invitation n’a pas été créée.'; });
    }
    post();
  }
  window.TTScreens.invite = {
    render: function (el, state, raw) {
      var head = '<div class="pageHead"><div class="screenTitle">Inviter</div><button type="button" class="cmpClose" id="closePage" aria-label="Fermer">✕</button></div>';
      var wire = function () { el.querySelector('#closePage').addEventListener('click', function () { location.hash = '#/sync'; }); };
      if (raw.source === 'demo' || (raw.me && raw.me.role !== 'expert')) {
        el.innerHTML = head + '<div class="stateScreen"><div class="stateTitle">Réservé à l’expert</div><div class="stateMsg">' + (raw.source === 'demo' ? 'Mode démonstration : aucune invitation possible.' : 'Seul l’expert peut inviter des clients ou d’autres experts.') + '</div></div>';
        wire(); return;
      }
      var code = fresh;
      el.innerHTML = head +
        '<div class="card"><div class="cardLabel">Rôle de la personne invitée</div>' +
        '<div class="chipRow" role="radiogroup" aria-label="Rôle" style="margin-top:8px">' + ROLES.map(function (r) {
          return '<button type="button" class="chip' + (role === r[0] ? ' active' : '') + '" role="radio" aria-checked="' + (role === r[0]) + '" data-role="' + r[0] + '">' + r[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="hint" style="margin-top:8px">' + (role === 'expert' ? 'Voit tous les portefeuilles et peut inviter.' : 'Voit son portefeuille et celui de l’expert, en lecture seule.') + '</div>' +
        '<label class="cardLabel" for="invEmail" style="display:block;margin-top:14px">Courriel</label>' +
        '<div class="sendField"><input id="invEmail" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="nom@exemple.com" aria-describedby="invMsg">' +
        '<button type="button" class="sendBtn" id="invSend" aria-label="Créer l’invitation">' + SEND + '</button></div>' +
        '<div id="invMsg" class="formMsg" role="status"></div></div>' +
        (code ? '<div class="card codeCard"><div class="cardLabel">Code d’invitation pour ' + TTF.esc(code.email) + '</div><div class="codeVal" id="invCode">' + TTF.esc(code.code) + '</div>' +
          '<div class="hint">Affiché une seule fois. Valide jusqu’au ' + TTF.date(code.expiresAt) + '.</div><button type="button" class="btnGhost linkBtn" id="invCopy">Copier le code</button></div>' : '') +
        '<div class="sectionTitle">Invitations</div><div class="card" id="invList">' + listHtml() + '</div>';
      fresh = null;
      wire();
      el.querySelectorAll('[data-role]').forEach(function (b) { b.addEventListener('click', function () { role = b.dataset.role; fresh = code; TTApp.refresh(); }); });
      el.querySelector('#invSend').addEventListener('click', function () { submit(el); });
      el.querySelector('#invEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(el); });
      var cp = el.querySelector('#invCopy');
      if (cp) cp.addEventListener('click', function () {
        var t = el.querySelector('#invCode').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { cp.textContent = 'Copié'; }, function () { cp.textContent = 'Copie impossible : sélectionne le code'; });
      });
      if (!list) loadList(el);
    }
  };
})();
