# Trade Tracker — audit de sécurité (19 oct. 2026)

Périmètre : `trade-tracker/` et l'intégration TMT (`server/lib/tradelink.js`, `routes/trade.js`, `routes/tradeevents.js`, `public/js/trade.js`). Aucune règle produit modifiée, aucune dépendance ajoutée.

## Constats corrigés
| Gravité | Constat | Correctif |
|---|---|---|
| Moyenne | Rejeu de `/api/trade-events` : `X-Trade-Event-Id` n'est pas couvert par la signature, un message capturé pouvait être rejoué (< 5 min) avec un autre id et renotifier. | La signature est elle-même dédupliquée (`trade_events_seen`). Deux événements au corps identique dans la même seconde sont donc fusionnés (négligeable). |
| Moyenne | CSRF : cookie `SameSite=None` (iframe TMT), `POST /api/logout`, `DELETE`/`POST /api/broker/token` sans contrôle d'origine. | Toute écriture avec un `Origin` autre que l'app ou `TMT_BASE_URL` : 403 `bad_origin`. |
| Basse | CSP limitée à `frame-ancestors`. | CSP complète (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`) + HSTS en HTTPS. |
| Basse | Un client lisait le détail des échecs de synchro de l'expert (`/api/sync-log?scope=expert`). | Message générique « Échec de synchro » pour les clients. |
| Basse | PWA : cache de données du service worker non lié à l'utilisateur (hors ligne, session expirée sans déconnexion, autre personne sur l'appareil). | Cache vidé quand `/api/me` change d'utilisateur (déjà vidé à la déconnexion et sur 401). |

## Vérifié, conforme
Lien signé HMAC-SHA256 (algorithme fixe, comparaison `timingSafeEqual`, expiration 5 min plafonnée, nonce à usage unique, rôle pris en base) ; session : 256 bits aléatoires, stockée hachée, HttpOnly, 12 h, nouvelle à chaque lien (pas de fixation), purge des expirées ; accès : chaque requête filtrée par `req.user.id`, `scope=expert` limité à la lecture de l'expert, invitations réservées à l'expert, aucun accès croisé aux jetons ; SQL toujours paramétré ; en-têtes `nosniff`, `Referrer-Policy: no-referrer`, `no-store` ; corps limités (50 ko, 5 Mo admin, 64 ko événements), limites de débit par IP ; jeton courtier AES-256-GCM, IV aléatoire de 12 octets, refus sans clé, jamais renvoyé ni journalisé ; événements TMT : signature `timingSafeEqual`, horodatage ±5 min, idempotence par id ; TMT ne met jamais l'API Trade en cache (`public/sw.js`) ; échappement HTML des champs affichés.

## Restants (à décider par Émilien)
- Basse : l'iframe `#tradeFrame` (TMT) n'a pas d'attribut `sandbox` (fichier très partagé `index.html`, non touché) ; l'origine séparée de Trade limite déjà le risque.
- Basse : pas de limite de débit propre à `POST /api/trade-events` côté TMT (signature vérifiée avant tout effet, corps <= 64 ko).
- Basse : `trade_events_seen` grossit sans purge (quelques octets par achat).
- Info : session non révoquée côté serveur si l'expert retire un client (pas d'action de retrait dans l'API v0). Sans `TRADE_ADMIN_TOKEN`, l'import admin n'existe pas (404).
- Info : les tests du service worker simulent le navigateur (module `vm`), pas un vrai navigateur.
