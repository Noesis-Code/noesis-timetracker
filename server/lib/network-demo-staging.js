// Réseau personnel de démonstration (2 nov. 2026) : ~28 contacts fictifs en 3 grappes pour « Emilien Staging » (mines et minéraux
// critiques à Montréal ; IA et produit logiciel ; organisation d'événements), avec liens, ponts et notes. STAGING UNIQUEMENT,
// au démarrage sauf SEED_NETWORK_DEMO=0. Idempotent : les contacts du compte sont supprimés puis recréés (cascade : liens et notes).
// Noms purement fictifs.
const db = require('../db');
const scen = require('./scenarios-staging');

const MINE = 'Montréal';
// [nom, entreprise, rôle, où rencontré, ville, intérêts, compétences, force, dernier contact (jours), relance (jours, + = futur)]
const C = [
  // Grappe 1 : mines et minéraux critiques (0 à 11)
  ['Marc-Antoine Delorme', 'Aurelia Minerals', 'Géologue en chef', 'PDAC 2026', MINE, ['Mining', 'Critical Minerals'], ['Technical Geology'], 5, 9, null],
  ['Sophie Tremblay-Lacasse', 'Nordique Lithium', 'Directrice financière', 'PDAC 2026', MINE, ['Critical Minerals', 'Macro'], ['Capital Raising'], 4, 25, null],
  ['Idriss Benali', 'Atlas Rare Earths', 'Président', 'VRIC', 'Vancouver', ['Mining', 'Geopolitics'], ['Capital Raising', 'Negotiation'], 4, 70, null],
  ['Geneviève Roy', 'Cobalt Boréal', 'Ingénieure des mines', 'Montreal mining meetup', MINE, ['Mining'], ['Technical Geology', 'Project Management'], 3, 40, null],
  ['Patrick O\'Donnell', 'Ironbridge Capital', 'Analyste principal', 'VRIC', 'Toronto', ['Macro', 'Mining'], ['Capital Raising', 'Valuation'], 3, 150, null],
  ['Fatima El Idrissi', 'Maroc Phosphates Conseil', 'Conseillère', 'PDAC 2026', 'Casablanca', ['Geopolitics', 'Critical Minerals'], ['Negotiation'], 4, 15, 3],
  ['Luc Marchand', 'Marchand & Associés', 'Avocat en droit minier', 'Montreal mining meetup', MINE, ['Mining'], ['Legal'], 3, 95, null],
  ['Anaïs Cormier', 'Boréalis Géosciences', 'Cartographe', 'Montreal mining meetup', MINE, ['Mining'], ['Technical Geology', 'Data Analysis'], 2, 210, null],
  ['Jonas Eriksen', 'Nordic Battery Metals', 'Directeur du développement', 'PDAC 2026', 'Oslo', ['Critical Minerals', 'Geopolitics'], ['Business Development'], 4, 55, null],
  ['Rachel Abitbol', 'Fonds Terra', 'Gestionnaire de portefeuille', 'VRIC', MINE, ['Macro', 'Longevity'], ['Capital Raising'], 5, 12, null],
  ['Thierry Gagnon', 'Gagnon Forage', 'Propriétaire', 'Montreal mining meetup', 'Val-d\'Or', ['Mining'], ['Drilling'], 2, 260, -1],
  ['Isabelle Fournier', 'Ministère des Ressources', 'Analyste de politiques', 'PDAC 2026', 'Québec', ['Critical Minerals', 'Geopolitics'], ['Policy'], 4, 33, null],
  // Grappe 2 : IA et produit logiciel (12 à 21)
  ['Nadia Rahimi', 'Lumen Labs', 'Cheffe de produit', 'TechCrunch Disrupt 2024', 'San Francisco', ['AI', 'Product'], ['Product Strategy', 'Community Building'], 5, 6, null],
  ['Étienne Beaulieu', 'Synapse IA', 'Cofondateur', 'TechCrunch Disrupt 2024', MINE, ['AI', 'Longevity'], ['Machine Learning', 'Capital Raising'], 4, 20, null],
  ['Clara Nguyen', 'Pixel Forge', 'Designer produit', 'Meetup Design MTL', MINE, ['Product', 'AI'], ['Design'], 3, 85, null],
  ['Omar Haddad', 'Kestrel Software', 'Directeur technique', 'TechCrunch Disrupt 2024', 'Toronto', ['AI', 'Product'], ['Machine Learning', 'Engineering'], 3, 130, null],
  ['Victoria Lindqvist', 'Seed North', 'Investisseuse', 'TechCrunch Disrupt 2024', 'Stockholm', ['AI', 'Macro'], ['Capital Raising'], 4, 48, null],
  ['Mathis Perrin', 'Atelier Perrin', 'Développeur indépendant', 'Meetup Design MTL', MINE, ['Product'], ['Engineering', 'Design'], 2, 300, null],
  ['Yasmine Kone', 'Datavia', 'Scientifique des données', 'Montreal AI meetup', MINE, ['AI', 'Longevity'], ['Data Analysis', 'Machine Learning'], 3, 60, null],
  ['Félix Dubreuil', 'Orbite Studio', 'Fondateur', 'Montreal AI meetup', MINE, ['Product', 'AI'], ['Product Strategy'], 5, 4, null],
  ['Hannah Weiss', 'Cadence Health', 'Responsable des partenariats', 'TechCrunch Disrupt 2024', 'Berlin', ['Longevity', 'AI'], ['Business Development'], 4, 75, null],
  ['Raphaël Lemieux', 'Lemieux Conseil', 'Consultant', 'Montreal AI meetup', MINE, ['AI'], ['Project Management'], 3, 190, null],
  // Grappe 3 : organisation d'événements (22 à 27)
  ['Camille Aubry', 'Studio Aubry Événements', 'Productrice', 'PDAC 2026', 'Toronto', ['Event Planning', 'Community Building'], ['Event Planning', 'Logistics'], 5, 11, null],
  ['Dominic Saucier', 'Scène Mobile', 'Directeur technique', 'Festival Montréal Tech', MINE, ['Event Planning'], ['Logistics', 'Audio-visual'], 3, 100, null],
  ['Léa Marchetti', 'Palais des Congrès', 'Coordonnatrice des ventes', 'Festival Montréal Tech', MINE, ['Event Planning'], ['Negotiation', 'Sales'], 4, 50, null],
  ['Simon Vachon', 'Vachon Traiteur', 'Chef traiteur', 'Festival Montréal Tech', MINE, ['Event Planning', 'Longevity'], ['Catering'], 2, 230, null],
  ['Amélie Ouellet', 'Cercle des fondateurs', 'Animatrice de communauté', 'Montreal AI meetup', MINE, ['Community Building', 'AI'], ['Community Building'], 4, 28, null],
  ['Karim Zidane', 'Zidane Sponsors', 'Courtier en commandites', 'VRIC', MINE, ['Event Planning', 'Mining'], ['Sales', 'Capital Raising'], 3, 160, 10],
];
// Ville de travail (indice de C -> [habite, travaille]) : le globe place le contact à l'habitation, sinon au travail.
const WHERE = { 3: ['Longueuil', MINE], 6: ['Laval', MINE], 13: ['', 'Paris'], 16: ['Lyon', 'Genève'], 20: ['', 'Londres'], 25: ['Lévis', 'Québec'], 2: ['', 'Vancouver'], 9: ['Brossard', MINE] };
// Pas de lien pour ces contacts sauf un seul (contacts forts à peu relier, vus dans « à mieux relier ») : indices de C.
const LOOSE = { 9: 7, 12: 13, 24: 22 };
// Ponts entre grappes : mines <-> événements, événements <-> IA, mines <-> IA (par un seul contact).
const BRIDGES = [[0, 22], [22, 13], [4, 14], [20, 26]];
const NOTES = {
  0: ['Rencontré au stand de Nordique Lithium ; intéressé par une visite de site en juin.'],
  5: ['Peut présenter deux acheteurs européens. À relancer après son retour du Maroc.'],
  9: ['Cherche des projets de longévité à financer ; très réactive par courriel.', 'Dîner organisé avec Sophie Tremblay-Lacasse.'],
  12: ['Veut tester une version bêta de notre outil ; partager la démo.'],
  19: ['Fondateur sérieux, mène un second tour de financement.'],
  22: ['A organisé le souper de clôture au PDAC ; connaît tout le monde.'],
};

function emilienId() {
  const u = db.prepare("SELECT id FROM users WHERE name = 'Emilien' AND lastName = 'Staging'").get()
    || db.prepare("SELECT id FROM users WHERE name = 'Emilien' ORDER BY createdAt LIMIT 1").get();
  return u ? u.id : null;
}

function edgePairs() {
  const clusters = [[0, 11], [12, 21], [22, 27]];
  const pairs = new Set();
  const add = (x, y) => { if (x !== y) pairs.add(Math.min(x, y) + '-' + Math.max(x, y)); };
  clusters.forEach(([lo, hi]) => {
    for (let i = lo; i <= hi; i++) for (let j = i + 1; j <= hi; j++) if (j - i <= 2 || (i + j) % 4 === 0) add(i, j);
  });
  BRIDGES.forEach(([x, y]) => add(x, y));
  const out = [...pairs].map((p) => p.split('-').map(Number)).filter(([x, y]) => !(x in LOOSE) && !(y in LOOSE));
  Object.entries(LOOSE).forEach(([x, y]) => out.push([Math.min(Number(x), y), Math.max(Number(x), y)]));
  return out;
}

function seedNetworkDemo() {
  const owner = emilienId();
  if (!owner) return 0;
  db.prepare('DELETE FROM network_contacts WHERE ownerId = ?').run(owner);
  const now = Date.now();
  const iso = (d) => new Date(now + d * 86400000).toISOString();
  const insC = db.prepare(`INSERT INTO network_contacts (ownerId, name, company, role, whereMet, city, workCity, interests, skills, strength, lastTouchAt, followUpAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insN = db.prepare('INSERT INTO network_notes (contactId, ownerId, body, createdAt) VALUES (?, ?, ?, ?)');
  const insE = db.prepare('INSERT OR IGNORE INTO network_edges (ownerId, a, b) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    const ids = C.map((c, i) => {
      const created = iso(-(c[8] + 20 + (i * 7) % 120));
      const w = WHERE[i] || [c[4], ''];
      return Number(insC.run(owner, c[0], c[1], c[2], c[3], w[0], w[1], JSON.stringify(c[5]), JSON.stringify(c[6]), c[7], iso(-c[8]), c[9] === null ? null : iso(c[9]), created).lastInsertRowid);
    });
    edgePairs().forEach(([x, y]) => insE.run(owner, Math.min(ids[x], ids[y]), Math.max(ids[x], ids[y])));
    Object.entries(NOTES).forEach(([i, list]) => list.forEach((body, k) => insN.run(ids[i], owner, body, iso(-C[i][8] - k))));
    // Quelques contacts créés ce mois-ci pour la croissance.
    db.prepare('UPDATE network_contacts SET createdAt = ? WHERE id IN (?, ?, ?)').run(new Date().toISOString(), ids[0], ids[13], ids[24]);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return C.length;
}

function seedNetworkDemoOnStaging() {
  if (!scen.isStaging() || process.env.SEED_NETWORK_DEMO === '0') return null;
  const n = seedNetworkDemo();
  if (n) console.log('[network-demo-staging] ' + n + ' contacts de démonstration');
  return n;
}

module.exports = { seedNetworkDemo, seedNetworkDemoOnStaging };
