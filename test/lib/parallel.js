// Exécution de scripts de test Node indépendants avec une concurrence bornée (défaut 3).
// Chaque script tourne dans son propre processus (dossiers temporaires et ports éphémères propres).
// Option serial : fichiers sensibles au temps réel (seuil de durée), exécutés SEULS une fois tous les autres terminés.
// runPool(fichiers, { concurrency, cwd, serial }) -> Map<fichier, Promise<{ ok, stdout, stderr }>> (démarrage immédiat, ordre de la liste).
const { execFile } = require('child_process');

function runNode(file, cwd) {
  return new Promise((resolve) => {
    execFile(process.execPath, [file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function runPool(files, opts = {}) {
  const limit = Math.max(1, opts.concurrency || Number(process.env.TMT_TEST_JOBS) || 3);
  const results = new Map();
  const queue = [];
  let running = 0;
  const pump = () => {
    while (running < limit && queue.length) {
      const job = queue.shift();
      running++;
      runNode(job.file, opts.cwd).then((r) => { running--; job.resolve(r); pump(); });
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
    chain = chain.then(() => runNode(file, opts.cwd));
    results.set(file, chain);
  }
  return results;
}

module.exports = { runPool, runNode };
