# Bilan de la session du 20 octobre 2026 (pour Émilien)

Tout est sur `staging` (test). Rien n'est sur `main`.

## Ce qui a changé de visible pour toi
- Barre du bas à 6 onglets quand Trade est connecté (libellés plus petits).
- Écran de chargement : le N de la production est rétabli.
- Trade : connexion depuis « Modifier l'activité » ; retrait de l'appui long et du pop-up de la barre.
- Fuseaux : « aujourd'hui » est le même jour pour la liste du jour, les tâches non réalisées, la capture et la Feuille de temps (Paris, Vancouver) ; seul le rappel de 6 h reste à l'heure de Toronto (décision dans l'index).
- Chrono : l'arrêt garde l'heure exacte (même au retour à l'heure normale) ; si l'heure du téléphone saute, le chrono se recale.
- Une annonce n'apparaît plus par-dessus une saisie en cours.
- Feuille de temps, vue Semaine : la grille s'ouvre 1 h avant la première case remplie.
- Application plus rapide : pages compressées (-71 % sur le JS et le CSS), année entière d'historique plus rapide.
- Capture hors ligne : plus de doublon quand la file est renvoyée.
- Menu allégé : clés et styles morts retirés, captures identiques.

## Les 5 décisions qui débloquent le plus
Cases à cocher dans `docs/questions-emilien-2026-10-20.md` (section « Les 5 décisions ») :
1. Expansion en production (courriels, CGU, remboursement, code gratuit).
2. Trade en production (service, « validé », condition de lancement).
3. Lancer les évaluations IA `--live` (environ 0,05 $, au plus 0,15 $).
4. Simplification : retirer ou garder les lignes d'audit.
5. Premier lancement : retirer modules, « Crée tes activités », confirmation du code.

## État des 7 chantiers
- Trade Tracker : sécurité et volume testés ; attend la décision 2.
- Basic : robuste (hors ligne, horloge, gros volume) ; attend la liste des bugs du 2 oct. et la décision 5.
- Expansion : parcours Stripe prêt en mode test ; attend la décision 1.
- Crédits Claude et API : coûts mesurés, plafonds posés ; attend la décision 3.
- Simplification et design : code mort retiré par passages ; attend la décision 4.
- Précision des tâches : 0 faux rejet sur les cas connus ; attend la décision 3 et le choix sur l'horaire fixe.
- Pilotage : suite de tests sérialisée, suite complète vérifiée sur la tête de staging, index des questions < 80 lignes ; les 11 types de notification mènent tous à un écran existant (table dans `docs/notifications-liens-2026-10-20.md`, test ajouté).

## Contrôle (repli 30)
Intégrité de staging relue : aucun marqueur de conflit restant (un avait été commité en f7e5583, corrigé en 3eff6af, résolution juste), tous les .js passent `node --check`, CSS équilibrés, `CACHE_VERSION` strictement croissant v499 -> v521 sans doublon. Plafonds IA : Drive, inter-secteurs et correction d'orthographe se remettaient à zéro à minuit UTC (19-20 h à Montréal), donc jusqu'à deux fois le plafond par jour ; ils suivent maintenant le jour de Montréal, comme le budget en dollars. Rappel de 6 h : 3 options à cocher dans l'index, rien changé. Suite complète : 159 passées avant ce correctif.

## Contrôle (précédent)
Suite complète sur la tête de staging avec le correctif des fuseaux : 156 passées, 0 échec (webhook Stripe durci et contrôle des variables au démarrage relus : rien de visible). Deux correctifs visibles : le rappel de 6 h ouvre la tâche aussitôt ; une notification de message d'activité ouvre la Page 2 de l'activité sans attendre l'écran Discussion retiré. Détail dans le journal.

## Contrôle (repli 31)
Suite complète sur la tête de staging (script verrouillé) : 163 passées, 0 échec (après rebase final), avec `ia-plafonds-jour-test`. La fenêtre du conflit commité (76 s, f7e5583 -> 3eff6af) n'aurait pas fait échouer le démarrage ni le build (rien ne lit `app.js` côté serveur) mais aurait servi un `app.js` invalide ; le service worker se rétablit seul (réseau d'abord, URL `?v=` par contenu, deux bumps passés depuis). Nouveaux garde-fous dans la suite : marqueurs de conflit, `node --check` de `public/`, équilibre CSS ; hook pre-push étendu. `scripts/smoke-staging.sh <URL>` : contrôle de la première minute après déploiement (brief, point 13). Constaté : 6 tests ne sont dans aucune liste de la suite (journal).
