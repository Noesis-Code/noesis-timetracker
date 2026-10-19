// Sauvegarde / restauration de la base SQLite de Trade. Aucun réseau, aucune clé : les secrets restent chiffrés dans la copie
// (TRADE_TOKEN_KEY n'est jamais rangée avec les sauvegardes). Utilisée par backup.js et restore.js ; testée sur des dossiers temporaires.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const audit = require('./audit');

const REQUIRED_TABLES = ['tt_users', 'accounts', 'positions', 'transactions', 'sessions', 'audit_log', 'mfa_totp'];
const qlit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Copie cohérente (VACUUM INTO), lisible par le seul compte du service ; garde les `keep` plus récentes.
function backupTo(db, dir, { keep = 14, date = new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const out = path.join(dir, `trade-tracker-${date.toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  db.exec(`VACUUM INTO ${qlit(out)}`);
  fs.chmodSync(out, 0o600);
  for (const f of fs.readdirSync(dir).filter((x) => /^trade-tracker-.*\.db$/.test(x)).sort().slice(0, -keep)) fs.unlinkSync(path.join(dir, f));
  return out;
}

// Contrôle une sauvegarde SANS la modifier (ouverture en lecture seule) : intégrité SQLite, tables attendues, chaîne d'audit.
function verifyBackup(file) {
  if (!fs.existsSync(file)) return { ok: false, error: 'fichier introuvable' };
  let d;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const ic = d.prepare('PRAGMA integrity_check').all();
    if (ic.length !== 1 || ic[0].integrity_check !== 'ok') return { ok: false, error: 'intégrité SQLite en échec' };
    const have = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
    if (missing.length) return { ok: false, error: 'tables manquantes : ' + missing.join(', ') };
    const chain = audit.verifyChain(d);
    if (!chain.ok) return { ok: false, error: 'chaîne d\'audit rompue' };
    return { ok: true, users: d.prepare('SELECT COUNT(*) n FROM tt_users').get().n, auditLength: chain.length };
  } catch (e) { return { ok: false, error: 'illisible : ' + e.message };
  } finally { if (d) try { d.close(); } catch { /* déjà fermée */ } }
}

// Restaure `file` vers `target` (chemin du .db). Vérifie d'abord ; refuse d'écraser une base existante sans `force`
// et, même avec `force`, garde l'ancienne à côté (*.avant-restauration-<horodatage>). Le service doit être arrêté.
function restoreBackup(file, target, { force = false, now = Date.now() } = {}) {
  const v = verifyBackup(file);
  if (!v.ok) return { ok: false, error: 'sauvegarde refusée : ' + v.error };
  let kept = null;
  if (fs.existsSync(target)) {
    if (!force) return { ok: false, error: 'la base existe déjà : --force requis (l\'ancienne sera conservée)' };
    kept = `${target}.avant-restauration-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(target, kept);
  }
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(target + ext)) fs.renameSync(target + ext, (kept || target) + ext);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.restauration-en-cours';
  fs.copyFileSync(file, tmp);
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, target);
  return { ok: true, kept, ...v };
}

module.exports = { backupTo, verifyBackup, restoreBackup, REQUIRED_TABLES };
