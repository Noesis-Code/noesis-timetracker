// Responsables d'une activité (8 nov. 2026, décision d'Émilien) : une ligne « Responsables » dans les réglages de l'activité (ligne qui se déroule sur place, R36).
// Composants existants seulement : .cmpChev, .cmpRemove, .cmpAdd. Règles (serveur, server/lib/responsables.js) : le propriétaire est toujours responsable et non retirable,
// seuls les membres peuvent l'être, tous les responsables sont égaux. Utilisée par app.js (buildActivityEditBubble) ; affichée seulement pour une activité partagée.
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // Renvoie le bloc (ligne + zone dépliable). `activity` : { id, membersCount }.
  TMT.responsablesBlock = function (activity) {
    var box = el('div', 'respBlock');
    var head = el('button', 'activityEditRow');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.appendChild(el('span', null, tr('Responsables')));
    var chev = TMT.ui.chev(false);
    head.appendChild(chev);
    var body = el('div', 'respBody hidden');
    box.appendChild(head); box.appendChild(body);
    var data = null, adding = false, loaded = false;

    function msgLine(text) { var p = el('p', 'msg', text); p.setAttribute('role', 'status'); return p; }
    function call(method, url, payload) { return TMT.api(method, url, payload); }
    function paint(error) {
      body.innerHTML = '';
      if (!data) { body.appendChild(msgLine(error || tr('Chargement…'))); return; }
      data.members.filter(function (m) { return m.manager; }).sort(function (x, y) { return (y.owner ? 1 : 0) - (x.owner ? 1 : 0); }).forEach(function (m) {
        var row = el('div', 'respRow');
        row.appendChild(el('span', 'respName', m.name));
        if (data.canManage && !m.owner) {
          row.appendChild(TMT.ui.removeBtn(function () {
            call('DELETE', '/api/activities/' + activity.id + '/responsables/' + encodeURIComponent(m.id)).then(function (d) { data = d; paint(); }).catch(function (e) { paint(e.message); });
          }, tr('Retirer')));
        }
        body.appendChild(row);
      });
      var others = data.members.filter(function (m) { return !m.manager; });
      if (data.canManage && others.length) {
        if (adding) {
          others.forEach(function (m) {
            var pick = el('button', 'activityEditRow respPick', m.name);
            pick.type = 'button';
            pick.addEventListener('click', function () {
              call('PUT', '/api/activities/' + activity.id + '/responsables', { userId: m.id }).then(function (d) { data = d; adding = false; paint(); }).catch(function (e) { paint(e.message); });
            });
            body.appendChild(pick);
          });
        } else {
          body.appendChild(TMT.ui.addBtn(tr('Ajouter un responsable'), function () { adding = true; paint(); }));
        }
      }
      if (error) body.appendChild(msgLine(error));
    }
    head.addEventListener('click', function () {
      var open = body.classList.toggle('hidden') === false;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      chev.classList.toggle('open', open);
      if (open && !loaded) {
        loaded = true; paint();
        call('GET', '/api/activities/' + activity.id + '/responsables').then(function (d) { data = d; paint(); }).catch(function (e) { loaded = false; paint(e.message); });
      }
    });
    return box;
  };
})();
