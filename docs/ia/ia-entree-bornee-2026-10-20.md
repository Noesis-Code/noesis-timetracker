# Entrée inter-secteurs bornée avant envoi (chantier 4, repli 23, 20 oct. 2026)

Sans changement visible. Jetons estimés = caractères / 4. Test : `test/ia-entree-bornee-test.js` (inscrit dans `node test/run-tests.js`).

## Constat
Inter-secteurs (`crosssectorinference.buildPayload`) envoie, pour CHAQUE pôle/secteur candidat de l'activité, sa description et son objectif périodique actuel (jusqu'à 500 caractères chacun), sans borne : l'entrée croît avec le nombre de secteurs, à chaque tâche ou objectif posé (fonction n°5 du coût, appel sans cache de prompt, sous le seuil cachable).

## Correction
Description coupée à 160 caractères, objectif actuel d'un candidat à 240 (coupe au dernier mot entier, « … » ajouté). Les textes plus courts sont inchangés ; le texte de la source n'est pas touché ; consigne système, modèles, sortie inchangés.

## Avant / après (pire cas du test : 30 candidats, description et objectif de ~500 caractères)
Entrée utile : 8028 -> 3543 jetons (-56 %). À ~1 $/M (Haiku) : 0,0080 -> 0,0035 $ par évaluation ; au repli fort (3 $/M) : 0,024 -> 0,011 $. Cas courant (3 à 8 candidats, textes courts) : gain nul à faible, aucune perte.

## Risque
Un candidat dont l'objectif dépasse 240 caractères est vu tronqué : le modèle a le sens général, pas le détail final. Suggestions toujours proposées, jamais imposées. Si Émilien préfère le texte complet, retirer `cut(...)` dans `buildPayload`.
