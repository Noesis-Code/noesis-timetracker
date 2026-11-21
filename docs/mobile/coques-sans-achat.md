# Coques iOS et Android : aucun achat d'Expansion

*Décision d'Émilien, 21 nov. 2026 (Apple 3.1.1, règles Google Play). L'achat d'Expansion se fait sur le site web avec Stripe, inchangé. Ce n'est pas un avis juridique.*

## Détection
`public/js/native-shell.js` (chargé en tout premier) pose, sur iOS et Android seulement : `window.TMT_NATIVE_SHELL` (`'ios'` ou `'android'`), la classe `coqueNative` sur `<html>`, et l'en-tête `X-TMT-Coque` sur chaque `fetch`. Navigateur et staging web : rien de tout cela.

## Retiré dans la coque
- Carte promo Expansion de la Feuille de route (texte, prix « 20 $/mois », « Découvrir Expansion ») et modale « Souscrire à Expansion » : cachées (`html.coqueNative …` dans `public/css/objectifs-creer.css`) ; `openOffer1CheckoutModal` ne fait rien.
- « Résilier mon abonnement » (portail Stripe) : caché, clic sans effet.
- « + » de découverte d'Expansion de la fenêtre d'activité : masqué sans Expansion (visible, avec ses fonctions, pour un abonné).
- Barre d'ajout des tâches : le message « Expansion n'est actif sur aucune de tes activités… » reste, sans bouton « Découvrir Expansion ».
- Création d'objectif : bouton « Génère automatiquement tes tâches avec Noèsis » absent.
- Serveur (`server/routes/offercheckout.js`) : `POST /offer/checkout` et `POST /offer/portal` répondent 403 avec `X-TMT-Coque` ; `GET /offer/available` répond `false`. Web : inchangé.

## Conservé
Un abonné via le site garde ses fonctions Expansion (aucune écriture sur le droit d'accès) ; la liste de ses abonnements (activité et statut, sans lien) reste dans Réglages > Mon IA.

## À décider / non vérifié
- « J'ai un code » (code d'accès gratuit, `objectifs-offre1-code.js`) reste visible : ce n'est pas un achat ; à valider avec le juriste.
- Les textes légaux (`public/index.html`, `legal-en.js`) mentionnent encore des prix ; ils ne sont pas des appels à l'achat, non touchés.
- Rien testé sur appareil (coque iOS/Android) ; la détection Android suppose que Capacitor est injecté avant `native-shell.js` (server.url).
- Note pour `docs/mobile/fiches-boutiques-corrections.md` (non suivi, dossier principal) : écart n° 1 traité par ce chantier ; la phrase « no in-app purchase » des notes de revue devient vraie une fois cette branche en production.
