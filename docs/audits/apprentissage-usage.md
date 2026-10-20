# Apprentissage par l'usage (20 oct. 2026)

Demande : les tâches générées via l'API doivent s'améliorer avec l'utilisation. Deux pistes : (a) mesure, (b) profil par utilisateur (derniers exemples dans le prompt).
Hypothèses : Haiku 1 $/M jetons d'entrée ; jetons = caractères/4 ; 20 classements/jour/utilisateur (usage soutenu, plafond 500) ; 100 utilisateurs ; plafond d'abus 2 $/jour/utilisateur inchangé (le surcoût en est à moins de 0,1 %).

## État avant
Le classement injectait DÉJÀ jusqu'à 8 corrections par ACTIVITÉ (tous les membres mélangés). Mesuré avec `buildPrompt` : 8 exemples = +197 jetons (+26 % sur 12 catégories, +38 % sur 4).

## Coût par fonction

| Fonction | (a) Mesure | (b) Exemples dans le prompt |
|---|---|---|
| Classement (~750 j. d'entrée, 12 cat.) | 0 jeton : corrections (`goal_classify_examples`) / tâches classées (`autoCaptured`) | N=5 plafonné à ~90 j. : +12 % (+13 % mesuré). N=8 : +26 %. N=3 sans plafond : +12 %. |
| Reformulation (~110 j.) | aucun signal stocké (rien n'est enregistré) : mesure impossible à 0 jeton | exigerait un nouveau stockage ; 3 exemples = +60-90 j. = +55-80 % : REFUSÉ |
| Orthographe (~110 j.) | sans objet (appliquée en silence, garde `isPureSpellingFix`) | +100 % : REFUSÉ |
| Inter-secteurs, modifications proposées | 0 jeton : statuts `applied` / `dismissed` / `pending` déjà stockés | refus déjà mémorisés par hash (jamais re-proposés) : rien à ajouter |
| Document, Drive, hebdo, Offre 1 | sans objet | prompts longs mais exemples sans signal d'acceptation : non fait |

Surcoût en $ (classement seulement, 20 appels/jour/utilisateur, tous avec 5 exemples, cas défavorable) : 90 j. x 20 = 1 800 j./jour = 0,0018 $/jour/utilisateur = 0,18 $/jour = ~5,4 $/mois pour 100 utilisateurs. Avant (N=8 par activité) : 197 j. x 20 = 0,39 $/jour = ~11,8 $/mois. Net : baisse d'environ 54 %. Un utilisateur sans correction : 0 jeton de plus.

## Implémenté
- (a) `node scripts/ai-acceptance-report.js [jours]` : classées / sans modification / modifiées, propositions acceptées / refusées, suggestions inter-secteurs. Lecture seule, 0 jeton, aucune interface. Limite : « sans modification » = classées - corrigées (approximation).
- (b) classement seulement : exemples du compte lui-même (`userId`), jamais d'un autre membre ni d'une autre activité ; sans compte, aucun ; N=5 et bloc plafonné à 250 caractères (~63 j. + en-tête). Variante moins chère déjà incluse (profil limité au classement).
- Remise à zéro côté serveur : `DELETE /api/profile/:id/ai-examples` (session requise, son propre compte) et effacement à la suppression du compte. Aucun écran.
- Inchangés : mémo 24 h, plafonds (`CLASSIFY_MAX_PER_DAY`, budget `aibudget`). Le mémo varie avec les exemples (clé = prompt) : normal.
- Règle verrouillée respectée : les exemples ne font qu'informer le modèle ; la tâche est toujours rangée sans modification silencieuse d'une saisie manuelle.
- Précision simulée (`scripts/eval-task-precision.js --fake`) : 99 % (>= 98 %), les exemples n'y entrent pas par construction ; confirmation `--live` à lancer par Émilien.

## Loi 25 : à valider par Émilien (préparé, non validé)
Aucun registre `docs/registre-traitements` dans le dépôt (il vit dans le projet Claude). Mise à jour proposée du registre : traitement « Apprentissage du classement des tâches » ; données : intitulé de tâche corrigée et catégorie choisie (texte saisi par l'utilisateur) ; finalité : améliorer le classement pour ce seul compte ; destinataire : Anthropic (sous-traitant IA), uniquement dans le prompt de ce compte ; conservation : 50 derniers exemples par activité, effacés à la remise à zéro et à la suppression du compte ; aucun partage entre comptes. Changement visible pour l'utilisateur : la mention d'usage de l'IA (`AI_NOTICE_VERSION`) pourrait citer l'envoi de ses corrections récentes ; non modifiée ici.
