// ============================================
// EMAIL TEMPLATE CONSTANTS (client-safe)
// Shared between template-variables service and UI (variable palette)
// ============================================

export const SUPPORTED_TEMPLATE_VARIABLES = [
    { name: 'firstName', description: 'Prénom du contact', category: 'contact' },
    { name: 'lastName', description: 'Nom du contact', category: 'contact' },
    { name: 'fullName', description: 'Nom complet du contact', category: 'contact' },
    { name: 'title', description: 'Titre/Poste du contact', category: 'contact' },
    { name: 'email', description: 'Email du contact', category: 'contact' },
    { name: 'phone', description: 'Téléphone du contact', category: 'contact' },
    { name: 'linkedin', description: 'Profil LinkedIn', category: 'contact' },
    { name: 'company', description: "Nom de l'entreprise", category: 'company' },
    { name: 'companyName', description: "Nom de l'entreprise", category: 'company' },
    { name: 'industry', description: "Secteur d'activité", category: 'company' },
    { name: 'website', description: 'Site web', category: 'company' },
    { name: 'country', description: 'Pays', category: 'company' },
    { name: 'companySize', description: "Taille de l'entreprise", category: 'company' },
    { name: 'senderName', description: "Nom de l'expéditeur", category: 'sender' },
    { name: 'senderTitle', description: "Poste de l'expéditeur", category: 'sender' },
    { name: 'senderEmail', description: "Email de l'expéditeur", category: 'sender' },
    { name: 'currentDate', description: 'Date du jour', category: 'date' },
    { name: 'currentDay', description: 'Jour de la semaine', category: 'date' },
    { name: 'currentMonth', description: 'Mois en cours', category: 'date' },
    { name: 'currentYear', description: 'Année en cours', category: 'date' },
] as const;
