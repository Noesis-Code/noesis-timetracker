// Rappels avant l'échéance d'un sous-projet — 4 septembre 2026.
//
// Propriété : discussion "Calendrier des clôtures". Cadrage d'Emilien du même
// jour, deux questions : **notification Noèsis** (et non une alarme dans le
// flux ICS), et **deux rappels — 3 jours avant, puis la veille**.
//
// Pourquoi PAS une alarme dans le flux .ics, alors que ça n'aurait coûté que
// quelques lignes : une VALARM dans un calendrier en ABONNEMENT n'est honorée
// que par certains clients. Apple Calendar la respecte (sauf si l'abonnement a
// été ajouté avec « Supprimer les alertes »), mais Google Agenda ignore les
// alarmes des calendriers auxquels on s'abonne. On aurait donc livré un rappel
// qui marche sur un téléphone et pas sur l'autre, sans rien pour le signaler.
// Ici, c'est nous qui décidons quand la notification part et ce qu'elle dit.
//
// ⚠️ NE FONCTIONNE QUE SI LE WEB PUSH EST CONFIGURÉ (clés VAPID chez
// l'hébergeur, voir noesis-timetracker-chantiers-en-cours.md). Sans ça, le
// balayage ne fait RIEN et surtout n'enregistre RIEN : le jour où Emilien
// finira la configuration, les rappels des échéances encore à venir partiront
// normalement, au lieu d'avoir été marqués « envoyés » alors que personne n'a
// jamais rien reçu.

const db = require('../db');
const push = require('./push');
const { subProjectsForActivity } = require('./subprojects');

// Les deux seuils demandés par Emilien, du plus lointain au plus proche.
const THRESHOLDS = [3, 1];

// Balayage toutes les 30 minutes. Un rappel se joue à la journée, pas à la
// minute : plus fréquent ne servirait à rien, moins fréquent retarderait le
// premier envoi après un redéploiement.
const SWEEP_MS = 30 * 60 * 1000;
const FIRST_SWEEP_MS = 20 * 1000;

// ---------------------------------------------------------------------------
// Dates
//
// Tout se compare en 'YYYY-MM-DD' local. Le serveur tourne en America/Toronto
// (server/index.js), donc « aujourd'hui » est bien la journée d'Emilien et non
// celle d'UTC — sans quoi, passé 20 h, on basculerait un jour trop tôt.
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Nombre de jours entiers entre deux jours 'YYYY-MM-DD'.
// ⚠️ Arithmétique en UTC (Date.UTC), jamais en heure locale : la nuit d'un
// changement d'heure ne fait que 23 heures, et une soustraction locale y
// renverrait 0.96 jour — arrondi à 1 un jour, à 0 le lendemain. Même
// précaution que `addDay()` dans server/lib/calendarfeed.js.
function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Textes
//
// Construits ici, côté serveur, dans la langue du DESTINATAIRE — même principe
// que server/lib/push.js : un service worker n'a accès ni à public/i18n.js ni
// à la langue du profil.
function langOf(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  return row && row.lang === 'fr' ? 'fr' : 'en';
}

// ⚠️ Le texte décrit le nombre de jours QUI RESTENT, pas le seuil qui a
// déclenché l'envoi. Les deux se confondent la plupart du temps, mais pas
// toujours : si le serveur est resté éteint, le rappel « 3 jours » peut partir
// alors qu'il n'en reste que 2 — et surtout, une échéance du jour même
// (daysLeft = 0) passe par le seuil 1 et aurait annoncé « demain » alors
// qu'elle se clôture aujourd'hui. Défaut trouvé en écrivant la suite de tests,
// pas en relisant le code.
function textFor(lang, subProjectName, daysLeft) {
  if (lang === 'fr') {
    if (daysLeft <= 0) return '« ' + subProjectName + ' » se clôture aujourd\'hui.';
    if (daysLeft === 1) return '« ' + subProjectName + ' » se clôture demain.';
    return '« ' + subProjectName + ' » se clôture dans ' + daysLeft + ' jours.';
  }
  if (daysLeft <= 0) return '“' + subProjectName + '” closes today.';
  if (daysLeft === 1) return '“' + subProjectName + '” closes tomorrow.';
  return '“' + subProjectName + '” closes in ' + daysLeft + ' days.';
}

// ---------------------------------------------------------------------------
// Mémoire des envois
//
// Clé : (sous-projet, personne, DATE DE CLÔTURE, seuil).
//   · la date de clôture en fait partie exprès : déplacer l'échéance réarme
//     les rappels, ce qui est le comportement attendu — une nouvelle date est
//     une nouvelle échéance ;
//   · la personne en fait partie exprès : quelqu'un qui rejoint l'activité
//     après coup reçoit quand même son rappel.
// L'index unique de server/db.js rend le doublon impossible même si deux
// balayages se croisaient.
function alreadySent(subProjectId, userId, closesAt, daysBefore) {
  return !!db.prepare(`
    SELECT 1 FROM sub_project_due_reminders
    WHERE subProjectId = ? AND userId = ? AND closesAt = ? AND daysBefore = ?
  `).get(subProjectId, userId, closesAt, daysBefore);
}

function markSent(subProjectId, userId, closesAt, daysBefore) {
  try {
    db.prepare(`
      INSERT INTO sub_project_due_reminders (subProjectId, userId, closesAt, daysBefore, sentAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(subProjectId, userId, closesAt, daysBefore, new Date().toISOString());
  } catch (err) {
    // Violation d'unicité = un autre balayage vient de le faire. Sans
    // conséquence : c'est exactement ce que l'index est censé empêcher.
  }
}

// ---------------------------------------------------------------------------
// Le balayage

function membersOf(activityId) {
  return db.prepare('SELECT userId FROM activity_members WHERE activityId = ?')
    .all(activityId).map((r) => r.userId);
}

// Renvoie { sent, skipped } — les compteurs servent aux tests et au journal de
// démarrage, rien d'autre n'en dépend.
function runDueReminders(now) {
  // Push non configuré : on ne fait RIEN, et surtout on n'enregistre rien.
  // Voir l'avertissement en tête de fichier.
  if (!push.pushEnabled()) return { sent: 0, skipped: 0, disabled: true };

  const today = todayLocal(now);
  let sent = 0, skipped = 0;

  // ⚠️ CONTRAT AVEC « SOUS-PROJETS » : les clôtures sont lues par
  // subProjectsForActivity(), jamais en interrogeant sub_projects directement.
  // Et `includeClosed` vaut FAUX à dessein : la règle OPEN_ONLY est exactement
  // celle qu'il faut ici — on ne rappelle jamais une échéance déjà passée,
  // c'est-à-dire un sous-projet qui a déjà disparu de l'écran.
  const activities = db.prepare(`
    SELECT DISTINCT a.id, a.name FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE a.active = 1
  `).all();

  for (const activity of activities) {
    let subProjects = [];
    try {
      subProjects = subProjectsForActivity(activity.id, false);
    } catch (err) {
      // Une activité illisible ne doit pas arrêter le balayage des autres.
      console.warn('[rappels] activité ' + activity.id + ' ignorée :', err.message);
      continue;
    }

    const dated = subProjects.filter((sp) => !!sp.closesAt);
    if (!dated.length) continue;

    const members = membersOf(activity.id);
    if (!members.length) continue;

    for (const sp of dated) {
      const left = daysBetween(today, sp.closesAt);
      if (left === null || left < 0) continue;

      for (const userId of members) {
        // Seuils encore d'actualité pour cette personne, du plus lointain au
        // plus proche. `left <= threshold` et non `===` : si le serveur est
        // resté éteint un jour, le rappel part quand même, avec un jour de
        // retard, plutôt que d'être perdu.
        const pending = THRESHOLDS.filter((th) => left <= th && !alreadySent(sp.id, userId, sp.closesAt, th));
        if (!pending.length) continue;

        // ⚠️ Un sous-projet créé la veille de son échéance déclencherait les
        // DEUX rappels dans le même balayage : deux notifications côte à côte
        // qui disent la même chose. On n'envoie donc que le plus urgent, et on
        // note les autres comme traités pour qu'ils ne repartent pas plus tard.
        const toSend = Math.min.apply(null, pending);

        const lang = langOf(userId);
        push.sendToUsers([userId], {
          title: activity.name,
          body: textFor(lang, sp.name, left),
          // Un `tag` par (sous-projet, seuil) : deux rappels différents
          // s'empilent, mais un même rappel ré-émis remplace le précédent au
          // lieu de s'ajouter.
          tag: 'subproject-due-' + sp.id + '-' + toSend,
          url: '/?notif=subproject&activityId=' + activity.id + '&subProjectId=' + sp.id,
        });
        sent += 1;

        pending.forEach((th) => {
          markSent(sp.id, userId, sp.closesAt, th);
          if (th !== toSend) skipped += 1;
        });
      }
    }
  }

  return { sent, skipped, disabled: false };
}

// ---------------------------------------------------------------------------
// Le minuteur
//
// `unref()` : ce minuteur ne doit jamais être la seule raison qui garde le
// processus en vie — sans ça, un script qui importe ce module ne se termine
// plus jamais.
let timer = null;

function startDueReminders() {
  if (process.env.NOESIS_DUE_REMINDERS === '0') {
    console.log('Rappels d\'échéance : désactivés (NOESIS_DUE_REMINDERS=0)');
    return;
  }
  if (timer) return;

  const tick = () => {
    try {
      const res = runDueReminders();
      if (res.sent) console.log('Rappels d\'échéance : ' + res.sent + ' envoyé(s)');
    } catch (err) {
      // Un rappel ne doit jamais faire tomber le serveur — même principe que
      // « une notification ne fait jamais échouer l'action qui l'a déclenchée »
      // (Communauté, 1er septembre 2026).
      console.warn('[rappels] balayage échoué :', err.message);
    }
  };

  setTimeout(tick, FIRST_SWEEP_MS).unref();
  timer = setInterval(tick, SWEEP_MS);
  timer.unref();
}

module.exports = { runDueReminders, startDueReminders, todayLocal, daysBetween, textFor, THRESHOLDS };
