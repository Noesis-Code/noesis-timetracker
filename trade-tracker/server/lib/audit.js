// Journal d'audit inaltérable : ajout seulement (déclencheurs SQLite) + chaîne de hachages SHA-256.
// hash = SHA-256(prevHash \n at \n userId \n event \n ip \n device \n detail). Modifier ou retirer une ligne casse toutes les suivantes
// (verifyChain le détecte). Le hash de tête (« head ») est affiché à l'utilisateur : le noter permet de détecter aussi une troncature de fin.
// RÈGLE : jamais de secret, de code TOTP, de code de secours, de jeton ni de cookie dans un journal (scrub retire ces clés).
const crypto = require('node:crypto');

const GENESIS = '0'.repeat(64);
const SECRET_KEY = /(token|jeton|secret|code|passw|pwd|key|cle|cookie|authorization|otp|backup|secours)/i;

function scrub(detail) {
  const out = {};
  for (const k of Object.keys(detail || {}).sort()) {
    if (SECRET_KEY.test(k)) continue;
    const v = detail[k];
    if (v == null) continue;
    out[k] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 120);
  }
  return JSON.stringify(out);
}

// Libellé d'appareil lisible, sans conserver le user-agent brut.
function deviceLabel(ua) {
  const s = String(ua || '');
  if (!s) return 'Appareil inconnu';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Navigateur';
  const os = /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? br + ' · ' + os : br;
}

const rowHash = (r) => crypto.createHash('sha256').update([r.prevHash, r.at, r.userId == null ? '' : r.userId, r.event, r.ip, r.device, r.detail].join('\n')).digest('hex');

function log(db, { userId = null, event, ip = '', ua = '', detail = {}, now = Date.now() }) {
  if (!event) throw new Error('événement d\'audit requis');
  const prev = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const row = { prevHash: prev ? prev.hash : GENESIS, at: new Date(now).toISOString(), userId, event: String(event), ip: String(ip || '').slice(0, 64), device: deviceLabel(ua), detail: scrub(detail) };
  row.hash = rowHash(row);
  const r = db.prepare('INSERT INTO audit_log (at, userId, event, ip, device, detail, prevHash, hash) VALUES (?,?,?,?,?,?,?,?)')
    .run(row.at, row.userId, row.event, row.ip, row.device, row.detail, row.prevHash, row.hash);
  return Number(r.lastInsertRowid);
}

// Recalcule toute la chaîne. { ok, length, head, brokenAt }.
function verifyChain(db) {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM audit_log ORDER BY id').iterate()) {
    n++;
    if (r.prevHash !== prev || rowHash(r) !== r.hash) return { ok: false, length: n, head: prev, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, length: n, head: prev, brokenAt: null };
}

// Entrées d'un compte (les siennes seulement), récentes d'abord. Aucune donnée d'un autre utilisateur.
function listForUser(db, userId, { limit = 100, beforeId } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const rows = beforeId
    ? db.prepare('SELECT id, at, event, ip, device, detail, hash FROM audit_log WHERE userId = ? AND id < ? ORDER BY id DESC LIMIT ?').all(userId, Number(beforeId), lim)
    : db.prepare('SELECT id, at, event, ip, device, detail, hash FROM audit_log WHERE userId = ? ORDER BY id DESC LIMIT ?').all(userId, lim);
  return rows.map((r) => ({ id: r.id, at: r.at, event: r.event, ip: r.ip, device: r.device, detail: JSON.parse(r.detail), hash: r.hash.slice(0, 16) }));
}

module.exports = { GENESIS, log, verifyChain, listForUser, scrub, deviceLabel, rowHash };
