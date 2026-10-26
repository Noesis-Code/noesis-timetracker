/* Face ID / Touch ID (clés d'accès WebAuthn) côté navigateur : conversions base64url <-> octets, appel de navigator.credentials, JSON prêt pour le serveur.
   Aucun stockage navigateur : rien n'est gardé (ni identifiant, ni clé). Serveur : server/routes/passkeys.js (26 oct. 2026, demande d'Émilien). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function toBuf(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var b = atob(s), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a.buffer;
  }
  function toB64u(buf) {
    var a = new Uint8Array(buf), s = '';
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function desc(list) { return (list || []).map(function (c) { return { type: c.type, id: toBuf(c.id), transports: c.transports }; }); }
  function supported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && navigator.credentials.get && window.isSecureContext);
  }
  // Nom de l'appareil montré dans la liste (« iPhone », « Mac »…), sans rien envoyer d'autre.
  function deviceName() {
    var ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return (navigator.maxTouchPoints > 1) ? 'iPad' : 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Appareil';
  }
  function common(c) {
    return { id: c.id, rawId: toB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, authenticatorAttachment: c.authenticatorAttachment || undefined };
  }
  function create(o) {
    var pk = { rp: o.rp, user: { id: toBuf(o.user.id), name: o.user.name, displayName: o.user.displayName }, challenge: toBuf(o.challenge), pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout, attestation: 'none', authenticatorSelection: o.authenticatorSelection, excludeCredentials: desc(o.excludeCredentials) };
    return navigator.credentials.create({ publicKey: pk }).then(function (c) {
      var r = c.response, out = common(c);
      out.response = { clientDataJSON: toB64u(r.clientDataJSON), attestationObject: toB64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] };
      return out;
    });
  }
  function get(o) {
    var pk = { challenge: toBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: 'required', allowCredentials: desc(o.allowCredentials) };
    return navigator.credentials.get({ publicKey: pk }).then(function (c) {
      var r = c.response, out = common(c);
      out.response = { clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature), userHandle: r.userHandle ? toB64u(r.userHandle) : undefined };
      return out;
    });
  }
  TMT.passkey = { supported: supported, create: create, get: get, deviceName: deviceName };
})();
