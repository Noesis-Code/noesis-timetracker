// Logique des STATISTIQUES personnelles (onglet Statistiques). C'est le
// fichier "de Gaspard" : la Communauté vit désormais dans lib/community.js,
// séparé exprès pour que les deux chantiers ne touchent jamais le même
// fichier en même temps.

const db = require('../db');
const { mondayOf, isoDateOf, dayNameOf, pad2, MONTH_NAMES_FR } = require('./dates');

// Note (1er septembre 2026) : `breakdownForUser` vivait ici — la répartition
// par activité sur une PÉRIODE nommée ('week'/'month'/'year' via periodRange).
// Retirée sur confirmation d'Emilien après que la Répartition est passée sur
// breakdownForRange ci-dessous (aligné sur la fenêtre réellement affichée par
// la Feuille de temps) : elle n'avait plus aucun appelant, pas plus que les
// champs `week`/`month`/`year` de GET /stats qu'elle alimentait. Voir
// noesis-timetracker-journal-repartition.md.

// ===================== RÉPARTITION (camembert) — ALIGNÉE SUR LA FEUILLE DE TEMPS =====
// 1er septembre 2026, demande d'Emilien : « je souhaite que la répartition
// dépende de la feuille de temps. La répartition indique les données
// affichées en temps réel dans la feuille de temps et se modifie
// automatiquement avec elle. » Le camembert n'a donc plus de période à lui
// (son menu "⋮" Semaine/Mois/Année a été retiré de public/index.html) : il
// résume exactement la fenêtre de jours que la grille est en train
// d'afficher, quelle qu'elle soit.
//
// Pourquoi une nouvelle fonction plutôt que l'ancienne breakdownForUser
// (retirée le même jour, voir la note en tête de fichier) : celle-là partait
// d'une PÉRIODE nommée ('week'/'month'/'year' → periodRange),
// c'est-à-dire d'un découpage calendaire qui n'a aucune raison de coïncider
// avec la fenêtre réellement affichée par la Feuille de temps — en
// particulier parce que sa vue Semaine affiche une semaine calendaire entière
// (lundi→dimanche, voir timesheetForUser plus bas), et que sa vue
// Mois déborde sur les semaines voisines pour compléter le calendrier. C'est
// précisément cet écart qui faisait diverger les deux sections. Ici on part
// donc des bornes réelles de la grille, passées par l'appelant.
//
// Deux points de fidélité, choisis pour que le camembert soit toujours
// réconciliable à l'œil avec la grille juste au-dessus :
//  - même jeu d'entrées que la grille : filtre `isoDate BETWEEN ? AND ?`,
//    identique à celui de computeSlotsForDays (une session est rattachée au
//    jour où elle a DÉMARRÉ) ;
//  - même découpe aux bords : une session qui déborde de la fenêtre n'est
//    comptée que pour la portion visible, exactement comme la grille ne
//    colorie que les créneaux compris dans les jours affichés.
// À la différence de la grille, en revanche, on somme ici les vraies durées
// et non des créneaux : la grille quantifie (15 min en vue Semaine, 2 h en
// vue Mois) et ne garde qu'une activité dominante par créneau — inutilisable
// pour des totaux justes. C'est la raison pour laquelle ce calcul reste
// serveur au lieu d'être refait côté client à partir de la grille.
function breakdownForRange(userId, startIso, endIso) {
  const rangeStart = new Date(startIso + 'T00:00:00');
  const rangeEnd = new Date(endIso + 'T00:00:00');
  rangeEnd.setDate(rangeEnd.getDate() + 1); // borne haute exclusive = lendemain du dernier jour affiché

  const rows = db.prepare(`
    SELECT t.startTime, t.endTime, a.id AS activityId, a.name AS activity,
           COALESCE(am.color, '#3498db') AS color
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    LEFT JOIN activity_members am ON am.activityId = a.id AND am.userId = t.userId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
  `).all(userId, startIso, endIso);

  const byActivity = {};
  rows.forEach((r) => {
    const entryStart = new Date(r.startTime);
    const entryEnd = new Date(r.endTime);
    // Une entrée encore en cours (endTime absent) ou une date illisible
    // donnerait un NaN qui contaminerait silencieusement tous les totaux :
    // on l'ignore plutôt que de la propager.
    if (isNaN(entryStart.getTime()) || isNaN(entryEnd.getTime())) return;

    const clipStart = entryStart > rangeStart ? entryStart : rangeStart;
    const clipEnd = entryEnd < rangeEnd ? entryEnd : rangeEnd;
    const seconds = (clipEnd - clipStart) / 1000;
    if (seconds <= 0) return;

    if (!byActivity[r.activityId]) {
      byActivity[r.activityId] = { activityId: r.activityId, name: r.activity, color: r.color, seconds: 0 };
    }
    byActivity[r.activityId].seconds += seconds;
  });

  const activities = Object.keys(byActivity)
    .map((k) => byActivity[k])
    .map((a) => ({ activityId: a.activityId, name: a.name, color: a.color, seconds: Math.round(a.seconds) }))
    .sort((a, b) => b.seconds - a.seconds);

  // Total recalculé APRÈS arrondi de chaque part, pour que la somme des
  // parts affichées soit toujours exactement le total affiché au centre du
  // camembert (sinon on peut lire 3 parts qui ne font pas le total).
  const totalSeconds = activities.reduce((sum, a) => sum + a.seconds, 0);

  return {
    start: startIso,
    end: endIso,
    totalSeconds,
    activities: activities.map((a) => Object.assign({}, a, {
      percent: totalSeconds > 0 ? Math.round((a.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

// Plage du Graphique : du tout premier jour enregistré par l'utilisateur
// (MIN(isoDate) sur ses propres entrées) jusqu'à aujourd'hui. Introduite le
// 31 août 2026 comme une période "Total" parmi Mois/Année/Total ; devenue le
// 1er septembre 2026 (nouvelle demande d'Emilien) la SEULE plage du
// Graphique, qui affiche désormais toujours tout l'historique — seule la
// granularité des points se choisit encore (voir chartBreakdownForUser
// ci-dessous). Vit ici (pas dans lib/period.js, qui est un pur utilitaire de
// dates sans accès DB) car elle a besoin de lire time_entries.
function totalRangeForUser(userId, refDate) {
  const ref = refDate ? new Date(refDate) : new Date();
  const todayIso = isoDateOf(ref);
  const earliest = db.prepare('SELECT MIN(isoDate) AS d FROM time_entries WHERE userId = ?').get(userId);
  return { start: (earliest && earliest.d) || todayIso, end: todayIso, label: 'Depuis le début' };
}

// ===================== GRAPHIQUE (regroupement jour / semaine / mois) =====
// 1er septembre 2026, demande d'Emilien : « le graphique affiche toujours le
// total des enregistrements depuis le début, mais qui peut être détaillé au
// jour, à la semaine ou au mois ». Remplace l'ancien dailyBreakdownForUser
// (qui gardait un point par jour quelle que soit la "période" — Semaine /
// Mois / Année / Total — qui ne servait qu'à choisir la PLAGE affichée) :
// la plage est maintenant toujours totalRangeForUser ci-dessus, et c'est la
// GRANULARITÉ (`granularity`, 'day' | 'week' | 'month') qui choisit comment
// regrouper les points sur cette plage fixe.
//
// "Semaine"/"Mois" regroupent par tranche CALENDAIRE fixe (mondayOf / premier
// du mois), pas par fenêtre glissante par rapport à aujourd'hui — même
// convention que la vue Semaine de la Feuille de temps depuis le 2 septembre
// 2026 (mondayOf, voir timesheetForUser plus bas) : un
// regroupement historique doit rester des tranches stables — la même semaine
// de juillet doit toujours apparaître comme le même point du graphique,
// qu'on le regarde aujourd'hui ou dans un mois.
//
// Pour 'day', la forme renvoyée est strictement celle d'avant (isoDate /
// dayOfWeek / totalSeconds / activities) : aucun changement de comportement
// pour la granularité par défaut. Pour 'week'/'month', chaque point porte en
// plus `granularity`, `shortLabel` (axe) et `fullLabel` (infobulle) déjà
// formatés en français (même convention que timesheetForUser/
// timesheetMonthForUser ci-dessous, dont les labels ne sont pas traduits non
// plus) — public/app.js (dayChartLabel) les utilise directement pour ces
// deux granularités, sans rien connaître du découpage calendaire.
function chartBreakdownForUser(userId, granularity, refDate) {
  const { start, end } = totalRangeForUser(userId, refDate);

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

  if (granularity !== 'week' && granularity !== 'month') {
    const byDay = {};
    rows.forEach((r) => {
      if (!byDay[r.isoDate]) byDay[r.isoDate] = { isoDate: r.isoDate, dayOfWeek: r.dayOfWeek, totalSeconds: 0, activities: [] };
      byDay[r.isoDate].totalSeconds += r.seconds;
      byDay[r.isoDate].activities.push({ activityId: r.activityId, name: r.activity, color: r.color, seconds: r.seconds });
    });
    return Object.values(byDay).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
  }

  const byBucket = {};
  const order = [];
  rows.forEach((r) => {
    const dayDate = new Date(r.isoDate + 'T00:00:00');
    const bucketStart = granularity === 'week' ? mondayOf(dayDate) : new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
    const key = isoDateOf(bucketStart);
    if (!byBucket[key]) { byBucket[key] = { isoDate: key, totalSeconds: 0, activitiesById: {} }; order.push(key); }
    const bucket = byBucket[key];
    bucket.totalSeconds += r.seconds;
    if (!bucket.activitiesById[r.activityId]) bucket.activitiesById[r.activityId] = { activityId: r.activityId, name: r.activity, color: r.color, seconds: 0 };
    bucket.activitiesById[r.activityId].seconds += r.seconds;
  });

  return order.map((key) => {
    const b = byBucket[key];
    const bucketStart = new Date(key + 'T00:00:00');
    let shortLabel, fullLabel;
    if (granularity === 'week') {
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      shortLabel = `${pad2(bucketStart.getDate())}/${pad2(bucketStart.getMonth() + 1)}`;
      fullLabel = `Semaine du ${pad2(bucketStart.getDate())}/${pad2(bucketStart.getMonth() + 1)} au ${pad2(bucketEnd.getDate())}/${pad2(bucketEnd.getMonth() + 1)}`;
    } else {
      shortLabel = `${MONTH_NAMES_FR[bucketStart.getMonth()].slice(0, 3)} ${bucketStart.getFullYear()}`;
      fullLabel = `${MONTH_NAMES_FR[bucketStart.getMonth()]} ${bucketStart.getFullYear()}`;
    }
    return { isoDate: key, granularity, shortLabel, fullLabel, totalSeconds: b.totalSeconds, activities: Object.values(b.activitiesById) };
  }).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
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

// ⚠️ 2 septembre 2026 — RÈGLE MIXTE : la semaine en cours glisse, les
// précédentes sont calendaires.
//
// Les deux règles pures ont chacune été essayées ce jour-là, et chacune a été
// rejetée par Emilien pour une raison précise :
//   - fenêtre glissante partout (état d'origine) → les flèches donnaient des
//     semaines décalées, jamais lundi→dimanche : « je souhaite que lorsque je
//     clique sur une flèche, cela me montre toujours des semaines de lundi à
//     dimanche » ;
//   - semaines calendaires partout (livré le matin) → la semaine en cours
//     affichait des jours à venir, donc vides : « je souhaite que par défaut
//     la feuille de temps n'affiche jamais des journées qui ne soient pas
//     encore passées ».
// D'où la règle qu'il a formulée lui-même : « c'est seulement la dernière
// semaine qui est décalée, les autres sont de lundi au dimanche. »
//
//   offset 0  → les 7 derniers jours, se terminant AUJOURD'HUI ;
//   offset n  → la semaine calendaire lundi→dimanche, n semaines avant celle
//               en cours (offset 1 = la dernière semaine complète révolue).
//
// Aller-retour vérifié : partir d'offset 0, reculer, puis revenir ramène bien
// la fenêtre glissante — c'est exactement ce qu'il décrit (« quand on va
// revenir sur la droite, ça va remettre en décalé »), et c'est voulu.
//
// mondayOf vient de ./dates (utilitaire partagé, déjà utilisé par la vue
// "Mois" juste en dessous et par les regroupements hebdomadaires du
// Graphique) : un seul endroit décide de ce qu'est un lundi.
function timesheetForUser(userId, weekOffset) {
  const offset = Math.max(0, Math.floor(Number(weekOffset)) || 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  if (offset === 0) {
    // Semaine EN COURS : fenêtre glissante des 7 derniers jours, se terminant
    // aujourd'hui. Jamais un jour à venir.
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d);
    }
  } else {
    // Semaines PASSÉES : vraies semaines calendaires, lundi → dimanche.
    // Ancrage sur le lundi de la semaine en cours, reculé de `offset`
    // semaines : offset=1 est donc la dernière semaine complète révolue.
    // Aucun jour n'est inatteignable — les jours de la semaine en cours qui
    // ne sont pas dans cette semaine-là sont, eux, dans la fenêtre glissante
    // d'offset 0 (les deux se chevauchent, mais ne laissent pas de trou).
    const monday = mondayOf(today);
    monday.setDate(monday.getDate() - offset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
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

module.exports = { breakdownForRange, chartBreakdownForUser, timesheetForUser, timesheetMonthForUser };