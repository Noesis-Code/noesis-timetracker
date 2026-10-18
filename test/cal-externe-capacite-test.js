// Agenda externe : capacité par jour (Jacopo / vacances / libre) et déplacement intra-semaine silencieux (18 oct. 2026).
// Usage : node test/cal-externe-capacite-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-cal-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const dt = require('../server/lib/documenttasks');
const ext = require('../server/lib/externalcalendar');

db.prepare("INSERT INTO users (id, name, createdAt, weeklyCapacityMinutes) VALUES ('own','own',datetime('now'), 420)").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
goals.addCategory(act, 'Production');
const key = goals.categoriesForActivity(act)[0].key;
const today = new Date().toISOString().slice(0, 10);
const nextMon = goals.addDays(goals.mostRecentMonday(today), 7);
const [mon, tue, wed, thu] = [0, 1, 2, 3].map((i) => goals.addDays(nextMon, i));
const sun = goals.addDays(nextMon, 6), mon2 = goals.addDays(nextMon, 7);
const compact = (iso) => iso.replace(/-/g, '');
const ev = (summary, day) => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${compact(day)}\r\nDTEND;VALUE=DATE:${compact(goals.addDays(day, 1))}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
const ics = (...evs) => 'BEGIN:VCALENDAR\r\n' + evs.join('') + 'END:VCALENDAR\r\n';

const settings = { workPatterns: ['jacopo'], vacationWords: ext.DEFAULT_VACATION_WORDS, workDayMinutes: 120, freeDayMinutes: 360 };
const texts = [ics(ev('Shift Jacopo', mon), ev('Congé', tue), ev('Férié – jour de l\'An', thu))];
assert(ext.dayCapacityFromTexts(texts, mon, settings) === 120, 'jour Jacopo : X h (120 min)');
assert(ext.dayCapacityFromTexts(texts, tue, settings) === 0, 'jour de congé : capacité 0');
assert(ext.dayCapacityFromTexts(texts, thu, settings) === 0, 'jour férié (accent ignoré, mot par défaut) : 0');
assert(ext.dayCapacityFromTexts(texts, wed, settings) === 360, 'jour libre : Y h (360 min)');
assert(ext.dayCapacityFromTexts(texts, wed, { ...settings, freeDayMinutes: null }) === null, 'réglage vide : aucune limite imposée');
assert(ext.dayCapacityFromTexts([ics(ev('Vacances au Mexique', wed))], wed, { ...settings, vacationWords: ['voyage'] }) === 360, 'mots de vacances réglables');

// Événement horodaté : lundi 22:00Z à mardi 02:00Z = lundi 18:00-22:00 à Toronto (un seul jour local)
const z = (day, hh) => compact(day) + 'T' + hh + '0000Z';
const timed = `BEGIN:VEVENT\r\nDTSTART:${z(mon, '22')}\r\nDTEND:${z(tue, '02')}\r\nSUMMARY:Jacopo\r\nEND:VEVENT\r\n`;
const tx = [ics(timed)];
assert(ext.dayCapacityFromTexts(tx, mon, settings, 'America/Toronto') === 120 && ext.dayCapacityFromTexts(tx, tue, settings, 'America/Toronto') === 360, 'événement horodaté Z : un seul jour LOCAL (Toronto)');
assert(ext.dayCapacityFromTexts(tx, tue, settings, 'Europe/Paris') === 120, 'même événement : autre fuseau, autre jour');
ext.setSettings('w', { workPatterns: ['Jacopo', 'jacopo', 'JACOPO', null, 5, { a: 1 }, ' '], vacationWords: [] });
assert(JSON.stringify(ext.getSettings('w').workPatterns) === '["Jacopo"]' && ext.getSettings('w').vacationWords.length === 0, 'mots : non-chaînes ignorées, doublons sans casse');

const reply = (rows) => JSON.stringify({ t: rows });
const fin = (rows, dayCaps, cap) => {
  const ctx = dt.buildContext('own', act);
  ctx.dayCaps = dayCaps || {};
  if (cap !== undefined) ctx.dayCapacityMinutes = cap;
  return dt.finishProposal('own', act, reply(rows), { ctx, doc: { text: '' }, want: { t: true, c: false } });
};

(async () => {
  // Vacances le mardi : une tâche proposée ce jour-là part au mercredi, silencieusement (même semaine)
  let r = await fin([['V', key, tue, 30]], { [tue]: 0 });
  let t = r.tasks[0];
  assert(t.day === wed && t.week === nextMon && !t.moved && r.movedCount === 0, 'jour de vacances : tâche replacée le prochain jour ouvert, même semaine, silencieux');
  // Jour Jacopo (60 min) : 3 x 30 min -> la 3e passe au jour suivant, silencieusement
  r = await fin([['A1', key, mon, 30], ['A2', key, mon, 30], ['A3', key, mon, 30]], { [mon]: 60, [tue]: 0 });
  const by = Object.fromEntries(r.tasks.map((x) => [x.title, x]));
  assert(by.A1.day === mon && by.A2.day === mon && by.A3.day === wed && !by.A3.moved, 'capacité du jour travaillé ailleurs respectée ; déplacement intra-semaine sans signalement');
  // Déborde sur toute la fin de semaine -> autre semaine : signalé
  r = await fin([['S1', key, sun, 30], ['S2', key, sun, 30], ['S3', key, sun, 30]], { [sun]: 60 });
  const s3 = r.tasks.find((x) => x.title === 'S3');
  assert(s3.day === mon2 && s3.moved === true && s3.fromWeek === nextMon && s3.week === mon2 && r.movedCount === 1, 'déplacement vers une AUTRE semaine : toujours signalé');
  // Le test d'une saisie manuelle : les tâches proposées seulement sont déplacées (rien d'écrit par balanceDays)
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})();
