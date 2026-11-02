// Communautés de démonstration (demande d'Émilien, 2 nov. 2026) : ~14 communautés fictives et ~45 membres fictifs pour voir
// le réseau sous toutes ses formes (secteurs, propriétaires, tailles, membres en commun, membres qui cachent leurs
// communautés, communautés sans secteur). Jumeau de stats-demo-staging.js : STAGING UNIQUEMENT (RAILWAY_ENVIRONMENT_NAME
// défini et != "production"), au démarrage sauf SEED_COMMUNITIES_DEMO=0. Idempotent : seules les communautés listées
// ci-dessous (avec leur propriétaire) sont supprimées puis recréées ; les membres fictifs (courriel communautes-demo@exemple.test,
// NIP commun 0000) sont créés une seule fois. Aucune donnée réelle, jamais en production.
const { randomUUID } = require('node:crypto');
const db = require('../db');
const scen = require('./scenarios-staging');
const { makePinRecord } = require('./auth');
const { DARK_PALETTE } = require('../../public/theme-palette.js');

const MARK_EMAIL = 'communautes-demo@exemple.test';
const FIRST = ['Camille', 'Maxime', 'Élodie', 'Hugo', 'Inès', 'Lucas', 'Manon', 'Nathan', 'Zoé', 'Théo'];
const LAST = ['Pelletier', 'Gauthier', 'Morin', 'Fortin', 'Côté', 'Lavoie', 'Bergeron', 'Paquette'];
const EXTRA_MEMBERS = 60;
const SECTORS = ['Travail', 'Finance', 'Santé', 'Études', ''];

// owner : prénom d'un profil fictif du seed (ou « Emilien »). size : nombre de membres, propriétaire compris.
const DEMO = [
  { name: 'Rédaction web', topic: 'Écrire pour le web : titres, structure, référencement', sector: 'Travail', owner: 'Alex', size: 24 },
  { name: 'Productivité', topic: 'Organiser son temps et tenir ses priorités', sector: 'Travail', owner: 'Alex', size: 40 },
  { name: 'Entrepreneuriat', topic: 'Lancer son projet, trouver ses premiers clients', sector: 'Travail', owner: 'Sam', size: 34 },
  { name: 'Freelance', topic: 'Tarifs, contrats et prospection en solo', sector: 'Travail', owner: 'Sam', size: 16 },
  { name: 'Trading débutant', topic: 'Premiers pas, gestion du risque', sector: 'Finance', owner: 'Jamie', size: 28 },
  { name: 'Investir long terme', topic: 'Construire un portefeuille patient', sector: 'Finance', owner: 'Jamie', size: 14 },
  { name: 'Budget familial', topic: 'Suivre ses dépenses sans se priver', sector: 'Finance', owner: 'Léo', size: 10 },
  { name: 'Fitness', topic: 'Routine sportive régulière', sector: 'Santé', owner: 'Léo', size: 32 },
  { name: 'Sommeil', topic: 'Mieux dormir, horaires stables', sector: 'Santé', owner: 'Noa', size: 12 },
  { name: 'Méditation', topic: 'Dix minutes par jour', sector: 'Santé', owner: 'Noa', size: 8 },
  { name: 'Langues', topic: 'Pratiquer chaque jour, même peu', sector: 'Études', owner: 'Alex', size: 22 },
  { name: 'Examens', topic: 'Réviser sans s\'épuiser', sector: 'Études', owner: 'Sam', size: 12 },
  { name: 'Lecture', topic: 'Un livre par mois', sector: '', owner: 'Jamie', size: 6 },
  { name: 'Organisation du temps', topic: 'Méthodes testées dans Noèsis', sector: 'Travail', owner: 'Emilien', size: 11 },
];
// Communautés rejointes par Emilien (en plus de la sienne) : de quoi voir « Mes communautés » et la vue Membres.
const EMILIEN_JOINS = ['Productivité', 'Entrepreneuriat', 'Trading débutant', 'Fitness', 'Langues'];

function isStaging() { return scen.isStaging(); }

function userByFirst(name) {
  return db.prepare('SELECT id FROM users WHERE name = ? ORDER BY createdAt LIMIT 1').get(name) || null;
}

function ensureMembers() {
  const pin = makePinRecord('0000');
  const now = new Date().toISOString();
  const ins = db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang, passwordStrong, communitiesShown) VALUES (?, ?, ?, '', ?, ?, ?, ?, 'dark', 1, 'fr', 1, ?)");
  const ids = [];
  for (let i = 0; i < EXTRA_MEMBERS; i++) {
    const name = FIRST[i % FIRST.length], lastName = LAST[i % LAST.length];
    const found = db.prepare('SELECT id FROM users WHERE name = ? AND lastName = ? AND email = ?').get(name, lastName, MARK_EMAIL);
    if (found) { ids.push(found.id); continue; }
    const id = randomUUID();
    // Un membre sur sept cache ses autres communautés : le schéma les montre en pointillé.
    ins.run(id, name, lastName, MARK_EMAIL, DARK_PALETTE[i % DARK_PALETTE.length], now, pin, i % 7 === 6 ? 0 : 1);
    ids.push(id);
  }
  return ids;
}

function seedCommunitiesDemo() {
  const owners = {};
  DEMO.forEach((d) => { owners[d.owner] = owners[d.owner] || (d.owner === 'Emilien' ? emilienId() : (userByFirst(d.owner) || {}).id); });
  const pool = ensureMembers();
  Object.keys(owners).forEach((k) => { if (owners[k] && !pool.includes(owners[k])) pool.push(owners[k]); });
  const emilien = owners.Emilien;
  const now = new Date().toISOString();
  const del = db.prepare('DELETE FROM communities WHERE name = ? AND ownerId = ?');
  const insC = db.prepare('INSERT INTO communities (ownerId, name, topic, sector, priceCents, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
  const insM = db.prepare('INSERT OR IGNORE INTO community_members (communityId, userId, joinedAt) VALUES (?, ?, ?)');
  const insP = db.prepare('INSERT INTO community_posts (communityId, userId, body, createdAt) VALUES (?, ?, ?, ?)');
  let made = 0;
  DEMO.forEach((d, c) => {
    const ownerId = owners[d.owner];
    if (!ownerId) return;
    del.run(d.name, ownerId);
    const id = Number(insC.run(ownerId, d.name, d.topic, d.sector, c % 3 === 0 ? 2500 : 0, now).lastInsertRowid);
    insM.run(id, ownerId, now);
    // Membres : d'abord ceux « de son secteur » (liens forts entre communautés d'un même secteur), puis le reste du groupe
    // (liens plus faibles entre secteurs). Suite déterministe, décalée par communauté.
    const size = Math.max(5, Math.round(d.size * 0.62));
    const s = SECTORS.indexOf(d.sector);
    const own = pool.filter((_, i) => i % SECTORS.length === s);
    for (let k = 0, taken = 1; taken < size && k < pool.length * 4; k++) {
      const uid = k < own.length * 2 ? own[(c + k) % own.length] : pool[(c * 7 + k * 3) % pool.length];
      if (uid === emilien && !EMILIEN_JOINS.includes(d.name)) continue;
      if (uid === ownerId) continue;
      if (insM.run(id, uid, now).changes) taken++;
    }
    if (emilien && EMILIEN_JOINS.includes(d.name)) insM.run(id, emilien, now);
    insP.run(id, ownerId, 'Bienvenue dans ' + d.name + ' ! Présentez-vous en une phrase.', now);
    made++;
  });
  return made;
}

function emilienId() {
  const u = db.prepare("SELECT id FROM users WHERE name = 'Emilien' AND lastName = 'Staging'").get()
    || db.prepare("SELECT id FROM users WHERE name = 'Emilien' ORDER BY createdAt LIMIT 1").get();
  return u ? u.id : null;
}

function seedCommunitiesDemoOnStaging() {
  if (!isStaging() || process.env.SEED_COMMUNITIES_DEMO === '0') return null;
  const n = seedCommunitiesDemo();
  console.log('[communities-demo-staging] ' + n + ' communautés de démonstration');
  return n;
}

module.exports = { seedCommunitiesDemo, seedCommunitiesDemoOnStaging, DEMO };
