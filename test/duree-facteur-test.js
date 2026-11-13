// Facteur silencieux des durées par le Chrono (13 nov. 2026) : aucune donnée, 3 h au lieu de 4, 6 h au lieu de 1, plafond, plancher, fenêtres courte et longue. Usage : node test/duree-facteur-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-duree-facteur-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), goals = require('../server/lib/goals'), goalstasks = require('../server/lib/goalstasks'), F = require('../server/lib/dureefacteur'), TM = require('../server/lib/taskminutes');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const TODAY = require('../server/lib/dates').userToday(), add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
let n = 0;
function mk() { // une activité et un pôle neufs par cas
  n += 1; const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run('Act' + n).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
  goals.addCategory(act, 'Pôle'); return { act, pk: goals.categoriesForActivity(act)[0].key };
}
const chrono = (c, day, min) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', ?)").run(c.act, min * 60, day, c.pk);
function doneTask(c, day, estMin, src) { const id = goalstasks.addCategoryTask(c.act, 'u1', c.pk, 'Tâche ' + Math.random()).id; db.prepare("UPDATE sub_project_items SET done = 1, doneAt = ?, medianMinutes = ?, minMinutes = ?, maxMinutes = ?, durSource = ? WHERE id = ?").run(day + 'T12:00:00.000Z', estMin, estMin, estMin, src || 'ia', id); return id; }
// quatre semaines distinctes dans la période en cours (28 jours) : réel total = realMin, estimé total = estMin
function fill(c, realMin, estMin, weeks) { const w = weeks || 4; for (let i = 0; i < w; i++) { chrono(c, add(TODAY, -(i * 7 + 1)), realMin / w); doneTask(c, add(TODAY, -(i * 7 + 1)), estMin / w); } }
// 1. aucune donnée
let c = mk();
assert(F.factorFor('u1', c.act, c.pk, TODAY).factor === 1 && F.factorFor('u1', c.act, c.pk, TODAY).window === null, 'aucune donnée : facteur 1 (jamais de temps inventé)');
// 2. 3 h réelles au lieu de 4 h estimées
c = mk(); fill(c, 180, 240);
let f = F.factorFor('u1', c.act, c.pk, TODAY);
assert(f.factor === 0.75 && f.window === 'courte' && f.weeks === 4, '3 h au lieu de 4 h : facteur 0,75 (fenêtre courte, 4 semaines)');
// 3. 6 h réelles au lieu de 1 h : plafonné à 3
c = mk(); fill(c, 360, 60);
f = F.factorFor('u1', c.act, c.pk, TODAY);
assert(f.factor === 3 && f.raw === 6, '6 h au lieu de 1 h : facteur 6 plafonné à 3');
// 4. plancher
c = mk(); fill(c, 12, 60);
assert(F.factorFor('u1', c.act, c.pk, TODAY).factor === 0.5, 'très peu de temps réel : facteur plafonné par le bas à 0,5');
// 5. moins de 4 semaines de Chrono : 1
c = mk(); fill(c, 180, 240, 3);
assert(F.factorFor('u1', c.act, c.pk, TODAY).factor === 1, 'moins de 4 semaines de Chrono : facteur 1');
// 6. fenêtre longue : rien dans la période en cours, quatre semaines plus tôt dans l\'année
c = mk(); for (let i = 0; i < 4; i++) { const d = add(TODAY, -(60 + i * 7)); chrono(c, d, 60); doneTask(c, d, 30); }
f = F.factorFor('u1', c.act, c.pk, TODAY);
assert(f.factor === 2 && f.window === 'longue', 'fenêtre longue (jusqu\'à 12 mois) quand la période en cours n\'a pas assez de données : 4 h ÷ 2 h = 2');
// 7. correction silencieuse des durées proposées : les tâches IA sont corrigées, la saisie à la main jamais ; l\'estimation d\'origine est gardée
c = mk(); fill(c, 360, 120); // facteur 3
const est = TM.validateEstimate({ min: 20, max: 40, steps: [10, 10, 10] });
const a = goalstasks.addCategoryTask(c.act, 'u1', c.pk, 'Nouvelle tâche IA', { estimate: est, durSource: 'ia-micro' }).id;
const b = goalstasks.addCategoryTask(c.act, 'u1', c.pk, 'Tâche saisie', { estimate: est, durSource: 'saisie' }).id;
const row = (id) => db.prepare('SELECT minMinutes, medianMinutes, maxMinutes, rawMedianMinutes FROM sub_project_items WHERE id = ?').get(id);
assert(row(a).medianMinutes === Math.round(est.median * F.factorFor('u1', c.act, c.pk).factor) && row(a).rawMedianMinutes === est.median && row(a).minMinutes <= row(a).medianMinutes && row(a).medianMinutes <= row(a).maxMinutes, 'durée proposée par l\'IA : corrigée en silence par le facteur, estimation brute gardée');
assert(row(b).medianMinutes === est.median && row(b).rawMedianMinutes === null, 'durée saisie à la main : jamais corrigée');
// le facteur se mesure contre l\'estimation BRUTE : une tâche corrigée puis cochée ne ramène pas le facteur vers 1
db.prepare("UPDATE sub_project_items SET done = 1, doneAt = ? WHERE id = ?").run(add(TODAY, -2) + 'T12:00:00.000Z', a);
const f2 = F.factorFor('u1', c.act, c.pk, TODAY);
assert(f2.estMin === 120 + est.median, 'mesuré contre l\'estimation brute (' + f2.estMin + ' min) : pas de dérive vers 1');
// bornes de la durée corrigée
const big = F.scaleEstimate(TM.validateEstimate({ min: 300, max: 480 }), 3);
assert(big.max === 480 && big.median <= 480 && big.min <= big.median, 'durée corrigée bornée à 480 minutes');
assert(F.scaleEstimate(est, 1) === est, 'facteur 1 : durée inchangée');
console.log(failed ? '\n' + failed + ' échec(s)' : 'duree-facteur-test OK'); process.exit(failed ? 1 : 0);
