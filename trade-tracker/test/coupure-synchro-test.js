// Reprise après coupure en pleine synchro : un VRAI processus est tué (SIGKILL) au milieu d'une synchro de prix/positions,
// d'un import du Sheet ou d'une sauvegarde ; la base (fichier, WAL) est rouverte et doit être cohérente :
// rien de partiel, aucune position ou transaction doublée ou perdue, aucun faux « OK » dans le journal ; la reprise finit le travail.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { openDb } = require('../server/db');
const { syncUser } = require('../server/lib/sync');
const { importSheet, ensureUser } = require('../server/lib/importsheet');
const BK = require('../server/lib/backup');

const T0 = Date.parse('2026-06-01T12:00:00Z'), T1 = Date.parse('2026-06-02T12:00:00Z'), T2 = Date.parse('2026-06-02T13:00:00Z');
const acct = (extra) => ({
  externalId: 'ACC-1', type: 'CELI', label: '', balances: [{ currency: 'CAD', cash: extra ? 250 : 100 }],
  positions: extra
    ? [{ symbol: 'AAA.TO', name: 'A', sector: 'Or', currency: 'CAD', quantity: 60, avgCost: 11, lastPrice: 15 }, { symbol: 'CCC.TO', name: 'C', sector: 'Argent', currency: 'CAD', quantity: 5, avgCost: 8, lastPrice: 9 }]
    : [{ symbol: 'AAA.TO', name: 'A', sector: 'Or', currency: 'CAD', quantity: 10, avgCost: 10, lastPrice: 12 }, { symbol: 'BBB.TO', name: 'B', sector: 'Cuivre', currency: 'CAD', quantity: 4, avgCost: 3, lastPrice: 4 }],
  transactions: [{ externalId: 'T1', date: '2026-05-01', type: 'ACHAT', symbol: 'AAA.TO', quantity: 10, price: 10, amount: 100, currency: 'CAD' }]
    .concat(extra ? [{ externalId: 'T2', date: '2026-06-02', type: 'ACHAT', symbol: 'AAA.TO', quantity: 50, price: 11, amount: 550, currency: 'CAD' }, { externalId: 'T3', date: '2026-06-02', type: 'ACHAT', symbol: 'CCC.TO', quantity: 5, price: 8, amount: 40, currency: 'CAD' }] : []),
});
const connector = (extra) => ({ name: 'simule', async fetchPortfolio() { return { broker: 'simule', usdCad: 1.37, accounts: [acct(extra)] }; } });
const files = () => { const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.csv'), 'utf8'); return { comptes: fx('comptes'), positions: fx('positions'), transactions: fx('transactions'), soldes: fx('soldes') }; };

// ---------- processus enfant : exécute un scénario et se tue à la n-ième écriture (ou juste après VACUUM) ----------
if (process.argv[2] === 'child') {
  const [, , , scenario, file, at, out] = process.argv;
  const kill = () => process.kill(process.pid, 'SIGKILL');
  const killAt = at === 'vacuum' ? 'vacuum' : Number(at);
  let n = 0;
  const hooked = (db) => new Proxy(db, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (k === 'exec') return (sql) => { const r = v.call(t, sql); if (killAt === 'vacuum' && /VACUUM INTO/.test(sql)) kill(); return r; };
      if (k === 'prepare') return (sql) => {
        const s = v.call(t, sql);
        if (!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) return s;
        return new Proxy(s, { get(st, kk) { const f = st[kk]; if (typeof f !== 'function') return f; if (kk !== 'run') return f.bind(st); return (...a) => { n++; if (n === killAt) kill(); return f.apply(st, a); }; } });
      };
      return v.bind(t);
    },
  });
  const db = hooked(openDb(file));
  (async () => {
    if (scenario === 'sync') await syncUser(db, db.prepare("SELECT * FROM tt_users WHERE tmtUserId='tmt-e'").get(), { connector: connector(true), now: T1 });
    else if (scenario === 'import') importSheet(db, ensureUser(db, 'tmt-e', 'expert'), files(), { now: T1 });
    else if (scenario === 'backup') BK.backupTo(db, path.join(path.dirname(file), 'backups'), { date: new Date('2026-06-02T00:00:00Z') });
    fs.writeFileSync(out, String(n));
  })().catch((e) => { console.error(e); process.exit(3); });
  return;
}

// ---------- processus parent ----------
const dir = require('../../test/lib/tmpdir').mkTmp('tt-coupure-');
const state = (db) => JSON.stringify({
  acc: db.prepare('SELECT userId,type,externalId FROM accounts ORDER BY id').all(),
  pos: db.prepare('SELECT a.externalId a,p.symbol,p.quantity,p.avgCost,p.lastPrice,p.priceUpdatedAt FROM positions p JOIN accounts a ON a.id=p.accountId ORDER BY a.externalId,p.symbol').all(),
  bal: db.prepare('SELECT a.externalId a,b.currency,b.cash FROM balances b JOIN accounts a ON a.id=b.accountId ORDER BY a.externalId,b.currency').all(),
  tx: db.prepare('SELECT a.externalId a,t.externalId e,t.date,t.type,t.symbol,t.quantity,t.amount FROM transactions t JOIN accounts a ON a.id=t.accountId ORDER BY a.externalId,t.date,t.type,t.symbol,t.amount,t.externalId').all(),
  ev: db.prepare('SELECT type,transactionId FROM events ORDER BY id').all().length,
});
const noDuplicates = (db) => {
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM (SELECT accountId,symbol FROM positions GROUP BY accountId,symbol HAVING COUNT(*)>1)').get().n, 0, 'position doublée');
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM (SELECT accountId,externalId FROM transactions WHERE externalId IS NOT NULL GROUP BY accountId,externalId HAVING COUNT(*)>1)").get().n, 0, 'transaction doublée');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM (SELECT transactionId FROM events GROUP BY transactionId HAVING COUNT(*)>1)').get().n, 0, 'événement doublé');
  assert.strictEqual(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.strictEqual(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'clé étrangère orpheline');
};
const copy = (from, to) => { for (const s of ['', '-wal', '-shm']) if (fs.existsSync(from + s)) fs.copyFileSync(from + s, to + s); };
const child = (scenario, file, at, out) => spawnSync(process.execPath, [__filename, 'child', scenario, file, String(at), out], { encoding: 'utf8', timeout: 15000 });
const sample = (total) => { const s = new Set([1, 2, 3, total - 1, total]); for (let i = 1; i <= 8; i++) s.add(Math.max(1, Math.round((total * i) / 8))); return [...s].filter((x) => x >= 1 && x <= total).sort((a, b) => a - b); };

(async () => {
  try {
    // ===== 1) synchro (prix + positions + soldes + transactions + événements d'achat) =====
    const baseSync = path.join(dir, 'sync-base.db');
    let db = openDb(baseSync);
    db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('tmt-e','Expert','expert')").run();
    await syncUser(db, db.prepare('SELECT * FROM tt_users WHERE id=1').get(), { connector: connector(false), now: T0 });
    const before = state(db); noDuplicates(db);
    const logBefore = db.prepare('SELECT COUNT(*) n FROM sync_log').get().n;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();

    // référence : la synchro menée jusqu'au bout sans coupure, et le nombre d'écritures
    const refFile = path.join(dir, 'sync-ref.db'); copy(baseSync, refFile);
    let r = child('sync', refFile, 0, path.join(dir, 'count.txt')); assert.strictEqual(r.status, 0, r.stderr);
    const total = Number(fs.readFileSync(path.join(dir, 'count.txt'), 'utf8')); assert(total > 10, 'scénario trop court : ' + total);
    db = openDb(refFile); const after = state(db); noDuplicates(db);
    assert.notStrictEqual(after, before, 'la synchro de référence doit changer quelque chose');
    assert.strictEqual(JSON.parse(after).ev, 2, 'deux nouveaux achats = deux événements'); db.close();

    for (const k of sample(total)) {
      const f = path.join(dir, `sync-${k}.db`); copy(baseSync, f);
      r = child('sync', f, k, path.join(dir, 'x.txt'));
      assert.strictEqual(r.signal, 'SIGKILL', `écriture ${k}/${total} : le processus devait être tué (${r.signal}/${r.status} ${r.stderr})`);
      db = openDb(f); noDuplicates(db);
      const st = state(db), logs = db.prepare('SELECT status,message FROM sync_log ORDER BY id').all();
      if (k < total) {
        // tué avant la fin de la transaction : retour exact à l'état d'avant, journal inchangé (aucun faux « OK »)
        assert.strictEqual(st, before, `écriture ${k}/${total} : état partiel après coupure`);
        assert.strictEqual(logs.length, logBefore, `écriture ${k}/${total} : le journal ne doit pas annoncer une synchro non terminée`);
      } else {
        // tué après COMMIT mais avant la ligne de journal : les données sont complètes, seul le journal manque
        assert.strictEqual(st, after, 'coupure après COMMIT : données complètes attendues');
        assert.strictEqual(logs.length, logBefore);
      }
      // reprise : la synchro suivante aboutit, état final identique à la référence, journal clair
      const res = await syncUser(db, db.prepare('SELECT * FROM tt_users WHERE id=1').get(), { connector: connector(true), now: T2 });
      assert(res.ok, 'reprise : ' + res.error);
      noDuplicates(db);
      const fin = JSON.parse(state(db)), ref = JSON.parse(after);
      assert.deepStrictEqual({ ...fin, pos: fin.pos.map((p) => [p.symbol, p.quantity, p.lastPrice].join()) }, { ...ref, pos: ref.pos.map((p) => [p.symbol, p.quantity, p.lastPrice].join()) }, `reprise ${k}/${total} : données différentes`);
      assert.strictEqual(fin.pos.length, 2, 'positions : AAA et CCC seulement (BBB retirée, aucune doublée)');
      const last = db.prepare('SELECT status,kind FROM sync_log ORDER BY id DESC LIMIT 1').get();
      assert.deepStrictEqual({ ...last }, { status: 'OK', kind: 'sync' });
      // les événements d'achat de la reprise : exactement ceux de la synchro sans coupure (un par achat), sauf coupure post-COMMIT
      // (les achats sont alors déjà enregistrés sans événement notifié : jamais de doublon, c'est le contrat d'idempotence)
      assert(fin.ev === ref.ev || k === total, `événements d'achat : ${fin.ev} vs ${ref.ev}`);
      db.close();
    }

    // ===== 2) import du Sheet (tout dans une transaction) =====
    const baseImp = path.join(dir, 'imp-base.db');
    db = openDb(baseImp); ensureUser(db, 'tmt-e', 'expert');
    db.prepare("INSERT INTO fx_rates (date, pair, rate) VALUES ('2026-06-01','USDCAD',1.37)").run();
    const emptyState = state(db), emptyLogs = db.prepare('SELECT COUNT(*) n FROM sync_log').get().n;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
    const impRef = path.join(dir, 'imp-ref.db'); copy(baseImp, impRef);
    r = child('import', impRef, 0, path.join(dir, 'count2.txt')); assert.strictEqual(r.status, 0, r.stderr);
    const totalImp = Number(fs.readFileSync(path.join(dir, 'count2.txt'), 'utf8')); assert(totalImp > 10);
    db = openDb(impRef); const impAfter = state(db); noDuplicates(db); db.close();
    assert.notStrictEqual(impAfter, emptyState);
    for (const k of sample(totalImp)) {
      const f = path.join(dir, `imp-${k}.db`); copy(baseImp, f);
      r = child('import', f, k, path.join(dir, 'x.txt')); assert.strictEqual(r.signal, 'SIGKILL', `import ${k}/${totalImp} non tué`);
      db = openDb(f); noDuplicates(db);
      if (k < totalImp) { assert.strictEqual(state(db), emptyState, `import ${k}/${totalImp} : état partiel`); assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sync_log').get().n, emptyLogs); }
      const rep = importSheet(db, ensureUser(db, 'tmt-e', 'expert'), files(), { now: T1 });
      assert.strictEqual(state(db), impAfter, `reprise de l'import ${k}/${totalImp} : état différent`); noDuplicates(db);
      assert(rep.accounts >= 0);
      assert.strictEqual(db.prepare("SELECT status FROM sync_log WHERE kind='import' ORDER BY id DESC LIMIT 1").get().status, 'PARTIEL'); // 1 ligne ignorée dans la fixture
      db.close();
    }

    // ===== 3) sauvegarde coupée juste après la copie : les sauvegardes précédentes restent intactes, la suivante est valide =====
    const bf = path.join(dir, 'bk', 'trade-tracker.db'); fs.mkdirSync(path.dirname(bf), { recursive: true }); copy(refFile, bf);
    db = openDb(bf);
    const bdir = path.join(path.dirname(bf), 'backups');
    const old = BK.backupTo(db, bdir, { date: new Date('2026-06-01T00:00:00Z') }); const oldSize = fs.statSync(old).size;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
    r = child('backup', bf, 'vacuum', path.join(dir, 'x.txt')); assert.strictEqual(r.signal, 'SIGKILL', 'sauvegarde non tuée');
    assert.strictEqual(fs.statSync(old).size, oldSize, 'sauvegarde précédente modifiée');
    assert.strictEqual(BK.verifyBackup(old).ok, true);
    db = openDb(bf); noDuplicates(db);
    const neu = BK.backupTo(db, bdir, { date: new Date('2026-06-02T00:00:00Z') });
    assert.strictEqual(BK.verifyBackup(neu).ok, true, 'sauvegarde de reprise invalide');
    assert.strictEqual(state(db), after, 'la base source doit rester intacte'); db.close();
    console.log(`coupure-synchro-test OK (synchro : ${sample(total).length} coupures sur ${total} écritures ; import : ${sample(totalImp).length} sur ${totalImp} ; sauvegarde)`);
  } catch (e) { console.error(e); process.exit(1); }
})();
