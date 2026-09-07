# Guide — activer la sauvegarde chiffrée hors site (OVHcloud Object Storage)

> **Fichier conservé sous son nom d'origine** (`GUIDE-SAUVEGARDE-R2.md`) pour
> limiter le nombre de fichiers renommés lors de la migration du 7 septembre
> 2026. Le contenu ci-dessous décrit OVHcloud, plus Cloudflare R2 : le compte
> Cloudflare n'a jamais pu être activé (paiement refusé de façon répétée sur
> deux circuits différents avec la même carte — carte directe et Google Pay —
> signe d'un blocage bancaire plutôt que d'un problème Cloudflare). Décision
> prise avec Emilien de basculer sur OVHcloud : entreprise française,
> stockage en France, compatible S3, egress gratuit.

Ce guide suppose que les fichiers suivants sont déjà dans le dépôt :
`server/lib/s3sig.js`, `server/lib/r2client.js` (nom conservé, contenu
générique — voir son en-tête), `server/lib/backup.js`,
`scripts/restore-backup.js` — et que `server/index.js` a été modifié pour
appeler `startBackupSchedule()` (voir étape 5).

**Sans les étapes 1 à 4 ci-dessous, le mécanisme reste inactif** : au
démarrage, les logs afficheront `[backup] Sauvegardes désactivées —
variables manquantes : ...` et l'app continuera de fonctionner normalement
(ce module ne peut jamais faire planter le serveur).

Temps estimé : 20-30 minutes.

## 1. Créer le container Object Storage — région France obligatoire

1. [Espace client OVHcloud](https://www.ovh.com/manager/) → **Public Cloud**
   → créer un projet si aucun n'existe encore → **Object Storage** →
   **Créer un object container**.
2. Nom : `noesis-backups` (ou autre, à reporter dans `OVH_S3_BUCKET`).
3. **Région : Gravelines (GRA)** — ne pas prendre une région hors France/UE.
   C'est ce qui garde l'analyse d'ÉFVP déjà rédigée pour Railway (région
   Amsterdam) valable pour ce nouveau destinataire, avec en plus l'avantage
   qu'OVHcloud est une société de droit français (contrairement à Railway et
   à Cloudflare, toutes deux américaines) : aucune exposition au *CLOUD Act*
   à analyser pour ce destinataire-là.
4. Type de stockage : **Standard** (le volume est minuscule) ; laisser le
   container privé (pas d'accès public).

## 2. Générer des clés d'accès S3 restreintes à ce projet

OVHcloud n'a pas de notion de jeton limité à un seul bucket comme Cloudflare
R2 — la restriction se fait au niveau de l'utilisateur du projet Public
Cloud :

1. Dans le même projet Public Cloud → **Gestion des accès** (IAM) →
   **Utilisateurs** → **Créer un utilisateur**.
2. Description : `noesis-backups` par exemple. Rôle : **ObjectStore
   Operator** (lecture/écriture sur le stockage objet, rien d'autre —
   n'accorde pas de rôle plus large que nécessaire).
3. Une fois l'utilisateur créé, ouvrir sa fiche → **Ajouter une clé S3** (ou
   « Generate S3 credentials » selon la version de l'interface).
4. Noter tout de suite (affiché une seule fois) :
   - **Access Key** → `OVH_S3_ACCESS_KEY_ID`
   - **Secret Key** → `OVH_S3_SECRET_ACCESS_KEY`
5. Endpoint S3 pour la région Gravelines → `OVH_S3_ENDPOINT` :
   ```
   https://s3.gra.io.cloud.ovh.net
   ```
6. Code de région à passer telle quelle → `OVH_S3_REGION` :
   ```
   gra
   ```
   (nécessaire pour la signature SigV4 — contrairement à Cloudflare R2 qui
   acceptait la valeur fixe `auto`, OVHcloud attend le vrai code de région.)

## 3. Générer la clé de chiffrement — et la ranger HORS de Railway

```
npm run backup-key
```

Copie une chaîne de 64 caractères hexadécimaux. **Cette clé doit vivre dans
un gestionnaire de mots de passe, jamais uniquement dans Railway** : perdre
à la fois le compte Railway et cette clé rend toutes les sauvegardes
définitivement illisibles (le chiffrement est fait pour ça — personne
d'autre, OVHcloud compris, ne peut les lire non plus). Si une clé avait déjà
été générée pour une tentative Cloudflare R2 abandonnée, elle reste valable
telle quelle : rien à régénérer, c'est une propriété du chiffrement, pas du
fournisseur de stockage.

## 4. Poser les variables sur Railway

Railway → service `web` → **Variables** :

| Variable | Valeur |
|---|---|
| `OVH_S3_ENDPOINT` | `https://s3.gra.io.cloud.ovh.net` |
| `OVH_S3_REGION` | `gra` |
| `OVH_S3_BUCKET` | `noesis-backups` |
| `OVH_S3_ACCESS_KEY_ID` | (étape 2) |
| `OVH_S3_SECRET_ACCESS_KEY` | (étape 2) |
| `NOESIS_BACKUP_KEY` | (étape 3) |

Optionnelles (valeurs par défaut déjà raisonnables pour 100 membres) :
`NOESIS_BACKUP_INTERVAL_HOURS` (défaut 24), `NOESIS_BACKUP_KEEP` (défaut
30 — c'est cette valeur qui doit apparaître dans la politique de
confidentialité, voir étape 7).

**Si d'anciennes variables `R2_ACCOUNT_ID` / `R2_BUCKET` /
`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` existent encore
sur Railway** (d'une tentative précédente), elles peuvent être supprimées :
le code ne les lit plus depuis cette migration.

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

Ensuite, **depuis votre machine** (avec les 6 variables ci-dessus posées
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
   hors site chiffrée, destinataire OVHcloud Object Storage (France,
   Gravelines), fréquence quotidienne, rétention `NOESIS_BACKUP_KEEP` jours.
2. **ÉFVP hébergement** — ajouter OVHcloud au tableau des destinations ;
   territoire France (donc UE, RGPD), sans exposition au CLOUD Act
   contrairement à Railway et à la tentative Cloudflare abandonnée — le
   point le plus simple à défendre de tout le dossier. Noter que le
   chiffrement côté application est une protection supplémentaire propre à
   cette destination (OVHcloud ne détient que des octets illisibles).
3. **Politique de confidentialité** (`noesis-timetracker-conformite-loi25.md`,
   sections 4.2 et 5) — décrire la copie de secours chiffrée réellement en
   place : destination (OVHcloud Object Storage, France), fréquence
   (quotidienne), rétention réelle (`NOESIS_BACKUP_KEEP` jours, 30 par
   défaut). **Ne pas publier ce paragraphe avant que l'étape 6 soit
   confirmée** — même principe que pour tout ce dossier : décrire l'état
   réel, jamais l'état visé.

## Limite connue

**Non testé ici, faute de vraies clés au moment d'écrire ce guide :
l'authentification réelle d'OVHcloud.** Tout le reste (signature SigV4,
chiffrement/déchiffrement, instantané SQLite pendant une écriture
concurrente, rotation, script de restauration) est vérifié contre du code
réellement exécuté — voir `test/run-tests.js`. L'étape 6 ci-dessus est ce
qui referme cette dernière inconnue. La signature SigV4 elle-même est
générique (validée contre les vecteurs de test officiels d'AWS) : rien dans
`s3sig.js` n'est spécifique à un fournisseur, seul l'endpoint et la région
changent.

## Rappel sur ce que ça couvre (et ce que ça ne couvre pas)

Ce mécanisme protège de la perte du volume Railway lui-même — projet
supprimé, facturation coupée, panne de région. Il ne remplace pas une
vérification manuelle de l'onglet natif "Backups" du volume `web-volume`
(Project → web-volume → Backups) : si cette option est réellement offerte
sur le forfait actuel, l'activer coûte quelques clics et protège en plus
d'une corruption interne au volume — un scénario différent, qu'OVHcloud ne
couvre pas (une base déjà corrompue au moment de l'instantané serait
sauvegardée corrompue). Les deux mécanismes sont complémentaires, pas
redondants.
