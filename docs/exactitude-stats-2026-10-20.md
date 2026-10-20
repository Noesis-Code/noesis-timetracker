# Exactitude des Statistiques et de la Feuille de temps (20 oct. 2026)

Test de bout en bout : `test/fonctionnel-exactitude.js` (serveur réel, données seedées, fuseau America/Toronto, branché dans `node test/run-tests.js`). « Brut » = somme des durées des entrées vivantes. Règle : le temps d'un secteur remonte au pôle partout, sauf en Répartition.

| Cas | Attendu | Résultat | Test |
|---|---|---|---|
| Répartition (pôle, 3 secteurs, sans catégorie) | total = brut ; chaque part exacte ; secteurs visibles avec leur pôle ; somme des parts = total | OK | `Répartition : ...` |
| Graphique jour / semaine / mois | aucun secteur ; pôle = pôle + ses secteurs ; total = brut ; chaque point = somme de ses parts | OK | `Graphique (jour/semaine/mois)` |
| Répartition regroupée par pôle vs graphique | mêmes totaux par pôle | OK | `Répartition regroupée par pôle = graphique` |
| Semaine à cheval sur un lundi | le dimanche reste dans la semaine du lundi précédent | OK | `Graphique (semaine)` |
| Feuille de temps Semaine (par pôle et par activité), semaine précédente lundi -> dimanche | aucun secteur dans la grille ; cases du pôle = pôle + secteurs ; Répartition jointe = brut | OK | `Feuille de temps (semaine)` |
| Feuille de temps Mois | secteur remonté au pôle, aucun secteur affiché | OK | `Feuille de temps (mois)` |
| Feuille de temps Année | 12 mois, ligne d'activité et Répartition jointe = brut | **ÉCART corrigé** : une entrée du 31 janv. 23 h au 1er févr. 1 h perdait 1 h (coupée à la fin du mois, non reprise le mois suivant) ; ligne d'activité inférieure à la Répartition de l'année | `Feuille de temps Année` |
| Changement d'heure (mars : 2 h réelles pour 01 h 30 -> 04 h 30 ; nov. : 6 h réelles pour 00 h 30 -> 05 h 30) | heures réelles comptées | OK | `changement d'heure`, Répartition |
| Entrée supprimée | ne compte plus, absente de l'export | OK | `entrée supprimée`, `Export JSON` |
| Entrée modifiée (durée, pôle) | nouvelles valeurs seules | OK | `entrée modifiée`, Répartition |
| Secteur renommé | temps conservé, nouveau nom | OK | `secteur renommé` |
| Secteur supprimé (gelé) | temps conservé en Répartition (gelé), remonté au pôle au graphique | OK | `secteur supprimé reste compté` |
| Secteur supprimé, cartes d'activité (Statistiques d'activité) | temps du jour compté dans le pôle | **ÉCART corrigé** : seuls les secteurs actifs étaient lus (`statsinsights.js`), 0 min | `Cartes d'activité` |
| 0 minute | refusée par l'API (400) ; une ancienne ligne à 0 s est ignorée (aucune part à 0) | OK | `0 minute` |
| Plus de 24 h | POST accepte 27 h, comptée entière au jour de départ (graphique, Répartition sur fenêtre qui la contient) ; la modification d'une entrée > 24 h est refusée (400) | OK (voir « Constats ») | `27 h`, `modification > 24 h` |
| « Aujourd'hui » | total = brut du jour | OK | `Aujourd'hui` |
| Export JSON des données | somme des durées = brut ; par catégorie = Répartition ; entrée supprimée absente | **ÉCART corrigé** : `goalCategory` absent de `timeEntries` (pôle/secteur perdu à l'export) | `Export JSON` |
| Historique de l'année | somme des durées = brut | OK | `Historique de l'année` |

## Corrections minimales
- `server/lib/stats.js` : `breakdownForRange` accepte une borne de découpe optionnelle ; la vue Année l'utilise (fin d'année) pour que la somme des 12 mois = total de l'année.
- `server/lib/statsinsights.js` : le temps des secteurs supprimés reste compté dans leur pôle (clés `timeKeys`, usage limité au temps).
- `server/lib/dataexport.js` : ajoute `goalCategory` à chaque entrée exportée.

## Constats non modifiés (décision d'Émilien en attente ou hors périmètre)
- Entrée qui passe minuit : le Graphique et la Communauté la comptent entière au jour de départ ; la Répartition et la grille la découpent à la fin de la fenêtre affichée (la partie après la dernière journée de la fenêtre n'est pas comptée). Les totaux sur une fenêtre qui contient toute l'entrée sont exacts. Question déjà posée dans `docs/questions-emilien-basic.md` (découpe par jour).
- Le garde-fou « pas plus de 24 h / pas de chevauchement / pas dans le futur » (`entryguard.js`) ne s'applique qu'à la modification (PUT), pas à l'ajout manuel (POST `/api/history`) : une entrée de 27 h peut donc être créée. À décider (il changerait la saisie ; hors périmètre de ce chantier).
- Fenêtres de la Répartition et de la grille calculées en heure du serveur (America/Toronto) alors que `isoDate` suit le fuseau du téléphone : exact pour le Québec/Ontario, écart possible aux bords de journée ailleurs au Canada.
