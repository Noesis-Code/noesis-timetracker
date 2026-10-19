// Rotation de TRADE_TOKEN_KEY : rechiffre, sous la clé COURANTE, tout ce qui est chiffré au repos avec une ancienne version.
// Colonnes chiffrées : voir ENCRYPTED. Une seule transaction (tout ou rien) ; chaque valeur est relue et comparée avant COMMIT.
const B = require('./brokertoken');

// { table, col, ctx(row), key: colonnes d'identité de la ligne }
const ENCRYPTED = [
  { table: 'broker_tokens', col: 'tokenEnc', ids: ['userId', 'broker'], ctx: (r) => B.brokerCtx(r.userId, r.broker) },
];

// Retourne { total, rotated, byVersion } ; dryRun : ne modifie rien. Lève (et annule) à la première valeur illisible.
function rotateAll(db, env = process.env, { dryRun = false } = {}) {
  const cur = B.currentVersion(env);
  const out = { currentVersion: cur, total: 0, rotated: 0, byVersion: {} };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of ENCRYPTED) {
      const rows = db.prepare(`SELECT ${t.ids.join(', ')}, ${t.col} AS enc FROM ${t.table}`).all();
      for (const r of rows) {
        out.total++;
        const v = B.encVersion(r.enc);
        out.byVersion[v] = (out.byVersion[v] || 0) + 1;
        const ctx = t.ctx(r);
        const plain = B.decrypt(r.enc, env, ctx); // lève si la clé de cette version manque : rien n'est modifié
        if (v === cur && !B.encIsLegacy(r.enc)) continue; // déjà à la version courante (format versionné)
        const fresh = B.encrypt(plain, env, ctx);
        if (B.decrypt(fresh, env, ctx) !== plain) throw new Error('relecture du rechiffrement différente : annulé');
        if (!dryRun) db.prepare(`UPDATE ${t.table} SET ${t.col} = ? WHERE ${t.ids.map((c) => c + ' = ?').join(' AND ')}`).run(fresh, ...t.ids.map((c) => r[c]));
        out.rotated++;
      }
    }
    db.exec(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ } throw e; }
  return out;
}

module.exports = { rotateAll, ENCRYPTED };
