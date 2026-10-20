// Loi 25 côté Trade : export et effacement complets des données personnelles d'UN utilisateur.
// Listes DYNAMIQUES : les tables sont lues dans sqlite_master. Une table inconnue (ni personnelle, ni dans NON_PERSONAL) fait échouer
// test/privacy-test.js : on ne peut pas ajouter une table personnelle sans qu'elle soit exportée et effacée.
// Aucune route ni interface : appelée par un script d'exploitation ou, plus tard, par l'écran réservé (ré-authentification d'office, /api/export*).

// Tables sans donnée personnelle d'un utilisateur (partagées ou techniques).
const NON_PERSONAL = new Set(['sectors', 'fx_rates', 'link_nonces', 'auth_lockouts']);
// Conservée volontairement à l'effacement : journal d'audit inaltérable (déclencheurs). Voir docs/loi25-trade-2026-10-20.md, question L1.
const KEPT_ON_ERASE = new Set(['audit_log']);
// Colonnes jamais exportées : secrets, empreintes et jetons (même chiffrés, ils n'ont aucun sens pour la personne).
const SECRET_COL = /^(tokenEnc|secretEnc|tokenHash|salt|hash|prevHash|challengeHash|codeHash|publicKey)$/;

function tables(db) { return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name); }
function cols(db, t) { return db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name); }

// Tables personnelles = toutes sauf NON_PERSONAL. Rattachement : userId | accountId (via accounts) | invitedBy/usedBy/email (invitations) | id (tt_users).
function personalTables(db) { return tables(db).filter((t) => !NON_PERSONAL.has(t)); }

function userRows(db, t, user) {
  const c = cols(db, t);
  if (t === 'tt_users') return db.prepare('SELECT * FROM tt_users WHERE id = ?').all(user.id);
  if (t === 'invitations') return db.prepare('SELECT * FROM invitations WHERE invitedBy = ? OR usedBy = ? OR (email IS NOT NULL AND email = ?)').all(user.id, user.id, String(user.email || '').trim().toLowerCase() || null);
  if (c.includes('userId')) return db.prepare(`SELECT * FROM ${t} WHERE userId = ?`).all(user.id);
  if (c.includes('accountId')) return db.prepare(`SELECT * FROM ${t} WHERE accountId IN (SELECT id FROM accounts WHERE userId = ?)`).all(user.id);
  throw new Error('table personnelle non rattachée à un utilisateur : ' + t);
}

// { exportedAt, tables: { nom: [lignes sans secrets] } }
function exportUser(db, userId, now = Date.now()) {
  const user = db.prepare('SELECT * FROM tt_users WHERE id = ?').get(userId);
  if (!user) return null;
  const out = {};
  for (const t of personalTables(db)) {
    out[t] = userRows(db, t, user).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COL.test(k))));
  }
  return { exportedAt: new Date(now).toISOString(), tables: out };
}

// Efface TOUT sauf KEPT_ON_ERASE, en une transaction. Les clés étrangères (ON DELETE CASCADE) font le reste ; on supprime explicitement
// ce qui n'a pas de cascade (invitations : courriel d'un tiers invité, verrouillages portant l'identifiant).
function eraseUser(db, userId) {
  const user = db.prepare('SELECT * FROM tt_users WHERE id = ?').get(userId);
  if (!user) return { erased: false };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const r of userRows(db, 'invitations', user)) db.prepare('DELETE FROM invitations WHERE id = ?').run(r.id);
    db.prepare('DELETE FROM auth_lockouts WHERE key IN (?, ?)').run('acct:' + user.id, 'linksub:' + user.tmtUserId);
    db.prepare('DELETE FROM tt_users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ } throw e; }
  return { erased: true, kept: [...KEPT_ON_ERASE] };
}

module.exports = { NON_PERSONAL, KEPT_ON_ERASE, personalTables, exportUser, eraseUser };
