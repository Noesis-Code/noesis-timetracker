// Mot de passe oublié : demander un lien par courriel, puis choisir un nouveau mot de passe (demande d'Émilien, 26 oct. 2026).
// La réponse à la demande est toujours la même, que le courriel existe ou non (on ne révèle pas quels comptes existent).
// Changer le mot de passe déconnecte tous les autres appareils ; l'appareil qui vient de le changer reste connecté.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { setSessionCookie, bumpSessionEpoch } = require('../lib/session');
const { checkPasswordStrength, makePinRecord } = require('../lib/auth');
const reset = require('../lib/passwordreset');
const { sendMail } = require('../lib/mail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC = { ok: true, message: 'Si un compte correspond à ce courriel, un lien vient d’y être envoyé.' };

// Fenêtres glissantes en mémoire (une seule instance).
const hits = new Map();
function limited(key, max, windowMs, now = Date.now()) {
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= windowMs) hits.delete(k);
  return arr.length > max;
}

// Adresse du site mise dans le lien : jamais déduite d'un en-tête Host étranger (sinon un tiers ferait envoyer un lien vers son propre site).
// APP_BASE_URL la fixe ; sinon le domaine Railway ; en test et en local, l'adresse de la requête.
function baseUrl(req, env = process.env) {
  if (env.APP_BASE_URL) return String(env.APP_BASE_URL).replace(/\/+$/, '');
  if (env.RAILWAY_PUBLIC_DOMAIN) return 'https://' + env.RAILWAY_PUBLIC_DOMAIN;
  const host = String(req.hostname || '');
  if (env.NODE_ENV === 'test' || host === 'localhost' || host === '127.0.0.1') return req.protocol + '://' + req.get('host');
  return null;
}

router.post('/password/forgot', async (req, res) => {
  if (limited('ip:' + (req.ip || 'inconnu'), 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Trop de demandes. Réessaie dans quelques minutes.' });
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Adresse email invalide.' });
  if (limited('mail:' + email, 3, 60 * 60 * 1000)) return res.json(GENERIC); // au plus 3 courriels par heure pour une même adresse
  const base = baseUrl(req);
  const users = db.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').all(email);
  if (base) {
    for (const u of users) {
      try {
        const link = base + '/?reset=' + reset.issue(u.id);
        await sendMail({
          to: email,
          subject: 'Noèsis : change ton mot de passe',
          text: 'Bonjour ' + (u.name || '') + ',\n\nTu as demandé à changer ton mot de passe Noèsis. Ouvre ce lien dans l’heure qui suit :\n\n' + link
            + '\n\nSi tu n’as pas fait cette demande, ignore ce courriel : ton mot de passe actuel reste valable.\n\nL’équipe Noèsis',
        });
      } catch (e) {
        console.error('[password/forgot] envoi impossible :', e && e.message ? e.message : e); // jamais de jeton ni de lien dans les journaux
      }
    }
  } else {
    console.error('[password/forgot] APP_BASE_URL (ou RAILWAY_PUBLIC_DOMAIN) n’est pas posée : aucun lien envoyé.');
  }
  res.json(GENERIC);
});

router.post('/password/reset', (req, res) => {
  if (limited('reset:' + (req.ip || 'inconnu'), 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
  const token = String((req.body && req.body.token) || '');
  const password = String((req.body && req.body.password) || '').trim();
  const userId = reset.peek(token);
  if (!userId) return res.status(400).json({ error: 'Lien invalide ou expiré. Demande un nouveau lien.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(400).json({ error: 'Lien invalide ou expiré. Demande un nouveau lien.' });
  const strength = checkPasswordStrength(password, user);
  if (!strength.ok) return res.status(400).json({ error: strength.error }); // le lien reste valable : on peut réessayer
  if (!reset.consume(token)) return res.status(400).json({ error: 'Lien invalide ou expiré. Demande un nouveau lien.' });
  db.prepare('UPDATE users SET pin = ?, passwordStrong = 1, pinFailCount = 0, pinLockedUntil = NULL WHERE id = ?').run(makePinRecord(password), user.id);
  bumpSessionEpoch(user.id); // tous les autres appareils sont déconnectés
  setSessionCookie(req, res, user.id); // celui-ci reste connecté
  res.json({ ok: true, id: user.id });
});

module.exports = router;
