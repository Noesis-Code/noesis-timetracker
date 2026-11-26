// R52 : un bouton d'action inactif est le violet d'action PÂLI (jamais noir, jamais gris) ; règle et jetons uniques dans composants.css.
const fs = require('fs'), assert = require('assert');
const rd = (f) => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');
const css = rd('public/css/composants.css');
const tok = (n) => { const m = css.match(new RegExp('--' + n + ': (#[0-9A-Fa-f]{6});')); assert(m, 'jeton --' + n + ' défini dans composants.css'); return m[1]; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const bg = tok('btn-idle-bg'), fg = tok('btn-idle-fg'), violet = tok('purple');
// teinte : le fond inactif est le violet d'action mélangé au fond de l'app (même teinte, pas de gris ni de noir)
const [r, g, b] = rgb(bg), [vr, vg, vb] = rgb(violet);
assert(r > 60 && b > r && b > g && (b - g) >= 20, 'le fond inactif reste violet (bleu dominant, pas gris)');
assert(r < vr && g < vg && b < vb && lum(bg) > lum('#16141A') * 2, 'plus pâle que le violet actif mais jamais noir (plus clair que la carte sombre)');
const contraste = (lum(fg) + 0.05) / (lum(bg) + 0.05);
assert(contraste >= 3, 'texte atténué lisible (contraste >= 3:1), mesuré ' + contraste.toFixed(2));
// UNE règle commune pour tous les boutons d'action inactifs
const regle = css.split('\n').find((l) => l.includes('.cmpBtn:disabled') && l.includes('var(--btn-idle-bg)'));
assert(regle, 'règle commune .cmpBtn:disabled … var(--btn-idle-bg)');
for (const s of ['.cmpBtn.cmpBtnInactif', '.tasksSaveBtn:disabled', '.objStepBtn:disabled', '.cmpSend:disabled', '.btn-primary:disabled', '.btnBrique:disabled', '.goalsYearSave:disabled', '.btnPrimary:disabled']) assert(regle.includes(s), 'la règle commune couvre ' + s);
// plus de règle individuelle qui rend un Enregistrer/Suivant noir ou gris
for (const f of ['public/css/objectifs-creer.css', 'public/css/objectifs-arbre.css', 'public/css/objectifs-page3.css', 'public/css/reglages.css', 'public/css/objectifs-page1.css', 'trade-tracker/public/styles.css']) {
  const t = rd(f);
  assert(!/(objStepBtn|tasksSaveBtn|offer1PromoBtn|cmpBtnIdle|sendBtn|btnPrimary)[^{\n]*:disabled[^{\n]*\{[^}\n]*(background|opacity)/.test(t), f + ' : aucune règle individuelle de bouton inactif');
}
assert(!css.includes('.cmpDockSave .tasksSaveBtn:disabled'), 'le dock R50 n’a plus de règle grise propre');
// les Enregistrer sans disabled portent .cmpBtnInactif (et non .cmpBtnIdle, réservé au bouton secondaire actif)
assert(!/settingsSaveBtn" class="cmpBtn cmpBtnIdle/.test(rd('public/index.html')), 'settingsSaveBtn : .cmpBtnInactif');
assert(/R52\./.test(rd('docs/regles/regles-rangement.md')) && /R52/.test(rd('DESIGN.md')), 'R52 écrite dans les règles et DESIGN.md');
assert(rd('trade-tracker/public/composants.css') === css, 'copie Trade synchronisée');
console.log('bouton-inactif-test OK');
