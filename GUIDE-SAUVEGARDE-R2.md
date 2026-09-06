# Guide — activer la sauvegarde chiffrée hors site (Cloudflare R2)

Ce guide suppose que les fichiers suivants sont déjà dans le dépôt :
`server/lib/s3sig.js`, `server/lib/r2client.js`, `server/lib/backup.js`,
`scripts/restore-backup.js` — et que `server/index.js` a été modifié pour
appeler `startBackupSchedule()` (voir étape 5).

**Sans les étapes 1 à 4 ci-dessous, le mécanisme reste inactif** : au
démarrage, les logs afficheront `[backup] Sauvegardes désactivées —
variables manquantes : ...` et l'app continuera de fonctionner normalement
(ce module ne peut jamais faire planter le serveur).

Temps estimé : 20-30 minutes.

## 1. Créer le bucket R2 — juridiction European Union obligatoire

1. Tableau de bord Cloudflare → **R2 Object Storage** → **Create bucket**.
2. Nom : `noesis-backups` (ou autre, à reporter dans `R2_BUCKET`).
3. **Location : European Union (EU)** — ne PAS laisser sur "Automatic".
   C'est ce qui garde l'analyse d'ÉFVP déjà rédigée pour Railway (région
   Amsterdam) valable telle quelle pour ce nouveau destinataire : même
   territoire, même régime RGPD. Une autre région rouvrirait l'ÉFVP.
4. Storage class par défaut (Standard) — le volume est minuscule.

## 2. Générer un jeton API restreint à CE SEUL bucket

1. R2 → **Manage API tokens** → **Create API token**.
2. Permissions : **Object Read & Write**.
3. **Restreindre au bucket `noesis-backups`** — jamais "Apply to all buckets".
4. Noter tout de suite (affiché une seule fois) :
   - **Account ID** → `R2_ACCOUNT_ID`
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`

## 3. Générer la clé de chiffrement — et la ranger HORS de Railway

```
npm run backup-key
```

Copie une chaîne de 64 caractères hexadécimaux. **Cette clé doit vivre dans
un gestionnaire de mots de passe, jamais uniquement dans Railway** : perdre
à la fois le compte Railway et cette clé rend toutes les sauvegardes
définitivement illisibles (le chiffrement est fait pour ça — personne
d'autre, Cloudflare compris, ne peut les lire non plus).

## 4. Poser les variables sur Railway

Railway → service `web` → **Variables** :

| Variable | Valeur |
|---|---|
| `R2_ACCOUNT_ID` | (étape 2) |
| `R2_BUCKET` | `noesis-backups` |
| `R2_ACCESS_KEY_ID` | (étape 2) |
| `R2_SECRET_ACCESS_KEY` | (étape 2) |
| `NOESIS_BACKUP_KEY` | (étape 3) |

Optionnelles (valeurs par défaut déjà raisonnables pour 100 membres) :
`NOESIS_BACKUP_INTERVAL_HOURS` (défaut 24), `NOESIS_BACKUP_KEEP` (défaut
30 — c'est cette valeur qui doit apparaître dans la politique de
confidentialité, voir étape 7), `R2_ENDPOINT` (à ne poser que si le bucket
n'est pas en EU — sinon la valeur par défaut du code convient).

Railway redéploie automatiquement dès qu'une variable est posée.

## 5. Vérifier le branchement dans le code (déjà fait si ce guide vous a été livré avec le reste)

Dans `server/index.js`, tout en haut :
```js
const { startBackupSchedule } = require('./lib/backup');
```
Et dans le callback de `app.listen(...)`, à côté de
`require('./lib/duereminders').startDueReminders();` :
```js
startBackupSchedule();
```
Deux ajouts isolés, aucune ligne existante modifiée.

## 6. Vérifier dans les logs, puis tester une restauration réelle

Après le redéploiement (étape 4), dans les logs Railway :
```
[backup] Activées — première copie dans 2 minutes, puis toutes les 24 h. Rétention : 30 copies.
```
Puis, ~2 minutes plus tard :
```
[backup] Sauvegarde envoyée : noesis-backups/2026-09-09T03-02-00Z.db.gz.enc (... → ... octets)
```

Ensuite, **depuis votre machine** (avec les 5 variables ci-dessus posées
dans votre shell ou un fichier `.env` local non commité) :

```
node scripts/restore-backup.js list
node scripts/restore-backup.js verify
```

`verify` télécharge la sauvegarde la plus récente, la déchiffre, l'ouvre et
exécute `PRAGMA integrity_check` — **sans rien écrire sur le volume de
production**. C'est la preuve qu'une restauration réelle fonctionnerait, pas
seulement que l'envoi a réussi.

**Test de restauration à refaire une fois par trimestre** (`verify` suffit,
30 secondes) — une sauvegarde jamais restaurée n'est pas une sauvegarde,
c'est une hypothèse.

## 7. Mettre à jour les trois documents de conformité

Une fois l'étape 6 confirmée (sauvegarde ET restauration réussies) :

1. **Registre des traitements** — ajouter un traitement : sauvegarde
   hors site chiffrée, destinataire Cloudflare R2 (UE), fréquence
   quotidienne, rétention `NOESIS_BACKUP_KEEP` jours.
2. **ÉFVP hébergement** — ajouter Cloudflare au tableau des destinations ;
   même territoire (UE) que Railway, donc pas de nouvelle analyse de
   transfert hors Québec à faire — seulement consigner ce second
   destinataire. Noter que le chiffrement côté application est une
   protection supplémentaire propre à cette destination (R2 ne détient
   que des octets illisibles).
3. **Politique de confidentialité** (`noesis-timetracker-conformite-loi25.md`,
   sections 4.2 et 5) — décrire la copie de secours chiffrée réellement en
   place : destination (Cloudflare R2, UE), fréquence (quotidienne),
   rétention réelle (`NOESIS_BACKUP_KEEP` jours, 30 par défaut). **Ne pas
   publier ce paragraphe avant que l'étape 6 soit confirmée** — même
   principe que pour tout ce dossier : décrire l'état réel, jamais l'état
   visé.

## Limite connue

**Non testé ici, faute de vraies clés au moment d'écrire ce guide :
l'authentification réelle de Cloudflare.** Tout le reste (signature SigV4,
chiffrement/déchiffrement, instantané SQLite pendant une écriture
concurrente, rotation, script de restauration) est vérifié contre du code
réellement exécuté — voir `test/run-tests.js`. L'étape 6 ci-dessus est ce
qui referme cette dernière inconnue.

## Rappel sur ce que ça couvre (et ce que ça ne couvre pas)

Ce mécanisme protège de la perte du volume Railway lui-même — projet
supprimé, facturation coupée, panne de région. Il ne remplace pas une
vérification manuelle de l'onglet natif "Backups" du volume `web-volume`
(Project → web-volume → Backups) : si cette option est réellement offerte
sur le forfait actuel, l'activer coûte quelques clics et protège en plus
d'une corruption interne au volume — un scénario différent, que R2 ne
couvre pas (une base déjà corrompue au moment de l'instantané serait
sauvegardée corrompue). Les deux mécanismes sont complémentaires, pas
redondants.
