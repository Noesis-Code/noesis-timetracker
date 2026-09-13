#!/usr/bin/env node
// Activation manuelle d'un abonnement "TimeTracker Entreprise" — solution
// d'attente le temps que le chantier "Paiement et abonnements" existe
// (décidé comme un chantier SÉPARÉ le 12-13 septembre 2026, voir
// noesis-timetracker-entreprise-jacopo-horaires.md et
// noesis-timetracker-chantiers-en-cours.md). Sans lui, une entreprise créée
// en libre-service (POST /api/enterprises) reste avec subscriptionActive = 0
// et ses employés/horaires restent inaccessibles (402, voir
// server/routes/enterprises.js) — ce script est le seul moyen de la
// débloquer pour l'instant, à lancer directement sur la machine qui héberge
// la base (mêmes variables d'environnement que le serveur, notamment
// NOESIS_DATA_DIR en production).
//
// Usage :
//   node scripts/activate-enterprise.js list
//     Liste toutes les entreprises, avec leur état d'abonnement actuel.
//
//   node scripts/activate-enterprise.js activate <id>
//     Active l'abonnement de l'entreprise <id>.
//
//   node scripts/activate-enterprise.js deactivate <id>
//     Le désactive (ex. si Jacopo interrompt l'essai) — les données
//     (employés, horaires) ne sont jamais supprimées, seul l'accès aux
//     routes employees/schedules/shifts se referme (voir
//     requireActiveSubscription dans server/routes/enterprises.js).

const db = require('../server/db');

function fail(msg) {
  console.error(`Erreur : ${msg}`);
  process.exit(1);
}

const [, , cmd, idArg] = process.argv;

if (cmd === 'list') {
  const rows = db.prepare(`
    SELECT e.id, e.name, e.subscriptionActive, e.createdAt,
           (SELECT COUNT(*) FROM enterprise_managers m WHERE m.enterpriseId = e.id) AS managerCount
    FROM enterprises e
    ORDER BY e.createdAt DESC
  `).all();
  if (!rows.length) {
    console.log('Aucune entreprise en base.');
    process.exit(0);
  }
  for (const r of rows) {
    console.log(`#${r.id}\t${r.subscriptionActive ? 'actif   ' : 'inactif '}\t${r.managerCount} gestionnaire(s)\t${r.name}`);
  }
  process.exit(0);
}

if (cmd === 'activate' || cmd === 'deactivate') {
  const id = Number(idArg);
  if (!Number.isInteger(id) || id <= 0) fail("id d'entreprise invalide — voir 'node scripts/activate-enterprise.js list'.");
  const enterprise = db.prepare('SELECT id, name FROM enterprises WHERE id = ?').get(id);
  if (!enterprise) fail(`aucune entreprise avec l'id ${id}.`);
  const value = cmd === 'activate' ? 1 : 0;
  db.prepare('UPDATE enterprises SET subscriptionActive = ? WHERE id = ?').run(value, id);
  console.log(`Entreprise #${id} (${enterprise.name}) — abonnement désormais ${value ? 'ACTIF' : 'INACTIF'}.`);
  process.exit(0);
}

console.log('Usage :');
console.log('  node scripts/activate-enterprise.js list');
console.log('  node scripts/activate-enterprise.js activate <id>');
console.log('  node scripts/activate-enterprise.js deactivate <id>');
process.exit(cmd ? 1 : 0);
