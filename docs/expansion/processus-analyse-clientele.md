# Proposition : processus d'analyse de clientèle (non codé, à valider)

Demande (Gaspard via Émilien, 19 oct. 2026) : à partir d'un besoin identifié, trouver des clients cibles dans n'importe quelle zone et n'importe quel secteur, en cherchant à CHAQUE lancement les facteurs propres au secteur.

## 1. Étapes
1. **Besoin** (une phrase de l'utilisateur) -> 2. **Zone géographique** (pays, région ou ville) -> 3. **Secteur d'activité visé**.
4. **Recherche de facteurs complémentaires propres au secteur** (à chaque lancement, jamais une liste figée) : l'IA liste 5 à 8 facteurs que ce secteur ajoute à la grille de base, avec une courte justification.
5. **Impact du besoin sur le marché** : taille/fréquence, coût de ne pas le combler, concurrence existante dans la zone.
6. **Facteurs internes/externes de variation d'utilité** : saisonnalité, réglementation, cycles de prix, technologie, taille de l'entreprise, maturité.
7. **Typologie de clientèles** qui cherchent à combler ce besoin (3 à 6 types).
8. **Segments cibles + critères de repérage** (comment les reconnaître : taille, signaux publics, annuaires, événements).
9. **Tâches proposées** (prospection concrète) rangées dans les pôles/secteurs de l'activité.

## 2. Articulation avec la stratégie d'activité (aucun écran, aucune option)
- Entrée : la stratégie existante (but, échéance, priorités 1-3, à ignorer) est injectée telle quelle (`strategy.promptBlock`) ; le besoin/zone/secteur viennent de la consigne de l'utilisateur dans « Ajouter des tâches » (pas de nouveau champ).
- Sortie : UNIQUEMENT des tâches proposées dans le flux existant (`documenttasks.propose` -> l'utilisateur coche/valide). L'analyse détaillée (facteurs, typologie) s'affiche en notes de la proposition existante (`notes`). Rien n'est créé ni modifié sans validation ; « à ignorer » est appliqué par les règles déterministes (`taskprecision`).

## 3. Gabarit de prompt et schéma
Variables : `{besoin}`, `{zone}`, `{secteur}`, `<strategie>`. Consigne : « Étape A : liste 5 à 8 facteurs propres au secteur {secteur} en {zone}, au-delà de la grille de base ; ne rien inventer de chiffré sans source, marque `estimation`. Étape B : pour le besoin « {besoin} », remplis le schéma. Réponds en JSON seul. »
```json
{ "facteursSecteur": [{"nom":"","pourquoi":""}],
  "impactMarche": {"resume":"","ampleur":"faible|moyenne|forte","concurrence":""},
  "variationsUtilite": [{"type":"interne|externe","facteur":"","effet":""}],
  "clienteles": [{"type":"","besoinPrecis":"","criteresRepérage":[""]}],
  "segmentsCibles": [{"segment":"","priorite":1,"pourquoi":""}],
  "t": [["titre de tâche","cle_categorie",null,null]],
  "confidence": 0 }
```
`t` reprend le format court existant (parseDetailed). Repli Haiku puis modèle fort si `confidence` < 80 (patron existant).

## 4. Évaluation hors ligne
Étendre `test/fixtures/task-precision/` avec `kind: "analyse"` : 3 cas fictifs par secteur (restauration, mines, services professionnels, agriculture, santé) x zones (Québec, Afrique de l'Ouest, Asie du Sud-Est). Contrôles déterministes sur la SORTIE JSON : schéma valide, >= 5 facteurs propres, au moins 1 facteur interne et 1 externe, typologie >= 3 types, aucune tâche « à ignorer », facteurs différents d'un secteur à l'autre (anti-gabarit). Le fournisseur injectable renvoie des JSON fixes en `--fake` ; la qualité réelle se mesure en `--live` (Émilien).

## 5. Coût et mémoïsation
Environ 1 500 tokens d'entrée, 1 800 de sortie : ~0,01 $ avec Haiku, ~0,03 $ avec le modèle fort (à confirmer via `ai_usage_log`). Mémoïser avec `aicache.memoize` sur (modèle, besoin, zone, secteur, stratégie) ; TTL 24 h par défaut, 7 jours pour l'étape « facteurs du secteur » seule (relancée à chaque lancement d'après la demande, donc TTL court conseillé).

## 6. Questions pour Émilien/Gaspard
1. Accepter que le contenu IA ne soit pas sourcé (pas de recherche web) ? Une recherche web = dépendance et coût à part.
2. « Recherche à chaque lancement » : tolérer le cache 24 h (moins cher) ou toujours recalculer ?
3. Réservé à l'offre payante (Expansion) ou gratuit ?
4. Où montrer l'analyse (notes de la proposition) : suffisant, ou écran dédié (non fait sans accord) ?
5. Seuil de rejet des segments trop incertains ; langue de sortie selon la zone ?

## 7. Grille de facteurs par secteur d'activité (proposition écrite, aucun code)

Point de départ pour l'étape 4 : amorce injectée dans le prompt, que l'IA doit compléter et corriger à CHAQUE lancement (jamais une liste figée ni copiée telle quelle d'un secteur à l'autre). Chiffres : toujours marqués `estimation` sans source.

| Secteur | Besoin typique | Facteurs internes de variation | Facteurs externes de variation | Types de clientèle |
|---|---|---|---|---|
| Restauration | Remplir les tables et lisser les creux (midi/soir/semaine) ; réduire le coût des denrées | Capacité (places, terrasse), carte, marge sur plats, personnel disponible, réputation | Saison et météo, prix des denrées, loyers, événements locaux, tourisme, réglementation (permis, hygiène) | Résidents du quartier, travailleurs du midi, touristes, groupes/événements, clients de livraison |
| Vêtements | Trouver le bon produit au bon prix, écouler les stocks sans brader | Positionnement et marque, marges, délais de production, taille des séries, canal (boutique/en ligne) | Saisons et tendances, coût matières et transport, taux de change, douane, concurrence ultra-bon-marché | Particuliers par style/âge, boutiques indépendantes (revente), entreprises (uniformes, merch), clubs et associations |
| Minier | Fournir équipements, services ou main-d'œuvre à un site d'exploitation ; sécuriser l'accès au site | Taille du gisement et du site, étape (exploration/construction/production), capacité financière, certifications sécurité | Cours des métaux, permis et consultations des communautés, réglementation environnementale, accès routier/énergie, climat | Minières juniors vs majeures, sous-traitants, communautés et fournisseurs locaux, bureaux d'ingénierie |
| SaaS | Gagner du temps ou réduire une erreur coûteuse dans un processus précis | Maturité du produit, prix et paliers, coût d'acquisition et de support, intégrations | Concurrence (outils existants, tableurs), cycle d'achat et budget des clients, réglementation des données, adoption de l'IA, saisonnalité du secteur client | Petites équipes, PME, grands comptes (achat long), indépendants, revendeurs/intégrateurs |
| Services professionnels | Obtenir une expertise ponctuelle ou récurrente sans l'embaucher | Spécialité, tarif horaire/forfait, capacité disponible, références et portfolio | Cycles fiscaux et budgétaires, réglementation de la profession, bouche-à-oreille local, conjoncture économique | PME locales, travailleurs autonomes, OBNL, grandes entreprises (appels d'offres), clients récurrents vs ponctuels |

### Questions de recherche à relancer à chaque exécution (identiques dans la forme, réponses recalculées pour {zone} et {secteur})
1. Quel est le besoin précis, qui le ressent le plus et à quelle fréquence ? Que coûte de ne pas le combler ?
2. Quelles solutions concurrentes ou de contournement existent déjà dans {zone} ? Prix typiques (`estimation`) ?
3. Quels facteurs internes (taille, étape, capacité, marges) font passer le même besoin de faible à fort selon l'entreprise ?
4. Quels facteurs externes ont changé récemment dans {zone} (réglementation, prix, saison, événements, technologie) ?
5. Quels cycles de calendrier (saison, exercice fiscal, budgets) disent QUAND approcher chaque type de clientèle ?
6. Quels signaux publics repèrent le bon client (annuaires, permis, appels d'offres, offres d'emploi, événements, réseaux) ?
7. Qui décide l'achat et par quel canal faut-il le joindre ? Quelle langue et quelles normes locales ?
8. Quel facteur propre à ce secteur n'est PAS dans cette grille ? (obligation d'en proposer au moins un nouveau, pour éviter le gabarit figé)
9. Quelles tâches concrètes de prospection en découlent, rangées dans quel pôle/secteur de l'activité, sans toucher à « à ignorer » ?

Sortie : mêmes champs que le schéma de la section 3 ; la grille ci-dessus n'est qu'une amorce de prompt, jamais un affichage.
