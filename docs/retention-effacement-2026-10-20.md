# Conformité Loi 25 : effacement de compte, journal et sauvegardes (repli 24, 20 oct. 2026)

1. Effacement (`server/lib/accountdeletion.js`) : une transaction, tout ou rien (testé : une table future sans cascade fait échouer l'effacement sans rien perdre, fichiers compris) ; deux appels de suite sans erreur ni effet (code synchrone, un seul processus). Test à trois comptes : `test/suppression-3-comptes-test.js`.
2. Correction : les fichiers de discussion d'un ancien membre dans une activité effacée (dernier membre parti, aucune heure restante) restaient sur le disque ; ils sont maintenant effacés avec l'activité.
3. Journal `inactive_account_log` : id de compte, action (avis/rappel/suppression) et date seulement, sans nom ni courriel ; conservé exprès comme preuve de suppression, sans durée de purge aujourd'hui. Seule la fermeture automatique y écrit : une suppression demandée par l'utilisateur n'y laisse aucune trace.
4. Sauvegardes R2 : copies chiffrées de toute la base. L'effacement ne les réécrit pas ; un compte supprimé y reste jusqu'à l'expiration de la copie.
5. Rétention réelle du code (`server/lib/backupretention.js`) : 14 jours (quotidiennes), 8 semaines, 12 mois (mensuelles) ; donc un compte effacé peut subsister jusqu'à 12 mois dans une copie mensuelle.
6. Écart à régler : la purge ne SIMULE que tant que `BACKUP_RETENTION_APPLY=1` n'est pas posé (Railway) ; sans cette variable, rien n'expire. `GUIDE-SAUVEGARDE-R2.md` et `DEPLOIEMENT.md` parlent encore de « 30 copies » (`NOESIS_BACKUP_KEEP`, plus utilisé). Politique de confidentialité : dire la durée réelle (légal : Émilien).
7. Restauration : une base restaurée ramène les comptes supprimés depuis la copie. Il faut rejouer les suppressions (journal pour les fermetures automatiques ; les suppressions manuelles ne sont pas journalisées).
8. Rien n'a été supprimé sur une base réelle ; aucune variable Railway modifiée.

- [ ] Durée de rétention des sauvegardes à annoncer : (a) 14 jours seulement (supprimer les copies hebdomadaires/mensuelles) / (b) 14 j + 8 sem. + 12 mois comme codé, annoncé tel quel / (c) autre : ____ . Puis poser `BACKUP_RETENTION_APPLY=1` et aligner la politique. Recommandé : (a) ou (b) annoncé honnêtement ; (a) efface le mieux.
- [ ] Journal d'inactivité : garder sans limite (preuve) ou purger après ____ ans ? Journaliser aussi les suppressions manuelles (id + date seulement) pour rejouer l'effacement après une restauration ? Recommandé : oui, 5 ans.
