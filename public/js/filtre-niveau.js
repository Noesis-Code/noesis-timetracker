/* Noèsis — Filtre de niveau (20 nov. 2026) : le bouton « Tous » + panneau Activités › Pôles › Secteurs.
 * UN SEUL composant, repris tel quel du filtre de Tâches (aujourdhui.js) : Tâches et Bilan l'utilisent tous les deux.
 * TMT.scopeFilter.paint(box, ctx) dessine le bouton (et le panneau s'il est ouvert) dans box.
 * ctx : view {open, browse, pole, page} (état d'ouverture, tenu par l'appelant), filt() (choix courant { act, pole, poleLabel, sector, sectorKey }),
 *       data(actId) → { acts, poles, secs }, poleColor(actId, poleKey), apply(next) (choix final : ferme le panneau), set(next) + refresh() (pôle appliqué tout de suite, panneau ouvert),
 *       repaint() (redessine), onOpen() (relit la structure à l'ouverture). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function dotEl(color) { var d = el('span', 'tasksDot'); if (color) d.style.background = color; return d; }
  function filtRow(parent, text, level, on, fn, color) {
    var b = el('button', 'tasksChoice' + (level ? ' lv' + level : '') + (on ? ' on' : ''), text); b.type = 'button'; if (color) b.insertBefore(dotEl(color), b.firstChild); b.addEventListener('click', fn); parent.appendChild(b); return b;
  }
  function paint(box, ctx) {
    var v = ctx.view;
    if (!box._sfBound) {
      box._sfBound = true;
      document.addEventListener('click', function (e) { /* une ligne retirée du DOM par le redessin du panneau n'est pas un toucher dehors */ if (ctx.view.open && e.target.isConnected && !box.contains(e.target)) { ctx.view.open = false; ctx.view.browse = null; ctx.view.pole = null; ctx.view.page = 0; ctx.repaint(); } });
    }
    var F = ctx.filt();
    box.textContent = '';
    var d = ctx.data(F.act), cur = d.acts.filter(function (a) { return String(a.id) === F.act; })[0], pole = d.poles.filter(function (p) { return p.key === F.pole; })[0];
    var label = cur ? cur.name + (F.pole != null && (pole || F.poleLabel) ? ' › ' + (F.sector || (pole ? pole.label : F.poleLabel)) : '') : tr('Toutes les activités');
    var head = el('button', 'caSubProjectBtn tasksFilterBtn' + (cur ? ' on' : '')); head.type = 'button'; head.setAttribute('aria-expanded', v.open ? 'true' : 'false');
    head.title = label; head.setAttribute('aria-label', label); var hl = el('span', null, cur ? (F.pole != null && (pole || F.poleLabel) ? (F.sector || (pole ? pole.label : F.poleLabel)) : cur.name) : tr('Tous')); var hc = F.sector && cur ? ctx.poleColor(F.act, F.pole) : null; if (hc) hl.style.color = hc; head.appendChild(hl); // un secteur choisi : ses lettres prennent la couleur de son pôle (sans pastille) // le bouton porte le nom du secteur, sinon du pôle, sinon de l'activité // même bouton que le filtre des statistiques : « Tous » (ou l'activité) + flèche qui change de sens ; il désigne seulement l'activité
    head.addEventListener('click', function (e) { e.stopPropagation(); v.open = !v.open; v.browse = null; v.pole = null; v.page = 0; ctx.repaint(); if (v.open) ctx.onOpen(); }); // la structure (ordre et couleurs des pôles) est relue à chaque ouverture : elle suit l'arbre et les réglages de l'activité
    box.appendChild(head);
    if (!v.open) return;
    var panel = el('div', 'tasksFilterPanel cmpGlass'), track = el('div', 'tasksFilterTrack'), p1 = el('div', 'tasksFilterPage'), p2 = el('div', 'tasksFilterPage'), p3 = el('div', 'tasksFilterPage'), pages = [p1, p2, p3];
    filtRow(p1, tr('Tous'), 0, F.act == null, function () { ctx.apply({ act: null, pole: null, sector: null }); });
    d.acts.forEach(function (a) {
      var b = filtRow(p1, a.name, 0, String(a.id) === F.act, function () { v.browse = String(a.id); v.pole = F.act === v.browse ? F.pole : null; paintFilterPage2(); go(1); }, a.color || '#9C8CC8');
      b.appendChild(el('span', 'tasksFilterArrow', '›'));
    });
    track.appendChild(p1); track.appendChild(p2); track.appendChild(p3); panel.appendChild(track); box.appendChild(panel);
    // Page 2 : les pôles de l'activité (ni son nom ni les autres activités). Choisir un pôle l'applique aussitôt ; s'il a des secteurs, la page glisse vers eux (page 3), où en choisir un reste facultatif.
    function paintFilterPage2() {
      var a = d.acts.filter(function (x) { return String(x.id) === v.browse; })[0]; if (!a) return;
      var dd = ctx.data(v.browse); p2.textContent = '';
      filtRow(p2, tr('Toute l’activité'), 0, F.act === v.browse && F.pole == null, function () { ctx.apply({ act: v.browse, pole: null, sector: null }); });
      dd.poles.forEach(function (p) {
        var secs = dd.secs[p.key] || [];
        var pr = filtRow(p2, p.label, 0, F.act === v.browse && F.pole === p.key && !F.sector, function () {
          if (!secs.length) { ctx.apply({ act: v.browse, pole: p.key, poleLabel: p.label, sector: null }); return; }
          v.pole = p.key; ctx.set({ act: v.browse, pole: p.key, poleLabel: p.label, sector: null }); F = ctx.filt(); v.page = 2; // d'abord la page des secteurs : le rendu ci-dessous peut redessiner le panneau
          paintFilterPage3(); go(2);
          ctx.refresh(); // le pôle s'applique tout de suite ; le panneau reste ouvert
        }, ctx.poleColor(v.browse, p.key));
        pr.classList.add('pole');
        if (secs.length) pr.appendChild(el('span', 'tasksFilterArrow', '›'));
      });
    }
    function paintFilterPage3() {
      var dd = ctx.data(v.browse), p = dd.poles.filter(function (q) { return q.key === v.pole; })[0]; if (!p) return; p3.textContent = '';
      filtRow(p3, tr('Tout le pôle'), 0, F.act === v.browse && F.pole === p.key && !F.sector, function () { ctx.apply({ act: v.browse, pole: p.key, poleLabel: p.label, sector: null }); });
      var pc3 = ctx.poleColor(v.browse, p.key);
      (dd.secs[p.key] || []).forEach(function (x) { var sr = filtRow(p3, x.label, 0, F.act === v.browse && F.pole === p.key && F.sector === x.label, function () { ctx.apply({ act: v.browse, pole: p.key, poleLabel: p.label, sector: x.label, sectorKey: x.key }); }); if (pc3) sr.style.color = pc3; }); // lettres de la couleur du pôle, sans pastille
    }
    var page = 0;
    function size() { panel.style.height = (pages[page].offsetHeight + 8) + 'px'; }
    function vis() { pages.forEach(function (pg, i) { pg.style.visibility = i === page ? '' : 'hidden'; pg.style.opacity = i === page ? '' : '0'; }); }
    function go(n) { page = v.page = n; pages.forEach(function (pg) { pg.style.visibility = ''; }); pages.forEach(function (pg, i) { pg.style.opacity = i === n ? '' : '0'; }); // la page qui part s'efface aussitôt
      track.style.transform = 'translateX(' + (-n * 100 / 3) + '%)'; size(); if (n < 2) v.pole = null; if (!n) v.browse = null; window.setTimeout(function () { if (page === n) vis(); }, 280); }
    if (v.browse) { paintFilterPage2(); page = v.page; if (page === 2 && v.pole) paintFilterPage3(); else page = v.page = 1; track.style.transition = 'none'; track.style.transform = 'translateX(' + (-page * 100 / 3) + '%)'; window.requestAnimationFrame(function () { track.style.transition = ''; }); }
    vis(); window.requestAnimationFrame(size);
    // Balayage vers la droite sur le panneau = page précédente (le geste ne change pas de page de l'application).
    var x0 = 0, y0 = 0;
    panel.addEventListener('touchstart', function (e) { e.stopPropagation(); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    panel.addEventListener('touchend', function (e) {
      e.stopPropagation(); var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (page > 0 && dx > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(page - 1);
    }, { passive: true });
  }
  // Couleur d'un pôle : nuance standard de l'activité (même règle que Chrono et les statistiques). struct = { activityId: [{ key, label, shadeRank, secteurs }] }.
  function poleColor(struct, actId, key) {
    var a = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (x) { return String(x.id) === String(actId); })[0], st = struct && struct[String(actId)], p = st && st.filter(function (q) { return q.key === key; })[0];
    return a && a.color && p && p.shadeRank != null && TMT.poleColor ? (TMT.poleColor(a.color, p.shadeRank) || a.color) : (a && a.color) || '';
  }
  // Activités, pôles et secteurs lus dans la structure seule (écrans sans liste de tâches, comme le Bilan).
  function structData(struct, actId) {
    var acts = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return a && a.id != null; }), poles = [], secs = {}, st = struct && actId != null ? struct[String(actId)] : null;
    (st || []).forEach(function (p) { poles.push({ key: p.key, label: p.label || p.key, idx: poles.length }); secs[p.key] = (p.secteurs || []).map(function (x) { return { label: x.label, key: x.key || null }; }); });
    return { acts: acts, poles: poles, secs: secs };
  }
  TMT.scopeFilter = { paint: paint, poleColor: poleColor, structData: structData };
})();
