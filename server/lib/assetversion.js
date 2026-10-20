// Version d'URL des ressources statiques (?v=<hash du contenu>) : l'URL change dès que le fichier change,
// ce qui permet un cache long « immutable » sans risque de version périmée. (20 oct. 2026)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const memo = new Map(); // chemin -> { sig, hash }

function versionOf(publicDir, urlPath, fallback) {
  try {
    const file = path.join(publicDir, urlPath);
    const st = fs.statSync(file);
    const sig = st.mtimeMs + ':' + st.size;
    const m = memo.get(file);
    if (m && m.sig === sig) return m.hash;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
    memo.set(file, { sig, hash });
    return hash;
  } catch (e) {
    return fallback;
  }
}

// Ajoute ?v=<hash> aux <script src> / <link href> locaux .js / .css d'index.html.
function versionHtml(html, publicDir, fallback) {
  return html.replace(/((?:src|href)=")(\/(?:[\w-]+\/)?[\w.-]+\.(?:js|css))"/g, (all, a, url) => a + url + '?v=' + versionOf(publicDir, url, fallback) + '"');
}

module.exports = { versionOf, versionHtml };
