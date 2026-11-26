// Fiche d'une catégorie (18 nov. 2026) : retraits (temps dépensé, objectifs en cours), menu « Responsables » en premier, hiérarchie des droits (serveur) et accès réservé aux responsables.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-fiche-resp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.statusCode === code; } };
// ---- Interface : source ----
const src = fs.readFileSync('public/js/objectifs-creer.js', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('  function openFiche(spec, onEnd) {'), end = src.indexOf('\n  }\n', start);
const body = src.slice(start, end);
assert(start > 0 && end > start, 'openFiche trouvée');
assert(!/category-stats|timeShares|paintTime|winQuery|Temps dépensé|Objectifs en cours|dotsMenu/.test(body), 'plus de temps dépensé, d’objectifs en cours ni de menu ⋯ dans la fiche');
assert(!/function (fmtHours|isoDay)\(/.test(src), 'fonctions du temps dépensé retirées');
const fns = new Set([...body.matchAll(/^\s*function (\w+)\(/gm)].map((m) => m[1]));
const clash = [...body.matchAll(/\bvar (\w+)\b/g)].map((m) => m[1]).filter((v) => fns.has(v));
assert(clash.length === 0, 'aucune variable ne masque une fonction de la fiche');
assert(body.indexOf('categoryBlock') > 0 && body.indexOf('categoryBlock') < body.indexOf('buildRepartitionBlock'), 'Responsables est le premier paramètre (avant le temps prévu)');
const ui = fs.readFileSync('public/js/responsables-ui.js', 'utf8');
assert(/activityEditRow/.test(ui) && /cmpChev|TMT\.ui\.chev/.test(ui) && /cmpRemove cmpRemove--corner/.test(ui) && /TMT\.ui\.addBtn/.test(ui) && /TMT\.ui\.dockEnregistrer/.test(ui) && /TMT\.ui\.confirm\([^)]*retirer ce responsable/.test(ui), 'composants existants : ligne + chevron, croix .cmpRemove, .cmpAdd, dock R50, confirmation');
assert(/danger: true/.test(ui), 'confirmation : bouton rouge pour retirer seulement');
const arbre = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8');
assert(/canOpenCategory/.test(arbre), 'l’arbre vérifie l’accès avant d’ouvrir la fiche');
// ---- Serveur : droits ----
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
['own:Propriétaire', 'ra:RespActivité', 'rp:RespPôle', 'rp2:RespPôle2', 'rs:RespSecteur', 'm:Membre', 'ext:Extérieur'].forEach((s) => { const [id, n] = s.split(':'); db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, n); });
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'ra', 'rp', 'rp2', 'rs', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(act, u));
categories.addCategory(act, 'Production'); const pole = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', pole); const sec = goals.secteursForPole(act, pole)[0].key;
const L = (u, k) => R.listeCategorie(u, act, k);
const ids = (d) => d.responsables.map((r) => r.id).sort().join(',');
const rem = (d, id) => (d.responsables.find((r) => r.id === id) || {}).removable === true;
// Propriétaire : seul responsable de départ, sans croix, jamais retirable
let d = L('own', '_');
assert(ids(d) === 'own' && !rem(d, 'own') && d.canOpen && d.canAdd, 'activité : le propriétaire est le seul responsable, sans croix');
assert(throws(() => R.retirerCategorie('own', act, '_', 'own'), 400), 'le propriétaire ne peut jamais être retiré');
// Ajout par le propriétaire au niveau activité, puis pôle et secteur
R.ajouterCategorie('own', act, '_', 'ra');
R.ajouterCategorie('ra', act, pole, 'rp'); R.ajouterCategorie('ra', act, pole, 'rp2');
R.ajouterCategorie('rp', act, sec, 'rs');
assert(throws(() => R.ajouterCategorie('rp', act, pole, 'm'), 403), 'un responsable de pôle n’ajoute pas au niveau de son pôle');
assert(throws(() => R.ajouterCategorie('rs', act, sec, 'm'), 403), 'un responsable de secteur n’ajoute personne');
assert(throws(() => R.ajouterCategorie('m', act, sec, 'm'), 403), 'un simple membre n’ajoute personne');
assert(throws(() => R.ajouterCategorie('own', act, pole, 'ext'), 400), 'seul un membre peut être responsable');
assert(throws(() => R.ajouterCategorie('own', act, pole, 'rp'), 400), 'déjà responsable : refusé');
// Liste du pôle : propriétaire, responsable d'activité (hérités, sans croix pour qui est moins haut), responsables du pôle
d = L('own', pole);
assert(ids(d) === 'ra,own,rp,rp2'.split(',').sort().join(','), 'pôle : propriétaire + responsable d’activité + responsables du pôle');
assert(rem(d, 'rp') && rem(d, 'rp2') && !rem(d, 'ra') && !rem(d, 'own'), 'propriétaire sur la fiche du pôle : croix sur les responsables du pôle seulement');
d = L('ra', pole); assert(rem(d, 'rp') && rem(d, 'rp2') && !rem(d, 'own') && !rem(d, 'ra'), 'responsable d’activité : retire un responsable de pôle, pas le propriétaire ni un pair');
d = L('rp', pole); assert(d.canOpen && !rem(d, 'rp2') && !rem(d, 'rp') && !rem(d, 'ra') && !d.canAdd, 'responsable de pôle : aucune croix (même niveau et niveaux supérieurs), pas d’ajout');
assert(throws(() => R.retirerCategorie('rp', act, pole, 'rp2'), 403), 'serveur : deux responsables de même niveau ne se retirent pas');
assert(throws(() => R.retirerCategorie('rp', act, pole, 'ra'), 403), 'serveur : un niveau inférieur ne retire pas un niveau supérieur');
// Secteur
d = L('rp', sec); assert(rem(d, 'rs') && d.canAdd && d.candidates.some((c) => c.id === 'm') && !d.candidates.some((c) => c.id === 'rs'), 'responsable de pôle : croix sur le responsable de secteur, ajout possible, candidats = membres pas encore responsables');
d = L('rs', sec); assert(d.canOpen && !rem(d, 'rs') && !d.canAdd && ids(d).includes('rp') && ids(d).includes('own'), 'responsable de secteur : voit la fiche de son secteur sans aucune croix ni ajout');
d = L('rp2', sec); assert(d.canOpen && rem(d, 'rs'), 'autre responsable du même pôle : mêmes droits sur le secteur');
// Accès à la fiche : seuls les responsables (et le propriétaire) ; un membre simple : rien ; un autre pôle : rien
d = L('m', pole); assert(!d.canOpen && d.responsables.length === 0, 'simple membre : fiche du pôle refusée (aucune donnée)');
d = L('m', '_'); assert(!d.canOpen, 'simple membre : fiche de l’activité refusée');
d = L('rs', pole); assert(!d.canOpen, 'responsable de secteur : pas la fiche du pôle');
d = L('rp', '_'); assert(!d.canOpen, 'responsable de pôle : pas la fiche de l’activité');
categories.addCategory(act, 'Vente'); const pole2 = goals.categoriesForActivity(act).map((c) => c.key).filter((k) => k !== pole)[0];
d = L('rp', pole2); assert(!d.canOpen, 'responsable d’un pôle : pas la fiche d’un autre pôle');
d = L('ra', pole2); assert(d.canOpen, 'responsable d’activité : toutes les fiches');
assert(throws(() => L('ext', pole), 403), 'non-membre : refusé');
// Retrait effectif, puis ajout par le propriétaire d'un responsable d'activité retiré
d = R.retirerCategorie('ra', act, pole, 'rp2'); assert(!ids(d).includes('rp2'), 'retrait effectué par le niveau supérieur');
d = R.retirerCategorie('own', act, '_', 'ra'); assert(!ids(d).includes('ra'), 'le propriétaire retire un responsable d’activité');
assert(!R.isManager('ra', act), 'et il n’est plus responsable de l’activité');
// Activité : deux responsables d'activité ne se retirent pas entre eux (durcissement), mais le propriétaire le peut
R.ajouterCategorie('own', act, '_', 'ra'); R.ajouterCategorie('ra', act, '_', 'rp2');
assert(throws(() => R.retirerCategorie('ra', act, '_', 'rp2'), 403) && throws(() => R.retirer('ra', act, 'rp2'), 403), 'activité : même niveau, pas de retrait mutuel (routes fiche et liste des membres)');
const lst = R.lister('own', act); assert(lst.isOwner === true && R.lister('ra', act).isOwner === false, 'lister indique qui est propriétaire (le menu des membres masque « Retirer » aux autres)');
R.retirer('own', act, 'rp2'); assert(!R.isManager('rp2', act), 'le propriétaire retire via la liste des membres');
// Ancienne route (un responsable par catégorie) : migration de table et compatibilité
assert(db.prepare("PRAGMA table_info(category_managers)").all().filter((c) => c.pk > 0).length === 3, 'table category_managers : clé primaire à 3 colonnes (plusieurs responsables par catégorie)');
R.definirCategorie('own', act, pole2, 'm'); R.definirCategorie('own', act, pole2, 'rp');
assert(R.categorie('own', act, pole2).userId === 'rp' && db.prepare('SELECT COUNT(*) c FROM category_managers WHERE activityId = ? AND categoryKey = ?').get(act, pole2).c === 1, 'ancienne route : un seul responsable choisi, remplaçable');
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('fiche-responsables-test : OK');
