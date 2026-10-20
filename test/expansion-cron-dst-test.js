// Cron d'abonnement Expansion et changement d'heure (20 oct. 2026) : un renouvellement n'est ni doublé ni sauté.
// Horloge simulée : les cycles sont stockés en UTC (SQLite datetime), le fuseau du serveur (TZ America/Toronto) ne les décale pas.
// Aucune IA, aucun paiement, aucun réseau. Usage : node test/expansion-cron-dst-test.js
process.env.TZ = 'America/Toronto';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-dst-');
const db = require('../server/db');
const modules = require('../server/lib/modules');
const offerdelivery = require('../server/lib/offerdelivery');
const offerquota = require('../server/lib/offerquota');
const cron = require('../server/lib/subscriptioncron');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const calls = [];
offerdelivery.regenerateActivityRoadmap = async (a) => { calls.push(a); };
modules.isEnabled = () => true;

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1','u1',datetime('now'))").run();
const mkAct = (name) => {
  const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, 'u1').lastInsertRowid;
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?,?,?,?,?,?,?)").run(id, 'u1', 'c' + id, 's' + id, 'p', 'active', '');
  return id;
};
const setEnd = (id, end) => db.prepare('INSERT OR REPLACE INTO activity_billing_cycles (activityId, cycleStart, cycleEnd) VALUES (?,?,?)').run(id, '2026-01-01T00:00:00.000Z', end);

(async () => {
  // 1) Le +1 mois SQL ne dépend pas du fuseau : départ la veille d'un changement d'heure (printemps 2027-03-14, automne 2027-11-07).
  for (const start of ['2027-02-13T23:30:00.000Z', '2027-03-13T06:59:00.000Z', '2027-03-14T07:30:00.000Z', '2027-10-07T05:30:00.000Z', '2027-11-07T05:59:00.000Z']) {
    const sql = db.prepare("SELECT datetime(?, '+1 month') AS e").get(start).e;
    const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + 1);
    const js = d.toISOString().slice(0, 19).replace('T', ' ');
    ok(sql === js, `+1 mois depuis ${start} = ${sql} (aucun décalage d'une heure)`);
  }

  // 2) Passage 3 h : l'heure existe bien le jour du changement (printemps 2027-03-14 et automne 2027-11-07).
  const hourAt = (iso) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false, hour: '2-digit', minute: '2-digit' });
  ok(hourAt('2027-03-14T07:00:00Z') === '03:00', 'printemps : 03:00 locale existe (cron "0 3 * * *" se déclenche une fois)');
  ok(hourAt('2027-11-07T08:00:00Z') === '03:00', 'automne : 03:00 locale existe une seule fois (pas de doublon)');
  ok(hourAt('2027-11-07T05:00:00Z') === '01:00' && hourAt('2027-11-07T06:00:00Z') === '01:00', 'automne : seule 01:00 se répète, pas 03:00');

  // 3) Renouvellement dû : exécuté une fois, jamais doublé au passage suivant, activité non due jamais sautée ni avancée.
  const due = mkAct('due'), future = mkAct('future');
  setEnd(due, '2026-03-08 06:30:00'); // échu : veille/jour du passage à l'heure d'été 2026 (passé)
  setEnd(future, '2999-03-14 07:30:00');
  let n = await cron.runMonthlyRegeneration();
  ok(n === 1 && calls.length === 1 && calls[0] === due, 'premier passage : seule l\'activité échue est régénérée');
  n = await cron.runMonthlyRegeneration();
  ok(n === 0 && calls.length === 1, 'second passage immédiat (heure répétée) : aucun doublon');
  const c = db.prepare('SELECT cycleEnd FROM activity_billing_cycles WHERE activityId=?').get(due).cycleEnd;
  ok(c > db.prepare("SELECT datetime('now','+27 days') AS x").get().x, 'cycle ré-ancré à environ +1 mois');
  ok(db.prepare('SELECT cycleEnd FROM activity_billing_cycles WHERE activityId=?').get(future).cycleEnd === '2999-03-14 07:30:00', 'cycle futur intact');

  // 4) Échec IA : le cycle reste dû (reprise au passage suivant, rien de sauté).
  offerdelivery.regenerateActivityRoadmap = async () => { throw new Error('panne simulée'); };
  const origErr = console.error; console.error = () => {};
  setEnd(due, '2026-03-08 07:30:00');
  await cron.runMonthlyRegeneration();
  console.error = origErr;
  ok(offerquota.dueActivities().some((r) => r.activityId === due), 'échec : activité toujours due au prochain passage');

  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
