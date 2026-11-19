// Responsables d'une activité (8 nov. 2026, décision d'Émilien) : ils se gèrent depuis la LISTE DES MEMBRES, par le menu « ⋯ » de chaque membre
// (TMT.ui.dotsMenu, composant commun) : « Ajouter comme responsable » / « Retirer comme responsable ». Règles (serveur, server/lib/responsables.js) :
// le propriétaire est toujours responsable et non retirable, seuls les membres peuvent l'être, tous les responsables sont égaux, exclure un membre le retire.
// Ce module ne dessine rien : il sert la liste des membres (app.js) et la fiche du titre (objectifs-creer.js), sans copie.
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  var R = TMT.responsables = {
    // { activityId, members: [{ id, name, owner, manager }], canManage } ou un état vide si le serveur refuse
    load: function (activityId) {
      return TMT.api('GET', '/api/activities/' + activityId + '/responsables').catch(function () { return { activityId: activityId, members: [], canManage: false }; });
    },
    // Les entrées du menu « ⋯ » d'un membre (hors « Exclure », propre à la liste des membres) ; [] si rien à proposer.
    // st : résultat de load() ; userId : le membre ; done(err) : rappel après l'action (pour rafraîchir l'affichage).
    items: function (activityId, st, userId, done) {
      var m = (st && st.members || []).filter(function (x) { return x.id === userId; })[0];
      if (!m || m.owner || !st.canManage) return [];
      if (m.manager && !st.isOwner) return []; // 18 nov. 2026 : seul le propriétaire retire un responsable de l'activité (deux responsables de même niveau ne se retirent pas entre eux)
      var add = !m.manager;
      return [{ label: tr(add ? 'Ajouter comme responsable' : 'Retirer comme responsable'), onClick: function () {
        var p = add ? TMT.api('PUT', '/api/activities/' + activityId + '/responsables', { userId: userId }) : TMT.api('DELETE', '/api/activities/' + activityId + '/responsables/' + encodeURIComponent(userId));
        p.then(function () { if (done) done(); }, function (e) { if (done) done(e); });
      } }];
    },
    // Menu « Responsables » de la fiche d'une catégorie (18 nov. 2026) : ligne .activityEditRow + .cmpChev (comme la Stratégie), liste des responsables avec la croix officielle .cmpRemove
    // (seulement si le visiteur a le droit de retirer cette personne : décidé par le serveur, champ removable), « Ajouter » (.cmpAdd) qui ouvre un pop-up des membres pas encore responsables,
    // puis le bouton « Ajouter » du bas (R50 : TMT.ui.dockEnregistrer). key : '_' pour l'activité, sinon la clé du pôle ou du secteur. onMsg(texte) : message d'erreur.
    categoryBlock: function (activityId, key, onMsg) {
      var url = '/api/activities/' + activityId + '/categories/' + encodeURIComponent(key) + '/responsables';
      var root = document.createElement('div'); root.className = 'catStrategie';
      var head = document.createElement('button'); head.type = 'button'; head.className = 'activityEditRow cmpSepRow';
      var hl = document.createElement('span'); hl.textContent = tr('Responsables');
      var chev = TMT.ui.chev(false); head.appendChild(hl); head.appendChild(chev);
      var body = document.createElement('div'); body.className = 'catStrategieBody hidden';
      root.appendChild(head); root.appendChild(body);
      head.addEventListener('click', function () { var show = body.classList.toggle('hidden') === false; TMT.ui.setChev(chev, show); });
      function say(m) { if (onMsg) onMsg(m || ''); }
      function paint(d) {
        body.textContent = '';
        (d.responsables || []).forEach(function (r) {
          var row = document.createElement('div'); row.className = 'respRow cmpSepRow';
          var nm = document.createElement('span'); nm.textContent = r.name;
          row.appendChild(nm);
          var lv = r.owner ? 'propriétaire' : r.rang === 3 ? 'activité' : r.rang === 2 ? 'pôle' : '';
          if (lv) { var h = document.createElement('span'); h.className = 'hint respLevel'; h.textContent = tr(lv); row.appendChild(h); }
          if (r.removable) {
            var x = document.createElement('button'); x.type = 'button'; x.className = 'cmpRemove cmpRemove--corner'; x.setAttribute('aria-label', tr('Retirer') + ' ' + r.name);
            x.addEventListener('click', function () {
              TMT.ui.confirm(tr('Voulez-vous vraiment retirer ce responsable ?'), { ok: tr('Retirer'), danger: true }).then(function (yes) {
                if (!yes) return;
                TMT.api('DELETE', url + '/' + encodeURIComponent(r.id)).then(function (nd) { say(''); paint(nd); }).catch(function (e) { say(e && e.message); });
              });
            });
            row.appendChild(x);
          }
          body.appendChild(row);
        });
        if (d.canAdd && (d.candidates || []).length) body.appendChild(TMT.ui.addBtn(tr('Ajouter'), function () {
          choisir(d.candidates).then(function (id) {
            if (!id) return;
            TMT.api('PUT', url, { userId: id }).then(function (nd) { say(''); paint(nd); }).catch(function (e) { say(e && e.message); });
          });
        }));
      }
      // Pop-up centré (✕ en haut à droite) : les membres qui ne sont pas encore responsables ; un choix, puis « Ajouter » (R50) l'ajoute. Résout l'id choisi, ou null.
      function choisir(cands) {
        return new Promise(function (resolve) {
          var picked = null, done = false;
          var overlay = document.createElement('div'); overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal';
          var card = document.createElement('div'); card.className = 'goalTaskEditCard cmpGlass';
          var header = document.createElement('div'); header.className = 'goalTaskEditHeader';
          var title = document.createElement('p'); title.className = 'sectionTitle'; title.textContent = tr('Ajouter un responsable');
          var closeBtn = TMT.ui.closeBtn(null, tr('Fermer')); header.appendChild(title); header.appendChild(closeBtn); card.appendChild(header);
          var list = document.createElement('div'); card.appendChild(list);
          var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tasksSaveBtn'; ok.textContent = tr('Ajouter'); ok.disabled = true;
          function finish(v) { if (done) return; done = true; overlay.remove(); resolve(v); }
          cands.forEach(function (c) {
            var row = document.createElement('div'); row.className = 'tasksPopRow';
            var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'tasksPopCheck'; cb.setAttribute('aria-pressed', 'false'); cb.setAttribute('aria-label', c.name);
            var tx = document.createElement('span'); tx.textContent = c.name;
            function choose() {
              picked = c.id; ok.disabled = false;
              Array.prototype.forEach.call(list.children, function (r) { var on = r === row; r.classList.toggle('done', on); var b = r.firstChild; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = ''; if (on) b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>'; });
            }
            cb.addEventListener('click', choose); tx.addEventListener('click', choose);
            row.appendChild(cb); row.appendChild(tx); list.appendChild(row);
          });
          closeBtn.addEventListener('click', function () { finish(null); });
          overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });
          ok.addEventListener('click', function () { finish(picked); });
          overlay.appendChild(card); document.body.appendChild(overlay);
          TMT.ui.dockEnregistrer(ok, overlay);
        });
      }
      TMT.api('GET', url).then(function (d) { paint(d); }).catch(function () { /* rien : la fiche n'affiche alors pas ce menu */ root.remove(); });
      return root;
    },
    // Ouverture de la fiche d'une catégorie : seulement pour un responsable (ou le propriétaire) de cette catégorie ou d'un niveau supérieur. Résout true/false, jamais d'erreur ni de message.
    canOpenCategory: function (activityId, key) {
      return TMT.api('GET', '/api/activities/' + activityId + '/categories/' + encodeURIComponent(key || '_') + '/responsables').then(function (d) { return !!(d && d.canOpen); }).catch(function () { return false; });
    }
  };
})();
