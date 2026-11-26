// FAMILLES D'OBJECTIFS (14 nov. 2026, décision d'Émilien) : préparation de l'estimateur, AUCUNE interface. UN SEUL endroit : ce fichier de données.
// Deux niveaux : grandes catégories d'UN mot, petites dedans ; chaque petite porte son niveau d'information : 'oui' (chiffres et sous-objectifs détaillés), 'partielle' (estimation indicative), 'non' (grandes étapes et budget de temps, sans chiffre).
// « Construction » n'est plus une grande catégorie : elle passe sous Événement. Première version, ajustable avec les données. Aucune case « Autre » visible : quand rien ne convient, la famille reste null (jamais un défaut)
// et l'objectif est servi comme 'non' ; le repérage des catégories manquantes passe par objectif_famille_inconnue (server/lib/estimateur.js).
// kw : mots-clés (sans accents, début de mot) du repli sans IA ; l'IA, quand elle est disponible, choisit parmi les identifiants.
const FAMILLES = [
  { id: 'sante', label: 'Santé', petites: [
    { id: 'course', label: 'Course', info: 'oui', kw: ['cour', 'marathon', 'semi', '10 km', '5 km', 'jogg', 'trail'] },
    { id: 'force', label: 'Force', info: 'oui', kw: ['force', 'muscu', 'soulev', 'pompe', 'traction', 'squat', 'gain de masse'] },
    { id: 'poids', label: 'Poids', info: 'oui', kw: ['poids', 'maigr', 'perdre', 'kilos', 'minceur'] },
    { id: 'sommeil', label: 'Sommeil', info: 'partielle', kw: ['sommeil', 'dormir', 'coucher', 'insomn'] },
    { id: 'alimentation', label: 'Alimentation', info: 'partielle', kw: ['aliment', 'nutrition', 'regime', 'manger', 'cuisin'] },
    { id: 'dependance', label: 'Dépendance', info: 'partielle', kw: ['tabac', 'fumer', 'alcool', 'dependan', 'sevrage', 'arreter de'] },
    { id: 'guerison', label: 'Guérison', info: 'non', kw: ['guer', 'maladie', 'blessure', 'readapt', 'chirurg', 'convalesc'] },
  ] },
  { id: 'connaissance', label: 'Connaissance', petites: [
    { id: 'langue', label: 'Langue', info: 'oui', kw: ['langue', 'anglais', 'espagnol', 'allemand', 'italien', 'japonais', 'mandarin', 'parler'] },
    { id: 'diplome', label: 'Diplôme', info: 'oui', kw: ['diplom', 'bacc', 'maitrise', 'doctorat', 'licence', 'universit', 'etudes'] },
    { id: 'certification', label: 'Certification', info: 'oui', kw: ['certif', 'examen', 'permis', 'accredit', 'qualification'] },
    { id: 'lecture', label: 'Lecture', info: 'oui', kw: ['lire', 'lecture', 'livres'] },
    { id: 'competence', label: 'Compétence', info: 'partielle', kw: ['maitriser', 'competence', 'cours ', 'formation'] },
  ] },
  { id: 'art', label: 'Art', petites: [
    { id: 'instrument', label: 'Instrument', info: 'partielle', kw: ['guitare', 'piano', 'violon', 'batterie', 'instrument', 'chant', 'chanter'] },
    { id: 'creation', label: 'Création', info: 'partielle', kw: ['dessin', 'peinture', 'ecrire', 'roman', 'poeme', 'photo', 'film', 'musique', 'composer', 'sculpt', 'art'] },
  ] },
  { id: 'argent', label: 'Argent', petites: [
    { id: 'epargne', label: 'Épargne', info: 'oui', kw: ['epargn', 'economis', 'mettre de cote', 'fonds d urgence'] },
    { id: 'dette', label: 'Dette', info: 'oui', kw: ['rembours', 'dette', 'hypotheque', 'pret', 'credit'] },
    { id: 'budget', label: 'Budget', info: 'oui', kw: ['budget', 'depenses', 'comptabilit'] },
    { id: 'investissement', label: 'Investissement', info: 'partielle', kw: ['invest', 'bourse', 'immobilier', 'retraite', 'placement'] },
    { id: 'revenus', label: 'Hausse de revenus', info: 'non', kw: ['revenu', 'augmentation', 'gagner plus', 'salaire'] },
  ] },
  { id: 'salariat', label: 'Salariat', petites: [
    { id: 'formation-pro', label: 'Formation professionnelle', info: 'partielle', kw: ['formation pro', 'perfectionnement', 'recyclage'] },
    { id: 'emploi', label: 'Emploi et carrière', info: 'non', kw: ['emploi', 'carriere', 'trouver un travail', 'cv', 'entrevue', 'candidature'] },
    { id: 'promotion', label: 'Promotion', info: 'non', kw: ['promotion', 'promu', 'poste de'] },
    { id: 'reorganisation', label: 'Réorganisation', info: 'non', kw: ['reorganis', 'restructur', 'processus', 'equipe de travail'] },
  ] },
  { id: 'entreprise', label: 'Entreprise', petites: [
    { id: 'lancement', label: 'Lancement', info: 'non', kw: ['lancer', 'lancement', 'startup', 'fonder', 'creer mon entreprise', 'incorpor'] },
    { id: 'croissance', label: 'Croissance', info: 'non', kw: ['croissance', 'clients', 'ventes', 'chiffre d affaires', 'marketing', 'produit', 'application', 'site web'] },
    { id: 'reseau', label: 'Réseau', info: 'non', kw: ['reseau', 'partenaire', 'networking', 'contacts'] },
  ] },
  { id: 'relations', label: 'Relations', petites: [
    { id: 'famille', label: 'Famille', info: 'partielle', kw: ['famille', 'parents', 'enfant', 'frere', 'soeur', 'grand-parent'] },
    { id: 'couple', label: 'Couple', info: 'partielle', kw: ['couple', 'conjoint', 'conjointe', 'mariage de', 'amoureu'] },
    { id: 'amis', label: 'Amis', info: 'partielle', kw: ['amis', 'ami ', 'amitie', 'sortir', 'voisin'] },
  ] },
  { id: 'domestique', label: 'Domestique', petites: [
    { id: 'entretien', label: 'Entretien', info: 'oui', kw: ['entretien', 'menage', 'ranger', 'nettoy', 'lessive', 'reparer'] },
    { id: 'administratif', label: 'Administratif', info: 'oui', kw: ['administratif', 'impot', 'papiers', 'paperasse', 'declaration', 'assurance'] },
    { id: 'jardin', label: 'Jardin', info: 'partielle', kw: ['jardin', 'potager', 'pelouse', 'plantes', 'semer'] },
  ] },
  { id: 'evenement', label: 'Événement', petites: [
    { id: 'maison', label: 'Maison', info: 'partielle', kw: ['maison', 'construire une maison', 'chalet'] },
    { id: 'cabane', label: 'Cabane', info: 'partielle', kw: ['cabane', 'remise', 'cabanon'] },
    { id: 'meuble', label: 'Meuble', info: 'partielle', kw: ['meuble', 'table', 'bibliotheque', 'etagere'] },
    { id: 'renovation', label: 'Rénovation', info: 'partielle', kw: ['renov', 'travaux', 'peinturer', 'cuisine', 'salle de bain'] },
    { id: 'demenagement', label: 'Déménagement', info: 'partielle', kw: ['demenag', 'emmenag', 'boites'] },
    { id: 'voyage', label: 'Voyage', info: 'partielle', kw: ['voyage', 'vacances', 'partir en', 'tour du monde', 'road trip'] },
    { id: 'mariage', label: 'Mariage', info: 'partielle', kw: ['mariage', 'noces', 'se marier'] },
    { id: 'fete', label: 'Fête', info: 'partielle', kw: ['fete', 'anniversaire', 'soiree', 'reception', 'party'] },
    { id: 'logistique', label: 'Logistique', info: 'partielle', kw: ['logistique', 'organiser un', 'evenement', 'conference', 'reunion'] },
  ] },
  { id: 'esprit', label: 'Esprit', petites: [
    { id: 'habitude', label: 'Méditation et habitude', info: 'oui', kw: ['mediter', 'meditation', 'habitude', 'routine', 'journal', 'gratitude'] },
    { id: 'introspection', label: 'Introspection', info: 'partielle', kw: ['introspect', 'therapie', 'comprendre', 'emotions', 'confiance en moi'] },
    { id: 'spiritualite', label: 'Spiritualité', info: 'partielle', kw: ['spirit', 'priere', 'foi', 'religion', 'retraite spirituelle'] },
  ] },
];
const INFO = ['oui', 'partielle', 'non'];
const PETITES = FAMILLES.reduce((a, g) => a.concat(g.petites.map((p) => Object.assign({ grande: g.id, grandeLabel: g.label }, p))), []);
const byId = (id) => PETITES.find((p) => p.id === id) || null;
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Niveau d'information d'une petite catégorie ; null / inconnue = 'non' (grandes étapes et budget de temps, sans chiffre).
function infoDe(id) { const p = byId(id); return p ? p.info : 'non'; }
// Repli SANS IA : la petite catégorie dont les mots-clés correspondent le mieux (au début d'un mot) ; égalité ou aucun mot : null (jamais un défaut).
function lexical(title, description) {
  const text = ' ' + norm(title) + ' ' + norm(description).slice(0, 600) + ' ';
  let best = null, bestScore = 0, tie = false;
  PETITES.forEach((p) => {
    const sc = p.kw.reduce((a, k) => a + (text.indexOf(' ' + norm(k)) >= 0 ? 1 : 0), 0);
    if (sc > bestScore) { best = p; bestScore = sc; tie = false; } else if (sc === bestScore && sc > 0) tie = true;
  });
  return bestScore > 0 && !tie ? best.id : null;
}

module.exports = { FAMILLES, PETITES, INFO, byId, infoDe, lexical, norm };
