// Client S3 minimal — seulement les quatre opérations dont les sauvegardes
// ont besoin (put, get, list, delete). Aucune dépendance npm : signature
// maison (./s3sig.js) + https natif de Node.
//
// Écrit à l'origine pour Cloudflare R2 ; le 7 septembre 2026, généralisé en
// client S3 pur (sans rien de spécifique à un fournisseur) lors d'un
// aller-retour Cloudflare R2 → OVHcloud → Cloudflare R2 — voir
// noesis-timetracker-sauvegardes.md pour l'historique complet. Le fichier
// garde son nom (r2client.js) pour limiter le nombre de fichiers touchés à
// chaque changement de fournisseur ; le contenu, lui, ne connaît plus rien
// de spécifique à Cloudflare, OVHcloud ou tout autre fournisseur S3 —
// seulement l'API S3 standard (endpoint et région passés en paramètre,
// aucune valeur par défaut).

const https = require('https');
const http = require('http');
const { signRequest } = require('./s3sig');

function request({ method, host, path, query, body, headers, accessKeyId, secretAccessKey, region, protocol }) {
  const buf = body || Buffer.alloc(0);
  const { headers: signedHeaders, url } = signRequest({
    method,
    host,
    path,
    query,
    body: buf,
    headers,
    accessKeyId,
    secretAccessKey,
    region,
    protocol,
  });

  const transport = protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      { method, headers: signedHeaders, timeout: 30000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('S3 request timeout')));
    if (buf.length) req.write(buf);
    req.end();
  });
}

function makeClient({ bucket, accessKeyId, secretAccessKey, endpoint, region }) {
  if (!endpoint) {
    throw new Error(
      "makeClient: 'endpoint' requis (ex. https://<compte>.eu.r2.cloudflarestorage.com pour Cloudflare R2 en UE) — ce client ne devine plus aucune valeur par défaut depuis le 7 septembre 2026, voir l'en-tête du fichier."
    );
  }
  if (!region) {
    throw new Error(
      "makeClient: 'region' requise, doit correspondre à la région de l'endpoint (ex. \"gra\" pour Gravelines) — la signature SigV4 échoue silencieusement sinon."
    );
  }
  // http:// n'est accepté que pour un endpoint explicite (tests locaux) : un
  // vrai fournisseur S3 n'est jamais parlé qu'en https.
  const protocol = endpoint.startsWith('http://') ? 'http:' : 'https:';
  const host = endpoint.replace(/^https?:\/\//, '');

  function objectPath(key) {
    return `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async function putObject(key, body) {
    const res = await request({
      method: 'PUT',
      host,
      path: objectPath(key),
      body,
      headers: { 'content-length': String(body.length) },
      accessKeyId,
      secretAccessKey,
      region,
      protocol,
    });
    if (res.statusCode >= 300) {
      throw new Error(`S3 putObject ${key} → HTTP ${res.statusCode}: ${res.body.toString('utf8').slice(0, 500)}`);
    }
    return res;
  }

  async function getObject(key) {
    const res = await request({
      method: 'GET',
      host,
      path: objectPath(key),
      accessKeyId,
      secretAccessKey,
      region,
      protocol,
    });
    if (res.statusCode >= 300) {
      throw new Error(`S3 getObject ${key} → HTTP ${res.statusCode}: ${res.body.toString('utf8').slice(0, 500)}`);
    }
    return res.body;
  }

  async function deleteObject(key) {
    const res = await request({
      method: 'DELETE',
      host,
      path: objectPath(key),
      accessKeyId,
      secretAccessKey,
      region,
      protocol,
    });
    if (res.statusCode >= 300 && res.statusCode !== 404) {
      throw new Error(`S3 deleteObject ${key} → HTTP ${res.statusCode}: ${res.body.toString('utf8').slice(0, 500)}`);
    }
    return res;
  }

  // Liste les objets sous un préfixe (ListObjectsV2, sans dépendance XML —
  // parsing minimal par regex, suffisant pour les clés/tailles/dates que
  // nous utilisons, sans introduire de dépendance XML juste pour ça).
  async function listObjects(prefix) {
    const keys = [];
    let continuationToken;
    do {
      const query = { 'list-type': '2', prefix };
      if (continuationToken) query['continuation-token'] = continuationToken;
      const res = await request({
        method: 'GET',
        host,
        path: `/${bucket}`,
        query,
        accessKeyId,
        secretAccessKey,
        region,
        protocol,
      });
      if (res.statusCode >= 300) {
        throw new Error(`S3 listObjects → HTTP ${res.statusCode}: ${res.body.toString('utf8').slice(0, 500)}`);
      }
      const xml = res.body.toString('utf8');
      const contentsBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
      for (const block of contentsBlocks) {
        const key = (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
        const lastModified = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1];
        const size = (block.match(/<Size>([\s\S]*?)<\/Size>/) || [])[1];
        if (key) keys.push({ key: decodeXmlEntities(key), lastModified, size: size ? Number(size) : 0 });
      }
      const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      continuationToken = isTruncated
        ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1]
        : null;
    } while (continuationToken);
    return keys;
  }

  return { putObject, getObject, deleteObject, listObjects };
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

module.exports = { makeClient };
