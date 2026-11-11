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
  // Indicateur de chargement (R48) : le N en vague ; avec phrase = page ou zone, sans (opts.seul) = à la place d'un texte. La phrase est définie ICI, une seule fois.
  var LOADER_PHRASE = 'Noèsis s’en occupe…';
  var LOADER_POLYS = ['183,293 287,461 287,616 183,675', '287,628 287,863 184,863 184,687', '192,262 293,262 468,557 367,555', '374,565 475,568 536,670 536,835', '556,262 616,262 659,286 661,616 556,673', '661,629 662,863 557,863 556,686', '729,151 612,186 635,253 708,287'];
  function loaderHtml(opts) {
    var seul = !!(opts && opts.seul), label = typeof window.t === 'function' ? window.t(LOADER_PHRASE) : LOADER_PHRASE;
    return '<span class="cmpLoader' + (seul ? ' cmpLoaderSeul' : '') + '" role="status" aria-label="' + label + '">'
      + '<svg viewBox="163 131 586 752" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
      + LOADER_POLYS.map(function (p) { return '<polygon points="' + p + '"/>'; }).join('') + '</svg>'
      + (seul ? '' : '<span class="cmpLoaderPhrase">' + label + '</span>') + '</span>';
  }
  function loader(container, opts) {
    var w = document.createElement('span'); w.innerHTML = loaderHtml(opts);
    var el = w.firstChild;
    if (container) container.appendChild(el);
    return { el: el, remove: function () { if (el.parentNode) el.parentNode.removeChild(el); } };
  }
  // Attente (R49) : pendant qu'une opération dure, la zone (page, fenêtre, bloc) disparaît et seul le N reste ; sans rien avant 1 s (ni N, ni disparition : les attentes courtes ne clignotent pas).
  // attente(zone ou [zones], promesse) rend la même promesse ; un seul composant pour toutes les attentes de l'app.
  function attente(zones, p) {
    var list = [].concat(zones).filter(Boolean), ls = list.map(function (z) { z.classList.add('cmpAttente'); return loader(z, { seul: true }); });
    function fin() { list.forEach(function (z, i) { z.classList.remove('cmpAttente'); ls[i].remove(); }); }
    return Promise.resolve(p).then(function (v) { fin(); return v; }, function (e) { fin(); throw e; });
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
    loader: loader, loaderHtml: loaderHtml, attente: attente,
    removeBtn: function (onClick, label) { return btn('cmpRemove', label || 'Retirer', onClick); },
    editBtn: function (onClick, label) { var b = btn('cmpEdit', label || 'Modifier', onClick); b.innerHTML = EDIT_SVG; return b; },
    addBtn: function (label, onClick) {
      var b = btn('cmpAdd', '', onClick);
      var p = document.createElement('b'); p.textContent = '+';
      b.appendChild(p); b.appendChild(document.createTextNode(label));
      return b;
    },
    // Menu « ⋯ » (8 nov. 2026, demande d'Émilien) : petit bouton à trois points et son menu en verre (.statsPeriodMenu, posé sur la page par le mécanisme ci-dessous).
    // items : [{ label, danger, onClick }]. Un seul composant pour tout ce qui se règle sur une ligne (membres d'une activité…).
    dotsMenu: function (label, items) {
      var wrap = document.createElement('div'); wrap.className = 'statsPeriodMenuWrap cmpDots';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'menuBtn'; b.textContent = '⋯'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-label', label || 'Paramètres');
      var menu = document.createElement('div'); menu.className = 'statsPeriodMenu hidden';
      items.forEach(function (it) {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'statsPeriodMenuItem' + (it.danger ? ' danger' : ''); x.textContent = it.label;
        x.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.add('hidden'); it.onClick(); });
        menu.appendChild(x);
      });
      b.addEventListener('click', function (e) {
        e.stopPropagation(); var open = menu.classList.contains('hidden');
        document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
        if (open) menu.classList.remove('hidden');
      });
      wrap.appendChild(b); wrap.appendChild(menu);
      return wrap;
    },
    chev: function (open) { var s = document.createElement('span'); s.className = 'cmpChev' + (open ? ' open' : ''); s.setAttribute('aria-hidden', 'true'); return s; },
    // Petit bouton de statut (S46, P12…) à 3 états colorés : vert (atteint) / jaune (partiel) / rouge (non atteint) ; `state` null = transparent (à venir ou sans tâche, aucun fond, jamais de gris plein).
    // Un clic fait tourner vert -> jaune -> rouge -> vert (onClick reçoit l'état suivant) ; sans état il ne fait rien. Composant unique (.cmpStatus) pour les périodes ET les semaines.
    statusBtn: function (label, state, onClick) {
      var cls = { atteint: 'ok', partiel: 'mid', non_atteint: 'bad' }, order = ['atteint', 'partiel', 'non_atteint'];
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cmpStatus' + (cls[state] ? ' cmpStatus--' + cls[state] : ''); b.textContent = label;
      if (!cls[state] || !onClick) b.setAttribute('aria-disabled', 'true'); // sans état ou sans action : affichage seul
      b.addEventListener('click', function (e) { e.stopPropagation(); if (cls[state] && onClick) onClick(order[(order.indexOf(state) + 1) % 3]); });
      return b;
    },
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
  // Appui long + glisser-déposer SUR une cible (R27/R29 ; même technique que groupDrag : pointer events, ligne tirée en transform seulement, défilement automatique en bord de zone).
  // Appui long (o.holdMs, 500 ms par défaut) sans bouger -> la ligne se détache et suit le doigt ; un mouvement avant la fin de l'appui = défilement normal, rien ne se passe.
  // Relâché sur une ligne cible (o.targetSel, hors la ligne tirée) -> o.onDrop(ligneCible) ; sur o.zone() (zone « Délier » transitoire) -> o.onZone() ; ailleurs = annulé.
  // o : { onHoldRelease (appui long relâché sans déplacement), list, scroller, hscroller, insets() -> {top, bottom}, onHold (appui long sans glisser), targetSel, isInvalid(ligneCible) -> bool, onStart, onEnd, onDrop, onInvalid, zone() -> élément ou null, onZone, holdMs, draggingClass, targetClass, badClass, zoneOverClass }.
  function holdDrag(row, o) {
    var maxScroll = 0, timer = 0, active = false, sx = 0, sy = 0, lastX = 0, lastY = 0, pid = null, startScroll = 0, raf = 0, target = null, overZone = false, scroller = null, justDragged = 0;
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Glisser actif : le geste appartient à la carte tirée, jamais au balayage de page (pagers : stats-avance.js, page 2) ni au défilement natif.
    row.addEventListener('touchmove', function (e) { if (active) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } }, { passive: false });
    row.addEventListener('click', function (e) { if (Date.now() - justDragged < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
    var val = function (x) { return typeof x === 'function' ? x() : x; };
    function targets() { var l = val(o.list); return Array.prototype.slice.call(l.querySelectorAll(o.targetSel)).filter(function (el) { return el !== row; }); }
    function compute() {
      var z = val(o.zone), zr = z && z.getBoundingClientRect();
      overZone = !!(zr && lastX >= zr.left && lastX <= zr.right && lastY >= zr.top && lastY <= zr.bottom);
      if (z && o.zoneOverClass) z.classList.toggle(o.zoneOverClass, overZone);
      var hit = null;
      if (!overZone) targets().forEach(function (el) { var r = el.getBoundingClientRect(); if (lastY >= r.top && lastY <= r.bottom && lastX >= r.left && lastX <= r.right) hit = el; }); // les deux axes : les cibles peuvent être en colonnes
      targets().forEach(function (el) { el.classList.toggle(o.targetClass, el === hit && !(o.isInvalid && o.isInvalid(el))); });
      target = hit;
    }
    var hs = null, startLeft = 0, maxLeft = 0;
    function place() { row.style.transform = 'translate(' + (lastX - sx + (hs ? hs.scrollLeft - startLeft : 0)) + 'px,' + (lastY - sy + scroller.scrollTop - startScroll) + 'px)'; compute(); }
    function tick() {
      // Défilement automatique : fenêtre visible (page entière = le viewport, pas la hauteur du document), réduite des bandeaux fixes (o.insets() -> {top, bottom}) ; o.hscroller : défilement horizontal.
      var isDoc = scroller === document.documentElement || scroller === document.scrollingElement, r = isDoc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect(), ins = (o.insets && o.insets()) || {}, zone = 60, speed = 0, hspeed = 0;
      var top = r.top + (ins.top || 0), bottom = r.bottom - (ins.bottom || 0);
      if (lastY < top + zone) speed = -Math.ceil((top + zone - lastY) / 5); else if (lastY > bottom - zone) speed = Math.ceil((lastY - (bottom - zone)) / 5);
      if (hs && !overZone) { var hr = hs.getBoundingClientRect(); if (lastX < hr.left + 40) hspeed = -Math.ceil((hr.left + 40 - lastX) / 3); else if (lastX > hr.right - 40) hspeed = Math.ceil((lastX - (hr.right - 40)) / 3); }
      if (hspeed) { hs.scrollLeft = Math.max(0, Math.min(maxLeft, hs.scrollLeft + Math.max(-20, Math.min(20, hspeed)))); place(); }
      if (speed && !overZone) { scroller.scrollTop = Math.max(0, Math.min(maxScroll, scroller.scrollTop + Math.max(-20, Math.min(20, speed)))); place(); } // jamais au-delà de la fin réelle de la liste (la ligne tirée allonge la zone défilante) // pas de défilement quand le doigt est sur la zone de dépôt
      raf = requestAnimationFrame(tick);
    }
    function start() {
      active = true; scroller = val(o.scroller) || val(o.list); startScroll = scroller.scrollTop; maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      hs = val(o.hscroller) || null; startLeft = hs ? hs.scrollLeft : 0; maxLeft = hs ? Math.max(0, hs.scrollWidth - hs.clientWidth) : 0;
      try { row.setPointerCapture(pid); } catch (e) { /* le geste continue sans capture */ }
      row.classList.add(o.draggingClass); if (o.onStart) o.onStart();
      if (o.isInvalid) targets().forEach(function (el) { el.classList.toggle(o.badClass, !!o.isInvalid(el)); });
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
      raf = requestAnimationFrame(tick);
    }
    function finish(commit) {
      clearTimeout(timer); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel);
      if (!active) return;
      cancelAnimationFrame(raf); active = false; justDragged = Date.now();
      var t0 = target, z0 = overZone, bad = t0 && o.isInvalid && o.isInvalid(t0);
      row.style.transform = ''; row.classList.remove(o.draggingClass);
      targets().forEach(function (el) { el.classList.remove(o.targetClass); el.classList.remove(o.badClass); });
      var z = val(o.zone); if (z && o.zoneOverClass) z.classList.remove(o.zoneOverClass);
      target = null; overZone = false;
      if (o.onEnd) o.onEnd();
      if (!commit) return;
      if (z0 && o.onZone) o.onZone(); else if (t0 && bad) { if (o.onInvalid) o.onInvalid(t0); } else if (t0 && o.onDrop) o.onDrop(t0);
      else if (!t0 && !z0 && o.onHoldRelease && Math.hypot(lastX - sx, lastY - sy) < 14) o.onHoldRelease(); // appui long relâché sur place : l'action « détail » (le glisser reste le geste de maintien puis déplacement)
    }
    function onMove(e) {
      if (e.pointerId !== pid) return;
      if (!active) { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { clearTimeout(timer); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel); } return; }
      lastX = e.clientX; lastY = e.clientY; place();
    }
    function onUp(e) { if (e.pointerId === pid) finish(true); }
    function onCancel(e) { if (e.pointerId === pid) finish(false); }
    row.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || active || (o.ignoreSel && e.target.closest(o.ignoreSel))) return;
      pid = e.pointerId; sx = lastX = e.clientX; sy = lastY = e.clientY;
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onCancel);
      clearTimeout(timer); timer = setTimeout(o.onHold ? function () { // appui long SANS glisser (carte fusionnée) : o.onHold() à la place du glisser
        document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel); justDragged = Date.now(); o.onHold();
      } : start, o.holdMs || 500);
    });
  }
  // Épingle (trombone) commune (R39, 28 oct. 2026) : même icône que les discussions (.chatAttachBtn), sans cadre (R37), zone de toucher
  // 44 px ; ouvre le sélecteur du système (ordinateur ; téléphone : fichiers, photos, appareil photo) avec les mêmes types partout.
  // onFiles(Array<File>) reçoit le choix ; opts.multiple, opts.label.
  var ATTACH_ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.xlsx,.docx,.pdf,text/*,image/*';
  var CLIP_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  // opts.choices (4 nov. 2026) : l'épingle ouvre un petit menu — Photothèque, Prendre une photo (appareil), Choisir un fichier (documents) — au lieu d'un seul sélecteur.
  function attachMenu(onFiles, opts) {
    var wrap = document.createElement('span'); wrap.className = 'statsPeriodMenuWrap attachMenuWrap';
    var b = document.createElement('button'); b.type = 'button'; b.className = opts.className || 'chatAttachBtn'; b.innerHTML = CLIP_SVG;
    b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', opts.label || 'Joindre un fichier'); b.title = opts.label || 'Joindre un fichier';
    var menu = document.createElement('div'); menu.className = 'statsPeriodMenu hidden';
    var L = opts.labels || {};
    [[L.library || 'Photothèque', 'image/*', false], [L.camera || 'Prendre une photo', 'image/*', true], [L.file || 'Choisir un fichier', '.txt,.md,.markdown,.csv,.docx,.pdf', false]].forEach(function (c) {
      var input = document.createElement('input'); input.type = 'file'; input.className = 'hidden'; input.accept = c[1]; input.multiple = !!opts.multiple; if (c[2]) input.setAttribute('capture', 'environment');
      input.addEventListener('change', function () { var files = Array.prototype.slice.call(input.files || []); input.value = ''; if (files.length) onFiles(files); });
      var it = document.createElement('button'); it.type = 'button'; it.className = 'statsPeriodMenuItem'; it.textContent = c[0];
      it.addEventListener('click', function () { menu.classList.add('hidden'); b.setAttribute('aria-expanded', 'false'); input.click(); });
      menu.appendChild(it); menu.appendChild(input);
    });
    b.addEventListener('click', function (e) {
      e.stopPropagation(); var open = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (open) menu.classList.remove('hidden'); b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.appendChild(b); wrap.appendChild(menu);
    return wrap;
  }
  function attachBtn(onFiles, opts) {
    opts = opts || {};
    if (opts.choices) return attachMenu(onFiles, opts);
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
  // Barre d'écriture fixée en bas (.tasksDock : « Nouvelle tâche… », « Nouvel objectif… ») : clavier ouvert (classe kbOpen), elle se pose juste au-dessus du clavier
  // (visualViewport), et revient à sa place normale, au-dessus des volets, à la fermeture. UN seul code pour toutes les barres de ce type.
  function dockKeyboard(dock, field) {
    var raf = null, stop = 0;
    function sync() {
      var vv = root.visualViewport;
      if (!dock || !vv) return;
      dock.style.setProperty('--dock-vh', Math.round(vv.height) + 'px'); // hauteur réellement visible : borne le panneau posé au-dessus de la barre
      if (document.documentElement.classList.contains('kbOpen')) dock.style.bottom = (Math.max(0, root.innerHeight - (vv.offsetTop + vv.height)) + 8) + 'px';
      else dock.style.bottom = '';
    }
    function loop() { sync(); if (Date.now() < stop || dock.contains(document.activeElement) || document.documentElement.classList.contains('kbOpen')) raf = root.requestAnimationFrame(loop); else raf = null; }
    function watch() { stop = Date.now() + 800; if (!raf) raf = root.requestAnimationFrame(loop); }
    if (root.visualViewport) { root.visualViewport.addEventListener('resize', watch); root.visualViewport.addEventListener('scroll', watch); }
    dock.addEventListener('focusin', watch); dock.addEventListener('focusout', watch); field.addEventListener('focus', watch); field.addEventListener('blur', watch);
  }
  ui.dockKeyboard = dockKeyboard;
  ui.attachBtn = attachBtn;
  ui.ATTACH_ACCEPT = ATTACH_ACCEPT;
  ui.groupDrag = groupDrag;
  ui.holdDrag = holdDrag;
  // Repère de couleur du module Horaire (30 oct. 2026) : dans Paramètres | Création des horaires (.horaireCats), l'option de droite
  // active passe le violet et le halo au bleu roi (classe modeCreation sur <html>, jetons dans composants.css) ; l'option de gauche les remet en violet.
  function syncModeClair() {
    var de = document.documentElement, on = false;
    document.querySelectorAll('.cmpSeg.horaireCats').forEach(function (s) {
      if (on || s.children.length !== 2 || !s.offsetParent) return;
      var r = s.children[1];
      on = r.classList.contains('active') || r.classList.contains('on') || r.getAttribute('aria-pressed') === 'true' || r.getAttribute('aria-selected') === 'true';
    });
    de.classList.toggle('modeCreation', on);
  }
  if (typeof MutationObserver === 'function' && root.document) {
    var pending = 0;
    var schedule = function () { if (pending) return; pending = setTimeout(function () { pending = 0; syncModeClair(); }, 30); };
    var start = function () { new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected', 'hidden'] }); schedule(); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  // Fenêtres Expansion (achat #offer1CheckoutModal, utilisation #docTasksPage) : tant que l'une est ouverte, la page passe au blanc rosé (classe modeExpansionWin) avec le même fondu.
  if (typeof MutationObserver === 'function' && root.document) {
    var WIN_IDS = ['offer1CheckoutModal', 'docTasksPage'], winTimer = null;
    var syncWin = function () {
      var open = WIN_IDS.some(function (id) { var e = document.getElementById(id); return e && !e.classList.contains('hidden'); });
      document.documentElement.classList.toggle('modeExpansionWin', open);
    };
    // Un seul observateur sur toute la page (les fenêtres peuvent être créées après le chargement) : toute ouverture ou fermeture de l'une d'elles est vue.
    var startWin = function () { new MutationObserver(function () { clearTimeout(winTimer); winTimer = setTimeout(syncWin, 30); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); syncWin(); };
    if (document.body) startWin(); else document.addEventListener('DOMContentLoaded', startWin);
  }
  // Balayage des navigations par flèches (R46) : un balayage horizontal d'un .cmpNav (≥ 60 px, plus horizontal que vertical) actionne sa flèche › (vers la gauche)
  // ou ‹ (vers la droite), donc la MÊME fonction que le clic ; une flèche désactivée ne fait rien. Un seul écouteur pour tous les .cmpNav, présents ou futurs.
  if (root.document && !root.TMT.cmpNavSwipe) {
    root.TMT.cmpNavSwipe = true;
    var sx = null, sy = null, snav = null;
    document.addEventListener('touchstart', function (e) {
      snav = null;
      if (e.touches.length === 1 && e.target.closest) {
        var zn = e.target.closest('.cmpNav, [data-cmpnav-for]');
        snav = zn && (zn.classList.contains('cmpNav') ? zn : document.querySelector(zn.getAttribute('data-cmpnav-for')));
      }
      if (snav) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; e.stopPropagation(); } // le balayage de page ne reçoit pas ce toucher
    }, { passive: true, capture: true });
    document.addEventListener('touchend', function (e) {
      var nav = snav; snav = null;
      if (!nav || sx == null) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = sy = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
      var arrows = nav.querySelectorAll('.cmpNavArrow');
      if (arrows.length < 2) return;
      arrows[dx < 0 ? arrows.length - 1 : 0].click();
    }, { passive: true, capture: true });
  }
  // Menus ⋮ (.statsPeriodMenu, 8 nov. 2026, demande d'Émilien) : à l'ouverture, le menu est posé sur la page (position fixe, au même
  // endroit) pour passer au-dessus de toutes les sections et que son verre floute vraiment ce qu'il recouvre (dans une carte en verre, le
  // flou ne voit que la carte) ; il suit son bouton au défilement et revient à sa place à la fermeture. Un seul mécanisme pour toute l'app.
  var floating = [];
  function liftMenu(m) {
    var r = m.getBoundingClientRect();
    if (!r.width || !m.parentNode) return;
    var a = m.parentNode.getBoundingClientRect();
    m._home = { parent: m.parentNode, prev: m.previousSibling, next: m.nextSibling, top: r.top, left: r.left, aTop: a.top, aLeft: a.left };
    m.classList.add('cmpMenuFloat');
    m.style.top = r.top + 'px'; m.style.left = r.left + 'px'; m.style.width = r.width + 'px';
    document.body.appendChild(m);
    floating.push(m);
  }
  function landMenu(m) {
    var h = m._home; m._home = null;
    floating = floating.filter(function (x) { return x !== m; });
    m.classList.remove('cmpMenuFloat'); m.style.top = ''; m.style.left = ''; m.style.width = '';
    if (h.prev && h.prev.parentNode === h.parent) h.parent.insertBefore(m, h.prev.nextSibling);
    else if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(m, h.next);
    else if (!h.prev && !h.next && h.parent.isConnected) h.parent.appendChild(m);
    else m.remove();
  }
  function followMenus() {
    floating.forEach(function (m) {
      var h = m._home, a = h.parent.getBoundingClientRect();
      m.style.top = (h.top + a.top - h.aTop) + 'px'; m.style.left = (h.left + a.left - h.aLeft) + 'px';
    });
  }
  // Vrai si `box` contient un menu ⋮ ouvert, à sa place ou posé sur la page.
  ui.menuOpenIn = function (box) {
    return !!(box && (box.querySelector('.statsPeriodMenu:not(.hidden)') || floating.some(function (m) { return box.contains(m._home.parent); })));
  };
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (list) {
      list.forEach(function (mu) {
        var m = mu.target;
        if (!m.classList || !m.classList.contains('statsPeriodMenu')) return;
        if (m.classList.contains('hidden')) { if (m._home) landMenu(m); } else if (!m._home) liftMenu(m);
      });
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('scroll', function () { if (floating.length) followMenus(); }, true);
    window.addEventListener('resize', function () { if (floating.length) followMenus(); });
  }
  root.TMT.ui = Object.assign(root.TMT.ui || {}, ui);
})();
