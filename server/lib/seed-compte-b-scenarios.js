'use strict';
// COMPTE B (10 nov. 2026) — cinq activités de test, UNE par scénario de la règle de retard (docs/objectifs/scenarios-retard.md). STAGING UNIQUEMENT (appelé par seed-staging.js).
// Les dates sont calculées par rapport au JOUR de création (aujourd'hui = jour 0) : l'objectif commence aujourd'hui, donc chaque semaine de la période compte 7 jours pleins et la
// position du jour dans le calendrier de 4 semaines ne change rien. Capacité de chaque activité : 5 h par semaine (temps max du pôle, 300 min ; limite du moteur : 120 % = 360 min),
// appuyée par 6 semaines de temps Chrono (3 séances de 100 min) sur le secteur. Fonctions existantes seulement : objectifs.creer, goalstasks.addCategoryTask, taskkind.write, timecaps.setCaps.
// Aucune donnée réelle : libellés fictifs.
const { randomUUID } = require('crypto');
const goals = require('./goals');
const goalstasks = require('./goalstasks');
const taskkind = require('./taskkind');
const timecaps = require('./timecaps');
const { isoDateOf, dayNameOf, userToday } = require('./dates');

const CAP_SEMAINE = 300; // minutes : 5 h par semaine
const SEANCES = [[0, 100], [2, 100], [4, 100]]; // [jour (0 = lundi), minutes] : 300 min par semaine passée

// Tâche : kind 'maintenance' (+ maintType, urgent) ou 'developpement' ; min/max = durée stockée (médiane / borne haute) ; due = décalage en jours depuis aujourd'hui.
const M = (label, maintType, min, due, urgent) => ({ label, kind: 'maintenance', maintType, urgent: !!urgent, min, max: Math.round(min * 1.2), due });
const D = (label, min, due) => ({ label, kind: 'developpement', min, max: Math.round(min * 1.2), due });
const lot = (prefixe, n, minutes, debut, parSemaine, fabrique) => Array.from({ length: n }, (_, i) => fabrique(prefixe + ' ' + (i + 1), minutes, debut + 7 * Math.floor(i / parSemaine) + (i % parSemaine)));

function scenarios() {
  // Période 1 qui déborde de 3 tâches (3 × 90 min) : 7 tâches de 90 min dans la dernière semaine (une semaine tient 4 tâches : 360 min). `pleine` : les 3 premières semaines sont
  // déjà à 120 % (4 tâches de 90 min) ; sinon elles sont à 90 % (3 tâches). Pleine, aucune tâche retirée ne peut être reprise plus tôt : le message du niveau A reste stable.
  const debordePeriode1 = (pleine) => { const n = pleine ? 4 : 3; return [].concat(lot('Rédiger le chapitre', n, 90, 1, n, D), lot('Concevoir la maquette', n, 90, 8, n, D), lot('Programmer le module', n, 90, 15, n, D),
    Array.from({ length: 7 }, (_, i) => D('Documenter la fonction ' + (i + 1), 90, 22 + Math.floor(i / 2)))); };
  return [
    { cle: 'S1', nom: 'S1 Semaine pleine', fin: 55, taches: [
      M('Dépanner l’imprimante en panne', 'depannage', 90, -5, true), // urgente restée de la semaine passée
      M('Déclarer la TPS du trimestre', 'legal', 120, 1), M('Payer les factures fournisseurs', 'finances', 120, 2),
      D('Concevoir la nouvelle page d’accueil', 60, 3),
    ] },
    { cle: 'S2', nom: 'S2 Semaine entièrement urgente', fin: 55, taches: [
      D('Préparer la réunion du comité', 60, 2),
      M('Renouveler le permis d’exploitation', 'legal', 130, 7, true), M('Rapprocher le compte bancaire', 'finances', 130, 8, true), M('Réparer le serveur en panne', 'depannage', 130, 9, true),
    ] },
    { cle: 'S3', nom: 'S3 Période qui déborde, la suivante absorbe', fin: 55, taches: debordePeriode1(false) },
    { cle: 'S4', nom: 'S4 Période suivante trop pleine', fin: 55, taches: debordePeriode1(true).concat(
      Array.from({ length: 24 }, (_, i) => M('Classer le dossier ' + (i + 1), i % 2 ? 'rangement' : 'controle', 60, 28 + 7 * Math.floor(i / 6) + (i % 6)))) },
    { cle: 'S5', nom: 'S5 Plus de place avant l’échéance', fin: 27, taches: lot('Programmer l’écran', 20, 90, 1, 5, D) },
  ];
}

// Crée les cinq activités du Compte B. db : base ; userId : le Compte B ; color : couleur de membre.
function creerScenarios(db, userId, color, now) {
  const objectifs = require('./objectifs');
  const today = userToday();
  const nowIso = now.toISOString();
  const insertEntry = db.prepare('INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const out = [];
  scenarios().forEach((s) => {
    const aid = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)').run(s.nom, userId, randomUUID(), nowIso).lastInsertRowid);
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(aid, userId, color, nowIso);
    goals.addCategory(aid, 'Production');
    const pole = goals.categoriesForActivity(aid).find((p) => p.label === 'Production');
    goals.addCategory(aid, 'Opérations', pole.key);
    const secteur = goals.secteursForPole(aid, pole.key).find((x) => x.label === 'Opérations');
    timecaps.setCaps(userId, aid, pole.key, { maxWeekMinutes: CAP_SEMAINE }); // capacité connue : 5 h par semaine
    const lundi = (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getDay() + 6) % 7;
    for (let w = 0; w < 6; w++) { // w = 0 : cette semaine ; jamais de séance dans le futur
      SEANCES.forEach(([dow, minutes], i) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - lundi - 7 * w + dow, 7 + i, 0);
        if (start.getTime() + minutes * 60000 > now.getTime()) return;
        const end = new Date(start.getTime() + minutes * 60000);
        insertEntry.run(userId, aid, '', start.toISOString(), end.toISOString(), minutes * 60, isoDateOf(start), dayNameOf(start), secteur.key);
      });
    }
    const fin = goals.addDays(today, s.fin), periodes = Math.ceil((s.fin + 1) / 28);
    const r = objectifs.creer(userId, { title: s.nom + ' : objectif', activityId: aid, startDate: today, endDate: fin, unit: 'semaines', amount: Math.round((s.fin + 1) / 7), level: 'secteur', poleKey: pole.key, categoryKey: secteur.key,
      weekly: true, noBridge: true, periods: Array.from({ length: periodes }, (_, p) => ({ title: 'P ' + (p + 1), weeks: [0, 1, 2, 3].map((k) => ({ text: 'Avancer le travail de la semaine ' + (4 * p + k + 1) })) })) });
    const ids = s.taches.map((t) => {
      const it = goalstasks.addCategoryTask(aid, userId, secteur.key, t.label, { dueDate: goals.addDays(today, t.due) });
      db.prepare('UPDATE sub_project_items SET medianMinutes = ?, maxMinutes = ?, durSource = ? WHERE id = ?').run(t.min, t.max, 'saisie', it.id);
      taskkind.write(it.id, { kind: t.kind, maintType: t.maintType, urgent: t.urgent });
      return it.id;
    });
    db.prepare('UPDATE user_objectives SET taskIdsJson = ? WHERE id = ?').run(JSON.stringify(ids), r.id);
    out.push({ cle: s.cle, activityId: aid, objectifId: r.id, taskIds: ids });
  });
  return out;
}

module.exports = { creerScenarios, scenarios, CAP_SEMAINE };
