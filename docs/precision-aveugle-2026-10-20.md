# Précision à l'aveugle — repli 11 et 12 (20 oct. 2026)

**Conclusion : le taux réel est celui de l'aveugle, pas celui du jeu entier.** Chaque lot neuf, jugé AVANT correction, donne 83,3 % (lot 1) puis 60,0 % (lot 2, volontairement plus dur). Le 99-100 % du jeu complet mesure surtout ce qu'on a déjà corrigé.

| Lot | Cas | Aveugle (avant correction) | Après correction (non indépendant) | Jeu entier ensuite |
|---|---|---|---|---|
| h01-h30 (repli 11) | 30 | 83,3 % (25/30) | 100 % | 99,3 % |
| h31-h60 (repli 12) | 30 | 60,0 % (18/30) | 100 % | 100 % (302 cas) |

Lecture : la courbe à l'aveugle ne monte pas, car chaque lot vise les points faibles du précédent (synonymes, abréviations, noms propres). Les anciens cas restent à 100 % (≥ 98 % exigé) : aucune régression. Estimation honnête du taux réel du simulé : entre 60 et 85 % selon la difficulté ; le vrai chiffre (modèle réel) se mesure en `--live` (voir `docs/questions-emilien-precision.md`).

## Lot 2 (h31-h60), écrit avant lecture de `taskprecision.js`
Couvre : synonymes de « à ignorer » (Instagram, recruter, infolettre, balado, Uber Eats, cartes de fidélité, webinar), refonte/« nouveau », abréviations (exam, TP), verbe flou + nom propre, clients/commerces nommés, anglais, épicerie hors liste.
12 échecs sur 30 : 8 refus manqués (synonymes), « exam de stats », « lait et œufs », « Café Olimpico », « the client ».

### Corrections (classes, pas des cas)
- « À ignorer » : titre ET terme ramenés au même concept par groupes de synonymes (refonte/redessiner/refaire/nouveau, embauche/recruter, newsletter/infolettre, podcast/balado, webinaire/webinar, conférence/colloque, livraison/delivery, fidélité/loyalty) et plateformes (réseaux sociaux : Instagram, Facebook, TikTok, LinkedIn... ; livraison à domicile : Uber, DoorDash...). Noms génériques d'un terme (programme, plan, service, campagne, carte) ignorés si un mot porteur reste.
- Classement : abréviations exam/TP ; correction/retouche/modification = révision ; follow-up = suivi ; « étudier/réviser » -> cours/examen ; denrées courantes (lait, œufs, pain, fruits...) -> épicerie ; « le/mon/the client » (article défini, pas « nouveau/potentiel ») = client en place ; envoi/relance vers un commerce nommé (Café/Restaurant/Hôtel + nom propre) = clientèle professionnelle.
- Effet de bord positif : h07 (corrections) et h18 (« nouveau logo ») du lot 1, laissés en erreur, sont résolus.

### Limites
Les groupes de synonymes sont finis : un synonyme absent échouera encore. Un lot 3 neuf est nécessaire pour mesurer le gain réel ; il tombera probablement sous 100 %.

---

# Détail du lot 1 (repli 11)

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
