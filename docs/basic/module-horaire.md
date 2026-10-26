# Module « Horaire » (backend, 26 oct. 2026)

Génère l'horaire hebdomadaire du personnel d'un restaurant. Pilote : le maître d'hôtel de Jacopo. **Gestionnaire seul** :
un seul compte (le propriétaire) voit et modifie ses données ; pas de gestionnaire secondaire, pas de compte employé.
Aucun écran dans ce lot (les écrans viendront après validation d'une maquette). Repris de la PR #3 (`horaires-jacopo`,
non fusionnée), réduit à la forme minimale.

## Fichiers
- `server/lib/horaire-generation.js` : génération, fonction pure (testée par `test/horaire-generation-test.js`).
- `server/lib/horaire.js` : données (chaque requête filtrée par le `userId` de session), import CSV.
- `server/routes/horaire.js` : validation et codes HTTP. Tables `horaire_*` dans `server/db.js`.
- Accès : module `horaire` (clé ajoutée dans `server/lib/modules.js` par le lot « choix des modules ») ; inactif = 403
  `module_off` (règle dans `server/lib/modulegate.js`).

## Données (toutes rattachées au propriétaire)
Employés (nom, max d'heures hebdo en minutes, tous postes confondus, actif) ; postes (ordre de comblement) ;
qualifications (rang par employé ET par poste, 1 = meilleur ; plusieurs postes par employé) ; disponibilités par semaine
(plages jour + heures) ; besoins du modèle normal (poste, jour 0 = lundi … 6 = dimanche, heures, nombre) ; événements
spéciaux (date + besoins qui remplacent le modèle normal ce jour-là) ; état de rotation (dernier servi par poste et par
rang) ; horaires (brouillon par semaine + alertes) et quarts. Un quart dont la fin est avant le début traverse minuit.

## Algorithme
1. Postes dans l'ordre de comblement ; dans un poste, créneaux par criticité : soir d'événement spécial, puis tous les
   autres soirs (début à 16 h ou plus, à égalité, ordre chronologique), puis jour de fin de semaine (brunch), puis jour
   de semaine (lunch) — décision d'Émilien, 26 oct. 2026.
2. Contraintes strictes : un employé = un seul poste par jour (plusieurs quarts du même poste s'ils ne se chevauchent
   pas) ; jamais hors disponibilité ; jamais sans qualification.
3. Meilleur rang d'abord ; à rang égal, tourniquet (repris d'une génération à l'autre).
4. 1re passe avec le max hebdo ; 2e passe sur les seuls créneaux vides : seul le max est assoupli.
5. Sortie : quarts + alertes `trou` (poste, jour, heures, nombre manquant) et `depassement` (employé, minutes, max).

## Routes (`/api/horaire/...`, session requise)
| Méthode | Chemin | Rôle |
|---|---|---|
| GET, POST | `employees` | lister, créer `{name, maxWeekMinutes?}` |
| PUT, DELETE | `employees/:id` | modifier `{name?, maxWeekMinutes?, active?}`, supprimer (avec ses quarts) |
| GET, POST | `positions` | lister, créer `{name, fillOrder?}` |
| PUT, DELETE | `positions/:id` | modifier, supprimer |
| GET, PUT | `qualifications` | lister, poser `{employeeId, positionId, rank}` |
| DELETE | `qualifications/:employeeId/:positionId` | retirer |
| GET | `weeks/:lundi/availabilities` | disponibilités de la semaine |
| PUT | `weeks/:lundi/availabilities/:employeeId` | remplacer `{intervals:[{day, start, end}]}` |
| GET, POST / PUT, DELETE | `needs` / `needs/:id` | besoins normaux `{positionId, weekday, start, end, count}` |
| GET, POST / PUT, DELETE | `events` / `events/:id` | événements `{day, label, needs:[{positionId, start, end, count}]}` |
| POST | `weeks/:lundi/generate` | générer et enregistrer le brouillon |
| GET | `weeks/:lundi` | horaire enregistré (quarts + alertes, `null` si aucun) |
| POST | `import/employees` | CSV `{csv}` |
| POST | `weeks/:lundi/import/availabilities` | CSV `{csv}` |
| GET | `weeks/:lundi/export/dayforce` | CSV pour l'import Dayforce (voir plus bas) |
| GET, PUT | `settings` | code d'unité Dayforce du compte `{dayforceLocation}` |

## Import CSV (format souple, en attendant l'échantillon du maître d'hôtel)
Séparateur `;`, `,` ou tabulation (détecté) ; guillemets acceptés ; en-tête facultatif (sinon ordre ci-dessous).
- Employés : `nom ; max (heures, « 30 », « 37,5 », « 40h ») ; postes`. Postes : `Serveur:1 | Hôte:2` (rang 1 par
  défaut), ou une colonne par poste. Nom déjà connu = mise à jour ; poste inconnu = créé en fin d'ordre.
- Disponibilités : `nom ; jour ; début ; fin`, une ligne par plage. Jour = date de la semaine ou nom (lundi, lun, monday…).
  Heures : `17:00`, `17h`, `17h30`, `5 pm`. Remplace la semaine des seuls employés présents ; noms inconnus listés.

## Export Dayforce (26 oct. 2026)
Le restaurant gère sa paie dans Dayforce (Ceridian). `GET /api/horaire/weeks/:lundi/export/dayforce` renvoie le CSV de
l'horaire enregistré de la semaine (404 si aucun), prêt pour l'import des horaires de Dayforce : une ligne par quart.
- Format centralisé dans `server/lib/horaire-dayforce.js` (constante `DAYFORCE_FORMAT` : séparateur, fins de ligne, ordre
  et en-tête des colonnes). En-tête provisoire : `EmployeeXRefCode, StartDate, StartTime, EndDate, EndTime, JobXRefCode,
  OrgUnitXRefCode` — à ajuster sur le fichier modèle du restaurant, sans toucher au reste.
- Dates `AAAA-MM-JJ`, heures `HH:MM` (24 h), calculées sans dépendre du fuseau du serveur. Un quart qui traverse minuit
  finit le lendemain (date de fin explicite) ; `24:00` devient `00:00` le lendemain. Les trous (créneaux non comblés) ne
  sont pas exportés. Échappement CSV RFC 4180, BOM UTF-8 et fins de ligne CRLF (Excel).
- Correspondances (texte, 64 caractères au plus, `null` ou `''` = effacé) : `dayforceId` (matricule) par employé via
  `POST/PUT employees`, `dayforceCode` (code de poste) par poste via `POST/PUT positions`, `dayforceLocation` (code
  d'unité) par compte via `GET/PUT /api/horaire/settings`. Un code absent laisse la cellule vide ; l'en-tête de réponse
  `X-Dayforce-Missing: employees=N;positions=N;location=0|1` le signale (nombres seuls, aucun nom).
- Réservé au compte propriétaire (session) et au module `horaire` actif ; rien n'est journalisé. Test :
  `test/horaire-dayforce-test.js`.

## Loi 25
Données confidentielles du personnel : jamais envoyées à l'IA, à la Communauté, au partage ni aux journaux. Incluses dans
l'export du compte (clé `horaire`), effacées à la suppression du compte (cascade + `accountdeletion.js`).

## Reste à faire
Écrans (après maquette validée) ; ajustement de l'import à l'échantillon réel ; colonnes de l'export Dayforce à fixer sur
le fichier modèle d'import du restaurant.
