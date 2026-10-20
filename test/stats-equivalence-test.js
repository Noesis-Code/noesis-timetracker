// Équivalence : la Feuille de temps Mois optimisée (formateurs de fuseau en cache, bornes de jours calculées une fois)
// donne EXACTEMENT le même résultat que l'ancien algorithme naïf (formateur Intl recréé à chaque appel, minuits recalculés par entrée x jour).
// Jeu aléatoire à graine fixe, 3 fuseaux, mois des changements d'heure (mars 2026 et octobre/novembre 2026).
// Usage : node test/stats-equivalence-test.js
process.env.TZ = 'America/Toronto';
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-equiv-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: process.env, stdio: 'ignore' }); } catch (e) {}
const db = require('../server/db');
const dates = require('../server/lib/dates');
const stats = require('../server/lib/stats');
let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('  FAIL ' + m); } };

// Générateur à graine fixe (mulberry32).
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ===== Référence naïve : copie de l'ancien code, aucune mémoïsation =====
const pad2 = (n) => (n < 10 ? '0' + n : String(n));
const naive = {
  valid(tz) { if (!tz || typeof tz !== 'string') return false; try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch (e) { return false; } },
  parts(d, tz) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return { year: g('year'), month: g('month'), day: g('day') };
  },
  isoDateOf(d, tz) {
    if (tz && naive.valid(tz)) { const { year, month, day } = naive.parts(d, tz); return year + '-' + pad2(month) + '-' + pad2(day); }
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  },
  dayNameOf(d, tz) {
    if (tz && naive.valid(tz)) { const { year, month, day } = naive.parts(d, tz); return dates.DAY_NAMES[new Date(year, month - 1, day).getDay()]; }
    return dates.DAY_NAMES[d.getDay()];
  },
  mondayOf(d, tz) {
    let year, month, day;
    if (tz && naive.valid(tz)) ({ year, month, day } = naive.parts(d, tz)); else { year = d.getFullYear(); month = d.getMonth() + 1; day = d.getDate(); }
    const copy = new Date(year, month - 1, day); const dow = copy.getDay(); copy.setDate(copy.getDate() + (dow === 0 ? -6 : 1 - dow)); return copy;
  },
  zonedMidnight(iso, tz) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!tz || !naive.valid(tz)) return new Date(y, m - 1, d);
    const wall = Date.UTC(y, m - 1, d); let t = wall;
    for (let i = 0; i < 3; i++) {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(t)).reduce((o, x) => { o[x.type] = Number(x.value); return o; }, {});
      const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      if (shown === wall) break; t -= shown - wall;
    }
    return new Date(t);
  },
  // Ancien computeSlotsForDays (activités, pas de catégorie) : minuits recalculés pour chaque entrée x jour.
  slots(rows, days, slotMinutes, tz) {
    const slotsPerDay = Math.round(1440 / slotMinutes);
    const start = naive.isoDateOf(days[0]), end = naive.isoDateOf(days[days.length - 1]);
    const inRange = rows.filter((r) => r.isoDate >= start && r.isoDate <= end);
    const overlap = days.map(() => { const s = []; for (let i = 0; i < slotsPerDay; i++) s.push({}); return s; });
    inRange.forEach((r) => {
      const es = new Date(r.startTime), ee = new Date(r.endTime);
      days.forEach((d, di) => {
        const dayStart = naive.zonedMidnight(naive.isoDateOf(d), tz);
        const dayEnd = naive.zonedMidnight(naive.isoDateOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)), tz);
        const cs = es > dayStart ? es : dayStart, ce = ee < dayEnd ? ee : dayEnd;
        if (ce <= cs) return;
        const first = Math.floor((cs - dayStart) / 60000 / slotMinutes);
        const last = Math.min(slotsPerDay - 1, Math.ceil((ce - dayStart) / 60000 / slotMinutes) - 1);
        for (let s = first; s <= last; s++) {
          const ss = new Date(dayStart.getTime() + s * slotMinutes * 60000), se = new Date(ss.getTime() + slotMinutes * 60000);
          const os = cs > ss ? cs : ss, oe = ce < se ? ce : se; const sec = (oe - os) / 1000; if (sec <= 0) continue;
          const b = overlap[di][s];
          if (!b[r.activityId]) b[r.activityId] = { seconds: 0, name: r.activity, color: r.color, activityId: r.activityId };
          b[r.activityId].seconds += sec;
        }
      });
    });
    return days.map((d, di) => ({
      isoDate: naive.isoDateOf(d), dayOfWeek: naive.dayNameOf(d),
      slots: overlap[di].map((b) => { const c = Object.keys(b).map((k) => b[k]); if (!c.length) return null; c.sort((x, y) => y.seconds - x.seconds); const best = c[0]; return { activityId: best.activityId, name: best.name, color: best.color }; }),
    }));
  },
};

const ZONES = ['America/Toronto', 'America/Vancouver', 'Europe/Paris'];
// Changements d'heure 2026 : Amérique du Nord 8 mars et 1er novembre, Europe 29 mars et 25 octobre.
const DST_NEAR = ['2026-03-08T07:00:00Z', '2026-03-08T10:00:00Z', '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z', '2026-11-01T06:00:00Z', '2026-11-01T09:00:00Z'].map((s) => Date.parse(s));

// ===== A. Utilitaires de date : instants aléatoires + instants collés aux changements d'heure =====
{
  const R = rng(20261020);
  const instants = [];
  for (let i = 0; i < 1000; i++) instants.push(Date.UTC(2026, 0, 1) + Math.floor(R() * 365 * 864e5));
  DST_NEAR.forEach((t) => { for (let k = -300; k <= 300; k += 7) instants.push(t + k * 60000); });
  const tzs = ZONES.concat(['Invalide/Zone', '', null, undefined, 'UTC']);
  let diff = 0;
  tzs.forEach((tz) => instants.forEach((ms) => {
    const d = new Date(ms);
    if (dates.isoDateOf(d, tz) !== naive.isoDateOf(d, tz)) diff++;
    if (dates.dayNameOf(d, tz) !== naive.dayNameOf(d, tz)) diff++;
    if (dates.mondayOf(d, tz).getTime() !== naive.mondayOf(d, tz).getTime()) diff++;
    if (dates.isValidTimezone(tz) !== naive.valid(tz)) diff++;
    const iso = naive.isoDateOf(d, tz);
    if (dates.zonedMidnight(iso, tz).getTime() !== naive.zonedMidnight(iso, tz).getTime()) diff++;
  }));
  ok(diff === 0, 'dates.js : isoDateOf, dayNameOf, mondayOf, isValidTimezone, zonedMidnight identiques à la référence (' + (tzs.length * instants.length) + ' instants, écarts : ' + diff + ')');
}

// ===== B. Feuille de temps Mois : résultat complet identique, 3 fuseaux, deux mois à changement d'heure =====
const member = db.prepare('SELECT userId FROM activity_members GROUP BY userId ORDER BY COUNT(*) DESC LIMIT 1').get();
if (!member) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const userId = member.userId;
const acts = db.prepare('SELECT a.id, a.name, COALESCE(am.color, \'#3498db\') AS color FROM activity_members am JOIN activities a ON a.id = am.activityId WHERE am.userId = ? ORDER BY a.id').all(userId);
const nowCal = dates.calendarNow();
function offsetFor(year, monthIdx) { return (nowCal.getFullYear() * 12 + nowCal.getMonth()) - (year * 12 + monthIdx); }
const MONTHS = [{ y: 2026, m: 2, label: 'mars 2026 (heure d\'été)' }, { y: 2026, m: 9, label: 'octobre 2026 (retour à l\'heure normale)' }];

for (const tz of ZONES) {
  const R = rng(7 + ZONES.indexOf(tz));
  // 200 entrées sur février-novembre 2026, dont beaucoup collées aux changements d'heure et à minuit (durées 1 min à 11 h).
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const near = R() < 0.35;
    const base = near ? DST_NEAR[Math.floor(R() * DST_NEAR.length)] + Math.floor((R() - 0.5) * 2 * 36 * 3600e3) : Date.UTC(2026, 1, 1) + Math.floor(R() * 270 * 864e5);
    const start = Math.floor(base / 60000) * 60000;
    const end = start + (1 + Math.floor(R() * (R() < 0.8 ? 180 : 660))) * 60000;
    const a = acts[Math.floor(R() * acts.length)];
    rows.push({ startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), activityId: a.id, activity: a.name, color: a.color,
      isoDate: naive.isoDateOf(new Date(start), tz) });
  }
  db.prepare('DELETE FROM time_entries WHERE userId = ?').run(userId);
  const ins = db.prepare('INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  rows.forEach((r) => ins.run(userId, r.activityId, '', r.startTime, r.endTime, Math.round((new Date(r.endTime) - new Date(r.startTime)) / 1000), r.isoDate, 'Lundi'));
  db.exec('COMMIT');

  for (const M of MONTHS) {
    const off = offsetFor(M.y, M.m);
    if (off < 0) continue; // mois futur par rapport à l'horloge : ignoré
    const got = stats.timesheetMonthForUser(userId, off, { tz });
    // Référence : mêmes jours que la fonction (lundi du 1er -> dimanche de la dernière semaine), algorithme naïf.
    const first = new Date(M.y, M.m, 1), last = new Date(M.y, M.m + 1, 0);
    const calStart = naive.mondayOf(first), calEnd = naive.mondayOf(last); calEnd.setDate(calEnd.getDate() + 6);
    const days = []; for (const c = new Date(calStart); c <= calEnd; c.setDate(c.getDate() + 1)) days.push(new Date(c));
    const grid = naive.slots(rows, days, 120, tz);
    grid.forEach((g, i) => { g.inMonth = days[i].getMonth() === M.m; });
    const weeks = []; for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
    const filled = got.weeks.reduce((n, w) => n + w.reduce((m, d) => m + d.slots.filter(Boolean).length, 0), 0);
    ok(filled > 30, tz + ' ' + M.label + ' : le jeu remplit la grille (' + filled + ' créneaux)');
    ok(JSON.stringify(got.weeks) === JSON.stringify(weeks), tz + ' ' + M.label + ' : grille identique, créneau par créneau');
  }
}

if (bad) { console.log(bad + ' échec(s) sur ' + checks); process.exit(1); }
console.log('stats-equivalence ok (' + checks + ' vérifications)');
