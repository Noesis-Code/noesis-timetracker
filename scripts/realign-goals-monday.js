#!/usr/bin/env node
// Réalignement rétroactif ponctuel du repère hebdomadaire (lundi→dimanche) sur
// un ou plusieurs plans Objectifs déjà actifs, écrits avant le passage du
// repère hebdomadaire au lundi (voir server/lib/goals.js, mostRecentMonday() /
// ensurePlan() — 16 septembre 2026, discussion Objectifs — D, 3ᵉ puis 6ᵉ
// passage). Demande directe d'Emilien après avoir vu l'effet pratique du
// choix « nouveaux plans seulement » (voir
// noesis-timetracker-chantiers-en-cours.md, encart D 5ᵉ/6ᵉ passage).
//
// Ne touche JAMAIS automatiquement quoi que ce soit — sans --apply, ce script
// se contente de LISTER les plans concernés (aucune écriture). Réservé à un
// lancement manuel par Emilien depuis le dossier du projet :
//
//   node scripts/realign-goals-monday.js
//       → liste (lecture seule) tous les plans dont la date de départ n'est
//         pas un lundi, avec la date qu'ils prendraient.
//   node scripts/realign-goals-monday.js --apply
//       → réaligne TOUS les plans listés ci-dessus.
//   node scripts/realign-goals-monday.js --apply <activityId> <categorie>
//       → réaligne UN SEUL plan précis (activityId + clé de catégorie, par
//         exemple "c1" ou "entreprise").
//
// Voir server/lib/goals.js (realignPlanToMonday/plansNeedingRealignment) pour
// le détail exact de ce qui est décalé (le plan + toutes ses périodes déjà
// matérialisées, du même delta constant de 0 à -6 jours) et pour le risque
// assumé (le temps déjà chronométré près d'une frontière de semaine/période
// peut se retrouver comptabilisé dans la période/semaine adjacente après ce
// décalage — actualMinutes n'est jamais stocké, toujours recalculé en direct).

const goals = require('../server/lib/goals');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const positional = args.filter((a) => a !== '--apply');

function printResult(activityId, category, res) {
  if (!res) {
    console.log('  (aucun plan trouvé pour ' + activityId + ' / ' + category + ')');
    return;
  }
  if (!res.changed) {
    console.log('  déjà aligné sur un lundi — rien à faire.');
    return;
  }
  console.log(
    '  réaligné : ' + res.oldStartDate + ' → ' + res.newStartDate +
    ' (delta ' + res.deltaDays + ' jour(s)), ' + res.periodsShifted + ' période(s) mise(s) à jour.'
  );
}

if (apply && positional.length === 2) {
  const [activityId, category] = positional;
  console.log('Réalignement de ' + activityId + ' / ' + category + '...');
  const res = goals.realignPlanToMonday(activityId, category);
  printResult(activityId, category, res);
  process.exit(0);
}

if (positional.length === 1) {
  console.error('Usage : node scripts/realign-goals-monday.js [--apply [<activityId> <categorie>]]');
  process.exit(1);
}

const pending = goals.plansNeedingRealignment();

if (!pending.length) {
  console.log('Aucun plan à réaligner — tous les plans existants démarrent déjà un lundi.');
  process.exit(0);
}

if (!apply) {
  console.log(pending.length + ' plan(s) pas encore aligné(s) sur un lundi :\n');
  pending.forEach((p) => {
    console.log(
      '  activité "' + p.activityName + '" (id ' + p.activityId + ') — catégorie "' + p.category + '" : ' +
      p.startDate + ' → deviendrait ' + p.wouldBecome
    );
  });
  console.log('\nAucune écriture effectuée (mode lecture seule). Relancer avec --apply pour réaligner tous ces plans,');
  console.log('ou avec --apply <activityId> <categorie> pour n\'en réaligner qu\'un seul.');
  process.exit(0);
}

console.log('Réalignement de ' + pending.length + ' plan(s)...\n');
pending.forEach((p) => {
  console.log('activité "' + p.activityName + '" (id ' + p.activityId + ') — catégorie "' + p.category + '" :');
  const res = goals.realignPlanToMonday(p.activityId, p.category);
  printResult(p.activityId, p.category, res);
});
console.log('\nTerminé.');
