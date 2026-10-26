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
// Langue par défaut : français depuis le 9 septembre 2026 (chantier
// « Français par défaut » de l'échéance du 11 septembre — la Charte de la
// langue française donne au consommateur québécois le droit d'être servi
// en français, et Noèsis cible d'abord des résidents du Québec ; voir
// server/db.js et server/routes/profile.js). Entre le 29 août et le
// 9 septembre 2026, ce défaut avait été l'anglais (demande d'Emilien) ; les
// profils créés avant le 29 août étaient déjà en français et n'ont jamais
// été affectés par ce changement.

(function (global) {
  'use strict';

  // ------------------- Dictionnaire français -> anglais -------------------
  var DICT = {
    // ---- Onboarding ----
    'TimeTracker partagé': 'Shared TimeTracker',
    // 11 septembre 2026 (écran "ajoute Noèsis à ton écran d'accueil",
    // affiché tant que l'app n'est pas ouverte en mode autonome).
    "Ajoute Noèsis à ton écran d'accueil": 'Add Noèsis to your home screen',
    "Pour créer ou retrouver ton profil, ajoute d'abord Noèsis à ton écran d'accueil — ça ne prend que quelques secondes, et l'app s'ouvrira ensuite comme une vraie application.": "To create or find your profile, first add Noèsis to your home screen — it only takes a few seconds, and the app will then open like a real application.",
    "Une fois l'icône ajoutée, ouvre Noèsis à partir d'elle — cet écran ne s'affichera plus.": "Once the icon is added, open Noèsis from it — this screen won't appear again.",
    "Ouvre ce lien directement dans le navigateur de ton appareil (Safari sur iPhone, Chrome sur Android, ton navigateur habituel sur ordinateur) — pas depuis une application comme Messenger ou Instagram, qui n'offre pas l'option d'installation.": "Open this link directly in your device's browser (Safari on iPhone, Chrome on Android, your usual browser on a computer) — not from an app like Messenger or Instagram, which doesn't offer the install option.",
    'Touche les trois petits points (⋯) pour faire apparaître le bouton Partager.': 'Tap the three dots (⋯) to reveal the Share button.',
    'Touche le bouton Partager.': 'Tap the Share button.',
    "Fais défiler les options et touche « Ajouter à l'écran d'accueil ».": "Scroll down the options and tap “Add to Home Screen”.",
    'Touche « Ajouter » en haut à droite.': 'Tap “Add” in the top right corner.',
    'Touche le menu ⋮ (trois points) en haut à droite du navigateur.': 'Tap the ⋮ menu (three dots) in the top right of the browser.',
    "Touche « Ajouter à l'écran d'accueil » (ou « Installer l'application »).": 'Tap “Add to Home screen” (or “Install app”).',
    'Confirme en touchant « Ajouter » ou « Installer ».': 'Confirm by tapping “Add” or “Install”.',
    "Clique sur l'icône d'installation (⊕) dans la barre d'adresse, à droite.": 'Click the install icon (⊕) in the address bar, on the right.',
    'Clique sur « Installer ».': 'Click “Install”.',
    "Noèsis s'ouvre dans sa propre fenêtre, accessible depuis ton bureau ou ton menu de démarrage.": 'Noèsis opens in its own window, accessible from your desktop or start menu.',
    'Tape ton nom complet...': 'Type your full name...',
    'Tape au moins 3 caractères de ton nom complet pour retrouver ton profil.': 'Type at least 3 characters of your full name to find your profile.',
    "Comment t'appelles-tu ?": "What's your name?",
    'Prénom ou pseudo': 'First name or nickname',
    'Prénom': 'First name',
    'Nom de famille': 'Last name',
    'Numéro de téléphone': 'Phone number',
    'Adresse email': 'Email address',
    'Choisis un code (4 à 6 chiffres)': 'Choose a PIN (4 to 6 digits)',
    'Confirme le code': 'Confirm the PIN',
    "J'ai déjà un compte.": "I already have an account.",
    "Me connecter": "Sign in",
    "Création de compte": "Account creation",
    "Qui êtes-vous ?": "Who are you?",
    "Individu": "Individual",
    "Utilisation commerciale des données de l'entreprise": "Commercial use of the company data",
    "J'accepte que Noesis utilise les données saisies pour l'entreprise afin d'analyser l'usage, produire des statistiques, envoyer des communications commerciales à l'entreprise et cibler ses propres campagnes publicitaires. Les mots de passe et les messages privés ne sont jamais utilisés. L'entreprise peut retirer cet accord à tout moment dans Réglages, section Sécurité.": "I agree that Noesis may use the data entered for the company to analyse usage, produce statistics, send commercial communications to the company and target its own advertising campaigns. Passwords and private messages are never used. The company can withdraw this consent at any time in Settings, Security section.",
    "J'accepte que le nom de l'entreprise et celui de son responsable puissent être trouvés dans la recherche de membres de l'écran de connexion.": "I agree that the company name and the name of the person in charge may be found in the member search on the sign-in screen.",
    "Gouvernance des renseignements de l'entreprise": "Company information governance",
    ", et je suis autorisé à engager l'entreprise.": ", and I am authorised to commit the company.",
    "J'ai déjà un compte": "I already have an account",
    "Créer un compte": "Create an account",
    "Tu crées un compte pour…": "You are creating an account for…",
    "Je suis un individu": "I am an individual",
    "Je suis une entreprise": "I am a company",
    "Nom de l'entreprise": "Company name",
    "Nom du responsable": "Name of the person in charge",
    "Indique le nom de l'entreprise.": "Enter the company name.",
    "Indique le nom du responsable.": "Enter the name of the person in charge.",
    "Mot de passe oublié ?": "Forgot your password?",
    "Entre le courriel de ton compte : on t'envoie un lien pour choisir un nouveau mot de passe.": "Enter your account email: we will send you a link to choose a new password.",
    "Courriel du compte": "Account email",
    "Envoyer le lien": "Send the link",
    "Si un compte correspond à ce courriel, un lien vient d’y être envoyé.": "If an account matches this email, a link has just been sent to it.",
    "Ajoute ton courriel": "Add your email",
    "Ton courriel sert à retrouver ton compte si tu oublies ton mot de passe. Il est obligatoire pour tout le monde.": "Your email is used to recover your account if you forget your password. It is required for everyone.",
    "Ton courriel": "Your email",
    "Mot de passe changé. Ouvre l’app depuis ton écran d’accueil et connecte-toi avec ton nouveau mot de passe.": "Password changed. Open the app from your home screen and sign in with your new password.",
    "Lien invalide ou expiré. Demande un nouveau lien.": "Invalid or expired link. Request a new one.",
    "Trop de demandes. Réessaie dans quelques minutes.": "Too many requests. Try again in a few minutes.",
    "Trop de tentatives. Réessaie dans quelques minutes.": "Too many attempts. Try again in a few minutes.",
    "Ajoute ton courriel pour continuer.": "Add your email to continue.",
    "Se connecter avec Face ID": "Sign in with Face ID",
    "Face ID": "Face ID",
    "Connecte-toi sans taper ton mot de passe, avec Face ID, Touch ID ou le code de ton appareil. Ton mot de passe reste nécessaire pour activer Face ID.": "Sign in without typing your password, with Face ID, Touch ID or your device passcode. Your password is still needed to turn Face ID on.",
    "Activer Face ID sur cet appareil": "Turn on Face ID on this device",
    "Aucun appareil pour l’instant.": "No device yet.",
    "Appareil": "Device",
    "Retirer Face ID de cet appareil ?": "Remove Face ID from this device?",
    "Tu pourras toujours te connecter avec ton mot de passe.": "You can still sign in with your password.",
    "Entre ton mot de passe actuel pour activer Face ID.": "Enter your current password to turn on Face ID.",
    "Face ID activé.": "Face ID turned on.",
    "Face ID n’a pas pu être activé.": "Face ID could not be turned on.",
    "Face ID n’a pas pu te connecter.": "Face ID could not sign you in.",
    "Face ID n’est pas disponible sur cette adresse.": "Face ID is not available at this address.",
    "Cet appareil est déjà enregistré.": "This device is already registered.",
    "Demande expirée. Recommence.": "Request expired. Try again.",
    "Trop d’appareils enregistrés.": "Too many devices registered.",
    "Tu as déjà 10 appareils avec Face ID. Retires-en un d’abord.": "You already have 10 devices with Face ID. Remove one first.",
    "Choisis un mot de passe (10 caractères ou plus)": "Choose a password (10 characters or more)",
    "Confirme le mot de passe": "Confirm the password",
    "Mot de passe": "Password",
    "Mot de passe actuel": "Current password",
    "Nouveau mot de passe": "New password",
    "Confirme le nouveau mot de passe": "Confirm the new password",
    "Changer mon mot de passe": "Change my password",
    "Saisis ton mot de passe pour confirmer": "Enter your password to confirm",
    "10 caractères ou plus, avec une minuscule, une majuscule, un chiffre et un caractère spécial.": "10 characters or more, with a lowercase letter, an uppercase letter, a digit and a special character.",
    "Ancien code": "Old PIN",
    "Choisis un nouveau mot de passe": "Choose a new password",
    "Pour protéger ton compte et tes données, ton ancien code à 4 chiffres est remplacé par un mot de passe solide : 10 caractères ou plus, avec une minuscule, une majuscule, un chiffre et un caractère spécial.": "To protect your account and your data, your old 4-digit PIN is replaced by a strong password: 10 characters or more, with a lowercase letter, an uppercase letter, a digit and a special character.",
    "Choisis un mot de passe.": "Choose a password.",
    "Le mot de passe doit comporter au moins 10 caractères.": "The password must have at least 10 characters.",
    "Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial.": "The password must contain a lowercase letter, an uppercase letter, a digit and a special character.",
    "Les deux mots de passe ne correspondent pas.": "The two passwords do not match.",
    "Mot de passe mis à jour.": "Password updated.",
    "Mot de passe de {name}": "Password for {name}",
    "Définis un mot de passe pour {name}": "Set a password for {name}",
    "Ce profil n'a pas encore de mot de passe (créé avant l'ajout de cette protection). Définis-en un maintenant.": "This profile has no password yet (it was created before this protection existed). Set one now.",
    "Le mot de passe est trop long (128 caractères au plus).": "The password is too long (128 characters at most).",
    "Ce mot de passe est trop courant. Choisis-en un autre.": "This password is too common. Choose another one.",
    "Le mot de passe ne doit pas contenir ton nom ni ton adresse courriel.": "The password must not contain your name or your email address.",
    "Mot de passe incorrect.": "Wrong password.",
    "Mot de passe actuel incorrect.": "Wrong current password.",
    "Choisis un nouveau mot de passe pour continuer.": "Choose a new password to continue.",
    "Saisis ton mot de passe pour confirmer la suppression.": "Enter your password to confirm the deletion.",
    'Ce code te sera redemandé si tu récupères ce profil depuis un autre appareil — retiens-le bien.': "You'll be asked for this PIN if you restore this profile on another device — keep it safe.",
    'Créer mon profil': 'Create my profile',
    "J'ai déjà un profil sur cette app": 'I already have a profile on this app',
    'Retrouve ton profil': 'Find your profile',
    'Créer un nouveau profil': 'Create a new profile',
    'Code': 'PIN',
    'Valider': 'Confirm',
    'Retour': 'Back',
    'Crée tes activités': 'Create your activities',
    // ---- Onboarding "à la iPhone" (15 septembre 2026, chantier
    // "Onboarding à la iPhone") : écran de bienvenue, choix du thème,
    // suggestions d'activités et mini-tour de 6 cartes. ----
    'Passer': 'Skip',
    'Terminer': 'Done',
    'Aide': 'Help',
    // Variante "dans Activité" : le texte HTML actuel dit désormais "Activité"
    // (renommage du volet de gestion des activités survenu après l'écriture
    // de la clé ci-dessus, qui est donc orpheline) — clé ci-dessus gardée
    // sans y toucher, celle-ci ajoutée pour correspondre au texte réel.
    // Trouvée et comblée le 10 septembre 2026 (audit des traductions
    // manquantes signalé par Emilien).
    "Nom de l'activité": 'Activity name',
    'Couleur': 'Colour',
    'Ajouter': 'Add',
    'Communauté et profil': 'Community and profile',
    'Horaire': 'Schedule',
    'Choisis tes modules': 'Choose your modules',
    'Choisis au moins un module.': 'Choose at least one module.',
    'L’Horaire prépare les horaires de ton personnel.': 'Schedule prepares your staff schedules.',
    'Garde au moins un ensemble : « Chrono », « Feuille de route » ou « Horaire ».': 'Keep at least one: “Chrono”, “Roadmap” or “Schedule”.',
    'Continuer': 'Continue',
    'Aucun profil trouvé.': 'No profile found.',
    "Aucune activité ajoutée pour l'instant.": 'No activity added yet.',
    'Mon activité': 'My activity',
    "Aucune activité pour l'instant. Touche « + » pour ajouter ta première activité.": 'No activity yet. Tap "+" to add your first one.',
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
    // Même défaut que ci-dessus, même cause (renommage "Profil" → "Activité"
    // du volet de gestion des activités) : clé ci-dessus orpheline, celle-ci
    // ajoutée pour le texte réellement affiché. Trouvée et comblée le
    // 10 septembre 2026 (audit des traductions manquantes signalé par
    // Emilien).
    "Aucune activité pour l'instant — ajoutes-en une dans Réglages.": 'No activities yet — add one in Settings.',
    'Note': 'Note',
    'Envoyer à la communauté': 'Send to community',
    "Confirmer l'arrêt": 'Confirm stop',
    'Heure de début': 'Start time',
    'Heure de fin': 'End time',
    'Lien de mon calendrier': 'My calendar link',
    'Annuler': 'Cancel',
    'Autonome': 'Autonomous',
    'Partiel': 'Partial',
    'Absence': 'Off',
    'Publique': 'Public',
    'Confidentielle': 'Confidential',
    'Visibilité': 'Visibility',
    'Fusionner avec…': 'Merge with…',
    'Connecter Trade Tracker': 'Connect Trade Tracker',
    'Modifier cette activité': 'Edit this activity',
    'Absent': 'Off',
    'Gestion de l\'IA': 'AI management',
    'Modules': 'Modules',
    'Calendrier : désactivé dans Modules': 'Calendar: turned off in Modules',
    'Activités partagées': 'Shared activities',
    'Feuille de route': 'Roadmap',
    // Barre des volets (chantier B, 20 oct. 2026).
    'Ajouter un onglet': 'Add a tab',
    'Retirer de la barre': 'Remove from the bar',
    'Assistant IA': 'AI assistant',
    'Temps': 'Time',
    'Optionnel': 'Optional',
    'Autres': 'Other',
    'Tâche': 'Task',
    'Tâche rangée': 'Task placed',
    'Ajouter cette tâche ?': 'Add this task?',
    'Confirmer': 'Confirm',
    'Confirmer la modification': 'Confirm the change', 'La durée de cette entrée change de plus de 4 h. Confirmer ?': 'This entry\'s duration changes by more than 4 h. Confirm?', 'Horloge défilante': 'Scrolling clock',
    'Modifier cette tâche': 'Edit this task',
    'Durée : —': 'Duration: —',
    'Durée : ': 'Duration: ',
    'Heures invalides.': 'Invalid times.',
    'Une entrée ne peut pas durer plus de 24 h.': 'An entry cannot last more than 24 h.',
    'Les heures ne peuvent pas être dans le futur.': 'Times cannot be in the future.',
    'Ces heures chevauchent une autre de tes entrées.': 'These times overlap another of your entries.',
    "L'heure de fin doit être après l'heure de début.": 'The end time must be after the start time.',
    'Supprimer': 'Delete',
    // Historique modifiable du Chrono (ajouté par la discussion Chrono le
    // 29 août 2026, traduit ici avec le reste de l'interface).
    'Historique': 'History',
    'Aucun enregistrement sur cette semaine.': 'No record for this week.',
    'Modifier': 'Edit',
    'Supprimer définitivement cet enregistrement ?': 'Permanently delete this record?',

    // Pièces jointes de note (photo prise à l'appareil, document) — ajoutées
    // par la discussion Chrono le 29 août 2026, traduites ici avec le reste.
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
    // Feuille de temps / Graphique (Statistiques) uniquement : plus de
    // rotation forcée en paysage depuis le 1er septembre 2026 (demande
    // d'Emilien) — la Communauté (activité partagée) garde encore l'ancien
    // libellé ci-dessus pour l'instant.
    // Graphique (Statistiques) uniquement, 2 septembre 2026 : bouton révélé
    // par renderChart() une fois zoomé (pincement à deux doigts) — voir
    // #chartZoomResetBtn dans index.html et chartViewState dans app.js.
    'Répartition': 'Breakdown',
    "Rien d'enregistré sur cette période.": 'Nothing recorded for this period.',
    'Graphique': 'Chart',
    'Répartition du temps par activité': 'Time breakdown by activity',
    'Total': 'Total',
    ' (en cours)': ' (current)',
    "Aujourd'hui": 'Today',
    'Synchroniser': 'Sync',
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
    'Rechercher des membres': 'Find members',
    'Communauté': 'Community',
    'Membres': 'Members',
    'Suivi': 'Following',
    'Mes activités partagées': 'My shared activities',
    'Partagée': 'Shared',
    'Fermer': 'Close',
    'Voir les membres': 'View members',
    // ---- Fusion de deux activités (2 septembre 2026) ----
    'Fusionner': 'Merge',
    'Fusionner « {activity} » avec…': 'Merge "{activity}" with…',
    "Les enregistrements des deux activités seront additionnés. Une activité partagée avec d'autres personnes ne disparaît jamais : c'est elle qui recueille les enregistrements de l'autre.": 'The sessions of both activities will be added together. An activity shared with other people never disappears: it is the one that takes in the other\'s sessions.',
    'Choisir une autre activité': 'Pick another activity',
    'Partagée elle aussi — impossible de fusionner deux activités partagées.': 'Shared as well — two shared activities cannot be merged.',
    'Aucune autre activité à fusionner avec celle-ci.': 'No other activity to merge this one with.',
    'Ne se répète pas': 'Does not repeat',
    'Se répète': 'Repeats',
    'Tous les': 'Every',
    'jours': 'days',
    'semaines': 'weeks',
    'mois': 'months',
    'Arrêter la récurrence': 'Stop repeating',
    'Répéter': 'Repeat',
    'Choisis un pôle ou un secteur.': 'Choose a pole or sector.',
    'Choisir…': 'Choose…',
    'URL enregistrées': 'Saved URLs',
    'Supprimer cette adresse': 'Delete this address',
    'Supprimer cette adresse ?': 'Delete this address?',
    'Noèsis ne lira plus cet agenda.': 'Noèsis will no longer read this calendar.',
    'Agenda enregistré.': 'Calendar saved.',
    'Enregistré.': 'Saved.',
    'Répartition selon mon agenda': 'Planning based on my calendar',
    'Exporter vers le calendrier': 'Export to the calendar',
    'Importer un calendrier dans l\'appli': 'Import a calendar into the app',
    "Colle l'adresse ICS d'un agenda (Google Agenda, Apple Calendar…) ; tu peux en ajouter plusieurs. Noèsis ne garde que les heures occupées et compare les titres à tes règles, rien d'autre.": "Paste the ICS address of a calendar (Google Calendar, Apple Calendar…); you can add several. Noèsis only keeps busy hours and compares titles with your rules, nothing else.",
    "Chaque règle s'applique aux jours où un événement a un titre contenant un de ses mots ; si plusieurs s'appliquent, la plus restrictive gagne. Seuls les titres sont comparés, rien n'est conservé.": "Each rule applies to days with an event whose title contains one of its words; if several apply, the strictest wins. Only titles are compared, nothing is kept.",
    'Si le titre contient': 'If the title contains',
    'vacances, congé': 'vacation, leave',
    'bureau': 'office',
    'Aucune tâche': 'No tasks',
    'Temps limité': 'Limited time',
    'max. h': 'max. h',
    'Supprimer cette règle': 'Delete this rule',
    'Tu peux créer 20 règles au maximum.': 'You can create up to 20 rules.',
    'Retirer': 'Remove',
    'Joindre un document ou une image': 'Attach a document or an image',
    'Image illisible.': 'Unreadable image.',
    '3 fichiers maximum.': '3 files maximum.',
    'Fichier trop lourd (5 Mo max).': 'File too large (5 MB max).',
    'Choisis une seule activité pour un document.': 'Choose a single activity for a document.',
    'Propose les tâches à partir de ce document.': 'Suggest tasks from this document.',
    '« {removed} » disparaîtra avec ses pôles, secteurs, tâches et objectifs : seuls ses enregistrements de temps seront ajoutés à « {kept} », sans pôle. « {kept} » garde tout le reste, son nom et sa couleur.': '"{removed}" will disappear with its poles, sectors, tasks and goals: only its time entries will be added to "{kept}", without a pole. "{kept}" keeps everything else, its name and its colour.',
    'Choisis deux activités différentes.': 'Pick two different activities.',
    'Tu ne fais pas partie de ces deux activités.': 'You are not part of both of these activities.',
    "Ces deux activités sont partagées avec d'autres personnes. Il faut qu'au moins une des deux soit personnelle pour pouvoir les fusionner.": 'Both of these activities are shared with other people. At least one of the two must be personal for them to be merged.',
    'Arrête le chrono en cours avant de fusionner ces activités.': 'Stop the running timer before merging these activities.',
    // ---- Suppression d'une activité (2 septembre 2026) ----
    'Supprimer « {activity} » ?': 'Delete "{activity}"?',
    "Elle disparaîtra de ton Chrono et de ta liste d'activités. Les autres personnes qui la partagent avec toi ne sont pas concernées. Conserver : tes heures restent comptées dans tes statistiques. Supprimer : tes enregistrements sont effacés définitivement.": 'It will disappear from your Timer and from your activity list. The other people sharing it with you are not affected. Keep: your hours stay counted in your statistics. Delete: your sessions are permanently erased.',
    'Conserver les anciens enregistrements': 'Keep the past sessions',
    'Supprimer les anciens enregistrements': 'Delete the past sessions',
    'Membres · ': 'Members · ',
    ' (toi)': ' (you)',
    'Chrono en cours sur cette activité': 'Timer running on this activity',
    'Aucun membre trouvé.': 'No member found.',
    'Se désabonner': 'Unfollow',
    'Demande envoyée': 'Request sent',
    'Annuler la demande': 'Cancel the request',
    'Suivre': 'Follow',
    // 10 septembre 2026 : phrase unique du panneau de l'avion en papier,
    // affichée seulement quand il n'y a NI invitation NI demande de suivi.
    // Les deux clés par liste ('Aucune demande en attente.',
    // 'Aucune invitation en attente.') et les deux titres de section retirés
    // ('Invitations reçues', 'Demandes de suivi reçues') sont VOLONTAIREMENT
    // conservés : un onglet PWA resté ouvert sur l'ancien code peut encore
    // les afficher. Une clé orpheline ne coûte rien, une clé manquante
    // affiche du français à un anglophone.
    'Aucune invitation ni demande de suivi.': 'No invitation or follow request.',
    ' souhaite te suivre.': ' wants to follow you.',
    'Accepter': 'Accept',
    'Bloquer': 'Block',
    'Débloquer': 'Unblock',
    'Bloqués': 'Blocked',
    'Aucun utilisateur bloqué.': 'No blocked users.',
    'Refuser': 'Decline',
    'Membre': 'Member',
    'Abonnement': 'Following',

    // ---- Abonnés & Abonnements (Réglages, 30 août 2026) ----
    'Abonnés & Abonnements': 'Followers & Following',
    // Variante "et" au lieu de "&" : title/aria-label de #profileFollowsBtn
    // (icône Profil), jamais alignée avec le libellé ci-dessus — trouvée et
    // comblée le 10 septembre 2026 (audit des traductions manquantes).
    'Abonnés et abonnements': 'Followers & Following',
    'Abonnés': 'Followers',
    'Abonnements': 'Following',
    "Personne ne te suit pour l'instant.": 'No one follows you yet.',
    "Tu ne suis personne pour l'instant.": "You aren't following anyone yet.",

    // ---- Fil de discussion d'une activité partagée (Communauté > Membres,
    // et sa réutilisation dans la zone Discussion > Membres du Profil) ----
    "Aucun message pour l'instant — écris le premier ci-dessous.": 'No message yet — write the first one below.',
    // Variante « ci-dessus » : depuis le 3 septembre 2026, la liste des
    // messages du Profil est SOUS la zone d'écriture, pas au-dessus.
    "Aucun message pour l'instant — écris le premier ci-dessus.": 'No message yet — write the first one above.',
    'Envoyer': 'Send',
    // ---- Fil "Communauté" de la zone Discussion du Profil (31 août 2026) ----
    'Écrire...': 'Write...',
    // 'Publier' : titre ajouté au-dessus des DEUX composeurs jumeaux le
    // 3 septembre 2026 (#profileDiscussionBlock côté Profil,
    // #communityMyPostsBlock côté Communauté) — une seule entrée suffit, les
    // deux blocs affichent exactement le même mot.
    'Publier': 'Post',
    // Export de mes données personnelles (7 septembre 2026, candidate n°1 de
    // l'audit des sections manquantes du panneau Réglages).
    'Exporter mes données': 'Export my data',
    'Télécharger mes données': 'Download my data',
    "Conditions d'utilisation": 'Terms of use',
    "Lire les conditions d'utilisation": 'Read the terms of use',
    // Case à cocher obligatoire à la création de compte (11 septembre 2026,
    // demande directe d'Emilien, remplace l'ancien lien seul juste au-dessus
    // — "Lire les conditions d'utilisation avant de créer ton profil" — qui
    // n'imposait aucun consentement formel). Le texte de la case est réparti
    // sur plusieurs nœuds de texte distincts (avant/dans/entre/après les deux
    // liens #onbLegalTermsLink et #onbPrivacyPolicyLink) : translateStaticDom()
    // traduit nœud par nœud, donc chaque fragment a besoin de sa propre clé —
    // voir public/index.html. Mise à jour du 11 septembre 2026 (nuit, suite) :
    // la case couvre désormais aussi la politique de confidentialité, d'où
    // les clés "et la" et "politique de confidentialité" (minuscule, distincte
    // de la clé "Politique de confidentialité" déjà utilisée ailleurs comme
    // titre) ajoutées pour le nœud de texte intermédiaire et le second lien.
    "J'ai lu et j'accepte les": 'I have read and accept the',
    "conditions d'utilisation": 'terms of use',
    "et la": 'and the',
    "politique de confidentialité": 'privacy policy',
    "Tu dois accepter les conditions d'utilisation et la politique de confidentialité avant de créer ton profil.": 'You must accept the terms of use and the privacy policy before creating your profile.',
    // Documents légaux (10 septembre 2026, demande directe d'Emilien) :
    // sous-section déroulante regroupant politique de confidentialité,
    // mentions légales et conditions d'utilisation (auparavant seule, à part).
    'Documents légaux': 'Legal documents',
    "Comment Noèsis TimeTracker fonctionne, ce qu'il fait de tes renseignements, et les règles d'utilisation du service.": 'How Noèsis TimeTracker works, what it does with your information, and the rules for using the service.',
    'Lire la politique de confidentialité': 'Read the privacy policy',
    'Politique de confidentialité': 'Privacy policy',
    'Lire les mentions légales': 'Read the legal notices',
    'Mentions légales': 'Legal notices',
    // Aide et suggestions (8 septembre 2026, demande d'Emilien) : un seul
    // champ de texte libre envoyé par courriel, sans FAQ (voir app.js).
    'Aide et suggestions': 'Help & suggestions',
    'Suggestion': 'Suggestion',
    'Signaler un bug': 'Report a bug',
    'Signaler': 'Report',
    'Signaler ce message': 'Report this message',
    "Plus d'actions": 'More actions',
    'Harcèlement ou propos abusifs': 'Harassment or abusive remarks',
    'Pourriel ou publicité': 'Spam or advertising',
    'Contenu inapproprié': 'Inappropriate content',
    'Précision (facultatif)': 'Details (optional)',
    'Merci, le message est signalé et masqué pour toi.': 'Thanks, the message has been reported and hidden for you.',
    'Motif invalide.': 'Invalid reason.',
    'Trop de signalements en peu de temps. Réessaie plus tard.': 'Too many reports in a short time. Try again later.',
    'Tu as déjà signalé ce message.': 'You have already reported this message.',
    'Tu ne peux pas signaler ton propre message.': 'You cannot report your own message.',
    "Ce message contient un terme non autorisé dans la Communauté. Reformule-le pour l'envoyer.": 'This message contains a term that is not allowed in the Community. Rephrase it to send it.',
    'Ton message...': 'Your message...',
    "N'écris pas de mot de passe, de NIP, de numéro de carte ni d'autre renseignement sensible dans ce message ou dans une pièce jointe.": 'Do not write a password, PIN, card number or any other sensitive information in this message or in an attachment.',
    'Utilisation commerciale de mes données': 'Commercial use of my data',
    "Être trouvable dans la recherche de l'écran de connexion": 'Be findable in the sign-in screen search',
    'Joindre une photo ou un document': 'Attach a photo or document',
    'Message envoyé. Merci !': 'Message sent. Thank you!',
    // 'Écrire aux membres' : placeholder du composeur de Communauté
    // (#communityMyPostsInput), 3 septembre 2026, demande d'Emilien.
    'Écrire aux membres': 'Write to members',
    // Variante avec points de suspension : c'est en réalité le texte
    // exactement présent dans les 3 placeholders HTML actuels
    // (#communityMyPostsInput, #communityDiscussionInput,
    // #profileDiscussionCommunityInput) — la clé ci-dessus sans "..." ne
    // correspondait donc plus à rien depuis un ajout de ponctuation ultérieur
    // (comparaison stricte de translateStaticDom). Trouvée et comblée le
    // 10 septembre 2026 (signalé par Emilien — texte non traduit en anglais
    // dans le composeur "Écrire aux membres"), clé précédente gardée.
    'Écrire aux membres...': 'Write to members...',
    // 'Écrire dans ce sous-projet...' (#subProjectMessageInput, territoire
    // Sous-projets) : même défaut, jamais traduit du tout — ajoutée en
    // passant le 10 septembre 2026 pour ne pas laisser l'anglais afficher du
    // français, sans autre changement au fichier de Sous-projets.
    // ⚠️ Débordement signalé (Communauté, 3 septembre 2026) : "Écrire au
    // membre..." (#profileDiscussionCommunityInput, posé par Profil le même
    // jour) n'avait pas sa traduction non plus — ajoutée ici en passant pour
    // ne pas laisser l'anglais afficher du français, sans autre changement
    // au fichier de Profil.
    'Écrire au membre...': 'Write to member...',
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
    'Déconnexion': 'Log out',
    // ---- Titres des groupes fusionnés du panneau Réglages (9 septembre
    // 2026, réorganisation demandée par Emilien — voir
    // noesis-timetracker-parametres.md). Les titres des sous-sections
    // qu'ils contiennent (Identité, Sécurité, Apparence, Langue, etc.)
    // gardent leurs entrées existantes plus bas, inchangées.
    // « Préférences d'affichage » renommé « Affichage » le 9 septembre 2026
    // à la demande d'Emilien. ----
    'Compte et sécurité': 'Account & security',
    'Affichage': 'Display',
    'Calendrier et export de données': 'Calendar & data export',
    'Calendrier et export': 'Calendar & export',
    'Identité': 'Identity',
    'Enregistrer': 'Save',
    'Nouveau': 'New',
    'Objectif de l’année': 'Year goal',
    'Êtes-vous sûr de vouloir supprimer le secteur ? Ses objectifs sont supprimés à partir de la période en cours (les périodes passées sont conservées) et ses tâches ouvertes passent aux autres secteurs.': 'Delete this sector? Its goals are removed from the current period onward (past periods are kept) and its open tasks move to the other sectors.',
    'Noèsis propose où placer les tâches de ce secteur — valide ou change.': 'Noèsis suggests where to place this sector’s tasks — confirm or change.',
    'Choisis où placer les tâches de ce secteur.': 'Choose where to place this sector’s tasks.',
    '{n} tâche': '{n} task',
    '{n} tâches': '{n} tasks',
    'Ce secteur contient {tasks}. Que faire de ces tâches ?': 'This sector contains {tasks}. What should happen to them?',
    'Le secteur et ses {tasks} seront supprimés définitivement. Cette action est irréversible.': 'The sector and its {tasks} will be permanently deleted. This cannot be undone.',
    'Choisis le secteur qui recevra les {tasks}.': 'Choose the sector that will receive the {tasks}.',
    'Aucun autre secteur disponible.': 'No other sector available.',
    'Déplacer': 'Move',
    'Responsable': 'Assignee',
    'Apparence': 'Appearance',
    // Option Contact (7 septembre 2026, demande d'Emilien : autoriser ses
    // abonnés à contacter par email/téléphone) : gap de traduction trouvé et
    // comblé le 10 septembre 2026 (signalé par Emilien — « certains
    // paramètres ne sont pas traduits »), aucune entrée n'existait avant.
    'Autoriser mes abonnés à me contacter par email': 'Allow my followers to contact me by email',
    'Autoriser mes abonnés à me contacter par téléphone': 'Allow my followers to contact me by phone',
    'Sécurité': 'Security',
    'Code actuel': 'Current PIN',
    'Nouveau code (4 à 6 chiffres)': 'New PIN (4 to 6 digits)',
    'Confirme le nouveau code': 'Confirm the new PIN',
    'Changer mon code': 'Change my PIN',

    // ---- Doublons d'import (30 août 2026, rétabli le 1er septembre) ----
    'Format non supporté — choisis une image PNG, JPEG ou WebP.': 'Unsupported format — choose a PNG, JPEG or WebP image.',
    'Image trop lourde (8 Mo max) — choisis-en une autre.': 'Image too large (8 MB max) — choose another one.',
    'Traitement de la photo...': 'Processing the photo...',
    'Photo mise à jour.': 'Photo updated.',
    'Impossible de mettre à jour la photo.': 'Could not update the photo.',
    'Retirer la photo de profil ?': 'Remove the profile picture?',
    'Photo retirée.': 'Photo removed.',
    'Profil mis à jour.': 'Profile updated.',
    'Le nouveau code doit comporter 4 à 6 chiffres.': 'The new PIN must have 4 to 6 digits.',
    'Code mis à jour.': 'PIN updated.',
    'Se déconnecter de ce profil sur cet appareil ?': 'Log out of this profile on this device?',
    'Glisse pour réordonner, touche le nom ou la couleur pour les modifier.': 'Drag to reorder, tap the name or the colour to change them.',
    'Déplacer cette activité': 'Move this activity',
    'Déplacer ce projet': 'Move this project',
    'Changer la couleur': 'Change the colour',
    'Supprimer cette activité': 'Delete this activity',
    'Partager': 'Share',
    'Séparer': 'Split off',
    'Supprimer définitivement': 'Delete permanently',

    // ---- Phrases à emplacement variable ({nom} remplacé à l'affichage) ----
    'Code de {name}': 'PIN for {name}',
    'Définis un code pour {name}': 'Set a PIN for {name}',
    'Durée : {duration}': 'Duration: {duration}',
    'Confirmer le désabonnement ?': 'Confirm unfollow?',
    'Bloqué': 'Blocked',
    'Bloquer {name} ? Cette personne sera retirée de tes abonnés et ne pourra plus te suivre tant que tu ne l\'auras pas débloquée.': 'Block {name}? This person will be removed from your followers and won\'t be able to follow you again until you unblock them.',
    '{name} souhaite te suivre.': '{name} wants to follow you.',
    'Membres · {name}': 'Members · {name}',
    // Actions sous la liste des membres (Activité solo, 5 septembre 2026).
    'Ajouter un membre': 'Add a member',
    'Quitter la communauté': 'Leave the community',
    'Quitter "{activity}" ? Tu gardes ta propre activité personnelle du même nom, avec tout ton historique déjà enregistré. Les autres membres ne sont pas concernés.':
      'Leave "{activity}"? You keep your own personal activity with the same name and all your recorded history. The other members are not affected.',
    'Partagée par {owner}': 'Shared by {owner}',
    '{count} membres': '{count} members',
    // ---- Ajout de membre par recherche + exclusion par le propriétaire
    // (10 septembre 2026, demande d'Emilien — texte du champ et confirmation
    // revus au second passage : recherche seule à l'écran, une suggestion
    // cliquée ouvre directement Valider/Annuler) ----
    'Voulez-vous inviter {name} à rejoindre cette activité ?': 'Do you want to invite {name} to join this activity?',
    'Exclure': 'Exclude',
    'Exclure {name} de "{activity}" ? Cette personne gardera son historique déjà enregistré, dans sa propre activité personnelle. Elle ne fait plus partie de "{activity}" ensuite.':
      'Exclude {name} from "{activity}"? This person will keep their already recorded history, in their own personal activity. They will no longer be part of "{activity}" afterwards.',
    '{from} t\'invite sur « {activity} ».': '{from} invites you to "{activity}".',
    'Fusionner avec une de tes activités existantes ?': 'Merge with one of your existing activities?',
    'Non, nouvelle activité': 'No, new activity',
    'Fusionner ton activité « {mine} » avec « {activity} » ? Ton historique déjà enregistré sur « {mine} » sera transféré dessus, et « {mine} » disparaîtra en tant qu\'activité séparée.': 'Merge your activity "{mine}" with "{activity}"? The history already recorded on "{mine}" will be transferred to it, and "{mine}" will disappear as a separate activity.',

    // ---- Langue (nouveau) ----
    'Langue': 'Language',
    'Français': 'French',
    'Anglais': 'English',
    'Langue mise à jour.': 'Language updated.',

    // ---- Partage (30 août 2026, rétabli le 1er septembre après une
    // réécriture du dictionnaire qui l'avait fait disparaître ; revu le
    // 11 septembre 2026 — adresse détectée automatiquement, QR code, plus
    // aucune saisie manuelle : les anciennes entrées de saisie/enregistrement
    // d'adresse retirées avec elles) ----
    'Partage': 'Sharing',
    "Partager l'app": 'Share the app',
    'Partager mon profil': 'Share my profile',
    'Adresse locale : ce lien et ce QR code ne fonctionneront que depuis ton réseau.': 'Local address: this link and this QR code will only work from your own network.',
    'Partagé.': 'Shared.',
    'Copié — tu peux le coller où tu veux.': 'Copied — paste it wherever you like.',
    'Impossible de copier automatiquement — sélectionne le texte à la main.': 'Could not copy automatically — select the text by hand.',
    'Noèsis — le TimeTracker partagé. Rejoins-nous ici : {url}': 'Noèsis — the shared TimeTracker. Join us here: {url}',
    "Le serveur n'a pas pris en compte le changement de langue : il tourne encore sur la version d'avant la mise à jour. Arrête-le (Ctrl+C) et relance `npm start`, puis réessaie.": 'The server did not apply the language change: it is still running the version from before the update. Stop it (Ctrl+C), start it again with `npm start`, then try once more.',

    // ---- Notifications push (1er septembre 2026, volet Communauté ; refonte
    // du 10 septembre 2026, demande d'Emilien : bascule "Communauté" + une
    // bascule par activité, plus de bouton "Activer"/"Envoyer un test") ----
    // Les textes des notifications elles-mêmes ne sont PAS ici : ils sont
    // construits côté serveur, déjà traduits (server/lib/push.js), parce que
    // le service worker qui les affiche n'a accès ni à ce fichier ni à la
    // langue du profil. Ci-dessous, uniquement l'interface de Réglages.
    'Notifications': 'Notifications',
    'Cet appareil ne gère pas les notifications.': 'This device does not support notifications.',
    "Les notifications ne sont pas configurées sur ce serveur.": 'Notifications are not configured on this server.',
    "Les notifications sont bloquées pour ce site dans les réglages de ton navigateur.": 'Notifications are blocked for this site in your browser settings.',
    "Impossible d'activer les notifications.": 'Could not turn on notifications.',
    "Abonnement aux notifications invalide.": 'Invalid notification subscription.',
    "Cet appareil n'est pas abonné avec ton profil.": 'This device is not subscribed with your profile.',

    // ---- Suppression de compte (nouveau) ----
    'Supprimer mon compte': 'Delete my account',
    'Cette action est définitive : ton profil, ton historique, tes notes, tes invitations et tes abonnements sont supprimés. Les activités que tu partages avec d\'autres personnes continuent d\'exister pour elles.': 'This cannot be undone: your profile, history, notes, invitations and follows are deleted. Activities you share with other people keep existing for them.',
    'Saisis ton code pour confirmer': 'Enter your PIN to confirm',
    'Supprimer définitivement mon compte': 'Permanently delete my account',
    'Supprimer définitivement ton compte ? Cette action est irréversible.': 'Permanently delete your account? This cannot be undone.',
    'Dernière confirmation : tout ton historique et tes notes seront perdus. Continuer ?': 'Last confirmation: all your history and notes will be lost. Continue?',
    'Compte supprimé.': 'Account deleted.',
    'Saisis ton code pour confirmer la suppression.': 'Enter your PIN to confirm the deletion.',
    // Étiquette d'auteur affichée à la place d'un nom absent (9 septembre
    // 2026, sur-effacement corrigé) : un message de sous-projet ou un
    // sondage 'profile' dont l'auteur a supprimé son compte. Distincte de
    // 'Compte supprimé.' ci-dessus (message de confirmation, avec point) :
    // celle-ci est une étiquette, jamais une phrase.
    'Compte supprimé': 'Deleted account',

    // ---- Barre d'onglets ----
    'Chrono': 'Timer',
    'Stats': 'Stats',
    'Statistiques': 'Statistics',
    // 'Activité' (singulier) : libellé de l'onglet du bas + aria-label du
    // bouton (data-tab="activity") — distinct de 'Activités' (pluriel, titre
    // de section, déjà traduit plus haut). N'avait jamais eu sa propre
    // entrée alors que 'Chrono'/'Stats'/'Communauté' juste à côté l'ont
    // toutes — trouvé et comblé le 10 septembre 2026 (signalé par Emilien —
    // « le titre du volet de activité n'est pas non plus traduit »).
    'Activité': 'Activity',
    'Profil': 'Profile',

    // ---- Messages renvoyés par le serveur (texte fixe) ----
    'Erreur serveur': 'Server error',
    'Connexion impossible. Réessaie.': 'Connection failed. Try again.',
    'userId requis.': 'userId is required.',
    'userId et activityId requis.': 'userId and activityId are required.',
    'Profil introuvable.': 'Profile not found.',
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
    'Code incorrect.': 'Wrong PIN.',
    'Code actuel incorrect.': 'Wrong current PIN.',
    'Non authentifié. Reconnecte-toi.': 'Not signed in. Please sign in again.',

    // ---- Sécurité (Réglages) : déconnexion de tous les appareils (7 septembre 2026) ----
    'Se déconnecter de tous les appareils': 'Sign out of all devices',
    'Se déconnecter de TOUS les appareils, y compris celui-ci ? Chacun redemandera ton code à la prochaine ouverture.': 'Sign out of ALL devices, including this one? Each one will ask for your PIN again next time it opens.',
    'weekOffset invalide.': 'Invalid weekOffset.',
    'Champ "csv" manquant.': 'Missing "csv" field.',
    'Fichier CSV vide ou illisible.': 'Empty or unreadable CSV file.',
    "Colonnes attendues introuvables (Date ISO / Activité / Durée (h)). Vérifie que le CSV vient bien de l'onglet Historique.": 'Expected columns not found (Date ISO / Activité / Durée (h)). Check that the CSV really comes from the "Historique" tab.',
    'Langue invalide.': 'Invalid language.',

    // ---- Profil : section "Projets" (1er septembre 2026) ----
    'Projets': 'Projects',
    'Ajouter un projet': 'Add a project',
    'Nouveau projet': 'New project',
    'Nom du projet': 'Project name',
    'Recherche (optionnel)': 'Looking for (optional)',
    'Lien externe (optionnel)': 'External link (optional)',
    'Date de début (optionnel)': 'Start date (optional)',
    'Catégorie / secteur (optionnel)': 'Category / field (optional)',
    'Ajouter le projet': 'Add project',
    "Aucun projet ajouté pour l'instant.": 'No project added yet.',
    "Aucun projet partagé pour l'instant.": 'No projects shared yet.',
    'Suis ce profil pour voir ses projets.': 'Follow this profile to see its projects.',
    'Suis ce profil pour voir ses statistiques.': 'Follow this profile to see its statistics.',
    'Tu dois suivre ce profil pour voir ses projets.': 'You need to follow this profile to see its projects.',
    'Tu dois suivre ce profil pour voir ses statistiques.': 'You need to follow this profile to see its statistics.',
    'Aucun détail supplémentaire pour ce projet.': 'No further details for this project.',
    'Le nom du projet est requis.': 'The project name is required.',
    'Supprimer ce projet ?': 'Delete this project?',
    // 'Monter'/'Descendre' retirées le 26 septembre 2026 : elles ne servaient
    // qu'aux boutons ▲▼ de réordonnancement des projets, remplacés par le
    // glisser-déposer à la poignée (voir bindProjectDrag, app.js).
    'Partenaires': 'Partners',
    'Clients': 'Clients',
    'Financement': 'Funding',
    'Description': 'Description',
    'Lien': 'Link',
    'Début': 'Started',
    'Catégorie': 'Category',
    "Tu dois suivre ce profil pour voir ses projets.": 'You need to follow this profile to see its projects.',
    "Ce n'est pas ton projet.": 'This is not your project.',
    'Projet introuvable.': 'Project not found.',

    // ---- Découverte de membres + page de visite d'un profil (2 septembre
    // 2026) — voir GET /api/users/search (server/routes/follows.js) et les
    // routes /profile/:id/public|stats|posts (server/routes/profile.js).
    // L'ancienne clé "Tu dois suivre ce profil pour voir ses projets."
    // ci-dessus est conservée volontairement : le serveur ne l'envoie plus
    // (les projets sont devenus un aperçu public) mais un onglet PWA resté
    // ouvert avec l'ancien code peut encore l'afficher.
    'Pseudo, projet, secteur': 'Nickname, project, sector',
    '{n} projet(s)': '{n} project(s)',
    'Quelques profils à découvrir.': 'A few profiles to discover.',
    'Aucun projet': 'No project',
    "Rien d'enregistré pour l'instant.": 'Nothing recorded yet.',
    'Connecte-toi pour voir ce profil.': 'Sign in to view this profile.',
    'Tu dois suivre ce profil pour voir ses messages.': 'You need to follow this profile to see its messages.',
    'Choisir la période': 'Choose the period',
    "Choisir l'année": 'Choose the year',

    // ---- Profil : Projets, formulaire en paliers + catégories fermées
    // (2 septembre 2026, chantier "Simplification du formulaire de saisie
    // Projets") ----
    'Ajouter des détails': 'Add details',
    'voir plus': 'see more',
    'Commerce & e-commerce': 'Retail & e-commerce',
    'Mode & habillement': 'Fashion & apparel',
    'Finance & investissement': 'Finance & investment',
    'Technologie & logiciel': 'Technology & software',
    'Services professionnels & conseil': 'Professional services & consulting',
    'Alimentation & restauration': 'Food & restaurants',
    'Santé & bien-être': 'Health & wellness',
    'Éducation & formation': 'Education & training',
    'Immobilier': 'Real estate',
    'Marketing & création de contenu': 'Marketing & content creation',
    'Artisanat & fabrication': 'Crafts & manufacturing',
    'Autre': 'Other',

    // ---- Sous-projets d'une activité (discussion "Sous-projets", 3 septembre 2026) ----
    // ---- Page d'une activité (discussion "Activité — général", 3 septembre 2026) ----
    'Discussion': 'Discussion',
    // Période "Aujourd'hui", ajoutée au menu "⋮" de la Répartition d'une
    // activité le 3 septembre 2026. Le libellé renvoyé par periodRange est
    // "Aujourd'hui" lui aussi : une seule entrée couvre le bouton ET le
    // libellé affiché à côté du titre de section.
    "Aujourd'hui": 'Today',
    // Titre de la section Statistiques d'une activité : jamais traduit
    // jusqu'ici, alors qu'il s'affiche pour tout compte en anglais.
    'Statistiques et activités des membres': 'Member statistics and activity',
    // 'Sous-projets' retiré le 16 septembre 2026 (discussion Objectifs — C) :
    // c'était la seule traduction de ce texte, remplacé par "Tâches" sur le
    // bouton de la fenêtre activité (clé 'Tâches' déjà présente plus bas).
    'Tâches': 'Tasks',
    'Aucune tâche — ajoute la première ci-dessous.': 'No task yet — add the first one below.',
    'Ajouter une tâche...': 'Add a task...',
    'aucune tâche': 'no task',
    'Supprimer cette tâche': 'Delete this task',
    'Supprimer cette tâche ?': 'Delete this task?',
    'Supprimer la tâche': 'Delete the task',
    "Écris une tâche avant d'ajouter.": 'Write a task before adding it.',
    'Cette tâche existe déjà dans': 'This task already exists in',
    'Ajouter quand même ?': 'Add anyway?',
    'Ajouter quand même': 'Add anyway',
    'Pôle et secteur non trouvés — où placer cette tâche ?': 'Pole and sector not found — where should this task go?',
    'Sélection du pôle & secteur': 'Select pole & sector',
    'Autre…': 'Other…',
    // Messages d'erreur renvoyés par server/routes/subprojects.js
    'Sous-projet introuvable.': 'Sub-project not found.',
    'Intitulé de la tâche requis.': 'Task label required.',
    'Tâche introuvable.': 'Task not found.',
    'Tâche verrouillée : terminée depuis plus de 7 jours.': 'Task locked: completed more than 7 days ago.',

    // ---- Sondages (3 septembre 2026, 11ᵉ discussion "Sondages") ----
    // Textes statiques d'index.html (traduits par translateStaticDom), textes
    // dynamiques d'app.js (passés par t()), et messages d'erreur renvoyés par
    // server/routes/polls.js et server/lib/polls.js — français côté serveur
    // comme partout ailleurs dans le projet, traduits à l'affichage.
    'Sondages': 'Polls',
    'Créer un sondage': 'Create a poll',
    'Ta question...': 'Your question...',
    '+ Ajouter une réponse': '+ Add an answer',
    'Ajouter une réponse': 'Add an answer',
    // Bouton qui déplie le choix multiple et la date de clôture (3 septembre
    // 2026). Singulier en français, voulu tel quel par Emilien (« un bouton
    // option à droite de "+ajouter une réponse" ») ; pluriel en anglais, où
    // "Options" est la forme usuelle pour ce genre de bouton.
    'Option': 'Options',
    'Plusieurs réponses possibles': 'Multiple answers allowed',
    // Vote anonyme (3 septembre 2026). Sert deux fois : le libellé de la case
    // dans le panneau "Option", et l'étiquette portée par la carte du sondage.
    'Vote anonyme': 'Anonymous vote',
    'Clôture (facultatif)': 'Closing date (optional)',
    // Les deux versions de l'avertissement, échangées par syncPrivacyHint
    // selon la case "Vote anonyme".
    "Le vote n'est pas anonyme : le nom des votants est visible une fois qu'on a voté. Personne ne voit les résultats avant d'avoir voté.":
      'Voting is not anonymous: voter names are visible once you have voted. Nobody sees the results before voting.',
    "Vote anonyme : personne ne voit qui a voté quoi, pas même toi. Personne ne voit les résultats avant d'avoir voté.":
      'Anonymous vote: nobody sees who voted for what, not even you. Nobody sees the results before voting.',
    // Anciennement "Créer le sondage" — renommé par Emilien le 3 septembre
    // 2026, sur un bouton qui prend désormais toute la largeur.
    'Terminer': 'Done',
    "Aucun sondage pour l'instant.": 'No polls yet.',
    'Réponse': 'Answer',
    'Retirer cette réponse': 'Remove this answer',
    'Écris une question.': 'Write a question.',
    'Voter': 'Vote',
    'Choisis une réponse.': 'Choose an answer.',
    'Vote pour voir les résultats.': 'Vote to see the results.',
    'Ton vote est définitif et ne pourra plus être modifié.': 'Your vote is final and cannot be changed afterwards.',
    'Confirmer ce vote ?': 'Confirm this vote?',
    '1 personne a voté': '1 person voted',
    'personnes ont voté': 'people voted',
    'Clos': 'Closed',
    "Ouvert jusqu'au": 'Open until',
    // Libellé du bouton encadré de clôture (3 septembre 2026) — l'ancien
    // pictogramme "⏹" ne disait pas ce qu'il faisait. Le title de survol
    // reste 'Clore ce sondage', plus explicite au survol.
    'Finir': 'Finish',
    'Clore ce sondage': 'Close this poll',
    'Clore ce sondage ? Plus personne ne pourra voter.': 'Close this poll? Nobody will be able to vote any more.',
    'Supprimer ce sondage': 'Delete this poll',
    'Supprimer ce sondage et tous ses votes ?': 'Delete this poll and all its votes?',
    // Messages renvoyés par le serveur
    'La question est obligatoire.': 'The question is required.',
    'Question trop longue (300 caractères maximum).': 'Question too long (300 characters maximum).',
    'Il faut au moins deux réponses possibles.': 'You need at least two possible answers.',
    'Dix réponses possibles au maximum.': 'Ten possible answers maximum.',
    'Réponse trop longue (120 caractères maximum).': 'Answer too long (120 characters maximum).',
    'Deux réponses possibles sont identiques.': 'Two possible answers are identical.',
    'Date de clôture invalide.': 'Invalid closing date.',
    'La date de clôture doit être dans le futur.': 'The closing date must be in the future.',
    'Sondage introuvable.': 'Poll not found.',
    'Ce sondage est clos.': 'This poll is closed.',
    'Tu as déjà voté à ce sondage.': 'You have already voted in this poll.',
    'Une seule réponse possible pour ce sondage.': 'Only one answer allowed for this poll.',
    'Réponse inconnue pour ce sondage.': 'Unknown answer for this poll.',
    "Seul l'auteur peut clore ce sondage.": 'Only the author can close this poll.',
    "Seul l'auteur peut supprimer ce sondage.": 'Only the author can delete this poll.',
    'Type de sondage inconnu.': 'Unknown poll type.',
    "Accès impossible à vérifier pour l'instant.": 'Access cannot be checked right now.',
    'Tu ne peux pas créer de sondage ici.': 'You cannot create a poll here.',
    "Tu n'as pas accès à ce profil.": 'You do not have access to this profile.',
    'scope et scopeId requis.': 'scope and scopeId are required.',
    'Accès refusé.': 'Access denied.',
    // ---- Sections d'un sous-projet (deuxième passage, 3 septembre 2026) ----
    'sondages': 'polls',
    'discussion': 'discussion',
    'vide': 'empty',
    // Messages d'erreur renvoyés par server/routes/subprojects.js


    // ---- Sous-projets : anneau d'avancement et mode édition (3 sept. 2026) ----
    'Avancement global': 'Overall progress',
    'Avancement quotidien': 'Daily progress',
    ' tâches complétées': ' tasks completed',
    'Journée surchargée': 'Overloaded day',
    'Cible peut-être irréaliste : il faudrait ': 'Target may be unrealistic: you would need ',
    '/sem, tu en fais ': '/wk, you do ',
    'Noèsis propose de recalculer tes objectifs': 'Noèsis suggests recalculating your goals',
    'Cible peut-être irréaliste': 'Target may be unrealistic',
    "Fermer pour aujourd'hui": 'Close for today',
    'ton rythme réel': 'your actual pace',
    '/sem au lieu de ': '/wk instead of ',
    'Nouvelle estimation proposée': 'Suggested new estimate',
    'Tes textes saisis ne changent pas.': 'The text you wrote stays unchanged.',
    'Appliquer': 'Apply',
    'Plus tard': 'Later',
    'Réduire la cible': 'Reduce the target',
    'Étaler sur la période suivante': 'Spread over the next period',
    'Garder tel quel': 'Keep as is',
    'Non réalisées': 'Not done',
    'Jour proposé selon ta capacité et tes plafonds. Rien ne bouge sans ton clic.': 'Day suggested from your capacity and caps. Nothing moves without your click.',
    'en retard de ': 'late by ',
    'date fixée': 'fixed date',
    'période suivante déjà remplie': 'next period already filled',
    'Erreur : la période suivante a déjà son propre objectif. Pour y reporter celui-ci sans l’écraser, modifie ou vide d’abord l’objectif de la période suivante.': 'Error: the next period already has its own goal. To carry this one over without overwriting it, first edit or clear the next period’s goal.',
    'Reporter': 'Carry over',
    'Tout reporter': 'Carry over all',
    'importance': 'importance',
    'haute': 'high',
    'normale': 'normal',
    'basse': 'low',
    'Charge du jour : ': "Today's load: ",
    ' pour une capacité moyenne de ': ' for an average capacity of ',
    ". Nouveau plan proposé (rien n'est modifié sans ta validation).": '. New plan proposed (nothing changes without your approval).',
    'Objectif hebdo': 'Weekly goal',
    'Objectif de période': 'Period goal',
    'Valider': 'Approve',
    '… et ': '… and ',
    ' autres tâches déplacées': ' more tasks moved',
    'Ignorer': 'Dismiss',
    'Objectifs hebdomadaires proposés': 'Suggested weekly objectives',
    'Modifie ou vide une ligne, puis valide. Rien n’est enregistré avant ta validation.': 'Edit or clear a line, then confirm. Nothing is saved until you confirm.',
    'Nouvelle tâche': 'New task',
    'Glisse pour réordonner, touche le nom pour le modifier.': 'Drag to reorder, tap the name to change it.',
    'Supprimer « ': 'Delete “',
    ' » ?': '”?',

    // ----- Chrono → sous-projets (4 septembre 2026) -----
    // Rattachement optionnel d'une session à un sous-projet de son activité.
    'Sous-projet': 'Sub-project',
    'clôturé': 'closed',
    // Activité solo, 5 septembre 2026. 'Sans sous-projet' était déjà
    // employée par la fenêtre de détail par sous-projet sans avoir jamais été
    // traduite : lacune corrigée au passage (débordement d'une ligne signalé).
    'Sans sous-projet': 'No sub-project',
    // Messages renvoyés par le serveur (server/lib/entrysubproject.js).

    // ---- Date de clôture sur la ligne d'un sous-projet (4 septembre 2026) ----
    'Clôture': 'Closing date',

    // ---- Flux calendrier des échéances (4 septembre 2026) ----
    'Calendrier': 'Calendar',
    'Créer mon lien de calendrier': 'Create my calendar link',
    "Copier l'adresse": 'Copy the address',
    'Régénérer': 'Regenerate',
    'Désactiver': 'Turn off',
    'Création du lien...': 'Creating the link...',
    'Lien créé. Colle-le dans ton calendrier comme un abonnement.': 'Link created. Paste it into your calendar as a subscription.',
    'Copié — colle-le dans ton calendrier.': 'Copied — paste it into your calendar.',
    "Régénérer l'adresse ? L'ancienne cessera immédiatement de fonctionner, et tu devras refaire l'abonnement sur chaque appareil.": 'Regenerate the address? The old one stops working immediately, and you will have to set up the subscription again on every device.',
    'Désactiver le calendrier ? L\'adresse cesse de fonctionner et les échéances disparaîtront de ton agenda.': 'Turn the calendar off? The address stops working and the deadlines will disappear from your calendar.',
    'Calendrier désactivé.': 'Calendar turned off.',
    'Jamais relu par un calendrier pour le moment.': 'No calendar has read it yet.',
    'Dernière lecture par un calendrier : ': 'Last read by a calendar: ',
    'Ajouter à Apple Calendar': 'Add to Apple Calendar',
    'Ajouter à Google Agenda': 'Add to Google Calendar',

    // ----- Détail par sous-projet dans les statistiques (4 septembre 2026) -----
    // Chantier « Chrono — sous-projets », second passage.
    'Mon temps': 'My time',
    // ⚠️ 6 septembre 2026 : 'Sans sous-projet' était déclarée DEUX fois —
    // ici depuis le 4 septembre, et plus haut dans le bloc « sous-projets »
    // depuis le 5 (Activité solo), chacune sans voir l'autre. En JavaScript
    // c'est la DERNIÈRE qui gagne : la traduction réellement affichée était
    // celle-ci. On garde celle d'en haut, mieux placée avec le reste du
    // vocabulaire des sous-projets ; l'anglais passe donc de « No
    // sub-project attached » à « No sub-project ». Signalé à Activité solo.
    // ----- Filtre par sous-projet, section Statistiques d'une activité
    //       (4 septembre 2026, troisième passage) -----
    // Décalage de version entre index.html et app.js (6 septembre 2026).
    "L'application vient d'être mise à jour. Recharge la page.":
      'The app was just updated. Please reload the page.',
    'Chargement...': 'Loading...',
    // Message renvoyé par server/routes/subprojectstats.js
    // ('Activité invalide.' est déjà traduite plus haut — pas de doublon).
    'Période invalide.': 'Invalid period.',
    "Cette personne n'est pas membre de cette activité.": 'This person is not a member of this activity.',

    // ---- Entrées remises après une perte (7 septembre 2026) ----
    // ⚠️ Deuxième fois en quatre jours : des entrées de ce dictionnaire
    // disparaissent quand le fichier est réécrit depuis une copie périmée.
    // Celles-ci sont toutes encore employées littéralement par app.js ou
    // index.html d'aujourd'hui — leur absence ne se voit pas en français
    // (t(x) renvoie x quand la clé manque), seulement en anglais. Remises ici
    // sans leurs commentaires d'origine ; chaque discussion concernée peut
    // les replacer dans sa section. Signalé à Emilien.
    'Publications': 'Posts',
    'Aucune publication pour l\'instant.': 'No post yet.',
    'Suis ce profil pour voir ses publications.': 'Follow this profile to see its posts.',
    'Chrono en cours': 'Timer running',
    'Chronomètre': 'Stopwatch',
    'Temps écoulé': 'Elapsed time',
    'Graphique du temps par jour': 'Chart of time per day',
    'Autoriser une autre réponse': 'Allow another answer',
    'Réponse libre autorisée': 'Free answer allowed',
    'Ta réponse...': 'Your answer...',
    'Écris ta réponse.': 'Write your answer.',
    'Annuler la création du sondage': 'Cancel poll creation',
    'Annuler la création': 'Cancel',
    ' sous-projet clôturé': ' closed sub-project',
    ' sous-projets clôturés': ' closed sub-projects',

    // ---- Objectifs (planning annuel) — Chantier 1, 12 septembre 2026 ----
    // 'Semaine' et 'Année' existent déjà plus haut (Statistiques) et sont
    // réutilisées telles quelles : DICT est un dictionnaire à plat, une
    // même clé française sert partout où le texte est identique.
    'Objectifs': 'Goals',
    // 29 septembre 2026 : libellé visible sous l'icône Objectifs de la barre des volets.
    'Feuille de route': 'Roadmap',
    // Ajoutée le 13 septembre 2026 : Objectifs devient un volet à part
    // entière (voir #tab-goals) — état vide quand aucune activité n'existe
    // encore (#goalsNoActivityHint dans index.html).
    'Ajoute une activité pour commencer à te fixer des objectifs.': 'Add an activity to start setting yourself goals.',
    'Période précédente': 'Previous period',
    'Période suivante': 'Next period',
    'Non atteint': 'Not met',
    'Partiel': 'Partial',
    'Atteint': 'Met',
    'Pas encore assez d’historique pour estimer ce temps.': 'Not enough history yet to estimate this time.',
    'confiance': 'confidence',
    'justesse': 'accuracy',
    'Période': 'Period',
    'Tout': 'All',
    'Tâches par membre': 'Tasks by member',
    'Tâches faites': 'Tasks done',
    'Restantes': 'Remaining',
    'Faites à la date prévue': 'Done on the planned date',
    'En retard': 'Overdue',
    'Aucune tâche sur cette période.': 'No tasks in this period.',
    'Reporté automatiquement depuis une semaine précédente, non atteinte.': 'Automatically carried over from a previous, unmet week.',
    'Tous': 'All',
    'Public': 'Public',
    'Confidentiel': 'Confidential',
    'Titre de l’objectif': 'Goal title',
    'Supprimer cet objectif': 'Delete this goal',
    'Supprimer cet objectif hebdomadaire ?': 'Delete this weekly goal?',
    'Êtes-vous sûr de vouloir supprimer cet objectif hebdomadaire ?': 'Are you sure you want to delete this weekly goal?',
    'Supprimer cet objectif périodique ?': 'Delete this period goal?',
    'Êtes-vous sûr de vouloir supprimer cet objectif périodique ? Ses objectifs hebdomadaires seront également supprimés.': 'Are you sure you want to delete this period goal? Its weekly goals will be deleted too.',
    'Décris plus précisément cet objectif : ce que tu veux accomplir, comment tu sauras que c’est fait. Plus c’est précis, mieux Noèsis planifie pour toi.': 'Describe this goal more precisely: what you want to achieve, how you will know it is done. The more precise, the better Noèsis plans for you.',
    'En cours': 'Current',
    'Bilan de la période': 'Period recap',
    'sur': 'out of',
    'objectifs hebdomadaires atteints': 'weekly goals met',
    'Aujourd’hui': 'Today',
    'Impossible d’ajouter la tâche.': 'Could not add the task.',

    // ---- 20 septembre 2026 (discussion Objectifs — Logique métier, chantier
    // « Pôles & secteurs ») — renommage « catégorie » -> « pôle » côté
    // affichage + nouvelles chaînes de gestion des secteurs. Ne touche PAS
    // 'Catégorie'/'Catégorie / secteur (optionnel)' plus haut (feature
    // "Projets" du Profil, sans rapport — voir buildCategoryDropdown, app.js).
    'Aucun pôle': 'No division',
    'Pôle': 'Division',
    'Pôle ou secteur (facultatif)': 'Division or sector (optional)',
    'Pôle ou secteur': 'Division or sector',
    'Tous les pôles': 'All divisions',
    'Sans pôle': 'No division',
    'Par pôle': 'By division',
    'Changer de pôle': 'Change division',
    'Aucune tâche dans ce pôle.': 'No tasks in this division.',
    'Nouvelle tâche… Noèsis choisit son pôle': 'New task… Noèsis picks its division',
    // 22 sept. 2026 — capture hors ligne (zone « À classer »)
    'À classer': 'To sort',
    'non ajoutée': 'not added',
    'Hors ligne — connecte-toi à internet pour continuer.': 'Offline — connect to the internet to continue.',
    // 25 sept. 2026 — données hors ligne
    'la synchronisation se fera au retour du réseau': 'will sync when you are back online',
    'Hors ligne — données enregistrées du {date}': 'Offline — data saved on {date}',
    '{n} modification(s) en attente — la synchronisation se fera au retour du réseau.': '{n} change(s) pending — will sync when you are back online.',
    'secteur': 'sector',
    'pôle': 'division',
    'L\'ordre a été modifié pendant que tu étais hors ligne. Souhaites-tu appliquer tes modifications hors ligne ?': 'The order was changed while you were offline. Apply your offline changes?',
    'Le {type} « {label} » a été retiré ailleurs : ta modification hors ligne est ignorée.': 'The {type} “{label}” was removed elsewhere: your offline change was ignored.',
    'Le {type} « {label} » a été modifié pendant que tu étais hors ligne. Souhaites-tu appliquer tes modifications hors ligne ?': 'The {type} “{label}” was changed while you were offline. Apply your offline changes?',
    'Modification hors ligne non appliquée : {error}': 'Offline change not applied: {error}',
    'Modifications hors ligne synchronisées.': 'Offline changes synced.',
    // 23 sept. 2026 — chrono hors ligne
    'Hors ligne — le chrono sera synchronisé au retour du réseau.': 'Offline — the timer will sync when you are back online.',
    'Session enregistrée hors ligne — elle sera synchronisée au retour du réseau.': 'Session saved offline — it will sync when you are back online.',
    'Session hors ligne enregistrée ({activity}).': 'Offline session saved ({activity}).',
    'Un chrono tournait déjà sur un autre appareil : ton chrono hors ligne ({activity}, {time}) n\'a pas été repris.': 'A timer was already running on another device: your offline timer ({activity}, {time}) was not kept.',
    'Ce chrono avait déjà été arrêté sur un autre appareil : ton arrêt hors ligne n\'a pas été appliqué.': 'This timer was already stopped on another device: your offline stop was not applied.',
    'Arrêt hors ligne synchronisé ({activity}).': 'Offline stop synced ({activity}).',
    'Chrono hors ligne non synchronisé ({activity}, {from}–{to}) : {error}': 'Offline timer not synced ({activity}, {from}–{to}): {error}',
    'Déplacer ce pôle': 'Move this division',
    'Nom de pôle requis.': 'Division name required.',
    'Maximum de pôles atteint ({max}).': 'Maximum number of divisions reached ({max}).',
    'Nouveau pôle': 'New division',
    'Ajouter un pôle': 'Add a division',
    '+ Ajouter un pôle': '+ Add a division',
    'Cette activité n’a pas encore de pôle.': 'This activity has no division yet.',
    'Crée ton premier pôle pour organiser tes tâches et tes objectifs.': 'Create your first division to organise your tasks and goals.',
    'Nom de secteur requis.': 'Sector name required.',
    'Nouveau secteur…': 'New sector…',
    'Déplacer vers…': 'Move to…',
    'Nouveau pôle': 'New division',
    'Nom du pôle': 'Division name',
    'Ajouter un pôle': 'Add a division',
    'Voir mes dossiers connectés': 'View my connected folders',
    'Déconnecter Drive': 'Disconnect Drive',
    'Nouvelles tâches': 'New tasks',
    'Modifications': 'Changes',
    'Rien à valider.': 'Nothing to review.',
    'Drive connecté': 'Drive connected',
    'Choisir un dossier': 'Choose a folder',
    'Aucun dossier connecté.': 'No connected folder.',
    'Réglages du dossier': 'Folder settings',
    'Modifier les réglages de ce dossier': 'Edit this folder’s settings',
    'Ajouter automatiquement les nouvelles tâches (sinon elles te sont proposées pour validation)': 'Add new tasks automatically (otherwise they are suggested for your approval)',
    'Consigne permanente (facultative)': 'Standing instruction (optional)',
    'Synchroniser maintenant': 'Sync now',
    '(en pause)': '(paused)',
    'Dossier introuvable.': 'Folder not found.',
    // ---- Stratégie d'une activité (19 oct. 2026) ----
    'Stratégie': 'Strategy',
    'Quel est ton but global ?': 'What is your overall goal?',
    'Pour quand ?': 'By when?',
    'Ta priorité n° 1': 'Your priority #1',
    'Ta priorité n° 2': 'Your priority #2',
    'Ta priorité n° 3': 'Your priority #3',
    'Ce qui ne doit PAS être fait / ignoré': 'What must NOT be done / is to be ignored',
    'L’IA suit ces consignes : elle n’ajoute pas de tâche qui s’en écarte.': 'The AI follows these guidelines: it will not add tasks that deviate from them.',
    'Enregistrement…': 'Saving…',
    'Enregistré': 'Saved',
    'Erreur d’enregistrement.': 'Could not save.',
    'Seul le propriétaire de l’activité peut modifier la stratégie.': 'Only the activity owner can edit the strategy.',
    'Retirer (hors stratégie)': 'Remove (outside strategy)',
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
    // Fusion de deux activités (server/routes/activities.js, 2 septembre 2026)
    [/^« (.+) » a été fusionnée dans « (.+) » : (\d+) enregistrement\(s\) y ont été ajoutés\.$/,
      '"$1" was merged into "$2": $3 session(s) were added to it.'],
    [/^"(.+)" a été séparée : tu as maintenant ta propre activité personnelle, avec ton historique\.$/, '"$1" was split off: you now have your own personal activity, with your history.'],
    // Exclusion d'un membre par le/la propriétaire (server/routes/activities.js, 10 septembre 2026)
    [/^Seul le ou la propriétaire de l'activité peut exclure un membre\.$/, "Only the activity's owner can exclude a member."],
    [/^Utilise « Quitter la communauté » pour te retirer toi-même de cette activité\.$/, 'Use "Leave the community" to remove yourself from this activity.'],
    [/^Cette personne ne fait pas partie de cette activité\.$/, 'This person is not part of this activity.'],
    [/^(.+) a un chrono en cours sur cette activité : impossible de l'exclure maintenant\.$/, "$1 has a timer running on this activity: can't exclude them right now."],
    [/^(.+) a déjà une autre activité "(.+)" — impossible de créer sa copie personnelle sous le même nom\.$/, '$1 already has another activity called "$2" — cannot create their personal copy under the same name.'],
    [/^(.+) a été exclu\(e\) de "(.+)" — son historique a été conservé dans une activité personnelle\.$/, '$1 was excluded from "$2" — their history was kept in a personal activity.'],
    [/^Tu suis déjà (.+)\.$/, 'You already follow $1.'],
    [/^Demande envoyée à (.+)\.$/, 'Request sent to $1.'],
    // Doit rester AVANT le pattern générique "Tu as rejoint « (.+) »." juste
    // en dessous : les deux se terminent par « X ».", et le pattern générique
    // matcherait sinon en premier (avec un $1 incorrect) par backtracking.
    [/^Tu as rejoint « (.+) », fusionnée avec ton ancienne activité « (.+) »\.$/, 'You joined "$1", merged with your former activity "$2".'],
    [/^Tu as rejoint « (.+) »\.$/, 'You joined "$1".'],
    [/^Activité enregistrée : (.*)$/, 'Session recorded: $1'],
    [/^Import terminé : (\d+) ligne\(s\) importée\(s\), (\d+) déjà présente\(s\), (\d+) ignorée\(s\)\.$/, 'Import finished: $1 row(s) imported, $2 already there, $3 skipped.'],
    [/^Import terminé : (\d+) ligne\(s\) importée\(s\), (\d+) ignorée\(s\)\.$/, 'Import finished: $1 row(s) imported, $2 skipped.'],
    // 8 septembre 2026 (chantier "Connexion / Création de compte") : le
    // prénom seul n'est plus unique (voir server/db.js), le message inclut
    // désormais le nom de famille — motif mis à jour en conséquence.
    [/^"(.+) (.+)" existe déjà\. Choisis un autre prénom ou nom, ou récupère ton profil si c'est toi\.$/, '"$1 $2" already exists. Pick another first or last name, or restore your profile if that is you.'],
    [/^"(.+)" est déjà pris par un autre profil\.$/, '"$1" is already taken by another profile.'],
    [/^Semaine du (\S+) au (\S+)$/, 'Week of $1 to $2'],
    // (Le motif `Du $1 au $2`, ajouté ici le 1er septembre 2026 pour le
    // libellé du camembert quand la Feuille de temps défilait en continu, a
    // été retiré le 2 septembre avec ce défilement : plus aucun libellé de
    // cette forme n'est produit côté serveur.)
  ];

  var lang = 'fr';

  function hasKey(k) { return Object.prototype.hasOwnProperty.call(DICT, k); }

  function applyTemplate(tpl, m) {
    if (typeof tpl === 'function') return tpl(m);
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

  // 30 septembre 2026 (chantier « i18n Feuille de route ») : chaînes du volet
  // Objectifs (Pages 1 à 3), de l'Offre 1 et de sa modale jusque-là restées en français.
  Object.assign(DICT, {
    "Quelle activité pour cette tâche ?": "Which activity for this task?",
    "Aucune tâche capturée cette semaine.": "No task captured this week.",
    "Écris une nouvelle tâche, Noèsis l'organise dans tes projets...": "Write a new task, Noèsis sorts it into your projects...",
    "Expansion": "Expansion",
    "J’ai un code": "I have a code",
    "Résilier mon abonnement": "Cancel my subscription",
    "Code d’accès": "Access code",
    "Entre un code.": "Enter a code.",
    "Vérification…": "Checking…",
    "Erreur. Réessaie.": "Error. Try again.",
    "Code invalide.": "Invalid code.",
    "Trop d’essais. Réessaie dans quelques minutes.": "Too many attempts. Try again in a few minutes.",
    "Entre ton code d’accès gratuit à Expansion.": "Enter your free access code for Expansion.",
    "Aucun abonnement actif pour l'instant.": "No active subscription yet.",
    "paiement à régulariser": "payment to settle",
    "en attente de paiement": "awaiting payment",
    "résiliation programmée le {date}": "cancellation scheduled on {date}",
    "Souscrire à Expansion": "Subscribe to Expansion",
    "Pôle précédent": "Previous pole",
    "Pôle suivant": "Next pole",
    "Objectif périodique": "Periodic goal",
    "Les objectifs hebdomadaires te seront ensuite proposés automatiquement.": "Weekly goals will then be suggested to you automatically.",
    "20 $/mois, par activité, résiliable à tout moment.": "$20/month, per activity, cancel anytime.",
    "Nom de la nouvelle activité": "New activity name",
    "J'ai 18 ans ou plus": "I am 18 or older",
    "J'ai 16 ou 17 ans": "I am 16 or 17",
    "La loi québécoise (art. 157 du Code civil du Québec) exige le consentement de ton représentant légal pour cet abonnement. Un courriel de confirmation lui sera envoyé — l'abonnement ne débute qu'une fois ce consentement confirmé.": "Quebec law (art. 157 of the Civil Code of Québec) requires your legal guardian's consent for this subscription. A confirmation email will be sent to them — the subscription only starts once this consent is confirmed.",
    "Nom du représentant légal": "Legal guardian's name",
    "Courriel du représentant légal": "Legal guardian's email",
    "Continuer vers le paiement": "Continue to payment",
    "Un courriel a été envoyé à": "An email was sent to",
    "pour recueillir le consentement de ton représentant légal.": "to collect your legal guardian's consent.",
    "Ce lien expire le": "This link expires on",
    ". Reviens ici une fois qu'il ou elle aura confirmé.": ". Come back here once they have confirmed.",
    "Vérifier maintenant": "Check now",
    "Toujours en attente de confirmation du représentant légal.": "Still waiting for the legal guardian's confirmation.",
    "Abonnement à Expansion activé. Merci !": "Expansion subscription activated. Thank you!",
    "Paiement annulé — aucun abonnement créé.": "Payment cancelled — no subscription created.",
    "— Nouvelle activité —": "— New activity —",
    "Chargement…": "Loading…",
    "Ton profil doit avoir un email et un téléphone renseignés avant de t'abonner.": "Your profile must have an email and a phone number before you subscribe.",
    "Paiement indisponible pour le moment.": "Payment unavailable at the moment.",
    "Nom du représentant légal requis.": "Legal guardian's name required.",
    "Courriel du représentant légal invalide.": "Legal guardian's email invalid.",
    "Tu es déjà abonné à Expansion pour cette activité.": "You are already subscribed to Expansion for this activity.",
    "Il faut choisir une activité existante ou en nommer une nouvelle.": "Choose an existing activity or name a new one.",
    "Tu n'es pas membre de l'activité indiquée.": "You are not a member of the activity indicated.",
    "Nom d'activité invalide.": "Invalid activity name.",
    "Sans date": "No date",
    "objectif lié": "linked goal",
    "Où": "Where",
    "Quand": "When",
    "Hors des périodes connues.": "Outside the known periods.",
    "aucun": "none",
    "Objectif hebdomadaire": "Weekly goal",
    "Intitulé requis.": "Title required.",
    "Sélection incomplète.": "Incomplete selection.",
    "Supprimer définitivement cette tâche ?": "Permanently delete this task?",
    "Aucun pôle pour le moment — ajoutez-en un depuis la fenêtre de l’activité, section Catégories.": "No pole yet — add one from the activity window, Categories section.",
    "Aucune tâche": "No tasks",
    "Génération en cours…": "Generating…",
    "par Noèsis": "by Noèsis",
    "Afficher/masquer les jours de cette semaine": "Show/hide this week's days",
    "semaine": "week",
    "Rien de proposé pour aujourd’hui.": "Nothing suggested for today.",
    "Ajouter une tâche ce jour": "Add a task this day",
    "Marquer non faite": "Mark as not done",
    "Marquer faite": "Mark as done",
    "Nouvelle tâche ajoutée automatiquement": "New task added automatically",
    "Aucun pôle sélectionné...": "No pole selected...",
    "Aucun secteur sélectionné...": "No sector selected...",
    "Sans secteur": "No sector",
    "Déjà casée dans le planning hebdomadaire Objectifs": "Already placed in the weekly Goals planning",
    "Décris ce pôle en une ou deux phrases : à quoi il sert, quelles tâches il contient. Plus c’est précis, mieux Noèsis planifie pour toi.": "Describe this division in one or two sentences: what it is for, which tasks it contains. The more precise, the better Noèsis plans for you.",
    "Décris ce secteur en une ou deux phrases : à quoi il sert, quelles tâches il contient. Plus c’est précis, mieux Noèsis planifie pour toi.": "Describe this sector in one or two sentences: what it is for, which tasks it contains. The more precise, the better Noèsis plans for you.",
    "Maximum {max} pôles par activité": "Maximum {max} divisions per activity",
    "Nouveau pôle…": "New pole…",
    "Déplacer ce secteur": "Move this sector",
    "estimation": "estimate",
    "Estimation du temps par membre": "Estimated time per member",
    "Revenir à l’estimation calculée": "Back to the calculated estimate",
    "pas assez de données": "not enough data",
    "Retirer": "Remove",
    "Choisis quoi faire des tâches affiliées (les supprimer ou les conserver).": "Choose what to do with the linked tasks (delete or keep them).",
  });
  Object.assign(DICT, {
    "Pôles & secteurs": "Divisions & sectors",
    "Moyenne": "Average",
    "Maximum": "Maximum",
    "Cible": "Target",
    "Capacité": "Capacity",
    "Jour": "Day",
    "Semaine": "Week",
    "Heures": "Hours",
    "Minutes": "Minutes",
    "Fermer": "Close",
    "Valider": "Confirm",
    "Réinitialiser": "Reset",
    "Utiliser ma moyenne": "Use my average",
    "Gérer mon temps": "Manage my time",
    "Plafond atteint": "Limit reached",
    "Garder aujourd'hui": "Keep today",
    "Proposition de Noèsis": "Noèsis suggestion",
    "Garder le mien": "Keep mine",
    "Appliquer": "Apply",
    "Secteur": "Sector",
    "Ce plafond serait dépassé. Nouveau plan proposé (rien n'est modifié sans ta validation).": "This limit would be exceeded. New plan proposed (nothing changes without your approval).",
    "Modifier la tâche": "Edit task",
    "Nom de la tâche": "Task name",
    "Date": "Date",
    "Secteur / pôle": "Sector / pole",
    "Le nom ne peut pas être vide.": "The name cannot be empty.",
    "Enregistrement impossible.": "Could not save.",
  });
  Object.assign(DICT, {
    "Secteur dans « {name} »": "Sector in \"{name}\"",
    "+ Nouveau secteur": "+ New sector",
    "Nouveau secteur": "New sector",
    "Pièce jointe": "Attachment",
    "Quitter": "Leave",
    "Se déconnecter": "Sign out",
    "Clore": "Close poll",
    "Sondage": "Poll",
    "Modifier la description": "Edit description",
    "Déplacer « {name} » vers…": "Move \"{name}\" to…",
  });
  Object.assign(DICT, {
    "Tâches réalisées": "Completed tasks",
    "Tâches": "Tasks",
    "Objectifs": "Goals",
    "Période": "Period",
    "Chemin parcouru et à parcourir": "Path covered and ahead",
    "Périodiques": "Periodic",
    "Hebdomadaires": "Weekly",
    "Réalisé": "Done",
    "Prévu": "Planned",
    "À venir": "Upcoming",
    "Aujourd'hui": "Today",
    "Atteint": "Reached",
    "En cours": "In progress",
    "Aucune activité.": "No activity.",
    "Aucune activité partagée.": "No shared activity.",
    "Pôle (hors secteur)": "Pole (no sector)",
    "Chargement impossible.": "Could not load.",
    "En avance": "Ahead",
    "En retard": "Behind",
    "Tâches faites à la date prévue": "Tasks done on the planned date",
    "à temps": "on time",
    "retard": "late",
    "reportées": "postponed",
    "Durée estimée contre durée réelle": "Estimated vs actual duration",
    "Jours où tu travailles vraiment": "Days you really work",
    "Charge restante par pôle": "Remaining load by pole",
    "tâche": "task",
    "tâches": "tasks",
    "Tâches reportées plusieurs fois": "Tasks postponed several times",
    "report": "postponement",
    "reports": "postponements",
    "Rythme de réalisation": "Completion pace",
    "Série en cours": "Current streak",
    "S{n}": "W{n}",
    "+ {n} autres": "+ {n} more",
    "+ {n} autre": "+ {n} more",
    "Semaine {n} · {p}": "Week {n} · {p}",
    "Période {n} · {a} – {b}": "Period {n} · {a} – {b}",
    "du temps prévu réalisé": "of planned time done",
    "des semaines atteintes": "of weeks reached",
    "Le chiffre = temps estimé des tâches liées à l’objectif de la semaine qui sont faites, divisé par le temps estimé de toutes ces tâches (même règle que le statut). 90 % ou plus : atteint (vert) · 75 % ou plus : partiel · sinon non atteint (rouge).": "The figure = estimated time of the tasks linked to the week's goal that are done, divided by the estimated time of all those tasks (same rule as the status). 90% or more: reached (green) · 75% or more: partial · otherwise not reached (red).",
    "Le chiffre = part des semaines atteintes dans la période (les semaines à venir ne comptent pas). Chaque case montre le temps fait de la semaine : vert si atteinte (90 % ou plus). Touche une semaine pour voir ses tâches.": "The figure = share of weeks reached in the period (upcoming weeks don't count). Each box shows the week's time done: green if reached (90% or more). Tap a week to see its tasks.",
    "Statut posé à la main : {s}.": "Status set manually: {s}.",
    "Réalisées": "Done",
    "Non accomplies": "Not done",
    "Ont glissé": "Slipped",
    "Avancées": "Done early",
    "Avancé": "Advanced",
    "Visible par les autres": "Visible to others",
    "Avancé": "Advanced",
    "Visible par les autres": "Visible to others",
    "→ semaine {n} · {d}": "→ week {n} · {d}",
    "→ {p} · {d}": "→ {p} · {d}",
    "prévue {a} → faite {b}": "planned {a} → done {b}",
    "jours de suite avec une tâche faite": "days in a row with a task done",
    "jour de suite avec une tâche faite": "day in a row with a task done",
    "Tout": "All",
    "tâche par jour travaillé": "tasks per worked day",
    "Agenda occupé": "Busy calendar",
    "pris aujourd'hui": "taken today",
    "Capacité par jour": "Capacity per day",
    "libres en moyenne": "free on average",
    "Responsable habituel": "Usual assignee",
    "Urgence et échéances": "Urgency and deadlines",
    "tâches à échéance sous {n} jours": "tasks due within {n} days",
    "Temps cible contre temps fait": "Target time vs time done",
    "Objectifs atteints": "Goals reached",
    "Période précédente": "Previous period",
    "Période suivante": "Next period",
    "{a} / {b} tâches restantes": "{a} / {b} tasks remaining",
    "Charge restante par secteur": "Remaining load by sector",
    "Où ça glisse": "Where it slips",
    "Temps cible contre temps fait par secteur": "Target vs actual time by sector",
    "Objectifs atteints par secteur": "Goals achieved by sector",
    "atteint": "reached",
    "non atteint": "not reached",
    "partiel": "partial",
    "non": "not reached",
    "Objectifs reportés qui s’accumulent": "Carried-over goals piling up",
    "Tâches liées terminées avant la fin de semaine": "Linked tasks finished before the end of the week",
    "Pression entre pôles": "Pressure between poles",
    "Ajouter une information": "Add information",
    "Ajouter un projet": "Add a project",
    "Retirer cette information ?": "Remove this information?",
    "« {name} » ne sera plus affichée dans l’onglet {tab}. Tu pourras la rajouter à tout moment.": "“{name}” will no longer be shown in the {tab} tab. You can add it back at any time.",
  });
  PATTERNS.push(
    [/^Nom d'activité trop long \((\d+) caractères maximum\)\.$/, 'Activity name too long ($1 characters maximum).'],
    [/^Intitulé trop long \((\d+) caractères maximum\)\.$/, 'Title too long ($1 characters maximum).'],
    [/^Nom trop long \((\d+) caractères maximum\)\.$/, 'Name too long ($1 characters maximum).'],
    [/^Note trop longue \((\d+) caractères maximum\)\.$/, 'Note too long ($1 characters maximum).'],
    [/^(Intitulé|Nom|Note|Message) invalide\.$/, 'Invalid text.'],
    [/^Tu as déjà une activité "(.+)"\.$/, 'You already have an activity "$1".']
  );

  // 10 octobre 2026 (chantier « Anglais partout ») : chaînes restées en
  // français après l'audit complet de l'interface (HTML statique, gabarits JS,
  // libellés construits dans le code, messages serveur).
  Object.assign(DICT, {
    // ---- Mon IA (fusion Gestion de l'IA + Connecter mon IA, public/js/connexion-ia.js) ----
    "Mon IA": "My AI",
    "Mon IA : désactivé dans Modules": "My AI: disabled in Modules",
    "Erreur.": "Error.",
    "jamais utilisé": "never used",
    "dernière utilisation : ": "last used: ",
    "Copier": "Copy",
    "Copié": "Copied",
    "Connecter mon IA": "Connect my AI",
    "Connectée": "Connected",
    "Non connectée": "Not connected",
    "Branche TimeTracker à ton IA (Claude, ChatGPT…) : elle lit tes tâches et tes objectifs ; en écriture (case ci-dessous), elle peut aussi les organiser.": "Connect TimeTracker to your AI (Claude, ChatGPT…): it reads your tasks and goals; with writing on (box below), it can also organize them.",
    "Copie cette adresse maintenant : elle ne sera plus affichée.": "Copy this address now: it will not be shown again.",
    "Colle-la dans claude.ai > Paramètres > Connecteurs > Ajouter un connecteur personnalisé. Elle contient ton accès : ne la partage pas.": "Paste it in claude.ai > Settings > Connectors > Add custom connector. It contains your access: do not share it.",
    "J'ai copié": "I copied it",
    "Générer une nouvelle adresse": "Generate a new address",
    "Créer l'adresse de connexion": "Create the connection address",
    "Révoquer l'accès": "Revoke access",
    "Révoquer l'accès ?": "Revoke access?",
    "Ton IA ne pourra plus lire tes tâches ni tes objectifs. Tu pourras recréer une adresse à tout moment.": "Your AI will no longer be able to read your tasks or goals. You can create a new address at any time.",
    "Détails": "Details",
    "Masquer les détails": "Hide details",
    "Tu peux révoquer l'accès à tout moment. Une nouvelle adresse remplace l'ancienne.": "You can revoke access at any time. A new address replaces the old one.",
    "écriture autorisée": "write allowed",
    "lecture seule": "read-only",
    "Autoriser l'IA à écrire (créer, modifier, ordonner, planifier, objectifs)": "Allow the AI to write (create, edit, order, plan, goals)",
    "Avec l'écriture, l'IA peut créer, modifier, ordonner et planifier tes tâches, définir tes objectifs et en retirer (de façon réversible). Chaque écriture est au journal et s'annule pendant 30 jours. Une nouvelle adresse applique ton choix.": "With writing, the AI can create, edit, order and schedule your tasks, set your goals and remove some (reversibly). Every write is logged and can be undone for 30 days. A new address applies your choice.",
    "Adresse du serveur": "Server address",
    // ---- Gestion de l'IA (public/js/objectifs-page1.js, AI_MODES) ----
    "Autonome": "Autonomous",
    "Partiel": "Partial",
    "Absent": "Off",
    "Noèsis range tes tâches seul, sans te demander ton avis.": "Noèsis sorts your tasks on its own, without asking for your opinion.",
    "Noèsis propose un rangement ; tu le reconfirmes et tu peux le modifier.": "Noèsis suggests where each task goes; you reconfirm it and can change it.",
    "Noèsis ne range rien : tu choisis toi-même où va chaque tâche.": "Noèsis sorts nothing: you choose where each task goes yourself.",
    "Comment Noèsis gère tes tâches ?": "How should Noèsis handle your tasks?",
    "Tu pourras changer ce choix à tout moment dans Réglages › Mon IA.": "You can change this choice at any time in Settings › My AI.",
    "Pas encore choisi : il te sera demandé à ta première tâche.": "Not chosen yet: you will be asked at your first task.",
    "Choisis un pôle ou un secteur pour chaque activité.": "Choose a division or a sector for each activity.",
    "Pôle et secteur": "Division and sector",
    // ---- Page Objectifs (gabarits) ----
    "Génère automatiquement tes objectifs et tâches tous les mois en passant à Expansion.": "Automatically generate your goals and tasks every month by moving to Expansion.",
    "20 $/mois par activité · résiliable à tout moment": "$20/month per activity · cancel anytime",
    "Découvrir Expansion": "Discover Expansion",
    "Archives": "Archive",
    "Aucune tâche terminée ces 7 derniers jours.": "No task completed in the last 7 days.",
    "Discussion": "Discussion",
    "Mensuel": "Monthly",
    "Annuel": "Yearly",
    "Aucun objectif périodique": "No periodic goal",
    "Aucun objectif périodique · Ajouter": "No periodic goal · Add",
    "+ Ajouter": "+ Add",
    "Objectifs hebdomadaires": "Weekly goals",
    "Titre de l'objectif": "Goal title",
    "Toutes les tâches du jour sont terminées : retrouve-les dans Archives.": "All of today's tasks are done: find them in the Archive.",
    "Aucune tâche prévue pour aujourd’hui.": "No task planned for today.",
    "Calculé par Noèsis d’après les tâches réalisées": "Calculated by Noèsis from the completed tasks",
    "en plus, ajoutées à la période": "extra, added to the period",
    "tâches faites en moins de temps": "tasks done in less time",
    "Modifier l’objectif": "Edit the goal",
    "estimées pour la période": "estimated for the period",
    "Temps estimé : à définir": "Estimated time: to be defined",
    "Temps estimé des tâches de ce jour": "Estimated time of this day's tasks",
    // ---- Libellés construits dans app.js ----
    "retirée": "removed",
    "rangée dans": "filed in",
    "contribue peut-être à": "may contribute to",
    "Maximum {max} secteurs par pôle": "Maximum {max} sectors per division",
    "Supprimer le pôle « {name} » ?": "Delete the division \"{name}\"?",
    "Supprimer le secteur « {name} » ?": "Delete the sector \"{name}\"?",
    "Êtes-vous sûr de vouloir supprimer le pôle ? Les secteurs affiliés ainsi que les tâches seront également supprimés.": "Are you sure you want to delete the division? Its linked sectors and tasks will also be deleted.",
    "Répartition du temps par membre": "Time breakdown by member",
    "Votre accord est retiré. Vos données ne servent plus qu'au fonctionnement de l'application.": "Your consent is withdrawn. Your data is now used only to run the app.",
    "L'envoi a échoué, réessaie plus tard": "Sending failed, try again later",
    "Replie les projets pour pouvoir les réordonner": "Collapse the projects to be able to reorder them",
    "Glisse pour réordonner.": "Drag to reorder.",
    // ---- Index.html statique ----
    "Chargement de Noèsis": "Loading Noèsis",
    "Ouvrir le profil": "Open profile",
    "Choisir la granularité": "Choose the granularity",
    "Joindre un fichier": "Attach a file",
    "Joindre une image ou un PDF": "Attach an image or a PDF",
    ", et j'ai 16 ans ou plus.": ", and I am 16 or older.",
    "Être trouvable à la connexion": "Be findable at sign-in",
    "J'accepte que Noesis utilise les données que je saisis pour analyser l'usage, produire des statistiques, m'envoyer des communications commerciales et cibler ses propres campagnes publicitaires. Mon code PIN et mes messages privés ne sont jamais utilisés. Je peux retirer mon accord à tout moment dans Réglages, section Sécurité. (Politique de confidentialité,": "I agree that Noesis may use the data I enter to analyse usage, produce statistics, send me commercial communications and target its own advertising campaigns. My PIN code and private messages are never used. I can withdraw my consent at any time in Settings, Security section. (Privacy policy,",
    "J'accepte que mon prénom et mon nom puissent être trouvés dans la recherche de membres de l'écran de connexion. (Politique de confidentialité, section 4.1)": "I agree that my first and last name may be found in the member search on the sign-in screen. (Privacy policy, section 4.1)",
    "Analyse de l'usage, statistiques, communications commerciales et campagnes publicitaires de Noesis.": "Usage analysis, statistics, commercial communications and advertising campaigns by Noesis.",
    "Gouvernance des renseignements personnels": "Personal information governance",
    "Rien à afficher pour l'instant : soit personne ne partage encore son profil avec toi, soit personne n'a encore écrit.": "Nothing to show yet: either nobody is sharing their profile with you yet, or nobody has written yet.",
    "Catégories": "Categories",
    "+ Ajouter des détails": "+ Add details",
    "Activités exportées": "Exported activities",
    "URL enregistrées": "Saved URLs",
    "Une question sur vos données": "A question about your data",
    "J'accepte": "I agree",
    "Non merci": "No thanks",
    // ---- Messages serveur ----
    "Seules les années futures peuvent être supprimées.": "Only future years can be deleted.",
    "Supprimez d’abord les années suivantes.": "Delete the following years first.",
    "Cette année contient déjà des objectifs.": "This year already contains goals.",
    "Une année passée ne se modifie plus.": "A past year can no longer be edited.",
    "Catégorie invalide.": "Invalid category.",
    "Catégorie invalide pour cette activité.": "Invalid category for this activity.",
    "Nom de catégorie requis.": "Category name required.",
    "Pôle introuvable pour ce secteur.": "Division not found for this sector.",
    "Catégorie introuvable.": "Category not found.",
    "Liste de catégories invalide.": "Invalid category list.",
    "Pôle introuvable.": "Division not found.",
    "Liste de secteurs invalide.": "Invalid sector list.",
    "Secteur introuvable pour ce pôle.": "Sector not found for this division.",
    "Pôle cible introuvable.": "Target division not found.",
    "Catégorie ou secteur invalide pour cette activité.": "Invalid category or sector for this activity.",
    "Statut invalide.": "Invalid status.",
    "Ce membre n'appartient pas à cette activité.": "This member does not belong to this activity.",
    "Jour cible invalide.": "Invalid target day.",
    "Tâche introuvable ou déjà terminée.": "Task not found or already completed.",
    "Tâche hors du pôle affiché.": "Task outside the displayed division.",
    "Objectif de période introuvable ou déjà reporté.": "Period goal not found or already carried over.",
    "Objectif hors du pôle affiché.": "Goal outside the displayed division.",
    "Choix invalide.": "Invalid choice.",
    "La période suivante a déjà un objectif.": "The next period already has a goal.",
    "Le plan a changé depuis son affichage.": "The plan has changed since it was displayed.",
    "Proposition déjà traitée.": "Proposal already handled.",
    "Cette période n'est plus d'actualité.": "This period is no longer current.",
    "Texte requis.": "Text required.",
    "Aucune catégorie sur cette activité.": "No category on this activity.",
    "Cette activité n'a pas encore de pôle. Vide le champ, puis touche son nom pour en créer un.": "This activity has no division yet. Clear the field, then tap its name to create one.",
    "Catégorie choisie invalide pour cette activité.": "Chosen category invalid for this activity.",
    "Au moins une activité doit être sélectionnée.": "At least one activity must be selected.",
    "Cette tâche existe déjà dans cette activité.": "This task already exists in this activity.",
    "Pôle et secteur non trouvés.": "Division and sector not found.",
    "Ce pôle a des secteurs : ajoutez la tâche à l'un d'eux.": "This division has sectors: add the task to one of them.",
    "Date d'échéance invalide.": "Invalid due date.",
    "Ce pôle a des secteurs : choisissez-en un.": "This division has sectors: choose one.",
    "Cette tâche n'appartient pas à cette activité.": "This task does not belong to this activity.",
    "Période introuvable.": "Period not found.",
    "Date invalide.": "Invalid date.",
    "Type de fichier non autorisé (images ou PDF seulement).": "File type not allowed (images or PDF only).",
    "Pôle ou secteur invalide pour cette activité.": "Invalid division or sector for this activity.",
    "Pôle invalide pour cette activité.": "Invalid division for this activity.",
    "Envoi de courriel indisponible : RESEND_API_KEY n'est pas configurée côté serveur.": "Email sending unavailable: RESEND_API_KEY is not configured on the server.",
    "Génération indisponible pour le moment.": "Generation unavailable at the moment.",
    "Ce sondage n'accepte pas de réponse libre.": "This poll does not accept free-text answers.",
    "Ce sondage a déjà le nombre maximum de réponses.": "This poll already has the maximum number of answers.",
    "Récurrence invalide.": "Invalid recurrence.",
    "URL invalide.": "Invalid URL.",
    "Non connecté.": "Not signed in.",
    "Deux pièces jointes maximum (une photo et un document).": "Two attachments maximum (one photo and one document).",
    "Tu ne peux pas suivre cette personne.": "You cannot follow this person.",
    "Tu ne peux pas te bloquer toi-même.": "You cannot block yourself.",
    "Tu ne peux retirer que tes propres blocages.": "You can only remove your own blocks.",
    "Débloqué.": "Unblocked.",
    "Période ou semaine invalide.": "Invalid period or week.",
    "Semaine invalide (1 à 4).": "Invalid week (1 to 4).",
    "Choisis d'abord comment Noèsis gère tes tâches.": "First choose how Noèsis handles your tasks.",
    "Tâche refusée.": "Task refused.",
    "Lien invalide": "Invalid link",
    "Lien expiré": "Link expired",
    "Déjà utilisé": "Already used",
    "Trop de recherches. Réessaie dans une minute.": "Too many searches. Try again in a minute.",
    "Cette adresse courriel est déjà associée à un profil. Récupère ton profil (« J'ai déjà un profil sur cette app ») ou utilise une autre adresse.": "This email address is already linked to a profile. Recover your profile (\"I already have a profile on this app\") or use another address.",
    "Tu dois accepter les conditions d'utilisation et la politique de confidentialité.": "You must accept the terms of use and the privacy policy.",
    "Couleur invalide.": "Invalid colour.",
    "Valeur invalide.": "Invalid value.",
    "Tu ne peux modifier que ton propre profil.": "You can only edit your own profile.",
    "Tu ne peux lire que ton propre profil.": "You can only read your own profile.",
    "Mode invalide.": "Invalid mode.",
    "Trop de tentatives. Réessaie dans une minute.": "Too many attempts. Try again in a minute.",
    "Tu ne peux supprimer que ton propre profil.": "You can only delete your own profile.",
    "Non authentifié.": "Not authenticated.",
    "Activité non accessible.": "Activity not accessible.",
    "Profil introuvable. Réinitialise ton profil dans Paramètres.": "Profile not found. Reset your profile in Settings.",
  });
  PATTERNS.push(
    [/^(Nom|Texte|Description|Titre|Intitulé|Message|Question|Réponse) trop (?:long|longue) \((\d+) caractères maximum\)\.$/, function (m) { return ({ 'Nom': 'Name', 'Texte': 'Text', 'Description': 'Description', 'Titre': 'Title', 'Intitulé': 'Title', 'Message': 'Message', 'Question': 'Question', 'Réponse': 'Answer' })[m[1]] + ' too long (' + m[2] + ' characters maximum).'; }],
    [/^(\d+) secteurs maximum par pôle\.$/, '$1 sectors maximum per division.'],
    [/^Maximum (\d+) pôles par activité\.$/, 'Maximum $1 divisions per activity.'],
    [/^Tu peux enregistrer (\d+) adresses au maximum\.$/, 'You can save $1 addresses at most.'],
    [/^Plafond invalide \((.+)\) : entier de minutes >= 0 ou vide\.$/, 'Invalid limit ($1): whole number of minutes >= 0 or empty.'],
    [/^(.+) a été bloqué\(e\)\.$/, '$1 was blocked.'],
    [/^Un courriel a été envoyé à (.+) pour recueillir le consentement de ton représentant légal\. Reviens ici une fois qu'il ou elle aura confirmé\.$/, 'An email was sent to $1 to collect your legal guardian\'s consent. Come back here once they have confirmed.'],
    [/^Impossible d'envoyer le courriel de consentement : (.+)$/, 'Could not send the consent email: $1'],
    [/^Noèsis n'a pas pu (?:faire l'évaluation entre secteurs|générer les objectifs hebdomadaires|générer le plan) \(HTTP (\d+)\)(.*)$/, 'Noèsis could not complete the request (HTTP $1)$2'],
    [/^Anthropic a refusé l'appel \(HTTP (\d+)\)(.*)$/, 'Anthropic refused the call (HTTP $1)$2'],
    [/^(.+) requis\.$/, function (m) { return m[1] + ' required.'; }],
    [/^Limite d'utilisation de l'IA atteinte pour (cette semaine|ce mois)\. Elle reprend le (1er|\d+) (\S+)\.$/, function (m) {
      var fr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      var en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var i = fr.indexOf(m[3]);
      return 'AI usage limit reached for ' + (m[1] === 'ce mois' ? 'this month' : 'this week') + '. It resumes on ' + (i >= 0 ? en[i] : m[3]) + ' ' + (m[2] === '1er' ? '1' : m[2]) + '.';
    }]
  );

  Object.assign(DICT, {
    "Suggéré": "Suggested",
    "semaine du": "week of",
    "objectif": "goal",
    "Rechercher": "Search",
    "Semaine en cours": "Current week",
    "En savoir plus": "Learn more",
    "Temps": "Time",
    "Images ou PDF seulement.": "Images or PDF only.",
    "Inviter": "Invite",
    "Nom du secteur": "Sector name",
    "Visualiser": "View",
    "discussion": "discussion",
    "importance": "importance",
    "Partenaires": "Partners",
    "Financement": "Funding",
    "Depuis le début": "Since the beginning",
    "Trop d'essais. Réessaie dans 30 minutes.": "Too many attempts. Try again in 30 minutes.",
    "Aucun objectif lié": "No linked goal",
    "Objectif lié lointain": "Linked goal is far off",
    "Tâche longue, à avancer": "Long task, to move forward",
    "Tâche assez longue": "Fairly long task",
    "Journée déjà chargée": "Day already full",
    "Journée bien remplie": "Day well filled",
  });
  var MONTHS_FR_EN = { 'Janvier': 'January', 'Février': 'February', 'Mars': 'March', 'Avril': 'April', 'Mai': 'May', 'Juin': 'June', 'Juillet': 'July', 'Août': 'August', 'Septembre': 'September', 'Octobre': 'October', 'Novembre': 'November', 'Décembre': 'December' };
  PATTERNS.push(
    [/^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre) (\d{4})$/, function (m) { return MONTHS_FR_EN[m[1]] + ' ' + m[2]; }],
    [/^Objectif hebdo en retard de (\d+) j$/, 'Weekly goal $1 d late'],
    [/^Objectif hebdo se termine dans (\d+) j$/, 'Weekly goal ends in $1 d'],
    [/^Objectif de période dépassé de (\d+) j$/, 'Period goal overdue by $1 d'],
    [/^Objectif de période se termine dans (\d+) j$/, 'Period goal ends in $1 d']
  );

  // 10 octobre 2026 (chantier « Anglais partout ») : noms de pôles/secteurs
  // PAR DÉFAUT (créés par le système, pas saisis par l'utilisateur). Ils sont
  // traduits à l'AFFICHAGE seulement (jamais dans les données ni dans les
  // comparaisons : ce sont des clés de logique) ; un pôle/secteur renommé par
  // l'utilisateur a un autre nom et s'affiche donc tel quel.
  var DEFAULT_NAMES = {
    'Entreprise': 'Business', 'Communauté': 'Community', 'Produit': 'Product',
    'Gouvernance': 'Governance', 'Finance': 'Finance', 'Juridique': 'Legal',
    'RH': 'HR', 'Processus': 'Processes', 'Nouveau pôle': 'New division'
  };
  Object.assign(DICT, DEFAULT_NAMES);

  // 19 oct. 2026 : Trade Tracker (module optionnel).
  Object.assign(DICT, {
    "Trade Tracker": "Trade Tracker",
    "Trade": "Trade",
    "Ouvrir à part": "Open separately",
    "Chargement…": "Loading…",
    "Trade Tracker n’est pas configuré sur ce serveur.": "Trade Tracker is not configured on this server.",
    "Trade Tracker est indisponible.": "Trade Tracker is unavailable.",
    "Module désactivé : « Trade Tracker ».": "Module disabled: “Trade Tracker”.",
    "Trade Tracker n'est pas disponible pour ce compte.": "Trade Tracker is not available for this account.",
    "Nouvel achat :": "New purchase:",
    // 20 oct. 2026 (Basic n°19, bascule de langue) : chaînes passées à t() sans traduction.
    "Colle d\u2019abord l\u2019adresse de ton agenda.": "Paste your calendar address first.",
    "Rejoins-moi sur Noèsis, mon TimeTracker partagé : {url}\nMon pseudo est « {pseudo} » — retrouve-moi dans Communauté > Rechercher des membres pour t'abonner.": "Join me on Noèsis, my shared TimeTracker: {url}\nMy username is “{pseudo}” — find me in Community > Find members to follow me."
  });

  function translateNameText(raw) {
    var tv = raw && raw.trim();
    if (!tv) return raw;
    var parts = tv.split(/( → | · | › )/);
    var changed = false;
    for (var i = 0; i < parts.length; i += 2) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_NAMES, parts[i])) { parts[i] = DEFAULT_NAMES[parts[i]]; changed = true; }
    }
    return changed ? raw.replace(tv, parts.join('')) : raw;
  }
  function translateNamesIn(node) {
    if (node.nodeType === 3) {
      var out = translateNameText(node.nodeValue);
      if (out !== node.nodeValue) node.nodeValue = out;
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
    if (tag === 'OPTGROUP' && node.label) {
      var l = translateNameText(node.label);
      if (l !== node.label) node.label = l;
    }
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(translateNamesIn);
    var groups = node.querySelectorAll ? node.querySelectorAll('optgroup[label]') : [];
    for (var g = 0; g < groups.length; g++) translateNamesIn(groups[g]);
  }
  var namesObserver = null;
  // Surveille le DOM (textes ajoutés ou modifiés après coup) et traduit les
  // noms par défaut. Sans effet en français.
  function watchDefaultNames(root) {
    if (lang !== 'en' || namesObserver || typeof MutationObserver !== 'function' || !root) return;
    translateNamesIn(root);
    namesObserver = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') translateNamesIn(m.target);
        else if (m.type === 'attributes') {
          var el = m.target;
          if (el.tagName === 'OPTGROUP') translateNamesIn(el);
        } else m.addedNodes.forEach(translateNamesIn);
      });
    });
    namesObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['label'] });
  }

  global.NoesisI18n = { t: t, setLang: setLang, getLang: getLang, translateStaticDom: translateStaticDom, watchDefaultNames: watchDefaultNames };
  global.t = t;
})(window);
