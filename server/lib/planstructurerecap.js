// Récapitulatif PUR de la structure des plans (fiches anonymes). Aucune base, aucun réseau, aucune lecture réelle.
// Cadrage : docs/expansion/lecture-organisation-ia-cadrage.md ; doc : docs/expansion/recap-structure-plans.md.
'use strict';
const L = require('./planstructurelists');

const CONFIG_DEFAUT = Object.freeze({
  seuilPeuFiable: 5,   // sous cet effectif : mention « peu_fiable » (JAMAIS d'exclusion)
  effectifRepli: 5,    // sous cet effectif, on remonte au groupe plus large
  ratioRapide: 1.5,    // rapide = vitesse >= ratioRapide x médiane de référence
  tolerancePerso: 0.1, // auto-comparaison : écart sous 10 % = stable
});

const ENUMS = { TYPES_ACTION: L.TYPES_ACTION, TOURNE_VERS: L.TOURNE_VERS };
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function valeurValide(type, v) {
  if (type === 'niveau') return L.NIVEAUX.includes(v);
  if (type === 'ratio') return estNombre(v) && v >= 0 && v <= 1;
  if (type === 'entier') return Number.isInteger(v) && v >= 0 && v <= 10000;
  if (type === 'duree') return estNombre(v) && v >= 0 && v <= 3650;
  if (type === 'bool') return typeof v === 'boolean';
  if (type === 'phases') return Array.isArray(v) && v.length <= 12 && v.every((p) => L.PHASES.includes(p));
  if (type.startsWith('enum:')) return ENUMS[type.slice(5)].includes(v);
  return false;
}

// Valide un bloc : clés EXACTEMENT celles du schéma (aucune inconnue), valeurs de listes fermées. Renvoie une copie propre.
function bloc(src, schema) {
  if (!estObjet(src)) return null;
  const cles = Object.keys(schema);
  if (Object.keys(src).some((k) => !cles.includes(k))) return null;
  const out = {};
  for (const k of cles) {
    if (!valeurValide(schema[k], src[k])) return null;
    out[k] = Array.isArray(src[k]) ? src[k].slice() : src[k];
  }
  return out;
}

// Validation stricte par liste blanche. Renvoie { ok:true, fiche } (copie reconstruite) ou { ok:false, raison } (code fixe,
// jamais une partie de l'entrée).
function validerFiche(f) {
  if (!estObjet(f)) return { ok: false, raison: 'forme' };
  const attendues = ['domaine', 'taille', 'cleVille', 'hauteur', 'vitesse', 'vitessePassee', 'axes', 'formes', 'contrepartie', 'marche'];
  if (Object.keys(f).some((k) => !attendues.includes(k))) return { ok: false, raison: 'cle_inconnue' };
  if (!L.DOMAINES.includes(f.domaine)) return { ok: false, raison: 'domaine' };
  if (!L.TAILLES.includes(f.taille)) return { ok: false, raison: 'taille' };
  if (typeof f.cleVille !== 'string' || !L.CLE_VILLE_RE.test(f.cleVille)) return { ok: false, raison: 'cle_ville' };
  if (!L.NIVEAUX.includes(f.hauteur)) return { ok: false, raison: 'hauteur' };
  if (!estNombre(f.vitesse) || f.vitesse <= 0) return { ok: false, raison: 'vitesse' };
  if (f.vitessePassee !== undefined && f.vitessePassee !== null && (!estNombre(f.vitessePassee) || f.vitessePassee <= 0)) return { ok: false, raison: 'vitesse_passee' };
  const axes = bloc(f.axes, L.AXES), formes = bloc(f.formes, L.FORMES), contrepartie = bloc(f.contrepartie, L.CONTREPARTIE), marche = bloc(f.marche, L.MARCHE);
  if (!axes) return { ok: false, raison: 'axes' };
  if (!formes) return { ok: false, raison: 'formes' };
  if (!contrepartie) return { ok: false, raison: 'contrepartie' };
  if (!marche) return { ok: false, raison: 'marche' };
  return { ok: true, fiche: {
    domaine: f.domaine, taille: f.taille, cleVille: f.cleVille, hauteur: f.hauteur, vitesse: f.vitesse,
    vitessePassee: estNombre(f.vitessePassee) ? f.vitessePassee : null, axes, formes, contrepartie, marche,
  } };
}

function mediane(nombres) {
  if (!nombres.length) return null;
  const t = nombres.slice().sort((a, b) => a - b), m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

const tiers = (v) => (v < 1 / 3 ? 'bas' : v < 2 / 3 ? 'moyen' : 'haut');
const niveauBucket = (v) => L.BUCKETS[v - 1];
// Étiquette de catégorie d'une valeur (fermée) pour construire des distributions sans jamais garder la valeur exacte.
function etiquette(type, v) {
  if (type === 'niveau') return niveauBucket(v);
  if (type === 'ratio') return tiers(v);
  if (type === 'entier') return v <= 3 ? 'bas' : v <= 10 ? 'moyen' : 'haut';
  if (type === 'duree') return v <= 1 ? 'bas' : v <= 7 ? 'moyen' : 'haut';
  if (type === 'bool') return v ? 'oui' : 'non';
  if (type === 'phases') return String(new Set(v).size); // nombre de phases distinctes (0 à 6)
  return v; // enum
}

// Mesures profilables : « axe.flouDicte », « forme.constance », « contrepartie.clients », « marche.partVeille ».
function mesures() {
  const m = [];
  for (const [bl, schema] of [['axe', L.AXES], ['forme', L.FORMES], ['contrepartie', L.CONTREPARTIE], ['marche', L.MARCHE]]) {
    for (const k of Object.keys(schema)) m.push({ nom: bl + '.' + k, bloc: bl, cle: k, type: schema[k] });
  }
  return m;
}
const MESURES = mesures();
const NOMS_MESURES = MESURES.map((m) => m.nom);
const lire = (fiche, m) => fiche[{ axe: 'axes', forme: 'formes', contrepartie: 'contrepartie', marche: 'marche' }[m.bloc]][m.cle];

function distribution(fiches) {
  const out = {};
  for (const m of MESURES) {
    const c = {};
    for (const f of fiches) { const e = etiquette(m.type, lire(f, m)); c[e] = (c[e] || 0) + 1; }
    const d = {};
    for (const e of Object.keys(c).sort()) d[e] = Math.round((c[e] / fiches.length) * 1000) / 1000;
    out[m.nom] = d;
  }
  return out;
}

// Auto-comparaison : vitesse actuelle contre vitesse passée de l'utilisateur lui-même.
function compareASoiMeme(fiche, cfg) {
  const c = Object.assign({}, CONFIG_DEFAUT, cfg);
  if (!fiche || !estNombre(fiche.vitessePassee) || fiche.vitessePassee <= 0) return null;
  const ratio = Math.round((fiche.vitesse / fiche.vitessePassee) * 1000) / 1000;
  const tendance = ratio >= 1 + c.tolerancePerso ? 'plus_rapide' : ratio <= 1 - c.tolerancePerso ? 'plus_lent' : 'stable';
  return { ratio, tendance };
}

// Vitesse de référence d'une fiche : médiane des fiches de MÊME hauteur dans le groupe (au moins 2), sinon médiane du groupe.
function referenceVitesse(fiche, membres) {
  const memeHauteur = membres.filter((x) => x.hauteur === fiche.hauteur);
  return mediane((memeHauteur.length >= 2 ? memeHauteur : membres).map((x) => x.vitesse));
}

// Groupe de comparaison : domaine > taille > ville, repli sur domaine > taille puis domaine si le groupe est petit.
function groupeDe(fiche, fiches, cfg) {
  const memes = (niv) => fiches.filter((x) => x.domaine === fiche.domaine && (niv < 2 || x.taille === fiche.taille) && (niv < 3 || x.cleVille === fiche.cleVille));
  for (const niv of [3, 2]) { if (memes(niv).length >= cfg.effectifRepli) return { niveau: niv, membres: memes(niv) }; }
  return { niveau: 1, membres: memes(1) };
}

// Grille de référence d'étude (Hill) : chaque point est couvert par des mesures, ou consigné « non mesurable ».
const GRILLE_HILL = Object.freeze([
  { point: 'desir_objectif_precis', mesures: ['forme.objectifChiffreDate'] },
  { point: 'foi', nonMesurable: true, approche: ['forme.delaiPremiereAction'] },
  { point: 'autosuggestion_repetition', mesures: ['forme.constance'] },
  { point: 'connaissance_specialisee', mesures: ['forme.concentration'] },
  { point: 'imagination', mesures: ['axe.typeAction'] },
  { point: 'plan_organise', mesures: ['forme.nombreEtapes', 'axe.phases', 'forme.ordreTaches', 'axe.flouDicte', 'axe.testAvantEngagement'] },
  { point: 'decision', mesures: ['forme.delaiDecision', 'forme.stabiliteObjectif'] },
  { point: 'perseverance', mesures: ['forme.constance', 'forme.tauxReports', 'axe.bouclesRevision'] },
  { point: 'maitres_penseurs_groupe', mesures: ['forme.partPartagees', 'axe.tourneVers'] },
  { point: 'action_immediate', mesures: ['forme.delaiPremiereAction'] },
  { point: 'date_limite', mesures: ['forme.objectifChiffreDate'] },
  { point: 'contrepartie_valeur_donnee', mesures: ['contrepartie.clients', 'contrepartie.amelioration', 'contrepartie.efficacite'] },
  { point: 'analyse_continue_marche', mesures: ['marche.partVeille', 'marche.regularite'] },
  { point: 'contrepartie_exacte', nonMesurable: true },
  { point: 'transmutation', nonMesurable: true },
  { point: 'subconscient', nonMesurable: true },
  { point: 'cerveau', nonMesurable: true },
  { point: 'sixieme_sens', nonMesurable: true },
]);

function rapportHill() {
  return GRILLE_HILL.map((p) => (p.nonMesurable
    ? { point: p.point, statut: 'non_mesurable', approche: p.approche ? p.approche.slice() : [] }
    : { point: p.point, statut: 'couvert', mesures: p.mesures.slice() }));
}

// Entrée : tableau de fiches brutes. Sortie : récap par groupe, fiches rejetées comptées par code (rien d'autre).
function recapitulerStructures(entrees, config) {
  const cfg = Object.assign({}, CONFIG_DEFAUT, config);
  const fiches = [], rejets = {};
  for (const e of Array.isArray(entrees) ? entrees : []) {
    const v = validerFiche(e);
    if (v.ok) fiches.push(v.fiche); else rejets[v.raison] = (rejets[v.raison] || 0) + 1;
  }
  const groupes = new Map();
  fiches.forEach((f) => {
    const g = groupeDe(f, fiches, cfg);
    const cle = [g.niveau, f.domaine, g.niveau >= 2 ? f.taille : '', g.niveau >= 3 ? f.cleVille : ''].join('|');
    if (!groupes.has(cle)) groupes.set(cle, { niveau: g.niveau, domaine: f.domaine, taille: g.niveau >= 2 ? f.taille : null, cleVille: g.niveau >= 3 ? f.cleVille : null, membres: g.membres });
  });
  const sortie = [...groupes.values()].map((g) => {
    const rapides = [], autres = [];
    for (const f of g.membres) (f.vitesse >= cfg.ratioRapide * referenceVitesse(f, g.membres) ? rapides : autres).push(f);
    const perso = g.membres.map((f) => compareASoiMeme(f, cfg)).filter(Boolean);
    const compte = (t) => perso.filter((p) => p.tendance === t).length;
    return {
      niveauGroupe: ['', 'domaine', 'domaine_taille', 'domaine_taille_ville'][g.niveau],
      domaine: g.domaine, taille: g.taille, cleVille: g.cleVille,
      effectif: g.membres.length,
      peu_fiable: g.membres.length < cfg.seuilPeuFiable,
      vitesseMediane: mediane(g.membres.map((f) => f.vitesse)),
      rapides: rapides.length,
      profilRapides: rapides.length ? distribution(rapides) : null,
      profilAutres: autres.length ? distribution(autres) : null,
      autoComparaison: { effectif: perso.length, plus_rapide: compte('plus_rapide'), stable: compte('stable'), plus_lent: compte('plus_lent') },
    };
  }).sort((a, b) => (a.domaine + a.niveauGroupe + (a.taille || '') + (a.cleVille || '')).localeCompare(b.domaine + b.niveauGroupe + (b.taille || '') + (b.cleVille || '')));
  return { acceptees: fiches.length, rejetees: rejets, groupes: sortie, couvertureHill: rapportHill() };
}

module.exports = { CONFIG_DEFAUT, NOMS_MESURES, GRILLE_HILL, validerFiche, compareASoiMeme, rapportHill, recapitulerStructures };
