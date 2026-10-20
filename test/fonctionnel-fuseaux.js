// Fuseaux horaires : une entrée posée à 23 h 30 / 00 h 30 (heure locale de la personne) doit tomber dans le bon jour partout
// (Historique, grille, Répartition, Aujourd'hui, Graphique, Communauté), même quand le fuseau du serveur (America/Toronto) diffère.
// Voir docs/audits/fuseaux-2026-10-20.md. Usage : node test/fonctionnel-fuseaux.js
process.env.TZ = 'America/Toronto'; // fuseau du serveur
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const { localPartsOf, mondayOf, isoDateOf } = require('../server/lib/dates');
const T = makeCounter(); const assert = T.assert;

const pad = (n) => String(n).padStart(2, '0');
// Instant de l'heure murale (y, m, d, h, mi) dans le fuseau tz (indépendant de zonedMidnight du serveur).
function wallToInstant(y, m, d, h, mi, tz) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(t)).reduce((o, x) => { o[x.type] = Number(x.value); return o; }, {});
    t -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  }
  return new Date(t);
}
// Jour calendaire de tz décalé de `off` jours par rapport à « aujourd'hui » dans tz.
function dayIn(tz, off) {
  const p = localPartsOf(new Date(), tz);
  const c = new Date(Date.UTC(p.year, p.month - 1, p.day + off));
  return { y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate(), iso: `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}` };
}

(async () => {
  const s = await startServer();
  const raw = new DatabaseSync(path.join(s.dir, 'noesis.db'));
  raw.exec('PRAGMA busy_timeout = 5000');
  try {
    for (const tz of ['America/Vancouver', 'Europe/Paris', 'Asia/Tokyo']) {
      const tag = tz.split('/')[1].toLowerCase();
      const u = await newUser(s.base, 'tz' + tag, tz);
      const other = await newUser(s.base, 'tz2' + tag, tz);
      const c = u.c, A = u.activityId;
      raw.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(A, other.id, new Date().toISOString());

      const d0 = dayIn(tz, 0), d1 = dayIn(tz, -1), d2 = dayIn(tz, -2);
      const e1 = [wallToInstant(d2.y, d2.m, d2.d, 23, 30, tz), wallToInstant(d2.y, d2.m, d2.d, 23, 50, tz)]; // 23 h 30 -> 23 h 50, avant-hier
      const e2 = [wallToInstant(d1.y, d1.m, d1.d, 0, 30, tz), wallToInstant(d1.y, d1.m, d1.d, 0, 50, tz)];   // 00 h 30 -> 00 h 50, hier
      const now = Date.now();
      const e3 = [new Date(now - 120e3), new Date(now - 60e3)];                                              // il y a 2 min -> 1 min, aujourd'hui
      const sameDay = isoDateOf(e3[0], tz) === d0.iso && isoDateOf(e3[1], tz) === d0.iso; // sinon minuit passé pendant le test : on saute
      const ids = [];
      for (const [a, b] of [e1, e2, e3]) {
        const r = await c.post('/api/history', { activityId: A, startTime: a.toISOString(), endTime: b.toISOString() });
        if (r.status !== 201) throw new Error(tz + ' POST /history ' + r.status + ' ' + JSON.stringify(r.body));
        ids.push(r.body.id);
      }
      const total = 1200 + 1200 + 60;

      const hist = (await c.get('/api/history?period=year')).body;
      const iso = (id) => { const h = hist.find((x) => x.id === id); return h && h.isoDate; };
      assert(iso(ids[0]) === d2.iso && iso(ids[1]) === d1.iso, `${tz} : Historique, 23 h 30 -> ${d2.iso}, 00 h 30 -> ${d1.iso}`);

      const ts = (await c.get('/api/stats/timesheet?period=week')).body;
      const col = (isoD) => ts.days.find((x) => x.isoDate === isoD);
      assert(ts.end === d0.iso && ts.days.length === 7, `${tz} : grille, dernière colonne = aujourd'hui local (${d0.iso}, reçu ${ts.end})`);
      const c2 = col(d2.iso), c1 = col(d1.iso);
      assert(c2 && c2.slots[94] && c2.slots[95] && !c2.slots[93] && !c2.slots[0], `${tz} : grille, 23 h 30 sur la ligne 23 h 30 de ${d2.iso}`);
      assert(c1 && c1.slots[2] && c1.slots[3] && !c1.slots[1] && !c1.slots[95], `${tz} : grille, 00 h 30 sur la ligne 00 h 30 de ${d1.iso}`);
      assert(ts.days.reduce((n, x) => n + x.slots.filter(Boolean).length, 0) >= 4, `${tz} : grille, créneaux présents (23 h 30 et 00 h 30)`);
      if (sameDay) assert(ts.breakdown.totalSeconds === total, `${tz} : Répartition jointe à la grille = ${total} s (reçu ${ts.breakdown.totalSeconds})`);

      const tm = (await c.get('/api/stats/timesheet?period=month')).body;
      const monthDays = tm.weeks.flat();
      assert(monthDays.some((x) => x.isoDate === d2.iso) && monthDays.some((x) => x.isoDate === d0.iso), `${tz} : grille Mois contient ${d0.iso}`);

      const td = (await c.get('/api/stats/today')).body;
      if (sameDay) assert(td.day === d0.iso && td.breakdown.totalSeconds === 60, `${tz} : Aujourd'hui = 60 s (reçu ${td.breakdown.totalSeconds})`);

      const wsf = (await c.get('/api/stats/week-so-far')).body;
      const mon = isoDateOf(mondayOf(new Date(), tz));
      const inWeek = [[d2.iso, 1200], [d1.iso, 1200], [d0.iso, 60]].filter(([i]) => i >= mon).reduce((n, [, v]) => n + v, 0);
      if (sameDay) assert(wsf.end === d0.iso && wsf.breakdown.totalSeconds === inWeek, `${tz} : Semaine en cours = ${inWeek} s (reçu ${wsf.breakdown.totalSeconds})`);

      const ch = (await c.get('/api/stats?granularity=day')).body.dailyBreakdown;
      const pt = (i) => ch.find((x) => x.isoDate === i);
      assert(pt(d2.iso) && pt(d2.iso).totalSeconds === 1200 && pt(d1.iso) && pt(d1.iso).totalSeconds === 1200, `${tz} : Graphique, 20 min en ${d2.iso} et en ${d1.iso}`);
      assert(pt(d0.iso) && (!sameDay || pt(d0.iso).totalSeconds === 60), `${tz} : Graphique, le jour local ${d0.iso} figure (60 s)`);
      assert(ch.reduce((n, x) => n + x.totalSeconds, 0) === total, `${tz} : Graphique, total = ${total} s (reçu ${ch.reduce((n, x) => n + x.totalSeconds, 0)})`);

      // Communauté : activité partagée avec un second membre.
      const cs = (await c.get(`/api/community/activity-stats?activityId=${A}&period=week&chartGranularity=day`)).body;
      const cpt = (i) => (cs.dailyBreakdown || []).find((x) => x.isoDate === i);
      assert(cpt(d2.iso) && cpt(d2.iso).totalSeconds === 1200 && cpt(d1.iso) && cpt(d1.iso).totalSeconds === 1200, `${tz} : Communauté, graphique, 20 min en ${d2.iso} et ${d1.iso}`);
      assert(cpt(d0.iso) && (!sameDay || cpt(d0.iso).totalSeconds === 60), `${tz} : Communauté, graphique, le jour local ${d0.iso} figure`);
      assert(cs.breakdown.start === mon, `${tz} : Communauté, camembert de la semaine commence le lundi local ${mon} (reçu ${cs.breakdown.start})`);
      if (sameDay) assert(cs.breakdown.totalSeconds === inWeek, `${tz} : Communauté, camembert de la semaine = ${inWeek} s (reçu ${cs.breakdown.totalSeconds})`);
      // La grille Communauté est calendaire (lundi-dimanche) : on cherche chaque jour dans la semaine qui le contient.
      const findCol = async (i) => {
        for (const off of [0, 1]) {
          const ct = (await c.get(`/api/community/activity-timesheet?activityId=${A}&weekOffset=${off}`)).body;
          const col = ct.days.find((x) => x.isoDate === i);
          if (col) return col;
        }
        return null;
      };
      const cc2 = await findCol(d2.iso), cc1 = await findCol(d1.iso);
      assert(cc2 && cc2.slots[94] && !cc2.slots[93] && cc1 && cc1.slots[2] && !cc1.slots[1], `${tz} : Communauté, grille, créneaux 23 h 30 (${d2.iso}) et 00 h 30 (${d1.iso}) au bon jour`);

      // Page publique d'un membre (/api/profile/:id/stats) : fenêtres dans le fuseau du lecteur.
      const ps = (await c.get(`/api/profile/${u.id}/stats?period=week&granularity=day`)).body;
      const ppt = (i) => (ps.chart || []).find((x) => x.isoDate === i);
      assert(ps.breakdown.start === mon, `${tz} : page membre, semaine commence le lundi local ${mon} (reçu ${ps.breakdown.start})`);
      assert(ppt(d0.iso) && ppt(d1.iso) && ppt(d1.iso).totalSeconds === 1200, `${tz} : page membre, graphique contient le jour local ${d0.iso}`);
    }
  } finally { raw.close(); s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
