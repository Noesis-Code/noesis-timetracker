// Lire seulement ce qui a changé (17 oct. 2026, réduction du coût IA). Loi 25 : AUCUN contenu n'est stocké, seulement des
// EMPREINTES (sha256) par bloc de texte dans drive_seen_chunks(userId, activityId, fileId, chunkHash).
// Découpage : titres markdown (#) + paragraphes (lignes vides) ; un paragraphe trop long est coupé par lignes (~1500 caractères).
// Fichier déjà vu qui change : seuls les blocs à empreinte nouvelle partent à l'IA, précédés d'un en-tête court (nom du fichier + fil
// des titres du bloc). Texte complet si : première lecture, aucune empreinte connue, découpage impossible, ou plus de 60 % des blocs changés.
// Les empreintes ne sont mises à jour qu'après un traitement réussi (drivesync.js). Les tâches déjà vues restent filtrées par drive_seen_tasks.
const crypto = require('crypto');
const db = require('../db');

const MAX_BLOCK = 1500;
const FULL_RATIO = 0.6;

db.exec(`CREATE TABLE IF NOT EXISTS drive_seen_chunks (
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  fileId TEXT NOT NULL,
  chunkHash TEXT NOT NULL,
  PRIMARY KEY (userId, activityId, fileId, chunkHash)
)`);

const hashOf = (t) => crypto.createHash('sha256').update(String(t).replace(/\s+/g, ' ').trim(), 'utf8').digest('hex');

// Retourne [{ trail: 'Titre 1 > Titre 2', text, hash }]
function split(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const trail = []; // fil des titres [{ level, title }]
  let cur = [];
  const trailStr = () => trail.map((t) => t.title).join(' > ');
  const flush = () => {
    if (!cur.length) return;
    let acc = [], len = 0;
    const push = () => { if (acc.length) { const t = acc.join('\n'); blocks.push({ trail: trailStr(), text: t, hash: hashOf(t) }); } acc = []; len = 0; };
    cur.forEach((l) => { if (len + l.length > MAX_BLOCK && acc.length) push(); acc.push(l); len += l.length + 1; });
    push();
    cur = [];
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      while (trail.length && trail[trail.length - 1].level >= h[1].length) trail.pop();
      trail.push({ level: h[1].length, title: h[2].slice(0, 120) });
      blocks.push({ trail: trailStr(), text: line, hash: hashOf(line) }); // le titre est un bloc : un titre modifié est détecté
      continue;
    }
    cur.push(line);
  }
  flush();
  return blocks;
}

function loadHashes(userId, activityId, fileId) {
  return new Set(db.prepare('SELECT chunkHash FROM drive_seen_chunks WHERE userId = ? AND activityId = ? AND fileId = ?').all(userId, activityId, fileId).map((r) => r.chunkHash));
}
// Remplace les empreintes du fichier (appelé seulement après un traitement réussi).
function saveHashes(userId, activityId, fileId, hashes) {
  db.prepare('DELETE FROM drive_seen_chunks WHERE userId = ? AND activityId = ? AND fileId = ?').run(userId, activityId, fileId);
  const ins = db.prepare('INSERT OR IGNORE INTO drive_seen_chunks (userId, activityId, fileId, chunkHash) VALUES (?, ?, ?, ?)');
  new Set(hashes).forEach((h) => ins.run(userId, activityId, fileId, h));
}

// Décide quoi envoyer. prev : Set des empreintes connues (vide / null = première lecture ou fichier jamais découpé).
// Retourne { text, hashes, mode: 'full'|'partial'|'none', changed, total }. 'none' : aucun bloc nouveau (suppression/réordonnancement) => rien à lire.
function plan(text, fileName, prev) {
  const blocks = split(text);
  const hashes = blocks.map((b) => b.hash);
  const full = { text, hashes, mode: 'full', changed: blocks.length, total: blocks.length };
  if (!prev || !prev.size || !blocks.length) return full;
  const fresh = blocks.filter((b) => !prev.has(b.hash));
  if (!fresh.length) return { text: '', hashes, mode: 'none', changed: 0, total: blocks.length };
  if (fresh.length / blocks.length > FULL_RATIO) return { ...full, changed: fresh.length };
  const clean = (t) => String(t).replace(/<\/?\s*(document|consigne|donnees|application|sortie)\s*>/gi, '').replace(/\s+/g, ' ').trim();
  const out = ['[Extraits modifiés du fichier « ' + clean(fileName || 'document').slice(0, 120) + ' » : les autres parties sont inchangées et déjà traitées.]'];
  let lastTrail = null;
  fresh.forEach((b) => {
    if (b.trail !== lastTrail) { out.push('', '[Section : ' + (b.trail ? clean(b.trail) : 'début du document') + ']'); lastTrail = b.trail; }
    out.push(b.text);
  });
  return { text: out.join('\n'), hashes, mode: 'partial', changed: fresh.length, total: blocks.length };
}

// Découpe un texte en segments d'au plus `max` caractères, aux frontières de paragraphes (puis de lignes, puis coupe franche en dernier recours).
// Aucun caractère n'est perdu : chaque segment sera envoyé à l'IA (le texte plus long que la limite de documenttasks serait sinon tronqué).
function segment(text, max) {
  const t = String(text || '');
  if (t.length <= max) return t.trim() ? [t] : [];
  const out = [];
  let acc = '';
  const flush = () => { if (acc.trim()) out.push(acc); acc = ''; };
  const add = (piece, sep) => {
    if (acc && acc.length + sep.length + piece.length > max) flush();
    acc = acc ? acc + sep + piece : piece;
  };
  t.split(/\n{2,}/).forEach((para) => {
    if (para.length <= max) { add(para, '\n\n'); return; }
    para.split('\n').forEach((line) => {
      if (line.length <= max) { add(line, '\n'); return; }
      for (let i = 0; i < line.length; i += max) add(line.slice(i, i + max), '\n');
    });
  });
  flush();
  return out;
}

// Coupe chaque segment en deux moitiés (à la ligne la plus proche du milieu), `times` fois : réessai après une réponse IA coupée.
function halve(segments, times) {
  let segs = segments.slice();
  for (let k = 0; k < times; k++) {
    const next = [];
    segs.forEach((sg) => {
      if (sg.length < 400) { next.push(sg); return; }
      const mid = Math.floor(sg.length / 2);
      let cut = sg.lastIndexOf('\n', mid);
      if (cut < sg.length * 0.2) { cut = sg.indexOf('\n', mid); if (cut < 0 || cut > sg.length * 0.8) cut = mid; }
      next.push(sg.slice(0, cut), sg.slice(cut));
    });
    segs = next.filter((x) => x.trim());
  }
  return segs;
}

module.exports = { split, plan, segment, halve, loadHashes, saveHashes, hashOf, FULL_RATIO, MAX_BLOCK };
