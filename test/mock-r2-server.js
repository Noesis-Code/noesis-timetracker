// Faux serveur S3/R2, utilisé uniquement pour les tests (pas d'authentification
// réelle de Cloudflare — voir la limite documentée dans GUIDE-SAUVEGARDE-R2.md).
// Lancé dans un PROCESS SÉPARÉ quand un test doit aussi exécuter une commande
// synchrone (execFileSync) qui parlerait à ce serveur : un serveur et son
// client dans le même process gèlent tous les deux si le client bloque la
// boucle d'événements (piège documenté dans noesis-timetracker-sauvegardes.md).

const http = require('http');
const { URL } = require('url');

const store = new Map(); // key -> { body: Buffer, lastModified: string }

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const parts = u.pathname.slice(1).split('/');
  const bucket = parts.shift();
  const key = parts.join('/');

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    if (req.method === 'PUT' && key) {
      store.set(key, { body, lastModified: new Date().toISOString() });
      res.writeHead(200);
      return res.end();
    }

    if (req.method === 'GET' && key) {
      const obj = store.get(key);
      if (!obj) {
        res.writeHead(404);
        return res.end('NoSuchKey');
      }
      res.writeHead(200);
      return res.end(obj.body);
    }

    if (req.method === 'DELETE' && key) {
      store.delete(key);
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET' && !key) {
      // ListObjectsV2
      const prefix = u.searchParams.get('prefix') || '';
      const matching = Array.from(store.entries())
        .filter(([k]) => k.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : 1));
      const contents = matching
        .map(
          ([k, v]) =>
            `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${v.lastModified}</LastModified><Size>${v.body.length}</Size></Contents>`
        )
        .join('');
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end(
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`
      );
    }

    res.writeHead(400);
    res.end('unsupported');
  });
});

const port = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 0;
server.listen(port, '127.0.0.1', () => {
  const actualPort = server.address().port;
  if (process.send) {
    process.send({ ready: true, port: actualPort });
  } else {
    console.log(`MOCK_R2_PORT=${actualPort}`);
  }
});

process.on('message', (msg) => {
  if (msg === 'stop') {
    server.close(() => process.exit(0));
  }
  if (msg === 'clear') {
    store.clear();
  }
});
