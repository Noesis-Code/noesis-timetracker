/* Sécurité du compte : vérification en deux étapes (TOTP), ré-authentification (step-up), codes de secours, sessions, journal d'audit.
   Aucun secret n'est gardé côté navigateur : la clé TOTP et les codes de secours ne vivent que dans le DOM le temps de l'affichage
   (ni localStorage, ni cache). Le QR est généré par le serveur (SVG local, rien n'est envoyé à un tiers). */
(function () {
  window.TTScreens = window.TTScreens || {};
  var esc = TTF.esc;
  var SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var SHIELD = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
  var EVENTS = {
    link_ok: 'Connexion depuis TimeTracker', link_refused: 'Lien d’entrée refusé', totp_verified: 'Vérification réussie', totp_failed: 'Code refusé',
    stepup_ok: 'Ré-authentification réussie', stepup_failed: 'Ré-authentification refusée', stepup_required: 'Ré-authentification demandée', backup_code_used: 'Code de secours utilisé',
    totp_enroll_started: 'Activation commencée', totp_confirm_failed: 'Activation : code refusé', totp_enrolled: 'Vérification en deux étapes activée', totp_reset: 'Appareil d’authentification réinitialisé',
    backup_codes_regenerated: 'Codes de secours régénérés', broker_token_set: 'Jeton courtier connecté', broker_token_replaced: 'Jeton courtier remplacé', broker_token_deleted: 'Jeton courtier supprimé',
    invitation_created: 'Invitation créée', invitation_created_expert: 'Invitation d’expert créée', sessions_revoked_all: 'Toutes les sessions fermées', session_idle: 'Session fermée (inactivité)',
    session_expired: 'Session expirée', session_device: 'Session fermée (appareil différent)', new_device: 'Nouvel appareil', code_locked: 'Saisie verrouillée (trop d’essais)',
    auth_failures_repeated: 'Échecs répétés de vérification', logout: 'Déconnexion'
  };

  function req(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, j: j, retry: r.headers.get('Retry-After') }; }); },
        function () { return { status: 0, ok: false, j: {}, offline: true }; });
  }
  function codeError(x) {
    if (x.offline) return 'Hors ligne : rien n’a été envoyé.';
    if (x.status === 429) return 'Trop d’essais. Réessaie dans ' + (x.retry || 'quelques') + ' s.';
    if (x.status === 401 && x.j.error === 'invalid_code') return 'Code invalide. Vérifie l’heure de ton téléphone et réessaie.';
    if (x.status === 401) return 'Session expirée. Ouvre Trade Tracker depuis TimeTracker.';
    return 'Échec (' + x.status + ').';
  }
  function codeField(id, placeholder, numeric) {
    return '<div class="sendField"><input id="' + id + '" type="text" inputmode="' + (numeric ? 'numeric' : 'text') + '" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="' + (numeric ? 7 : 24) + '" placeholder="' + esc(placeholder) + '" aria-describedby="' + id + 'Msg">' +
      '<button type="button" class="sendBtn" id="' + id + 'Send" aria-label="Valider le code">' + SEND + '</button></div><div id="' + id + 'Msg" class="formMsg" role="status"></div>';
  }
  // Branche un champ de code : Entrée ou bouton -> submit(valeur, msgEl) -> Promise<erreur|null>
  function wireCode(root, id, submit) {
    var input = root.querySelector('#' + id), btn = root.querySelector('#' + id + 'Send'), out = root.querySelector('#' + id + 'Msg');
    function go() {
      var v = input.value.trim();
      if (!v) { out.className = 'formMsg error'; out.textContent = 'Entre ton code.'; input.focus(); return; }
      btn.disabled = true; input.disabled = true; out.className = 'formMsg'; out.textContent = 'Vérification…';
      submit(v).then(function (err) {
        if (!err) return;
        input.value = ''; input.disabled = false; btn.disabled = false; out.className = 'formMsg error'; out.textContent = err; input.focus();
      });
    }
    btn.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    return input;
  }

  // --- Ré-authentification (pop-up centré avec ✕) : résout quand le code est accepté, rejette si la personne ferme. ---
  function stepUp() {
    return new Promise(function (resolve, reject) {
      var done = false;
      var m = TTUI.modal('Confirme ton identité',
        '<p class="hint" style="margin:0 0 10px">Cette action est sensible. Entre le code à 6 chiffres de ton application d’authentification (ou un code de secours).</p>' + codeField('stepCode', 'Code à 6 chiffres', false));
      function settle(ok) { if (done) return; done = true; document.removeEventListener('keydown', onEsc, true); ok ? resolve() : reject(new Error('cancelled')); }
      function onEsc(e) { if (e.key === 'Escape') settle(false); }
      document.addEventListener('keydown', onEsc, true);
      m.root.querySelector('.modalClose').addEventListener('click', function () { settle(false); });
      m.root.querySelector('.modalVeil').addEventListener('click', function (e) { if (e.target === this) settle(false); });
      var input = wireCode(m.root, 'stepCode', function (code) {
        return req('POST', '/api/auth/verify', { code: code }).then(function (x) { if (x.ok) { m.close(); settle(true); return null; } return codeError(x); });
      });
      input.focus();
    });
  }

  // --- Codes de secours (affichés UNE fois) ---
  function backupCodesHtml(codes, doneLabel) {
    return '<div class="card"><div class="cardLabel">Codes de secours</div>' +
      '<p class="hint" style="margin:6px 0 10px">Chaque code ne sert qu’une fois. Si tu perds ton téléphone, c’est le seul moyen de rentrer. Garde-les hors de cet appareil (gestionnaire de mots de passe ou papier). Ils ne seront plus jamais affichés.</p>' +
      '<div class="codeGrid" id="backupGrid">' + codes.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join('') + '</div>' +
      '<div class="btnRow" style="margin-top:12px"><button type="button" class="btnGhost" id="copyCodes">Copier</button><button type="button" class="btnPrimary" id="codesDone" style="margin:0">' + doneLabel + '</button></div></div>';
  }
  function wireBackupCodes(root, codes, onDone) {
    root.querySelector('#copyCodes').addEventListener('click', function () {
      var b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(codes.join('\n')) : Promise.reject()).then(function () { b.textContent = 'Copié'; }, function () { b.textContent = 'Sélectionne et copie à la main'; });
    });
    root.querySelector('#codesDone').addEventListener('click', onDone);
  }

  // --- Activation du TOTP : clé + QR local -> premier code -> codes de secours ---
  function renderEnroll(el, opts) {
    el.innerHTML = (opts.head || '') + '<div class="card"><div class="cardLabel">Activer la vérification en deux étapes</div><div class="skel" style="height:180px;margin-top:10px"></div></div>';
    if (opts.onClose) { var c = el.querySelector('#closePage'); if (c) c.addEventListener('click', opts.onClose); }
    req('POST', '/api/auth/totp/enroll').then(function (x) {
      if (x.status === 409) return opts.onDone();
      if (!x.ok) {
        el.querySelector('.card').innerHTML = '<div class="cardLabel">Activer la vérification en deux étapes</div><div class="formMsg error" role="alert">' + (x.j.error === 'mfa_unavailable' ? 'Indisponible : la clé de chiffrement du serveur (TRADE_TOKEN_KEY) n’est pas configurée.' : x.status === 401 ? 'Session expirée. Ouvre Trade Tracker depuis TimeTracker.' : 'Échec (' + x.status + ').') + '</div>';
        return;
      }
      var j = x.j, key = j.secret.replace(/(.{4})/g, '$1 ').trim();
      el.innerHTML = (opts.head || '') +
        '<div class="card"><div class="cardLabel">1 · Ajoute ce compte dans ton application</div>' +
        '<p class="hint" style="margin:6px 0 10px">Google Authenticator, Authy, 1Password… Scanne le code, ou saisis la clé à la main.</p>' +
        (j.qrSvg ? '<div class="qrBox" role="img" aria-label="Code QR d’activation">' + j.qrSvg + '</div>' : '') +
        '<div class="cardLabel" style="margin-top:12px">Clé de configuration</div><div class="keyBox" id="totpKey">' + esc(key) + '</div></div>' +
        '<div class="card"><div class="cardLabel">2 · Entre le code à 6 chiffres affiché</div>' + codeField('enrollCode', 'Code à 6 chiffres', true) + '</div>';
      if (opts.onClose) { var c2 = el.querySelector('#closePage'); if (c2) c2.addEventListener('click', opts.onClose); }
      var input = wireCode(el, 'enrollCode', function (code) {
        return req('POST', '/api/auth/totp/confirm', { code: code }).then(function (y) {
          if (!y.ok) return codeError(y);
          var codes = y.j.backupCodes || [];
          el.innerHTML = (opts.head || '') + backupCodesHtml(codes, 'J’ai conservé mes codes');
          wireBackupCodes(el, codes, function () { codes.length = 0; opts.onDone(); });
          return null;
        });
      });
      input.focus();
    });
  }

  // --- Porte d'entrée : TOTP exigé et non vérifié sur cette session ---
  function gate(el) {
    document.body.classList.add('gate');
    el.setAttribute('aria-busy', 'false');
    function done() { document.body.classList.remove('gate'); TTD.reset(); TTApp.refresh(); }
    req('GET', '/api/me').then(function (x) {
      if (!x.ok) { el.innerHTML = '<div class="stateScreen" role="alert"><div class="stateIcon">' + SHIELD + '</div><div class="stateTitle">Accès sur invitation</div><div class="stateMsg">Session expirée. Ouvre Trade Tracker depuis TimeTracker.</div></div>'; return; }
      var mfa = x.j.mfa || {};
      if (!mfa.enrolled) {
        var head = '<div class="screenTitle">Sécurise ton compte</div><p class="hint" style="margin:6px 2px 0">La vérification en deux étapes est obligatoire' + (x.j.role === 'expert' ? ' pour l’expert' : ' pour connecter un courtier') + '. Ça prend une minute.</p>';
        renderEnroll(el, { head: head, onDone: done });
        return;
      }
      el.innerHTML = '<div class="stateScreen"><div class="stateIcon">' + SHIELD + '</div><div class="stateTitle">Vérification en deux étapes</div>' +
        '<div class="stateMsg">Entre le code à 6 chiffres de ton application d’authentification.</div></div>' +
        '<div class="card">' + codeField('gateCode', 'Code à 6 chiffres ou code de secours', false) + '<div class="hint" style="margin-top:6px">Téléphone perdu ? Entre un de tes codes de secours (usage unique).</div></div>';
      var input = wireCode(el, 'gateCode', function (code) {
        return req('POST', '/api/auth/verify', { code: code }).then(function (y) { if (y.ok) { done(); return null; } return codeError(y); });
      });
      input.focus();
    });
  }

  // --- Page « Sécurité » ---
  var flash = '';
  function eventRow(e) {
    var d = e.detail || {}, extra = d.remaining != null ? ' · ' + d.remaining + ' restant(s)' : d.count != null ? ' · ' + d.count + ' session(s)' : '';
    return '<div class="logRow"><div class="logTop"><span class="logEv">' + esc(EVENTS[e.event] || e.event) + esc(extra) + '</span><span class="hint">' + esc(TTF.dateTime(e.at)) + '</span></div>' +
      '<div class="logMsg">' + esc(e.device || '') + (e.ip ? ' · ' + esc(e.ip) : '') + '</div></div>';
  }
  function section(el, sel, html) { var b = el.querySelector(sel); if (b) b.innerHTML = html; }
  function renderPage(el, raw) {
    var me = raw.me || {}, mfa = me.mfa || {};
    el.innerHTML =
      '<div class="pageHead"><div class="screenTitle">Sécurité</div><button type="button" class="topIconBtn" id="closePage" aria-label="Fermer">✕</button></div>' +
      (flash ? '<div class="formMsg ok" role="status">' + esc(flash) + '</div>' : '') +
      '<div class="card" id="secState"></div><div class="card" id="secSessions"><div class="skel" style="height:60px"></div></div>' +
      '<div class="card" id="secAudit"><div class="skel" style="height:90px"></div></div>';
    flash = '';
    el.querySelector('#closePage').addEventListener('click', function () { location.hash = '#/settings'; });

    section(el, '#secState', '<div class="cardHead" style="margin:0"><div><div class="cardLabel">Vérification en deux étapes</div><div class="syncBannerVal">' + (mfa.enrolled ? 'Activée' : 'Non activée') + '</div></div>' +
      '<span class="statusBadge ' + (mfa.enrolled ? 'ok' : 'warn') + '"><span class="syncDot"></span>' + (mfa.enrolled ? 'Actif' : (mfa.required ? 'Obligatoire' : 'Recommandé')) + '</span></div>' +
      (mfa.enrolled ? '<div class="detailRow"><span>Codes de secours restants</span><span>' + (mfa.backupRemaining || 0) + '</span></div>' +
        '<div class="btnRow" style="margin-top:12px"><button type="button" class="btnGhost" id="regenCodes">Nouveaux codes de secours</button><button type="button" class="btnDangerOutline" id="resetTotp">Changer d’appareil</button></div><div id="stateMsg" class="formMsg" role="status"></div>'
        : '<p class="hint" style="margin:8px 0 0">Obligatoire pour l’expert et pour connecter un courtier. Une application d’authentification génère un code à 6 chiffres.</p><button type="button" class="btnPrimary" id="enableTotp">Activer</button>'));
    var en = el.querySelector('#enableTotp');
    if (en) en.addEventListener('click', function () { renderEnroll(el, { head: '<div class="pageHead"><div class="screenTitle">Activer</div><button type="button" class="topIconBtn" id="closePage" aria-label="Fermer">✕</button></div>', onClose: function () { TTD.reset(); TTApp.refresh(); }, onDone: function () { flash = 'Vérification en deux étapes activée.'; TTD.reset(); TTApp.refresh(); } }); });
    var rg = el.querySelector('#regenCodes'), rs = el.querySelector('#resetTotp'), sm = el.querySelector('#stateMsg');
    function sensitive(path, onOk) {
      function go() { req('POST', path, {}).then(function (x) {
        if (x.status === 403 && x.j.error === 'stepup_required') return stepUp().then(go, function () { sm.className = 'formMsg error'; sm.textContent = 'Ré-authentification annulée.'; });
        if (!x.ok) { sm.className = 'formMsg error'; sm.textContent = 'Échec (' + x.status + ').'; return; }
        onOk(x.j);
      }); }
      go();
    }
    if (rg) rg.addEventListener('click', function () {
      sensitive('/api/auth/backup-codes', function (j) {
        var codes = j.backupCodes || [];
        el.innerHTML = '<div class="pageHead"><div class="screenTitle">Codes de secours</div></div>' + backupCodesHtml(codes, 'J’ai conservé mes codes');
        wireBackupCodes(el, codes, function () { codes.length = 0; flash = 'Nouveaux codes de secours enregistrés. Les anciens ne marchent plus.'; TTD.reset(); TTApp.refresh(); });
      });
    });
    if (rs) rs.addEventListener('click', function () {
      var m = TTUI.modal('Changer d’appareil ?', '<p class="hint" style="margin:0 0 14px">L’appareil d’authentification actuel et les codes de secours seront supprimés. Tu devras activer le nouvel appareil tout de suite.</p>' +
        '<div class="btnRow"><button type="button" class="btnGhost" id="rsNo">Annuler</button><button type="button" class="btnDanger" id="rsYes">Continuer</button></div>');
      m.root.querySelector('#rsNo').addEventListener('click', m.close);
      m.root.querySelector('#rsYes').addEventListener('click', function () { m.close(); sensitive('/api/auth/totp/reset', function () { TTD.reset(); TTApp.refresh(); }); });
    });

    Promise.all([req('GET', '/api/security/sessions'), req('GET', '/api/security/audit?limit=40')]).then(function (r) {
      if (!el.querySelector('#secSessions')) return;
      var sess = r[0].ok ? r[0].j.sessions : null, au = r[1].ok ? r[1].j : null;
      section(el, '#secSessions', '<div class="cardLabel">Sessions ouvertes</div>' +
        (sess ? sess.map(function (s) {
          return '<div class="detailRow"><span>' + (s.current ? 'Cet appareil' : 'Autre session') + '<span class="hint"> · ' + esc(TTF.ago(s.lastSeenAt)) + '</span></span><span class="statusBadge ' + (s.verified ? 'ok' : 'warn') + '"><span class="syncDot"></span>' + (s.verified ? 'Vérifiée' : 'En attente') + '</span></div>';
        }).join('') : '<div class="emptyState">Sessions indisponibles.</div>') +
        '<p class="hint" style="margin:10px 0 0">Une session se ferme seule après 15 min d’inactivité, ou 12 h au plus. En cas de doute (téléphone perdu, alerte inattendue), ferme-les toutes.</p>' +
        '<button type="button" class="btnDangerOutline linkBtn" id="revokeAll">Fermer toutes mes sessions</button><div id="sessMsg" class="formMsg" role="status"></div>');
      var ra = el.querySelector('#revokeAll');
      if (ra) ra.addEventListener('click', function () {
        var m = TTUI.modal('Fermer toutes les sessions ?', '<p class="hint" style="margin:0 0 14px">Tous tes appareils seront déconnectés, celui-ci compris. Pour revenir, ouvre Trade Tracker depuis TimeTracker.</p>' +
          '<div class="btnRow"><button type="button" class="btnGhost" id="raNo">Annuler</button><button type="button" class="btnDanger" id="raYes">Tout fermer</button></div>');
        m.root.querySelector('#raNo').addEventListener('click', m.close);
        m.root.querySelector('#raYes').addEventListener('click', function () {
          req('POST', '/api/security/sessions/revoke-all', {}).then(function (x) {
            m.close();
            if (x.ok) { TTD.reset(); el.innerHTML = '<div class="stateScreen" role="status"><div class="stateIcon">' + SHIELD + '</div><div class="stateTitle">Sessions fermées</div><div class="stateMsg">' + esc(String(x.j.closed || 0)) + ' session(s) fermée(s). Ouvre Trade Tracker depuis TimeTracker pour te reconnecter.</div></div>'; }
            else { var sm2 = el.querySelector('#sessMsg'); if (sm2) { sm2.className = 'formMsg error'; sm2.textContent = 'Échec (' + x.status + ').'; } }
          });
        });
      });
      section(el, '#secAudit', '<div class="cardLabel">Journal d’activité</div>' +
        (au ? '<div class="hint" style="margin:4px 0 8px">' + (au.chain.ok ? 'Chaîne intacte' : '<span class="neg">Chaîne rompue : contacte l’administrateur</span>') + ' · ' + au.chain.length + ' entrées · empreinte ' + esc(au.chain.head.slice(0, 12)) + '</div>' +
          (au.entries.length ? au.entries.map(eventRow).join('') : '<div class="emptyState">Rien à signaler.</div>') : '<div class="emptyState">Journal indisponible.</div>'));
    });
  }
  window.TTScreens.security = { render: function (el, state, raw) { renderPage(el, raw); } };
  window.TTSec = { gate: gate, stepUp: stepUp };
})();
