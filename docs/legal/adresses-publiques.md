# Adresses publiques des documents légaux

Apple (App Store) et Google (Play Store) exigent une adresse web publique de la politique de confidentialité. Les trois documents sont servis sans connexion, sur le domaine de l'application ET sur `compagnienoesis.com` / `www.compagnienoesis.com` :

| Document | Français | Anglais |
|---|---|---|
| Politique de confidentialité | `/confidentialite` | `/en/privacy` |
| Conditions d'utilisation | `/conditions` | `/en/terms` |
| Mentions légales | `/mentions-legales` | `/en/legal-notice` |

Adresse à saisir dans les fiches des boutiques : `https://compagnienoesis.com/confidentialite` (et `https://compagnienoesis.com/en/privacy` pour l'anglais).

Le texte n'existe qu'en une version : `server/lib/legalpages.js` le lit dans les fenêtres de `public/index.html` (français) et dans `public/legal-en.js` (anglais), puis le met en page (fond noir, sans script, sans cookie). Modifier le texte dans ces deux fichiers met à jour les pages (cache mémoire invalidé par la date de modification ; cache navigateur de 5 minutes). Test : `test/pages-legales-test.js`.
