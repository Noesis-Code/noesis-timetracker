// Pages web publiques des documents légaux (adresse exigée par l'App Store et Google Play).
// Aucune copie du texte : il est lu à la volée dans public/index.html (français) et public/legal-en.js (anglais),
// et le HTML généré est mis en cache tant que ces deux fichiers ne changent pas (date de modification).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const INDEX = path.join(PUBLIC_DIR, 'index.html');
const LEGAL_EN = path.join(PUBLIC_DIR, 'legal-en.js');

// chemin -> modale source, langue, titre de la page
const PAGES = {
  '/confidentialite': { id: 'privacyPolicyModal', lang: 'fr', title: 'Politique de confidentialité' },
  '/conditions': { id: 'legalTermsModal', lang: 'fr', title: 'Conditions d’utilisation' },
  '/mentions-legales': { id: 'legalNoticesModal', lang: 'fr', title: 'Mentions légales' },
  '/en/privacy': { id: 'privacyPolicyModal', lang: 'en', title: 'Privacy Policy' },
  '/en/terms': { id: 'legalTermsModal', lang: 'en', title: 'Terms of Use' },
  '/en/legal-notice': { id: 'legalNoticesModal', lang: 'en', title: 'Legal Notice' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frenchBody(html, id) {
  const start = html.indexOf('<div id="' + id + '"');
  if (start < 0) return null;
  const open = '<div class="legalTermsBody">';
  const b = html.indexOf(open, start);
  if (b < 0) return null;
  const from = b + open.length;
  const end = html.indexOf('</div>', from); // le corps ne contient aucun div imbriqué
  return end < 0 ? null : html.slice(from, end);
}

function englishDocs(src) {
  const a = src.indexOf('var EN = {};');
  const z = src.indexOf('var DOC_IDS');
  if (a < 0 || z < 0) return {};
  const ctx = {};
  vm.runInNewContext(src.slice(a, z) + '\nthis.EN = EN;', ctx);
  return ctx.EN || {};
}

const PAGE = (lang, title, body) => '<!doctype html>\n<html lang="' + lang + '">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>Noèsis — ' + esc(title) + '</title>\n<style>\n' +
  'html{background:#0b0a0a}body{margin:0;background:#0b0a0a;color:#f3eee8;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}\n' +
  'main{max-width:720px;margin:0 auto;padding:24px 16px 48px}h1{font-size:26px;margin:16px 0 24px}h3{font-size:18px;margin:32px 0 8px}\n' +
  'p{margin:0 0 16px}a{color:#9c8cc8}.hint{color:#a59e96}.retour{display:inline-block;padding:12px 0}\n' +
  '</style>\n</head>\n<body>\n<main>\n<a class="retour" href="/">← ' + (lang === 'en' ? 'Back' : 'Retour') + '</a>\n<h1>' + esc(title) + '</h1>\n' +
  body + '\n</main>\n</body>\n</html>\n';

let cache = { key: '', pages: {} };
function build() {
  const key = [INDEX, LEGAL_EN].map((f) => fs.statSync(f).mtimeMs).join('|');
  if (cache.key === key) return cache.pages;
  const html = fs.readFileSync(INDEX, 'utf8');
  const en = englishDocs(fs.readFileSync(LEGAL_EN, 'utf8'));
  const pages = {};
  for (const [p, d] of Object.entries(PAGES)) {
    const body = d.lang === 'en' ? (en[d.id] && en[d.id].body) : frenchBody(html, d.id);
    if (body) pages[p] = PAGE(d.lang, d.title, body);
  }
  cache = { key, pages };
  return pages;
}

// Sert la page si le chemin en est une (GET/HEAD) ; renvoie true si traité.
function serve(req, res) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !PAGES[req.path]) return false;
  let page;
  try { page = build()[req.path]; } catch (e) { page = null; }
  if (!page) { res.status(500).type('text/plain').send('Indisponible'); return true; }
  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(page);
  return true;
}

module.exports = { serve, PATHS: Object.keys(PAGES) };
