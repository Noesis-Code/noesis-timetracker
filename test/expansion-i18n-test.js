// Garde i18n Expansion (20 oct. 2026) : toute chaîne de la carte Expansion, de la fenêtre d'abonnement, du panneau
// « J'ai un code » et des erreurs serveur d'achat/code doit avoir une traduction EN, et aucune chaîne FR ne doit rester
// en dur dans le code du panneau. Analyse de texte + vrai dictionnaire (public/i18n.js). Usage : node test/expansion-i18n-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok  ' + m);

// Dictionnaire réel : i18n.js chargé dans un contexte minimal, langue EN.
const win = { }; win.window = win;
vm.runInNewContext(rd('public/i18n.js'), Object.assign(win, { document: { documentElement: { setAttribute() {} } }, console }));
win.NoesisI18n.setLang('en');
const t = win.NoesisI18n.t;
const SAME_IN_EN = new Set(['Expansion']); // identique dans les deux langues
const translated = (s) => SAME_IN_EN.has(s) || t(s) !== s;

// Textes visibles d'un fragment HTML : nœuds de texte + placeholder / aria-label / title.
function htmlTexts(h) {
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of h.matchAll(/\b(?:placeholder|aria-label|title)="([^"]+)"/g)) out.push(m[1]);
  for (const piece of h.split(/<[^>]*>/)) { const s = piece.replace(/\s+/g, ' ').trim(); if (s && /[A-Za-zÀ-ÿ]{2,}/.test(s) && s !== '✕') out.push(s); }
  return out;
}
function between(src, a, b) {
  const i = src.indexOf(a); if (i < 0) { fail('repère introuvable : ' + a); return ''; }
  const j = src.indexOf(b, i + a.length); if (j < 0) { fail('repère introuvable : ' + b); return ''; }
  return src.slice(i, j);
}

const page1 = rd('public/js/objectifs-page1.js');
const codeJs = rd('public/js/objectifs-offre1-code.js');
const indexHtml = rd('public/index.html');
const appJs = rd('public/app.js');
const checkoutRoute = rd('server/routes/offercheckout.js');
const accessRoute = rd('server/routes/offer1access.js');

const groups = {
  'carte Expansion (objectifs-page1.js)': htmlTexts(between(page1, '<div id="offer1Section">', 'Historique des tâches capturées')),
  'fenêtre Souscrire (index.html)': htmlTexts(between(indexHtml, '<div id="offer1CheckoutModal"', '<!-- Visionneuse')),
  'panneau J’ai un code (objectifs-offre1-code.js)': htmlTexts(between(codeJs, '<div id="offer1CodePage"', '</div>`);')),
};
// Littéraux passés à t('...') dans le bloc Expansion de app.js, et messages posés par le panneau code.
const appBlock = between(appJs, 'function loadOffer1SubscribedSection', "SUPPRESSION D'UNE ACTIVITÉ");
groups['app.js (t() du bloc Expansion)'] = [...appBlock.matchAll(/\bt\((["'])((?:(?!\1).)+)\1\)/g)].map((m) => m[2]);
groups['messages du panneau code'] = [...codeJs.matchAll(/\bt\((["'])((?:(?!\1).)+)\1\)/g)].map((m) => m[2]);
// Erreurs serveur FR affichées telles quelles (api() les passe par t()) ; les tr(req, fr, en) sont déjà bilingues.
const srv = [];
for (const src0 of [checkoutRoute, accessRoute]) {
  const src = src0.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  for (const m of src.matchAll(/error: (?!tr\()(["'])((?:\\.|(?!\1).)+)\1/g)) srv.push(m[2].replace(/\\u2019/g, '’').replace(/\\'/g, "'"));
}
const SERVER_ONLY = new Set(["ageDeclaration requis : 'adult' ou 'minor'."]); // message de développeur, jamais affiché
groups['erreurs serveur (offercheckout.js, offer1access.js)'] = srv.filter((s) => !SERVER_ONLY.has(s));
// Messages à valeur variable : doivent passer par un motif de traduction.
groups['erreurs serveur à valeur variable'] = ['Nom d’activité trop long (60 caractères maximum).'.replace('’', "'"), 'Tu as déjà une activité "Test".'];

for (const [name, list] of Object.entries(groups)) {
  const uniq = [...new Set(list)];
  if (!uniq.length) { fail(name + ' : aucune chaîne trouvée (extraction cassée ?)'); continue; }
  const missing = uniq.filter((s) => !translated(s));
  if (missing.length) missing.forEach((s) => fail(name + ' : pas de traduction EN pour « ' + s + ' »'));
  else ok(name + ' : ' + uniq.length + ' chaînes traduites');
}

// Aucune chaîne FR en dur affectée à un message du panneau code (hors t()).
const hard = [...codeJs.matchAll(/(?:textContent|innerHTML)\s*=\s*(["'])([^"']*[A-Za-zÀ-ÿ]{3,}[^"']*)\1/g)].map((m) => m[2]);
if (hard.length) hard.forEach((s) => fail('objectifs-offre1-code.js : texte en dur « ' + s + ' »'));
else ok('objectifs-offre1-code.js : aucun message en dur hors t()');
const hardApp = [...appBlock.matchAll(/(?:textContent|innerHTML)\s*=\s*(["'])([^"']*[A-Za-zÀ-ÿ]{3,}[^"']*)\1/g)].map((m) => m[2]);
if (hardApp.length) hardApp.forEach((s) => fail('app.js (bloc Expansion) : texte en dur « ' + s + ' »'));
else ok('app.js (bloc Expansion) : aucun message en dur hors t()');

// Le gabarit du panneau code doit être traduit à l'injection.
if (/translateStaticDom\(\s*\$?\(?['"]?offer1CodePage/.test(codeJs) || /translateStaticDom/.test(codeJs)) ok('panneau code : gabarit traduit à l’injection');
else fail('objectifs-offre1-code.js : translateStaticDom absent après l’injection du gabarit');

if (bad) { console.log(bad + ' échec(s)'); process.exit(1); }
console.log('Garde i18n Expansion : tout passe');
