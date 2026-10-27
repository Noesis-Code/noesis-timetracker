// Loi 25 (Time Tracker Basic) : garde des tables personnelles + suppression de profil complète. Usage : node test/privacy-tables-test.js
//  1. Toute table de la base migrée est classée : PERSONAL (avec effacement et export décidés) ou NON_PERSONAL (sans colonne qui désigne un compte).
//     Une nouvelle table avec un userId/ownerId/... non classée fait ÉCHOUER ce test (modèle : trade-tracker/test/privacy-tables-test.js).
//  2. L'export (server/lib/dataexport.js) lit chaque table marquée « exportée » ; les exclusions ont une raison écrite ici.
//  3. Base seed complète + une ligne par table personnelle pour deux comptes : après deleteAccountData(A), plus aucune cellule
//     ne contient l'id de A (sauf journal conservé), les lignes de B sont intactes, le fichier de discussion de A est effacé.
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-priv-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
const libDir = path.join(__dirname, '..', 'server', 'lib');
for (const f of fs.readdirSync(libDir)) if (f.endsWith('.js')) { try { require(path.join(libDir, f)); } catch (e) { /* module optionnel */ } }
require('../server/lib/seed-staging').seedStagingData(db);
const { deleteAccountData, PERSONAL_NO_FK } = require('../server/lib/accountdeletion');
const { buildUserExport } = require('../server/lib/dataexport');
const exportSrc = fs.readFileSync(path.join(libDir, 'dataexport.js'), 'utf8');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

// ---- Classement ----
// erase : cascade (FK ON DELETE CASCADE) | explicit (DELETE dans accountdeletion.js) | setnull (lien retiré, contenu d'autrui conservé)
//         | transfer (propriété transmise au plus ancien membre) | kept (conservé exprès) | via (suit sa ligne parente)
// exp   : clé de l'export JSON | 'NON: raison' (exclue, raison écrite)
const P = {
  users: { cols: [], erase: 'root', exp: 'user' },
  activities: { cols: ['ownerId'], erase: 'transfer', exp: 'activities' },
  activity_members: { cols: ['userId'], erase: 'cascade', exp: 'activities' },
  activity_forms: { cols: ['updatedBy'], erase: 'setnull', exp: 'NON: formulaire partagé de l\'activité (le lien auteur seul est retiré)' },
  activity_invites: { cols: ['fromUserId', 'toUserId'], erase: 'cascade', exp: 'activityInvites' },
  activity_message_reads: { cols: ['userId'], erase: 'cascade', exp: 'NON: marqueur de lecture technique' },
  activity_messages: { cols: ['userId'], erase: 'cascade', exp: 'activityMessages' },
  activity_message_files: { cols: [], erase: 'via', exp: 'NON: limite connue, fichiers de discussion sur disque (effacés avec le compte, non joints à l\'export)' },
  activity_strategies: { cols: ['updatedBy'], erase: 'explicit', exp: 'NON: stratégie partagée de l\'activité (le lien auteur seul est retiré)' },
  activity_subscriptions: { cols: ['userId'], erase: 'cascade', exp: 'subscriptions' },
  password_resets: { cols: ['userId'], erase: 'cascade', exp: 'NON: empreinte du jeton de réinitialisation (1 h), jamais le jeton lui-même' },
  user_passkeys: { cols: ['userId'], erase: 'cascade', exp: 'NON: clés d\'accès (Face ID) : identifiant public et clé publique, aucun secret' },
  ai_tokens: { cols: ['userId'], erase: 'cascade', exp: 'NON: jetons de connexion IA, secret (empreinte)' },
  ai_token_notifs: { cols: [], erase: 'via', exp: 'NON: journal technique d\'un jeton' },
  ai_write_log: { cols: ['userId'], erase: 'cascade', exp: 'NON: journal technique des écritures de l\'IA du compte (copies de tâches), effacé avec le compte' },
  ai_usage_log: { cols: ['userId'], erase: 'explicit', exp: 'NON: compteurs de coût IA, aucun contenu' },
  announcement_seen: { cols: ['userId'], erase: 'cascade', exp: 'NON: marqueur de lecture technique' },
  blocks: { cols: ['blockerId', 'blockedId'], erase: 'cascade', exp: 'blockedUsers' },
  calendar_export_excluded: { cols: ['userId'], erase: 'cascade', exp: 'NON: réglage d\'affichage du calendrier' },
  calendar_feed_tokens: { cols: ['userId'], erase: 'cascade', exp: 'calendarFeed' },
  change_proposals: { cols: ['userId'], erase: 'explicit', exp: 'NON: propositions IA transitoires' },
  client_profile_forms: { cols: ['userId'], erase: 'cascade', exp: 'clientProfileForm' },
  daily_suggestion_settings: { cols: ['userId'], erase: 'cascade', exp: 'dailySuggestionSettings' },
  daily_suggestions: { cols: ['userId'], erase: 'cascade', exp: 'NON: suggestions IA recalculées chaque jour' },
  follows: { cols: ['followerId', 'followeeId'], erase: 'cascade', exp: 'follows' },
  goal_capacity_overrides: { cols: ['userId'], erase: 'cascade', exp: 'goalCapacityOverrides' },
  goal_classify_examples: { cols: ['userId'], erase: 'explicit', exp: 'NON: apprentissage technique du classement IA (remise à zéro par l\'API)' },
  goal_overload_dismissals: { cols: ['userId'], erase: 'explicit', exp: 'NON: alerte de surcharge écartée' },
  goal_period_assignees: { cols: ['userId'], erase: 'cascade', exp: 'goalPeriods' },
  goal_period_due_reminders: { cols: ['userId'], erase: 'cascade', exp: 'NON: journal d\'envoi de rappels' },
  goal_recalc_proposals: { cols: ['userId'], erase: 'explicit', exp: 'NON: propositions de recalcul transitoires' },
  goal_time_caps: { cols: ['userId'], erase: 'explicit', exp: 'goalTimeCaps' },
  goal_weekly: { cols: ['assignedUserId'], erase: 'setnull', exp: 'goalWeekly' },
  idempotency_keys: { cols: ['userId'], erase: 'explicit', exp: 'NON: clés techniques de capture hors ligne' },
  inactive_account_log: { cols: ['userId'], erase: 'kept', exp: 'NON: journal d\'avis/suppression, id seul sans nom ni courriel, conservé exprès (preuve de suppression)' },
  member_time_overrides: { cols: ['memberId'], erase: 'explicit', exp: 'NON: estimation de temps posée par l\'activité' },
  message_reports: { cols: ['reporterId'], erase: 'explicit', exp: 'NON: signalement de modération' },
  note_attachments: { cols: ['userId'], erase: 'cascade', exp: 'noteAttachments' },
  parental_consent_requests: { cols: ['userId'], erase: 'cascade', exp: 'NON: coordonnées du tuteur (tiers)' },
  poll_votes: { cols: ['userId'], erase: 'cascade', exp: 'pollVotesCast' },
  polls: { cols: ['authorId'], erase: 'transfer', exp: 'pollsCreated' },
  profile_posts: { cols: ['userId'], erase: 'cascade', exp: 'profilePosts' },
  profile_post_attachments: { cols: [], erase: 'via', exp: 'profilePosts' },
  profile_projects: { cols: ['userId'], erase: 'cascade', exp: 'profileProjects' },
  push_subscriptions: { cols: ['userId'], erase: 'cascade', exp: 'NON: secrets techniques d\'appareil (voir en-tête de dataexport.js)' },
  running_timers: { cols: ['userId'], erase: 'cascade', exp: 'runningTimer' },
  sub_project_due_reminders: { cols: ['userId'], erase: 'cascade', exp: 'NON: journal d\'envoi de rappels' },
  sub_project_items: { cols: ['plannedUserId', 'doneBy'], erase: 'setnull', exp: 'tasks' },
  sub_project_messages: { cols: ['userId'], erase: 'setnull', exp: 'subProjectMessages' },
  sub_project_sections: { cols: ['createdBy'], erase: 'transfer', exp: 'subProjectSectionsCreated' },
  sub_projects: { cols: ['createdBy'], erase: 'transfer', exp: 'subProjectsCreated' },
  time_entries: { cols: ['userId'], erase: 'cascade', exp: 'timeEntries' },
};
for (const t of ['drive_ai_usage', 'drive_attempts', 'drive_batches', 'drive_connections', 'drive_folders', 'drive_infra_fails', 'drive_progress',
  'drive_seen_chunks', 'drive_seen_files', 'drive_seen_tasks', 'drive_seg_done', 'drive_skipped', 'drive_sync']) P[t] = { cols: ['userId'], erase: 'explicit', exp: 'NON: état technique de synchronisation Drive (jeton chiffré compris)' };
for (const t of ['external_calendar_settings', 'external_calendar_subscriptions', 'external_calendar_urls']) P[t] = { cols: ['userId'], erase: 'explicit', exp: 'NON: adresses de calendrier secrètes et réglages d\'import' };
// Module « Horaire » : données du personnel saisies par le gestionnaire, exportées sous la clé « horaire ».
for (const t of ['horaire_employees', 'horaire_positions', 'horaire_qualifications', 'horaire_availabilities', 'horaire_events', 'horaire_needs',
  'horaire_rotation', 'horaire_schedules', 'horaire_assignments', 'horaire_settings', 'horaire_covers', 'horaire_timeoff', 'horaire_category_rules', 'horaire_employee_rules']) P[t] = { cols: ['userId'], erase: 'cascade', exp: 'horaire' };
// Tables sans aucune colonne qui désigne un compte (contenu d'activité, journaux globaux, jetons de webhooks...).
const NON_PERSONAL = new Set(['activities_rebuild', 'activity_billing_cycles', 'activity_goal_categories', 'activity_goal_plans', 'activity_offre1',
  'announcements', 'generation_quality_log', 'goal_cross_sector_suggestions', 'goal_periods', 'goal_year_goals', 'goal_years', 'inactive_account_runs',
  'poll_options', 'plan_activation_attempts', 'stripe_webhook_events', 'sub_project_item_queue', 'ai_alerts_sent', 'passkey_challenges', 'horaire_migrations']);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const info = (t) => db.prepare(`PRAGMA table_info(${t})`).all();
const fkUsers = (t) => db.prepare(`PRAGMA foreign_key_list(${t})`).all().filter((f) => f.table === 'users').map((f) => f.from);
const USERISH = /^(userId|createdBy|doneBy|updatedBy|plannedUserId|assignedUserId|authorId|ownerId|memberId|reporterId|blockerId|blockedId|followerId|followeeId|fromUserId|toUserId)$/;
const detected = (t) => [...new Set([...fkUsers(t), ...info(t).map((c) => c.name).filter((n) => USERISH.test(n))])].sort();

for (const t of tables) {
  const inP = !!P[t], inN = NON_PERSONAL.has(t);
  assert(inP !== inN, `table classée une fois et une seule : ${t}${inP === inN ? ' (ajouter à PERSONAL ou NON_PERSONAL de test/privacy-tables-test.js)' : ''}`);
  if (inP && t !== 'users') assert(JSON.stringify(detected(t)) === JSON.stringify(P[t].cols.slice().sort()),
    `colonnes-compte de ${t} = ${JSON.stringify(P[t].cols)} (trouvé ${JSON.stringify(detected(t))})`);
  if (inN) assert(detected(t).length === 0, `NON_PERSONAL.${t} ne désigne aucun compte (trouvé ${JSON.stringify(detected(t))})`);
}
for (const t of [...Object.keys(P), ...NON_PERSONAL]) if (!tables.includes(t) && !/_rebuild$/.test(t)) assert(false, `table classée mais inexistante : ${t}`);

// Effacement : chaque table « cascade » a bien ON DELETE CASCADE vers users ; chaque « explicit » est dans accountdeletion.js ; « setnull » a ON DELETE SET NULL.
const fkAction = (t, col) => (db.prepare(`PRAGMA foreign_key_list(${t})`).all().find((f) => f.table === 'users' && f.from === col) || {}).on_delete;
for (const [t, d] of Object.entries(P)) {
  if (!tables.includes(t)) continue;
  if (d.erase === 'cascade') d.cols.forEach((c) => assert(fkAction(t, c) === 'CASCADE', `${t}.${c} : ON DELETE CASCADE vers users`));
  if (d.erase === 'setnull') d.cols.forEach((c) => assert(fkAction(t, c) === 'SET NULL', `${t}.${c} : ON DELETE SET NULL vers users`));
  if (d.erase === 'explicit') assert(PERSONAL_NO_FK.some(([tt]) => tt === t) || fs.readFileSync(path.join(libDir, 'accountdeletion.js'), 'utf8').includes(t),
    `${t} : effacement explicite présent dans accountdeletion.js`);
}
for (const [t] of PERSONAL_NO_FK) assert(P[t] && P[t].erase === 'explicit', `PERSONAL_NO_FK.${t} classée « explicit »`);

// ---- Export : chaque table marquée exportée est lue par dataexport.js, chaque exclusion a sa raison ----
const seedUsers = db.prepare('SELECT id, name FROM users ORDER BY createdAt').all();
const A = seedUsers.find((u) => u.name === 'Emilien') || seedUsers[0];
const B = seedUsers.find((u) => u.id !== A.id);
const ex = buildUserExport(A.id);
for (const [t, d] of Object.entries(P)) {
  if (d.exp.startsWith('NON:')) { assert(d.exp.length > 12, `${t} : exclusion de l'export justifiée`); continue; }
  assert(t === 'users' ? /FROM users/.test(exportSrc) : new RegExp('(FROM|JOIN)\\s+' + t + '\\b').test(exportSrc), `${t} : lue par dataexport.js`);
  assert(d.exp in ex, `${t} : clé « ${d.exp} » présente dans l'export`);
}

// ---- Lisibilité : dates ISO avec fuseau (Z) ou date seule, aucun hachage ni secret ----
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;
const badDates = [];
(function walk(v, p) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']'));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p + '.' + k);
  else if (typeof v === 'string' && /(At|Time|Date)$/.test(p.split('.').pop().replace(/\[\d+\]/g, '')) && !/^(isoDate|startDate|endDate|closesAt)$/.test(p.split('.').pop()) && !ISO.test(v)) badDates.push(p + '=' + v);
})(ex, 'export');
assert(badDates.length === 0, 'export : toutes les dates sont en ISO 8601 avec fuseau (Z) ' + badDates.slice(0, 3).join(' | '));
assert(ex.generatedAt && ISO.test(ex.generatedAt), 'export : generatedAt en ISO');
assert(!/"pin"|tokenHash|encryptedToken|stripeCustomerId|stripeSubscriptionId|"endpoint"|"p256dh"/.test(JSON.stringify(ex)), 'export : aucun secret ni identifiant de paiement/appareil');

// ---- Suppression sur une base seed complète ----
db.exec('PRAGMA foreign_keys = OFF');
let n = 0;
const val = (c, id, tag) => {
  if (/Id$|^userId$|By$/.test(c.name) && c.name.match(USERISH)) return id;
  if (c.type === 'INTEGER' || c.type === 'REAL') return c.name === 'ack' || /^(done|active)$/.test(c.name) ? 0 : 1;
  if (/At$|Time$|^day$|Date$/i.test(c.name)) return '2026-10-01T10:00:00.000Z';
  return 'v' + (++n) + tag;
};
const insertFor = (t, cols, id, tag) => {
  const cs = info(t);
  const use = cs.filter((c) => c.pk || c.notnull || cols.includes(c.name));
  const names = cs.filter((c) => !(c.pk && c.type === 'INTEGER' && cs.filter((x) => x.pk).length === 1)).filter((c) => c.notnull || cols.includes(c.name) || c.pk).map((c) => c.name);
  const row = names.map((nm) => { const c = cs.find((x) => x.name === nm); return cols.includes(nm) ? id : val(c, id, tag); });
  db.prepare(`INSERT OR IGNORE INTO ${t} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...row);
};
const OVERRIDE = { inactive_account_log: { action: 'avis' } };
for (const [t, d] of Object.entries(P)) {
  if (!tables.includes(t) || !d.cols.length) continue;
  for (const [id, tag] of [[A.id, 'a'], [B.id, 'b']]) {
    // chaque colonne-compte vaut le compte ; sauf paires (de, vers) : l'autre côté vaut B pour A, A pour B (liens entre les deux comptes)
    try { insertFor(t, d.cols, id, tag); } catch (e) { assert(false, `semis ${t} : ${e.message}`); }
  }
}
// pièce jointe de discussion de A avec un vrai fichier sur disque
const filesDir = path.join(process.env.NOESIS_DATA_DIR, 'discussion-files');
fs.mkdirSync(filesDir, { recursive: true });
fs.writeFileSync(path.join(filesDir, 'fichier-a.png'), 'x');
const msgA = db.prepare('SELECT id FROM activity_messages WHERE userId = ? LIMIT 1').get(A.id);
if (msgA) db.prepare("INSERT INTO activity_message_files (messageId, fileName, mimeType, sizeBytes, storedName) VALUES (?, 'a.png', 'image/png', 1, 'fichier-a.png')").run(msgA.id);
else assert(false, 'semis : aucun message de A pour la pièce jointe');
db.exec('PRAGMA foreign_keys = ON');

// Plus aucun lien avec l'id de A : on mesure avant/après sur TOUTES les tables.
const cellsWith = (id) => {
  const out = {};
  for (const t of tables) {
    const cols = info(t).map((c) => c.name);
    const where = cols.map((c) => `CAST("${c}" AS TEXT) = ?`).join(' OR ');
    const cnt = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get(...cols.map(() => id)).n;
    if (cnt) out[t] = cnt;
  }
  return out;
};
const rowsOfBOnly = () => {
  const out = {};
  for (const t of tables) {
    const cols = info(t).map((c) => c.name);
    const hasB = cols.map((c) => `CAST("${c}" AS TEXT) = ?`).join(' OR ');
    const rows = db.prepare(`SELECT * FROM ${t} WHERE (${hasB})`).all(...cols.map(() => B.id))
      .filter((r) => !Object.values(r).some((v) => v === A.id));
    out[t] = rows.map((r) => JSON.stringify(r)).sort();
  }
  return out;
};
const beforeA = cellsWith(A.id);
assert(Object.keys(beforeA).length >= Object.keys(P).filter((t) => tables.includes(t) && P[t].cols.length).length - 6, `base de test : A présent dans ${Object.keys(beforeA).length} tables`);
const bBefore = rowsOfBOnly();
const bTime = db.prepare('SELECT COALESCE(SUM(durationSeconds),0) AS s, COUNT(*) AS n FROM time_entries WHERE userId = ?').get(B.id);
const sharedBefore = require('../server/lib/community').sharedActivitiesForUser(B.id, 'year', null, 'America/Toronto');

deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(A.id));

const afterA = cellsWith(A.id);
const left = Object.keys(afterA).filter((t) => P[t] ? P[t].erase !== 'kept' : true);
assert(left.length === 0, 'après suppression, aucune table ne contient l\'id du profil supprimé' + (left.length ? ' : ' + left.map((t) => t + '(' + afterA[t] + ')').join(', ') : ''));
assert(afterA.inactive_account_log > 0 || !beforeA.inactive_account_log, 'journal d\'inactivité conservé exprès (id seul)');
assert(!fs.existsSync(path.join(filesDir, 'fichier-a.png')), 'fichier de discussion de A effacé du disque');
const bAfter = rowsOfBOnly();
let lost = [];
for (const t of tables) for (const r of bBefore[t]) if (!bAfter[t].includes(r)) lost.push(t);
assert(lost.length === 0, 'les lignes de B (sans lien avec A) sont intactes' + (lost.length ? ' : ' + [...new Set(lost)].join(', ') : ''));
const bTimeAfter = db.prepare('SELECT COALESCE(SUM(durationSeconds),0) AS s, COUNT(*) AS n FROM time_entries WHERE userId = ?').get(B.id);
assert(bTimeAfter.s === bTime.s && bTimeAfter.n === bTime.n, 'temps de B inchangé');
const sharedAfter = require('../server/lib/community').sharedActivitiesForUser(B.id, 'year', null, 'America/Toronto');
// Part de B dans chaque activité encore partagée : inchangée (seule la ligne de A disparaît de la somme de l'activité).
const myShare = (x) => Object.fromEntries(x.activities.map((a) => [a.activityId, (a.members.find((m) => m.userId === B.id) || {}).seconds]));
const shareBefore = myShare(sharedBefore), shareAfter = myShare(sharedAfter);
const diverge = Object.keys(shareAfter).filter((k) => shareBefore[k] !== shareAfter[k]);
assert(Object.keys(shareBefore).length > 0 && diverge.length === 0, 'communauté : la part de B dans ses activités partagées est inchangée');
assert(sharedAfter.activities.every((a) => !a.members.some((m) => m.userId === A.id)), 'communauté : A n\'apparaît plus comme membre');
assert(!db.prepare('SELECT 1 FROM users WHERE id = ?').get(A.id), 'profil supprimé');
process.exit(failed ? 1 : 0);
