/* Noèsis TimeTracker — file d'attente hors ligne des tâches capturées
 * (22 septembre 2026, discussion « Capture hors ligne », cadrée avec Emilien
 * via AskUserQuestion).
 *
 * Décisions d'Emilien :
 *   - capture hors ligne SEULEMENT (raccourci d'icône PWA abandonné) ;
 *   - stockage IndexedDB (lisible par le service worker, contrairement à
 *     localStorage) ;
 *   - synchronisation HYBRIDE : Background Sync quand le navigateur l'offre
 *     (Chrome/Android), sinon au retour du réseau ('online') et au prochain
 *     chargement de l'app ;
 *   - affichage : zone « À classer » dans la bulle de capture — hors ligne,
 *     l'IA ne peut pas choisir le pôle/secteur, la tâche ne peut donc pas
 *     encore apparaître dans sa liste.
 *
 * Chargé À LA FOIS par la page (<script> dans index.html) et par le service
 * worker (importScripts dans sw.js) : aucune dépendance au DOM ni à app.js.
 * Expose un seul objet global, self.NoesisAutoTaskQueue.
 *
 * Côté serveur : rien de nouveau. Chaque entrée est envoyée telle quelle à
 * POST /api/activities/:id/goals/categories/auto-task (userId lu depuis le
 * témoin de session, comme pour une capture en ligne).
 *
 * 20 nov. 2026 (Émilien) : la CRÉATION D'UN OBJECTIF sans réseau passe par la
 * même file (entrée kind:'objectif', corps complet dans `body`) et la même voie
 * d'envoi, vers POST /api/objectifs avec la même clé d'idempotence. Le serveur
 * applique ses règles à la synchronisation (échéance, une case, parent…) ; s'il
 * refuse, l'objectif RESTE dans la file, marqué `failed` + message du serveur
 * (jamais rejoué, jamais perdu), et reste affiché dans la zone « À classer ».
 *
 * Une seule voie d'envoi à la fois, pour ne jamais créer une tâche en double :
 * si Background Sync est disponible, SEUL le service worker vide la file ;
 * sinon, SEULE la page le fait (voir app.js, flushOfflineAutoTasks).
 */
(function (root) {
  'use strict';

  var DB_NAME = 'noesis-offline';
  var DB_VERSION = 1;
  var STORE = 'autoTaskQueue';
  var SYNC_TAG = 'noesis-autotask';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var result;
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
        result = fn(tx.objectStore(STORE));
      });
    });
  }

  // entry : { activityId, label, tz }
  // Libellé vide refusé ; une même saisie répétée dans les 5 s (double appui)
  // n'est mise en file qu'une fois.
  var DEDUPE_MS = 5000;
  // Clé d'idempotence unique par élément : un renvoi après coupure (envoi réussi
  // mais élément pas encore retiré) ne crée pas de doublon côté serveur.
  function newKey() {
    var c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function add(entry) {
    var label = String(entry.label == null ? '' : entry.label).trim();
    if (!label) return Promise.reject(new Error('Libellé vide'));
    var record = {
      activityId: String(entry.activityId),
      label: label,
      tz: entry.tz || null,
      createdAt: Date.now(),
      key: newKey(),
    };
    // Date (AAAA-MM-JJ) et exécutant choisis dans la barre « Nouvelle tâche… » : gardés tels quels, rejoués à la synchronisation (20 nov. 2026).
    if (entry.dueDate) record.dueDate = String(entry.dueDate);
    if (entry.plannedUserId) record.plannedUserId = String(entry.plannedUserId);
    return list().then(function (items) {
      var twin = items.filter(function (it) {
        return it.kind !== 'objectif' && it.activityId === record.activityId && it.label === record.label && (it.dueDate || '') === (record.dueDate || '') && (it.plannedUserId || '') === (record.plannedUserId || '') && record.createdAt - it.createdAt < DEDUPE_MS;
      })[0];
      if (twin) return twin;
      return withStore('readwrite', function (store) {
        var req = store.add(record);
        req.onsuccess = function () { record.id = req.result; };
        return record;
      }).then(function () { return record; });
    });
  }

  // Objectif créé sans réseau : body = corps de POST /api/objectifs. Même
  // anti-doublon (double appui) que pour les tâches.
  function addObjectif(entry) {
    var label = String(entry.label == null ? '' : entry.label).trim();
    if (!label || !entry.body) return Promise.reject(new Error('Libellé vide'));
    var record = {
      kind: 'objectif',
      activityId: String(entry.activityId),
      label: label,
      body: entry.body,
      tz: entry.tz || null,
      createdAt: Date.now(),
      key: newKey(),
    };
    return list().then(function (items) {
      var twin = items.filter(function (it) {
        return it.kind === 'objectif' && it.activityId === record.activityId && it.label === record.label && record.createdAt - it.createdAt < DEDUPE_MS;
      })[0];
      if (twin) return twin;
      return withStore('readwrite', function (store) {
        var req = store.add(record);
        req.onsuccess = function () { record.id = req.result; };
        return record;
      }).then(function () { return record; });
    });
  }

  function markFailed(it, error) {
    it.failed = true; it.error = error;
    return withStore('readwrite', function (store) { store.put(it); });
  }

  function list() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  }

  function remove(id) {
    return withStore('readwrite', function (store) { store.delete(id); });
  }

  // Envoie les entrées une par une, dans l'ordre de capture.
  // Résultat : { synced: [{activityId, label, categoryLabel}], failed:
  // [{activityId, label, error}], remaining: n, stopped: bool }.
  //   - 2xx               → retirée de la file, classée par l'IA ;
  //   - réseau / 5xx / 429 / 408 / 425 / 401 → on s'arrête, tout reste en file (nouvel
  //     essai plus tard ; un 401 attend la reconnexion du profil) ;
  //   - autre 4xx (activité quittée ou supprimée, libellé refusé…) → retirée
  //     de la file et signalée, sinon elle bloquerait toutes les suivantes
  //     indéfiniment.
  // Corps d'une tâche : libellé + date et exécutant choisis hors ligne, s'il y en a.
  function taskBody(it) {
    var b = { label: it.label };
    if (it.dueDate) b.dueDate = it.dueDate;
    if (it.plannedUserId) b.plannedUserId = it.plannedUserId;
    return b;
  }
  var FLUSH_TIMEOUT_MS = 60000; // classement par IA : plus long qu'une requête ordinaire
  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    var out = { synced: [], failed: [], remaining: 0, stopped: false };
    flushing = list().then(function (items) {
      // Un objectif refusé par le serveur est gardé 7 jours (visible), puis purgé.
      items.forEach(function (it) { if (it.failed && Date.now() - it.createdAt > 7 * 86400000) remove(it.id); });
      items = items.filter(function (it) { return !it.failed; }).sort(function (a, b) { return a.id - b.id; });
      var i = 0;
      function next() {
        if (i >= items.length) return out;
        var it = items[i++];
        var headers = { 'Content-Type': 'application/json' };
        if (it.tz) headers['X-Client-Tz'] = it.tz;
        if (it.key) headers['Idempotency-Key'] = it.key;
        // Délai maximal (20 oct. 2026) : un lien qui ne répond jamais ne bloque plus toute la file ; la clé d'idempotence rend le rejeu sans doublon.
        var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FLUSH_TIMEOUT_MS) : null;
        var isObj = it.kind === 'objectif';
        return fetch(isObj ? '/api/objectifs' : '/api/activities/' + encodeURIComponent(it.activityId) + '/goals/categories/auto-task', {
          method: 'POST',
          headers: headers,
          credentials: 'same-origin',
          body: JSON.stringify(isObj ? it.body : taskBody(it)),
          signal: ctrl ? ctrl.signal : undefined,
        }).then(function (r) {
          if (timer) clearTimeout(timer);
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (r.ok) {
              out.synced.push({
                kind: it.kind || 'tache',
                activityId: it.activityId,
                label: it.label,
                categoryLabel: (data && (data.categoryLabel || data.categoryKey)) || '',
              });
              return remove(it.id).then(next);
            }
            if (r.status >= 500 || r.status === 429 || r.status === 401 || r.status === 408 || r.status === 425) {
              out.stopped = true;
              out.remaining = items.length - i + 1;
              return out;
            }
            var msg = (data && data.error) || ('HTTP ' + r.status);
            // Un objectif, ou une tâche qui porte une date / un exécutant (ex. date devenue passée : « Pas de date dans le passé. »), refusé n'est jamais effacé : il reste dans la file, marqué en échec avec le message du serveur.
            var keep = isObj || !!(it.dueDate || it.plannedUserId);
            out.failed.push({ kind: it.kind || 'tache', activityId: it.activityId, label: it.label, error: msg, kept: keep });
            return (keep ? markFailed(it, msg) : remove(it.id)).then(next);
          });
        }, function () {
          if (timer) clearTimeout(timer);
          out.stopped = true;
          out.remaining = items.length - i + 1;
          return out;
        });
      }
      return next();
    }).then(function (res) { flushing = null; return res; }, function (err) { flushing = null; throw err; });
    return flushing;
  }

  root.NoesisAutoTaskQueue = {
    SYNC_TAG: SYNC_TAG,
    add: add,
    addObjectif: addObjectif,
    list: list,
    remove: remove,
    flush: flush,
  };
})(typeof self !== 'undefined' ? self : this);
