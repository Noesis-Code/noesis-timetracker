# Relecture croisée staging aaaa3c2..607baa5 (chantier 7, repli 4)

Relecture seule (diff des fichiers serveur, offline-queue, a11y, Trade). Tests : worktree neuf sur origin/staging = 95/95.

## Cause des 2 échecs Trade (72/2)
Le worktree n'avait pas `trade-tracker/node_modules` : `new-worktree.sh` lance depuis un worktree créé AVANT le correctif 8cc6b19 (ou sans ce dossier) ne le liait pas, et le lien ne cherchait que dans le worktree courant. Corrigé : le script cherche aussi le dépôt principal et les `wt-*` frères.

## Défauts relevés (à traiter par le chantier propriétaire, rien corrigé ici)
1. `trade-tracker/server/app.js` : `/health` (public, non authentifié) exécute une requête SQL et peut déclencher une alerte push à chaque appel. Risque faible (limiteur de lecture en amont) ; préférer le minuteur `startPriceWatch` seul, ou un cache de quelques secondes.
2. `server/lib/silentspellfix.js` : la clé de cache normalise les espaces, mais la correction mise en cache a été validée (`isPureSpellingFix`) contre le premier titre ; un second titre aux espaces différents reçoit cette correction sans revalidation contre son propre texte. Impact quasi nul, à valider ou revérifier au retour du cache.
3. `public/js/a11y-popups.js` : le MutationObserver sur tout le document planifie un `sync()` (querySelectorAll) à chaque insertion de nœud ; coût à surveiller sur les longues listes. `closeButton` prend le premier bouton ✕ trouvé (peut ne pas être celui du pop-up si imbriqué).
4. `public/offline-queue.js` : le dédoublonnage (5 s) lit la file avant d'écrire sans transaction commune ; deux `add` simultanés peuvent encore créer un doublon (le serveur reste le garde-fou).
5. `pricewatch.js` : un expert dont les positions ont un prix mais jamais de `priceUpdatedAt` est jugé en retard à chaque contrôle (alerte une fois par 24 h) ; à confirmer voulu.
