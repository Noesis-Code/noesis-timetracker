'use strict';
// Robustesse typographique (chantier Précision, repli 25) : 20 titres de base x variantes graphiques systématiques
// (accents, casse, apostrophes, insécables, formats d'heure, tirets, suspension, emoji, espaces, retours, 200 car., fautes de frappe).
// Une variante doit donner le MÊME indice de date que la base. Usage : node test/precision-typo-test.js
const { parseDateHint } = require('../server/lib/capturedatehint');
const { cleanTitle } = require('../server/lib/taskprecision');
const TODAY = '2026-10-20'; // mardi
// 20 titres de base neutres : [titre, variante-temps '14 h 30' remplacee, ...]
const BASES = [
  'Réunion équipe demain à 14 h 30',
  'Appeler le fournisseur vendredi à 9 h',
  'Envoyer la facture après-demain',
  'Préparer la présentation la semaine prochaine',
  'Réviser le chapitre lundi à 18 h 15',
  'Payer le loyer avant le 30',
  'Rendez-vous médecin mercredi à 10 h 30',
  'Faire les courses ce soir',
  'Planifier le voyage dans 3 jours',
  'Ranger le garage samedi à 8 h',
  'Écrire le rapport dimanche à 16 h 45',
  'Courir aujourd\'hui à 7 h',
  'Dîner avec l\'équipe jeudi à 12 h 30',
  'Vérifier l\'état du budget en fin de semaine',
  'Nettoyer l\'atelier le 25 octobre',
  'Renouveler l\'abonnement dans 2 semaines',
  'Répondre aux courriels mardi prochain à 11 h',
  'Étudier l\'anglais demain à 20 h 15',
  'Livrer la commande vendredi avant 17 h',
  'Mettre à jour le plan demain matin',
];
function timeForms(t) {
  const m = /(\d{1,2}) h(?: (\d{2}))?/.exec(t);
  if (!m) return [];
  const h = +m[1], mi = m[2] || '';
  const pm = h >= 12, h12 = ((h + 11) % 12) + 1, mm = mi || '00';
  const rep = s => [t.replace(m[0], s)];
  return [].concat(
    rep(mi ? `${h}h${mi}` : `${h}h`), rep(mi ? `${h}:${mi}` : `${h}:00`),
    rep(mi ? `${h}H${mi}` : `${h}H`),
    rep(`${h12}:${mm}${pm ? 'pm' : 'am'}`), rep(`${h12}:${mm} ${pm ? 'PM' : 'AM'}`), rep(`${h12} ${pm ? 'PM' : 'AM'}`),
    rep(m[0].replace(' ', ' ')), rep(m[0].replace(/ /g, ' ')));
}
const noAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const TYPOS = [['demain', 'demian'], ['demain', 'demin'], ['vendredi', 'vendrdi'], ['vendredi', 'vendedi'], ['lundi', 'lindi'], ['mercredi', 'mercredy'], ['samedi', 'samdi'], ['dimanche', 'dimanch'], ['jeudi', 'jeudu'], ['mardi', 'mardy'], ['aujourd\'hui', 'aujourd\'hu'], ['semaine', 'semain'], ['prochaine', 'prochaine'], ['après-demain', 'après-demian'], ['dans', 'dnas'], ['octobre', 'octobr'], ['matin', 'matn'], ['soir', 'soit']];
function variants(t) {
  const v = [];
  const add = (k, s) => { if (s !== t) v.push([k, s]); };
  add('sans-accents', noAcc(t));
  add('majuscules', t.toUpperCase());
  add('minuscules', t.toLowerCase());
  add('apostrophe-courbe', t.replace(/'/g, '’'));
  add('apostrophe-droite', t.replace(/’/g, "'"));
  add('nbsp-avant-deux-points', 'Tâche : ' + t);
  add('nbsp-partout', t.replace(/ /g, ' '));
  add('tiret-long', t.replace(/-/g, '—').replace(/ à /, ' — à '));
  add('tiret-court-pre', 'Tâche - ' + t);
  add('tiret-en', 'Tâche – ' + t);
  add('suspension', t + '...');
  add('suspension-car', t + '…');
  add('suspension-milieu', t.replace(/ /, '... '));
  add('emoji-debut', '📅 ' + t);
  add('emoji-fin', t + ' ✅');
  add('double-espace', t.replace(/ /g, '  '));
  add('retour-ligne', t.replace(/ /, '\n'));
  add('retour-ligne-fin', t + '\n');
  add('tab', t.replace(/ /g, '\t'));
  add('espaces-bords', '   ' + t + '   ');
  add('puce', '• ' + t);
  add('guillemets', '« ' + t + ' »');
  add('point-final', t + '.');
  add('exclamation', t + ' !!');
  add('rallonge-200', t + ' ' + 'détail précis '.repeat(20).slice(0, 200 - t.length - 1));
  add('rallonge-prefixe', 'détail précis '.repeat(14).trim() + ' ' + t);
  add('mixte-sans-accent-maj', noAcc(t).toUpperCase());
  for (const f of timeForms(t)) add('heure:' + f.replace(/\s/g, '_').slice(-14), f);
  for (const [a, b] of TYPOS) { if (a !== b && t.toLowerCase().includes(a)) add('faute:' + a + '>' + b, t.replace(new RegExp(a, 'i'), b)); }
  return v;
}
const key = r => JSON.stringify(r);
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
let tot = 0, ok = 0; const fails = []; let emptied = 0;
for (const b of BASES) {
  const ref = parseDateHint(b, TODAY);
  assert(ref !== null, 'base avec indice : ' + b.slice(0, 30));
  for (const [k, s] of variants(b)) {
    tot++;
    const r = parseDateHint(s, TODAY);
    if (key(r) === key(ref)) ok++; else fails.push(k + ' | ' + JSON.stringify(s).slice(0, 60));
    if (cleanTitle(s).length === 0) emptied++;
  }
}
console.log('  variantes identiques : ' + ok + '/' + tot + ' (' + (100 * ok / tot).toFixed(1) + ' %)');
fails.forEach((f) => console.log('    écart : ' + f));
// Écarts connus et voulus : « soit » (vrai mot), « dnas » (« dans » exclu), « aujourd'hu » (trop court).
assert(ok / tot >= 0.99, 'au moins 99 % des variantes donnent le même indice que la base');
assert(emptied === 0, 'aucune variante de titre ne devient vide (cleanTitle)');
// Titre de 200 caractères intact ; au-delà, coupé à 200.
const t200 = 'Appeler ' + 'a'.repeat(192);
assert(cleanTitle(t200) === t200, 'titre de 200 caractères non tronqué');
assert(cleanTitle(t200 + 'bbb').length === 200, 'titre de 203 caractères coupé à 200');
// Fautes de frappe : seulement distance 1 et mot de temps sans ambiguïté ; jamais un autre mot.
const h = (t) => parseDateHint(t, TODAY);
assert(h('Appeler demian') && h('Appeler demian').date === '2026-10-21', 'demian -> demain');
assert(h('Appeler vendrdi') && h('Appeler vendrdi').date === '2026-10-23', 'vendrdi -> vendredi');
assert(h('Renouveler le domain name') === null, 'domain (anglais) jamais corrigé en demain');
assert(h('Prévoir remain en stock') === null, 'remain jamais corrigé');
assert(h('Réparer le bateau marin') === null, 'marin jamais corrigé en matin');
assert(h('Appeler demande') === null, 'demande non corrigé (distance 3)');
assert(h('Livrer vendredi avant 5 PM').date === '2026-10-23', '« avant 5 PM » n\'est pas le 5 du mois');
assert(h('Livrer vendredi avant 17:00').date === '2026-10-23', '« avant 17:00 » n\'est pas le 17 du mois');
process.exit(failed ? 1 : 0);
