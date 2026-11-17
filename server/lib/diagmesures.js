// Mode diagnostic invisible (17 nov. 2026) : MESURES DE MISE EN PAGE envoyées par l'app ouverte sur staging avec ?diag=1.
// Jamais de texte saisi, de titre ni de donnée personnelle : liste blanche de champs numériques/techniques seulement.
// Staging uniquement (RAILWAY_ENVIRONMENT_NAME === 'staging'). Voir docs/journal/diagnostic-mesures-iphone.md.
const db = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS diag_mesures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receivedAt TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diag_mesures_user ON diag_mesures(userId, id);
`);

const KEEP = 50;
const PER_HOUR = 30;
const MAX_BODY = 8192;
const sent = new Map(); // userId -> horodatages (ms) de la dernière heure

const isStaging = () => process.env.RAILWAY_ENVIRONMENT_NAME === 'staging';

// Liste blanche : nom -> 'n' nombre, 's' chaîne courte (≤ 200), 'o' objet (sous-liste), 'b' booléen.
const RECT = { top: 'n', bottom: 'n', left: 'n', right: 'n', height: 'n', width: 'n' };
const SCHEMA = {
  at: 's', event: 's', userAgent: 's', standalone: 'b', orientation: 's',
  innerWidth: 'n', innerHeight: 'n', screenWidth: 'n', screenHeight: 'n', scrollY: 'n',
  visualViewport: { width: 'n', height: 'n', offsetTop: 'n', offsetLeft: 'n', scale: 'n' },
  safeArea: { top: 's', right: 's', bottom: 's', left: 's' },
  htmlClasses: 's', htmlBg: 's', bodyBg: 's',
  rects: { topbar: RECT, goalsPage1Switch: RECT, objArbre: RECT, tabbarPill: RECT, dock: RECT },
  bottomEl: { tag: 's', id: 's', className: 's', bg: 's', parentBg: 's' },
  arbre: { rows: 'n', cols: 'n', dateColWidth: 'n', firstColWidth: 'n', leftToFirstBubble: 'n' },
  viewRows: 'n', cacheVersion: 's', activeTab: 's',
};

function clean(value, schema) {
  if (schema === 'n') return typeof value === 'number' && isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  if (schema === 'b') return typeof value === 'boolean' ? value : undefined;
  if (schema === 's') return typeof value === 'string' ? value.slice(0, 200) : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const k of Object.keys(schema)) {
    const v = clean(value[k], schema[k]);
    if (v !== undefined && !(typeof v === 'object' && !Object.keys(v).length)) out[k] = v;
  }
  return out;
}
const sanitize = (body) => clean(body, SCHEMA) || {};

// Limite de débit : PER_HOUR envois par heure et par utilisateur.
function allow(userId, now = Date.now()) {
  const list = (sent.get(userId) || []).filter((t) => now - t < 3600000);
  if (list.length >= PER_HOUR) { sent.set(userId, list); return false; }
  list.push(now); sent.set(userId, list);
  return true;
}

function store(userId, data) {
  const json = JSON.stringify(data);
  console.log('[diag-mesures] ' + userId + ' ' + json);
  db.prepare('INSERT INTO diag_mesures (userId, receivedAt, json) VALUES (?,?,?)').run(userId, new Date().toISOString(), json);
  db.prepare('DELETE FROM diag_mesures WHERE userId = ? AND id NOT IN (SELECT id FROM diag_mesures WHERE userId = ? ORDER BY id DESC LIMIT ?)').run(userId, userId, KEEP);
}
const list = (userId) => db.prepare('SELECT receivedAt, json FROM diag_mesures WHERE userId = ? ORDER BY id DESC').all(userId)
  .map((r) => ({ receivedAt: r.receivedAt, mesures: JSON.parse(r.json) }));

module.exports = { isStaging, sanitize, allow, store, list, MAX_BODY, PER_HOUR, _reset: () => sent.clear() };
