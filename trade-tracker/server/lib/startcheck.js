// Contrôle de la base AVANT l'ouverture au démarrage. Une base illisible, tronquée ou vidée ne doit jamais être remplacée en silence par une
// base neuve (les comptes, jetons chiffrés et le journal d'audit seraient perdus sans que personne le voie). Si la base est abîmée :
//   - l'original n'est JAMAIS modifié ni supprimé (le contrôle se fait sur une copie de travail) ;
//   - une copie de l'abîmée est rangée à côté (trade-tracker.db.corrompue-<horodatage de modification>, une seule fois) pour analyse ;
//   - la sauvegarde la plus récente qui passe sa vérification est proposée (commande de restore.js, qui garde l'abîmée à côté) ;
//   - le serveur ne démarre pas (le lanceur sort en code 1).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { verifyBackup } = require('./backup');

const DB_NAME = 'trade-tracker.db';

// Sauvegardes du dossier backups/, de la plus récente à la plus ancienne, avec le résultat de leur vérification.
function listBackups(dir) {
  const bdir = path.join(dir, 'backups');
  if (!fs.existsSync(bdir)) return [];
  return fs.readdirSync(bdir).filter((x) => /^trade-tracker-.*\.db$/.test(x)).sort().reverse().map((n) => ({ file: path.join(bdir, n), name: n }));
}
function newestGoodBackup(dir) {
  const rejected = [];
  for (const b of listBackups(dir)) {
    const v = verifyBackup(b.file);
    if (v.ok) return { good: { ...b, ...v }, rejected };
    rejected.push({ name: b.name, error: v.error });
  }
  return { good: null, rejected };
}

// Contrôle SQLite sur une copie de travail (db + wal + shm), supprimée aussitôt. Retourne null si saine, sinon la raison.
function inspect(file) {
  const work = file + '.verif-demarrage';
  const cleanup = () => { for (const e of ['', '-wal', '-shm']) try { fs.rmSync(work + e, { force: true }); } catch { /* ignore */ } };
  cleanup();
  let d;
  try {
    fs.copyFileSync(file, work);
    for (const e of ['-wal', '-shm']) if (fs.existsSync(file + e)) fs.copyFileSync(file + e, work + e);
    d = new DatabaseSync(work);
    const ic = d.prepare('PRAGMA integrity_check').all();
    if (ic.length !== 1 || ic[0].integrity_check !== 'ok') return 'contrôle d\'intégrité SQLite en échec (' + String(ic[0] && ic[0].integrity_check).slice(0, 120) + ')';
    const have = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    if (!have.has('tt_users')) return 'tables attendues absentes (base vidée ou tronquée)';
    return null;
  } catch (e) {
    return String((e && e.message) || e).slice(0, 160);
  } finally { if (d) try { d.close(); } catch { /* déjà fermée */ } cleanup(); }
}

// Retourne { ok: true, fresh } si on peut ouvrir, sinon { ok: false, reason, copy, backup, rejected, message }. N'écrit rien d'autre que la copie « corrompue ».
function checkDbAtStartup(dir) {
  const file = path.join(dir, DB_NAME);
  const exists = fs.existsSync(file);
  const size = exists ? fs.statSync(file).size : 0;
  const backups = listBackups(dir);
  let reason = null;
  if (!exists || size === 0) {
    // Absente ou vide : normal au tout premier démarrage (aucune sauvegarde) ; suspect si des sauvegardes existent (base perdue ou vidée).
    if (!backups.length) return { ok: true, fresh: true };
    reason = exists ? 'le fichier de la base est vide (0 octet)' : 'le fichier de la base est absent';
    reason += ' alors que des sauvegardes existent';
  } else {
    const r = inspect(file);
    if (!r) return { ok: true, fresh: false };
    reason = r;
  }
  let copy = null;
  if (exists && size > 0) {
    try {
      const st = fs.statSync(file);
      copy = `${file}.corrompue-${st.mtime.toISOString().replace(/[:.]/g, '-')}`;
      if (!fs.existsSync(copy)) { fs.copyFileSync(file, copy); fs.chmodSync(copy, 0o600); for (const e of ['-wal', '-shm']) if (fs.existsSync(file + e)) fs.copyFileSync(file + e, copy + e); }
    } catch (e) { copy = null; }
  }
  const { good, rejected } = newestGoodBackup(dir);
  const L = [];
  L.push('[trade-tracker] DÉMARRAGE REFUSÉ : la base de données est abîmée ou perdue.');
  L.push('  Constat : ' + reason + '.');
  L.push('  Le serveur ne démarre pas : une base vide serait créée à la place et les comptes, jetons et le journal seraient perdus sans alerte.');
  L.push('  Le fichier d\'origine n\'a PAS été modifié' + (copy ? ' ; une copie est rangée à côté pour analyse : ' + copy : '') + '.');
  if (good) {
    L.push('  Sauvegarde la plus récente valide : ' + good.name + ' (' + good.users + ' compte(s), journal de ' + good.auditLength + ' entrée(s)).');
    L.push('  Pour restaurer (le service arrêté ; l\'abîmée est gardée à côté) :  node restore.js "' + good.file + '" --force');
    L.push('  Les données écrites depuis cette sauvegarde sont absentes de la copie : à relire avant de relancer.');
  } else {
    L.push('  Aucune sauvegarde valide trouvée dans ' + path.join(dir, 'backups') + (rejected.length ? ' (refusées : ' + rejected.map((x) => x.name + ' : ' + x.error).join(' ; ') + ')' : '') + '.');
    L.push('  Récupérer une sauvegarde hors du volume (voir DEPLOY.md), puis :  node restore.js <fichier.db> --force');
  }
  return { ok: false, reason, copy, backup: good, rejected, message: L.join('\n') };
}

module.exports = { checkDbAtStartup, newestGoodBackup, listBackups, DB_NAME };
