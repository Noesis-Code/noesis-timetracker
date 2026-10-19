// Non-régression accessibilité : boutons-icônes nommés, interrupteurs avec rôle + nom, champs nommés,
// module des pop-up chargé et précaché. Analyse de texte (pas de jsdom).
const fs = require('fs');
const path = require('path');
const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html');
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };

// 1. Boutons sans texte lisible dans index.html : aria-label obligatoire.
for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]{0,300}?)<\/button>/g)) {
  if (/aria-label/.test(m[1])) continue;
  const inner = m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  if (/[A-Za-zÀ-ÿ]{3,}/.test(inner)) continue;
  if (/id="categoryRemove(Delete|Keep)TasksBtn"/.test(m[1])) continue; // libellé posé en JS
  fail('bouton sans nom : ' + m[0].replace(/\s+/g, ' ').slice(0, 100));
}

// 2. Interrupteurs : role="switch" + nom (aria-label ou <label for>).
for (const m of html.matchAll(/<input\b([^>]*type="checkbox"[^>]*)>/g)) {
  const a = m[1]; const id = (a.match(/\bid="([^"]+)"/) || [])[1];
  const inSwitch = /class="toggleSwitch">\s*$/.test(html.slice(Math.max(0, m.index - 80), m.index));
  if (!inSwitch) continue;
  if (!/role="switch"/.test(a)) fail('interrupteur sans role=switch : ' + id);
  if (!/aria-label/.test(a) && !(id && new RegExp('<label[^>]*for="' + id + '"').test(html))) fail('interrupteur sans nom : ' + id);
}

// 3. Champs sans placeholder ni label : aria-label requis (dates/heures/select visibles).
for (const id of ['stopStartDateInput', 'stopStartTimeInput', 'stopEndDateInput', 'stopEndTimeInput', 'newProjectStartDate', 'offer1ActivitySelect', 'calendarFeedUrl', 'activityGoalsCategoryAddInput']) {
  const m = html.match(new RegExp('<(?:input|select)\\b[^>]*id="' + id + '"[^>]*>'));
  if (!m || !/aria-label=/.test(m[0])) fail('champ sans aria-label : ' + id);
}

// 4. Boutons ✕ créés en JS : aria-label posé.
for (const f of ['app.js', 'js/objectifs-page1.js', 'js/objectifs-page3.js', 'js/modules.js']) {
  const lines = pub(f).split('\n');
  lines.forEach((l, i) => {
    if (!/textContent = '(✕|×)'/.test(l)) return;
    const ctx = lines.slice(Math.max(0, i - 6), i + 6).join('\n');
    if (!/aria-label/.test(ctx)) fail(f + ':' + (i + 1) + ' bouton ✕ sans aria-label');
  });
}

// 5. Module pop-up chargé et précaché.
if (!html.includes('/js/a11y-popups.js')) fail('a11y-popups.js non chargé');
if (!pub('sw.js').includes('/js/a11y-popups.js')) fail('a11y-popups.js non précaché');

if (bad) process.exit(1);
console.log('  ✓ attributs d\'accessibilité (boutons, interrupteurs, champs, pop-up) en place');
