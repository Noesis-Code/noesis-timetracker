// Test du récap de structure des plans (pur, données synthétiques). Usage : node test/planstructurerecap-test.js
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const R = require('../server/lib/planstructurerecap');
const L = require('../server/lib/planstructurelists');

const VILLE_A = 'a'.repeat(32), VILLE_B = 'b'.repeat(32);
function fiche(over) {
  return Object.assign({
    domaine: 'commerce_vente', taille: 'moyenne', cleVille: VILLE_A, hauteur: 2, vitesse: 1, vitessePassee: null,
    axes: { flouDicte: 2, typeAction: 'executer', phases: ['definir', 'produire'], testAvantEngagement: 1, bouclesRevision: 1, tourneVers: 'clients' },
    formes: { nombreEtapes: 5, precisionEstimation: 0.5, presenceNoteEcheance: 0.5, constance: 0.5, ordreTaches: 2, objectifChiffreDate: false, delaiPremiereAction: 3, partPartagees: 0.1, concentration: 0.5, delaiDecision: 2, stabiliteObjectif: 0.5, tauxReports: 0.2 },
    contrepartie: { clients: 2, amelioration: 1, efficacite: 1 },
    marche: { partVeille: 0.1, regularite: 0.2 },
  }, over || {});
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// 1. Petit groupe = peu_fiable, jamais exclu
let r = R.recapitulerStructures([fiche(), fiche({ vitesse: 2 })]);
assert(r.acceptees === 2 && r.groupes.length === 1, 'petit groupe : aucune fiche exclue');
assert(r.groupes[0].peu_fiable === true && r.groupes[0].effectif === 2, 'petit groupe : peu_fiable');
r = R.recapitulerStructures([1, 2, 3, 4, 5].map((i) => fiche({ vitesse: i })));
assert(r.groupes[0].peu_fiable === false && r.groupes[0].niveauGroupe === 'domaine_taille_ville', '5 fiches : fiable, niveau ville');
r = R.recapitulerStructures([1, 2, 3].map((i) => fiche({ vitesse: i })), { seuilPeuFiable: 2 });
assert(r.groupes[0].peu_fiable === false, 'seuil configurable');

// 2. Repli de groupe : ville différente -> taille -> domaine
const f5 = [1, 2, 3, 4, 5];
r = R.recapitulerStructures(f5.map((i) => fiche({ vitesse: i, cleVille: i % 2 ? VILLE_A : VILLE_B })));
assert(r.groupes.length === 1 && r.groupes[0].niveauGroupe === 'domaine_taille' && r.groupes[0].effectif === 5 && r.groupes[0].cleVille === null, 'repli ville -> domaine_taille');
r = R.recapitulerStructures(f5.map((i) => fiche({ vitesse: i, taille: L.TAILLES[i % 3], cleVille: i % 2 ? VILLE_A : VILLE_B })));
assert(r.groupes.length === 1 && r.groupes[0].niveauGroupe === 'domaine' && r.groupes[0].effectif === 5, 'repli taille -> domaine');
r = R.recapitulerStructures([fiche(), fiche({ domaine: 'sante_bienetre' })]);
assert(r.groupes.length === 2 && r.groupes.every((g) => g.peu_fiable && g.niveauGroupe === 'domaine'), 'domaines séparés');

// 3. Rapides vs autres
const lents = [1, 1, 1, 1, 1].map((v) => fiche({ vitesse: v }));
const rapides = [2, 3].map((v) => fiche({ vitesse: v, axes: Object.assign(clone(fiche().axes), { testAvantEngagement: 3 }), formes: Object.assign(clone(fiche().formes), { objectifChiffreDate: true }) }));
r = R.recapitulerStructures(lents.concat(rapides));
const g = r.groupes[0];
assert(g.vitesseMediane === 1 && g.rapides === 2, 'médiane 1 ; 2 rapides (>= 1,5 x médiane)');
assert(g.profilRapides['axe.testAvantEngagement'].haut === 1 && g.profilAutres['axe.testAvantEngagement'].bas === 1, 'profil rapides vs autres (test avant engagement)');
assert(g.profilRapides['forme.objectifChiffreDate'].oui === 1 && g.profilAutres['forme.objectifChiffreDate'].non === 1, 'profil rapides vs autres (objectif chiffré)');
r = R.recapitulerStructures(lents.concat(rapides), { ratioRapide: 4 });
assert(r.groupes[0].rapides === 0 && r.groupes[0].profilRapides === null, 'ratio configurable');
// Hauteur : même vitesse brute, mais rapide seulement relativement aux objectifs de même hauteur
const mix = [1, 1, 1].map((v) => fiche({ vitesse: v, hauteur: 1 })).concat([2, 2, 2].map((v) => fiche({ vitesse: v, hauteur: 3 })));
r = R.recapitulerStructures(mix);
assert(r.groupes[0].rapides === 0, 'hauteur : comparaison à objectifs de même hauteur');

// 4. Auto-comparaison
assert(R.compareASoiMeme(fiche({ vitesse: 2, vitessePassee: 1 })).tendance === 'plus_rapide', 'auto : plus rapide');
assert(R.compareASoiMeme(fiche({ vitesse: 1, vitessePassee: 2 })).tendance === 'plus_lent', 'auto : plus lent');
assert(R.compareASoiMeme(fiche({ vitesse: 1.05, vitessePassee: 1 })).tendance === 'stable', 'auto : stable');
assert(R.compareASoiMeme(fiche()) === null, 'auto : pas de passé = null');
r = R.recapitulerStructures([fiche({ vitesse: 2, vitessePassee: 1 }), fiche({ vitesse: 1, vitessePassee: 2 }), fiche()]);
assert(r.groupes[0].autoComparaison.effectif === 2 && r.groupes[0].autoComparaison.plus_rapide === 1 && r.groupes[0].autoComparaison.plus_lent === 1, 'auto : décompte dans le groupe');

// 5. Rejet de texte libre et garde-fou « aucun texte en sortie »
const MARQ = 'SECRET-client-Dupont-42';
const chemins = [];
(function parcours(o, p) { for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) parcours(v, p.concat(k)); else chemins.push(p.concat(k)); } })(fiche(), []);
const poser = (o, p, v) => { let c = o; for (const k of p.slice(0, -1)) c = c[k]; c[p[p.length - 1]] = v; return o; };
let toutRejete = true, aucuneFuite = true;
for (const p of chemins) {
  const f = poser(clone(fiche()), p, MARQ);
  if (R.validerFiche(f).ok) toutRejete = false;
  const sortie = JSON.stringify(R.recapitulerStructures([f, fiche()]));
  if (sortie.includes(MARQ)) aucuneFuite = false;
}
assert(toutRejete, 'texte libre injecté dans CHAQUE champ (' + chemins.length + ') : fiche rejetée');
assert(aucuneFuite, 'texte libre injecté dans chaque champ : absent de la sortie');
// Texte dans un tableau de phases, dans une clé inconnue (racine et blocs), dans un nom de clé
let f = clone(fiche()); f.axes.phases.push(MARQ);
assert(!R.validerFiche(f).ok, 'texte dans la suite de phases : rejeté');
f = clone(fiche()); f[MARQ] = 'x';
assert(R.validerFiche(f).raison === 'cle_inconnue', 'clé inconnue racine : rejetée');
for (const b of ['axes', 'formes', 'contrepartie', 'marche']) { f = clone(fiche()); f[b][MARQ] = 1; assert(!R.validerFiche(f).ok, 'clé inconnue dans ' + b + ' : rejetée'); }
f = clone(fiche()); f.commentaire = MARQ; assert(!R.validerFiche(f).ok, 'champ « commentaire » : rejeté');
f = clone(fiche()); f.cleVille = 'Montreal'; assert(!R.validerFiche(f).ok, 'nom de ville en clair : rejeté');
// La raison de rejet est un code fixe
const rej = R.recapitulerStructures([Object.assign(clone(fiche()), { domaine: MARQ })]);
assert(rej.acceptees === 0 && rej.rejetees.domaine === 1 && !JSON.stringify(rej).includes(MARQ), 'rejet : code fixe, aucune trace du texte');
// Entrée acceptée = copie reconstruite : un objet acceptable n'importe aucune propriété inattendue
const accepte = R.validerFiche(Object.assign(clone(fiche()), {})).fiche;
assert(JSON.stringify(accepte).length > 0 && !('commentaire' in accepte), 'fiche acceptée reconstruite depuis la liste blanche');
// Toutes les chaînes de la sortie viennent des listes fermées (ou de la clé de ville opaque)
const permises = new Set([].concat(L.DOMAINES, L.TAILLES, L.BUCKETS, L.TENDANCES, ['oui', 'non'], L.TYPES_ACTION, L.TOURNE_VERS, ['domaine', 'domaine_taille', 'domaine_taille_ville']));
const valeursSortie = [];
(function marche(o, cle) {
  if (typeof o === 'string') valeursSortie.push([cle, o]);
  else if (Array.isArray(o)) o.forEach((x) => marche(x, cle));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) marche(o[k], k);
})(R.recapitulerStructures(lents.concat(rapides)).groupes, '');
assert(valeursSortie.every(([k, v]) => permises.has(v) || (k === 'cleVille' && L.CLE_VILLE_RE.test(v))), 'sortie : seules des chaînes de listes fermées');

// 6. Rapport Hill
const hill = R.recapitulerStructures([fiche()]).couvertureHill;
const nonMes = hill.filter((p) => p.statut === 'non_mesurable').map((p) => p.point).sort();
assert(['cerveau', 'contrepartie_exacte', 'foi', 'sixieme_sens', 'subconscient', 'transmutation'].every((x) => nonMes.includes(x)) && nonMes.length === 6, 'Hill : 6 points non mesurables');
assert(hill.filter((p) => p.statut === 'couvert').every((p) => p.mesures.length > 0 && p.mesures.every((m) => R.NOMS_MESURES.includes(m))), 'Hill : chaque point couvert nomme des mesures existantes');
assert(hill.some((p) => p.point === 'analyse_continue_marche' && p.mesures.includes('marche.regularite')), 'Hill : analyse du marché couverte');
// Sans fiche valide : pas d'erreur
r = R.recapitulerStructures(null);
assert(r.acceptees === 0 && r.groupes.length === 0 && r.couvertureHill.length > 0, 'entrée vide : récap vide');
process.exit(failed ? 1 : 0);
