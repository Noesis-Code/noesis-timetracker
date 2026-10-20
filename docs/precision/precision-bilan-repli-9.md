# Bilan précision des tâches — repli 9 (20 oct. 2026)

Jeu d'évaluation simulé (`scripts/eval-task-precision.js --fake`) : 222 cas (+25, ids r01–r25 : « demain avant-midi », « la semaine prochaine », « le 3 », « fin de semaine », durées 1h30 / 45 min, noms de clients et lieux, titres très courts, doubles dates, « ne pas oublier »). Exactitude 98,2 % (avant : 98,0 % sur 197 cas).

Règle corrigée : `server/lib/taskprecision.js`, « horaire… » ajoute le thème personnel (r15 « Horaire des serveurs » tombait en égalité Salle/Personnel).

## Erreurs restantes (4), par type
| Type | Cas | Effet |
|---|---|---|
| Titre vague placé sur un mot commun | c45 « Penser au projet » | placé au lieu d'incertain |
| Égalité destinataire / document | c47 « Envoyer la factur… au client » | incertain au lieu d'Administration |
| Nom propre de client sans mot-clé | a05 « Traiter le dossier du client Acme » | incertain (Clients/Prospection) |
| Lieu ou démarche sans vocabulaire de catégorie | a07 « Passer à la pharmacie » | incertain au lieu de Vie personnelle |

Les dates, durées et négations n'ont causé aucune erreur : elles ne sont pas des mots-clés de catégorie. Les 3 derniers types sont des limites du simulé (recouvrement de mots), à mesurer en `--live` par Émilien.

## Suite (repli 10)
Les 4 erreurs sont corrigées par règles locales dans `taskprecision.js` (`actionHints`, `tokens`) : lieux/démarches du quotidien (pharmacie, médecin… = santé), document financier qui domine son destinataire (hors double action « … et … »), « client + nom propre » = client existant, titre « verbe flou + projet » sans secteur. Jeu : 242 cas (+20, ids s07–s26 : jargon de l'app, pôles/secteurs ; s01–s06 existaient déjà), exactitude 100 % en simulé. Ces règles sont des aides du simulé : le résultat réel reste à mesurer en `--live` par Émilien. Cas ambigus par nature (préférence d'Émilien) : `docs/questions/questions-emilien-precision.md`.
