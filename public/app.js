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
  // (currentPiePeriod retirée le 1er septembre 2026 : la Répartition n'a plus
  // de période à elle, elle suit celle de la Feuille de temps ci-dessous —
  // voir renderPieFromTimesheet.)
  // Mode "Aujourd'hui" de la Répartition (3 septembre 2026) : quand il est
  // actif, le camembert est DÉSYNCHRONISÉ de la Feuille de temps et n'affiche
  // que la journée en cours. Toujours false par défaut, et systématiquement
  // remis à false à chaque ouverture de l'onglet Statistiques (voir
  // switchTab) — la synchronisation reste le comportement normal.
  var pieTodayMode = false;
  // Dernière réponse de la Feuille de temps, gardée pour pouvoir
  // resynchroniser le camembert instantanément au second clic, sans refetch.
  var lastTimesheetPieData = null;
  // Graphique : plus de "période" au sens plage depuis le 1er septembre 2026
  // (demande d'Emilien) — le Graphique couvre toujours tout l'historique
  // (voir totalRangeForUser côté serveur), seule la granularité des points
  // se choisit ('day' | 'week' | 'month', 'day' par défaut).
  var currentChartGranularity = 'day';
  var currentTimesheetPeriod = 'week'; // 'week' | 'month' — pas d'"année" pour la Feuille de temps (demande d'Emilien)
  var currentTimesheetOffset = 0; // décalage en semaines calendaires ; repart à 0 à chaque ouverture de l'onglet Statistiques
  var currentTimesheetMonthOffset = 0; // décalage en mois (vue calendrier) ; repart à 0 lui aussi
  var currentHistoryWeekOffset = 0; // idem, pour l'historique modifiable du Chrono (#chronoHistoryPanel)
  var lastDailyBreakdown = []; // dernier détail journalier chargé, pour redessiner le Graphique sans refetch (ex : couleur de la courbe Total après un changement de thème)
  // Ni la Feuille de temps (retiré le 1er septembre 2026) ni le Graphique
  // (retiré le même jour, demande d'Emilien : « supprimer le mode plein
  // écran de graphique ») n'ont plus de plein écran : plus de variable
  // d'état ici, voir #statsTimesheetBlock et #statsChartBlock.
  // ----- Pincement à deux doigts pour zoomer le Graphique : essayé le
  // 2 septembre 2026 (demande d'Emilien : « comme sur TradingView »),
  // reconstruit le même jour après une première régression signalée
  // (« je ne peux pas voir tous les jours en même temps [...] cela bug »),
  // puis ANNULÉ ENTIÈREMENT à la demande d'Emilien après un nouveau
  // problème (saut visuel pendant le pincement) : « On annule la dernière
  // modification de pincement. On repasse à la version d'avant graphique
  // simple. » Le Graphique n'a donc plus aucune capacité de zoom — tous les
  // jours sont dessinés à un espacement fixe (CHART_DAY_SPACING ci-dessous),
  // le panoramique est le simple défilement horizontal natif de
  // `.chartScroll`. Historique complet des trois tentatives : voir
  // noesis-timetracker-journal-statistiques.md.
  var CHART_DAY_SPACING = 56; // espacement fixe entre deux points, en pixels
  // ----- Statistiques d'UNE activité partagée (section Communauté > Membres)
  // — pendants exacts des 5 variables Statistiques ci-dessus, jamais
  // partagés avec elles (deux jeux d'état totalement indépendants). -----
  // ⚠️ 3 septembre 2026 (Activité — général) : une seule période partagée
  // par les trois blocs jusqu'ici (currentActivityStatsPeriod). Emilien a
  // demandé que Répartition et Graphique aient chacun la leur — elles sont
  // donc devenues DEUX variables indépendantes. La Répartition accepte en
  // plus 'day' ("Aujourd'hui") ; le Graphique non, il tracerait un point.
  var currentActivityPiePeriod = 'week';
  var currentActivityChartPeriod = 'week';
  var lastActivityDailyBreakdown = [];
  // activityTimesheetFullscreenActive / activityChartFullscreenActive ont été
  // retirées le 3 septembre 2026 avec le plein écran de cette page — voir le
  // commentaire juste avant la section "FEUILLE DE TEMPS D'UNE ACTIVITÉ".
  var currentTheme = 'dark';
  var currentLang = 'en'; // 'en' par défaut (nouveaux comptes) ; voir applyLang plus bas

  // ----- Verrouillage d'orientation (30 août 2026, demande d'Emilien) -----
  // NOTE (1er septembre 2026) : ce commentaire décrit l'état du 30 août. Depuis,
  // les plein écrans de Statistiques ne font plus de rotation CSS (Feuille de
  // temps et Graphique), et celui de la Feuille de temps a été retiré tout
  // court — seuls les deux plein écrans de Communauté
  // (#communityActivityTimesheetBlock / #communityActivityChartBlock) simulent
  // encore un paysage par rotation CSS. lockPortraitOrientation() reste appelée
  // au chargement de l'app et par ces deux boutons-là.
  // La Feuille de temps et le Graphique simulaient un plein écran paysage par
  // rotation CSS, pensée pour un téléphone qui reste physiquement tenu en
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

  // Palettes de couleurs d'activités, une par thème. Les 8 couleurs suivent
  // l'ordre de l'arc-en-ciel (rouge, orange, jaune, vert, cyan, bleu, indigo,
  // violet) ; chaque couleur sombre a sa jumelle claire au même index (même
  // teinte, seule la luminosité change) : changer de thème garde "la même"
  // couleur d'activité. Comme seules ces couleurs sont sélectionnables, on
  // n'a plus besoin de calculer une couleur de texte au cas par cas : c'est
  // le thème actif qui décide.
  //
  // Valeurs lues depuis public/theme-palette.js (chargé juste avant ce
  // fichier dans index.html, comme i18n.js) plutôt que recopiées ici — source
  // unique partagée avec server/lib/theme.js depuis le 1er septembre 2026
  // (Design, voir l'audit doublons/code mort). Pour changer une couleur,
  // modifier public/theme-palette.js — pas cette ligne.
  var PALETTES = {
    dark: NOESIS_THEME_PALETTES.DARK_PALETTE,
    light: NOESIS_THEME_PALETTES.LIGHT_PALETTE,
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

  // ----- Visionneuse d'image plein écran (3 septembre 2026) -----
  // Remplace `window.open(dataUrl, '_blank')`, qui ne pouvait PAS fonctionner :
  // Chrome et Safari bloquent depuis 2017 toute navigation de premier niveau
  // vers une URL `data:`, et les pièces jointes de Noèsis sont justement
  // stockées en data URL (voir note_attachments/profile_post_attachments dans
  // server/db.js). Dans l'app installée sur l'écran d'accueil, il n'y avait de
  // toute façon aucun onglet où ouvrir quoi que ce soit — d'où l'impression que
  // « les images ne s'ouvrent pas ».
  //
  // Une seule visionneuse pour toute l'app, posée au niveau du <body> (voir
  // #imageViewerModal dans index.html) : elle sert les pièces jointes du
  // Profil, de Communauté, du fil d'une activité et d'un sous-projet, quel que
  // soit l'auteur de l'image.
  function openImageViewer(dataUrl, fileName) {
    if (!dataUrl) return;
    $('imageViewerImg').src = dataUrl;
    $('imageViewerImg').alt = fileName || '';
    $('imageViewerName').textContent = fileName || '';
    $('imageViewerModal').classList.remove('hidden');
  }

  function closeImageViewer() {
    $('imageViewerModal').classList.add('hidden');
    // L'image est libérée à la fermeture : une data URL de plusieurs mégaoctets
    // n'a aucune raison de rester en mémoire une fois la visionneuse fermée.
    $('imageViewerImg').removeAttribute('src');
    $('imageViewerName').textContent = '';
  }

  $('imageViewerClose').addEventListener('click', closeImageViewer);
  // Clic n'importe où sur le fond noir (pas sur l'image elle-même) : ferme,
  // comme n'importe quelle visionneuse.
  $('imageViewerModal').addEventListener('click', function (e) {
    if (e.target === this) closeImageViewer();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('imageViewerModal').classList.contains('hidden')) closeImageViewer();
  });

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
      thumb.style.cursor = 'zoom-in';
      thumb.addEventListener('click', function () { openImageViewer(att.dataUrl, att.fileName); });
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

  // Version en lecture seule de buildAttachmentRow (pas de bouton de
  // suppression) : pour une pièce jointe qui n'appartient pas à la personne
  // qui la regarde — un message "Communauté" d'un profil suivi, dans le flux
  // "Suivi" de Communauté (buildFollowingPostCard, plus bas). Un bouton de
  // suppression y serait de toute façon refusé par le serveur (403, "Ce
  // n'est pas ta pièce jointe" — voir DELETE /profile/post-attachments/:id),
  // donc mieux vaut ne pas le proposer du tout.
  function buildAttachmentRowReadOnly(att) {
    var row = document.createElement('div');
    row.className = 'attachmentRow';
    var isImage = att.mimeType && att.mimeType.indexOf('image/') === 0;

    if (isImage && att.dataUrl) {
      var thumb = document.createElement('img');
      thumb.className = 'attachmentThumb';
      thumb.src = att.dataUrl;
      thumb.alt = att.fileName;
      thumb.title = t('Voir en grand');
      thumb.style.cursor = 'zoom-in';
      thumb.addEventListener('click', function () { openImageViewer(att.dataUrl, att.fileName); });
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

    return row;
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
  // Discussion (buildPostCard, dans mountProfilePostsComposer, plus bas).
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

  // Mesure la hauteur réelle de .topbar (marge de sécurité iOS/Android
  // comprise) et l'expose en variable CSS --topbar-h, consommée par #app
  // (padding-top) — ajouté le 2 septembre 2026 quand .topbar est passée de
  // `position: sticky` à `position: fixed` (demande d'Emilien : « je
  // souhaite que la barre du haut reste bloquée et qu'elle ne soit pas
  // flottante quand je tire vers le bas »). .topbar étant sortie du flux de
  // #app, il faut lui rendre sa place ailleurs, exactement comme
  // padding-bottom le fait déjà pour .tabbar (fixed elle aussi). Appelée à
  // l'ouverture de l'app (offsetHeight vaut 0 tant que #app est masqué) et à
  // chaque redimensionnement/rotation, la hauteur pouvant changer avec
  // l'orientation (env(safe-area-inset-top) diffère portrait/paysage).
  function syncTopbarHeightVar() {
    var topbarEl = document.querySelector('.topbar');
    if (!topbarEl) return;
    document.documentElement.style.setProperty('--topbar-h', topbarEl.offsetHeight + 'px');
  }
  window.addEventListener('resize', syncTopbarHeightVar);
  window.addEventListener('orientationchange', syncTopbarHeightVar);

  // 2 septembre 2026, suite (Design) : sur mobile, quand le clavier virtuel
  // est ouvert (un champ texte a le focus) et qu'on fait défiler la page,
  // .topbar et .tabbar (toutes deux position: fixed) pouvaient donner
  // l'impression de "flotter"/se déplacer avec le contenu — signalé par
  // Emilien, captures à l'appui. Limité aux écrans tactiles (pointer:
  // coarse) — sur desktop, aucun clavier virtuel n'est en jeu.
  var _isCoarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function _isTextInputEl(el) {
    return !!el && (el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && ['text', 'search', 'tel', 'email', 'password', 'number', 'url', 'date', 'time'].indexOf(el.type) !== -1));
  }
  // ⚠️ 3 septembre 2026 (Design) : la première version de ce correctif
  // fermait le clavier au premier ÉVÉNEMENT `scroll` reçu pendant qu'un champ
  // avait le focus. Un ajustement à 600ms (voir historique dans le journal
  // du volet) n'a pas suffi : sur certains champs/claviers, le navigateur
  // redéclenche un micro-scroll d'ajustement à CHAQUE caractère tapé (pas
  // seulement à l'ouverture), pas seulement une fois au focus — Emilien ne
  // pouvait alors taper qu'un seul caractère avant fermeture. Remplacé par
  // la détection demandée explicitement par Emilien : fermer le clavier
  // uniquement au TOUCHER de l'écran EN DEHORS du champ qui a le focus, plus
  // aucun lien avec le défilement. Un clavier virtuel natif ne fait pas
  // partie du DOM de la page : un `touchstart` ne peut donc jamais être émis
  // "sur le clavier" lui-même (l'OS l'intercepte avant qu'il n'atteigne la
  // page) — vérifier que la cible du toucher n'est pas le champ actif
  // suffit à distinguer "toucher pour continuer à écrire" de "toucher
  // ailleurs pour fermer le clavier", sans jamais réagir à un scroll.
  if (_isCoarsePointer) {
    document.addEventListener('touchstart', function (e) {
      var active = document.activeElement;
      if (!_isTextInputEl(active)) return;
      var target = e.target;
      if (target === active || (active.contains && active.contains(target))) return;
      active.blur();
    }, { capture: true, passive: true });
  }

  // ⚠️ 3 septembre 2026 (Design), suite : la mesure de --keyboard-inset via
  // VisualViewport (tentée juste avant, voir historique dans le journal du
  // volet) ne suffisait pas dans tous les contextes — Emilien a reproduit le
  // "flottement" de .tabbar sur le composeur de sondage, où le clavier
  // ajoute sa propre barre d'accessoires (texte prédictif + une rangée de
  // navigation ↑↓✓) au-dessus des touches : selon le navigateur/contexte,
  // `visualViewport.height` ne reflète pas toujours fidèlement la hauteur
  // totale réellement couverte (clavier + ces barres additionnelles), en
  // particulier en PWA installée où le support de cette API est connu pour
  // être inégal. Plutôt que de continuer à ajuster une position calculée
  // dont la fiabilité dépend du navigateur, solution plus robuste — masquer
  // .tabbar entièrement tant qu'un champ texte a le focus, et la remontrer
  // dès que ce n'est plus le cas. Il n'y a alors plus rien à positionner
  // pendant que le clavier est ouvert, donc plus rien qui puisse flotter.
  if (_isCoarsePointer) {
    (function () {
      var tabbarEl = document.querySelector('.tabbar');
      if (!tabbarEl) return;
      var hideTimer = null;
      document.addEventListener('focusin', function (e) {
        if (!_isTextInputEl(e.target)) return;
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        tabbarEl.classList.add('tabbarHidden');
      }, true);
      document.addEventListener('focusout', function (e) {
        if (!_isTextInputEl(e.target)) return;
        // Court délai pour absorber le passage d'un champ à l'autre dans un
        // même formulaire (focusout puis focusin quasi immédiat) sans
        // laisser la barre réapparaître puis disparaître entre les deux.
        hideTimer = setTimeout(function () {
          if (!_isTextInputEl(document.activeElement)) tabbarEl.classList.remove('tabbarHidden');
        }, 80);
      }, true);
    })();
  }

  // 3 septembre 2026, suite (Design) : Emilien souhaite qu'un volet dont le
  // contenu tient déjà entièrement dans l'écran (ex. Chrono, Activité selon
  // ce qu'ils contiennent à l'instant) ne présente AUCUN mouvement au
  // toucher — pas seulement un défilement sans effet, mais une page
  // réellement figée. `overscroll-behavior-y: none` (2 septembre 2026, plus
  // haut dans styles.css) empêche déjà le rebond élastique quand il existe
  // un vrai défilement ; ceci va plus loin pour le cas où il n'y en a AUCUN
  // besoin : `overflow: hidden` sur <html>/<body> retire toute possibilité
  // de tirer/glisser la page, quel que soit le comportement d'un navigateur
  // particulier vis-à-vis du rebond. La classe `.noScrollNeeded` (voir
  // styles.css) n'est posée que lorsque le contenu réel ne dépasse pas la
  // fenêtre visible ; retirée dès qu'un onglet a besoin de défiler.
  // Recalculée à chaque changement d'onglet (switchTab/openProfile), au
  // redimensionnement/rotation, ET via un ResizeObserver sur #app — ce
  // dernier couvre les cas où le contenu change de hauteur en différé (une
  // liste chargée après un appel réseau, un panneau qu'on déplie), sans
  // avoir à ajouter un appel dédié dans chaque volet.
  function refreshScrollLock() {
    var needsScroll = document.documentElement.scrollHeight > window.innerHeight + 1;
    document.documentElement.classList.toggle('noScrollNeeded', !needsScroll);
    document.body.classList.toggle('noScrollNeeded', !needsScroll);
  }
  window.addEventListener('resize', refreshScrollLock);
  window.addEventListener('orientationchange', refreshScrollLock);
  if (window.ResizeObserver) {
    new ResizeObserver(refreshScrollLock).observe($('app'));
  }

  function showApp() {
    $('onboarding').classList.add('hidden');
    $('app').classList.remove('hidden');
    syncTopbarHeightVar();
    refreshScrollLock();
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
      // La Répartition repart toujours SYNCHRONISÉE sur la Feuille de temps
      // (3 septembre 2026, demande d'Emilien : « je souhaite que la
      // répartition soit par défaut synchronisée à la feuille de temps »).
      // Remis à zéro à l'ENTRÉE dans l'onglet plutôt qu'à la sortie : même
      // résultat observable, mais ça couvre aussi le tout premier affichage
      // et une réouverture de l'app directement sur cet onglet. Pas de
      // repeinture ici — loadTimesheet() juste en dessous s'en charge.
      pieTodayMode = false;
      syncPieTodayBtn();
      loadTimesheet();
    }
    else {
      if (tab === 'community') loadCommunity();
      else if (tab === 'activity') loadActivityTab();
      else if (tab === 'chrono') {
        currentHistoryWeekOffset = 0;
        $('chronoHistoryPanel').classList.add('hidden');
      }
    }
    // Mesure immédiate pour la partie du DOM déjà en place ; le
    // ResizeObserver posé sur #app rattrape les listes/blocs qui arrivent
    // après un appel réseau (loadCommunity/loadActivityTab/etc. ci-dessus).
    refreshScrollLock();
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
    showProfileMain();
    loadPendingInvites();
    loadFollowRequests();
    renderThemeSwitch();
    renderLangSwitch();
    renderShareSettings();
    loadProfileProjects();
    loadProfileNotes();
    loadProfileDiscussion();
    refreshScrollLock();
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
    // bouton équivalent de buildPostCard, dans mountProfilePostsComposer,
    // plus bas). Trombone (SVG, même
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

  // (Le menu "⋮" de la Répartition a été retiré le 1er septembre 2026 : le
  // camembert suit désormais la période de la Feuille de temps — voir
  // renderPieFromTimesheet plus bas.)
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

  // Remplace loadPieStats() (retirée le 1er septembre 2026, demande
  // d'Emilien : « la répartition indique les données affichées en temps réel
  // dans la feuille de temps et se modifie automatiquement avec elle »). Le
  // camembert ne fait plus d'appel serveur à lui : il est redessiné à partir
  // de la réponse que la Feuille de temps vient de recevoir (loadTimesheet
  // ci-dessous), qui porte désormais un champ `breakdown` couvrant
  // exactement les jours affichés par la grille. Conséquences voulues :
  // aucune divergence possible entre les deux sections (mêmes données, même
  // réponse), une requête HTTP de moins, et un camembert qui se remet à jour
  // tout seul à chaque changement de période ou de flèche ‹ › de la grille,
  // sans avoir à s'abonner à quoi que ce soit.
  // Peinture du camembert à partir d'un objet { label, breakdown }. Les deux
  // sources ont volontairement la même forme : la réponse de
  // GET /stats/timesheet (mode synchronisé) et celle de GET /stats/today
  // (mode "Aujourd'hui") — un seul chemin de rendu, pas de code en double.
  function renderPieBreakdown(data) {
    var breakdown = (data && data.breakdown) || { totalSeconds: 0, activities: [] };
    $('statsLabel').textContent = data && data.label ? t(data.label) : '';
    $('statsTotal').textContent = formatHM(breakdown.totalSeconds);
    renderPie(breakdown.activities || [], breakdown.totalSeconds);
  }

  function renderPieFromTimesheet(data) {
    // Mémorisée même en mode "Aujourd'hui" : c'est ce qui permet de
    // resynchroniser instantanément au second clic, sans redemander au
    // serveur une réponse qu'on a déjà.
    lastTimesheetPieData = data;
    // Désynchronisé : la grille continue de se rafraîchir normalement, elle
    // ne pilote simplement plus le camembert tant que le mode est actif.
    if (pieTodayMode) return;
    renderPieBreakdown(data);
  }

  // ----- Bouton "Aujourd'hui" (3 septembre 2026, demande d'Emilien) -----
  function syncPieTodayBtn() {
    var btn = $('statsPieTodayBtn');
    if (!btn) return;
    btn.classList.toggle('active', pieTodayMode);
    btn.setAttribute('aria-pressed', pieTodayMode ? 'true' : 'false');
  }

  function loadPieToday() {
    if (!profile) return;
    api('GET', '/api/stats/today?userId=' + profile.id).then(function (data) {
      // L'utilisateur a pu re-cliquer (ou quitter l'onglet) pendant la
      // requête : ne rien peindre si le mode n'est plus actif, sinon une
      // réponse tardive écraserait le camembert resynchronisé.
      if (!pieTodayMode) return;
      renderPieBreakdown(data);
    });
  }

  function setPieTodayMode(on) {
    pieTodayMode = !!on;
    syncPieTodayBtn();
    if (pieTodayMode) loadPieToday();
    else if (lastTimesheetPieData) renderPieBreakdown(lastTimesheetPieData);
    else loadTimesheet(); // resynchronisation avant toute réponse de la grille
  }

  $('statsPieTodayBtn').addEventListener('click', function () { setPieTodayMode(!pieTodayMode); });

  function loadChartStats() {
    if (!profile) return;
    api('GET', '/api/stats?userId=' + profile.id + '&granularity=' + currentChartGranularity).then(function (data) {
      lastDailyBreakdown = data.dailyBreakdown || [];
      renderChart(lastDailyBreakdown);
    });
  }

  // Utilisé à l'ouverture de l'onglet Statistiques (voir switchTab). Ne
  // charge plus que le Graphique depuis le 1er septembre 2026 : la
  // Répartition n'a plus de chargement propre, elle est redessinée par
  // loadTimesheet() que switchTab appelle juste après (voir
  // renderPieFromTimesheet ci-dessus).
  function loadStats() {
    loadChartStats();
  }

  // ----- Section Camembert : répartition de la période en cours, une part
  // par activité, couleur = couleur déjà attribuée à l'activité (identité
  // stable, jamais générée) — remplace l'ancienne .barList. -----
  function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    // Cas particulier du tour COMPLET (une seule activité enregistrée, donc
    // 100 % — signalé par Emilien le 3 septembre 2026 : « je souhaite qu'on
    // voie tout de même un cercle de la couleur de l'activité »).
    //
    // Un arc SVG dont le point d'arrivée est exactement le point de départ
    // n'est pas dessiné : c'est la règle du format (un arc a besoin de deux
    // points distincts pour être défini), pas un bug de navigateur. Avec une
    // part unique, `endAngle - startAngle` vaut exactement 2π, donc les deux
    // extrémités coïncident et l'anneau disparaissait entièrement — alors que
    // le total au centre et la légende, eux, s'affichaient normalement.
    //
    // On dessine donc l'anneau en quatre demi-arcs : deux pour le contour
    // extérieur (sens horaire), deux pour le contour intérieur parcouru en
    // SENS INVERSE. Les deux sous-tracés ayant des sens d'enroulement
    // opposés, la règle de remplissage par défaut (nonzero) évide le centre —
    // le trou du donut est obtenu exactement comme pour une part partielle,
    // sans `fill-rule` particulier ni élément d'un autre type.
    if (endAngle - startAngle >= Math.PI * 2 - 1e-6) {
      var mid = startAngle + Math.PI; // point diamétralement opposé
      var oax = cx + rOuter * Math.cos(startAngle), oay = cy + rOuter * Math.sin(startAngle);
      var obx = cx + rOuter * Math.cos(mid), oby = cy + rOuter * Math.sin(mid);
      var iax = cx + rInner * Math.cos(startAngle), iay = cy + rInner * Math.sin(startAngle);
      var ibx = cx + rInner * Math.cos(mid), iby = cy + rInner * Math.sin(mid);
      return 'M' + oax + ',' + oay +
        ' A' + rOuter + ',' + rOuter + ' 0 0 1 ' + obx + ',' + oby +
        ' A' + rOuter + ',' + rOuter + ' 0 0 1 ' + oax + ',' + oay + ' Z' +
        ' M' + iax + ',' + iay +
        ' A' + rInner + ',' + rInner + ' 0 0 0 ' + ibx + ',' + iby +
        ' A' + rInner + ',' + rInner + ' 0 0 0 ' + iax + ',' + iay + ' Z';
    }

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

  // `ids` (optionnel, ajouté le 2 septembre 2026) : où dessiner. Sans lui,
  // le camembert de l'onglet Statistiques, exactement comme avant — la
  // Répartition (#statsPieBlock) n'a aucun changement de comportement. Avec
  // lui, la page de visite d'un profil (#viewProfilePie, voir
  // openProfileViewModal plus bas) réutilise ce même rendu sur ses propres
  // conteneurs, plutôt que d'en recopier une seconde version — même principe
  // que mountProfilePostsComposer(ids), déjà utilisé pour partager le
  // composeur de messages entre Profil et Communauté.
  function renderPie(activities, totalSeconds, ids) {
    var wrapId = (ids && ids.wrap) || 'statsPie';
    var emptyHintId = (ids && ids.emptyHint) || 'statsPieEmptyHint';
    var wrap = $(wrapId);
    wrap.innerHTML = '';
    $(emptyHintId).classList.toggle('hidden', activities.length > 0);
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
    var total = sorted.length;

    // Espacement fixe entre les points (voir CHART_DAY_SPACING en haut du
    // fichier — plus de zoom, voir son commentaire) : tous les jours sont
    // toujours dessinés, le graphique s'élargit avec l'historique et défile
    // horizontalement nativement dans .chartScroll (styles.css) au besoin.
    var padSide = 8;
    var minWidth = Math.max(280, box.clientWidth || 280);
    var width = Math.max(minWidth, padSide * 2 + CHART_DAY_SPACING * total);
    var innerW = width - padSide * 2;
    var stepW = innerW / total;

    function xFor(i) { return padSide + stepW * (i + 0.5); }

    var series = buildChartSeries(sorted);
    var maxSeconds = sorted.reduce(function (m, d) { return Math.max(m, d.totalSeconds); }, 0) || 1;

    var height = 180, padTop = 14, padBottom = 26;
    var plotH = height - padTop - padBottom;

    function yFor(seconds) { return padTop + plotH - (seconds / maxSeconds) * plotH; }

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'chartSvg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = width + 'px';
    svg.style.height = height + 'px';

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

    // Étiquettes de l'axe X éclaircies selon l'espacement courant : à
    // l'espacement d'origine (56px) une étiquette par point tient déjà
    // large, mais un fort pincement "vers l'intérieur" peut resserrer les
    // points bien plus que la place que prend une étiquette, où une
    // étiquette par point se chevaucherait. Un pas minimal en pixels entre
    // deux étiquettes (~34px, assez pour "27/08") détermine combien en
    // sauter ; le dernier point garde toujours la sienne pour ne pas perdre
    // le repère du bord droit (le plus récent).
    var minLabelPx = 34;
    var labelStride = Math.max(1, Math.ceil(minLabelPx / stepW));
    sorted.forEach(function (d, i) {
      if (i % labelStride !== 0 && i !== total - 1) return;
      var x = xFor(i);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x); label.setAttribute('y', height - 8);
      label.setAttribute('class', 'chartAxisLabel');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = dayChartLabel(d, true);
      svg.appendChild(label);
    });

    // ----- Survol : crosshair vertical + infobulle listant chaque série au
    // jour survolé/touché (voir dataviz : interaction obligatoire par défaut
    // sur un graphique en courbe). -----
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
      if (i > total - 1) i = total - 1;
      return i;
    }

    hoverLayer.addEventListener('pointermove', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerenter', function (evt) { showTooltipAt(indexFromEvent(evt)); });
    hoverLayer.addEventListener('pointerleave', function () { hideTooltip(); });

    box.appendChild(svg);
    renderChartLegend(series);

    // 3 septembre 2026, demande d'Emilien : « par défaut, la section
    // graphique doit afficher les six dernières données du calendrier [...]
    // même si j'ai touché le graphique avant [...] peu importe qu'on soit en
    // mode jour, semaine ou mois. » Le Graphique n'a plus aucun zoom (voir
    // CHART_DAY_SPACING plus haut) : chaque point garde son espacement fixe
    // de 56px, ce qui correspond à peu près à six points visibles sur la
    // largeur d'un écran de téléphone. On se contente donc de replacer le
    // défilement horizontal de .chartScroll sur son bord droit (les données
    // les plus récentes) à CHAQUE rendu de cette fonction — premier
    // chargement, changement de granularité (Jour/Semaine/Mois) ou retour
    // sur l'onglet Statistiques après l'avoir quitté (switchTab('stats')
    // appelle systématiquement loadStats() → loadChartStats() →
    // renderChart(), voir plus haut) — plutôt que de laisser le navigateur
    // conserver la position laissée par un défilement précédent de
    // l'utilisateur. Aucun mécanisme de zoom/geste réintroduit : un simple
    // repositionnement de scrollLeft, sans toucher à l'espacement des points.
    var chartScrollWrap = box.parentElement;
    if (chartScrollWrap && chartScrollWrap.classList.contains('chartScroll')) {
      chartScrollWrap.scrollLeft = chartScrollWrap.scrollWidth;
    }
  }

  // ----- Ni le Graphique ni la Feuille de temps n'ont de mode plein écran :
  // la Feuille de temps a perdu le sien le 1er septembre 2026 (demande
  // d'Emilien : « supprimer l'option de passage en plein écran »), le
  // Graphique le sien plus tard le même jour (demande d'Emilien :
  // « supprimer le mode plein écran de graphique »). Pour le Graphique : le
  // bouton #chartFullscreenBtn, la variable chartFullscreenActive, la
  // fonction exitChartFullscreen() et les règles #statsChartBlock.fullscreen
  // de styles.css ont tous été retirés — y compris l'étirement de hauteur du
  // SVG qui n'avait de sens qu'en plein écran (renderChart() pose maintenant
  // toujours une hauteur inline fixe). L'exclusion mutuelle qui existait
  // entre les deux plein écrans — chacun appelait la sortie de l'autre pour
  // ne jamais laisser body.scrollLock verrouillé par l'un pendant que
  // l'autre se ferme (29 août 2026) — n'a donc plus d'objet et a été retirée
  // des deux côtés (voir switchTab() et openProfile() plus haut). Pour la
  // Feuille de temps : le bouton #tsFullscreenBtn, la variable
  // statsFullscreenActive, la fonction exitStatsFullscreen() et les règles
  // #statsTimesheetBlock.fullscreen de styles.css ont eux aussi été retirés.
  // Conséquence traitée dans les deux demandes : les menus "⋮" (Semaine/Mois
  // pour la Feuille de temps, Jour/Semaine/Mois pour le Graphique), qui
  // n'étaient révélés qu'en plein écran par la classe .fullscreenOnly, sont
  // désormais toujours visibles — sans quoi la vue "Mois" de la Feuille de
  // temps et le choix de granularité du Graphique seraient devenus
  // inaccessibles. .fullscreenOnly n'a donc plus aucun usage et a été
  // retirée de styles.css. Les deux vues restent entièrement consultables
  // hors plein écran : comme la grille "Semaine" de la Feuille de temps, le
  // Graphique défile déjà horizontalement dans .chartScroll pour les
  // longues périodes. -----

  // ===================== FEUILLE DE TEMPS (heatmap hebdomadaire) =====
  // Grille jour × quart d'heure, dans l'esprit de l'onglet "Feuille de temps"
  // du Google Sheet d'origine. Une SEMAINE à la fois, qui ne défile QUE
  // horizontalement (les 24 heures ne tiennent pas dans la largeur d'un
  // téléphone) — la colonne des jours reste figée à gauche pendant ce
  // défilement.
  //
  // ⚠️ 1er septembre 2026 (~03h00 heure de Toronto) — RETOUR EN ARRIÈRE
  // demandé par Emilien : « je souhaite annuler les dernières modifications.
  // Revenir à la version précédente de la feuille de temps qui défile que de
  // gauche à droite. Cependant, je souhaite que lorsque je clique sur une
  // flèche, cela me montre toujours des semaines de lundi à dimanche. Seule
  // modification que l'on garde. »
  //
  // Ont donc été RETIRÉS (livrés plus tôt dans la journée, tous annulés) :
  // le défilement vertical et son chargement progressif vers le passé
  // (`tsDays`, `tsLoadOlder`, tranches de 30 jours), le cadre de hauteur fixe
  // à 7 lignes, le verrouillage d'axe et l'avance par à-coups d'une journée,
  // la sélection préalable de la section (classe `tsActive` + liséré violet),
  // la ligne d'heures figée en haut, et le calcul du camembert sur les seuls
  // jours visibles. Côté serveur, `timesheetRangeForUser` et les paramètres
  // `endDate`/`days`/`breakdownFrom`/`breakdownTo` de `GET /stats/timesheet`
  // ont disparu avec eux.
  //
  // A été GARDÉ, et c'est le seul écart avec l'état d'avant : la semaine
  // affichée est une VRAIE semaine calendaire, du lundi au dimanche. C'est
  // `timesheetForUser` (server/lib/stats.js) qui le porte — elle utilisait
  // depuis le matin une fenêtre glissante de 7 jours se terminant sur
  // aujourd'hui. Conséquence assumée, signalée à Emilien : en début de
  // semaine, la semaine en cours contient forcément des jours à venir, donc
  // vides. C'était précisément ce que la fenêtre glissante évitait — mais
  // Emilien préfère des semaines lundi→dimanche lisibles d'un coup d'œil.
  //
  // Le camembert de la Répartition redevient alimenté par la réponse de cette
  // même requête (`renderPieFromTimesheet(data)`), exactement comme cette
  // discussion l'avait conçu : les jours affichés et les jours visibles sont
  // de nouveau la même chose, il n'y a plus rien à recalculer au défilement.
  //
  // Ces deux flèches naviguent en semaines ou en mois selon la période
  // choisie dans le menu "⋮" (currentTimesheetPeriod) : mêmes boutons, mêmes
  // ids, comportement adapté à la vue affichée.
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

  // Dispatch selon la période choisie : "Semaine" (heatmap 15 min) ou "Mois"
  // (calendrier 2h, voir renderTimesheetMonth).
  // ⚠️ 1er septembre 2026 (discussion Répartition, débordement autorisé par
  // Emilien sur cette fonction qui appartient à la Feuille de temps) : la
  // même réponse alimente aussi le camembert, via renderPieFromTimesheet.
  // Deux lignes, aucune logique de la Feuille de temps modifiée.
  function loadTimesheet() {
    if (!profile) return;
    if (currentTimesheetPeriod === 'month') {
      api('GET', '/api/stats/timesheet?userId=' + profile.id + '&period=month&monthOffset=' + currentTimesheetMonthOffset).then(function (data) {
        renderTimesheetMonth(data);
        renderPieFromTimesheet(data);
      });
    } else {
      api('GET', '/api/stats/timesheet?userId=' + profile.id + '&period=week&weekOffset=' + currentTimesheetOffset).then(function (data) {
        renderTimesheetWeek(data);
        renderPieFromTimesheet(data);
      });
    }
  }

  function renderTimesheetWeek(data) {
    $('tsGrid').classList.remove('hidden');
    $('tsCalendar').classList.add('hidden');
    // Marque le cadre défilant comme étant en vue "Semaine" : styles.css s'en
    // sert pour retirer la colonne des libellés de la grille (voir
    // .tsWeekScroll là-bas). Le même conteneur sert aux deux vues, d'où le
    // retrait symétrique dans renderTimesheetMonth.
    $('tsGrid').parentNode.classList.add('tsWeekScroll');
    $('tsFrozenCol').classList.remove('hidden');
    $('tsFrozenCol').classList.remove('tsFrozenCal');

    $('tsWeekLabel').textContent = t(data.label) + (data.isCurrentWeek ? t(' (en cours)') : '');
    $('tsNextWeek').disabled = data.isCurrentWeek;
    $('tsPrevWeek').disabled = !data.hasMoreBefore;

    var hasAnyEntry = data.days.some(function (day) { return day.slots.some(function (s) { return !!s; }); });
    $('tsEmptyHint').classList.toggle('hidden', hasAnyEntry);

    // ⚠️ 2 septembre 2026 — DEUX blocs construits séparément.
    // Le coin et les libellés de jour vont dans #tsFrozenCol, qui n'est PAS
    // dans la zone défilante (voir index.html et .tsFrozenCol dans
    // styles.css) : c'est ce qui les empêche de partir vers la gauche quand
    // Emilien tire la feuille vers la droite, là où `position: sticky`
    // échouait sur son iPhone. La grille ne contient plus que la ligne des
    // heures et les créneaux.
    // Les deux blocs listent les MÊMES jours dans le MÊME ordre — c'est la
    // seule chose qui garantit que « Mer 02/09 » soit en face de la bonne
    // rangée de créneaux. Une seule boucle les remplit tous les deux, pour
    // qu'il soit impossible de faire diverger l'un sans l'autre.
    var frozen = '<div class="tsCorner"></div>';
    var html = '';
    for (var h = 0; h < 24; h++) {
      html += '<div class="tsHourLabel" style="grid-column: span 4;">' + h + 'h</div>';
    }

    data.days.forEach(function (day) {
      var dateObj = new Date(day.isoDate + 'T00:00:00');
      frozen += '<div class="tsDayLabel">' + t(day.dayOfWeek).slice(0, 3) + ' ' + pad(dateObj.getDate()) + '/' + pad(dateObj.getMonth() + 1) + '</div>';
      day.slots.forEach(function (slot, i) {
        var slotLabel = pad(Math.floor(i / 4)) + ':' + pad((i % 4) * 15);
        if (slot) {
          html += '<div class="tsSlot tsSlot-filled" style="background:' + slot.color + '" title="' + escapeHtml(slot.name) + ' · ' + slotLabel + '"></div>';
        } else {
          html += '<div class="tsSlot" title="' + slotLabel + '"></div>';
        }
      });
    });

    $('tsFrozenCol').innerHTML = frozen;
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
    // ⚠️ 2 septembre 2026 — la vue "Mois" avait exactement le même défaut que
    // la vue "Semaine" (« le bug des journées qui se décalent vers la droite
    // est présent pour le mode mois ») et pour exactement la même raison : sa
    // colonne de libellés de semaine (.tsCalWeekLabel) était figée par
    // `position: sticky` À L'INTÉRIEUR de .tsCalendarGrid, ce qu'un navigateur
    // n'est pas tenu d'honorer sur un élément de grille. Elle est donc traitée
    // comme celle de la vue Semaine : sortie dans #tsFrozenCol, qui prend ici
    // les métriques du calendrier (classe tsFrozenCal, voir styles.css).
    $('tsGrid').parentNode.classList.remove('tsWeekScroll');
    $('tsFrozenCol').classList.remove('hidden');
    $('tsFrozenCol').classList.add('tsFrozenCal');

    $('tsWeekLabel').textContent = t(data.label) + (data.isCurrentMonth ? t(' (en cours)') : '');
    $('tsNextWeek').disabled = data.isCurrentMonth;
    $('tsPrevWeek').disabled = !data.hasMoreBefore;

    var hasAnyEntry = data.weeks.some(function (week) {
      return week.some(function (day) { return day.slots.some(function (s) { return !!s; }); });
    });
    $('tsEmptyHint').classList.toggle('hidden', hasAnyEntry);

    // Même découpage qu'en vue Semaine : le coin et les libellés de semaine
    // vont dans le bloc figé, le calendrier ne garde que les 7 colonnes de
    // jours. Une seule boucle remplit les deux, pour qu'une semaine ne puisse
    // pas se retrouver en face de la mauvaise ligne.
    var frozen = '<div class="tsCalCorner"></div>';
    var html = '';
    TS_CAL_WEEKDAY_NAMES.forEach(function (name) {
      html += '<div class="tsCalHeaderCell">' + t(name).slice(0, 3) + '</div>';
    });

    data.weeks.forEach(function (week) {
      var firstDate = new Date(week[0].isoDate + 'T00:00:00');
      var lastDate = new Date(week[6].isoDate + 'T00:00:00');
      frozen += '<div class="tsCalWeekLabel">' + pad(firstDate.getDate()) + '/' + pad(firstDate.getMonth() + 1)
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

    $('tsFrozenCol').innerHTML = frozen;
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
    // 2 septembre 2026 : l'onglet ne s'ouvre plus sur une zone de recherche
    // vide. La saisie et les filtres sont remis à zéro (comme avant pour la
    // saisie), puis la liste d'exploration est chargée — voir
    // loadCommunityDiscovery plus haut.
    $('communitySearchInput').value = '';
    communitySeekingFilter.length = 0;
    buildCommunitySeekingFilters();
    $('communitySearchResults').innerHTML = '';
    loadCommunityDiscovery();
    // Zone "écrire à sa communauté" (#communityMyPostsBlock, 1er septembre
    // 2026) : voir mountProfilePostsComposer, plus bas dans ce fichier —
    // communityDiscussionComposer est la seconde instance, celle du Profil
    // (profileDiscussionComposer) restant inchangée.
    communityDiscussionComposer.reset();
    // Sondages (3 septembre 2026, discussion "Sondages") : bloc jumeau de
    // celui du Profil, même donnée — voir mountPolls plus bas.
    communityPollsMount.reset();
    loadFollowingFeed();
  }

  // ----- Activité sélectionnée dans l'onglet Activité -----
  // Depuis le 30 août 2026 (fin de journée), il n'y a plus qu'UNE liste
  // d'activités dans l'app (voir renderActivitiesSettings) : partagée ou non,
  // chaque activité y est une ligne. Sélectionner une activité PARTAGÉE
  // déplie, juste sous sa ligne, tout ce qui concerne ses autres membres —
  // discussion, statistiques, feuille de temps, enregistrements et notes.
  var currentCommunityActivityId = '';
  // Vrai quand l'activité sélectionnée est partagée (>= 2 membres). Posée au
  // clic sur la ligne, lue par loadActivityDetail pour décider s'il faut
  // afficher la partie "membres" du détail — voir #communityActivityMembersPart
  // dans index.html (ajoutée le 3 septembre 2026 avec les sous-projets).
  var currentActivityIsShared = false;

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

  // ⚠️ 3 septembre 2026 (Activité — général) : l'hôte par défaut n'est plus
  // #activityDetailAnchor (bas de l'onglet Activité) mais #activityPageBody,
  // la zone défilante de la nouvelle page d'activité. #activityDetailAnchor
  // reste déclaré dans index.html comme filet de repli, mais n'est plus
  // utilisé en fonctionnement normal.
  function attachActivityDetail(host) {
    var detail = activityDetailEl();
    if (!detail) return;
    (host || $('activityPageBody') || $('activityDetailAnchor')).appendChild(detail);
  }

  function loadActivityDetail(shouldScroll) {
    if (!profile) return;
    if (!currentCommunityActivityId) {
      activityDetailEl().classList.add('hidden');
      stopDiscussionPolling();
      // Sous-projets (3 septembre 2026) : le bloc suit la sélection
      // d'activité, exactement comme le fil de discussion juste au-dessus.
      resetSubProjectsBlock();
      return;
    }

    // Nouvelle sélection : on repart toujours de zéro sur les statistiques de
    // CETTE activité (période "Semaine", semaine en cours) — même logique
    // que l'ouverture de l'onglet Statistiques.
    currentActivityPiePeriod = 'week';
    currentActivityChartPeriod = 'week';
    syncActivityPeriodMenus();
    // Nouvelle activité : on repart d'un fil vide côté affichage, sinon la
    // signature du fil précédent empêcherait le premier rendu (et le
    // défilement automatique vers le dernier message).
    discussionRenderedIds = '';
    $('communityDiscussionList').innerHTML = '';
    $('communityDiscussionInput').value = '';
    $('communityDiscussionMsg').textContent = '';

    // Activité NON partagée : rien à comparer entre membres, aucun fil de
    // membres — on n'affiche que les sous-projets, et on n'appelle même pas
    // les routes /community/activity-* (elles refusent d'ailleurs une
    // activité solo par 400, voir checkSharedActivityAccess).
    // ⚠️ 3 septembre 2026 (Activité — général) : ces deux parties ne sont plus
    // affichées/masquées par le seul partage — elles sont devenues deux des
    // TROIS SECTIONS de la page d'activité. C'est setActivityPageSection() qui
    // tranche, en tenant compte à la fois de la section choisie ET du partage
    // (une activité non partagée n'a ni statistiques ni fil).
    setActivityPageSection(activityPageSection);
    if (!currentActivityIsShared) {
      activityDetailEl().classList.remove('hidden');
      stopDiscussionPolling();
      resetSubProjectsBlock();
      loadSubProjects();
      if (shouldScroll) activityDetailEl().scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // ⚠️ 3 septembre 2026 (Activité — général) : l'appel à
    // /api/community/activity-feed a été retiré ici avec le flux des
    // enregistrements des autres membres (« les notes », demande d'Emilien).
    // Il portait aussi la garde « l'activité a-t-elle disparu ? » — celle-ci
    // est reprise telle quelle dans le .catch de loadActivityStats, le seul
    // appel restant à faire la même vérification d'accès.
    // ⚠️ La ROUTE serveur et sharedFeedForUser ne sont PAS supprimées : elles
    // appartiennent à Communauté et servent encore ailleurs. Signalées comme
    // sans appelant depuis cette page, décision à Emilien.
    activityDetailEl().classList.remove('hidden');
    if (shouldScroll) activityDetailEl().scrollIntoView({ behavior: 'smooth', block: 'start' });

    loadActivityStats(currentCommunityActivityId);
    loadDiscussion(true);
    startDiscussionPolling();
    // Sous-projets de cette activité (discussion "Sous-projets", 3 septembre
    // 2026) : on repart toujours d'aucun sous-projet ouvert, comme les
    // statistiques repartent de la période "Semaine".
    resetSubProjectsBlock();
    loadSubProjects();
  }


  // ===================== PAGE D'UNE ACTIVITÉ =====================
  // 3 septembre 2026, discussion "Activité — général". Demande d'Emilien :
  // « lorsque je clique sur l'activité, cela m'amène automatiquement sur une
  // nouvelle page. Le nom de l'activité doit être inscrit en haut en gros.
  // Sous le nom, on me propose d'accéder à trois sections. »
  //
  // LES QUATRE RÈGLES D'OUVERTURE, toutes tranchées par Emilien le même jour.
  // Elles tiennent en deux questions : l'activité est-elle partagée, a-t-elle
  // au moins un sous-projet ?
  //
  //   partagée ? | sous-projets ? | ce qui se passe au clic
  //   -----------|----------------|--------------------------------------------
  //   non        | non            | AUCUNE page. Formulaire "nouveau sous-projet"
  //              |                | déplié sur place, dans la ligne. « Je souhaite
  //              |                | qu'il n'y ait pas d'ouverture de nouvelle page
  //              |                | pour les activités qui ne sont pas partagées et
  //              |                | qui n'ont pas de sous-projet. »
  //   non        | oui            | Page, section Sous-projets SEULE (ni statistiques
  //              |                | ni fil : il n'y a personne d'autre). Sélecteur
  //              |                | masqué — un seul bouton serait du bruit.
  //   oui        | non            | Page ouverte sur STATISTIQUES : la section par
  //              |                | défaut n'aurait rien à montrer.
  //   oui        | oui            | Page ouverte sur Sous-projets (section par défaut).
  //
  // ⚠️ La question « a-t-elle des sous-projets ? » n'est PAS posée au serveur
  // au moment du clic : elle se lit sur `a.progress`, ajouté à GET /api/activities.
  // C'est l'application directe de la règle R3 du contrat d'avancement
  // (noesis-timetracker-contrat-avancement.md) : une activité sans aucun
  // sous-projet est ABSENTE de la Map renvoyée par progressForActivities, donc
  // son `progress` vaut null. L'absence EST l'information. Aucune requête
  // supplémentaire, aucune latence au clic, et surtout aucun second calcul.
  var activityPageSection = 'sub';

  function activityHasSubProjects(a) {
    return !!(a && a.progress && a.progress.subProjectCount > 0);
  }

  // Affiche l'une des trois sections. Elles ne sont ni déplacées ni
  // reconstruites : ce sont les trois parties déjà existantes de
  // #communityActivityDetail, simplement masquées ou montrées. C'est ce qui
  // permet de ne rien casser chez "Sous-projets" ni dans les statistiques par
  // activité — leur code ne sait même pas que ce sélecteur existe.
  function setActivityPageSection(name) {
    activityPageSection = name;
    document.querySelectorAll('#activityPageSectionSwitch .periodBtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.section === name);
    });
    var sub = $('activitySubProjectsBlock');
    var anchor = $('subProjectDetailAnchor');
    var stats = $('communityActivityMembersPart');
    var disc = $('communityDiscussionBlock');
    // #subProjectDetail (le sous-projet ouvert) n'a pas besoin d'être traité
    // ici : il est soit DANS une ligne de #subProjectsList, soit sur son ancre
    // — dans les deux cas à l'intérieur de ce qu'on masque ou montre.
    if (sub) sub.classList.toggle('hidden', name !== 'sub');
    if (anchor) anchor.classList.toggle('hidden', name !== 'sub');
    // Une activité non partagée n'a ni statistiques ni fil, quelle que soit la
    // section demandée : le partage a toujours le dernier mot.
    if (stats) stats.classList.toggle('hidden', name !== 'stats' || !currentActivityIsShared);
    if (disc) disc.classList.toggle('hidden', name !== 'disc' || !currentActivityIsShared);
  }

  function openActivityPage(a, sharedInfo, row) {
    if (!profile || !a) return;
    var isShared = !!sharedInfo || a.membersCount > 1;

    if (!isShared && !activityHasSubProjects(a)) {
      openInlineSubProjectForm(a, row);
      return;
    }
    closeInlineSubProjectForm();

    currentCommunityActivityId = String(a.id);
    currentActivityIsShared = isShared;

    $('activityPageDot').style.background = a.color;
    $('activityPageName').textContent = a.name;

    $('activityPageTabStats').classList.toggle('hidden', !isShared);
    $('activityPageTabDisc').classList.toggle('hidden', !isShared);
    $('activityPageSectionSwitch').classList.toggle('hidden', !isShared);

    setActivityPageSection(isShared && !activityHasSubProjects(a) ? 'stats' : 'sub');

    $('activityPage').classList.remove('hidden');
    // La zone défilante repart du haut : rouvrir une activité ne doit pas
    // hériter du défilement de la précédente.
    $('activityPageScroll').scrollTop = 0;

    // loadActivityDetail remplit les trois sections (sous-projets, stats, fil)
    // et démarre le minuteur du fil quand l'activité est partagée. Le `false`
    // supprime le scrollIntoView d'autrefois : le détail n'est plus quelque
    // part dans la liste, il EST la page.
    loadActivityDetail(false);
    // Rafraîchit la liste derrière la page (surlignage de la ligne ouverte,
    // pastilles de non-lus) sans bloquer l'affichage.
    loadSettingsActivities();
  }

  function closeActivityPage() {
    $('activityPage').classList.add('hidden');
    currentCommunityActivityId = '';
    stopDiscussionPolling();
    resetSubProjectsBlock();
    loadSettingsActivities();
  }

  // Formulaire "nouveau sous-projet" déplié dans la ligne, pour une activité
  // non partagée qui n'en a encore aucun (choix d'Emilien : « le formulaire
  // déplié sur place »). Volontairement minimal — nom seul : c'est une amorce,
  // la description et la todolist s'éditent ensuite dans la page, qui s'ouvre
  // dès l'ajout réussi.
  //
  // ⚠️ Il ne réutilise PAS #newSubProjectCard : celui-là vit à l'intérieur de
  // #activitySubProjectsBlock, donc dans la page — précisément celle qu'on ne
  // veut pas ouvrir ici.
  var inlineSubProjectPanel = null;

  function closeInlineSubProjectForm() {
    if (inlineSubProjectPanel && inlineSubProjectPanel.parentNode) {
      inlineSubProjectPanel.parentNode.removeChild(inlineSubProjectPanel);
    }
    inlineSubProjectPanel = null;
  }

  function openInlineSubProjectForm(a, row) {
    // Deuxième clic sur la même ligne : on referme, comme un panneau "⋮".
    if (inlineSubProjectPanel && inlineSubProjectPanel.dataset.activityId === String(a.id)) {
      closeInlineSubProjectForm();
      return;
    }
    closeInlineSubProjectForm();
    if (!row) return;

    var panel = document.createElement('div');
    // ⚠️ Deux classes : `activitySettingsPanel` pour hériter de l'apparence du
    // panneau replié d'une ligne, et `inlineSubProjectForm` pour rester
    // DISTINGUABLE de lui. Depuis le retour du "⋮" sur les lignes, une même
    // ligne peut porter les deux à la fois — sans cette seconde classe, rien
    // ne les sépare dans le DOM.
    panel.className = 'activitySettingsPanel inlineSubProjectForm';
    panel.dataset.activityId = String(a.id);

    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t("Cette activité n'a encore aucun sous-projet. Ajoute-en un pour ouvrir sa page.");
    panel.appendChild(hint);

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('Nom du sous-projet');
    panel.appendChild(input);

    var msg = document.createElement('p');
    msg.className = 'msg';
    panel.appendChild(msg);

    var actions = document.createElement('div');
    actions.className = 'rowActions';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'iconBtn';
    addBtn.textContent = t('Ajouter le sous-projet');

    function submit() {
      var name = input.value.trim();
      if (!name) { msg.textContent = t('Le nom du sous-projet est requis.'); return; }
      msg.textContent = '';
      addBtn.disabled = true;
      api('POST', '/api/activities/' + a.id + '/sub-projects', {
        userId: profile.id, name: name, description: '',
      })
        .then(function () {
          closeInlineSubProjectForm();
          // L'activité a désormais un sous-projet : la règle qui interdisait
          // la page ne s'applique plus. On la marque sur place plutôt que de
          // rappeler le serveur — loadSettingsActivities() remettra de toute
          // façon la vraie valeur juste après.
          a.progress = { done: 0, total: 0, percent: null, subProjectCount: 1, completedSubProjectCount: 0 };
          openActivityPage(a, null, row);
        })
        .catch(function (err) { msg.textContent = err.message; addBtn.disabled = false; });
    }

    addBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    actions.appendChild(addBtn);
    panel.appendChild(actions);
    row.appendChild(panel);
    inlineSubProjectPanel = panel;
    input.focus();
  }

  $('activityPageClose').addEventListener('click', closeActivityPage);

  // Clic sur le fond noir, hors de la carte : referme, comme la page de visite
  // d'un profil. Le test sur e.target évite de refermer quand le clic vient
  // d'un élément intérieur qui a laissé remonter l'événement.
  $('activityPage').addEventListener('click', function (e) {
    if (e.target === $('activityPage')) closeActivityPage();
  });

  document.querySelectorAll('#activityPageSectionSwitch .periodBtn').forEach(function (b) {
    b.addEventListener('click', function () { setActivityPageSection(b.dataset.section); });
  });

  // ===================== SOUS-PROJETS D'UNE ACTIVITÉ =====================
  // Discussion "Sous-projets" (3 septembre 2026). Découper une activité en
  // objectifs — voir #activitySubProjectsBlock dans index.html,
  // server/lib/subprojects.js et server/routes/subprojects.js.
  //
  // STRUCTURE (deuxième passage, demande d'Emilien) : un sous-projet ne
  // contient RIEN par défaut. On lui ajoute des sections une par une via le
  // bouton "Ajouter" — des tâches, un sondage, ou une discussion (une seule
  // par sous-projet). Aucune section vide n'est jamais affichée.
  //
  // ⚠️ L'ordre "discussion toujours en bas" n'est pas recalculé ici : le fil
  // (#subProjectDiscussionBlock) est écrit APRÈS #subProjectSections dans le
  // HTML, donc il est structurellement en dernier. Le serveur trie de la même
  // façon, pour que l'ordre soit le même partout.
  //
  // ⚠️ L'avancement affiché vient du MÊME calcul serveur que celui exposé à la
  // discussion "Général" (progressForActivities) : une seule source, deux
  // affichages. percent vaut null — et non 0 — quand aucune tâche n'existe
  // (règle R1 du contrat) : la barre est donc MASQUÉE dans ce cas plutôt que
  // dessinée vide.
  var currentSubProjectId = '';
  var subProjectsCache = [];
  var subProjectDetailData = null;
  // Le menu "Ajouter" a été demandé depuis une ligne qui n'était pas encore
  // ouverte : on le déplie dès que son détail est rendu.
  var pendingAddMenuOpen = false;
  // Même mécanique pour le composeur de sondage : la section vient d'être
  // créée, mais son bloc n'est démasqué qu'au rendu suivant du détail — on
  // ouvre donc le formulaire LÀ, pas avant (sinon reset() du socle le
  // referme aussitôt).
  var pendingPollFormOpen = false;

  // ⚠️ Le nœud est MÉMORISÉ : une fois détaché du document (pour survivre au
  // vidage de la liste), document.getElementById ne le retrouve plus et
  // renverrait null — le bloc serait alors définitivement perdu. C'est
  // exactement pour ça que activityDetailEl() met déjà activityDetailNode en
  // cache ; le piège s'est reproduit ici, trouvé par la suite Playwright.
  var subProjectDetailNode = null;
  function subProjectDetailEl() {
    if (!subProjectDetailNode) subProjectDetailNode = $('subProjectDetail');
    return subProjectDetailNode;
  }

  function attachSubProjectDetail() {
    var detail = subProjectDetailEl();
    if (!detail) return;
    if (!currentSubProjectId) {
      $('subProjectDetailAnchor').appendChild(detail);
      detail.classList.add('hidden');
      return;
    }
    var row = document.querySelector('#subProjectsList .subProjectRow[data-sub-project-id="' + currentSubProjectId + '"]');
    if (row) row.appendChild(detail);
    detail.classList.remove('hidden');
  }

  // Barre d'avancement. percent === null (aucune tâche) : on masque au lieu de
  // dessiner une barre vide, qui se lirait à tort comme « 0 % fait ».
  function renderProgressBar(wrapId, fillId, labelId, done, total, percent) {
    var wrap = wrapId ? $(wrapId) : null;
    var label = labelId ? $(labelId) : null;
    if (percent === null || percent === undefined) {
      if (wrap) wrap.classList.add('hidden');
      if (label) label.textContent = '';
      $(fillId).style.width = '0%';
      return;
    }
    if (wrap) wrap.classList.remove('hidden');
    $(fillId).style.width = percent + '%';
    if (label) label.textContent = percent + '% · ' + done + '/' + total;
  }

  function resetSubProjectsBlock() {
    currentSubProjectId = '';
    subProjectsCache = [];
    subProjectDetailData = null;
    if (subProjectThread) subProjectThread.stopPolling();
    attachSubProjectDetail();
    $('subProjectsList').innerHTML = '';
    $('subProjectsEmptyHint').classList.add('hidden');
    $('activityProgressWrap').classList.add('hidden');
    $('subProjectsProgressLabel').textContent = '';
    $('newSubProjectCard').classList.add('hidden');
  }

  function loadSubProjects() {
    if (!profile || !currentCommunityActivityId) { resetSubProjectsBlock(); return; }
    var activityId = currentCommunityActivityId;
    api('GET', '/api/activities/' + activityId + '/sub-projects?userId=' + profile.id)
      .then(function (data) {
        // Sélection changée pendant la requête : réponse périmée, on ne
        // dessine pas (même garde que loadDiscussion).
        if (String(activityId) !== String(currentCommunityActivityId)) return;
        subProjectsCache = data.subProjects;
        renderSubProjectsList(data);
      })
      .catch(function () { /* activité quittée entre-temps : loadActivityDetail gère */ });
  }

  function renderSubProjectsList(data) {
    var box = $('subProjectsList');
    // ⚠️ Détacher le détail AVANT de vider la liste : il vit dans la ligne
    // sélectionnée, il serait donc détruit avec elle (et avec lui le fil de
    // discussion et ses écouteurs, montés une seule fois sur des ids fixes).
    // Même piège que detachActivityDetail() pour #communityActivityDetail.
    var detail = subProjectDetailEl();
    if (detail && detail.parentNode) detail.parentNode.removeChild(detail);
    box.innerHTML = '';
    $('subProjectsEmptyHint').classList.toggle('hidden', data.subProjects.length > 0);

    var p = data.progress;
    renderProgressBar('activityProgressWrap', 'activityProgressFill', 'subProjectsProgressLabel',
      p ? p.done : 0, p ? p.total : 0, p ? p.percent : null);

    data.subProjects.forEach(function (sub) {
      var row = document.createElement('div');
      row.className = 'activityRow subProjectRow';
      row.dataset.subProjectId = sub.id;

      var header = document.createElement('div');
      header.className = 'activityRowHeader subProjectRowHeader';

      var name = document.createElement('span');
      name.className = 'activityRowName';
      name.textContent = sub.name;
      header.appendChild(name);

      var badge = document.createElement('span');
      badge.className = 'meta subProjectBadge';
      // Un sous-projet sans aucune tâche n'affiche PAS "0 %" : il n'a pas
      // encore de todolist, ce n'est pas la même chose qu'un travail non
      // commencé (règle R1). On indique alors ce qu'il contient réellement.
      badge.textContent = sub.percent === null
        ? subProjectContentSummary(sub)
        : sub.percent + '% · ' + sub.done + '/' + sub.total;
      header.appendChild(badge);

      row.appendChild(header);

      if (sub.percent !== null) {
        var track = document.createElement('div');
        track.className = 'subProjectProgressTrack subProjectRowTrack';
        var fill = document.createElement('div');
        fill.className = 'subProjectProgressFill';
        fill.style.width = sub.percent + '%';
        track.appendChild(fill);
        row.appendChild(track);
      }

      if (sub.description) {
        var desc = document.createElement('p');
        desc.className = 'meta subProjectRowDesc';
        desc.textContent = sub.description;
        row.appendChild(desc);
      }

      header.addEventListener('click', function () {
        selectSubProject(String(sub.id) === String(currentSubProjectId) ? '' : sub.id);
      });

      // "Ajouter" vit ICI, à droite du nom (demande d'Emilien, 3 septembre
      // 2026) — plus dans un en-tête interne qui répétait le nom du
      // sous-projet une seconde fois. Le clic ne doit pas refermer la ligne :
      // il l'ouvre si elle est fermée, puis déplie le menu déroulant.
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'iconBtn subProjectAddBtn';
      addBtn.textContent = t('Ajouter');
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (String(sub.id) !== String(currentSubProjectId)) {
          selectSubProject(sub.id);
          // Le détail se charge de façon asynchrone : on ouvre le menu une
          // fois qu'il est en place, sinon il serait refermé par le rendu.
          pendingAddMenuOpen = true;
          return;
        }
        toggleAddSectionMenu();
      });
      header.appendChild(addBtn);

      box.appendChild(row);
    });

    // La ligne sélectionnée vient d'être reconstruite : le détail doit y être
    // rebranché, sinon il resterait orphelin dans l'ancre.
    attachSubProjectDetail();
  }

  // Résumé de ce que contient un sous-projet quand il n'a aucune tâche —
  // "vide", "1 sondage", "discussion"... Évite un badge muet sur une ligne
  // repliée, sans mentir avec un "0 %".
  function subProjectContentSummary(sub) {
    var bits = [];
    if (sub.pollSectionCount) bits.push(t('sondages'));
    if (sub.hasDiscussion) bits.push(t('discussion'));
    if (!bits.length) return t('vide');
    return bits.join(' · ');
  }

  function selectSubProject(id) {
    // Avant de quitter un sous-projet : retirer sa section de sondages si elle
    // est restée vide (voir removeEmptyPollSectionIfAbandoned).
    if (currentSubProjectId && String(currentSubProjectId) !== String(id || '')) {
      removeEmptyPollSectionIfAbandoned(currentSubProjectId);
    }
    currentSubProjectId = id ? String(id) : '';
    subProjectDetailData = null;
    attachSubProjectDetail();
    closeSubProjectPanels();

    if (!currentSubProjectId) {
      subProjectThread.stopPolling();
      return;
    }
    loadSubProjectDetail();
  }

  function closeSubProjectPanels() {
    $('subProjectRenamePanel').classList.add('hidden');
    $('addSectionMenu').classList.add('hidden');
    $('addSectionMsg').textContent = '';
    $('subProjectEditMsg').textContent = '';
  }

  // Charge le contenu complet du sous-projet ouvert : ses sections, dans
  // l'ordre définitif, avec leur contenu. Un seul aller-retour.
  function loadSubProjectDetail() {
    if (!profile || !currentSubProjectId) return;
    var id = currentSubProjectId;
    api('GET', '/api/sub-projects/' + id + '?userId=' + profile.id)
      .then(function (data) {
        if (String(id) !== String(currentSubProjectId)) return;
        subProjectDetailData = data;
        renderSubProjectDetail(data);
      })
      .catch(function () { /* sous-projet supprimé entre-temps */ });
  }

  function renderSubProjectDetail(data) {
    // Le nom n'est PLUS réécrit ici : il est déjà sur la ligne juste au-dessus
    // (demande d'Emilien — « que le nom du sous-projet ne soit marqué qu'une
    // seule fois et pas deux fois »). Il ne sert plus qu'à pré-remplir le
    // formulaire de renommage.
    $('subProjectEditName').value = data.subProject.name;
    $('subProjectEditDescription').value = data.subProject.description || '';

    // Avancement du sous-projet : somme de toutes ses sections de tâches.
    var done = 0, total = 0;
    data.sections.forEach(function (sec) {
      if (sec.kind === 'tasks') { done += sec.done; total += sec.total; }
    });
    renderProgressBar('subProjectProgressWrap', 'subProjectProgressFill', null,
      done, total, total ? Math.round((done / total) * 100) : null);

    // Seules les sections de TÂCHES sont dessinées ici. Les sondages et la
    // discussion sont deux blocs fixes placés APRÈS #subProjectSections dans
    // le HTML : c'est ce qui garantit l'ordre voulu par Emilien (tâches et
    // sondages au-dessus, discussion toujours en bas) sans rien recalculer.
    var box = $('subProjectSections');
    box.innerHTML = '';
    data.sections.forEach(function (sec) {
      if (sec.kind === 'tasks') box.appendChild(buildTasksSection(sec));
    });

    $('subProjectPollsBlock').classList.toggle('hidden', !data.hasPolls);
    $('subProjectDiscussionBlock').classList.toggle('hidden', !data.hasDiscussion);
    $('subProjectEmptyHint').classList.toggle('hidden', data.sections.length > 0);
    // Une seule discussion et une seule section de sondages par sous-projet :
    // les options se grisent dès qu'elles existent, plutôt que de laisser
    // cliquer pour un 409.
    $('addSectionDiscussionBtn').disabled = !!data.hasDiscussion;
    $('addSectionPollBtn').disabled = !!data.hasPolls;

    if (data.hasPolls) {
      ensureSubProjectPollsMount().reset();
      if (pendingPollFormOpen) {
        pendingPollFormOpen = false;
        $('subProjectPollsForm').classList.remove('hidden');
        // Le focus est posé au tour de boucle suivant : le socle finit de
        // (re)construire son formulaire de façon asynchrone après reset(), et
        // un focus posé trop tôt est perdu au moment où il redessine ses
        // champs. Trouvé par la suite Playwright (assertion 6.3).
        setTimeout(function () {
          var q = document.getElementById('subProjectPollsQuestion');
          if (q) q.focus();
        }, 60);
      }
    }

    if (pendingAddMenuOpen) {
      pendingAddMenuOpen = false;
      openAddSectionMenu();
    }

    if (data.hasDiscussion) {
      subProjectThread.reset();
      subProjectThread.startPolling();
    } else {
      subProjectThread.stopPolling();
    }
  }

  // ----- En-tête commun à toute section (titre + retrait) -----
  function buildSectionHeader(sec, defaultTitle) {
    var head = document.createElement('div');
    head.className = 'sectionTitleRow subProjectSectionHead';

    var title = document.createElement('p');
    title.className = 'sectionTitle';
    title.textContent = sec.title || defaultTitle;
    head.appendChild(title);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'menuBtn';
    del.textContent = '✕';
    del.title = t('Retirer cette section');
    del.addEventListener('click', function () {
      if (!confirm(t('Retirer cette section ?'))) return;
      api('DELETE', '/api/sub-project-sections/' + sec.id + '?userId=' + profile.id)
        .then(function () { loadSubProjectDetail(); loadSubProjects(); })
        .catch(function (err) { alert(err.message); });
    });
    head.appendChild(del);
    return head;
  }

  // ----- Section "tâches" -----
  function buildTasksSection(sec) {
    var wrap = document.createElement('div');
    wrap.className = 'subProjectSection subProjectTasksSection';
    wrap.dataset.sectionId = sec.id;
    wrap.appendChild(buildSectionHeader(sec, t('Tâches')));

    if (sec.total) {
      var track = document.createElement('div');
      track.className = 'subProjectProgressTrack';
      var fill = document.createElement('div');
      fill.className = 'subProjectProgressFill';
      fill.style.width = sec.percent + '%';
      track.appendChild(fill);
      wrap.appendChild(track);
    }

    var list = document.createElement('div');
    list.className = 'subProjectItems';
    sec.items.forEach(function (item) { list.appendChild(buildTaskRow(item)); });
    wrap.appendChild(list);

    if (!sec.items.length) {
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = t('Aucune tâche — ajoute la première ci-dessous.');
      wrap.appendChild(hint);
    }

    var add = document.createElement('div');
    add.className = 'subProjectItemAdd';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 300;
    input.placeholder = t('Ajouter une tâche...');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconBtn';
    btn.textContent = t('Ajouter');
    var msg = document.createElement('p');
    msg.className = 'msg';

    function submit() {
      var label = input.value.trim();
      if (!label) { msg.textContent = t('Écris une tâche avant d\'ajouter.'); return; }
      msg.textContent = '';
      btn.disabled = true;
      api('POST', '/api/sub-project-sections/' + sec.id + '/items', { userId: profile.id, label: label })
        .then(function () { input.value = ''; loadSubProjectDetail(); loadSubProjects(); })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    add.appendChild(input);
    add.appendChild(btn);
    wrap.appendChild(add);
    wrap.appendChild(msg);
    return wrap;
  }

  function buildTaskRow(item) {
    var row = document.createElement('div');
    row.className = 'subProjectItem' + (item.done ? ' done' : '');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = item.done;
    cb.addEventListener('change', function () {
      cb.disabled = true;
      api('PUT', '/api/sub-project-items/' + item.id, { userId: profile.id, done: cb.checked })
        .then(function () {
          // Une case cochée change l'avancement du sous-projet ET celui de
          // l'activité : on recharge les deux plutôt que de recalculer un
          // pourcentage côté client — le serveur reste la seule source de
          // vérité de l'avancement.
          loadSubProjectDetail();
          loadSubProjects();
        })
        .catch(function (err) { cb.checked = !cb.checked; alert(err.message); })
        .then(function () { cb.disabled = false; });
    });
    row.appendChild(cb);

    var label = document.createElement('span');
    label.className = 'subProjectItemLabel';
    label.textContent = item.label;
    row.appendChild(label);

    // Sur une activité partagée, savoir QUI a coché évite le « c'est moi qui
    // l'ai fait ». Rien n'est affiché quand c'est soi-même.
    if (item.done && item.doneByName && profile && item.doneBy !== profile.id) {
      var who = document.createElement('span');
      who.className = 'meta subProjectItemWho';
      who.textContent = item.doneByName;
      row.appendChild(who);
    }

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'discussionMsgDelete';
    del.textContent = '✕';
    del.title = t('Supprimer cette tâche');
    del.addEventListener('click', function () {
      if (!confirm(t('Supprimer cette tâche ?'))) return;
      api('DELETE', '/api/sub-project-items/' + item.id + '?userId=' + profile.id)
        .then(function () { loadSubProjectDetail(); loadSubProjects(); })
        .catch(function (err) { alert(err.message); });
    });
    row.appendChild(del);
    return row;
  }

  // ----- Sondages : montés depuis le SOCLE COMMUN, pas réimplémentés -----
  // ⚠️ La discussion "Sondages" (11ᵉ discussion) a écrit un socle réutilisable
  // le 3 septembre 2026 : buildPollCard / mountPolls plus bas dans ce fichier,
  // tables polls/poll_options/poll_votes, routes /api/polls, et un scope
  // 'subproject' déjà prévu POUR ce volet (sa garde d'accès, enregistrée dans
  // server/routes/polls.js, appelle checkSubProjectAccess de
  // server/lib/subprojects.js). Une première version de ce chantier avait
  // commencé à écrire ses propres sondages ; ils ont été retirés en découvrant
  // ce socle — deux implémentations parallèles du même mécanisme, c'est
  // exactement ce que le cadrage voulait éviter.
  //
  // ⚠️ MONTAGE PARESSEUX, et ce n'est pas une coquetterie : mountPolls pousse
  // son instance dans `pollsMounts`, déclaré (var) BIEN PLUS BAS dans ce
  // fichier. Monter ici au chargement du script le trouverait encore
  // `undefined` — la fonction est hoistée, la donnée ne l'est pas. Même piège
  // que buildCommunitySeekingFilters avec SEEKING_TAGS (voir la carte Profil
  // dans chantiers-en-cours.md). On monte donc à la première ouverture d'un
  // sous-projet, quand tout le fichier a été évalué.
  var subProjectPollsMount = null;

  function ensureSubProjectPollsMount() {
    if (subProjectPollsMount) return subProjectPollsMount;
    subProjectPollsMount = mountPolls({
      scope: 'subproject',
      scopeId: function () { return currentSubProjectId; },
      // Jeu d'ids calqué à l'identique sur celui de communityPollsMount
      // (discussion "Sondages") : même formulaire, mêmes options avancées.
      // Toute clé ajoutée là-bas doit l'être ici aussi.
      root: 'subProjectPollsBlock', addBtn: 'subProjectPollsAddBtn', form: 'subProjectPollsForm',
      question: 'subProjectPollsQuestion', optionsBox: 'subProjectPollsOptions',
      addOptionBtn: 'subProjectPollsAddOptionBtn', optionsBtn: 'subProjectPollsOptionsBtn',
      advanced: 'subProjectPollsAdvanced', multi: 'subProjectPollsMulti',
      anonymous: 'subProjectPollsAnonymous', privacyHint: 'subProjectPollsPrivacyHint',
      closesAt: 'subProjectPollsClosesAt', createBtn: 'subProjectPollsCreateBtn',
      msg: 'subProjectPollsMsg', list: 'subProjectPollsList', emptyHint: 'subProjectPollsEmptyHint',
    });
    return subProjectPollsMount;
  }

  // ----- Bouton "Ajouter" : les trois types de section -----

  function addSection(kind, extra) {
    if (!profile || !currentSubProjectId) return;
    var payload = { userId: profile.id, kind: kind };
    if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    return api('POST', '/api/sub-projects/' + currentSubProjectId + '/sections', payload)
      .then(function () {
        closeSubProjectPanels();
        loadSubProjectDetail();
        loadSubProjects();
      });
  }

  // ----- Création / édition / suppression d'un sous-projet -----

  function createSubProject() {
    if (!profile || !currentCommunityActivityId) return;
    var nameEl = $('newSubProjectName');
    var name = nameEl.value.trim();
    var msgEl = $('newSubProjectMsg');
    if (!name) { msgEl.textContent = t('Le nom du sous-projet est requis.'); return; }
    msgEl.textContent = '';
    $('newSubProjectSave').disabled = true;
    api('POST', '/api/activities/' + currentCommunityActivityId + '/sub-projects', {
      userId: profile.id, name: name, description: $('newSubProjectDescription').value.trim(),
    })
      .then(function () {
        nameEl.value = '';
        $('newSubProjectDescription').value = '';
        $('newSubProjectCard').classList.add('hidden');
        loadSubProjects();
      })
      .catch(function (err) { msgEl.textContent = err.message; })
      .then(function () { $('newSubProjectSave').disabled = false; });
  }

  function saveSubProjectEdits() {
    if (!profile || !currentSubProjectId) return;
    var msgEl = $('subProjectEditMsg');
    $('subProjectEditSave').disabled = true;
    api('PUT', '/api/sub-projects/' + currentSubProjectId, {
      userId: profile.id,
      name: $('subProjectEditName').value.trim(),
      description: $('subProjectEditDescription').value.trim(),
    })
      .then(function () {
        msgEl.textContent = '';
        $('subProjectRenamePanel').classList.add('hidden');
        loadSubProjectDetail();
        loadSubProjects();
      })
      .catch(function (err) { msgEl.textContent = err.message; })
      .then(function () { $('subProjectEditSave').disabled = false; });
  }

  function deleteSubProject() {
    if (!profile || !currentSubProjectId) return;
    // Double confirmation : la suppression emporte toutes les sections du
    // sous-projet, pour tous les membres — même prudence que la suppression
    // définitive d'une activité.
    if (!confirm(t('Supprimer ce sous-projet ?'))) return;
    if (!confirm(t('Tout son contenu sera supprimé pour tous les membres. Confirmer ?'))) return;
    api('DELETE', '/api/sub-projects/' + currentSubProjectId + '?userId=' + profile.id)
      .then(function () { selectSubProject(''); loadSubProjects(); })
      .catch(function (err) { $('subProjectEditMsg').textContent = err.message; });
  }

  // Fil de discussion du sous-projet ouvert — même factory que les zones
  // Discussion du Profil et de Communauté (mountMessageThread), montée ici en
  // MULTI-AUTEUR et sans pièces jointes, avec un rafraîchissement périodique
  // comme le fil d'une activité. listUrl() renvoie null quand aucun
  // sous-projet n'est ouvert : la factory ne charge alors rien.
  var subProjectThread = mountMessageThread({
    ids: {
      list: 'subProjectMessagesList', emptyHint: 'subProjectMessagesEmptyHint',
      input: 'subProjectMessageInput', sendBtn: 'subProjectMessageSendBtn',
      msg: 'subProjectMessageMsg',
    },
    attachments: false,
    multiAuthor: true,
    pollMs: 15000,
    listUrl: function () {
      if (!profile || !currentSubProjectId) return null;
      return '/api/sub-projects/' + currentSubProjectId + '/messages?userId=' + profile.id;
    },
    messagesOf: function (data) { return data.messages; },
    createUrl: function () { return '/api/sub-projects/' + currentSubProjectId + '/messages'; },
    createBody: function (body) { return { userId: profile.id, body: body }; },
    deleteUrl: function (m) { return '/api/sub-project-messages/' + m.id + '?userId=' + profile.id; },
  });

  $('addSubProjectBtn').addEventListener('click', function () {
    var card = $('newSubProjectCard');
    card.classList.toggle('hidden');
    if (!card.classList.contains('hidden')) $('newSubProjectName').focus();
  });
  $('newSubProjectSave').addEventListener('click', createSubProject);

  // Menu déroulant du bouton "Ajouter" de la ligne (il n'y a plus de bouton
  // dans le détail lui-même). Ouvrir le menu referme le panneau de renommage,
  // et réciproquement — un seul panneau à la fois.
  function openAddSectionMenu() {
    $('subProjectRenamePanel').classList.add('hidden');
    $('addSectionMsg').textContent = '';
    $('addSectionMenu').classList.remove('hidden');
  }

  function toggleAddSectionMenu() {
    if ($('addSectionMenu').classList.contains('hidden')) openAddSectionMenu();
    else $('addSectionMenu').classList.add('hidden');
  }

  // Un clic n'importe où ailleurs referme le menu — comportement attendu d'un
  // menu déroulant, et évite qu'il reste ouvert derrière une autre action.
  document.addEventListener('click', function (e) {
    var menu = document.getElementById('addSectionMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (menu.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.subProjectAddBtn')) return;
    menu.classList.add('hidden');
  });
  $('addSectionTasksBtn').addEventListener('click', function () {
    addSection('tasks').catch(function (err) { $('addSectionMsg').textContent = err.message; });
  });
  $('addSectionDiscussionBtn').addEventListener('click', function () {
    addSection('discussion').catch(function (err) { $('addSectionMsg').textContent = err.message; });
  });
  // "Des sondages" : on crée la section ET on ouvre immédiatement le composeur,
  // curseur dans la question (demande d'Emilien — « je tombe directement dans
  // la zone texte pour écrire ma question et mes réponses »). Sans ça, il
  // fallait un second clic sur le "+" du socle pour commencer à écrire.
  $('addSectionPollBtn').addEventListener('click', function () {
    pendingPollFormOpen = true;
    addSection('poll').catch(function (err) {
      pendingPollFormOpen = false;
      $('addSectionMsg').textContent = err.message;
    });
  });

  // ⚠️ Une section de sondages qu'on abandonne sans rien écrire ne doit PAS
  // rester en place, vide (demande d'Emilien : « si je n'[ajoute] pas le
  // sondage, celle-ci disparaît et ne reste pas vide dans le sous-projet »).
  // On la retire donc dès qu'on la quitte alors qu'elle ne contient aucun
  // sondage ET que son formulaire est refermé — jamais pendant la saisie.
  function removeEmptyPollSectionIfAbandoned(subProjectId) {
    if (!profile || !subProjectId) return;
    var data = subProjectDetailData;
    if (!data || String(data.subProject.id) !== String(subProjectId) || !data.hasPolls) return;
    var section = data.sections.filter(function (sec) { return sec.kind === 'poll'; })[0];
    if (!section) return;
    var form = document.getElementById('subProjectPollsForm');
    var writing = form && !form.classList.contains('hidden') &&
      (($('subProjectPollsQuestion') || {}).value || '').trim();
    if (writing) return;   // on est en train d'écrire : on ne touche à rien
    api('GET', '/api/polls?userId=' + profile.id + '&scope=subproject&scopeId=' + subProjectId)
      .then(function (res) {
        if (res.polls && res.polls.length) return;   // il y a des sondages : on garde
        return api('DELETE', '/api/sub-project-sections/' + section.id + '?userId=' + profile.id)
          .then(function () { loadSubProjects(); });
      })
      .catch(function () { /* section déjà retirée, ou hors ligne : sans conséquence */ });
  }
  // Le "+" du socle bascule son formulaire. S'il vient d'être REFERMÉ sans
  // qu'aucun sondage n'existe, la section n'a plus de raison d'être.
  $('subProjectPollsAddBtn').addEventListener('click', function () {
    var form = $('subProjectPollsForm');
    if (form && form.classList.contains('hidden')) {
      removeEmptyPollSectionIfAbandoned(currentSubProjectId);
    }
  });

  $('subProjectPollsRemoveBtn').addEventListener('click', function () {
    if (!subProjectDetailData) return;
    var section = subProjectDetailData.sections.filter(function (s) { return s.kind === 'poll'; })[0];
    if (!section) return;
    // Retirer la section ne supprime AUCUN sondage : ils appartiennent au
    // socle commun et reviennent intacts si on la remet.
    if (!confirm(t('Retirer les sondages de ce sous-projet ?'))) return;
    api('DELETE', '/api/sub-project-sections/' + section.id + '?userId=' + profile.id)
      .then(function () { loadSubProjectDetail(); loadSubProjects(); })
      .catch(function (err) { alert(err.message); });
  });

  $('subProjectDiscussionRemoveBtn').addEventListener('click', function () {
    if (!subProjectDetailData) return;
    var section = subProjectDetailData.sections.filter(function (s) { return s.kind === 'discussion'; })[0];
    if (!section) return;
    // Les messages ne sont PAS supprimés avec la section : retirer la
    // discussion masque le fil, il revient intact si on la rajoute.
    if (!confirm(t('Retirer la discussion de ce sous-projet ?'))) return;
    api('DELETE', '/api/sub-project-sections/' + section.id + '?userId=' + profile.id)
      .then(function () { loadSubProjectDetail(); loadSubProjects(); })
      .catch(function (err) { alert(err.message); });
  });

  // Renommer : ancienne action du menu "⋮", passée au bas du menu déroulant.
  $('subProjectRenameBtn').addEventListener('click', function () {
    $('addSectionMenu').classList.add('hidden');
    $('subProjectRenamePanel').classList.remove('hidden');
    $('subProjectEditName').focus();
  });
  $('subProjectEditSave').addEventListener('click', saveSubProjectEdits);
  $('subProjectDeleteBtn').addEventListener('click', deleteSubProject);

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
      // ⚠️ Testé sur #tab-activity, PAS sur #tab-community : ce fil vit dans
      // l'onglet Activité depuis son déménagement du 30 août 2026. Le test
      // portait encore sur #tab-community jusqu'au 3 septembre 2026 — comme
      // cet onglet-là est forcément masqué quand on regarde une activité, la
      // condition était vraie dès le premier tick et le minuteur se tuait
      // aussitôt : le fil ne se rafraîchissait plus tout seul, et
      // refreshUnreadBadges() (son unique appelant) ne s'exécutait jamais.
      // ⚠️ 3 septembre 2026 (Activité — général), deuxième correction de cette
      // même garde en deux jours : elle testait #tab-community jusqu'au 3
      // septembre au matin (le fil avait déménagé dans #tab-activity le 30
      // août sans que la garde suive), puis #tab-activity. Le fil vit
      // maintenant dans #activityPage, une page qui se superpose aux onglets :
      // c'est SA visibilité, et elle seule, qui dit si le fil est regardé.
      // Application directe de la directive transverse née du premier bug.
      if (!currentCommunityActivityId || $('activityPage').classList.contains('hidden')) {
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
      // Repère utilisé par le renvoi depuis une notification, pour retrouver
      // et mettre en évidence LE message concerné (voir focusFromNotification).
      msg.dataset.messageId = m.id;
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
  // Un menu "⋮" par section, câblés par le helper générique de l'onglet
  // Statistiques (setupStatsPeriodMenu) — réutilisé tel quel, pas une ligne
  // modifiée, exactement comme la page de visite d'un profil le fait déjà.
  setupStatsPeriodMenu($('caPiePeriodBtn'), $('caPiePeriodMenu'), function (p) {
    currentActivityPiePeriod = p;
    if (currentCommunityActivityId) loadActivityStats(currentCommunityActivityId);
  });
  setupStatsPeriodMenu($('caChartPeriodBtn'), $('caChartPeriodMenu'), function (p) {
    currentActivityChartPeriod = p;
    if (currentCommunityActivityId) loadActivityStats(currentCommunityActivityId);
  });

  // Remet les deux menus sur leur période courante. Nécessaire à chaque
  // nouvelle sélection d'activité : les menus gardent sinon la coche de
  // l'activité précédente, alors que les variables, elles, sont réinitialisées.
  function syncActivityPeriodMenus() {
    syncPeriodMenuActive($('caPiePeriodMenu'), currentActivityPiePeriod);
    syncPeriodMenuActive($('caChartPeriodMenu'), currentActivityChartPeriod);
  }

  // ⚠️ UN SEUL appel serveur pour les deux sections, avec DEUX périodes.
  // La route renvoie `breakdown` (camembert, période demandée) et
  // `dailyBreakdown` (graphique, sa propre période). Changer la période de
  // l'une redessine aussi l'autre à l'identique — un aller-retour réseau de
  // moins qu'avec deux appels, pour un rendu client négligeable.
  function loadActivityStats(activityId) {
    if (!profile || !activityId) return;
    var url = '/api/community/activity-stats?userId=' + profile.id +
      '&activityId=' + activityId +
      '&period=' + currentActivityPiePeriod +
      '&chartPeriod=' + currentActivityChartPeriod;
    api('GET', url).then(function (data) {
      if (String(activityId) !== String(currentCommunityActivityId)) return; // sélection changée entre-temps
      var block = data.breakdown;
      // Le libellé de période ("Cette semaine", "Aujourd'hui"...) était porté
      // par .statsSummary, retirée à la demande d'Emilien. Il est repris ici,
      // en petit à côté du titre de chaque section : sans lui, plus rien
      // n'indiquerait au repos sur quelle période on regarde.
      $('caPiePeriodLabel').textContent = t(block.label);
      renderActivityPie(block.members, block.totalSeconds);

      $('caChartPeriodLabel').textContent = t(data.chartLabel || '');
      lastActivityDailyBreakdown = data.dailyBreakdown || [];
      renderActivityChart(lastActivityDailyBreakdown);
    }).catch(function () {
      // L'activité a pu être quittée/supprimée entre-temps par un autre
      // membre. Cette garde vivait dans l'appel à /community/activity-feed,
      // retiré avec le flux des notes : elle est reprise ici, sur le seul
      // appel qui reste à porter la même vérification d'accès.
      if (String(activityId) !== String(currentCommunityActivityId)) return;
      $('activityPage').classList.add('hidden');
      currentCommunityActivityId = '';
      stopDiscussionPolling();
      loadSettingsActivities();
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
    svg.style.height = height + 'px';

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

  // ----- Plein écran retiré le 3 septembre 2026 (Activité — général),
  // demande d'Emilien : « aligne-le. Plus de plein écran nulle part. »
  // Cette page était la dernière à en avoir un : la Feuille de temps de
  // l'onglet Statistiques a perdu le sien le 1er septembre 2026, le
  // Graphique le 2 septembre. Ont disparu ici : les boutons
  // #caTsFullscreenBtn / #caChartFullscreenBtn (index.html), les variables
  // activityTimesheetFullscreenActive / activityChartFullscreenActive, les
  // fonctions exitActivityTimesheetFullscreen() / exitActivityChartFullscreen()
  // et leur exclusion mutuelle (chacune appelait la sortie de l'autre pour ne
  // jamais laisser body.scrollLock verrouillé par l'un pendant que l'autre se
  // ferme), leurs points d'appel (switchTab, openProfile, loadActivityDetail,
  // rafraîchissement de la liste d'activités), et les règles
  // #communityActivityTimesheetBlock.fullscreen /
  // #communityActivityChartBlock.fullscreen de styles.css.
  // L'étirement de hauteur du SVG qui n'avait de sens qu'en plein écran a été
  // retiré aussi : renderActivityChart() pose désormais toujours une hauteur
  // inline fixe, exactement comme renderChart() côté Statistiques.
  // Les deux sections restent entièrement consultables en vue normale
  // (.timesheetScroll et .chartScroll défilent déjà horizontalement).
  // ⚠️ Règle générale posée par Emilien le même jour : les sections
  // statistiques de cette page s'alignent TOUJOURS sur les modifications
  // apportées par les discussions Statistiques (Feuille de temps /
  // Répartition / Graphique). Le code reste dupliqué — c'est un choix assumé,
  // voir le commentaire de la section "STATISTIQUES D'UNE ACTIVITÉ" — mais le
  // comportement, lui, ne doit plus diverger. -----

  // ⚠️ 3 septembre 2026 (Activité — général) : toute la Feuille de temps de
  // cette page a été retirée ici — demande d'Emilien, « je souhaite supprimer
  // la feuille de temps de la section statistiques des activités ».
  // Étaient concernés : les écouteurs #caTsPrevWeek/#caTsNextWeek,
  // loadActivityTimesheet(), renderActivityTimesheet() et la variable
  // currentActivityTimesheetOffset — tous strictement propres à ce bloc,
  // aucun autre appelant (vérifié sur l'ensemble des fichiers du projet).
  // ⚠️ Côté serveur, RIEN n'a été supprimé : la route
  // GET /api/community/activity-timesheet et activityTimesheetForUser
  // (server/lib/community.js) sont toujours là, simplement sans appelant.
  // Les retirer est une décision distincte, signalée à Emilien — ce projet a
  // déjà failli perdre server/lib/period.js sur une conclusion trop rapide.

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

  // ----- Découverte de membres (2 septembre 2026, demande d'Emilien) -----
  // Un seul chemin de chargement pour les trois cas — texte saisi, filtres
  // "Recherche" actifs, ou rien du tout : c'est le serveur qui décide quoi
  // renvoyer (voir GET /api/users/search, server/routes/follows.js). Sans
  // aucun critère, la liste n'est plus vide mais devient une sélection de
  // profils à découvrir, d'où le message d'accompagnement qui change.
  var communitySearchDebounce = null;
  var communitySeekingFilter = []; // clés de SEEKING_TAGS, modifiées en place par le sélecteur

  function loadCommunityDiscovery() {
    if (!profile) return;
    var q = $('communitySearchInput').value.trim();
    var url = '/api/users/search?userId=' + profile.id +
      '&q=' + encodeURIComponent(q) +
      '&seeking=' + encodeURIComponent(communitySeekingFilter.join(','));
    var isDiscovery = !q && communitySeekingFilter.length === 0;
    api('GET', url).then(function (list) {
      $('communityDiscoverHint').classList.toggle('hidden', !isDiscovery || list.length === 0);
      renderSearchResults(list);
    });
  }

  // ⚠️ Appelée depuis loadCommunity() (ouverture de l'onglet), JAMAIS au
  // chargement du script : renderSeekingPicker lit SEEKING_TAGS, déclaré
  // (var) bien plus bas dans ce fichier — donc encore `undefined` au moment
  // où ces lignes-ci s'exécutent. La fonction, elle, est bien hoistée ; c'est
  // la donnée qui ne l'est pas. Reconstruire le sélecteur à chaque ouverture
  // le remet aussi visuellement à zéro en même temps que le tableau de
  // filtres, sans avoir à gérer d'état d'affichage à part.
  function buildCommunitySeekingFilters() {
    renderSeekingPicker($('communitySeekingFilters'), communitySeekingFilter, function () {
      // Un filtre se déclenche immédiatement : pas de debounce ici, ce n'est
      // pas de la frappe (un clic = une intention nette, pas une saisie en
      // cours), contrairement au champ texte ci-dessous.
      clearTimeout(communitySearchDebounce);
      loadCommunityDiscovery();
    });
  }

  $('communitySearchInput').addEventListener('input', function () {
    clearTimeout(communitySearchDebounce);
    communitySearchDebounce = setTimeout(loadCommunityDiscovery, 250);
  });

  // Petite pastille d'identité : la photo de profil si elle existe, sinon
  // l'initiale sur fond de la couleur du profil — même repli que
  // #avatarDisplayInitial sur son propre profil (voir renderIdentity plus
  // bas), en plus petit et sans aucune interaction. Utilisée par les lignes
  // de découverte de Communauté et par l'en-tête de la page de visite.
  function buildSmallAvatar(avatar, name, color) {
    var el = document.createElement('span');
    el.className = 'smallAvatar';
    if (avatar) {
      var img = document.createElement('img');
      img.src = avatar;
      img.alt = '';
      el.appendChild(img);
      el.style.background = 'transparent';
    } else {
      el.textContent = name ? name.trim().charAt(0).toUpperCase() : '?';
      el.style.background = color || 'var(--purple)';
    }
    return el;
  }

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

      // ⚠️ 2 septembre 2026 : la ligne ne portait qu'une pastille de couleur
      // et un nom. Elle porte désormais la photo de profil, le nombre de
      // projets et les badges "Recherche" — c'est ce qui fait la différence
      // entre une liste de pseudos et une vraie liste de découverte : on
      // peut décider d'ouvrir un profil sans l'avoir ouvert.
      var label = document.createElement('div');
      label.className = 'discoverRow';
      label.appendChild(buildSmallAvatar(u.avatar, u.name, u.color));

      var textWrap = document.createElement('div');
      textWrap.className = 'discoverRowText';
      var nameEl = document.createElement('span');
      nameEl.className = 'discoverRowName';
      nameEl.textContent = u.name;
      textWrap.appendChild(nameEl);

      var subLine = document.createElement('span');
      subLine.className = 'meta';
      subLine.textContent = u.projectsCount > 0
        ? t('{n} projet(s)', { n: u.projectsCount })
        : t('Aucun projet');
      textWrap.appendChild(subLine);
      label.appendChild(textWrap);

      var badges = buildSeekingBadges(u.seeking, false);
      if (badges) label.appendChild(badges);

      // Clic sur la ligne d'identité (pas sur les boutons Suivre/Se
      // désabonner ci-dessous, des éléments distincts) : ouvre la page de
      // visite de son profil — voir openProfileViewModal, section "PAGE DE
      // VISITE DE PROFIL" plus bas. ⚠️ 2 septembre 2026 : plus conditionné au
      // suivi accepté. L'aperçu (identité, projets, statistiques) étant
      // désormais public pour tout membre identifié (voir canViewProjects,
      // server/routes/profile.js), le clic mène toujours à quelque chose —
      // c'est même le geste central de la découverte : regarder un profil
      // AVANT de décider de le suivre.
      label.style.cursor = 'pointer';
      label.addEventListener('click', function () { openProfileViewModal(u.id, u.name, u.color); });
      row.appendChild(label);

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';

      if (u.followStatus === 'accepted') {
        actionsWrap.appendChild(buildUnfollowButton(u.followId, u.name, function () {
          u.followStatus = 'none'; u.followId = null;
          renderSearchResults(list);
          loadFollowingFeed();
        }));
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

  // Construit le bouton "Se désabonner" (icône rouge, confirmation,
  // DELETE /api/follows/:id) — partagé depuis le 1er septembre 2026 entre la
  // recherche de Communauté (renderSearchResults, ci-dessus) et la liste
  // "Abonnements" de Profil (renderNameOnlyList, mode actionable,
  // ci-dessous), qui avaient chacune leur propre copie identique de ce même
  // mécanisme jusque-là — voir noesis-timetracker-audit-doublons-code-mort.md
  // (point B5) et noesis-timetracker-journal-communaute.md. `onDone` reçoit
  // le contrôle après la suppression réussie : chaque appelant rafraîchit
  // sa propre liste à sa façon (recherche : met à jour l'entrée en place ;
  // Abonnements : recharge tout depuis le serveur).
  function buildUnfollowButton(followId, name, onDone) {
    var btn = document.createElement('button');
    btn.className = 'iconBtn danger';
    btn.textContent = t('Se désabonner');
    btn.addEventListener('click', function () {
      if (!confirm(t('Te désabonner de {name} ?', { name: name }))) return;
      api('DELETE', '/api/follows/' + followId + '?userId=' + profile.id)
        .then(onDone)
        .catch(function (err) { alert(err.message); });
    });
    return btn;
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
      // Clic sur le nom : ouvre la page de visite de son profil (voir
      // openProfileViewModal, section "PAGE DE VISITE DE PROFIL" plus haut).
      // ⚠️ 2 septembre 2026 : proposé désormais sur LES DEUX listes. Il ne
      // l'était que sur "Abonnements" (actionable=true) parce qu'il fallait
      // suivre quelqu'un pour voir quoi que ce soit de son profil — un clic
      // sur un "Abonné" n'aurait mené qu'à un 403. L'aperçu (identité,
      // projets, statistiques) étant maintenant public pour tout membre
      // identifié (voir canViewProjects, server/routes/profile.js), ouvrir
      // le profil de quelqu'un qui nous suit sans qu'on le suive en retour
      // est même le cas le plus utile : c'est là qu'on décide de le suivre.
      label.style.cursor = 'pointer';
      label.addEventListener('click', function () { openProfileViewModal(f.userId, f.name, f.color); });
      row.appendChild(label);

      if (actionable) {
        var actionsWrap = document.createElement('div');
        actionsWrap.className = 'rowActions';
        actionsWrap.appendChild(buildUnfollowButton(f.followId, f.name, function () {
          loadFollowConnections(); loadFollowingFeed();
        }));
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

  // Carte d'un message "Communauté" (profile_posts) de quelqu'un qu'on suit,
  // dans le flux "Suivi" — 1er septembre 2026, demande d'Emilien : « les
  // messages se publient sur son profil, à la fois et dans les fils de la
  // communauté pour les gens qui le suivent ». Même structure visuelle que
  // buildProfilePostCard (mountProfilePostsComposer, plus bas) SAUF : pas de
  // bouton de suppression (pas son message), pièces jointes en lecture
  // seule (buildAttachmentRowReadOnly), et le nom de l'auteur est affiché
  // (buildProfilePostCard ne montre jamais que "toi").
  function buildFollowingPostCard(entry) {
    // Mes propres publications défilent désormais dans ce flux, mêlées à celles
    // des membres que je suis (3 septembre 2026, demande d'Emilien) — voir
    // followingFeedForUser, server/lib/community.js. Elles prennent le violet
    // plein pour se repérer d'un coup d'œil sans casser l'ordre chronologique.
    var isMine = !!(profile && entry.userId === profile.id);

    var card = document.createElement('div');
    card.className = 'discussionMsg' + (isMine ? ' feedMine' : '');
    // Même repère que dans le fil d'une activité : sert au renvoi précis
    // depuis une notification (voir focusFromNotification).
    card.dataset.postId = entry.id;

    var when = new Date(entry.createdAt);
    var dateLabel = when.toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
    var timeLabel = pad(when.getHours()) + ':' + pad(when.getMinutes());

    var top = document.createElement('div');
    top.className = 'discussionMsgTop';

    // Clic sur le nom de l'auteur : ouvre sa page de visite de profil
    // (#viewProfileModal / openProfileViewModal, déjà utilisée par
    // renderSearchResults et renderNameOnlyList) — demande d'Emilien du
    // 2 septembre 2026 : « avoir accès directement à leur profil ».
    // Toujours activable ici, contrairement à renderSearchResults (qui doit
    // distinguer Suivre/Demande envoyée/Se désabonner) : une entrée de ce
    // flux ne peut provenir que d'un abonnement accepté avec profil partagé
    // (voir followingFeedForUser, server/lib/community.js), condition qui
    // suffit déjà à canViewProjects côté serveur (server/routes/profile.js).
    var authorSpan = document.createElement('span');
    authorSpan.className = 'discussionMsgAuthor';
    authorSpan.innerHTML = '<span class="dot" style="background:' + entry.userColor + '"></span> ' +
      escapeHtml(entry.userName) + (isMine ? t(' (toi)') : '');
    // Ouvrir sa PROPRE page de visite de profil depuis son propre message
    // n'aurait aucun sens : le clic n'est proposé que sur les autres.
    if (!isMine) {
      authorSpan.style.cursor = 'pointer';
      authorSpan.addEventListener('click', function () { openProfileViewModal(entry.userId, entry.userName, entry.userColor); });
    }
    top.appendChild(authorSpan);

    var metaSpan = document.createElement('span');
    metaSpan.className = 'meta';
    metaSpan.textContent = dateLabel + ' · ' + timeLabel;
    top.appendChild(metaSpan);

    // La liste séparée de mes messages ayant disparu de cet onglet, c'est ici
    // que je dois pouvoir supprimer les miens — sinon la suppression depuis
    // Communauté disparaîtrait avec elle. Même règle que partout : chacun ne
    // supprime que ses propres traces.
    if (isMine) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'discussionMsgDelete';
      del.textContent = '✕';
      del.title = t('Supprimer ce message');
      del.addEventListener('click', function () {
        if (!confirm(t('Supprimer ce message ?'))) return;
        api('DELETE', '/api/profile/posts/' + entry.id + '?userId=' + profile.id)
          .then(function () { refreshAllProfilePostsComposers(); loadFollowingFeed(); })
          .catch(function (err) { alert(err.message); });
      });
      top.appendChild(del);
    }

    card.appendChild(top);

    var body = document.createElement('div');
    body.className = 'discussionMsgBody';
    body.textContent = entry.body;
    card.appendChild(body);

    if (entry.attachments && entry.attachments.length) {
      var attachBox = document.createElement('div');
      attachBox.className = 'attachmentList';
      entry.attachments.forEach(function (att) { attachBox.appendChild(buildAttachmentRowReadOnly(att)); });
      card.appendChild(attachBox);
    }

    return card;
  }

  // 2 septembre 2026 : le flux ne reçoit plus que des messages "Communauté"
  // (profile_posts) depuis le retrait de l'ancienne branche de sessions
  // notées côté serveur (voir followingFeedForUser, server/lib/community.js)
  // — chaque entrée est donc toujours affichée via buildFollowingPostCard.
  //
  // ⚠️ 3 septembre 2026 (discussion "Sondages", débordement signalé) : le flux
  // mêle désormais deux sources, triées ensemble par date décroissante — les
  // messages (inchangés, /community/following-feed) et les SONDAGES des mêmes
  // personnes (/polls/following). C'est la conséquence directe du cadrage
  // d'Emilien : un sondage « est un post qui défile », il n'a donc pas de
  // bloc à lui dans cet onglet, il se lit au milieu des messages.
  //
  // Deux précautions volontaires :
  //   - AUCUNE ligne de server/lib/community.js n'a été touchée. La fusion se
  //     fait ici, côté client, à partir de deux réponses. Le jour où
  //     Communauté voudra une seule réponse serveur, pollsForFollowing()
  //     (server/lib/polls.js) est déjà écrite pour être appelée depuis
  //     followingFeedForUser.
  //   - Le .catch sur l'appel des sondages renvoie une liste vide : une panne
  //     du socle des sondages ne doit pas faire disparaître les messages, qui
  //     eux marchaient très bien avant.
  function loadFollowingFeed() {
    if (!profile) return;
    Promise.all([
      api('GET', '/api/community/following-feed?userId=' + profile.id),
      api('GET', '/api/polls/following?userId=' + profile.id).catch(function () { return []; }),
    ]).then(function (results) {
      var posts = results[0] || [];
      var followedPolls = results[1] || [];
      var merged = posts.map(function (e) { return { at: e.createdAt, kind: 'post', data: e }; })
        .concat(followedPolls.map(function (p) { return { at: p.createdAt, kind: 'poll', data: p }; }));
      // Les deux sources sont déjà triées chacune de son côté ; le tri
      // commun se fait sur la chaîne ISO, comparable telle quelle.
      merged.sort(function (a, b) { return a.at < b.at ? 1 : (a.at > b.at ? -1 : 0); });

      var box = $('followingFeed');
      box.innerHTML = '';
      $('followingFeedEmptyHint').classList.toggle('hidden', merged.length > 0);
      merged.forEach(function (item) {
        box.appendChild(item.kind === 'poll'
          ? buildPollCard(item.data, loadFollowingFeed)
          : buildFollowingPostCard(item.data));
      });
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
  // Cale une section en haut de la zone défilante du panneau. Le panneau est
  // en position: absolute : il est donc lui-même le parent de référence des
  // offsetTop de ses sections, pas besoin de calculer des rectangles.
  // On LIT scroll-padding-top sur l'élément au lieu de le figer ici : le
  // navigateur accroche sur (offsetTop - scroll-padding-top), et si notre
  // calcul s'en écartait, l'accrochage re-décalerait la section juste après
  // notre propre défilement.
  function scrollSettingsSectionIntoView(section) {
    var panel = $('profileSettingsPanel');
    if (!panel || !section) return;
    var pad = parseFloat(getComputedStyle(panel).scrollPaddingTop) || 0;
    var top = Math.max(0, section.offsetTop - pad);
    try {
      panel.scrollTo({ top: top, behavior: 'smooth' });
    } catch (e) {
      // Navigateur sans scrollTo({}) : on saute directement, sans animation.
      panel.scrollTop = top;
    }
  }

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
      // La section qu'on vient d'ouvrir se cale en haut du panneau : son
      // contenu est donc visible en entier d'un coup, sans que le bas soit
      // coupé par le bord du panneau (demande d'Emilien, 2 septembre 2026).
      // Fait après le retrait de .hidden, pour que la hauteur prise en
      // compte soit la hauteur DÉPLIÉE.
      scrollSettingsSectionIntoView(section);
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
    closeFollowsPanel();
    closeAllSettingsSections();
    $('profileSettingsPanel').scrollTop = 0;
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
  // Le bouton "⚙️" a vécu dans .topbar du 31 août au 2 septembre 2026
  // (demande d'Emilien), accessible depuis n'importe quel onglet — puis
  // Emilien a précisé, le 2 septembre (deuxième passage), qu'il voulait ces
  // icônes sur la page Profil elle-même (voir index.html, .identityHeader) :
  // il n'est donc plus nécessaire d'ouvrir explicitement #tab-profile avant
  // de basculer sur la vue Réglages, le bouton n'étant de toute façon visible
  // que lorsque Profil est déjà affiché.
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

  // ----- Renvoi à l'endroit EXACT de la notification -----
  // 2 septembre 2026, demande d'Emilien : « lorsqu'une notification apparaît
  // sur le téléphone et que l'utilisateur clique dessus, cela renvoie
  // exactement à l'endroit précis de la notification ».
  //
  // L'adresse portée par la notification décrit sa cible (voir la section
  // "Adresses de renvoi" dans server/lib/push.js) :
  //   ?notif=activity&activityId=..&messageId=..  le message d'un fil d'activité
  //   ?notif=post&postId=..                       une publication du flux Suivi
  //   ?notif=invite / ?notif=follow               les panneaux du Profil
  // Les deux anciennes formes (community/profile) restent acceptées : un
  // téléphone dont l'app n'a pas encore été rechargée continue d'envoyer
  // celles-là, et elles doivent rester utilisables.
  //
  // Deux chemins d'arrivée, même fonction : l'app était fermée (elle s'ouvre
  // sur l'adresse, voir showApp) ou déjà ouverte (le service worker nous
  // transmet l'adresse par message, voir notificationclick dans sw.js).

  // Le contenu visé n'est presque jamais dans le DOM au moment du clic : il
  // faut d'abord que l'onglet charge ses données depuis le serveur. On attend
  // donc que l'élément apparaisse, sans bloquer, et on abandonne au bout de
  // ~4 s (contenu supprimé entre-temps, ou trop ancien pour être encore dans
  // la liste chargée) — dans ce cas on est simplement au bon endroit, sans
  // surbrillance, ce qui reste correct.
  // Attend qu'un élément apparaisse dans le DOM (le contenu visé arrive du
  // serveur, il n'est jamais là au moment du clic sur la notification), puis
  // appelle `done`. Abandonne silencieusement au bout de ~4 s.
  function whenElementReady(selector, done, tries) {
    tries = tries === undefined ? 40 : tries;
    var el = document.querySelector(selector);
    if (el) { done(el); return; }
    if (tries <= 0) return;
    setTimeout(function () { whenElementReady(selector, done, tries - 1); }, 100);
  }

  function focusWhenReady(selector, tries) {
    whenElementReady(selector, function (el) { focusElement(el); }, tries);
  }

  function focusElement(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Halo violet bref : dans un fil de vingt messages, sans ça on ne sait pas
    // lequel a déclenché la notification. Retiré tout seul — c'est un repère,
    // pas un état.
    el.classList.add('notifHighlight');
    setTimeout(function () { el.classList.remove('notifHighlight'); }, 2400);
  }

  // Ouvre le panneau flottant des invitations/demandes de suivi du Profil,
  // exactement comme le clic sur son icône (mêmes exclusions mutuelles).
  function openNotifPanelForNotification() {
    openProfile();
    closeSettingsPanel();
    closeFollowsPanel();
    $('profileNotifPanel').classList.remove('hidden');
    $('profileNotifBtn').classList.add('active');
  }

  function openTabFromNotification(url) {
    var params = null;
    try {
      params = new URL(url, location.origin).searchParams;
    } catch (err) {
      return;
    }
    var target = params.get('notif');
    if (!target) return;

    // L'adresse est nettoyée tout de suite : un rechargement ultérieur ne doit
    // pas rejouer la même bascule.
    if (location.search.indexOf('notif=') !== -1) {
      history.replaceState(null, '', location.pathname);
    }

    if (target === 'activity') {
      var activityId = params.get('activityId');
      var messageId = params.get('messageId');
      switchTab('activity');
      if (activityId) {
        // Le détail d'une activité n'est plus déplié sous sa ligne : c'est
        // désormais une page superposée (#activityPage), ouverte par
        // openActivityPage(). Plutôt que de reconstruire ses arguments — dont
        // sharedInfo, que seule la liste connaît —, on attend que la ligne
        // concernée soit rendue et on déclenche le même clic que la personne
        // aurait fait. Le jour où le mécanisme d'ouverture changera encore, ce
        // renvoi suivra tout seul.
        whenElementReady('#activitiesList .activityRow[data-activity-id="' + activityId + '"] .activityRowHeader', function (header) {
          header.click();
          // La page s'ouvre sur "Sous-projets" ou "Statistiques" selon
          // l'activité : la notification, elle, parle d'un message, donc on
          // bascule sur la section Discussion.
          setActivityPageSection('disc');
          if (messageId) {
            focusWhenReady('#communityDiscussionList [data-message-id="' + messageId + '"]');
          } else {
            focusWhenReady('#communityDiscussionBlock');
          }
        });
      }
      return;
    }

    if (target === 'post') {
      var postId = params.get('postId');
      switchTab('community');
      if (postId) focusWhenReady('#followingFeed [data-post-id="' + postId + '"]');
      return;
    }

    if (target === 'invite') {
      openNotifPanelForNotification();
      loadPendingInvites();
      focusWhenReady('#invitesList');
      return;
    }

    if (target === 'follow') {
      openNotifPanelForNotification();
      loadFollowRequests();
      focusWhenReady('#followRequestsList');
      return;
    }

    // Anciennes adresses, encore envoyées par les notifications déjà reçues
    // avant cette mise à jour.
    if (target === 'community') { switchTab('community'); return; }
    if (target === 'profile') { openProfile(); return; }
  }

  // "Abonnés & Abonnements" (1er septembre 2026, demande d'Emilien : «
  // déplacer la section abonnés et abonnements des réglages vers le bouton
  // abonnement dans le profil »). Vivait dans Réglages depuis le 30 août
  // 2026 (#profileSettingsPanel). Devenue une icône dédiée dans
  // .identityHeader le 2 septembre 2026 (demande d'Emilien : « créer un
  // icône simple pour abonnés et abonnements [...] à gauche de l'icône
  // invitation [...] qu'une fois sélectionné, il exclut invitation et
  // paramètres ») — même principe que .notifWrap/.settingsWrap : panneau
  // flottant ancré sous sa propre icône, exclusion mutuelle avec les deux
  // autres (voir closeFollowsPanel plus bas, et closeNotifPanel/
  // closeSettingsPanel qui l'appellent désormais aussi à leur ouverture).
  // loadFollowConnections() (inchangée, toujours scopée à l'appelant) n'est
  // appelée qu'à l'ouverture effective du panneau — pas à chaque ouverture
  // du Profil.
  $('profileFollowsBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var opening = $('profileFollowsPanel').classList.contains('hidden');
    if (opening) {
      closeSettingsPanel();
      closeNotifPanel();
      loadFollowConnections();
    }
    $('profileFollowsPanel').classList.toggle('hidden', !opening);
    $('profileFollowsBtn').classList.toggle('active', opening);
  });
  function closeFollowsPanel() {
    $('profileFollowsPanel').classList.add('hidden');
    $('profileFollowsBtn').classList.remove('active');
  }
  // Referme le panneau au clic n'importe où en dehors de lui (ou de son
  // icône) — même mécanisme que les panneaux Invitations et Réglages.
  document.addEventListener('click', function (e) {
    if ($('profileFollowsPanel').classList.contains('hidden')) return;
    if (e.target.closest('.followsWrap')) return;
    closeFollowsPanel();
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
    // Les panneaux flottants de la barre du haut s'excluent mutuellement :
    // ouvrir les invitations referme les Réglages et Abonnés & Abonnements,
    // et réciproquement (demande d'Emilien, 1er et 2 septembre 2026).
    if (opening) { closeSettingsPanel(); closeFollowsPanel(); }
    $('profileNotifPanel').classList.toggle('hidden', !opening);
    $('profileNotifBtn').classList.toggle('active', opening);
  });
  // Referme le panneau au clic n'importe où en dehors de lui (ou du bouton).
  document.addEventListener('click', function (e) {
    if ($('profileNotifPanel').classList.contains('hidden')) return;
    if (e.target.closest('.notifWrap')) return;
    closeNotifPanel();
  });

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

  // ===================== SECTION "PROJETS" (Profil) =====================
  // Voir le commentaire au-dessus de #projectsList/#newProjectCard dans
  // index.html, et profile_projects / SEEKING_TAGS dans server/db.js et
  // server/routes/profile.js. Gestion complète ici (ajout, modification,
  // suppression, réordonnancement manuel #projectMoveBtn) ; la même donnée
  // est consultée en lecture seule par les abonnés depuis #viewProfileModal
  // (voir openProfileViewModal, plus bas dans ce fichier).
  //
  // Copie cliente des tags fixes "Recherche" — clés IDENTIQUES à
  // SEEKING_TAGS côté serveur (server/routes/profile.js) ; libellés/
  // symboles/couleurs propres à l'affichage, sans équivalent côté serveur
  // (qui ne connaît que la clé). À étendre des DEUX côtés à la fois si
  // Emilien demande un jour une nouvelle catégorie de recherche.
  var SEEKING_TAGS = [
    { key: 'partners', label: 'Partenaires', symbol: '🤝', color: '#3498db' },
    { key: 'clients', label: 'Clients', symbol: '💼', color: '#F39C12' },
    { key: 'funding', label: 'Financement', symbol: '💰', color: '#4CAF50' },
  ];
  function seekingTagByKey(key) {
    for (var i = 0; i < SEEKING_TAGS.length; i++) { if (SEEKING_TAGS[i].key === key) return SEEKING_TAGS[i]; }
    return null;
  }

  // Catégories/secteurs fixes d'un projet (2 septembre 2026, chantier
  // "Simplification du formulaire de saisie Projets" — texte libre avant
  // cette date). Copie EXACTE de PROJECT_CATEGORIES côté serveur
  // (server/routes/profile.js), mêmes valeurs et même ordre : utilisées
  // telles quelles comme value/texte des <option> du <select>, pas de clé
  // technique séparée ici contrairement à SEEKING_TAGS (le serveur écarte
  // silencieusement toute valeur hors liste, voir sanitizeCategory()).
  var PROJECT_CATEGORIES = [
    'Commerce & e-commerce',
    'Mode & habillement',
    'Finance & investissement',
    'Technologie & logiciel',
    'Services professionnels & conseil',
    'Alimentation & restauration',
    'Santé & bien-être',
    'Éducation & formation',
    'Immobilier',
    'Marketing & création de contenu',
    'Artisanat & fabrication',
    'Autre',
  ];

  // Dropdown "maison" pour la catégorie/secteur d'un projet (remplace le
  // <select> natif utilisé jusqu'au 2 septembre 2026 — voir
  // fillProjectCategorySelect dans l'historique). Demande d'Emilien ce
  // jour-là (discussion Profil) : la liste déroulante doit s'ouvrir
  // TOUJOURS vers le bas, ne montrer que 5 options à la fois, et défiler
  // "de manière saccadée" sans jamais couper une option en deux — un
  // <select> natif ne permet de contrôler aucun de ces trois points (son
  // popup est entièrement géré par le navigateur), d'où ce composant
  // reconstruit en HTML/CSS/JS "maison" (aucune bibliothèque tierce, comme
  // partout ailleurs dans ce projet — voir la convention).
  //
  // Structure : un bouton déclencheur (affiche le libellé courant) suivi
  // dans le DOM par la liste d'options — donc TOUJOURS en dessous du
  // bouton, jamais en recouvrement absolu (même principe "en flux, pas en
  // overlay" que les autres panneaux pliables du projet, ex. palier 3 /
  // #newActivityCard). La liste a une hauteur maximale calée exactement sur
  // 5 lignes (voir .categoryDropdownOption/.categoryDropdownMenu dans
  // styles.css, hauteur de ligne fixe en px) et scroll-snap-type: y
  // mandatory + scroll-snap-align: start + scroll-snap-stop: always sur
  // chaque ligne, pour que le défilement s'arrête toujours pile sur une
  // frontière d'option, jamais au milieu.
  //
  // Expose volontairement une interface proche d'un <select> natif — une
  // propriété `.value` lisible ET modifiable (via Object.defineProperty) —
  // pour que le reste du code (lecture au moment d'enregistrer, reset du
  // formulaire d'ajout) continue à écrire `categorySelect.value` sans rien
  // changer d'autre. `selected` (chaîne) présélectionne l'option
  // correspondante si elle existe dans PROJECT_CATEGORIES, sinon l'option
  // vide reste active — même comportement de repli que sanitizeCategory()
  // côté serveur.
  function buildCategoryDropdown(selected) {
    var wrap = document.createElement('div');
    wrap.className = 'categoryDropdown';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'categoryDropdownTrigger';
    var label = document.createElement('span');
    label.className = 'categoryDropdownLabel';
    var arrow = document.createElement('span');
    arrow.className = 'categoryDropdownArrow';
    arrow.textContent = '▾';
    trigger.appendChild(label);
    trigger.appendChild(arrow);

    var menu = document.createElement('div');
    menu.className = 'categoryDropdownMenu hidden';

    var allValues = [''].concat(PROJECT_CATEGORIES);
    var optionEls = {};
    var currentValue = PROJECT_CATEGORIES.indexOf(selected) !== -1 ? selected : '';

    function optionLabel(val) {
      return val ? t(val) : t('Catégorie / secteur (optionnel)');
    }
    function renderLabel() {
      label.textContent = optionLabel(currentValue);
    }
    function setActive(val) {
      if (optionEls[currentValue]) optionEls[currentValue].classList.remove('active');
      currentValue = val;
      if (optionEls[currentValue]) optionEls[currentValue].classList.add('active');
      renderLabel();
    }

    function onDocClick(ev) { if (!wrap.contains(ev.target)) close(); }
    function close() {
      menu.classList.add('hidden');
      wrap.classList.remove('open');
      document.removeEventListener('click', onDocClick, true);
    }
    function open() {
      wrap.classList.add('open');
      menu.classList.remove('hidden');
      // Aligne le défilement sur l'option active à l'ouverture (sans
      // animation) plutôt que de toujours rouvrir en haut de liste.
      if (optionEls[currentValue]) optionEls[currentValue].scrollIntoView({ block: 'nearest' });
      document.addEventListener('click', onDocClick, true);
    }
    trigger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (menu.classList.contains('hidden')) open(); else close();
    });

    allValues.forEach(function (val) {
      var opt = document.createElement('div');
      opt.className = 'categoryDropdownOption';
      if (val === currentValue) opt.classList.add('active');
      opt.textContent = optionLabel(val);
      opt.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setActive(val);
        close();
      });
      optionEls[val] = opt;
      menu.appendChild(opt);
    });

    renderLabel();
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    Object.defineProperty(wrap, 'value', {
      get: function () { return currentValue; },
      set: function (val) { setActive(PROJECT_CATEGORIES.indexOf(val) !== -1 ? val : ''); },
    });

    return wrap;
  }

  // Troncature de la description en vue liste (150-200 caractères, choix
  // 180 comme point médian, + « … voir plus » si dépassement — demande
  // confirmée par Emilien, chantier "Simplification du formulaire de
  // saisie Projets"). Coupure sur un espace proche de la limite plutôt
  // qu'en plein milieu d'un mot, quand c'est possible. La vue détail
  // (panneau déplié au clic sur la ligne, voir plus bas) affiche toujours
  // `description` en entier, jamais cette version tronquée.
  var PROJECT_DESC_TRUNCATE_AT = 180;
  function truncateProjectDescription(description) {
    if (!description || description.length <= PROJECT_DESC_TRUNCATE_AT) return description || '';
    var cut = description.slice(0, PROJECT_DESC_TRUNCATE_AT);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > PROJECT_DESC_TRUNCATE_AT - 40) cut = cut.slice(0, lastSpace);
    return cut.trim() + '… ' + t('voir plus');
  }

  // Sélecteur multi-tags (formulaire d'ajout/modification d'un projet) : un
  // bouton par tag, actif/inactif au clic. `selected` (tableau de clés) est
  // modifié EN PLACE — l'appelant le relit tel quel au moment d'enregistrer,
  // pas de callback ni de valeur de retour (plus simple qu'un vrai
  // composant contrôlé, suffisant ici : jamais plus de trois tags, jamais
  // reconstruit pendant qu'on interagit avec lui).
  // `onChange` (optionnel, ajouté le 2 septembre 2026) : appelé après chaque
  // bascule de tag. Sans lui, le comportement est strictement celui d'avant
  // — le formulaire de projet relit simplement `selected` au moment
  // d'enregistrer. Avec lui, le même composant sert de barre de filtres à la
  // découverte de Communauté (#communitySeekingFilters), qui doit relancer
  // la recherche à chaque clic plutôt qu'attendre un bouton.
  function renderSeekingPicker(containerEl, selected, onChange) {
    containerEl.innerHTML = '';
    SEEKING_TAGS.forEach(function (tag) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seekingTagBtn';
      btn.textContent = tag.symbol + ' ' + t(tag.label);
      function refresh() {
        var active = selected.indexOf(tag.key) !== -1;
        btn.classList.toggle('active', active);
        btn.style.background = active ? tag.color : '';
        btn.style.color = active ? '#fff' : '';
      }
      btn.addEventListener('click', function () {
        var idx = selected.indexOf(tag.key);
        if (idx === -1) selected.push(tag.key); else selected.splice(idx, 1);
        refresh();
        if (onChange) onChange();
      });
      refresh();
      containerEl.appendChild(btn);
    });
  }

  // Badges "Recherche". `detailed=false` (liste compacte, chez soi comme
  // dans #viewProfileModal) : symboles seuls en pastilles colorées —
  // demande d'Emilien, « un symbole ou code couleur » — avec le libellé en
  // info-bulle (title) pour l'accessibilité. `detailed=true` (vue détail
  // dépliée) : symbole + libellé complet, « en toutes lettres ». Renvoie
  // null si `seeking` est vide : un projet sans recherche n'affiche AUCUN
  // badge, jamais de pastille neutre (confirmé avec Emilien).
  function buildSeekingBadges(seeking, detailed) {
    if (!seeking || seeking.length === 0) return null;
    var wrap = document.createElement('div');
    wrap.className = detailed ? 'seekingBadgesFullRow' : 'seekingBadges';
    seeking.forEach(function (key) {
      var tag = seekingTagByKey(key);
      if (!tag) return;
      var el = document.createElement('span');
      if (detailed) {
        el.className = 'seekingBadgeFull';
        el.style.background = tag.color;
        el.textContent = tag.symbol + ' ' + t(tag.label);
      } else {
        el.className = 'seekingBadgeDot';
        el.style.background = tag.color;
        el.title = t(tag.label);
        el.textContent = tag.symbol;
      }
      wrap.appendChild(el);
    });
    return wrap;
  }

  // Champs "étiquette : valeur" de la vue détail d'un projet (description
  // complète, lien externe, date de début, catégorie) — chacun omis s'il
  // est vide. Partagé entre le panneau d'édition (chez soi, ci-dessous) et
  // #viewProfileModal (lecture seule chez un abonnement, plus bas).
  function buildProjectDetailFields(p) {
    var frag = document.createDocumentFragment();
    if (p.description) {
      var d = document.createElement('p');
      d.className = 'projectDetailField';
      var dStrong = document.createElement('strong');
      dStrong.textContent = t('Description') + ' :';
      var dSpan = document.createElement('span');
      dSpan.style.whiteSpace = 'pre-wrap';
      dSpan.textContent = ' ' + p.description;
      d.appendChild(dStrong); d.appendChild(dSpan);
      frag.appendChild(d);
    }
    if (p.externalLink) {
      var l = document.createElement('p');
      l.className = 'projectDetailField';
      var lStrong = document.createElement('strong');
      lStrong.textContent = t('Lien') + ' :';
      var a = document.createElement('a');
      a.href = /^https?:\/\//i.test(p.externalLink) ? p.externalLink : ('https://' + p.externalLink);
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = p.externalLink;
      l.appendChild(lStrong); l.appendChild(document.createTextNode(' ')); l.appendChild(a);
      frag.appendChild(l);
    }
    if (p.startDate) {
      var s = document.createElement('p');
      s.className = 'projectDetailField';
      var sStrong = document.createElement('strong');
      sStrong.textContent = t('Début') + ' :';
      s.appendChild(sStrong); s.appendChild(document.createTextNode(' ' + p.startDate));
      frag.appendChild(s);
    }
    if (p.category) {
      var c = document.createElement('p');
      c.className = 'projectDetailField';
      var cStrong = document.createElement('strong');
      cStrong.textContent = t('Catégorie') + ' :';
      c.appendChild(cStrong); c.appendChild(document.createTextNode(' ' + t(p.category)));
      frag.appendChild(c);
    }
    return frag;
  }

  // Dernière liste de SES PROPRES projets chargée depuis le serveur —
  // utilisée par moveProject() pour recalculer l'ordre localement avant de
  // le renvoyer en entier (voir PUT /profile/projects/reorder).
  var currentProjects = [];

  function loadProfileProjects() {
    if (!profile) return;
    api('GET', '/api/profile/' + profile.id + '/projects?viewerId=' + profile.id).then(renderProjectsList);
  }

  // Réordonnancement manuel via ▲▼ (pas de glisser-déposer : plus fiable
  // sur mobile sans bibliothèque tierce, et l'app n'en utilise déjà aucune
  // ailleurs). Échange le projet à `index` avec son voisin, puis renvoie la
  // liste ENTIÈRE des ids dans le nouvel ordre — le serveur réécrit
  // position = index dans ce tableau (voir PUT /profile/projects/reorder).
  function moveProject(index, direction) {
    var target = index + direction;
    if (target < 0 || target >= currentProjects.length) return;
    var reordered = currentProjects.slice();
    var tmp = reordered[index]; reordered[index] = reordered[target]; reordered[target] = tmp;
    var orderedIds = reordered.map(function (p) { return p.id; });
    api('PUT', '/api/profile/projects/reorder', { userId: profile.id, orderedIds: orderedIds })
      .then(renderProjectsList)
      .catch(function (err) { alert(err.message); });
  }

  function renderProjectsList(list) {
    currentProjects = list;
    var box = $('projectsList');
    box.innerHTML = '';
    $('projectsEmptyHint').classList.toggle('hidden', list.length > 0);

    list.forEach(function (p, index) {
      var row = document.createElement('div');
      row.className = 'activityRow';

      var header = document.createElement('div');
      header.className = 'activityRowHeader clickable';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'activityRowName';
      nameSpan.textContent = p.name;
      header.appendChild(nameSpan);

      var badges = buildSeekingBadges(p.seeking, false);
      if (badges) header.appendChild(badges);

      var upBtn = document.createElement('button');
      upBtn.type = 'button'; upBtn.className = 'projectMoveBtn'; upBtn.textContent = '▲';
      upBtn.title = t('Monter'); upBtn.setAttribute('aria-label', t('Monter'));
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', function (e) { e.stopPropagation(); moveProject(index, -1); });
      header.appendChild(upBtn);

      var downBtn = document.createElement('button');
      downBtn.type = 'button'; downBtn.className = 'projectMoveBtn'; downBtn.textContent = '▼';
      downBtn.title = t('Descendre'); downBtn.setAttribute('aria-label', t('Descendre'));
      downBtn.disabled = index === list.length - 1;
      downBtn.addEventListener('click', function (e) { e.stopPropagation(); moveProject(index, 1); });
      header.appendChild(downBtn);

      row.appendChild(header);

      if (p.description) {
        var shortP = document.createElement('p');
        shortP.className = 'meta';
        shortP.textContent = truncateProjectDescription(p.description);
        row.appendChild(shortP);
      }

      var panel = document.createElement('div');
      panel.className = 'activitySettingsPanel hidden';

      // Palier 1 (toujours visible dans le panneau déplié) : nom + description.
      var nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.placeholder = t('Nom du projet'); nameInput.value = p.name;

      var descInput = document.createElement('textarea');
      descInput.rows = 3; descInput.placeholder = t('Description'); descInput.value = p.description || '';

      // Palier 2 (toujours visible) : Recherche.
      var seekingHint = document.createElement('p');
      seekingHint.className = 'hint'; seekingHint.textContent = t('Recherche (optionnel)');

      var seekingBox = document.createElement('div');
      seekingBox.className = 'seekingTagPicker';
      var selectedSeeking = (p.seeking || []).slice();
      renderSeekingPicker(seekingBox, selectedSeeking);

      // Catégorie/secteur : remontée au palier 2 (toujours visible, avant
      // le bouton "+ Ajouter des détails") le 2 septembre 2026, demande
      // d'Emilien (discussion Profil) — jusque-là dans le palier 3 replié
      // avec lien/date, voir buildCategoryDropdown plus haut pour le détail
      // du dropdown "maison" qui remplace le <select> natif.
      var categorySelect = buildCategoryDropdown(p.category || '');

      // Palier 3 (2 septembre 2026, chantier "Simplification du formulaire
      // de saisie Projets") : lien/date, replié par défaut derrière un
      // bouton "+ Ajouter des détails" — même pattern que #newActivityCard
      // (bouton qui bascule .hidden), repris ici pour le panneau d'édition
      // de CHAQUE projet existant (pas seulement le formulaire d'ajout).
      // Toujours replié à l'ouverture, même si des valeurs y sont déjà
      // saisies — cohérent avec "replié par défaut" du cadrage, et évite de
      // traiter différemment un projet selon qu'il a déjà des détails ou
      // non.
      var moreBtn = document.createElement('button');
      moreBtn.type = 'button'; moreBtn.className = 'iconBtn projectMoreDetailsBtn';
      moreBtn.textContent = '+ ' + t('Ajouter des détails');

      var moreDetails = document.createElement('div');
      moreDetails.className = 'activitySettingsPanel projectMoreDetails hidden';
      moreBtn.addEventListener('click', function () { moreDetails.classList.toggle('hidden'); });

      var linkInput = document.createElement('input');
      linkInput.type = 'text'; linkInput.placeholder = t('Lien externe (optionnel)'); linkInput.value = p.externalLink || '';

      var dateHint = document.createElement('p');
      dateHint.className = 'hint'; dateHint.textContent = t('Date de début (optionnel)');

      var dateInput = document.createElement('input');
      dateInput.type = 'date'; dateInput.value = p.startDate || '';

      moreDetails.appendChild(linkInput);
      moreDetails.appendChild(dateHint);
      moreDetails.appendChild(dateInput);

      var saveMsg = document.createElement('p');
      saveMsg.className = 'meta';

      var saveBtn = document.createElement('button');
      saveBtn.type = 'button'; saveBtn.className = 'iconBtn'; saveBtn.textContent = t('Enregistrer');
      saveBtn.addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name) { saveMsg.textContent = t('Le nom du projet est requis.'); return; }
        saveMsg.textContent = '';
        api('PUT', '/api/profile/projects/' + p.id, {
          userId: profile.id, name: name, description: descInput.value.trim(),
          seeking: selectedSeeking,
          externalLink: linkInput.value.trim(), startDate: dateInput.value, category: categorySelect.value,
        }).then(function () {
          loadProfileProjects();
        }).catch(function (err) { saveMsg.textContent = err.message; });
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button'; delBtn.className = 'iconBtn danger'; delBtn.textContent = t('Supprimer');
      delBtn.addEventListener('click', function () {
        if (!confirm(t('Supprimer ce projet ?'))) return;
        api('DELETE', '/api/profile/projects/' + p.id + '?userId=' + profile.id)
          .then(loadProfileProjects)
          .catch(function (err) { alert(err.message); });
      });

      var actionsWrap = document.createElement('div');
      actionsWrap.className = 'rowActions';
      actionsWrap.appendChild(saveBtn);
      actionsWrap.appendChild(delBtn);

      panel.appendChild(nameInput);
      panel.appendChild(descInput);
      panel.appendChild(seekingHint);
      panel.appendChild(seekingBox);
      panel.appendChild(categorySelect);
      panel.appendChild(moreBtn);
      panel.appendChild(moreDetails);
      panel.appendChild(saveMsg);
      panel.appendChild(actionsWrap);
      row.appendChild(panel);

      // Clic sur la ligne (hors ▲▼, qui isolent leur propre clic) :
      // ouvre/referme le panneau d'édition — même principe que le clic sur
      // une activité SOLO dans #tab-activity (renderActivitiesSettings).
      header.addEventListener('click', function () { panel.classList.toggle('hidden'); });

      box.appendChild(row);
    });
  }

  $('addProjectBtn').addEventListener('click', function () {
    $('newProjectCard').classList.toggle('hidden');
  });

  var newProjectSeeking = [];
  renderSeekingPicker($('newProjectSeeking'), newProjectSeeking);

  // Dropdown de catégorie construit une seule fois ici et monté à la place
  // de #newProjectCategoryMount (voir commentaire dans index.html), avec
  // l'id "newProjectCategory" repris sur le dropdown lui-même — tout le
  // reste du code (resetNewProjectForm, newProjectSave) continue donc à
  // écrire/lire $('newProjectCategory').value sans rien changer d'autre.
  var newProjectCategoryDropdown = buildCategoryDropdown('');
  newProjectCategoryDropdown.id = 'newProjectCategory';
  $('newProjectCategoryMount').replaceWith(newProjectCategoryDropdown);

  // Palier 3 du formulaire d'ajout : replié par défaut derrière "+ Ajouter
  // des détails" — même bouton/pattern que #newActivityCard (dixième
  // passage) et que le panneau d'édition de chaque projet existant
  // ci-dessus (moreBtn/moreDetails dans renderProjectsList).
  $('newProjectMoreBtn').addEventListener('click', function () {
    $('newProjectMoreDetails').classList.toggle('hidden');
  });

  // startDate pré-rempli à la date du jour (2 septembre 2026, chantier
  // "Simplification du formulaire de saisie Projets") : reste un champ
  // modifiable, ce n'est qu'une valeur de départ pratique — la plupart des
  // projets ajoutés démarrent le jour même de leur saisie. toDateValue
  // (voir plus haut dans ce fichier, récapitulatif du STOP) donne la date
  // LOCALE au format attendu par <input type=date>, jamais l'UTC.
  function resetNewProjectForm() {
    $('newProjectName').value = ''; $('newProjectDesc').value = '';
    $('newProjectLink').value = '';
    $('newProjectStartDate').value = toDateValue(new Date());
    $('newProjectCategory').value = '';
    newProjectSeeking.length = 0;
    renderSeekingPicker($('newProjectSeeking'), newProjectSeeking);
    $('newProjectMoreDetails').classList.add('hidden');
  }
  resetNewProjectForm();

  $('newProjectSave').addEventListener('click', function () {
    var name = $('newProjectName').value.trim();
    var msg = $('newProjectMsg');
    if (!name) { msg.textContent = t('Le nom du projet est requis.'); return; }
    msg.textContent = '';
    api('POST', '/api/profile/projects', {
      userId: profile.id, name: name, description: $('newProjectDesc').value.trim(),
      seeking: newProjectSeeking,
      externalLink: $('newProjectLink').value.trim(), startDate: $('newProjectStartDate').value,
      category: $('newProjectCategory').value,
    }).then(function () {
      resetNewProjectForm();
      $('newProjectCard').classList.add('hidden');
      loadProfileProjects();
    }).catch(function (err) { msg.textContent = err.message; });
  });

  // ===================== PAGE DE VISITE DE PROFIL (#viewProfileModal) =====
  // Voir le commentaire dans index.html, juste au-dessus de la modale.
  // Entièrement en LECTURE SEULE : aucun bouton d'édition, de suppression,
  // de réordonnancement ni de pièce jointe ici — visiter un profil ne
  // modifie jamais rien, ni chez le visiteur ni chez le visité.
  //
  // ⚠️ 2 septembre 2026 (demande d'Emilien) : ne montrait que les projets, et
  // seulement à un abonné accepté. Montre désormais, dans l'ordre qu'il a
  // fixé — identité, Projets, Statistiques (Répartition + Graphique
  // seulement), Messages. Les trois premières sections sont un APERÇU PUBLIC
  // (tout membre identifié), les messages restent réservés aux abonnés
  // acceptés : c'est le serveur qui tranche (canViewProjects/canViewPosts
  // dans server/routes/profile.js), ce panneau se contente d'afficher ce
  // qu'il a bien voulu renvoyer, et `canSeePosts` lui évite d'appeler la
  // route des messages juste pour se prendre un 403.
  //
  // Ouverte depuis renderNameOnlyList (Abonnés & Abonnements, ci-dessous) et
  // renderSearchResults (découverte de Communauté, plus haut) au clic sur la
  // ligne d'identité (jamais sur le bouton d'action de la ligne, un élément
  // distinct, donc jamais concerné par ce clic).
  var viewProfileUserId = null;        // profil actuellement visité (null = modale fermée)
  var viewProfilePiePeriod = 'week';   // période propre au camembert de CETTE page
  var viewProfileChartGranularity = 'day';
  // ⚠️ 2 septembre 2026, suite (demande d'Emilien : « je souhaite que la
  // partie message soit une option qui peut être sélectionnée au même niveau
  // que statistique. Je vois les statistiques par défaut ou je peux choisir
  // de regarder les messages de l'utilisateur ») : Statistiques et Messages
  // ne s'empilent plus, ce sont deux vues alternatives du même espace.
  var viewProfileSection = 'stats';    // 'stats' | 'messages' — 'stats' par défaut à chaque ouverture
  var viewProfileCanSeePosts = false;  // renseigné par GET /profile/:id/public (canSeePosts)
  var viewProfilePostsLoaded = false;  // les messages ne sont chargés qu'à la première sélection

  // Bascule entre les deux vues. Volontairement séparée de leur CHARGEMENT :
  // les statistiques sont chargées à l'ouverture du profil (c'est la vue par
  // défaut, elle doit être prête tout de suite), les messages seulement à la
  // première sélection de leur onglet — inutile d'aller les chercher tant
  // que personne ne les regarde, et ça évite un appel systématique qui se
  // serait de toute façon soldé par un refus pour un non-abonné.
  // ⚠️ 2 septembre 2026 (demande d'Emilien : « lorsque je passe de
  // statistiques à message, je souhaite que cela reste dans le même format,
  // qu'il n'y ait pas une diminution de la section, même s'il n'y a pas
  // beaucoup de commentaires ») : les deux vues n'ont pas la même hauteur
  // naturelle — deux graphiques d'un côté, parfois deux lignes de texte de
  // l'autre —, et la carte se rétractait brutalement à la bascule.
  //
  // On mesure donc la hauteur réelle de la vue Statistiques une fois qu'elle
  // est dessinée, et on la pose en `min-height` sur les DEUX vues. Mesurer
  // plutôt que fixer une valeur en dur dans le CSS : la hauteur des
  // statistiques dépend du nombre d'activités (légende du camembert) et de
  // la largeur de l'écran, une constante serait fausse la moitié du temps.
  // La mesure n'est possible que sur un élément visible, d'où l'appel depuis
  // le rendu des statistiques (la vue par défaut) et non depuis la bascule.
  function syncViewProfilePaneHeight() {
    var stats = $('viewProfileStatsSection');
    if (stats.classList.contains('hidden')) return; // rien à mesurer, on garde la valeur précédente
    var h = stats.offsetHeight;
    if (!h) return;
    stats.style.minHeight = h + 'px';
    $('viewProfileMessagesSection').style.minHeight = h + 'px';
  }

  function setViewProfileSection(section) {
    viewProfileSection = section === 'messages' ? 'messages' : 'stats';
    var onStats = viewProfileSection === 'stats';
    // La hauteur est figée AVANT de masquer la vue courante : une fois
    // `hidden` posé, offsetHeight vaut 0 et il n'y a plus rien à mesurer.
    syncViewProfilePaneHeight();
    $('viewProfileStatsSection').classList.toggle('hidden', !onStats);
    $('viewProfileMessagesSection').classList.toggle('hidden', onStats);
    $('viewProfileTabStats').classList.toggle('active', onStats);
    $('viewProfileTabMessages').classList.toggle('active', !onStats);
    if (!onStats && !viewProfilePostsLoaded) {
      viewProfilePostsLoaded = true;
      loadViewProfilePosts(viewProfileCanSeePosts);
    }
  }

  $('viewProfileTabStats').addEventListener('click', function () { setViewProfileSection('stats'); });
  $('viewProfileTabMessages').addEventListener('click', function () { setViewProfileSection('messages'); });

  function openProfileViewModal(userId, name, color) {
    viewProfileUserId = userId;

    // Remise à zéro complète : la modale est réutilisée d'un profil à
    // l'autre, il ne doit jamais rester une miette du précédent affichée le
    // temps que les réponses arrivent.
    // Le nom affiché ici n'est que le prénom connu de la ligne cliquée : le
    // nom COMPLET (avec le nom de famille) arrive avec la réponse de
    // /profile/:id/public et remplace celui-ci — voir
    // renderViewProfileIdentity. Cet affichage immédiat évite un en-tête
    // vide le temps de la requête.
    $('viewProfileIdentityName').textContent = name;
    $('viewProfileAvatarImg').classList.add('hidden');
    $('viewProfileAvatarImg').removeAttribute('src');
    $('viewProfileAvatarInitial').classList.remove('hidden');
    $('viewProfileAvatarInitial').textContent = name ? name.trim().charAt(0).toUpperCase() : '?';
    $('viewProfileAvatar').style.background = color || 'var(--purple)';
    $('viewProfileProjectsList').innerHTML = '';
    $('viewProfileProjectsEmptyHint').classList.add('hidden');
    $('viewProfileProjectsMsg').textContent = '';
    $('viewProfilePie').innerHTML = '';
    $('viewProfilePieEmptyHint').classList.add('hidden');
    $('viewProfileStatsLabel').textContent = '';
    $('viewProfileStatsTotal').textContent = '';
    $('viewProfileChart').innerHTML = '';
    $('viewProfileChartLegend').innerHTML = '';
    $('viewProfileChartEmptyHint').classList.add('hidden');
    $('viewProfilePostsList').innerHTML = '';
    $('viewProfilePostsEmptyHint').classList.add('hidden');
    $('viewProfilePostsLockedHint').classList.add('hidden');
    // Sondages du profil visité (3 septembre 2026, discussion "Sondages") :
    // remis à zéro ET remasqués comme le reste — le bloc se réaffichera de
    // lui-même si ce profil-ci en a (voir mountPolls, plus bas). Chargé plus
    // bas dans cette même fonction, après la remise à zéro complète.
    $('viewProfilePollsList').innerHTML = '';
    $('viewProfilePollsEmptyHint').classList.add('hidden');
    $('viewProfilePollsBlock').classList.add('hidden');

    // Période/granularité remises à leur valeur par défaut à chaque
    // ouverture — même principe que l'onglet Statistiques, qui repart
    // systématiquement sur la fenêtre en cours plutôt que de garder celle
    // choisie la fois précédente sur un autre profil.
    viewProfilePiePeriod = 'week';
    viewProfileChartGranularity = 'day';
    syncPeriodMenuActive($('viewProfilePiePeriodMenu'), viewProfilePiePeriod);
    syncPeriodMenuActive($('viewProfileChartPeriodMenu'), viewProfileChartGranularity);

    // Le sélecteur repart lui aussi sur "Statistiques" à chaque ouverture, y
    // compris si "Messages" était affiché sur le profil précédent. La
    // hauteur figée par syncViewProfilePaneHeight est remise à zéro : celle
    // du profil précédent n'a aucune raison de valoir pour celui-ci (nombre
    // d'activités différent, donc légende de camembert différente).
    viewProfileCanSeePosts = false;
    viewProfilePostsLoaded = false;
    $('viewProfileStatsSection').style.minHeight = '';
    $('viewProfileMessagesSection').style.minHeight = '';
    setViewProfileSection('stats');

    // Le contenu de la modale peut être long (projets + deux graphiques +
    // messages) : on la rouvre toujours en haut, jamais là où le défilement
    // du profil précédent s'était arrêté. ⚠️ C'est #viewProfileScroll qui
    // défile, plus la carte elle-même, depuis que l'en-tête d'identité a été
    // sorti du défilement (voir styles.css).
    $('viewProfileScroll').scrollTop = 0;

    $('viewProfileModal').classList.remove('hidden');

    api('GET', '/api/profile/' + userId + '/public?viewerId=' + profile.id)
      .then(function (card2) {
        // Même garde que loadViewProfileStats : la modale a pu être refermée
        // ou rouverte sur quelqu'un d'autre pendant la requête.
        if (viewProfileUserId !== userId) return;
        renderViewProfileIdentity(card2);
        viewProfileCanSeePosts = !!card2.canSeePosts;
        // Cas de course réel : on peut cliquer "Messages" AVANT que cette
        // réponse n'arrive. Le clic ne savait pas encore si l'accès était
        // accordé, il n'a donc rien chargé — c'est ici qu'on rattrape.
        if (viewProfileSection === 'messages') {
          viewProfilePostsLoaded = true;
          loadViewProfilePosts(viewProfileCanSeePosts);
        }
      })
      .catch(function (err) { $('viewProfileProjectsMsg').textContent = err.message; });

    api('GET', '/api/profile/' + userId + '/projects?viewerId=' + profile.id)
      .then(renderViewProfileProjects)
      .catch(function (err) { $('viewProfileProjectsMsg').textContent = err.message; });

    loadViewProfileStats();
    // Sondages du profil visité (3 septembre 2026, discussion "Sondages") :
    // premier niveau d'accès (tout membre identifié), comme les projets et
    // les statistiques juste au-dessus — et contrairement aux messages,
    // réservés aux abonnés acceptés. mountPolls porte sa propre garde
    // anti-réponse-en-vol, sur le même principe que viewProfileUserId.
    viewProfilePollsMount.load();
  }

  function renderViewProfileIdentity(card) {
    // Nom COMPLET (prénom + nom de famille quand il existe), exactement
    // comme sa propre carte Identité l'affiche pour soi — demande d'Emilien
    // du 2 septembre 2026. Un seul endroit dans la page porte le nom depuis
    // ce même passage : celui de l'en-tête de la modale a été retiré.
    $('viewProfileIdentityName').textContent = card.lastName ? (card.name + ' ' + card.lastName) : card.name;
    if (card.avatar) {
      $('viewProfileAvatarImg').src = card.avatar;
      $('viewProfileAvatarImg').classList.remove('hidden');
      $('viewProfileAvatarInitial').classList.add('hidden');
      $('viewProfileAvatar').style.background = 'transparent';
    } else {
      $('viewProfileAvatarImg').classList.add('hidden');
      $('viewProfileAvatarImg').removeAttribute('src');
      $('viewProfileAvatarInitial').classList.remove('hidden');
      $('viewProfileAvatarInitial').textContent = card.name ? card.name.trim().charAt(0).toUpperCase() : '?';
      $('viewProfileAvatar').style.background = card.color || 'var(--purple)';
    }
  }

  // ----- Statistiques du profil visité : Répartition + Graphique -----
  // Un seul appel serveur pour les deux sections (GET /profile/:id/stats),
  // comme l'onglet Statistiques le fait depuis que le camembert est alimenté
  // par la réponse de la Feuille de temps : deux sections nourries par une
  // même réponse ne peuvent pas diverger. Un changement de période ou de
  // granularité recharge simplement l'ensemble — deux graphiques, c'est
  // assez peu pour ne pas justifier deux routes.
  function loadViewProfileStats() {
    if (!viewProfileUserId || !profile) return;
    var target = viewProfileUserId;
    api('GET', '/api/profile/' + target + '/stats?viewerId=' + profile.id +
        '&period=' + viewProfilePiePeriod + '&granularity=' + viewProfileChartGranularity)
      .then(function (data) {
        // La modale a pu être refermée (ou rouverte sur quelqu'un d'autre)
        // pendant la requête : on ne dessine jamais les chiffres d'un profil
        // dans la page d'un autre.
        if (viewProfileUserId !== target) return;
        var breakdown = data.breakdown || { totalSeconds: 0, activities: [] };
        $('viewProfileStatsLabel').textContent = data.label ? t(data.label) : '';
        $('viewProfileStatsTotal').textContent = formatHM(breakdown.totalSeconds);
        renderPie(breakdown.activities || [], breakdown.totalSeconds, { wrap: 'viewProfilePie', emptyHint: 'viewProfilePieEmptyHint' });
        renderViewProfileChart(data.chart || []);
        syncViewProfilePaneHeight();
      })
      .catch(function (err) { $('viewProfileProjectsMsg').textContent = err.message; });
  }

  setupStatsPeriodMenu($('viewProfilePiePeriodBtn'), $('viewProfilePiePeriodMenu'), function (period) {
    viewProfilePiePeriod = period;
    loadViewProfileStats();
  });
  setupStatsPeriodMenu($('viewProfileChartPeriodBtn'), $('viewProfileChartPeriodMenu'), function (granularity) {
    viewProfileChartGranularity = granularity;
    loadViewProfileStats();
  });

  // Graphique de la page de visite — volontairement une version SIMPLE, et
  // non un appel à renderChart (l'onglet Statistiques) :
  //  - renderChart a son propre crosshair + infobulle flottante ancrée
  //    (#chartTooltip, #statsChartWrap). Le paramétrer pour deux conteneurs
  //    demanderait de réécrire une fonction qui appartient à une autre
  //    discussion (Statistiques — Graphique) ;
  //  - un profil qu'on visite se lit, il ne s'explore pas au clic : pas
  //    d'infobulle flottante ici, tous les points d'un coup, l'aire défile
  //    horizontalement (.chartScroll) — même principe que le Graphique,
  //    qui n'a lui non plus aucune capacité de zoom (essayée puis annulée
  //    le 2 septembre 2026, voir noesis-timetracker-journal-statistiques.md).
  //    ⚠️ Commentaire corrigé par Statistiques — Graphique (2 septembre
  //    2026) : mentionnait des identifiants de zoom déjà retirés
  //    (chartViewState/chartUserZoomed/chartCurrentTotal/#chartZoomResetBtn)
  //    depuis longtemps obsolètes — aucune ligne de logique touchée.
  // Ce qui EST partagé l'est réellement : buildChartSeries (construction des
  // séries) et dayChartLabel (étiquettes), tous deux déjà génériques et déjà
  // partagés avec la Communauté.
  function renderViewProfileChart(days) {
    var box = $('viewProfileChart');
    var legendBox = $('viewProfileChartLegend');
    box.innerHTML = '';
    legendBox.innerHTML = '';
    var hasData = days && days.length > 0;
    $('viewProfileChartEmptyHint').classList.toggle('hidden', hasData);
    if (!hasData) return;

    var sorted = days.slice().sort(function (a, b) { return a.isoDate < b.isoDate ? -1 : 1; });
    var series = buildChartSeries(sorted);
    var maxSeconds = sorted.reduce(function (m, d) { return Math.max(m, d.totalSeconds); }, 0) || 1;

    var stepW = 56;
    var width = Math.max(280, stepW * sorted.length);
    var height = 160, padTop = 12, padBottom = 24, padSide = 8;
    var plotH = height - padTop - padBottom;
    var innerW = width - padSide * 2;
    function xFor(i) { return padSide + (innerW / sorted.length) * (i + 0.5); }
    function yFor(seconds) { return padTop + plotH - (seconds / maxSeconds) * plotH; }

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'chartSvg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = width + 'px';
    svg.style.height = height + 'px';

    var baseline = document.createElementNS(svgNS, 'line');
    baseline.setAttribute('x1', 0); baseline.setAttribute('x2', width);
    baseline.setAttribute('y1', height - padBottom); baseline.setAttribute('y2', height - padBottom);
    baseline.setAttribute('class', 'chartAxisLine');
    svg.appendChild(baseline);

    // Total dessiné en dernier, donc au-dessus des courbes d'activité :
    // c'est la synthèse, elle doit rester lisible (même choix que renderChart).
    var ordered = series.slice().sort(function (a, b) { return (a.isTotal ? 1 : 0) - (b.isTotal ? 1 : 0); });
    ordered.forEach(function (s) {
      var points = s.values.map(function (v, i) { return { x: xFor(i), y: yFor(v) }; });
      var line = document.createElementNS(svgNS, 'path');
      line.setAttribute('d', points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' '));
      line.setAttribute('class', 'chartLine' + (s.isTotal ? ' chartLineTotal' : ''));
      line.style.stroke = s.color;
      svg.appendChild(line);

      points.forEach(function (p, i) {
        var dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 4);
        dot.setAttribute('class', 'chartDot');
        dot.style.fill = s.color;
        // Pas d'infobulle flottante ici (voir plus haut) : un <title> SVG
        // natif suffit, et fonctionne aussi en appui long sur mobile.
        var title = document.createElementNS(svgNS, 'title');
        title.textContent = dayChartLabel(sorted[i]) + ' — ' + s.name + ' : ' + formatHM(s.values[i]);
        dot.appendChild(title);
        svg.appendChild(dot);
      });
    });

    sorted.forEach(function (d, i) {
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', xFor(i)); label.setAttribute('y', height - 8);
      label.setAttribute('class', 'chartAxisLabel');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = dayChartLabel(d, true);
      svg.appendChild(label);
    });

    box.appendChild(svg);

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
      legendBox.appendChild(row);
    });
  }

  // ----- Messages "Communauté" du profil visité (abonnés acceptés) -----
  // `allowed` vient de canSeePosts (GET /profile/:id/public) : quand l'accès
  // n'est pas accordé, on n'appelle même pas la route — le serveur a déjà
  // répondu, inutile de lui demander un 403 pour le plaisir.
  function loadViewProfilePosts(allowed) {
    if (!viewProfileUserId || !profile) return;
    var target = viewProfileUserId;
    if (!allowed) {
      $('viewProfilePostsLockedHint').classList.remove('hidden');
      $('viewProfilePostsEmptyHint').classList.add('hidden');
      $('viewProfilePostsList').innerHTML = '';
      return;
    }
    $('viewProfilePostsLockedHint').classList.add('hidden');
    api('GET', '/api/profile/' + target + '/posts?viewerId=' + profile.id)
      .then(function (list) {
        if (viewProfileUserId !== target) return;
        var box = $('viewProfilePostsList');
        box.innerHTML = '';
        $('viewProfilePostsEmptyHint').classList.toggle('hidden', list.length > 0);
        list.forEach(function (post) { box.appendChild(buildViewProfilePostCard(post)); });
        box.scrollTop = box.scrollHeight;
      })
      .catch(function (err) { $('viewProfileProjectsMsg').textContent = err.message; });
  }

  // Carte d'un message en lecture seule — mêmes classes que le fil de son
  // propre profil (.discussionMsg), sans le bouton de suppression ni le
  // trombone, et avec des pièces jointes non supprimables
  // (buildAttachmentRowReadOnly, déjà écrite pour le flux "Suivi").
  function buildViewProfilePostCard(post) {
    var card = document.createElement('div');
    card.className = 'discussionMsg';

    var head = document.createElement('div');
    head.className = 'rowTop';
    var when = document.createElement('span');
    when.className = 'meta';
    var d = new Date(post.createdAt);
    when.textContent = d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' }) + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    head.appendChild(when);
    card.appendChild(head);

    if (post.body) {
      var body = document.createElement('p');
      body.className = 'note';
      body.textContent = post.body;
      card.appendChild(body);
    }

    if (post.attachments && post.attachments.length > 0) {
      var attWrap = document.createElement('div');
      attWrap.className = 'attachmentList';
      post.attachments.forEach(function (att) { attWrap.appendChild(buildAttachmentRowReadOnly(att)); });
      card.appendChild(attWrap);
    }

    return card;
  }

  function renderViewProfileProjects(list) {
    var box = $('viewProfileProjectsList');
    box.innerHTML = '';
    $('viewProfileProjectsEmptyHint').classList.toggle('hidden', list.length > 0);

    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'activityRow';

      var header = document.createElement('div');
      header.className = 'activityRowHeader clickable';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'activityRowName';
      nameSpan.textContent = p.name;
      header.appendChild(nameSpan);

      var badges = buildSeekingBadges(p.seeking, false);
      if (badges) header.appendChild(badges);

      row.appendChild(header);

      if (p.description) {
        var shortP = document.createElement('p');
        shortP.className = 'meta';
        shortP.textContent = truncateProjectDescription(p.description);
        row.appendChild(shortP);
      }

      var panel = document.createElement('div');
      panel.className = 'activitySettingsPanel hidden';
      var fullBadges = buildSeekingBadges(p.seeking, true);
      if (fullBadges) panel.appendChild(fullBadges);
      panel.appendChild(buildProjectDetailFields(p));
      if (!p.description && !p.externalLink && !p.startDate && !p.category && !fullBadges) {
        var none = document.createElement('p');
        none.className = 'hint';
        none.textContent = t('Aucun détail supplémentaire pour ce projet.');
        panel.appendChild(none);
      }
      row.appendChild(panel);

      header.addEventListener('click', function () { panel.classList.toggle('hidden'); });

      box.appendChild(row);
    });
  }

  // Fermeture : `viewProfileUserId` repasse à null, ce qui neutralise au
  // passage toute réponse encore en vol (voir les gardes `viewProfileUserId
  // !== target` plus haut) — sans ça, une réponse lente pourrait redessiner
  // des chiffres dans une modale déjà refermée, ou pire, rouverte sur
  // quelqu'un d'autre.
  function closeProfileViewModal() {
    viewProfileUserId = null;
    $('viewProfileModal').classList.add('hidden');
  }
  $('viewProfileModalClose').addEventListener('click', closeProfileViewModal);
  // Clic sur le fond assombri (en dehors de la carte) pour fermer, comme
  // #communityMembersModal.
  $('viewProfileModal').addEventListener('click', function (e) {
    if (e.target === this) closeProfileViewModal();
  });

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

  // ----- Sous-partie "Communauté" (profile_posts) -----
  // Depuis le 1er septembre 2026 (demande d'Emilien : « créer une zone pour
  // écrire à sa communauté exactement comme il y a dans le profil [...] que
  // les deux zones soient identiques »), ce composeur + ce fil existent à
  // DEUX emplacements — la zone Discussion du Profil (#profileDiscussionBlock,
  // ids profileDiscussion*) et la nouvelle zone de Communauté
  // (#communityMyPostsBlock, ids communityMyPosts*) — pour la MÊME donnée
  // (toujours "mes" profile_posts, quel que soit l'endroit d'où on les
  // regarde). mountProfilePostsComposer(ids) fabrique une instance
  // indépendante (son propre état de pièces jointes "en attente") à partir
  // d'un jeu d'ids DOM ; les deux instances sont ensuite gardées dans
  // profilePostsComposers pour pouvoir se rafraîchir l'une l'autre après un
  // envoi/suppression fait depuis n'importe laquelle des deux (voir
  // refreshAllProfilePostsComposers, tout en bas).
  var profilePostsComposers = [];

  // ===================== FIL DE DISCUSSION — FACTORY GÉNÉRIQUE =====================
  // Généralisée le 3 septembre 2026 par la discussion "Sous-projets", à partir
  // de mountProfilePostsComposer(ids) (Communauté, 1er septembre 2026).
  //
  // POURQUOI : l'app avait déjà DEUX rendus de messages, et aucun n'était
  // réutilisable tel quel pour un fil par sous-projet —
  //   1. renderDiscussion (fil d'une activité) : multi-auteur, mais SINGLETON,
  //      câblé sur des ids fixes et sur currentCommunityActivityId. Propriété
  //      de la discussion "Général" : non modifié par ce chantier.
  //   2. mountProfilePostsComposer : bien une factory paramétrée par des ids,
  //      mais câblée en dur sur /api/profile/posts et MONO-auteur (.mine
  //      toujours vrai, ni nom ni couleur d'auteur).
  // Le fil d'un sous-projet est multi-auteur ET doit vivre sur ses propres
  // ids. Plutôt que d'écrire un TROISIÈME système, la factory existante est
  // généralisée ici : sa source de données et son mode d'affichage deviennent
  // des paramètres.
  //
  // ⚠️ mountProfilePostsComposer reste juste en dessous, sous la forme d'un
  // appel préconfiguré : la zone Discussion du Profil et la zone "écrire à sa
  // communauté" gardent EXACTEMENT le même comportement qu'avant (mêmes
  // routes, rendu mono-auteur, pièces jointes, rafraîchissement mutuel des
  // deux instances). Aucun de leurs appelants n'a été touché.
  //
  // cfg :
  //   ids               { list, emptyHint, input, sendBtn, msg,
  //                       pendingList?, attachBtn?, attachInput? }
  //   registry          tableau d'instances rafraîchies ensemble
  //   attachments       true = trombone au composeur ET sur chaque message
  //   multiAuthor       true = nom + couleur d'auteur, .mine sur les siens seulement
  //   listUrl()         url de lecture — renvoyer null quand le fil n'a pas
  //                     encore de contexte (aucun sous-projet ouvert, p. ex.)
  //   messagesOf(data)  extrait le tableau de messages de la réponse
  //   createUrl()       url d'envoi
  //   createBody(body)  corps de la requête d'envoi
  //   deleteUrl(m)      url de suppression d'un message
  //   attachUrl(m)      url d'ajout d'une pièce jointe (si attachments)
  //   attachDeletePath  chemin de suppression d'une pièce jointe (si attachments)
  //   pollMs            si défini : rafraîchissement périodique, et garde
  //                     anti-redessin (sans elle, un rafraîchissement
  //                     périodique ferait sauter le défilement à chaque tour)
  function mountMessageThread(cfg) {
    // [{ tempId, fileName, mimeType, sizeBytes, dataUrl }] — pièces jointes
    // choisies AVANT l'envoi, gardées en mémoire côté client, propres à CETTE
    // instance.
    var pendingAttachments = [];
    var renderedSignature = '';
    var pollTimer = null;

    function renderPending() {
      if (!cfg.attachments) return;
      var box = $(cfg.ids.pendingList);
      box.classList.toggle('hidden', pendingAttachments.length === 0);
      renderAttachmentList(box, pendingAttachments.map(function (p) {
        return { id: p.tempId, fileName: p.fileName, mimeType: p.mimeType, sizeBytes: p.sizeBytes, dataUrl: p.dataUrl };
      }), function (removedTempId) {
        pendingAttachments = pendingAttachments.filter(function (p) { return p.tempId !== removedTempId; });
        renderPending();
      }, null);
      $(cfg.ids.attachBtn).disabled = pendingAttachments.length >= MAX_NOTE_ATTACHMENTS;
    }

    // Une carte de message : texte + (si cfg.attachments) pièces jointes déjà
    // envoyées et trombone pour en ajouter une + suppression du message.
    // En mono-auteur (Profil/Communauté), `mine` est toujours vrai : ce fil
    // n'affiche que les messages de l'auteur courant. En multi-auteur
    // (sous-projet), on affiche le nom et la couleur de chacun et seul
    // l'auteur voit la croix de suppression — même règle que le fil d'une
    // activité, où le propriétaire n'a aucun droit particulier.
    function buildPostCard(post) {
      var mine = cfg.multiAuthor ? !!(profile && post.userId === profile.id) : true;

      var msg = document.createElement('div');
      // Le liséré violet ne sert QU'EN multi-auteur, à distinguer mes messages
      // de ceux des autres. Dans un fil mono-auteur (Profil, Communauté), tout
      // est de moi : le marquer sur chaque carte ne distingue rien et fait du
      // bruit — retiré le 3 septembre 2026 (demande d'Emilien : « sur mon
      // profil, le message doit être normal, sans aucune distinction »).
      msg.className = 'discussionMsg' + (cfg.multiAuthor && mine ? ' mine' : '');
      msg.dataset.messageId = post.id;

      var when = new Date(post.createdAt);
      var dateLabel = when.toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
      var timeLabel = pad(when.getHours()) + ':' + pad(when.getMinutes());

      var authorHtml = cfg.multiAuthor
        ? '<span class="dot" style="background:' + (post.userColor || 'transparent') + '"></span>' +
          escapeHtml(post.userName || '') + (mine ? t(' (toi)') : '')
        : escapeHtml(profile ? profile.name : '') + t(' (toi)');

      var top = document.createElement('div');
      top.className = 'discussionMsgTop';
      top.innerHTML = '<span class="discussionMsgAuthor">' + authorHtml + '</span>' +
        '<span class="meta">' + dateLabel + ' · ' + timeLabel + '</span>';

      if (mine) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'discussionMsgDelete';
        del.textContent = '✕';
        del.title = t('Supprimer ce message');
        del.addEventListener('click', function () {
          if (!confirm(t('Supprimer ce message ?'))) return;
          api('DELETE', cfg.deleteUrl(post))
            .then(refreshRegistry)
            .catch(function (err) { alert(err.message); });
        });
        top.appendChild(del);
      }
      msg.appendChild(top);

      var body = document.createElement('div');
      body.className = 'discussionMsgBody';
      body.textContent = post.body;
      msg.appendChild(body);

      if (!cfg.attachments) return msg;

      var attachBox = document.createElement('div');
      attachBox.className = 'attachmentList';
      renderAttachmentList(attachBox, post.attachments, null, cfg.attachDeletePath);
      var attachMenuWrap = document.createElement('div');
      attachMenuWrap.className = 'attachmentMenuWrap';
      var attachMenuBtn = document.createElement('button');
      attachMenuBtn.type = 'button'; attachMenuBtn.className = 'menuBtn attachMenuIconBtn';
      attachMenuBtn.setAttribute('aria-label', t('Ajouter une pièce jointe'));
      attachMenuBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
      attachMenuBtn.disabled = (post.attachments || []).length >= MAX_NOTE_ATTACHMENTS;
      var attachInput = document.createElement('input');
      attachInput.type = 'file'; attachInput.className = 'hidden';
      attachMenuWrap.appendChild(attachMenuBtn);
      attachMenuWrap.appendChild(attachInput);
      var attachMsg = document.createElement('p');
      attachMsg.className = 'meta attachmentMsg';

      function uploadPostAttachment(fileName, mimeType, dataUrl) {
        attachMsg.textContent = t('Envoi...');
        api('POST', cfg.attachUrl(post), { userId: profile.id, fileName: fileName, mimeType: mimeType, dataUrl: dataUrl })
          .then(function () { refreshRegistry(); })
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

    function renderPosts(posts) {
      // Une instance peut n'avoir AUCUNE liste : depuis le 3 septembre 2026, le
      // composeur de #tab-community publie dans le flux d'actualité plus bas
      // (#followingFeed) au lieu d'avoir sa propre liste. On sort proprement
      // plutôt que de faire dépendre le composeur d'un élément absent.
      var box = cfg.ids.list ? $(cfg.ids.list) : null;
      if (!box) return;
      $(cfg.ids.emptyHint).classList.toggle('hidden', posts.length > 0);

      // Garde anti-redessin, uniquement quand le fil se rafraîchit tout seul
      // (cfg.pollMs) : sans elle, chaque tour reconstruirait le fil à
      // l'identique et ferait sauter le défilement. Les instances sans
      // polling (Profil/Communauté) redessinent comme avant — comportement
      // strictement inchangé pour elles.
      if (cfg.pollMs) {
        var signature = posts.map(function (m) {
          return m.id + ':' + (m.attachments ? m.attachments.length : 0) + ':' + (m.body || '').length;
        }).join(',');
        if (signature === renderedSignature) return;
        renderedSignature = signature;
      }

      box.innerHTML = '';
      posts.forEach(function (post) { box.appendChild(buildPostCard(post)); });
      box.scrollTop = box.scrollHeight;
    }

    function load() {
      if (!profile) return;
      var url = cfg.listUrl();
      if (!url) return;   // pas de contexte (aucun sous-projet ouvert) : rien à charger
      api('GET', url).then(function (data) {
        // Le contexte a pu changer pendant la requête (autre sous-projet
        // ouvert entre-temps) : on ne dessine pas une réponse périmée.
        if (cfg.listUrl() !== url) return;
        renderPosts(cfg.messagesOf(data));
      }).catch(function () { /* contexte disparu : rien à afficher */ });
    }

    function reset() {
      pendingAttachments = [];
      renderPending();
      renderedSignature = '';
      if (cfg.ids.list) $(cfg.ids.list).innerHTML = '';
      $(cfg.ids.input).value = '';
      $(cfg.ids.msg).textContent = '';
      load();
    }

    // Crée le message puis, s'il y avait des pièces jointes en attente, les
    // envoie une par une dans l'ordre choisi — pas de notion serveur de
    // "brouillon", uniquement un état client temporaire.
    function send() {
      if (!profile) return;
      var input = $(cfg.ids.input);
      var body = input.value.trim();
      var msgEl = $(cfg.ids.msg);
      if (!body) { msgEl.textContent = t('Écris un message avant d\'envoyer.'); return; }

      msgEl.textContent = '';
      $(cfg.ids.sendBtn).disabled = true;
      var pending = cfg.attachments ? pendingAttachments.slice() : [];
      api('POST', cfg.createUrl(), cfg.createBody(body))
        .then(function (created) {
          if (!pending.length) return;
          var chain = Promise.resolve();
          pending.forEach(function (p) {
            chain = chain.then(function () {
              return api('POST', cfg.attachUrl(created),
                { userId: profile.id, fileName: p.fileName, mimeType: p.mimeType, dataUrl: p.dataUrl });
            });
          });
          return chain;
        })
        .then(function () {
          input.value = '';
          pendingAttachments = [];
          renderPending();
          renderedSignature = '';
          refreshRegistry();
          if (cfg.onSent) cfg.onSent();
        })
        .catch(function (err) { msgEl.textContent = err.message; })
        .then(function () { $(cfg.ids.sendBtn).disabled = false; });
    }

    function refreshRegistry() {
      if (cfg.registry) cfg.registry.forEach(function (c) { c.load(); });
      else load();
    }

    function startPolling() {
      stopPolling();
      if (!cfg.pollMs) return;
      pollTimer = setInterval(function () {
        // Onglet quitté, contexte perdu, ou app en arrière-plan (téléphone
        // verrouillé) : rien à recharger. Même prudence que le fil d'activité.
        if (!cfg.listUrl()) { stopPolling(); return; }
        if (document.hidden) return;
        load();
      }, cfg.pollMs);
    }

    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }

    if (cfg.attachments) {
      $(cfg.ids.attachBtn).addEventListener('click', function () { $(cfg.ids.attachInput).click(); });
      $(cfg.ids.attachInput).addEventListener('change', function () {
        var file = this.files[0];
        this.value = '';
        handleAttachmentFilePick(file, $(cfg.ids.msg), function (fileName, mimeType, dataUrl) {
          pendingAttachments.push({
            tempId: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2),
            fileName: fileName,
            mimeType: mimeType,
            sizeBytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4),
            dataUrl: dataUrl,
          });
          $(cfg.ids.msg).textContent = '';
          renderPending();
        });
      });
    }
    $(cfg.ids.sendBtn).addEventListener('click', send);
    // Entrée = envoyer, Maj+Entrée = retour à la ligne — même convention que
    // le fil de discussion de l'onglet Activité.
    $(cfg.ids.input).addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    var instance = { load: load, reset: reset, startPolling: startPolling, stopPolling: stopPolling };
    if (cfg.registry) cfg.registry.push(instance);
    return instance;
  }

  // Appel préconfiguré — le fil "Communauté" d'un profil (profile_posts),
  // monté deux fois (zone Discussion du Profil + zone "écrire à sa
  // communauté"). Signature et comportement inchangés depuis le 1er septembre
  // 2026 : mono-auteur, pièces jointes, deux instances qui se rafraîchissent
  // mutuellement.
  function mountProfilePostsComposer(ids, onSent) {
    return mountMessageThread({
      ids: ids,
      onSent: onSent,
      registry: profilePostsComposers,
      attachments: true,
      multiAuthor: false,
      listUrl: function () { return '/api/profile/posts?userId=' + profile.id; },
      messagesOf: function (data) { return data; },
      createUrl: function () { return '/api/profile/posts'; },
      createBody: function (body) { return { userId: profile.id, body: body }; },
      deleteUrl: function (post) { return '/api/profile/posts/' + post.id + '?userId=' + profile.id; },
      attachUrl: function (post) { return '/api/profile/posts/' + post.id + '/attachments'; },
      attachDeletePath: '/api/profile/post-attachments/',
      // Depuis le 3 septembre 2026, un nouveau message apparaît AUSSI dans mon
      // propre flux d'actualité (voir followingFeedForUser côté serveur) :
      // l'instance de #tab-community passe donc un rappel `onSent` qui recharge
      // #followingFeed. Celle du Profil n'en a pas besoin — sa liste
      // personnelle se rafraîchit déjà toute seule.
    });
  }

  // Conservée après la généralisation du 3 septembre 2026 (le rafraîchissement
  // mutuel des deux instances est désormais fait par mountMessageThread
  // lui-même, via cfg.registry) : plus aucun appelant dans ce fichier, mais
  // gardée comme filet pour une session concurrente qui l'appellerait encore.
  // À retirer par Profil ou Communauté lors d'un prochain audit de code mort.
  function refreshAllProfilePostsComposers() {
    profilePostsComposers.forEach(function (c) { c.load(); });
  }

  var profileDiscussionComposer = mountProfilePostsComposer({
    list: 'profileDiscussionCommunityList', emptyHint: 'profileDiscussionCommunityEmptyHint',
    input: 'profileDiscussionCommunityInput', pendingList: 'profileDiscussionPendingList',
    attachBtn: 'profileDiscussionAttachBtn', attachInput: 'profileDiscussionAttachInput',
    sendBtn: 'profileDiscussionCommunitySendBtn', msg: 'profileDiscussionCommunityMsg',
  });
  // Seconde instance, #communityMyPostsBlock dans #tab-community (1er
  // septembre 2026) — voir loadCommunity() plus haut, qui appelle
  // communityDiscussionComposer.reset() à l'ouverture de l'onglet.
  // Depuis le 3 septembre 2026, cette instance n'a plus de liste à elle : le
  // message publié apparaît dans le flux d'actualité juste en dessous
  // (#followingFeed), en violet plein. `list`/`emptyHint` sont donc absents —
  // mountMessageThread le tolère explicitement (voir renderPosts).
  var communityDiscussionComposer = mountProfilePostsComposer({
    input: 'communityMyPostsInput', pendingList: 'communityMyPostsPendingList',
    attachBtn: 'communityMyPostsAttachBtn', attachInput: 'communityMyPostsAttachInput',
    sendBtn: 'communityMyPostsSendBtn', msg: 'communityMyPostsMsg',
  }, function () {
    // Recharge le flux puis amène le message tout juste publié à l'écran : il
    // arrive en tête (le flux est trié du plus récent au plus ancien), mais
    // d'autres blocs le séparent du composeur.
    loadFollowingFeed();
    focusWhenReady('#followingFeed .discussionMsg');
  });

  // Appelée par openProfile() (Design, plus haut dans ce fichier) à chaque
  // ouverture du Profil — signature inchangée pour ne pas avoir à toucher
  // cet appel, hors périmètre Communauté.
  function loadProfileDiscussion() {
    profileDiscussionComposer.reset();
    // Sondages du Profil (3 septembre 2026, discussion "Sondages") : accroché
    // au même point d'entrée que la zone Discussion, pour ne pas avoir à
    // toucher openProfile() (propriété de Design).
    profilePollsMount.reset();
  }

  // ===================== SONDAGES (socle réutilisable) =====================
  // Discussion "Sondages" (11ᵉ discussion, 3 septembre 2026).
  //
  // Cadrage d'Emilien : « Les sondages n'apparaissent jamais dans les
  // discussions, ils sont toujours des post qui défile sur le volet
  // communauté, sur le profil ou dans un sous projet d'une activité. » D'où
  // deux briques, et pas une de plus :
  //
  //   buildPollCard(poll, onChanged, opts) — UNE carte de sondage, autonome.
  //     Utilisée aussi bien par les listes montées ci-dessous que par le flux
  //     "Suivi" (loadFollowingFeed, plus haut), où les sondages des personnes
  //     suivies défilent mêlés à leurs messages. Tout le comportement de vote
  //     est là : un seul endroit à relire pour comprendre ce qui se passe au
  //     clic.
  //
  //   mountPolls(ids) — une LISTE + (optionnellement) un composeur, montée sur
  //     un jeu d'ids DOM. Même motif que mountProfilePostsComposer(ids) juste
  //     au-dessus : trois instances aujourd'hui (Communauté, Profil, page de
  //     visite d'un profil), zéro duplication.
  //
  // ⚠️ Le serveur ne renvoie AUCUN résultat tant qu'on n'a pas voté (ni
  // compte, ni nom, ni total — voir serializePoll dans server/lib/polls.js) :
  // il n'y a donc rien à masquer ici, et rien à trouver dans l'inspecteur
  // réseau. Ce fichier ne fait qu'afficher ce qu'il a reçu. Ne jamais
  // « optimiser » en demandant tout au serveur pour filtrer côté client.

  var pollsMounts = [];

  function refreshAllPolls() {
    pollsMounts.forEach(function (m) { m.load(); });
  }

  function pollStampLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' }) + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pollDayLabel(iso) {
    return new Date(iso).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Champs de saisie du formulaire de sondage : des <textarea> qui reviennent à
  // la ligne et grandissent avec le texte, plutôt que des <input> d'une seule
  // ligne (3 septembre 2026, demande d'Emilien : « les zones d'écriture,
  // questions, réponses [...] doivent s'agrandir automatiquement en revenant à
  // la ligne si le texte est plus long »).
  //
  // ⚠️ Deux pièges, tous les deux vus en bac à sable :
  //   - il FAUT remettre height à 'auto' avant de lire scrollHeight, sinon la
  //     hauteur ne fait que croître et ne redescend jamais quand on efface ;
  //   - un élément masqué (display:none, cas du formulaire replié) a un
  //     scrollHeight de 0 — recalculer une hauteur à ce moment-là écraserait
  //     les champs à 0px. D'où le garde-fou ci-dessous, et le recalcul fait à
  //     l'OUVERTURE du formulaire, jamais avant.
  function pollAutoGrow(el) {
    if (!el || !el.offsetParent) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function bindPollAutoGrow(el) {
    el.addEventListener('input', function () { pollAutoGrow(el); });
  }

  // opts.authorClickable : false sur la page de visite d'un profil, où
  // l'auteur EST le profil déjà ouvert — un clic n'y ferait que réinitialiser
  // la modale sur elle-même.
  function buildPollCard(poll, onChanged, opts) {
    opts = opts || {};
    var card = document.createElement('div');
    card.className = 'discussionMsg pollCard' + (poll.isMine ? ' mine' : '');
    card.dataset.pollId = poll.id;

    var msgEl = document.createElement('p');
    msgEl.className = 'msg';

    // ----- en-tête : auteur, date, actions de l'auteur -----
    var top = document.createElement('div');
    top.className = 'discussionMsgTop';

    var author = document.createElement('span');
    author.className = 'discussionMsgAuthor';
    author.innerHTML = '<span class="dot" style="background:' + poll.author.color + '"></span> ' +
      escapeHtml(poll.author.name) + (poll.isMine ? t(' (toi)') : '');
    if (!poll.isMine && opts.authorClickable !== false) {
      author.style.cursor = 'pointer';
      author.addEventListener('click', function () {
        openProfileViewModal(poll.author.id, poll.author.name, poll.author.color);
      });
    }
    top.appendChild(author);

    var stamp = document.createElement('span');
    stamp.className = 'meta';
    stamp.textContent = pollStampLabel(poll.createdAt);
    top.appendChild(stamp);

    // Clore et supprimer : l'AUTEUR SEUL (choix d'Emilien du 3 septembre
    // 2026). Le serveur refuse de toute façon quiconque d'autre — ces boutons
    // sont un raccourci, pas le contrôle d'accès.
    if (poll.isMine) {
      if (!poll.isClosed) {
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'discussionMsgDelete pollCloseBtn';
        closeBtn.textContent = '⏹';
        closeBtn.title = t('Clore ce sondage');
        closeBtn.addEventListener('click', function () {
          if (!confirm(t('Clore ce sondage ? Plus personne ne pourra voter.'))) return;
          api('POST', '/api/polls/' + poll.id + '/close', { userId: profile.id })
            .then(function () { if (onChanged) onChanged(); })
            .catch(function (err) { msgEl.textContent = err.message; });
        });
        top.appendChild(closeBtn);
      }
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'discussionMsgDelete';
      del.textContent = '✕';
      del.title = t('Supprimer ce sondage');
      del.addEventListener('click', function () {
        if (!confirm(t('Supprimer ce sondage et tous ses votes ?'))) return;
        api('DELETE', '/api/polls/' + poll.id + '?userId=' + profile.id)
          .then(function () { if (onChanged) onChanged(); })
          .catch(function (err) { msgEl.textContent = err.message; });
      });
      top.appendChild(del);
    }
    card.appendChild(top);

    // ----- question et étiquettes -----
    var q = document.createElement('p');
    q.className = 'pollQuestion';
    q.textContent = poll.question;
    card.appendChild(q);

    var flags = [];
    if (poll.multiChoice) flags.push(t('Plusieurs réponses possibles'));
    // Annoncé AVANT le vote, pas après : c'est ce qui décide si on répond
    // franchement. Le serveur ne renvoie de toute façon aucun nom sur un
    // sondage anonyme (serializePoll) — cette étiquette informe, elle ne
    // protège rien à elle seule.
    if (poll.anonymous) flags.push(t('Vote anonyme'));
    if (poll.isClosed) flags.push(t('Clos'));
    else if (poll.closesAt) flags.push(t('Ouvert jusqu\'au') + ' ' + pollDayLabel(poll.closesAt));
    if (flags.length) {
      var flagEl = document.createElement('p');
      flagEl.className = 'meta pollFlags';
      flagEl.textContent = flags.join(' · ');
      card.appendChild(flagEl);
    }

    // ----- vote (seulement si ouvert et pas encore voté) -----
    if (!poll.isClosed && !poll.hasVoted) {
      var choices = document.createElement('div');
      choices.className = 'pollOptions';
      // Nom de groupe unique : plusieurs sondages cohabitent dans le même
      // flux, et deux groupes de boutons radio homonymes se
      // désélectionneraient mutuellement.
      var groupName = 'poll-' + poll.id + '-' + Math.random().toString(36).slice(2);
      poll.options.forEach(function (o) {
        var lab = document.createElement('label');
        lab.className = 'pollChoice';
        var inp = document.createElement('input');
        inp.type = poll.multiChoice ? 'checkbox' : 'radio';
        inp.name = groupName;
        inp.value = String(o.id);
        var span = document.createElement('span');
        span.textContent = o.label;
        lab.appendChild(inp);
        lab.appendChild(span);
        choices.appendChild(lab);
      });
      card.appendChild(choices);

      var actions = document.createElement('div');
      actions.className = 'rowActions';
      var voteBtn = document.createElement('button');
      voteBtn.type = 'button';
      voteBtn.className = 'iconBtn';
      voteBtn.textContent = t('Voter');
      voteBtn.addEventListener('click', function () {
        var chosen = Array.prototype.slice.call(choices.querySelectorAll('input'))
          .filter(function (i) { return i.checked; })
          .map(function (i) { return Number(i.value); });
        if (!chosen.length) { msgEl.textContent = t('Choisis une réponse.'); return; }

        // Validation préalable EXIGÉE par Emilien (3 septembre 2026) : « Non
        // [pas modifiable], mais demande de validation préalable avant
        // enregistrement ». Le vote étant définitif côté serveur, c'est la
        // seule chose qui rattrape un clic à côté — d'où le rappel des
        // réponses choisies dans la confirmation, plutôt qu'un « Confirmer ? »
        // sec qui ne laisse rien vérifier.
        var picked = poll.options
          .filter(function (o) { return chosen.indexOf(o.id) !== -1; })
          .map(function (o) { return o.label; })
          .join(', ');
        if (!confirm(t('Ton vote est définitif et ne pourra plus être modifié.') + '\n\n' + picked + '\n\n' + t('Confirmer ce vote ?'))) return;

        voteBtn.disabled = true;
        msgEl.textContent = '';
        api('POST', '/api/polls/' + poll.id + '/vote', { userId: profile.id, optionIds: chosen })
          .then(function () { if (onChanged) onChanged(); })
          .catch(function (err) { msgEl.textContent = err.message; voteBtn.disabled = false; });
      });
      actions.appendChild(voteBtn);
      card.appendChild(actions);
    }

    // ----- résultats -----
    if (poll.resultsVisible) {
      var total = poll.totalVoters || 0;
      var res = document.createElement('div');
      res.className = 'pollResults';
      poll.options.forEach(function (o) {
        var row = document.createElement('div');
        row.className = 'pollResult' + (poll.myVote.indexOf(o.id) !== -1 ? ' chosen' : '');
        // Pourcentage de VOTANTS, pas de votes : sur un sondage à choix
        // multiple la somme des barres peut donc dépasser 100%, et c'est la
        // lecture juste (« 60% des gens ont coché Lundi »).
        var pct = total ? Math.round((o.count / total) * 100) : 0;

        var head = document.createElement('div');
        head.className = 'pollResultTop';
        var lab = document.createElement('span');
        lab.className = 'pollResultLabel';
        lab.textContent = o.label;
        var num = document.createElement('span');
        num.className = 'meta pollResultCount';
        num.textContent = pct + '% · ' + o.count;
        head.appendChild(lab);
        head.appendChild(num);
        row.appendChild(head);

        var bar = document.createElement('div');
        bar.className = 'pollBar';
        var fill = document.createElement('div');
        fill.className = 'pollBarFill';
        fill.style.width = pct + '%';
        bar.appendChild(fill);
        row.appendChild(bar);

        if (o.voters && o.voters.length) {
          var v = document.createElement('p');
          v.className = 'meta pollVoters';
          v.textContent = o.voters.map(function (x) { return x.name; }).join(', ');
          row.appendChild(v);
        }
        res.appendChild(row);
      });
      card.appendChild(res);

      var tot = document.createElement('p');
      tot.className = 'meta pollTotal';
      tot.textContent = total === 1 ? t('1 personne a voté') : String(total) + ' ' + t('personnes ont voté');
      card.appendChild(tot);
    } else {
      var hidden = document.createElement('p');
      hidden.className = 'hint pollHiddenHint';
      hidden.textContent = t('Vote pour voir les résultats.');
      card.appendChild(hidden);
    }

    card.appendChild(msgEl);
    return card;
  }

  // ids.scopeId accepte une valeur OU une fonction : la page de visite d'un
  // profil change de cible à chaque ouverture, elle passe donc une fonction.
  // Sans ids.form, l'instance est en lecture + vote seulement (aucun
  // composeur) — c'est le cas de la page de visite d'un profil.
  function mountPolls(ids) {
    var MAX_POLL_OPTIONS = 10;

    function scopeIdValue() {
      return typeof ids.scopeId === 'function' ? ids.scopeId() : ids.scopeId;
    }

    function hasComposer() { return !!ids.form; }

    function renumberOptions() {
      var box = $(ids.optionsBox);
      Array.prototype.slice.call(box.children).forEach(function (row, i) {
        var field = row.querySelector('textarea');
        if (field) field.placeholder = t('Réponse') + ' ' + (i + 1);
        var rm = row.querySelector('button');
        if (rm) rm.classList.toggle('hidden', box.children.length <= 2);
      });
    }

    // Recalcule la hauteur de TOUS les champs du formulaire. Appelée à
    // l'ouverture : tant que le formulaire est replié, les champs n'ont aucune
    // hauteur mesurable (voir pollAutoGrow).
    function growAllFields() {
      pollAutoGrow($(ids.question));
      Array.prototype.slice.call($(ids.optionsBox).querySelectorAll('textarea'))
        .forEach(pollAutoGrow);
    }

    function addOptionRow() {
      var box = $(ids.optionsBox);
      if (box.children.length >= MAX_POLL_OPTIONS) return;
      var row = document.createElement('div');
      row.className = 'pollFormOptionRow';
      var input = document.createElement('textarea');
      input.className = 'pollAutoGrow';
      input.rows = 1;
      input.maxLength = 120;
      bindPollAutoGrow(input);
      row.appendChild(input);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'menuBtn';
      rm.textContent = '✕';
      rm.title = t('Retirer cette réponse');
      rm.addEventListener('click', function () {
        if (box.children.length <= 2) return;
        box.removeChild(row);
        renumberOptions();
        $(ids.addOptionBtn).disabled = false;
      });
      row.appendChild(rm);
      box.appendChild(row);
      renumberOptions();
      pollAutoGrow(input);
      $(ids.addOptionBtn).disabled = box.children.length >= MAX_POLL_OPTIONS;
    }

    function resetForm() {
      if (!hasComposer()) return;
      $(ids.form).classList.add('hidden');
      $(ids.question).value = '';
      $(ids.question).style.height = 'auto';
      $(ids.multi).checked = false;
      if (anonymousBox()) anonymousBox().checked = false;
      $(ids.closesAt).value = '';
      $(ids.msg).textContent = '';
      $(ids.optionsBox).innerHTML = '';
      addOptionRow();
      addOptionRow();
      $(ids.addOptionBtn).disabled = false;
      // Le panneau "Option" (choix multiple, vote anonyme, date de clôture) se
      // referme avec le formulaire : on ne rouvre jamais sur des réglages
      // hérités du sondage précédent.
      $(ids.advanced).classList.add('hidden');
      syncPrivacyHint();
    }

    // ⚠️ `anonymous` et `privacyHint` sont FACULTATIFS, et doivent le rester.
    // Le vote anonyme est arrivé après que la discussion Sous-projets eut
    // branché son propre bloc sur le contrat de la veille : rendre ces deux ids
    // obligatoires aurait fait lever mountPolls chez elle — c'est-à-dire casser
    // le volet d'une autre discussion, à distance, sans que rien ne le signale.
    // Règle générale du socle, dans le même esprit que le registre de gardes :
    // un hôte qui n'a pas suivi la dernière évolution perd la fonctionnalité
    // nouvelle, jamais celles qu'il avait déjà.
    function anonymousBox() {
      return ids.anonymous ? $(ids.anonymous) : null;
    }

    function isAnonymousChecked() {
      var box = anonymousBox();
      return !!(box && box.checked);
    }

    // L'avertissement sous le formulaire doit dire la vérité : promettre « le
    // nom des votants est visible » au-dessus d'un sondage anonyme serait pire
    // que ne rien écrire. Il suit donc la case "Vote anonyme".
    function syncPrivacyHint() {
      if (!ids.privacyHint) return;
      $(ids.privacyHint).textContent = isAnonymousChecked()
        ? t("Vote anonyme : personne ne voit qui a voté quoi, pas même toi. Personne ne voit les résultats avant d'avoir voté.")
        : t("Le vote n'est pas anonyme : le nom des votants est visible une fois qu'on a voté. Personne ne voit les résultats avant d'avoir voté.");
    }

    function load() {
      if (!profile) return;
      var sid = scopeIdValue();
      if (!sid) return;
      api('GET', '/api/polls?userId=' + encodeURIComponent(profile.id) +
        '&scope=' + encodeURIComponent(ids.scope) + '&scopeId=' + encodeURIComponent(sid))
        .then(function (data) {
          // Garde anti-réponse-en-vol, même principe que viewProfileUserId
          // côté page de visite : la cible a pu changer pendant la requête.
          if (scopeIdValue() !== sid) return;
          if (ids.addBtn) $(ids.addBtn).classList.toggle('hidden', !data.canCreate);
          var box = $(ids.list);
          box.innerHTML = '';
          $(ids.emptyHint).classList.toggle('hidden', data.polls.length > 0);
          data.polls.forEach(function (p) {
            box.appendChild(buildPollCard(p, refreshAllPolls, { authorClickable: ids.authorClickable !== false }));
          });
          // Un bloc en lecture seule sans aucun sondage n'a rien à dire : on
          // l'efface plutôt que d'afficher un titre vide sur la page de
          // quelqu'un d'autre.
          if (ids.root && !hasComposer()) {
            $(ids.root).classList.toggle('hidden', data.polls.length === 0);
          }
        })
        .catch(function () {
          // Les sondages sont un ajout : leur panne ne doit jamais casser
          // l'écran qui les accueille (même esprit que le principe posé pour
          // les notifications dans server/lib/push.js).
          if (ids.root && !hasComposer()) $(ids.root).classList.add('hidden');
        });
    }

    function create() {
      if (!profile) return;
      var question = $(ids.question).value.trim();
      // querySelectorAll('textarea') et non 'input' : les champs de réponse
      // sont des <textarea> depuis le 3 septembre 2026 (voir pollAutoGrow) —
      // et la case "Plusieurs réponses possibles" est justement un <input>
      // qu'il ne faut surtout pas ramasser ici.
      var options = Array.prototype.slice.call($(ids.optionsBox).querySelectorAll('textarea'))
        .map(function (i) { return i.value.trim(); })
        .filter(function (v) { return v.length > 0; });
      var msgEl = $(ids.msg);
      if (!question) { msgEl.textContent = t('Écris une question.'); return; }
      if (options.length < 2) { msgEl.textContent = t('Il faut au moins deux réponses possibles.'); return; }

      msgEl.textContent = '';
      $(ids.createBtn).disabled = true;
      api('POST', '/api/polls', {
        userId: profile.id,
        scope: ids.scope,
        scopeId: scopeIdValue(),
        question: question,
        options: options,
        multiChoice: $(ids.multi).checked,
        anonymous: isAnonymousChecked(),
        closesAt: $(ids.closesAt).value || null,
      })
        .then(function () {
          resetForm();
          // Les deux instances (Communauté et Profil) montrent la même donnée :
          // on les rafraîchit toutes plutôt que la seule qui a servi à créer,
          // sinon l'autre reste périmée — même choix que
          // refreshAllProfilePostsComposers pour les messages.
          refreshAllPolls();
        })
        .catch(function (err) { msgEl.textContent = err.message; })
        .then(function () { $(ids.createBtn).disabled = false; });
    }

    function reset() {
      resetForm();
      load();
    }

    if (hasComposer()) {
      $(ids.addBtn).addEventListener('click', function () {
        var form = $(ids.form);
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
          // Les champs viennent d'apparaître : c'est le premier moment où leur
          // hauteur est mesurable (voir pollAutoGrow).
          growAllFields();
          $(ids.question).focus();
        }
      });
      $(ids.addOptionBtn).addEventListener('click', addOptionRow);
      // "Option" : choix multiple et date de clôture, repliés par défaut
      // (3 septembre 2026, demande d'Emilien). Ce sont les deux seuls réglages
      // facultatifs du sondage — la question et les réponses restent, elles,
      // toujours visibles.
      bindPollAutoGrow($(ids.question));
      $(ids.optionsBtn).addEventListener('click', function () {
        $(ids.advanced).classList.toggle('hidden');
      });
      if (anonymousBox()) anonymousBox().addEventListener('change', syncPrivacyHint);
      $(ids.createBtn).addEventListener('click', create);
      resetForm();
    }

    var instance = { load: load, reset: reset };
    pollsMounts.push(instance);
    return instance;
  }

  var communityPollsMount = mountPolls({
    scope: 'profile',
    scopeId: function () { return profile && profile.id; },
    root: 'communityPollsBlock', addBtn: 'communityPollsAddBtn', form: 'communityPollsForm',
    question: 'communityPollsQuestion', optionsBox: 'communityPollsOptions',
    addOptionBtn: 'communityPollsAddOptionBtn', optionsBtn: 'communityPollsOptionsBtn',
    advanced: 'communityPollsAdvanced', multi: 'communityPollsMulti',
    anonymous: 'communityPollsAnonymous', privacyHint: 'communityPollsPrivacyHint',
    closesAt: 'communityPollsClosesAt', createBtn: 'communityPollsCreateBtn',
    msg: 'communityPollsMsg', list: 'communityPollsList', emptyHint: 'communityPollsEmptyHint',
  });

  var profilePollsMount = mountPolls({
    scope: 'profile',
    scopeId: function () { return profile && profile.id; },
    root: 'profilePollsBlock', addBtn: 'profilePollsAddBtn', form: 'profilePollsForm',
    question: 'profilePollsQuestion', optionsBox: 'profilePollsOptions',
    addOptionBtn: 'profilePollsAddOptionBtn', optionsBtn: 'profilePollsOptionsBtn',
    advanced: 'profilePollsAdvanced', multi: 'profilePollsMulti',
    anonymous: 'profilePollsAnonymous', privacyHint: 'profilePollsPrivacyHint',
    closesAt: 'profilePollsClosesAt', createBtn: 'profilePollsCreateBtn',
    msg: 'profilePollsMsg', list: 'profilePollsList', emptyHint: 'profilePollsEmptyHint',
  });

  // Page de visite d'un profil : lecture + vote, jamais de création.
  var viewProfilePollsMount = mountPolls({
    scope: 'profile',
    scopeId: function () { return viewProfileUserId; },
    root: 'viewProfilePollsBlock', list: 'viewProfilePollsList',
    emptyHint: 'viewProfilePollsEmptyHint', authorClickable: false,
  });

  // Déplacé en haut à droite de Réglages, au-dessus d'Identité (29 août
  // 2026, demande d'Emilien) — anciennement un lien texte en bas de la
  // section Identité.
  $('logoutBtn').addEventListener('click', function () {
    if (!confirm(t('Se déconnecter de ce profil sur cet appareil ?'))) return;
    clearProfile();
    location.reload();
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
  // ⚠️ 3 septembre 2026 (Activité — général) : ce panneau était construit
  // DANS la boucle de renderActivitiesSettings et rangé derrière le "⋮" de
  // chaque ligne. Emilien a demandé qu'il déménage dans le menu "☰" de la
  // nouvelle page d'activité (« en haut à droite, il y a trois tirets avec
  // toutes les autres données : membres, supprimer activité »). Le code est
  // repris à l'IDENTIQUE — aucun bouton retiré, aucune règle métier changée —
  // il est simplement extrait dans une fonction, appelée à la demande à
  // l'ouverture du menu plutôt qu'une fois par ligne à chaque rendu de liste.
  //
  // `acts` sert uniquement à savoir s'il y a au moins deux activités (bouton
  // Fusionner) ; `sharedInfo` uniquement à savoir si "Voir les membres" a un
  // sens. Les deux viennent de lastRenderedActivities/lastRenderedShared.
  function buildActivitySettingsPanel(a, sharedInfo, acts) {
        var panel = document.createElement('div');
        panel.className = 'activitySettingsPanel';

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

        // Fusionner : verser une autre de mes activités dans celle-ci (ou
        // l'inverse — voir le sens décidé par le serveur). Proposé dès que j'ai
        // au moins deux activités ; le détail des cas impossibles (deux
        // activités partagées) est expliqué dans la boîte, pas ici.
        if (acts.length > 1) {
          var mergeBtn = document.createElement('button');
          mergeBtn.className = 'iconBtn';
          mergeBtn.textContent = t('Fusionner');
          mergeBtn.addEventListener('click', function () { openMergeActivityModal(a); });
          actionsWrap.appendChild(mergeBtn);
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
          openDeleteActivityModal(a);
        });
        actionsWrap.appendChild(delBtn);

        panel.appendChild(nameInput);
        panel.appendChild(colorBox);
        panel.appendChild(saveMsg);
        panel.appendChild(actionsWrap);
        return panel;
  }

  function renderActivitiesSettings(acts, sharedList) {
    var box = $('activitiesList');
    var shared = {};
    (sharedList || []).forEach(function (x) { shared[String(x.activityId)] = x; });

    // L'activité sélectionnée a pu être quittée/supprimée entre-temps (par
    // soi-même ou par le dernier autre membre) : on referme alors le détail
    // plutôt que de garder une sélection qui ne correspond plus à rien.
    //
    // ⚠️ 3 septembre 2026 (discussion "Sous-projets", débordement signalé) :
    // cette garde testait la présence de l'activité dans la liste des
    // activités PARTAGÉES — ce qui refermait aussitôt le détail de toute
    // activité solo, puisqu'elle n'y figure jamais. C'était sans conséquence
    // tant que le détail ne s'ouvrait que sur une activité partagée ; ça ne
    // l'est plus depuis que les sous-projets s'y affichent, y compris en solo.
    // Le test porte donc désormais sur l'EXISTENCE de l'activité (acts), et
    // non sur son partage. Le partage est mémorisé à part, pour que
    // loadActivityDetail sache s'il doit afficher la partie "membres".
    var stillExists = (acts || []).some(function (x) { return String(x.id) === String(currentCommunityActivityId); });
    if (currentCommunityActivityId && !stillExists) {
      currentCommunityActivityId = '';
      activityDetailEl().classList.add('hidden');
      stopDiscussionPolling();
      // L'activité affichée n'existe plus : sa page n'a plus rien à montrer.
      $('activityPage').classList.add('hidden');
    } else if (currentCommunityActivityId) {
      currentActivityIsShared = !!shared[String(currentCommunityActivityId)];
    }

    // Mémorisé pour la boîte de fusion (qui doit proposer les AUTRES activités
    // et savoir lesquelles sont partagées) et pour le menu "☰" de la page
    // d'activité, qui construit ses réglages à partir de ces deux valeurs.
    lastRenderedActivities = acts;
    lastRenderedShared = shared;

    // ⚠️ 3 septembre 2026 (Activité — général) : plus de detachActivityDetail()
    // ici. Le détail ne vit plus dans la liste, vider celle-ci ne peut donc
    // plus l'emporter avec elle.
    box.innerHTML = '';
    acts.forEach(function (a) {
      var sharedInfo = shared[String(a.id)];
      var isSelected = String(a.id) === String(currentCommunityActivityId);
      var row = document.createElement('div');
      row.className = 'activityRow' + (a.active ? '' : ' inactive') + (isSelected ? ' selected' : '');
      // Repère stable pour retrouver CETTE ligne depuis l'extérieur — utilisé
      // par le renvoi depuis une notification, qui doit ouvrir la page d'une
      // activité précise (voir openTabFromNotification). Ajouté par Communauté
      // le 3 septembre 2026, une ligne, sans effet sur le rendu.
      row.dataset.activityId = a.id;

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

      // ⚠️ 3 septembre 2026 (Activité — général), RETOUR EN ARRIÈRE demandé par
      // Emilien le jour même : « J'aimerais cependant que les réglages de
      // l'activité qui étaient dans les trois petits points retournent sur le
      // volet activité où se trouvent toutes les activités. Il doit se
      // présenter sous la même forme qu'auparavant sous les trois petits
      // points. » Le "⋮" avait été retiré d'ici quelques heures plus tôt au
      // profit d'un menu "☰" dans la page d'activité ; ce menu a donc été
      // supprimé à son tour, pour ne pas laisser deux chemins vers les mêmes
      // réglages. La ligne a de nouveau DEUX gestes distincts : le "⋮" ouvre
      // les réglages sur place, un clic ailleurs sur la ligne ouvre la page.
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


      // Panneau de réglages replié, rendu par la même fonction que celle
      // écrite lors du déménagement vers le "☰" — elle est simplement
      // rappelée ici. Le panneau naît replié : c'est le "⋮" qui le déplie.
      var panel = buildActivitySettingsPanel(a, sharedInfo, acts);
      panel.classList.add('hidden');
      row.appendChild(panel);

      menuBtn.addEventListener('click', function (e) {
        // ⚠️ Sans ça, le clic remonterait jusqu'à la ligne et ouvrirait la
        // page en même temps que le panneau — les deux gestes doivent rester
        // distincts.
        e.stopPropagation();
        panel.classList.toggle('hidden');
      });

      // Clic sur la ligne : ouvre la PAGE de l'activité.
      //
      // Historique de ce geste, en trois temps :
      //  · jusqu'au 2 septembre 2026, il n'ouvrait un détail que sur une
      //    activité PARTAGÉE et se rabattait sur les réglages en solo ;
      //  · le 3 septembre au matin (Sous-projets), il s'est mis à ouvrir le
      //    détail pour TOUTE activité, les sous-projets ayant tout leur sens
      //    en solo — c'est même leur cas d'usage principal ;
      //  · le 3 septembre (Activité — général, demande d'Emilien), il ouvre
      //    une vraie page plein écran au lieu d'un bloc déplié dans la liste.
      //
      // openActivityPage() porte à lui seul les quatre règles d'ouverture
      // décidées par Emilien — voir son commentaire.
      header.addEventListener('click', function () {
        openActivityPage(a, sharedInfo, row);
      });
      header.classList.add('clickable');

      box.appendChild(row);
    });

    // ⚠️ 3 septembre 2026 (Activité — général) : le détail ne vient plus se
    // placer DANS la ligne sélectionnée — il vit dans #activityPageBody, la
    // page d'activité. Vider #activitiesList ne peut donc plus le détruire, et
    // il n'y a plus rien à détacher puis rattacher à chaque rendu de liste (ce
    // qui, au passage, ne casse plus le défilement de la page quand la liste
    // se rafraîchit derrière elle). Filet conservé : si le nœud s'est retrouvé
    // ailleurs, on le remet dans la page.
    var detail = activityDetailEl();
    if (detail && detail.parentNode !== $('activityPageBody')) attachActivityDetail(null);

    // La page ouverte suit le rafraîchissement : si l'activité affichée vient
    // d'être renommée ou recolorée depuis un autre appareil, son en-tête doit
    // le refléter sans qu'on ait à la refermer.
    if (currentCommunityActivityId && !$('activityPage').classList.contains('hidden')) {
      (acts || []).forEach(function (x) {
        if (String(x.id) !== String(currentCommunityActivityId)) return;
        $('activityPageName').textContent = x.name;
        $('activityPageDot').style.background = x.color;
      });
    }
  }

  // ===================== FUSION DE DEUX ACTIVITÉS =====================
  // Verser une de mes activités dans une autre : les enregistrements des deux
  // s'additionnent. Possible seulement si au moins une des deux n'est
  // partagée avec personne (règle posée par Emilien) — et si l'une des deux
  // est partagée, c'est toujours ELLE qui reste, quel que soit le bouton par
  // lequel on est parti. Le serveur applique cette règle de son côté
  // (POST /api/activities/:id/merge) ; ici on l'explique avant d'agir, pour
  // que le sens de la fusion ne soit jamais une surprise.
  var lastRenderedActivities = [];
  var lastRenderedShared = {};
  var mergeFromActivity = null;   // celle dont on a ouvert le "⋮"
  var mergeOtherActivity = null;  // celle choisie dans la liste

  function isSharedActivity(activity) {
    return !!lastRenderedShared[String(activity.id)] || activity.membersCount > 1;
  }

  function openMergeActivityModal(activity) {
    mergeFromActivity = activity;
    mergeOtherActivity = null;
    $('mergeActivityModalTitle').textContent =
      t('Fusionner « {activity} » avec…', { activity: activity.name });
    $('mergeActivityMsg').textContent = '';
    showMergeStep('pick');
    renderMergeCandidates();
    $('mergeActivityModal').classList.remove('hidden');
  }

  function closeMergeActivityModal() {
    mergeFromActivity = null;
    mergeOtherActivity = null;
    $('mergeActivityModal').classList.add('hidden');
  }

  function showMergeStep(step) {
    $('mergeActivityStepPick').classList.toggle('hidden', step !== 'pick');
    $('mergeActivityStepConfirm').classList.toggle('hidden', step !== 'confirm');
  }

  function renderMergeCandidates() {
    var box = $('mergeActivityList');
    box.innerHTML = '';
    var fromShared = isSharedActivity(mergeFromActivity);

    lastRenderedActivities.forEach(function (other) {
      if (String(other.id) === String(mergeFromActivity.id)) return;

      var otherShared = isSharedActivity(other);
      var blocked = fromShared && otherShared; // les deux partagées : refusé

      var row = document.createElement('div');
      row.className = 'activityRow' + (blocked ? ' inactive' : '');

      var header = document.createElement('div');
      header.className = 'activityRowHeader' + (blocked ? '' : ' clickable');

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = other.color;
      header.appendChild(dot);

      var name = document.createElement('span');
      name.className = 'activityRowName';
      name.textContent = other.name;
      header.appendChild(name);

      row.appendChild(header);

      if (blocked) {
        var why = document.createElement('p');
        why.className = 'meta';
        why.textContent = t('Partagée elle aussi — impossible de fusionner deux activités partagées.');
        row.appendChild(why);
      } else {
        header.addEventListener('click', function () { pickMergeCandidate(other); });
      }

      box.appendChild(row);
    });

    if (!box.children.length) {
      var empty = document.createElement('p');
      empty.className = 'meta';
      empty.textContent = t('Aucune autre activité à fusionner avec celle-ci.');
      box.appendChild(empty);
    }
  }

  // Récapitulatif : le sens réel de la fusion est calculé ici avec la même
  // règle que le serveur, pour qu'il soit annoncé AVANT de cliquer.
  function pickMergeCandidate(other) {
    mergeOtherActivity = other;
    var from = mergeFromActivity;
    var kept = isSharedActivity(from) ? from : isSharedActivity(other) ? other : other;
    var removed = kept === from ? other : from;

    $('mergeActivitySummary').textContent = t(
      '« {removed} » disparaîtra et ses enregistrements seront ajoutés à « {kept} », qui garde son nom et sa couleur.',
      { removed: removed.name, kept: kept.name });
    $('mergeActivityMsg').textContent = '';
    showMergeStep('confirm');
  }

  function confirmMergeActivities() {
    if (!mergeFromActivity || !mergeOtherActivity) return;
    var from = mergeFromActivity;
    var other = mergeOtherActivity;
    // On envoie toujours l'autre comme destination souhaitée ; si l'une des
    // deux est partagée, le serveur redresse le sens de lui-même.
    var into = isSharedActivity(from) ? from.id : other.id;
    var startId = String(into) === String(from.id) ? other.id : from.id;

    $('mergeActivityConfirmBtn').disabled = true;
    $('mergeActivityMsg').textContent = '';
    api('POST', '/api/activities/' + startId + '/merge', { userId: profile.id, intoActivityId: into })
      .then(function (res) {
        // La boîte reste ouverte sur le résultat plutôt que de disparaître :
        // c'est la seule trace de ce qui vient d'être déplacé, et l'app n'a
        // pas de message flottant global. On la referme par "✕" ou par le
        // fond, comme les autres.
        mergeFromActivity = null;
        mergeOtherActivity = null;
        showMergeStep('done');
        $('mergeActivityMsg').textContent = t(res.message);
        refreshActivities().then(renderActivityGrid);
        loadSettingsActivities();
      })
      .catch(function (err) {
        $('mergeActivityMsg').textContent = err.message;
      })
      .finally(function () { $('mergeActivityConfirmBtn').disabled = false; });
  }

  $('mergeActivityConfirmBtn').addEventListener('click', confirmMergeActivities);
  $('mergeActivityBackBtn').addEventListener('click', function () {
    mergeOtherActivity = null;
    $('mergeActivityMsg').textContent = '';
    showMergeStep('pick');
  });
  $('mergeActivityModalClose').addEventListener('click', closeMergeActivityModal);
  $('mergeActivityModal').addEventListener('click', function (e) {
    if (e.target === this) closeMergeActivityModal();
  });

  // ===================== SUPPRESSION D'UNE ACTIVITÉ =====================
  // Deux confirm() natifs enchaînés posaient la question en "OK / Annuler" :
  // il fallait lire le texte pour savoir laquelle des deux touches supprimait
  // l'historique — et sur mobile, deux boîtes système de suite. Depuis le
  // 2 septembre 2026 (demande d'Emilien), une seule boîte, avec les deux
  // issues écrites sur les boutons. Rien n'est supprimé tant que l'une des
  // deux n'a pas été choisie ; "✕" et un clic sur le fond annulent.
  //
  // La suppression reste, comme avant, scopée à l'appelant : les autres
  // membres d'une activité partagée ne sont jamais concernés (voir
  // DELETE /api/activities/:id dans server/routes/activities.js).
  var pendingDeleteActivity = null;

  function openDeleteActivityModal(activity) {
    pendingDeleteActivity = activity;
    $('deleteActivityModalTitle').textContent =
      t('Supprimer « {activity} » ?', { activity: activity.name });
    $('deleteActivityModalMsg').textContent = '';
    setDeleteActivityBusy(false);
    $('deleteActivityModal').classList.remove('hidden');
  }

  function closeDeleteActivityModal() {
    pendingDeleteActivity = null;
    $('deleteActivityModal').classList.add('hidden');
  }

  function setDeleteActivityBusy(busy) {
    $('deleteActivityKeepBtn').disabled = busy;
    $('deleteActivityPurgeBtn').disabled = busy;
  }

  function confirmDeleteActivity(keepHistory) {
    if (!pendingDeleteActivity) return;
    var activity = pendingDeleteActivity;
    setDeleteActivityBusy(true);
    $('deleteActivityModalMsg').textContent = '';
    api('DELETE', '/api/activities/' + activity.id + '?userId=' + profile.id +
        '&keepHistory=' + (keepHistory ? '1' : '0'))
      .then(function () {
        closeDeleteActivityModal();
        refreshActivities().then(renderActivityGrid);
        loadSettingsActivities();
      })
      .catch(function (err) {
        // Cas courant : un chrono tourne encore sur cette activité (409). On
        // garde la boîte ouverte avec le message, plutôt qu'une alerte
        // système par-dessus.
        setDeleteActivityBusy(false);
        $('deleteActivityModalMsg').textContent = err.message;
      });
  }

  $('deleteActivityKeepBtn').addEventListener('click', function () { confirmDeleteActivity(true); });
  $('deleteActivityPurgeBtn').addEventListener('click', function () { confirmDeleteActivity(false); });
  $('deleteActivityModalClose').addEventListener('click', closeDeleteActivityModal);
  $('deleteActivityModal').addEventListener('click', function (e) {
    if (e.target === this) closeDeleteActivityModal(); // clic sur le fond
  });

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
