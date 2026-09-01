// Logique des STATISTIQUES personnelles (onglet Statistiques). C'est le
// fichier "de Gaspard" : la Communauté vit désormais dans lib/community.js,
// séparé exprès pour que les deux chantiers ne touchent jamais le même
// fichier en même temps.

const db = require('../db');
const { periodRange } = require('./period');
const { mondayOf, isoDateOf, dayNameOf, pad2, MONTH_NAMES_FR } = require('./dates');

function breakdownForUser(userId, period, refDate) {
  const { start, end, label } = periodRange(period, refDate);

  const rows = db.prepare(`
    SELECT a.id AS activityId, a.name AS activity, COALESCE(am.color, '#3498db') AS color,
           SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY a.id
    ORDER BY seconds DESC
  `).all(userId, start, end);

  const totalSeconds = rows.reduce((sum, r) => sum + r.seconds, 0);
  return {
    period, label, start, end, totalSeconds,
    activities: rows.map((r) => ({
      activityId: r.activityId,
      name: r.activity,
      color: r.color,
      seconds: r.seconds,
      percent: totalSeconds > 0 ? Math.round((r.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

// Période "Total" du Graphique (31 août 2026, demande d'Emilien : remplacer
// "Semaine" par Mois/Année/Total). Pas de notion de "période" au sens
// périodRange (pas de longueur fixe) : du tout premier jour enregistré par
// l'utilisateur (MIN(isoDate) sur ses propres entrées) jusqu'à aujourd'hui.
// Vit ici (pas dans lib/period.js, qui est un pur utilitaire de dates sans
// accès DB) car elle a besoin de lire time_entries.
function totalRangeForUser(userId, refDate) {
  const ref = refDate ? new Date(refDate) : new Date();
  const todayIso = isoDateOf(ref);
  const earliest = db.prepare('SELECT MIN(isoDate) AS d FROM time_entries WHERE userId = ?').get(userId);
  return { start: (earliest && earliest.d) || todayIso, end: todayIso, label: 'Depuis le début' };
}

function dailyBreakdownForUser(userId, period, refDate) {
  const { start, end } = period === 'total' ? totalRangeForUser(userId, refDate) : periodRange(period, refDate);

  const rows = db.prepare(`
    SELECT t.isoDate AS isoDate, t.dayOfWeek AS dayOfWeek, a.id AS activityId,
           a.name AS activity, COALESCE(am.color, '#3498db') AS color, SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY t.isoDate, a.id
    ORDER BY t.isoDate ASC, seconds DESC
  `).all(userId, start, end);

  const byDay = {};
  rows.forEach((r) => {
    if (!byDay[r.isoDate]) byDay[r.isoDate] = { isoDate: r.isoDate, dayOfWeek: r.dayOfWeek, totalSeconds: 0, activities: [] };
    byDay[r.isoDate].totalSeconds += r.seconds;
    byDay[r.isoDate].activities.push({ activityId: r.activityId, name: r.activity, color: r.color, seconds: r.seconds });
  });

  return Object.values(byDay).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
}

// ===================== FEUILLE DE TEMPS (heatmap hebdomadaire) =====================
// Grille jour × quart d'heure (96 colonnes de 00:00 à 23:45), dans l'esprit
// de l'onglet "Feuille de temps" du Google Sheet d'origine (voir capture
// fournie par Emilien le 29 août 2026). Strictement personnelle comme le
// reste des Statistiques : jamais mélangée avec les entrées de quelqu'un
// d'autre, même sur une activité partagée.
//
// weekOffset (entier >= 0) décale la fenêtre de 7 jours affichée en arrière
// par rapport à la fenêtre en cours — 0 = fenêtre en cours, 1 = fenêtre
// précédente, etc. Jamais vers le futur. "Réinitialisable à chaque
// semaine" : c'est le client (public/app.js) qui repart systématiquement sur
// weekOffset=0 à chaque ouverture de l'onglet Statistiques. Les fenêtres
// précédentes ne sont ni supprimées ni recalculées différemment : juste
// masquées par défaut, et consultables en naviguant en arrière (voir
// hasMoreBefore ci-dessous).
//
// La fenêtre de 7 jours n'est PAS calée sur le calendrier (lundi-dimanche) :
// elle se termine toujours sur AUJOURD'HUI, jamais sur un jour à venir (1er
// septembre 2026, demande d'Emilien : la semaine "en cours" ne doit plus
// jamais s'ouvrir sur 5-6 jours vides simplement parce qu'on est en tout
// début de semaine calendaire — "toujours les 7 derniers jours écoulés + le
// jour actuel"). weekOffset=0 se recale donc automatiquement chaque jour :
// aucun traitement spécial de minuit à faire, `today` est simplement
// recalculé à chaque appel. Cette fenêtre glissante est propre à la vue
// Semaine ; la vue Mois (calendrier, plus bas) reste, elle, calée sur de
// vraies semaines lundi-dimanche — c'est ce que sa forme calendaire exige.
const SLOTS_PER_DAY = 96; // 24h / 15 min
const SLOT_MINUTES = 15;

// Segmentation utilisée par la vue "Mois" (calendrier) de la Feuille de
// temps — demande d'Emilien du 30 août 2026 : chaque case-jour du calendrier
// est découpée en 12 sections de 2h (au lieu des 96 quarts d'heure de la
// vue "Semaine", bien trop fins pour tenir dans une case de calendrier).
const MONTH_SLOT_MINUTES = 120;

// Cœur commun aux deux vues de la Feuille de temps (heatmap hebdomadaire à
// 15 min, calendrier mensuel à 2h) : reçoit une liste de jours (Date[]) et
// une durée de créneau en minutes, renvoie pour chacun de ces jours le
// détail { isoDate, dayOfWeek, slots } avec, pour chaque créneau, l'activité
// dominante (celle qui couvre le plus de secondes de ce créneau — cas rare
// mais réel d'un chevauchement entre deux entrées). Extrait de l'ancien
// timesheetForUser (comportement inchangé pour la vue Semaine) pour être
// réutilisé tel quel par timesheetMonthForUser ci-dessous, avec un
// slotMinutes différent.
function computeSlotsForDays(userId, days, slotMinutes) {
  const slotsPerDay = Math.round((24 * 60) / slotMinutes);
  const start = isoDateOf(days[0]);
  const end = isoDateOf(days[days.length - 1]);

  const rows = db.prepare(`
    SELECT t.startTime, t.endTime, a.id AS activityId, a.name AS activity,
           COALESCE(am.color, '#3498db') AS color
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
  `).all(userId, start, end);

  // overlap[dayIndex][slotIndex] = { activityId: { seconds, name, color } } —
  // accumule le nombre de secondes couvertes par chaque activité dans ce
  // créneau précis, pour départager le cas (rare) où deux entrées se
  // partagent un même créneau (fin de l'une / début de l'autre).
  const overlap = days.map(() => {
    const slots = [];
    for (let s = 0; s < slotsPerDay; s++) slots.push({});
    return slots;
  });

  rows.forEach((r) => {
    const entryStart = new Date(r.startTime);
    const entryEnd = new Date(r.endTime);

    days.forEach((d, dayIndex) => {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      const clipStart = entryStart > dayStart ? entryStart : dayStart;
      const clipEnd = entryEnd < dayEnd ? entryEnd : dayEnd;
      if (clipEnd <= clipStart) return; // cette entrée ne touche pas ce jour-là

      const firstSlot = Math.floor((clipStart - dayStart) / 60000 / slotMinutes);
      const lastSlot = Math.min(slotsPerDay - 1, Math.ceil((clipEnd - dayStart) / 60000 / slotMinutes) - 1);

      for (let s = firstSlot; s <= lastSlot; s++) {
        const slotStart = new Date(dayStart.getTime() + s * slotMinutes * 60000);
        const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);
        const ovStart = clipStart > slotStart ? clipStart : slotStart;
        const ovEnd = clipEnd < slotEnd ? clipEnd : slotEnd;
        const seconds = (ovEnd - ovStart) / 1000;
        if (seconds <= 0) continue;

        const bucket = overlap[dayIndex][s];
        if (!bucket[r.activityId]) bucket[r.activityId] = { seconds: 0, name: r.activity, color: r.color, activityId: r.activityId };
        bucket[r.activityId].seconds += seconds;
      }
    });
  });

  return days.map((d, dayIndex) => {
    const slots = overlap[dayIndex].map((bucket) => {
      const candidates = Object.keys(bucket).map((k) => bucket[k]);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.seconds - a.seconds);
      const best = candidates[0];
      return { activityId: best.activityId, name: best.name, color: best.color };
    });
    return { isoDate: isoDateOf(d), dayOfWeek: dayNameOf(d), slots };
  });
}

function timesheetForUser(userId, weekOffset) {
  const offset = Math.max(0, Math.floor(Number(weekOffset)) || 0);

  // Dernier jour de la fenêtre : aujourd'hui pour offset=0, puis 7 jours plus
  // tôt par tranche de offset supplémentaire — jamais un jour à venir.
  const lastDay = new Date();
  lastDay.setHours(0, 0, 0, 0);
  lastDay.setDate(lastDay.getDate() - offset * 7);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(lastDay);
    d.setDate(lastDay.getDate() - i);
    days.push(d);
  }
  const start = isoDateOf(days[0]);
  const end = isoDateOf(days[6]);

  const grid = computeSlotsForDays(userId, days, SLOT_MINUTES);

  const earliest = db.prepare('SELECT MIN(isoDate) AS d FROM time_entries WHERE userId = ?').get(userId);
  const hasMoreBefore = !!(earliest && earliest.d && earliest.d < start);

  const label = `Semaine du ${pad2(days[0].getDate())}/${pad2(days[0].getMonth() + 1)} au ${pad2(days[6].getDate())}/${pad2(days[6].getMonth() + 1)}`;

  return { weekOffset: offset, isCurrentWeek: offset === 0, start, end, label, hasMoreBefore, days: grid };
}

// ===================== FEUILLE DE TEMPS — VUE "MOIS" (calendrier) =====================
// Ajoutée le 30 août 2026 à la demande d'Emilien : un calendrier avec les
// semaines en lignes et les jours de la semaine en colonnes (Lun...Dim),
// chaque case-jour décomposée en 12 sections de 2h (voir MONTH_SLOT_MINUTES
// ci-dessus). Pas d'option "Année" pour la Feuille de temps (demande
// explicite d'Emilien, contrairement à la Répartition et au Graphique qui
// gardent les trois) — seulement Semaine (timesheetForUser ci-dessus) et
// Mois (ici).
//
// monthOffset (entier >= 0) décale le mois affiché en arrière par rapport au
// mois en cours — 0 = mois en cours, 1 = mois précédent, etc. Jamais vers le
// futur, même logique que weekOffset. La grille couvre TOUJOURS des
// semaines complètes (lundi à dimanche) : elle déborde donc légèrement sur
// le mois précédent/suivant pour compléter la première/dernière semaine —
// ces jours "hors mois" sont marqués `inMonth: false` pour être atténués
// côté affichage plutôt que masqués, comme un calendrier classique.
function timesheetMonthForUser(userId, monthOffset) {
  const offset = Math.max(0, Math.floor(Number(monthOffset)) || 0);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  const targetMonth = firstOfMonth.getMonth();

  const calStart = mondayOf(firstOfMonth);
  const calEnd = mondayOf(lastOfMonth);
  calEnd.setDate(calEnd.getDate() + 6); // dimanche de la semaine du dernier jour du mois

  const days = [];
  const cursor = new Date(calStart);
  while (cursor <= calEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const grid = computeSlotsForDays(userId, days, MONTH_SLOT_MINUTES);
  grid.forEach((day, i) => { day.inMonth = days[i].getMonth() === targetMonth; });

  // Regroupe la liste à plat en semaines de 7 jours (calStart tombe toujours
  // un lundi, donc chaque tranche de 7 est une semaine complète).
  const weeks = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));

  const start = isoDateOf(firstOfMonth);
  const end = isoDateOf(lastOfMonth);
  const earliest = db.prepare('SELECT MIN(isoDate) AS d FROM time_entries WHERE userId = ?').get(userId);
  const hasMoreBefore = !!(earliest && earliest.d && earliest.d < start);

  const label = `${MONTH_NAMES_FR[targetMonth]} ${firstOfMonth.getFullYear()}`;

  return { monthOffset: offset, isCurrentMonth: offset === 0, start, end, label, hasMoreBefore, weeks };
}

module.exports = { breakdownForUser, dailyBreakdownForUser, timesheetForUser, timesheetMonthForUser };