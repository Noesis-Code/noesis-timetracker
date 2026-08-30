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

### 2.2 Créer le service

1. Aller sur <https://railway.app>, se connecter avec le compte GitHub.
2. **New Project → Deploy from GitHub repo → `Noesis-Code/noesis-timetracker`**.
3. Railway détecte Node.js tout seul et lance `node server/index.js`.

### 2.3 Ajouter le volume persistant — étape à ne pas sauter

Sans volume, **toute la base est effacée à chaque redéploiement**.

1. Dans le service : **Settings → Volumes → New Volume**.
2. Mount path : `/data`.
3. Onglet **Variables** → ajouter :

   ```
   NOESIS_DATA_DIR = /data
   ```

4. Redéployer.

### 2.4 Obtenir l'URL

**Settings → Networking → Generate Domain.** Railway fournit une adresse du
type `https://noesis-timetracker-production.up.railway.app`, en https — ce qui
est obligatoire pour qu'un service worker fonctionne.

### 2.5 Vérifier

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
