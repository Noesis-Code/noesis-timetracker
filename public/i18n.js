// Noèsis TimeTracker — traduction de l'interface (français / anglais)
//
// Principe volontairement simple, pour ne rien casser dans le reste de
// l'app : la CLÉ de traduction est la phrase française elle-même, telle
// qu'elle est déjà écrite dans index.html, app.js et les réponses du
// serveur. Conséquences pratiques :
//
//  - en français (lang = 'fr'), t(x) renvoie x tel quel : rien ne change,
//    aucune régression possible sur l'app existante ;
//  - en anglais (lang = 'en'), t(x) cherche la traduction dans DICT ;
//  - les textes STATIQUES de index.html n'ont pas besoin d'être annotés un
//    par un : translateStaticDom() parcourt le DOM au démarrage et traduit
//    les nœuds de texte + les attributs visibles (placeholder, title,
//    aria-label) dont le contenu exact est une clé connue. Ça évite de
//    toucher à chaque ligne de index.html, fichier partagé par les cinq
//    discussions du projet ;
//  - les textes DYNAMIQUES (construits dans app.js) passent explicitement
//    par t() ;
//  - les messages d'erreur/confirmation renvoyés par le serveur (toujours
//    en français, aucune route serveur n'a été touchée pour ce chantier)
//    sont traduits à l'affichage : les messages fixes via DICT, ceux qui
//    contiennent une valeur variable via PATTERNS ci-dessous.
//
// Langue par défaut : anglais (demande d'Emilien, 29 août 2026). Les
// profils qui existaient déjà avant ce changement ont été basculés en
// français par une migration (voir server/db.js), donc rien ne change pour
// eux.

(function (global) {
  'use strict';

  // ------------------- Dictionnaire français -> anglais -------------------
  var DICT = {
    // ---- Onboarding ----
    'TimeTracker partagé': 'Shared TimeTracker',
    "Comment veux-tu qu'on t'appelle ?": 'What should we call you?',
    'Prénom ou pseudo': 'First name or nickname',
    'Nom de famille': 'Last name',
    'Numéro de téléphone': 'Phone number',
    'Adresse email': 'Email address',
    'Choisis un code (4 à 6 chiffres)': 'Choose a PIN (4 to 6 digits)',
    'Confirme le code': 'Confirm the PIN',
    'Ce code te sera redemandé si tu récupères ce profil depuis un autre appareil — retiens-le bien.': "You'll be asked for this PIN if you restore this profile on another device — keep it safe.",
    'Créer mon profil': 'Create my profile',
    "J'ai déjà un profil sur cette app": 'I already have a profile on this app',
    'Retrouve ton profil': 'Find your profile',
    'Tape ton prénom...': 'Type your first name...',
    'Créer un nouveau profil': 'Create a new profile',
    'Code': 'PIN',
    'Valider': 'Confirm',
    'Retour': 'Back',
    'Crée tes activités': 'Create your activities',
    'Choisis les activités que tu veux suivre, et une couleur pour chacune. Tu pourras en ajouter/modifier plus tard dans Profil.': 'Choose the activities you want to track, and a colour for each one. You can add or edit them later in Profile.',
    "Nom de l'activité": 'Activity name',
    'Couleur': 'Colour',
    'Ajouter': 'Add',
    'Continuer': 'Continue',
    'Aucun profil trouvé.': 'No profile found.',
    "Aucune activité ajoutée pour l'instant.": 'No activity added yet.',
    ' (note)': ' (note)',
    'Indique un prénom ou un pseudo.': 'Enter a first name or a nickname.',
    'Indique ton nom de famille.': 'Enter your last name.',
    'Indique un numéro de téléphone valide.': 'Enter a valid phone number.',
    'Indique une adresse email valide.': 'Enter a valid email address.',
    'Choisis un code de 4 à 6 chiffres.': 'Choose a PIN with 4 to 6 digits.',
    'Les deux codes ne correspondent pas.': 'The two PINs do not match.',
    'Le code doit comporter 4 à 6 chiffres.': 'The PIN must have 4 to 6 digits.',
    "Ce profil n'a pas encore de code (créé avant l'ajout de cette protection). Définis-en un maintenant.": 'This profile has no PIN yet (it was created before this protection existed). Set one now.',

    // ---- Chrono ----
    'Quelle activité ?': 'Which activity?',
    "Aucune activité pour l'instant — ajoutes-en une dans Profil.": 'No activities yet — add one in Profile.',
    'Note': 'Note',
    'Précision sur cette session...': 'Anything to note about this session...',
    'Envoyer aux membres': 'Send to members',
    'Envoyer à la communauté': 'Send to community',
    "Cette activité n'est partagée avec personne pour l'instant — choisis \"communauté\" ou partage-la depuis Profil.": 'This activity is not shared with anyone yet — choose "community", or share it from Profile.',
    "Écris une note avant d'envoyer.": 'Write a note before sending.',
    "Confirmer l'arrêt": 'Confirm stop',
    'Heure de début': 'Start time',
    'Heure de fin': 'End time',
    'Annuler': 'Cancel',
    'Durée : —': 'Duration: —',
    'Durée : ': 'Duration: ',
    'Heures invalides.': 'Invalid times.',
    "L'heure de fin doit être après l'heure de début.": 'The end time must be after the start time.',
    'Supprimer': 'Delete',
    'Supprimer cet enregistrement ?': 'Delete this record?',
    // Historique modifiable du Chrono (ajouté par la discussion Chrono le
    // 29 août 2026, traduit ici avec le reste de l'interface).
    'Historique': 'History',
    "Afficher l'historique": 'Show history',
    'Aucun enregistrement sur cette semaine.': 'No record for this week.',
    'Modifier': 'Edit',
    'Supprimer définitivement cet enregistrement ?': 'Permanently delete this record?',

    // Pièces jointes de note (photo prise à l'appareil, document) — ajoutées
    // par la discussion Chrono le 29 août 2026, traduites ici avec le reste.
    'Choisis une image.': 'Choose an image.',
    'Photo trop lourde (8 Mo max) — choisis-en une autre.': 'Photo too large (8 MB max) — choose another one.',
    'Fichier trop lourd (8 Mo max) — choisis-en un autre.': 'File too large (8 MB max) — choose another one.',
    'Envoi...': 'Sending...',
    'Impossible de traiter cette photo.': 'Could not process this photo.',
    'Impossible de lire ce fichier.': 'Could not read this file.',
    'Supprimer cette pièce jointe ?': 'Delete this attachment?',
    'Supprimer cette pièce jointe': 'Delete this attachment',
    'Voir en grand': 'View full size',
    'Ouvrir': 'Open',
    // Messages serveur correspondants (server/lib/attachments.js, timer.js,
    // history.js) — fixes ci-dessous, variables (avec un nombre) via
    // PATTERNS plus bas.
    'Fichier invalide.': 'Invalid file.',
    'Fichier vide.': 'Empty file.',
    "Ce n'est pas ta pièce jointe.": 'This is not your attachment.',
    'Pièce jointe introuvable.': 'Attachment not found.',
    'Pièce jointe supprimée.': 'Attachment deleted.',
    // Menu "épingle" regroupant les types de pièce jointe (30 août 2026).
    'Ajouter une pièce jointe': 'Add an attachment',
    // Fil "Communauté" de la zone Discussion du Profil (31 août 2026) — voir
    // server/routes/profile.js.
    "Ce n'est pas ton message.": 'This is not your message.',

    // ---- Statistiques ----
    // 'Jour' : nouvelle option de granularité du Graphique (1er septembre
    // 2026, remplace le choix de plage Semaine/Mois/Année/Total de ce menu).
    'Jour': 'Day',
    'Semaine': 'Week',
    'Mois': 'Month',
    'Année': 'Year',
    'Feuille de temps': 'Timesheet',
    'Semaine précédente': 'Previous week',
    'Semaine suivante': 'Next week',
    'Voir en plein écran, format paysage': 'View full screen, landscape',
    'Quitter le plein écran': 'Exit full screen',
    "La semaine en cours s'affiche par défaut à chaque ouverture. Les semaines précédentes restent enregistrées et consultables avec les flèches, sans jamais être perdues.": 'The current week is shown by default every time you open this tab. Previous weeks are kept and can be browsed with the arrows — nothing is ever lost.',
    "Rien d'enregistré sur cette semaine.": 'Nothing recorded this week.',
    'Répartition': 'Breakdown',
    "Rien d'enregistré sur cette période.": 'Nothing recorded for this period.',
    'Graphique': 'Chart',
    'Répartition du temps par activité': 'Time breakdown by activity',
    'Total': 'Total',
    ' (en cours)': ' (current)',
    "Aujourd'hui": 'Today',
    'Cette semaine': 'This week',
    'Ce mois-ci': 'This month',
    'Cette année': 'This year',
    // Noms de jours renvoyés par le serveur (server/lib/dates.js) et
    // affichés tronqués à 3 lettres dans la Feuille de temps.
    'Lundi': 'Monday',
    'Mardi': 'Tuesday',
    'Mercredi': 'Wednesday',
    'Jeudi': 'Thursday',
    'Vendredi': 'Friday',
    'Samedi': 'Saturday',
    'Dimanche': 'Sunday',

    // ---- Communauté ----
    'En ce moment': 'Right now',
    'Les personnes qui partagent une activité avec toi ou que tu suis, et qui ont un chrono en cours avec une note envoyée en direct.': 'People who share an activity with you, or who you follow, with a running timer and a note sent live.',
    "Personne ne partage de note en direct pour l'instant.": 'Nobody is sharing a live note right now.',
    'Rechercher des membres': 'Find members',
    'Chercher un pseudo...': 'Search for a nickname...',
    'Communauté': 'Community',
    'Membres': 'Members',
    'Suivi': 'Following',
    'Les personnes que tu suis, et leurs activités/notes si elles ont activé "Partager mon profil" (Profil > Réglages).': 'The people you follow, and their sessions and notes if they share their profile (Profile > Settings).',
    "Tu ne suis personne pour l'instant — trouve un membre ci-dessus et clique sur \"Suivre\".": 'You are not following anyone yet — find a member above and click "Follow".',
    "Rien à afficher pour l'instant : soit personne ne partage encore son profil avec toi, soit aucune session n'a encore été enregistrée.": 'Nothing to show yet: either nobody shares their profile with you, or no session has been recorded.',
    'Mes activités partagées': 'My shared activities',
    'Notes et activités des membres': "Members' notes and sessions",
    "Rien à afficher pour l'instant pour cette activité.": 'Nothing to show yet for this activity.',
    'Partagée': 'Shared',
    'Les activités et notes des personnes avec qui tu partages déjà une activité — sans rapport avec le suivi.': 'Sessions and notes from the people you already share an activity with — unrelated to following.',
    "Rien à afficher pour l'instant.": 'Nothing to show yet.',
    'Fermer': 'Close',
    "Actions de cette activité": 'Actions for this activity',
    'Voir les membres': 'View members',
    'Membres · ': 'Members · ',
    ' (toi)': ' (you)',
    'Chrono en cours sur cette activité': 'Timer running on this activity',
    'Aucun membre trouvé.': 'No member found.',
    'Se désabonner': 'Unfollow',
    'Demande envoyée': 'Request sent',
    'Annuler la demande': 'Cancel the request',
    'Suivre': 'Follow',
    'Aucune demande en attente.': 'No pending request.',
    ' souhaite te suivre.': ' wants to follow you.',
    'Accepter': 'Accept',
    'Refuser': 'Decline',
    'Membre': 'Member',
    'Abonnement': 'Following',
    'En cours depuis ': 'Running since ',

    // ---- Abonnés & Abonnements (Réglages, 30 août 2026) ----
    'Abonnés & Abonnements': 'Followers & Following',
    'Abonnés': 'Followers',
    'Abonnements': 'Following',
    "Personne ne te suit pour l'instant.": 'No one follows you yet.',
    "Tu ne suis personne pour l'instant.": "You aren't following anyone yet.",

    // ---- Fil de discussion d'une activité partagée (Communauté > Membres,
    // et sa réutilisation dans la zone Discussion > Membres du Profil) ----
    'Visible uniquement par les membres de cette activité. Les messages restent, même une fois les chronos arrêtés.': 'Visible to the members of this activity only. Messages stay, even once the timers are stopped.',
    "Aucun message pour l'instant — écris le premier ci-dessous.": 'No message yet — write the first one below.',
    'Envoyer': 'Send',
    // ---- Fil "Communauté" de la zone Discussion du Profil (31 août 2026) ----
    'Écrire...': 'Write...',
    'Messages non lus': 'Unread messages',
    'Supprimer ce message': 'Delete this message',
    'Supprimer ce message ?': 'Delete this message?',
    "Écris un message avant d'envoyer.": 'Write a message before sending.',
    'Message vide.': 'Empty message.',
    'Message trop long (2000 caractères maximum).': 'Message too long (2000 characters maximum).',
    'Message introuvable.': 'Message not found.',
    'Tu ne peux supprimer que tes propres messages.': 'You can only delete your own messages.',

    // ---- Profil ----
    'Changer la photo de profil': 'Change profile picture',
    'Retirer la photo': 'Remove photo',
    'Invitations et demandes de suivi': 'Invitations and follow requests',
    'Réglages': 'Settings',
    'Invitations reçues': 'Invitations received',
    'Demandes de suivi reçues': 'Follow requests received',
    'Activités': 'Activities',
    'Ajouter une activité': 'Add an activity',
    'Nouvelle activité': 'New activity',
    "Ajouter l'activité": 'Add activity',
    'Mes notes': 'My notes',
    "Aucune note enregistrée pour l'instant — les notes ajoutées pendant tes sessions dans Chrono apparaîtront ici.": 'No note recorded yet — notes added during your sessions in Timer will show up here.',
    'Déconnexion': 'Log out',
    'Identité': 'Identity',
    'La photo de profil se change directement depuis la vue principale du Profil — clique sur l\'avatar, en haut.': 'The profile picture is changed straight from the main Profile view — click the avatar at the top.',
    'Enregistrer': 'Save',
    'Enregistré.': 'Saved.',
    'Apparence': 'Appearance',
    '☀️ Clair': '☀️ Light',
    '🌙 Sombre': '🌙 Dark',
    'Le mode sombre est activé par défaut. Changer de mode adapte automatiquement les couleurs de tes activités si besoin.': 'Dark mode is on by default. Switching mode automatically adapts your activity colours if needed.',
    'Sécurité': 'Security',
    'Code actuel': 'Current PIN',
    'Nouveau code (4 à 6 chiffres)': 'New PIN (4 to 6 digits)',
    'Confirme le nouveau code': 'Confirm the new PIN',
    'Changer mon code': 'Change my PIN',
    "Importer l'historique existant": 'Import existing history',
    'Depuis Google Sheets : onglet « Historique » → Fichier → Télécharger → Valeurs séparées par une virgule (.csv), puis choisis le fichier ici.': 'From Google Sheets: "Historique" tab → File → Download → Comma-separated values (.csv), then pick the file here.',
    'Importer': 'Import',
    "Choisis un fichier .csv d'abord.": 'Choose a .csv file first.',
    'Import en cours...': 'Importing...',
    'Format non supporté — choisis une image PNG, JPEG ou WebP.': 'Unsupported format — choose a PNG, JPEG or WebP image.',
    'Image trop lourde (8 Mo max) — choisis-en une autre.': 'Image too large (8 MB max) — choose another one.',
    'Traitement de la photo...': 'Processing the photo...',
    'Photo mise à jour.': 'Photo updated.',
    'Impossible de mettre à jour la photo.': 'Could not update the photo.',
    'Retirer la photo de profil ?': 'Remove the profile picture?',
    'Photo retirée.': 'Photo removed.',
    'Profil mis à jour.': 'Profile updated.',
    "Thème mis à jour — tes couleurs d'activités ont été adaptées si besoin.": 'Theme updated — your activity colours were adapted if needed.',
    'Le nouveau code doit comporter 4 à 6 chiffres.': 'The new PIN must have 4 to 6 digits.',
    'Code mis à jour.': 'PIN updated.',
    'Se déconnecter de ce profil sur cet appareil ?': 'Log out of this profile on this device?',
    "Aucune activité pour l'instant — ajoute la première ci-dessous.": 'No activity yet — add your first one below.',
    "Paramètres de l'activité": 'Activity settings',
    'Partager': 'Share',
    'Séparer': 'Split off',
    'Supprimer définitivement': 'Delete permanently',
    'Supprimer définitivement cette activité pour toi ? Elle disparaîtra de ton Chrono et de ton Profil. Les autres personnes qui la partagent avec toi ne sont pas concernées.': 'Permanently delete this activity for you? It will disappear from your Timer and your Profile. The other people who share it with you are not affected.',
    "Veux-tu garder l'historique déjà enregistré sur cette activité ?\n\nOK = garder l'historique\nAnnuler = tout supprimer aussi": 'Do you want to keep the history already recorded on this activity?\n\nOK = keep the history\nCancel = delete everything too',
    'Aucune invitation en attente.': 'No pending invitation.',

    // ---- Phrases à emplacement variable ({nom} remplacé à l'affichage) ----
    'Code de {name}': 'PIN for {name}',
    'Définis un code pour {name}': 'Set a PIN for {name}',
    'Durée : {duration}': 'Duration: {duration}',
    'Te désabonner de {name} ?': 'Unfollow {name}?',
    '{name} souhaite te suivre.': '{name} wants to follow you.',
    'Membres · {name}': 'Members · {name}',
    'En cours depuis {time}': 'Running since {time}',
    'Partagée par {owner} — tu peux choisir ta couleur, le reste lui appartient.': 'Shared by {owner} — you can pick your colour, the rest belongs to them.',
    '{count} membres — visible dans Communauté.': '{count} members — visible in Community.',
    'Pseudo de la personne à inviter sur "{activity}" :': 'Nickname of the person to invite to "{activity}":',
    'Séparer "{activity}" ? Tu auras désormais ta propre activité personnelle du même nom, avec ton historique déjà enregistré dessus. Les autres personnes qui la partagent ne sont pas concernées.': 'Split off "{activity}"? You will get your own personal activity with the same name, carrying the history you already recorded on it. The other people sharing it are not affected.',
    '{from} t\'invite sur « {activity} ».': '{from} invites you to "{activity}".',
    'Fusionner avec une de tes activités existantes ?': 'Merge with one of your existing activities?',
    'Non, nouvelle activité': 'No, new activity',
    'Fusionner ton activité « {mine} » avec « {activity} » ? Ton historique déjà enregistré sur « {mine} » sera transféré dessus, et « {mine} » disparaîtra en tant qu\'activité séparée.': 'Merge your activity "{mine}" with "{activity}"? The history already recorded on "{mine}" will be transferred to it, and "{mine}" will disappear as a separate activity.',

    // ---- Langue (nouveau) ----
    'Langue': 'Language',
    'Français': 'French',
    'Anglais': 'English',
    "Change la langue de toute l'application. Le changement est appliqué immédiatement.": 'Changes the language of the whole app. The change is applied straight away.',
    'Langue mise à jour.': 'Language updated.',
    "Le serveur n'a pas pris en compte le changement de langue : il tourne encore sur la version d'avant la mise à jour. Arrête-le (Ctrl+C) et relance `npm start`, puis réessaie.": 'The server did not apply the language change: it is still running the version from before the update. Stop it (Ctrl+C), start it again with `npm start`, then try once more.',

    // ---- Suppression de compte (nouveau) ----
    'Supprimer mon compte': 'Delete my account',
    'Cette action est définitive : ton profil, ton historique, tes notes, tes invitations et tes abonnements sont supprimés. Les activités que tu partages avec d\'autres personnes continuent d\'exister pour elles.': 'This cannot be undone: your profile, history, notes, invitations and follows are deleted. Activities you share with other people keep existing for them.',
    'Saisis ton code pour confirmer': 'Enter your PIN to confirm',
    'Supprimer définitivement mon compte': 'Permanently delete my account',
    'Supprimer définitivement ton compte ? Cette action est irréversible.': 'Permanently delete your account? This cannot be undone.',
    'Dernière confirmation : tout ton historique et tes notes seront perdus. Continuer ?': 'Last confirmation: all your history and notes will be lost. Continue?',
    'Compte supprimé.': 'Account deleted.',
    'Saisis ton code pour confirmer la suppression.': 'Enter your PIN to confirm the deletion.',

    // ---- Barre d'onglets ----
    'Chrono': 'Timer',
    'Stats': 'Stats',
    'Statistiques': 'Statistics',
    'Profil': 'Profile',

    // ---- Messages renvoyés par le serveur (texte fixe) ----
    'Erreur serveur': 'Server error',
    'userId requis.': 'userId is required.',
    'userId et activityId requis.': 'userId and activityId are required.',
    'followerId et followeeId requis.': 'followerId and followeeId are required.',
    'Profil introuvable.': 'Profile not found.',
    'Profil introuvable. Réinitialise ton profil dans Paramètres.': 'Profile not found. Reset your profile in Settings.',
    'Activité introuvable.': 'Activity not found.',
    'Activité invalide.': 'Invalid activity.',
    "Le nom de l'activité est requis.": 'The activity name is required.',
    'Tu ne fais pas partie de cette activité.': 'You are not part of this activity.',
    "Tu n'es pas membre de cette activité.": 'You are not a member of this activity.',
    'Seul le créateur de cette activité peut modifier son nom ou sa note.': 'Only the creator of this activity can change its name or its note setting.',
    'Cette couleur ne fait pas partie de la palette de ton thème actuel.': 'This colour is not part of your current theme palette.',
    'Le pseudo de la personne à inviter est requis.': 'The nickname of the person to invite is required.',
    "Tu ne peux pas t'inviter toi-même.": 'You cannot invite yourself.',
    "Choisis une autre activité que celle qu'on te partage.": "Pick a different activity than the one being shared with you.",
    'Activité à fusionner introuvable.': 'Activity to merge not found.',
    'Tu ne fais pas partie de cette activité à fusionner.': 'You are not part of this activity to merge.',
    "Arrête le chrono en cours sur l'activité à fusionner avant d'accepter.": 'Stop the running timer on the activity to merge before accepting.',
    "Cette activité n'est pas partagée, il n'y a rien à séparer.": 'This activity is not shared, there is nothing to split off.',
    "Cette activité n'est pas partagée.": 'This activity is not shared.',
    "Cette activité n'est pas partagée avec d'autres membres.": 'This activity is not shared with other members.',
    "Cette activité n'existe plus.": 'This activity no longer exists.',
    'Arrête le chrono en cours sur cette activité avant de la séparer.': 'Stop the running timer on this activity before splitting it off.',
    'Arrête le chrono en cours sur cette activité avant de la supprimer.': 'Stop the running timer on this activity before deleting it.',
    'Activité supprimée, ton historique a été conservé.': 'Activity deleted, your history was kept.',
    'Activité et historique supprimés.': 'Activity and history deleted.',
    'Tu ne peux pas te suivre toi-même.': 'You cannot follow yourself.',
    'Demande déjà en attente.': 'Request already pending.',
    'Demande introuvable ou déjà traitée.': 'Request not found, or already handled.',
    "Cette demande ne t'est pas destinée.": 'This request is not addressed to you.',
    'Demande de suivi acceptée.': 'Follow request accepted.',
    'Demande de suivi refusée.': 'Follow request declined.',
    'Introuvable.': 'Not found.',
    'Tu ne peux retirer que tes propres abonnements ou demandes.': 'You can only remove your own follows or requests.',
    'Désabonné.': 'Unfollowed.',
    'Demande annulée.': 'Request cancelled.',
    'Invitation introuvable ou déjà traitée.': 'Invitation not found, or already handled.',
    "Cette invitation ne t'est pas destinée.": 'This invitation is not addressed to you.',
    'Invitation refusée.': 'Invitation declined.',
    'Enregistrement introuvable.': 'Record not found.',
    "Ce n'est pas ton enregistrement.": 'This is not your record.',
    'Enregistrement mis à jour.': 'Record updated.',
    'Enregistrement supprimé.': 'Record deleted.',
    'Heures invalides (fin doit être après le début).': 'Invalid times (the end must be after the start).',
    'Heure de début invalide.': 'Invalid start time.',
    'Heure de fin invalide.': 'Invalid end time.',
    'Aucun chrono en cours.': 'No timer is running.',
    "Cette activité ne t'appartient pas.": 'This activity is not yours.',
    "Audience invalide (attendu 'members' ou 'community').": "Invalid audience (expected 'members' or 'community').",
    'La note ne peut pas être vide.': 'The note cannot be empty.',
    'Note envoyée aux membres.': 'Note sent to the members.',
    'Note envoyée à ta communauté.': 'Note sent to your community.',
    'Le prénom (ou pseudo) est requis.': 'The first name (or nickname) is required.',
    'Le nom de famille est requis.': 'The last name is required.',
    'Un numéro de téléphone valide est requis.': 'A valid phone number is required.',
    'Une adresse email valide est requise.': 'A valid email address is required.',
    'Le nom de famille ne peut pas être vide.': 'The last name cannot be empty.',
    'Numéro de téléphone invalide.': 'Invalid phone number.',
    'Adresse email invalide.': 'Invalid email address.',
    'Format de photo invalide.': 'Invalid photo format.',
    'Photo trop lourde — réessaie avec une image plus petite.': 'Photo too large — try again with a smaller image.',
    "Ce profil n'a pas encore de code.": 'This profile has no PIN yet.',
    "Trop d'essais. Réessaie dans une minute.": 'Too many attempts. Try again in a minute.',
    'Code incorrect.': 'Wrong PIN.',
    'Code actuel incorrect.': 'Wrong current PIN.',
    'weekOffset invalide.': 'Invalid weekOffset.',
    'Champ "csv" manquant.': 'Missing "csv" field.',
    'Fichier CSV vide ou illisible.': 'Empty or unreadable CSV file.',
    "Colonnes attendues introuvables (Date ISO / Activité / Durée (h)). Vérifie que le CSV vient bien de l'onglet Historique.": 'Expected columns not found (Date ISO / Activité / Durée (h)). Check that the CSV really comes from the "Historique" tab.',
    'Langue invalide.': 'Invalid language.',
  };

  // ------------------- Messages contenant une valeur variable -------------
  // Chaque règle : une expression régulière sur le texte français, et le
  // gabarit anglais correspondant ($1, $2… = groupes capturés).
  var PATTERNS = [
    // Pièces jointes de note (server/lib/attachments.js, server/routes/timer.js)
    [/^Fichier trop lourd \((\d+) Mo max\)\.$/, 'File too large ($1 MB max).'],
    [/^Maximum (\d+) pièces jointes par session\.$/, 'Maximum $1 attachments per session.'],
    [/^Maximum (\d+) pièces jointes par message\.$/, 'Maximum $1 attachments per message.'],
    [/^Tu as déjà une activité "(.+)"\.$/, 'You already have an activity called "$1".'],
    [/^Tu as déjà une autre activité "(.+)" — renomme-la d'abord si tu veux séparer celle-ci sous le même nom\.$/, 'You already have another activity called "$1" — rename it first if you want to split this one off under the same name.'],
    [/^Aucun profil avec le pseudo "(.+)"\.$/, 'No profile with the nickname "$1".'],
    [/^(.+) fait déjà partie de cette activité\.$/, '$1 is already part of this activity.'],
    [/^(.+) a déjà une invitation en attente pour cette activité\.$/, '$1 already has a pending invitation for this activity.'],
    [/^Invitation envoyée à (.+)\.$/, 'Invitation sent to $1.'],
    [/^"(.+)" a été séparée : tu as maintenant ta propre activité personnelle, avec ton historique\.$/, '"$1" was split off: you now have your own personal activity, with your history.'],
    [/^Tu suis déjà (.+)\.$/, 'You already follow $1.'],
    [/^Demande envoyée à (.+)\.$/, 'Request sent to $1.'],
    // Doit rester AVANT le pattern générique "Tu as rejoint « (.+) »." juste
    // en dessous : les deux se terminent par « X ».", et le pattern générique
    // matcherait sinon en premier (avec un $1 incorrect) par backtracking.
    [/^Tu as rejoint « (.+) », fusionnée avec ton ancienne activité « (.+) »\.$/, 'You joined "$1", merged with your former activity "$2".'],
    [/^Tu as rejoint « (.+) »\.$/, 'You joined "$1".'],
    [/^Activité enregistrée : (.*)$/, 'Session recorded: $1'],
    [/^Import terminé : (\d+) ligne\(s\) importée\(s\), (\d+) ignorée\(s\)\.$/, 'Import finished: $1 row(s) imported, $2 skipped.'],
    [/^"(.+)" existe déjà\. Choisis un autre nom, ou récupère ton profil si c'est toi\.$/, '"$1" already exists. Pick another name, or restore your profile if that is you.'],
    [/^"(.+)" est déjà pris par un autre profil\.$/, '"$1" is already taken by another profile.'],
    [/^Semaine du (\S+) au (\S+)$/, 'Week of $1 to $2'],
  ];

  var lang = 'fr';

  function hasKey(k) { return Object.prototype.hasOwnProperty.call(DICT, k); }

  function applyTemplate(tpl, m) {
    return tpl.replace(/\$(\d)/g, function (_, i) { return m[Number(i)] || ''; });
  }

  // Remplace les emplacements {nom} par les valeurs fournies. Utilisé pour
  // les phrases qui contiennent une valeur variable (un pseudo, un nom
  // d'activité...) : le français et l'anglais n'ayant pas le même ordre de
  // mots, on ne peut pas se contenter de concaténer des morceaux traduits.
  function fill(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole;
    });
  }

  // Traduit une chaîne. En français, renvoie l'entrée telle quelle (après
  // remplacement éventuel des {emplacements}).
  function t(s, vars) {
    if (s === null || s === undefined) return s;
    var k = String(s);
    if (lang !== 'en') return fill(k, vars);
    if (hasKey(k)) return fill(DICT[k], vars);
    var trimmed = k.trim();
    if (trimmed && trimmed !== k && hasKey(trimmed)) {
      // Conserve les espaces autour (une chaîne peut arriver avec un espace
      // parasite en début ou en fin).
      return fill(k.replace(trimmed, DICT[trimmed]), vars);
    }
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = PATTERNS[i][0].exec(k);
      if (m) return fill(applyTemplate(PATTERNS[i][1], m), vars);
    }
    return fill(k, vars);
  }

  function setLang(l) {
    lang = (l === 'en') ? 'en' : 'fr';
    try { document.documentElement.setAttribute('lang', lang); } catch (e) { /* ignore */ }
    return lang;
  }
  function getLang() { return lang; }

  // Parcourt le DOM statique et traduit ce qui est reconnu : nœuds de texte
  // dont le contenu exact est une clé, et attributs visibles par
  // l'utilisateur. Volontairement STRICT (correspondance exacte sur le texte
  // détouré) pour ne jamais toucher à une donnée saisie par quelqu'un (nom
  // d'activité, note...), qui ne figure évidemment pas dans le dictionnaire.
  var TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function translateStaticDom(root) {
    if (lang !== 'en' || !root) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    var node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach(function (n) {
      var raw = n.nodeValue;
      if (!raw) return;
      var trimmed = raw.trim();
      if (!trimmed || !hasKey(trimmed)) return;
      n.nodeValue = raw.replace(trimmed, DICT[trimmed]);
    });

    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      for (var a = 0; a < TRANSLATABLE_ATTRS.length; a++) {
        var attr = TRANSLATABLE_ATTRS[a];
        if (!all[i].hasAttribute(attr)) continue;
        var v = all[i].getAttribute(attr);
        var tv = v && v.trim();
        if (tv && hasKey(tv)) all[i].setAttribute(attr, DICT[tv]);
      }
    }
  }

  global.NoesisI18n = { t: t, setLang: setLang, getLang: getLang, translateStaticDom: translateStaticDom };
  global.t = t;
})(window);
