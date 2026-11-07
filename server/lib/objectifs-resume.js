// Résumé annuel des grands objectifs (6 nov. 2026) : un résumé PAR ACTIVITÉ ET PAR AN, à la demande (premier affichage de la case de l'année dans l'arbre des années).
// « Grand objectif » = objectif qui a au moins un sous-objectif ; année = année de son échéance. Le résumé est un AFFICHAGE DÉRIVÉ, jamais une donnée saisie :
// il ne modifie rien. Repli sans IA = liste courte des titres (toujours disponible : sans clé API, IA désactivée, panne, limite atteinte).
// Cache : par jeu de grands objectifs (hash des ids + titres + échéances) ; mémoire 24 h (aicache.memoize) et table objectifs_resume_annuel pour ne pas régénérer
// tant que le jeu ne change pas. La table porte aussi userId (les objectifs sont ceux d'une personne ; effacée avec le compte, Loi 25).
const crypto = require('crypto');
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS objectifs_resume_annuel (
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  year INTEGER NOT NULL,
  hash TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (userId, activityId, year)
)`);

const FEATURE = 'resume-annuel', MAX_OBJECTIVES = 15, MAX_TITLE = 140, MAX_OUT_TOKENS = 200, MAX_TEXT = 600;
const SYSTEM = 'Tu résumes en français, pour une personne, ses grands objectifs d’une année. Réponds par UNE phrase courte, puis au plus 3 puces commençant par « - ». '
  + 'Tu n’inventes rien : seulement ce qui est dans la liste (titres et échéances).';
let caller = null; // tests : fausse IA (prompt) -> texte
function setCaller(fn) { caller = fn; }
function err(msg, code) { return Object.assign(new Error(msg), { statusCode: code || 400 }); }

function bigOnes(userId, activityId, year) {
  return db.prepare(`SELECT o.id, o.title, o.endDate, o.metaJson FROM user_objectives o
    WHERE o.userId = ? AND o.activityId = ? AND substr(o.endDate, 1, 4) = ?
      AND EXISTS (SELECT 1 FROM user_objectives c WHERE c.parentId = o.id AND c.userId = o.userId)
    ORDER BY o.endDate, o.id`).all(userId, activityId, String(year))
    .filter((r) => { try { return !JSON.parse(r.metaJson || '{}').abandoned; } catch (e) { return true; } })
    .map((r) => ({ id: r.id, title: r.title, endDate: r.endDate }));
}
const hashOf = (bigs) => crypto.createHash('sha256').update(JSON.stringify(bigs.map((b) => [b.id, b.title, b.endDate]))).digest('hex');
const titlesText = (bigs) => bigs.map((b) => '- ' + b.title).join('\n');
function buildPrompt(bigs, year) {
  return 'Année ' + year + '. Grands objectifs :\n' + bigs.slice(0, MAX_OBJECTIVES).map((b) => '- ' + String(b.title).slice(0, MAX_TITLE) + ' (échéance ' + b.endDate + ')').join('\n');
}
function clean(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const sentence = lines.find((l) => !/^[-•*]/.test(l)), bullets = lines.filter((l) => /^[-•*]/.test(l)).slice(0, 3).map((l) => '- ' + l.replace(/^[-•*]\s*/, ''));
  const out = [sentence].concat(bullets).filter(Boolean).join('\n').slice(0, MAX_TEXT);
  return out || null;
}
async function callAi(userId, prompt) {
  if (caller) return clean(await caller(prompt));
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const aibudget = require('./aibudget'), aimodels = require('./aimodels');
  const model = aimodels.fastModelRaw();
  if (model === 'off') return null;
  const res = await aibudget.runAs(userId, () => aibudget.fetchAnthropic(FEATURE, 'https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(aimodels.timeoutMs('rapprochement')),
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: MAX_OUT_TOKENS, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  }));
  if (!res.ok) return null;
  const body = await res.json();
  return clean((body.content || []).map((b) => b.text || '').join(''));
}

// Retourne { text, source: 'ia' | 'titres', generatedAt, count } ; jamais d'erreur d'IA (repli sur les titres).
async function resumeAnnuel(userId, activityId, year) {
  const y = Number(year), aid = Number(activityId);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw err('Année invalide.');
  if (!db.prepare('SELECT 1 FROM activity_members m JOIN activities a ON a.id = m.activityId WHERE m.userId = ? AND m.activityId = ? AND a.active = 1').get(userId, aid)) throw err('Activité introuvable.', 404);
  const bigs = bigOnes(userId, aid, y);
  if (!bigs.length) return { text: '', source: 'titres', generatedAt: null, count: 0 };
  const hash = hashOf(bigs);
  const row = db.prepare('SELECT hash, text, createdAt FROM objectifs_resume_annuel WHERE userId = ? AND activityId = ? AND year = ?').get(userId, aid, y);
  if (row && row.hash === hash) return { text: row.text, source: 'ia', generatedAt: row.createdAt, count: bigs.length };
  let text = null;
  try {
    const aicache = require('./aicache');
    text = await aicache.memoize([FEATURE, userId, aid, y, hash], () => callAi(userId, buildPrompt(bigs, y)), { cacheIf: (v) => !!v });
  } catch (e) { text = null; } // panne, limite de budget ou plafond : repli sans IA
  if (!text) return { text: titlesText(bigs), source: 'titres', generatedAt: null, count: bigs.length };
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO objectifs_resume_annuel (userId, activityId, year, hash, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, activityId, year) DO UPDATE SET hash = excluded.hash, text = excluded.text, createdAt = excluded.createdAt`).run(userId, aid, y, hash, text, now);
  return { text, source: 'ia', generatedAt: now, count: bigs.length };
}
// ---- Titre commun d'un macro (fonction macro-titre) : UNE ligne ≤ 140 caractères à partir des titres des objectifs reliés ----
// Entrée : childIds[] (objectifs de la personne) OU columns[] ({ activityId, poleKey?, categoryKey? } : sans poleKey = niveau activité, avec poleKey = pôle, avec categoryKey = secteur) ;
// par colonne, les DEUX objectifs les plus récents. Ne crée rien : le client enregistre ensuite par POST /objectifs/macro avec le titre (modifiable).
// Même mécanique que le résumé annuel : modèle léger, cache par hash des titres (mémoire 24 h), crédit gratuit et plafond global appliqués par aibudget (crédit épuisé : aucun appel),
// repli sans IA = titres joints par « · ».
const TITLE_FEATURE = 'macro-titre', MAX_TITLE_LINE = 140, TITLE_SYSTEM = 'Tu écris, en français, UN titre d’objectif commun, sur une seule ligne (moins de 100 caractères, sans guillemets), qui englobe les objectifs listés. Réponds uniquement par le titre.';
let titleCaller = null;
function setTitleCaller(fn) { titleCaller = fn; }
function titlesFor(userId, body) {
  const rows = [];
  const notAb = (r) => { try { return !JSON.parse(r.metaJson || '{}').abandoned; } catch (e) { return true; } };
  if (Array.isArray(body && body.childIds) && body.childIds.length) {
    body.childIds.slice(0, 20).forEach((id) => { const r = db.prepare('SELECT id, title, metaJson FROM user_objectives WHERE id = ? AND userId = ?').get(Number(id), userId); if (!r) throw err('Objectif introuvable.', 404); rows.push(r); });
  } else if (Array.isArray(body && body.columns) && body.columns.length) {
    body.columns.slice(0, 10).forEach((c) => {
      const aid = Number(c && c.activityId);
      if (!db.prepare('SELECT 1 FROM activity_members WHERE userId = ? AND activityId = ?').get(userId, aid)) throw err('Activité introuvable.', 404);
      let where = "activityId = ? AND (level IS NULL OR level = 'activite')", args = [aid];
      if (c.poleKey && c.categoryKey) { where = "activityId = ? AND level = 'secteur' AND poleKey = ? AND categoryKey = ?"; args = [aid, String(c.poleKey), String(c.categoryKey)]; }
      else if (c.poleKey) { where = "activityId = ? AND level = 'pole' AND poleKey = ?"; args = [aid, String(c.poleKey)]; }
      db.prepare('SELECT id, title, metaJson FROM user_objectives WHERE userId = ? AND isMacro = 0 AND ' + where + ' ORDER BY id DESC').all(userId, ...args).filter(notAb).slice(0, 2).forEach((r) => rows.push(r));
    });
  } else throw err('Indique des objectifs ou des colonnes à relier.');
  const seen = new Set(), titles = [];
  rows.forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); titles.push(String(r.title)); } });
  if (!titles.length) throw err('Aucun objectif à relier.');
  return titles.slice(0, 12);
}
const clipLine = (s) => { const t = String(s || '').replace(/[\r\n]+/g, ' ').replace(/^["«\s]+|["»\s]+$/g, '').trim(); return t.length > MAX_TITLE_LINE ? t.slice(0, MAX_TITLE_LINE - 1).trimEnd() + '…' : t; };
const firstLine = (s) => clipLine(String(s || '').split(/\r?\n/).find((l) => l.trim()) || '');
async function titreMacro(userId, body) {
  const titles = titlesFor(userId, body), joined = clipLine(titles.join(' · '));
  const prompt = 'Objectifs à englober :\n' + titles.map((t) => '- ' + t.slice(0, MAX_TITLE)).join('\n');
  const hash = crypto.createHash('sha256').update(JSON.stringify(titles)).digest('hex');
  let line = null;
  try {
    const aicache = require('./aicache');
    line = await aicache.memoize([TITLE_FEATURE, userId, hash], async () => {
      if (titleCaller) return firstLine(await titleCaller(prompt));
      if (!process.env.ANTHROPIC_API_KEY) return null;
      const aibudget = require('./aibudget'), aimodels = require('./aimodels'), model = aimodels.fastModelRaw();
      if (model === 'off') return null;
      const res = await aibudget.runAs(userId, () => aibudget.fetchAnthropic(TITLE_FEATURE, 'https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(aimodels.timeoutMs('rapprochement')),
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 60, temperature: 0, system: TITLE_SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      }));
      if (!res.ok) return null;
      const b = await res.json();
      return firstLine((b.content || []).map((x) => x.text || '').join(''));
    }, { cacheIf: (v) => !!v });
  } catch (e) { line = null; } // panne, crédit épuisé ou plafond : repli sans IA
  return line ? { title: line, source: 'ia' } : { title: joined, source: 'titres' };
}
module.exports = { resumeAnnuel, titreMacro, setTitleCaller, setCaller, bigOnes, FEATURE };
