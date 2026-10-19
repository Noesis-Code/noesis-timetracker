// Rétention des sauvegardes R2 : 14 jours (quotidiennes), 8 semaines
// (hebdomadaires), 12 mois (mensuelles). Fonction pure + application.
// Jamais supprimer la plus récente ni un objet dont la date est illisible.
// Simulation par défaut (journal seulement) ; suppression réelle uniquement
// si BACKUP_RETENTION_APPLY=1.
const DAY = 86400000;

function parseKeyDate(key) {
  const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z/.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return isNaN(d) ? null : d;
}
function dayKey(d) { return d.toISOString().slice(0, 10); }
function monthKey(d) { return d.toISOString().slice(0, 7); }
function weekKey(d) { // lundi de la semaine (UTC)
  const dow = (d.getUTCDay() + 6) % 7;
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)));
}

// objects: [{key}] ; renvoie { keep: [keys], remove: [keys] }
function planRetention(objects, nowMs = Date.now(), cfg = {}) {
  const days = cfg.days || 14, weeks = cfg.weeks || 8, months = cfg.months || 12;
  const dated = [], keep = new Set();
  for (const o of objects) {
    const d = parseKeyDate(o.key);
    if (d) dated.push({ key: o.key, d }); else keep.add(o.key);
  }
  dated.sort((a, b) => b.d - a.d); // plus récent d'abord
  if (dated.length) keep.add(dated[0].key);
  const seenD = new Set(), seenW = new Set(), seenM = new Set();
  const now = new Date(nowMs);
  const weekLimit = new Date(weekKey(now) + 'T00:00:00Z').getTime() - (weeks - 1) * 7 * DAY;
  const monthLimit = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1);
  for (const { key, d } of dated) { // le premier vu de chaque période = le plus récent
    const t = d.getTime();
    if (nowMs - t < days * DAY && !seenD.has(dayKey(d))) { seenD.add(dayKey(d)); keep.add(key); }
    const wk = weekKey(d);
    if (t >= weekLimit && !seenW.has(wk)) { seenW.add(wk); keep.add(key); }
    const mk = monthKey(d);
    if (t >= monthLimit && !seenM.has(mk)) { seenM.add(mk); keep.add(key); }
  }
  return { keep: objects.map((o) => o.key).filter((k) => keep.has(k)), remove: dated.filter((x) => !keep.has(x.key)).map((x) => x.key) };
}

async function applyRetention(client, prefix, logger = console, opts = {}) {
  const apply = opts.apply !== undefined ? opts.apply : process.env.BACKUP_RETENTION_APPLY === '1';
  const objects = await client.listObjects(prefix);
  const plan = planRetention(objects, opts.now || Date.now());
  for (const key of plan.remove) {
    if (apply) {
      await client.deleteObject(key);
      logger.log(`[backup] Purge : ${key} (hors rétention 14 j / 8 sem. / 12 mois)`);
    } else {
      logger.log(`[backup] SIMULATION purge : ${key} serait supprimée (BACKUP_RETENTION_APPLY=1 pour activer)`);
    }
  }
  return { apply, removed: apply ? plan.remove : [], wouldRemove: apply ? [] : plan.remove, kept: plan.keep.length };
}

module.exports = { planRetention, applyRetention, parseKeyDate };
