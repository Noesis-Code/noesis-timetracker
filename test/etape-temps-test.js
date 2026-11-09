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
assert(js.includes("tcell(tr('Total'), 'objTLabel')") && !js.includes('reste à') && !js.includes('Reste à prendre'), 'écran 3 « Déplacer » : dernière ligne « Total » (plus « L’activité » / « Le pôle ») ; pas de ligne « Reste à prendre »');
assert(/\.objTMute \{ color: var\(--text-light\); \}/.test(css) && /\.objTTitle \.objTH \{ color: var\(--text\); \}/.test(css) && /\.objTTotal \.objTLabel, \.objTTotal \.objTRO \{ color: var\(--text\); \}/.test(css) && /\.cmpList > \.objTTotal \{ border-top-color: var\(--text-light\); \}/.test(css) && !/#[0-9a-fA-F]{3,6}/.test(css.slice(css.indexOf('Tableau « Déplacer »'), css.indexOf('.objTNote'))), 'couleurs : titres et Total en blanc, noms et heures en gris sable, trait plus marqué avant Total (jetons, rien en dur)');
assert(js.includes("tcell(l.key === 'reste' ? tr(l.label) : l.label, 'objTLabel objTMute')") && js.includes("tcell(tr(e.level === 'activite' ? 'Activité' : e.level === 'pole' ? 'Pôle' : 'Secteur'), 'objTLabel objTH')"), 'une seule grille Avant / Après : en-tête = nom du niveau ; la ligne augmentée, les autres lignes, le « Reste … »');
assert(js.includes('tpScreen1') && js.includes('tpScreen2') && js.includes('tpScreen3'), 'trois écrans');
assert(js.includes('tpPages') && js.includes('tasksPages'), 'balayage : mécanisme de pages existant');
assert(!/objTDots|pagination|pageDots/.test(js.slice(js.indexOf('function tpPaint'), js.indexOf('function tpPaint') + 3000)), 'aucun point de pagination');
assert(!js.includes('tpValider') && !js.includes("tr('Valider')") && !js.includes('tp.committed'), 'plus de bouton « Valider » ni d’écran qui revient à l’écran 1');
assert(/\.objDock\.objTemps \.objStepBtn:disabled \{ background: var\(--card\); color: var\(--text-light\); box-shadow: inset 0 0 0 1px var\(--border\); opacity: 1; \}/.test(css) && js.includes("dock.classList.toggle('objTemps', k === 'temps')"), 'bouton du bas : gris (R35) quand il est désactivé à l’étape Temps, violet standard sinon');
assert(js.includes("if (m === 'ajouter') { if (advance && !stepBtn.disabled) advance(); } else {") && !js.includes("tr('Effet')") && !js.includes('effects') && !js.includes("if (m === 'ajouter') { tp.page = 0"), '« Ajouter » passe directement à l’étape suivante de la création (même fonction d’avancement que « Suivant ») ; plus d’écran d’effet');
assert(js.includes('stepBtn.disabled = !tpValid(); advance = i < tot - 1 ? stepNext : finishAll;'), 'le bouton du bas reste « Suivant » / « Terminer » ; grisé seulement si la répartition n’est pas équilibrée');
assert((js.match(/\/api\/objectifs\/temps\/plan/g) || []).length === 1 && js.includes('function tpApply()') && js.includes('function go(replaceId) { return tpApply().then('), 'le serveur n’est modifié qu’à « Terminer » (tpApply dans la création) ; plus d’aperçu ni d’écran d’effet');
// plus aucune saisie au clavier dans la page Temps
const tpCode = js.slice(js.indexOf('    var tpBox = '), js.indexOf('    function refresh() {'));
assert(!tpCode.includes("el('input'") && !tpCode.includes('inputMode') && !tpCode.includes("'keydown'") && !tpCode.includes('.blur()') && !js.includes('function tedit(') && !js.includes('function parseHrs('), 'aucun champ de saisie, clavier, Entrée ni perte de focus dans la page Temps ; tedit et parseHrs supprimés');
assert(tpCode.includes("TMT.openDurationPicker({ title: 'Heures par semaine', minutes: minutes || 0, maxHours: maxMin == null ? 168") && (tpCode.match(/tbtn\(/g) || []).length >= 3, 'le Prévu et les « Après » ouvrent le sélecteur de durée standard (initialisé à la valeur actuelle, plafond 168 h)');
assert(!/durPickerSheet/.test(js), 'aucun second sélecteur : le composant unique de l’app (R29)');
assert(js.includes("'&inner=' + (form.weeklyOn ? 'hebdomadaires' : 'periodiques')") && js.includes("q.inner || ''"), 'la recherche de la case tient compte de Hebdomadaire / Périodique');
const ed = css.slice(css.indexOf('button.objTEdit {'), css.indexOf('button.objTEdit {') + 400), edAll = css.slice(css.indexOf('button.objTEdit {'));
assert(/color: var\(--purple\)/.test(ed) && /border: 0/.test(ed) && /background: none/.test(ed) && /box-shadow: none/.test(ed) && /min-height: 44px/.test(ed) && /text-align: right/.test(ed), 'valeur modifiable : texte violet nu, aligné à droite, sans fond ni bordure ni cadre, zone de toucher 44 px');
assert(/button\.objTEdit:hover, button\.objTEdit:active, button\.objTEdit:focus \{ background: none; border: 0; box-shadow: none; outline: none; \}/.test(edAll) && /appearance: none/.test(ed) && /-webkit-tap-highlight-color: transparent/.test(edAll), ':hover, :active, :focus et le style par défaut du navigateur : aucun fond, bordure, ombre ni contour (appearance none)');
assert(js.includes("'cmpList'"), 'lignes séparées bord à bord (R22, .cmpList)');
['Heures par semaine', 'Prévu', 'Passé', 'Toutes tes activités'].forEach((k) => assert(i18n.includes(k), 'traduction : ' + k));
assert(js.includes('function tsep()') && (js.match(/tsep\(\)/g) || []).length >= 3 && js.includes("'objTPair objTHead'") && !/objTHead'[^\n]*tsep\(\)/.test(js) && /\.objTSep \{[^}]*color: var\(--text-light\)/.test(css) && /\.objTPair \{[^}]*76px 12px 76px/.test(css), 'écran 1 : « / » seulement entre les VALEURS d’une ligne (gris sable, une seule fonction de rendu) ; l’en-tête écrit Prévu et Passé côte à côte, sans barre oblique');
{
  const a1 = js.indexOf('    function hh(min)'), a2 = js.indexOf('\n', a1);
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

// grille « Déplacer » (tpScreen3 exécutée telle quelle avec des doublures du DOM)
{
  const a = js.indexOf('    function tpOld()'), b = js.indexOf('    function tpSync()'), c = js.indexOf('    function tpScreen3()'), d = js.indexOf('    function tpPaint()');
  const h0 = js.indexOf('    function hh(min)'), h1 = js.indexOf('\n', h0);
  const mkEl = (tag, cls, text) => ({ tag, cls: cls || '', textContent: text == null ? '' : text, children: [], hidden: false, appendChild(x) { this.children.push(x); return x; }, classList: { toggle(n, on) { if (n === 'hidden') this.owner.hidden = !!on; } } });
  const run = (level, valueMin, oldMin, lines, apres) => {
    const tp = { e: { level, valueMin: oldMin, modes: ['ajouter', 'deplacer'], takeLines: { deplacer: lines }, me: { label: 'Produit' } }, valueMin, mode: 'deplacer', apres: apres || {}, page: 0 };
    const btns = []; const synced = [];
    const el = (tag, cls, text) => { const x = mkEl(tag, cls, text); x.classList.owner = x; return x; };
    const trow = (cls, cells) => ({ cls, cells });
    const tcell = (text, cls) => { const x = el('span', 'objTCell' + (cls ? ' ' + cls : ''), text); x.text = text; return x; };
    const tbtn = (min, label, onPick, maxMin) => { const x = { btn: true, min, label, onPick, maxMin }; btns.push(x); return x; };
    const tr = (str, v) => String(str).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    const body = js.slice(h0, h1) + '\n' + js.slice(a, b) + '\n' + js.slice(c, d) + '\nreturn { tpScreen3, tpBalanced, tpValid };';
    const api = new Function('tp', 'el', 'trow', 'tcell', 'tbtn', 'tr', 'tpSync', body)(tp, el, trow, tcell, tbtn, tr, () => synced.push(1));
    const page = api.tpScreen3(); const tbl = page.children[0], note = page.children[1];
    return { tp, btns, page, tbl, note, api, rows: tbl.children, synced };
  };
  const L = [{ key: 'p2', label: 'Réseaux', avantMin: 120, objectifId: 5 }, { key: 'p3', label: 'Salons', avantMin: 0, objectifId: null }, { key: 'reste', label: 'Reste de l’activité', avantMin: 60 }];
  let g = run('pole', 300, 180, L);
  const btnOf = (c) => (c.children && c.children[0] && c.children[0].btn ? c.children[0] : null);
  const cellsText = (row) => row.cells.map((c) => btnOf(c) ? 'BTN:' + btnOf(c).min : c.textContent);
  assert(g.rows.length === 6 && cellsText(g.rows[0]).join('|') === 'Pôle|Avant|Après' && g.rows[0].cls.indexOf('objTTitle') >= 0, 'en-tête : le nom du niveau (« Pôle »), Avant, Après');
  assert(cellsText(g.rows[1]).join('|') === 'Produit|3h|5h' && !g.rows[1].cells.some((c) => btnOf(c)), '1re ligne : celle qu’on augmente (Produit 3h → 5h), en lecture seule (aucune case violette), Après > Avant');
  assert(cellsText(g.rows[2])[0] === 'Réseaux' && cellsText(g.rows[3]).join('|') === 'Salons|0h|BTN:0' && cellsText(g.rows[4])[0] === 'Reste de l’activité', 'puis TOUTES les autres lignes, même à 0 h (Salons), puis « Reste de l’activité » ; leurs Après sont modifiables');
  assert(btnOf(g.rows[2].cells[2]).maxMin === 120 && btnOf(g.rows[4].cells[2]).maxMin === 60, 'un Après ne peut pas dépasser son Avant (plafond de la roue = Avant)');
  assert(cellsText(g.rows[5]).join('|') === 'Total|6h|8h' && g.rows[5].cls.indexOf('objTTotal') >= 0, 'dernière ligne « Total » : Avant 6h (3 + 2 + 0 + 1), Après 8h tant que rien n’est repris');
  assert(g.note.textContent === 'Le total doit rester à 6h : reprends encore 2h sur les lignes du dessus.' && !g.note.hidden && !g.api.tpValid(), 'non équilibré : phrase « reprends encore 2h », « Suivant » grisé');
  btnOf(g.rows[2].cells[2]).onPick(0, { }); assert(g.note.textContent === '' && g.note.hidden && g.api.tpValid() && g.rows[5].cells[2].textContent === '6h', 'équilibré (Réseaux 2h → 0h) : total Après = Avant (6h), phrase disparue, « Suivant » actif (violet)');
  btnOf(g.rows[4].cells[2]).onPick(0, { }); assert(g.note.textContent === 'Le total doit rester à 6h : remets 1h sur une ligne.' && !g.api.tpValid(), 'trop repris (Réseaux et Reste à 0h) : phrase « remets 1h sur une ligne », « Suivant » grisé');
  g = run('secteur', 120, 60, [{ key: 's2', label: 'Blog', avantMin: 135, objectifId: 7 }, { key: 'reste', label: 'Reste du pôle', avantMin: 0 }]);
  assert(cellsText(g.rows[0])[0] === 'Secteur' && g.note.textContent === 'Le total doit rester à 3h15 : reprends encore 1h sur les lignes du dessus.', 'secteur : en-tête « Secteur », durées au format 3h15 dans la phrase');
  g = run('activite', 480, 240, [{ key: 'a2', label: 'Atelier', avantMin: 300, objectifId: 9 }, { key: 'reste', label: 'Reste de ta capacité', avantMin: 0 }]);
  assert(cellsText(g.rows[0])[0] === 'Activité' && cellsText(g.rows[3])[0] === 'Reste de ta capacité', 'activité : en-tête « Activité », ligne « Reste de ta capacité »');
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
