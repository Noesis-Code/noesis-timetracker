// Logique de la COMMUNAUTÉ (classements des activités partagées). Séparé
// de lib/stats.js exprès : ce fichier reste "à Emilien", Gaspard n'a jamais
// besoin d'y toucher pour travailler sur les Statistiques.

const db = require('../db');
const { periodRange } = require('./period');
const { mondayOf, isoDateOf, dayNameOf, pad2, MONTH_NAMES_FR } = require('./dates');

function sharedActivitiesForUser(userId, period, refDate) {
  const { start, end, label } = periodRange(period, refDate);

  const activityRows = db.prepare(`
    SELECT a.id AS activityId, a.name AS name, a.ownerId AS ownerId
    FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ?
      AND (SELECT COUNT(*) FROM activity_members m2 WHERE m2.activityId = a.id) >= 2
    ORDER BY a.id
  `).all(userId);

  const memberStmt = db.prepare(`
    SELECT u.id AS userId, u.name AS name, am.color AS color,
           COALESCE(SUM(t.durationSeconds), 0) AS seconds
    FROM activity_members am
    JOIN users u ON u.id = am.userId
    LEFT JOIN time_entries t ON t.userId = am.userId AND t.activityId = am.activityId AND t.isoDate BETWEEN ? AND ?
    WHERE am.activityId = ?
    GROUP BY u.id
    ORDER BY seconds DESC, u.name COLLATE NOCASE ASC
  `);

  // Messages non lus du fil de discussion de chaque activité (voir
  // unreadMessageCountsForUser plus bas) : calculés en une seule requête pour
  // toutes les activités à la fois, plutôt qu'une par ligne, puis rattachés
  // ci-dessous. Sert la pastille de non-lus sur chaque ligne d'activité de la
  // section Membres.
  const unread = unreadMessageCountsForUser(userId);

  const activities = activityRows.map((a) => {
    const members = memberStmt.all(start, end, a.activityId);
    const activityTotal = members.reduce((sum, m) => sum + m.seconds, 0);

    return {
      activityId: a.activityId,
      name: a.name,
      isOwner: a.ownerId === userId,
      totalSeconds: activityTotal,
      unreadMessages: unread[a.activityId] || 0,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.name,
        color: m.color,
        seconds: m.seconds,
        percent: activityTotal > 0 ? Math.round((m.seconds / activityTotal) * 100) : 0,
      })),
    };
  });

  return { period, label, start, end, activities };
}

// Flux "Partagée" : sessions des AUTRES membres des activités que je
// partage actuellement (appartenance vivante des deux côtés, comme le
// classement ci-dessus — pas d'historique figé) — indépendant du suivi.
// `activityId` optionnel : restreint le flux à une seule activité partagée
// précise (voir le sélecteur ajouté dans la section Membres) plutôt que de
// mélanger toutes les activités partagées ensemble. Le contrôle que
// l'appelant est bien membre de cette activité se fait dans la route (voir
// server/routes/community.js), pas ici.
function sharedFeedForUser(userId, activityId, limit) {
  limit = limit || 100;
  if (activityId) {
    return db.prepare(`
      SELECT t.id, t.userId, u.name AS userName, u.color AS userColor,
             t.activityId, a.name AS activityName, t.note, t.startTime, t.endTime, t.durationSeconds
      FROM time_entries t
      JOIN activities a ON a.id = t.activityId
      JOIN users u ON u.id = t.userId
      WHERE t.userId != ?
        AND t.activityId = ?
        AND EXISTS (SELECT 1 FROM activity_members me WHERE me.activityId = t.activityId AND me.userId = ?)
        AND EXISTS (SELECT 1 FROM activity_members him WHERE him.activityId = t.activityId AND him.userId = t.userId)
      ORDER BY t.startTime DESC
      LIMIT ?
    `).all(userId, activityId, userId, limit);
  }
  return db.prepare(`
    SELECT t.id, t.userId, u.name AS userName, u.color AS userColor,
           t.activityId, a.name AS activityName, t.note, t.startTime, t.endTime, t.durationSeconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    JOIN users u ON u.id = t.userId
    WHERE t.userId != ?
      AND EXISTS (SELECT 1 FROM activity_members me WHERE me.activityId = t.activityId AND me.userId = ?)
      AND EXISTS (SELECT 1 FROM activity_members him WHERE him.activityId = t.activityId AND him.userId = t.userId)
    ORDER BY t.startTime DESC
    LIMIT ?
  `).all(userId, userId, limit);
}

// Pièces jointes d'un message profile_posts, pour son affichage dans le
// flux "Suivi" de quelqu'un d'autre (voir followingFeedForUser ci-dessous).
// Copie volontaire de postAttachmentsFor (server/routes/profile.js, table
// propriété de Profil) plutôt qu'un import croisé entre deux zones : même
// principe que activityTimesheetForUser/timesheetForUser, deux fichiers
// distincts qui ne partagent pas leurs fonctions internes.
function profilePostAttachmentsFor(postId) {
  return db.prepare(`SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
                      FROM profile_post_attachments WHERE postId = ? ORDER BY createdAt ASC`).all(postId);
}

// Flux "Suivi" : les messages "Communauté" (profile_posts, table propriété
// de Profil, lue ici en débordement signalé — voir
// noesis-timetracker-chantiers-en-cours.md) des personnes que je suis
// (follows acceptés) ET qui ont activé "Partager mon profil" — SEULE source
// depuis le 2 septembre 2026, sur demande explicite d'Emilien : « seules
// les notes directement écrites depuis la discussion sur l'app peuvent y
// être répertoriées ».
// Ancienne branche retirée à ce passage : les sessions avec une note
// publiée (t.note != '') alimentaient seules ce flux depuis le 30 août
// 2026, puis étaient restées mélangées comme source "résiduelle" après
// l'arrivée de profile_posts le 1er septembre — plus aucune interface de
// l'app ne permettant d'écrire une telle note depuis le retrait de la zone
// "Note" du Chrono le 31 août 2026 (voir la carte Chrono de
// noesis-timetracker-chantiers-en-cours.md), ces entrées historiques
// pouvaient laisser croire qu'un message provenait "de la communauté" sans
// avoir jamais été écrit depuis la discussion. Emilien a tranché pour leur
// retrait complet plutôt que leur maintien comme legacy.
// Totalement indépendant de sharedFeedForUser ci-dessus : les deux
// fonctions ne se recoupent que par coïncidence (suivre quelqu'un avec qui
// on partage aussi une activité).
function followingFeedForUser(userId, limit) {
  limit = limit || 100;

  // Depuis le 3 septembre 2026 (demande d'Emilien), ce flux contient AUSSI mes
  // propres publications, mêlées chronologiquement à celles des personnes que
  // je suis — l'onglet Communauté n'a plus de liste séparée pour les miennes.
  // Deux conditions alternatives, donc :
  //   - c'est moi qui l'ai écrite (aucune autre condition : mes messages
  //     m'appartiennent, mon propre réglage de partage ne me concerne pas) ;
  //   - ou son auteur partage son profil ET j'ai un abonnement accepté vers
  //     lui — condition inchangée depuis l'origine.
  // u.avatar AS userAvatar ajouté le 3 septembre 2026 (demande d'Emilien :
  // « dans les postes, il doit y avoir à la place du point de couleur la
  // photo de profil en petit ») — même colonne, même alias que les autres
  // requêtes de ce fichier qui l'exposent déjà (voir activityMessagesForUser
  // plus bas), simplement absente ici jusqu'à présent car ce flux n'avait
  // encore jamais eu besoin de la photo.
  // u.lastName AS userLastName ajouté le 3 septembre 2026, sixième passage
  // (demande d'Emilien : « le nom des utilisateurs doit toujours s'afficher
  // en entier [...] que ce soit dans la zone des quelques profils à
  // découvrir ou que ce soit dans les posts ») — le passage précédent avait
  // seulement empêché la troncature CSS du nom déjà affiché (u.name, le
  // prénom), sans jamais aller chercher le nom de famille : « nom complet »
  // au sens où Emilien l'utilise ailleurs (renderIdentityHeader,
  // renderViewProfileIdentity) veut dire prénom + nom de famille.
  const posts = db.prepare(`
    SELECT p.id, p.userId, u.name AS userName, u.lastName AS userLastName, u.color AS userColor, u.avatar AS userAvatar, p.body, p.createdAt
    FROM profile_posts p
    JOIN users u ON u.id = p.userId
    WHERE p.userId = ?
       OR (u.shareProfile = 1
           AND EXISTS (SELECT 1 FROM follows f WHERE f.followerId = ? AND f.followeeId = p.userId AND f.status = 'accepted'))
    ORDER BY p.createdAt DESC
    LIMIT ?
  `).all(userId, userId, limit).map((row) => Object.assign({ type: 'post' }, row));
  posts.forEach((post) => { post.attachments = profilePostAttachmentsFor(post.id); });

  return posts;
}

// Liste des membres d'UNE activité partagée précise, avec un indicateur "en
// direct" : true si ce membre a ACTUELLEMENT un chrono en cours sur CETTE
// activité précise (running_timers.activityId = cette activité), pas juste
// un chrono quelconque sur une autre activité — voir le bouton "⋮" > "Voir
// les membres" de la section Membres. Le contrôle que l'appelant est bien
// membre de cette activité se fait dans la route, pas ici (même découpage
// que sharedFeedForUser/activity-feed).
function activityMembersForUser(activityId) {
  const rows = db.prepare(`
    SELECT u.id AS userId, u.name AS name, am.color AS color,
           EXISTS (SELECT 1 FROM running_timers rt WHERE rt.userId = u.id AND rt.activityId = am.activityId) AS isRunning
    FROM activity_members am
    JOIN users u ON u.id = am.userId
    WHERE am.activityId = ?
    ORDER BY u.name COLLATE NOCASE ASC
  `).all(activityId);

  return rows.map((r) => ({ userId: r.userId, name: r.name, color: r.color, isRunning: !!r.isRunning }));
}

// ============ FIL DE DISCUSSION D'UNE ACTIVITÉ PARTAGÉE ============
// À ne pas confondre avec l'autre forme d'écrit entre membres :
//   - time_entries.note  : la note d'UNE session, écrite au STOP, attachée à
//     cette session, visible dans les flux "Partagée"/"Suivi" ;
//   - activity_messages  : le fil ci-dessous — une vraie conversation, sans
//     rapport avec un chrono, conservée durablement, réservée aux membres
//     actuels de l'activité.
// (Une troisième forme a existé — activity_broadcasts, la note "en direct"
// envoyée depuis l'ancienne zone "Note" du Chrono — retirée le 1er septembre
// 2026, orpheline des deux côtés depuis fin août : voir
// noesis-timetracker-journal-communaute.md.)
// Comme partout ailleurs dans ce fichier, le contrôle "l'appelant est bien
// membre de cette activité partagée" est fait dans la route
// (checkSharedActivityAccess), jamais ici.

function activityMessagesForUser(activityId, limit) {
  limit = limit || 200;
  // Les `limit` messages les PLUS RÉCENTS (DESC + LIMIT), remis ensuite en
  // ordre chronologique croissant : sur un fil long, on veut la fin de la
  // conversation, pas son début.
  const rows = db.prepare(`
    SELECT m.id, m.userId, u.name AS userName, u.avatar AS userAvatar,
           COALESCE(am.color, u.color) AS userColor,
           m.body, m.createdAt
    FROM activity_messages m
    JOIN users u ON u.id = m.userId
    LEFT JOIN activity_members am ON am.activityId = m.activityId AND am.userId = m.userId
    WHERE m.activityId = ?
    ORDER BY m.createdAt DESC, m.id DESC
    LIMIT ?
  `).all(activityId, limit);

  return rows.reverse();
}

function postActivityMessage(activityId, userId, body) {
  const createdAt = new Date().toISOString();
  const info = db.prepare('INSERT INTO activity_messages (activityId, userId, body, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, userId, body, createdAt);
  const id = Number(info.lastInsertRowid);

  // Envoyer un message vaut lecture du fil : sinon l'auteur verrait une
  // pastille de non-lus créée par son propre message dès qu'il quitte l'écran.
  markActivityMessagesRead(activityId, userId, createdAt);

  return db.prepare(`
    SELECT m.id, m.userId, u.name AS userName, u.avatar AS userAvatar,
           COALESCE(am.color, u.color) AS userColor,
           m.body, m.createdAt
    FROM activity_messages m
    JOIN users u ON u.id = m.userId
    LEFT JOIN activity_members am ON am.activityId = m.activityId AND am.userId = m.userId
    WHERE m.id = ?
  `).get(id);
}

// Marque-page de lecture : `at` est optionnel (par défaut maintenant). On ne
// recule jamais le marque-page (MAX avec la valeur déjà en base) pour qu'un
// chargement plus ancien arrivé en retard ne fasse pas réapparaître comme
// "non lus" des messages déjà vus.
function markActivityMessagesRead(activityId, userId, at) {
  const when = at || new Date().toISOString();
  db.prepare(`
    INSERT INTO activity_message_reads (activityId, userId, lastReadAt)
    VALUES (?, ?, ?)
    ON CONFLICT(activityId, userId) DO UPDATE SET lastReadAt = MAX(lastReadAt, excluded.lastReadAt)
  `).run(activityId, userId, when);
}

// Nombre de messages non lus par activité, pour TOUTES mes activités
// partagées d'un coup : { activityId: n }. Ne compte jamais mes propres
// messages, et jamais une activité redevenue solo (< 2 membres) ou masquée.
// Aucun compteur n'est stocké : tout est déduit de activity_message_reads,
// donc rien ne peut dériver d'un état réel.
function unreadMessageCountsForUser(userId) {
  const rows = db.prepare(`
    SELECT m.activityId AS activityId, COUNT(*) AS n
    FROM activity_messages m
    JOIN activity_members me ON me.activityId = m.activityId AND me.userId = ?
    LEFT JOIN activity_message_reads r ON r.activityId = m.activityId AND r.userId = ?
    WHERE m.userId != ?
      AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt)
      -- Même définition de "activité partagée" que sharedActivitiesForUser :
      -- une activité redevenue solo (l'autre membre est parti) n'a plus de
      -- fil visible, ses anciens messages ne doivent donc plus rien compter.
      AND (SELECT COUNT(*) FROM activity_members m2 WHERE m2.activityId = m.activityId) >= 2
    GROUP BY m.activityId
  `).all(userId, userId, userId);

  const map = {};
  rows.forEach((r) => { map[r.activityId] = r.n; });
  return map;
}

// ============ STATISTIQUES D'UNE ACTIVITÉ PARTAGÉE (section Membres) ============
// Même esprit que lib/stats.js, mais l'axe de comparaison change : au lieu de
// comparer MES activités entre elles (Statistiques), on compare les MEMBRES
// d'UNE SEULE activité entre eux (Communauté) — on est déjà "dans" l'activité,
// il n'y a plus d'activités à comparer, seulement des personnes. Les trois
// fonctions ci-dessous sont les pendants exacts de breakdownForUser /
// dailyBreakdownForUser / timesheetForUser de lib/stats.js, avec le même
// fonctionnement (mêmes périodes, même grille de feuille de temps 15 min),
// simplement réindexées par membre au lieu d'être réindexées par activité.
// Comme sharedActivitiesForUser ci-dessus, seuls les membres ACTUELS de
// l'activité sont pris en compte (jointure sur activity_members).

function activityBreakdownForUser(activityId, period, refDate) {
  const { start, end, label } = periodRange(period, refDate);

  const rows = db.prepare(`
    SELECT u.id AS userId, u.name AS name, am.color AS color,
           COALESCE(SUM(t.durationSeconds), 0) AS seconds
    FROM activity_members am
    JOIN users u ON u.id = am.userId
    LEFT JOIN time_entries t ON t.userId = am.userId AND t.activityId = am.activityId AND t.isoDate BETWEEN ? AND ?
    WHERE am.activityId = ?
    GROUP BY u.id
    ORDER BY seconds DESC, u.name COLLATE NOCASE ASC
  `).all(start, end, activityId);

  const totalSeconds = rows.reduce((sum, r) => sum + r.seconds, 0);
  return {
    period, label, start, end, totalSeconds,
    members: rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      color: r.color,
      seconds: r.seconds,
      percent: totalSeconds > 0 ? Math.round((r.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

// ⚠️ 3 septembre 2026 (Activité — général) — REMPLACE activityDailyBreakdownForUser.
// Demande d'Emilien : « le graphique ne respecte pas les mêmes principes que
// dans le volet statistique. Les options doivent être jour, semaine, mois, non
// pas année, et il doit afficher toujours le total des activités enregistrées,
// mais [...] par jour, par semaine ou par mois. »
//
// C'est mot pour mot ce que chartBreakdownForUser (server/lib/stats.js) fait
// depuis le 1er septembre pour l'onglet Statistiques. Cette copie s'aligne donc
// dessus, en application de la règle posée par Emilien le 3 septembre : le code
// des copies parallèles reste dupliqué, mais leur COMPORTEMENT ne diverge pas.
//
// Ce qui change concrètement : la PLAGE n'est plus une période glissante
// (periodRange) mais toute l'histoire de l'activité (activityTotalRange) ; et
// c'est la GRANULARITÉ ('day' | 'week' | 'month') qui décide du regroupement.
// L'axe de comparaison, lui, reste propre à cette page : une série par MEMBRE
// de l'activité, là où Statistiques trace une série par activité.
function activityTotalRange(activityId, refDate) {
  const ref = refDate ? new Date(refDate) : new Date();
  const todayIso = isoDateOf(ref);
  const earliest = db.prepare('SELECT MIN(isoDate) AS d FROM time_entries WHERE activityId = ?').get(activityId);
  return { start: (earliest && earliest.d) || todayIso, end: todayIso, label: 'Depuis le début' };
}

function activityChartBreakdownForUser(activityId, granularity, refDate) {
  const { start, end } = activityTotalRange(activityId, refDate);

  const rows = db.prepare(`
    SELECT t.isoDate AS isoDate, t.dayOfWeek AS dayOfWeek, u.id AS userId,
           u.name AS name, am.color AS color, SUM(t.durationSeconds) AS seconds
    FROM time_entries t
    JOIN activity_members am ON am.activityId = t.activityId AND am.userId = t.userId
    JOIN users u ON u.id = am.userId
    WHERE t.activityId = ? AND t.isoDate BETWEEN ? AND ?
    GROUP BY t.isoDate, u.id
    ORDER BY t.isoDate ASC, seconds DESC
  `).all(activityId, start, end);

  if (granularity !== 'week' && granularity !== 'month') {
    // Aucune entrée n'a jamais été enregistrée sur cette activité : tableau
    // vide, pour que l'indice "rien d'enregistré" s'affiche — surtout pas une
    // ligne à plat d'aujourd'hui à aujourd'hui. Même précaution que dans
    // chartBreakdownForUser.
    if (rows.length === 0) return [];
    const byDay = {};
    rows.forEach((r) => {
      if (!byDay[r.isoDate]) byDay[r.isoDate] = { isoDate: r.isoDate, dayOfWeek: r.dayOfWeek, totalSeconds: 0, members: [] };
      byDay[r.isoDate].totalSeconds += r.seconds;
      byDay[r.isoDate].members.push({ userId: r.userId, name: r.name, color: r.color, seconds: r.seconds });
    });
    // Tous les jours civils de la plage, y compris ceux sans aucune entrée
    // (point à zéro) — alignement sur le correctif du 2 septembre côté
    // Statistiques, sans quoi la courbe saute des jours et se lit mal.
    const out = [];
    const cursor = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    while (cursor <= endDate) {
      const iso = isoDateOf(cursor);
      out.push(byDay[iso] || { isoDate: iso, dayOfWeek: dayNameOf(cursor), totalSeconds: 0, members: [] });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out.sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
  }

  const byBucket = {};
  const order = [];
  rows.forEach((r) => {
    const dayDate = new Date(r.isoDate + 'T00:00:00');
    const bucketStart = granularity === 'week' ? mondayOf(dayDate) : new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
    const key = isoDateOf(bucketStart);
    if (!byBucket[key]) { byBucket[key] = { isoDate: key, totalSeconds: 0, membersById: {} }; order.push(key); }
    const bucket = byBucket[key];
    bucket.totalSeconds += r.seconds;
    if (!bucket.membersById[r.userId]) bucket.membersById[r.userId] = { userId: r.userId, name: r.name, color: r.color, seconds: 0 };
    bucket.membersById[r.userId].seconds += r.seconds;
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
    return { isoDate: key, granularity, shortLabel, fullLabel, totalSeconds: b.totalSeconds, members: Object.values(b.membersById) };
  }).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));
}

const ACTIVITY_TS_SLOTS_PER_DAY = 96; // 24h / 15 min
const ACTIVITY_TS_SLOT_MINUTES = 15;

function activityTimesheetForUser(activityId, weekOffset) {
  const offset = Math.max(0, Math.floor(Number(weekOffset)) || 0);

  const ref = new Date();
  ref.setDate(ref.getDate() - offset * 7);
  const monday = mondayOf(ref);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  const start = isoDateOf(days[0]);
  const end = isoDateOf(days[6]);

  const rows = db.prepare(`
    SELECT t.startTime, t.endTime, u.id AS userId, u.name AS name, am.color AS color
    FROM time_entries t
    JOIN activity_members am ON am.activityId = t.activityId AND am.userId = t.userId
    JOIN users u ON u.id = am.userId
    WHERE t.activityId = ? AND t.isoDate BETWEEN ? AND ?
  `).all(activityId, start, end);

  // Même logique de départage par recouvrement que timesheetForUser dans
  // lib/stats.js : overlap[dayIndex][slotIndex] accumule les secondes de
  // chaque membre dans ce quart d'heure, le plus grand nombre de secondes
  // gagne l'affichage de la case en cas de chevauchement.
  const overlap = days.map(() => {
    const slots = [];
    for (let s = 0; s < ACTIVITY_TS_SLOTS_PER_DAY; s++) slots.push({});
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
      if (clipEnd <= clipStart) return;

      const firstSlot = Math.floor((clipStart - dayStart) / 60000 / ACTIVITY_TS_SLOT_MINUTES);
      const lastSlot = Math.min(ACTIVITY_TS_SLOTS_PER_DAY - 1, Math.ceil((clipEnd - dayStart) / 60000 / ACTIVITY_TS_SLOT_MINUTES) - 1);

      for (let s = firstSlot; s <= lastSlot; s++) {
        const slotStart = new Date(dayStart.getTime() + s * ACTIVITY_TS_SLOT_MINUTES * 60000);
        const slotEnd = new Date(slotStart.getTime() + ACTIVITY_TS_SLOT_MINUTES * 60000);
        const ovStart = clipStart > slotStart ? clipStart : slotStart;
        const ovEnd = clipEnd < slotEnd ? clipEnd : slotEnd;
        const seconds = (ovEnd - ovStart) / 1000;
        if (seconds <= 0) continue;

        const bucket = overlap[dayIndex][s];
        if (!bucket[r.userId]) bucket[r.userId] = { seconds: 0, name: r.name, color: r.color, userId: r.userId };
        bucket[r.userId].seconds += seconds;
      }
    });
  });

  const grid = days.map((d, dayIndex) => {
    const slots = overlap[dayIndex].map((bucket) => {
      const candidates = Object.keys(bucket).map((k) => bucket[k]);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.seconds - a.seconds);
      const best = candidates[0];
      return { userId: best.userId, name: best.name, color: best.color };
    });
    return { isoDate: isoDateOf(d), dayOfWeek: dayNameOf(d), slots };
  });

  const earliest = db.prepare(`
    SELECT MIN(t.isoDate) AS d
    FROM time_entries t
    JOIN activity_members am ON am.activityId = t.activityId AND am.userId = t.userId
    WHERE t.activityId = ?
  `).get(activityId);
  const hasMoreBefore = !!(earliest && earliest.d && earliest.d < start);

  const label = `Semaine du ${pad2(days[0].getDate())}/${pad2(days[0].getMonth() + 1)} au ${pad2(days[6].getDate())}/${pad2(days[6].getMonth() + 1)}`;

  return { weekOffset: offset, isCurrentWeek: offset === 0, start, end, label, hasMoreBefore, days: grid };
}

module.exports = {
  sharedActivitiesForUser, sharedFeedForUser, followingFeedForUser, activityMembersForUser,
  activityMessagesForUser, postActivityMessage, markActivityMessagesRead, unreadMessageCountsForUser,
  activityBreakdownForUser, activityChartBreakdownForUser, activityTotalRange, activityTimesheetForUser,
};