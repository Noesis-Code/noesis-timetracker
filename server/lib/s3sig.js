// Signature AWS SigV4, écrite à la main avec le module `crypto` natif de
// Node — aucune dépendance npm ajoutée (aws-sdk pèserait plusieurs Mo pour
// signer trois requêtes HTTP par jour). Compatible Cloudflare R2, qui parle
// l'API S3 avec SigV4 (region "auto", service "s3").
//
// Validé contre les deux vecteurs de test officiels d'AWS (GET Object et
// PUT Object, suite "aws-sig-v4-test-suite") — voir test/s3sig.test.js.
// C'est la seule façon fiable de prouver une implémentation maison sans
// disposer de vraies clés au moment d'écrire ce fichier.

const crypto = require('crypto');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function amzDate(date) {
  // YYYYMMDDTHHMMSSZ
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(date) {
  return amzDate(date).slice(0, 8);
}

function uriEncode(str, encodeSlash) {
  // Encodage "S3-safe" recommandé par AWS : encodeURIComponent puis
  // correction des caractères qu'il encode à tort par rapport au spec RFC
  // 3986 utilisé par SigV4 (!, ', (, ), *), et préservation optionnelle du
  // '/' (chemin d'objet) sans l'encoder.
  let out = encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  if (!encodeSlash) out = out.replace(/%2F/g, '/');
  return out;
}

function canonicalQueryString(query) {
  const keys = Object.keys(query || {}).sort();
  return keys
    .map((k) => `${uriEncode(k, true)}=${uriEncode(String(query[k]), true)}`)
    .join('&');
}

function getSigningKey(secretKey, date, region, service) {
  const kDate = hmac('AWS4' + secretKey, dateStamp(date));
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/**
 * Construit les en-têtes signés SigV4 pour une requête S3/R2.
 *
 * @param {object} opts
 * @param {string} opts.method       'GET' | 'PUT' | 'DELETE'
 * @param {string} opts.host         hôte de l'endpoint (sans https://)
 * @param {string} opts.path         chemin de l'objet, commence par '/', DÉJÀ encodé
 * @param {object} [opts.query]      paramètres de requête (ex. list-type=2)
 * @param {Buffer} [opts.body]       corps de la requête (PUT), Buffer vide sinon
 * @param {object} [opts.headers]    en-têtes additionnels à inclure dans la signature
 * @param {string} opts.accessKeyId
 * @param {string} opts.secretAccessKey
 * @param {string} opts.region       'auto' pour R2
 * @param {Date}   [opts.date]       pour les tests ; Date.now() sinon
 * @returns {{headers: object, url: string}}
 */
function signRequest(opts) {
  const {
    method,
    host,
    path: reqPath,
    query = {},
    body = Buffer.alloc(0),
    headers: extraHeaders = {},
    accessKeyId,
    secretAccessKey,
    region = 'auto',
    service = 's3',
    date = new Date(),
    protocol = 'https:',
  } = opts;

  const xAmzDate = amzDate(date);
  const payloadHash = sha256Hex(body);

  const headers = Object.assign(
    {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': xAmzDate,
    },
    extraHeaders
  );

  const signedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    method,
    reqPath,
    canonicalQueryString(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp(date)}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xAmzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, date, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalHeaders = Object.assign({}, headers, { Authorization: authorization });
  delete finalHeaders.host; // fourni par le client HTTP, ne doit pas être envoyé deux fois

  const qs = canonicalQueryString(query);
  const url = `${protocol}//${host}${reqPath}${qs ? '?' + qs : ''}`;

  return { headers: finalHeaders, url, canonicalRequest, stringToSign };
}

module.exports = { signRequest, sha256Hex, uriEncode, amzDate, dateStamp };
