// Agenda externe : capacité par jour (règles, vacances, libre) et déplacement intra-semaine silencieux (18 oct. 2026).
// Usage : node test/cal-externe-capacite-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cal-');
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

const settings = { rules: [{ words: ['vacances', 'congé', 'férié'], mode: 'none' }, { words: ['bureau'], mode: 'limit', maxMinutes: 120 }], defaultMinutes: 360 };
const texts = [ics(ev('Shift bureau', mon), ev('Congé', tue), ev('Férié – jour de l\'An', thu))];
assert(ext.dayCapacityFromTexts(texts, mon, settings) === 120, 'jour limité : X h (120 min)');
assert(ext.dayCapacityFromTexts(texts, tue, settings) === 0, 'jour de congé : capacité 0');
assert(ext.dayCapacityFromTexts(texts, thu, settings) === 0, 'jour férié (accent ignoré, mot par défaut) : 0');
assert(ext.dayCapacityFromTexts(texts, wed, settings) === 360, 'jour libre : Y h (360 min)');
assert(ext.dayCapacityFromTexts(texts, wed, { ...settings, defaultMinutes: null }) === null, 'réglage vide : aucune limite imposée');
assert(ext.dayCapacityFromTexts([ics(ev('Vacances au Mexique', wed))], wed, { ...settings, rules: [{ words: ['voyage'], mode: 'none' }] }) === 360, 'mots de vacances réglables');

// Événement horodaté : lundi 22:00Z à mardi 02:00Z = lundi 18:00-22:00 à Toronto (un seul jour local)
const z = (day, hh) => compact(day) + 'T' + hh + '0000Z';
const timed = `BEGIN:VEVENT\r\nDTSTART:${z(mon, '22')}\r\nDTEND:${z(tue, '02')}\r\nSUMMARY:Bureau\r\nEND:VEVENT\r\n`;
const tx = [ics(timed)];
assert(ext.dayCapacityFromTexts(tx, mon, settings, 'America/Toronto') === 120 && ext.dayCapacityFromTexts(tx, tue, settings, 'America/Toronto') === 360, 'événement horodaté Z : un seul jour LOCAL (Toronto)');
assert(ext.dayCapacityFromTexts(tx, tue, settings, 'Europe/Paris') === 120, 'même événement : autre fuseau, autre jour');
// Règles : validation, plus restrictive gagne, migration
ext.setSettings('w', { rules: [{ words: ['Bureau', 'bureau', 'BUREAU', null, 5, ' '], mode: 'limit', maxMinutes: 90 }, { words: [], mode: 'none' }, null, 'x'] });
assert(JSON.stringify(ext.getSettings('w').rules) === '[{"words":["Bureau"],"mode":"limit","maxMinutes":90}]', 'règles : non-chaînes ignorées, doublons sans casse, règle vide écartée');
const bad = (rules) => { try { ext.setSettings('w', { rules }); return false; } catch (e) { return e.statusCode === 400; } };
assert(bad(new Array(21).fill({ words: ['a'], mode: 'none' })), '> 20 règles refusé');
assert(bad([{ words: ['a'], mode: 'autre' }]), 'mode invalide refusé');
assert(bad([{ words: ['a'], mode: 'limit', maxMinutes: 1441 }]) && bad([{ words: ['a'], mode: 'limit', maxMinutes: 1.5 }]), 'minutes hors 0-1440 / non entières refusées');
const many = Array.from({ length: 30 }, (_, i) => 'mot' + i).concat(['x'.repeat(80)]);
const rr = ext.setSettings('w', { rules: [{ words: many, mode: 'none' }] }).rules[0].words;
assert(rr.length === 20 && rr.every((x) => x.length <= 60), '20 mots max par règle, 60 caractères par mot');
assert(ext.getSettings('neuf').rules.length === 1 && ext.getSettings('neuf').rules[0].mode === 'none' && ext.getSettings('neuf').rules[0].words.join() === 'vacances,congé,férié', 'compte neuf : règle vacances = aucune tâche');
const two = { rules: [{ words: ['bureau'], mode: 'limit', maxMinutes: 240 }, { words: ['atelier'], mode: 'limit', maxMinutes: 60 }], defaultMinutes: 360 };
assert(ext.dayCapacityFromTexts([ics(ev('Bureau', mon), ev('Atelier', mon), ev('Bureau', tue))], mon, two) === 60, 'deux règles le même jour : la plus restrictive gagne');
assert(ext.dayCapacityFromTexts([ics(ev('Bureau', mon), ev('Congé', mon))], mon, { ...two, rules: two.rules.concat([{ words: ['congé'], mode: 'none' }]) }) === 0, 'aucune tâche l\'emporte sur temps limité');
// Migration des anciennes colonnes (idempotente, sans perte)
db.prepare("INSERT INTO external_calendar_settings (userId, workPatterns, vacationWords, workDayMinutes, freeDayMinutes) VALUES ('old', '[\"Atelier\"]', '[\"congé\"]', 120, 300)").run();
db.prepare("INSERT INTO external_calendar_settings (userId, workPatterns, vacationWords, workDayMinutes, freeDayMinutes) VALUES ('old2', '[]', NULL, NULL, NULL)").run();
for (let i = 0; i < 2; i++) {
  ext.migrateLegacySettings();
  assert(JSON.stringify(ext.getSettings('old')) === '{"rules":[{"words":["congé"],"mode":"none","maxMinutes":null},{"words":["Atelier"],"mode":"limit","maxMinutes":120}],"defaultMinutes":null}', 'migration (passage ' + (i + 1) + ') : anciens réglages -> règles (plafond par défaut ignoré)');
}
assert(ext.getSettings('old2').rules[0].words.join() === 'vacances,congé,férié', 'migration : vacances par défaut conservées');

const reply = (rows) => JSON.stringify({ t: rows });
const fin = (rows, dayCaps, cap) => {
  const ctx = dt.buildContext('own', act);
  ctx.dayCaps = dayCaps || {};
  if (cap !== undefined) ctx.dayCapacityMinutes = cap;
  return dt.finishProposal('own', act, reply(rows), { ctx, doc: { text: '' }, want: { t: true, c: false } });
};

(async () => {
  // Vacances le mardi : une tâche proposée ce jour-là part au mercredi, silencieusement (même semaine)
  let r = await fin([['Faire V', key, tue, 30]], { [tue]: 0 });
  let t = r.tasks[0];
  assert(t.day === wed && t.week === nextMon && !t.moved && r.movedCount === 0, 'jour de vacances : tâche replacée le prochain jour ouvert, même semaine, silencieux');
  // Jour Jacopo (60 min) : 3 x 30 min -> la 3e passe au jour suivant, silencieusement
  r = await fin([['Faire A1', key, mon, 30], ['Faire A2', key, mon, 30], ['Faire A3', key, mon, 30]], { [mon]: 60, [tue]: 0 });
  const by = Object.fromEntries(r.tasks.map((x) => [x.title, x]));
  assert(by['Faire A1'].day === mon && by['Faire A2'].day === mon && by['Faire A3'].day === wed && !by['Faire A3'].moved, 'capacité du jour travaillé ailleurs respectée ; déplacement intra-semaine sans signalement');
  // Déborde sur toute la fin de semaine -> autre semaine : signalé
  r = await fin([['Faire S1', key, sun, 30], ['Faire S2', key, sun, 30], ['Faire S3', key, sun, 30]], { [sun]: 60 });
  const s3 = r.tasks.find((x) => x.title === 'Faire S3');
  assert(s3.day === mon2 && s3.moved === true && s3.fromWeek === nextMon && s3.week === mon2 && r.movedCount === 1, 'déplacement vers une AUTRE semaine : toujours signalé');
  // Le test d'une saisie manuelle : les tâches proposées seulement sont déplacées (rien d'écrit par balanceDays)
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})();
