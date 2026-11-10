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
assert(js.includes("tr(m === 'ajouter' ? 'Ajouter' : 'Déplacer')") && !js.includes('Prendre sur') && !js.includes("'autres'"), 'écran 2 : deux cartes seulement, « Ajouter » et « Déplacer » (plus de « Prendre sur… », ni de modes « reste » / « autres »)');
assert(js.includes("'aiModeChoices objCenterChoices'") && /\.objCenterChoices \.objChoice \{[^}]*align-items: center; justify-content: center; text-align: center/.test(css), 'texte de chaque carte centré, horizontalement et verticalement (même composant de carte)');
assert(js.includes("el('span', 'objGridName', tr('Total'))") && !js.includes('reste à') && !js.includes('Reste à prendre'), 'écran « Déplacer » : dernière ligne « Total » (plus « L’activité » / « Le pôle ») ; pas de ligne « Reste à prendre »');
assert(js.includes('tpScreen1') && js.includes('tpScreen2') && js.includes('tpScreen3'), 'trois écrans');
assert(js.includes('tpPages') && js.includes('tasksPages'), 'balayage : mécanisme de pages existant');
assert(!/objTDots|pagination|pageDots/.test(js.slice(js.indexOf('function tpPaint'), js.indexOf('function tpPaint') + 3000)), 'aucun point de pagination');
assert(!js.includes('tpValider') && !js.includes("tr('Valider')") && !js.includes('tp.committed'), 'plus de bouton « Valider » ni d’écran qui revient à l’écran 1');
assert(/\.objDock\.objTemps \.objStepBtn:disabled \{ background: var\(--card\); color: var\(--text-light\); box-shadow: inset 0 0 0 1px var\(--border\); opacity: 1; \}/.test(css) && js.includes("dock.classList.toggle('objTemps', k === 'temps' || k === 'niveau')"), 'bouton du bas : gris (R35) quand il est désactivé aux étapes Niveau et Temps, violet standard sinon');
assert(js.includes("if (m === 'ajouter') { if (advance && !stepBtn.disabled) advance(); } else {") && !js.includes("tr('Effet')") && !js.includes('effects') && !js.includes("if (m === 'ajouter') { tp.page = 0"), '« Ajouter » passe directement à l’étape suivante de la création (même fonction d’avancement que « Suivant ») ; plus d’écran d’effet');
assert(js.includes('stepBtn.disabled = !tpValid(); advance = i < tot - 1 ? stepNext : finishAll;'), 'le bouton du bas reste « Suivant » / « Terminer » ; grisé seulement si la répartition n’est pas équilibrée');
assert((js.match(/\/api\/objectifs\/temps\/plan/g) || []).length === 1 && js.includes('function tpApply()') && js.includes('function go(replaceId) { return tpApply().then('), 'le serveur n’est modifié qu’à « Terminer » (tpApply dans la création) ; plus d’aperçu ni d’écran d’effet');
// plus aucune saisie au clavier dans la page Temps
const tpCode = js.slice(js.indexOf('    var tpBox = '), js.indexOf('    function refresh() {')) + js.slice(js.indexOf('  function tbtn('), js.indexOf('  function btn('));
assert(!tpCode.includes("el('input'") && !tpCode.includes('inputMode') && !tpCode.includes("'keydown'") && !tpCode.includes('.blur()') && (js.match(/function hh\(/g) || []).length === 1 && (js.match(/function tbtn\(/g) || []).length === 1 && !js.includes('function tedit(') && !js.includes('function parseHrs('), 'aucun champ de saisie, clavier, Entrée ni perte de focus dans la page Temps ; tedit et parseHrs supprimés');
assert(tpCode.includes("TMT.openDurationPicker({ title: 'Heures par semaine', minutes: minutes || 0, maxHours: maxMin == null ? 168") && (tpCode.match(/tbtn\(/g) || []).length >= 2, 'le Prévu et les « Après » ouvrent le sélecteur de durée standard (initialisé à la valeur actuelle, plafond 168 h)');
assert(!/durPickerSheet/.test(js), 'aucun second sélecteur : le composant unique de l’app (R29)');
assert(js.includes("'&inner=' + (form.weeklyOn ? 'hebdomadaires' : 'periodiques')") && js.includes("q.inner || ''"), 'la recherche de la case tient compte de Hebdomadaire / Périodique');
const ed = css.slice(css.indexOf('button.objTEdit {'), css.indexOf('button.objTEdit {') + 400), edAll = css.slice(css.indexOf('button.objTEdit {'));
assert(/color: var\(--purple\)/.test(ed) && /border: 0/.test(ed) && /background: none/.test(ed) && /box-shadow: none/.test(ed) && /min-height: 44px/.test(ed) && /text-align: right/.test(ed), 'valeur modifiable : texte violet nu, aligné à droite, sans fond ni bordure ni cadre, zone de toucher 44 px');
assert(/button\.objTEdit:hover, button\.objTEdit:active, button\.objTEdit:focus \{ background: none; border: 0; box-shadow: none; outline: none; \}/.test(edAll) && /appearance: none/.test(ed) && /-webkit-tap-highlight-color: transparent/.test(edAll), ':hover, :active, :focus et le style par défaut du navigateur : aucun fond, bordure, ombre ni contour (appearance none)');
['Heures par semaine', 'Prévu', 'Passé', 'Toutes tes activités'].forEach((k) => assert(i18n.includes(k), 'traduction : ' + k));
assert(/\.objGrid \{ position: relative;/.test(css) && /\.objGrid::before \{[^}]*top: 0; bottom: 0; right: 124px; width: 1px; background: var\(--sep\);/.test(css) && !/objGridBody::before/.test(css) && /\.objGridRow \+ \.objGridRow \{ border-top: 1px solid var\(--sep\); \}/.test(css) && /\.objGridTotal \{ border-top: 1px solid var\(--text-light\);/.test(css) && !/\.objGridHead[^{]*\{[^}]*border/.test(css), 'traits : horizontaux entre les lignes, UN trait vertical continu entre Chrono et Objectif (décalé de 12 px) de l’en-tête jusqu’au bas de « Total » (top 0, bottom 0 du tableau entier), un trait horizontal plus marqué au-dessus de « Total », aucun trait sous le titre « Objectif »');
assert(/\.objGridHead \{[^}]*font-size: 11px; color: var\(--text\)/.test(css) && /\.objGridName \{[^}]*color: var\(--text-light\)/.test(css) && /\.objGridChrono \{[^}]*color: var\(--text-light\)/.test(css) && /\.objGridApres \{ color: var\(--text\); \}/.test(css) && /\.objGridTotal \.objGridName, \.objGridTotal \.objGridChrono \{ color: var\(--text\); \}/.test(css) && !/#[0-9a-fA-F]{3,6}/.test(css.slice(css.indexOf('.objGrid {'), css.indexOf('button.objTEdit {'))), 'couleurs par jetons : titres blancs (11 px), noms et valeurs gris sable, après modifiable violet (objTEdit), Total blanc, rien en dur');
assert((js.match(/function objTable\(/g) || []).length === 1 && js.includes('objTable({ levelLabel') && (js.match(/objTable\(\{/g) || []).length === 2 && !js.includes('Reste de ta capacité') && !/restLabel = 'Reste de ta capacité'/.test(read('server', 'lib', 'tempsbudget.js')) && !js.includes('function trow(') && !js.includes('function tsep('), 'une seule fonction de rendu du tableau (écran 1 et écran « Déplacer »), plus de « Reste de ta capacité », anciens assistants de ligne supprimés');
{
  const a1 = js.indexOf('  function hh(min)'), a2 = js.indexOf('\n', a1);
  const hh = new Function(js.slice(a1, a2) + '; return hh;')();
  assert(hh(780) === '13h' && hh(795) === '13h15' && hh(810) === '13h30' && hh(825) === '13h45' && hh(30) === '0h30' && hh(0) === '0h' && hh(125) === '2h05' && hh(168 * 60) === '168h' && hh(null) === '—', 'format des durées : 13h, 13h15, 13h30, 13h45, 0h30, 2h05 (minutes de la roue telles quelles), jamais de décimale');
  assert(!js.includes('hrs(') && !/\d,\d/.test(js.slice(a1, a2)) && (js.match(/function hh\(/g) || []).length === 1, 'une seule fonction de formatage pour toute la page (tableaux, Avant / Après, effet)');
}

// comportement des écrans (fonctions extraites telles quelles du code) : la valeur arrive en MINUTES depuis le ✓ du sélecteur
{
  const a = js.indexOf('    function tpOld()'), b = js.indexOf('    function tpSync()'), c = js.indexOf('    function tpCommit(min)'), d = js.indexOf('    function modeLabel(m)');
  const mk = (e, valueMin) => {
    const tp = { e, valueMin, mode: null, apres: {}, page: 0 };
    const api = new Function('tp', 'tpSync', 'tpPaint', js.slice(a, b) + '\n' + js.slice(c, d) + '\nreturn { tpCommit, tpPages, tpValid, tpIncrease, tpChanging, tpMode, tpBalanced };')(tp, () => {}, () => {});
    return Object.assign({ tp }, api);
  };
  const E = (modes) => ({ valueMin: 360, modes, takeLines: { deplacer: [{ key: 'p2', label: 'P2', avantMin: 180 }] } });
  let t = mk(E(['ajouter', 'deplacer']), 360);
  t.tp.page = 0; t.tpCommit(360); assert(t.tp.page === 0 && !t.tpChanging() && t.tpPages().join() === 's1', '✓ sans changement : rien ne bouge, aucun glissement');
  t.tpCommit(240); assert(t.tp.page === 0 && t.tpChanging() && !t.tpIncrease() && t.tpPages().join() === 's1' && t.tpValid(), 'baisse : aucun glissement, aucune question (le temps libéré reste libre), « Suivant » actif');
  t.tpCommit(540); assert(t.tp.page === 1 && t.tpIncrease() && t.tpPages().join() === 's1,s2' && !t.tpValid(), 'hausse : glissement vers « D’où vient ce temps ? » ; « Suivant » grisé tant que rien n’est choisi');
  t.tp.mode = 'ajouter'; assert(t.tpPages().join() === 's1,s2' && t.tpValid(), 'Ajouter : aucun écran d’effet (on passe à l’étape suivante), « Suivant » actif');
  t.tp.mode = 'deplacer'; assert(t.tpPages().join() === 's1,s2,s3' && !t.tpValid(), 'Déplacer : le tableau Avant / Après existe ; « Suivant » grisé tant que rien n’est déplacé');
  t.tp.mode = 'deplacer'; t.tp.apres = { p2: 120 }; assert(t.tpBalanced() === false && !t.tpValid(), '« Déplacer » non équilibré (1 h déplacée pour 3 h de hausse) : « Suivant » grisé');
  t.tp.apres = { p2: 0 }; assert(t.tpBalanced() && t.tpValid(), '« Déplacer » équilibré (3 h déplacées pour 3 h) : « Suivant » actif');
  t.tpCommit(360); assert(t.tp.page === 0 && !t.tpChanging() && t.tp.mode === null && t.tpPages().join() === 's1', 'valeur remise au défaut : le changement est annulé (retour à un seul écran)');
  t.tpCommit(0); assert(t.tp.valueMin === 0 && t.tpChanging() && !t.tpIncrease() && t.tp.page === 0, 'valeur 0 : une baisse, aucun glissement');
  t = mk(E(['ajouter']), 360); t.tpCommit(420); assert(t.tpPages().join() === 's1' && t.tpMode() === 'ajouter' && t.tpValid(), 'une seule possibilité (Ajouter) : ni écran 2 ni effet, « Suivant » actif');
  t = mk(E(['ajouter', 'deplacer']), 360); t.tpCommit(168 * 60); assert(t.tpIncrease() && t.tp.valueMin === 168 * 60, '168 h acceptées (heures d’une semaine)');
}

// écran 2 : « Ajouter » avance comme « Suivant » ; « Déplacer » glisse vers le tableau
{
  const a2 = js.indexOf('    function tpOld()'), b2 = js.indexOf('    function tpSync()'), c2 = js.indexOf('    function modeLabel(m)'), d2 = js.indexOf('    function tpScreen3()');
  const mk = (disabled) => {
    const tp = { e: { valueMin: 360, modes: ['ajouter', 'deplacer'], takeLines: { deplacer: [] } }, valueMin: 540, mode: null, apres: {}, page: 1, shown: 1 };
    const log = []; const cards = {}; const state = { advance: () => log.push('advance'), stepBtn: { disabled } };
    const el = () => ({ appendChild() {} }); const choice = (title, d, on, c, fn) => { cards[title] = fn; return {}; };
    const body = js.slice(a2, b2) + '\n' + js.slice(c2, d2).replace(/\badvance\b/g, 'S.advance').replace(/\bstepBtn\b/g, 'S.stepBtn') + '\nreturn { tpScreen2 };';
    const api = new Function('tp', 'el', 'choice', 'tr', 'tpSync', 'tpPaint', 'tpGo', 'S', body)(tp, el, choice, (x) => x, () => log.push('sync'), () => log.push('paint'), (i) => log.push('go' + i), state);
    api.tpScreen2(); return { tp, log, cards };
  };
  let r = mk(false); r.cards['Ajouter']();
  assert(r.tp.mode === 'ajouter' && r.tp.valueMin === 540 && r.log.join() === 'sync,advance', '« Ajouter » : la valeur est gardée et la création passe à l’étape suivante (même fonction d’avancement que « Suivant »), sans écran d’effet');
  r = mk(true); r.cards['Ajouter'](); assert(r.log.join() === 'sync', '« Ajouter » : mêmes contrôles qu’un « Suivant » normal (bouton désactivé : on n’avance pas)');
  r = mk(false); r.cards['Déplacer'](); assert(r.tp.mode === 'deplacer' && r.log.indexOf('advance') < 0 && r.log.join() === 'sync,paint,go2', '« Déplacer » : glissement vers le tableau Avant / Après, on n’avance pas');
}

// tableau « Chrono / Objectif » : écran 1 et écran « Déplacer » (fonctions du code exécutées telles quelles avec des doublures du DOM)
{
  const sl = (from, to) => js.slice(js.indexOf(from), js.indexOf(to));
  const src = sl('  function hh(min)', '\n') + '\n' ; // ligne de hh
  const hhLine = js.slice(js.indexOf('  function hh(min)'), js.indexOf('\n', js.indexOf('  function hh(min)')));
  const body = hhLine + '\n' + sl('  function tbtn(', '  // Tableau « Chrono / Objectif »') + '\n' + sl('  function objTable(cfg)', '  function btn(') + '\n' + sl('    function tpOld()', '    function tpSync()') + '\n' + sl('    function tpScreen1()', '    function tpCommit(min)') + '\n' + sl('    function tpScreen3()', '    function tpPaint()') + '\nreturn { tpScreen1, tpScreen3, tpValid, tpBalanced };';
  const mkEl = (tag, cls, text) => { const x = { tag, className: cls || '', textContent: text == null ? '' : text, children: [], listeners: {}, attrs: {}, classList: { toggle(n, on) { if (n === 'hidden') x.hidden = !!on; } }, hidden: false,
    appendChild(c) { x.children.push(c); return c; }, addEventListener(t, fn) { (x.listeners[t] = x.listeners[t] || []).push(fn); }, setAttribute(k, v) { x.attrs[k] = v; } }; return x; };
  const find = (n, cls) => { const out = []; (function w(x) { if (x.className.split(' ').indexOf(cls) >= 0) out.push(x); x.children.forEach(w); })(n); return out; };
  const text = (n) => n.textContent + n.children.map(text).join('');
  const run = (level, valueMin, oldMin, lines, me, up) => {
    const tp = { e: { level, valueMin: oldMin, modes: ['ajouter', 'deplacer'], takeLines: { deplacer: lines }, me, up }, valueMin, mode: 'deplacer', apres: {}, page: 0 };
    const picker = { last: null }, committed = [], synced = [];
    const TMT = { openDurationPicker: (o) => { picker.last = o; } };
    const tr = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    const api = new Function('tp', 'el', 'tr', 'TMT', 'tpCommit', 'tpSync', body)(tp, mkEl, tr, TMT, (v) => committed.push(v), () => synced.push(1));
    return Object.assign({ tp, picker, committed, synced }, api);
  };
  const L2 = [{ key: 'p2', label: 'Réseaux', chronoMin: 120, objMin: 120, avantMin: 120, objectifId: 5 }, { key: 'p3', label: 'Salons', chronoMin: 75, objMin: null, avantMin: 75, objectifId: null }, { key: 'reste', label: 'Reste de l’activité', chronoMin: null, objMin: 60, avantMin: 60 }];
  const ME = { label: 'Produit', passeMin: 180, prevuMin: null }, UP = { kind: 'activite', label: 'Marketing', prevuMin: 1200, passeMin: 600 };
  // écran 1 : niveau pôle / secteur / activité
  for (const [level, head] of [['pole', 'Pôle'], ['secteur', 'Secteur'], ['activite', 'Activité']]) {
    const g = run(level, 180, 180, L2, ME, level === 'activite' ? { kind: 'total', label: null, prevuMin: 3000, passeMin: 2700 } : UP);
    const page = g.tpScreen1(), head1 = find(page, 'objGridHead')[0];
    assert(text(head1) === head + 'ChronoObjectif' && !text(page).includes('Avant') && !text(page).includes('Après'), 'écran 1 niveau ' + level + ' : en-tête « ' + head + ' », « Chrono », UN titre « Objectif » (plus de sous-titres Avant / Après)');
    const rows = find(page, 'objGridRow');
    assert(rows.length === 2 && text(rows[1]) === 'Produit3h—/3h' && find(rows[1], 'objTEdit').length === 1 && find(rows[0], 'objTEdit').length === 0 && (level !== 'activite' || text(rows[0]).indexOf('Toutes tes activités') === 0), 'écran 1 niveau ' + level + ' : ligne du niveau du dessus en lecture seule ; ligne de l’utilisateur : Chrono 3h, avant « — » (pas d’objectif), barre oblique, après 3h modifiable');
  }
  let g = run('pole', 300, 180, L2, ME, UP);
  let page = g.tpScreen3();
  const tbl = page.children[0], bodyEl = find(page, 'objGridBody')[0], total = find(page, 'objGridTotal')[0];
  assert(tbl.children.length === 2 && tbl.children[0] === bodyEl && tbl.children[1] === total && find(total, 'objGridObj').length === 1, 'le trait vertical (porté par le tableau entier) descend jusqu’au bas de « Total » : la ligne Total est dans le tableau, avec la même colonne Objectif');
  let rows = find(page, 'objGridRow');
  assert(rows.length === 4 && text(rows[0]) === 'Produit3h—/5h' && find(rows[0], 'objTEdit').length === 0 && find(rows[0], 'objGridApres').length === 1, 'Déplacer : la ligne augmentée (Produit, avant « — », après 5h) est en lecture seule (blanche, sans case violette)');
  assert(text(rows[1]) === 'Réseaux2h2h/2h' && text(rows[2]) === 'Salons1h15—/1h15' && text(rows[3]) === 'Reste de l’activité1h/1h', 'puis les autres lignes : Chrono gris, avant = objectif ou « — » (Salons sans objectif part de son Chrono 1h15), après modifiable ; « Reste » gardé car > 0, durées en « 1h15 »');
  assert(find(rows[1], 'objTEdit').length === 1 && find(rows[2], 'objTEdit').length === 1 && find(rows[3], 'objTEdit').length === 1, 'les après des lignes sources sont modifiables (sélecteur de durée standard)');
  assert(text(total) === 'Total7h15 / 9h15' || text(total) === 'Total7h15/9h15', 'ligne « Total » : avant 7h15 (3 + 2 + 1h15 + 1), après 9h15 tant que rien n’est repris');
  const note = find(page, 'objTNote')[0];
  assert(note.textContent === 'Le total doit rester à 7h15 : reprends encore 2h sur les lignes du dessus.' && !note.hidden && !g.tpValid(), 'non équilibré : phrase « reprends encore 2h », « Suivant » grisé');
  const click = (row) => { find(row, 'objTEdit')[0].listeners.click[0](); return g.picker.last; };
  let p = click(rows[1]); assert(p.maxHours === 2 && p.minuteStep === 15 && p.minutes === 120, 'le sélecteur s’ouvre à la valeur actuelle (15 min), plafonné à l’avant');
  p.onDone(0); assert(note.textContent === '' && note.hidden && g.tpValid() && text(total).replace(/ /g, '') === 'Total7h15/7h15', 'équilibré (Réseaux 2h → 0h) : total après = avant (7h15), phrase disparue, « Suivant » actif (violet)');
  p = click(rows[2]); p.onDone(0); assert(note.textContent === 'Le total doit rester à 7h15 : remets 1h15 sur une ligne.' && !g.tpValid(), 'trop repris (Salons aussi à 0h) : phrase « remets 1h15 sur une ligne », « Suivant » grisé');
  p = click(rows[3]); p.onDone(999); assert(g.tp.apres.reste === 60, 'un après ne dépasse jamais son avant (une source ne fait que baisser)');
  // niveau activité : aucune ligne « Reste de ta capacité »
  g = run('activite', 480, 240, [{ key: 'a2', label: 'Atelier', chronoMin: 300, objMin: 300, avantMin: 300, objectifId: 9 }], { label: 'Marketing', passeMin: 240, prevuMin: 240 }, { kind: 'total', label: null, prevuMin: 3000, passeMin: 2700 });
  page = g.tpScreen3(); rows = find(page, 'objGridRow');
  assert(find(page, 'objGridHead')[0].children[0].textContent === 'Activité' && rows.length === 2 && text(rows[0]) === 'Marketing4h4h/8h' && text(rows[1]) === 'Atelier5h5h/5h' && text(page).indexOf('capacité') < 0, 'niveau activité : en-tête « Activité », la ligne augmentée puis les autres activités, aucun « Reste de ta capacité »');
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
    r = await run({ minutes: 795, maxHours: 168, minuteStep: 15 });
    assert(r.scrolls[1].children.map((c) => c.textContent).join() === '00,15,30,45' && r.scrolls[0].scrollTop === 13 * 44 && r.scrolls[1].scrollTop === 1 * 44, 'page Temps : roue des minutes à 0 / 15 / 30 / 45, valeur de départ 13 h 15 (roues sur 13 et 15)');
    r.scrolls[1].scrollTop = 3 * 44; r.ok.fire('click'); assert(r.got.join() === String(13 * 60 + 45), 'minute choisie à la roue (45) : multiple de 15, jamais réarrondie');
    r = await run({ minutes: 125, maxHours: 168, minuteStep: 15 });
    assert(r.scrolls[1].children.map((c) => c.textContent).join() === '00,05,15,30,45' && r.scrolls[1].scrollTop === 1 * 44, 'valeur de départ non multiple de 15 (2 h 05) : la valeur actuelle s’ajoute à la roue (comportement existant)');
    r = await run({ minutes: 30 }); assert(r.scrolls[1].children.map((c) => c.textContent).join() === '00,05,10,15,20,25,30,35,40,45,50,55', 'usage existant (Cible, plafonds) : pas de 5 inchangé');
    r = await run({ minutes: 360, maxHours: 168 }); r.reset.fire('click'); await new Promise((s) => setTimeout(s, 10)); assert(r.got.join() === '0', '« Réinitialiser » : 0');
    console.log(failed ? '\netape-temps-test : ' + failed + ' ÉCHEC(S)' : '\netape-temps-test : OK');
    process.exit(failed ? 1 : 0);
  })();
}
