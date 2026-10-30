/* Page 1 de la Feuille de route, vue « Aujourd'hui » (27 oct. 2026, demande d'Émilien ; remplace le bouton flottant) : tâches du jour de toutes les
 * activités (à cocher : cercle rempli + coche, barrée et grisée, puis descend dans « Faites aujourd'hui »), puis la barre « Ajouter une tâche ».
 * Ajout : Noèsis PROPOSE « Activité › Pôle » (POST /api/goals/capture/propose, ne crée rien) ; la flèche ↑ accepte, « Changer » choisit ailleurs ;
 * l'envoi suit la même chaîne que l'ancienne bulle de la page 1 (TMT.captureTaskFlow : pop-up selon le mode de l'IA).
 * Données : GET /api/goals/today. Monté par objectifs-page1.js (TMT.todayView.mount / show / hide). */
(function () {
  'use strict';
  var TMT = window.TMT;
  if (!TMT) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var PROPOSE_MS = 900, MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(d, sw, ring) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', String(sw || 1.8)); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (ring) { var c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '11'); s.appendChild(c); }
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  function minutesLabel(m) {
    m = Math.max(0, Math.round(m || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return r ? h + ' h ' + (r < 10 ? '0' : '') + r : h + ' h';
  }
  function localIso() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  var dayOff = 0; // 0 = aujourd'hui, +1 = demain, -1 = hier…
  // Affichage instantané (29 oct. 2026, demande d'Émilien) : la dernière réponse de chaque jour est gardée (mémoire ; aujourd'hui aussi en stockage local,
  // pour le premier affichage après ouverture de l'app) et dessinée tout de suite ; la réponse du serveur la remplace ensuite.
  var cacheByDay = {}, CACHE_KEY = 'noesis_today_v1';
  function cacheUser() { try { var p = TMT.getProfile && TMT.getProfile(); return p && p.id ? String(p.id) : ''; } catch (e) { return ''; } }
  function cacheGet(day) {
    if (cacheByDay[day]) return cacheByDay[day];
    if (day !== localIso()) return null;
    try { var s = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (s && s.u && s.u === cacheUser() && s.d === day && s.data) return (cacheByDay[day] = s.data); } catch (e) {}
    return null;
  }
  function cachePut(day, d) {
    cacheByDay[day] = d;
    if (day === localIso() && cacheUser()) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ u: cacheUser(), d: day, data: d })); } catch (e) {} }
  }
  function dayDate() { var d = new Date(); d.setDate(d.getDate() + dayOff); return d; }
  function dayIso() { var d = dayDate(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function todayLabel() {
    var s = dayDate().toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- Pop-up ----------
  var listBox = null, sumL = null, sumR = null, timer = null, loadSeq = 0;
  var ui = {}; // éléments de la barre d'ajout
  var state = { added: [], proposal: null, options: [], choice: null, proposedFor: '', files: [], busy: false, seq: 0, debounce: null, date: null, who: null, poleId: null, open: '', members: {}, flash: null, exp: null, essor: null, expStep: 0, review: false };

  var root = null, shown = false, dock = null;
  // La barre n'existe à l'écran que si la vue Aujourd'hui est réellement visible (autre volet, autre vue ou page par-dessus : masquée).
  function syncDock() { if (dock) dock.classList.toggle('hidden', !(shown && root && root.getClientRects().length)); }
  function build(container) {
    root = el('div', 'tasksToday');
    var head = el('div', 'tasksTodayHead cmpNav cmpNav--sm');
    // Jour affiché au centre, flèches de part et d'autre (même modèle que le sélecteur de pôle, en plus petit) : demain, après-demain, hier…
    var prev = el('button', 'cmpNavArrow', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr('Jour précédent'));
    var next = el('button', 'cmpNavArrow', '›'); next.type = 'button'; next.setAttribute('aria-label', tr('Jour suivant'));
    ui.dayLabel = el('span', 'cmpNavLabel', todayLabel());
    function go(n) { dayOff += n; ui.dayLabel.textContent = todayLabel(); state.added = []; var c = cacheGet(dayOff ? dayIso() : localIso()); if (c) render(c); refresh(); }
    prev.addEventListener('click', function () { go(-1); }); next.addEventListener('click', function () { go(1); });
    head.appendChild(prev); head.appendChild(ui.dayLabel); head.appendChild(next);
    var sum = el('div', 'tasksPopSum'); sumL = el('span'); sumR = el('span'); sum.appendChild(sumL); sum.appendChild(sumR);
    listBox = el('div', 'tasksPopList');
    root.appendChild(head); root.appendChild(sum); root.appendChild(listBox);
    // La barre d'ajout est AU PREMIER PLAN, fixée au-dessus de la barre des volets (comme elle). Défilé = glissement latéral entre les pages :
    // elle prend le même décalage que la page (#tab-goals) pendant le glissement, puis disparaît avec elle.
    dock = buildAdd(); dock.classList.add('tasksDock', 'hidden'); document.body.appendChild(dock);
    var tab = document.getElementById('tab-goals');
    if (tab && window.MutationObserver) {
      new MutationObserver(function () { dock.style.transform = tab.style.transform || ''; dock.style.transition = tab.style.transition || ''; syncDock(); }).observe(tab, { attributes: true, attributeFilter: ['style', 'class'] }); // fin de glissement vers les statistiques : l'onglet se masque, la barre se masque dans la même image (sans attendre le balayage de 300 ms)
    }
    setInterval(syncDock, 300);
    // Clavier ouvert : la barre se pose juste au-dessus du clavier, en tout temps (et revient à sa place normale, au-dessus des volets, à la fermeture).
    var kbRaf = null, kbStop = 0;
    function syncDockKeyboard() {
      var vv = window.visualViewport;
      if (!dock || !vv) return;
      if (document.documentElement.classList.contains('kbOpen')) {
        var gap = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
        dock.style.bottom = (gap + 8) + 'px';
      } else dock.style.bottom = '';
    }
    function kbLoop() { syncDockKeyboard(); if (Date.now() < kbStop || document.activeElement === ui.text) kbRaf = window.requestAnimationFrame(kbLoop); else kbRaf = null; }
    function kbWatch() { kbStop = Date.now() + 800; if (!kbRaf) kbRaf = window.requestAnimationFrame(kbLoop); }
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', kbWatch); window.visualViewport.addEventListener('scroll', kbWatch); }
    ui.text.addEventListener('focus', kbWatch); ui.text.addEventListener('blur', kbWatch);
    container.appendChild(root);
  }

  // Barre d'ajout : [📎 à gauche] [texte] [↑ flèche d'envoi] ; au-dessus, la proposition de Noèsis.
  function buildAdd() {
    var box = el('div', 'tasksPopAdd');
    ui.proposal = el('div', 'tasksPropose cmpGlass hidden'); // verre commun (R31), comme la barre des volets
    var kick = el('div', 'tasksProposeHead');
    ui.kicker = el('span', 'tasksProposeKicker', tr('Noèsis propose'));
    ui.close = TMT.ui.closeBtn(function () { if (state.exp || state.expStep) reset(); else if (state.review && target() && ui.text.value.trim()) send(); else reset(); }, tr('Fermer')); // ✕ en haut à droite (R13) : enregistre le rangement affiché et l'applique (demande d'Émilien, 30 oct. 2026) ; sans rangement complet, ferme seulement
    kick.appendChild(ui.kicker); kick.appendChild(ui.close);
    ui.body = el('div', 'tasksProposeBody'); // la seule zone qui défile, sous le titre et la ✕ qui restent en place
    ui.fields = el('div', 'tasksFields');
    ui.hint = el('p', 'tasksProposeHint', tr('Rien n’est rangé sans toi : ↑ ou ✕ enregistre ce rangement.'));
    ui.body.appendChild(ui.fields); ui.body.appendChild(ui.hint);
    ui.proposal.appendChild(kick); ui.proposal.appendChild(ui.body);

    var bar = el('div', 'tasksComposer');
    var clip = el('label', 'tasksClip cmpSymbol');
    clip.title = tr('Joindre un document ou une image'); clip.setAttribute('aria-label', tr('Joindre un document ou une image'));
    clip.appendChild(svg('M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48', 2));
    ui.file = el('input', 'hidden'); ui.file.type = 'file'; ui.file.multiple = true;
    ui.file.accept = '.txt,.md,.markdown,.csv,.docx,.pdf,text/*,image/*';
    clip.appendChild(ui.file);
    ui.file.addEventListener('change', onPick);
    ui.text = el('textarea', 'tasksText'); ui.text.rows = 1; ui.text.maxLength = 300; ui.text.placeholder = tr('Ajouter une tâche');
    ui.text.addEventListener('input', onType);
    ui.text.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    ui.send = el('button', 'cmpSend'); ui.send.type = 'button'; ui.send.setAttribute('aria-label', tr('Ajouter'));
    ui.send.addEventListener('mousedown', function (e) { e.preventDefault(); }); // garde le focus : le clavier reste ouvert
    ui.send.addEventListener('click', function () { if (state.longFired) { state.longFired = false; return; } send(); });
    bindLongPress(ui.send);
    ui.send.title = tr('Appui long : demande Expansion');
    bar.appendChild(clip); bar.appendChild(ui.text); bar.appendChild(ui.send);
    ui.exHint = el('p', 'tasksExHint hidden', tr('Appuie longtemps sur ↑ pour utiliser Expansion')); // sous la barre, seulement si le texte parle de générer et qu'une activité a Expansion
    ui.chips = el('div', 'tasksChips'); ui.msg = el('p', 'tasksMsg');
    ui.toast = el('p', 'tasksToast hidden'); ui.toast.setAttribute('role', 'status');
    ui.save = el('button', 'tasksSaveBtn', tr('Enregistrer')); ui.save.type = 'button'; // remplace la zone d'écriture à l'étape 2 d'Expansion (liste des tâches à valider)
    ui.save.addEventListener('click', function () { if (state.exp && !state.exp.loading) runExpansion(); });
    box.appendChild(ui.toast); box.appendChild(ui.proposal); box.appendChild(ui.save); box.appendChild(bar); box.appendChild(ui.chips); box.appendChild(ui.msg); box.appendChild(ui.exHint);
    return box;
  }

  function target() { return state.choice || state.proposal; }
  // « Produit → Interface » : pôle « Produit », secteur « Interface » ; « Privé » : un pôle sans secteur.
  function poleOf(o) { return String(o.categoryLabel || '').split(' → ')[0]; }
  function sectorOf(o) { var p = String(o.categoryLabel || '').split(' → '); return p.length > 1 ? p[1] : ''; }
  function actCount() { var seen = {}, n = 0; state.options.forEach(function (o) { if (!seen[o.activityId]) { seen[o.activityId] = true; n++; } }); return n; }
  function sectorsOfPole(t) { return state.options.filter(function (o) { return t && o.activityId === t.activityId && poleOf(o) === poleOf(t) && sectorOf(o); }); }
  function dateText(iso) {
    if (!iso) iso = dayIso();
    var d = new Date(iso + 'T12:00:00'); var s = d.toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Un champ = libellé + valeur ; un toucher déroule SES choix juste dessous, décalés et reliés au champ par un trait (R36 : la ligne se déroule sur place).
  function fieldRow(key, label, value, locked) {
    var wrap = el('div', 'tasksFieldWrap' + (state.open === key && !locked ? ' open' : ''));
    var row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr(label)));
    var b = el('button', 'tasksFieldValue'); b.type = 'button'; b.disabled = !!locked;
    b.appendChild(el('span', 'tasksFieldText', value));
    if (!locked) { b.setAttribute('aria-expanded', state.open === key ? 'true' : 'false'); b.addEventListener('click', function () { toggleChooser(key); }); }
    row.appendChild(b); wrap.appendChild(row);
    if (state.open === key && !locked) wrap.appendChild(chooserFor(key));
    return wrap;
  }
  // Date : le jour affiché est celui de la tâche (par défaut le jour de la vue) ; on le change dans le champ même, comme l'heure d'un enregistrement du Chrono.
  function dateRow(readOnly) {
    var wrap = el('div', 'tasksFieldWrap'), row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr('Date')));
    if (readOnly) { var v = el('button', 'tasksFieldValue'); v.type = 'button'; v.disabled = true; v.appendChild(el('span', 'tasksFieldText', dateText(state.date))); row.appendChild(v); }
    else {
      var inp = el('input', 'tasksDateInput tasksDateInline'); inp.type = 'date'; inp.value = state.date || dayIso(); inp.setAttribute('aria-label', tr('Date'));
      inp.addEventListener('change', function () { state.date = inp.value || null; });
      row.appendChild(inp);
    }
    wrap.appendChild(row); return wrap;
  }
  function membersOf(activityId) {
    if (state.members[activityId]) return Promise.resolve(state.members[activityId]);
    return TMT.api('GET', '/api/activities/' + activityId + '/goals/members').then(function (d) { return (state.members[activityId] = (d && d.members) || []); }).catch(function () { return []; });
  }
  function paintProposal(readOnly) {
    if (state.exp) { paintExpansion(); return; }
    var t = target(), poleId = t ? t.activityId : state.poleId;
    var poleName = t ? t.activityName : ((state.options.filter(function (o) { return o.activityId === poleId; })[0] || {}).activityName || '');
    ui.proposal.classList.toggle('hidden', !(state.review || state.expStep || readOnly) || (!t && !state.options.length && !readOnly)); // jamais visible pendant l'écriture : seulement après ↑
    ui.kicker.textContent = readOnly ? '✓ ' + tr('Ajoutée') : state.expStep ? tr('Expansion') + ' · ' + tr('Où ranger les tâches') : tr(TMT.aiMode === 'absence' || !t ? 'À ranger' : 'Noèsis propose');
    ui.close.classList.toggle('hidden', !!readOnly);
    if (readOnly) state.open = '';
    ui.fields.textContent = '';
    ui.fields.appendChild(fieldRow('activity', 'Activité', poleName || tr('Choisir'), readOnly || actCount() < 2));
    ui.fields.appendChild(fieldRow('pole', 'Pôle', t ? poleOf(t) : tr('Choisir'), readOnly || !poleId));
    if (!t || sectorsOfPole(t).length) ui.fields.appendChild(fieldRow('secteur', 'Secteur', t && sectorOf(t) ? sectorOf(t) : tr('Choisir'), readOnly || !t));
    if (!state.expStep) ui.fields.appendChild(dateRow(readOnly)); // étape 1 d'Expansion : seulement le pôle et le secteur
    if (!state.expStep && poleId && state.members[poleId] && state.members[poleId].length > 1) ui.fields.appendChild(fieldRow('who', 'Responsable', state.who ? state.who.name : '—', readOnly));
    ui.hint.classList.toggle('hidden', !t || !!readOnly);
    if (poleId && !state.members[poleId]) membersOf(poleId).then(function () { if (!readOnly && (target() ? target().activityId : state.poleId) === poleId) paintProposal(); });
  }
  function closeChooser() { state.open = ''; }
  function choice(box, label, fn) { var b = el('button', 'tasksChoice', label); b.type = 'button'; b.addEventListener('click', function () { fn(); closeChooser(); paintProposal(); }); box.appendChild(b); }
  function toggleChooser(key) { state.open = state.open === key ? '' : key; paintProposal(); }
  // Les choix du champ ouvert (construits sous lui par fieldRow).
  function chooserFor(key) {
    var box = el('div', 'tasksChooser');
    var t = target(), poleId = t ? t.activityId : state.poleId;
    if (key === 'activity') {
      var seen = {};
      state.options.forEach(function (o) {
        if (seen[o.activityId]) return; seen[o.activityId] = true;
        choice(box, o.activityName, function () {
          var mine = state.options.filter(function (x) { return x.activityId === o.activityId; });
          var same = t && mine.filter(function (x) { return x.categoryKey === t.categoryKey; })[0];
          state.poleId = o.activityId; state.who = null;
          state.choice = same || (mine.length === 1 ? mine[0] : null);
          if (!state.choice && state.proposal && state.proposal.activityId !== o.activityId) state.proposal = null;
        });
      });
    } else if (key === 'pole') {
      var seenP = {};
      state.options.filter(function (o) { return o.activityId === poleId; }).forEach(function (o) {
        var pl = poleOf(o); if (seenP[pl]) return; seenP[pl] = true;
        choice(box, pl, function () { state.choice = o; });
      });
    } else if (key === 'secteur') {
      sectorsOfPole(t).forEach(function (o) { choice(box, sectorOf(o), function () { state.choice = o; }); });
    } else if (key === 'who') {
      choice(box, '—', function () { state.who = null; });
      (state.members[poleId] || []).forEach(function (m) { choice(box, m.name, function () { state.who = { id: m.id, name: m.name }; }); });
    }
    return box;
  }
  // ---------- Expansion : la même barre comprend les demandes « fais-moi des tâches », « objectif », « Drive » ----------
  // Elles ne valent QUE pour les activités où Expansion est actif (GET /api/activities/:id/offer1). Les tâches proposées s'affichent dans le panneau,
  // cochées ; ↑ ou ✕ ajoute les cochées (POST document-tasks/apply). Objectifs et Drive ouvrent le panneau Expansion de l'activité choisie.
  function fold(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  // Mots qui annoncent une génération (« fais-moi des tâches », « objectif », « Drive ») : le petit message sous la barre apparaît, SEULEMENT si une activité a Expansion.
  function expTrigger(label) {
    var x = fold(label);
    return /\bdrive\b/.test(x) || /\bobjectifs?\b/.test(x)
      || (/\b(taches|todo|to-do)\b/.test(x) && /\b(fais|fait|faire|cree|creer|genere|generer|propose|proposer|prepare|preparer|ajoute|ajouter|donne|planifie|planifier|trouve|trouver)\b/.test(x));
  }
  var hintSeq = 0;
  function updateExHint() {
    var label = ui.text.value.trim(), seq = ++hintSeq;
    if (!expTrigger(label)) { ui.exHint.classList.add('hidden'); return; }
    essorActivities().then(function (list) { if (seq === hintSeq) ui.exHint.classList.toggle('hidden', !list.length); }).catch(function () {});
  }
  // Mode blanc (même fondu que l'Horaire) pendant une demande Expansion ; il reste jusqu'à l'envoi (↑ ou ✕) ou l'abandon.
  function setExpMode(on) { document.documentElement.classList.toggle('modeExpansion', !!on); }
  // Appui long (500 ms) sur ↑ = demande Expansion ; le sujet décide du type : « drive » → Drive, « objectif » → objectifs, sinon des tâches.
  function expKind(label) {
    var x = fold(label);
    if (/\bdrive\b/.test(x)) return 'drive';
    if (/\bobjectifs?\b/.test(x)) return 'goals';
    return 'tasks';
  }
  // Pendant une demande Expansion, tout message passe par la ligne unique, centrée, sous la barre (la même que « Appuie longtemps… »).
  var EXHINT_DEF = tr('Appuie longtemps sur ↑ pour utiliser Expansion');
  function say(text) {
    if (state.exp || document.documentElement.classList.contains('modeExpansion')) { ui.exHint.textContent = text || ''; ui.exHint.classList.toggle('hidden', !text); ui.msg.textContent = ''; }
    else ui.msg.textContent = text || '';
  }
  function expansionAsked() {
    if (state.busy) return;
    var label = ui.text.value.trim();
    if (!label) { say(tr('Écris ta demande, puis appuie longuement sur ↑ pour Expansion.')); return; }
    startExpansion(expKind(label), label);
  }
  var LONG_MS = 1000, LONG_MOVE = 10;
  // Appui sur ↑ possible seulement si le message « Appuie longtemps… » est affiché (texte qui annonce une génération ET Expansion payé sur une activité).
  function pressEligible() { return !!ui.text.value.trim() && !ui.exHint.classList.contains('hidden') && !state.exp; }
  // Pendant l'appui (1 s) : la page fond vers le blanc rosé et le bouton grossit ; à la seconde, il reprend vite sa taille (en blanc) et la demande part.
  // Relâché avant : tout revient (fondu inverse).
  function bindLongPress(btn) {
    var timer = null, x0 = 0, y0 = 0;
    function cancel() { if (!timer) return; clearTimeout(timer); timer = null; btn.classList.remove('pressing'); setExpMode(false); }
    btn.addEventListener('pointerdown', function (e) {
      state.longFired = false; if (!pressEligible()) return;
      x0 = e.clientX; y0 = e.clientY; clearTimeout(timer);
      setExpMode(true); btn.classList.add('pressing');
      timer = setTimeout(function () {
        timer = null; state.longFired = true; btn.classList.remove('pressing'); // retour rapide à la taille standard
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* sans vibration */ }
        ui.exHint.textContent = tr('Touche ✕ ou ↑ pour valider.'); ui.exHint.classList.remove('hidden');
        expansionAsked();
      }, LONG_MS);
    });
    btn.addEventListener('pointermove', function (e) { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > LONG_MOVE) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { btn.addEventListener(ev, cancel); });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function essorActivities() {
    if (state.essor && Date.now() - state.essor.at < 60000) return Promise.resolve(state.essor.list);
    var cache = (TMT.getActivitiesCache && TMT.getActivitiesCache()) || [];
    var source = cache.length ? Promise.resolve(cache) : TMT.api('GET', '/api/activities?all=1&userId=' + TMT.getProfile().id).catch(function () { return []; });
    return source.then(function (acts) {
      acts = (acts || []).filter(function (a) { return a && a.id != null; });
      return Promise.all(acts.map(function (a) {
        return TMT.api('GET', '/api/activities/' + a.id + '/offer1').then(function (r) { return { id: a.id, name: a.name, essor: !!(r && r.essor) }; }).catch(function () { return { id: a.id, name: a.name, essor: false, err: true }; });
      }));
    }).then(function (l) {
      var list = l.filter(function (x) { return x.essor; });
      state.essor = { at: Date.now(), list: list, others: l.filter(function (x) { return !x.essor && !x.err; }), failed: l.some(function (x) { return x.err; }) };
      if (!list.length && state.essor.failed) state.essor.at = 0; // vérification incomplète : on réessaiera
      return list;
    });
  }
  // Message d'explication AU-DESSUS de la barre, centré (jamais plus d'une ligne sous la barre).
  function showAbove(text, linkLabel, onLink) {
    clearTimeout(state.toastT); ui.toast.textContent = text + ' ';
    if (linkLabel) { var lk = el('button', 'tasksMsgLink', linkLabel); lk.type = 'button'; lk.addEventListener('click', onLink); ui.toast.appendChild(lk); }
    ui.toast.classList.remove('hidden');
    state.toastT = setTimeout(function () { ui.toast.classList.add('hidden'); }, 12000);
  }
  function startExpansion(kind, label) {
    state.busy = true; ui.send.disabled = true; say(tr('Je regarde où Expansion est actif…'));
    essorActivities().then(function (list) {
      say('');
      if (!list.length) {
        setExpMode(false); ui.exHint.classList.add('hidden');
        if (state.essor && state.essor.failed) { showAbove(tr('Impossible de vérifier Expansion pour le moment. Réessaie dans un instant.')); return null; }
        showAbove(tr('Expansion n’est actif sur aucune de tes activités : cette demande ne marche que sur celles qui l’ont.'), tr('Découvrir Expansion'), function () {
          TMT.api('GET', '/api/offer/available').then(function (r) { if (r && r.available && TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); else showAbove(tr('Expansion — à venir. Elle n’est pas encore disponible.')); })
            .catch(function () { showAbove(tr('Expansion — à venir. Elle n’est pas encore disponible.')); });
        });
        return null;
      }
      if (kind === 'tasks') return expSuggest(list, label);
      state.exp = { kind: kind, label: label, acts: list, actId: list.length === 1 ? list[0].id : null, tasks: null, checked: [], loading: false };
      closeChooser(); paintExpansion();
      if (state.exp.actId) return runExpansion();
      say(tr('Choisis l’activité, puis touche ↑ (ou ✕ pour fermer).'));
      return null;
    }).catch(function (e) { say((e && e.message) || tr('Erreur.')); })
      .then(function () { state.busy = false; ui.send.disabled = false; });
  }
  // Étape 1 : Noèsis suggère le pôle et le secteur (parmi les activités avec Expansion), je valide ou je change (↑ ou ✕).
  function expSuggest(list, label) {
    var ids = {}; list.forEach(function (a) { ids[a.id] = true; });
    return TMT.api('POST', '/api/goals/capture/propose', { label: label, skipAi: TMT.aiMode === 'absence' }).then(function (r) {
      var opts = ((r && r.options) || []).filter(function (o) { return ids[o.activityId]; });
      var prop = r && r.proposal && ids[r.proposal.activityId] ? r.proposal : null;
      if (!opts.length) { setExpMode(false); showAbove(tr('Ces activités n’ont pas encore de pôle ni de secteur où ranger des tâches.')); return null; }
      state.options = opts; state.proposal = prop; state.choice = null; state.proposedFor = label;
      state.poleId = list.length === 1 ? list[0].id : null; state.date = null; state.who = null; state.exp = null; state.expStep = 1;
      closeChooser(); paintProposal(); ui.proposal.classList.remove('hidden');
      say(tr('Vérifie le rangement, puis touche ↑ (ou ✕) pour que Noèsis prépare les tâches.'));
      return null;
    });
  }
  function expValidateStep1() {
    var t = target();
    if (!t) { say(tr('Choisis l’activité, le pôle et le secteur, puis touche ↑.')); toggleChooser(state.poleId ? 'pole' : 'activity'); return; }
    var label = ui.text.value.trim();
    state.exp = { kind: 'tasks', label: label, acts: [{ id: t.activityId, name: t.activityName }], actId: t.activityId, categoryKey: t.categoryKey, categoryLabel: t.categoryLabel, tasks: null, checked: [], loading: false };
    state.expStep = 0; closeChooser(); runExpansion();
  }
  function expActName() { var e = state.exp, a = e && e.acts.filter(function (x) { return x.id === e.actId; })[0]; return a ? a.name : ''; }
  function paintExpansion() {
    var e = state.exp; if (!e) return;
    ui.proposal.classList.remove('hidden'); ui.close.classList.remove('hidden'); ui.hint.classList.remove('hidden');
    ui.kicker.textContent = tr('Expansion') + (e.kind === 'tasks' ? ' · ' + tr('Nouvelles tâches') : e.kind === 'goals' ? ' · ' + tr('Objectifs') : ' · Drive');
    ui.fields.textContent = '';
    var wrap = el('div', 'tasksFieldWrap' + (state.open === 'exp' ? ' open' : '')), row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr('Activité')));
    var b = el('button', 'tasksFieldValue'); b.type = 'button'; b.disabled = e.acts.length < 2 || e.loading;
    b.appendChild(el('span', 'tasksFieldText', expActName() || tr('Choisir')));
    if (!b.disabled) b.addEventListener('click', function () { state.open = state.open === 'exp' ? '' : 'exp'; paintExpansion(); });
    row.appendChild(b); wrap.appendChild(row);
    if (state.open === 'exp' && !b.disabled) {
      var box = el('div', 'tasksChooser');
      e.acts.forEach(function (a) { choice(box, a.name, function () { e.actId = a.id; e.tasks = null; }); });
      ((state.essor && state.essor.others) || []).forEach(function (a) {
        var off = el('div', 'tasksChoice off'); off.appendChild(el('span', null, a.name)); off.appendChild(el('small', null, tr('Sans Expansion'))); box.appendChild(off);
      });
      wrap.appendChild(box);
    }
    ui.fields.appendChild(wrap);
    if (e.loading) ui.fields.appendChild(el('p', 'tasksProposeHint', tr('Noèsis prépare les tâches…')));
    if (e.tasks) {
      if (!e.tasks.length) ui.fields.appendChild(el('p', 'tasksProposeHint', tr('Aucune tâche proposée. Précise ta demande.')));
      e.tasks.forEach(function (t, i) {
        var lab = el('label', 'tasksExpRow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = e.checked[i] !== false;
        cb.addEventListener('change', function () { e.checked[i] = cb.checked; });
        var txt = el('span', 'tasksExpText'); txt.appendChild(el('b', null, t.title));
        var meta = [t.categoryLabel, t.day ? dateText(t.day) : '', t.minutes ? minutesLabel(t.minutes) : ''].filter(Boolean).join(' · ');
        if (meta) txt.appendChild(el('small', null, meta));
        lab.appendChild(cb); lab.appendChild(txt); ui.fields.appendChild(lab);
      });
    }
    ui.hint.classList.add('hidden'); // un seul message, centré sous la barre
    dock.classList.toggle('expSave', !!(e.tasks && e.tasks.length) && !e.loading);
    say(e.loading ? tr('Noèsis prépare les tâches…') : e.tasks && e.tasks.length ? tr('Touche ✕ ou ↑ pour valider.') : tr('Touche ↑ pour envoyer, ou ✕ pour fermer.'));
  }
  function runExpansion() {
    var e = state.exp; if (!e) return Promise.resolve();
    if (!e.actId) { say(tr('Choisis l’activité d’abord.')); state.open = 'exp'; paintExpansion(); return Promise.resolve(); }
    if (e.loading) return Promise.resolve();
    say('');
    if (e.kind !== 'tasks') { var id = e.actId; reset(); if (TMT.openDocTasksForActivity) TMT.openDocTasksForActivity(id); return Promise.resolve(); }
    if (!e.tasks) {
      e.loading = true; paintExpansion();
      return TMT.api('POST', '/api/activities/' + e.actId + '/document-tasks/propose', { instruction: e.label.slice(0, 1500) }).then(function (r) {
        e.tasks = (r && r.tasks) || []; e.checked = e.tasks.map(function () { return true; });
      }).catch(function (err) { say((err && err.message) || tr('Erreur.')); })
        .then(function () { e.loading = false; if (state.exp === e) paintExpansion(); });
    }
    var picked = e.tasks.filter(function (t, i) { return e.checked[i] !== false; });
    if (!picked.length) { reset(); return Promise.resolve(); }
    e.loading = true; paintExpansion();
    return TMT.api('POST', '/api/activities/' + e.actId + '/document-tasks/apply', { tasks: picked.map(function (t) { return { title: t.title, key: e.categoryKey || t.key, day: t.day, week: t.week, minutes: t.minutes }; }) }).then(function (r) {
      var n = (r && r.addedCount) || 0; reset(); refresh();
      showToast(n + ' ' + tr(n > 1 ? 'tâches enregistrées' : 'tâche enregistrée'));
    }).catch(function (err) { e.loading = false; say((err && err.message) || tr('Erreur.')); paintExpansion(); });
  }

  function onType() {
    ui.msg.textContent = '';
    var text = ui.text.value.trim();
    clearTimeout(state.debounce);
    clearTimeout(state.flash);
    if (state.exp || state.expStep) { state.exp = null; state.expStep = 0; dock.classList.remove('expSave'); setExpMode(false); ui.proposal.classList.add('hidden'); }
    if (state.review) { state.review = false; ui.proposal.classList.add('hidden'); closeChooser(); } // le texte a changé : on recommence la revue au prochain ↑
    clearTimeout(state.hintT); state.hintT = setTimeout(updateExHint, 250);
    if (text.length < 3) { state.proposal = null; state.choice = null; state.proposedFor = ''; ui.proposal.classList.add('hidden'); return; }
    state.debounce = setTimeout(function () { propose(text); }, PROPOSE_MS);
  }
  function propose(text) {
    if (state.proposedFor === text) return Promise.resolve();
    var seq = ++state.seq;
    return TMT.api('POST', '/api/goals/capture/propose', { label: text, skipAi: TMT.aiMode === 'absence' }).then(function (r) {
      if (seq !== state.seq) return;
      state.proposedFor = text; state.proposal = r.proposal || null; state.options = r.options || [];
      if (state.choice && !state.options.some(function (o) { return o.activityId === state.choice.activityId && o.categoryKey === state.choice.categoryKey; })) state.choice = null; // un choix de l'utilisateur prime sur la proposition
      paintProposal();
    }).catch(function () { /* pas de proposition : « Changer » reste possible */ });
  }

  // Pièces jointes (mêmes contraintes que la zone de la page 1) : un document concerne UNE activité (celle du rangement choisi).
  function onPick() {
    var picked = Array.prototype.slice.call(ui.file.files || []); ui.file.value = '';
    if (!TMT.shrinkImage && TMT.renderGoalsCaptureBubble) TMT.renderGoalsCaptureBubble(); // construit le lecteur d'images partagé
    picked.forEach(function (f) {
      if (state.files.length >= MAX_FILES) { ui.msg.textContent = tr('3 fichiers maximum.'); return; }
      if (f.size > MAX_BYTES) { ui.msg.textContent = tr('Fichier trop lourd (5 Mo max).'); return; }
      if (/^image\//.test(f.type) && TMT.shrinkImage) {
        TMT.shrinkImage(f).then(function (o) { state.files.push(o); paintChips(); }).catch(function (e) { ui.msg.textContent = e.message; });
        return;
      }
      var r = new FileReader();
      r.onload = function () { state.files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); paintChips(); };
      r.readAsDataURL(f);
    });
  }
  function paintChips() {
    ui.chips.textContent = '';
    state.files.forEach(function (f, i) {
      var c = el('span', 'docTasksChip'); c.appendChild(document.createTextNode(f.fileName + ' '));
      var x = TMT.ui.removeBtn(null, tr('Retirer'));
      x.addEventListener('click', function () { state.files.splice(i, 1); paintChips(); });
      c.appendChild(x); ui.chips.appendChild(c);
    });
  }

  // Force le redessin complet de la zone d'écriture (Safari iOS : verre flou + transform laissaient l'invite coupée).
  function repaintText() {
    var ph = ui.text.placeholder; ui.text.placeholder = ''; void ui.text.offsetWidth; ui.text.placeholder = ph;
    var c = ui.text.closest('.tasksComposer');
    window.requestAnimationFrame(function () { if (!c) return; c.style.display = 'none'; void c.offsetHeight; c.style.display = ''; });
  }
  function reset() {
    clearTimeout(state.flash); state.exp = null; state.expStep = 0; state.review = false; dock.classList.remove('expSave'); setExpMode(false); ui.exHint.classList.add('hidden'); ui.exHint.textContent = EXHINT_DEF; ui.text.value = ''; state.proposal = null; state.choice = null; state.proposedFor = ''; state.files = []; state.options = [];
    state.date = null; state.who = null; state.poleId = null; closeChooser();
    ui.proposal.classList.add('hidden'); paintChips(); ui.msg.textContent = '';
    repaintText(); // iPhone : le texte d'invite (placeholder) ne se redessinait qu'en partie (« Ajou ») après l'envoi
  }
  function flashAdded(snap) {
    state.proposal = snap.t; state.choice = null; state.date = snap.date; state.who = snap.who; state.options = [snap.t]; state.poleId = snap.t.activityId;
    paintProposal(true);
    state.flash = setTimeout(function () { state.proposal = null; state.date = null; state.who = null; state.options = []; state.poleId = null; ui.proposal.classList.add('hidden'); }, 5000);
  }
  function showToast(text) {
    clearTimeout(state.toastT); ui.toast.textContent = text; ui.toast.classList.remove('hidden');
    state.toastT = setTimeout(function () { ui.toast.classList.add('hidden'); }, 2500);
  }
  function fastCommit(c) {
    var t = c.t;
    reset(); showToast(tr('Tâche enregistrée'));
    function fail(msg) { ui.toast.classList.add('hidden'); ui.text.value = c.label; ui.msg.textContent = msg || tr('non ajoutée'); }
    TMT.captureTaskFlow(c.label, [t.activityId], t.categoryKey, { inline: true }).then(function (flow) {
      var ok = flow && (flow.results || []).filter(function (x) { return x.ok; })[0];
      if (!ok) { var bad = flow && (flow.results || [])[0]; fail(bad && bad.error ? tr(bad.error) : ''); return null; }
      state.added.unshift({ id: ok.id, label: c.label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
      var extra = { userId: TMT.getProfile().id, dueDate: c.date };
      if (c.who) { extra.plannedUserId = c.who.id; extra.notifyAssignee = true; }
      return TMT.api('PUT', '/api/sub-project-items/' + ok.id, extra).catch(function () { ui.msg.textContent = tr('Date ou responsable non enregistré.'); }).then(function () { refresh(); });
    }).catch(function (err) { fail(err && err.message); });
  }
  function send() {
    if (state.busy) return;
    var label = ui.text.value.trim();
    if (!label) { ui.msg.textContent = tr('Écris une tâche avant d’ajouter.'); return; }
    if (state.expStep === 1) { expValidateStep1(); return; }
    if (state.exp) { runExpansion(); return; }
    state.busy = true; ui.send.disabled = true; ui.msg.textContent = '';
    var shown = state.review; // le panneau de revue était déjà affiché AVANT cet appui : ↑ (ou ✕) valide
    var go = shown ? Promise.resolve() : propose(label); // rien d'affiché encore : on demande d'abord la proposition
    go.then(function () {
      var t = target();
      // IA partielle ou absente : une proposition qui vient d'arriver s'AFFICHE pour que tu la revoies, elle n'est jamais appliquée dans la foulée (30 oct. 2026, Émilien).
      if (!shown) {
        state.review = true; paintProposal(); ui.proposal.classList.remove('hidden');
        ui.msg.textContent = t ? tr('Vérifie le rangement, puis touche ↑ (ou ✕).') : tr('Choisis où ranger la tâche.');
        if (!t && state.options.length) toggleChooser(state.poleId ? 'pole' : 'activity');
        return null;
      }
      if (!t) { state.review = true; paintProposal(); ui.proposal.classList.remove('hidden'); ui.msg.textContent = tr('Choisis où ranger la tâche.'); if (state.options.length) toggleChooser(state.poleId ? 'pole' : 'activity'); return null; }
      if (state.files.length) {
        var files = state.files.slice();
        if (TMT.docTasksPrefill) TMT.docTasksPrefill(t.activityId, label, files);
        return null;
      }
      // Proposition déjà affichée : validation INSTANTANÉE (↑ ou ✕). Le panneau se ferme tout de suite, « Tâche enregistrée » s'affiche en haut de la barre, l'enregistrement se termine en arrière-plan.
      if (shown) { fastCommit({ t: t, label: label, date: state.date || dayIso(), who: state.who }); return null; }
      return TMT.captureTaskFlow(label, [t.activityId], t.categoryKey, { inline: true }).then(function (flow) {
        if (!flow) return null;
        var ok = (flow.results || []).filter(function (x) { return x.ok; })[0];
        if (!ok) { var bad = (flow.results || [])[0]; ui.msg.textContent = bad && bad.error ? tr(bad.error) : tr('non ajoutée'); return null; }
        var r = ok;
          // Montrée tout de suite dans la liste, même si Noèsis l'a placée un autre jour (« demain »…), tant que la vue reste ouverte.
          state.added.unshift({ id: r.id, label: label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
          var snap = { t: t, date: state.date || dayIso(), who: state.who }, extra = { userId: TMT.getProfile().id, dueDate: snap.date };
          if (snap.who) { extra.plannedUserId = snap.who.id; extra.notifyAssignee = true; }
          var after = Object.keys(extra).length > 1 ? TMT.api('PUT', '/api/sub-project-items/' + r.id, extra).catch(function () { ui.msg.textContent = tr('Date ou responsable non enregistré.'); }) : Promise.resolve();
          return after.then(function () {
            reset(); refresh(); showToast(tr('Tâche enregistrée'));
          });
      });
    }).catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Erreur.'); })
      .then(function () { state.busy = false; ui.send.disabled = false; });
  }

  function strong(text, rest) { var s = el('span'); s.appendChild(el('b', null, text)); s.appendChild(document.createTextNode(rest)); return s; }
  function render(d) {
    sumL.textContent = ''; sumR.textContent = '';
    sumL.appendChild(strong(d.doneCount + ' ' + tr(d.doneCount > 1 ? 'faites' : 'faite'), ' · ' + d.todoCount + ' ' + tr('à faire')));
    sumR.appendChild(strong(minutesLabel(d.doneMinutes) + ' ' + tr('faites'), ' · ' + minutesLabel(d.todoMinutes) + ' ' + tr('à faire')));
    listBox.textContent = '';
    var have = {}; d.tasks.forEach(function (t) { have[t.id] = true; });
    d.tasks = state.added.filter(function (a) { return !have[a.id]; }).concat(d.tasks);
    if (!d.tasks.length) listBox.appendChild(el('p', 'tasksPopEmpty', tr(dayOff === 0 ? 'Rien pour aujourd’hui.' : 'Rien ce jour-là.')));
    var doneShown = false;
    d.tasks.forEach(function (t) {
      if (t.done && !doneShown) { doneShown = true; listBox.appendChild(el('p', 'tasksPopSection', tr(dayOff === 0 ? 'Faites aujourd’hui' : 'Faites ce jour-là'))); }
      var row = el('div', 'tasksPopRow' + (t.done ? ' done' : ''));
      var cb = el('button', 'tasksPopCheck'); cb.type = 'button';
      cb.setAttribute('aria-label', tr(t.done ? 'Remettre à faire' : 'Marquer comme faite')); cb.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      if (t.done) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
      cb.addEventListener('click', function () {
        if (cb.disabled) return;
        cb.disabled = true;
        // Effet immédiat : le cercle se remplit d'une coche, le texte est barré et grisé ; la tâche descend ensuite dans « Faites aujourd'hui » (et remonte si on la décoche).
        var nowDone = !t.done;
        row.classList.toggle('done', nowDone);
        cb.textContent = ''; if (nowDone) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
        cb.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
        TMT.api('PUT', '/api/sub-project-items/' + t.id, { userId: TMT.getProfile().id, done: nowDone })
          .catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Impossible de modifier cette tâche.'); })
          .then(function () {
            // Une seconde pour voir la coche et le texte barré, puis la ligne s'efface (fondu + repli) avant de passer dans l'autre section.
            leaving++;
            setTimeout(function () {
              row.style.maxHeight = row.offsetHeight + 'px';
              void row.offsetHeight;
              row.classList.add('leaving'); row.style.maxHeight = '0px';
              setTimeout(function () { leaving = Math.max(0, leaving - 1); refresh(); }, 360);
            }, 1000);
          });
      });
      var txt = el('div', 'tasksPopText');
      txt.appendChild(el('b', null, t.label));
      var meta = el('small');
      var dot = el('span', 'tasksPopDot'); if (t.activityColor) dot.style.background = t.activityColor;
      meta.appendChild(dot);
      meta.appendChild(document.createTextNode([t.activityName, t.sector].filter(Boolean).join(' · ') + ' · ' + (t.done ? tr('terminé') : (t.justAdded ? tr('ajoutée à l’instant') : minutesLabel(t.minutes)))));
      txt.appendChild(meta);
      row.appendChild(cb); row.appendChild(txt); listBox.appendChild(row);
    });
  }
  var leaving = 0; // lignes en train de s'effacer : on ne recharge pas la liste sous leurs pieds
  function refresh() {
    if (leaving > 0 || !root || !root.getClientRects().length) return; // vue masquée (autre volet, autre page) : rien à charger
    var seq = ++loadSeq;
    var day = dayOff ? dayIso() : localIso();
    TMT.api('GET', '/api/goals/today?today=' + localIso() + (dayOff ? '&day=' + dayIso() : '')).then(function (d) { if (d && d.tasks) cachePut(day, d); if (seq === loadSeq && shown) render(d); }).catch(function () {});
  }

  // Préchargement : les tâches du jour sont demandées dès l'ouverture de l'app (et au retour au premier plan), avant même d'ouvrir la Feuille de route.
  function prefetch() { if (!cacheUser()) return; var day = localIso(); TMT.api('GET', '/api/goals/today?today=' + day).then(function (d) { if (d && d.tasks) cachePut(day, d); }).catch(function () {}); }
  window.addEventListener('load', function () { setTimeout(prefetch, 800); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) prefetch(); });

  var mounted = false;
  TMT.todayView = {
    mount: function (container) { if (mounted) return; mounted = true; build(container); },
    show: function () { shown = true; syncDock(); var c = cacheGet(localIso()); if (c && !dayOff) render(c); refresh(); clearInterval(timer); timer = setInterval(refresh, 6000); },
    hide: function () { shown = false; dayOff = 0; if (ui.dayLabel) ui.dayLabel.textContent = todayLabel(); syncDock(); clearInterval(timer); timer = null; clearTimeout(state.debounce); state.added = []; },
  };
})();
