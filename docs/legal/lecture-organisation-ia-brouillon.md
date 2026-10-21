# Lecture de l'organisation IA : textes légaux (BROUILLON)

**BROUILLON À FAIRE RELIRE PAR UN JURISTE AVANT ACTIVATION.**

> **Ceci n'est pas un avis juridique. Rien n'est branché, rien n'est activé.** Aucun de ces textes n'est affiché dans l'application ni versionné (`server/lib/legalversions.js` inchangé). Sources : `docs/expansion/lecture-organisation-ia-cadrage.md` (décisions d'Émilien du 21 oct. 2026) et les textes déjà présents dans `public/index.html` (CGU v1.2, politique de confidentialité v3.7, mentions légales, gouvernance).

Ce que fait la fonction, en une phrase : quand l'utilisateur connecte son IA, TimeTracker lit (sans rien modifier) la STRUCTURE de ce que l'IA organise (tâches et objectifs ; stratégies plus tard) et n'en garde que des statistiques de FORME, anonymes, pour améliorer l'algorithme intégré.

---

## 1. Case de consentement (affichée à la connexion de l'IA)

Texte proposé (une case, **non cochée d'office**) :

> ☐ **J'accepte que TimeTracker lise la structure de ce que mon IA organise** (nombre d'étapes, niveaux, durées, dates), sans rien modifier, pour améliorer son algorithme.
> Les mots de mes tâches, les noms et les lieux ne sont jamais gardés : seuls des nombres et des catégories anonymes le sont. Personne ne lit mon plan. Je peux me retirer à tout moment dans Réglages.
> *On apprend des formes, jamais de tes mots.*

(6 lignes avec la phrase d'accompagnement. Lien « En savoir plus » vers la politique de confidentialité, section ajoutée au point 3.)

**Si l'utilisateur refuse : proposition = la connexion de l'IA fonctionne quand même, sans aucune lecture.** Justification :
- Loi 25 (art. 14 de la loi privée) : le consentement doit être manifeste, libre, éclairé et donné à des fins spécifiques. Un consentement « libre » est douteux s'il conditionne un service qu'on peut offrir sans cette lecture ; lier la connexion au consentement l'affaiblirait.
- La lecture sert l'intérêt de Noèsis (améliorer et vendre l'algorithme), pas le fonctionnement du service rendu à l'utilisateur : il n'y a donc pas de raison de la rendre obligatoire.
- Coût pour Émilien : moins de données. Contrepartie possible, **À DÉCIDER (2027, paiement réservé à Émilien)** : l'option « accès au connecteur sans lecture contre un petit montant » du cadrage devra être revue par un juriste (voir §6) ; tant qu'elle n'existe pas, refuser est gratuit.
- Le refus ne se redemande pas à chaque connexion (une seule invitation, rappel possible depuis Réglages) pour éviter une pression.

Conformité, point par point : *manifeste* = case à cocher distincte, non pré-cochée, séparée des CGU ; *libre* = refus sans conséquence sur la connexion ni sur le reste de l'app ; *éclairé* = ce qui est lu, ce qui est gardé, l'absence de lecture humaine et le retrait sont dits en langage simple dans la case ; *spécifique* = une seule finalité (améliorer l'algorithme intégré), pas de réutilisation (publicité, revente de données, profilage individuel) ; *limité dans le temps* = valable tant que l'IA est connectée et que l'utilisateur ne retire pas son accord.

---

## 2. Clause à ajouter aux conditions d'utilisation

À insérer comme nouvel article de la section 4 (Description des Services), à la suite de 4.6 (assistant IA), en reprenant le ton et les définitions existantes (« Utilisateur », « Société », « Offre Gratuite »). Numéro à fixer à l'insertion (ex. 4.7).

> **4.7 Lecture de l'organisation de votre IA (facultative).** Lorsque vous connectez votre propre intelligence artificielle à l'application, vous pouvez accepter, par une case distincte que vous cochez vous-même, que la Société lise, sans rien modifier, la structure de ce que votre IA organise dans l'application (tâches et objectifs) afin d'améliorer l'algorithme intégré à l'application. La Société n'en conserve que des mesures de forme (nombres, niveaux, catégories) anonymes, jamais le texte que vous ou votre IA avez écrit, ni les noms de lieux. Aucune personne ne lit votre plan. Votre acceptation n'est pas une condition de la connexion de votre IA ni de l'utilisation des Services : vous pouvez refuser, ou vous retirer en tout temps dans Réglages, sans frais ni conséquence. Le retrait vaut pour l'avenir ; les statistiques anonymes déjà produites, qui ne permettent pas de vous identifier, ne peuvent pas être retirées. Les détails figurent dans la politique de confidentialité, section « Lecture de l'organisation de votre IA ». Les sections 4.6 (sous-traitant d'intelligence artificielle) et 8 (modification des CGU) s'appliquent sans changement.

Note : les CGU renvoient déjà à la politique pour le détail ; ne pas y recopier les listes. Ajouter l'article à la liste « modifications importantes » de la section 8 (avis par courriel avant la prise d'effet), puisqu'il crée un nouveau traitement.

---

## 3. Ajout à la politique de confidentialité

Nouvelle section proposée, après « Notre assistant d'intelligence artificielle » : **Lecture de l'organisation de votre IA (facultative)**.

**Ce qui est lu.** Seulement si vous avez coché la case à la connexion de l'IA, et seulement ce que votre IA écrit par le connecteur : tâches et objectifs (les stratégies pourraient s'ajouter plus tard, avec un nouvel avis). Rien n'est lu des comptes qui n'ont pas accepté. Rien n'est modifié dans votre compte.

**Ce qui est conservé.** Uniquement des mesures sans texte :
- des **nombres** (par exemple nombre d'étapes d'un plan, durée prévue, longueur d'un titre en nombre de mots) ;
- des **niveaux** (annuel, mensuel, hebdomadaire ; niveau de découpage ; niveau de hauteur d'un objectif tiré d'une liste fermée de marqueurs) ;
- une **étiquette de domaine** choisie par nous dans une liste fermée de grands domaines (ex. commerce, enseignement), que nous devinons automatiquement et que vous pouvez corriger dans Réglages ;
- une **clé de ville** : un code anonyme et irréversible calculé à partir de la ville, qui sert seulement à comparer des plans de villes semblables (impossible de retrouver le nom de la ville à partir du code).

**Ce qui n'est jamais conservé.** Les mots de vos tâches, objectifs, titres ou notes ; les noms de personnes, d'entreprises ou de lieux ; tout lien entre ces statistiques et votre compte (nom, courriel, identifiant). Pour choisir l'étiquette de domaine et le niveau, les mots sont lus une seule fois, automatiquement, en mémoire, puis jetés : ils ne sont pas enregistrés. Les données sensibles ou secrètes ne sont pas retenues.

**Pourquoi.** Une seule finalité : ajuster l'algorithme intégré à l'application (offre « Timetracker-bespoke ») en repérant les formes de plans qui avancent bien. Les statistiques ne servent ni à de la publicité, ni à vous profiler individuellement, ni à être revendues telles quelles ; ce qui peut être vendu, c'est l'algorithme amélioré.

**Aucune personne ne lit votre plan.** Le traitement est entièrement automatique. Personne chez Noèsis ne consulte, copie ou montre un plan individuel, ni pour vérifier ni pour déboguer. Aucune statistique n'est montrée à d'autres utilisateurs.

**Décision automatisée.** L'attribution de l'étiquette de domaine est faite automatiquement (règle locale, puis au besoin un petit modèle d'IA d'Anthropic, notre sous-traitant décrit à la section de l'assistant IA). Elle n'a aucun effet sur vos droits ni sur ce que l'application vous offre ; vous pouvez la voir et la corriger.

**Durée de conservation.** *À DÉCIDER par Émilien.* Proposition : statistiques de forme conservées 24 mois après leur production (assez pour mesurer des durées d'objectifs annuels) puis supprimées ou agrégées de façon irréversible ; journal du consentement conservé tant que le compte existe puis 3 ans (preuve). À la suppression du compte : le lien de lecture cesse immédiatement ; les statistiques déjà anonymisées restent.

**Retrait et consultation.** Dans Réglages (écran existant « Mon IA » ; aucune nouvelle page ni nouveau bouton, on réutilise la case et la liste déjà prévues) : la liste de ce qui est lu, la date des lectures, l'étiquette de domaine détectée (corrigeable) et la case de retrait. Le retrait est immédiat et vaut pour l'avenir. Vous pouvez aussi écrire au responsable ci-dessous pour consulter, corriger ou faire supprimer vos renseignements (réponse visée sous 15 jours, 30 jours au maximum selon la loi).

**Hébergement et sous-traitants.** Inchangés (Railway, Amsterdam ; Anthropic pour l'étiquette seulement en cas de doute de la règle locale). Voir §6 pour le transfert hors Québec.

**Responsable de la protection des renseignements personnels** (texte déjà dans le dépôt) : Émilien Morel-Obaton, vice-président de Noèsis Inc. — compagnie.noesis@gmail.com. Recours : Commission d'accès à l'information du Québec (cai.gouv.qc.ca).

Versions à augmenter à l'activation (pas maintenant) : `PRIVACY_VERSION`, `TERMS_VERSION`, avec avis aux utilisateurs actuels.

---

## 4. Entrée pour le registre des traitements

(Le registre vit dans le projet Claude ; format repris de la proposition « Apprentissage du classement des tâches », `docs/audits/apprentissage-usage.md`.)

| Champ | Valeur |
|---|---|
| Traitement | Lecture de l'organisation de l'IA connectée (statistiques de forme) |
| Base | Consentement exprès, facultatif, case distincte à la connexion de l'IA, retirable |
| Personnes concernées | Utilisateurs (16 ans et plus) ayant connecté une IA et coché la case |
| Données lues (en mémoire, non conservées) | Titres, notes, objectifs, tâches écrits par l'IA via le connecteur |
| Données conservées | Nombres, niveaux, étiquette de domaine (liste fermée), clé de ville anonyme et irréversible ; aucun texte, aucun identifiant de compte |
| Données du consentement | Date, version du texte, état (accepté / retiré), lien au compte (pour la preuve) |
| Finalité | Ajuster l'algorithme intégré (Timetracker-bespoke) ; aucune autre |
| Traitement automatisé | Oui, sans intervention humaine sur un compte précis ; étiquette de domaine devinée (règle locale, repli petit modèle Anthropic) |
| Accès humain | Aucun accès à un plan individuel ; accès aux seules statistiques anonymes (dirigeants) |
| Destinataires | Anthropic (sous-traitant IA), seulement pour l'étiquette en cas de doute, dans le budget IA existant ; aucun autre |
| Hébergement | Railway, Amsterdam (Pays-Bas) |
| Conservation | À DÉCIDER (proposé : 24 mois pour les statistiques ; consentement : durée du compte + 3 ans) |
| Droits | Consultation et retrait dans Réglages ; correction de l'étiquette ; demande au responsable |
| Sécurité | Retrait des mots avant stockage ; test automatique « aucun texte stocké » ; aucun humain ne lit un plan |
| EFVP | Voir §5 |

---

## 5. Évaluation des facteurs relatifs à la vie privée (EFVP), résumé

**Projet** : lecture de la structure des plans écrits par l'IA de l'utilisateur, pour améliorer un algorithme. **Échelle** : petite (quelques dizaines à centaines de comptes au départ).

**Risques**

1. **Ré-identification d'un plan atypique.** Sans seuil minimum d'utilisateurs (décision d'Émilien, qui veut exploiter les algorithmes sans attendre), une forme très rare (taille inhabituelle, rythme très particulier, ordre rare) pourrait être reconnaissable dans une statistique.
2. **Domaine + taille + clé de ville.** En petite ville, cette combinaison peut cibler une seule entreprise. La clé est anonyme et irréversible, mais un cas unique reste un cas unique.
3. **Mots lus avant d'être jetés.** Le tri (domaine, niveau) lit les mots une fois ; une erreur de code pourrait les stocker ou les journaliser. Le repli par petit modèle envoie des intitulés à un sous-traitant hors Québec.
4. **Données sensibles ou secrètes** (clients, santé, finances) présentes dans un plan.
5. **Consentement non libre ou mal compris** (lien avec la connexion, mineurs, texte trop dense).
6. **Dérive de finalité** : nouvelles formes ajoutées plus tard, ou stratégies lues sans nouvel avis.

**Mesures**

- Le code retire les mots avant tout stockage ; seules des listes fermées (domaines, marqueurs de hauteur) et des nombres sont conservés ; **test automatique qui échoue si un texte d'utilisateur est stocké**.
- Aucune statistique n'est montrée à quiconque en dehors de l'algorithme ; aucun humain ne lit un plan ; pas de débogage sur plan réel.
- Ville peu représentée = mention « peu fiable » dans l'algorithme (jamais affichée) ; formes jugées trop précises (ordre des tâches, constance) à rediscuter avant retenue : aucune forme n'est retenue d'office.
- Domaines classés avec exclusion des contenus sensibles ; version 1 limitée aux tâches et objectifs.
- Case non cochée, refus sans conséquence, retrait immédiat, journal du consentement, liste et date des lectures visibles dans Réglages.
- Toute nouvelle forme ou nouvelle source (stratégies) = nouvel avis et nouveau consentement, avec mise à jour de cette EFVP.

**Risque résiduel (dit honnêtement).** Il reste *faible à moyen* : un plan vraiment unique, dans une petite ville, avec un domaine rare, pourrait être reconnu par quelqu'un qui aurait accès aux statistiques brutes ; l'absence de seuil minimum supprime la protection habituelle du nombre. La compensation est que ces statistiques sont internes, sans texte et sans identifiant, que personne ne les consulte individuellement, et que l'utilisateur peut se retirer. Le risque est acceptable seulement si le test « aucun texte stocké » est en place et si les accès aux statistiques brutes restent limités aux dirigeants. À réévaluer dès qu'une forme devient trop précise ou que la base grossit.

---

## 6. Points à faire valider par un juriste

1. **Mineurs.** L'app vise 16 ans et plus (politique §8), mais le consentement parental existe pour 16-17 ans à l'achat. Un jeune de 14 à 17 ans peut-il consentir seul à cette lecture (Loi 25, art. 4.1 : moins de 14 ans = titulaire de l'autorité parentale) ? Faut-il un consentement parental pour 16-17 ans ?
2. **Transfert hors Québec** (art. 17) : hébergement à Amsterdam, étiquette de domaine via Anthropic (États-Unis, traitement « partout dans le monde »). L'évaluation préalable du transfert suffit-elle pour des données de forme ? Les intitulés envoyés au petit modèle sont-ils des renseignements personnels ?
3. **Consentement lié à un service gratuit** et à l'éventuelle option « sans lecture contre un petit montant » (2027) : le refus payant rend-il le consentement non libre ?
4. **Anonymisation** : les statistiques sont-elles « anonymisées » au sens de la loi (processus irréversible, art. 23, règlement sur l'anonymisation) sans seuil minimum, ou seulement « dépersonnalisées » (donc encore des renseignements personnels, avec tous les droits associés) ? Cela change le retrait et la conservation.
5. **Clé de ville** : un hachage irréversible d'une ville est-il suffisant, ou faut-il un sel/seuil pour éviter le recoupement ?
6. **Décision fondée exclusivement sur un traitement automatisé** (art. 12.1) : l'étiquette de domaine devinée entre-t-elle dans ce cadre et quel avis est requis ?
7. **Retrait** : valeur du retrait « pour l'avenir » sans effacer les statistiques déjà agrégées (impossible à retrouver faute de lien au compte).
8. **Données de tiers** : le plan de l'utilisateur peut contenir des renseignements sur des clients ou employés ; l'utilisateur peut-il consentir pour eux ? La clause actuelle suffit-elle ?
9. **Valeur commerciale** : vendre l'algorithme amélioré est-il compatible avec la finalité énoncée ? Faut-il le dire expressément ?
10. **Durée de conservation** proposée (24 mois / 3 ans) et journal d'audit.
11. **Modification des CGU** : procédure d'avis aux utilisateurs actuels (sect. 8) et nécessité d'un nouveau consentement pour ceux qui ont déjà une IA connectée.
12. **EFVP** : la forme résumée suffit-elle ? Obligation de la consigner au registre, et de publier le règlement de gouvernance mis à jour.

---

## 7. Conditions techniques avant d'activer

À remplir avant toute mise en ligne ; rien de ceci n'est fait.

- [ ] **Case non cochée d'office**, distincte des CGU, texte du §1 versionné (nouvelle constante de version) ; refus = connexion de l'IA normale, aucune lecture.
- [ ] **Journal du consentement** : date, version du texte, état, compte ; conservé selon la durée décidée.
- [ ] **Retrait effectif** : désactive la lecture immédiatement (aucun appel de lecture après retrait) ; vérifié par test.
- [ ] **Test automatique « aucun texte stocké »** : échoue si une chaîne issue d'un plan se retrouve dans la base, les journaux, les sauvegardes ou la console.
- [ ] **Visibilité dans Réglages** (écran existant, sans nouveau bouton) : liste de ce qui est lu, dates des lectures, étiquette de domaine corrigeable, retrait.
- [ ] Aucune lecture pour un compte sans consentement actif (test) ; aucune lecture de stratégies en version 1.
- [ ] Liste fermée des domaines et des marqueurs de hauteur tranchée par Émilien ; formes retenues validées une à une.
- [ ] Aucun accès humain à un plan individuel (pas de requête ni d'écran pour cela) ; accès aux statistiques brutes limité aux dirigeants.
- [ ] Durée de conservation décidée et purge automatique en place.
- [ ] Textes (CGU, politique, registre, EFVP) relus par un juriste, versions augmentées, avis aux utilisateurs actuels envoyé.
- [ ] Trade Tracker / autres modules : confirmer qu'ils sont hors périmètre.
