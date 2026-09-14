# Contenu réel des 4 formulaires — Offre 1

Transcrit depuis les .docx envoyés par Gaspard le 10 septembre 2026 (remplace les brouillons précédents). Structure : section → question(s), avec le type de champ à utiliser et l'aide/exemple associé quand il y en a une.

---

## Formulaire 1 — Découverte du Projet (`kind: 'discovery'`)

**Identification** (hors accordéon, champ de rattachement)
- 0.1 Quel est le nom de l'activité ou du projet concerné par ce formulaire ? — *texte court*
  Aide : si plusieurs activités sous Noèsis, permet de rattacher ce formulaire à la bonne feuille de route. Reprendre le même nom d'une fois sur l'autre.

**Section 1 — Votre projet en une phrase**
- 1.1 Que créez-vous, utilisez-vous ou développez-vous exactement ? — *texte long*
  Aide : décrivez en quelques mots l'objet central du projet (produit, service, outil, plateforme...).
- 1.2 Quelle valeur cela apporte-t-il au marché ? — *texte long*
  Aide : qu'est-ce que le projet apporte de nouveau ou de mieux aux clients/au marché ?
- 1.3 Qu'est-ce que cela vous permet, à vous, d'avoir ou de faire ? — *texte long*
  Aide : objectif personnel ou professionnel derrière ce projet.

**Section 2 — Votre produit ou service**
- 2.1 S'agit-il d'un service ou d'une marchandise ? — *choix unique* : Un service / Une marchandise
- 2.2 Décrivez précisément votre produit ou service. — *texte long*
  Aide : concrètement, sans jargon technique si possible.
- 2.3 Quels besoins déjà présents sur le marché votre produit comble-t-il ? — *texte long*
  Aide : comme les produits similaires déjà disponibles, qu'est-ce que le vôtre comble aussi ?
- 2.4 Qu'avez-vous de plus que les produits similaires déjà sur le marché ? — *texte long*
  Exemple : « Je suis le seul à proposer une livraison en moins de 2h dans ce secteur. »

**Section 3 — Vos canaux de publicité**
- 3.1 Par quels canaux comptez-vous faire connaître votre produit ? — *texte long*
  Aide : réseaux sociaux (lesquels), bouche à oreille, affichage physique, magazine, salons, etc.
- 3.2 Détail de chacun de vos canaux de publicité — *tableau répétable* (1 ligne par défaut, extensible) : Canal | Actif ou prévu ? | Quel besoin ça comble, et comment vous l'utilisez (fréquence, message)

**Section 4 — Vos canaux de vente**
- 4.1 Par quels canaux allez-vous vendre votre produit ? — *texte long*
  Aide : magasin physique, site web, marketplace, revendeurs, vente directe...
- Tableau répétable (1 ligne par défaut, extensible) : Canal de vente | Actif ou prévu ?

**Sections 5 et 6 (Vos concurrents directs / indirects) — RETIRÉES le 10 septembre 2026**, sur demande de Gaspard. Les questions 5.1 et 6.1-6.3 n'existent plus dans `OFFER_FORMS` (public/app.js). Numérotation des sections suivantes (7-10) volontairement INCHANGÉE ci-dessous : elle correspond telle quelle aux ids déjà en place dans le code (q7_1, q8_0...), les renuméroter aurait cassé cette correspondance sans aucun bénéfice.

**Section 7 — Vos objectifs de croissance**
- 7.1 Vos objectifs de croissance par horizon : une ligne par période. — *tableau à lignes fixes*. Lignes (Horizon, inchangées) : Aujourd'hui / Dans 6 mois / Dans 2 ans / Dans 5 ans / Dans 10 ans.
  Colonnes (10 septembre 2026, remplacent "Nb de clients/utilisateurs" + "Détail") : CA (*nombre*) | Nb de clients (*nombre*) | Zone géographique (*choix multiple*, menu déroulant à cases à cocher — liste complète d'environ 200 pays, plusieurs par ligne) | Ville (*texte court*) | Note supplémentaire (*texte long*). Les mêmes 5 colonnes s'appliquent aux 5 lignes, y compris "Aujourd'hui" (plus de double-usage de la colonne "Détail" selon la ligne).
- 7.2 Quelle est, selon vous, l'issue finale de ce projet ? — *texte long*
  Aide : revente de l'entreprise, transmission, rente générée sans y travailler, arrêt volontaire une fois un objectif atteint, activité gardée à vie... Pas besoin d'être certain, donner l'intuition actuelle.

**Section 8 — Votre client cible**
- 8.0 Votre produit s'adresse-t-il plutôt à des entreprises ou à des particuliers ? — *choix unique* : Entreprises / Particuliers
- Si "Entreprises" : 8.1 Quel type de ressources humaines ont-elles typiquement ? Dans quel secteur sont-elles implantées ? Quel gain votre produit leur apporte-t-il ? — *texte long, conditionnel*
- Si "Particuliers" : 8.2 Âge moyen, moyens financiers et gamme de qualité recherchée ? — *texte long, conditionnel*
- Si "Particuliers" : 8.3 Passe-temps, philosophie / valeurs de ce client, et secteur d'activité ? — *texte long, conditionnel*
- Si "Particuliers" : 8.4 Quelle frustration votre produit vient-il combler pour lui ? — *texte long, conditionnel*

  (À vérifier avec le .docx original si 8.3/8.4 sont vraiment réservées à la branche "Particuliers" ou communes aux deux — la mise en page du document ne tranche pas totalement ce point, transcription faite au mieux.)

**Section 9 — Votre démarcation**
- 9.1 Selon vous, en quoi consistera le succès de votre produit sur le marché ? — *texte long*
  Aide : qu'est-ce qui, précisément, va faire la différence par rapport à l'existant ?

**Section 10 — L'image désirée**
- 10.1 Souhaitez-vous que votre produit soit très, modérément ou peu accessible à la population ? — *choix unique* : Très accessible / Modérément accessible / Peu accessible
- 10.2 Quelle image cela donne-t-il envie de véhiculer, et pour quelle demande cela répond-il ? — *texte long*

---

## Formulaire 2 — Moyens de réalisation (`kind: 'means'`)

**Identification** (hors accordéon)
- 0.1 Quel est le nom de l'activité ou du projet concerné par ce formulaire ? — *texte court*
  Aide : reprendre le même nom que dans Découverte du Projet.

**Section 1 — Équipe**
- 1.1 Combien de personnes seront allouées à ce projet ? — *nombre*
  Aide : nombre total de personnes qui y travailleront, à temps plein ou partiel.
- *Conditionnel : si plusieurs personnes (réponse 1.1 > 1), afficher :*
  1.2 Répartition des rôles : une ligne par personne. — **C'est ici que vit "qui fait quoi dans l'équipe", pas dans une section 8 séparée comme évoqué précédemment.** *Tableau répétable* (4 lignes par défaut, extensible) : Personne (nom/rôle) | Temps consacré (*choix unique* : Temps plein / Temps partiel / Ponctuel-occasionnel) | Pôle(s) couverts principalement (*choix multiple* : Entreprise / Produit / Communauté)
  Aide : les 3 pôles utilisés pour la feuille de route sont Entreprise (structuration, légal, outils), Produit (l'offre elle-même), Communauté (audience, clients). Plusieurs pôles possibles par personne.
- *Conditionnel : si plusieurs personnes (réponse 1.1 > 1), afficher :* 1.3 Y a-t-il un pôle sans responsable clair aujourd'hui ? — *choix* : Non, chaque pôle a quelqu'un / Oui — lequel (texte)
  (10 septembre 2026, sur demande de Gaspard : conditionnée comme 1.2, inutile de la poser à quelqu'un qui travaille seul.)
- *Conditionnel : si plusieurs personnes (réponse 1.1 > 1), afficher :* 1.4 En cas de désaccord entre vous sur les priorités, qui tranche en dernier ressort ? — *texte long*

**Section 2 — Moyens temporels**
- 2.1 Combien d'heures, au total, l'équipe peut-elle consacrer au projet chaque semaine ? — *nombre*
  Aide : additionner les heures disponibles de tous les membres pour ce projet.

**Section 3 — Moyens financiers**
- 3.1 Quel est le budget alloué à ce projet ? — *texte court* (montant + devise)

**Section 4 — Stratégie d'exécution**
- 4.1 Comment comptez-vous réaliser ce projet ? — *choix unique* : Tout réaliser en interne / Déléguer une partie des tâches
- Si "Déléguer" : 4.2 Si vous déléguez une partie des tâches, lesquelles ? — *texte long, conditionnel*
  Aide : ex. comptabilité, développement web, etc.

**Section 5 — Autres besoins**
- 5.1 Avez-vous d'autres besoins pour mener à bien ce projet ? — *texte long*
  Aide : matériel, outils, logiciels, expertise externe, accès, formation, etc.

**Section 6 — Risques internes identifiés**
- 6.1 Y a-t-il un point de blocage interne déjà identifié qui pourrait ralentir ce projet ? — *texte long*
  Aide : distinct des freins externes. Ex : dépendance à une seule personne, incertitude juridique en cours, outil/accès manquant, compétence clé absente.

---

## Formulaire 3 — Stratégie de Développement (`kind: 'strategy'`)

**Identification** (hors accordéon)
- Nom de l'activité ou du projet concerné — *texte court*
- (Votre nom / Date figurent sur le document imprimé, pas nécessaires comme champs de saisie côté app)

**Section 1 — Vos priorités**
- Q1. Quelle est votre priorité principale pour les prochains mois ? (jusqu'à 2 réponses) — *choix multiple, max 2* : Générer plus de revenu / Développer ma clientèle / Renforcer ma communauté ou mon impact / Structurer et stabiliser mon entreprise (légal, outils, processus) / Préserver mon équilibre personnel / Autre (texte)
- Q2. Et si vous ne deviez en garder qu'une seule, la plus urgente ? — *choix unique* (mêmes options que Q1, sans "Autre")
- Q3. Pour avancer plus vite dessus, seriez-vous prêt(e) à mettre autre chose de côté temporairement ? — *choix unique* : Du temps sur la prospection / Une partie du revenu à court terme / Certaines tâches administratives / Rien / Autre (texte)
- Q4. Dans 3 mois, quel signe vous dirait que vous avez bien avancé sur cette priorité ? — *choix unique* : Plus de revenu / Plus de clients / Une entreprise mieux structurée / Plus de temps pour moi / Un impact plus visible / Autre (texte)
- Q5. Qu'est-ce qui pourrait vous faire changer de priorité en cours de route ? — *choix unique* : Un imprévu financier / Une opportunité inattendue / Le manque de résultats rapides / Rien / Autre (texte)

**Section 2 — Votre modèle économique**
- Q6. Comment fixez-vous, ou pensez-vous fixer, le prix de votre offre ? — *choix unique* : Un prix fixe par projet ou mandat / Un abonnement récurrent / Un pourcentage sur les résultats / Une combinaison / Pas encore décidé / Autre (texte)
- Q7. Quel est, environ, le prix moyen d'une vente ou d'un mandat ? — *texte court* (montant, ou "pas encore défini")
- Q8. Que vous coûte, environ, l'obtention d'un nouveau client ? — 3 sous-champs texte court : Temps passé / Publicité / Commission, + case "Je ne sais pas encore"

**Section 3 — Le cadre de votre entreprise**
- Q9. Votre entreprise est-elle créée légalement aujourd'hui ? — *choix unique* : Oui / Non, pas encore / En cours de démarches
- Q10. Avez-vous un ou plusieurs associés (partagent la propriété) ? — *choix* : Oui (préciser texte) / Non

**Section 4 — Comment vous saurez que ça avance**
- Q11. Quel autre signe vous dira que votre projet fonctionne bien ? — *choix unique* : Le revenu généré / Le taux de clients qui reviennent ou recommandent / La satisfaction exprimée / La facilité à convaincre un nouveau client / Autre (texte)

**Section 5 — Vos prochaines étapes**
- Q12. Quelles sont les 2 ou 3 prochaines actions concrètes que vous comptez faire ce mois-ci ? — *texte long*
- Q13. Qu'est-ce qui pourrait freiner votre projet et qui ne dépend pas directement de vous ? — *choix unique* : Une réglementation ou norme / La saisonnalité / La dépendance à un fournisseur/partenaire / Rien d'identifié / Autre (texte)

**Section 6 — Votre entourage pour les grandes décisions**
- Q14. Avez-vous une ou des personnes de confiance pour vous aider à prendre les décisions importantes (associé, mentor, proche) ? — *choix* : Oui (préciser texte) / Non

---

## Formulaire 4 — Profil Client (`kind: 'profile'`, un seul par client, partagé entre activités)

**Section 1 — Votre projet, en pratique**
- Q1. Où en est votre projet aujourd'hui ? (une seule réponse) — *choix unique* : Encore une idée, pas encore lancé / Je commence tout juste / J'ai déjà un ou plusieurs clients / Je suis en pleine croissance
- Q2. Avez-vous déjà des contacts, une communauté ou des clients sur qui vous appuyer ? — *choix* : Oui (préciser texte) / Non
- Q3. Avez-vous une formation, une expérience ou une compétence particulière utile à ce projet ? — *choix* : Oui (préciser texte) / Non
- Q4. Avez-vous d'autres activités (emploi, études...) qui limitent le temps que vous pouvez y consacrer ? — *choix* : Oui (préciser texte) / Non

**Section 2 — Ce qui compte pour vous**
- Q5. Qu'est-ce qui compte le plus pour vous dans votre façon de travailler ? (1 ou 2 réponses) — *choix multiple* : Rester indépendant(e) / Avoir un vrai impact / Être payé(e) à ma juste valeur / Garder un contact direct avec mes clients / Autre (texte)
- Q6. Quelle partie de votre travail préférez-vous ? (plusieurs réponses) — *choix multiple* : Être en contact avec les clients / Réfléchir à la vision, à la stratégie / Créer, fabriquer, produire / Organiser, gérer, structurer / Autre (texte)

**Section 3 — Vos forces et vos défis**
- Q7. Quelles sont vos plus grandes forces aujourd'hui ? (plusieurs réponses) — *choix multiple* : Créativité, idées nouvelles / Sens du relationnel / Organisation, rigueur / Persévérance / Expertise technique / Capacité à foncer sans tout préparer / Autre (texte)
- Q8. Qu'est-ce qui vous freine le plus en ce moment ? (plusieurs réponses) — *choix multiple* : Le manque de temps / Le manque d'argent / Je ne sais pas par où commencer / Il me manque des compétences / Le manque de confiance / Autre (texte)

**Section 4 — Votre façon de travailler**
- Q9. Face à l'incertitude, vous êtes plutôt… (une seule réponse) — *choix unique* : À l'aise : j'avance même sans tout savoir / Plus prudent(e) : j'aime avoir un plan clair avant d'agir
- Q10. Vous préférez avancer… (une seule réponse) — *choix unique* : Étape par étape, prudemment / Vite, quitte à ajuster en cours de route
- *Sous-titre 4.1 : "Si vous pouvez avoir un accompagnement personnalisé :"*
- Q11. De quelle manière souhaiteriez-vous être accompagné(e) ? (une seule réponse) — *choix unique* : Être guidé(e) pas à pas / Avoir de la liberté, avec un cadre général / Un mélange des deux
- Q12. Comment préférez-vous rester en contact avec votre accompagnant ? (une seule réponse) — *choix unique* : Un point rapide chaque semaine / Un suivi plus espacé (1 ou 2/mois) / Peu importe, dites-moi quoi faire

**Section 5 — Pour mieux vous cerner** (5 phrases courtes, échelle 1 à 5 chacune, "Pas d'accord" ↔ "Tout à fait d'accord")
- Q13. J'aime essayer de nouvelles idées et sortir des sentiers battus. — *échelle 1-5*
- Q14. J'aime que les choses soient bien organisées et planifiées à l'avance. — *échelle 1-5*
- Q15. Je me sens à l'aise et énergisé(e) au contact des autres. — *échelle 1-5*
- Q16. Je préfère que tout le monde soit gagnant plutôt que de chercher à gagner à tout prix. — *échelle 1-5*
- Q17. Même dans l'incertitude, je reste plutôt calme et confiant(e). — *échelle 1-5*
- Q18. Souhaitez-vous ajouter quelque chose ? (facultatif) — *texte long*
