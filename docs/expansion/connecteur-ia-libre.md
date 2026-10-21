# Connecteur IA libre (cadrage, 21 oct. 2026)

Décision d'Émilien (21 oct. 2026) : voir `docs/regles/intentions.md`. Confirmée en chat le 21 oct. à 01 h 51 (« Oui, aux deux »).

## En clair
Un compte gratuit peut tout organiser avec SA propre IA (Claude, ChatGPT...) branchée par « Connecter mon IA », sans payer Expansion. Noèsis ne paie rien : l'IA de l'utilisateur travaille avec son jeton, aucun appel Anthropic de Noèsis.

## Outils d'écriture ajoutés (gratuits, jeton avec écriture autorisée)
- `creer_tache` : ajoute une tâche (titre, pôle ou secteur, échéance).
- `modifier_tache` : change le titre et/ou l'échéance d'une tâche.
- `ordonner_taches` : fixe l'ordre d'une liste de tâches d'un même secteur.
- `planifier_jour` : place des tâches sur un jour (plan du jour).
- `retirer_tache` : retire une tâche, mais garde une copie dans le journal (réversible).
- `definir_objectif_periodique`, `definir_objectif_hebdomadaire` : écrit l'objectif d'une période ou d'une semaine (jamais de suppression).
- `annuler_modification` : défait n'importe quelle écriture du journal (30 jours).
Existants inchangés : `marquer_tache_faite`, `ajouter_tache_note`, `notifier`.

## Garde-fous
- Compte du jeton seulement : l'activité doit compter l'utilisateur comme membre ; une tâche confiée à un autre membre est refusée ; une tâche terminée depuis plus de 7 jours reste verrouillée.
- Entrées validées : titre 300 caractères maximum (refus, jamais de coupe), dates AAAA-MM-JJ réelles (de -1 an à +5 ans), lots de 30 tâches maximum.
- Limite de débit : 60 appels/minute (existant) ; en plus 20 écritures/minute et 300 écritures/24 h par jeton.
- Journal serveur (`ai_write_log`) : qui (jeton), quoi, avant, après ; jamais le jeton.
- Aucune suppression définitive : tout retrait ou écrasement garde l'état d'avant et `annuler_modification` le rétablit.
- Aucun appel IA de Noèsis : la correction d'orthographe silencieuse est désactivée pour ces écritures.
- Aucun bouton, écran ni couleur nouveau.

## Ce qui reste payant
Seulement l'IA INTÉGRÉE à l'app, payée par Noèsis : propositions d'objectifs de période depuis l'objectif annuel et la stratégie (E2), tâches proposées depuis les hebdomadaires (E4), plan quotidien et classement IA, corrections silencieuses, cadre de budget `aibudget`. Le jeton, lui, est gratuit.

## Ajustement de E3
Avant : « périodique -> hebdo gratuit ; l'enchaînement depuis l'annuel réservé à Expansion ». Maintenant : l'ORGANISATION (annuel -> périodique -> hebdo -> tâches -> plan du jour) est gratuite quand elle passe par le connecteur de l'utilisateur ; l'enchaînement fait par l'IA intégrée de Noèsis reste réservé à Expansion.

## À confirmer par Émilien
La règle « une saisie manuelle ne change que par proposition validée » est lue ainsi pour le connecteur : l'IA de l'utilisateur agit comme lui, avec son jeton, à sa demande dans SA conversation. Le jeton avec écriture, créé par lui, vaut accord ; le journal + `annuler_modification` remplacent l'écran « Modifications proposées » (qui sert à l'IA intégrée de Noèsis). Les tâches/objectifs saisis à la main peuvent donc être modifiés par son IA sans écran avant/après. OK, ou faut-il que l'IA propose d'abord dans la conversation (c'est déjà la consigne donnée à l'IA) ?
