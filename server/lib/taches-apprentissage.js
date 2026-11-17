// APPRENTISSAGE DU RANGEMENT DES TÂCHES (18 nov. 2026, décision d'Émilien) : TOUTE correction manuelle informe l'IA, pour la personne et, de façon anonyme et agrégée, pour l'ensemble des utilisateurs.
//  1. Journal PERSONNEL (task_rangement_corrections) : catégorie, objectif, nature, phase, rang, regroupement ; réinjecté dans les prompts de CETTE personne (jamais ceux d'une autre).
//  2. Motifs GLOBAUX (rangement_motifs) : le titre est réduit à un motif générique (au plus 2 mots courants, jamais de nom propre, de chiffre ni d'adresse) ; identité = empreinte salée,
//     jamais l'identifiant ; utilisés seulement avec ≥ 5 personnes distinctes et ≥ 90 % de convergence ; alimentés SEULEMENT avec le consentement (rangement_consentement).
//  3. Délais entre paliers (paliers_delais, paliers_delais_globaux) : l'écart RÉEL de la personne personnalise le tableau de connaissance générale ; agrégé de la même façon.
// Jamais bloquant : toute erreur est avalée. Anonymat et consentement : docs/ia/rangement-taches.md.
const crypto = require('crypto');
const db = require('../db');

const MIN_USERS = 5, MIN_SHARE = 0.9, KEEP_PER_USER = 300, MAX_LABEL = 120;
const FIELDS = ['category', 'objective', 'nature', 'phase', 'rank', 'group', 'responsable']; // « responsable » reste PERSONNEL (jamais agrégé : une personne n'est pas un motif)
const GLOBAL_FIELDS = ['category', 'objective', 'nature', 'phase'];

db.exec(`CREATE TABLE IF NOT EXISTS task_rangement_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  activityId INTEGER,
  label TEXT NOT NULL,
  field TEXT NOT NULL,
  fromValue TEXT,
  toValue TEXT,
  createdAt TEXT NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_task_rangement_corrections_user ON task_rangement_corrections(userId, activityId, field, id)');
// Raison (une phrase) et confiance (0 à 100) données par l'IA de la personne via le connecteur : restent dans SON journal.
try { const cols = db.prepare('PRAGMA table_info(task_rangement_corrections)').all().map((c) => c.name); if (!cols.includes('raison')) db.exec('ALTER TABLE task_rangement_corrections ADD COLUMN raison TEXT'); if (!cols.includes('confiance')) db.exec('ALTER TABLE task_rangement_corrections ADD COLUMN confiance INTEGER'); } catch (e) { /* non bloquant */ }
// Exemples ÉTIQUETÉS du connecteur, agrégés et anonymes (motif générique, valeur, confiance, empreinte salée) : jamais la raison en texte libre ni l'identifiant.
db.exec(`CREATE TABLE IF NOT EXISTS rangement_exemples_connecteur (
  motif TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  confiance INTEGER NOT NULL,
  userKey TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (motif, field, value, userKey)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS rangement_consentement (
  userId TEXT PRIMARY KEY,
  accepted INTEGER NOT NULL,
  acceptedAt TEXT NOT NULL,
  source TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS rangement_motifs (
  motif TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  userKey TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (motif, field, value, userKey)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS paliers_delais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  famille TEXT NOT NULL,
  deVal TEXT NOT NULL,
  versVal TEXT NOT NULL,
  semaines REAL NOT NULL,
  createdAt TEXT NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_paliers_delais_user ON paliers_delais(userId, famille)');
db.exec(`CREATE TABLE IF NOT EXISTS paliers_delais_globaux (
  famille TEXT NOT NULL,
  deVal TEXT NOT NULL,
  versVal TEXT NOT NULL,
  userKey TEXT NOT NULL,
  semaines REAL NOT NULL,
  PRIMARY KEY (famille, deVal, versVal, userKey)
)`);

const SALT = () => process.env.APPRENTISSAGE_SEL || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'noesis-rangement';
const userKey = (userId) => crypto.createHash('sha256').update(SALT() + '|' + String(userId)).digest('hex').slice(0, 24);

// ---- Consentement ----
function setConsent(userId, accepted, source) {
  try {
    if (!userId) return false;
    db.prepare('INSERT INTO rangement_consentement (userId, accepted, acceptedAt, source) VALUES (?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET accepted = excluded.accepted, acceptedAt = excluded.acceptedAt, source = excluded.source')
      .run(userId, accepted ? 1 : 0, new Date().toISOString(), source || null);
    if (!accepted) retirerContributions(userId);
    return true;
  } catch (e) { return false; }
}
function hasConsent(userId) {
  try { const r = db.prepare('SELECT accepted FROM rangement_consentement WHERE userId = ?').get(userId); return !!(r && r.accepted); } catch (e) { return false; }
}
// Retrait du consentement : les contributions anonymes de cette personne sortent des agrégats.
function retirerContributions(userId) {
  try {
    const k = userKey(userId);
    db.prepare('DELETE FROM rangement_motifs WHERE userKey = ?').run(k);
    db.prepare('DELETE FROM paliers_delais_globaux WHERE userKey = ?').run(k);
    db.prepare('DELETE FROM rangement_exemples_connecteur WHERE userKey = ?').run(k);
  } catch (e) { /* non bloquant */ }
}

// ---- Motif générique d'un titre ----
// Au plus 2 mots COURANTS en minuscules (le verbe et son objet), jamais de mot commençant par une majuscule au milieu du titre (nom propre), de chiffre, d'adresse ni de mot de plus de 14 lettres.
// « Appeler Paul » -> « appeler » ; « Appeler quelqu'un » -> « appeler quelqu un » ; « Payer la facture 1234 » -> « payer facture » (le chiffre saute).
const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'au', 'aux', 'a', 'et', 'ou', 'mon', 'ma', 'mes', 'ce', 'cette', 'pour', 'avec', 'sur', 'dans', 'en', 'tres']);
function motifOf(label) {
  const raw = String(label || '').trim().slice(0, MAX_LABEL);
  if (!raw || /@|https?:/i.test(raw)) return null;
  const words = raw.split(/\s+/);
  const kept = [];
  words.forEach((w, i) => {
    if (/\d/.test(w)) return; // jamais de chiffre (numéro, montant, code)
    const clean = w.replace(/[^\p{L}'’]/gu, '');
    if (!clean) return;
    if (i > 0 && /^\p{Lu}/u.test(clean)) return; // nom propre au milieu du titre
    const low = clean.toLowerCase().replace(/['’]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (!low || STOP.has(low) || low.length > 14) return;
    kept.push(low);
  });
  if (!kept.length) return null;
  return kept.slice(0, 2).join(' ');
}

// ---- Journal personnel ----
// extra (facultatif) : { raison, confiance } fournis par l'IA de la personne (connecteur), gardés dans son journal seulement.
function recordCorrection(userId, activityId, label, field, fromValue, toValue, extra) {
  try {
    if (!userId || !FIELDS.includes(field)) return false;
    const clean = String(label || '').trim().slice(0, MAX_LABEL);
    if (!clean) return false;
    const to = toValue == null ? null : String(toValue).slice(0, 160), from = fromValue == null ? null : String(fromValue).slice(0, 160);
    if (from === to) return false;
    const raison = extra && extra.raison ? String(extra.raison).slice(0, 200) : null, conf = extra && Number.isFinite(Number(extra.confiance)) ? Math.max(0, Math.min(100, Math.round(Number(extra.confiance)))) : null;
    db.prepare('INSERT INTO task_rangement_corrections (userId, activityId, label, field, fromValue, toValue, createdAt, raison, confiance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, activityId || null, clean, field, from, to, new Date().toISOString(), raison, conf);
    db.prepare('DELETE FROM task_rangement_corrections WHERE userId = ? AND id NOT IN (SELECT id FROM task_rangement_corrections WHERE userId = ? ORDER BY id DESC LIMIT ?)').run(userId, userId, KEEP_PER_USER);
    if (to && GLOBAL_FIELDS.includes(field) && hasConsent(userId)) addGlobalPattern(userId, clean, field, to);
    return true;
  } catch (e) { return false; }
}
// Rangement fourni par l'IA de la personne via le connecteur (outil ranger_tache) : champs structurés catégorie, objectif, nature + raison courte + confiance. Le consentement est OBLIGATOIRE :
// sans lui rien n'est enregistré. Chaque champ entre dans le journal de la personne (avec raison et confiance) et, de façon anonyme, dans les exemples étiquetés du connecteur (motif générique, valeur, confiance).
function recordExempleConnecteur(userId, activityId, label, champs, raison, confiance) {
  try {
    if (!userId || !hasConsent(userId)) return { ok: false, raison: 'consentement' };
    const extra = { raison, confiance }, conf = Math.max(0, Math.min(100, Math.round(Number(confiance) || 0))), m = motifOf(label), k = userKey(userId), when = new Date().toISOString();
    let n = 0;
    [['category', champs && champs.categorie], ['objective', champs && champs.objectif], ['nature', champs && champs.nature]].forEach(([field, value]) => {
      if (value == null || value === '') return;
      recordCorrection(userId, activityId, label, field, null, value, extra);
      if (m) db.prepare('INSERT INTO rangement_exemples_connecteur (motif, field, value, confiance, userKey, createdAt) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(motif, field, value, userKey) DO UPDATE SET confiance = excluded.confiance, createdAt = excluded.createdAt').run(m, field, String(value).slice(0, 160), conf, k, when);
      n++;
    });
    return { ok: true, champs: n };
  } catch (e) { return { ok: false, raison: 'erreur' }; }
}
// Derniers exemples DE CETTE PERSONNE pour un champ (du plus récent au plus ancien), dans la limite de taille du prompt.
function recentExamples(userId, activityId, field, limit, maxChars) {
  try {
    if (!userId) return [];
    const rows = db.prepare('SELECT label, toValue FROM task_rangement_corrections WHERE userId = ? AND field = ? AND (activityId = ? OR ? IS NULL) AND toValue IS NOT NULL ORDER BY id DESC LIMIT 30')
      .all(userId, field, activityId || null, activityId || null);
    const out = []; let size = 0; const cap = maxChars || 250, max = limit || 5;
    for (const r of rows) {
      const len = r.label.length + String(r.toValue).length + 6;
      if (size + len > cap) break;
      size += len; out.push({ label: r.label, value: r.toValue });
      if (out.length >= max) break;
    }
    return out;
  } catch (e) { return []; }
}
// Exemple exact : cette personne a déjà rangé CE titre (insensible à la casse) : même place, sans appel IA.
function lastChoiceFor(userId, activityId, label, field) {
  try {
    const r = db.prepare('SELECT toValue FROM task_rangement_corrections WHERE userId = ? AND field = ? AND (activityId = ? OR ? IS NULL) AND lower(label) = lower(?) AND toValue IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get(userId, field, activityId || null, activityId || null, String(label || '').trim());
    return r ? r.toValue : null;
  } catch (e) { return null; }
}
function resetForUser(userId) {
  try {
    if (!userId) return 0;
    retirerContributions(userId);
    db.prepare('DELETE FROM paliers_delais WHERE userId = ?').run(userId);
    return Number(db.prepare('DELETE FROM task_rangement_corrections WHERE userId = ?').run(userId).changes) || 0;
  } catch (e) { return 0; }
}

// ---- Motifs globaux ----
function addGlobalPattern(userId, label, field, value) {
  try {
    const m = motifOf(label); if (!m) return false;
    db.prepare('INSERT INTO rangement_motifs (motif, field, value, userKey, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(motif, field, value, userKey) DO UPDATE SET n = n + 1')
      .run(m, field, String(value).slice(0, 160), userKey(userId));
    return true;
  } catch (e) { return false; }
}
// Valeur dominante pour un titre vague : { value, share, users } si ≥ 5 personnes distinctes et ≥ 90 % de convergence, sinon null.
function globalSuggestion(label, field) {
  try {
    const m = motifOf(label); if (!m) return null;
    const rows = db.prepare('SELECT value, COUNT(DISTINCT userKey) AS u FROM rangement_motifs WHERE motif = ? AND field = ? GROUP BY value ORDER BY u DESC').all(m, field);
    const total = rows.reduce((s, r) => s + r.u, 0);
    if (!rows.length || total < MIN_USERS) return null;
    const best = rows[0];
    if (best.u / total < MIN_SHARE) return null;
    return { value: best.value, share: Math.round((best.u / total) * 100) / 100, users: total };
  } catch (e) { return null; }
}

// ---- Délais réels entre paliers ----
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
function recordPalierDelay(userId, famille, de, vers, semaines) {
  try {
    const w = Number(semaines);
    if (!userId || !famille || de == null || vers == null || !(w > 0) || w > 520) return false;
    db.prepare('INSERT INTO paliers_delais (userId, famille, deVal, versVal, semaines, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(userId, String(famille), String(de), String(vers), w, new Date().toISOString());
    if (hasConsent(userId)) db.prepare('INSERT INTO paliers_delais_globaux (famille, deVal, versVal, userKey, semaines) VALUES (?, ?, ?, ?, ?) ON CONFLICT(famille, deVal, versVal, userKey) DO UPDATE SET semaines = excluded.semaines').run(String(famille), String(de), String(vers), userKey(userId), w);
    return true;
  } catch (e) { return false; }
}
// Délai personnalisé en semaines : la médiane de CETTE personne si elle en a, sinon la médiane globale (≥ 5 personnes), sinon null (le tableau général s'applique).
function personalDelay(userId, famille, de, vers) {
  try {
    const mine = db.prepare('SELECT semaines FROM paliers_delais WHERE userId = ? AND famille = ? AND deVal = ? AND versVal = ?').all(userId, String(famille), String(de), String(vers)).map((r) => r.semaines);
    if (mine.length) return { semaines: median(mine), source: 'personnel', n: mine.length };
    const g = db.prepare('SELECT semaines FROM paliers_delais_globaux WHERE famille = ? AND deVal = ? AND versVal = ?').all(String(famille), String(de), String(vers)).map((r) => r.semaines);
    if (g.length >= MIN_USERS) return { semaines: median(g), source: 'global', n: g.length };
    return null;
  } catch (e) { return null; }
}

module.exports = { recordExempleConnecteur, FIELDS, MIN_USERS, MIN_SHARE, setConsent, hasConsent, retirerContributions, motifOf, recordCorrection, recentExamples, lastChoiceFor, resetForUser, addGlobalPattern, globalSuggestion, recordPalierDelay, personalDelay, userKey };
