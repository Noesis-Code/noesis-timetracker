// Dossiers temporaires de test : tous supprimés à la sortie du processus (fin normale, erreur, SIGINT/SIGTERM).
// Usage : const { mkTmp } = require('./lib/tmpdir'); const dir = mkTmp('tmt-xxx-');
// Ne supprime que les chemins exacts créés par ce processus, jamais de balayage de /tmp.
const fs = require('fs');
const os = require('os');
const path = require('path');

const created = new Set();
let hooked = false;

function cleanup() {
  for (const d of created) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignoré */ } }
  created.clear();
}

function hook() {
  if (hooked) return;
  hooked = true;
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { cleanup(); process.exit(128 + (os.constants.signals[sig] || 0)); });
  }
  process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1); });
}

function mkTmp(prefix) {
  hook();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'tmt-'));
  created.add(d);
  return d;
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignoré */ }
  created.delete(d);
}

module.exports = { mkTmp, rmTmp, cleanup };
