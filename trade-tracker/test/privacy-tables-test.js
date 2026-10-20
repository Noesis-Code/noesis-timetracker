// Loi 25 : garde STATIQUE contre l'oubli d'une table. Toute table créée dans le code (grep « CREATE TABLE ») doit exister après migrate()
// et être soit personnelle (exportée ET effacée par privacy.js), soit déclarée NON_PERSONAL sans colonne qui désigne une personne.
// Une table personnelle doit se rattacher à un compte par une clé étrangère ON DELETE CASCADE (sinon l'effacement la laisserait).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const P = require('../server/lib/privacy');

const root = path.join(__dirname, '..');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name.startsWith('.')) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) files.push(f);
  }
})(root);
const declared = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(/gi)) declared.add(m[1]);

const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
const real = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
assert.deepStrictEqual([...declared].sort(), real.slice().sort(), 'les tables du code (CREATE TABLE) = celles de la base migrée : une table créée hors migrate() échapperait à l\'export et à l\'effacement');

const personal = P.personalTables(db);
for (const t of real) {
  const inExport = personal.includes(t), nonPersonal = P.NON_PERSONAL.has(t);
  assert(inExport !== nonPersonal, 'table classée une fois et une seule : ' + t);
}
for (const t of [...P.NON_PERSONAL, ...P.KEPT_ON_ERASE]) assert(real.includes(t), 'table citée par privacy.js mais inexistante : ' + t);

const info = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
// une table « non personnelle » ne porte aucune colonne qui désigne une personne
for (const t of P.NON_PERSONAL) for (const c of info(t)) assert(!/user|account|email|name|owner|invitedBy|usedBy|ip$|ua$/i.test(c) || (t === 'sectors' && c === 'name'),
  'NON_PERSONAL.' + t + '.' + c + ' ressemble à une donnée personnelle : la classer personnelle');
// une table personnelle se rattache à un compte par FK en cascade (userId -> tt_users, accountId -> accounts), sauf cas traités à la main dans privacy.js
const MANUAL = { tt_users: 'racine', invitations: 'effacement explicite (courriel d\'un tiers)' };
for (const t of personal) {
  if (MANUAL[t] || P.KEPT_ON_ERASE.has(t)) continue;
  const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all();
  const cols = info(t);
  const key = cols.includes('userId') ? 'userId' : cols.includes('accountId') ? 'accountId' : null;
  assert(key, 'table personnelle sans userId ni accountId : ' + t);
  const fk = fks.find((f) => f.from === key);
  assert(fk && fk.on_delete === 'CASCADE', t + '.' + key + ' doit être une clé étrangère ON DELETE CASCADE (sinon eraseUser la laisse)');
  // colonnes qui désignent un AUTRE compte sans cascade : refusées (non gérées par eraseUser)
  for (const c of cols) if (c !== key && /(^|[a-z])(By|Of)$|^(owner|usedBy|invitedBy|createdBy)$/.test(c)) assert.fail(t + '.' + c + ' désigne un compte : prévoir l\'effacement dans privacy.js puis l\'ajouter à ce test');
}
console.log('privacy-tables-test OK (' + real.length + ' tables)');
