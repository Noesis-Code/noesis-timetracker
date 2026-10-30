/* Fabriques des composants partagés (R29) : voir public/css/composants.css. Sans dépendance ; sert TimeTracker, Expansion et Trade Tracker. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.TMT = root.TMT || {};
  var EDIT_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';
  // Fenêtre de confirmation maison (remplace window.confirm) : fond #16141A opaque, ✕ en haut à droite (R13),
  // UN bouton principal violet ; rouge (opts.danger) seulement pour supprimer/retirer (R28). Promesse : true si confirmé.
  // opts.input (29 oct. 2026) : { placeholder, maxLength, label } ajoute UN champ texte ; la promesse rend alors le texte saisi (ou false).
  // opts.choices (29 oct. 2026) : [{ value, label, danger, quiet }] remplace le bouton principal par plusieurs boutons, l'un sous l'autre
  // (danger : rouge ; quiet : gris, ex. « Annuler » qui rend false) ; la promesse rend la valeur choisie (avec un champ : { value, text }).
  function confirmBox(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var veil = document.createElement('div'); veil.className = 'cmpConfirmVeil';
      var card = document.createElement('div'); card.className = 'cmpConfirmCard cmpGlass';
      card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
      var head = document.createElement('div'); head.className = 'cmpConfirmHead';
      var x = ui.closeBtn(null, opts.closeLabel);
      head.appendChild(x);
      var p = document.createElement('p'); p.className = 'cmpConfirmText';
      String(message).split('\n').forEach(function (line, i) { if (i) p.appendChild(document.createElement('br')); p.appendChild(document.createTextNode(line)); });
      var ok = btn('cmpBtn' + (opts.danger ? ' cmpBtnDanger' : ''), '', null); ok.textContent = opts.ok || 'Confirmer';
      var field = null;
      if (opts.input) {
        field = document.createElement('input'); field.className = 'cmpConfirmInput'; field.type = opts.input.type === 'password' ? 'password' : 'text'; field.maxLength = opts.input.maxLength || 500;
        field.placeholder = opts.input.placeholder || ''; field.setAttribute('aria-label', opts.input.label || opts.input.placeholder || '');
        field.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !(opts.choices || []).length) { e.preventDefault(); finish(field.value); } });
      }
      var picks = (opts.choices || []).map(function (c) {
        var b = btn('cmpBtn' + (c.danger ? ' cmpBtnDanger' : c.quiet ? ' cmpBtnIdle' : ''), '', null); b.textContent = c.label;
        b.addEventListener('click', function () { finish(c.value === false ? false : (field ? { value: c.value, text: field.value } : c.value)); });
        return b;
      });
      card.appendChild(head); if (String(message)) card.appendChild(p); if (field) card.appendChild(field);
      if (picks.length) picks.forEach(function (b) { card.appendChild(b); }); else card.appendChild(ok);
      veil.appendChild(card);
      var from = document.activeElement, done = false;
      function finish(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true); veil.remove();
        if (from && from.isConnected && from.focus) { try { from.focus({ preventScroll: true }); } catch (e) {} }
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        else if (e.key === 'Tab') { e.preventDefault(); var ring = (field ? [field] : []).concat(picks.length ? picks : [ok], [x]); ring[(ring.indexOf(document.activeElement) + 1) % ring.length].focus(); }
      }
      x.addEventListener('click', function () { finish(false); });
      ok.addEventListener('click', function () { finish(field ? field.value : true); });
      veil.addEventListener('click', function (e) { if (e.target === veil) finish(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(veil);
      try { (field || picks[0] || ok).focus({ preventScroll: true }); } catch (e) {}
    });
  }
  function btn(cls, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  var ui = {
    editIcon: function () { return EDIT_SVG; },
    closeBtn: function (onClick, label) { var b = btn('cmpClose', label || 'Fermer', onClick); b.textContent = '✕'; return b; },
    removeBtn: function (onClick, label) { return btn('cmpRemove', label || 'Retirer', onClick); },
    editBtn: function (onClick, label) { var b = btn('cmpEdit', label || 'Modifier', onClick); b.innerHTML = EDIT_SVG; return b; },
    addBtn: function (label, onClick) {
      var b = btn('cmpAdd', '', onClick);
      var p = document.createElement('b'); p.textContent = '+';
      b.appendChild(p); b.appendChild(document.createTextNode(label));
      return b;
    },
    chev: function (open) { var s = document.createElement('span'); s.className = 'cmpChev' + (open ? ' open' : ''); s.setAttribute('aria-hidden', 'true'); return s; },
    toggleLabel: function (btn, label, open) { btn.textContent = ''; btn.classList.add('cmpToggle'); var s = document.createElement('span'); s.textContent = label; btn.appendChild(s); btn.appendChild(ui.chev(open)); },
    setChev: function (el, open) { if (el) el.classList.toggle('open', !!open); },
    confirm: confirmBox
  };
  // Glisser-déposer d'une ligne dans son groupe OU vers un autre groupe (R27/R29 ; extrait de bindCatSecteurDrag d'app.js, 28 oct. 2026).
  // Pointer events + setPointerCapture sur la poignée ; la ligne tirée n'est jamais déplacée dans le DOM pendant le geste (transform
  // seulement) ; chaque groupe est une zone de dépôt ; un trait (o.lineClass) montre où la ligne sera insérée ; le groupe visé reçoit
  // o.targetClass ; défilement automatique en bord de zone ; lâché hors zone = annulé. Au relâchement : même groupe -> lignes remises
  // dans le nouvel ordre puis o.onReorder(lignes) ; autre groupe -> o.onMoveTo(conteneurCible, index).
  // o : { list, scroller (élément, ou fonction qui le renvoie ; absent = ascendant qui défile, sinon la fenêtre), groupSel,
  //       rowsWrap(groupe) -> conteneur des lignes, rowSel, wrap (conteneur d'origine), lineClass, targetClass, onReorder, onMoveTo }.
  function groupDrag(handle, row, o) {
    var val = function (x) { return typeof x === 'function' ? x() : x; };
    function scrollParent(el) {
      for (var e = el && el.parentElement; e; e = e.parentElement) {
        var oy = getComputedStyle(e).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e;
      }
      return document.scrollingElement || document.documentElement;
    }
    function rectOf(el) {
      if (el === document.scrollingElement || el === document.documentElement || el === document.body) return { top: 0, bottom: window.innerHeight };
      return el.getBoundingClientRect();
    }
    handle.addEventListener('click', function (e) { e.stopPropagation(); });
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var list = val(o.list);
      var scroller = val(o.scroller) || scrollParent(list);
      var startY = e.clientY, lastX = e.clientX, lastY = e.clientY;
      var startScroll = scroller.scrollTop;
      var target = null;           // { wrap, index, same } ; index = rang hors ligne tirée
      var line = document.createElement('div');
      line.className = o.lineClass;
      list.appendChild(line);
      list.classList.add('dragging');
      row.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      var raf = 0;

      function compute() {
        var lr = list.getBoundingClientRect();
        var groups = Array.prototype.slice.call(list.querySelectorAll(o.groupSel));
        var best = null, bestD = Infinity;
        groups.forEach(function (g) {
          var r = g.getBoundingClientRect();
          var d = lastY < r.top ? r.top - lastY : (lastY > r.bottom ? lastY - r.bottom : 0);
          if (d < bestD) { bestD = d; best = g; }
        });
        var sr = rectOf(scroller);
        var outside = !best || lastY < sr.top || lastY > sr.bottom || lastX < lr.left - 20 || lastX > lr.right + 20;
        list.querySelectorAll(o.groupSel + '.' + o.targetClass).forEach(function (g) { g.classList.remove(o.targetClass); });
        if (outside) { target = null; line.style.display = 'none'; return; }
        var wrap = o.rowsWrap(best);
        var rows = Array.prototype.filter.call(wrap.children, function (el) { return el.matches(o.rowSel) && el !== row; });
        var idx = 0;
        rows.forEach(function (el, i) {
          var r = el.getBoundingClientRect();
          if (lastY > r.top + r.height / 2) idx = i + 1;
        });
        var y;
        if (rows.length === 0) y = wrap.getBoundingClientRect().top;
        else if (idx < rows.length) y = rows[idx].getBoundingClientRect().top;
        else y = rows[rows.length - 1].getBoundingClientRect().bottom;
        var same = wrap === o.wrap;
        target = { wrap: wrap, index: idx, same: same };
        if (!same) best.classList.add(o.targetClass);
        line.style.display = 'block';
        line.style.top = (y - lr.top) + 'px';
      }

      function place() {
        row.style.transform = 'translateY(' + (lastY - startY + scroller.scrollTop - startScroll) + 'px)';
        compute();
      }

      function tick() {
        var sr = rectOf(scroller);
        var zone = 70, speed = 0;
        if (lastY < sr.top + zone) speed = -Math.ceil((sr.top + zone - lastY) / 5);
        else if (lastY > sr.bottom - zone) speed = Math.ceil((lastY - (sr.bottom - zone)) / 5);
        if (speed) { scroller.scrollTop += Math.max(-24, Math.min(24, speed)); place(); }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      function onMove(ev) { lastX = ev.clientX; lastY = ev.clientY; place(); }

      function end(commit) {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        cancelAnimationFrame(raf);
        row.classList.remove('dragging');
        list.classList.remove('dragging');
        row.style.transform = '';
        if (line.parentNode) line.parentNode.removeChild(line);
        list.querySelectorAll(o.groupSel + '.' + o.targetClass).forEach(function (g) { g.classList.remove(o.targetClass); });
        var t0 = target;
        target = null;
        if (!commit || !t0) return;
        if (t0.same) {
          var rows = Array.prototype.filter.call(o.wrap.children, function (el) { return el.matches(o.rowSel); });
          var from = rows.indexOf(row);
          if (from === t0.index) return;   // même place
          var ordered = rows.slice();
          ordered.splice(from, 1);
          ordered.splice(t0.index, 0, row);
          ordered.forEach(function (el) { o.wrap.appendChild(el); });
          o.onReorder(ordered);
        } else {
          o.onMoveTo(t0.wrap, t0.index);
        }
      }
      function onUp() { end(true); }
      function onCancel() { end(false); }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onCancel);
    });
  }
  // Épingle (trombone) commune (R39, 28 oct. 2026) : même icône que les discussions (.chatAttachBtn), sans cadre (R37), zone de toucher
  // 44 px ; ouvre le sélecteur du système (ordinateur ; téléphone : fichiers, photos, appareil photo) avec les mêmes types partout.
  // onFiles(Array<File>) reçoit le choix ; opts.multiple, opts.label.
  var ATTACH_ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.xlsx,.docx,.pdf,text/*,image/*';
  var CLIP_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  function attachBtn(onFiles, opts) {
    opts = opts || {};
    var lab = document.createElement('label');
    lab.className = 'chatAttachBtn';
    lab.setAttribute('aria-label', opts.label || 'Joindre un fichier'); lab.title = opts.label || 'Joindre un fichier';
    lab.innerHTML = CLIP_SVG;
    var input = document.createElement('input');
    input.type = 'file'; input.className = 'hidden'; input.accept = ATTACH_ACCEPT; input.multiple = !!opts.multiple;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length) onFiles(files);
    });
    lab.appendChild(input);
    return lab;
  }
  ui.attachBtn = attachBtn;
  ui.ATTACH_ACCEPT = ATTACH_ACCEPT;
  ui.groupDrag = groupDrag;
  root.TMT.ui = Object.assign(root.TMT.ui || {}, ui);
})();
