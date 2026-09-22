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
  function add(entry) {
    var record = {
      activityId: String(entry.activityId),
      label: String(entry.label),
      tz: entry.tz || null,
      createdAt: Date.now(),
    };
    return withStore('readwrite', function (store) {
      var req = store.add(record);
      req.onsuccess = function () { record.id = req.result; };
      return record;
    }).then(function () { return record; });
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
  //   - réseau / 5xx / 429 / 401 → on s'arrête, tout reste en file (nouvel
  //     essai plus tard ; un 401 attend la reconnexion du profil) ;
  //   - autre 4xx (activité quittée ou supprimée, libellé refusé…) → retirée
  //     de la file et signalée, sinon elle bloquerait toutes les suivantes
  //     indéfiniment.
  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    var out = { synced: [], failed: [], remaining: 0, stopped: false };
    flushing = list().then(function (items) {
      items.sort(function (a, b) { return a.id - b.id; });
      var i = 0;
      function next() {
        if (i >= items.length) return out;
        var it = items[i++];
        var headers = { 'Content-Type': 'application/json' };
        if (it.tz) headers['X-Client-Tz'] = it.tz;
        return fetch('/api/activities/' + encodeURIComponent(it.activityId) + '/goals/categories/auto-task', {
          method: 'POST',
          headers: headers,
          credentials: 'same-origin',
          body: JSON.stringify({ label: it.label }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (r.ok) {
              out.synced.push({
                activityId: it.activityId,
                label: it.label,
                categoryLabel: (data && (data.categoryLabel || data.categoryKey)) || '',
              });
              return remove(it.id).then(next);
            }
            if (r.status >= 500 || r.status === 429 || r.status === 401) {
              out.stopped = true;
              out.remaining = items.length - i + 1;
              return out;
            }
            out.failed.push({ activityId: it.activityId, label: it.label, error: (data && data.error) || ('HTTP ' + r.status) });
            return remove(it.id).then(next);
          });
        }, function () {
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
    list: list,
    remove: remove,
    flush: flush,
  };
})(typeof self !== 'undefined' ? self : this);
