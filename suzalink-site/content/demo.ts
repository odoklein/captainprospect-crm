/** Textes de la page /demo et du formulaire de demande de démo. */

export const demo = {
  meta: {
    title: "Demander une démo",
    description:
      "Voyez Suzalink sur vos cas d'usage : file d'appels, téléphonie Allo et OnOff, fiche de RDV générée par l'IA et instance dédiée.",
  },
  eyebrow: "Démo",
  title: "Voyez Suzalink sur vos cas",
  subtitle: "Dites-nous qui vous êtes : nous vous recontactons pour fixer un créneau.",
  points: [
    "La file d'appels et les résultats en 1 clic",
    "La fiche de RDV générée par l'IA",
    "Le tableau de bord manager et le portail client",
    "L'instance dédiée et la marque blanche",
  ],
  form: {
    legend: "Vos coordonnées",
    requiredNote: "Tous les champs sont obligatoires.",
    fields: {
      name: { label: "Nom complet", placeholder: "Camille Dupont", autoComplete: "name" },
      email: { label: "Email professionnel", placeholder: "camille@entreprise.fr", autoComplete: "email" },
      company: { label: "Entreprise", placeholder: "Nom de votre entreprise", autoComplete: "organization" },
      teamSize: { label: "Taille de l'équipe commerciale", placeholder: "Choisissez une taille" },
    },
    teamSizes: [
      { value: "1", label: "1 personne" },
      { value: "2-5", label: "2 à 5 personnes" },
      { value: "6-10", label: "6 à 10 personnes" },
      { value: "11-30", label: "11 à 30 personnes" },
      { value: "30+", label: "Plus de 30 personnes" },
    ],
    errors: {
      nameRequired: "Indiquez votre nom.",
      nameTooLong: "Votre nom doit faire moins de 120 caractères.",
      emailRequired: "Indiquez votre email professionnel.",
      emailInvalid: "Cet email n'est pas valide. Exemple : camille@entreprise.fr",
      companyRequired: "Indiquez le nom de votre entreprise.",
      companyTooLong: "Le nom de l'entreprise doit faire moins de 160 caractères.",
      teamSizeRequired: "Choisissez la taille de votre équipe.",
      summary: (n: number) =>
        n === 1 ? "1 champ est à corriger." : `${n} champs sont à corriger.`,
      server: "L'envoi a échoué. Réessayez dans un instant.",
    },
    consent:
      "En envoyant ce formulaire, vous acceptez que Suzalink utilise ces informations pour vous recontacter au sujet de votre démo.",
    submit: "Demander une démo",
    submitting: "Envoi en cours…",
    success: {
      title: "Merci, c'est envoyé.",
      body: "Notre équipe vous recontacte par email pour fixer le créneau de votre démo.",
      back: "Retour à l'accueil",
    },
    planLabel: "Offre qui vous intéresse",
  },
};
