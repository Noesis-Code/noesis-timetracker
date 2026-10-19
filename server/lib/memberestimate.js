// Estimation INDICATIVE du temps par membre (chantier #73, 19 oct. 2026).
// Lecture seule, sans IA : médiane des durées des entrées de temps du membre
// dans la MÊME activité et le MÊME pôle (goalCategory, secteurs ramenés au pôle). Information
// seulement : ne modifie jamais rien. Moins de MIN_SAMPLES entrées => null
// (« pas assez de données »). Seuls les membres de l'activité sont listés.
const db = require('../db');

const MIN_SAMPLES = 3;

// Valeur SAISIE par un membre de l'activité (remplace l'estimation calculée, jamais en silence :
// geste explicite). Table additive créée ici, même motif que goal_time_caps (timecaps.js).
db.exec(`CREATE TABLE IF NOT EXISTS member_time_overrides (
  activityId INTEGER NOT NULL, poleKey TEXT NOT NULL, memberId TEXT NOT NULL, minutes INTEGER NOT NULL,
  PRIMARY KEY (activityId, poleKey, memberId)
)`);

// minutes null/0/'' = retour à l'estimation calculée.
function setOverride(activityId, poleKey, memberId, minutes) {
  const goals = require('./goals');
  const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });
  if (!goals.isValidCategoryForActivity(activityId, poleKey)) throw bad('Pôle inconnu.');
  if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, memberId)) throw bad('Membre inconnu.');
  if (minutes === null || minutes === undefined || minutes === '' || Number(minutes) === 0) {
    db.prepare('DELETE FROM member_time_overrides WHERE activityId = ? AND poleKey = ? AND memberId = ?').run(activityId, poleKey, memberId);
    return { ok: true, minutes: null };
  }
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw bad('Durée invalide : entier de minutes >= 1.');
  db.prepare('INSERT INTO member_time_overrides (activityId, poleKey, memberId, minutes) VALUES (?, ?, ?, ?) ON CONFLICT(activityId, poleKey, memberId) DO UPDATE SET minutes = excluded.minutes').run(activityId, poleKey, memberId, n);
  return { ok: true, minutes: n };
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// La catégorie comparable est le PÔLE : un secteur remonte à son pôle
// (goals.resolveToPole), pour la catégorie demandée comme pour chaque entrée.
function memberEstimates(activityId, category) {
  const goals = require('./goals');
  const members = db.prepare('SELECT userId FROM activity_members WHERE activityId = ?').all(activityId);
  const stmt = db.prepare('SELECT goalCategory, durationSeconds FROM time_entries WHERE activityId = ? AND userId = ? AND goalCategory IS NOT NULL AND durationSeconds > 0');
  const pole = category ? goals.resolveToPole(activityId, category) : '';
  const cache = {};
  const poleOf = (k) => (k in cache ? cache[k] : (cache[k] = goals.resolveToPole(activityId, k)));
  const out = {};
  for (const m of members) {
    const rows = pole ? stmt.all(activityId, m.userId).filter((r) => poleOf(r.goalCategory) === pole) : [];
    out[m.userId] = rows.length >= MIN_SAMPLES
      ? { minutes: Math.max(1, Math.round(median(rows.map((r) => r.durationSeconds)) / 60)), samples: rows.length }
      : null;
  }
  return out;
}

// Toutes les estimations d'un coup, par membre puis par pôle (fenêtre Activité,
// sous « Gérer mon temps ») : [{ id, name, poles: [{ key, label, estimate|null }] }].
function memberEstimatesByPole(activityId) {
  const goals = require('./goals');
  const poles = goals.categoriesForActivity(activityId);
  const members = goals.membersForActivity(activityId);
  const stmt = db.prepare('SELECT goalCategory, durationSeconds FROM time_entries WHERE activityId = ? AND userId = ? AND goalCategory IS NOT NULL AND durationSeconds > 0');
  const cache = {};
  const poleOf = (k) => (k in cache ? cache[k] : (cache[k] = goals.resolveToPole(activityId, k)));
  const ovr = {};
  db.prepare('SELECT poleKey, memberId, minutes FROM member_time_overrides WHERE activityId = ?').all(activityId).forEach((o) => { ovr[o.memberId + '|' + o.poleKey] = o.minutes; });
  return members.map((m) => {
    const rows = stmt.all(activityId, m.id);
    return {
      id: m.id,
      name: m.name,
      poles: poles.map((p) => {
        const r = rows.filter((x) => poleOf(x.goalCategory) === p.key);
        return {
          key: p.key,
          label: p.label,
          custom: ovr[m.id + '|' + p.key] || null,
          estimate: r.length >= MIN_SAMPLES
            ? { minutes: Math.max(1, Math.round(median(r.map((x) => x.durationSeconds)) / 60)), samples: r.length }
            : null,
        };
      }),
    };
  });
}

module.exports = { memberEstimates, memberEstimatesByPole, setOverride, MIN_SAMPLES };
