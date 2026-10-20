# Messages d'erreur vus par l'utilisateur (20 oct. 2026)

Relevé : ~170 sites `err.message` (`public/app.js`, `public/js/*.js`) affichent dans un champ de message (`xxxMsg`), une alerte (`alert`) ou un toast. Presque tous passent par `api()` (`apiNetwork`, `public/app.js`), donc le message dépend du cas, pas de l'écran. Deux exceptions avaient leur propre `fetch` : Réglages > Modules (`js/modules.js`) et Connexion IA (`js/connexion-ia.js`).

## Table cas -> message affiché (après correction)

| Écran | Cas | Avant | Maintenant |
|---|---|---|---|
| Tous (via `api()`) | Réseau coupé | « Connexion impossible. Réessaie. » | inchangé |
| Tous, app installée | Réseau coupé (service worker) | « Hors ligne — connecte-toi à internet pour continuer. » (traduit) | inchangé |
| Modules, Connexion IA | Réseau coupé | « Load failed » / « Failed to fetch » brut (anglais) | « Connexion impossible. Réessaie. » |
| Tous | 401 session expirée | « Non authentifié. Reconnecte-toi. » (traduit) puis rechargement et demande du code | inchangé (voir section 401) |
| Tous | 403 module désactivé / accès refusé | message du serveur (traduit pour « Accès refusé. ») | inchangé |
| Écrans d'une route réservée (offre) | 403 | code brut « offer1_required » / « essor_required » | « Accès refusé. » |
| Tous | 404 route inconnue / réponse non JSON | « Erreur serveur » | inchangé ; 404 voulus : « <chose> introuvable. » (traduits) |
| Tous (écritures) | 429 limite de débit | « Trop de requêtes. Réessayez dans N s. » (vouvoiement, nombre : jamais traduit en anglais) | « Trop d’essais. Réessaie dans quelques minutes. » (clé existante FR + EN) |
| Connexion, recherche de profils | 429 | « Réessayez dans une minute » (vouvoiement) | « Réessaie dans une minute » (clés mises à jour FR + EN) |
| Stats, Calendrier, Catégories, Objectifs, Sous-projets | 500 | « Erreur serveur. » (point final : pas de clé, restait en français en anglais) | « Erreur serveur » (clé existante) |
| Tous | 500 / 502 / 503 / 504 sans JSON (redémarrage, proxy) | « Erreur serveur » | 502/503/504 : « Connexion impossible. Réessaie. » ; 500 : « Erreur serveur » |
| Tâches ajoutées par l'IA (résultat par tâche) | IA surchargée (529), 429, 5xx, réseau | « Erreur serveur » | « Génération indisponible pour le moment. » (clé existante FR + EN) |
| Idem | Budget IA atteint | message du budget (conservé) | inchangé |
| Idem | Entrée refusée (400) | « Erreur serveur » | inchangé (aucune clé « entrée refusée » ne convient) |

## 401 : session expirée
`handleSessionLost()` : un 401 `needsLogin` recharge la page (`location.reload()`), puis l'écran de démarrage redemande le code PIN une seule fois. Anti-boucle : si un rechargement a eu lieu il y a moins de 15 s, le code est redemandé par-dessus la page sans recharger. Pas d'écran vide, pas de boucle. Les données déjà enregistrées sont intactes (chrono côté serveur).
- [ ] Perte de saisie : le rechargement efface un texte en cours de frappe (tâche, note, message) non encore envoyé. Option : afficher la demande de code par-dessus la page (comme le cas anti-boucle) au lieu de recharger, pour garder la saisie : oui / non

## Cases (non corrigées : demandent de nouvelles clés ou un choix)
- [ ] Messages 502/503 de routes (Drive « n’a pas répondu », « Google a refusé la demande », « L'IA n'est pas configurée… », « La réponse de l'IA était inexploitable… », « L'IA n'a pas répondu. Réessaie dans un moment. ») : aucune clé anglaise, restent en français en anglais. Ajouter les clés : oui / non
- [ ] 403 « Module désactivé : « <module> » » : seule la variante Trade Tracker est traduite ; les autres modules restent en français en anglais
- [ ] Fallbacks `|| 'Erreur.'` dans `objectifs-document-taches.js` : ne s'affichent que si l'erreur n'a pas de texte (cas pratiquement inexistant)
