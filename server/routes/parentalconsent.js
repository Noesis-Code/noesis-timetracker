// Confirmation du consentement parental par le représentant légal d'un
// souscripteur de 16-17 ans à l'Offre 1 — point 5 du volet Légal du chantier
// paiement/abonnements (cadré le 13 septembre 2026, codé le 14).
//
// Distinct de server/routes/offercheckout.js : l'appelant ici n'est PAS
// authentifié (le représentant légal n'a pas de compte TimeTracker) —
// l'unique credential accepté est le token imprévisible reçu par courriel
// (server/lib/parentalconsent.js::createOrReuse), jamais un identifiant
// fourni autrement. Page HTML minimale, volontairement hors de
// l'application (public/app.js) : atteinte uniquement via le lien du
// courriel, jamais un écran de navigation normal — même logique que
// server/lib/calendarfeed.js (adresse imprévisible, pas de session).
const express = require('express');
const parentalconsent = require('../lib/parentalconsent');

const router = express.Router();
const OFFER1_PRICE_LABEL = '20 $/mois'; // libellé humain pour la page/le courriel — jamais une valeur lue depuis Stripe ici

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function page({ title, body }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Noèsis TimeTracker</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.5; color: #1a1a1a; }
  button { font: inherit; padding: 0.6rem 1.2rem; border: none; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  .muted { color: #555; font-size: 0.9rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

const NOT_FOUND_BODY = '<h1>Lien invalide</h1><p>Ce lien de consentement est introuvable. Il a peut-être été mal copié depuis le courriel.</p>';
const ALREADY_CONSUMED_BODY = "<h1>Déjà utilisé</h1><p>Le consentement a déjà été donné et l'abonnement a déjà été activé. Aucune action supplémentaire n'est nécessaire.</p>";
const EXPIRED_BODY = "<h1>Ce lien a expiré</h1><p>Ce lien de consentement n'est plus valide. Si la souscription est toujours d'actualité, demande à la personne concernée de relancer la démarche depuis l'application — un nouveau courriel te sera envoyé.</p>";

router.get('/offer/parental-consent/:token', (req, res) => {
  const request = parentalconsent.get(req.params.token);
  if (!request) return res.status(404).send(page({ title: 'Lien invalide', body: NOT_FOUND_BODY }));
  if (request.consumedAt) return res.send(page({ title: 'Déjà utilisé', body: ALREADY_CONSUMED_BODY }));
  if (parentalconsent.isExpired(request)) return res.status(410).send(page({ title: 'Lien expiré', body: EXPIRED_BODY }));

  if (request.confirmedAt) {
    return res.send(page({
      title: 'Déjà confirmé',
      body: "<h1>Consentement déjà confirmé</h1><p>Merci, c'est déjà noté. La personne concernée peut retourner dans l'application pour terminer son abonnement.</p>",
    }));
  }

  res.send(page({
    title: 'Consentement parental',
    body: `
      <h1>Consentement à un abonnement Offre 1</h1>
      <p><strong>${escapeHtml(request.guardianName)}</strong>, tu es indiqué·e comme représentant légal d'un utilisateur de Noèsis TimeTracker âgé de 16 ou 17 ans qui souhaite souscrire à l'Offre 1 (${OFFER1_PRICE_LABEL}, résiliable à tout moment).</p>
      <p>En vertu de l'article 157 du Code civil du Québec, cet engagement financier récurrent nécessite ton consentement exprès avant d'être activé.</p>
      <form method="post" action="/api/offer/parental-consent/${encodeURIComponent(request.token)}">
        <button type="submit">Je consens à cet abonnement</button>
      </form>
      <p class="muted">Si tu ne reconnais pas cette demande, ferme simplement cette page : aucun abonnement ne sera créé sans ta confirmation.</p>
    `,
  }));
});

router.post('/offer/parental-consent/:token', (req, res) => {
  const result = parentalconsent.confirm(req.params.token);
  if (result.error === 'not_found') return res.status(404).send(page({ title: 'Lien invalide', body: NOT_FOUND_BODY }));
  if (result.error === 'expired') return res.status(410).send(page({ title: 'Lien expiré', body: EXPIRED_BODY }));
  if (result.error === 'already_consumed') return res.send(page({ title: 'Déjà utilisé', body: ALREADY_CONSUMED_BODY }));

  res.send(page({
    title: 'Merci',
    body: "<h1>Merci, c'est confirmé</h1><p>Ton consentement a été enregistré. La personne concernée peut maintenant retourner dans l'application pour terminer son abonnement à l'Offre 1.</p>",
  }));
});

module.exports = router;
