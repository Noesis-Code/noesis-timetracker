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

## 6. Clavier et lecteur d'écran : Chrono et Stats (repli 25)
Tests : `test/a11y-chrono-stats-test.js` (texte), parcours réel au clavier vérifié sous Chromium 390 px.
| Écart relevé | Correction (attributs/CSS, aucun bouton ni couleur ajoutés) |
|---|---|
| `#liveTimer` : simple div, aucun rôle | `role="timer"` `aria-live="off"` (jamais annoncé chaque seconde) ; annonce polie dans une région `.srOnly` au démarrage puis toutes les 10 minutes pleines |
| `#chronoStatus` (hors ligne, erreurs) muet | `role="status"` `aria-live="polite"` ; erreur du récapitulatif d'arrêt : `role="alert"` |
| Récapitulatif d'arrêt sans rôle ni piège de focus ni Échap | `role="dialog"` modal nommé, ajouté au module `a11y-popups.js` ; Échap = « Annuler » (le chrono continue) |
| En-tête « Historique » : div cliquable, injoignable au clavier | `role="button"` `tabindex="0"` `aria-expanded` `aria-controls` ; Entrée/Espace activent tout `role="button"` non natif (lignes de légende du camembert comprises : elles avaient `tabindex` sans clavier) |
| Menus `⋮` et filtre « Tous » : `aria-haspopup` sans état | `aria-expanded` suivi automatiquement |
| Onglet courant non annoncé | `aria-current="page"` |
| Focus perdu au démarrage (la grille disparaît) | le focus passe sur STOP |
| Sélecteurs pôle/secteur : libellé non relié | `role="group"` + `aria-labelledby` |
| Graphique : `svg` sans rôle ; camembert : titre sans données | `role="img"` + résumé (période, total par série) ; camembert : chaque part et le total |
Déjà conformes : ordre de tabulation (profil, réglages, activités, historique, onglets : même ordre que l'écran), noms des boutons-icônes, contrastes (§3), zones 44 px (§1).
Reste (non corrigé, sans ajout d'interface) : la grille horaire de la feuille de temps n'a pas d'alternative texte propre (le camembert et l'historique portent les mêmes données) ; les tranches du camembert restent au toucher/souris (les lignes de légende, équivalentes, sont au clavier).

## 7. Limites de taille et caractères spéciaux (repli 25, Basic n°16)
Tests : `test/limites-caracteres-test.js` (serveur réel), `test/innerhtml-statique-test.js` (garde statique).
- Plafonds (caractères visibles, un emoji ZWJ ou un drapeau compte comme ses points de code, jamais coupé) : titre de tâche 300, nom d'activité 120 (nouveau : il n'y en avait pas), note de chrono/historique 5 000 (nouveau), message de discussion 2 000. Au-delà : 400 « … trop long (N caractères maximum). » (traduit EN). Aucune troncature.
- Textes non texte (nombre, objet, tableau, null) : 400 au lieu d'une erreur 500. Corrigé : `POST /api/history` sans `activityId` faisait un 500.
- Normalisation (invisible) : caractères de contrôle retirés ; saut de ligne d'un TITRE (tâche, activité) remplacé par une espace ; sauts de ligne des notes et messages conservés. HTML/JS stocké tel quel, échappé à l'affichage.
- Affichage 390 px (captures avec nom d'activité de 70 lettres + 6 émojis famille, pôle de 38 lettres, tâche de 240 lettres, note de 4 800 lettres, balise `<img onerror>`) : débordement trouvé et corrigé sur le graphique (légende), le bouton d'activité, le nom de l'activité en cours, la puce de capture, le nom du pôle (Feuille de route) ; aucun script exécuté.
- Garde statique : 230 `innerHTML`/`outerHTML`/`insertAdjacentHTML` de `public/` relevés ; tout opérande non échappé et non relu (couleurs validées par le serveur, nombres, dates, constantes) fait échouer le test.
- Non couvert : les pièces jointes (nom de fichier, limites de taille) ; la capture libre avec IA (même validation de titre, non appelée en test).
- Écart noté (hors périmètre) : la lecture de `POST /api/history` ne montre aucune vérification que l'activité appartient au compte (à confirmer par un test dédié).
