// Étape « Temps » de la création d'un objectif : structure du code client et comportement des écrans (hausse / baisse / glissements), sans bouton « Valider », sans saisie au clavier
// (sélecteur de durée standard TMT.openDurationPicker), valeur modifiable sans rectangle.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').split('\r\n').join('\n');
const js = read('public', 'js', 'objectifs-creer.js'), css = read('public', 'css', 'objectifs-creer.css'), i18n = read('public', 'i18n.js'), app = read('public', 'app.js');

assert(js.includes("tr('Prévu')") && js.includes("tr('Passé')"), 'tableau : colonnes Prévu et Passé');
assert(js.includes("tr('Heures par semaine')") && js.includes('D’où vient ce temps ?'), 'écrans 1 et 2 titrés');
assert(js.includes('Prendre sur') && js.includes('Ajouter'), 'cartes Ajouter / Prendre sur');
assert(js.includes('tpScreen1') && js.includes('tpScreen2') && js.includes('tpScreen3'), 'trois écrans');
assert(js.includes('tpPages') && js.includes('tasksPages'), 'balayage : mécanisme de pages existant');
assert(!/objTDots|pagination|pageDots/.test(js.slice(js.indexOf('function tpPaint'), js.indexOf('function tpPaint') + 3000)), 'aucun point de pagination');
assert(!js.includes('tpValider') && !js.includes("tr('Valider')") && !js.includes('tp.committed'), 'plus de bouton « Valider » ni d’écran qui revient à l’écran 1');
assert(js.includes('stepBtn.disabled = !tpValid(); advance = i < tot - 1 ? stepNext : finishAll;'), 'le bouton du bas reste « Suivant » / « Terminer » ; grisé seulement si la répartition n’est pas équilibrée');
assert((js.match(/\/api\/objectifs\/temps\/plan/g) || []).length === 2 && js.includes('function tpApply()') && js.includes('function go(replaceId) { return tpApply().then('), 'le serveur n’est modifié qu’à « Terminer » (tpApply dans la création) ; l’aperçu de l’effet ne modifie rien');
// plus aucune saisie au clavier dans la page Temps
const tpCode = js.slice(js.indexOf('    var tpBox = '), js.indexOf('    function refresh() {'));
assert(!tpCode.includes("el('input'") && !tpCode.includes('inputMode') && !tpCode.includes("'keydown'") && !tpCode.includes('.blur()') && !js.includes('function tedit(') && !js.includes('function parseHrs('), 'aucun champ de saisie, clavier, Entrée ni perte de focus dans la page Temps ; tedit et parseHrs supprimés');
assert(tpCode.includes("TMT.openDurationPicker({ title: 'Heures par semaine', minutes: minutes || 0, maxHours: 168") && (tpCode.match(/tbtn\(/g) || []).length >= 3, 'le Prévu et les « Après » ouvrent le sélecteur de durée standard (initialisé à la valeur actuelle, plafond 168 h)');
assert(!/durPickerSheet/.test(js), 'aucun second sélecteur : le composant unique de l’app (R29)');
assert(js.includes("'&inner=' + (form.weeklyOn ? 'hebdomadaires' : 'periodiques')") && js.includes("q.inner || ''"), 'la recherche de la case tient compte de Hebdomadaire / Périodique');
const ed = css.slice(css.indexOf('button.objTEdit {'), css.indexOf('button.objTEdit:focus-visible'));
assert(/color: var\(--purple\)/.test(ed) && /border: 0/.test(ed) && /background: none/.test(ed) && /box-shadow: none/.test(ed) && /min-height: 44px/.test(ed) && /text-align: right/.test(ed), 'valeur modifiable : texte violet nu, aligné à droite, sans fond ni bordure ni cadre, zone de toucher 44 px');
assert(js.includes("'cmpList'"), 'lignes séparées bord à bord (R22, .cmpList)');
['Heures par semaine', 'Prévu', 'Passé', 'Toutes tes activités'].forEach((k) => assert(i18n.includes(k), 'traduction : ' + k));
assert(js.includes('function tsep()') && (js.match(/tsep\(\)/g) || []).length >= 4 && js.includes("'objTPair objTHead'") && /\.objTSep \{[^}]*color: var\(--text-light\)/.test(css) && /\.objTPair \{[^}]*76px 12px 76px/.test(css), 'écran 1 : « Prévu / Passé » avec une barre oblique grise (une seule fonction de rendu)');
{
  const a1 = js.indexOf('    function hrs(min)'), a2 = js.indexOf('    function tpOld');
  const mk = (lang) => new Function('window', js.slice(a1, a2) + '; return { hrs: hrs, hh: hh };')({ NoesisI18n: { getLang: () => lang } });
  const F = mk('fr'), G = mk('en');
  assert(F.hh(780) === '13 h' && F.hrs(795) === '13,25' && F.hrs(810) === '13,5' && F.hrs(825) === '13,75' && F.hh(null) === '—' && G.hrs(795) === '13.25', 'formatage des heures : « 13 h », 13,25, 13,5, 13,75 (virgule en français, point en anglais), une seule fonction');
}

// comportement des écrans (fonctions extraites telles quelles du code) : la valeur arrive en MINUTES depuis le ✓ du sélecteur
{
  const a = js.indexOf('    function tpOld()'), b = js.indexOf('    var LV = '), c = js.indexOf('    function tpCommit(min)'), d = js.indexOf('    function modeLabel(m)');
  const mk = (e, valueMin) => {
    const tp = { e, valueMin, mode: null, apres: {}, page: 0, effects: null };
    const api = new Function('tp', 'tpSync', 'tpPaint', js.slice(a, b) + '\n' + js.slice(c, d) + '\nreturn { tpCommit, tpPages, tpValid, tpIncrease, tpChanging, tpMode, tpBalanced };')(tp, () => {}, () => {});
    return Object.assign({ tp }, api);
  };
  const E = (modes) => ({ valueMin: 360, modes, takeLines: { autres: [{ key: 'p2', label: 'P2', avantMin: 180 }], reste: [] } });
  let t = mk(E(['ajouter', 'autres', 'reste']), 360);
  t.tp.page = 0; t.tpCommit(360); assert(t.tp.page === 0 && !t.tpChanging() && t.tpPages().join() === 's1', '✓ sans changement : rien ne bouge, aucun glissement');
  t.tpCommit(240); assert(t.tp.page === 0 && t.tpChanging() && !t.tpIncrease() && t.tpPages().join() === 's1' && t.tpValid(), 'baisse : aucun glissement, aucune question (le temps libéré reste libre), « Suivant » actif');
  t.tpCommit(540); assert(t.tp.page === 1 && t.tpIncrease() && t.tpPages().join() === 's1,s2' && !t.tpValid(), 'hausse : glissement vers « D’où vient ce temps ? » ; « Suivant » grisé tant que rien n’est choisi');
  t.tp.mode = 'ajouter'; assert(t.tpPages().join() === 's1,s2,s3' && t.tpValid(), 'Ajouter : écran d’effet, « Suivant » actif');
  t.tp.mode = 'autres'; t.tp.apres = { p2: 120 }; assert(t.tpBalanced() === false && !t.tpValid(), '« Prendre sur… » non équilibré (1 h prise pour 3 h de hausse) : « Suivant » grisé');
  t.tp.apres = { p2: 0 }; assert(t.tpBalanced() && t.tpValid(), '« Prendre sur… » équilibré (3 h prises pour 3 h) : « Suivant » actif');
  t.tpCommit(360); assert(t.tp.page === 0 && !t.tpChanging() && t.tp.mode === null && t.tpPages().join() === 's1', 'valeur remise au défaut : le changement est annulé (retour à un seul écran)');
  t.tpCommit(0); assert(t.tp.valueMin === 0 && t.tpChanging() && !t.tpIncrease() && t.tp.page === 0, 'valeur 0 : une baisse, aucun glissement');
  t = mk(E(['ajouter']), 360); t.tpCommit(420); assert(t.tp.page === 1 && t.tpPages().join() === 's1,s3' && t.tpMode() === 'ajouter' && t.tpValid(), 'une seule possibilité : l’écran « d’où vient ce temps » est sauté, glissement direct vers l’effet');
  t = mk(E(['ajouter', 'autres']), 360); t.tpCommit(168 * 60); assert(t.tpIncrease() && t.tp.valueMin === 168 * 60, '168 h acceptées (heures d’une semaine)');
}

// sélecteur de durée standard (public/app.js) : exécuté avec un DOM minimal
{
  const a = app.indexOf('  function openDurationPicker(opts) {'), b = app.indexOf('  TMT.openDurationPicker = openDurationPicker;');
  const all = [];
  const mkEl = (tag) => {
    const e = { tag, className: '', children: [], listeners: {}, scrollTop: 0, textContent: '', attrs: {}, removed: false,
      appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; }, scrollTo(o) { this.scrollTop = o.top; },
      fire(t, ev) { (this.listeners[t] || []).forEach((f) => f(ev || { target: this })); } };
    all.push(e); return e;
  };
  const doc = { createElement: mkEl, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };
  const open = new Function('document', 't', app.slice(a, b) + '\nreturn openDurationPicker;')(doc, (s) => s);
  const by = (cls) => all.filter((e) => e.className.split(' ').indexOf(cls) >= 0);
  const run = (opts) => new Promise((res) => {
    all.length = 0; const got = [];
    open(Object.assign({ title: 'Heures par semaine', onDone: (v) => got.push(v) }, opts));
    setTimeout(() => res({ got, scrolls: by('durPickerScroll'), ok: by('durPickerOk')[0], x: by('cmpClose')[0], ov: by('durPickerOverlay')[0], reset: by('durPickerReset')[0] }), 20);
  });
  (async () => {
    let r = await run({ minutes: 795, maxHours: 168 });
    assert(r.scrolls[0].scrollTop === 13 * 44 && r.scrolls[1].scrollTop === 3 * 44, 'ouverture à la valeur actuelle (13 h 15 : roue des heures sur 13, minutes sur 15)');
    assert(r.scrolls[0].children.length === 169, 'plafond 168 h : la roue des heures va de 0 à 168');
    r.scrolls[0].scrollTop = 14 * 44; r.ok.fire('click'); assert(r.got.join() === String(14 * 60 + 15), '✓ avec changement : onDone reçoit la nouvelle valeur (14 h 15), jamais réarrondie');
    r = await run({ minutes: 795, maxHours: 168 }); r.ok.fire('click'); assert(r.got.join() === '795', '✓ sans changement : la même valeur (la page ne fait rien, voir tpCommit)');
    r = await run({ minutes: 795, maxHours: 168 }); r.x.fire('click'); assert(r.got.length === 0, '✕ : rien ne change');
    r = await run({ minutes: 795, maxHours: 168 }); r.ov.fire('click', { target: r.ov }); assert(r.got.length === 0, 'toucher dehors : rien ne change');
    r = await run({ minutes: 0, maxHours: 168 }); r.ok.fire('click'); assert(r.got.join() === '0', 'valeur 0 : ouverture et ✓ donnent 0');
    r = await run({ minutes: 168 * 60, maxHours: 168 }); assert(r.scrolls[0].scrollTop === 168 * 44 && r.scrolls[1].scrollTop === 0, '168 h : ouverture sur 168 h 00');
    r.scrolls[1].scrollTop = 6 * 44; r.ok.fire('click'); assert(r.got.join() === String(168 * 60), '168 h : les minutes valent 0 (plafond)');
    r = await run({ minutes: 100 * 60 }); assert(r.scrolls[0].children.length === 100 && r.scrolls[0].scrollTop === 99 * 44, 'usage existant (sans maxHours) : plafond de 99 h inchangé');
    r = await run({ minutes: 360, maxHours: 168 }); r.reset.fire('click'); await new Promise((s) => setTimeout(s, 10)); assert(r.got.join() === '0', '« Réinitialiser » : 0');
    console.log(failed ? '\netape-temps-test : ' + failed + ' ÉCHEC(S)' : '\netape-temps-test : OK');
    process.exit(failed ? 1 : 0);
  })();
}
