/* « Connecter mon IA » (section « Mon IA » des Réglages) — accès au serveur MCP, en lecture seule par défaut.
 * Essentiel : état (connectée ou non), UN bouton principal, une phrase d'aide, un bouton pour révoquer.
 * Le reste est replié sous « Détails ». Le jeton n'est montré qu'une fois, à la création. Voir server/routes/mcp.js. */
(function () {
  'use strict';
  var box = document.getElementById('aiConnectBox');
  var head = document.getElementById('aiConnectHeader');
  if (!box || !head) return;
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var loaded = false, shown = null, detailsOpen = false, canWrite = false;
  // Un clic dans la section ne doit jamais atteindre le gestionnaire global « clic hors du panneau » (le bouton cliqué peut être retiré du DOM au repaint).
  box.addEventListener('click', function (e) { e.stopPropagation(); });

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function call(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(tr(d.error || 'Erreur.')); return d; }); },
        function () { throw new Error(tr('Connexion impossible. Réessaie.')); }); // coupure réseau : plus de « Load failed » brut
  }
  function fmt(iso) {
    if (!iso) return tr('jamais utilisé');
    try { return tr('dernière utilisation : ') + new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  function copyBtn(value, field) {
    var b = el('button', 'iconBtn', tr('Copier')); b.type = 'button';
    b.addEventListener('click', function () {
      var done = function () { b.textContent = tr('Copié'); setTimeout(function () { b.textContent = tr('Copier'); }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () { field.select(); }); else field.select();
    });
    return b;
  }
  function copyLine(value) {
    var line = el('div', 'aiConnectCopyLine');
    var inp = el('input', 'aiConnectField'); inp.type = 'text'; inp.readOnly = true; inp.value = value;
    inp.addEventListener('focus', function () { inp.select(); });
    line.appendChild(inp); line.appendChild(copyBtn(value, inp));
    return line;
  }

  // Crée une adresse : si des accès existent déjà, ils sont d'abord révoqués (une seule adresse active à la fois).
  function create(data) {
    var old = data.tokens.slice();
    var chain = Promise.resolve();
    old.forEach(function (tk) { chain = chain.then(function () { return call('DELETE', '/api/ai-tokens/' + tk.id); }); });
    return chain.then(function () { return call('POST', '/api/ai-tokens', { label: 'Claude', canWrite: canWrite }); })
      .then(function (r) { shown = r; return refresh(); });
  }
  function revokeAll(data) {
    var chain = Promise.resolve();
    data.tokens.forEach(function (tk) { chain = chain.then(function () { return call('DELETE', '/api/ai-tokens/' + tk.id); }); });
    return chain.then(function () { shown = null; return refresh(); });
  }

  function paint(data, msgText) {
    box.innerHTML = '';
    var connected = data.tokens.length > 0;
    var top = el('div', 'notifRow');
    top.appendChild(el('span', 'notifRowLabel', tr('Connecter mon IA')));
    top.appendChild(el('span', 'hint', connected ? tr('Connectée') : tr('Non connectée')));
    box.appendChild(top);
    box.appendChild(el('p', 'hint', tr("Branche TimeTracker à ton IA (Claude, ChatGPT…) : elle lit tes tâches et tes objectifs, sans rien modifier.")));

    if (shown) {
      var full = (data.origin || location.origin) + '/mcp/t/' + shown.token;
      box.appendChild(el('p', 'aiConnectWarn', tr("Copie cette adresse maintenant : elle ne sera plus affichée.")));
      box.appendChild(copyLine(full));
      box.appendChild(el('p', 'hint', tr("Colle-la dans claude.ai > Paramètres > Connecteurs > Ajouter un connecteur personnalisé. Elle contient ton accès : ne la partage pas.")));
      var ok = el('button', 'btn btn-primary btn-small', tr("J'ai copié")); ok.type = 'button';
      ok.addEventListener('click', function () { shown = null; paint(data); });
      box.appendChild(ok);
    } else {
      var main = el('button', 'btn btn-primary btn-small', connected ? tr('Générer une nouvelle adresse') : tr("Créer l'adresse de connexion")); main.type = 'button';
      main.addEventListener('click', function () {
        main.disabled = true;
        create(data).catch(function (e) { paint(data, e.message); });
      });
      box.appendChild(main);
      if (connected) {
        var rev = el('button', 'iconBtn btnBrique btnDanger', tr("Révoquer l'accès")); rev.type = 'button';
        rev.addEventListener('click', function () {
          var run = function () { return revokeAll(data); };
          if (window.TMT && typeof window.TMT.confirmDelete === 'function') {
            window.TMT.confirmDelete({ title: tr("Révoquer l'accès ?"), text: tr("Ton IA ne pourra plus lire tes tâches ni tes objectifs. Tu pourras recréer une adresse à tout moment."), onConfirm: run });
          } else { run().catch(function (e) { paint(data, e.message); }); }
        });
        box.appendChild(rev);
      }
    }

    var det = el('button', 'iconBtn', detailsOpen ? tr('Masquer les détails') : tr('Détails')); det.type = 'button';
    det.addEventListener('click', function () { detailsOpen = !detailsOpen; paint(data); });
    box.appendChild(det);
    if (detailsOpen) {
      var d = el('div', 'aiConnectDetails');
      d.appendChild(el('p', 'hint', tr("Tu peux révoquer l'accès à tout moment. Une nouvelle adresse remplace l'ancienne.")));
      data.tokens.forEach(function (tk) {
        d.appendChild(el('p', 'hint', fmt(tk.lastUsedAt) + (tk.canWrite ? ' · ' + tr('écriture autorisée') : ' · ' + tr('lecture seule'))));
      });
      var wl = el('label', 'aiConnectWrite');
      var wc = el('input'); wc.type = 'checkbox'; wc.checked = canWrite;
      wc.addEventListener('change', function () { canWrite = wc.checked; });
      wl.appendChild(wc);
      wl.appendChild(el('span', null, ' ' + tr("Autoriser l'IA à cocher mes tâches et m'écrire (pour la prochaine adresse)")));
      d.appendChild(wl);
      d.appendChild(el('p', 'hint', tr("Avec cette option, l'IA peut cocher tes tâches comme faites, ajouter des notes « 🤖 » et t'envoyer des notifications (10 par jour). Elle ne peut jamais supprimer ni modifier tes tâches.")));
      if (data.url) { d.appendChild(el('p', 'hint', tr('Adresse du serveur'))); d.appendChild(copyLine(data.url)); }
      box.appendChild(d);
    }
    box.appendChild(el('p', 'msg', msgText || ''));
  }

  function refresh() {
    return call('GET', '/api/ai-tokens').then(function (d) { paint(d); loaded = true; }).catch(function (e) { box.textContent = e.message; });
  }
  head.addEventListener('click', function () { if (!shown) refresh(); });
})();
