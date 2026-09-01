(function () {
  'use strict';

  // ===================== ÉTAT / STOCKAGE PROFIL =====================
  var STORAGE_KEY = 'noesis_profile';
  var profile = null; // { id, name, color, theme }
  var activitiesCache = [];
  var timerInterval = null;
  var timerStartMs = null;
  // Périodes indépendantes par section de Statistiques — 30 août 2026, sur
  // demande d'Emilien : plus de sélecteur global (#statsPeriodSwitch), chaque
  // section choisit sa propre période via son menu "⋮" (voir plus bas).
  var currentPiePeriod = 'week';
  // Graphique : plus de "période" au sens plage depuis le 1er septembre 2026
  // (demande d'Emilien) — le Graphique couvre toujours tout l'historique
  // (voir totalRangeForUser côté serveur), seule la granularité des points
  // se choisit ('day' | 'week' | 'month', 'day' par défaut).
  var currentChartGranularity = 'day';
  var currentTimesheetPeriod = 'week'; // 'week' | 'month' — pas d'"année" pour la Feuille de temps (demande d'Emilien)
  var currentTimesheetOffset = 0; // décalage en semaines ; repart à 0 à chaque ouverture de l'onglet Statistiques
  var currentTimesheetMonthOffset = 0; // décalage en mois (vue calendrier) ; repart à 0 lui aussi
  var currentHistoryWeekOffset = 0; // idem, pour l'historique modifiable du Chrono (#chronoHistoryPanel)
  var lastDailyBreakdown = []; // dernier détail journalier chargé, pour redessiner le Graphique sans refetch (ex : couleur de la courbe Total après un changement de thème)
  var statsFullscreenActive = false; // plein écran forcé (paysage) de la Feuille de temps
  var chartFullscreenActive = false; // plein écran forcé (paysage) du Graphique
  // ----- Statistiques d'UNE activité partagée (section Communauté > Membres)
  // — pendants exacts des 5 variables Statistiques ci-dessus, jamais
  // partagés avec elles (deux jeux d'état totalement indépendants). -----
  var currentActivityStatsPeriod = 'week';
  var currentActivityTimesheetOffset = 0; // repart à 0 à chaque nouvelle sélection d'activité
  var lastActivityDailyBreakdown = [];
  var activityTimesheetFullscreenActive = false;
  var activityChartFullscreenActive = false;
  var currentTheme = 'dark';
  var currentLang = 'en'; // 'en' par défaut (nouveaux comptes) ; voir applyLang plus bas

  // ----- Verrouillage d'orientation (30 août 2026, demande d'Emilien) -----
  // La Feuille de temps et le Graphique simulent un plein écran paysage par
  // rotation CSS (voir #statsTimesheetBlock.fullscreen / #statsChartBlock.fullscreen
  // dans styles.css), pensée pour un téléphone qui reste physiquement tenu en
  // portrait. Le 30 août 2026, la rotation automatique réelle du téléphone
  // entrait encore en conflit avec cette rotation forcée malgré le correctif
  // CSS @media (orientation: ...) posé plus tôt le même jour (ce correctif
  // évite que l'affichage casse une fois la rotation réelle survenue, mais ne
  // l'empêche pas de survenir). Demande explicite d'Emilien : empêcher
  // purement et simplement l'app de tourner automatiquement, plutôt que de
  // continuer à s'adapter après coup. Deux mécanismes complémentaires :
  //   1. `public/manifest.webmanifest` : "orientation": "portrait" (verrouille
  //      la rotation quand l'app est installée sur l'écran d'accueil,
  //      Android/Chrome uniquement — non supporté par iOS Safari).
  //   2. Ici, la Screen Orientation API en best-effort : fonctionne aussi en
  //      onglet navigateur classique sur Android/Chrome (pas besoin d'être
  //      installée), mais reste silencieusement sans effet si non supportée
  //      (iOS Safari ne l'implémente pas du tout) ou si le navigateur exige un
  //      contexte plein écran/geste utilisateur qu'on n'a pas — d'où l'appel
  //      répété au moment des clics plein écran ci-dessous (un clic est un
  //      geste utilisateur, ça augmente les chances de succès). Le correctif
  //      CSS @media (orientation: ...) reste en place tel quel comme filet de
  //      sécurité pour les cas où ce verrouillage ne prend pas (iOS en
  //      particulier) : si jamais la rotation survient malgré tout, l'affichage
  //      ne casse toujours pas.
  function lockPortraitOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('portrait').catch(function () {});
      }
    } catch (err) { /* API non supportée ou verrouillage refusé : on ignore, le CSS prend le relais */ }
  }
  lockPortraitOrientation();

  // Palettes de couleurs d'activités, une par thème — DOIVENT rester
  // identiques à server/lib/theme.js (voir le commentaire là-bas). Les 8
  // couleurs suivent l'ordre de l'arc-en-ciel (rouge, orange, jaune, vert,
  // cyan, bleu, indigo, violet) ; chaque couleur sombre a sa jumelle claire
  // au même index (même teinte, seule la luminosité change) : changer de
  // thème garde "la même" couleur d'activité. Comme seules ces couleurs sont
  // sélectionnables, on n'a plus besoin de calculer une couleur de texte au
  // cas par cas : c'est le thème actif qui décide.
  var PALETTES = {
    dark: ['#9E2E2E', '#9B5D27', '#8B7923', '#328540', '#2E828A', '#3659A1', '#573EA3', '#833B9B'],
    light: ['#D87979', '#DAA06C', '#D8C564', '#7ACD88', '#75C9D1', '#85A0D6', '#9B89D2', '#C089D2'],
  };

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveProfile(p) {
    // Un serveur pas encore redémarré depuis la mise à jour "langue" renvoie
    // un profil SANS champ `lang`. On garde alors la langue déjà connue au
    // lieu de la perdre silencieusement (sans ça, elle retombe sur le
    // français au rendu suivant, ce qui donnait l'impression que le bouton
    // "Anglais" ne faisait rien).
    if (p && p.lang === undefined && profile && profile.lang) p.lang = profile.lang;
    profile = p;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    applyTheme(p.theme);
    renderIdentityHeader();
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
        if (!r.ok) throw new Error(t(data.error || 'Erreur serveur'));
        return data;
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ===================== PIÈCES JOINTES (partagées) =====================
  // Demande d'Emilien (29 août 2026) : pouvoir attacher une photo (prise
  // directement à l'appareil photo) ou un document à un enregistrement déjà
  // validé, depuis le panneau "Historique" (voir buildChronoHistoryEntry
  // plus bas). Réutilisées depuis le 31 août 2026 par la sous-partie
  // "Communauté" de la zone Discussion du Profil (voir plus bas), sur le
  // même principe : une pièce jointe s'ajoute à un message déjà envoyé.
  // Les fonctions ci-dessous sont génériques, partagées entre ces contextes.
  var MAX_NOTE_ATTACHMENTS = 4; // doit rester identique à MAX_ATTACHMENTS_PER_NOTE côté serveur (server/lib/attachments.js)
  var MAX_ATTACHMENT_SOURCE_BYTES = 8 * 1024 * 1024; // garde-fou avant traitement (même principe que MAX_AVATAR_SOURCE_BYTES) ; le serveur revalide de toute façon la taille décodée (5 Mo)

  function humanFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () { resolve(reader.result); };
      reader.readAsDataURL(file);
    });
  }

  // Redimensionne une photo de pièce jointe SANS la recadrer en carré
  // (contrairement à resizeImageFile, réservée à l'avatar) : on garde le
  // cadrage d'origine et on limite seulement la plus grande dimension, pour
  // rester lisible (photo d'un lieu, d'un document papier, etc.) sans le
  // poids d'un fichier natif d'appareil photo (plusieurs Mo).
  function resizeAttachmentPhoto(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Une ligne de pièce jointe : miniature pour une image, icône générique
  // sinon, nom + poids, un lien "Ouvrir" pour les documents (l'image est déjà
  // cliquable via sa miniature) et un bouton de suppression. `onRemoved` est
  // rappelé avec l'id de la pièce jointe une fois la suppression confirmée
  // côté serveur. `deleteApiPath` (31 août 2026) : préfixe de la route DELETE
  // à appeler avant `att.id` — par défaut '/api/attachments/' (note_attachments,
  // Chrono/Mes notes) ; passer '/api/profile/post-attachments/' pour un
  // message déjà envoyé de la zone Discussion (profile_post_attachments,
  // table différente, donc route différente — bug corrigé ici : ce paramètre
  // manquait, la suppression y échouait avec "Pièce jointe introuvable").
  // Passer explicitement `null` pour une pièce jointe encore locale, pas
  // encore envoyée au serveur (composeur de la zone Discussion) : la
  // suppression retire alors juste la ligne, sans aucun appel réseau.
  function buildAttachmentRow(att, onRemoved, deleteApiPath) {
    var row = document.createElement('div');
    row.className = 'attachmentRow';
    var isImage = att.mimeType && att.mimeType.indexOf('image/') === 0;

    if (isImage && att.dataUrl) {
      var thumb = document.createElement('img');
      thumb.className = 'attachmentThumb';
      thumb.src = att.dataUrl;
      thumb.alt = att.fileName;
      thumb.title = t('Voir en grand');
      thumb.addEventListener('click', function () { window.open(att.dataUrl, '_blank'); });
      row.appendChild(thumb);
    } else {
      var icon = document.createElement('span');
      icon.className = 'attachmentIcon';
      icon.textContent = '📄';
      row.appendChild(icon);
    }

    var info = document.createElement('div');
    info.className = 'attachmentInfo';
    var nameEl = document.createElement('span');
    nameEl.className = 'attachmentName';
    nameEl.textContent = att.fileName;
    nameEl.title = att.fileName;
    var sizeEl = document.createElement('span');
    sizeEl.className = 'meta';
    sizeEl.textContent = humanFileSize(att.sizeBytes);
    info.appendChild(nameEl);
    info.appendChild(sizeEl);
    row.appendChild(info);

    if (!isImage && att.dataUrl) {
      var openLink = document.createElement('a');
      openLink.className = 'iconBtn attachmentOpen';
      openLink.textContent = t('Ouvrir');
      openLink.href = att.dataUrl;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.download = att.fileName;
      row.appendChild(openLink);
    }

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'iconBtn danger attachmentRemove';
    removeBtn.textContent = '×';
    removeBtn.title = t('Supprimer cette pièce jointe');
    removeBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer cette pièce jointe ?'))) return;
      if (deleteApiPath === null) { onRemoved(att.id); return; }
      api('DELETE', (deleteApiPath || '/api/attachments/') + att.id + '?userId=' + profile.id)
        .then(function () { onRemoved(att.id); })
        .catch(function (err) { alert(err.message); });
    });
    row.appendChild(removeBtn);

    return row;
  }

  function renderAttachmentList(container, attachments, onRemoved, deleteApiPath) {
    container.innerHTML = '';
    (attachments || []).forEach(function (att) { container.appendChild(buildAttachmentRow(att, onRemoved, deleteApiPath)); });
  }

  // Point d'entrée unique pour une pièce jointe choisie via le sélecteur de
  // fichier natif du téléphone (30 août 2026, demande d'Emilien : accès
  // direct aux options du système — photothèque / appareil photo / fichiers —
  // sans passer par un menu Photo/Document intermédiaire, qui existait dans
  // un premier passage). Le type MIME du fichier choisi détermine le
  // traitement : redimensionnement pour une image (même logique
  // qu'auparavant pour "Photo"), lecture brute sinon (même logique
  // qu'auparavant pour "Document"). Partagé entre chaque carte d'historique
  // (buildChronoHistoryEntry) et chaque message "Communauté" de la zone
  // Discussion du Profil (buildProfilePostCard, plus bas).
  function handleAttachmentFilePick(file, msgEl, uploadFn) {
    if (!file) return;
    var isImage = /^image\//.test(file.type);
    if (file.size > MAX_ATTACHMENT_SOURCE_BYTES) {
      msgEl.textContent = isImage
        ? t('Photo trop lourde (8 Mo max) — choisis-en une autre.')
        : t('Fichier trop lourd (8 Mo max) — choisis-en un autre.');
      return;
    }
    if (isImage) {
      msgEl.textContent = t('Traitement de la photo...');
      resizeAttachmentPhoto(file, 1600, 0.82).then(function (dataUrl) {
        uploadFn(file.name, 'image/jpeg', dataUrl);
      }).catch(function () { msgEl.textContent = t('Impossible de traiter cette photo.'); });
    } else {
      readFileAsDataUrl(file).then(function (dataUrl) {
        uploadFn(file.name, file.type || 'application/octet-stream', dataUrl);
      }).catch(function () { msgEl.textContent = t('Impossible de lire ce fichier.'); });
    }
  }

  // Couleur de texte fixe pour un thème donné (blanc en sombre, foncé en
  // clair) — valable pour n'importe quelle couleur des deux palettes,
  // puisqu'elles sont justement construites pour ça (voir PALETTES).
  function textColorForTheme(theme) {
    return theme === 'light' ? '#222222' : '#ffffff';
  }

  // Applique le thème clair/sombre à toute l'app (attribut sur <html>, lu
  // par styles.css) et mémorise le thème actif pour le reste du script.
  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }

  // ----- Langue (voir public/i18n.js) -----
  // Même principe que le thème : un réglage par profil, appliqué à toute
  // l'app. La traduction des textes STATIQUES de index.html se fait en une
  // fois ici (parcours du DOM au démarrage) ; les textes construits par ce
  // script passent par t() au moment où ils sont créés.
  function applyLang(lang) {
    currentLang = NoesisI18n.setLang(lang);
    NoesisI18n.translateStaticDom(document.body);
    return currentLang;
  }

  // Locale à utiliser pour les dates affichées (noms de jours/mois produits
  // par le navigateur lui-même, pas par notre dictionnaire).
  function dateLocale() {
    return currentLang === 'en' ? 'en-GB' : 'fr-FR';
  }

  function renderLangSwitch() {
    document.querySelectorAll('#langSwitch .themeBtn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.langChoice === currentLang);
    });
  }

  // Construit une rangée de pastilles de couleur dans containerEl, pour la
  // palette du thème actif. `selected` est la couleur pré-sélectionnée (si
  // elle ne fait pas partie de la palette courante, on retombe sur la
  // première couleur et on prévient l'appelant via onSelect). Retourne la
  // couleur effectivement sélectionnée au départ.
  function renderColorSwatches(containerEl, selected, onSelect, compact) {
    var palette = PALETTES[currentTheme];
    containerEl.className = 'colorSwatches' + (compact ? ' compact' : '');
    containerEl.innerHTML = '';
    var current = (selected && palette.indexOf(selected) !== -1) ? selected : palette[0];
    palette.forEach(function (c) {
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (c === current ? ' selected' : '');
      sw.style.backgroundColor = c;
      sw.title = c;
      sw.addEventListener('click', function () {
        containerEl.querySelectorAll('.swatch').forEach(function (el) { el.classList.remove('selected'); });
        sw.classList.add('selected');
        onSelect(c);
      });
      containerEl.appendChild(sw);
    });
    if (current !== selected) onSelect(current);
    return current;
  }

  // ===================== ONBOARDING =====================
  function showOnboarding() {
    $('onboarding').classList.remove('hidden');
    $('app').classList.add('hidden');
  }

  function showApp() {
    $('onboarding').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('whoamiName').textContent = profile.name;
    $('settingsName').value = profile.name;
    $('settingsLastName').value = profile.lastName || '';
    $('settingsPhone').value = profile.phone || '';
    $('settingsEmail').value = profile.email || '';
    renderIdentityHeader();
    // Vérifie tout de suite s'il y a des invitations/demandes de suivi en
    // attente, pour que le point rouge sur l'icône "avion en papier" soit à
    // jour dès l'ouverture de l'app, même si on ne visite pas encore Profil.
    loadPendingInvites();
    loadFollowRequests();
    refreshActivities().then(function () {
      renderActivityGrid();
      syncChronoStatus();
    });
    // Ouverture depuis une notification alors que l'app était fermée : on
    // arrive sur /?notif=community ou /?notif=profile (voir server/lib/push.js
    // et notificationclick dans public/sw.js).
    if (location.search.indexOf('notif=') !== -1) openTabFromNotification(location.href);
  }

  // Appelé juste après la création/sélection d'un profil pendant l'onboarding.
  // Les activités sont PERSONNELLES : un profil tout juste créé n'en a
  // jamais aucune (ce n'est pas parce que d'autres personnes en ont créé
  // qu'on en hérite).
  function proceedAfterProfile() {
    // Récupérer un profil existant depuis un nouvel appareil peut ramener une
    // langue différente de celle utilisée pendant l'onboarding (l'anglais par
    // défaut, tant qu'aucun profil n'est connu). Dans ce cas on recharge une
    // fois : le profil vient d'être enregistré localement, la page repart donc
    // directement dans la bonne langue. Si le serveur ne renvoie PAS de langue
    // du tout (pas encore redémarré depuis la mise à jour), on ne recharge
    // pas : on garde la langue courante et on continue l'onboarding
    // normalement, plutôt que de sauter l'étape "Crée tes activités".
    if (profile.lang && profile.lang !== currentLang) { location.reload(); return; }
    api('GET', '/api/activities?userId=' + profile.id).then(function (acts) {
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

  // Identité complète (nom de famille, téléphone, email) demandée dès la
  // création du profil, en plus du prénom/pseudo (29 août 2026, demande
  // d'Emilien) — même validation légère de format que côté serveur (voir
  // EMAIL_RE/PHONE_RE dans server/routes/profile.js), le serveur revalide de
  // toute façon en dernier recours.
  var ONB_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var ONB_PHONE_RE = /^[0-9+()\-\s]{6,30}$/;

  $('onbCreateBtn').addEventListener('click', function () {
    var name = $('onbName').value.trim();
    if (!name) { $('onbMsg').textContent = t('Indique un prénom ou un pseudo.'); return; }
    var lastName = $('onbLastName').value.trim();
    if (!lastName) { $('onbMsg').textContent = t('Indique ton nom de famille.'); return; }
    var phone = $('onbPhone').value.trim();
    if (!ONB_PHONE_RE.test(phone)) { $('onbMsg').textContent = t('Indique un numéro de téléphone valide.'); return; }
    var email = $('onbEmail').value.trim();
    if (!ONB_EMAIL_RE.test(email)) { $('onbMsg').textContent = t('Indique une adresse email valide.'); return; }
    var pin = $('onbPin').value.trim();
    var pinConfirm = $('onbPinConfirm').value.trim();
    if (!/^[0-9]{4,6}$/.test(pin)) { $('onbMsg').textContent = t('Choisis un code de 4 à 6 chiffres.'); return; }
    if (pin !== pinConfirm) { $('onbMsg').textContent = t('Les deux codes ne correspondent pas.'); return; }
    $('onbCreateBtn').disabled = true;
    api('POST', '/api/profile', { name: name, lastName: lastName, phone: phone, email: email, pin: pin })
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
      box.innerHTML = '<p class="hint">' + t('Aucun profil trouvé.') + '</p>';
      return;
    }
    filtered.forEach(function (u) {
      var chip = document.createElement('div');
      chip.className = 'userChip';
      chip.innerHTML = '<span class="dot" style="background:' + u.color + '"></span><span>' + escapeHtml(u.name) + '</span>';
      chip.addEventListener('click', function () {
        showOnbPinStep(u);
      });
      box.appendChild(chip);
    });
  }
  $('onbSearch').addEventListener('input', function () { renderOnbUserList(this.value); });

  // ----- Étape "code PIN" (récupérer un profil existant, ou lui en définir
  // un s'il n'en a pas encore — comptes créés avant cette protection) -----
  var pendingPinUser = null;

  function showOnbPinStep(user) {
    pendingPinUser = user;
    $('onbCreate').classList.add('hidden');
    $('onbExisting').classList.add('hidden');
    $('onbPinStep').classList.remove('hidden');
    $('onbMsg').textContent = '';
    $('onbPinInput').value = '';
    $('onbPinConfirmInput').value = '';
    if (user.hasPin) {
      $('onbPinStepTitle').textContent = t('Code de {name}', { name: user.name });
      $('onbPinStepHint').classList.add('hidden');
      $('onbPinConfirmInput').classList.add('hidden');
    } else {
      $('onbPinStepTitle').textContent = t('Définis un code pour {name}', { name: user.name });
      $('onbPinStepHint').textContent = t('Ce profil n\'a pas encore de code (créé avant l\'ajout de cette protection). Définis-en un maintenant.');
      $('onbPinStepHint').classList.remove('hidden');
      $('onbPinConfirmInput').classList.remove('hidden');
    }
    $('onbPinInput').focus();
  }

  $('onbPinCancel').addEventListener('click', function (e) {
    e.preventDefault();
    pendingPinUser = null;
    $('onbPinStep').classList.add('hidden');
    $('onbExisting').classList.remove('hidden');
  });

  $('onbPinSubmit').addEventListener('click', function () {
    if (!pendingPinUser) return;
    var pin = $('onbPinInput').value.trim();
    $('onbMsg').textContent = '';

    if (!pendingPinUser.hasPin) {
      var confirmPin = $('onbPinConfirmInput').value.trim();
      if (!/^[0-9]{4,6}$/.test(pin)) { $('onbMsg').textContent = t('Le code doit comporter 4 à 6 chiffres.'); return; }
      if (pin !== confirmPin) { $('onbMsg').textContent = t('Les deux codes ne correspondent pas.'); return; }
      $('onbPinSubmit').disabled = true;
      api('POST', '/api/profile/' + pendingPinUser.id + '/set-pin', { pin: pin })
        .then(function () {
          saveProfile({ id: pendingPinUser.id, name: pendingPinUser.name, color: pendingPinUser.color, theme: pendingPinUser.theme || 'dark' });
          pendingPinUser = null;
          proceedAfterProfile();
        })
        .catch(function (err) { $('onbMsg').textContent = err.message; })
        .finally(function () { $('onbPinSubmit').disabled = false; });
    } else {
      $('onbPinSubmit').disabled = true;
      api('POST', '/api/profile/' + pendingPinUser.id + '/verify-pin', { pin: pin })
        .then(function (p) {
          saveProfile(p);
          pendingPinUser = null;
          proceedAfterProfile();
        })
        .catch(function (err) { $('onbMsg').textContent = err.message; })
        .finally(function () { $('onbPinSubmit').disabled = false; });
    }
  });

  // ----- Étape "Crée tes activités" -----
  var onbNewActivityColor = PALETTES[currentTheme][0];
  function showOnboardingActivitiesStep() {
    $('onbCreate').classList.add('hidden');
    $('onbExisting').classList.add('hidden');
    $('onbPinStep').classList.add('hidden');
    $('onbActivities').classList.remove('hidden');
    $('onbMsg').textContent = '';
    renderOnbActivityList([]);
    onbNewActivityColor = PALETTES[currentTheme][0];
    renderColorSwatches($('onbNewActivitySwatches'), onbNewActivityColor, function (c) { onbNewActivityColor = c; });
  }

  function renderOnbActivityList(list) {
    var box = $('onbActivityList');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<p class="hint">' + t('Aucune activité ajoutée pour l\'instant.') + '</p>';
    } else {
      list.forEach(function (a) {
        var row = document.createElement('div');
        row.className = 'userChip';
        row.innerHTML = '<span class="dot" style="background:' + a.color + '"></span><span>' + escapeHtml(a.name) + '</span>';
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
      name: name, color: onbNewActivityColor, userId: profile.id,
    }).then(function (a) {
      onbCreatedActivities.push(a);
      renderOnbActivityList(onbCreatedActivities);
      $('onbNewActivityName').value = '';
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
    // On quitte forcément la vue Réglages (dans #tab-profile) en rejoignant
    // un onglet principal — l'icône "⚙️" de la topbar ne doit donc plus
    // rester violette (1er septembre 2026, demande d'Emilien).
    $('profileSettingsBtn').classList.remove('active');

    if (tab === 'stats') {
      loadStats();
      // La Feuille de temps repart toujours sur "Semaine, semaine en cours"
      // à chaque ouverture de l'onglet (comportement déjà établi le 29 août
      // 2026) — Répartition/Graphique, eux, gardent la période choisie
      // précédemment (comme l'ancien sélecteur global #statsPeriodSwitch).
      currentTimesheetPeriod = 'week';
      currentTimesheetOffset = 0;
      currentTimesheetMonthOffset = 0;
      syncPeriodMenuActive($('tsPeriodMenu'), 'week');
      loadTimesheet();
    }
    else {
      exitStatsFullscreen();
      exitChartFullscreen();
      exitActivityTimesheetFullscreen();
      exitActivityChartFullscreen();
      if (tab === 'community') loadCommunity();
      else if (tab === 'activity') loadActivityTab();
      else if (tab === 'chrono') {
        currentHistoryWeekOffset = 0;
        $('chronoHistoryPanel').classList.add('hidden');
      }
    }
  }

  // ===================== PROFIL (accès par clic sur le prénom) =====================
  // Depuis le 30 août 2026 (demande d'Emilien), Profil n'est plus un onglet
  // de la barre du bas — remplacé par "Activité" — mais reste le même
  // panneau plein écran qu'avant, ouvert en cliquant sur le prénom en haut
  // à droite (#whoami). La flèche "←" de fermeture (#profileCloseBtn), sa
  // fonction closeProfile() et l'état lastMainTab qui ne servait qu'à elle
  // ont été retirés le 31 août 2026 (demande d'Emilien, « supprimer le
  // bouton pour revenir en arrière dans profil ») : on quitte désormais
  // Profil en tapant n'importe quel onglet de la barre du bas, qui appelle
  // déjà switchTab() indépendamment de l'état de Profil (voir tabButtons
  // plus haut) — aucun remplacement nécessaire.
  function openProfile() {
    document.querySelectorAll('.tab').forEach(function (el) { el.classList.add('hidden'); });
    $('tab-profile').classList.remove('hidden');
    exitStatsFullscreen();
    exitChartFullscreen();
    exitActivityTimesheetFullscreen();
    exitActivityChartFullscreen();
    showProfileMain();
    loadPendingInvites();
    loadFollowRequests();
    renderThemeSwitch();
    renderLangSwitch();
    renderShareSettings();
    loadProfileNotes();
    loadProfileDiscussion();
  }
  $('whoami').addEventListener('click', openProfile);

  // ===================== ACTIVITÉ =====================
  // Une seule liste depuis le 30 août 2026 (fin de journée, demande
  // d'Emilien) : la gestion des activités (venue de Profil) et le suivi des
  // activités partagées (venu de Communauté > Membres) ne forment plus deux
  // listes empilées mais une seule — voir loadSettingsActivities, qui appelle
  // les deux API d'un coup, et renderActivitiesSettings, qui les fusionne.
  function loadActivityTab() {
    if (!profile) return;
    loadSettingsActivities();
    // La liste des invitations est affichée dans le Profil (arbitrage
    // d'Emilien du 30 août 2026), pas ici — mais on la recharge quand même en
    // passant, pour tenir à jour le compteur qui allume son point rouge.
    loadPendingInvites();
    renderNewActivitySwatches();
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
      btn.style.color = textColorForTheme(currentTheme);
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

  function enterRunning(activity, startTimeIso) {
    $('runningActivityLabel').textContent = activity.name;
    $('runningActivityLabel').style.backgroundColor = activity.color;
    $('runningActivityLabel').style.color = textColorForTheme(currentTheme);
    startLiveTimer(startTimeIso);
    closeStopConfirm();
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
      enterRunning(data.activity, data.startTime);
    }).catch(function () { showChronoBlock('chronoIdle'); });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && profile) syncChronoStatus();
  });

  function startActivity(activity) {
    $('chronoStatus').textContent = '';
    api('POST', '/api/timer/start', { userId: profile.id, activityId: activity.id })
      .then(function (data) { enterRunning(data.activity, data.startTime); })
      .catch(function (err) { $('chronoStatus').textContent = err.message; });
  }

  // STOP n'enregistre plus directement la session : il affiche d'abord un
  // récapitulatif des heures de début/fin (pré-remplies, modifiables) qu'il
  // faut valider — voir #stopConfirmPanel. Annuler laisse le chrono tourner
  // sans rien changer.
  // Inclut les secondes (pas seulement HH:mm) — sans ça, une session
  // démarrée/arrêtée à moins d'une minute d'écart se retrouvait avec des
  // champs identiques une fois arrondis à la minute, et "Valider" restait
  // bloqué ("l'heure de fin doit être après le début") alors que la session
  // avait bien duré quelques secondes. Voir aussi step="1" sur les champs
  // heure dans index.html : sans cet attribut, le sélecteur natif du
  // navigateur ignore de toute façon les secondes qu'on lui donne.
  //
  // Chaque heure est représentée par DEUX champs natifs séparés (date +
  // heure, 31 août 2026, demande d'Emilien) plutôt qu'un seul
  // <input type="datetime-local"> : ça évite le débordement déjà rencontré
  // avec ce type de champ, et surtout ça permet de donner à la date une
  // largeur volontairement plus petite qu'à l'heure via CSS
  // (.stopDateInput/.stopTimeInput) — impossible à contrôler avec un champ
  // combiné, dont on ne peut pas styler les segments internes séparément.
  // Conservée telle quelle : utilisée par l'édition d'une session dans
  // l'historique (voir plus bas), qui garde un unique champ datetime-local
  // — seul le récapitulatif du STOP passe aux deux champs séparés ci-dessous.
  function toDatetimeLocalValue(dateLike) {
    var d = new Date(dateLike);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function toDateValue(dateLike) {
    var d = new Date(dateLike);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function toTimeValue(dateLike) {
    var d = new Date(dateLike);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  // Recombine les deux champs (date incomplète ou absente si l'un des deux
  // n'est pas encore rempli) en un seul Date, ou une Date invalide sinon —
  // même contrat que `new Date(datetimeLocalValue)` utilisé auparavant.
  function combineDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return new Date(NaN);
    return new Date(dateStr + 'T' + timeStr);
  }

  function updateStopDurationLabel() {
    var start = combineDateTime($('stopStartDateInput').value, $('stopStartTimeInput').value);
    var end = combineDateTime($('stopEndDateInput').value, $('stopEndTimeInput').value);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      $('stopDurationLabel').textContent = t('Durée : —');
      $('stopConfirmBtn').disabled = true;
      return;
    }
    $('stopConfirmBtn').disabled = false;
    var totalSeconds = Math.round((end - start) / 1000);
    var durationLabel;
    if (totalSeconds < 60) {
      // Moins d'une minute : afficher les secondes plutôt que "0h00", qui
      // donnerait l'impression trompeuse qu'aucune durée n'a été enregistrée.
      durationLabel = totalSeconds + ' s';
    } else {
      var totalMinutes = Math.floor(totalSeconds / 60);
      durationLabel = Math.floor(totalMinutes / 60) + 'h' + pad(totalMinutes % 60);
    }
    $('stopDurationLabel').textContent = t('Durée : {duration}', { duration: durationLabel });
  }

  function openStopConfirm() {
    $('stopConfirmMsg').textContent = '';
    $('stopStartDateInput').value = toDateValue(timerStartMs);
    $('stopStartTimeInput').value = toTimeValue(timerStartMs);
    var now = new Date();
    $('stopEndDateInput').value = toDateValue(now);
    $('stopEndTimeInput').value = toTimeValue(now);
    updateStopDurationLabel();
    $('stopBtn').classList.add('hidden');
    $('stopConfirmPanel').classList.remove('hidden');
  }

  function closeStopConfirm() {
    $('stopConfirmPanel').classList.add('hidden');
    $('stopBtn').classList.remove('hidden');
  }

  $('stopBtn').addEventListener('click', openStopConfirm);
  $('stopStartDateInput').addEventListener('input', updateStopDurationLabel);
  $('stopStartTimeInput').addEventListener('input', updateStopDurationLabel);
  $('stopEndDateInput').addEventListener('input', updateStopDurationLabel);
  $('stopEndTimeInput').addEventListener('input', updateStopDurationLabel);
  $('stopCancelBtn').addEventListener('click', closeStopConfirm);

  $('stopConfirmBtn').addEventListener('click', function () {
    var startDate = combineDateTime($('stopStartDateInput').value, $('stopStartTimeInput').value);
    var endDate = combineDateTime($('stopEndDateInput').value, $('stopEndTimeInput').value);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      $('stopConfirmMsg').textContent = t('Heures invalides.');
      return;
    }
    if (endDate <= startDate) {
      $('stopConfirmMsg').textContent = t("L'heure de fin doit être après l'heure de début.");
      return;
    }
    $('stopConfirmBtn').disabled = true;
    $('stopCancelBtn').disabled = true;
    api('POST', '/api/timer/stop', {
      userId: profile.id,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    })
      .then(function (data) {
        stopLiveTimer();
        $('chronoStatus').textContent = t(data.message) + ' (' + data.elapsed + ')';
        renderActivityGrid();
        showChronoBlock('chronoIdle');
        closeStopConfirm();
        // Si l'historique est déjà ouvert, la session qui vient d'être
        // enregistrée doit y apparaître immédiatement sans qu'il faille
        // refermer/rouvrir le panneau.
        if (!$('chronoHistoryPanel').classList.contains('hidden')) loadChronoHistory();
      })
      .catch(function (err) { $('stopConfirmMsg').textContent = err.message; })
      .finally(function () {
        $('stopConfirmBtn').disabled = false;
        $('stopCancelBtn').disabled = false;
      });
  });

  // `onDeleted` est rappelé après une suppression réussie, pour que
  // l'appelant rafraîchisse la bonne liste (Mes notes dans Profil, seul
  // appelant depuis le retrait de l'historique de la semaine du Chrono).
  function buildHistoryCard(entry, onDeleted) {
    var card = document.createElement('div');
    card.className = 'historyEntry';

    var start = new Date(entry.startTime), end = new Date(entry.endTime);
    var dateLabel = start.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' });
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
    delBtn.textContent = t('Supprimer');
    delBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer cet enregistrement ?'))) return;
      api('DELETE', '/api/history/' + entry.id + '?userId=' + profile.id).then(onDeleted).catch(function (err) { alert(err.message); });
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
  }

  // ===================== HISTORIQUE MODIFIABLE (Chrono) =====================
  // Demande d'Emilien (29 août 2026) : pouvoir corriger la date/l'heure d'une
  // session déjà enregistrée, ou la supprimer, depuis l'onglet Chrono —
  // explicitement séparé de buildHistoryCard ci-dessus (réservée à "Mes
  // notes" dans Profil, où seule la suppression complète existe). Les deux
  // fonctions restent indépendantes : rien ici ne touche à buildHistoryCard,
  // ni à la section "Mes notes".
  function buildChronoHistoryEntry(entry, onChanged) {
    var card = document.createElement('div');
    card.className = 'historyEntry';

    var activity = activitiesCache.find(function (a) { return a.id === entry.activityId; }) || { name: entry.activity, color: '#CCCCCC' };

    function timeRangeLabel() {
      var s = new Date(entry.startTime), e = new Date(entry.endTime);
      var dl = s.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' });
      var tl = pad(s.getHours()) + ':' + pad(s.getMinutes()) + ' → ' + pad(e.getHours()) + ':' + pad(e.getMinutes());
      return dl + ' · ' + tl;
    }

    var top = document.createElement('div');
    top.className = 'rowTop';
    top.innerHTML = '<span class="actName"><span class="dot" style="background:' + activity.color + '"></span>' + escapeHtml(entry.activity) + '</span>' +
      '<span class="meta">' + formatHM(entry.durationSeconds) + '</span>';
    card.appendChild(top);

    var metaLine = document.createElement('div');
    metaLine.className = 'meta';
    metaLine.textContent = timeRangeLabel();
    card.appendChild(metaLine);

    if (entry.note) {
      var noteEl = document.createElement('div');
      noteEl.className = 'note';
      noteEl.textContent = entry.note;
      card.appendChild(noteEl);
    }

    // Pièces jointes de cette session (déjà rattachées, voir GET /history) —
    // consultables, supprimables, et on peut en ajouter de nouvelles ici même
    // après validation (même limite MAX_NOTE_ATTACHMENTS que côté serveur).
    // `entry.attachments` est tenu à jour localement après chaque
    // ajout/suppression pour ne pas recharger toute la semaine.
    var attachBox = document.createElement('div');
    attachBox.className = 'attachmentList';
    // Bouton de pièce jointe (30 août 2026), reconstruite ici en DOM
    // puisque cette carte est générée dynamiquement (même structure que le
    // bouton équivalent de buildProfilePostCard, plus bas). Trombone (SVG, même
    // style que les icônes de la barre d'onglets) déplacé dans .actions, à
    // gauche de "Modifier"/"Supprimer" (30 août 2026, demande d'Emilien) ;
    // ouvre directement le sélecteur de fichier natif du téléphone, sans menu
    // Photo/Document intermédiaire (même demande, passage suivant).
    var attachMenuWrap = document.createElement('div');
    attachMenuWrap.className = 'attachmentMenuWrap';
    var attachMenuBtn = document.createElement('button');
    attachMenuBtn.type = 'button'; attachMenuBtn.className = 'menuBtn attachMenuIconBtn';
    attachMenuBtn.setAttribute('aria-label', t('Ajouter une pièce jointe'));
    attachMenuBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    var attachInput = document.createElement('input');
    attachInput.type = 'file'; attachInput.className = 'hidden';
    attachMenuWrap.appendChild(attachMenuBtn);
    attachMenuWrap.appendChild(attachInput);
    var attachMsg = document.createElement('p');
    attachMsg.className = 'meta attachmentMsg';
    card.appendChild(attachBox);
    card.appendChild(attachMsg);

    function refreshEntryAttachments() {
      renderAttachmentList(attachBox, entry.attachments, function (removedId) {
        entry.attachments = (entry.attachments || []).filter(function (a) { return a.id !== removedId; });
        refreshEntryAttachments();
      });
      attachMenuBtn.disabled = (entry.attachments || []).length >= MAX_NOTE_ATTACHMENTS;
    }
    refreshEntryAttachments();

    function uploadEntryAttachment(fileName, mimeType, dataUrl) {
      attachMsg.textContent = t('Envoi...');
      api('POST', '/api/history/' + entry.id + '/attachments', { userId: profile.id, fileName: fileName, mimeType: mimeType, dataUrl: dataUrl })
        .then(function (att) {
          entry.attachments = (entry.attachments || []).concat([att]);
          refreshEntryAttachments();
          attachMsg.textContent = '';
        })
        .catch(function (err) { attachMsg.textContent = err.message; });
    }

    attachMenuBtn.addEventListener('click', function () { attachInput.click(); });
    attachInput.addEventListener('change', function () {
      var file = this.files[0];
      this.value = '';
      handleAttachmentFilePick(file, attachMsg, uploadEntryAttachment);
    });

    var actions = document.createElement('div');
    actions.className = 'actions';
    var editBtn = document.createElement('button');
    editBtn.className = 'iconBtn';
    editBtn.textContent = t('Modifier');
    var delBtn = document.createElement('button');
    delBtn.className = 'iconBtn danger';
    delBtn.textContent = t('Supprimer');
    actions.appendChild(attachMenuWrap);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    var editFields = document.createElement('div');
    editFields.className = 'historyEditFields hidden';
    editFields.innerHTML =
      '<p class="stopFieldLabel">' + t('Heure de début') + '</p>' +
      '<input type="datetime-local" class="historyEditStart" step="1">' +
      '<p class="stopFieldLabel">' + t('Heure de fin') + '</p>' +
      '<input type="datetime-local" class="historyEditEnd" step="1">' +
      '<p class="historyEditMsg msg"></p>' +
      '<div class="rowActions">' +
        '<button type="button" class="iconBtn historyEditCancel">' + t('Annuler') + '</button>' +
        '<button type="button" class="iconBtn historyEditSave">' + t('Enregistrer') + '</button>' +
      '</div>';
    card.appendChild(editFields);

    var startInput = editFields.querySelector('.historyEditStart');
    var endInput = editFields.querySelector('.historyEditEnd');
    var editMsg = editFields.querySelector('.historyEditMsg');
    var saveBtn = editFields.querySelector('.historyEditSave');
    var cancelBtn = editFields.querySelector('.historyEditCancel');

    editBtn.addEventListener('click', function () {
      editMsg.textContent = '';
      startInput.value = toDatetimeLocalValue(entry.startTime);
      endInput.value = toDatetimeLocalValue(entry.endTime);
      editFields.classList.remove('hidden');
      actions.classList.add('hidden');
    });
    cancelBtn.addEventListener('click', function () {
      editFields.classList.add('hidden');
      actions.classList.remove('hidden');
    });
    saveBtn.addEventListener('click', function () {
      var newStart = new Date(startInput.value);
      var newEnd = new Date(endInput.value);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
        editMsg.textContent = t('Heures invalides.');
        return;
      }
      if (newEnd <= newStart) {
        editMsg.textContent = t("L'heure de fin doit être après l'heure de début.");
        return;
      }
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      api('PUT', '/api/history/' + entry.id, {
        userId: profile.id,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
      })
        .then(function () { onChanged(); })
        .catch(function (err) {
          editMsg.textContent = err.message;
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
        });
    });

    delBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer définitivement cet enregistrement ?'))) return;
      api('DELETE', '/api/history/' + entry.id + '?userId=' + profile.id).then(onChanged).catch(function (err) { alert(err.message); });
    });

    return card;
  }

  // Même algorithme que mondayOf() côté serveur (server/lib/dates.js) — lundi
  // de la semaine contenant la date de référence — pour afficher un libellé
  // de semaine cohérent avec la période réellement demandée à l'API.
  function chronoHistoryWeekLabel(offset) {
    var ref = new Date();
    ref.setDate(ref.getDate() - offset * 7);
    var day = ref.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    if (offset === 0) return t('Cette semaine');
    var fmt = function (d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
    return fmt(monday) + ' – ' + fmt(sunday);
  }

  function loadChronoHistory() {
    if (!profile) return;
    var ref = new Date();
    ref.setDate(ref.getDate() - currentHistoryWeekOffset * 7);
    var isoRef = ref.getFullYear() + '-' + pad(ref.getMonth() + 1) + '-' + pad(ref.getDate());
    api('GET', '/api/history?userId=' + profile.id + '&period=week&date=' + isoRef).then(renderChronoHistory);
  }

  function renderChronoHistory(entries) {
    var box = $('historyList');
    box.innerHTML = '';
    entries.forEach(function (entry) { box.appendChild(buildChronoHistoryEntry(entry, loadChronoHistory)); });
    $('historyEmptyHint').classList.toggle('hidden', entries.length > 0);
    $('historyWeekLabel').textContent = chronoHistoryWeekLabel(currentHistoryWeekOffset);
    $('historyNextWeek').disabled = currentHistoryWeekOffset === 0;
  }

  // Toute la ligne d'en-tête ("Historique") est cliquable pour déplier/
  // replier le panneau — c'est elle-même le bouton, sans aucune flèche à
  // côté (demande d'Emilien du 31 août 2026 ; la flèche #historyToggleBtn,
  // conservée comme simple repère visuel depuis le 30 août, est retirée du
  // DOM cette fois-ci).
  $('chronoHistoryHeader').addEventListener('click', function () {
    var opening = $('chronoHistoryPanel').classList.contains('hidden');
    $('chronoHistoryPanel').classList.toggle('hidden', !opening);
    if (opening) { currentHistoryWeekOffset = 0; loadChronoHistory(); }
  });
  $('historyPrevWeek').addEventListener('click', function () { currentHistoryWeekOffset += 1; loadChronoHistory(); });
  $('historyNextWeek').addEventListener('click', function () {
    if (currentHistoryWeekOffset === 0) return;
    currentHistoryWeekOffset -= 1;
    loadChronoHistory();
  });

  // ===================== STATISTIQUES =====================
  // Menu "⋮" de choix de période, générique aux trois sections (Feuille de
  // temps, Répartition, Graphique) — 30 août 2026, demande d'Emilien :
  // chaque section a sa propre période, plus de sélecteur global. `btn` est
  // le bouton "⋮", `menu` son panneau déroulant (.statsPeriodMenu), et
  // `onSelect(period)` est appelé au clic sur une option — c'est à l'appelant
  // de mettre à jour son état et de recharger ses données.
  function setupStatsPeriodMenu(btn, menu, onSelect) {
    btn.addEventListener('click', function (e) {
      // stopPropagation() évite que ce même clic soit aussi capté par
      // l'écouteur "clic en dehors" juste plus bas, qui refermerait le menu
      // aussitôt ouvert (même mécanisme que .notifPanel en Profil).
      e.stopPropagation();
      var willOpen = menu.classList.contains('hidden');
      closeAllStatsPeriodMenus();
      if (willOpen) menu.classList.remove('hidden');
    });
    menu.querySelectorAll('.statsPeriodMenuItem').forEach(function (item) {
      item.addEventListener('click', function () {
        menu.classList.add('hidden');
        if (item.classList.contains('active')) return;
        menu.querySelectorAll('.statsPeriodMenuItem').forEach(function (b) { b.classList.toggle('active', b === item); });
        onSelect(item.dataset.period);
      });
    });
  }
  function closeAllStatsPeriodMenus() {
    document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
  }
  // Referme tout menu de période ouvert au clic n'importe où en dehors de
  // lui (ou de son bouton "⋮") — même mécanisme que .notifPanel en Profil.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.statsPeriodMenuWrap')) closeAllStatsPeriodMenus();
  });
  // Aligne l'état visuel (option en surbrillance) d'un menu de période sur
  // une période donnée, sans déclencher onSelect — utilisé quand la période
  // est remise à "Semaine" par programme (ex : réouverture de l'onglet).
  function syncPeriodMenuActive(menu, period) {
    menu.querySelectorAll('.statsPeriodMenuItem').forEach(function (b) { b.classList.toggle('active', b.dataset.period === period); });
  }

  setupStatsPeriodMenu($('statsPiePeriodBtn'), $('statsPiePeriodMenu'), function (period) {
    currentPiePeriod = period;
    loadPieStats();
  });
  setupStatsPeriodMenu($('chartPeriodBtn'), $('chartPeriodMenu'), function (period) {
    currentChartGranularity = period; // 'day' | 'week' | 'month' (data-period du menu ⋮ du Graphique)
    loadChartStats();
  });
  setupStatsPeriodMenu($('tsPeriodBtn'), $('tsPeriodMenu'), function (period) {
    currentTimesheetPeriod = period;
    // Reprend systématiquement "en cours" (semaine ou mois) au changement de
    // période, plutôt que de convertir un décalage semaine en décalage mois
    // (les deux ne correspondent à rien l'un pour l'autre).
    if (period === 'month') currentTimesheetMonthOffset = 0;
    else currentTimesheetOffset = 0;
    loadTimesheet();
  });

  function loadPieStats() {
    if (!profile) return;
    api('GET', '/api/stats?userId=' + profile.id + '&period=' + currentPiePeriod).then(function (data) {
      var block = data[currentPiePeriod];
      $('statsLabel').textContent = t(block.label);
      $('statsTotal').textContent = formatHM(block.totalSeconds);
      renderPie(block.activities, block.totalSeconds);
    });
  }

  function loadChartStats() {
    if (!profile) return;
    api('GET', '/api/stats?userId=' + profile.id + '&granularity=' + currentChartGranularity).then(function (data) {
      lastDailyBreakdown = data.dailyBreakdown || [];
      renderChart(lastDailyBreakdown);
    });
  }

  // Recharge les deux sections à période indépendante d'un coup — utilisé à
  // l'ouverture de l'onglet Statistiques (voir switchTab).
  function loadStats() {
    loadPieStats();
    loadChartStats();
  }

  // ----- Section Camembert : répartition de la période en cours, une part
  // par activité, couleur = couleur déjà attribuée à l'activité (identité
  // stable, jamais générée) — remplace l'ancienne .barList. -----
  function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    var x1o = cx + rOuter * Math.cos(startAngle), y1o = cy + rOuter * Math.sin(startAngle);
    var x2o = cx + rOuter * Math.cos(endAngle), y2o = cy + rOuter * Math.sin(endAngle);
    var x1i = cx + rInner * Math.cos(endAngle), y1i = cy + rInner * Math.sin(endAngle);
    var x2i = cx + rInner * Math.cos(startAngle), y2i = cy + rInner * Math.sin(startAngle);
    var largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    return 'M' + x1o + ',' + y1o +
      ' A' + rOuter + ',' + rOuter + ' 0 ' + largeArc + ' 1 ' + x2o + ',' + y2o +
      ' L' + x1i + ',' + y1i +
      ' A' + rInner + ',' + rInner + ' 0 ' + largeArc + ' 0 ' + x2i + ',' + y2i + ' Z';
  }

  function renderPie(activities, totalSeconds) {
    var wrap = $('statsPie');
    wrap.innerHTML = '';
    $('statsPieEmptyHint').classList.toggle('hidden', activities.length > 0);
    if (activities.length === 0) return;

    var svgNS = 'http://www.w3.org/2000/svg';
    var cx = 50, cy = 50, rOuter = 46, rInner = 27;
    var gap = activities.length > 1 ? 0.035 : 0; // radians — équivalent du "surface gap" entre parts

    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'pieSvg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('Répartition du temps par activité'));

    var angle = -Math.PI / 2; // départ à midi, sens horaire
    activities.forEach(function (a) {
      var frac = totalSeconds > 0 ? a.seconds / totalSeconds : 0;
      var sweep = frac * Math.PI * 2;
      var start = angle + Math.min(gap / 2, sweep / 2);
      var end = angle + sweep - Math.min(gap / 2, sweep / 2);
      if (end < start) end = start;
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', donutSlicePath(cx, cy, rOuter, rInner, start, end));
      path.setAttribute('fill', a.color);
      path.setAttribute('class', 'pieSlice');
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = a.name + ' — ' + formatHM(a.seconds) + ' (' + a.percent + '%)';
      path.appendChild(title);
      svg.appendChild(path);
      angle += sweep;
    });

    var chartArea = document.createElement('div');
    chartArea.className = 'pieChartArea';
    chartArea.appendChild(svg);

    var center = document.createElement('div');
    center.className = 'pieCenter';
    var centerVal = document.createElement('span');
    centerVal.className = 'pieCenterValue';
    centerVal.textContent = formatHM(totalSeconds);
    var centerLabel = document.createElement('span');
    centerLabel.className = 'pieCenterLabel';
    centerLabel.textContent = 'total';
    center.appendChild(centerVal);
    center.appendChild(centerLabel);
    chartArea.appendChild(center);
    wrap.appendChild(chartArea);

    // Légende toujours présente dès 2 activités — seule couleur ne suffit
    // jamais pour identifier une part (voir dataviz : legend obligatoire).
    var legend = document.createElement('div');
    legend.className = 'pieLegend';
    activities.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'pieLegendRow';
      var dot = document.createElement('span');
      dot.className = 'pieLegendDot';
      dot.style.background = a.color;
      var label = document.createElement('span');
      label.className = 'pieLegendLabel';
      label.textContent = a.name;
      var value = document.createElement('span');
      value.className = 'pieLegendValue';
      value.textContent = formatHM(a.seconds) + ' · ' + a.percent + '%';
      row.appendChild(dot); row.appendChild(label); row.appendChild(value);
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
  }

  // ----- Section Graphique : une courbe d'évolution par activité sur la
  // période sélectionnée, plus une courbe Total agrégeant toutes les
  // activités — remplace l'ancien "Détail par jour" (renderDaily) et,
  // depuis le 29 août 2026, l'ancienne bascule barres/courbe (barres
  // retirées à la demande d'Emilien : uniquement la courbe désormais).
  // Légende obligatoire dès que la courbe Total s'ajoute à celle(s)
  // d'activité (voir dataviz : légende dès 2 séries), et survol en
  // crosshair + infobulle flottante (pattern par défaut pour un graphique
  // en courbe, voir dataviz : interaction). -----

  // Étiquette d'un point du Graphique. Utilitaire générique, partagé avec la
  // Communauté (renderActivityChart plus bas, jamais modifiée par
  // Statistiques) : ses points n'ont pas de `granularity`, donc ils passent
  // toujours par la branche jour ci-dessous, comportement inchangé pour eux.
  // Pour Statistiques (1er septembre 2026, granularité semaine/mois du
  // Graphique), le serveur envoie déjà `shortLabel`/`fullLabel` tout formatés
  // (voir chartBreakdownForUser, server/lib/stats.js) — pas de calcul de date
  // ici pour ces deux cas.
  function dayChartLabel(d, shortForm) {
    if (d.granularity === 'week' || d.granularity === 'month') {
      return shortForm ? d.shortLabel : d.fullLabel;
    }
    var dateObj = new Date(d.isoDate + 'T00:00:00');
    var dm = pad(dateObj.getDate()) + '/' + pad(dateObj.getMonth() + 1);
    return shortForm ? dm : (t(d.dayOfWeek) + ' ' + dm);
  }

  // Construit, à partir du détail journalier de la période, une série par
  // activité (temps en secondes par jour, zéro pour les jours sans cette
  // activité) plus une série Total (somme déjà fournie par jour). Couleur
  // de chaque activité = sa couleur déjà attribuée (identité stable,
  // jamais recalculée) ; couleur du Total = textColorForTheme (blanc en
  // sombre, noir en clair), comme demandé. Ordre = temps total décroissant
  // sur la période, comme la légende du Camembert, Total toujours en
  // dernier.
  function buildChartSeries(sortedDays) {
    var byActivity = {};
    var order = [];
    sortedDays.forEach(function (d) {
      (d.activities || []).forEach(function (a) {
        if (!byActivity[a.activityId]) {
          byActivity[a.activityId] = { activityId: a.activityId, name: a.name, color: a.color, total: 0 };
          order.push(a.activityId);
        }
        byActivity[a.activityId].total += a.seconds;
        byActivity[a.activityId].name = a.name;
        byActivity[a.activityId].color = a.color;
      });
    });

    var activities = order.map(function (id) { return byActivity[id]; })
      .sort(function (a, b) { return b.total - a.total; });

    var series = activities.map(function (act) {
      return {
        id: act.activityId,
        name: act.name,
        color: act.color,
        isTotal: false,
        values: sortedDays.map(function (d) {
          var found = (d.activities || []).find(function (a) { return a.activityId === act.activityId; });
          return found ? found.seconds : 0;
        }),
      };
    });

    series.push({
      id: '__total__',
      name: t('Total'),
      color: textColorForTheme(currentTheme),
      isTotal: true,
      values: sortedDays.map(function (d) { return d.totalSeconds; }),
    });

    return series;
  }

  function renderChartLegend(series) {
    var legend = $('statsChartLegend');
    legend.innerHTML = '';
    series.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'chartLegendRow' + (s.isTotal ? ' chartLegendTotal' : '');
      var dot = document.createElement('span');
      dot.className = 'chartLegendDot';
      dot.style.background = s.color;
      var label = document.createElement('span');
      label.className = 'chartLegendLabel';
      label.textContent = s.name;
      row.appendChild(dot); row.appendChild(label);
      legend.appendChild(row);
    });
  }

  function renderChart(days) {
    var box = $('statsChart');
    box.innerHTML = '';
    var hasData = days && days.length > 0;
    $('statsChartEmptyHint').classList.toggle('hidden', hasData);
    $('statsChartLegend').innerHTML = '';
    $('chartTooltip').classList.add('hidden');
    if (!hasData) return;

    var sorted = days.slice().sort(function (a, b) { return a.isoDate < b.isoDate ? -1 : 1; });
    var series = buildChartSeries(sorted);
    var maxSeconds = sorted.reduce(function (m, d) { return Math.max(m, d.totalSeconds); }, 0) || 1;

    var width = Math.max(320, sorted.length * 56);
    var height = 180, padTop = 14, padBottom = 26, padSide = 8;
    var plotH = height - padTop - padBottom;
    var stepW = (width - padSide * 2) / sorted.length;

    function xFor(i) { return padSide + stepW * (i + 0.5); }
    function yFor(seconds) { return padTop + plotH - (seconds / maxSeconds) * plotH; }

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'chartSvg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = width + 'px';
    if (!chartFullscreenActive) svg.style.height = height + 'px';

    var baseline = document.createElementNS(svgNS, 'line');
    baseline.setAttribute('x1', 0); baseline.setAttribute('x2', width);
    baseline.setAttribute('y1', height - padBottom); baseline.setAttribute('y2', height - padBottom);
    baseline.setAttribute('class', 'chartAxisLine');
    svg.appendChild(baseline);

    // Le Total est dessiné en dernier (donc visuellement au-dessus des
    // courbes d'activité) : c'est la synthèse, elle doit rester lisible.
    var ordered = series.slice().sort(function (a, b) { return (a.isTotal ? 1 : 0) - (b.isTotal ? 1 : 0); });

    ordered.forEach(function (s) {
      var points = s.values.map(function (v, i) { return { x: xFor(i), y: yFor(v) }; });
      var pathD = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
      var line = document.createElementNS(svgNS, 'path');
      line.setAttribute('d', pathD);
      line.setAttribute('class', 'chartLine' + (s.isTotal ? ' chartLineTotal' : ''));
      line.style.stroke = s.color;
      svg.appendChild(line);

      points.forEach(function (p) {
        var dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 4);
        dot.setAttribute('class', 'chartDot');
        dot.style.fill = s.color;
        svg.appendChild(dot);
      });
    });

    sorted.forEach(function (d, i) {
      var x = xFor(i);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x); label.setAttribute('y', height - 8);
      label.setAttribute('class', 'chartAxisLabel');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = dayChartLabel(d, true);
      svg.appendChild(label);
    });

    // ----- Survol : crosshair vertical + infobulle listant chaque série au
    // jour survolé (voir dataviz : interaction obligatoire par défaut sur
    // un graphique en courbe — pas un <title> par point comme avant). -----
    var crosshair = document.createElementNS(svgNS, 'line');
    crosshair.setAttribute('y1', padTop); crosshair.setAttribute('y2', height - padBottom);
    crosshair.setAttribute('class', 'chartCrosshair hidden');
    svg.appendChild(crosshair);

    var hoverLayer = document.createElementNS(svgNS, 'rect');
    hoverLayer.setAttribute('x', 0); hoverLayer.setAttribute('y', 0);
    hoverLayer.setAttribute('width', width); hoverLayer.setAttribute('height', height);
    hoverLayer.setAttribute('class', 'chartHoverLayer');
    svg.appendChild(hoverLayer);

    var tooltip = $('chartTooltip');
    var wrapEl = $('statsChartWrap');

    function showTooltipAt(i) {
      var d = sorted[i];
      crosshair.setAttribute('x1', xFor(i)); crosshair.setAttribute('x2', xFor(i));
      crosshair.classList.remove('hidden');

      tooltip.innerHTML = '';
      var dateEl = document.createElement('div');
      dateEl.className = 'chartTooltipDate';
      dateEl.textContent = dayChartLabel(d);
      tooltip.appendChild(dateEl);

      ordered.slice().reverse().forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'chartTooltipRow';
        var dot = document.createElement('span');
        dot.className = 'chartTooltipDot';
        dot.style.background = s.color;
        var label = document.createElement('span');
        label.className = 'chartTooltipLabel';
        label.textContent = s.name;
        var value = document.createElement('span');
        value.className = 'chartTooltipValue';
        value.textContent = formatHM(s.values[i]);
        row.appendChild(dot); row.appendChild(label); row.appendChild(value);
        tooltip.appendChild(row);
      });

      // Positionnée par rapport à .chartWrap (pas .chartScroll, qui défile
      // horizontalement), pour ne jamais être coupée par le scroll.
      var svgRect = svg.getBoundingClientRect();
      var wrapRect = wrapEl.getBoundingClientRect();
      var px = svgRect.left - wrapRect.left + (xFor(i) / width) * svgRect.width;
      var py = svgRect.top - wrapRect.top + (yFor(d.totalSeconds) / height) * svgRect.height;
      tooltip.style.left = px + 'px';
      tooltip.style.top = (py - 10) + 'px';
      tooltip.classList.remove('hidden');
    }

    function hideTooltip() {
      crosshair.classList.add('hidden');
      tooltip.classList.add('hidden');
    }

    function indexFromEvent(evt) {
      var rect = svg.getBoundingClientRect();
      var relX = ((evt.clientX - rect.left) / rect.width) * width;
      var i = Math.round((relX - padSide) / stepW - 0.5);
      if (i < 0) i = 0;
      if (i > sorted.length - 1) i = sorted.length - 1;
      return i;
    }

    hoverLayer.addEventListener('pointermove', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerenter', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerleave', hideTooltip);

    box.appendChild(svg);
    renderChartLegend(series);
  }

  // ----- Plein écran du Graphique : remplit simplement l'écran (voir
  // #statsChartBlock.fullscreen dans styles.css), avec en plus un
  // agrandissement du graphique lui-même (voir renderChart() plus haut :
  // preserveAspectRatio="none" + hauteur inline omise en plein écran pour
  // laisser la hauteur s'étirer via CSS). Plus de rotation CSS forcée ni de
  // verrouillage d'orientation ici depuis le 1er septembre 2026 (demande
  // d'Emilien — voir le commentaire dans styles.css) : le plein écran suit
  // simplement l'orientation réelle du téléphone. Les deux plein écrans de
  // Statistiques partagent body.scrollLock : mutuellement exclusifs pour ne
  // jamais laisser le scroll verrouillé par l'un pendant que l'autre se
  // ferme (29 août 2026, suite demande Emilien).
  function exitChartFullscreen() {
    if (!chartFullscreenActive) return;
    chartFullscreenActive = false;
    $('statsChartBlock').classList.remove('fullscreen');
    document.body.classList.remove('scrollLock');
    $('chartFullscreenBtn').textContent = '⛶';
    $('chartFullscreenBtn').setAttribute('aria-label', t('Voir en plein écran'));
    renderChart(lastDailyBreakdown);
  }
  $('chartFullscreenBtn').addEventListener('click', function () {
    if (!chartFullscreenActive) exitStatsFullscreen();
    chartFullscreenActive = !chartFullscreenActive;
    $('statsChartBlock').classList.toggle('fullscreen', chartFullscreenActive);
    document.body.classList.toggle('scrollLock', chartFullscreenActive);
    $('chartFullscreenBtn').textContent = chartFullscreenActive ? '✕' : '⛶';
    $('chartFullscreenBtn').setAttribute('aria-label', chartFullscreenActive ? t('Quitter le plein écran') : t('Voir en plein écran'));
    renderChart(lastDailyBreakdown);
  });

  // ----- Plein écran de la Feuille de temps : remplit simplement l'écran
  // (voir #statsTimesheetBlock.fullscreen dans styles.css). Plus de rotation
  // CSS forcée ni de verrouillage d'orientation depuis le 1er septembre 2026
  // (demande d'Emilien — voir le commentaire dans styles.css). -----
  function exitStatsFullscreen() {
    if (!statsFullscreenActive) return;
    statsFullscreenActive = false;
    $('statsTimesheetBlock').classList.remove('fullscreen');
    document.body.classList.remove('scrollLock');
    $('tsFullscreenBtn').textContent = '⛶';
    $('tsFullscreenBtn').setAttribute('aria-label', t('Voir en plein écran'));
  }
  $('tsFullscreenBtn').addEventListener('click', function () {
    if (!statsFullscreenActive) exitChartFullscreen();
    statsFullscreenActive = !statsFullscreenActive;
    $('statsTimesheetBlock').classList.toggle('fullscreen', statsFullscreenActive);
    document.body.classList.toggle('scrollLock', statsFullscreenActive);
    $('tsFullscreenBtn').textContent = statsFullscreenActive ? '✕' : '⛶';
    $('tsFullscreenBtn').setAttribute('aria-label', statsFullscreenActive ? t('Quitter le plein écran') : t('Voir en plein écran'));
  });

  // ===================== FEUILLE DE TEMPS (heatmap hebdomadaire) =====
  // Grille jour × quart d'heure, dans l'esprit de l'onglet "Feuille de
  // temps" du Google Sheet d'origine. Repart toujours sur la semaine en
  // cours à l'ouverture de l'onglet (voir switchTab) : les semaines
  // précédentes ne sont jamais supprimées côté serveur, seulement masquées
  // par défaut ici — on y accède avec la flèche "précédente".
  // Ces deux flèches naviguent en semaines ou en mois selon la période
  // choisie dans le menu "⋮" (currentTimesheetPeriod — voir plus haut) :
  // mêmes boutons, mêmes ids, comportement adapté à la vue affichée.
  $('tsPrevWeek').addEventListener('click', function () {
    if (currentTimesheetPeriod === 'month') currentTimesheetMonthOffset += 1;
    else currentTimesheetOffset += 1;
    loadTimesheet();
  });
  $('tsNextWeek').addEventListener('click', function () {
    if (currentTimesheetPeriod === 'month') {
      if (currentTimesheetMonthOffset === 0) return;
      currentTimesheetMonthOffset -= 1;
    } else {
      if (currentTimesheetOffset === 0) return;
      currentTimesheetOffset -= 1;
    }
    loadTimesheet();
  });

  // Dispatch selon la période choisie : "Semaine" (heatmap 15 min, inchangée)
  // ou "Mois" (calendrier 2h, ajouté le 30 août 2026 — voir renderTimesheetMonth).
  function loadTimesheet() {
    if (!profile) return;
    if (currentTimesheetPeriod === 'month') {
      api('GET', '/api/stats/timesheet?userId=' + profile.id + '&period=month&monthOffset=' + currentTimesheetMonthOffset).then(renderTimesheetMonth);
    } else {
      api('GET', '/api/stats/timesheet?userId=' + profile.id + '&period=week&weekOffset=' + currentTimesheetOffset).then(renderTimesheetWeek);
    }
  }

  function renderTimesheetWeek(data) {
    $('tsGrid').classList.remove('hidden');
    $('tsCalendar').classList.add('hidden');

    $('tsWeekLabel').textContent = t(data.label) + (data.isCurrentWeek ? t(' (en cours)') : '');
    $('tsNextWeek').disabled = data.isCurrentWeek;
    $('tsPrevWeek').disabled = !data.hasMoreBefore;

    var hasAnyEntry = data.days.some(function (day) { return day.slots.some(function (s) { return !!s; }); });
    $('tsEmptyHint').classList.toggle('hidden', hasAnyEntry);

    var html = '<div class="tsCorner"></div>';
    for (var h = 0; h < 24; h++) {
      html += '<div class="tsHourLabel" style="grid-column: span 4;">' + h + 'h</div>';
    }

    data.days.forEach(function (day) {
      var dateObj = new Date(day.isoDate + 'T00:00:00');
      html += '<div class="tsDayLabel">' + t(day.dayOfWeek).slice(0, 3) + ' ' + pad(dateObj.getDate()) + '/' + pad(dateObj.getMonth() + 1) + '</div>';
      day.slots.forEach(function (slot, i) {
        var slotLabel = pad(Math.floor(i / 4)) + ':' + pad((i % 4) * 15);
        if (slot) {
          html += '<div class="tsSlot tsSlot-filled" style="background:' + slot.color + '" title="' + escapeHtml(slot.name) + ' · ' + slotLabel + '"></div>';
        } else {
          html += '<div class="tsSlot" title="' + slotLabel + '"></div>';
        }
      });
    });

    $('tsGrid').innerHTML = html;
  }

  // ----- Feuille de temps, vue "Mois" (calendrier) — ajoutée le 30 août
  // 2026 à la demande d'Emilien : semaines en lignes (libellé "dd/mm -
  // dd/mm" figé à gauche, comme les jours de la vue Semaine), jours de la
  // semaine en colonnes (Lun à Dim), chaque case-jour décomposée en 12
  // sections de 2h (voir MONTH_SLOT_MINUTES côté serveur). Les jours "hors
  // mois" qui complètent la première/dernière semaine (data.inMonth: false)
  // sont affichés atténués plutôt que masqués, comme un calendrier
  // classique. Les noms de jours passent par t() puis .slice(0, 3), même
  // mécanisme que .tsDayLabel dans renderTimesheetWeek ci-dessus (traduction
  // cohérente avec le reste de l'app). -----
  var TS_CAL_WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  function renderTimesheetMonth(data) {
    $('tsCalendar').classList.remove('hidden');
    $('tsGrid').classList.add('hidden');

    $('tsWeekLabel').textContent = t(data.label) + (data.isCurrentMonth ? t(' (en cours)') : '');
    $('tsNextWeek').disabled = data.isCurrentMonth;
    $('tsPrevWeek').disabled = !data.hasMoreBefore;

    var hasAnyEntry = data.weeks.some(function (week) {
      return week.some(function (day) { return day.slots.some(function (s) { return !!s; }); });
    });
    $('tsEmptyHint').classList.toggle('hidden', hasAnyEntry);

    var html = '<div class="tsCalCorner"></div>';
    TS_CAL_WEEKDAY_NAMES.forEach(function (name) {
      html += '<div class="tsCalHeaderCell">' + t(name).slice(0, 3) + '</div>';
    });

    data.weeks.forEach(function (week) {
      var firstDate = new Date(week[0].isoDate + 'T00:00:00');
      var lastDate = new Date(week[6].isoDate + 'T00:00:00');
      html += '<div class="tsCalWeekLabel">' + pad(firstDate.getDate()) + '/' + pad(firstDate.getMonth() + 1)
        + ' - ' + pad(lastDate.getDate()) + '/' + pad(lastDate.getMonth() + 1) + '</div>';

      week.forEach(function (day) {
        var dateObj = new Date(day.isoDate + 'T00:00:00');
        html += '<div class="tsCalDay' + (day.inMonth ? '' : ' tsCalDay-outside') + '">';
        html += '<div class="tsCalDayNum">' + dateObj.getDate() + '</div>';
        html += '<div class="tsCalDaySlots">';
        day.slots.forEach(function (slot, i) {
          var slotLabel = pad(i * 2) + 'h-' + pad(i * 2 + 2) + 'h';
          if (slot) {
            html += '<div class="tsCalSlot" style="background:' + slot.color + '" title="' + escapeHtml(slot.name) + ' · ' + slotLabel + '"></div>';
          } else {
            html += '<div class="tsCalSlot" title="' + slotLabel + '"></div>';
          }
        });
        html += '</div></div>';
      });
    });

    $('tsCalendar').innerHTML = '<div class="tsCalendarGrid">' + html + '</div>';
  }

  // ===================== COMMUNAUTÉ =====================
  // Le sélecteur "Communauté / Membres" qui vivait ici (et son gestionnaire
  // de clic) a été retiré le 30 août 2026 : la section "Membres" a déménagé
  // en bloc dans l'onglet Activité — voir loadActivityTab plus haut.
  // Communauté ne garde plus, depuis le 30 août 2026 (nouvelle demande de
  // simplification d'Emilien), que la recherche et le Suivi (liste + flux) —
  // sans titres de section ni textes d'intro fixes (voir index.html). "En ce
  // moment" (loadLiveFeed) a été retiré de cet onglet : le flux "Partagée"
  // avait déjà été retiré plus tôt dans la journée (doublon avec le détail
  // par activité de l'onglet Activité). Les demandes de suivi reçues
  // (loadFollowRequests) restent chargées depuis Profil, pas ici.
  function loadCommunity() {
    if (!profile) return;
    $('communitySearchInput').value = '';
    $('communitySearchResults').innerHTML = '';
    loadFollowingFeed();
  }

  // ----- Activité sélectionnée dans l'onglet Activité -----
  // Depuis le 30 août 2026 (fin de journée), il n'y a plus qu'UNE liste
  // d'activités dans l'app (voir renderActivitiesSettings) : partagée ou non,
  // chaque activité y est une ligne. Sélectionner une activité PARTAGÉE
  // déplie, juste sous sa ligne, tout ce qui concerne ses autres membres —
  // discussion, statistiques, feuille de temps, enregistrements et notes.
  var currentCommunityActivityId = '';

  // Le bloc de détail est un élément unique, déplacé d'une ligne à l'autre au
  // fil des sélections. Il doit être détaché AVANT que la liste ne soit vidée
  // (box.innerHTML = ''), sans quoi il serait détruit avec elle.
  // On garde une référence directe au nœud : tant qu'il est détaché, il n'est
  // plus dans le document, donc getElementById (le $ de ce fichier) ne le
  // retrouve PAS — ni lui, ni aucun de ses enfants.
  var activityDetailNode = null;

  function activityDetailEl() {
    if (!activityDetailNode) activityDetailNode = $('communityActivityDetail');
    return activityDetailNode;
  }

  function detachActivityDetail() {
    var detail = activityDetailEl();
    if (detail && detail.parentNode) detail.parentNode.removeChild(detail);
    return detail;
  }

  function attachActivityDetail(host) {
    var detail = activityDetailEl();
    if (!detail) return;
    (host || $('activityDetailAnchor')).appendChild(detail);
  }

  function loadActivityDetail(shouldScroll) {
    if (!profile) return;
    if (!currentCommunityActivityId) {
      activityDetailEl().classList.add('hidden');
      exitActivityTimesheetFullscreen();
      exitActivityChartFullscreen();
      stopDiscussionPolling();
      return;
    }

    // Nouvelle sélection : on repart toujours de zéro sur les statistiques de
    // CETTE activité (période "Semaine", semaine en cours, aucun plein
    // écran) — même logique que l'ouverture de l'onglet Statistiques.
    currentActivityStatsPeriod = 'week';
    document.querySelectorAll('#communityActivityPeriodSwitch .periodBtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.period === 'week');
    });
    currentActivityTimesheetOffset = 0;
    exitActivityTimesheetFullscreen();
    exitActivityChartFullscreen();
    // Nouvelle activité : on repart d'un fil vide côté affichage, sinon la
    // signature du fil précédent empêcherait le premier rendu (et le
    // défilement automatique vers le dernier message).
    discussionRenderedIds = '';
    $('communityDiscussionList').innerHTML = '';
    $('communityDiscussionInput').value = '';
    $('communityDiscussionMsg').textContent = '';

    api('GET', '/api/community/activity-feed?userId=' + profile.id + '&activityId=' + currentCommunityActivityId).then(function (data) {
      activityDetailEl().classList.remove('hidden');
      $('communityActivityDetailName').textContent = '· ' + data.activityName;
      var box = $('communityActivityDetailFeed');
      box.innerHTML = '';
      $('communityActivityDetailEmptyHint').classList.toggle('hidden', data.entries.length > 0);
      data.entries.forEach(function (entry) { box.appendChild(buildFeedEntryCard(entry)); });
      // Défile directement jusqu'au détail, uniquement quand on VIENT de
      // sélectionner une activité (pas quand on la désélectionne, ni lors
      // d'un rafraîchissement silencieux) — demande d'Emilien du jour.
      if (shouldScroll) {
        activityDetailEl().scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }).catch(function (err) {
      // L'activité a pu être quittée/supprimée entre-temps par un autre
      // membre : on referme simplement le détail plutôt que d'afficher une
      // erreur bloquante.
      activityDetailEl().classList.add('hidden');
      currentCommunityActivityId = '';
      loadSettingsActivities();
    });

    loadActivityStats(currentCommunityActivityId);
    loadActivityTimesheet(currentCommunityActivityId);
    loadDiscussion(true);
    startDiscussionPolling();
  }

  // ===================== FIL DE DISCUSSION D'UNE ACTIVITÉ PARTAGÉE =========
  // Troisième forme d'écrit entre membres, volontairement distincte des deux
  // qui existaient déjà : la note de session (écrite au STOP, attachée à une
  // session, visible dans les flux "Partagée"/"Suivi") et la note "en direct"
  // du Chrono (visible seulement tant que le chrono de son auteur tourne).
  // Ici : une conversation, sans rapport avec un chrono, conservée
  // durablement, réservée aux membres actuels de l'activité — voir
  // activity_messages dans server/db.js et les routes
  // /api/community/activity-messages.
  var discussionPollTimer = null;
  var discussionRenderedIds = ''; // signature du dernier rendu, pour ne pas redessiner à l'identique

  // Rafraîchissement périodique tant que le fil est à l'écran : c'est ce qui
  // permet de voir arriver le message de quelqu'un d'autre sans recharger la
  // page. Volontairement lent (15 s) — l'app n'a pas de WebSocket et c'est
  // une conversation, pas une messagerie instantanée.
  function startDiscussionPolling() {
    stopDiscussionPolling();
    discussionPollTimer = setInterval(function () {
      // Onglet quitté, activité désélectionnée, ou app en arrière-plan
      // (téléphone verrouillé) : rien à recharger.
      if (!currentCommunityActivityId || $('tab-community').classList.contains('hidden')) {
        stopDiscussionPolling();
        return;
      }
      if (document.hidden) return;
      loadDiscussion(true);
      refreshUnreadBadges();
    }, 15000);
  }

  function stopDiscussionPolling() {
    if (discussionPollTimer) clearInterval(discussionPollTimer);
    discussionPollTimer = null;
  }

  function loadDiscussion(markRead) {
    if (!profile || !currentCommunityActivityId) return;
    var activityId = currentCommunityActivityId;
    api('GET', '/api/community/activity-messages?userId=' + profile.id + '&activityId=' + activityId + (markRead ? '' : '&markRead=0'))
      .then(function (data) {
        if (String(activityId) !== String(currentCommunityActivityId)) return; // sélection changée entre-temps
        $('communityDiscussionName').textContent = '· ' + data.activityName;
        renderDiscussion(data.messages);
        // La pastille de cette activité vient d'être remise à zéro côté
        // serveur (markRead) : on l'efface tout de suite ici plutôt que
        // d'attendre le prochain rechargement complet de la liste.
        if (markRead) setUnreadBadge(activityId, 0);
      })
      .catch(function () {
        // Activité quittée/supprimée entre-temps : loadActivityDetail gère
        // déjà la fermeture du détail, rien à faire de plus ici.
      });
  }

  function renderDiscussion(messages) {
    var box = $('communityDiscussionList');
    $('communityDiscussionEmptyHint').classList.toggle('hidden', messages.length > 0);

    // Signature du contenu : évite de reconstruire (et donc de faire sauter le
    // défilement) à chaque tour du rafraîchissement périodique quand rien n'a
    // changé.
    var signature = messages.map(function (m) { return m.id; }).join(',');
    if (signature === discussionRenderedIds) return;
    var wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    var isFirstRender = discussionRenderedIds === '';
    discussionRenderedIds = signature;

    box.innerHTML = '';
    messages.forEach(function (m) {
      var mine = profile && m.userId === profile.id;
      var when = new Date(m.createdAt);
      var dateLabel = when.toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
      var timeLabel = pad(when.getHours()) + ':' + pad(when.getMinutes());

      var msg = document.createElement('div');
      msg.className = 'discussionMsg' + (mine ? ' mine' : '');
      msg.innerHTML =
        '<div class="discussionMsgTop">' +
          '<span class="discussionMsgAuthor"><span class="dot" style="background:' + m.userColor + '"></span>' +
          escapeHtml(m.userName) + (mine ? t(' (toi)') : '') + '</span>' +
          '<span class="meta">' + dateLabel + ' · ' + timeLabel + '</span>' +
        '</div>' +
        '<div class="discussionMsgBody">' + escapeHtml(m.body) + '</div>';

      // Chacun ne supprime que ses propres messages — le propriétaire de
      // l'activité n'a aucun droit particulier ici, comme partout ailleurs
      // dans l'app (voir DELETE /community/activity-messages/:id).
      if (mine) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'discussionMsgDelete';
        del.textContent = '✕';
        del.title = t('Supprimer ce message');
        del.addEventListener('click', function () {
          if (!confirm(t('Supprimer ce message ?'))) return;
          api('DELETE', '/api/community/activity-messages/' + m.id + '?userId=' + profile.id)
            .then(function () { discussionRenderedIds = ''; loadDiscussion(true); })
            .catch(function (err) { alert(err.message); });
        });
        // Placée dans la ligne d'en-tête (et pas en position absolue) pour ne
        // jamais recouvrir l'horodatage, quelle que soit la longueur du nom.
        msg.querySelector('.discussionMsgTop').appendChild(del);
      }

      box.appendChild(msg);
    });

    // Fil chronologique : on reste collé au message le plus récent, sauf si
    // la personne est justement en train de remonter la conversation.
    if (isFirstRender || wasAtBottom) box.scrollTop = box.scrollHeight;
  }

  function sendDiscussionMessage() {
    if (!profile || !currentCommunityActivityId) return;
    var input = $('communityDiscussionInput');
    var body = input.value.trim();
    var msgEl = $('communityDiscussionMsg');
    if (!body) { msgEl.textContent = t('Écris un message avant d\'envoyer.'); return; }

    msgEl.textContent = '';
    $('communityDiscussionSendBtn').disabled = true;
    api('POST', '/api/community/activity-messages', {
      userId: profile.id, activityId: currentCommunityActivityId, body: body,
    })
      .then(function () {
        input.value = '';
        discussionRenderedIds = '';
        loadDiscussion(true);
      })
      .catch(function (err) { msgEl.textContent = err.message; })
      .then(function () { $('communityDiscussionSendBtn').disabled = false; });
  }

  $('communityDiscussionSendBtn').addEventListener('click', sendDiscussionMessage);
  // Entrée = envoyer, Maj+Entrée = retour à la ligne — convention habituelle
  // d'un champ de conversation.
  $('communityDiscussionInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiscussionMessage(); }
  });

  // Pastilles de non-lus : mises à jour en place (sans reconstruire la liste
  // d'activités, ce qui refermerait un menu "⋮" ouvert) — voir
  // GET /api/community/unread-messages.
  function setUnreadBadge(activityId, count) {
    var badge = document.querySelector('#activitiesList .unreadBadge[data-activity-id="' + activityId + '"]');
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle('hidden', !count);
  }

  function refreshUnreadBadges() {
    if (!profile) return;
    api('GET', '/api/community/unread-messages?userId=' + profile.id).then(function (data) {
      document.querySelectorAll('#activitiesList .unreadBadge').forEach(function (badge) {
        var n = data.byActivity[badge.dataset.activityId] || 0;
        badge.textContent = n;
        badge.classList.toggle('hidden', !n);
      });
    }).catch(function () { /* sans conséquence : la pastille reste telle quelle */ });
  }

  // ===================== STATISTIQUES D'UNE ACTIVITÉ (section Membres) =====
  // Mêmes trois sections que l'onglet Statistiques (Feuille de temps /
  // Répartition / Graphique), même fonctionnement (période, plein écran
  // paysage, semaine réinitialisée à chaque sélection — voir
  // loadActivityDetail ci-dessus) — demande d'Emilien, 29-30 août 2026.
  // Copies parallèles et indépendantes des fonctions Statistiques
  // équivalentes (jamais partagées, pour ne jamais faire dépendre l'un des
  // deux chantiers d'un changement futur de l'autre) ; seuls les petits
  // utilitaires déjà génériques (donutSlicePath, dayChartLabel,
  // textColorForTheme, formatHM, escapeHtml, pad, t, $, api) sont réutilisés
  // tels quels. L'axe de comparaison change : ici on compare les MEMBRES
  // d'UNE SEULE activité entre eux, plus les activités entre elles (on est
  // déjà "dans" une seule activité, il n'y en a plus à comparer).
  document.querySelectorAll('#communityActivityPeriodSwitch .periodBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentActivityStatsPeriod = btn.dataset.period;
      document.querySelectorAll('#communityActivityPeriodSwitch .periodBtn').forEach(function (b) { b.classList.toggle('active', b === btn); });
      if (currentCommunityActivityId) loadActivityStats(currentCommunityActivityId);
    });
  });

  function loadActivityStats(activityId) {
    if (!profile || !activityId) return;
    api('GET', '/api/community/activity-stats?userId=' + profile.id + '&activityId=' + activityId + '&period=' + currentActivityStatsPeriod).then(function (data) {
      if (String(activityId) !== String(currentCommunityActivityId)) return; // sélection changée entre-temps
      var block = data[currentActivityStatsPeriod];
      $('communityActivityStatsLabel').textContent = t(block.label);
      $('communityActivityStatsTotal').textContent = formatHM(block.totalSeconds);
      renderActivityPie(block.members, block.totalSeconds);

      lastActivityDailyBreakdown = data.dailyBreakdown || [];
      renderActivityChart(lastActivityDailyBreakdown);
    });
  }

  // ----- Section Camembert : répartition de la période en cours, une part
  // par MEMBRE de cette activité, couleur = couleur personnelle de ce membre
  // sur cette activité (activity_members.color) — pendant exact de
  // renderPie, réindexé par membre au lieu d'activité. -----
  function renderActivityPie(members, totalSeconds) {
    var wrap = $('communityActivityPie');
    wrap.innerHTML = '';
    $('communityActivityPieEmptyHint').classList.toggle('hidden', members.length > 0);
    if (members.length === 0) return;

    var svgNS = 'http://www.w3.org/2000/svg';
    var cx = 50, cy = 50, rOuter = 46, rInner = 27;
    var gap = members.length > 1 ? 0.035 : 0;

    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'pieSvg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('Répartition du temps par membre'));

    var angle = -Math.PI / 2;
    members.forEach(function (m) {
      var frac = totalSeconds > 0 ? m.seconds / totalSeconds : 0;
      var sweep = frac * Math.PI * 2;
      var start = angle + Math.min(gap / 2, sweep / 2);
      var end = angle + sweep - Math.min(gap / 2, sweep / 2);
      if (end < start) end = start;
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', donutSlicePath(cx, cy, rOuter, rInner, start, end));
      path.setAttribute('fill', m.color);
      path.setAttribute('class', 'pieSlice');
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = m.name + ' — ' + formatHM(m.seconds) + ' (' + m.percent + '%)';
      path.appendChild(title);
      svg.appendChild(path);
      angle += sweep;
    });

    var chartArea = document.createElement('div');
    chartArea.className = 'pieChartArea';
    chartArea.appendChild(svg);

    var center = document.createElement('div');
    center.className = 'pieCenter';
    var centerVal = document.createElement('span');
    centerVal.className = 'pieCenterValue';
    centerVal.textContent = formatHM(totalSeconds);
    var centerLabel = document.createElement('span');
    centerLabel.className = 'pieCenterLabel';
    centerLabel.textContent = 'total';
    center.appendChild(centerVal);
    center.appendChild(centerLabel);
    chartArea.appendChild(center);
    wrap.appendChild(chartArea);

    var legend = document.createElement('div');
    legend.className = 'pieLegend';
    members.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'pieLegendRow';
      var dot = document.createElement('span');
      dot.className = 'pieLegendDot';
      dot.style.background = m.color;
      var label = document.createElement('span');
      label.className = 'pieLegendLabel';
      label.textContent = m.name;
      var value = document.createElement('span');
      value.className = 'pieLegendValue';
      value.textContent = formatHM(m.seconds) + ' · ' + m.percent + '%';
      row.appendChild(dot); row.appendChild(label); row.appendChild(value);
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
  }

  // ----- Section Graphique : une courbe d'évolution par MEMBRE sur la
  // période sélectionnée, plus une courbe Total agrégeant tous les membres —
  // pendant exact de buildChartSeries/renderChart, réindexé par membre. -----
  function buildActivityChartSeries(sortedDays) {
    var byMember = {};
    var order = [];
    sortedDays.forEach(function (d) {
      (d.members || []).forEach(function (m) {
        if (!byMember[m.userId]) {
          byMember[m.userId] = { userId: m.userId, name: m.name, color: m.color, total: 0 };
          order.push(m.userId);
        }
        byMember[m.userId].total += m.seconds;
        byMember[m.userId].name = m.name;
        byMember[m.userId].color = m.color;
      });
    });

    var members = order.map(function (id) { return byMember[id]; })
      .sort(function (a, b) { return b.total - a.total; });

    var series = members.map(function (mem) {
      return {
        id: mem.userId,
        name: mem.name,
        color: mem.color,
        isTotal: false,
        values: sortedDays.map(function (d) {
          var found = (d.members || []).find(function (m) { return m.userId === mem.userId; });
          return found ? found.seconds : 0;
        }),
      };
    });

    series.push({
      id: '__total__',
      name: t('Total'),
      color: textColorForTheme(currentTheme),
      isTotal: true,
      values: sortedDays.map(function (d) { return d.totalSeconds; }),
    });

    return series;
  }

  function renderActivityChartLegend(series) {
    var legend = $('communityActivityChartLegend');
    legend.innerHTML = '';
    series.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'chartLegendRow' + (s.isTotal ? ' chartLegendTotal' : '');
      var dot = document.createElement('span');
      dot.className = 'chartLegendDot';
      dot.style.background = s.color;
      var label = document.createElement('span');
      label.className = 'chartLegendLabel';
      label.textContent = s.name;
      row.appendChild(dot); row.appendChild(label);
      legend.appendChild(row);
    });
  }

  function renderActivityChart(days) {
    var box = $('communityActivityChart');
    box.innerHTML = '';
    var hasData = days && days.length > 0;
    $('communityActivityChartEmptyHint').classList.toggle('hidden', hasData);
    $('communityActivityChartLegend').innerHTML = '';
    $('caChartTooltip').classList.add('hidden');
    if (!hasData) return;

    var sorted = days.slice().sort(function (a, b) { return a.isoDate < b.isoDate ? -1 : 1; });
    var series = buildActivityChartSeries(sorted);
    var maxSeconds = sorted.reduce(function (m, d) { return Math.max(m, d.totalSeconds); }, 0) || 1;

    var width = Math.max(320, sorted.length * 56);
    var height = 180, padTop = 14, padBottom = 26, padSide = 8;
    var plotH = height - padTop - padBottom;
    var stepW = (width - padSide * 2) / sorted.length;

    function xFor(i) { return padSide + stepW * (i + 0.5); }
    function yFor(seconds) { return padTop + plotH - (seconds / maxSeconds) * plotH; }

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'chartSvg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = width + 'px';
    if (!activityChartFullscreenActive) svg.style.height = height + 'px';

    var baseline = document.createElementNS(svgNS, 'line');
    baseline.setAttribute('x1', 0); baseline.setAttribute('x2', width);
    baseline.setAttribute('y1', height - padBottom); baseline.setAttribute('y2', height - padBottom);
    baseline.setAttribute('class', 'chartAxisLine');
    svg.appendChild(baseline);

    var ordered = series.slice().sort(function (a, b) { return (a.isTotal ? 1 : 0) - (b.isTotal ? 1 : 0); });

    ordered.forEach(function (s) {
      var points = s.values.map(function (v, i) { return { x: xFor(i), y: yFor(v) }; });
      var pathD = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
      var line = document.createElementNS(svgNS, 'path');
      line.setAttribute('d', pathD);
      line.setAttribute('class', 'chartLine' + (s.isTotal ? ' chartLineTotal' : ''));
      line.style.stroke = s.color;
      svg.appendChild(line);

      points.forEach(function (p) {
        var dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 4);
        dot.setAttribute('class', 'chartDot');
        dot.style.fill = s.color;
        svg.appendChild(dot);
      });
    });

    sorted.forEach(function (d, i) {
      var x = xFor(i);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x); label.setAttribute('y', height - 8);
      label.setAttribute('class', 'chartAxisLabel');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = dayChartLabel(d, true);
      svg.appendChild(label);
    });

    var crosshair = document.createElementNS(svgNS, 'line');
    crosshair.setAttribute('y1', padTop); crosshair.setAttribute('y2', height - padBottom);
    crosshair.setAttribute('class', 'chartCrosshair hidden');
    svg.appendChild(crosshair);

    var hoverLayer = document.createElementNS(svgNS, 'rect');
    hoverLayer.setAttribute('x', 0); hoverLayer.setAttribute('y', 0);
    hoverLayer.setAttribute('width', width); hoverLayer.setAttribute('height', height);
    hoverLayer.setAttribute('class', 'chartHoverLayer');
    svg.appendChild(hoverLayer);

    var tooltip = $('caChartTooltip');
    var wrapEl = $('communityActivityChartWrap');

    function showTooltipAt(i) {
      var d = sorted[i];
      crosshair.setAttribute('x1', xFor(i)); crosshair.setAttribute('x2', xFor(i));
      crosshair.classList.remove('hidden');

      tooltip.innerHTML = '';
      var dateEl = document.createElement('div');
      dateEl.className = 'chartTooltipDate';
      dateEl.textContent = dayChartLabel(d);
      tooltip.appendChild(dateEl);

      ordered.slice().reverse().forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'chartTooltipRow';
        var dot = document.createElement('span');
        dot.className = 'chartTooltipDot';
        dot.style.background = s.color;
        var label = document.createElement('span');
        label.className = 'chartTooltipLabel';
        label.textContent = s.name;
        var value = document.createElement('span');
        value.className = 'chartTooltipValue';
        value.textContent = formatHM(s.values[i]);
        row.appendChild(dot); row.appendChild(label); row.appendChild(value);
        tooltip.appendChild(row);
      });

      var svgRect = svg.getBoundingClientRect();
      var wrapRect = wrapEl.getBoundingClientRect();
      var px = svgRect.left - wrapRect.left + (xFor(i) / width) * svgRect.width;
      var py = svgRect.top - wrapRect.top + (yFor(d.totalSeconds) / height) * svgRect.height;
      tooltip.style.left = px + 'px';
      tooltip.style.top = (py - 10) + 'px';
      tooltip.classList.remove('hidden');
    }

    function hideTooltip() {
      crosshair.classList.add('hidden');
      tooltip.classList.add('hidden');
    }

    function indexFromEvent(evt) {
      var rect = svg.getBoundingClientRect();
      var relX = ((evt.clientX - rect.left) / rect.width) * width;
      var i = Math.round((relX - padSide) / stepW - 0.5);
      if (i < 0) i = 0;
      if (i > sorted.length - 1) i = sorted.length - 1;
      return i;
    }

    hoverLayer.addEventListener('pointermove', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerenter', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerleave', hideTooltip);

    box.appendChild(svg);
    renderActivityChartLegend(series);
  }

  // ----- Plein écran forcé (paysage) du Graphique / de la Feuille de temps
  // de cette activité : même mécanisme (rotation CSS 90°) et même exclusion
  // mutuelle via body.scrollLock que Statistiques — voir
  // #communityActivityTimesheetBlock.fullscreen / #communityActivityChartBlock.fullscreen
  // dans styles.css. -----
  function exitActivityChartFullscreen() {
    if (!activityChartFullscreenActive) return;
    activityChartFullscreenActive = false;
    $('communityActivityChartBlock').classList.remove('fullscreen');
    document.body.classList.remove('scrollLock');
    $('caChartFullscreenBtn').textContent = '⛶';
    $('caChartFullscreenBtn').setAttribute('aria-label', t('Voir en plein écran, format paysage'));
    renderActivityChart(lastActivityDailyBreakdown);
  }
  $('caChartFullscreenBtn').addEventListener('click', function () {
    lockPortraitOrientation();
    if (!activityChartFullscreenActive) exitActivityTimesheetFullscreen();
    activityChartFullscreenActive = !activityChartFullscreenActive;
    $('communityActivityChartBlock').classList.toggle('fullscreen', activityChartFullscreenActive);
    document.body.classList.toggle('scrollLock', activityChartFullscreenActive);
    $('caChartFullscreenBtn').textContent = activityChartFullscreenActive ? '✕' : '⛶';
    $('caChartFullscreenBtn').setAttribute('aria-label', activityChartFullscreenActive ? t('Quitter le plein écran') : t('Voir en plein écran, format paysage'));
    renderActivityChart(lastActivityDailyBreakdown);
  });

  function exitActivityTimesheetFullscreen() {
    if (!activityTimesheetFullscreenActive) return;
    activityTimesheetFullscreenActive = false;
    $('communityActivityTimesheetBlock').classList.remove('fullscreen');
    document.body.classList.remove('scrollLock');
    $('caTsFullscreenBtn').textContent = '⛶';
    $('caTsFullscreenBtn').setAttribute('aria-label', t('Voir en plein écran, format paysage'));
  }
  $('caTsFullscreenBtn').addEventListener('click', function () {
    lockPortraitOrientation();
    if (!activityTimesheetFullscreenActive) exitActivityChartFullscreen();
    activityTimesheetFullscreenActive = !activityTimesheetFullscreenActive;
    $('communityActivityTimesheetBlock').classList.toggle('fullscreen', activityTimesheetFullscreenActive);
    document.body.classList.toggle('scrollLock', activityTimesheetFullscreenActive);
    $('caTsFullscreenBtn').textContent = activityTimesheetFullscreenActive ? '✕' : '⛶';
    $('caTsFullscreenBtn').setAttribute('aria-label', activityTimesheetFullscreenActive ? t('Quitter le plein écran') : t('Voir en plein écran, format paysage'));
  });

  // ===================== FEUILLE DE TEMPS D'UNE ACTIVITÉ (section Membres) ==
  // Même grille jour × quart d'heure que Statistiques, mais combinant les
  // sessions de TOUS les membres actuels de cette activité (voir
  // activityTimesheetForUser dans lib/community.js) — pendant exact de
  // loadTimesheet/renderTimesheet, réindexé par membre. Repart toujours sur
  // la semaine en cours à chaque nouvelle sélection d'activité (voir
  // loadActivityDetail ci-dessus).
  $('caTsPrevWeek').addEventListener('click', function () {
    currentActivityTimesheetOffset += 1;
    if (currentCommunityActivityId) loadActivityTimesheet(currentCommunityActivityId);
  });
  $('caTsNextWeek').addEventListener('click', function () {
    if (currentActivityTimesheetOffset === 0) return;
    currentActivityTimesheetOffset -= 1;
    if (currentCommunityActivityId) loadActivityTimesheet(currentCommunityActivityId);
  });

  function loadActivityTimesheet(activityId) {
    if (!profile || !activityId) return;
    api('GET', '/api/community/activity-timesheet?userId=' + profile.id + '&activityId=' + activityId + '&weekOffset=' + currentActivityTimesheetOffset).then(function (data) {
      if (String(activityId) !== String(currentCommunityActivityId)) return;
      renderActivityTimesheet(data);
    });
  }

  function renderActivityTimesheet(data) {
    $('caTsWeekLabel').textContent = t(data.label) + (data.isCurrentWeek ? t(' (en cours)') : '');
    $('caTsNextWeek').disabled = data.isCurrentWeek;
    $('caTsPrevWeek').disabled = !data.hasMoreBefore;

    var hasAnyEntry = data.days.some(function (day) { return day.slots.some(function (s) { return !!s; }); });
    $('caTsEmptyHint').classList.toggle('hidden', hasAnyEntry);

    var html = '<div class="tsCorner"></div>';
    for (var h = 0; h < 24; h++) {
      html += '<div class="tsHourLabel" style="grid-column: span 4;">' + h + 'h</div>';
    }

    data.days.forEach(function (day) {
      var dateObj = new Date(day.isoDate + 'T00:00:00');
      html += '<div class="tsDayLabel">' + t(day.dayOfWeek).slice(0, 3) + ' ' + pad(dateObj.getDate()) + '/' + pad(dateObj.getMonth() + 1) + '</div>';
      day.slots.forEach(function (slot, i) {
        var slotLabel = pad(Math.floor(i / 4)) + ':' + pad((i % 4) * 15);
        if (slot) {
          html += '<div class="tsSlot tsSlot-filled" style="background:' + slot.color + '" title="' + escapeHtml(slot.name) + ' · ' + slotLabel + '"></div>';
        } else {
          html += '<div class="tsSlot" title="' + slotLabel + '"></div>';
        }
      });
    });

    $('caTsGrid').innerHTML = html;
  }

  // ----- Modale "Voir les membres" (menu "⋮" d'une ligne d'activité) : liste
  // tous les membres de cette activité, avec un point vert si leur chrono
  // est ACTUELLEMENT en cours pour CETTE activité précise (pas un chrono
  // quelconque sur une autre activité) — voir GET /community/activity-members
  // et activityMembersForUser dans server/lib/community.js. -----
  function openCommunityMembersModal(activityId, activityName) {
    if (!profile) return;
    api('GET', '/api/community/activity-members?userId=' + profile.id + '&activityId=' + activityId).then(function (data) {
      $('communityMembersModalTitle').textContent = t('Membres · {name}', { name: data.activityName });
      var box = $('communityMembersModalList');
      box.innerHTML = '';
      data.members.forEach(function (m) {
        var row = document.createElement('div');
        row.className = 'activityRow';
        row.innerHTML =
          '<div class="activityRowHeader">' +
          '<span class="dot" style="background:' + m.color + '"></span>' +
          '<span class="activityRowName">' + escapeHtml(m.name) + (profile && m.userId === profile.id ? t(' (toi)') : '') + '</span>' +
          (m.isRunning ? '<span class="memberLiveDot" title="' + t('Chrono en cours sur cette activité') + '"></span>' : '') +
          '</div>';
        box.appendChild(row);
      });
      $('communityMembersModal').classList.remove('hidden');
    });
  }

  $('communityMembersModalClose').addEventListener('click', function () {
    $('communityMembersModal').classList.add('hidden');
  });
  // Clic sur le fond assombri (en dehors de la carte) pour fermer, comme un
  // panneau modal standard.
  $('communityMembersModal').addEventListener('click', function (e) {
    if (e.target === this) this.classList.add('hidden');
  });

  // ===================== SUIVI (Recherche / Demandes / Suivi / Partagée) =====
  // Entièrement indépendant du partage d'activité ci-dessus : suivre
  // quelqu'un ne donne accès à aucune de ses activités partagées, et
  // partager une activité avec quelqu'un ne le fait pas suivre.

  var communitySearchDebounce = null;
  $('communitySearchInput').addEventListener('input', function () {
    clearTimeout(communitySearchDebounce);
    var q = $('communitySearchInput').value.trim();
    if (!q) { $('communitySearchResults').innerHTML = ''; return; }
    communitySearchDebounce = setTimeout(function () {
      api('GET', '/api/users/search?userId=' + profile.id + '&q=' + encodeURIComponent(q)).then(renderSearchResults);
    }, 250);
  });

  function renderSearchResults(list) {
    var box = $('communitySearchResults');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<p class="hint">' + t('Aucun membre trouvé.') + '</p>';
      return;
    }
    list.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'activityRow';

      var label = document.createElement('p');
      label.className = 'meta';
      label.innerHTML = '<span class="dot" style="background:' + u.color + '"></span> ' + escapeHtml(u.name);
      row.appendChild(label);

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';

      if (u.followStatus === 'accepted') {
        var unfollowBtn = document.createElement('button');
        unfollowBtn.className = 'iconBtn danger';
        unfollowBtn.textContent = t('Se désabonner');
        unfollowBtn.addEventListener('click', function () {
          if (!confirm(t('Te désabonner de {name} ?', { name: u.name }))) return;
          api('DELETE', '/api/follows/' + u.followId + '?userId=' + profile.id)
            .then(function () {
              u.followStatus = 'none'; u.followId = null;
              renderSearchResults(list);
              loadFollowingFeed();
            })
            .catch(function (err) { alert(err.message); });
        });
        actionsWrap.appendChild(unfollowBtn);
      } else if (u.followStatus === 'pending') {
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'iconBtn';
        cancelBtn.textContent = t('Demande envoyée');
        cancelBtn.title = t('Annuler la demande');
        cancelBtn.addEventListener('click', function () {
          api('DELETE', '/api/follows/' + u.followId + '?userId=' + profile.id)
            .then(function () {
              u.followStatus = 'none'; u.followId = null;
              renderSearchResults(list);
            })
            .catch(function (err) { alert(err.message); });
        });
        actionsWrap.appendChild(cancelBtn);
      } else {
        var followBtn = document.createElement('button');
        followBtn.className = 'iconBtn';
        followBtn.textContent = t('Suivre');
        followBtn.addEventListener('click', function () {
          followBtn.disabled = true;
          api('POST', '/api/follows', { followerId: profile.id, followeeId: u.id })
            .then(function (r) {
              u.followStatus = 'pending'; u.followId = r.id;
              renderSearchResults(list);
            })
            .catch(function (err) { alert(err.message); followBtn.disabled = false; });
        });
        actionsWrap.appendChild(followBtn);
      }

      row.appendChild(actionsWrap);
      box.appendChild(row);
    });
  }

  // ----- Demandes de suivi reçues (même principe que les invitations
  // d'activité, mais un mécanisme entièrement séparé) -----
  // Chargée depuis l'onglet Profil (voir switchTab) — le reste du système de
  // Suivi (recherche, fil d'actualité) reste dans Communauté.
  function loadFollowRequests() {
    if (!profile) return;
    api('GET', '/api/follows/requests?userId=' + profile.id).then(renderFollowRequests);
  }

  function renderFollowRequests(list) {
    notifPendingCounts.followRequests = list.length;
    refreshNotifDot();
    var box = $('followRequestsList');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<p class="hint">' + t('Aucune demande en attente.') + '</p>';
      return;
    }
    list.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'activityRow';

      var label = document.createElement('p');
      label.className = 'meta';
      label.innerHTML = '<span class="dot" style="background:' + r.followerColor + '"></span> ' + t('{name} souhaite te suivre.', { name: escapeHtml(r.followerName) });
      row.appendChild(label);

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';

      var acceptBtn = document.createElement('button');
      acceptBtn.className = 'iconBtn';
      acceptBtn.textContent = t('Accepter');
      acceptBtn.addEventListener('click', function () {
        api('POST', '/api/follows/' + r.id + '/accept', { userId: profile.id })
          .then(loadFollowRequests)
          .catch(function (err) { alert(err.message); });
      });

      var declineBtn = document.createElement('button');
      declineBtn.className = 'iconBtn danger';
      declineBtn.textContent = t('Refuser');
      declineBtn.addEventListener('click', function () {
        api('POST', '/api/follows/' + r.id + '/decline', { userId: profile.id })
          .then(loadFollowRequests)
          .catch(function (err) { alert(err.message); });
      });

      actionsWrap.appendChild(acceptBtn);
      actionsWrap.appendChild(declineBtn);
      row.appendChild(actionsWrap);
      box.appendChild(row);
    });
  }

  // ----- Abonnés & Abonnements (créée dans Réglages le 30 août 2026,
  // déplacée sur la vue principale du Profil le 1er septembre 2026 — voir
  // #profileFollowsBtn/#profileFollowsPanel plus bas), chargée uniquement à
  // l'ouverture de ce panneau. ⚠️ 1er septembre 2026, même jour, second
  // passage (demande d'Emilien : « je souhaite que l'option se désabonner
  // apparaisse dans le menu déroulant du bouton abonnés et abonnement dans
  // le profil. Déplace cette option de la communauté ») : le bouton "Se
  // désabonner", jusqu'ici seulement dans "Mes abonnements" de Communauté
  // (#followingList, retiré de #tab-community — voir index.html), vit
  // désormais ici, sur la liste Abonnements uniquement. La liste Abonnés
  // reste en lecture seule (on ne peut retirer que ses propres
  // abonnements, jamais empêcher quelqu'un de nous suivre depuis ici). -----
  function loadFollowConnections() {
    if (!profile) return;
    api('GET', '/api/follows/followers?userId=' + profile.id).then(renderSettingsFollowers);
    api('GET', '/api/follows/following?userId=' + profile.id).then(renderSettingsFollowing);
  }

  function renderNameOnlyList(boxId, emptyHintId, list, actionable) {
    var box = $(boxId);
    box.innerHTML = '';
    $(emptyHintId).classList.toggle('hidden', list.length > 0);
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'activityRow';
      var label = document.createElement('p');
      label.className = 'meta';
      label.innerHTML = '<span class="dot" style="background:' + f.color + '"></span> ' + escapeHtml(f.name);
      row.appendChild(label);

      if (actionable) {
        var actionsWrap = document.createElement('div');
        actionsWrap.className = 'rowActions';
        var unfollowBtn = document.createElement('button');
        unfollowBtn.className = 'iconBtn danger';
        unfollowBtn.textContent = t('Se désabonner');
        unfollowBtn.addEventListener('click', function () {
          if (!confirm(t('Te désabonner de {name} ?', { name: f.name }))) return;
          api('DELETE', '/api/follows/' + f.followId + '?userId=' + profile.id)
            .then(function () { loadFollowConnections(); loadFollowingFeed(); })
            .catch(function (err) { alert(err.message); });
        });
        actionsWrap.appendChild(unfollowBtn);
        row.appendChild(actionsWrap);
      }

      box.appendChild(row);
    });
  }

  function renderSettingsFollowers(list) {
    renderNameOnlyList('settingsFollowersList', 'settingsFollowersEmptyHint', list, false);
  }

  function renderSettingsFollowing(list) {
    renderNameOnlyList('settingsFollowingList', 'settingsFollowingEmptyHint', list, true);
  }

  // ----- Flux "Partagée" et "Suivi" : cartes en lecture seule (activité de
  // quelqu'un d'autre, jamais supprimable depuis ici), avec le nom de
  // l'auteur — contrairement à buildHistoryCard (mes propres entrées). -----
  function buildFeedEntryCard(entry) {
    var card = document.createElement('div');
    card.className = 'historyEntry';

    var start = new Date(entry.startTime), end = new Date(entry.endTime);
    var dateLabel = start.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' });
    var timeLabel = pad(start.getHours()) + ':' + pad(start.getMinutes()) + ' → ' + pad(end.getHours()) + ':' + pad(end.getMinutes());

    card.innerHTML =
      '<div class="rowTop">' +
        '<span class="actName"><span class="dot" style="background:' + entry.userColor + '"></span>' +
        escapeHtml(entry.userName) + (profile && entry.userId === profile.id ? t(' (toi)') : '') + ' · ' + escapeHtml(entry.activityName) + '</span>' +
        '<span class="meta">' + formatHM(entry.durationSeconds) + '</span>' +
      '</div>' +
      '<div class="meta">' + dateLabel + ' · ' + timeLabel + '</div>' +
      (entry.note ? '<div class="note">' + escapeHtml(entry.note) + '</div>' : '');

    return card;
  }

  function loadFollowingFeed() {
    if (!profile) return;
    api('GET', '/api/community/following-feed?userId=' + profile.id).then(function (list) {
      var box = $('followingFeed');
      box.innerHTML = '';
      $('followingFeedEmptyHint').classList.toggle('hidden', list.length > 0);
      list.forEach(function (entry) { box.appendChild(buildFeedEntryCard(entry)); });
    });
  }

  // ----- "En ce moment" (notes envoyées en direct par des membres/abonnés
  // dont le chrono tourne ENCORE) a été retiré du volet Communauté le 30
  // août 2026 (demande d'Emilien) — buildLiveBroadcastCard/loadLiveFeed,
  // qui l'alimentaient, ont été supprimées avec lui : plus aucun élément
  // #liveFeed/#liveFeedEmptyHint dans le DOM pour les recevoir. Le backend
  // (liveFeedForUser / GET /community/live-feed) reste disponible si une
  // future section en a besoin ailleurs. -----

  // ===================== PROFIL =====================

  // ----- Photo de profil -----
  // Depuis le 29 août 2026 (demande d'Emilien), la photo ne se modifie plus
  // depuis Réglages : cliquer sur l'avatar de la vue principale du Profil
  // ouvre directement le sélecteur de fichier et enregistre aussitôt la
  // nouvelle photo (plus de brouillon en attente ni de bouton "Enregistrer"
  // séparé pour la photo — voir les écouteurs plus bas).
  var MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // 8 Mo — garde-fou avant même de tenter de traiter le fichier

  // Bandeau lecture seule affiché en haut de la vue principale du Profil
  // (avatar + nom, voir #profileMain dans index.html). Le nom de famille
  // (facultatif tant qu'un profil créé avant le 29 août 2026 ne l'a pas
  // renseigné) s'affiche accolé au prénom quand il est connu.
  function renderIdentityHeader() {
    if (!profile) return;
    $('identityDisplayName').textContent = profile.lastName ? (profile.name + ' ' + profile.lastName) : profile.name;
    if (profile.avatar) {
      $('avatarDisplayImg').src = profile.avatar;
      $('avatarDisplayImg').classList.remove('hidden');
      $('avatarDisplayInitial').classList.add('hidden');
      $('avatarDisplayCircle').style.background = 'transparent';
      $('avatarRemoveBtn').classList.remove('hidden');
    } else {
      $('avatarDisplayImg').classList.add('hidden');
      $('avatarDisplayImg').removeAttribute('src');
      $('avatarDisplayInitial').classList.remove('hidden');
      $('avatarDisplayInitial').textContent = profile.name ? profile.name.trim().charAt(0).toUpperCase() : '?';
      $('avatarDisplayCircle').style.background = profile.color || 'var(--purple)';
      $('avatarRemoveBtn').classList.add('hidden');
    }
  }

  // Recadre l'image choisie en carré (centre), la limite à `size`x`size` et
  // l'encode en JPEG à la qualité donnée — l'avatar n'étant jamais affiché
  // plus grand que 72px, inutile d'envoyer/stocker une photo de plusieurs Mo.
  function resizeImageFile(file, size, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var side = Math.min(img.width, img.height);
          var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          var canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Clic direct sur l'avatar = ouvre le sélecteur de fichier ; la nouvelle
  // photo est enregistrée aussitôt sélectionnée (PUT immédiat), sans passer
  // par le bouton "Enregistrer" de Réglages (retiré de là, voir index.html).
  $('avatarDisplayCircle').addEventListener('click', function () { $('avatarFileInput').click(); });

  $('avatarFileInput').addEventListener('change', function () {
    var file = this.files[0];
    this.value = ''; // permet de resélectionner le même fichier ensuite si besoin
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      $('avatarMsg').textContent = t('Format non supporté — choisis une image PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      $('avatarMsg').textContent = t('Image trop lourde (8 Mo max) — choisis-en une autre.');
      return;
    }
    $('avatarMsg').textContent = t('Traitement de la photo...');
    resizeImageFile(file, 256, 0.82).then(function (dataUrl) {
      return api('PUT', '/api/profile/' + profile.id, { avatar: dataUrl });
    }).then(function (p) {
      saveProfile(p);
      $('avatarMsg').textContent = t('Photo mise à jour.');
    }).catch(function (err) {
      $('avatarMsg').textContent = err.message || t('Impossible de mettre à jour la photo.');
    });
  });

  $('avatarRemoveBtn').addEventListener('click', function () {
    if (!confirm(t('Retirer la photo de profil ?'))) return;
    api('PUT', '/api/profile/' + profile.id, { avatar: null })
      .then(function (p) {
        saveProfile(p);
        $('avatarMsg').textContent = t('Photo retirée.');
      })
      .catch(function (err) { $('avatarMsg').textContent = err.message; });
  });

  // Apparence, Sécurité et Import vivent sur une page "Réglages" séparée
  // (échange de vue #profileMain <-> #profileSettingsPanel), ouverte par le
  // bouton "⚙️" à côté du titre "Identité" et refermée par le bouton "←".
  // ===================== NOTIFICATIONS =====================
  // Un seul point rouge, sur l'icône "avion en papier" de Profil : il
  // s'allume dès qu'une invitation d'activité OU une demande de suivi est en
  // attente. Les invitations avaient migré vers l'onglet Activité (avec un
  // second point rouge sur cet onglet) plus tôt le 30 août 2026 ; Emilien a
  // tranché le même jour pour qu'elles restent dans ce panneau — d'où le
  // retour à un point unique. Pas d'appel réseau dédié : alimenté par
  // renderInvitesList/renderFollowRequests ci-dessous, qui chargent déjà ces
  // deux listes par ailleurs (showApp, ouverture du Profil).
  var notifPendingCounts = { invites: 0, followRequests: 0 };
  function refreshNotifDot() {
    var none = notifPendingCounts.invites === 0 && notifPendingCounts.followRequests === 0;
    var profileDot = $('profileNotifDot');
    if (profileDot) profileDot.classList.toggle('hidden', none);
    // Même point rouge sur le prénom de la barre du haut : c'est le seul
    // toujours visible depuis les autres onglets, le Profil n'étant plus
    // dans la barre du bas.
    var topDot = $('whoamiDot');
    if (topDot) topDot.classList.toggle('hidden', none);
  }

  // ----- Menu des Réglages : une section dépliée à la fois -----
  // Le panneau ⚙️ n'affiche que la liste des titres ; cliquer un titre déplie
  // sa section et referme les autres. Rouvrir Réglages repart toujours de la
  // liste refermée, pour ne pas retomber sur la section consultée la dernière
  // fois sans l'avoir demandé.
  function closeAllSettingsSections() {
    document.querySelectorAll('#profileSettingsPanel .settingsSection').forEach(function (section) {
      section.classList.remove('open');
      var body = section.querySelector('.settingsSectionBody');
      var head = section.querySelector('.settingsSectionHeader');
      if (body) body.classList.add('hidden');
      if (head) head.setAttribute('aria-expanded', 'false');
    });
  }

  document.querySelectorAll('#profileSettingsPanel .settingsSectionHeader').forEach(function (head) {
    head.addEventListener('click', function () {
      var section = head.closest('.settingsSection');
      if (!section) return;
      var willOpen = !section.classList.contains('open');
      closeAllSettingsSections();
      if (!willOpen) return;
      section.classList.add('open');
      section.querySelector('.settingsSectionBody').classList.remove('hidden');
      head.setAttribute('aria-expanded', 'true');
    });
  });

  // Réglages est un panneau FLOTTANT depuis le 1er septembre 2026 : il ne
  // remplace plus #profileMain, il se superpose à la page en cours, comme le
  // panneau des invitations. showProfileMain() ne fait donc plus que refermer
  // ce panneau et s'assurer que la page Profil est visible.
  function showProfileMain() {
    closeSettingsPanel();
    $('profileMain').classList.remove('hidden');
    // L'icône "⚙️" redevient neutre dès qu'on quitte la vue Réglages —
    // voir showProfileSettings ci-dessous et .topIconBtn.active (styles.css).
    $('profileSettingsBtn').classList.remove('active');
  }
  function closeSettingsPanel() {
    $('profileSettingsPanel').classList.add('hidden');
    $('profileSettingsBtn').classList.remove('active');
  }

  // Ouvre le panneau flottant des Réglages. Referme d'abord celui des
  // invitations : les deux icônes de la barre du haut s'excluent
  // mutuellement (demande d'Emilien, 1er septembre 2026).
  function showProfileSettings() {
    closeNotifPanel();
    closeAllSettingsSections();
    // Le panneau ne passe plus par openProfile() : c'est donc lui qui doit
    // rafraîchir SES propres commandes (thème coché, langue cochée, adresse
    // de partage). Sans ça, après un rechargement de page, la langue et le
    // thème actifs n'apparaissaient plus cochés.
    renderThemeSwitch();
    renderLangSwitch();
    renderShareSettings();
    $('profileSettingsPanel').classList.remove('hidden');
    // Violette tant que Réglages est la vue affichée (1er septembre 2026,
    // demande d'Emilien : même comportement "sélectionné = violet" que les
    // onglets de la barre du bas).
    $('profileSettingsBtn').classList.add('active');
    refreshPushSection();
  }
  // Le bouton "⚙️" vit désormais dans .topbar (31 août 2026, demande
  // d'Emilien — voir index.html), accessible depuis n'importe quel onglet et
  // pas seulement une fois le Profil déjà ouvert. On ne peut donc plus
  // supposer que #tab-profile est visible : on ouvre explicitement le Profil
  // (openProfile, ci-dessus) avant de basculer sur la vue Réglages.
  $('profileSettingsBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    if ($('profileSettingsPanel').classList.contains('hidden')) showProfileSettings();
    else closeSettingsPanel();
  });

  // Referme le panneau des Réglages au clic n'importe où en dehors de lui (ou
  // de son icône) — même mécanisme que le panneau des invitations.
  document.addEventListener('click', function (e) {
    if ($('profileSettingsPanel').classList.contains('hidden')) return;
    if (e.target.closest('.settingsWrap')) return;
    closeSettingsPanel();
  });

  // ===================== NOTIFICATIONS PUSH (Réglages) =====================
  // 1er septembre 2026, demande d'Emilien : recevoir une notification sur le
  // téléphone quand quelqu'un écrit dans le fil d'une activité partagée,
  // invite sur une activité, ou demande à suivre. Côté serveur :
  // server/lib/push.js + server/routes/push.js ; côté réception :
  // le bloc "push" de public/sw.js.
  //
  // Réglage par APPAREIL, pas par profil : ce qui est enregistré côté serveur,
  // c'est l'abonnement de CE navigateur (voir push_subscriptions dans
  // server/db.js). Activer sur le téléphone n'active donc rien sur
  // l'ordinateur, et réciproquement — c'est le comportement attendu.

  var pushPublicKey = null;    // clé VAPID du serveur, chargée une seule fois
  var pushServerEnabled = null; // null = pas encore su

  // La clé VAPID voyage en base64url ; l'API du navigateur attend un tableau
  // d'octets. Conversion standard, rien de spécifique à Noèsis.
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  // Le navigateur sait-il faire des notifications push du tout ? (Un onglet
  // Safari sur iPhone répond non tant que l'app n'est pas installée sur
  // l'écran d'accueil — d'où le message d'aide dédié dans Réglages.)
  function pushSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  function currentPushSubscription() {
    if (!pushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .catch(function () { return null; });
  }

  function loadPushConfig() {
    if (pushServerEnabled !== null) return Promise.resolve();
    return api('GET', '/api/push/public-key')
      .then(function (data) { pushServerEnabled = !!data.enabled; pushPublicKey = data.publicKey || null; })
      .catch(function () { pushServerEnabled = false; });
  }

  // Met la section Notifications de Réglages dans l'état réel de cet appareil.
  // Appelée à chaque ouverture de Réglages : l'autorisation peut avoir été
  // retirée depuis les réglages du navigateur sans que l'app en sache rien.
  function refreshPushSection() {
    var btn = $('pushToggleBtn');
    var testBtn = $('pushTestBtn');
    var msg = $('pushMsg');
    if (!btn) return;

    $('pushIosHint').classList.toggle('hidden', !(isIos() && !pushSupported()));

    if (!pushSupported()) {
      btn.disabled = true;
      testBtn.classList.add('hidden');
      msg.textContent = t("Cet appareil ne gère pas les notifications.");
      return;
    }

    loadPushConfig().then(function () {
      if (!pushServerEnabled) {
        btn.disabled = true;
        testBtn.classList.add('hidden');
        msg.textContent = t("Les notifications ne sont pas configurées sur ce serveur.");
        return;
      }
      if (Notification.permission === 'denied') {
        btn.disabled = true;
        testBtn.classList.add('hidden');
        msg.textContent = t("Les notifications sont bloquées pour ce site dans les réglages de ton navigateur.");
        return;
      }
      btn.disabled = false;
      return currentPushSubscription().then(function (sub) {
        var on = !!sub;
        btn.textContent = on ? t('Désactiver les notifications') : t('Activer les notifications');
        testBtn.classList.toggle('hidden', !on);
        msg.textContent = on ? t('Activées sur cet appareil.') : '';
      });
    });
  }

  function enablePush() {
    var msg = $('pushMsg');
    msg.textContent = t('Activation...');

    return Notification.requestPermission()
      .then(function (permission) {
        if (permission !== 'granted') {
          msg.textContent = t("Autorisation refusée — rien n'a été activé.");
          return null;
        }
        return navigator.serviceWorker.ready.then(function (reg) {
          // userVisibleOnly est obligatoire : c'est l'engagement que chaque
          // push affichera bien une notification visible, et non un traitement
          // silencieux en arrière-plan. Les navigateurs refusent sans.
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
          });
        });
      })
      .then(function (sub) {
        if (!sub) return;
        return api('POST', '/api/push/subscribe', { userId: profile.id, subscription: sub.toJSON() })
          .then(function () { msg.textContent = t('Activées sur cet appareil.'); });
      })
      .catch(function (err) { msg.textContent = err.message || t("Impossible d'activer les notifications."); })
      .then(refreshPushSection);
  }

  function disablePush() {
    var msg = $('pushMsg');
    return currentPushSubscription()
      .then(function (sub) {
        if (!sub) return;
        var endpoint = sub.endpoint;
        // On se désabonne des deux côtés : côté navigateur (plus aucun push
        // n'arrive) ET côté serveur (plus rien n'est envoyé pour rien).
        return sub.unsubscribe().then(function () {
          return api('DELETE', '/api/push/subscribe?userId=' + profile.id + '&endpoint=' + encodeURIComponent(endpoint));
        });
      })
      .then(function () { msg.textContent = t('Désactivées sur cet appareil.'); })
      .catch(function (err) { msg.textContent = err.message || t('Impossible de désactiver les notifications.'); })
      .then(refreshPushSection);
  }

  $('pushToggleBtn').addEventListener('click', function () {
    if (!profile) return;
    currentPushSubscription().then(function (sub) {
      if (sub) disablePush(); else enablePush();
    });
  });

  $('pushTestBtn').addEventListener('click', function () {
    if (!profile) return;
    $('pushMsg').textContent = t('Envoi du test...');
    api('POST', '/api/push/test', { userId: profile.id })
      .then(function () { $('pushMsg').textContent = t('Test envoyé — la notification devrait arriver dans quelques secondes.'); })
      .catch(function (err) { $('pushMsg').textContent = err.message; });
  });

  // Clic sur une notification alors que l'app est déjà ouverte : le service
  // worker nous envoie l'adresse à ouvrir plutôt que de lancer une deuxième
  // fenêtre (voir notificationclick dans public/sw.js).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') openTabFromNotification(event.data.url);
    });
  }

  // L'app était fermée : elle s'ouvre sur /?notif=community ou /?notif=profile
  // (voir les url des notifications dans server/lib/push.js). On bascule sur
  // l'onglet correspondant puis on nettoie l'adresse, pour qu'un rechargement
  // ultérieur ne rejoue pas la même bascule.
  function openTabFromNotification(url) {
    var target = null;
    try {
      target = new URL(url, location.origin).searchParams.get('notif');
    } catch (err) {
      target = null;
    }
    if (target !== 'community' && target !== 'profile') return;
    switchTab(target);
    if (location.search.indexOf('notif=') !== -1) {
      history.replaceState(null, '', location.pathname);
    }
  }

  // "Abonnés & Abonnements" (1er septembre 2026, demande d'Emilien : «
  // déplacer la section abonnés et abonnements des réglages vers le bouton
  // abonnement dans le profil »). Vivait dans Réglages depuis le 30 août
  // 2026 (#profileSettingsPanel) ; s'ouvre désormais en panneau repliable
  // directement sous l'avatar, sur la vue principale du Profil — même
  // principe que le panneau "⋮" d'une activité. loadFollowConnections()
  // (inchangée, toujours scopée à l'appelant) n'est donc plus appelée à
  // l'ouverture de Réglages (voir showProfileSettings ci-dessus) mais ici,
  // uniquement quand on ouvre effectivement le panneau — pas à chaque
  // ouverture du Profil.
  $('profileFollowsBtn').addEventListener('click', function () {
    var panel = $('profileFollowsPanel');
    var opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (opening) loadFollowConnections();
  });

  // Bascule l'affichage du panneau déroulant (#profileNotifPanel) listant
  // invitations et demandes de suivi en attente — sur demande d'Emilien (29
  // août 2026), c'est désormais le SEUL endroit où ces deux listes sont
  // visibles (elles ne sont plus affichées en permanence sur la vue
  // principale du Profil). stopPropagation() évite que le clic soit aussi
  // capté par l'écouteur "clic en dehors" juste en dessous, qui refermerait
  // le panneau aussitôt ouvert.
  // Icône "violette quand sélectionnée" comme les onglets de la barre du bas
  // (1er septembre 2026, demande d'Emilien) : la classe "active" suit
  // l'ouverture/fermeture du panneau, aussi bien au clic sur l'icône qu'à la
  // fermeture "en dehors" juste en dessous — voir .topIconBtn.active dans
  // styles.css.
  function closeNotifPanel() {
    $('profileNotifPanel').classList.add('hidden');
    $('profileNotifBtn').classList.remove('active');
  }

  $('profileNotifBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var opening = $('profileNotifPanel').classList.contains('hidden');
    // Les deux panneaux flottants de la barre du haut s'excluent : ouvrir
    // les invitations referme les Réglages, et réciproquement (demande
    // d'Emilien, 1er septembre 2026).
    if (opening) closeSettingsPanel();
    $('profileNotifPanel').classList.toggle('hidden', !opening);
    $('profileNotifBtn').classList.toggle('active', opening);
  });
  // Referme le panneau au clic n'importe où en dehors de lui (ou du bouton).
  document.addEventListener('click', function (e) {
    if ($('profileNotifPanel').classList.contains('hidden')) return;
    if (e.target.closest('.notifWrap')) return;
    closeNotifPanel();
  });
  $('profileSettingsBack').addEventListener('click', closeSettingsPanel);

  $('settingsSaveBtn').addEventListener('click', function () {
    $('settingsSaveBtn').disabled = true;
    // La photo ne fait plus partie de ce formulaire (voir plus haut,
    // avatarDisplayCircle/avatarFileInput) — seuls nom/nom de famille/
    // téléphone/email sont envoyés ici. lastName/phone/email ne sont inclus
    // dans le payload que s'ils sont renseignés : un champ laissé vide (cas
    // courant pour un profil créé avant l'ajout de ces champs, le 29 août
    // 2026) n'est donc pas envoyé, plutôt que d'être refusé par le serveur
    // (qui interdit d'enregistrer une valeur vide sur ces champs une fois
    // qu'ils existent — voir server/routes/profile.js).
    var payload = { name: $('settingsName').value.trim() };
    var lastName = $('settingsLastName').value.trim();
    var phone = $('settingsPhone').value.trim();
    var email = $('settingsEmail').value.trim();
    if (lastName) payload.lastName = lastName;
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    api('PUT', '/api/profile/' + profile.id, payload)
      .then(function (p) {
        saveProfile(p);
        $('whoamiName').textContent = p.name;
        $('settingsMsg').textContent = t('Profil mis à jour.');
      })
      .catch(function (err) { $('settingsMsg').textContent = err.message; })
      .finally(function () { $('settingsSaveBtn').disabled = false; });
  });

  // ----- Apparence (clair/sombre) -----
  function renderThemeSwitch() {
    document.querySelectorAll('#themeSwitch .themeBtn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.themeChoice === currentTheme);
    });
  }
  document.querySelectorAll('#themeSwitch .themeBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chosen = btn.dataset.themeChoice;
      if (chosen === currentTheme) return;
      $('themeMsg').textContent = '';
      api('PUT', '/api/profile/' + profile.id, { theme: chosen })
        .then(function (p) {
          saveProfile(p);
          renderThemeSwitch();
          $('themeMsg').textContent = t('Thème mis à jour — tes couleurs d\'activités ont été adaptées si besoin.');
          renderNewActivitySwatches();
          refreshActivities().then(renderActivityGrid);
          loadSettingsActivities();
          // Redessine la courbe Total du Graphique sans refetch (sa couleur
          // dépend du thème — blanc en sombre, noir en clair — et doit donc
          // rester juste immédiatement après un changement de thème).
          if (lastDailyBreakdown.length) renderChart(lastDailyBreakdown);
        })
        .catch(function (err) { $('themeMsg').textContent = err.message; });
    });
  });

  // ----- Langue (français / anglais) -----
  // Un rechargement complet de la page suit l'enregistrement : c'est le
  // moyen le plus sûr de tout remettre dans la bonne langue d'un coup
  // (textes statiques ET listes déjà rendues), plutôt que de retraduire à
  // chaud une interface déjà construite — d'autant que le dictionnaire ne
  // traduit que dans le sens français -> anglais.
  document.querySelectorAll('#langSwitch .themeBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chosen = btn.dataset.langChoice;
      if (chosen === currentLang) return;
      $('langMsg').textContent = '';
      api('PUT', '/api/profile/' + profile.id, { lang: chosen })
        .then(function (p) {
          // Le serveur doit confirmer la nouvelle langue. S'il renvoie autre
          // chose (ou rien du tout), c'est qu'il tourne encore sur la version
          // d'avant la mise à jour : on le dit clairement au lieu de recharger
          // dans l'ancienne langue, ce qui donnait l'impression que le bouton
          // ne faisait rien.
          if (p.lang !== chosen) {
            $('langMsg').textContent = t("Le serveur n'a pas pris en compte le changement de langue : il tourne encore sur la version d'avant la mise à jour. Arrête-le (Ctrl+C) et relance `npm start`, puis réessaie.");
            return;
          }
          saveProfile(p);
          $('langMsg').textContent = t('Langue mise à jour.');
          location.reload();
        })
        .catch(function (err) { $('langMsg').textContent = err.message; });
    });
  });

  $('settingsPinSaveBtn').addEventListener('click', function () {
    var currentPin = $('settingsCurrentPin').value.trim();
    var newPin = $('settingsNewPin').value.trim();
    var newPinConfirm = $('settingsNewPinConfirm').value.trim();
    if (!/^[0-9]{4,6}$/.test(newPin)) { $('settingsPinMsg').textContent = t('Le nouveau code doit comporter 4 à 6 chiffres.'); return; }
    if (newPin !== newPinConfirm) { $('settingsPinMsg').textContent = t('Les deux codes ne correspondent pas.'); return; }
    $('settingsPinSaveBtn').disabled = true;
    api('POST', '/api/profile/' + profile.id + '/set-pin', { pin: newPin, currentPin: currentPin })
      .then(function () {
        $('settingsPinMsg').textContent = t('Code mis à jour.');
        $('settingsCurrentPin').value = '';
        $('settingsNewPin').value = '';
        $('settingsNewPinConfirm').value = '';
      })
      .catch(function (err) { $('settingsPinMsg').textContent = err.message; })
      .finally(function () { $('settingsPinSaveBtn').disabled = false; });
  });

  // ===================== MES NOTES =====================
  // Toutes les notes que CE profil a laissées sur ses propres sessions,
  // toutes activités et toutes périodes confondues (contrairement à
  // l'historique du Chrono, limité à la semaine en cours) — alimente la
  // section "Mes notes" de l'onglet Profil. Réutilise buildHistoryCard,
  // qui construit déjà la même carte (activité, date, durée, note,
  // suppression) pour l'historique de Chrono.
  function loadProfileNotes() {
    if (!profile) return;
    api('GET', '/api/notes?userId=' + profile.id).then(renderNotesList);
  }

  function renderNotesList(entries) {
    var box = $('notesList');
    box.innerHTML = '';
    $('notesEmptyHint').classList.toggle('hidden', entries.length > 0);
    entries.forEach(function (entry) {
      box.appendChild(buildHistoryCard(entry, loadProfileNotes));
    });
  }

  // ===================== ZONE DE DISCUSSION (Profil) =====================
  // Remplace la zone "Note" du Chrono, retirée le 31 août 2026 (demande
  // d'Emilien : « ajouter une zone de discussion sur le profil [...] et
  // retirer la zone note dans chrono ») — voir #profileDiscussionBlock dans
  // index.html. Recentrée sur un seul fil personnel plus tard le même jour
  // (nouvelle demande d'Emilien : « que la discussion sur le profil ne soit
  // que pour la communauté [...] enlever l'option membre puisqu'elle se
  // trouve déjà dans activité ») : la sous-partie "Membres"
  // (profileDiscussionMembers*, qui réutilisait TEL QUEL le fil d'une
  // activité partagée — table activity_messages, routes
  // /api/community/activity-messages) a été retirée d'ici. Ce fil reste
  // accessible sans aucun changement depuis l'onglet Activité
  // (currentCommunityActivityId, loadDiscussion, renderDiscussion, jamais
  // touchés par ce chantier) : le dupliquer dans Profil était redondant.
  // Reste "Communauté" (profileDiscussionCommunity*) : fil personnel,
  // routes /api/profile/posts (server/routes/profile.js). Comme l'ancien
  // bouton "Envoyer à la communauté" qu'il remplace, personne d'autre que
  // l'auteur ne le lit ailleurs dans l'app pour l'instant — voir le
  // commentaire sur profile_posts dans server/db.js.

  function loadProfileDiscussion() {
    if (!profile) return;
    profileComposerPendingAttachments = [];
    renderProfileComposerPending();
    $('profileDiscussionCommunityInput').value = '';
    $('profileDiscussionCommunityMsg').textContent = '';
    loadProfilePosts();
  }

  // ----- Sous-partie "Communauté" (profile_posts) -----

  function loadProfilePosts() {
    if (!profile) return;
    api('GET', '/api/profile/posts?userId=' + profile.id).then(renderProfilePosts);
  }

  function renderProfilePosts(posts) {
    var box = $('profileDiscussionCommunityList');
    box.innerHTML = '';
    $('profileDiscussionCommunityEmptyHint').classList.toggle('hidden', posts.length > 0);
    posts.forEach(function (post) { box.appendChild(buildProfilePostCard(post)); });
    box.scrollTop = box.scrollHeight;
  }

  // Une carte de message "Communauté" : texte + pièces jointes déjà
  // envoyées + trombone pour en ajouter une nouvelle (POST
  // /profile/posts/:id/attachments, toujours sur un message déjà envoyé —
  // pas d'état "en attente" ici, voir le commentaire sur
  // profile_post_attachments dans server/db.js) + suppression du message
  // entier. Même structure visuelle que renderDiscussion (fil "Membres"
  // ci-dessous), avec `.mine` toujours vrai : ce fil n'affiche que les
  // messages de l'auteur courant.
  function buildProfilePostCard(post) {
    var msg = document.createElement('div');
    msg.className = 'discussionMsg mine';

    var when = new Date(post.createdAt);
    var dateLabel = when.toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
    var timeLabel = pad(when.getHours()) + ':' + pad(when.getMinutes());

    var top = document.createElement('div');
    top.className = 'discussionMsgTop';
    top.innerHTML = '<span class="discussionMsgAuthor">' + escapeHtml(profile.name) + t(' (toi)') + '</span>' +
      '<span class="meta">' + dateLabel + ' · ' + timeLabel + '</span>';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'discussionMsgDelete';
    del.textContent = '✕';
    del.title = t('Supprimer ce message');
    del.addEventListener('click', function () {
      if (!confirm(t('Supprimer ce message ?'))) return;
      api('DELETE', '/api/profile/posts/' + post.id + '?userId=' + profile.id)
        .then(loadProfilePosts)
        .catch(function (err) { alert(err.message); });
    });
    top.appendChild(del);
    msg.appendChild(top);

    var body = document.createElement('div');
    body.className = 'discussionMsgBody';
    body.textContent = post.body;
    msg.appendChild(body);

    var attachBox = document.createElement('div');
    attachBox.className = 'attachmentList';
    var attachMenuWrap = document.createElement('div');
    attachMenuWrap.className = 'attachmentMenuWrap';
    var attachMenuBtn = document.createElement('button');
    attachMenuBtn.type = 'button'; attachMenuBtn.className = 'menuBtn attachMenuIconBtn';
    attachMenuBtn.setAttribute('aria-label', t('Ajouter une pièce jointe'));
    attachMenuBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    var attachInput = document.createElement('input');
    attachInput.type = 'file'; attachInput.className = 'hidden';
    attachMenuWrap.appendChild(attachMenuBtn);
    attachMenuWrap.appendChild(attachInput);
    var attachMsg = document.createElement('p');
    attachMsg.className = 'meta attachmentMsg';

    function refreshPostAttachments() {
      renderAttachmentList(attachBox, post.attachments, function (removedId) {
        post.attachments = (post.attachments || []).filter(function (a) { return a.id !== removedId; });
        refreshPostAttachments();
      }, '/api/profile/post-attachments/');
      attachMenuBtn.disabled = (post.attachments || []).length >= MAX_NOTE_ATTACHMENTS;
    }
    refreshPostAttachments();

    function uploadPostAttachment(fileName, mimeType, dataUrl) {
      attachMsg.textContent = t('Envoi...');
      api('POST', '/api/profile/posts/' + post.id + '/attachments', { userId: profile.id, fileName: fileName, mimeType: mimeType, dataUrl: dataUrl })
        .then(function (att) {
          post.attachments = (post.attachments || []).concat([att]);
          refreshPostAttachments();
          attachMsg.textContent = '';
        })
        .catch(function (err) { attachMsg.textContent = err.message; });
    }

    attachMenuBtn.addEventListener('click', function () { attachInput.click(); });
    attachInput.addEventListener('change', function () {
      var file = this.files[0];
      this.value = '';
      handleAttachmentFilePick(file, attachMsg, uploadPostAttachment);
    });

    msg.appendChild(attachBox);
    msg.appendChild(attachMsg);
    msg.appendChild(attachMenuWrap);

    return msg;
  }

  // ----- Pièces jointes choisies AVANT l'envoi, dans le composeur -----
  // (31 août 2026, demande d'Emilien : « rajouter à la discussion le
  // trombone avec les différentes options pour ajouter les documents, des
  // photos ») — contrairement au trombone d'un message déjà publié
  // (buildProfilePostCard, qui upload tout de suite), il n'existe pas encore
  // de message ici : le fichier choisi est simplement lu et gardé en mémoire
  // (dataUrl) côté client, prévisualisé comme une pièce jointe normale
  // (buildAttachmentRow, en mode local — voir deleteApiPath=null), puis
  // effectivement envoyé au serveur juste après la création du message
  // (sendProfilePost ci-dessous). Même sélecteur de fichier natif que
  // partout ailleurs (handleAttachmentFilePick) : pas de menu Photo/Document
  // séparé, l'appareil propose déjà photothèque/appareil photo/fichiers.
  var profileComposerPendingAttachments = []; // [{ tempId, fileName, mimeType, sizeBytes, dataUrl }]

  function renderProfileComposerPending() {
    var box = $('profileDiscussionPendingList');
    box.classList.toggle('hidden', profileComposerPendingAttachments.length === 0);
    renderAttachmentList(box, profileComposerPendingAttachments.map(function (p) {
      return { id: p.tempId, fileName: p.fileName, mimeType: p.mimeType, sizeBytes: p.sizeBytes, dataUrl: p.dataUrl };
    }), function (removedTempId) {
      profileComposerPendingAttachments = profileComposerPendingAttachments.filter(function (p) { return p.tempId !== removedTempId; });
      renderProfileComposerPending();
    }, null);
    $('profileDiscussionAttachBtn').disabled = profileComposerPendingAttachments.length >= MAX_NOTE_ATTACHMENTS;
  }

  $('profileDiscussionAttachBtn').addEventListener('click', function () { $('profileDiscussionAttachInput').click(); });
  $('profileDiscussionAttachInput').addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    handleAttachmentFilePick(file, $('profileDiscussionCommunityMsg'), function (fileName, mimeType, dataUrl) {
      profileComposerPendingAttachments.push({
        tempId: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        fileName: fileName,
        mimeType: mimeType,
        sizeBytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4),
        dataUrl: dataUrl,
      });
      $('profileDiscussionCommunityMsg').textContent = '';
      renderProfileComposerPending();
    });
  });

  // Crée le message puis, s'il y avait des pièces jointes en attente, les
  // envoie une par une dans l'ordre choisi (POST /profile/posts/:id/attachments,
  // même route que le trombone d'un message déjà publié).
  function sendProfilePost() {
    if (!profile) return;
    var input = $('profileDiscussionCommunityInput');
    var body = input.value.trim();
    var msgEl = $('profileDiscussionCommunityMsg');
    if (!body) { msgEl.textContent = t('Écris un message avant d\'envoyer.'); return; }

    msgEl.textContent = '';
    $('profileDiscussionCommunitySendBtn').disabled = true;
    var pending = profileComposerPendingAttachments.slice();
    api('POST', '/api/profile/posts', { userId: profile.id, body: body })
      .then(function (created) {
        if (!pending.length) return;
        var chain = Promise.resolve();
        pending.forEach(function (p) {
          chain = chain.then(function () {
            return api('POST', '/api/profile/posts/' + created.id + '/attachments',
              { userId: profile.id, fileName: p.fileName, mimeType: p.mimeType, dataUrl: p.dataUrl });
          });
        });
        return chain;
      })
      .then(function () {
        input.value = '';
        profileComposerPendingAttachments = [];
        renderProfileComposerPending();
        loadProfilePosts();
      })
      .catch(function (err) { msgEl.textContent = err.message; })
      .then(function () { $('profileDiscussionCommunitySendBtn').disabled = false; });
  }
  $('profileDiscussionCommunitySendBtn').addEventListener('click', sendProfilePost);
  // Entrée = envoyer, Maj+Entrée = retour à la ligne — même convention que
  // le fil de discussion de l'onglet Activité.
  $('profileDiscussionCommunityInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendProfilePost(); }
  });

  // Déplacé en haut à droite de Réglages, au-dessus d'Identité (29 août
  // 2026, demande d'Emilien) — anciennement un lien texte en bas de la
  // section Identité.
  $('logoutBtn').addEventListener('click', function () {
    if (!confirm(t('Se déconnecter de ce profil sur cet appareil ?'))) return;
    clearProfile();
    location.reload();
  });

  // ----- Doublons d'historique (import passé deux fois) -----
  // Deux temps : on compte et on montre ce qui partirait, puis on supprime
  // seulement après confirmation. Rien n'est supprimé sans que le nombre
  // exact d'entrées et d'heures concernées ait été affiché d'abord.
  function formatHoursFromSeconds(seconds) {
    var total = Math.round(seconds / 60);
    return Math.floor(total / 60) + 'h' + pad(total % 60);
  }

  $('dedupeBtn').addEventListener('click', function () {
    $('dedupeMsg').textContent = t('Recherche des doublons...');
    $('dedupeBtn').disabled = true;
    api('GET', '/api/import/duplicates?userId=' + profile.id)
      .then(function (info) {
        if (!info.removable) {
          $('dedupeMsg').textContent = t('Aucun doublon dans ton historique.');
          return;
        }
        var resume = t('{n} sessions en double trouvées, soit {h} en trop. En supprimer une de chaque paire ? Il te restera {reste} sessions.', {
          n: info.removable, h: formatHoursFromSeconds(info.seconds), reste: info.remaining,
        });
        if (!confirm(resume)) { $('dedupeMsg').textContent = ''; return; }
        $('dedupeMsg').textContent = t('Suppression en cours...');
        return api('POST', '/api/import/dedupe', { userId: profile.id }).then(function (r) {
          $('dedupeMsg').textContent = t('{n} sessions en double supprimées. Il te reste {reste} sessions.', {
            n: r.removed, reste: r.remaining,
          });
          refreshActivities().then(renderActivityGrid);
          loadProfileNotes();
        });
      })
      .catch(function (err) { $('dedupeMsg').textContent = err.message; })
      .finally(function () { $('dedupeBtn').disabled = false; });
  });

  // ----- Partage (adresse publique de l'app + invitation par pseudo) -----
  // L'adresse est mémorisée sur CET appareil uniquement (localStorage), pas
  // côté serveur : l'app étant destinée à être publique, un réglage partagé
  // laisserait n'importe qui remplacer le lien envoyé par tout le monde.
  // Tant qu'aucune adresse n'est saisie, les deux boutons ne partagent rien
  // et le disent — l'adresse de la page ouverte (localhost) ne servirait à
  // personne d'autre tant que Noèsis n'est pas déployée.
  var SHARE_URL_KEY = 'noesis_share_url';

  function loadShareUrl() {
    try { return localStorage.getItem(SHARE_URL_KEY) || ''; } catch (e) { return ''; }
  }
  function storeShareUrl(url) {
    try { if (url) localStorage.setItem(SHARE_URL_KEY, url); else localStorage.removeItem(SHARE_URL_KEY); } catch (e) { /* ignore */ }
  }
  function renderShareSettings() {
    var input = $('shareUrlInput');
    if (!input) return;
    input.value = loadShareUrl();
    $('shareMsg').textContent = '';
  }

  // Accepte une saisie sans protocole ("noesis.exemple.fr") en préfixant
  // https://. Renvoie null si l'adresse reste inexploitable. La validation
  // est volontairement stricte sur le nom d'hôte : new URL() accepte des
  // choses très surprenantes (une phrase avec des espaces devient un hôte
  // suivi d'un chemin), et une adresse fausse ne se verrait qu'au moment où
  // le destinataire clique sur le lien.
  function normalizeShareUrl(raw) {
    var v = (raw || '').trim();
    if (!v) return '';
    if (/\s/.test(v)) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      var u = new URL(v);
      var host = u.hostname;
      if (!host || !/^[a-z0-9.\-]+$/i.test(host)) return null;
      // Un nom d'hôte sans point n'est valable que sur le poste lui-même
      // (localhost) : partout ailleurs c'est une faute de frappe.
      if (host.indexOf('.') === -1 && host !== 'localhost') return null;
      return u.href.replace(/\/+$/, '');
    } catch (e) { return null; }
  }

  // Une adresse locale (localhost, 127.0.0.1, réseau privé) reste utile
  // entre deux appareils du même wifi, mais pas au-delà : on l'accepte en
  // le signalant plutôt que de la refuser.
  function isLocalShareUrl(url) {
    try {
      var h = new URL(url).hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' ||
        /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h);
    } catch (e) { return false; }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function copyShareText(text) {
    var done = function () { $('shareMsg').textContent = t('Copié — tu peux le coller où tu veux.'); };
    var failed = function () { $('shareMsg').textContent = t('Impossible de copier automatiquement — sélectionne le texte à la main.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(done)
        .catch(function () { if (legacyCopy(text)) done(); else failed(); });
      return;
    }
    if (legacyCopy(text)) done(); else failed();
  }

  // Menu de partage natif du téléphone quand il existe (WhatsApp, SMS,
  // mail...), sinon copie dans le presse-papiers avec confirmation. Appelé
  // directement depuis le clic, comme l'exige navigator.share.
  function shareOrCopy(text) {
    $('shareMsg').textContent = '';
    if (navigator.share) {
      try {
        navigator.share({ title: 'Noèsis', text: text })
          .then(function () { $('shareMsg').textContent = t('Partagé.'); })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return; // partage annulé par l'utilisateur
            copyShareText(text);
          });
        return;
      } catch (e) { /* navigateur qui expose navigator.share sans le supporter */ }
    }
    copyShareText(text);
  }

  function shareUrlOrWarn() {
    var url = loadShareUrl();
    if (!url) {
      $('shareMsg').textContent = t("Renseigne d'abord l'adresse publique de l'app ci-dessus.");
      return null;
    }
    return url;
  }

  $('shareUrlSaveBtn').addEventListener('click', function () {
    var normalized = normalizeShareUrl($('shareUrlInput').value);
    if (normalized === null) {
      $('shareMsg').textContent = t('Adresse invalide — elle doit ressembler à https://exemple.fr');
      return;
    }
    storeShareUrl(normalized);
    $('shareUrlInput').value = normalized;
    if (!normalized) { $('shareMsg').textContent = t('Adresse effacée.'); return; }
    $('shareMsg').textContent = isLocalShareUrl(normalized)
      ? t('Adresse enregistrée. Attention : elle est locale, elle ne fonctionnera que depuis ton réseau.')
      : t('Adresse enregistrée.');
  });

  $('shareAppBtn').addEventListener('click', function () {
    var url = shareUrlOrWarn();
    if (!url) return;
    shareOrCopy(t('Noèsis — le TimeTracker partagé. Rejoins-nous ici : {url}', { url: url }));
  });

  $('shareProfileBtn').addEventListener('click', function () {
    var url = shareUrlOrWarn();
    if (!url) return;
    shareOrCopy(t("Rejoins-moi sur Noèsis, mon TimeTracker partagé : {url}\nMon pseudo est « {pseudo} » — retrouve-moi dans Communauté > Rechercher des membres pour t'abonner.", { url: url, pseudo: profile.name }));
  });

  // ----- Supprimer mon compte (zone "danger" tout en bas de Réglages) -----
  // Confirmation par le code PIN du profil (champ dédié), plus deux
  // confirmations enchaînées — même style que la suppression définitive
  // d'une activité, mais avec un cran de plus vu que c'est irréversible et
  // que ça emporte tout l'historique.
  $('deleteAccountBtn').addEventListener('click', function () {
    var pin = $('deleteAccountPin').value.trim();
    $('deleteAccountMsg').textContent = '';
    if (!pin) { $('deleteAccountMsg').textContent = t('Saisis ton code pour confirmer la suppression.'); return; }
    if (!confirm(t('Supprimer définitivement ton compte ? Cette action est irréversible.'))) return;
    if (!confirm(t('Dernière confirmation : tout ton historique et tes notes seront perdus. Continuer ?'))) return;
    $('deleteAccountBtn').disabled = true;
    api('DELETE', '/api/profile/' + profile.id, { pin: pin })
      .then(function () {
        clearProfile();
        location.reload();
      })
      .catch(function (err) {
        $('deleteAccountMsg').textContent = err.message;
        $('deleteAccountBtn').disabled = false;
      });
  });

  // Les deux appels de l'onglet Activité, faits ensemble puis fusionnés dans
  // un seul rendu : la liste de TOUTES mes activités (/api/activities, qui
  // donne nom/couleur/propriétaire/nombre de membres) et celles qui sont
  // effectivement PARTAGÉES (/api/community, qui donne en plus les membres et
  // les messages non lus). Si le second échoue, la liste s'affiche quand
  // même : on perd le détail des membres, pas la gestion des activités.
  function loadSettingsActivities() {
    if (!profile) return;
    Promise.all([
      api('GET', '/api/activities?all=1&userId=' + profile.id),
      api('GET', '/api/community?userId=' + profile.id).catch(function () { return { activities: [] }; })
    ]).then(function (res) {
      renderActivitiesSettings(res[0], (res[1] && res[1].activities) || []);
    });
  }

  // Rendu unique de la liste d'activités. Deux gestes par ligne, distincts :
  //  - le bouton "⋮" ouvre les RÉGLAGES de l'activité (nom, couleur,
  //    Enregistrer, Partager, Séparer, Supprimer, Voir les membres) ;
  //  - un clic sur la ligne elle-même ouvre, juste en dessous, le suivi de
  //    ses AUTRES MEMBRES (discussion, statistiques, enregistrements, notes).
  //    Une activité solo n'a rien à montrer là : le clic y ouvre les
  //    réglages, pour qu'un clic ne reste jamais sans effet.
  // Tant qu'aucune activité n'est sélectionnée, l'onglet ne montre que cette
  // liste — pas de texte d'aide, pas de section en attente (demande
  // d'Emilien, 30 août 2026).
  function renderActivitiesSettings(acts, sharedList) {
    var box = $('activitiesList');
    var shared = {};
    (sharedList || []).forEach(function (x) { shared[String(x.activityId)] = x; });

    // L'activité sélectionnée a pu être quittée/supprimée entre-temps (par
    // soi-même ou par le dernier autre membre) : on referme alors le détail
    // plutôt que de garder une sélection qui ne correspond plus à rien.
    if (currentCommunityActivityId && !shared[String(currentCommunityActivityId)]) {
      currentCommunityActivityId = '';
      activityDetailEl().classList.add('hidden');
      exitActivityTimesheetFullscreen();
      exitActivityChartFullscreen();
      stopDiscussionPolling();
    }

    // Détaché avant le vidage de la liste : sans ça, le bloc de détail serait
    // détruit avec elle (voir detachActivityDetail).
    detachActivityDetail();
    var detailAttached = false;
    box.innerHTML = '';
    acts.forEach(function (a) {
      var sharedInfo = shared[String(a.id)];
      var isSelected = String(a.id) === String(currentCommunityActivityId);
      var row = document.createElement('div');
      row.className = 'activityRow' + (a.active ? '' : ' inactive') + (isSelected ? ' selected' : '');

      var header = document.createElement('div');
      header.className = 'activityRowHeader';

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = a.color;
      header.appendChild(dot);

      var nameSpan = document.createElement('span');
      nameSpan.className = 'activityRowName';
      nameSpan.textContent = a.name;
      header.appendChild(nameSpan);

      // Pastille de messages non lus du fil de discussion de cette activité
      // (voir unreadMessages dans GET /api/community). L'attribut
      // data-activity-id permet à refreshUnreadBadges() de la remettre à jour
      // sans reconstruire la liste (ce qui refermerait un panneau ouvert).
      if (sharedInfo) {
        var unread = sharedInfo.unreadMessages || 0;
        var unreadBadge = document.createElement('span');
        unreadBadge.className = 'unreadBadge' + (unread > 0 ? '' : ' hidden');
        unreadBadge.dataset.activityId = a.id;
        unreadBadge.title = t('Messages non lus');
        unreadBadge.textContent = unread;
        header.appendChild(unreadBadge);
      }

      var menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'menuBtn';
      menuBtn.title = t("Paramètres de l'activité");
      menuBtn.setAttribute('aria-label', t("Paramètres de l'activité"));
      menuBtn.textContent = '⋮';
      header.appendChild(menuBtn);

      row.appendChild(header);

      if (!a.isOwner) {
        var badge = document.createElement('p');
        badge.className = 'meta';
        badge.textContent = t('Partagée par {owner} — tu peux choisir ta couleur, le reste lui appartient.', { owner: a.ownerName || '?' });
        row.appendChild(badge);
      } else if (a.membersCount > 1) {
        var badge2 = document.createElement('p');
        badge2.className = 'meta';
        badge2.textContent = t('{count} membres — clique sur la ligne pour les voir.', { count: a.membersCount });
        row.appendChild(badge2);
      }

      var panel = document.createElement('div');
      panel.className = 'activitySettingsPanel hidden';

      var nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.value = a.name;
      nameInput.disabled = !a.isOwner;

      var colorBox = document.createElement('div');
      var rowColor = a.color;
      renderColorSwatches(colorBox, rowColor, function (c) { rowColor = c; }, true);

      var saveMsg = document.createElement('p');
      saveMsg.className = 'meta';

      var saveBtn = document.createElement('button');
      saveBtn.className = 'iconBtn'; saveBtn.textContent = t('Enregistrer');
      saveBtn.addEventListener('click', function () {
        // Un membre non-propriétaire ne peut changer QUE sa couleur perso :
        // on n'envoie jamais name/active dans ce cas (ça déclencherait un
        // refus 403 côté serveur, à raison).
        var payload = a.isOwner
          ? { userId: profile.id, name: nameInput.value.trim(), color: rowColor, active: a.active }
          : { userId: profile.id, color: rowColor };
        saveMsg.textContent = '';
        api('PUT', '/api/activities/' + a.id, payload)
          .then(function () {
            refreshActivities().then(renderActivityGrid);
            saveMsg.textContent = t('Enregistré.');
            setTimeout(function () { loadSettingsActivities(); }, 500);
          })
          .catch(function (err) { saveMsg.textContent = err.message; });
      });

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';
      actionsWrap.appendChild(saveBtn);

      // Partager par pseudo : envoie une invitation en attente à quelqu'un.
      // Disponible à tout membre actuel, pas seulement au propriétaire —
      // comme l'était l'ancien lien de partage que ce bouton remplace.
      var shareBtn = document.createElement('button');
      shareBtn.className = 'iconBtn';
      shareBtn.textContent = t('Partager');
      shareBtn.addEventListener('click', function () {
        var pseudo = prompt(t('Pseudo de la personne à inviter sur "{activity}" :', { activity: a.name }));
        if (!pseudo || !pseudo.trim()) return;
        api('POST', '/api/activities/' + a.id + '/invite', { userId: profile.id, pseudo: pseudo.trim() })
          .then(function (res) { alert(t(res.message)); })
          .catch(function (err) { alert(err.message); });
      });
      actionsWrap.appendChild(shareBtn);

      // Séparer : seulement si l'activité est actuellement partagée (rien à
      // séparer sur une activité déjà solo). Disponible à tout membre, comme
      // Partager. Contrairement à Supprimer, on obtient sa propre copie
      // personnelle (avec son historique) au lieu de perdre l'activité.
      if (a.membersCount > 1) {
        var separateBtn = document.createElement('button');
        separateBtn.className = 'iconBtn';
        separateBtn.textContent = t('Séparer');
        separateBtn.addEventListener('click', function () {
          if (!confirm(t('Séparer "{activity}" ? Tu auras désormais ta propre activité personnelle du même nom, avec ton historique déjà enregistré dessus. Les autres personnes qui la partagent ne sont pas concernées.', { activity: a.name }))) return;
          api('POST', '/api/activities/' + a.id + '/separate', { userId: profile.id })
            .then(function (res) {
              refreshActivities().then(renderActivityGrid);
              loadSettingsActivities();
              alert(t(res.message));
            })
            .catch(function (err) { alert(err.message); });
        });
        actionsWrap.appendChild(separateBtn);
      }

      // "Voir les membres" : la liste complète des membres de l'activité, avec
      // un point vert sur ceux dont le chrono tourne en ce moment sur CETTE
      // activité. Rangé ici plutôt que dans un second menu déroulant (il y en
      // avait un, réservé à cette seule option, quand la liste des activités
      // partagées était séparée) — un motif d'UI en moins.
      if (sharedInfo) {
        var membersBtn = document.createElement('button');
        membersBtn.className = 'iconBtn';
        membersBtn.textContent = t('Voir les membres');
        membersBtn.addEventListener('click', function () {
          openCommunityMembersModal(a.id, a.name);
        });
        actionsWrap.appendChild(membersBtn);
      }

      // Suppression définitive : toujours pour SOI uniquement, jamais pour
      // les autres membres d'une activité partagée (disponible que tu sois
      // propriétaire ou simple membre).
      var delBtn = document.createElement('button');
      delBtn.className = 'iconBtn danger';
      delBtn.textContent = t('Supprimer définitivement');
      delBtn.addEventListener('click', function () {
        if (!confirm(t('Supprimer définitivement cette activité pour toi ? Elle disparaîtra de ton Chrono et de ton Profil. Les autres personnes qui la partagent avec toi ne sont pas concernées.'))) return;
        var keepHistory = confirm(t("Veux-tu garder l'historique déjà enregistré sur cette activité ?\n\nOK = garder l'historique\nAnnuler = tout supprimer aussi"));
        api('DELETE', '/api/activities/' + a.id + '?userId=' + profile.id + '&keepHistory=' + (keepHistory ? '1' : '0'))
          .then(function () {
            refreshActivities().then(renderActivityGrid);
            loadSettingsActivities();
          })
          .catch(function (err) { alert(err.message); });
      });
      actionsWrap.appendChild(delBtn);

      panel.appendChild(nameInput);
      panel.appendChild(colorBox);
      panel.appendChild(saveMsg);
      panel.appendChild(actionsWrap);
      row.appendChild(panel);

      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // sinon le clic sélectionnerait aussi la ligne
        panel.classList.toggle('hidden');
      });

      // Clic sur la ligne (hors "⋮") : ouvre/referme le suivi des autres
      // membres si l'activité est partagée. Sur une activité solo, il n'y a
      // personne à suivre — le clic ouvre alors les réglages, pour qu'il ne
      // reste jamais sans effet.
      header.addEventListener('click', function () {
        if (!sharedInfo) { panel.classList.toggle('hidden'); return; }
        var willSelect = !isSelected;
        currentCommunityActivityId = willSelect ? String(a.id) : '';
        loadSettingsActivities();
        loadActivityDetail(willSelect);
      });
      if (sharedInfo) header.classList.add('clickable');

      box.appendChild(row);

      // Le détail vient se placer DANS la ligne sélectionnée, donc juste en
      // dessous d'elle ; sinon il retourne à son ancre, en bas de l'onglet.
      if (isSelected) { attachActivityDetail(row); detailAttached = true; }
    });

    // Filet de sécurité : le bloc a été détaché en début de rendu, il doit
    // toujours être rattaché quelque part à la fin.
    if (!detailAttached) attachActivityDetail(null);
  }

  // ===================== INVITATIONS REÇUES =====================
  // Remplace l'ancien lien de partage : quelqu'un t'invite par ton pseudo
  // sur une de ses activités, l'invitation reste en attente ici jusqu'à ce
  // que tu l'acceptes ou la refuses.
  function loadPendingInvites() {
    if (!profile) return;
    // Charge aussi MES activités actives : sert à proposer, à l'acceptation
    // d'une invitation, de la fusionner avec une activité qu'on suit déjà
    // (voir renderInvitesList/mergeActivityId).
    Promise.all([
      api('GET', '/api/invites?userId=' + profile.id),
      api('GET', '/api/activities?userId=' + profile.id),
    ]).then(function (results) { renderInvitesList(results[0], results[1]); });
  }

  function renderInvitesList(invites, myActivities) {
    notifPendingCounts.invites = invites.length;
    refreshNotifDot();
    var box = $('invitesList');
    box.innerHTML = '';
    if (invites.length === 0) {
      box.innerHTML = '<p class="hint">' + t('Aucune invitation en attente.') + '</p>';
      return;
    }
    invites.forEach(function (inv) {
      var row = document.createElement('div');
      row.className = 'activityRow';

      var label = document.createElement('p');
      label.className = 'meta';
      label.textContent = t('{from} t\'invite sur « {activity} ».', { from: inv.fromName, activity: inv.activityName });
      row.appendChild(label);

      // Fusion avec une activité déjà existante chez soi (optionnel, 29 août
      // 2026, demande d'Emilien) : évite un doublon quand l'activité
      // partagée correspond à une activité personnelle qu'on suivait déjà de
      // son côté — son historique est alors transféré sur l'activité
      // partagée au lieu de coexister en double (voir mergeActivityId dans
      // server/routes/invites.js).
      var mergeSelect = null;
      if (myActivities && myActivities.length > 0) {
        var mergeWrap = document.createElement('label');
        mergeWrap.className = 'checkLabel';
        mergeWrap.appendChild(document.createTextNode(t('Fusionner avec une de tes activités existantes ?')));
        mergeSelect = document.createElement('select');
        mergeSelect.setAttribute('aria-label', t('Fusionner avec une de tes activités existantes ?'));
        var optNew = document.createElement('option');
        optNew.value = '';
        optNew.textContent = t('Non, nouvelle activité');
        mergeSelect.appendChild(optNew);
        myActivities.forEach(function (my) {
          var opt = document.createElement('option');
          opt.value = my.id;
          opt.textContent = my.name;
          mergeSelect.appendChild(opt);
        });
        mergeWrap.appendChild(mergeSelect);
        row.appendChild(mergeWrap);
      }

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';

      var acceptBtn = document.createElement('button');
      acceptBtn.className = 'iconBtn';
      acceptBtn.textContent = t('Accepter');
      acceptBtn.addEventListener('click', function () {
        var mergeActivityId = mergeSelect && mergeSelect.value ? mergeSelect.value : null;
        if (mergeActivityId) {
          var mineName = mergeSelect.options[mergeSelect.selectedIndex].textContent;
          if (!confirm(t('Fusionner ton activité « {mine} » avec « {activity} » ? Ton historique déjà enregistré sur « {mine} » sera transféré dessus, et « {mine} » disparaîtra en tant qu\'activité séparée.', { mine: mineName, activity: inv.activityName }))) {
            return;
          }
        }
        var payload = { userId: profile.id };
        if (mergeActivityId) payload.mergeActivityId = mergeActivityId;
        api('POST', '/api/invites/' + inv.id + '/accept', payload)
          .then(function (res) {
            refreshActivities().then(renderActivityGrid);
            loadSettingsActivities();
            loadPendingInvites();
            if (mergeActivityId) alert(t(res.message));
          })
          .catch(function (err) { alert(err.message); });
      });

      var declineBtn = document.createElement('button');
      declineBtn.className = 'iconBtn danger';
      declineBtn.textContent = t('Refuser');
      declineBtn.addEventListener('click', function () {
        api('POST', '/api/invites/' + inv.id + '/decline', { userId: profile.id })
          .then(loadPendingInvites)
          .catch(function (err) { alert(err.message); });
      });

      actionsWrap.appendChild(acceptBtn);
      actionsWrap.appendChild(declineBtn);
      row.appendChild(actionsWrap);
      box.appendChild(row);
    });
  }

  var newActivityColor = PALETTES[currentTheme][0];
  function renderNewActivitySwatches() {
    newActivityColor = PALETTES[currentTheme][0];
    // "compact" (dernier paramètre) : mêmes petites pastilles que dans le
    // panneau de réglages d'une activité existante, pour un format identique.
    renderColorSwatches($('newActivitySwatches'), newActivityColor, function (c) {
      newActivityColor = c;
      $('newActivityDot').style.background = c;
    }, true);
    $('newActivityDot').style.background = newActivityColor;
  }
  
  // Le formulaire d'ajout est replié par défaut derrière le bouton "+" à
  // côté du titre "Activités" (au lieu d'être toujours affiché).
  $('addActivityBtn').addEventListener('click', function () {
    $('newActivityCard').classList.toggle('hidden');
  });

  $('newActivitySave').addEventListener('click', function () {
    var name = $('newActivityName').value.trim();
    if (!name) return;
    $('newActivitySave').disabled = true;
    api('POST', '/api/activities', {
      name: name, color: newActivityColor, userId: profile.id,
    }).then(function () {
      $('newActivityName').value = '';
      $('newActivityCard').classList.add('hidden');
      refreshActivities().then(renderActivityGrid);
      loadSettingsActivities();
    }).catch(function (err) { alert(err.message); })
      .finally(function () { $('newActivitySave').disabled = false; });
  });

  $('importBtn').addEventListener('click', function () {
    var file = $('importFile').files[0];
    if (!file) { $('importMsg').textContent = t('Choisis un fichier .csv d\'abord.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      $('importBtn').disabled = true;
      $('importMsg').textContent = t('Import en cours...');
      api('POST', '/api/import/history', { userId: profile.id, csv: reader.result })
        .then(function (data) {
          $('importMsg').textContent = t(data.message);
          refreshActivities().then(renderActivityGrid);
        })
        .catch(function (err) { $('importMsg').textContent = err.message; })
        .finally(function () { $('importBtn').disabled = false; });
    };
    reader.readAsText(file, 'UTF-8');
  });

  // ===================== DÉMARRAGE =====================
  profile = loadProfile();
  if (profile) {
    applyTheme(profile.theme); // évite un flash du mauvais thème le temps du fetch ci-dessous
    // Un profil mémorisé AVANT l'ajout du réglage de langue n'a pas de
    // champ `lang` : c'est forcément un profil qui existait déjà, donc
    // français — cohérent avec la migration côté serveur (voir db.js).
    applyLang(profile.lang || 'fr');
    api('GET', '/api/profile/' + profile.id).then(function (fresh) {
      var langChanged = !!fresh.lang && fresh.lang !== currentLang;
      saveProfile(fresh); // resynchronise nom/couleur/thème/langue avec le serveur (utile après un changement fait sur un autre appareil)
      // La langue a changé depuis un autre appareil : on recharge une seule
      // fois pour tout remettre dans la bonne langue (la version fraîche est
      // déjà enregistrée juste au-dessus, donc pas de boucle possible).
      if (langChanged) location.reload();
    }).catch(function () { /* hors-ligne ou profil supprimé : on garde la version locale */ });
    showApp();
  } else {
    applyTheme('dark');
    applyLang('en'); // anglais par défaut pour un tout nouveau compte
    showOnboarding();
  }
})();