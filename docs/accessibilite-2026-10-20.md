# Accessibilité et robustesse Basic — 20 oct. 2026 (repli 7)

Mesure : 390 px, écrans Chrono et Stats (feuille de temps, répartition, graphique), base de démo, fenêtre `#marketingInviteModal` fermée. Aucune interface, couleur ou option ajoutée.

## 1. Zones tactiles < 44 px
| Élément | Avant | Après (zone cliquable) |
|---|---|---|
| Avatar `#whoami`, engrenage `#profileSettingsBtn` | 36×36 | 44×44 (zone invisible `::after`) |
| `‹` `›` de la feuille de temps, menus `⋮` (feuille, graphique) | 32×32 | 44×44 |
| Filtre `#statsVisBtn` (Tous) | 69×34 | 69×44 (`::before`, la flèche ▾ est conservée) |
| Bouton « Aujourd'hui » du camembert | 112×28 | 112×44 |
| Points de pagination `.goalsDotBtn` | 17×44 | inchangé : pas de 17 px voulu, élargir ferait chevaucher les points voisins (le balayage reste l'entrée principale) |

Correctif : un seul bloc CSS en fin de `public/styles.css` ; capture avant/après identique (apparence inchangée).

## 2. Textes coupés / débordements
- Aucun texte coupé ni hors écran sur Chrono. Sur Stats, seul débordement : la grille horaire de la feuille de temps, défilement horizontal voulu (24 h) ; les libellés de jour restent lisibles. Non modifié.

## 3. Contrastes
- 0 texte sous 4,5:1 (3:1 pour grand texte) mesuré sur Chrono et Stats (couleur effective sur fond composé). Cohérent avec `scripts/contrast-report.js`. Rien à corriger.

## 4. Hors ligne et reconnexion (serveur)
Test : `test/offline-idempotence-test.js`.
- Avant : rejeu séquentiel de la même clé `Idempotency-Key` = une seule tâche (OK). **Trou trouvé** : deux requêtes de même clé en parallèle (réponse perdue puis réémission pendant que la 1re classification tourne) créaient un doublon.
- Après : `server/routes/goals.js` partage la requête en cours par clé (`idemInFlight`) : une seule tâche, même réponse.
- Ajouté au test : parallèle (une tâche) ; échec serveur puis rejeu (rien n'est mémorisé, la tâche est créée au rejeu : aucune perte).

## 5. Croix ✕ des pop-up (repli 18)
Test : `test/popups-croix-test.js` (22 pop-up de `index.html`). Tous ont une croix ✕ avec `aria-label`, que Échap active (`js/a11y-popups.js`). Seul écart, voulu : `marketingInviteModal` (question de consentement, « J'accepte » / « Non merci » tient lieu de fermeture ; une croix serait un refus implicite). Aucune croix ajoutée.
