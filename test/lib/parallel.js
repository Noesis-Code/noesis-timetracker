// Exécution de scripts de test Node indépendants avec une concurrence bornée (défaut 3).
// Chaque script tourne dans son propre processus (dossiers temporaires et ports éphémères propres).
// Option serial : fichiers sensibles au temps réel (seuil de durée), exécutés SEULS une fois tous les autres terminés.
// runPool(fichiers, { concurrency, cwd, serial, timeoutMs, timeouts }) -> Map<fichier, Promise<{ ok, stdout, stderr }>> (démarrage immédiat, ordre de la liste).
const { execFile } = require('child_process');

// timeoutMs (optionnel) : au-delà, le processus de test est tué (SIGKILL, son propre PID) et l'échec le dit clairement.
function runNode(file, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const opts = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd };
    if (timeoutMs > 0) { opts.timeout = timeoutMs; opts.killSignal = 'SIGKILL'; }
    execFile(process.execPath, [file], opts, (err, stdout, stderr) => {
      const late = err && err.killed && timeoutMs > 0;
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') + (late ? `\nDÉLAI DÉPASSÉ : ${require('path').basename(file)} bloqué ou trop lent (> ${timeoutMs / 1000} s), processus tué.` : '') });
    });
  });
}

function runPool(files, opts = {}) {
  const limit = Math.max(1, opts.concurrency || Number(process.env.TMT_TEST_JOBS) || 3);
  // opts.timeoutMs : plafond par test ; opts.timeouts : { 'fichier.js': ms } pour les tests lents connus (TMT_TEST_TIMEOUT_MS le remplace partout, 0 = sans plafond)
  const envT = process.env.TMT_TEST_TIMEOUT_MS;
  const limitFor = (file) => (envT !== undefined && envT !== '' ? Number(envT) : (opts.timeouts || {})[require('path').basename(file)] ?? opts.timeoutMs ?? 0);
  const results = new Map();
  const queue = [];
  let running = 0;
  const pump = () => {
    while (running < limit && queue.length) {
      const job = queue.shift();
      running++;
      runNode(job.file, opts.cwd, limitFor(job.file)).then((r) => { running--; job.resolve(r); pump(); });
    }
  };
  const serial = new Set(opts.serial || []);
  const parallel = files.filter((f) => !serial.has(require('path').basename(f)));
  for (const file of parallel) {
    results.set(file, new Promise((resolve) => queue.push({ file, resolve })));
  }
  pump();
  const allParallel = Promise.all(parallel.map((f) => results.get(f)));
  let chain = allParallel;
  for (const file of files.filter((f) => serial.has(require('path').basename(f)))) {
    chain = chain.then(() => runNode(file, opts.cwd, limitFor(file)));
    results.set(file, chain);
  }
  return results;
}

module.exports = { runPool, runNode };
