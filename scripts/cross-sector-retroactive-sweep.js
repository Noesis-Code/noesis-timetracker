#!/usr/bin/env node
// Passage rétroactif ponctuel du moteur d'inférence cross-secteur
// (server/lib/crosssectorinference.js, « Coordination inter-secteurs de
// l'IA », Brief 1) — 4ᵉ décision de cadrage d'Emilien (25 septembre 2026) :
// « Oui, scanner aussi l'existant » — en plus du déclenchement automatique
// sur les nouveaux objectifs/tâches à partir de maintenant, un passage doit
// analyser rétroactivement les objectifs périodiques déjà posés.
//
// Ne lance JAMAIS d'appel IA automatiquement — sans --apply, ce script se
// contente de LISTER les (activité, catégorie) qui seraient évaluées
// (aucun appel IA, aucune écriture). Réservé à un lancement manuel par
// Emilien depuis le dossier du projet, car chaque catégorie listée = un
// appel IA (voir l'avertissement de coût déjà consigné dans
// noesis-timetracker-coordination-inter-secteurs.md : « le cumul "toujours
// automatique" + double déclencheur + rétroactif peut représenter un volume
// important d'appels IA »).
//
//   node scripts/cross-sector-retroactive-sweep.js
//       → liste (lecture seule) toutes les (activité, catégorie) ayant un
//         objectif périodique actuel non vide — candidates à un passage.
//   node scripts/cross-sector-retroactive-sweep.js --apply
//       → évalue TOUTES les catégories listées ci-dessus (un appel IA par
//         catégorie, séquentiel — jamais en parallèle, pour ne pas
//         bombarder l'API d'un coup).
//   node scripts/cross-sector-retroactive-sweep.js --apply <activityId>
//       → n'évalue que les catégories de CETTE activité.
//
// Seules les activités actives avec au moins 2 catégories (pôle/secteur)
// sont concernées — une évaluation cross-secteur n'a pas de sens avec une
// seule catégorie (voir evaluateCrossSectorLinks, qui renverrait de toute
// façon {skipped:'no-other-category'} sans consommer d'appel IA, mais autant
// ne pas les lister ici).

const db = require('../server/db');
const crosssectorinference = require('../server/lib/crosssectorinference');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const positional = args.filter((a) => a !== '--apply');
const onlyActivityId = positional.length ? Number(positional[0]) : null;

function candidatesForActivity(activity) {
  const withGoal = crosssectorinference.categoriesWithMainGoal(activity.id);
  const totalCategories = crosssectorinference.flattenCategories(activity.id).length;
  if (totalCategories < 2) return [];
  return withGoal.map((c) => ({ activityId: activity.id, activityName: activity.name, category: c.key, categoryLabel: c.label, mainGoalText: c.mainGoalText }));
}

function activitiesToScan() {
  const rows = onlyActivityId
    ? db.prepare('SELECT id, name FROM activities WHERE id = ? AND active = 1').all(onlyActivityId)
    : db.prepare('SELECT id, name FROM activities WHERE active = 1 ORDER BY id').all();
  return rows;
}

async function run() {
  const activities = activitiesToScan();
  let all = [];
  activities.forEach((a) => { all = all.concat(candidatesForActivity(a)); });

  if (!all.length) {
    console.log('Aucune (activité, catégorie) candidate — aucun objectif périodique existant sur une activité ayant plusieurs catégories.');
    return;
  }

  if (!apply) {
    console.log(all.length + ' (activité, catégorie) candidate(s) à un passage rétroactif :\n');
    all.forEach((c) => {
      console.log('  activité "' + c.activityName + '" (id ' + c.activityId + ') — catégorie "' + c.categoryLabel + '" (' + c.category + ') : "' + c.mainGoalText.slice(0, 80) + (c.mainGoalText.length > 80 ? '…' : '') + '"');
    });
    console.log('\nAucun appel IA effectué (mode lecture seule). Relancer avec --apply pour évaluer toutes ces catégories,');
    console.log('ou avec --apply <activityId> pour n\'en évaluer qu\'une seule activité.');
    return;
  }

  console.log('Évaluation de ' + all.length + ' (activité, catégorie)...\n');
  // Séquentiel, jamais en parallèle — un seul appel IA à la fois, même
  // discipline que le reste de ce moteur (un seul appel par déclenchement).
  for (const c of all) {
    process.stdout.write('  "' + c.activityName + '" / "' + c.categoryLabel + '"... ');
    const res = await crosssectorinference.evaluateCrossSectorLinks(c.activityId, c.category, { type: 'main_goal', text: c.mainGoalText });
    if (res && res.skipped) console.log('ignoré (' + res.skipped + ')');
    else if (res && res.error) console.log('échec (voir logs serveur)');
    else console.log((res && res.written) + ' suggestion(s) écrite(s)/mise(s) à jour sur ' + (res && res.evaluated) + ' catégorie(s) évaluée(s).');
  }
  console.log('\nTerminé.');
}

run().catch((err) => { console.error(err); process.exit(1); });
