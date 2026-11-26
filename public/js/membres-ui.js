// Membres d'un pôle ou d'un secteur, depuis Réglages > Activités > Catégories (19 nov. 2026, décision d'Émilien) : appartenance à une catégorie et à tout ce qui est dessous.
// Même gabarit que le bloc « Responsables » (TMT.responsables.categoryBlock, js/responsables-ui.js) : ligne .activityEditRow + .cmpChev à droite, liste des membres, croix officielle .cmpRemove
// seulement si le serveur dit `removable`, « Ajouter » (.cmpAdd) qui ouvre un pop-up centré (✕) : les candidats en bulles rondes (mêmes .discoveryCircles / .smallAvatar que les suggestions de Communauté),
// ou un pseudo à inviter ; le bouton « Ajouter » du bas remplace la barre des volets (R50 : TMT.ui.dockEnregistrer). Droits décidés par le serveur (server/lib/portee.js) : un simple membre ne voit rien.
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  TMT.membres = {
    // activityId ; key : clé du pôle ou du secteur ; onMsg(texte) : message d'erreur. Le bloc reste caché tant que le serveur n'a pas répondu, et disparaît s'il n'y a rien à faire pour ce visiteur.
    categoryBlock: function (activityId, key, onMsg) {
      var url = '/api/activities/' + activityId + '/categories/' + encodeURIComponent(key) + '/membres';
      var root = document.createElement('div'); root.className = 'catStrategie hidden';
      var head = document.createElement('button'); head.type = 'button'; head.className = 'activityEditRow cmpSepRow';
      var hl = document.createElement('span'); hl.textContent = tr('Membres');
      var chev = TMT.ui.chev(false); head.appendChild(hl); head.appendChild(chev);
      var body = document.createElement('div'); body.className = 'catStrategieBody hidden';
      root.appendChild(head); root.appendChild(body);
      head.addEventListener('click', function () { var show = body.classList.toggle('hidden') === false; TMT.ui.setChev(chev, show); });
      function say(m) { if (onMsg) onMsg(m || ''); }
      function paint(d) {
        var any = (d.members || []).some(function (m) { return m.removable; });
        if (!d.canOpen || !(d.canAdd || any)) { root.classList.add('hidden'); return; }
        root.classList.remove('hidden');
        body.textContent = '';
        (d.members || []).forEach(function (m) {
          var row = document.createElement('div'); row.className = 'respRow cmpSepRow';
          var nm = document.createElement('span'); nm.textContent = m.name; row.appendChild(nm);
          if (m.removable) {
            var x = document.createElement('button'); x.type = 'button'; x.className = 'cmpRemove cmpRemove--corner'; x.setAttribute('aria-label', tr('Retirer') + ' ' + m.name);
            x.addEventListener('click', function () {
              TMT.ui.confirm(tr('Voulez-vous vraiment retirer ce membre ?'), { ok: tr('Retirer'), danger: true }).then(function (yes) {
                if (!yes) return;
                TMT.api('DELETE', url + '/' + encodeURIComponent(m.id)).then(function (nd) { say(''); paint(nd); }).catch(function (e) { say(e && e.message); });
              });
            });
            row.appendChild(x);
          }
          body.appendChild(row);
        });
        if (d.canAdd) body.appendChild(TMT.ui.addBtn(tr('Ajouter'), function () {
          choisir(d.candidates || []).then(function (r) {
            if (!r) return;
            var p = r.id ? TMT.api('PUT', url, { userId: r.id }) : TMT.api('POST', '/api/activities/' + activityId + '/invite', { pseudo: r.pseudo, scopeKey: key }).then(function (res) { say(res && res.message ? tr(res.message) : ''); return TMT.api('GET', url); });
            p.then(function (nd) { if (r.id) say(''); paint(nd); }).catch(function (e) { say(e && e.message); });
          });
        }));
      }
      // Pop-up centré (✕ en haut à droite) : les candidats en bulles rondes (on en choisit une) ou un pseudo à inviter ; « Ajouter » (R50) valide. Résout { id } ou { pseudo }, ou null.
      function choisir(cands) {
        return new Promise(function (resolve) {
          var picked = null, done = false;
          var overlay = document.createElement('div'); overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal';
          var card = document.createElement('div'); card.className = 'goalTaskEditCard cmpGlass';
          var header = document.createElement('div'); header.className = 'goalTaskEditHeader';
          var title = document.createElement('p'); title.className = 'sectionTitle'; title.textContent = tr('Ajouter un membre');
          var closeBtn = TMT.ui.closeBtn(null, tr('Fermer')); header.appendChild(title); header.appendChild(closeBtn); card.appendChild(header);
          var circles = document.createElement('div'); circles.className = 'discoveryCircles membresPick';
          var pseudo = document.createElement('input'); pseudo.type = 'text'; pseudo.maxLength = 40; pseudo.placeholder = tr('Pseudo'); pseudo.setAttribute('aria-label', tr('Pseudo')); pseudo.autocomplete = 'off';
          var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tasksSaveBtn'; ok.textContent = tr('Ajouter'); ok.disabled = true;
          function sync() { ok.disabled = !(picked || pseudo.value.trim()); }
          function finish(v) { if (done) return; done = true; overlay.remove(); resolve(v); }
          cands.forEach(function (c) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'discoveryCircleBtn'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', c.name); b.title = c.name;
            b.appendChild(TMT.buildSmallAvatar ? TMT.buildSmallAvatar(c.avatar, c.name, c.color) : document.createTextNode(c.name));
            var nm = document.createElement('span'); nm.className = 'meta'; nm.textContent = c.name; b.appendChild(nm);
            b.addEventListener('click', function () {
              var on = picked !== c.id; picked = on ? c.id : null;
              Array.prototype.forEach.call(circles.children, function (o) { o.setAttribute('aria-pressed', o === b && on ? 'true' : 'false'); });
              if (on) pseudo.value = '';
              sync();
            });
            circles.appendChild(b);
          });
          if (cands.length) card.appendChild(circles);
          pseudo.addEventListener('input', function () {
            if (pseudo.value) { picked = null; Array.prototype.forEach.call(circles.children, function (o) { o.setAttribute('aria-pressed', 'false'); }); }
            sync();
          });
          var pseudoWrap = document.createElement('div'); pseudoWrap.className = 'catNewPole'; pseudoWrap.appendChild(pseudo); card.appendChild(pseudoWrap); // champ texte au gabarit existant des fiches (Nouveau pôle)
          closeBtn.addEventListener('click', function () { finish(null); });
          overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });
          ok.addEventListener('click', function () { finish(picked ? { id: picked } : { pseudo: pseudo.value.trim() }); });
          overlay.appendChild(card); document.body.appendChild(overlay);
          TMT.ui.dockEnregistrer(ok, overlay);
        });
      }
      TMT.api('GET', url).then(function (d) { paint(d); }).catch(function () { root.remove(); });
      return root;
    }
  };
})();
