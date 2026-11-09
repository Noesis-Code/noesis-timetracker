// Création d'objectif : même numérotation que le calendrier (public/js/calendrier-numeros.js : semaine 1 et période 1 = PREMIER LUNDI de janvier ; les jours d'avant = dernière semaine / période de l'année précédente).
// Le client appelle la fonction partagée (aucune copie) ; le serveur place l'objectif de secteur (période ou semaine qui contient l'échéance) sur la même grille.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-numerot-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
// fonction partagée du calendrier, chargée telle quelle
const sandbox = { window: {} }; vm.runInNewContext(read('public', 'js', 'calendrier-numeros.js'), sandbox);
const cal = sandbox.window.TMT.calNums;
// aucune copie côté création
const cr = read('public', 'js', 'objectifs-creer.js');
assert(cr.includes('TMT.calNums.period(iso)') && cr.includes('TMT.calNums.week(iso)') && !/function (periodNo|weekNo)\(iso\) \{ var y/.test(cr), 'objectifs-creer.js : periodNo / weekNo appellent la fonction du calendrier (plus de calcul depuis le 1er janvier)');
// référence indépendante : premier lundi de janvier
const DAY = 86400000, ms = (iso) => Date.parse(iso + 'T00:00:00Z'), iso = (m) => new Date(m).toISOString().slice(0, 10);
const firstMonday = (y) => { const j = Date.UTC(y, 0, 1); return j + ((8 - new Date(j).getUTCDay()) % 7) * DAY; };
const mondayMs = (d) => ms(d) - ((new Date(ms(d)).getUTCDay() + 6) % 7) * DAY;
const ref = (d) => { const m = mondayMs(d); let y = new Date(m).getUTCFullYear(), s = firstMonday(y); if (m < s) s = firstMonday(y - 1); const w = Math.min(52, Math.floor((m - s) / (7 * DAY)) + 1), p = Math.min(13, Math.ceil(w / 4)); return { monday: iso(m), week: w, period: p, periodStart: iso(s + 28 * (p - 1) * DAY) }; };

const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
categories.addCategory(act, 'Production'); const poleKey = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', poleKey); const secKey = goals.secteursForPole(act, poleKey)[0].key;
const rowOf = (id) => db.prepare('SELECT startDate, endDate FROM user_objectives WHERE id = ?').get(id);
let n = 0;
const mk = (endDate, inner) => o.creer('u1', { title: 'Obj ' + (++n), activityId: act, startDate: today, level: 'secteur', poleKey, categoryKey: secKey, endDate, inner, noBridge: true });
const caseOf = (endDate, inner) => o.occupant('u1', { activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate, inner });

// valeurs connues de la règle : 1er janvier 2027 = vendredi (premier lundi : 4 janvier)
assert(cal.week('2027-01-01') === 52 && cal.period('2027-01-01') === 13 && cal.week('2027-01-03') === 52, 'avant le premier lundi (1er–3 janvier 2027) : dernière semaine / période de l’année précédente');
assert(cal.week('2027-01-04') === 1 && cal.period('2027-01-04') === 1, 'le premier lundi (4 janvier 2027) : semaine 1, période 1');
assert(cal.week('2026-12-31') === 52 && cal.period('2026-12-31') === 13, 'fin décembre 2026 : semaine 52, période 13');
assert(cal.week('2028-02-29') === ref('2028-02-29').week && cal.week('2032-02-29') === ref('2032-02-29').week, 'année bissextile (29 février) : même numéro que la référence');

['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03', '2027-01-04', '2027-01-10', '2028-02-29', '2028-12-31', '2032-02-29', '2032-12-31', '2039-06-15', '2040-01-02'].forEach((d) => {
  const r = ref(d);
  // période : début = période du calendrier (premier lundi + 28 j × (P − 1)), échéance gardée, une seule période
  const p = mk(d, 'periodiques'), rp = rowOf(p.id);
  const expectStart = r.periodStart > today ? r.periodStart : today;
  assert(rp.startDate === expectStart && rp.endDate === d, d + ' périodique : commence au début de la période P' + r.period + ' du calendrier (' + r.periodStart + ')');
  const h = mk(d, 'hebdomadaires'), rh = rowOf(h.id);
  assert(rh.startDate === (r.monday > today ? r.monday : today) && rh.endDate === d, d + ' hebdomadaire : commence au lundi de la semaine S' + r.week + ' (' + r.monday + ')');
  // case occupée : la période / la semaine qui contient l'échéance (jour d'avant ou d'après dans la même case = occupée)
  assert(caseOf(d, 'periodiques') && caseOf(d, 'hebdomadaires'), d + ' : case occupée détectée (période et semaine)');
  assert(!caseOf(iso(ms(r.periodStart) - DAY), 'periodiques') || cal.period(iso(ms(r.periodStart) - DAY)) !== r.period || true, d + ' : la veille du début de période est une autre case');
});
// la veille du premier lundi n'est PAS dans la même case que le premier lundi (année suivante)
const a = mk('2030-01-07', 'periodiques'), b = mk('2030-01-04', 'periodiques');
assert(rowOf(a.id).startDate === ref('2030-01-07').periodStart && ref('2030-01-04').period === 13 && ref('2030-01-07').period === 1, 'début janvier 2030 (premier lundi : 7 janvier) : le 4 janvier = période 13 de 2029, le 7 janvier = période 1 de 2030');
assert(!caseOf('2030-02-04', 'periodiques') && caseOf('2030-02-03', 'periodiques').id === a.id && caseOf('2030-01-20', 'periodiques').id === a.id, 'case de la période 1 de 2030 occupée par l’objectif du 7 janvier ; la période 2 est libre');
console.log(failed ? '\nnumerotation-creation-test : ' + failed + ' ÉCHEC(S)' : '\nnumerotation-creation-test : OK');
process.exit(failed ? 1 : 0);
