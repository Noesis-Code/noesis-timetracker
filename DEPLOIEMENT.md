# Noèsis TimeTracker — déploiement public et usage mobile

Ce document décrit comment mettre Noèsis en ligne sur une URL publique, puis
l'installer sur un téléphone comme une vraie application.

Rédigé le 30 août 2026 (volet Déploiement / Mobile).

---

## 1. Ce qui a été préparé côté code

| Fichier | Rôle |
|---|---|
| `server/db.js` | La base peut vivre ailleurs que dans `data/` : variable `NOESIS_DATA_DIR`. Indispensable en ligne, où le disque du conteneur est effacé à chaque redéploiement. |
| `server/index.js` | Écoute sur `0.0.0.0` en ligne, `trust proxy`, corps de requête jusqu'à 5 Mo (import CSV, photo de profil), en-têtes `no-cache` sur `sw.js` / `index.html` / le manifeste. |
| `public/manifest.webmanifest` | Nom, icônes, couleurs, mode plein écran. |
| `public/sw.js` | Service worker : installabilité + écran hors ligne. **Ne met jamais l'API en cache.** |
| `public/offline.html` | Page affichée quand le téléphone n'a pas de réseau. |
| `public/icons/` | Icônes 192/512, versions *maskable* (Android) et `apple-touch-icon` (iOS). |
| `public/index.html` | Balises PWA dans le `<head>` uniquement + enregistrement du service worker. |
| `public/styles.css` | Marges de sécurité (encoche, barre d'état) en mode plein écran. |
| `railway.json`, `Procfile`, `.nvmrc` | Configuration de déploiement. |

Variables d'environnement reconnues par le serveur :

| Variable | Effet | Valeur en ligne |
|---|---|---|
| `PORT` | Port d'écoute | fourni automatiquement par l'hébergeur |
| `NOESIS_DATA_DIR` | Dossier du fichier `noesis.db` | `/data` (volume persistant) |
| `NOESIS_HOST` | Interface d'écoute | inutile (déduit de `PORT`) |

En local, aucune de ces variables n'est nécessaire : `npm start` se comporte
exactement comme avant.

---

## 2. Déployer sur Railway

### 2.1 Pousser le code sur GitHub

```bash
cd C:\Users\morel\OneDrive\Documents\noesis-timetracker
git add .
git commit -m "PWA + configuration de deploiement"
git push
```

### 2.2 Passer au plan Hobby — sinon la création du projet est refusée

Constaté le 30 août 2026 : créer un nouveau projet renvoie
« Free plan resource provision limit exceeded ».

Le plan Trial de Railway ne donne que 5 $ de crédit une seule fois, et le plan
Free 1 $/mois — insuffisant pour faire tourner un service en permanence, et le
volume persistant y est limité à 0,5 Go. Le plan **Hobby, 5 $/mois, inclut 5 $
d'usage** et 5 Go de volume : une app de cette taille reste dans le forfait,
donc 5 $/mois au total.

Bouton **Upgrade to Hobby** dans le message de blocage, ou
<https://railway.com/account/plans>.

Pour éviter toute surprise, l'écran **Usage** permet de fixer une limite de
dépense mensuelle.

### 2.3 Créer le service

1. Aller sur <https://railway.app>, se connecter avec le compte GitHub.
2. **New Project → Deploy from GitHub repo → `Noesis-Code/noesis-timetracker`**.
3. Railway détecte Node.js tout seul et lance `node server/index.js`.

### 2.4 Ajouter le volume persistant — étape à ne pas sauter

Sans volume, **toute la base est effacée à chaque redéploiement**.

1. Dans le service : **Settings → Volumes → New Volume**.
2. Mount path : `/data`.
3. Onglet **Variables** → ajouter :

   ```
   NOESIS_DATA_DIR = /data
   ```

4. Redéployer.

### 2.5 Obtenir l'URL

**Settings → Networking → Generate Domain.** Railway fournit une adresse du
type `https://noesis-timetracker-production.up.railway.app`, en https — ce qui
est obligatoire pour qu'un service worker fonctionne.

### 2.6 Vérifier

- Ouvrir l'URL : l'écran de création de profil doit s'afficher.
- Créer un profil, lancer un chrono, l'arrêter.
- Redéployer (n'importe quel `git push`) et rouvrir : le profil doit toujours
  être là. S'il a disparu, c'est que le volume ou `NOESIS_DATA_DIR` manque.

> **Render** fonctionne de la même façon : Web Service → build `npm install`,
> start `node server/index.js`, puis Disk monté sur `/data` et la même
> variable `NOESIS_DATA_DIR`. Le `Procfile` couvre aussi ce cas.

---

## 3. Installer l'app sur le téléphone

### Android (Chrome)

1. Ouvrir l'URL.
2. Menu **⋮ → Ajouter à l'écran d'accueil** (ou la bannière « Installer »).
3. L'app s'ouvre ensuite en plein écran, sans barre d'adresse.

### iPhone (Safari — obligatoire, Chrome iOS ne sait pas installer)

1. Ouvrir l'URL **dans Safari**.
2. Bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil**.
3. **Ajouter**.

---

## 4. Points à savoir

- **Données en ligne uniquement.** Hors réseau, l'app s'ouvre et affiche un
  message clair, mais ne peut ni démarrer un chrono ni afficher l'historique :
  c'est volontaire. Mettre les données en cache sur une app multi-utilisateurs
  afficherait des chiffres périmés ou ceux d'un autre profil.
- **Base vide au premier déploiement.** L'historique local d'Emilien reste sur
  son PC. Pour le récupérer en ligne : Profil → ⚙️ → Import.
- **Mises à jour.** Un `git push` redéploie. Le service worker travaille en
  « réseau d'abord » : le téléphone récupère la nouvelle version au premier
  chargement en ligne, sans manipulation.
- **Après un changement lourd** (structure des fichiers `public/`), incrémenter
  `CACHE_VERSION` en tête de `public/sw.js` pour forcer un cache neuf.
- **L'app est publique.** N'importe qui ayant l'URL peut créer un profil. Le
  code PIN protège la récupération d'un profil existant, pas la création. Si
  cela devient un problème, la piste déjà notée est un vrai système de session
  (voir `noesis-timetracker-contexte-technique.md`).

---

## 5. Tester depuis le téléphone sans déployer

Sur le même WiFi, sans rien mettre en ligne :

```bash
# sur le PC
set NOESIS_HOST=0.0.0.0
npm start
ipconfig       # relever l'IPv4, ex. 192.168.1.24
```

Puis ouvrir `http://192.168.1.24:3000` sur le téléphone. Attention : en http
(sans « s »), le service worker ne s'enregistre pas — l'app fonctionne, mais
n'est pas installable. Pour l'installation, il faut l'URL https du déploiement.

## 6. Variables Stripe (Expansion)

Liste complète (Railway > Variables ; staging = clés de test uniquement) :

- `STRIPE_SECRET_KEY` : clé secrète Stripe (sans elle, paiement et portail indisponibles).
- `STRIPE_OFFER1_PRICE_ID` : identifiant du prix Expansion (sans lui, le bouton d'achat est masqué).
- `STRIPE_WEBHOOK_SECRET` : secret de signature du webhook `/stripe/webhook` (sans lui, événements refusés).
- `STRIPE_TAX_ENABLED=1` : optionnelle, active TPS/TVQ (voir `docs/stripe-taxes.md`).
- `EXPANSION_MAILS=1` : courriels d'abonnement aux clients ; défaut off, à valider par Émilien (`docs/expansion-courriels.md`). Requiert `RESEND_API_KEY` et `RESEND_FROM` (domaine vérifié).
- `EXPANSION_PLAN_MAX_ATTEMPTS` (optionnel, défaut 3) : essais de génération du plan Expansion par activité et par jour (reprise horaire bornée).

- `OFFER_CHECKOUT_OPEN=1` : ouvre l'achat Expansion hors staging (sur staging il est ouvert d'office, avec clés de test). Sans elle, en production, `/offer/available` est faux et `POST /offer/checkout` répond 403. Lue à un seul endroit (`checkoutOpen()` dans `server/lib/stripe.js`, testé). **Ne jamais l'activer en production avant décision d'Émilien (fusion `main`).** Checklist : `docs/expansion-checklist-production-2026-10-20.md`.

Côté Stripe, activer aussi le portail client (Paramètres > Billing > Portail client) en mode test.

## 7. Autres variables d'environnement lues par le code (noms seulement)

Relevé du 20 oct. 2026 (`grep process.env`). Toutes sont optionnelles sauf mention ; jamais de valeur dans le dépôt.

- **Plateforme (posées par Railway)** : `RAILWAY_ENVIRONMENT_NAME` (distingue staging), `RAILWAY_DEPLOYMENT_ID`, `RAILWAY_GIT_COMMIT_SHA`, `NODE_ENV`. `TZ` est forcé à `America/Toronto` par le serveur.
- **Sessions et sécurité** : `NOESIS_SESSION_SECRET`, `NOESIS_RATE_LIMIT_OFF`, `NOESIS_RATE_IP_PER_MIN`, `NOESIS_RATE_USER_PER_MIN`, `BLOCKED_WORDS`, `CONTACT_EMAIL`.
- **Notifications push (VAPID)** : `NOESIS_VAPID_PUBLIC_KEY`, `NOESIS_VAPID_PRIVATE_KEY`, `NOESIS_VAPID_SUBJECT`.
- **Sauvegardes (R2/S3)** : `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `NOESIS_BACKUP_KEY`, `NOESIS_BACKUP_PREFIX`, `BACKUP_RETENTION_APPLY`.
- **IA (clé et modèles)** : `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `NOESIS_CLASSIFY_FAST_MODEL`, `NOESIS_CROSS_FAST_MODEL`, `NOESIS_DOC_FAST_MODEL`, `NOESIS_OFFER_FAST_MODEL`, `NOESIS_REWRITE_FAST_MODEL`, `NOESIS_WEEKLY_FAST_MODEL`, `NOESIS_GOALS_REWRITE_MODEL`, `NOESIS_SPELLFIX_MODEL`, `NOESIS_TASK_CATEGORY_MODEL`, `DRIVE_SYNC_MODEL`.
- **IA (budgets, plafonds, seuils)** : `AI_BUDGET_DAY_CAD`, `AI_BUDGET_MONTH_CAD`, `AI_BUDGET_SYSTEM_DAY_CAD`, `AI_COST_ALERT_DAY_CAD`, `AI_WEEKLY_ALERT_CAD` (plafonds et seuils en CAD, convertis en USD par `AI_USD_PER_CAD`, défaut 0,72 ; les anciennes `..._USD` restent acceptées, en USD, et prioritaires), `AI_PRICE_IN_PER_M`, `AI_PRICE_OUT_PER_M`, `CHANGES_MAX_PER_DAY`, `CLASSIFY_MAX_PER_DAY`, `CROSS_MAX_PER_ACTIVITY_DAY`, `HEBDO_MAX_PER_DAY`, `MATCH_MAX_PER_DAY`, `OFFER_MAX_PER_DAY`, `RECURRENCE_MAX_PER_DAY`, `REWRITE_MAX_PER_DAY`, `SPELLFIX_MAX_PER_DAY`, `NOESIS_CAPTUREPLACE_MIN_CONFIDENCE`, `NOESIS_CLASSIFY_MIN_CONFIDENCE`, `NOESIS_CROSS_MIN_CONFIDENCE`, `SPELLFIX` (`off` coupe la correction silencieuse), `DOCANALYSIS_MEMO` (`off` coupe le cache).
- **Planification des objectifs** : `GOALS_RECALC_CRON`, `GOALS_WEEKLY_MEMO_MIN`, `CP_WEEKLY_DEBOUNCE_MS`, `CP_WEEKLY_MAX_PER_HOUR`, `STRATEGY_DEBOUNCE_MS`.
- **Google Drive** : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `DRIVE_TOKEN_KEY`, `DRIVE_PREFILTER`, `DRIVE_PREFILTER_ACTION`, `DRIVE_SYNC_INTERVAL_MIN`, `DRIVE_SYNC_BATCH`, `DRIVE_SYNC_FIRST_DAYS`, `DRIVE_SYNC_MAX_AI_CALLS_PER_DAY`, `DRIVE_SYNC_MAX_AI_PER_PASS`, `DRIVE_SYNC_MAX_DEFER_PASSES`, `DRIVE_SYNC_MAX_FILE_INFRA_FAILS`, `DRIVE_SYNC_MAX_SEGS_PER_PASS`, `DRIVE_SYNC_MAX_TASKS_PER_FILE`.
- **Calendrier et rappels** : `NOESIS_CALENDAR_FEED`, `NOESIS_DUE_REMINDERS`, `NOESIS_GOAL_REMINDERS`.
- **Annonce aux utilisateurs** : `NOESIS_ANNOUNCE_AT`, `NOESIS_ANNOUNCE_PUSH`, `NOESIS_ANNOUNCE_TEXT`.
- **Offre / accès** : `OFFER_CHECKOUT_OPEN` (voir §6 : jamais en production avant décision d'Émilien), `OFFER1_EARLY_ACCESS_USER_IDS`, `OFFER1_FREE_CODE_HASHES`, `INACTIVE_ACCOUNTS_ENABLED`, `RESEND_WEBHOOK_SECRET` (courriels, avec `RESEND_API_KEY`/`RESEND_FROM` du §6).
- **Trade Tracker** : `TRADE_BASE_URL`, `TRADE_DATA_DIR`, `TRADE_ALLOWED_USER_IDS`, `TRADE_LINK_SECRET` (avertissement au démarrage s'il manque), `TRADE_NOTIFY_SECRET`, `TRADE_TOKEN_KEY`, `TRADE_CONNECTOR`, `TRADE_EVENTS_PER_MIN`, `TRADE_SYNC_DISABLE`, `TRADE_SYNC_INTERVAL_MIN`.
- **Tests et développement seulement** : `GUARD_BASE`, `GUARD_ALLOW_SHRINK`, `FONC_PORT_OFFSET`, `MOCK_PORT`, `SEED_SCENARIOS` (staging), `SEED_STATS_DEMO`, `PATH`, `TMPDIR`.

`railway.json` : build NIXPACKS, démarrage `node server/index.js`, redémarrage sur échec (10 essais max) ; cohérent avec ce document (pas de healthcheck déclaré : à décider, non ajouté).
