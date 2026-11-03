// Réseau personnel privé (CRM + graphe de relations), 2 nov. 2026. Rien n'est partagé : chaque requête est filtrée par ownerId,
// un contact n'est jamais lu par un autre compte. Aucune IA : suggestions, relances et ponts sont calculés par règles.
const db = require('../db');
const textlimits = require('./textlimits');

const MAX_CONTACTS = 500;
const MAX_TAGS = 10;
const DAY = 86400000;
// Seuil d'inactivité (jours) selon la force du lien ; 1 = jamais de relance automatique.
const IDLE_BY_STRENGTH = { 5: 30, 4: 60, 3: 120, 2: 200 };

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const parseTags = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (e) { return []; } };
const touchOf = (c) => c.lastTouchAt || c.createdAt;
const daysSince = (iso, now) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));

function loadAll(ownerId) {
  const rows = db.prepare('SELECT * FROM network_contacts WHERE ownerId = ? ORDER BY id DESC').all(ownerId);
  const notes = {};
  db.prepare('SELECT contactId, COUNT(*) AS n FROM network_notes WHERE ownerId = ? GROUP BY contactId').all(ownerId).forEach((r) => { notes[r.contactId] = r.n; });
  const edges = db.prepare('SELECT a, b FROM network_edges WHERE ownerId = ?').all(ownerId);
  const adj = new Map();
  rows.forEach((r) => adj.set(r.id, new Set()));
  edges.forEach((e) => { if (adj.has(e.a) && adj.has(e.b)) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); } });
  const contacts = rows.map((r) => ({
    id: r.id, name: r.name, company: r.company, role: r.role, whereMet: r.whereMet, city: r.city, workCity: r.workCity || '',
    interests: parseTags(r.interests), skills: parseTags(r.skills), strength: r.strength,
    lastTouchAt: r.lastTouchAt || null, followUpAt: r.followUpAt || null,
    notesCount: notes[r.id] || 0, degree: adj.get(r.id).size, createdAt: r.createdAt,
  }));
  return { contacts, edges, adj };
}

const recency = (c) => Date.parse(touchOf(c)) || 0;
const byRecent = (a, b) => (recency(b) - recency(a)) || (b.id - a.id);

function getContact(ownerId, id) {
  return loadAll(ownerId).contacts.find((c) => c.id === id) || null;
}

function owns(ownerId, id) {
  return !!db.prepare('SELECT 1 FROM network_contacts WHERE id = ? AND ownerId = ?').get(id, ownerId);
}

// Validation partielle (partial = mise à jour) : renvoie { error } ou { fields } (colonnes prêtes à écrire) .
function validate(body, partial) {
  const f = {};
  const b = body || {};
  if (!partial || b.name !== undefined) {
    const r = textlimits.clean(b.name, { max: 80, word: 'Nom', kind: 'title' });
    if (r.error) return { error: r.error };
    if (!r.text) return { error: 'Le nom est obligatoire.' };
    f.name = r.text;
  }
  for (const [k, word] of [['company', 'Entreprise'], ['role', 'Rôle'], ['whereMet', 'Lieu de rencontre'], ['city', 'Ville'], ['workCity', 'Ville de travail']]) {
    if (b[k] === undefined) continue;
    const r = textlimits.clean(b[k], { max: 80, word, kind: 'title' });
    if (r.error) return { error: r.error };
    f[k] = r.text;
  }
  for (const [k, word] of [['interests', 'Intérêts'], ['skills', 'Compétences']]) {
    if (b[k] === undefined) continue;
    if (!Array.isArray(b[k])) return { error: word + ' invalides.' };
    const seen = new Set(); const out = [];
    for (const raw of b[k]) {
      const r = textlimits.clean(raw, { max: 30, word: 'Étiquette', kind: 'title' });
      if (r.error) return { error: r.error };
      if (!r.text || seen.has(norm(r.text))) continue;
      seen.add(norm(r.text)); out.push(r.text);
    }
    if (out.length > MAX_TAGS) return { error: word + ' : ' + MAX_TAGS + ' étiquettes au plus.' };
    f[k] = JSON.stringify(out);
  }
  if (b.strength !== undefined) {
    if (!Number.isInteger(b.strength) || b.strength < 1 || b.strength > 5) return { error: 'Force du lien : un entier de 1 à 5.' };
    f.strength = b.strength;
  }
  if (b.followUpAt !== undefined) {
    if (b.followUpAt === null || b.followUpAt === '') f.followUpAt = null;
    else if (typeof b.followUpAt === 'string' && !Number.isNaN(Date.parse(b.followUpAt))) f.followUpAt = new Date(b.followUpAt).toISOString();
    else return { error: 'Date de relance invalide.' };
  }
  return { fields: f };
}

function create(ownerId, fields) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM network_contacts WHERE ownerId = ?').get(ownerId).n;
  if (n >= MAX_CONTACTS) return { error: 'Limite de ' + MAX_CONTACTS + ' contacts atteinte.' };
  const now = new Date().toISOString();
  const r = db.prepare(`INSERT INTO network_contacts (ownerId, name, company, role, whereMet, city, workCity, interests, skills, strength, lastTouchAt, followUpAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(ownerId, fields.name, fields.company || '', fields.role || '', fields.whereMet || '', fields.city || '', fields.workCity || '',
    fields.interests || '[]', fields.skills || '[]', fields.strength || 3, fields.followUpAt || null, now);
  return { id: Number(r.lastInsertRowid) };
}

function update(ownerId, id, fields, touch) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => k + ' = ?');
  const vals = keys.map((k) => fields[k]);
  if (touch) { sets.push('lastTouchAt = ?'); vals.push(new Date().toISOString()); }
  if (!sets.length) return;
  db.prepare('UPDATE network_contacts SET ' + sets.join(', ') + ' WHERE id = ? AND ownerId = ?').run(...vals, id, ownerId);
}

function remove(ownerId, id) {
  return db.prepare('DELETE FROM network_contacts WHERE id = ? AND ownerId = ?').run(id, ownerId).changes > 0;
}

function notesOf(ownerId, id) {
  return db.prepare('SELECT id, body, createdAt FROM network_notes WHERE contactId = ? AND ownerId = ? ORDER BY createdAt DESC, id DESC').all(id, ownerId);
}

function addNote(ownerId, id, body) {
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO network_notes (contactId, ownerId, body, createdAt) VALUES (?, ?, ?, ?)').run(id, ownerId, body, now);
  db.prepare('UPDATE network_contacts SET lastTouchAt = ? WHERE id = ? AND ownerId = ?').run(now, id, ownerId);
  return { id: Number(r.lastInsertRowid), body, createdAt: now };
}

function removeNote(ownerId, noteId) {
  return db.prepare('DELETE FROM network_notes WHERE id = ? AND ownerId = ?').run(noteId, ownerId).changes > 0;
}

function connections(ownerId, id) {
  return db.prepare(`SELECT c.id, c.name FROM network_edges e JOIN network_contacts c ON c.id = (CASE WHEN e.a = ? THEN e.b ELSE e.a END)
    WHERE e.ownerId = ? AND (e.a = ? OR e.b = ?) ORDER BY c.name`).all(id, ownerId, id, id);
}

function setEdge(ownerId, x, y, linked) {
  const a = Math.min(x, y), b = Math.max(x, y);
  if (linked) db.prepare('INSERT OR IGNORE INTO network_edges (ownerId, a, b) VALUES (?, ?, ?)').run(ownerId, a, b);
  else db.prepare('DELETE FROM network_edges WHERE ownerId = ? AND a = ? AND b = ?').run(ownerId, a, b);
}

function list(ownerId, q) {
  q = q || {};
  const { contacts } = loadAll(ownerId);
  let noteText = null;
  const words = norm(q.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    noteText = {};
    db.prepare('SELECT contactId, body FROM network_notes WHERE ownerId = ?').all(ownerId).forEach((r) => { noteText[r.contactId] = (noteText[r.contactId] || '') + ' ' + r.body; });
  }
  const multi = (v) => String(v || '').split(',').map(norm).filter(Boolean);
  const wantI = multi(q.interest), wantS = multi(q.skill);
  const eq = (field, val) => (val === undefined || val === '' ? null : norm(val));
  const company = eq('company', q.company), city = eq('city', q.city), met = eq('met', q.met);
  const strength = q.strength === undefined || q.strength === '' ? null : Number(q.strength);
  const minStrength = q.minStrength === undefined || q.minStrength === '' ? null : Number(q.minStrength);
  const idle = q.idleDays === undefined || q.idleDays === '' ? null : Number(q.idleDays);
  const now = Date.now();
  const out = contacts.filter((c) => {
    if (words.length) {
      const hay = norm([c.name, c.company, c.role, c.whereMet, c.city, c.interests.join(' '), c.skills.join(' '), noteText[c.id] || ''].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    const ci = c.interests.map(norm), cs = c.skills.map(norm);
    if (!wantI.every((t) => ci.includes(t))) return false;
    if (!wantS.every((t) => cs.includes(t))) return false;
    if (company !== null && norm(c.company) !== company) return false;
    if (city !== null && norm(c.city) !== city && norm(c.workCity) !== city) return false;
    if (met !== null && norm(c.whereMet) !== met) return false;
    if (strength !== null && c.strength !== strength) return false;
    if (minStrength !== null && c.strength < minStrength) return false;
    if (idle !== null && !(daysSince(touchOf(c), now) >= idle)) return false;
    return true;
  });
  return out.sort(byRecent).slice(0, MAX_CONTACTS);
}

function overview(ownerId) {
  const { contacts, edges } = loadAll(ownerId);
  const d = new Date();
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const added = contacts.filter((c) => c.createdAt >= monthStart).length;
  const before = contacts.length - added;
  return {
    contacts: contacts.length,
    strong: contacts.filter((c) => c.strength >= 4).length,
    addedThisMonth: added,
    pctThisMonth: before > 0 ? Math.round((added / before) * 100) : null,
    recent: contacts.slice().sort(byRecent).slice(0, 5),
    edges: edges.length,
  };
}

function graph(ownerId) {
  const { contacts, edges } = loadAll(ownerId);
  const ids = new Set(contacts.map((c) => c.id));
  return {
    nodes: contacts.map((c) => ({ id: c.id, name: c.name, company: c.company, role: c.role, city: c.city, workCity: c.workCity, whereMet: c.whereMet,
      interests: c.interests, skills: c.skills, strength: c.strength, lastTouchAt: c.lastTouchAt, degree: c.degree })),
    edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)).map((e) => ({ a: e.a, b: e.b })),
  };
}

function freq(values) {
  const m = new Map();
  values.forEach((v) => { const k = norm(v); if (!k) return; const e = m.get(k) || { tag: v, count: 0 }; e.count++; m.set(k, e); });
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function tags(ownerId) {
  const { contacts } = loadAll(ownerId);
  return {
    interests: freq(contacts.flatMap((c) => c.interests)),
    skills: freq(contacts.flatMap((c) => c.skills)),
    companies: freq(contacts.map((c) => c.company)),
    cities: freq(contacts.map((c) => c.city || c.workCity)),
    events: freq(contacts.map((c) => c.whereMet)),
  };
}

// Nombre de morceaux de la composante de `start` quand on retire `cut`.
function piecesWithout(adj, start, cut) {
  const seen = new Set([cut]);
  let pieces = 0;
  for (const n of adj.get(cut)) {
    if (seen.has(n)) continue;
    pieces++;
    const stack = [n]; seen.add(n);
    while (stack.length) for (const m of adj.get(stack.pop())) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return pieces;
}

function insights(ownerId) {
  const { contacts, adj } = loadAll(ownerId);
  const now = Date.now();
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const brief = (c) => ({ id: c.id, name: c.name });

  const intros = [];
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const x = contacts[i], y = contacts[j];
      if (adj.get(x.id).has(y.id)) continue;
      const via = [...adj.get(x.id)].filter((n) => adj.get(y.id).has(n));
      const yTags = new Set([...y.interests, ...y.skills].map(norm));
      const seen = new Set();
      const shared = [...x.interests, ...x.skills].filter((t) => { const k = norm(t); if (!yTags.has(k) || seen.has(k)) return false; seen.add(k); return true; });
      if (!via.length && shared.length < 2) continue;
      intros.push({ score: via.length * 3 + shared.length + (x.strength + y.strength) / 20, a: brief(x), b: brief(y), via: via.map((n) => brief(byId.get(n))), shared });
    }
  }
  intros.sort((p, q) => q.score - p.score || p.a.id - q.a.id || p.b.id - q.b.id);

  const followUps = [];
  contacts.forEach((c) => {
    if (c.followUpAt && Date.parse(c.followUpAt) <= now) followUps.push({ contact: c, reason: 'echeance', sinceDays: daysSince(c.followUpAt, now), rank: 1e6 + daysSince(c.followUpAt, now) });
    else {
      const th = IDLE_BY_STRENGTH[c.strength];
      const since = daysSince(touchOf(c), now);
      if (th && since >= th) followUps.push({ contact: c, reason: 'inactif', sinceDays: since, rank: since / th });
    }
  });
  followUps.sort((p, q) => q.rank - p.rank);

  const bridges = [];
  contacts.forEach((c) => {
    if (c.degree < 2) return;
    const clusters = piecesWithout(adj, c.id, c.id);
    if (clusters > 1) bridges.push({ id: c.id, name: c.name, degree: c.degree, clusters });
  });
  bridges.sort((p, q) => q.clusters - p.clusters || q.degree - p.degree || p.id - q.id);

  return {
    intros: intros.slice(0, 5).map(({ score, ...rest }) => rest),
    followUps: followUps.slice(0, 8).map(({ rank, ...rest }) => rest),
    bridges: bridges.slice(0, 5),
    underConnected: contacts.filter((c) => c.strength >= 4 && c.degree <= 1).sort((p, q) => q.strength - p.strength || p.degree - q.degree).slice(0, 5),
  };
}

module.exports = { MAX_CONTACTS, norm, validate, create, update, remove, owns, getContact, notesOf, addNote, removeNote, connections, setEdge,
  list, overview, graph, tags, insights };
