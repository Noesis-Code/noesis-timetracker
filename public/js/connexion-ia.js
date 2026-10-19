/* « Connecter mon IA » (Réglages) — jetons d'accès au serveur MCP en lecture seule.
 * Le jeton n'est montré qu'une fois, à la création. Voir server/routes/mcp.js. */
(function () {
  'use strict';
  var box = document.getElementById('aiConnectBox');
  var head = document.getElementById('aiConnectHeader');
  if (!box || !head) return;
  var loaded = false, shown = null;
  // Un clic dans la section ne doit jamais atteindre le gestionnaire global « clic hors du panneau » (le bouton cliqué peut être retiré du DOM au repaint).
  box.addEventListener('click', function (e) { e.stopPropagation(); });

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function call(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Erreur.'); return d; }); });
  }
  function fmt(iso) { if (!iso) return 'jamais utilisé'; try { return 'dernière utilisation : ' + new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function copyRow(label, value) {
    var row = el('div', 'aiConnectCopy');
    row.appendChild(el('span', 'hint', label));
    var inp = el('input', 'aiConnectField'); inp.type = 'text'; inp.readOnly = true; inp.value = value;
    inp.addEventListener('focus', function () { inp.select(); });
    var b = el('button', 'iconBtn', 'Copier'); b.type = 'button';
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Copié'; setTimeout(function () { b.textContent = 'Copier'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () { inp.select(); }); else inp.select();
    });
    var line = el('div', 'aiConnectCopyLine'); line.appendChild(inp); line.appendChild(b);
    row.appendChild(line);
    return row;
  }

  function paint(data, msgText) {
    box.innerHTML = '';
    box.appendChild(el('p', 'hint', "Branche TimeTracker à ton IA (Claude, ChatGPT…) : elle lit tes tâches et tes objectifs pour te proposer un plan. Par défaut, elle ne peut rien modifier."));
    box.appendChild(el('p', 'hint', "En créant un jeton, tu autorises l'IA connectée à lire tes tâches et tes objectifs, en lecture seule (sauf si tu autorises l'écriture ci-dessous). Tu peux révoquer l'accès à tout moment."));

    if (shown) {
      var card = el('div', 'aiConnectShown');
      card.appendChild(el('p', 'aiConnectWarn', 'Copie ce jeton maintenant : il ne sera plus jamais affiché.'));
      card.appendChild(copyRow('Jeton', shown.token));
      card.appendChild(copyRow('Adresse du serveur', data.url));
      card.appendChild(copyRow('Adresse complète pour claude.ai', (data.origin || location.origin) + '/mcp/t/' + shown.token));
      card.appendChild(el('p', 'hint', 'Colle cette adresse dans claude.ai > Paramètres > Connecteurs > Ajouter un connecteur personnalisé (sans identifiant). Elle contient ton jeton : ne la partage pas ; révoque-la ici au besoin.'));
      var ok = el('button', 'iconBtn', "J'ai copié"); ok.type = 'button';
      ok.addEventListener('click', function () { shown = null; paint(data); });
      card.appendChild(ok);
      box.appendChild(card);
    }

    var list = el('div', 'aiConnectList');
    data.tokens.forEach(function (tk) {
      var row = el('div', 'aiConnectRow');
      var info = el('div', 'aiConnectInfo');
      info.appendChild(el('strong', null, tk.label));
      info.appendChild(el('span', 'hint', fmt(tk.lastUsedAt) + (tk.canWrite ? ' · écriture autorisée' : ' · lecture seule')));
      row.appendChild(info);
      var act = el('div', 'aiConnectActions');
      var rev = el('button', 'iconBtn btnBrique', 'Révoquer'); rev.type = 'button';
      rev.addEventListener('click', function () {
        rev.hidden = true;
        act.appendChild(el('span', 'hint', 'Révoquer ?'));
        var yes = el('button', 'iconBtn btnBrique', 'Oui'); yes.type = 'button';
        var no = el('button', 'iconBtn', 'Non'); no.type = 'button';
        yes.addEventListener('click', function () { call('DELETE', '/api/ai-tokens/' + tk.id).then(refresh).catch(function (e) { paint(data, e.message); }); });
        no.addEventListener('click', function () { paint(data); });
        act.appendChild(yes); act.appendChild(no);
      });
      act.appendChild(rev); row.appendChild(act);
      list.appendChild(row);
    });
    box.appendChild(list);

    if (data.tokens.length < data.max) {
      var form = el('div', 'aiConnectForm');
      var wl = el('label', 'aiConnectWrite');
      var wc = el('input'); wc.type = 'checkbox';
      wl.appendChild(wc);
      wl.appendChild(el('span', null, " Autoriser l'IA à cocher mes tâches et m'écrire"));
      var warn = el('p', 'hint', "Attention : avec cette option, l'IA peut cocher tes tâches comme faites, ajouter des notes « 🤖 » et t'envoyer des notifications (10 par jour). Elle ne peut jamais supprimer ni modifier tes tâches.");
      var name = el('input', 'aiConnectField'); name.type = 'text'; name.maxLength = 60; name.placeholder = 'Nom (ex. Claude)';
      var go = el('button', 'iconBtn', 'Créer un jeton'); go.type = 'button';
      go.addEventListener('click', function () {
        go.disabled = true;
        call('POST', '/api/ai-tokens', { label: name.value, canWrite: wc.checked }).then(function (r) { shown = r; refresh(); }).catch(function (e) { go.disabled = false; paint(data, e.message); });
      });
      form.appendChild(name); form.appendChild(go);
      box.appendChild(wl); box.appendChild(warn);
      box.appendChild(form);
    } else {
      box.appendChild(el('p', 'hint', 'Maximum de ' + data.max + ' jetons actifs : révoque-en un pour en créer un autre.'));
    }
    box.appendChild(el('p', 'msg', msgText || ''));
  }

  function refresh() {
    return call('GET', '/api/ai-tokens').then(function (d) { paint(d); loaded = true; }).catch(function (e) { box.textContent = e.message; });
  }
  head.addEventListener('click', function () { if (!loaded) refresh(); else if (!shown) refresh(); });
})();
