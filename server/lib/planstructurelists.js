// Listes FERMÉES de l'analyse de structure des plans (cadrage : docs/expansion/lecture-organisation-ia-cadrage.md).
// Un seul endroit à modifier. Aucune chaîne libre ne doit exister hors de ces listes (sauf la clé de ville, opaque).
'use strict';

// 15 domaines validés par Émilien (21 oct. 2026). « personnel_autres » = repli de tout plan non reconnu.
const DOMAINES = Object.freeze([
  'commerce_vente', 'services_professionnels', 'creation_contenu', 'enseignement_formation', 'sante_bienetre',
  'technologie_produit', 'finance_gestion', 'restauration_hotellerie', 'construction_metiers', 'droit_administration',
  'recherche_etudes', 'personnel_autres', 'arts_spectacle', 'transport_logistique', 'agriculture_environnement',
]);
const DOMAINE_REPLI = 'personnel_autres';

const PHASES = Object.freeze(['definir', 'preparer', 'produire', 'optimiser', 'diffuser', 'reviser']);
const NIVEAUX = Object.freeze([1, 2, 3]); // 1 = bas, 3 = haut (axes, hauteur d'objectif, contrepartie)
const TYPES_ACTION = Object.freeze(['executer', 'decider', 'explorer_creer']);
const TOURNE_VERS = Object.freeze(['soi', 'equipe', 'clients']);
const TAILLES = Object.freeze(['petite', 'moyenne', 'grande']); // taille d'objectif
const TENDANCES = Object.freeze(['plus_rapide', 'stable', 'plus_lent']);
const BUCKETS = Object.freeze(['bas', 'moyen', 'haut']);
// Clé de ville : chaîne opaque (condensat hexadécimal irréversible calculé ailleurs). Jamais un nom de lieu.
const CLE_VILLE_RE = /^[0-9a-f]{16,64}$/;

// Schéma des fiches : type de chaque champ. 'niveau' = 1..3, 'ratio' = 0..1, 'entier' >= 0, 'duree' = jours >= 0, 'bool'.
const AXES = Object.freeze({
  flouDicte: 'niveau', typeAction: 'enum:TYPES_ACTION', phases: 'phases', testAvantEngagement: 'niveau',
  bouclesRevision: 'niveau', tourneVers: 'enum:TOURNE_VERS',
});
const FORMES = Object.freeze({
  nombreEtapes: 'entier', precisionEstimation: 'ratio', presenceNoteEcheance: 'ratio', constance: 'ratio',
  ordreTaches: 'niveau', objectifChiffreDate: 'bool', delaiPremiereAction: 'duree', partPartagees: 'ratio',
  concentration: 'ratio', delaiDecision: 'duree', stabiliteObjectif: 'ratio', tauxReports: 'ratio',
});
const CONTREPARTIE = Object.freeze({ clients: 'niveau', amelioration: 'niveau', efficacite: 'niveau' });
const MARCHE = Object.freeze({ partVeille: 'ratio', regularite: 'ratio' });

module.exports = {
  DOMAINES, DOMAINE_REPLI, PHASES, NIVEAUX, TYPES_ACTION, TOURNE_VERS, TAILLES, TENDANCES, BUCKETS, CLE_VILLE_RE,
  AXES, FORMES, CONTREPARTIE, MARCHE,
};
