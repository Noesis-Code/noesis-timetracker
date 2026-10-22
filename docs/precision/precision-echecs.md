# Journal des échecs de précision (19 oct. 2026)

Source : aucun journal de refus/corrections n'existe en base de test ni dans les logs (seed sans corrections) ; relevé fait sur le jeu d'évaluation `scripts/eval-task-precision.js` (fournisseur simulé, 108 cas, exactitude 98,1 %). Les vraies corrections vivent dans `ai_usage_log` / exemples de correction de production : à relire sur la base réelle par Émilien.

## Échecs restants, par cause
| Cause | Cas | Effet | Traitement |
|---|---|---|---|
| Titre vague placé sur un seul mot commun | c45 « Penser au projet » | placé dans Clients au lieu d'incertain | consigne ajoutée au prompt (`goalstaskclassify.buildPrompt`) ; le simulé ne peut pas la suivre |
| Égalité destinataire / document | c47 « Envoyer la factur… au client » | incertain (Clients/Prospection) au lieu d'Administration | consigne « le document prime sur la personne concernée » ; non mesurable en simulé |
| (connu) racine trop agressive | « client » -> « cli » (`stem`, suffixe `ent`) | recoupements parasites | non modifié : sans effet sur le score, à traiter avec un jeu plus large |

Rien n'est en cause côté refus (« à ignorer » : 100 % justes). Score simulé inchangé : 98,1 %.

## Doublons sémantiques réels (22 oct. 2026)
Relevé sur les tâches générées de la semaine (pôle TiMeTracker) : 5 quasi-doublons réels ajoutés au jeu (w01-w05 : mentions légales, session signée, retrait nom de famille/téléphone, consentement commercial, signalement). `sameTitle` est volontairement prudent (même titre à la mise en forme près) : les 5 passent en « incertain », comme v01 et v02. Écarts connus, aucune règle changée (zéro faux doublon prioritaire) ; exactitude 96,7 % sur 333 cas. Piste : comparaison sémantique dans le prompt de génération (liste des tâches existantes), pas dans le simulé.
