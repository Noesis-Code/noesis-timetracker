#!/usr/bin/env node
// Décompose chaque objectif périodique (Section 11 de
// noesis-timetracker-offre1-definition.md, déjà appliqué via
// scripts/apply-offre1-roadmap.js) en 4 objectifs hebdomadaires, pour
// l'activité "Noèsis" — sur demande directe d'Emilien, 16 septembre 2026 :
// « à partir des objectifs périodiques, génère-moi des objectifs
// hebdomadaires pour chaque période. »
//
// Précision de gouvernance (voir server/lib/goals.js, lignes 12-18) :
// goals.js n'a JAMAIS décomposé automatiquement un grand objectif en
// objectifs hebdomadaires — cette décomposition est le différenciateur
// explicite de l'offre payante MANAGER pour un client final. CE script-ci
// n'est pas ce moteur : c'est Emilien, propriétaire de Noèsis, qui a
// demandé cette décomposition pour SA PROPRE activité, à un assistant
// (Claude, hors de l'app) — exactement le même principe déjà appliqué à
// scripts/apply-offre1-roadmap.js pour le grand objectif périodique
// lui-même. Le résultat est écrit via goals.setWeekly(), exactement comme
// si Emilien l'avait tapé à la main — aucune logique de décomposition
// n'est ajoutée à l'app.
//
// Même patron de sécurité que apply-offre1-roadmap.js : lecture seule par
// défaut, --apply requis pour écrire, ne touche JAMAIS un objectif
// hebdomadaire déjà rempli (sauf --force).
//
// Usage, depuis la racine du dépôt :
//   node scripts/apply-offre1-weekly-goals.js
//       → liste (lecture seule) ce qui SERAIT écrit.
//   node scripts/apply-offre1-weekly-goals.js --apply
//       → écrit le texte de chaque semaine encore vide.
//   node scripts/apply-offre1-weekly-goals.js --apply --force
//       → comme ci-dessus, mais écrase aussi les semaines déjà remplies.
//   node scripts/apply-offre1-weekly-goals.js --apply <activityId>
//       → cible une activité précise par son id plutôt que "Noèsis".
//
// Pré-requis : les 3 catégories Entreprise/Produit/Communauté doivent déjà
// exister sur l'activité cible (créées par apply-offre1-roadmap.js) — ce
// script ne crée aucune catégorie, il échoue proprement si l'une des 3
// manque.

const db = require('../server/db');
const goals = require('../server/lib/goals');

const TARGET_ACTIVITY_NAME = 'Noèsis';

// Section 11.2 de noesis-timetracker-offre1-definition.md — ne pas modifier
// ici sans mettre à jour ce document en parallèle (source de vérité
// narrative). Chaque pôle porte exactement 4 textes (semaines 1 à 4),
// dérivés du grand objectif de la même période/pôle dans
// scripts/apply-offre1-roadmap.js, sans rien y ajouter de nouveau.
const WEEKLY = [
  { period: 1,
    entreprise: [
      "Lister précisément les 2 écarts identifiés dans les CGU (cadence mensuelle, consentement parental) et les options de correction possibles.",
      "Trancher les 2 écarts et rédiger le nouveau texte corrigé des CGU.",
      "Publier la version corrigée des CGU et identifier un prestataire pour le mandat de relecture juridique de base.",
      "Lancer officiellement le mandat de relecture juridique de base (contrat signé, périmètre confirmé).",
    ],
    produit: [
      "Revue du code de Gaspard par rapport à l'ordre du README et à la discipline SHA-256 du dépôt.",
      "Corriger les écarts relevés et préparer le merge dans le dépôt réel.",
      "Merger le code de Gaspard dans le dépôt réel.",
      "Confirmer et documenter l'inscription officielle du produit dans l'inventaire produit.",
    ],
    communaute: [
      "Définir le profil recherché pour les membres du groupe pilote.",
      "Dresser la liste des premiers contacts potentiels et préparer le message de sollicitation.",
      "Solliciter les premiers contacts identifiés pour rejoindre le groupe pilote.",
      "Confirmer les membres ayant répondu positivement et clore le recrutement du groupe pilote initial.",
    ] },
  { period: 2,
    entreprise: [
      "Configurer l'environnement de test avec les clés Stripe sandbox.",
      "Exécuter un test de bout en bout complet en sandbox et corriger les problèmes relevés.",
      "Basculer vers les vraies clés Stripe en production et refaire un test de bout en bout.",
      "Valider et documenter le résultat des tests Stripe production avant ouverture au groupe pilote.",
    ],
    produit: [
      "Réaliser la QA navigateur complet sur les navigateurs cibles et lister les anomalies.",
      "Corriger les anomalies relevées par la QA navigateur.",
      "Évaluer la qualité réelle des feuilles de route générées par offerdelivery.js sur des cas concrets.",
      "Ajuster le prompt d'offerdelivery.js selon les résultats de cette évaluation.",
    ],
    communaute: [
      "Lancer officiellement l'accès du groupe pilote au produit.",
      "Accompagner les premiers usages du groupe pilote et répondre à leurs questions.",
      "Recueillir un premier tour de retours structurés auprès du groupe pilote.",
      "Compiler et prioriser les premiers retours reçus du groupe pilote.",
    ] },
  { period: 3,
    entreprise: [
      "Rédiger le périmètre du mandat juridique pour le marché entre pairs (9.1).",
      "Rédiger le périmètre du mandat juridique pour l'architecture de consentement du score exportable (9.2).",
      "Identifier et solliciter un prestataire juridique pour ces deux mandats séparés.",
      "Lancer officiellement les deux mandats juridiques (contrats signés).",
    ],
    produit: [
      "Mettre en place le suivi du coût réel des appels IA par génération de feuille de route.",
      "Analyser les premières données de coût et les comparer à l'économie visée à 20$/mois.",
      "Corriger les bugs prioritaires remontés par le groupe pilote.",
      "Poursuivre la correction des bugs remontés et consolider le suivi du coût IA sur le mois.",
    ],
    communaute: [
      "Analyser en détail les retours déjà compilés du groupe pilote.",
      "Identifier les points de friction dans l'onboarding actuel à partir de ces retours.",
      "Ajuster l'onboarding selon les points de friction identifiés.",
      "Vérifier avec le groupe pilote que l'onboarding ajusté répond mieux à leurs besoins.",
    ] },
  { period: 4,
    entreprise: [
      "Recevoir et analyser le bilan légal du mandat lancé en période 3.",
      "Identifier les ajustements nécessaires aux CGU et au registre des traitements pour le score exportable.",
      "Rédiger les ajustements identifiés aux CGU et au registre des traitements.",
      "Publier les CGU et le registre des traitements mis à jour pour le score exportable.",
    ],
    produit: [
      "Définir précisément le fonctionnement du score d'exécution vérifié (calcul, lien de partage à usage limité).",
      "Développer le mécanisme de lien de partage à usage limité du score vérifié.",
      "Développer le mécanisme de facturation des frais de vérification au tiers.",
      "Tester en interne l'ensemble du parcours du score d'exécution vérifié avant mise à disposition.",
    ],
    communaute: [
      "Identifier un client du groupe pilote ayant un vrai besoin de score vérifié (ex. démarche de financement).",
      "Accompagner ce client dans la génération de son score vérifié.",
      "Recueillir son retour sur l'utilité et la clarté du score vérifié partagé.",
      "Ajuster le score vérifié selon ce retour avant de l'ouvrir plus largement.",
    ] },
  { period: 5,
    entreprise: [
      "Analyser l'usage actuel du tier gratuit et son impact sur la conversion payante.",
      "Formuler 2-3 scénarios de restructuration du tier gratuit et leur tarification associée.",
      "Trancher le scénario retenu pour la restructuration du tier gratuit et sa tarification.",
      "Documenter la décision retenue et préparer sa communication.",
    ],
    produit: [
      "Construire la liste des accompagnateurs éligibles du marché entre pairs (9.1).",
      "Développer la réservation et la facturation simples du marché entre pairs.",
      "Exécuter techniquement la restructuration du tier gratuit décidée par Entreprise.",
      "Tester en interne le MVP du marché entre pairs et la nouvelle structure du tier gratuit.",
    ],
    communaute: [
      "Identifier les membres ayant les scores d'exécution déjà les plus élevés.",
      "Les solliciter pour devenir accompagnateurs pilotes du marché entre pairs.",
      "Confirmer et intégrer les premiers accompagnateurs pilotes ayant répondu positivement.",
      "Préparer avec eux leur fiche de présentation sur le marché entre pairs.",
    ] },
  { period: 6,
    entreprise: [
      "Compiler les chiffres réels des 5 premiers mois (abonnés, coûts IA, retours clients).",
      "Analyser ce bilan chiffré et en tirer les enseignements principaux.",
      "Formuler 2-3 scénarios de budget publicité à partir de ce bilan.",
      "Trancher le budget publicité retenu pour la suite.",
    ],
    produit: [
      "Recenser les bugs et frictions remontés sur les tout premiers usages réels du marché entre pairs et du score vérifié.",
      "Corriger les bugs prioritaires du marché entre pairs.",
      "Corriger les bugs prioritaires du score vérifié.",
      "Revérifier la stabilité de l'ensemble sur un nouveau cycle d'usage réel.",
    ],
    communaute: [
      "Recueillir les retours qualitatifs des premiers utilisateurs du score vérifié.",
      "Recueillir les retours qualitatifs des premiers utilisateurs du marché entre pairs.",
      "Synthétiser ces retours qualitatifs en appui du bilan chiffré d'Entreprise.",
      "Partager cette synthèse avec Entreprise et Produit pour éclairer leurs décisions.",
    ] },
  { period: 7,
    entreprise: [
      "Mettre en place les campagnes publicitaires selon le budget décidé à la période 6.",
      "Lancer et suivre les premières campagnes publicitaires.",
      "Évaluer le volume réel d'abonnés atteint à ce stade.",
      "Réévaluer la piste de pool mutualisé entre activités (9.3) à partir de ce volume réel.",
    ],
    produit: [
      "Prioriser les retours du groupe pilote et les données du premier trimestre à traiter.",
      "Implémenter les premières itérations produit issues de cette priorisation.",
      "Tester ces itérations auprès du groupe pilote.",
      "Ajuster et finaliser les itérations selon les tests.",
    ],
    communaute: [
      "Concevoir le mécanisme de parrainage/bouche-à-oreille à activer.",
      "Mettre en place ce mécanisme et le communiquer aux membres actuels.",
      "Lancer l'effort de croissance ciblé en appui du budget publicité démarré par Entreprise.",
      "Suivre les premiers résultats de cet effort de croissance et ajuster si besoin.",
    ] },
  { period: 8,
    entreprise: [
      "Mettre en place le suivi du retour sur investissement des campagnes publicitaires en cours.",
      "Analyser les premiers résultats de ce suivi.",
      "Identifier les ajustements à apporter (budget, ciblage, canaux).",
      "Appliquer les ajustements retenus au budget publicité.",
    ],
    produit: [
      "Identifier et intégrer de nouveaux accompagnateurs pour élargir le marché entre pairs.",
      "Analyser les 3-4 mois de données réelles disponibles sur le score vérifié.",
      "Affiner le calcul du score vérifié à partir de cette analyse.",
      "Vérifier la cohérence du score vérifié affiné sur un nouvel échantillon d'usages.",
    ],
    communaute: [
      "Identifier les prospects (accompagnateurs et clients) générés par les premiers résultats publicitaires.",
      "Solliciter ces prospects et répondre à leurs questions.",
      "Confirmer et intégrer les nouveaux accompagnateurs et clients ayant répondu positivement.",
      "Faire un premier bilan de ce recrutement avec Entreprise (résultat vs budget publicitaire engagé).",
    ] },
  { period: 9,
    entreprise: [
      "Identifier 3-5 pistes de relations B2B directes potentielles, à la manière de Jacopo.",
      "Prendre contact avec ces pistes et présenter l'offre Noèsis.",
      "Approfondir les discussions avec les pistes les plus réceptives.",
      "Retenir 1-3 relations B2B directes à formaliser.",
    ],
    produit: [
      "Vérifier si un secteur a atteint la masse critique de 15-20 membres identifiée pour le pool mutualisé.",
      "Si oui, concevoir le pilote de pool mutualisé pour ce secteur ; si non, documenter les raisons de l'écart.",
      "Si un pilote est lancé, le mettre en place techniquement avec le secteur concerné ; sinon, formuler les conditions à revoir pour la période suivante.",
      "Faire un premier bilan de ce pilote (ou de la décision de différer) avec Entreprise.",
    ],
    communaute: [
      "Recenser l'état actuel des filtres Communauté (Partenaires/Clients/Financement) et leur lien avec le score vérifié.",
      "Identifier les manques restants pour combiner pleinement ces filtres au score vérifié.",
      "Implémenter les ajustements nécessaires pour fermer la boucle.",
      "Vérifier avec quelques membres que la combinaison filtres + score vérifié fonctionne comme prévu.",
    ] },
  { period: 10,
    entreprise: [
      "Compiler les données réelles d'usage multi-activité disponibles depuis le lancement.",
      "Analyser ces données pour évaluer la pertinence d'une remise multi-activités.",
      "Formuler la décision (remise ou non, et ses modalités si oui).",
      "Documenter et communiquer la décision retenue sur la remise multi-activités.",
    ],
    produit: [
      "Si le pilote de pool mutualisé a été lancé, recenser ses bugs et frictions ; sinon, recenser les points d'affinement du marché entre pairs et du score vérifié.",
      "Corriger/affiner les points prioritaires identifiés.",
      "Poursuivre cette stabilisation ou cet affinement.",
      "Faire un point d'étape avec Entreprise sur l'état atteint.",
    ],
    communaute: [
      "Recueillir les premiers retours des relations B2B directes formalisées en période 9.",
      "Recueillir les retours du pilote de pool mutualisé, si lancé.",
      "Synthétiser l'ensemble de ces retours.",
      "Partager cette synthèse avec Entreprise et Produit.",
    ] },
  { period: 11,
    entreprise: [
      "Préparer la revue annuelle de conformité (rassembler les documents Loi 25 et registre des traitements à jour).",
      "Réaliser la revue de conformité Loi 25.",
      "Réaliser la revue du registre des traitements.",
      "Consolider les constats de la revue annuelle et lister les actions correctives éventuelles.",
    ],
    produit: [
      "Mettre en place, si ce n'est pas déjà fait, une procédure de résolution de litige pour le marché entre pairs.",
      "Traiter les litiges ou frictions opérationnelles en attente sur le marché entre pairs.",
      "Consolider les derniers points opérationnels du score vérifié.",
      "Vérifier que l'ensemble marché entre pairs + score vérifié tourne de façon stable et autonome.",
    ],
    communaute: [
      "Dresser le bilan des résultats cumulés de l'année en recrutement (accompagnateurs et clients).",
      "Identifier les canaux les plus efficaces à partir de ce bilan.",
      "Poursuivre le recrutement en priorisant ces canaux.",
      "Faire un point d'étape sur les nouveaux accompagnateurs/clients recrutés ce mois-ci.",
    ] },
  { period: 12,
    entreprise: [
      "Compiler les chiffres réels de fin de cycle (abonnés, coûts, revenus).",
      "Comparer ces chiffres aux cibles de la section 8 et analyser les écarts.",
      "Formuler les scénarios de budget/tarification pour l'année suivante.",
      "Trancher le budget et la tarification retenus pour l'année suivante.",
    ],
    produit: [
      "Lister l'ensemble des briques produit livrées cette année.",
      "Documenter, pour chaque brique, ce qui est prouvé et à garder.",
      "Documenter, pour chaque brique, ce qui doit pivoter et pourquoi.",
      "Consolider cette documentation en une synthèse partageable avec Entreprise.",
    ],
    communaute: [
      "Préparer et envoyer une sollicitation de retour de fin d'année à l'ensemble des utilisateurs Offre1.",
      "Recueillir les premières réponses reçues.",
      "Relancer les utilisateurs n'ayant pas encore répondu.",
      "Synthétiser l'ensemble des retours qualitatifs de fin d'année.",
    ] },
  { period: 13,
    entreprise: [
      "Rassembler l'ensemble des décisions de l'année (tarification, remise multi-activités, budget).",
      "Consolider ces décisions dans un document de référence unique.",
      "Esquisser les grandes lignes du plan de l'année 2 à partir de cette consolidation.",
      "Finaliser et valider le plan de l'année 2 avant sa préparation détaillée par Produit.",
    ],
    produit: [
      "Reprendre le bilan « prouvé / à pivoter » de la période 12 comme base de travail.",
      "Esquisser les grandes lignes de la feuille de route technique de l'année 2.",
      "Détailler cette feuille de route par trimestre ou par brique.",
      "Finaliser et documenter la feuille de route technique de l'année 2.",
    ],
    communaute: [
      "Recenser les réussites marquantes du groupe pilote et des premiers accompagnateurs sur l'année.",
      "Préparer un contenu de célébration/mise en valeur de ces réussites.",
      "Publier ce contenu auprès de la communauté élargie.",
      "Recueillir les réactions de la communauté élargie et clore l'année sur ce bilan.",
    ] },
];

const POLES = [
  { rowKey: 'entreprise', label: 'Entreprise' },
  { rowKey: 'produit', label: 'Produit' },
  { rowKey: 'communaute', label: 'Communauté' },
];

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const positional = args.filter((a) => a !== '--apply' && a !== '--force');

function findActivity() {
  if (positional.length) {
    const id = Number(positional[0]);
    if (!Number.isInteger(id) || id <= 0) {
      console.error('Id d\'activité invalide : ' + positional[0]);
      process.exit(1);
    }
    const row = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(id);
    if (!row) { console.error('Activité introuvable : id ' + id); process.exit(1); }
    return row;
  }
  const matches = db.prepare('SELECT id, name FROM activities WHERE active = 1 AND LOWER(name) = LOWER(?)').all(TARGET_ACTIVITY_NAME);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    console.error('Aucune activité active nommée "' + TARGET_ACTIVITY_NAME + '" trouvée.');
    console.error('Relance avec l\'id exact : node scripts/apply-offre1-weekly-goals.js [--apply] <activityId>');
    process.exit(1);
  }
  console.error(matches.length + ' activités actives nommées "' + TARGET_ACTIVITY_NAME + '" — précise l\'id exact :');
  matches.forEach((m) => console.error('  id ' + m.id));
  process.exit(1);
}

function existingWeeklyText(activityId, category, periodNumber, weekIndex) {
  const row = db.prepare(`
    SELECT w.text FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND p.periodNumber = ? AND w.weekIndex = ? AND w.carriedOverFromId IS NULL
  `).get(activityId, category, periodNumber, weekIndex);
  return row ? row.text : '';
}

function preview(text, n) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

const activity = findActivity();
console.log('Activité : "' + activity.name + '" (id ' + activity.id + ')\n');

const activeCategories = goals.categoriesForActivity(activity.id);
const resolved = POLES.map((pole) => {
  const match = activeCategories.find((c) => c.label.trim().toLowerCase() === pole.label.toLowerCase());
  return { ...pole, key: match ? match.key : null };
});
const missing = resolved.filter((p) => !p.key);

if (missing.length) {
  console.error('Catégorie(s) manquante(s) sur cette activité : ' + missing.map((p) => p.label).join(', '));
  console.error('Lance d\'abord scripts/apply-offre1-roadmap.js --apply (il les crée).');
  process.exit(1);
}

console.log('Catégories : ' + resolved.map((p) => p.label + ' (clé "' + p.key + '")').join(', ') + '\n');

let toWrite = 0;
let toSkip = 0;

WEEKLY.forEach((row) => {
  POLES.forEach((pole) => {
    const p = resolved.find((r) => r.rowKey === pole.rowKey);
    const texts = row[pole.rowKey];
    texts.forEach((text, i) => {
      const weekIndex = i + 1;
      console.log('Période ' + row.period + ' — ' + pole.label + ' — Semaine ' + weekIndex + ' :');

      const existing = existingWeeklyText(activity.id, p.key, row.period, weekIndex);
      if (existing && !force) {
        toSkip += 1;
        console.log('  ignoré — déjà rempli : « ' + preview(existing, 80) + ' »');
        return;
      }

      toWrite += 1;
      if (!apply) {
        console.log('  ' + (existing ? '(sera écrasé, --force) ' : '') + 'à écrire : « ' + preview(text, 80) + ' »');
        return;
      }

      goals.setWeekly(activity.id, p.key, row.period, weekIndex, text);
      console.log('  écrit.');
    });
  });
});

console.log('\n' + toWrite + ' semaine(s) ' + (apply ? 'écrite(s)' : 'à écrire') + ', ' + toSkip + ' déjà remplie(s) et ignorée(s).');

if (!apply) {
  console.log('\nAucune écriture effectuée (mode lecture seule). Relancer avec --apply pour appliquer,');
  console.log('ou --apply --force pour aussi écraser les semaines déjà remplies.');
}
