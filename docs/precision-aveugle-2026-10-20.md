# Précision à l'aveugle — repli 11 (20 oct. 2026)

30 cas h01-h30 écrits AVANT l'évaluation, sans lire `taskprecision.js` (resto, pigiste, café, étudiante, SaaS, jargon de l'app ; québécois, dates/heures, fautes, anglicismes, multi-actions).

## Estimation honnête (simulé, avant correction) : 25/30 = 83,3 %
Le 98 % du jeu complet est du sur-apprentissage : sur des cas neufs, le simulé tombe à ~83 %. Cible réaliste en réel : à mesurer en `--live` par Émilien.

| Cas | Erreur | Nature |
|---|---|---|
| h07 « corrections sur le logo de la boulangerie Fournier » | incertain au lieu de Clients | synonyme (corrections = révisions) : non généralisable |
| h10 « Suivre le tuto Figma » | incertain au lieu de Formation | abréviation « tuto » |
| h18 « nouveau logo » vs à ignorer « refonte du logo » | incertain au lieu de rejeté | cas ambigu (formulation différente de la stratégie) |
| h21 « rdv dentiste et payer le loyer » | placé Vie perso | mon attente était fausse : les deux moitiés sont perso, le placement est juste (attente corrigée) |
| h27 « graphique des stats … dans le chrono » | égalité Basic/Expansion | abréviation « stats » |

## Corrections (généralisables seulement)
- Abréviations : tuto, stats, dispo ajoutées à la table `ABBREV` (classe de mots, pas un cas).
- Règle « verbe flou + un seul mot » généralisée : plus seulement « projet » (c45) ; tout objet isolé derrière un verbe flou est ignoré.
- « client + nom propre » (a05) : indices élargis (livrables, projets, suivi) au lieu d'un seul mot.

## Laissées en erreur (documenté)
h07 (synonymes : demanderait un dictionnaire, sur-apprentissage) et h18 (formulation voisine du « à ignorer », incertain est un résultat acceptable).

## Règles locales c45/c47/a05/a07
c45 : était un mot unique (« projet ») -> généralisée. c47 (facture domine le destinataire) : règle sur une classe de documents, gardée. a05 : élargie. a07 : liste fermée de lieux de santé/épicerie (plusieurs mots, par thème), gardée ; limite : ne couvre pas les lieux hors liste.

Jeu : 272 cas, exactitude 99,3 % (global, non indépendant : seuls h01-h30 sont à l'aveugle).
