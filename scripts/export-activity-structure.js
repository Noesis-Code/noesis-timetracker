#!/usr/bin/env node
// Exporte la STRUCTURE (pôles + secteurs, descriptions complètes) d'une activité
// d'un environnement (typiquement staging) vers data/structure-noesis.json.
// Usage : node scripts/export-activity-structure.js <url> <nom du profil> <NIP> "NOÈSIS"
// Aucune dépendance (fetch natif, Node 18+). Routes existantes seulement :
//   GET /api/users?q=  ->  POST /api/profile/:id/verify-pin (cookie de session)
//   GET /api/activities?all=1  ->  GET /api/activities/:id/goals/categories
// Limite : la route ne renvoie que les pôles/secteurs ACTIFS (removed = false) ;
// la couleur d'un pôle est automatique (par rang) donc color = '' ; l'ordre
// du tableau `position` fait foi.
const fs = require('fs');
const path = require('path');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const MAX_DESC = 200; // assertCategoryDescription (server/lib/goals.js)

async function main() {
  const [base0, profileName, pin, activityName] = process.argv.slice(2);
  if (!base0 || !profileName || !pin || !activityName) {
    console.error('Usage : node scripts/export-activity-structure.js <url> <nom du profil> <NIP> "NOÈSIS"');
    process.exit(2);
  }
  const base = base0.replace(/\/+$/, '');
  let cookie = '';
  async function api(method, url, body) {
    const res = await fetch(base + '/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const sess = sc.map((c) => c.split(';')[0]).find((c) => c.startsWith('noesis_session='));
    if (sess) cookie = sess;
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + ((data && data.error) || text.slice(0, 200)));
    return data;
  }

  const found = await api('GET', '/users?q=' + encodeURIComponent(profileName));
  const matches = (found || []).filter((u) => norm(u.name + ' ' + (u.lastName || '')) === norm(profileName) || norm(u.name) === norm(profileName));
  if (matches.length !== 1) throw new Error(matches.length ? 'Plusieurs profils correspondent : ' + matches.map((u) => u.name + ' ' + (u.lastName || '')).join(', ') : 'Profil introuvable (il doit être visible dans l\'annuaire).');
  await api('POST', '/profile/' + matches[0].id + '/verify-pin', { pin });
  if (!cookie) throw new Error('Pas de cookie de session reçu.');

  const acts = (await api('GET', '/activities?all=1')).filter((a) => norm(a.name) === norm(activityName));
  if (acts.length !== 1) throw new Error(acts.length ? 'Plusieurs activités nommées ainsi.' : 'Activité introuvable pour ce profil.');
  const act = acts[0];

  const data = await api('GET', '/activities/' + act.id + '/goals/categories');
  const categories = []; const longOnes = [];
  (data.categories || []).forEach((p, i) => {
    categories.push({ key: p.key, label: p.label, description: p.description || '', parentKey: null, color: '', position: i, removed: false });
    (p.secteurs || []).forEach((s, j) => categories.push({ key: s.key, label: s.label, description: s.description || '', parentKey: p.key, color: '', position: j, removed: false }));
  });
  categories.forEach((c) => { if (c.description.length > MAX_DESC) longOnes.push(c.label + ' (' + c.description.length + ')'); });

  const out = { version: 1, activityName: act.name, categories };
  const file = path.join(__dirname, '..', 'data', 'structure-noesis.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  const poles = categories.filter((c) => !c.parentKey).length;
  console.log('OK : ' + poles + ' pôle(s), ' + (categories.length - poles) + ' secteur(s) -> ' + file);
  if (longOnes.length) console.warn('ATTENTION : descriptions > ' + MAX_DESC + ' caractères (limite de l\'app, NON appliquées par la migration) : ' + longOnes.join(' ; '));
}
main().catch((e) => { console.error('Erreur : ' + e.message); process.exit(1); });
