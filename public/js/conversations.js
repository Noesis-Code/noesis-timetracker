/* Noèsis TimeTracker — conversations par projet, notes de tâches, tâches éphémères.
 * Pop-up centré (✕) ouvert depuis : bulle « Communauté » de la fenêtre Activité, bulles « Projets communs » de l'onglet Communauté,
 * icône conversation en bas de l'écran, bouton « Message » du profil d'un membre. Serveur : server/routes/conversations.js. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function $(id) { return document.getElementById(id); }
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function api(m, u, b) { return TMT.api(m, u, b); }
  function profile() { return TMT.getProfile ? TMT.getProfile() : null; }
  function modOn(id) { return !TMT.modules || !TMT.modules.isOn || TMT.modules.isOn(id); }
  function sharedProjects() { return ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return a.membersCount > 1; }); }
  function projectById(id) { return ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return String(a.id) === String(id); })[0]; }

  var aid = null, aName = '', view = 'list', thread = null, pollTimer = null, unread = {};

  var pop = el('div', 'projConvPop hidden'); pop.id = 'projConvPop';
  var card = el('div', 'projConvCard'); card.setAttribute('role', 'dialog');
  var head = el('div', 'projConvHead');
  var back = el('button', 'menuBtn hidden', '‹'); back.type = 'button'; back.setAttribute('aria-label', tr('Retour'));
  var title = el('span', 'projConvTitle');
  var closeBtn = el('button', 'menuBtn', '✕'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', tr('Fermer'));
  head.appendChild(back); head.appendChild(title); head.appendChild(closeBtn);
  var body = el('div', 'projConvBody');
  card.appendChild(head); card.appendChild(body); pop.appendChild(card); document.body.appendChild(pop);

  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  function close() { stopPoll(); pop.classList.add('hidden'); thread = null; refreshUnread(); }
  closeBtn.addEventListener('click', close);
  pop.addEventListener('click', function (e) { if (e.target === pop) close(); });
  back.addEventListener('click', function () { stopPoll(); thread = null; showList(); });

  function section(label, extra) {
    var s = el('div', 'projConvSection'); var h = el('div', 'projConvSectionHead'); h.appendChild(el('span', null, label));
    if (extra) h.appendChild(extra); s.appendChild(h); body.appendChild(s); return s;
  }
  function row(text, sub, dot, onClick) {
    var r = el('button', 'projConvRow'); r.type = 'button';
    var t = el('span', 'projConvRowText'); t.appendChild(el('strong', null, text)); if (sub) t.appendChild(el('span', 'meta', sub));
    r.appendChild(t); if (dot) r.appendChild(el('span', 'projConvUnread', String(dot)));
    r.addEventListener('click', onClick); return r;
  }
  function inputRow(placeholder, max, btnLabel, onSend) {
    var w = el('div', 'chatComposerRow projConvComposer');
    var ta = el('textarea'); ta.rows = 1; ta.maxLength = max; ta.placeholder = placeholder;
    var b = el('button', 'iconBtn btnBrique', btnLabel); b.type = 'button';
    w.appendChild(ta); w.appendChild(b);
    function send() { onSend(ta, b); }
    b.addEventListener('click', send);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    return w;
  }
  function msgLine(parent) { var m = el('p', 'msg'); parent.appendChild(m); return m; }
  function errText(e) { return (e && e.message) || tr('Erreur.'); }

  // ------------------------------------------------------------------ liste d'un projet
  function showList() {
    view = 'list'; back.classList.add('hidden'); title.textContent = aName; body.textContent = '';
    var p = projectById(aid), shared = p ? p.membersCount > 1 : false;
    if (shared) {
      var s0 = section(tr('Conversation globale'));
      s0.appendChild(row(tr('Tous les membres du projet'), null, 0, function () { openThread({ kind: 'global', title: tr('Conversation globale') }); }));
      var s1 = section(tr('Conversations de groupe')); s1.id = 'projConvGroups';
      var s2 = section(tr('Messages individuels')); s2.id = 'projConvDirect';
      api('GET', '/api/activities/' + aid + '/conversations').then(function (d) {
        var groups = d.conversations.filter(function (c) { return c.kind === 'group'; });
        s1.firstChild.firstChild.textContent = tr('Conversations de groupe') + ' · ' + groups.length + '/' + d.max;
        groups.forEach(function (c) { s1.appendChild(row(c.title, c.itemLabel ? tr('Tâche') + ' : ' + c.itemLabel : null, c.unread, function () { openThread({ kind: 'conv', id: c.id, title: c.title }); })); });
        if (groups.length < d.max) s1.appendChild(newGroupForm());
        else s1.appendChild(el('p', 'hint', tr('Limite atteinte : 9 conversations de groupe par projet.')));
        d.conversations.filter(function (c) { return c.kind === 'direct'; }).forEach(function (c) { s2.appendChild(row(c.title, null, c.unread, function () { openThread({ kind: 'conv', id: c.id, title: c.title }); })); });
        s2.appendChild(newDirectForm());
      }).catch(function () {});
    }
    notesSection(); ephemeralSection();
  }

  function newGroupForm() {
    var w = el('div', 'projConvNew');
    var sel = el('select'); sel.appendChild(new Option(tr('Sans tâche liée'), ''));
    api('GET', '/api/activities/' + aid + '/notes/tasks').then(function (d) { d.tasks.forEach(function (t) { sel.appendChild(new Option(t.label, t.id)); }); }).catch(function () {});
    var m;
    var f = inputRow(tr('Titre de la nouvelle conversation'), 60, tr('Créer'), function (ta, b) {
      var tt = ta.value.trim(); if (!tt && !sel.value) return;
      b.disabled = true; m.textContent = '';
      api('POST', '/api/activities/' + aid + '/conversations', { title: tt, itemId: sel.value || null })
        .then(function (r) { openThread({ kind: 'conv', id: r.id, title: tt || (sel.options[sel.selectedIndex].text) }); })
        .catch(function (e) { b.disabled = false; m.textContent = errText(e); });
    });
    w.appendChild(sel); w.appendChild(f); m = msgLine(w); return w;
  }

  function newDirectForm() {
    var w = el('div', 'projConvNew'); var sel = el('select'); sel.appendChild(new Option(tr('Écrire à un membre…'), ''));
    var me = profile();
    api('GET', '/api/community/activity-members?userId=' + me.id + '&activityId=' + aid).then(function (d) {
      (d.members || []).forEach(function (m) { if (m.userId !== me.id) sel.appendChild(new Option(m.name, m.userId)); });
    }).catch(function () {});
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      var name = sel.options[sel.selectedIndex].text;
      api('POST', '/api/activities/' + aid + '/conversations', { withUserId: sel.value })
        .then(function (r) { openThread({ kind: 'conv', id: r.id, title: name }); }).catch(function () { sel.value = ''; });
    });
    w.appendChild(sel); return w;
  }

  // ------------------------------------------------------------------ fil de messages
  function openThread(t) {
    thread = t; view = 'thread'; back.classList.remove('hidden'); title.textContent = t.title; body.textContent = '';
    var list = el('div', 'discussionList chatThread projConvThread'); body.appendChild(list);
    var comp = inputRow(tr('Écrire…'), 2000, tr('Envoyer'), function (ta, b) {
      var v = ta.value.trim(); if (!v) return; b.disabled = true; m.textContent = '';
      var p = t.kind === 'global'
        ? api('POST', '/api/community/activity-messages', { userId: profile().id, activityId: aid, body: v })
        : api('POST', '/api/conversations/' + t.id + '/messages', { body: v });
      p.then(function () { ta.value = ''; b.disabled = false; load(true); }).catch(function (e) { b.disabled = false; m.textContent = errText(e); });
    });
    body.appendChild(comp); var m = msgLine(body);
    var last = '';
    function load(scroll) {
      var u = t.kind === 'global' ? '/api/community/activity-messages?userId=' + profile().id + '&activityId=' + aid : '/api/conversations/' + t.id + '/messages';
      api('GET', u).then(function (d) {
        if (thread !== t) return;
        var msgs = d.messages || [], sig = msgs.map(function (x) { return x.id; }).join(',');
        if (sig === last && !scroll) return; last = sig;
        list.textContent = '';
        if (!msgs.length) list.appendChild(el('p', 'hint', tr('Aucun message pour l’instant — écris le premier ci-dessous.')));
        msgs.forEach(function (x) {
          var mine = x.userId === profile().id;
          var c = el('div', 'discussionMsg' + (mine ? ' mine' : ''));
          var top = el('div', 'discussionMsgTop'); top.appendChild(el('span', 'discussionMsgAuthor', x.userName || x.name || ''));
          top.appendChild(el('span', 'meta', new Date(x.createdAt).toLocaleString((TMT.dateLocale && TMT.dateLocale()) || undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
          c.appendChild(top); c.appendChild(el('div', 'discussionMsgBody', x.body)); list.appendChild(c);
        });
        list.scrollTop = list.scrollHeight;
      }).catch(function () {});
    }
    load(true); stopPoll(); pollTimer = setInterval(function () { if (!document.hidden) load(false); }, 15000);
  }

  // ------------------------------------------------------------------ notes de tâches (3 dernières par activité)
  function notesSection() {
    var s = section(tr('Notes des tâches')); var box = el('div'); s.appendChild(box);
    function render() {
      api('GET', '/api/activities/' + aid + '/notes/latest').then(function (d) {
        box.textContent = '';
        if (!d.notes.length) box.appendChild(el('p', 'hint', tr('Aucune note pour l’instant.')));
        d.notes.forEach(function (n) {
          var c = el('div', 'projConvNote'); c.appendChild(el('strong', null, n.itemLabel)); c.appendChild(el('div', null, n.body));
          c.appendChild(el('span', 'meta', n.userName + ' · ' + new Date(n.createdAt).toLocaleDateString((TMT.dateLocale && TMT.dateLocale()) || undefined, { day: 'numeric', month: 'short' }))); box.appendChild(c);
        });
      }).catch(function () {});
    }
    render();
    var sel = el('select'); sel.appendChild(new Option(tr('Ajouter une note à la tâche…'), ''));
    api('GET', '/api/activities/' + aid + '/notes/tasks').then(function (d) { d.tasks.forEach(function (t) { sel.appendChild(new Option(t.label, t.id)); }); }).catch(function () {});
    var m;
    var f = inputRow(tr('Note'), 500, tr('Ajouter'), function (ta, b) {
      var v = ta.value.trim(); if (!v || !sel.value) { m.textContent = sel.value ? '' : tr('Choisis une tâche.'); return; }
      b.disabled = true; m.textContent = '';
      api('POST', '/api/items/' + sel.value + '/notes', { body: v }).then(function () { ta.value = ''; b.disabled = false; render(); })
        .catch(function (e) { b.disabled = false; m.textContent = errText(e); });
    });
    var w = el('div', 'projConvNew'); w.appendChild(sel); w.appendChild(f); m = msgLine(w); s.appendChild(w);
  }

  // ------------------------------------------------------------------ tâches éphémères
  function ephemeralSection() {
    var s = section(tr('Tâche éphémère')); var list = el('div'); s.appendChild(list);
    function render() {
      api('GET', '/api/activities/' + aid + '/ephemeral-tasks').then(function (d) {
        list.textContent = '';
        d.tasks.forEach(function (t) {
          var c = el('div', 'projConvNote'); c.appendChild(el('strong', null, t.label));
          c.appendChild(el('span', 'meta', tr('Disparaît le') + ' ' + new Date(t.expiresAt).toLocaleDateString((TMT.dateLocale && TMT.dateLocale()) || undefined, { day: 'numeric', month: 'short' }))); list.appendChild(c);
        });
      }).catch(function () {});
    }
    render();
    var cat = el('select'); api('GET', '/api/activities/' + aid + '/notes/tasks').then(function (d) { d.categories.forEach(function (c) { cat.appendChild(new Option(c.label, c.key)); }); }).catch(function () {});
    var days = el('select'); [[1, '1 jour'], [3, '3 jours'], [7, '7 jours'], [14, '14 jours'], [30, '30 jours']].forEach(function (o) { days.appendChild(new Option(tr(o[1]), o[0])); });
    days.value = '7';
    var m;
    var f = inputRow(tr('Intitulé de la tâche'), 300, tr('Ajouter'), function (ta, b) {
      var v = ta.value.trim(); if (!v || !cat.value) return; b.disabled = true; m.textContent = '';
      api('POST', '/api/activities/' + aid + '/ephemeral-tasks', { label: v, categoryKey: cat.value, days: Number(days.value) })
        .then(function () { ta.value = ''; b.disabled = false; render(); if (TMT.refreshActivities) TMT.refreshActivities(); })
        .catch(function (e) { b.disabled = false; m.textContent = errText(e); });
    });
    var w = el('div', 'projConvNew'); w.appendChild(cat); w.appendChild(days); w.appendChild(f); m = msgLine(w); s.appendChild(w);
  }

  // ------------------------------------------------------------------ ouverture
  function open(id, name, opts) {
    aid = String(id); var p = projectById(aid); aName = name || (p && p.name) || '';
    pop.classList.remove('hidden');
    if (opts && opts.directWith) {
      body.textContent = ''; title.textContent = aName;
      api('POST', '/api/activities/' + aid + '/conversations', { withUserId: opts.directWith })
        .then(function (r) { openThread({ kind: 'conv', id: r.id, title: opts.name || aName }); }).catch(function () { showList(); });
      return;
    }
    showList();
  }
  TMT.projectConversations = { open: open };

  function pickProject(list, onPick, heading) {
    aid = null; pop.classList.remove('hidden'); back.classList.add('hidden'); title.textContent = heading || tr('Projets communs'); body.textContent = '';
    list.forEach(function (a) { body.appendChild(row(a.name, null, unread[a.id] || 0, function () { onPick(a); })); });
  }

  // 1371 : icône conversation en bas de l'écran.
  var fab = el('button', 'projConvFab hidden'); fab.type = 'button'; fab.id = 'projConvFab'; fab.setAttribute('aria-label', tr('Conversations')); fab.title = tr('Conversations');
  fab.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="projConvFabDot hidden"></span>';
  document.body.appendChild(fab);
  fab.addEventListener('click', function () {
    var l = sharedProjects(); if (!l.length) return;
    if (l.length === 1) open(l[0].id, l[0].name); else pickProject(l, function (a) { open(a.id, a.name); });
  });

  // 1373 : bulles « Projets communs » dans l'onglet Communauté.
  var bubbles = el('div', 'projConvBubbles hidden'); bubbles.id = 'projConvBubbles';
  function renderBubbles() {
    var tab = $('tab-community'); if (!tab) return;
    if (!bubbles.parentNode) { var bar = $('communitySearchBar'); if (bar && bar.parentNode) bar.parentNode.insertBefore(bubbles, bar.nextSibling); else tab.insertBefore(bubbles, tab.firstChild); }
    var l = sharedProjects(); bubbles.textContent = '';
    bubbles.classList.toggle('hidden', !l.length);
    if (!l.length) return;
    bubbles.appendChild(el('p', 'sectionTitle', tr('Projets communs')));
    var wrap = el('div', 'projConvBubbleRow');
    l.forEach(function (a) {
      var b = el('button', 'projConvBubble'); b.type = 'button';
      var d = el('span', 'dot'); d.style.background = a.color || 'var(--purple)'; b.appendChild(d); b.appendChild(el('span', null, a.name));
      if (unread[a.id]) b.appendChild(el('span', 'projConvUnread', String(unread[a.id])));
      b.addEventListener('click', function () { open(a.id, a.name); }); wrap.appendChild(b);
    });
    bubbles.appendChild(wrap);
  }

  function refreshUnread() {
    var me = profile(); if (!me || !modOn('sharing')) { fab.classList.add('hidden'); return; }
    var l = sharedProjects(); fab.classList.toggle('hidden', !l.length); renderBubbles();
    if (!l.length) return;
    api('GET', '/api/community/project-conversations-unread').then(function (d) {
      unread = d.byActivity || {}; var n = 0; Object.keys(unread).forEach(function (k) { n += unread[k]; });
      fab.querySelector('.projConvFabDot').classList.toggle('hidden', !n); renderBubbles();
    }).catch(function () {});
  }
  setInterval(function () { if (!document.hidden) refreshUnread(); }, 60000);
  setTimeout(refreshUnread, 2500); setTimeout(refreshUnread, 8000);
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.tabBtn')) setTimeout(refreshUnread, 400);
  });
  document.addEventListener('tmt:modules', refreshUnread);

  // 1376 : bulle « Communauté » dans la fenêtre Activité.
  var pb = el('button', 'menuBtn', tr('Communauté')); pb.type = 'button'; pb.id = 'activityPageConvBtn'; pb.setAttribute('data-module', 'sharing'); pb.setAttribute('aria-label', tr('Communauté'));
  function mountPageBubble() {
    var m = $('activityPageMembersBtn'); if (m && m.parentNode && !pb.parentNode) m.parentNode.insertBefore(pb, m);
  }
  mountPageBubble();
  pb.addEventListener('click', function () {
    var s = $('activityPageStrategyBtn'), id = s && s.dataset.aid; if (!id) return;
    var p = projectById(id); open(id, p && p.name);
  });

  // 1378 : bouton « Message » dans le profil d'un membre, pour chaque projet commun.
  var mrow = el('div', 'projConvProfileRow hidden'); mrow.id = 'viewProfileMsgRow';
  document.addEventListener('tmt:viewprofile', function (e) {
    var uid = e.detail && e.detail.userId, me = profile(); mrow.classList.add('hidden'); mrow.textContent = '';
    var anchor = $('viewProfileActionsRow'); if (!uid || !me || uid === me.id || !anchor) return;
    if (!mrow.parentNode) anchor.parentNode.insertBefore(mrow, anchor.nextSibling);
    api('GET', '/api/conversations/common-projects/' + encodeURIComponent(uid)).then(function (d) {
      if (!d.projects.length || e.detail.userId !== uid) return;
      var b = el('button', 'iconBtn btnBrique', tr('Message')); b.type = 'button';
      b.addEventListener('click', function () {
        var name = ($('viewProfileIdentityName') && $('viewProfileIdentityName').textContent) || '';
        if (d.projects.length === 1) { open(d.projects[0].id, d.projects[0].name, { directWith: uid, name: name }); return; }
        pickProject(d.projects, function (a) { open(a.id, a.name, { directWith: uid, name: name }); }, tr('Dans quel projet ?'));
      });
      mrow.appendChild(b); mrow.classList.remove('hidden');
    }).catch(function () {});
  });
})();
