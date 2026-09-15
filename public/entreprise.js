// TimeTracker Entreprise — Module Horaires (Jacopo), écran gestionnaire.
// Voir entreprise.html pour le pourquoi de cette page séparée. Vanilla JS,
// aucune dépendance — même choix que public/app.js. Toute la logique
// d'accès/permissions est déjà appliquée côté serveur (server/routes/
// enterprises.js) : ce fichier se contente de refléter ce que l'API renvoie
// et de désactiver visuellement ce que l'utilisateur n'a pas le droit de
// faire, jamais l'inverse.
(function () {
  'use strict';

  var state = {
    enterprises: [],
    currentEnterpriseId: null,
    enterprise: null,
    manager: null,
    isPrincipal: false,
    employees: [],
    weekStart: null,
    schedule: null,
    shifts: [],
  };

  var DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  function el(id) { return document.getElementById(id); }

  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || 'Erreur serveur');
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function money(n) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toIsoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // L'API garde un horaire "vivant" par semaine, identifié par la date de
  // son lundi (weekStart) — voir server/lib/enterprises.js. On calcule donc
  // toujours le lundi de la semaine choisie dans le sélecteur de date,
  // plutôt que d'exiger que l'utilisateur clique précisément sur un lundi.
  function mondayOf(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var day = d.getDay(); // 0=dimanche..6=samedi
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  // ===================== GATE (session) =====================

  function checkSession() {
    return api('GET', '/api/session/me').then(function (data) {
      if (!data.userId) {
        el('gateMsg').classList.add('hidden');
        el('loginBox').classList.remove('hidden');
        return false;
      }
      el('gate').classList.add('hidden');
      el('app').classList.remove('hidden');
      return true;
    });
  }

  function afterLogin() {
    el('gate').classList.add('hidden');
    el('app').classList.remove('hidden');
    bindEvents();
    loadEnterprises();
  }

  function bindLoginEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-logintab]'), function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-logintab');
        Array.prototype.forEach.call(document.querySelectorAll('[data-logintab]'), function (b) {
          b.classList.toggle('active', b === btn);
        });
        el('loginExisting').classList.toggle('hidden', tab !== 'existing');
        el('loginNew').classList.toggle('hidden', tab !== 'new');
      });
    });

    var foundUserId = null;

    el('findProfileForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      el('pinForm').classList.add('hidden');
      foundUserId = null;
      var name = el('findFirstName').value.trim();
      var lastName = el('findLastName').value.trim();
      api('GET', '/api/users?name=' + encodeURIComponent(name) + '&lastName=' + encodeURIComponent(lastName))
        .then(function (matches) {
          if (!matches.length) {
            el('findProfileMsg').textContent = 'Aucun profil trouvé avec ce prénom et ce nom de famille.';
            return;
          }
          var u = matches[0];
          if (!u.hasPin) {
            el('findProfileMsg').textContent = "Ce profil n'a pas encore de code — contacte-nous pour le récupérer.";
            return;
          }
          foundUserId = u.id;
          el('findProfileMsg').textContent = 'Profil trouvé — entre ton code.';
          el('pinForm').classList.remove('hidden');
          el('pinInput').focus();
        })
        .catch(function (e) { el('findProfileMsg').textContent = e.message; });
    });

    el('pinForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!foundUserId) return;
      api('POST', '/api/profile/' + foundUserId + '/verify-pin', { pin: el('pinInput').value.trim() })
        .then(afterLogin)
        .catch(function (e) { el('findProfileMsg').textContent = e.message; });
    });

    el('createProfileForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      api('POST', '/api/profile', {
        name: el('newFirstName').value.trim(),
        lastName: el('newLastName').value.trim(),
        phone: el('newPhone').value.trim(),
        email: el('newEmail').value.trim(),
        pin: el('newPin').value.trim(),
      }).then(afterLogin)
        .catch(function (e) { el('createProfileMsg').textContent = e.message; });
    });
  }

  // ===================== ENTREPRISES =====================

  function loadEnterprises() {
    return api('GET', '/api/enterprises').then(function (data) {
      state.enterprises = data.enterprises || [];
      if (!state.enterprises.length) {
        el('createEnterpriseCard').classList.remove('hidden');
        el('dashboard').classList.add('hidden');
        el('enterpriseSwitch').classList.add('hidden');
        return;
      }
      el('createEnterpriseCard').classList.add('hidden');
      renderEnterpriseSwitch();
      var wanted = state.currentEnterpriseId || state.enterprises[0].id;
      selectEnterprise(wanted);
    });
  }

  function renderEnterpriseSwitch() {
    var sel = el('enterpriseSwitch');
    if (state.enterprises.length < 2) {
      sel.classList.add('hidden');
      return;
    }
    sel.innerHTML = state.enterprises.map(function (e) {
      return '<option value="' + e.id + '">' + escapeHtml(e.name) + '</option>';
    }).join('');
    sel.value = state.currentEnterpriseId || state.enterprises[0].id;
    sel.classList.remove('hidden');
  }

  function selectEnterprise(id) {
    state.currentEnterpriseId = Number(id);
    return api('GET', '/api/enterprises/' + state.currentEnterpriseId).then(function (data) {
      state.enterprise = data.enterprise;
      state.manager = data.manager;
      state.isPrincipal = !!data.isPrincipal;
      renderEnterpriseHeader();
      el('dashboard').classList.remove('hidden');
      loadManagers();
      renderSubscriptionBanner();
      // Recharge l'onglet actif seulement — Employés/Horaires vérifient
      // eux-mêmes l'abonnement avant d'appeler leurs propres routes.
      var activeTab = document.querySelector('.tabBtn.active');
      showTab(activeTab ? activeTab.getAttribute('data-tab') : 'managers');
    });
  }

  function renderEnterpriseHeader() {
    el('entName').textContent = state.enterprise.name;
    var roleLabel = state.isPrincipal ? 'Gestionnaire principal' : 'Gestionnaire secondaire';
    el('entMeta').textContent = roleLabel;
  }

  function renderSubscriptionBanner() {
    var banner = el('subBanner');
    if (!state.enterprise.subscriptionActive) {
      banner.textContent = "Abonnement non actif pour cette entreprise — les employés et les horaires restent inaccessibles tant qu'il n'est pas activé.";
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  function hasPerm(key) {
    if (state.isPrincipal) return true;
    return !!(state.manager && state.manager[key]);
  }

  // ===================== ONGLET GESTIONNAIRES =====================

  function loadManagers() {
    return api('GET', '/api/enterprises/' + state.currentEnterpriseId + '/managers').then(function (data) {
      renderManagers(data.managers || []);
    });
  }

  function renderManagers(managers) {
    var body = el('managersBody');
    body.innerHTML = managers.map(function (m) {
      var permsList = [];
      if (m.role === 'principal') {
        permsList.push('Toutes (principal)');
      } else {
        if (m.canManageSchedules) permsList.push('Horaires');
        if (m.canExportSchedules) permsList.push('Export');
        if (m.canManageEmployees) permsList.push('Employés');
        if (m.canViewLaborCost) permsList.push('Coût');
        if (!permsList.length) permsList.push('Aucune');
      }
      var removeBtn = (state.isPrincipal && m.role !== 'principal')
        ? '<button type="button" class="linkBtn" data-remove-manager="' + m.userId + '">Retirer</button>'
        : '';
      return '<tr><td>' + escapeHtml(m.userName) + '</td><td>' + (m.role === 'principal' ? 'Principal' : 'Secondaire') + '</td>' +
        '<td>' + permsList.join(', ') + '</td><td>' + removeBtn + '</td></tr>';
    }).join('');
    el('addManagerBlock').classList.toggle('hidden', !state.isPrincipal);

    Array.prototype.forEach.call(body.querySelectorAll('[data-remove-manager]'), function (btn) {
      btn.addEventListener('click', function () {
        var userId = btn.getAttribute('data-remove-manager');
        if (!confirm('Retirer ce gestionnaire ?')) return;
        api('DELETE', '/api/enterprises/' + state.currentEnterpriseId + '/managers/' + userId)
          .then(loadManagers)
          .catch(function (e) { alert(e.message); });
      });
    });
  }

  // ===================== ONGLET EMPLOYÉS =====================

  function loadEmployees() {
    if (!state.enterprise.subscriptionActive) {
      el('employeesLocked').textContent = "Abonnement non actif — les employés seront accessibles une fois l'abonnement activé.";
      el('employeesLocked').classList.remove('hidden');
      el('employeesContent').classList.add('hidden');
      return Promise.resolve();
    }
    el('employeesLocked').classList.add('hidden');
    el('employeesContent').classList.remove('hidden');
    var includeInactive = el('showInactiveEmployees').checked;
    return api('GET', '/api/enterprises/' + state.currentEnterpriseId + '/employees' + (includeInactive ? '?includeInactive=1' : ''))
      .then(function (data) {
        state.employees = data.employees || [];
        renderEmployees();
      });
  }

  function renderEmployees() {
    var body = el('employeesBody');
    var canManage = hasPerm('canManageEmployees');
    body.innerHTML = state.employees.map(function (emp) {
      var rate = emp.hourlyRate === null || emp.hourlyRate === undefined ? '—' : money(emp.hourlyRate) + '/h';
      var activePill = emp.active ? '<span class="pill ok">Actif</span>' : '<span class="pill warn">Inactif</span>';
      var actions = canManage
        ? '<button type="button" class="linkBtn" data-toggle-active="' + emp.id + '" data-active="' + emp.active + '">' +
          (emp.active ? 'Désactiver' : 'Réactiver') + '</button>'
        : '';
      return '<tr><td>' + escapeHtml(emp.name) + '</td><td>' + escapeHtml(emp.position || '—') + '</td>' +
        '<td>' + escapeHtml(emp.level || '—') + '</td><td>' + rate + '</td><td>' + activePill + '</td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
    el('addEmployeeBlock').classList.toggle('hidden', !canManage);

    Array.prototype.forEach.call(body.querySelectorAll('[data-toggle-active]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-toggle-active');
        var currentlyActive = btn.getAttribute('data-active') === 'true' || btn.getAttribute('data-active') === '1';
        api('PUT', '/api/enterprises/' + state.currentEnterpriseId + '/employees/' + id, { active: !currentlyActive })
          .then(loadEmployees)
          .catch(function (e) { alert(e.message); });
      });
    });
  }

  // ===================== ONGLET HORAIRES =====================

  function loadSchedulesTab() {
    if (!state.enterprise.subscriptionActive) {
      el('schedulesLocked').textContent = "Abonnement non actif — les horaires seront accessibles une fois l'abonnement activé.";
      el('schedulesLocked').classList.remove('hidden');
      el('schedulesContent').classList.add('hidden');
      return;
    }
    el('schedulesLocked').classList.add('hidden');
    el('schedulesContent').classList.remove('hidden');
    if (!el('weekPicker').value) {
      el('weekPicker').value = toIsoDate(new Date());
    }
    loadWeek();
  }

  function loadWeek() {
    var picked = el('weekPicker').value;
    if (!picked) return;
    var monday = mondayOf(picked);
    var sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    state.weekStart = toIsoDate(monday);
    el('weekRangeLabel').textContent = 'Semaine du ' + formatFr(monday) + ' au ' + formatFr(sunday);

    if (!hasPerm('canManageSchedules')) {
      // Un gestionnaire sans la permission "Gérer les horaires" ne peut pas
      // créer/modifier d'horaire — on se contente de tenter une lecture s'il
      // en existe déjà un pour cette semaine, sans jamais appeler POST
      // (get-or-create), réservé à canManageSchedules côté serveur.
      return api('GET', '/api/enterprises/' + state.currentEnterpriseId + '/schedules').then(function (data) {
        var existing = (data.schedules || []).find(function (s) { return s.weekStart === state.weekStart; });
        if (!existing) {
          el('scheduleBox').classList.add('hidden');
          return;
        }
        return openSchedule(existing.id);
      });
    }

    return api('POST', '/api/enterprises/' + state.currentEnterpriseId + '/schedules', { weekStart: state.weekStart })
      .then(function (data) { return openSchedule(data.schedule.id); });
  }

  function openSchedule(scheduleId) {
    return api('GET', '/api/enterprises/' + state.currentEnterpriseId + '/schedules/' + scheduleId).then(function (data) {
      state.schedule = data.schedule;
      state.shifts = data.shifts || [];
      el('scheduleBox').classList.remove('hidden');
      renderScheduleBox();
      return loadLaborCost();
    });
  }

  function renderScheduleBox() {
    var statusLabels = { draft: 'Brouillon', exported: 'Exporté' };
    el('scheduleStatus').textContent = statusLabels[state.schedule.status] || state.schedule.status;

    var exportLink = el('exportLink');
    if (hasPerm('canExportSchedules')) {
      exportLink.href = '/api/enterprises/' + state.currentEnterpriseId + '/schedules/' + state.schedule.id + '/export';
      exportLink.classList.remove('hidden');
    } else {
      exportLink.classList.add('hidden');
    }

    var monday = mondayOf(state.weekStart);
    var grid = el('daysGrid');
    grid.innerHTML = '';
    var canManage = hasPerm('canManageSchedules');
    var employeesOptions = state.employees.filter(function (e) { return e.active; })
      .map(function (e) { return '<option value="' + e.id + '">' + escapeHtml(e.name) + '</option>'; }).join('');

    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var dateStr = toIsoDate(d);
      var dayShifts = state.shifts.filter(function (s) { return s.date === dateStr; });

      var col = document.createElement('div');
      col.className = 'dayCol';
      var shiftsHtml = dayShifts.map(function (s) {
        var delBtn = canManage
          ? '<button type="button" class="linkBtn" data-del-shift="' + s.id + '">Supprimer</button>'
          : '';
        return '<div class="shiftRow"><span>' + escapeHtml(s.employeeName) + ' — ' + s.startTime + '–' + s.endTime +
          (s.position ? ' (' + escapeHtml(s.position) + ')' : '') + '</span>' + delBtn + '</div>';
      }).join('') || '<p class="msg" style="margin:4px 0;">Aucun quart.</p>';

      var addFormHtml = canManage ? (
        '<form class="shiftAdd" data-day="' + dateStr + '">' +
        '<select required>' + (employeesOptions || '<option value="">Aucun employé actif</option>') + '</select>' +
        '<input type="time" required>' +
        '<input type="time" required>' +
        '<input type="text" placeholder="Poste (optionnel)" style="min-width:100px;">' +
        '<button type="submit" class="btn btn-primary smallBtn">+ Ajouter</button>' +
        '</form>'
      ) : '';

      col.innerHTML = '<div class="dayColHead"><strong>' + DAYS_FR[i] + ' ' + formatFr(d) + '</strong></div>' + shiftsHtml + addFormHtml;
      grid.appendChild(col);
    }

    Array.prototype.forEach.call(grid.querySelectorAll('[data-del-shift]'), function (btn) {
      btn.addEventListener('click', function () {
        var shiftId = btn.getAttribute('data-del-shift');
        api('DELETE', '/api/enterprises/' + state.currentEnterpriseId + '/schedules/' + state.schedule.id + '/shifts/' + shiftId)
          .then(function () { return openSchedule(state.schedule.id); })
          .catch(function (e) { alert(e.message); });
      });
    });

    Array.prototype.forEach.call(grid.querySelectorAll('form.shiftAdd'), function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var day = form.getAttribute('data-day');
        var inputs = form.querySelectorAll('select, input');
        var employeeId = Number(inputs[0].value);
        var startTime = inputs[1].value;
        var endTime = inputs[2].value;
        var position = inputs[3].value;
        if (!employeeId) { alert('Choisis un employé.'); return; }
        api('POST', '/api/enterprises/' + state.currentEnterpriseId + '/schedules/' + state.schedule.id + '/shifts', {
          employeeId: employeeId, date: day, startTime: startTime, endTime: endTime, position: position,
        }).then(function () { return openSchedule(state.schedule.id); })
          .catch(function (e) { alert(e.message); });
      });
    });
  }

  function loadLaborCost() {
    var label = el('laborCostLabel');
    if (!hasPerm('canViewLaborCost')) {
      label.classList.add('hidden');
      return;
    }
    return api('GET', '/api/enterprises/' + state.currentEnterpriseId + '/schedules/' + state.schedule.id + '/labor-cost')
      .then(function (data) {
        label.classList.remove('hidden');
        if (data.total === null) {
          label.textContent = data.shiftCount === 0
            ? 'Coût : aucun quart.'
            : "Coût : inconnu (taux horaire manquant sur les employés concernés).";
        } else {
          label.textContent = 'Coût estimé : ' + money(data.total) +
            (data.shiftsMissingRate ? ' (' + data.shiftsMissingRate + ' quart(s) sans taux exclu(s))' : '');
        }
      });
  }

  // ===================== UTILITAIRES =====================

  function formatFr(d) {
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tabBtn'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tabPane'), function (pane) {
      pane.classList.add('hidden');
    });
    if (name === 'managers') { el('tabManagers').classList.remove('hidden'); loadManagers(); }
    if (name === 'employees') { el('tabEmployees').classList.remove('hidden'); loadEmployees(); }
    if (name === 'schedules') { el('tabSchedules').classList.remove('hidden'); loadSchedulesTab(); }
  }

  // ===================== INIT =====================

  function bindEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('.tabBtn'), function (btn) {
      btn.addEventListener('click', function () { showTab(btn.getAttribute('data-tab')); });
    });

    el('logoutLink').addEventListener('click', function () { location.href = '/'; });

    el('enterpriseSwitch').addEventListener('change', function () {
      selectEnterprise(this.value);
    });

    el('createEnterpriseForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = el('newEnterpriseName').value.trim();
      if (!name) return;
      api('POST', '/api/enterprises', { name: name }).then(function (data) {
        el('newEnterpriseName').value = '';
        state.currentEnterpriseId = data.enterprise.id;
        return loadEnterprises();
      }).catch(function (e) {
        el('createEnterpriseMsg').textContent = e.message;
      });
    });

    el('addManagerForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var userName = el('newManagerName').value.trim();
      if (!userName) return;
      api('POST', '/api/enterprises/' + state.currentEnterpriseId + '/managers', {
        userName: userName,
        permissions: {
          canManageSchedules: el('permSchedules').checked,
          canExportSchedules: el('permExport').checked,
          canManageEmployees: el('permEmployees').checked,
          canViewLaborCost: el('permLaborCost').checked,
        },
      }).then(function () {
        el('addManagerForm').reset();
        el('addManagerMsg').textContent = '';
        return loadManagers();
      }).catch(function (e) { el('addManagerMsg').textContent = e.message; });
    });

    el('showInactiveEmployees').addEventListener('change', loadEmployees);

    el('addEmployeeForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = el('newEmpName').value.trim();
      if (!name) return;
      var rateVal = el('newEmpRate').value;
      api('POST', '/api/enterprises/' + state.currentEnterpriseId + '/employees', {
        name: name,
        position: el('newEmpPosition').value.trim(),
        level: el('newEmpLevel').value.trim(),
        hourlyRate: rateVal === '' ? null : Number(rateVal),
      }).then(function () {
        el('addEmployeeForm').reset();
        el('addEmployeeMsg').textContent = '';
        return loadEmployees();
      }).catch(function (e) { el('addEmployeeMsg').textContent = e.message; });
    });

    el('weekPicker').addEventListener('change', loadWeek);
  }

  document.addEventListener('DOMContentLoaded', function () {
    checkSession().then(function (ok) {
      if (ok) { bindEvents(); loadEnterprises(); }
      else { bindLoginEvents(); }
    });
  });
})();
