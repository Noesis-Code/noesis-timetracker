/* Module « Horaire » (26 oct. 2026, demande d'Émilien) : écran du gestionnaire (maître d'hôtel) qui prépare l'horaire hebdo de son personnel.
 * Routes : server/routes/horaire.js (doc docs/basic/module-horaire.md). Page unique #tab-horaire, page principale = horaire de la semaine :
 * semaine ‹ ›, puis 4 étapes en pages (1. Paramètres : classification des employés, besoins et événements, règles du restaurant ;
 * 2. Récupération : prompt de récupération et zone de collage ; 3. Horaire ; 4. Envoi). Plus de configuration guidée ni de section
 * « Paramètres » (28 oct. 2026) : tout se règle dans les tableaux ; le volet s'ouvre sur l'étape 1 tant que la semaine n'a pas de disponibilités.
 * Modifier = la case se modifie sur place ; réordonner = glisser-déposer (poignée ≡, TMT.ui.groupDrag, R27) ;
 * supprimer = TMT.ui.confirm rouge (R28). Données du personnel confidentielles (Loi 25) : appels fetch directs, aucune copie hors ligne, rien en console. */
(function () {
  'use strict';
  var root = document.getElementById('tab-horaire');
  if (!root) return;
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MAX_RANK = 5;

  // ---------- dates (AAAA-MM-JJ, calculs en UTC : aucune dépendance au fuseau) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // D1 : le premier du mois s'écrit « 1er » partout (« 1er novembre »).
  function dnum(n) { return n === 1 ? '1er' : String(n); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekdayOf(iso) { return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; } // 0 = lundi
  function mondayOf(d) { var iso = isoLocal(d); return addDays(iso, -weekdayOf(iso)); }
  function dayLabel(iso, long) {
    var d = new Date(iso + 'T00:00:00Z');
    return tr((long ? DAYS : DAYS_SHORT)[weekdayOf(iso)]) + ' ' + dnum(d.getUTCDate()) + ' ' + tr(MONTHS[d.getUTCMonth()]);
  }
  function hours(min) { var h = Math.floor(min / 60), m = min % 60; return h + ' h' + (m ? ' ' + pad(m) : ''); }

  // B1 : semaine affichée à l'ouverture = la dernière vue (mémorisée sur l'appareil), sinon le lundi qui vient (semaine suivante).
  function startWeek() {
    var saved = null; try { saved = localStorage.getItem('horaireSemaine'); } catch (e) { /* stockage indisponible */ }
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) && weekdayOf(saved) === 0) return saved;
    return addDays(mondayOf(new Date()), 7);
  }
  var S = {
    week: startWeek(), employees: [], positions: [], quals: [], needs: [], events: [], avail: [], timeoff: [], summary: null, catRules: [], schedule: null, settings: {},
    open: {}, promptOpen: {}, editing: null, msg: '', rulesOpen: false, busy: false, loaded: false,
  };

  // ---------- réseau ----------
  function req(method, url, body) {
    var o = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    // Réponse sans JSON (502/503 de l'hébergeur pendant un redéploiement de staging : le serveur redémarre quelques secondes) :
    // une lecture (GET) est retentée jusqu'à 2 fois, 1,5 s d'écart ; sinon message clair au lieu de « Erreur serveur ».
    var tries = method === 'GET' ? 2 : 0;
    var go = function () {
      return fetch('/api/horaire/' + url, o).then(function (r) {
        return r.json().then(function (d) { return [true, d]; }, function () { return [false, {}]; }).then(function (x) {
          var d = x[1];
          if (!x[0] && !r.ok && tries-- > 0) return new Promise(function (res) { setTimeout(res, 1500); }).then(go);
          if (!r.ok) throw new Error(d.error && !/^[a-z0-9_]+$/.test(d.error) ? tr(d.error) : tr(x[0] ? 'Erreur serveur' : 'Serveur en redémarrage. Réessaie dans un instant.'));
          return d;
        });
      }, function () { throw new Error(tr('Connexion impossible. Réessaie.')); });
    };
    return go();
  }
  function loadWeek() {
    return Promise.all([req('GET', 'weeks/' + S.week), req('GET', 'weeks/' + S.week + '/availabilities')]).then(function (r) {
      S.schedule = r[0].schedule; S.avail = r[1].availabilities || []; S.timeoff = r[1].timeoff || []; S.summary = r[1].summary || null;
      return req('GET', 'weeks/' + S.week + '/covers').then(function (c) { S.covers = c.covers || []; }, function () { S.covers = []; });
    });
  }
  function loadAll() {
    return Promise.all([req('GET', 'employees'), req('POST', 'positions/defaults', {}).catch(function () { return req('GET', 'positions'); }), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek(), req('GET', 'restaurant-rules').catch(function () { return { rules: null }; }), req('GET', 'inbound').catch(function () { return {}; }), req('GET', 'service-ends').catch(function () { return { ends: {} }; }), req('GET', 'floors').catch(function () { return { floors: [], counts: [] }; })])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {}; S.rr = r[7].rules || null; S.inbound = r[8] || {}; S.ends = r[9].ends || {}; S.floors = r[10].floors || []; S.floorCounts = r[10].counts || []; S.loaded = true;
      });
  }
  // Construit la page si besoin : refresh() peut être appelé (TMT.horaire.refresh) avant la première ouverture du volet.
  function refresh() { return loadAll().then(function () { if (!built) { build(); built = true; } render(); }, fail); }
  function fail(e) { S.msg = (e && e.message) || tr('Erreur serveur'); renderMsg(); }

  // ---------- petits constructeurs ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function input(type, value, label, cls) {
    var i = el('input', 'horaireInput' + (cls ? ' ' + cls : '')); i.type = type;
    if (value !== undefined && value !== null) i.value = value;
    if (label) i.setAttribute('aria-label', label);
    return i;
  }

  function field(label, control) { var f = el('label', 'horaireField'); f.appendChild(el('span', 'horaireFieldLabel', label)); f.appendChild(control); return f; }
  function posName(id) { var p = S.positions.find(function (x) { return x.id === id; }); return p ? p.name : '?'; }
  // Enregistrer (R35) : gris tant que rien n'a changé, violet au premier changement.
  function saveBtn(box, onSave) {
    var b = el('button', 'cmpBtn cmpBtnIdle horaireSave', tr('Enregistrer')); b.type = 'button';
    box.addEventListener('input', function () { b.classList.remove('cmpBtnIdle'); });
    box.addEventListener('change', function () { b.classList.remove('cmpBtnIdle'); });
    b.addEventListener('click', function () {
      if (b.classList.contains('cmpBtnIdle') || S.busy) return;
      S.busy = true; b.disabled = true;
      Promise.resolve().then(onSave).then(function () { S.editing = null; S.msg = ''; return refresh(); }, fail)
        .then(function () { S.busy = false; b.disabled = false; });
    });
    return b;
  }
  // ---------- page principale : parcours en 4 pages, une par étape (28 oct. 2026, demande d'Émilien) ----------
  // En-tête (semaine), puis 4 boutons d'étape pleine largeur (sélecteur commun .cmpSeg, R42,
  // R27/R29), puis les pages qui défilent de droite à gauche (TMT.slidePager, points de pagination communs .goalsDotBtn) :
  // 1. Récupération : réglages durables (classification, besoins et événements, règles, paramètres) + « Copier le prompt de récupération » ;
  // 2. Disponibilités : zone de collage (envoi dans la zone), ligne d'état, compte rendu ; 3. Horaire : « Générer l'horaire », horaire de la
  // semaine, « À vérifier » ; 4. Envoi : résumé + « Copier le prompt pour l'IA ». Une seule action violette par page (R1).
  // Sur téléphone, chaque tableau défile horizontalement dans son cadre.
  var EVE = 16 * 60; // soir = à partir de 16 h
  var SLOT = { matin: ['10:00', '16:00'], soir: ['16:00', '23:59'] };
  // Deux catégories (grands boutons .cmpSeg, R42) et leurs sous-catégories (texte simple souligné, .cmpSubTabs) : demande d'Émilien,
  // 28 oct. 2026. Pages à plat : 0-2 = Paramètres, 3-5 = Création des horaires.
  var CATS = [['Paramètres', ['Employés', 'Événements', 'Général']], ['Création des horaires', ['Récupération', 'Horaire', 'Envoi']]];
  var bFloors, floorsBox, groupMinInput, inboundLine, eventsBox, promptBoxes = {}, evReport, ratioInput, catsMsg, pasteArea, weekLabel, weekNav, msgBox, statusLine, needsBox, catsBox, planBox, alertsBox, rulesBox, genBtn, summaryBox, mainNodes;
  var pagesHost, pages = [], catBtns = [], subTabs, dots, dotBtns = [], pagerBound = false;
  function toMin(t) { var p = String(t || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function serviceOf(start) { return toMin(start) >= EVE ? 'soir' : 'matin'; }
  function block(title, hint) {
    var sec = el('section', 'horaireBlock');
    var head = el('div', 'horaireBlockHead');
    head.appendChild(el('p', 'cmpBlockTitle', tr(title))); // R41 : titre de bloc commun
    if (hint) head.appendChild(el('span', 'horaireBlockHint', tr(hint)));
    sec.appendChild(head);
    return sec;
  }
  function btn(cls, label, onClick) { var b = el('button', cls, tr(label)); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  function build() {
    root.textContent = '';
    var head = el('header', 'horaireHead');
    var nav = el('div', 'horaireWeek');
    var prev = btn('horaireNav', '‹', function () { changeWeek(-7); }); prev.setAttribute('aria-label', tr('Semaine précédente'));
    var next = btn('horaireNav', '›', function () { changeWeek(7); }); next.setAttribute('aria-label', tr('Semaine suivante'));
    weekLabel = el('span', 'horaireWeekLabel');
    nav.appendChild(prev); nav.appendChild(weekLabel); nav.appendChild(next);
    head.appendChild(nav); weekNav = head; // sous les deux grands boutons, seulement dans Création des horaires

    var cats = el('div', 'cmpSeg horaireCats'); cats.setAttribute('role', 'tablist');
    catBtns = CATS.map(function (c, k) {
      var b = btn('', c[0], function () { goPage(k * 3); }); b.setAttribute('role', 'tab');
      cats.appendChild(b); return b;
    });
    subTabs = el('div', 'cmpSubTabs horaireSubTabs'); subTabs.setAttribute('role', 'tablist');
    msgBox = el('p', 'horaireMsg hidden'); msgBox.setAttribute('aria-live', 'polite');

    // Paramètres > Employés : menu Poste et les 4 tableaux de catégorie.
    var p1 = el('div', 'horairePage');
    p1.appendChild(posPicker());
    var bCats = el('section', 'horaireBlock'); bCats.appendChild(el('p', 'cmpBlockTitle', tr('Classification des employés')));
    catsMsg = el('p', 'horaireMsg horaireCatsMsg hidden'); catsMsg.setAttribute('aria-live', 'polite'); bCats.appendChild(catsMsg);
    catsBox = el('div', 'horaireCatsBox'); bCats.appendChild(catsBox);
    var bNeeds = block('Besoins');
    needsBox = el('div', 'horaireFrame cmpGlass'); bNeeds.appendChild(needsBox);
    bFloors = block('Planchers');
    floorsBox = el('div', 'horaireFrame cmpGlass'); bFloors.appendChild(floorsBox);
    // Règles du restaurant : toujours affichées (plus de repli), titre seul.
    var bRules = block('Règles du restaurant');
    rulesBox = el('div', 'horaireRules cmpGlass');
    bRules.appendChild(rulesBox);
    p1.appendChild(bCats);
    // Paramètres > Général : menu Poste, Besoins (avec les lignes « Fin »), Règles du restaurant.
    var pGen = el('div', 'horairePage');
    [posPicker(), bNeeds, bFloors, bRules].forEach(function (n) { pGen.appendChild(n); });

    // Page 2 : Événements (réservations de groupe de la semaine) : ratio « 1 serveur de plus pour [20] couverts », prompt des
    // événements (même rangée et même zone de collage que la Récupération), compte rendu, puis le tableau « Événements de la semaine ».
    var pEv = el('div', 'horairePage');
    var ratio = el('p', 'horaireRatio');
    ratioInput = el('input', 'horaireInput horaireRatioInput'); ratioInput.type = 'number'; ratioInput.min = '1'; ratioInput.max = '1000'; ratioInput.inputMode = 'numeric';
    ratioInput.setAttribute('aria-label', tr('Couverts par serveur de plus'));
    ratioInput.addEventListener('change', saveRatio);
    ratio.appendChild(el('span', null, tr('1 serveur de plus pour'))); ratio.appendChild(ratioInput); ratio.appendChild(el('span', null, tr('couverts')));
    var evPanel = promptPanel({ key: 'eventsPrompt', copyLabel: 'Copier le prompt des événements', copyUrl: function () { return 'events-prompt?week=' + S.week; },
      areaLabel: 'Coller les événements', send: sendEvents });
    evReport = el('p', 'horaireStatus hidden');
    var bEvents = block('Calendrier des événements');
    eventsBox = el('div', 'horaireCalBox'); bEvents.appendChild(eventsBox);
    // Seuil d'un groupe (réception automatique) : « Groupe à partir de [10] couverts » ; ligne grise de la réception automatique.
    var gmin = el('p', 'horaireRatio');
    groupMinInput = el('input', 'horaireInput horaireRatioInput'); groupMinInput.type = 'number'; groupMinInput.min = '1'; groupMinInput.max = '500'; groupMinInput.inputMode = 'numeric';
    groupMinInput.setAttribute('aria-label', tr('Couverts minimum d’un groupe'));
    groupMinInput.addEventListener('change', saveGroupMin);
    gmin.appendChild(el('span', null, tr('Groupe à partir de'))); gmin.appendChild(groupMinInput); gmin.appendChild(el('span', null, tr('couverts')));
    inboundLine = el('div', 'horaireInbound');
    [ratio, gmin, inboundLine, evPanel.row, evPanel.box, evPanel.paste, evReport, bEvents].forEach(function (n) { pEv.appendChild(n); });

    // Page 3 : Récupération (zone de collage toujours visible, envoi dans la zone, R13)
    var p2 = el('div', 'horairePage');
    var avPanel = promptPanel({ key: 'importPrompt', copyLabel: 'Copier le prompt de récupération', copyUrl: function () { return 'import-prompt?week=' + S.week; },
      areaLabel: 'Coller les disponibilités', send: sendAvail });
    pasteArea = avPanel.area;
    statusLine = el('p', 'horaireStatus');
    p2.appendChild(avPanel.row); p2.appendChild(avPanel.box); p2.appendChild(avPanel.paste); p2.appendChild(statusLine);

    // Page 3 : Horaire
    var p3 = el('div', 'horairePage');
    genBtn = btn('cmpBtn', 'Générer l’horaire', generate);
    var bPlan = block('Horaire de la semaine', 'Tel qu’il sera inscrit. Clique un nom pour le changer.');
    planBox = el('div', 'horaireFrame cmpGlass');
    alertsBox = el('div', 'horaireAlerts');
    bPlan.appendChild(planBox); bPlan.appendChild(alertsBox);
    p3.appendChild(posPicker()); p3.appendChild(genBtn); p3.appendChild(bPlan);

    // Page 4 : Envoi
    var p4 = el('div', 'horairePage');
    summaryBox = el('div', 'horaireSummary cmpGlass cmpList');
    p4.appendChild(summaryBox);
    p4.appendChild(btn('cmpBtn', 'Copier le prompt pour l’IA', function () { copyText('weeks/' + S.week + '/prompt', 'Prompt copié : colle-le dans ton IA.'); }));

    pages = [p1, pEv, pGen, p2, p3, p4];
    pagesHost = el('div', 'horairePages');
    pages.forEach(function (p, i) { if (i) p.classList.add('hidden'); pagesHost.appendChild(p); });
    // Points de pagination en bas, juste au-dessus de la barre des volets : les 3 pages de la catégorie active ; sur ordinateur,
    // js/bureau.js ajoute les flèches gauche et droite (id horairePageDots), qui restent donc dans la catégorie.
    dots = el('div', 'horairePageDots'); dots.id = 'horairePageDots'; dots.setAttribute('role', 'group');

    mainNodes = [cats, head, subTabs, dots, pagesHost];
    mainNodes.forEach(function (n) { root.appendChild(n); });
  }
  // Page courante : catégorie active, ses 3 sous-catégories (active soulignée), ses 3 points, message de la page.
  function showPage(i) {
    S.page = i;
    var cat = Math.floor(i / 3);
    if (weekNav) weekNav.classList.toggle('hidden', cat === 0); // semaine inutile dans Paramètres (fixes) ; le calendrier des événements a sa propre navigation
    pages.forEach(function (p, k) { p.classList.toggle('hidden', k !== i); });
    catBtns.forEach(function (b, k) { b.classList.toggle('active', k === cat); b.setAttribute('aria-selected', k === cat ? 'true' : 'false'); });
    subTabs.textContent = ''; dots.textContent = '';
    CATS[cat][1].forEach(function (l, j) {
      var t = btn(cat * 3 + j === i ? 'active' : '', l, function () { goPage(cat * 3 + j); });
      if (cat === 1) t.textContent = (j + 1) + '. ' + tr(l); // Création des horaires : étapes numérotées (28 oct. 2026, demande d'Émilien)
      t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', cat * 3 + j === i ? 'true' : 'false');
      subTabs.appendChild(t);
      var d = el('button', 'goalsDotBtn' + (cat * 3 + j === i ? ' on' : '')); d.type = 'button'; d.setAttribute('aria-label', tr(l));
      d.appendChild(el('span', 'goalsDot'));
      d.addEventListener('click', function () { goPage(cat * 3 + j); });
      dots.appendChild(d);
    });
    pages[i].appendChild(msgBox);
  }
  function goPage(i) { if (i === S.page) return; closeMenu(); S.msg = ''; renderMsg(); showPage(i); }
  // Balayage entre les pages : technique commune (TMT.slidePager, stats-avance.js) ; gauche = étape suivante, droite = précédente.
  function bindPager() {
    if (pagerBound || !(window.TMT && TMT.slidePager)) return; pagerBound = true;
    TMT.slidePager({
      zone: pagesHost,
      neighbor: function (dir) {
        var t = S.page + dir;
        if (t < 0 || t >= pages.length || Math.floor(t / 3) !== Math.floor(S.page / 3)) return null; // dans la catégorie seulement
        return { cur: pages[S.page], nb: pages[t], host: pagesHost, commit: function () { closeMenu(); S.msg = ''; renderMsg(); showPage(t); } };
      },
    });
  }
  // Ouverture : toujours Paramètres > Employés (décision d'Émilien : le dernier endroit visité n'est pas repris).
  function logicalPage() { return 0; }
  function changeWeek(n) {
    S.week = addDays(S.week, n); S.msg = '';
    try { localStorage.setItem('horaireSemaine', S.week); } catch (e) { /* stockage indisponible */ }
    if (S.editing && /^ev/.test(S.editing)) S.editing = null;
    closeMenu();
    loadWeek().then(render, fail);
  }
  function generate() {
    if (S.busy) return;
    // G6 : aucune disponibilité collée pour la semaine -> rien n'est généré.
    if (!(S.summary && S.summary.employees)) { S.msg = tr('Colle d’abord les disponibilités de la semaine (Récupération).'); renderMsg(); return; }
    // B4 : un horaire existe déjà -> confirmation (bouton violet), car les modifications manuelles seront remplacées.
    if (S.schedule && !generate.ok) {
      TMT.ui.confirm(tr('Regénérer ? Tes modifications manuelles seront remplacées.'), { ok: tr('Regénérer') }).then(function (yes) { if (yes) { generate.ok = true; generate(); generate.ok = false; } });
      return;
    }
    S.busy = true; genBtn.disabled = true; S.msg = '';
    req('POST', 'weeks/' + S.week + '/generate').then(function (d) { S.schedule = d.schedule; render(); }, fail)
      .then(function () { S.busy = false; genBtn.disabled = false; });
  }
  // Texte assemblé côté serveur (version en vigueur des prompts) copié dans le presse-papiers. ClipboardItem avec promesse quand il
  // existe : la copie reste liée au toucher même si le texte arrive après (Safari iOS). Une erreur (ex. 409) affiche le message renvoyé.
  function copyText(url, done) {
    var show = function (m) { S.msg = m; renderMsg(); };
    var text = fetch('/api/horaire/' + url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error ? tr(d.error) : tr('Erreur serveur')); });
      return r.text();
    }, function () { throw new Error(tr('Connexion impossible. Réessaie.')); });
    var cb = navigator.clipboard;
    var copy = cb && cb.write && window.ClipboardItem
      ? cb.write([new window.ClipboardItem({ 'text/plain': text.then(function (t) { return new Blob([t], { type: 'text/plain' }); }) })])
        .catch(function (e) { return text.then(function (t) { if (!cb.writeText) throw e; return cb.writeText(t); }); })
      : text.then(function (t) { if (!cb || !cb.writeText) throw new Error(tr('Copie impossible.')); return cb.writeText(t); });
    copy.then(function () { show(tr(done)); }, function () {
      text.then(function () { show(tr('Copie impossible.')); }, function (e) { show((e && e.message) || tr('Erreur serveur')); });
    });
  }
  // Fichier joint, lu LOCALEMENT (rien n'est envoyé à une IA) : texte (.csv, .tsv, .txt…) placé dans la zone puis envoyé comme un collage ;
  // tableur (.xlsx) : aucune bibliothèque dans le dépôt -> demander un CSV ; photo ou PDF : à donner à son IA avec le prompt de récupération.
  function readPasteFile(files, area, send) {
    var f = files[0], name = String(f.name || '').toLowerCase(), type = String(f.type || '');
    if (/\.(csv|tsv|txt|md|markdown)$/.test(name) || /^text\//.test(type)) {
      f.text().then(function (t) { area.value = t; send(t, area); }, fail);
      return;
    }
    S.msg = /^image\//.test(type) || /\.pdf$/.test(name) || type === 'application/pdf'
      ? tr('Donne cette image à ton IA avec le prompt de récupération, puis colle sa réponse ici.')
      : tr('Exporte-le en CSV ou colle le texte.');
    renderMsg();
  }
  // Envoi du texte collé (texte rendu par l'IA du gérant, même corps que l'import CSV). Compte rendu : lus, inconnus, ignorés.
  function sendAvail(text, area) {
    if (!String(text || '').trim() || S.busy) return;
    S.busy = true;
    req('POST', 'weeks/' + S.week + '/import/availabilities', { csv: text }).then(function (d) {
      var sk = (d.skipped || []).length;
      if (!d.employees && d.otherWeeks && d.otherWeeks.length) {
        var ow = new Date(d.otherWeeks[0] + 'T00:00:00Z');
        S.msg = tr('Ces disponibilités sont pour la semaine du') + ' ' + dnum(ow.getUTCDate()) + ' ' + tr(MONTHS_LONG[ow.getUTCMonth()]) + ' : ' + tr('va à cette semaine et colle-les à nouveau.');
        return loadWeek().then(render);
      }
      // G4 : « 14 employés lus, 3 congés, 1 nom inconnu : Zoé Inconnue. », accordé au singulier ou au pluriel (D1 : plus de « (s) »).
      var n = d.employees || 0, off = d.timeoff || 0, unk = d.unknown || [];
      var parts = [plural(n, 'employé lu', 'employés lus')];
      if (off) parts.push(plural(off, 'congé', 'congés'));
      if (unk.length) parts.push(plural(unk.length, 'nom inconnu', 'noms inconnus') + ' : ' + unk.join(', '));
      if (sk) parts.push(plural(sk, 'ligne ignorée', 'lignes ignorées'));
      S.msg = parts.join(', ') + '.';
      (area || pasteArea).value = '';
      return loadWeek().then(render);
    }).catch(fail).then(function () { S.busy = false; });
  }
  // Rangée « Modifier le prompt » | « Copier le prompt … » (50/50), éditeur déroulé sur place (R36), puis zone de collage avec
  // l'épingle commune (TMT.ui.attachBtn) en bas à gauche et la flèche d'envoi en bas à droite (R39, R13). Une seule définition,
  // utilisée par les étapes Événements et Récupération. o : { key, copyLabel, copyUrl(), areaLabel, send(texte, zone) }.
  function promptPanel(o) {
    var row = el('div', 'horairePromptRow');
    row.appendChild(btn('cmpBtn cmpBtnIdle horairePromptEdit', 'Modifier le prompt', function () { S.promptOpen[o.key] = !S.promptOpen[o.key]; renderPromptEditor(o.key); }));
    row.appendChild(btn('cmpBtn', o.copyLabel, function () { copyText(o.copyUrl(), 'Prompt copié : colle-le dans ton IA.'); }));
    var box = el('div', 'horairePromptBox hidden');
    promptBoxes[o.key] = box;
    var paste = el('div', 'horairePaste');
    var area = el('textarea', 'horaireInput horairePasteArea'); area.rows = 12; area.setAttribute('aria-label', tr(o.areaLabel));
    area.placeholder = tr('Colle ici le texte rendu par ton IA.');
    var actions = el('div', 'horairePasteActions');
    var send = el('button', 'cmpSend'); send.type = 'button'; send.setAttribute('aria-label', tr('Envoyer')); // flèche d'envoi standard (R29)
    send.addEventListener('click', function () { o.send(area.value, area); });
    actions.appendChild(send);
    paste.appendChild(area); paste.appendChild(TMT.ui.attachBtn(function (files) { readPasteFile(files, area, o.send); }, { label: tr('Joindre un fichier') })); paste.appendChild(actions);
    return { row: row, box: box, paste: paste, area: area };
  }
  // Poste « Serveur » (sinon le premier) : c'est lui que reçoivent les groupes importés ; son ratio de couverts (openTableCovers, 20 par défaut).
  function serverPos() { return S.positions.find(function (p) { return /^serveur$/i.test(String(p.name).trim()); }) || S.positions[0] || null; }
  // Réception automatique du rapport de réservations : adresse secrète (copiable) et date du dernier rapport ; sans domaine configuré
  // côté serveur : « bientôt disponible ».
  function renderInbound() {
    var i = S.inbound || {};
    if (document.activeElement !== groupMinInput) groupMinInput.value = String(i.groupMin || 10);
    inboundLine.textContent = '';
    if (!i.address) { inboundLine.appendChild(el('span', 'horaireMuted', tr('Réception automatique : bientôt disponible.'))); return; }
    var d = i.lastAt ? new Date(i.lastAt) : null;
    inboundLine.appendChild(el('span', 'horaireMuted horaireInboundText', tr('Réception automatique :') + ' ' + i.address
      + (d ? ' · ' + tr('dernier rapport le') + ' ' + dnum(d.getDate()) + ' ' + tr(MONTHS_LONG[d.getMonth()]) : '')));
    inboundLine.appendChild(btn('cmpBtn cmpBtnIdle horaireInboundCopy', 'Copier l’adresse', function () {
      var cb = navigator.clipboard;
      (cb && cb.writeText ? cb.writeText(i.address) : Promise.reject()).then(function () { S.msg = tr('Adresse copiée.'); renderMsg(); }, function () { S.msg = tr('Copie impossible.'); renderMsg(); });
    }));
  }
  function saveGroupMin() {
    var n = Number(groupMinInput.value);
    if (!(Number.isInteger(n) && n >= 1 && n <= 500)) { renderInbound(); return; }
    req('PUT', 'inbound', { groupMin: n }).then(function (d) { S.inbound = d; renderInbound(); }, fail);
  }
  function renderRatio() { var p = serverPos(); if (document.activeElement !== ratioInput) ratioInput.value = String((p && p.openTableCovers) || 20); }
  function saveRatio() {
    var p = serverPos(), n = Number(ratioInput.value);
    if (!p || !(Number.isInteger(n) && n >= 1 && n <= 1000)) { renderRatio(); return; }
    if (n === (p.openTableCovers || 20)) return;
    p.openTableCovers = n;
    req('PUT', 'positions/' + p.id, { openTableCovers: n }).catch(function (err) { fail(err); refresh(); });
  }
  // Envoi des réservations de groupe collées : compte rendu sous la zone (« 3 groupes lus : samedi soir +2, … »).
  function sendEvents(text, area) {
    if (!String(text || '').trim() || S.busy) return;
    S.busy = true;
    req('POST', 'weeks/' + S.week + '/import/events', { csv: text }).then(function (d) {
      var n = d.groups || 0, out;
      if (!n && d.otherWeeks && d.otherWeeks.length) {
        var ow = new Date(d.otherWeeks[0] + 'T00:00:00Z');
        out = tr('Ces réservations sont pour la semaine du') + ' ' + dnum(ow.getUTCDate()) + ' ' + tr(MONTHS_LONG[ow.getUTCMonth()]) + ' : ' + tr('va à cette semaine et colle-les à nouveau.');
      } else {
        out = n + ' ' + tr(n > 1 ? 'groupes lus' : 'groupe lu') + (d.lines && d.lines.length ? ' : ' + d.lines.map(function (l) {
          return tr(DAYS[weekdayOf(l.day)]).toLowerCase() + ' ' + tr(l.service) + ' +' + l.extra;
        }).join(', ') : '') + '.';
        if (d.otherLines) out += ' ' + d.otherLines + ' ' + tr(d.otherLines > 1 ? 'groupes d’une autre semaine ignorés.' : 'groupe d’une autre semaine ignoré.');
        area.value = '';
      }
      evReport.textContent = out; evReport.classList.remove('hidden');
      return req('GET', 'events').then(function (e) { S.events = e.events || []; renderEventsTable(); });
    }).catch(fail).then(function () { S.busy = false; });
  }
  // « 1 congé », « 3 congés » : nombre et mot accordé (jamais « (s) »).
  function plural(n, one, many) { return n + ' ' + tr(n > 1 ? many : one); }
  function renderMsg() {
    [msgBox].forEach(function (m) { m.textContent = S.msg; m.classList.toggle('hidden', !S.msg); });
  }
  // Éditeur du prompt de récupération (étape 2) : texte en vigueur, « Revenir à la version de base » (confirmation violette),
  // « Enregistrer » pleine largeur (R35). Les dates de la semaine sont ajoutées par l'app en tête du prompt copié, hors de ce texte.
  function renderPromptEditor(key) {
    var promptBox = promptBoxes[key], body = function (v) { var b = {}; b[key] = v; return b; };
    promptBox.textContent = '';
    promptBox.classList.toggle('hidden', !S.promptOpen[key]);
    if (!S.promptOpen[key]) return;
    var again = function () { renderPromptEditor(key); };
    req('GET', 'prompts').then(function (d) {
      if (!S.promptOpen[key]) return;
      var cur = d[key] || { text: '', isDefault: true };
      var f = el('div', 'horaireForm');
      var a = el('textarea', 'horaireInput horairePromptArea'); a.rows = 14; a.value = cur.text; a.setAttribute('aria-label', tr('Prompt'));
      f.appendChild(a);
      f.appendChild(saveBtn(f, function () { return req('PUT', 'prompts', body(a.value)).then(function () { setTimeout(again, 0); }); }));
      // Toujours visible en bas à gauche ; grisé et inactif tant que le prompt est celui de base.
      var back = btn('horaireLink', 'Revenir à la version de base', function () {
        TMT.ui.confirm(tr('Revenir à la version de base de ce prompt ?'), { ok: tr('Revenir') }).then(function (yes) {
          if (yes) req('PUT', 'prompts', body(null)).then(again, fail);
        });
      });
      back.disabled = !!cur.isDefault;
      f.appendChild(back);
      promptBox.appendChild(f);
    }, fail);
  }
  // Ligne d'état : « Disponibilités : N employés lus le … » ou « pas encore collées ».
  function renderStatus() {
    var s = S.summary || {};
    if (!s.employees) { statusLine.textContent = tr('Disponibilités : pas encore collées'); return; }
    var d = s.at ? new Date(s.at) : null;
    statusLine.textContent = tr('Disponibilités :') + ' ' + s.employees + ' ' + tr(s.employees > 1 ? 'employés lus' : 'employé lu')
      + (d ? ' ' + tr('le') + ' ' + dnum(d.getDate()) + ' ' + tr(MONTHS[d.getMonth()]) : '');
  }
  // Page 4 : résumé court (semaine, quarts, trous restants, alertes).
  function renderSummary() {
    summaryBox.textContent = '';
    var sc = S.schedule, holes = sc ? computeHoles(sc).reduce(function (t, h) { return t + h.missing; }, 0) : 0;
    var alerts = sc ? (sc.alerts || []).filter(function (a) { return a.type !== 'trou'; }).length : 0;
    [['Semaine', weekTitle().replace(/^\S+ \S+ /, '')], ['Quarts', sc ? String(sc.assignments.length) : tr('Horaire pas encore généré')],
      ['Trous restants', String(holes)], ['Alertes', String(alerts)]].forEach(function (r) {
      var row = el('div', 'horaireSummaryRow');
      row.appendChild(el('span', 'horaireMuted', tr(r[0]))); row.appendChild(el('span', null, r[1]));
      summaryBox.appendChild(row);
    });
  }
  function weekTitle() {
    var a = new Date(S.week + 'T00:00:00Z'), b = new Date(addDays(S.week, 6) + 'T00:00:00Z');
    var same = a.getUTCMonth() === b.getUTCMonth();
    return tr('Semaine du') + ' ' + dnum(a.getUTCDate()) + (same ? '' : ' ' + tr(MONTHS_LONG[a.getUTCMonth()])) + ' ' + tr('au') + ' ' + dnum(b.getUTCDate()) + ' ' + tr(MONTHS_LONG[b.getUTCMonth()]) + ' ' + b.getUTCFullYear();
  }
  function render() {
    bindPager();
    showPage(S.page == null ? logicalPage() : S.page);
    weekLabel.textContent = weekTitle();
    renderPosPickers();
    renderMsg();
    renderStatus();
    renderSchedule();
    renderSummary();
    renderNeedsTable();
    renderFloors();
    renderRatio();
    renderInbound();
    renderCats();
    renderRules();
  }
  // Tableau jours × colonnes : en-tête (jour, + date si demandé), puis une rangée par ligne. r[1](i, case) remplit la case du jour i.
  function grid(cls, withDate, rows) {
    var g = el('div', 'horaireGrid ' + cls);
    g.appendChild(el('div', 'horaireCell'));
    for (var i = 0; i < 7; i++) {
      var d = addDays(S.week, i), h = el('div', 'horaireCell horaireCellSide');
      h.appendChild(el('div', 'horaireDayName', tr(DAYS[i])));
      if (withDate) { var dt = new Date(d + 'T00:00:00Z'); h.appendChild(el('div', 'horaireDayDate', dnum(dt.getUTCDate()) + ' ' + tr(MONTHS[dt.getUTCMonth()]))); }
      g.appendChild(h);
    }
    rows.forEach(function (r) {
      g.appendChild(el('div', 'horaireCell horaireCellTop horaireRowLabel', tr(r[0])));
      for (var j = 0; j < 7; j++) { var c = el('div', 'horaireCell horaireCellTop horaireCellSide ' + (r[2] || '')); r[1](j, c); g.appendChild(c); }
    });
    return g;
  }
  // Besoins d'un jour (même règle que la génération) : un ancien événement (avec ses besoins) remplace les besoins normaux de SON
  // service ; un groupe (service + serveurs en plus) AJOUTE ses serveurs à la première heure d'arrivée de son service (à défaut 10:30 / 16:00).
  function dayEvents(i) { var day = addDays(S.week, i); return S.events.filter(function (e) { return e.day === day; }); }
  function daySource(i) {
    var evs = dayEvents(i);
    var ev = [].concat.apply([], evs.filter(function (e) { return !e.service; }).map(function (e) { return e.needs || []; }));
    var replaced = {}; ev.forEach(function (n) { replaced[serviceOf(n.start)] = 1; });
    var src = ev.concat(S.needs.filter(function (n) { return Number(n.weekday) === i && !replaced[serviceOf(n.start)]; }));
    // Lignes des événements d'un service (même calcul que la génération) : à la première arrivée du poste, sinon 10:30 / 16:00.
    var base = src.slice();
    evs.filter(function (e) { return e.service; }).forEach(function (g) {
      (g.lines || []).forEach(function (l) {
        var pid = l.positionId == null ? null : Number(l.positionId);
        var first = base.filter(function (n) { return serviceOf(n.start) === g.service && (pid == null || Number(n.positionId) === pid); }).sort(function (a, b) { return toMin(a.start) - toMin(b.start); })[0];
        if (first) src.push({ positionId: first.positionId, start: first.start, end: first.end, count: l.count });
        else if (pid != null || S.positions[0]) src.push({ positionId: pid != null ? pid : S.positions[0].id, start: g.service === 'soir' ? '16:00' : '10:30', end: endFor(pid != null ? pid : S.positions[0].id, i, g.service), count: l.count });
      });
    });
    return src;
  }
  // ---------- Besoins (modèle de la semaine, poste choisi) ----------
  // Chaque ligne « heure × nombre » se modifie au clic, enregistrement automatique (Entrée ou sortie du champ), 0 retire la ligne ;
  // « + Ajouter » (case pointillée pleine largeur, R33) ajoute une ligne (10:30 le matin, 16:00 le soir, × 1). En haut à droite de la case,
  // le total des « × N » de la case (besoins seulement, sans les événements), en violet gras.
  // Fin d'un service (poste, jour 0..6, service) : valeur du compte, sinon matin 17:00 ; soir 23:00, vendredi 00:00 (minuit).
  function endFor(pid, wd, svc) { return (S.ends || {})[pid + '|' + wd + '|' + svc] || (svc === 'matin' ? '17:00' : (wd === 4 ? '00:00' : '23:00')); }
  function renderNeedsTable() {
    needsBox.textContent = '';
    var list = function (svc) {
      return function (i, c) {
        var rows = S.needs.filter(function (n) { return Number(n.weekday) === i && serviceOf(n.start) === svc && n.positionId === posId(); })
          .sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
        var total = rows.reduce(function (t, n) { return t + (Number(n.count) || 0); }, 0);
        c.appendChild(el('div', 'horaireNeedTotal', String(total)));
        rows.forEach(function (n) {
          var r = el('div', 'horaireNeed horaireSheetEdit');
          var delNeed = function () {
            confirmDelete(tr('Supprimer ce besoin') + ' (' + n.start + ' × ' + n.count + ') ?', function () { req('DELETE', 'needs/' + n.id).then(refresh, fail); }, renderNeedsTable);
          };
          editCell(r, '', [['start', n.start, 'Heure d’arrivée', 'time'], ['count', n.count, 'Nombre', 'number', '×']], function (v) {
            var count = Number(v.count);
            if (!/^\d{1,2}:\d{2}$/.test(v.start) || !(Number.isInteger(count) && count >= 0 && count <= 50)) return false;
            if (count === 0) { delNeed(); return; }
            if (v.start === n.start && count === n.count) { renderNeedsTable(); return; }
            req('PUT', 'needs/' + n.id, { start: v.start, count: count }).then(refresh, function (err) { fail(err); renderNeedsTable(); });
          }, function (cell) { cell.appendChild(el('span', null, n.start)); cell.appendChild(el('span', 'horaireNeedN', '× ' + n.count)); },
          delNeed);
          c.appendChild(r);
        });
        var add = TMT.ui.addBtn(tr('Ajouter'), function () {
          req('POST', 'needs', { positionId: posId(), weekday: i, start: svc === 'soir' ? '16:00' : '10:30', end: SLOT[svc][1], count: 1 }).then(refresh, fail);
        });
        add.classList.add('horaireEvAdd');
        c.appendChild(add);
        // En bas de la case : « Fin 17:00 », modifiable sur place (champ heure, enregistrement automatique ; 00:00 = minuit).
        var endCell = el('div', 'horaireNeed horaireNeedEnd horaireSheetEdit');
        var end = endFor(posId(), i, svc);
        editCell(endCell, '', [['end', end, 'Fin', 'time']], function (v) {
          if (!/^\d{1,2}:\d{2}$/.test(v.end)) return false;
          if (v.end === end) { renderNeedsTable(); return; }
          S.ends = S.ends || {}; S.ends[posId() + '|' + i + '|' + svc] = v.end;
          req('PUT', 'service-ends', { positionId: posId(), weekday: i, service: svc, end: v.end }).then(function (d) { S.ends = d.ends || S.ends; renderNeedsTable(); }, function (err) { fail(err); refresh(); });
        }, function (cell) { cell.appendChild(el('span', 'horaireMuted', tr('Fin'))); cell.appendChild(el('span', null, end)); });
        c.appendChild(endCell);
      };
    };
    needsBox.appendChild(grid('horaireGridNeeds', false, [['Matin', list('matin')], ['Soir', list('soir')]]));
    renderEventsTable();
  }

  // ---------- Événements de la semaine (étape 2, tous les postes) ----------
  // Dans une case Matin ou Soir, chaque événement est une petite carte « Événement N » (« · 40 couverts » s'il vient de l'import) ;
  // ses lignes « Poste · +N » se modifient sur place (poste dans un menu uni, nombre ; enregistrement automatique, 0 retire la ligne) ;
  // « + Ajouter un poste » ajoute une ligne ; la croix .cmpRemove (R32) retire l'événement entier après confirmation rouge.
  // « + Ajouter » sous les cartes crée un événement. La semaine suivante repart vide ; une semaine passée se lit sans se modifier.
  // ---------- Calendrier des événements (étape 2) : Jour | Mois | Année (.cmpSeg, R42), Mois par défaut ----------
  // Mois : grille lundi → dimanche, pastilles « Soir · 3 » (employés en plus) ; un clic sur un jour ouvre la vue Jour. Jour : Matin et Soir
  // avec leurs cartes (saisie à la main). Année : 12 mini-mois, point violet sur les jours qui ont des événements ; un clic ouvre le mois.
  // Un jour passé n'a jamais d'événement (supprimés côté serveur) et ne se modifie pas.
  // ---------- Planchers (Paramètres > Général, sous Besoins) : Serveur, Barman et Commis seulement (menu Poste de la page) ----------
  // Une ligne par plancher (nom modifiable au clic ; croix = suppression confirmée, pour les trois postes) ; une case par jour avec
  // « M n · S n », chaque nombre modifiable au clic (entier ≥ 0, vide = 0). Saisie seule : la génération ne s'en sert pas encore.
  function floorPos() { var p = S.positions.find(function (x) { return x.id === posId(); }); return p && ['serveur', 'barman', 'commis'].indexOf(foldNote(p.name)) >= 0 ? p : null; }
  function floorCount(fid, wd, svc) {
    var c = (S.floorCounts || []).find(function (x) { return x.floorId === fid && x.positionId === posId() && x.weekday === wd && x.service === svc; });
    return c ? c.count : 0;
  }
  function renderFloors() {
    floorsBox.textContent = '';
    bFloors.classList.toggle('hidden', !floorPos());
    if (!floorPos()) return;
    var sheet = el('div', 'horaireSheet horaireFloors');
    var head = sheetRow('horaireSheetHead');
    ['Plancher'].concat(DAYS, ['']).forEach(function (t) { head.appendChild(el('span', 'horaireSheetCell', tr(t))); });
    sheet.appendChild(head);
    var reload = function () { return req('GET', 'floors').then(function (d) { S.floors = d.floors || []; S.floorCounts = d.counts || []; renderFloors(); }); };
    (S.floors || []).forEach(function (f) {
      var row = sheetRow('horaireFloorRow');
      var name = el('span', 'horaireSheetCell horaireSheetEdit');
      editCell(name, f.name, [['name', f.name, 'Plancher']], function (v) {
        var t = String(v.name).trim();
        if (t === f.name) { renderFloors(); return; }
        req('PUT', 'floors/' + f.id, { name: t }).then(reload, function (err) { fail(err); renderFloors(); });
      });
      row.appendChild(name);
      for (var wd = 0; wd < 7; wd++) {
        var cell = el('span', 'horaireSheetCell horaireFloorDay');
        ['matin', 'soir'].forEach(function (svc, k) {
          if (k) cell.appendChild(el('span', 'horaireMuted', '·'));
          var n = floorCount(f.id, wd, svc), day = wd;
          var v = el('span', 'horaireFloorVal horaireSheetEdit');
          editCell(v, '', [['count', n, svc === 'soir' ? 'Soir' : 'Matin', 'number']], function (x) {
            var s = String(x.count).trim(), c = s === '' ? 0 : Number(s);
            if (!(Number.isInteger(c) && c >= 0 && c <= 50)) return false;
            if (c === n) { renderFloors(); return; }
            req('PUT', 'floor-counts', { floorId: f.id, positionId: posId(), weekday: day, service: svc, count: c }).then(function (d) { S.floorCounts = d.counts || S.floorCounts; renderFloors(); }, function (err) { fail(err); renderFloors(); });
          }, function (c) { c.appendChild(el('span', 'horaireMuted', svc === 'soir' ? 'S' : 'M')); c.appendChild(el('span', null, String(n))); });
          cell.appendChild(v);
        });
        row.appendChild(cell);
      }
      var rm = el('span', 'horaireSheetCell horaireSheetRemove');
      rm.appendChild(TMT.ui.removeBtn(function () {
        confirmDelete(tr('Supprimer le plancher') + ' « ' + (f.name || tr('Plancher')) + ' » ?', function () { req('DELETE', 'floors/' + f.id).then(reload, fail); });
      }, tr('Supprimer') + ' ' + f.name));
      row.appendChild(rm);
      sheet.appendChild(row);
    });
    floorsBox.appendChild(sheet);
    var add = TMT.ui.addBtn(tr('Ajouter'), function () {
      req('POST', 'floors', { name: tr('Plancher') + ' ' + ((S.floors || []).length + 1) }).then(reload, fail);
    });
    add.classList.add('horaireFloorAdd');
    floorsBox.appendChild(add);
  }
  function todayIso() { return isoLocal(new Date()); }
  function renderEventsTable() {
    eventsBox.textContent = '';
    var cal = S.cal || (S.cal = { view: 'month', date: S.week < todayIso() ? todayIso() : S.week });
    var past = false;
    var names = S.positions.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr'); });
    var saveLines = function (ev, lines) {
      req('PUT', 'events/' + ev.id, { lines: lines }).then(function (d) {
        var i = S.events.findIndex(function (x) { return x.id === ev.id; });
        if (i >= 0 && d.event) S.events[i] = d.event;
        renderEventsTable();
      }, function (err) { fail(err); refresh(); });
    };
    var lineNode = function (ev, l, i) {
      var key = 'evl:' + ev.id + ':' + i;
      if (S.editing !== key) {
        var label = (l.positionId == null ? '?' : posName(l.positionId)) + ' · +' + l.count;
        var b = btn('horaireEvent', label, function () { if (!past) { S.editing = key; renderEventsTable(); } });
        if (past) b.disabled = true;
        return b;
      }
      var delLine = function () {
        confirmDelete(tr('Supprimer cette ligne') + ' (' + (l.positionId == null ? '?' : posName(l.positionId)) + ' · +' + l.count + ') ?', function () {
          var lines = (ev.lines || []).map(function (x) { return { positionId: x.positionId == null ? posId() : x.positionId, count: x.count }; });
          lines.splice(i, 1);
          saveLines(ev, lines);
        }, renderEventsTable);
      };
      var ed = el('div', 'horaireEvEdit');
      var pick = el('select', 'horaireInput'); pick.setAttribute('aria-label', tr('Poste'));
      names.forEach(function (p) { var o = el('option', null, p.name); o.value = String(p.id); pick.appendChild(o); });
      pick.value = String(l.positionId == null ? posId() : l.positionId);
      var n = el('input', 'horaireInput'); n.type = 'number'; n.min = '0'; n.max = '50'; n.inputMode = 'numeric'; n.value = String(l.count); n.setAttribute('aria-label', tr('Nombre'));
      var save = function () {
        var c = Number(n.value);
        if (!(Number.isInteger(c) && c >= 0 && c <= 50)) return;
        var lines = (ev.lines || []).map(function (x) { return { positionId: x.positionId == null ? posId() : x.positionId, count: x.count }; });
        if (c === 0) { S.editing = null; delLine(); return; }
        lines[i] = { positionId: Number(pick.value), count: c };
        saveLines(ev, lines);
      };
      pick.addEventListener('change', save);
      n.addEventListener('change', save);
      n.addEventListener('keydown', function (k) { if (k.key === 'Enter') { k.preventDefault(); S.editing = null; save(); } });
      ed.appendChild(pick); ed.appendChild(n);
      ed.appendChild(keepFocus(TMT.ui.removeBtn(function () { S.editing = null; delLine(); }, tr('Supprimer'))));
      setTimeout(function () { n.focus(); n.select(); }, 0);
      return ed;
    };
    var fillService = function (day, svc, c) {
      {
        past = day < todayIso();
        S.events.filter(function (e) { return e.day === day && e.service === svc; }).forEach(function (ev, k) {
          var card = el('div', 'horaireEvCard');
          var head = el('div', 'horaireEvHead');
          head.appendChild(el('span', null, tr('Événement') + ' ' + (k + 1) + (ev.covers ? ' · ' + ev.covers + ' ' + tr('couverts') : '')));
          if (!past) {
            head.appendChild(TMT.ui.removeBtn(function () {
              confirmDelete(tr('Supprimer cet événement ?'), function () { req('DELETE', 'events/' + ev.id).then(refresh, fail); });
            }, tr('Retirer l’événement')));
          }
          card.appendChild(head);
          (ev.lines || []).forEach(function (l, j) { card.appendChild(lineNode(ev, l, j)); });
          if (!past) {
            card.appendChild(TMT.ui.addBtn(tr('Ajouter un poste'), function () {
              var lines = (ev.lines || []).map(function (x) { return { positionId: x.positionId == null ? posId() : x.positionId, count: x.count }; });
              lines.push({ positionId: posId(), count: 1 });
              S.editing = 'evl:' + ev.id + ':' + (lines.length - 1);
              saveLines(ev, lines);
            }));
          }
          c.appendChild(card);
        });
        if (past) return;
        var add = TMT.ui.addBtn(tr('Ajouter'), function () {
          req('POST', 'events', { day: day, service: svc, lines: [] }).then(refresh, fail);
        });
        add.classList.add('horaireEvAdd');
        c.appendChild(add);
      }
    };
    // Employés en plus d'un service (somme des lignes de ses événements).
    var extraOf = function (day, svc) {
      var n = 0;
      S.events.forEach(function (ev) { if (ev.day === day && ev.service === svc) (ev.lines || []).forEach(function (l) { n += l.count; }); });
      return n;
    };
    var hasEvents = function (day) { return S.events.some(function (e) { return e.day === day && e.service; }); };
    var ymd = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };
    var go = function (view, date) { cal.view = view; cal.date = date; S.editing = null; renderEventsTable(); };
    var seg = el('div', 'cmpSeg horaireCalSeg'); seg.setAttribute('role', 'tablist');
    [['day', 'Jour'], ['month', 'Mois'], ['year', 'Année']].forEach(function (v) {
      var b = btn(cal.view === v[0] ? 'active' : '', v[1], function () { go(v[0], cal.date); });
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', cal.view === v[0] ? 'true' : 'false');
      seg.appendChild(b);
    });
    eventsBox.appendChild(seg);
    var nav = function (label, prev, next) {
      var n = el('div', 'horaireWeek horaireCalNav');
      var p = btn('horaireNav', '‹', prev); p.setAttribute('aria-label', tr('Précédent'));
      var x = btn('horaireNav', '›', next); x.setAttribute('aria-label', tr('Suivant'));
      n.appendChild(p); n.appendChild(el('span', 'horaireWeekLabel', label)); n.appendChild(x);
      return n;
    };
    var d0 = new Date(cal.date + 'T00:00:00Z'), y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    var daysIn = function (yy, mm) { return new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(); };
    var monthGrid = function (yy, mm, mini) {
      var g = el('div', mini ? 'horaireCalGrid horaireCalMini' : 'horaireCalGrid');
      DAYS_SHORT.forEach(function (w) { g.appendChild(el('span', 'horaireCalHead', mini ? tr(w).charAt(0).toUpperCase() : tr(w))); });
      var lead = weekdayOf(ymd(yy, mm, 1));
      for (var k = 0; k < lead; k++) g.appendChild(el('span', 'horaireCalBlank'));
      for (var dd = 1; dd <= daysIn(yy, mm); dd++) {
        var day = ymd(yy, mm, dd), isPast = day < todayIso();
        if (mini) { var s = el('span', 'horaireCalMiniDay' + (hasEvents(day) && !isPast ? ' on' : ''), String(dd)); g.appendChild(s); continue; }
        var b = el('button', 'horaireCalDay' + (isPast ? ' past' : '') + (day === todayIso() ? ' today' : '')); b.type = 'button';
        b.appendChild(el('span', 'horaireCalNum', String(dd)));
        if (!isPast) ['matin', 'soir'].forEach(function (svc) { var n = extraOf(day, svc); if (n || S.events.some(function (e) { return e.day === day && e.service === svc; })) b.appendChild(el('span', 'horaireCalPill', tr(svc === 'soir' ? 'Soir' : 'Matin') + ' · ' + n)); });
        if (isPast) b.disabled = true; else b.addEventListener('click', (function (dday) { return function () { go('day', dday); }; })(day));
        g.appendChild(b);
      }
      return g;
    };
    if (cal.view === 'month') {
      eventsBox.appendChild(nav(tr(MONTHS_LONG[m]).replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + y,
        function () { go('month', ymd(m ? y : y - 1, (m + 11) % 12, 1)); }, function () { go('month', ymd(m === 11 ? y + 1 : y, (m + 1) % 12, 1)); }));
      var frame = el('div', 'horaireFrame cmpGlass'); frame.appendChild(monthGrid(y, m, false)); eventsBox.appendChild(frame);
    } else if (cal.view === 'year') {
      eventsBox.appendChild(nav(String(y), function () { go('year', ymd(y - 1, 0, 1)); }, function () { go('year', ymd(y + 1, 0, 1)); }));
      var yearBox = el('div', 'horaireCalYear');
      for (var mm = 0; mm < 12; mm++) {
        var mb = el('button', 'horaireCalMonth cmpGlass'); mb.type = 'button';
        mb.appendChild(el('span', 'horaireCalMonthName', tr(MONTHS_LONG[mm]).replace(/^./, function (c) { return c.toUpperCase(); })));
        mb.appendChild(monthGrid(y, mm, true));
        mb.addEventListener('click', (function (k) { return function () { go('month', ymd(y, k, 1)); }; })(mm));
        yearBox.appendChild(mb);
      }
      eventsBox.appendChild(yearBox);
    } else {
      var dday = cal.date;
      eventsBox.appendChild(nav(dayLabel(dday, true), function () { go('day', addDays(dday, -1)); }, function () { go('day', addDays(dday, 1)); }));
      var dayBox = el('div', 'horaireCalDayView');
      [['matin', 'Matin'], ['soir', 'Soir']].forEach(function (v) {
        var col = el('div', 'horaireCalSvc horaireFrame cmpGlass');
        col.appendChild(el('p', 'horaireCalSvcName', tr(v[1])));
        if (dday < todayIso()) col.appendChild(el('p', 'horaireMuted', tr('Date passée.')));
        else fillService(dday, v[0], col);
        dayBox.appendChild(col);
      });
      eventsBox.appendChild(dayBox);
    }
  }

  // ---------- disponibilités de la semaine (lues pour la liste d'un trou) ----------
  // État d'un service : O disponible (une plage recoupe 10:00–16:00 ou 16:00–23:59), V congé (journée entière), sinon N.
  function myIntervals(id) { return S.avail.filter(function (a) { return a.employeeId === id; }); }
  function myTimeoff(id) { return (S.timeoff || []).filter(function (t) { return t.employeeId === id; }).map(function (t) { return t.day; }); }
  function svcRange(svc) { return [toMin(SLOT[svc][0]), svc === 'soir' ? 1440 : toMin(SLOT[svc][1])]; }
  function ivRange(a) { var s = toMin(a.start), e = toMin(a.end); if (e <= s || a.end === '23:59') e = 1440; return [s, e]; }
  function cellState(id, day, svc) {
    if (myTimeoff(id).indexOf(day) >= 0) return 'V';
    var w = svcRange(svc);
    return myIntervals(id).some(function (a) { if (a.day !== day) return false; var r = ivRange(a); return r[0] < w[1] && r[1] > w[0]; }) ? 'O' : 'N';
  }

  // ---------- Classification des employés : un tableau par catégorie (catégorie = meilleur rang de qualification) ----------
  // Au-dessus de chaque tableau, son titre « Catégorie N » (.cmpBlockTitle, R41). Colonnes : ≡ | Nom | Heures min | Heures max | Cible | Note.
  // Chaque case se modifie au clic, enregistrement automatique (Entrée ou sortie du champ), Échap annule ; min ≤ max (la cible est libre), sinon la case
  // est soulignée en violet clair et rien n'est enregistré ; nom vidé = retirer l'employé (confirmation). La note est une seule case de texte :
  // la génération y reconnaît « jamais de double », « repos après un quart », « pas de matin », « pas de soir », « soirs d'abord »,
  // « matins d'abord » ; le reste part dans le prompt et dans « À vérifier ». Le ≡ fait glisser un nom d'un tableau à l'autre (TMT.ui.groupDrag).
  // G5 : colonnes Nom | Heures min | Heures cible | Heures max | Note.
  var HOURS = [['wantHoursMin', 'Heures min'], ['wantHoursTarget', 'Heures cible'], ['wantHoursMax', 'Heures max']];
  // Catégorie d'un employé = son rang au poste choisi (null s'il n'a pas ce poste).
  function bestRank(id) {
    var q = S.quals.find(function (x) { return x.employeeId === id && x.positionId === posId(); });
    return q ? q.rank : null;
  }
  // Poste choisi (étapes 1 et 3) : mémorisé sur l'appareil ; par défaut Serveur.
  function posId() {
    var want = Number(S.posId || localStorage.getItem('horairePoste'));
    if (S.positions.some(function (p) { return p.id === want; })) return want;
    var srv = S.positions.find(function (p) { return /^serveur$/i.test(p.name); });
    return srv ? srv.id : (S.positions[0] && S.positions[0].id);
  }
  // Menu déroulant du poste : même composant que le filtre Tous / Public / Confidentiel des Statistiques (.statsPeriodMenuWrap,
  // .caSubProjectBtn, .statsPeriodMenu, menu uni R31 ; fermeture au clic dehors par app.js). Options dans l'ordre alphabétique.
  var posPickers = [];
  function posPicker() {
    var wrap = el('div', 'statsPeriodMenuWrap caSubProjectFilter horairePosPicker');
    var b = el('button', 'caSubProjectBtn'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false');
    var label = el('span'); b.appendChild(label);
    var menuEl = el('div', 'statsPeriodMenu caSubProjectMenu hidden');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menuEl.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (open) menuEl.classList.remove('hidden');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menuEl.addEventListener('click', function (e) {
      var it = e.target.closest('.statsPeriodMenuItem'); if (!it) return;
      menuEl.classList.add('hidden'); b.setAttribute('aria-expanded', 'false');
      var id = Number(it.dataset.pos);
      if (id === posId()) return;
      S.posId = id; try { localStorage.setItem('horairePoste', String(id)); } catch (err) { /* stockage indisponible : choix pour cette visite */ }
      S.editing = null; S.addingRank = null; closeMenu();
      renderPosPickers(); renderCats(); renderNeedsTable(); renderFloors(); renderSchedule();
    });
    wrap.appendChild(b); wrap.appendChild(menuEl);
    posPickers.push({ label: label, menu: menuEl });
    return wrap;
  }
  function renderPosPickers() {
    var list = S.positions.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr'); });
    var cur = posId();
    posPickers.forEach(function (p) {
      var name = (S.positions.find(function (x) { return x.id === cur; }) || {}).name || '';
      p.label.textContent = name;
      p.menu.textContent = '';
      list.forEach(function (x) {
        var it = el('button', 'statsPeriodMenuItem' + (x.id === cur ? ' active' : ''), x.name); it.type = 'button'; it.dataset.pos = String(x.id);
        p.menu.appendChild(it);
      });
    });
  }
  function hOrNull(v) { v = String(v == null ? '' : v).trim().replace(',', '.'); return v === '' ? null : Number(v); }
  function hoursValid(lo, tg, hi) {
    var ok = function (n) { return n == null || (isFinite(n) && n >= 0 && n <= 168); };
    if (!ok(lo) || !ok(tg) || !ok(hi)) return false;
    // La cible est la volonté de l'employé (décision d'Émilien, 28 oct. 2026) : aucune contrainte avec le min ou le max.
    return !(lo != null && hi != null && lo > hi);
  }
  function hoursText(v) { return v == null ? '' : String(v).replace('.', ','); }
  // Lecture de la note (même règle que server/lib/horaire-note.js) : le texte libre restant, sans les six expressions reconnues.
  var NOTE_RULES = ['jamais de double', 'repos apres un quart', 'pas de matin', 'pas de soir', "soirs d'abord", "matins d'abord"];
  function foldNote(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim(); }
  function noteRest(note) {
    return String(note || '').split(/[;\n]/).map(function (p) { return p.trim(); }).filter(function (p) {
      return p && NOTE_RULES.indexOf(foldNote(p).replace(/[.!]+$/, '')) < 0;
    }).join(' ; ');
  }
  // Poste principal du compte (créé « Serveur » côté serveur s'il manque) : ajout d'un employé, besoins.
  function mainPosition() {
    if (S.positions[0]) return Promise.resolve(S.positions[0]);
    return req('POST', 'main-position', {}).then(function (d) { S.positions = [d.position]; return d.position; });
  }
  // Cellule modifiable : fields = [[clé, valeur, libellé, type]] ; save(valeurs) renvoie false si invalide (rien n'est envoyé).
  // show(cell) : affichage personnalisé de la cellule au repos (sinon le texte) ; fields[i][4] : séparateur avant le champ i (sinon « – »).
  // remove() : facultatif ; la croix officielle .cmpRemove (R43) apparaît en haut à droite de la cellule ouverte et supprime sans confirmation.
  // La croix ne prend pas le focus : le champ ouvert ne se ferme pas (ni enregistrement ni redessin) avant le clic.
  // Toute suppression passe par cette confirmation (décision d'Émilien, 28 oct. 2026, R43) : bouton rouge « Supprimer » ; refus = rien
  // n'est supprimé, l'ancienne valeur revient (back).
  function confirmDelete(msg, done, back) {
    TMT.ui.confirm(msg, { ok: tr('Supprimer'), danger: true }).then(function (yes) { if (yes) done(); else if (back) back(); });
  }
  function keepFocus(b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); }); b.addEventListener('mousedown', function (e) { e.preventDefault(); }); return b; }
  function editCell(cell, text, fields, save, show, remove) {
    var paint = function () { cell.textContent = ''; if (show) show(cell); else cell.textContent = text; };
    paint();
    cell.tabIndex = 0;
    var open = function () {
      if (cell.classList.contains('editing')) return;
      cell.classList.add('editing'); cell.textContent = '';
      var ins = fields.map(function (f, i) {
        var x = el('input', 'horaireSheetInput'); x.type = f[3] || 'text'; x.value = f[1] == null ? '' : f[1]; x.setAttribute('aria-label', tr(f[2]));
        if (f[3] === 'hours') { x.type = 'text'; x.inputMode = 'decimal'; x.value = hoursText(f[1]); }
        if (i) cell.appendChild(el('span', 'horaireMuted', f[4] || '–'));
        cell.appendChild(x);
        return x;
      });
      var done = false;
      if (remove) {
        var rm = TMT.ui.removeBtn(function (ev) { ev.stopPropagation(); if (done) return; done = true; remove(); }, tr('Supprimer'));
        rm.classList.add('horaireCellRemove');
        keepFocus(rm);
        cell.appendChild(rm);
      }
      var finish = function (keep) {
        if (done) return;
        if (!keep) { done = true; cell.classList.remove('editing', 'invalid'); paint(); setTimeout(flushCats, 0); return; }
        var vals = {}; fields.forEach(function (f, i) { vals[f[0]] = ins[i].value; });
        if (save(vals) === false) {
          // Refus de validation : la saisie reste dans la cellule (soulignée) et le motif s'affiche ; rien n'est perdu ni envoyé.
          cell.classList.add('invalid');
          showCellMsg(cell, tr(cell.dataset.why || 'Valeur refusée : corrige-la ou appuie sur Échap.'));
          return;
        }
        done = true; showCellMsg(cell, '');
        // La valeur saisie reste affichée telle quelle jusqu'au prochain dessin de la grille.
        cell.classList.remove('editing', 'invalid');
        cell.textContent = fields.map(function (f, i) { return f[3] === 'hours' ? hoursText(hOrNull(ins[i].value)) : ins[i].value; }).join(fields.length > 1 ? ' ' + (fields[1][4] || '–') + ' ' : '');
        setTimeout(flushCats, 0);
      };
      ins.forEach(function (x) {
        x.addEventListener('keydown', function (k) {
          if (k.key === 'Enter') { k.preventDefault(); k.stopPropagation(); finish(true); }
          else if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); finish(false); }
        });
      });
      cell.addEventListener('focusout', function (fo) { if (!done && !cell.contains(fo.relatedTarget)) finish(true); });
      ins[0].focus(); if (ins[0].select) ins[0].select();
    };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', function (k) { if (k.key === 'Enter' && k.target === cell && !cell.classList.contains('editing')) open(); });
  }
  // Motif d'un refus : juste au-dessus des tableaux de la classification (sinon dans le message de la page).
  function showCellMsg(cell, text) {
    if (catsMsg && catsBox.contains(cell)) { catsMsg.textContent = text; catsMsg.classList.toggle('hidden', !text); return; }
    if (text) { S.msg = text; renderMsg(); }
  }
  // Enregistrement d'UN champ : appliqué tout de suite à l'état local (la saisie suivante se valide sur la valeur la plus récente),
  // puis envoyé seul (PUT partiel) ; en cas d'erreur, l'état revient à la valeur du serveur.
  function putEmployee(e, body) {
    var cur = S.employees.find(function (x) { return x.id === e.id; });
    if (cur) Object.keys(body).forEach(function (k) { cur[k] = body[k]; });
    return req('PUT', 'employees/' + e.id, body).then(function (d) {
      var i = S.employees.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0 && d.employee) S.employees[i] = d.employee;
      renderCats();
    }, function (err) { fail(err); refresh(); });
  }
  function removeEmployee(e) {
    TMT.ui.confirm(tr('Supprimer') + ' ' + e.name + ' ' + tr('de l’horaire ?'), { ok: tr('Supprimer'), danger: true }).then(function (yes) {
      if (!yes) { renderCats(); return; }
      // Retrait de l'horaire (pas une suppression) : inactif, quarts à venir retirés, semaines passées intactes.
      req('POST', 'employees/' + e.id + '/retire', { today: isoLocal(new Date()) }).then(refresh, function (err) { fail(err); renderCats(); });
    });
  }
  function sheetRow(cls) { return el('div', 'horaireSheetRow ' + (cls || '')); }
  // Une saisie en cours n'est jamais effacée : si une cellule est ouverte, le redessin attend qu'elle soit fermée (flushCats).
  function flushCats() { if (S.catsDirty) renderCats(); }
  function renderCats() {
    if (catsBox.querySelector('.editing:not(.horaireSheetNew)')) { S.catsDirty = true; return; }
    S.catsDirty = false;
    catsBox.textContent = '';
    var emps = S.employees.filter(function (e) { return e.active !== false && bestRank(e.id) != null; });
    var top = 4; emps.forEach(function (e) { var r = bestRank(e.id); if (r && r > top) top = Math.min(r, MAX_RANK); });
    var ranks = []; for (var r = 1; r <= top; r++) ranks.push(r);
    ranks.forEach(function (rank) {
      var block = el('div', 'horaireCatBlock');
      block.appendChild(el('p', 'cmpBlockTitle', rank == null ? tr('Sans catégorie') : tr('Catégorie') + ' ' + rank));
      var frame = el('div', 'horaireFrame cmpGlass');
      var sheet = el('div', 'horaireSheet horaireSheetGroup'); sheet.dataset.rank = rank == null ? '' : String(rank);
      var head = sheetRow('horaireSheetHead');
      ['', 'Nom'].concat(HOURS.map(function (h) { return h[1]; }), ['Note', '']).forEach(function (t, i) {
        var hc = el('span', 'horaireSheetCell' + (i > 1 && i < 5 ? ' horaireSheetNum' : ''), tr(t));
        // Sous « Note » (premier tableau seulement) : les expressions que la génération reconnaît, en petite ligne grise.
        head.appendChild(hc);
      });
      sheet.appendChild(head);
      catEmployees(emps, rank).forEach(function (e) {
        var row = sheetRow('horaireSheetEmp'); row.dataset.employeeId = String(e.id);
        var hc = el('span', 'horaireSheetCell horaireSheetHandle');
        var handle = el('span', 'activityDragHandle horaireHandle', '≡'); handle.setAttribute('aria-hidden', 'true');
        hc.appendChild(handle); row.appendChild(hc);
        var name = el('span', 'horaireSheetCell horaireSheetEdit');
        name.dataset.why = 'Ce nom existe déjà.';
        editCell(name, e.name, [['name', e.name, 'Nom']], function (v) {
          var n = String(v.name).trim();
          if (!n) { removeEmployee(e); return; }
          if (nameTaken(n, e.id)) return false;
          if (n !== e.name) putEmployee(e, { name: n }); else renderCats();
        });
        row.appendChild(name);
        HOURS.forEach(function (hk) {
          var c = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNum');
          c.dataset.why = 'Heures : il faut min ≤ max. Corrige la valeur ou appuie sur Échap.';
          editCell(c, hoursText(e[hk[0]]), [[hk[0], e[hk[0]], hk[1], 'hours']], function (v) {
            var val = hOrNull(v[hk[0]]);
            var cur = S.employees.find(function (x) { return x.id === e.id; }) || e; // valeurs les plus récentes (une autre case a pu changer)
            var next = { wantHoursMin: cur.wantHoursMin, wantHoursTarget: cur.wantHoursTarget, wantHoursMax: cur.wantHoursMax }; next[hk[0]] = val;
            if (!hoursValid(next.wantHoursMin, next.wantHoursTarget, next.wantHoursMax)) return false;
            var body = {}; body[hk[0]] = val;
            if (val !== cur[hk[0]]) putEmployee(e, body); else renderCats();
          });
          if (!hoursValid(e.wantHoursMin, e.wantHoursTarget, e.wantHoursMax)) c.classList.add('invalid');
          row.appendChild(c);
        });
        var note = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNote');
        editCell(note, e.constraintNote || '', [['note', e.constraintNote, 'Note']], function (v) {
          var t = String(v.note).trim();
          if (t !== (e.constraintNote || '')) putEmployee(e, { constraintNote: t }); else renderCats();
        });
        row.appendChild(note);
        var rmCell = el('span', 'horaireSheetCell horaireSheetRemove');
        rmCell.appendChild(TMT.ui.removeBtn(function () { removeEmployee(e); }, tr('Retirer') + ' ' + e.name));
        row.appendChild(rmCell);
        bindCatDrag(handle, row, sheet);
        sheet.appendChild(row);
      });
      frame.appendChild(sheet);
      block.appendChild(frame);
      if (rank != null) block.appendChild(addEmployeeRow(rank));
      catsBox.appendChild(block);
    });
    var open = catsBox.querySelector('.horaireSheetNew input');
    if (open) open.focus();
  }
  // Sous chaque tableau : « + Ajouter un employé » en pointillé (R33). Un clic ouvre la saisie du nom ; Entrée crée l'employé dans cette
  // catégorie (qualification au poste principal, créé s'il manque ; rang = catégorie) et rouvre aussitôt une ligne vide ; Échap ou sortie
  // sans nom annule.
  function addEmployeeRow(rank) {
    if (S.addingRank !== rank) return TMT.ui.addBtn(tr('Ajouter un employé'), function () { S.addingRank = rank; renderCats(); });
    var row = el('div', 'horaireSheetNew');
    var x = el('input', 'horaireSheetInput'); x.type = 'text'; x.maxLength = 80; x.placeholder = tr('Nom'); x.setAttribute('aria-label', tr('Nouvel employé'));
    row.appendChild(x);
    var busy = false, closed = false;
    var stop = function () { closed = true; S.addingRank = null; renderCats(); };
    var create = function (again) {
      var name = x.value.trim();
      if (!name) { stop(); return; }
      if (busy || closed) return;
      if (nameTaken(name)) { catsMsg.textContent = tr('Ce nom existe déjà.'); catsMsg.classList.remove('hidden'); x.classList.add('invalid'); return; }
      busy = true;
      var emp;
      Promise.resolve({ id: posId() }).then(function (pos) {
        return req('POST', 'employees', { name: name }).then(function (d) {
          emp = d.employee;
          return req('PUT', 'qualifications', { employeeId: emp.id, positionId: pos.id, rank: rank });
        }).then(function (q) {
          S.employees.push(emp);
          S.quals.push(q && q.qualification ? q.qualification : { employeeId: emp.id, positionId: pos.id, rank: rank });
        });
      }).then(function () { S.addingRank = again ? rank : null; renderCats(); }, function (err) { busy = false; fail(err); });
    };
    x.addEventListener('keydown', function (k) {
      if (k.key === 'Enter') { k.preventDefault(); create(true); }
      else if (k.key === 'Escape') { k.preventDefault(); stop(); }
    });
    x.addEventListener('blur', function () { if (!busy && !closed) create(false); });
    return row;
  }
  // Employés d'une catégorie, dans l'ordre enregistré (sortOrder), puis par nom.
  // G3 : même nom qu'un autre employé actif (casse et accents ignorés).
  function nameTaken(n, exceptId) {
    var k = foldNote(n);
    return S.employees.some(function (x) { return x.active !== false && x.id !== exceptId && foldNote(x.name) === k; });
  }
  function catEmployees(emps, rank) {
    return emps.filter(function (e) { return bestRank(e.id) === rank; }).sort(function (a, b) {
      var x = a.sortOrder == null ? Infinity : a.sortOrder, y = b.sortOrder == null ? Infinity : b.sortOrder;
      return x - y || String(a.name).localeCompare(String(b.name), 'fr');
    });
  }
  // Glisser-déposer à la poignée ≡, active en tout temps : mécanique commune TMT.ui.groupDrag (celle des secteurs, R27/R29), trait
  // d'insertion compris. Même catégorie = nouvel ordre ; autre catégorie = nouveau rang (qualifications de meilleur rang) + place.
  function saveCatOrder(ids) {
    return Promise.all(ids.map(function (id, i) {
      var e = S.employees.find(function (x) { return x.id === id; });
      return e && e.sortOrder === i ? null : req('PUT', 'employees/' + id, { sortOrder: i });
    }));
  }
  function bindCatDrag(handle, row, group) {
    var id = Number(row.dataset.employeeId);
    TMT.ui.groupDrag(handle, row, {
      list: function () { return catsBox; }, groupSel: '.horaireSheetGroup[data-rank]:not([data-rank=""])',
      rowsWrap: function (g) { return g; }, rowSel: '.horaireSheetEmp', wrap: group,
      lineClass: 'catDropLine', targetClass: 'catDropTarget',
      onReorder: function (rows) { saveCatOrder(rows.map(function (r) { return Number(r.dataset.employeeId); })).then(refresh, fail); },
      onMoveTo: function (wrap, index) {
        var to = Number(wrap.dataset.rank), from = bestRank(id);
        var ids = Array.prototype.map.call(wrap.querySelectorAll('.horaireSheetEmp'), function (r) { return Number(r.dataset.employeeId); });
        ids.splice(index, 0, id);
        var calls = [{ employeeId: id, positionId: posId(), rank: to }]; // catégorie = rang au poste choisi
        Promise.all(calls.map(function (b) { return req('PUT', 'qualifications', b); })).then(function () { return saveCatOrder(ids); }).then(refresh, fail);
      },
    });
  }

  // ---------- Horaire de la semaine : un bouton par quart, liste déroulante unie pour changer la personne ----------
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', closeMenu, true); } }
  function outside(ev) { if (menu && !menu.contains(ev.target)) closeMenu(); }
  function placeMenu(anchor) {
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect(), mh = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + mh > vh - 8 ? Math.max(8, r.top - 4 - mh) : r.bottom + 4) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); window.addEventListener('scroll', closeMenu, true); }, 0);
  }
  function newMenu(anchor) {
    var same = menu && menu._for === anchor; closeMenu(); if (same) return false;
    menu = el('div', 'horaireMenu'); menu._for = anchor; menu.setAttribute('role', 'menu');
    return true;
  }
  // Employés d'un créneau (G1), calculés par le serveur avec les mêmes règles que la génération : en tête les possibles, puis, en
  // gris, les autres avec leur raison (« (en congé) », « (indisponible) », « (au max) », « (repos) », « (double) », « (déjà placé) »,
  // « (note : …) »). Un employé en gris reste possible : son placement ajoute une ligne « À vérifier ». order(list) : ordre des gris.
  function candidateItems(slot, except, onPick, current, order) {
    var q = 'weeks/' + S.week + '/candidates?positionId=' + slot.positionId + '&day=' + slot.day + '&start=' + encodeURIComponent(slot.start)
      + '&end=' + encodeURIComponent(slot.end) + (except ? '&except=' + except : '');
    return req('GET', q).then(function (d) {
      var list = d.candidates || [];
      if (order) list = order(list);
      return list.map(function (c) {
        var grey = c.why && c.why.length;
        var it = btn('horaireMenuItem' + (grey ? ' horaireMenuGrey' : '') + (c.employeeId === current ? ' on' : ''), c.name, function () { onPick(c); });
        if (grey) it.appendChild(el('span', null, ' (' + tr(c.why[0]) + ')'));
        it.setAttribute('role', 'menuitem');
        return it;
      });
    });
  }
  function afterEdit() { return loadWeek().then(render); }
  function openMenu(anchor, a) {
    if (!newMenu(anchor)) return;
    var m = menu;
    var pick = function (id) {
      closeMenu();
      (id == null ? req('DELETE', 'weeks/' + S.week + '/assignments/' + a.id) : req('PUT', 'weeks/' + S.week + '/assignments/' + a.id, { employeeId: id })).then(afterEdit, fail);
    };
    candidateItems(a, a.id, function (c) { if (c.employeeId !== a.employeeId) pick(c.employeeId); else closeMenu(); }, a.employeeId).then(function (items) {
      if (menu !== m) return;
      items.forEach(function (it) { m.appendChild(it); });
      var rm = btn('horaireMenuItem horaireMenuRemove', 'Supprimer le quart', function () {
        closeMenu();
        confirmDelete(tr('Supprimer ce quart') + ' (' + tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + a.start + ', ' + a.employeeName + ') ?', function () { pick(null); });
      }); rm.setAttribute('role', 'menuitem');
      m.appendChild(rm);
      placeMenu(anchor);
    }, function (err) { closeMenu(); fail(err); });
  }
  // Fin d'un trou : la fin de son service ce jour-là (comme tout quart).
  function holeEnd(h) { return endFor(h.positionId, weekdayOf(h.day), serviceOf(h.start)); }
  // Trou « À combler » : même liste ; parmi les gris, les « à demander » (règle 9) d'abord, dans l'ordre de la génération.
  function openHoleMenu(anchor, h) {
    if (!newMenu(anchor)) return;
    var m = menu, end = holeEnd(h), ask = h.ask || [];
    var order = function (list) {
      var k = function (c) { var i = ask.indexOf(c.employeeId); return c.why.length ? (i >= 0 ? 1 + i / 1000 : 2) : 0; };
      return list.map(function (c, i) { return [c, i]; }).sort(function (x, y) { return (k(x[0]) - k(y[0])) || (x[1] - y[1]); }).map(function (x) { return x[0]; });
    };
    candidateItems({ positionId: h.positionId, day: h.day, start: h.start, end: end }, null, function (c) {
      closeMenu();
      req('POST', 'weeks/' + S.week + '/assignments', { employeeId: c.employeeId, positionId: h.positionId, day: h.day, start: h.start, end: end }).then(afterEdit, fail);
    }, null, order).then(function (items) {
      if (menu !== m) return;
      items.forEach(function (it) { m.appendChild(it); });
      placeMenu(anchor);
    }, function (err) { closeMenu(); fail(err); });
  }
  function shiftBtn(a) {
    var b = el('button', 'horaireSlot'); b.type = 'button';
    b.appendChild(el('span', 'horaireMuted', a.start)); b.appendChild(el('span', 'horaireGrow', a.employeeName)); b.appendChild(el('span', 'horaireMuted', '▾'));
    b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function () { openMenu(b, a); });
    return b;
  }
  function hole(h) {
    var b = el('button', 'horaireSlot horaireHole'); b.type = 'button';
    b.appendChild(el('span', null, h.start)); b.appendChild(el('span', 'horaireGrow', tr('À combler'))); b.appendChild(el('span', null, '▾'));
    b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function () { openHoleMenu(b, h); });
    return b;
  }
  // Trous recalculés ici (besoins − quarts placés, par jour, poste et heure d'arrivée) : un quart ajouté à la main comble son trou
  // aussitôt, même si les alertes du serveur ne sont pas recalculées.
  function computeHoles(sc) {
    var holes = [];
    for (var i = 0; i < 7; i++) {
      var day = addDays(S.week, i), want = {};
      daySource(i).forEach(function (n) { var k = n.positionId + '|' + n.start; if (!want[k]) want[k] = { positionId: n.positionId, day: day, start: n.start, end: n.end, missing: 0 }; want[k].missing += Number(n.count) || 0; });
      sc.assignments.forEach(function (a) { var k = a.positionId + '|' + a.start; if (a.day === day && want[k]) want[k].missing -= 1; });
      Object.keys(want).forEach(function (k) { if (want[k].missing > 0) holes.push(want[k]); });
    }
    // Candidats « à demander » (règle 9) calculés par la génération pour le même trou (poste, jour, heure d'arrivée).
    holes.forEach(function (h) {
      var a = (sc.alerts || []).find(function (x) { return x.type === 'trou' && x.positionId === h.positionId && x.day === h.day && x.start === h.start; });
      h.ask = (a && a.ask) || [];
    });
    return holes;
  }
  function renderSchedule() {
    closeMenu();
    var sc = S.schedule;
    planBox.textContent = ''; alertsBox.textContent = '';
    if (!sc) {
      var ready = S.employees.length && S.positions.length && S.needs.length;
      planBox.appendChild(el('p', 'horaireEmpty', ready ? tr('Aucun horaire pour cette semaine. Touche « Générer l’horaire ».') : tr('Ajoute tes employés et tes besoins à l’étape 1.')));
      return;
    }
    var holes = computeHoles(sc);
    var cell = function (svc) {
      return function (i, c) {
        var day = addDays(S.week, i), items = [];
        sc.assignments.forEach(function (a) { if (a.positionId === posId() && a.day === day && serviceOf(a.start) === svc) items.push([a.start, 0, a]); });
        holes.forEach(function (h) { if (h.positionId === posId() && h.day === day && serviceOf(h.start) === svc) for (var k = 0; k < (h.missing || 1); k++) items.push([h.start, 1, null, h]); });
        items.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; });
        items.forEach(function (x) {
          if (x[2]) { c.appendChild(shiftBtn(x[2])); return; }
          c.appendChild(hole(x[3]));
          // Ligne grise sous le trou : jusqu'à 3 noms « à demander » (règle 9).
          var names = (x[3].ask || []).map(function (id) { var e = S.employees.find(function (y) { return y.id === id; }); return e && e.name; }).filter(Boolean).slice(0, 3);
          if (names.length) c.appendChild(el('span', 'horaireAsk', tr('À demander :') + ' ' + names.join(', ')));
        });
      };
    };
    planBox.appendChild(grid('horaireGridPlan', true, [['Matin', cell('matin'), 'horaireCellPlan'], ['Soir', cell('soir'), 'horaireCellPlan']]));
    // Note des employés placés, sans ses expressions reconnues : la génération ne la lit pas, on la rappelle ici (en tête).
    var placed = {}; sc.assignments.forEach(function (a) { if (a.positionId === posId()) placed[a.employeeId] = a.employeeName; });
    S.employees.filter(function (e) { return placed[e.id]; }).forEach(function (e) {
      var rest = noteRest(e.constraintNote);
      if (rest) alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + tr('note de') + ' ' + e.name + ' : “' + rest + '”'));
    });
    var key = function (a) { return a.type === 'trou' ? '0' + a.day + a.start : '1'; };
    (sc.alerts || []).filter(function (a) { return a.type !== 'trou' || a.positionId === posId(); }).sort(function (x, y) { return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0; }).forEach(function (a) { alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + alertText(a))); });
  }
  function alertText(a) {
    if (a.type === 'trou') {
      var n = a.missing || 1, pos = String(a.positionName || tr('personne')).toLowerCase();
      if (n > 1 && !/[sx]$/.test(pos)) pos += 's';
      return tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + ', ' + n + ' ' + pos + ' ' + tr(n > 1 ? 'manquants' : 'manquant') + ' ' + tr('à') + ' ' + a.start + '.';
    }
    if (a.type === 'demander') return tr('demander à') + ' ' + (a.employeeName || '?') + ' ' + tr('s’il peut travailler') + ' ' + tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + '.';
    if (a.type === 'maximum') return (a.employeeName || '?') + ' ' + tr('a') + ' ' + hoursText(Math.round((a.minutes || 0) / 30) / 2) + ' h, ' + tr('maximum') + ' ' + hoursText(a.wantHoursMax) + ' h.';
    if (a.type === 'verifier') return (a.employeeName || '?') + ', ' + tr(DAYS[weekdayOf(a.day)]).toLowerCase() + (a.start ? ' ' + tr(serviceOf(a.start)) : '') + ' : ' + tr(a.why) + '.';
    if (a.type === 'minimum') return (a.employeeName || '?') + ' ' + tr('a') + ' ' + hoursText(Math.round((a.minutes || 0) / 30) / 2) + ' h, ' + tr('minimum') + ' ' + hoursText(a.wantHoursMin) + ' h.';
    if (a.text || a.message) return String(a.text || a.message);
    return (a.employeeName || '?') + ' : ' + hours(a.minutes) + ' / ' + hours(a.maxWeekMinutes) + ' ' + tr('max') + '.';
  }

  // ---------- Règles du restaurant : repliées par défaut, flèche à droite (R21) ; une liste numérotée de textes (simplification d'Émilien) ----------
  // Une règle par ligne : un clic la modifie sur place, enregistrement automatique ; une ligne vidée est retirée (sans confirmation) et la
  // numérotation se refait ; la dernière ligne « + Ajouter une règle » en ajoute une. Texte pour l'IA (prompt de la page 4) ; le générateur
  // garde sa logique interne.
  // Une règle = { text, positions } : positions = null (tous les postes) ou noms de postes (portée, demande d'Émilien).
  function rrList() { return ((S.rr && S.rr.list) || []).map(function (r) { return typeof r === 'string' ? { text: r, positions: null } : r; }); }
  function saveRR(list) {
    S.rr = { list: list }; renderRules();
    req('PUT', 'restaurant-rules', { list: list }).then(function (d) { S.rr = d.rules; renderRules(); }, function (err) { fail(err); refresh(); });
  }
  function scopeText(r) { return r.positions && r.positions.length ? r.positions.join(', ') : tr('Tous'); }
  // Portée d'une ligne : menu uni (R31) avec des cases « Tous » et chaque poste (ordre alphabétique) ; enregistrement à chaque case.
  function openScopeMenu(anchor, i) {
    if (!newMenu(anchor)) return;
    var names = S.positions.map(function (p) { return p.name; }).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
    var paint = function () {
      menu.textContent = '';
      var r = rrList()[i];
      [null].concat(names).forEach(function (name) {
        var lab = el('label', 'horaireMenuItem horaireMenuCheck');
        var c = el('input'); c.type = 'checkbox';
        c.checked = name == null ? !r.positions : !!(r.positions && r.positions.indexOf(name) >= 0);
        c.addEventListener('change', function () {
          var list = rrList(), cur = list[i].positions ? list[i].positions.slice() : [];
          if (name == null) cur = [];
          else if (c.checked) cur.push(name); else cur = cur.filter(function (x) { return x !== name; });
          list[i] = { text: list[i].text, positions: cur.length ? cur : null };
          saveRR(list); paint();
        });
        lab.appendChild(c); lab.appendChild(el('span', null, name == null ? tr('Tous') : name));
        menu.appendChild(lab);
      });
    };
    paint();
    placeMenu(anchor);
  }
  function renderRules() {
    rulesBox.textContent = '';
    var list = rrList();
    list.forEach(function (r, i) {
      var line = el('div', 'horaireRuleRow');
      var delRule = function () { confirmDelete(tr('Supprimer cette règle ?'), function () { var next = rrList(); next.splice(i, 1); saveRR(next); }, renderRules); };
      var row = el('div', 'horaireRuleLine horaireSheetEdit');
      editCell(row, '', [['text', r.text, 'Règle']], function (v) {
        var t = String(v.text).trim(), next = list.slice();
        if (!t) { delRule(); return; }
        if (t !== r.text) next[i] = { text: t, positions: r.positions }; else { renderRules(); return; }
        saveRR(next);
      }, function (cell) { cell.appendChild(el('span', 'horaireRuleNum', (i + 1) + '.')); cell.appendChild(el('span', null, r.text)); });
      var scope = btn('horaireRuleScope', scopeText(r), function () { openScopeMenu(scope, i); });
      scope.setAttribute('aria-haspopup', 'menu'); scope.setAttribute('aria-label', tr('Postes de la règle') + ' : ' + scopeText(r));
      line.appendChild(row); line.appendChild(scope);
      line.appendChild(keepFocus(TMT.ui.removeBtn(delRule, tr('Supprimer'))));
      rulesBox.appendChild(line);
    });
    if (S.addingRule) {
      var x = el('input', 'horaireSheetInput'); x.type = 'text'; x.maxLength = 300; x.placeholder = (list.length + 1) + '. ' + tr('Règle'); x.setAttribute('aria-label', tr('Ajouter une règle'));
      var closed = false;
      var done = function () {
        if (closed) return; closed = true; S.addingRule = false;
        var t = x.value.trim();
        if (t) saveRR(list.concat([{ text: t, positions: null }])); else renderRules();
      };
      x.addEventListener('keydown', function (k) { if (k.key === 'Enter') { k.preventDefault(); done(); } else if (k.key === 'Escape') { k.preventDefault(); x.value = ''; done(); } });
      x.addEventListener('blur', done);
      rulesBox.appendChild(x);
      setTimeout(function () { x.focus(); }, 0);
    } else {
      rulesBox.appendChild(TMT.ui.addBtn(tr('Ajouter une règle'), function () { S.addingRule = true; renderRules(); }));
    }
  }

  // ---------- ouverture de l'onglet (aucun changement d'app.js : on suit la classe .hidden de la section) ----------
  var built = false;
  var shown = false;
  function onShow() {
    if (root.classList.contains('hidden')) { shown = false; return; }
    if (!built) { build(); built = true; }
    if (!shown) { shown = true; S.page = null; } // chaque ouverture du volet : Paramètres > Employés
    refresh();
  }
  new MutationObserver(onShow).observe(root, { attributes: true, attributeFilter: ['class'] });
  onShow();
  TMT.horaire = { refresh: refresh };
})();
