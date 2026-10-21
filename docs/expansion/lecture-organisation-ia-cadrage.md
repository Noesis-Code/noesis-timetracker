# Lecture de l'organisation IA : cadrage (21 oct. 2026)

Cadrage seulement. Aucun code. Mots exacts d'Émilien : `docs/regles/intentions.md` (21 oct. 2026).

## Idée
Quand un utilisateur connecte son IA, TimeTracker se réserve le droit de LIRE (sans modifier) l'organisation qu'elle écrit : tâches, plan, stratégie. Le but : s'inspirer de ce qui marche pour ajuster l'algorithme intégré, le garder secret et le vendre.

## À vendre
L'algorithme intégré à l'app (« Timetracker-bespoke »), pour ceux qui ne veulent pas gérer leur IA ou qui veulent mieux que ce qu'ils feraient seuls. Il est personnalisé grâce au domaine d'expertise de l'utilisateur.

## Décisions d'Émilien (21 oct.)
1. **Contenu lu** : tout SAUF les données sensibles ou secrètes. On retient la STRUCTURE (titres, notes, objectifs, stratégies), jamais les termes exacts (protection des données confidentielles des clients).
2. **Consentement** : case claire affichée à la connexion de l'IA + conditions d'utilisation (Loi 25).
3. **Usage** : statistiques anonymes, sans nom ni lien avec un compte, pour ajuster l'algorithme.
4. **Traitement** : automatique, aucun humain sur un compte précis. L'utilisateur voit dans ses réglages qu'une lecture a eu lieu et peut se retirer. S'ajoute le domaine d'expertise de l'utilisateur (offre « Timetracker-bespoke »).
5. **Domaine d'expertise** : déclaré par l'utilisateur à la connexion de l'IA, pour le moment. Émilien peut changer d'avis vite : la source du domaine doit rester modifiable en UN seul endroit.

## À trancher
- **Ce qui « marche »** : à définir avec Émilien lors d'une discussion (21 oct. : « demain »). Pistes, non tranchées : tâches cochées à temps, objectifs atteints, précision de l'estimation, constance dans la durée.
- **Texte légal et conditions** : réservé à Émilien. Rien n'est rédigé comme définitif.
- **Seuil minimal d'utilisateurs** pour qu'une statistique ne permette pas de réidentifier quelqu'un.
- **Durée de conservation**.
- **Écran de retrait** : sans nouveau bouton si possible (`SIMPLIFICATION.md`).
- **Point sensible** : la lecture ne concerne que l'organisation écrite via le connecteur de l'utilisateur. Rien n'est lu des comptes qui n'ont pas accepté.
