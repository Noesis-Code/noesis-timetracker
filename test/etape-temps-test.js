// Étape « Temps » de la création d'un objectif : structure du code client et comportement des écrans (hausse / baisse / glissements), sans bouton « Valider », valeur modifiable sans rectangle.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'objectifs-creer.css'), 'utf8').split('\r\n').join('\n');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');

assert(js.includes("tr('Prévu')") && js.includes("tr('Passé')"), 'tableau : colonnes Prévu et Passé');
assert(js.includes("tr('Heures par semaine')") && js.includes('D’où vient ce temps ?'), 'écrans 1 et 2 titrés');
assert(js.includes('Prendre sur') && js.includes('Ajouter'), 'cartes Ajouter / Prendre sur');
assert(js.includes('tpScreen1') && js.includes('tpScreen2') && js.includes('tpScreen3'), 'trois écrans');
assert(js.includes('tpPages') && js.includes('tasksPages'), 'balayage : mécanisme de pages existant');
assert(!/objTDots|pagination|pageDots/.test(js.slice(js.indexOf('function tpPaint'), js.indexOf('function tpPaint') + 3000)), 'aucun point de pagination');
assert(!js.includes('tpValider') && !js.includes("tr('Valider')") && !js.includes('tp.committed'), 'plus de bouton « Valider » ni d’écran qui revient à l’écran 1');
assert(js.includes('stepBtn.disabled = !tpValid(); advance = i < tot - 1 ? stepNext : finishAll;'), 'le bouton du bas reste « Suivant » / « Terminer » ; grisé seulement si la répartition n’est pas équilibrée');
assert((js.match(/\/api\/objectifs\/temps\/plan/g) || []).length === 2 && js.includes('function tpApply()') && js.includes('function go(replaceId) { return tpApply().then('), 'le serveur n’est modifié qu’à « Terminer » (tpApply dans la création) ; l’aperçu de l’effet ne modifie rien');
assert(js.includes("i.addEventListener('change', onCommit)") && js.includes("ev.key === 'Enter'") && !/addEventListener\('input'[^\n]*tpPaint/.test(js), 'valeur confirmée par Entrée ou perte de focus, jamais à chaque frappe');
assert(js.includes('<= 168') || js.includes('168'), 'plafond 168 h');
assert(!js.includes('function paintPeriods') && !js.includes('function paintHours') && !js.includes('hoursBox'), 'ancien code de l’étape Temps retiré');
assert(!/<=\s*80\b/.test(js.slice(js.indexOf('function parseHrs'), js.indexOf('function parseHrs') + 400)), 'plus de limite à 80 h');
assert(js.includes("form.innerGoals = form.innerGoals || 'les_deux'"), 'valeur par défaut des objectifs inclus inchangée');
assert(js.includes("'&inner=' + (form.weeklyOn ? 'hebdomadaires' : 'periodiques')") && js.includes("q.inner || ''"), 'la recherche de la case tient compte de Hebdomadaire / Périodique');
const ed = css.slice(css.indexOf('input[type=text].objTEdit {'), css.indexOf('input[type=text].objTEdit:focus'));
assert(/color: var\(--purple\)/.test(ed) && /border: 0/.test(ed) && /background: none/.test(ed) && /box-shadow: none/.test(ed) && /min-height: 44px/.test(ed) && /text-align: right/.test(ed), 'valeur modifiable : texte violet nu, aligné à droite, sans fond ni bordure ni cadre, zone de toucher 44 px');
assert(/input\[type=text\]\.objTEdit:focus \{[^}]*box-shadow: 0 1px 0 0 var\(--purple\)/.test(css) && !/objTEdit[^{]*\{[^}]*(border: 1px|outline: [^n])/.test(css), 'au focus seulement : un trait fin sous le chiffre, aucun cadre');
assert(js.includes("'cmpList'"), 'lignes séparées bord à bord (R22, .cmpList)');
['Heures par semaine', 'Prévu', 'Passé', 'Toutes tes activités'].forEach((k) => assert(i18n.includes(k), 'traduction : ' + k));
assert(js.includes('function tsep()') && (js.match(/tsep()/g) || []).length >= 4 && js.includes("'objTPair objTHead'") && /.objTSep {[^}]*color: var(--text-light)/.test(css) && /.objTPair {[^}]*76px 12px 76px/.test(css), 'écran 1 : « Prévu / Passé » avec une barre oblique grise (une seule fonction de rendu, même position sur toutes les lignes, sans colonne ajoutée à l’écran Avant / Après)');
{ const hm = js.match(/function hrs(min) {[^
]*
s*function hh(min) {[^
]*
/); const f = hm && new Function('window', hm[0] + '; return { hrs: hrs, hh: hh };'); const F = f && f({ NoesisI18n: { getLang: () => 'fr' } }), G = f && f({ NoesisI18n: { getLang: () => 'en' } });
  assert(F && F.hh(780) === '13 h' && F.hrs(795) === '13,25' && F.hrs(810) === '13,5' && F.hrs(825) === '13,75' && F.hh(null) === '—' && G.hrs(795) === '13.25', 'formatage des heures : « 13 h », 13,25, 13,5, 13,75 (virgule en français, point en anglais), une seule fonction'); }
const m = js.match(/function parseHrs\(raw\) \{[\s\S]*?\n    \}/);
if (m) { const parseHrs = new Function(m[0] + '; return parseHrs;')(); assert(parseHrs('168').ok && parseHrs('168').min === 168 * 60, '168 accepté'); assert(!parseHrs('169').ok, '169 refusé'); assert(parseHrs('1,5').ok && parseHrs('1,5').min === 90, 'décimales permises'); }

// comportement des écrans (fonctions extraites telles quelles du code)
{
  const a = js.indexOf('    function tpOld()'), b = js.indexOf('    var LV = '), c = js.indexOf('    function tpCommit(raw)'), d = js.indexOf('    function modeLabel(m)');
  const pa = m[0];
  const mk = (e, valueMin) => {
    const tp = { e, valueMin, mode: null, apres: {}, page: 0, effects: null };
    const api = new Function('tp', 'tpSync', 'tpPaint', pa + '\n' + js.slice(a, b) + '\n' + js.slice(c, d) + '\nreturn { tpCommit, tpPages, tpValid, tpIncrease, tpChanging, tpMode, tpBalanced };')(tp, () => {}, () => {});
    return Object.assign({ tp }, api);
  };
  const E = (modes) => ({ valueMin: 360, modes, takeLines: { autres: [{ key: 'p2', label: 'P2', avantMin: 180 }], reste: [] } });
  let t = mk(E(['ajouter', 'autres', 'reste']), 360);
  t.tpCommit('6'); assert(t.tp.page === 0 && !t.tpChanging() && t.tpPages().join() === 's1', 'valeur inchangée : aucun glissement, un seul écran');
  t.tpCommit('4'); assert(t.tp.page === 0 && t.tpChanging() && !t.tpIncrease() && t.tpPages().join() === 's1' && t.tpValid(), 'baisse : aucun glissement, aucune question (le temps libéré reste libre), « Suivant » actif');
  t.tpCommit('9'); assert(t.tp.page === 1 && t.tpIncrease() && t.tpPages().join() === 's1,s2' && !t.tpValid(), 'hausse : glissement vers « D’où vient ce temps ? » ; « Suivant » grisé tant que rien n’est choisi');
  t.tp.mode = 'ajouter'; assert(t.tpPages().join() === 's1,s2,s3' && t.tpValid(), 'Ajouter : écran d’effet, « Suivant » actif');
  t.tp.mode = 'autres'; t.tp.apres = { p2: 120 }; assert(t.tpBalanced() === false && !t.tpValid(), '« Prendre sur… » non équilibré (1 h prise pour 3 h de hausse) : « Suivant » grisé');
  t.tp.apres = { p2: 0 }; assert(t.tpBalanced() && t.tpValid(), '« Prendre sur… » équilibré (3 h prises pour 3 h) : « Suivant » actif');
  t.tpCommit('6'); assert(t.tp.page === 0 && !t.tpChanging() && t.tp.mode === null && t.tpPages().join() === 's1', 'valeur remise au défaut : le changement est annulé (retour à un seul écran)');
  t.tpCommit(''); assert(t.tp.valueMin === 360, 'champ vidé : retour à la valeur par défaut');
  t = mk(E(['ajouter']), 360); t.tpCommit('7'); assert(t.tp.page === 1 && t.tpPages().join() === 's1,s3' && t.tpMode() === 'ajouter' && t.tpValid(), 'une seule possibilité : l’écran « d’où vient ce temps » est sauté, glissement direct vers l’effet');
  t = mk(E(['ajouter', 'autres']), 360); t.tpCommit('169'); assert(t.tp.valueMin === 360, 'plus de 168 h : refusé, valeur inchangée');
  t.tpCommit('168'); assert(t.tpIncrease() && t.tp.valueMin === 168 * 60, '168 h acceptées');
}
console.log(failed ? '\netape-temps-test : ' + failed + ' ÉCHEC(S)' : '\netape-temps-test : OK');
process.exit(failed ? 1 : 0);
