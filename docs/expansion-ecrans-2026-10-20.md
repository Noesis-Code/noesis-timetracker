# Expansion — écrans d'achat et d'abonnement (20 oct. 2026, repli 19)

Vérifié par Playwright à 390×844 et 360×640, FR et EN, staging (clés de test, Stripe simulé : aucun paiement). Contrôles automatiques : zones tactiles < 44 px, débordements, texte coupé, contraste (< 4,5:1), clavier (fenêtre réduite de 300-336 px). Aucun bouton, option ni couleur nouveau : CSS seulement (`public/css/objectifs-offre1-code.css`). Captures : `docs/img/expansion-*-2026-10-20.png`.

| Écran | Constats | Correctif |
|---|---|---|
| Carte Expansion (Feuille de route) | Boutons « Découvrir Expansion » et « J'ai un code » à 38 px de haut ; lignes d'abonnements (paiement à régulariser, en attente) espacées d'environ 50 px. Textes FR/EN complets, aucun contraste < 4,5:1. | Hauteur minimale 44 px ; lignes resserrées (marge 0, espace 4 px). |
| Fenêtre d'achat | Champs (activité, nom, représentant légal) à 185 px et non pleine largeur, bordures du navigateur ; cases « 18 ans / 16-17 ans » collées à droite ; champs et bouton « Continuer vers le paiement » à 19-28 px de haut ; police < 16 px (zoom iOS à la saisie). | Champs pleine largeur, 44 px, police 16 px, bordure du thème ; cases alignées à gauche (44 px) ; bouton pleine largeur 48 px. |
| Fenêtre d'achat, 16-17 ans | À 360×640 le bouton est sous le pli : atteignable par défilement de la carte (80 vh, défilement actif). | Aucun (comportement voulu). |
| Clavier (achat et code) | Champs focalisés restent visibles fenêtre réduite (390 : 284 px sur 508 ; 360 : 147 px sur 340) ; la carte défile. | Aucun. |
| Panneau « J'ai un code » | Conforme (champ 46 px, bouton Valider, message d'erreur lisible). ✕ à 32 px. | ✕ : zone tactile étendue à 44 px (pseudo-élément, rendu identique). |
| ✕ de la fenêtre d'achat | 32 px visibles, comme tous les ✕ de l'app. | Zone tactile 44 px (pseudo-élément), rendu identique. |
| Erreur de paiement (502, profil incomplet 400, déjà abonné 409) | Messages FR/EN complets, centrés, sans coupure ; contraste correct. | Retour à la ligne forcé pour les longs messages (`overflow-wrap: anywhere`). |
| Attente du représentant légal (202) | Courriel très long renvoyé à la ligne sans débordement ; « Vérifier maintenant » à 28 px. | Bouton pleine largeur 48 px. |
| Retour de Stripe, succès (`/?achat=succes`) | Message natif (`alert`) : « Abonnement à Expansion activé. Merci ! » / EN ; URL nettoyée, pas de réaffichage au rechargement. | Aucun (un écran dédié serait un ajout d'interface : non fait). |
| Retour de Stripe, annulation (`/?achat=annule`) | « Paiement annulé — aucun abonnement créé. » / EN ; même nettoyage. | Aucun. |
| Abonnement past_due / en attente | Texte « paiement à régulariser » / « en attente de paiement » sous la carte (FR/EN). Un abonnement annulé disparaît de la liste (aucun message). | Espacement seulement. |

## Retour de Stripe Checkout (`test/expansion-retour-checkout-test.js`)
- `success_url` et `cancel_url` = origine de la requête (https derrière le proxy Railway : `https://web-staging…/?achat=succes|annule`), jamais une valeur du client.
- **Constat corrigé** : `successPath` / `cancelPath` du corps étaient concaténés à l'origine ; `@autre.site` aurait redirigé hors de l'app. Seul un chemin local (`/…`, sans `//`, `\`, `@`, espace) est accepté ; sinon le chemin par défaut.
- **Double clic** : le bouton est désactivé côté client, mais deux requêtes rapprochées (double toucher, deux onglets) créaient deux Checkout Sessions (deux abonnements payables) ; avec « nouvelle activité », la seconde recevait « Tu as déjà une activité ». Corrigé : même personne + même activité reçoit la MÊME session pendant la création et 10 s après un succès (une erreur n'est pas mémorisée).
- **Session expirée** (24 h côté Stripe) : aucun état serveur ; après la fenêtre de 10 s, un nouvel achat crée une nouvelle session. Si l'utilisateur ne revient pas, rien n'est créé (l'abonnement n'existe qu'après le webhook).
- À savoir : le retour de Stripe s'ouvre dans le navigateur ; si l'app est installée (PWA), l'état « abonné » se lit au prochain chargement de la carte (le webhook peut arriver quelques secondes après le retour).

## Reste côté Émilien
Rien de nouveau (légal, courriels, activation du portail : voir `docs/questions-emilien-expansion.md`).
