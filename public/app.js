(function () {
  'use strict';

  // ===================== ÉTAT / STOCKAGE PROFIL =====================
  var STORAGE_KEY = 'noesis_profile';
  var profile = null; // { id, name, color }
  var activitiesCache = [];
  var timerInterval = null;
  var timerStartMs = null;
  var noteSaveTimeout = null;
  var currentStatsPeriod = 'week';
  var currentCommunityPeriod = 'week';
  var joinFeedback = null;

  // ===================== LIEN D'INVITATION (rejoindre une activité) =====================
  // Le lien partagé depuis Communauté a la forme /join/<token> (ou ?join=<token>
  // en secours). Express sert index.html pour n'importe quelle route non-API,
  // donc on lit simplement l'URL courante au chargement de la page.
  function getPendingJoinToken() {
    var m = location.pathname.match(/\/join\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    try {
      return new URLSearchParams(location.search).get('join') || null;
    } catch (e) { return null; }
  }
  var pendingJoinToken = getPendingJoinToken();

  function clearJoinUrl() {
    if (pendingJoinToken && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '/');
    }
  }

  // Rejoint l'activité en attente (le cas échéant) une fois le profil connu.
  // Toujours résolue (jamais rejetée) : une invitation invalide ne doit pas
  // bloquer l'entrée dans l'app, juste afficher un message une fois dedans.
  function applyPendingJoin() {
    if (!pendingJoinToken) return Promise.resolve();
    var token = pendingJoinToken;
    pendingJoinToken = null;
    return api('POST', '/api/activities/join', { userId: profile.id, token: token })
      .then(function (activity) {
        joinFeedback = 'Tu as rejoint l\'activité « ' + activity.name + ' ». Elle apparaît maintenant dans ton Chrono et dans Communauté.';
      })
      .catch(function (err) {
        joinFeedback = err.message;
      });
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveProfile(p) {
    profile = p;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }
  function clearProfile() {
    profile = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // ===================== UTILITAIRES =====================
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatHM(seconds) {
    var totalMinutes = Math.round(seconds / 60);
    var h = Math.floor(totalMinutes / 60), m = totalMinutes % 60;
    return h + 'h' + pad(m);
  }

  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Erreur serveur');
        return data;
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function textColorFor(bgHex) {
    var hex = (bgHex || '#CCCCCC').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16) || 0xCCCCCC;
    var r = (num >> 16) & 0xFF, g = (num >> 8) & 0xFF, b = num & 0xFF;
    var brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150 ? '#333333' : '#ffffff';
  }

  // ===================== ONBOARDING =====================
  function showOnboarding() {
    $('onboarding').classList.remove('hidden');
    $('app').classList.add('hidden');
  }

  function showApp() {
    $('onboarding').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('whoami').textContent = profile.name;
    $('settingsName').value = profile.name;
    $('settingsColor').value = profile.color;
    refreshActivities().then(function () {
      renderActivityGrid();
      syncChronoStatus();
      if (joinFeedback) {
        $('chronoStatus').textContent = joinFeedback;
        joinFeedback = null;
      }
    });
  }

  // Appelé juste après la création/sélection d'un profil pendant l'onboarding.
  // Les activités sont PERSONNELLES : un profil tout juste créé n'en a
  // jamais aucune (ce n'est pas parce que d'autres personnes en ont créé
  // qu'on en hérite) — sauf s'il arrive via un lien d'invitation, auquel cas
  // il rejoint d'abord cette activité-là.
  function proceedAfterProfile() {
    applyPendingJoin().then(function () {
      return api('GET', '/api/activities?userId=' + profile.id);
    }).then(function (acts) {
      if (acts.length === 0) {
        showOnboardingActivitiesStep();
      } else {
        showApp();
      }
    }).catch(function () { showApp(); });
  }

  $('onbSwitchToExisting').addEventListener('click', function (e) {
    e.preventDefault();
    $('onbCreate').classList.add('hidden');
    $('onbExisting').classList.remove('hidden');
    $('onbMsg').textContent = '';
    loadUserListForOnboarding('');
  });
  $('onbSwitchToCreate').addEventListener('click', function (e) {
    e.preventDefault();
    $('onbExisting').classList.add('hidden');
    $('onbCreate').classList.remove('hidden');
    $('onbMsg').textContent = '';
  });

  $('onbCreateBtn').addEventListener('click', function () {
    var name = $('onbName').value.trim();
    if (!name) { $('onbMsg').textContent = 'Indique un prénom ou un pseudo.'; return; }
    $('onbCreateBtn').disabled = true;
    api('POST', '/api/profile', { name: name, color: $('onbColor').value })
      .then(function (p) {
        saveProfile(p);
        proceedAfterProfile();
      })
      .catch(function (err) {
        $('onbMsg').textContent = err.message;
        $('onbCreateBtn').disabled = false;
      });
  });

  var allUsersCache = [];
  function loadUserListForOnboarding(filter) {
    api('GET', '/api/users').then(function (users) {
      allUsersCache = users;
      renderOnbUserList(filter);
    });
  }
  function renderOnbUserList(filter) {
    var box = $('onbUserList');
    box.innerHTML = '';
    var f = (filter || '').toLowerCase();
    var filtered = allUsersCache.filter(function (u) { return u.name.toLowerCase().indexOf(f) !== -1; });
    if (filtered.length === 0) {
      box.innerHTML = '<p class="hint">Aucun profil trouvé.</p>';
      return;
    }
    filtered.forEach(function (u) {
      var chip = document.createElement('div');
      chip.className = 'userChip';
      chip.innerHTML = '<span class="dot" style="background:' + u.color + '"></span><span>' + escapeHtml(u.name) + '</span>';
      chip.addEventListener('click', function () {
        saveProfile(u);
        proceedAfterProfile();
      });
      box.appendChild(chip);
    });
  }
  $('onbSearch').addEventListener('input', function () { renderOnbUserList(this.value); });

  // ----- Étape "Crée tes activités" -----
  function showOnboardingActivitiesStep() {
    $('onbCreate').classList.add('hidden');
    $('onbExisting').classList.add('hidden');
    $('onbActivities').classList.remove('hidden');
    $('onbMsg').textContent = '';
    renderOnbActivityList([]);
  }

  function renderOnbActivityList(list) {
    var box = $('onbActivityList');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<p class="hint">Aucune activité ajoutée pour l\'instant.</p>';
    } else {
      list.forEach(function (a) {
        var row = document.createElement('div');
        row.className = 'userChip';
        row.innerHTML = '<span class="dot" style="background:' + a.color + '"></span><span>' + escapeHtml(a.name) + (a.requiresNote ? ' (note)' : '') + '</span>';
        box.appendChild(row);
      });
    }
    $('onbActivitiesContinue').disabled = list.length === 0;
  }

  var onbCreatedActivities = [];
  $('onbNewActivitySave').addEventListener('click', function () {
    var name = $('onbNewActivityName').value.trim();
    if (!name) return;
    $('onbNewActivitySave').disabled = true;
    api('POST', '/api/activities', {
      name: name, color: $('onbNewActivityColor').value, requiresNote: $('onbNewActivityNote').checked, userId: profile.id,
    }).then(function (a) {
      onbCreatedActivities.push(a);
      renderOnbActivityList(onbCreatedActivities);
      $('onbNewActivityName').value = '';
      $('onbNewActivityNote').checked = false;
      $('onbMsg').textContent = '';
    }).catch(function (err) { $('onbMsg').textContent = err.message; })
      .finally(function () { $('onbNewActivitySave').disabled = false; });
  });

  $('onbActivitiesContinue').addEventListener('click', function () {
    showApp();
  });

  // ===================== NAVIGATION ONGLETS =====================
  var tabButtons = document.querySelectorAll('.tabBtn');
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(function (el) { el.classList.add('hidden'); });
    $('tab-' + tab).classList.remove('hidden');
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });

    if (tab === 'stats') loadStats();
    else if (tab === 'community') loadCommunity();
    else if (tab === 'settings') loadSettingsActivities();
    else if (tab === 'chrono') loadHistoryList();
  }

  // ===================== ACTIVITÉS (cache partagé, couleurs personnelles) =====================
  function refreshActivities() {
    return api('GET', '/api/activities?userId=' + profile.id).then(function (acts) {
      activitiesCache = acts;
      return acts;
    });
  }

  // ===================== CHRONO =====================
  function showChronoBlock(which) {
    ['chronoIdle', 'chronoRunning'].forEach(function (id) {
      $(id).classList.toggle('hidden', id !== which);
    });
  }

  function renderActivityGrid() {
    var box = $('activityButtons');
    box.innerHTML = '';
    $('noActivitiesHint').classList.toggle('hidden', activitiesCache.length > 0);
    activitiesCache.forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'activityChoiceBtn';
      btn.style.backgroundColor = a.color;
      btn.style.color = textColorFor(a.color);
      btn.textContent = a.name;
      btn.addEventListener('click', function () { startActivity(a); });
      box.appendChild(btn);
    });
  }

  function updateLiveTimer() {
    var elapsedMs = Date.now() - timerStartMs;
    var h = Math.floor(elapsedMs / 3600000);
    var m = Math.floor((elapsedMs % 3600000) / 60000);
    var s = Math.floor((elapsedMs % 60000) / 1000);
    $('liveTimer').textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function startLiveTimer(startTimeIso) {
    timerStartMs = new Date(startTimeIso).getTime();
    updateLiveTimer();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateLiveTimer, 1000);
  }
  function stopLiveTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function enterRunning(activity, startTimeIso, noteValue) {
    $('runningActivityLabel').textContent = activity.name;
    $('runningActivityLabel').style.backgroundColor = activity.color;
    $('runningActivityLabel').style.color = textColorFor(activity.color);
    $('noteWrapper').classList.toggle('hidden', !activity.requiresNote);
    $('noteText').value = noteValue || '';
    startLiveTimer(startTimeIso);
    showChronoBlock('chronoRunning');
  }

  function syncChronoStatus() {
    api('GET', '/api/timer/status?userId=' + profile.id).then(function (data) {
      if (!data.running) {
        stopLiveTimer();
        renderActivityGrid();
        showChronoBlock('chronoIdle');
        return;
      }
      enterRunning(data.activity, data.startTime, data.note);
    }).catch(function () { showChronoBlock('chronoIdle'); });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && profile) syncChronoStatus();
  });

  function startActivity(activity) {
    $('chronoStatus').textContent = '';
    api('POST', '/api/timer/start', { userId: profile.id, activityId: activity.id })
      .then(function (data) { enterRunning(data.activity, data.startTime, ''); })
      .catch(function (err) { $('chronoStatus').textContent = err.message; });
  }

  $('noteText').addEventListener('input', function () {
    var value = this.value;
    if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
    noteSaveTimeout = setTimeout(function () {
      api('POST', '/api/timer/note', { userId: profile.id, note: value }).catch(function () { /* silencieux */ });
    }, 600);
  });

  $('stopBtn').addEventListener('click', function () {
    $('stopBtn').disabled = true;
    if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
    api('POST', '/api/timer/stop', { userId: profile.id, note: $('noteText').value })
      .then(function (data) {
        stopLiveTimer();
        $('chronoStatus').textContent = data.message + ' (' + data.elapsed + ')';
        $('noteText').value = '';
        renderActivityGrid();
        showChronoBlock('chronoIdle');
        loadHistoryList();
      })
      .catch(function (err) { $('chronoStatus').textContent = err.message; })
      .finally(function () { $('stopBtn').disabled = false; });
  });

  // ----- Historique modifiable -----
  $('addEntryToggle').addEventListener('click', function () {
    $('newEntryForm').classList.toggle('hidden');
    if (!$('newEntryForm').classList.contains('hidden')) {
      var sel = $('newEntryActivity');
      sel.innerHTML = '';
      activitiesCache.forEach(function (a) {
        var opt = document.createElement('option');
        opt.value = a.id; opt.textContent = a.name;
        sel.appendChild(opt);
      });
      $('newEntryDate').value = new Date().toISOString().slice(0, 10);
    }
  });

  $('newEntrySave').addEventListener('click', function () {
    var date = $('newEntryDate').value, start = $('newEntryStart').value, end = $('newEntryEnd').value;
    if (!date || !start || !end) { alert('Merci de remplir la date et les heures.'); return; }
    api('POST', '/api/history', {
      userId: profile.id,
      activityId: Number($('newEntryActivity').value),
      note: $('newEntryNote').value,
      startTime: date + 'T' + start + ':00',
      endTime: date + 'T' + end + ':00',
    }).then(function () {
      $('newEntryForm').classList.add('hidden');
      $('newEntryNote').value = '';
      loadHistoryList();
    }).catch(function (err) { alert(err.message); });
  });

  function loadHistoryList() {
    if (!profile) return;
    api('GET', '/api/history?userId=' + profile.id + '&period=week').then(renderHistoryList);
  }

  function renderHistoryList(entries) {
    var box = $('historyList');
    box.innerHTML = '';
    if (entries.length === 0) {
      box.innerHTML = '<p class="hint">Aucun enregistrement cette semaine.</p>';
      return;
    }
    entries.forEach(function (entry) {
      box.appendChild(buildHistoryCard(entry));
    });
  }

  function buildHistoryCard(entry) {
    var card = document.createElement('div');
    card.className = 'historyEntry';

    var start = new Date(entry.startTime), end = new Date(entry.endTime);
    var dateLabel = start.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    var timeLabel = pad(start.getHours()) + ':' + pad(start.getMinutes()) + ' → ' + pad(end.getHours()) + ':' + pad(end.getMinutes());

    var activity = activitiesCache.find(function (a) { return a.id === entry.activityId; }) || { name: entry.activity, color: '#CCCCCC' };

    card.innerHTML =
      '<div class="rowTop">' +
        '<span class="actName"><span class="dot" style="background:' + activity.color + '"></span>' + escapeHtml(entry.activity) + '</span>' +
        '<span class="meta">' + formatHM(entry.durationSeconds) + '</span>' +
      '</div>' +
      '<div class="meta">' + dateLabel + ' · ' + timeLabel + '</div>' +
      (entry.note ? '<div class="note">' + escapeHtml(entry.note) + '</div>' : '');

    var actions = document.createElement('div');
    actions.className = 'actions';

    var delBtn = document.createElement('button');
    delBtn.className = 'iconBtn danger';
    delBtn.textContent = 'Supprimer';
    delBtn.addEventListener('click', function () {
      if (!confirm('Supprimer cet enregistrement ?')) return;
      api('DELETE', '/api/history/' + entry.id + '?userId=' + profile.id).then(loadHistoryList).catch(function (err) { alert(err.message); });
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
  }

.statsSummary { text-align: center; margin-bottom: 18px; }
.statsLabel { color: var(--text-light); margin: 0; font-size: 13px; }
.statsTotal { font-size: 30px; font-weight: bold; margin: 4px 0; color: var(--purple); }

.barList { display: flex; flex-direction: column; gap: 10px; }
.barRow { background: var(--card); border-radius: 12px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.barRow .barTop { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
.barRow .barTop .name { font-weight: bold; display: flex; align-items: center; }
.barTrack { background: #eee; border-radius: 6px; height: 10px; overflow: hidden; }
.barFill { height: 100%; border-radius: 6px; }

.statsChartBlock { margin-top: 22px; }
.statsChart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 4px 0;
  overflow-x: auto;
}
.chartCol {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 0 30px;
  min-width: 30px;
}
.chartBarStack {
  display: flex;
  flex-direction: column-reverse;
  width: 100%;
  max-width: 34px;
  height: 120px;
  background: #eee;
  border-radius: 6px 6px 0 0;
  overflow: hidden;
}
.chartSegment { width: 100%; }
.chartSegment:not(:first-child) { border-top: 2px solid var(--card); }
.chartColLabel {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-light);
  text-transform: capitalize;
  text-align: center;
}
.chartColTotal { font-size: 10px; color: var(--text-light); }
  // ===================== STATISTIQUES =====================
  document.querySelectorAll('#statsPeriodSwitch .periodBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentStatsPeriod = btn.dataset.period;
      document.querySelectorAll('#statsPeriodSwitch .periodBtn').forEach(function (b) { b.classList.toggle('active', b === btn); });
      loadStats();
    });
  });
  var STATS_CHART_TITLES = {
    week: 'Détail par jour',
    month: 'Détail par semaine',
    year: 'Détail par mois',
  };
  function loadStats() {
    if (!profile) return;
    api('GET', '/api/stats?userId=' + profile.id).then(function (data) {
      var block = data[currentStatsPeriod];
      $('statsLabel').textContent = block.label;
      $('statsTotal').textContent = formatHM(block.totalSeconds);
      renderBarList($('statsBars'), block.activities, block.totalSeconds);
      $('statsChartTitle').textContent = STATS_CHART_TITLES[currentStatsPeriod];
      var buckets = currentStatsPeriod === 'week'
        ? data.dailyThisWeek.slice().sort(function (a, b) { return a.isoDate < b.isoDate ? -1 : 1; })
        : currentStatsPeriod === 'month' ? data.weeklyThisMonth : data.monthlyThisYear;
      renderStatsChart($('statsChart'), buckets, currentStatsPeriod);
    });
  }
  function renderBarList(container, activities, total) {
    container.innerHTML = '';
    if (activities.length === 0) {
      container.innerHTML = '<p class="hint">Rien d\'enregistré sur cette période.</p>';
      return;
    }
    activities.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'barRow';
      row.innerHTML =
        '<div class="barTop"><span class="name"><span class="dot" style="background:' + a.color + '"></span>' + escapeHtml(a.name) + '</span>' +
        '<span>' + formatHM(a.seconds) + ' · ' + a.percent + '%</span></div>' +
        '<div class="barTrack"><div class="barFill" style="width:' + a.percent + '%;background:' + a.color + '"></div></div>';
      container.appendChild(row);
    });
  }
  function renderStatsChart(container, buckets, periodKind) {
    container.innerHTML = '';
    var hasData = buckets && buckets.some(function (b) { return b.totalSeconds > 0; });
    if (!hasData) {
      container.innerHTML = '<p class="hint">Rien d\'enregistré sur cette période.</p>';
      return;
    }
    var maxTotal = Math.max.apply(null, buckets.map(function (b) { return b.totalSeconds; }));
    buckets.forEach(function (b) {
      var col = document.createElement('div');
      col.className = 'chartCol';
      var stack = document.createElement('div');
      stack.className = 'chartBarStack';
      (b.activities || []).forEach(function (a) {
        var seg = document.createElement('div');
        seg.className = 'chartSegment';
        seg.style.height = (maxTotal > 0 ? (a.seconds / maxTotal) * 100 : 0) + '%';
        seg.style.background = a.color;
        seg.title = a.name + ' · ' + formatHM(a.seconds);
        stack.appendChild(seg);
      });
      col.appendChild(stack);
      var label = document.createElement('span');
      label.className = 'chartColLabel';
      label.textContent = periodKind === 'week' ? (b.dayOfWeek ? b.dayOfWeek.slice(0, 3) : '') : b.label;
      col.appendChild(label);
      var total = document.createElement('span');
      total.className = 'chartColTotal';
      total.textContent = b.totalSeconds > 0 ? formatHM(b.totalSeconds) : '–';
      col.appendChild(total);
      container.appendChild(col);
    });
  }
  // ===================== COMMUNAUTÉ =====================
  // ===================== COMMUNAUTÉ =====================
  document.querySelectorAll('#communityPeriodSwitch .periodBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentCommunityPeriod = btn.dataset.period;
      document.querySelectorAll('#communityPeriodSwitch .periodBtn').forEach(function (b) { b.classList.toggle('active', b === btn); });
      loadCommunity();
    });
  });

  // Communauté = MES activités devenues partagées (>= 2 membres), avec un
  // classement par activité. Une activité restée solo n'apparaît jamais ici.
  function loadCommunity() {
    if (!profile) return;
    renderShareActivitySelect();
    api('GET', '/api/community?userId=' + profile.id + '&period=' + currentCommunityPeriod).then(function (data) {
      $('communityPeriodLabel').textContent = '· ' + data.label;
      renderCommunityActivities(data.activities);
    });
  }

  function renderCommunityActivities(list) {
    var box = $('communityActivities');
    box.innerHTML = '';
    $('communityEmptyHint').classList.toggle('hidden', list.length > 0);
    list.forEach(function (act) {
      var card = document.createElement('div');
      card.className = 'communityActivityCard';
      var rows = act.members.map(function (m, i) {
        var isMe = profile && m.userId === profile.id;
        return '<div class="barRow">' +
          '<div class="barTop"><span class="name">' + (i + 1) + '. <span class="dot" style="background:' + m.color + '"></span>' +
          escapeHtml(m.name) + (isMe ? ' (toi)' : '') + '</span>' +
          '<span>' + formatHM(m.seconds) + ' · ' + m.percent + '%</span></div>' +
          '<div class="barTrack"><div class="barFill" style="width:' + m.percent + '%;background:' + m.color + '"></div></div>' +
          '</div>';
      }).join('');
      card.innerHTML =
        '<div class="communityActivityHeader"><span class="actName">' + escapeHtml(act.name) + '</span>' +
        '<span class="meta">' + formatHM(act.totalSeconds) + '</span></div>' + rows;
      box.appendChild(card);
    });
  }

  // ----- Lien de partage : rejoindre une des MIENNES via son shareToken -----
  function renderShareActivitySelect() {
    var sel = $('shareActivitySelect');
    sel.innerHTML = '';
    if (activitiesCache.length === 0) {
      var opt = document.createElement('option');
      opt.textContent = 'Crée d\'abord une activité (Paramètres)';
      opt.disabled = true;
      sel.appendChild(opt);
      $('shareCopyBtn').disabled = true;
      return;
    }
    $('shareCopyBtn').disabled = false;
    activitiesCache.forEach(function (a) {
      var opt = document.createElement('option');
      opt.value = a.shareToken;
      opt.textContent = a.name + (a.membersCount > 1 ? ' (partagée, ' + a.membersCount + ' membres)' : '');
      sel.appendChild(opt);
    });
  }

  $('shareCopyBtn').addEventListener('click', function () {
    var token = $('shareActivitySelect').value;
    if (!token) return;
    var url = location.origin + '/join/' + token;
    var show = function () { $('shareMsg').textContent = 'Lien copié : ' + url; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(show).catch(function () { $('shareMsg').textContent = url; });
    } else {
      $('shareMsg').textContent = url;
    }
  });

  // ===================== PARAMÈTRES =====================
  $('settingsSaveBtn').addEventListener('click', function () {
    $('settingsSaveBtn').disabled = true;
    api('PUT', '/api/profile/' + profile.id, { name: $('settingsName').value.trim(), color: $('settingsColor').value })
      .then(function (p) {
        saveProfile(p);
        $('whoami').textContent = p.name;
        $('settingsMsg').textContent = 'Profil mis à jour.';
      })
      .catch(function (err) { $('settingsMsg').textContent = err.message; })
      .finally(function () { $('settingsSaveBtn').disabled = false; });
  });

  $('switchProfileLink').addEventListener('click', function (e) {
    e.preventDefault();
    if (!confirm('Se déconnecter de ce profil sur cet appareil ?')) return;
    clearProfile();
    location.reload();
  });

  function loadSettingsActivities() {
    api('GET', '/api/activities?all=1&userId=' + profile.id).then(renderActivitiesSettings);
  }

  function renderActivitiesSettings(acts) {
    var box = $('activitiesList');
    box.innerHTML = '';
    if (acts.length === 0) {
      box.innerHTML = '<p class="hint">Aucune activité pour l\'instant — ajoute la première ci-dessous.</p>';
    }
    acts.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'activityRow' + (a.active ? '' : ' inactive');

      if (!a.isOwner) {
        var badge = document.createElement('p');
        badge.className = 'meta';
        badge.textContent = 'Partagée par ' + (a.ownerName || '?') + ' — tu peux choisir ta couleur, le reste lui appartient.';
        row.appendChild(badge);
      } else if (a.membersCount > 1) {
        var badge2 = document.createElement('p');
        badge2.className = 'meta';
        badge2.textContent = a.membersCount + ' membres — visible dans Communauté.';
        row.appendChild(badge2);
      }

      var nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.value = a.name;
      nameInput.disabled = !a.isOwner;

      var colorInput = document.createElement('input');
      colorInput.type = 'color'; colorInput.value = a.color;
      colorInput.title = 'Ta couleur personnelle pour cette activité';

      var noteLabel = document.createElement('label');
      noteLabel.className = 'checkLabel';
      var noteCheck = document.createElement('input');
      noteCheck.type = 'checkbox'; noteCheck.checked = a.requiresNote;
      noteCheck.disabled = !a.isOwner;
      noteLabel.appendChild(noteCheck);
      noteLabel.appendChild(document.createTextNode('Note'));

      var saveBtn = document.createElement('button');
      saveBtn.className = 'iconBtn'; saveBtn.textContent = 'OK';
      saveBtn.addEventListener('click', function () {
        // Un membre non-propriétaire ne peut changer QUE sa couleur perso :
        // on n'envoie jamais name/requiresNote/active dans ce cas (ça
        // déclencherait un refus 403 côté serveur, à raison).
        var payload = a.isOwner
          ? { userId: profile.id, name: nameInput.value.trim(), color: colorInput.value, requiresNote: noteCheck.checked, active: a.active }
          : { userId: profile.id, color: colorInput.value };
        api('PUT', '/api/activities/' + a.id, payload)
          .then(function () { refreshActivities().then(renderActivityGrid); loadSettingsActivities(); }).catch(function (err) { alert(err.message); });
      });

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';
      actionsWrap.appendChild(saveBtn);

      if (a.isOwner) {
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'iconBtn' + (a.active ? ' danger' : '');
        toggleBtn.textContent = a.active ? 'Désactiver' : 'Réactiver';
        toggleBtn.addEventListener('click', function () {
          api('PUT', '/api/activities/' + a.id, { userId: profile.id, active: !a.active })
            .then(function () { refreshActivities().then(renderActivityGrid); loadSettingsActivities(); }).catch(function (err) { alert(err.message); });
        });
        actionsWrap.appendChild(toggleBtn);
      }

      row.appendChild(nameInput);
      row.appendChild(colorInput);
      row.appendChild(noteLabel);
      row.appendChild(actionsWrap);
      box.appendChild(row);
    });
  }

  $('newActivitySave').addEventListener('click', function () {
    var name = $('newActivityName').value.trim();
    if (!name) return;
    api('POST', '/api/activities', {
      name: name, color: $('newActivityColor').value, requiresNote: $('newActivityNote').checked, userId: profile.id,
    }).then(function () {
      $('newActivityName').value = '';
      $('newActivityNote').checked = false;
      refreshActivities().then(renderActivityGrid);
      loadSettingsActivities();
    }).catch(function (err) { alert(err.message); });
  });

  $('importBtn').addEventListener('click', function () {
    var file = $('importFile').files[0];
    if (!file) { $('importMsg').textContent = 'Choisis un fichier .csv d\'abord.'; return; }
    var reader = new FileReader();
    reader.onload = function () {
      $('importBtn').disabled = true;
      $('importMsg').textContent = 'Import en cours...';
      api('POST', '/api/import/history', { userId: profile.id, csv: reader.result })
        .then(function (data) {
          $('importMsg').textContent = data.message;
          refreshActivities().then(renderActivityGrid);
          loadHistoryList();
        })
        .catch(function (err) { $('importMsg').textContent = err.message; })
        .finally(function () { $('importBtn').disabled = false; });
    };
    reader.readAsText(file, 'UTF-8');
  });

  // ===================== DÉMARRAGE =====================
  profile = loadProfile();
  if (profile) {
    if (pendingJoinToken) { applyPendingJoin().then(showApp); } else { showApp(); }
  } else {
    showOnboarding();
  }
  clearJoinUrl();
})();
