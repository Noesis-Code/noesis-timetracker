# Guide — activer la sauvegarde chiffrée hors site (Cloudflare R2)

> **Historique du 7 septembre 2026, pour ne pas se perdre** : Cloudflare R2 était le plan d'origine → le
> compte Cloudflare d'Emilien n'a jamais pu être activé (paiement refusé de façon répétée, plusieurs cartes,
> deux circuits de paiement différents) → basculé sur OVHcloud Object Storage le même jour → la création de
> compte OVHcloud a échoué à son tour, pour Emilien ET pour Gaspard (le cofondateur), sur des comptes séparés
> → **Gaspard a finalement réussi à activer Cloudflare** (son propre compte) → retour à Cloudflare R2, cette
> fois sous le compte de Gaspard. Ce guide décrit donc de nouveau Cloudflare R2. Les variables d'environnement
> ont été renommées en générique (`S3_*`, sans préfixe de fournisseur) pendant l'aller-retour, précisément
> pour ne plus avoir à les renommer à chaque fois — ce guide les utilise déjà sous cette forme.

Ce guide suppose que les fichiers suivants sont déjà dans le dépôt :
`server/lib/s3sig.js`, `server/lib/r2client.js` (nom conservé, contenu générique — voir son en-tête),
`server/lib/backup.js`, `scripts/restore-backup.js` — et que `server/index.js` a été modifié pour appeler
`startBackupSchedule()` (voir étape 5).

**Sans les étapes 1 à 4 ci-dessous, le mécanisme reste inactif** : au démarrage, les logs afficheront
`[backup] Sauvegardes désactivées — variables manquantes : ...` et l'app continuera de fonctionner
normalement (ce module ne peut jamais faire planter le serveur).

Temps estimé : 20-30 minutes, une fois que le compte Cloudflare qui hébergera le bucket est déjà actif
(c'est le cas du compte de Gaspard).

## 0. Sur quel compte Cloudflare travailler

**Le bucket et les clés doivent être créés sur le compte Cloudflare de Gaspard**, puisque c'est le seul des
deux comptes (Emilien, Gaspard) dont le paiement a été accepté. Emilien peut se voir donner un accès invité
au compte Cloudflare de Gaspard si besoin (Cloudflare permet d'inviter des membres à un compte), mais ce
n'est pas nécessaire pour la seule mise en place du bucket de sauvegarde — Gaspard peut suivre les étapes
1 et 2 seul et transmettre à Emilien les trois valeurs obtenues (Account ID, Access Key ID, Secret Access
Key) par un canal sûr (gestionnaire de mots de passe partagé, jamais par courriel ou messagerie en clair).

## 1. Créer le bucket R2 — juridiction European Union obligatoire

1. Tableau de bord Cloudflare (compte de Gaspard) → **R2 Object Storage** → **Create bucket**.
2. Nom : `noesis-backups` (ou autre, à reporter dans `S3_BUCKET`).
3. **Location : European Union (EU)** — ne PAS laisser sur "Automatic". C'est ce qui garde l'analyse
   d'ÉFVP déjà rédigée pour Railway (région Amsterdam) valable telle quelle pour ce destinataire : même
   territoire, même régime RGPD. Une autre région rouvrirait l'ÉFVP.
4. Storage class par défaut (Standard) — le volume est minuscule.

## 2. Générer un jeton API restreint à CE SEUL bucket

1. R2 → **Manage API tokens** → **Create API token**.
2. Permissions : **Object Read & Write**.
3. **Restreindre au bucket `noesis-backups`** — jamais "Apply to all buckets".
4. Noter tout de suite (affiché une seule fois) :
   - **Account ID** → `S3_ENDPOINT` se construit comme
     `https://<Account ID>.eu.r2.cloudflarestorage.com`
   - **Access Key ID** → `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → `S3_SECRET_ACCESS_KEY`
5. `S3_REGION` : valeur fixe `auto` — c'est ce que Cloudflare R2 attend, peu importe la région réelle du
   bucket (contrairement à un vrai fournisseur S3 comme OVHcloud, où la région doit correspondre à
   l'endpoint).

## 3. Générer la clé de chiffrement — et la ranger HORS de Railway

```
npm run backup-key
```

Copie une chaîne de 64 caractères hexadécimaux. **Cette clé doit vivre dans un gestionnaire de mots de
passe, jamais uniquement dans Railway** : perdre à la fois le compte Railway et cette clé rend toutes les
sauvegardes définitivement illisibles (le chiffrement est fait pour ça — personne d'autre, Cloudflare
compris, ne peut les lire non plus). Si une clé a déjà été générée lors d'une tentative précédente
(OVHcloud), elle reste valable telle quelle : c'est une propriété du chiffrement, pas du fournisseur de
stockage — pas besoin d'en régénérer une nouvelle.

## 4. Poser les variables sur Railway

Railway → service `web` → **Variables** :

| Variable | Valeur |
|---|---|
| `S3_ENDPOINT` | `https://<Account ID de Gaspard>.eu.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `noesis-backups` |
| `S3_ACCESS_KEY_ID` | (étape 2) |
| `S3_SECRET_ACCESS_KEY` | (étape 2) |
| `NOESIS_BACKUP_KEY` | (étape 3) |

Optionnelles (valeurs par défaut déjà raisonnables pour 100 membres) : `NOESIS_BACKUP_INTERVAL_HOURS`
(défaut 24), `NOESIS_BACKUP_KEEP` (défaut 30 — c'est cette valeur qui doit apparaître dans la politique de
confidentialité, voir étape 7).

**Si d'anciennes variables `OVH_S3_*` ou `R2_ACCOUNT_ID`/`R2_BUCKET`/`R2_ACCESS_KEY_ID`/
`R2_SECRET_ACCESS_KEY`/`R2_ENDPOINT` existent encore sur Railway** (de tentatives précédentes), elles
peuvent être supprimées : le code ne les lit plus depuis cette dernière mise à jour, seules les variables
`S3_*` génériques ci-dessus sont lues.

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

Ensuite, **depuis votre machine** (avec les 6 variables ci-dessus posées dans votre shell ou un fichier
`.env` local non commité) :

```
node scripts/restore-backup.js list
node scripts/restore-backup.js verify
```

`verify` télécharge la sauvegarde la plus récente, la déchiffre, l'ouvre et exécute
`PRAGMA integrity_check` — **sans rien écrire sur le volume de production**. C'est la preuve qu'une
restauration réelle fonctionnerait, pas seulement que l'envoi a réussi.

**Test de restauration à refaire une fois par trimestre** (`verify` suffit, 30 secondes) — une sauvegarde
jamais restaurée n'est pas une sauvegarde, c'est une hypothèse.

## 7. Mettre à jour les trois documents de conformité

Une fois l'étape 6 confirmée (sauvegarde ET restauration réussies) :

1. **Registre des traitements** — ajouter un traitement : sauvegarde hors site chiffrée, destinataire
   Cloudflare R2 (UE, compte de Gaspard Morel-Obaton), fréquence quotidienne, rétention
   `NOESIS_BACKUP_KEEP` jours.
2. **ÉFVP hébergement** — ajouter Cloudflare au tableau des destinations ; même territoire (UE) que
   Railway, donc pas de nouvelle analyse de transfert hors Québec à faire — seulement consigner ce second
   destinataire. Noter que le chiffrement côté application est une protection supplémentaire propre à cette
   destination (R2 ne détient que des octets illisibles).
3. **Politique de confidentialité** (`noesis-timetracker-conformite-loi25.md`, sections 4.2 et 5) —
   décrire la copie de secours chiffrée réellement en place : destination (Cloudflare R2, UE), fréquence
   (quotidienne), rétention réelle (`NOESIS_BACKUP_KEEP` jours, 30 par défaut). **Ne pas publier ce
   paragraphe avant que l'étape 6 soit confirmée** — même principe que pour tout ce dossier : décrire
   l'état réel, jamais l'état visé.

## Limite connue

**Non testé ici, faute de vraies clés au moment d'écrire ce guide : l'authentification réelle de
Cloudflare.** Tout le reste (signature SigV4, chiffrement/déchiffrement, instantané SQLite pendant une
écriture concurrente, rotation, script de restauration) est vérifié contre du code réellement exécuté —
voir `test/run-tests.js` (28 assertions, toutes passées après chaque changement de fournisseur). L'étape 6
ci-dessus est ce qui referme cette dernière inconnue. La signature SigV4 elle-même est générique (validée
contre les vecteurs de test officiels d'AWS) : rien dans `s3sig.js` n'est spécifique à un fournisseur, seuls
l'endpoint et la région changent.

## Rappel sur ce que ça couvre (et ce que ça ne couvre pas)

Ce mécanisme protège de la perte du volume Railway lui-même — projet supprimé, facturation coupée, panne
de région. Il ne remplace pas une vérification manuelle de l'onglet natif "Backups" du volume
`web-volume` (Project → web-volume → Backups) : si cette option est réellement offerte sur le forfait
actuel, l'activer coûte quelques clics et protège en plus d'une corruption interne au volume — un scénario
différent, que Cloudflare R2 ne couvre pas (une base déjà corrompue au moment de l'instantané serait
sauvegardée corrompue). Les deux mécanismes sont complémentaires, pas redondants.
