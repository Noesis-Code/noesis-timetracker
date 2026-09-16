#!/usr/bin/env node
// Applique le plan de développement Offre 1 sur 1 an (13 périodes × 3 pôles,
// noesis-timetracker-offre1-definition.md section 11) comme objectifs
// périodiques réels de l'activité "Noèsis", dans l'onglet Objectifs de l'app
// — exactement comme si Emilien les avait tapés à la main, via
// goals.setMainGoal() (server/lib/goals.js), aucune nouvelle logique de
// planning. Discussion A (Offre1), 16 septembre 2026, sur demande directe
// d'Emilien ("je souhaite que tu appliques cette feuille de route une fois
// réalisée au staging"), pour rester cohérent avec le cycle réel de l'onglet
// Objectifs (13 périodes de 4 semaines) plutôt qu'un découpage par mois civil.
//
// Même patron de sécurité que scripts/realign-goals-monday.js déjà en place
// sur ce projet : lecture seule par défaut, --apply requis pour écrire, et
// NE TOUCHE JAMAIS un objectif périodique déjà rempli (par Emilien ou par
// quiconque) — pour ne jamais écraser une saisie manuelle déjà faite dans
// l'app. --force lève cette protection, à utiliser sciemment seulement.
//
// Usage, depuis la racine du dépôt :
//   node scripts/apply-offre1-roadmap.js
//       → liste (lecture seule) ce qui SERAIT écrit : activité trouvée,
//         catégories déjà présentes / à créer, et pour chaque période×pôle,
//         "à écrire" (case actuellement vide) ou "ignoré, déjà rempli" avec
//         un aperçu du texte déjà présent.
//   node scripts/apply-offre1-roadmap.js --apply
//       → crée les catégories manquantes (Entreprise/Produit/Communauté) si
//         besoin, puis écrit le texte de chaque case encore vide.
//   node scripts/apply-offre1-roadmap.js --apply --force
//       → comme ci-dessus, mais écrase aussi les cases déjà remplies.
//   node scripts/apply-offre1-roadmap.js --apply <activityId>
//       → cible une activité précise par son id plutôt que de chercher
//         "Noèsis" par son nom (utile si plusieurs activités portent un nom
//         proche, ou si elle a été renommée).

const db = require('../server/db');
const goals = require('../server/lib/goals');

const TARGET_ACTIVITY_NAME = 'Noèsis';

// Section 11 de noesis-timetracker-offre1-definition.md — ne pas modifier ici
// sans mettre à jour ce document en parallèle (source de vérité narrative).
const ROADMAP = [
  { period: 1, entreprise: "Trancher les 2 écarts CGU (cadence mensuelle, consentement parental) et corriger le texte ; lancer le mandat de relecture juridique de base.", produit: "Merger le code de Gaspard dans le dépôt réel (ordre du README, discipline SHA-256) ; confirmer l'inscription officielle dans l'inventaire produit.", communaute: "Identifier et solliciter les premiers membres du groupe pilote pour le lancement restreint." },
  { period: 2, entreprise: "Test de bout en bout avec de vraies clés Stripe (sandbox puis production).", produit: "QA navigateur complet ; ajuster le prompt d'offerdelivery.js selon la qualité réelle des feuilles de route générées.", communaute: "Lancer le groupe pilote et commencer à recueillir les premiers retours." },
  { period: 3, entreprise: "Mandat juridique séparé pour le marché entre pairs (9.1) et l'architecture de consentement du score exportable (9.2).", produit: "Surveiller le coût réel des appels IA par génération pour valider l'économie à 20$/mois ; corriger les bugs remontés par le pilote.", communaute: "Poursuivre l'exploitation des retours du groupe pilote ; ajuster l'onboarding si besoin." },
  { period: 4, entreprise: "Revue du bilan légal du mandat de la période 3 ; ajuster si besoin les CGU/registre des traitements pour le score exportable.", produit: "Construire le score d'exécution vérifié (9.2) — lien de partage à usage limité, frais de vérification facturés au tiers.", communaute: "Tester le score vérifié avec un client ayant un vrai besoin (ex. démarche de financement)." },
  { period: 5, entreprise: "Décider de la restructuration du tier gratuit et de la tarification qui en découle.", produit: "Construire le MVP du marché entre pairs (9.1) — liste d'accompagnateurs éligibles, réservation et facturation simples ; exécuter techniquement la restructuration du tier gratuit.", communaute: "Recruter les premiers accompagnateurs pilotes à partir des scores d'exécution déjà les plus élevés." },
  { period: 6, entreprise: "Bilan chiffré des 5 premiers mois (abonnés réels, coûts IA réels, retours clients) et décision sur le budget publicité.", produit: "Stabiliser et corriger le marché entre pairs et le score vérifié à partir des tout premiers usages réels.", communaute: "Rassembler les retours qualitatifs sur le score vérifié et le marché entre pairs, en appui du bilan chiffré." },
  { period: 7, entreprise: "Démarrer le budget publicité décidé à la période 6 ; réévaluer la piste de pool mutualisé entre activités (9.3) à partir du volume réel d'abonnés atteint.", produit: "Itérer sur le produit selon les retours du pilote et le premier trimestre de données réelles.", communaute: "Premier effort de croissance ciblé (bouche-à-oreille/parrainage) appuyé sur le budget publicité." },
  { period: 8, entreprise: "Suivre le retour sur investissement du budget publicité et ajuster.", produit: "Élargir le marché entre pairs à davantage d'accompagnateurs ; affiner le score vérifié avec 3-4 mois de données réelles.", communaute: "Recruter de nouveaux accompagnateurs et clients à partir des premiers résultats publicitaires." },
  { period: 9, entreprise: "Explorer 1-3 relations B2B directes supplémentaires (à la Jacopo) pour la traction de niche visée.", produit: "Lancer un pilote de pool mutualisé (9.3) si un secteur atteint la masse critique identifiée (15-20 membres), sinon documenter pourquoi et différer encore.", communaute: "Fermer la boucle sur les filtres Communauté existants (Partenaires/Clients/Financement) combinés au score vérifié (piste 9.4)." },
  { period: 10, entreprise: "Trancher la remise multi-activités, restée différée depuis le lancement, à partir des données réelles d'usage multi-activité.", produit: "Stabiliser le pilote de pool mutualisé s'il a été lancé à la période 9 ; sinon poursuivre l'affinement du marché entre pairs et du score vérifié.", communaute: "Recueillir les retours du pilote B2B et des nouvelles relations directes." },
  { period: 11, entreprise: "Revue annuelle de conformité (Loi 25, registre des traitements) à date fixe, avant le bilan de fin de cycle.", produit: "Consolider l'opérationnel du marché entre pairs (résolution de litige si besoin) et du score vérifié.", communaute: "Poursuivre le recrutement d'accompagnateurs et de clients à partir des résultats cumulés de l'année." },
  { period: 12, entreprise: "Bilan chiffré de fin de cycle (abonnés réels vs cibles de la section 8, coûts réels, revenus) et décision budget/tarification pour l'année suivante.", produit: "Documenter ce qui est prouvé (à garder) et ce qui doit pivoter, sur chaque brique livrée cette année.", communaute: "Recueillir les retours qualitatifs de fin d'année de l'ensemble des utilisateurs Offre1." },
  { period: 13, entreprise: "Consolider les décisions de l'année (tarification, remise multi-activités, budget) et préparer le plan de l'année 2.", produit: "Préparer la feuille de route technique de l'année 2 à partir du bilan de la période 12.", communaute: "Célébrer et documenter les réussites du groupe pilote/premiers accompagnateurs auprès de la communauté élargie." },
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
    console.error('Relance avec l\'id exact : node scripts/apply-offre1-roadmap.js [--apply] <activityId>');
    process.exit(1);
  }
  console.error(matches.length + ' activités actives nommées "' + TARGET_ACTIVITY_NAME + '" — précise l\'id exact :');
  matches.forEach((m) => console.error('  id ' + m.id));
  process.exit(1);
}

function existingMainGoalText(activityId, category, periodNumber) {
  const row = db.prepare('SELECT mainGoalText FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);
  return row ? row.mainGoalText : '';
}

function preview(text, n) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

const activity = findActivity();
console.log('Activité : "' + activity.name + '" (id ' + activity.id + ')\n');

// Résolution des 3 pôles -> clé de catégorie réelle de cette activité.
const activeCategories = goals.categoriesForActivity(activity.id);
const resolved = POLES.map((pole) => {
  const match = activeCategories.find((c) => c.label.trim().toLowerCase() === pole.label.toLowerCase());
  return { ...pole, key: match ? match.key : null, existed: !!match };
});
const missing = resolved.filter((p) => !p.key);

console.log('Catégories :');
resolved.forEach((p) => {
  console.log('  ' + p.label + ' — ' + (p.existed ? 'déjà active (clé "' + p.key + '")' : 'À CRÉER' + (apply ? '' : ' (mode lecture seule : pas encore créée)')));
});

if (missing.length && apply) {
  const currentCount = activeCategories.length;
  if (currentCount + missing.length > goals.MAX_CUSTOM_CATEGORIES) {
    console.error(
      '\nImpossible : ' + currentCount + ' catégorie(s) déjà active(s) + ' + missing.length +
      ' à créer dépasserait le plafond de ' + goals.MAX_CUSTOM_CATEGORIES + '.'
    );
    console.error('Renomme/retire une catégorie existante dans l\'app avant de relancer, ou crée les catégories manquantes toi-même avec les bons noms exacts.');
    process.exit(1);
  }
  missing.forEach((p) => {
    goals.addCategory(activity.id, p.label);
    console.log('  → catégorie "' + p.label + '" créée.');
  });
  // Ré-résout les clés après création.
  const refreshed = goals.categoriesForActivity(activity.id);
  resolved.forEach((p) => {
    if (!p.key) {
      const m = refreshed.find((c) => c.label.trim().toLowerCase() === p.label.toLowerCase());
      p.key = m ? m.key : null;
    }
  });
}

if (missing.length && !apply) {
  console.log('\nMode lecture seule : les catégories manquantes seraient créées, aucun objectif ne peut être prévisualisé pour elles pour l\'instant.');
}

console.log('');

let toWrite = 0;
let toSkip = 0;

ROADMAP.forEach((row) => {
  POLES.forEach((pole) => {
    const p = resolved.find((r) => r.rowKey === pole.rowKey);
    const text = row[pole.rowKey];
    console.log('Période ' + row.period + ' — ' + pole.label + ' :');

    if (!p.key) {
      console.log('  (catégorie pas encore créée — repasser après --apply)');
      return;
    }

    const existing = existingMainGoalText(activity.id, p.key, row.period);
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

    goals.setMainGoal(activity.id, p.key, row.period, text);
    console.log('  écrit.');
  });
});

console.log('\n' + toWrite + ' case(s) ' + (apply ? 'écrite(s)' : 'à écrire') + ', ' + toSkip + ' déjà remplie(s) et ignorée(s).');

if (!apply) {
  console.log('\nAucune écriture effectuée (mode lecture seule). Relancer avec --apply pour appliquer,');
  console.log('ou --apply --force pour aussi écraser les cases déjà remplies.');
}
