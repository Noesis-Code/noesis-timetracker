# Audit : documents légaux vs fonctionnalités (30 oct. 2026)

Méthode : lecture du code (staging v870) comparée phrase par phrase à la politique et aux CGU (français `public/index.html`, anglais `public/legal-en.js`). Ce n'est pas un avis juridique.

## Corrigé dans les textes et le code
- Connexion : mot de passe (10 caractères et plus, scrypt), clé d'accès (Face ID), ancien code PIN à remplacer. Plus aucune mention du code PIN dans la politique.
- Sauvegardes : copies quotidiennes 14 jours, hebdomadaires 8 semaines, mensuelles 12 mois ; un compte supprimé peut subsister jusqu'à 12 mois (CGU art. 12, politique 5, courriel de fermeture). Les données du module Horaire sont retirées des sauvegardes.
- Calendrier : le flux contient aussi tâches datées, objectifs hebdomadaires et bilans de période.
- IA : correction d'orthographe silencieuse, autres usages (autre secteur, objectif, récurrence), descriptions et corrections envoyées ; la barre d'ajout range la tâche avant validation ; le mode Absent ne coupe pas la correction d'orthographe.
- Horaire : le motif d'un congé n'est pas conservé.
- Nouveautés décrites (4.9) : notifications push, stockage local, courriels automatiques (Resend), calendrier externe, connecteur d'IA libre, identifiant dans « Aide et suggestions ».
- Inactivité : avis à 23 mois, suppression 30 jours plus tard ; le registre technique ne garde que l'identifiant.
- Compte entreprise : interrupteur « Afficher seulement le nom du responsable » (Réglages > Sécurité, sous « Être trouvable… »), décrit dans la politique.
- Code : `improvement_notes` effacée avec le compte ; déconnexion efface `noesis_today_v1`, `noesis_modules` et la file hors ligne.

## À faire par Émilien (impossible à vérifier depuis le code)
- Variable Railway production `BACKUP_RETENTION_APPLY=1` : sans elle, aucune ancienne sauvegarde n'est supprimée et le délai écrit (12 mois) n'est pas respecté.
- Relecture par un juriste ; CGU art. 4.2 et 6 (Expansion) à réécrire au lancement.
- Contrats (DPA Railway, Anthropic, Resend, Cloudflare) et évaluation des facteurs relatifs à la vie privée : existence non vérifiable ici.
- Navigateurs déjà installés : l'application se met à jour après fermeture complète et réouverture.

## Limites connues
- L'accès automatique « reconnu sur l'appareil » d'un compte entreprise qui a activé l'interrupteur repose sur le nom du responsable.
- Le registre d'inactivité garde un identifiant orphelin (voulu, preuve des avis).
