const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const { makePinRecord, verifyPinRecord, isValidPinFormat, isLocked, registerFailure, registerSuccess } = require('../lib/auth');
const { isInPalette, pairedColor } = require('../lib/theme');

const router = express.Router();

const PALETTE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];

// Validation volontairement légère (format uniquement) : pas de vérification
// réelle (aucun SMS/email de confirmation envoyé) — juste de quoi filtrer
// une saisie manifestement incomplète ou invalide.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;

// Langues proposées par l'interface (voir public/i18n.js). L'anglais est la
// langue par défaut de tout nouveau compte depuis le 29 août 2026 ; les
// profils créés avant ont été basculés en français par la migration de
// server/db.js. La traduction est entièrement côté client : cette valeur
// n'est qu'une préférence stockée avec le profil, elle ne change rien aux
// réponses du serveur (toujours rédigées en français, traduites à
// l'affichage par i18n.js).
const LANGS = ['en', 'fr'];
const DEFAULT_LANG = 'en';

function pickColor() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  return PALETTE[n % PALETTE.length];
}

// Liste légère (id, name, color, theme, hasPin) — utilisée par l'onboarding
// "J'ai déjà un profil" et par l'onglet Communauté. hasPin dit juste si un
// code a déjà été défini, jamais le code lui-même (ni même son hash).
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, name, color, createdAt, pin, theme FROM users ORDER BY name COLLATE NOCASE').all();
  res.json(rows.map((u) => ({ id: u.id, name: u.name, color: u.color, createdAt: u.createdAt, hasPin: !!u.pin, theme: u.theme })));
});

// Création de profil (initialisation de l'app). Un code PIN (4 à 6
// chiffres) est obligatoire dès la création : c'est ce qui empêche
// quelqu'un d'autre de récupérer ce profil juste en connaissant le prénom.
// Depuis le 29 août 2026, l'identité complète (nom de famille, téléphone,
// email) est également demandée dès la création — voir EMAIL_RE/PHONE_RE
// plus haut et le commentaire sur les colonnes correspondantes dans
// server/db.js pour les profils créés avant ce changement. Le thème démarre
// toujours en sombre (défaut de toute l'app) ; il se change ensuite depuis
// Paramètres.
router.post('/profile', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le prénom (ou pseudo) est requis.' });

  const lastName = (req.body.lastName || '').trim();
  if (!lastName) return res.status(400).json({ error: 'Le nom de famille est requis.' });

  const phone = (req.body.phone || '').trim();
  if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'Un numéro de téléphone valide est requis.' });

  const email = (req.body.email || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Une adresse email valide est requise.' });

  const pin = (req.body.pin || '').trim();
  if (!isValidPinFormat(pin)) return res.status(400).json({ error: 'Le code doit comporter 4 à 6 chiffres.' });

  const existing = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return res.status(409).json({ error: `"${name}" existe déjà. Choisis un autre nom, ou récupère ton profil si c'est toi.` });

  const lang = LANGS.indexOf(req.body.lang) !== -1 ? req.body.lang : DEFAULT_LANG;

  const id = randomUUID();
  const color = (req.body.color || pickColor());
  const createdAt = new Date().toISOString();
  // shareProfile démarre toujours à 1 : le partage de profil avec ses
  // abonnés n'est plus un choix (voir le commentaire sur PUT ci-dessous et
  // la migration correspondante dans server/db.js pour les profils déjà
  // existants créés avant ce changement).
  db.prepare('INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .run(id, name, lastName, phone, email, color, createdAt, makePinRecord(pin), 'dark', lang);
  res.status(201).json({ id, name, lastName, phone, email, color, createdAt, theme: 'dark', lang, shareProfile: true, avatar: null });
});

router.get('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT id, name, lastName, phone, email, color, createdAt, theme, lang, shareProfile, avatar FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json({ id: user.id, name: user.name, lastName: user.lastName || null, phone: user.phone || null, email: user.email || null, color: user.color, createdAt: user.createdAt, theme: user.theme, lang: user.lang || DEFAULT_LANG, shareProfile: !!user.shareProfile, avatar: user.avatar || null });
});

// Taille max d'une photo de profil UNE FOIS encodée en data URL (~1.5 Mo
// d'image réelle) — le client redimensionne/compresse déjà systématiquement
// avant l'envoi (voir app.js), cette limite est un garde-fou serveur contre
// un client qui contournerait cette étape, pas le chemin normal.
const MAX_AVATAR_LENGTH = 2_000_000;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

// Modifie nom / couleur perso / thème / photo de profil. Changer de thème
// reclasse automatiquement les couleurs d'activités de ce profil qui ne
// feraient plus partie de la palette du nouveau thème — en gardant la même
// teinte (même "couleur"), seule la luminosité change (voir pairedColor
// dans lib/theme). shareProfile n'est plus modifiable via cette route (ni
// via aucune interface) : il est fixé à 1 dès la création (voir POST
// ci-dessus) et pour les profils créés avant ce changement (voir la
// migration dans server/db.js) — un éventuel `shareProfile` envoyé dans le
// corps de la requête est donc ignoré. avatar suit la même logique "envoyé
// = remplacé" que les autres champs, avec un cas particulier : `avatar:
// null` (ou une chaîne vide) retire la photo, alors que le champ absent du
// corps de la requête laisse la photo actuelle inchangée — nécessaire pour
// qu'Enregistrer (qui n'envoie pas toujours de nouvelle photo) ne l'efface
// jamais par erreur.
router.put('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || user.name).trim();
  const color = req.body.color || user.color;
  const theme = req.body.theme === 'light' ? 'light' : (req.body.theme === 'dark' ? 'dark' : user.theme);
  const shareProfile = user.shareProfile;
  // lang : même principe que theme — champ absent = valeur actuelle
  // inchangée ; valeur inconnue refusée plutôt que silencieusement ignorée
  // (une langue non prévue laisserait l'interface à moitié traduite).
  if (req.body.lang !== undefined && LANGS.indexOf(req.body.lang) === -1) {
    return res.status(400).json({ error: 'Langue invalide.' });
  }
  const lang = req.body.lang !== undefined ? req.body.lang : (user.lang || DEFAULT_LANG);

  // lastName/phone/email suivent le même principe que `name` : champ absent
  // du corps de la requête = valeur actuelle inchangée (permet d'enregistrer
  // le reste sans forcer un profil déjà existant, créé avant ce champ, à le
  // remplir tout de suite) ; champ envoyé explicitement vide = refusé (400),
  // ces champs ne peuvent pas être vidés une fois remplis. Un champ envoyé
  // non vide est revalidé au même format qu'à la création.
  const lastName = (req.body.lastName !== undefined ? req.body.lastName : (user.lastName || '')).trim();
  if (req.body.lastName !== undefined && !lastName) return res.status(400).json({ error: 'Le nom de famille ne peut pas être vide.' });

  const phone = (req.body.phone !== undefined ? req.body.phone : (user.phone || '')).trim();
  if (req.body.phone !== undefined && !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });

  const email = (req.body.email !== undefined ? req.body.email : (user.email || '')).trim();
  if (req.body.email !== undefined && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse email invalide.' });

  let avatar = user.avatar;
  if (req.body.avatar !== undefined) {
    if (!req.body.avatar) {
      avatar = null;
    } else if (typeof req.body.avatar !== 'string' || !AVATAR_DATA_URL_RE.test(req.body.avatar)) {
      return res.status(400).json({ error: 'Format de photo invalide.' });
    } else if (req.body.avatar.length > MAX_AVATAR_LENGTH) {
      return res.status(400).json({ error: 'Photo trop lourde — réessaie avec une image plus petite.' });
    } else {
      avatar = req.body.avatar;
    }
  }

  const clash = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?').get(name, user.id);
  if (clash) return res.status(409).json({ error: `"${name}" est déjà pris par un autre profil.` });

  db.prepare('UPDATE users SET name = ?, lastName = ?, phone = ?, email = ?, color = ?, theme = ?, lang = ?, shareProfile = ?, avatar = ? WHERE id = ?')
    .run(name, lastName || null, phone || null, email || null, color, theme, lang, shareProfile, avatar, user.id);

  if (theme !== user.theme) {
    const memberships = db.prepare('SELECT activityId, color FROM activity_members WHERE userId = ?').all(user.id);
    const updateColor = db.prepare('UPDATE activity_members SET color = ? WHERE activityId = ? AND userId = ?');
    memberships.forEach((m) => {
      if (!isInPalette(m.color, theme)) {
        updateColor.run(pairedColor(m.color, user.theme, theme), m.activityId, user.id);
      }
    });
  }

  res.json({ id: user.id, name, lastName: lastName || null, phone: phone || null, email: email || null, color, theme, lang, shareProfile: !!shareProfile, avatar: avatar || null, createdAt: user.createdAt });
});

// Vérifie le code d'un profil avant de le "récupérer" depuis "J'ai déjà un
// profil" (typiquement depuis un autre appareil/navigateur). Ne renvoie le
// profil qu'en cas de succès, et protège contre le bourrinage.
router.post('/profile/:id/verify-pin', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!user.pin) return res.status(409).json({ error: 'Ce profil n\'a pas encore de code.', needsPin: true });
  if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });

  const pin = (req.body.pin || '').trim();
  if (!verifyPinRecord(pin, user.pin)) {
    registerFailure(user.id);
    return res.status(401).json({ error: 'Code incorrect.' });
  }

  registerSuccess(user.id);
  res.json({ id: user.id, name: user.name, lastName: user.lastName || null, phone: user.phone || null, email: user.email || null, color: user.color, createdAt: user.createdAt, theme: user.theme, lang: user.lang || DEFAULT_LANG, shareProfile: !!user.shareProfile, avatar: user.avatar || null });
});

// Définit le code d'un profil qui n'en a pas encore (comptes créés avant
// l'ajout de cette protection), ou le change depuis Paramètres — dans ce
// cas l'ancien code doit être fourni et correct.
router.post('/profile/:id/set-pin', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const newPin = (req.body.pin || '').trim();
  if (!isValidPinFormat(newPin)) return res.status(400).json({ error: 'Le code doit comporter 4 à 6 chiffres.' });

  if (user.pin) {
    if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });
    const currentPin = (req.body.currentPin || '').trim();
    if (!verifyPinRecord(currentPin, user.pin)) {
      registerFailure(user.id);
      return res.status(401).json({ error: 'Code actuel incorrect.' });
    }
    registerSuccess(user.id);
  }

  db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(makePinRecord(newPin), user.id);
  res.json({ ok: true });
});

// Suppression définitive d'un compte (29 août 2026, demande d'Emilien).
// Confirmée par le code PIN du profil — même mécanisme, même protection
// anti-bourrinage que la récupération d'un profil depuis un autre appareil
// (voir /verify-pin ci-dessus).
//
// Règle de fond, alignée sur "Supprimer définitivement" côté activité (voir
// server/routes/activities.js) : on part, les autres restent. Concrètement :
//  - l'historique, les notes en direct et le chrono en cours de CE profil
//    sont supprimés ;
//  - ses appartenances aux activités sont retirées ; une activité encore
//    suivie par quelqu'un d'autre continue d'exister, avec transfert
//    automatique de la propriété au membre restant le plus ancien si le
//    compte supprimé en était propriétaire ;
//  - une activité que plus personne ne suit est effacée si plus aucun
//    historique n'y fait référence, sinon simplement masquée (active = 0 +
//    deletedAt), comme ailleurs dans l'app : time_entries.activityId est une
//    clé étrangère NOT NULL sans cascade, la ligne ne peut donc pas
//    disparaître tant que quelqu'un a gardé son historique dessus ;
//  - les invitations, demandes de suivi et abonnements partent avec le
//    profil (ON DELETE CASCADE sur users, voir server/db.js).
router.delete('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!user.pin) return res.status(409).json({ error: 'Ce profil n\'a pas encore de code.', needsPin: true });
  if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });

  const pin = ((req.body && req.body.pin) || '').trim();
  if (!verifyPinRecord(pin, user.pin)) {
    registerFailure(user.id);
    return res.status(401).json({ error: 'Code incorrect.' });
  }
  registerSuccess(user.id);

  const now = new Date().toISOString();
  const memberships = db.prepare('SELECT activityId FROM activity_members WHERE userId = ?').all(user.id);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM time_entries WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM activity_members WHERE userId = ?').run(user.id);

    memberships.forEach((m) => {
      const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(m.activityId);
      if (!activity) return;

      const remaining = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(m.activityId).n;

      if (remaining > 0) {
        if (activity.ownerId === user.id) {
          const next = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC LIMIT 1').get(m.activityId);
          db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(next ? next.userId : null, m.activityId);
        }
        return;
      }

      const stillReferenced =
        db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE activityId = ?').get(m.activityId).n > 0 ||
        db.prepare('SELECT COUNT(*) AS n FROM running_timers WHERE activityId = ?').get(m.activityId).n > 0;

      if (stillReferenced) {
        db.prepare('UPDATE activities SET active = 0, deletedAt = ?, ownerId = NULL WHERE id = ?').run(now, m.activityId);
      } else {
        db.prepare('DELETE FROM activities WHERE id = ?').run(m.activityId);
      }
    });

    // Filet de sécurité : une activité dont ce profil serait encore
    // propriétaire sans en être membre (cas qui ne devrait pas exister)
    // empêcherait la suppression de la ligne users (clé étrangère
    // activities.ownerId, sans cascade).
    db.prepare('UPDATE activities SET ownerId = NULL WHERE ownerId = ?').run(user.id);

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ message: 'Compte supprimé.' });
});

module.exports = router;