# Audit de simplicité — Réglages, Profil, Objectifs (pages 1-3), fenêtre Activité (20 oct. 2026)

Propositions seulement, rien retiré (aucune citation d'Émilien ne couvre ces éléments dans `docs/regles/intentions.md`, sauf les Réglages en plein écran du 19 oct., déjà appliqués). Captures 390 px dans `docs/img/audit-ecrans2-*-2026-10-20.png` (données de démo : activité « Scénarios Feuille de route (test) »). Questions à cocher : `questions-emilien-simplification.md`.

## Réglages (`audit-ecrans2-reglages-…`, `…-mon-ia-…`, `…-securite-…`)
Fonction unique : **régler mon compte et l'app une fois, puis ne plus y revenir**. 10 sections repliées ; la liste fermée est claire.

| Élément | Verdict |
|---|---|
| Liste de 10 sections (Identité, Sécurité, Supprimer, Langue, Modules, Notifications, Mon IA, Calendrier et export, Partage, Aide) | garder ; « Supprimer mon compte » et « Langue » pourraient aller dans Identité (moins de lignes), sans demande : non proposé |
| Bouton « Déconnexion » en orange dans l'en-tête | orange proscrit hors suppression (SIMPLIFICATION.md) → PROPOSITION : le passer en violet/neutre |
| Sécurité : « Se déconnecter de tous les appareils » (orange) en plus de « Déconnexion » | deux chemins vers la déconnexion → PROPOSITION : retirer « tous les appareils » (ou garder en neutre) |
| Sécurité : 4 liens légaux + 2 bascules (usage commercial, trouvable) | légal/Loi 25 : réservé à Émilien, ne pas toucher |
| Mon IA : choix Autonome / Partiel / Absent + « Connecter mon IA » (Créer l'adresse, Détails) | deux fonctions dans une section ; PROPOSITION : retirer « Détails » (texte déjà explicite) |
| Partage : « Partager l'app » + « Partager mon profil » + QR code | PROPOSITION : un seul bouton « Partager », sans QR |
| Notifications : une seule bascule « Communauté » | garder |
| Modules : 3 bascules (Chrono, Feuille de route, Communauté et profil) | garder (seul chemin de désactivation, 19 oct.) |
| Aide et suggestions (Suggestion / Signaler un bug + message + pièce jointe) | garder : c'est l'unique entrée de feedback |

## Profil (`audit-ecrans2-profil-…`)
Fonction unique : **voir mon identité et mes projets**.
| Élément | Verdict |
|---|---|
| Photo + nom, icônes abonnés / invitations, ✕ | garder (demandé 29 sept.) |
| Bouton « + » seul sous la barre (ajouter un projet), sur une ligne vide | PROPOSITION : l'afficher seulement s'il existe des projets, sinon un texte d'une ligne |
| Zone « Écrire aux membres… » + « + » (sondage) + trombone + « Envoyer » : 4 éléments pour écrire | recoupe l'onglet Communauté (« écrire = uniquement dans Communauté », 19 oct.) → PROPOSITION : retirer la Discussion du Profil |
| Texte « Aucun message pour l'instant » | disparaît avec la Discussion |

## Objectifs page 1 — capture (`audit-ecrans2-objectifs-p1-…`)
Fonction unique : **écrire une tâche, Noèsis la range**.
| Élément | Verdict |
|---|---|
| Zone d'écriture + trombone + « Ajouter » | garder |
| Une ligne par activité avec pastille orange (badge) | garder ; pastille orange = non-suppression → PROPOSITION : violet |
| Carte « À VENIR · Génère automatiquement… Découvrir Expansion · J'ai un code » (grande, plus visible que la zone d'écriture) | PROPOSITION : la déplacer sous « Historique » ou dans Réglages ; deux liens (« Découvrir », « J'ai un code ») = deux entrées |
| Bouton « Historique » | garder |

## Objectifs page 2 — tâches du jour (`…-objectifs-taches-…`), mensuel (`…-mensuel-…`), arbre annuel (`…-arbre-…`)
Fonction unique : **savoir ce que je fais aujourd'hui** (Tâches) ; **voir mes objectifs** (Mensuel/Annuel).
| Élément | Verdict |
|---|---|
| Sélecteur de pôle ‹ Entreprise › + bouton Stratégie + cible | garder |
| Deux bandeaux d'alerte orange empilés (« Plafond atteint », « Non réalisées »), chacun avec chevron ET ✕ | orange + 2 bandeaux avant la 1re tâche → PROPOSITION : un seul bandeau, en violet/neutre, ou fusion en une ligne |
| Carte « Avancement quotidien » (anneau 0 %, « 0 / 2 tâches complétées ») | redondante avec la barre « 0 % · 0/1 » de chaque secteur → PROPOSITION : retirer la carte |
| Barre de progression par secteur + « 0% · 0/1 » | garder la barre, retirer le texte « 0/1 » |
| Crayon par tâche (modifier) + champ « Ajouter une tâche… » + « Ajouter » | garder |
| 3 points Tâches / Mensuel / Annuel | garder |
| Mensuel : pastilles de secteur, flèches de période, « Objectif périodique » + hebdomadaires S41-S44 « Titre de l'objectif » | 4 lignes vides ; garder (structure demandée) |
| Annuel : 2026 ▾, colonnes par secteur, « + Objectif de l'année » dans chaque colonne, grille de blocs gris vides | vide = signe de peu d'information ; ne pas toucher (arbre périodique protégé) |

## Objectifs page 3 — détail d'une période (`…-objectifs-periode-…`)
Fonction unique : **fixer l'objectif d'une période**.
| Élément | Verdict |
|---|---|
| Titre + description (placeholder long de 3 lignes) | PROPOSITION : raccourcir le texte du placeholder |
| Tableau « Moyenne / Cible » + « Utiliser ma moyenne » + phrase « Les objectifs hebdomadaires te seront ensuite proposés automatiquement » | PROPOSITION : retirer la phrase (déjà claire par le comportement) |
| « Enregistrer » | garder |
| Calendrier externe | n'est pas sur cet écran : il vit en Réglages › Calendrier et export (import ICS + export de données = deux fonctions) |

## Fenêtre Activité (`…-activite-liste-…`, `…-fenetre-…`, `…-poles-…`)
Fonction unique : **gérer mes activités, leurs pôles et leurs membres**.
| Élément | Verdict |
|---|---|
| Liste : pastille, nom, « n membres · Publique », crayon | garder |
| Le crayon de l'activité ET le clic sur la ligne ouvrent la fenêtre | deux entrées pour la même fonction → PROPOSITION : garder le clic seul |
| Fenêtre : bascule « Catégories / Statistiques » (activité partagée) | les Statistiques répètent l'onglet Stats → PROPOSITION : retirer la bascule |
| Liste de pôles : crayon + chevron sur chaque ligne | deux entrées vers deux fonctions voisines ; garder |
| Icône « Membres » (+ personne) et ✕ | garder |
| Page vide d'une activité sans pôle (« Pôles & secteurs » + « + » seul sur un écran noir) | texte d'une ligne manquant ; sans proposition d'ajout |

## Transverse
Pastilles orange (barre du bas, badges d'activité, bandeaux, Déconnexion) : 4 usages d'orange hors suppression, voir `SIMPLIFICATION.md` (19 oct.). Une décision unique règle tous les cas.
