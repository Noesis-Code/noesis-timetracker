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
  var state = { added: [], proposal: null, options: [], choice: null, proposedFor: '', files: [], busy: false, seq: 0, debounce: null, date: null, who: null, poleId: null, open: '', members: {}, flash: null };

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
    container.appendChild(root);
  }

  // Barre d'ajout : [📎 à gauche] [texte] [↑ flèche d'envoi] ; au-dessus, la proposition de Noèsis.
  function buildAdd() {
    var box = el('div', 'tasksPopAdd');
    ui.proposal = el('div', 'tasksPropose cmpGlass hidden'); // verre commun (R31), comme la barre des volets
    var kick = el('div', 'tasksProposeHead');
    ui.kicker = el('span', 'tasksProposeKicker', tr('Noèsis propose'));
    ui.close = TMT.ui.closeBtn(function () { if (target() && ui.text.value.trim()) send(); else reset(); }, tr('Fermer')); // ✕ en haut à droite (R13) : enregistre le rangement affiché et l'applique (demande d'Émilien, 30 oct. 2026) ; sans rangement complet, ferme seulement
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
    ui.send.addEventListener('click', send);
    bar.appendChild(clip); bar.appendChild(ui.text); bar.appendChild(ui.send);
    ui.chips = el('div', 'tasksChips'); ui.msg = el('p', 'tasksMsg');
    box.appendChild(ui.proposal); box.appendChild(bar); box.appendChild(ui.chips); box.appendChild(ui.msg);
    return box;
  }

  function target() { return state.choice || state.proposal; }
  function sectorOf(o) { return String(o.categoryLabel || '').split(' → ').pop(); }
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
    var t = target(), poleId = t ? t.activityId : state.poleId;
    var poleName = t ? t.activityName : ((state.options.filter(function (o) { return o.activityId === poleId; })[0] || {}).activityName || '');
    ui.proposal.classList.toggle('hidden', !t && !state.options.length && !readOnly);
    ui.kicker.textContent = readOnly ? '✓ ' + tr('Ajoutée') : tr(TMT.aiMode === 'absence' || !t ? 'À ranger' : 'Noèsis propose');
    ui.close.classList.toggle('hidden', !!readOnly);
    if (readOnly) state.open = '';
    ui.fields.textContent = '';
    ui.fields.appendChild(fieldRow('pole', 'Pôle', poleName || tr('Choisir'), readOnly));
    ui.fields.appendChild(fieldRow('secteur', 'Secteur', t ? sectorOf(t) : tr('Choisir'), readOnly || !poleId));
    ui.fields.appendChild(dateRow(readOnly));
    if (poleId && state.members[poleId] && state.members[poleId].length > 1) ui.fields.appendChild(fieldRow('who', 'Responsable', state.who ? state.who.name : '—', readOnly));
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
    if (key === 'pole') {
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
    } else if (key === 'secteur') {
      state.options.filter(function (o) { return o.activityId === poleId; }).forEach(function (o) { choice(box, sectorOf(o), function () { state.choice = o; }); });
    } else if (key === 'who') {
      choice(box, '—', function () { state.who = null; });
      (state.members[poleId] || []).forEach(function (m) { choice(box, m.name, function () { state.who = { id: m.id, name: m.name }; }); });
    }
    return box;
  }
  function onType() {
    ui.msg.textContent = '';
    var text = ui.text.value.trim();
    clearTimeout(state.debounce);
    clearTimeout(state.flash);
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

  function reset() {
    clearTimeout(state.flash); ui.text.value = ''; state.proposal = null; state.choice = null; state.proposedFor = ''; state.files = []; state.options = [];
    state.date = null; state.who = null; state.poleId = null; closeChooser();
    ui.proposal.classList.add('hidden'); paintChips(); ui.msg.textContent = '';
  }
  function flashAdded(snap) {
    state.proposal = snap.t; state.choice = null; state.date = snap.date; state.who = snap.who; state.options = [snap.t]; state.poleId = snap.t.activityId;
    paintProposal(true);
    state.flash = setTimeout(function () { state.proposal = null; state.date = null; state.who = null; state.options = []; state.poleId = null; ui.proposal.classList.add('hidden'); }, 5000);
  }
  function send() {
    if (state.busy) return;
    var label = ui.text.value.trim();
    if (!label) { ui.msg.textContent = tr('Écris une tâche avant d’ajouter.'); return; }
    state.busy = true; ui.send.disabled = true; ui.msg.textContent = '';
    var shown = !!target(); // la proposition était déjà affichée AVANT l'envoi : ↑ la valide
    var go = shown ? Promise.resolve() : propose(label); // rien d'affiché encore : on demande d'abord la proposition
    go.then(function () {
      var t = target();
      // IA partielle ou absente : une proposition qui vient d'arriver s'AFFICHE pour que tu la revoies, elle n'est jamais appliquée dans la foulée (30 oct. 2026, Émilien).
      if (t && !shown && TMT.aiMode !== 'autonome') { paintProposal(); ui.proposal.classList.remove('hidden'); ui.msg.textContent = tr('Vérifie le rangement, puis touche ↑.'); return null; }
      if (!t) { paintProposal(); ui.proposal.classList.remove('hidden'); ui.msg.textContent = tr('Choisis où ranger la tâche.'); if (state.options.length) toggleChooser(state.poleId ? 'secteur' : 'pole'); return null; }
      if (state.files.length) {
        var files = state.files.slice();
        if (TMT.docTasksPrefill) TMT.docTasksPrefill(t.activityId, label, files);
        return null;
      }
      // La proposition au-dessus de la barre EST la validation (28 oct. 2026) : plus de pop-up de placement ni de confirmation après l'envoi.
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
            reset(); refresh();
            if (TMT.aiMode === 'autonome') flashAdded(snap); // autonome : les choix s'affichent 5 s, puis le panneau disparaît
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
