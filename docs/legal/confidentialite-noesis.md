# Confidentialité Noèsis — propositions de texte (NE PAS PUBLIER)

Ce fichier ne contient que des **propositions de phrases à valider** par Émilien. Rien ici n'est publié : le texte réellement affiché dans l'app (politique de confidentialité, consentements) est dans `public/index.html` et `public/legal-en.js`, et ne change qu'avec son accord explicite. Aucun envoi vers `main`.

## Estimateur de temps — enregistrement du temps réel contre le temps prévu (À VALIDER)

Proposition de phrase (français) :

> « Pour améliorer les estimations de durée, Noèsis peut enregistrer, à l'échéance d'un objectif, le temps réellement mesuré par le Chrono comparé au temps prévu, avec la famille de l'objectif (par exemple « course » ou « rénovation »). Ces chiffres sont conservés sans ton nom ni le titre de tes objectifs et ne servent qu'à améliorer les estimations. Tu peux refuser ou retirer ton accord à tout moment ; sans accord, rien n'est enregistré. »

Proposition de phrase (anglais) :

> "To improve duration estimates, Noèsis can record, when a goal ends, the time actually measured by the Chrono compared with the planned time, together with the goal's family (for example "running" or "renovation"). These figures are kept without your name or your goals' titles and are only used to improve estimates. You can decline or withdraw your consent at any time; without it, nothing is recorded."

Points à confirmer avant toute publication :
- « sans ton nom ni le titre » : aujourd'hui la ligne enregistrée (`objectif_temps_reel`) porte l'identifiant du compte (pour pouvoir la retirer au retrait du consentement) mais ni le titre ni la description ; une agrégation anonyme reste à décider.
- Où poser le consentement : colonne `users.consentEstimateur` (défaut non), aucun écran créé. Emplacement proposé : Réglages > Confidentialité, à côté des autres consentements ; à valider.
- Retrait du consentement : arrête les enregistrements ; l'effacement des lignes déjà enregistrées reste à décider.
