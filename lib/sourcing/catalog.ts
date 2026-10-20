import type { SourceId } from "./types";

// ============================================
// SOURCING — static catalog: the sources and the activity suggestions.
// ============================================

export interface SourceMeta {
    id: SourceId;
    label: string;
    short: string;
    tagline: string;
    /** What this source adds to a lead, in SDR words. */
    yields: string[];
    speed: string;
    cost: string;
    /** Registry search needs a French location; Maps and Apollo are global. */
    franceOnly?: boolean;
}

export const SOURCES: SourceMeta[] = [
    {
        id: "gmaps",
        label: "Google Maps",
        short: "Maps",
        tagline: "Commerces et entreprises locales, tels qu'affichés sur Maps",
        yields: ["Téléphone", "Site web", "Adresse", "Note & avis"],
        // Apify defaults; the Serper engine overrides both via providersStatus().
        speed: "1 à 3 min",
        cost: "Usage Apify",
    },
    {
        id: "annuaire",
        label: "Annuaire des Entreprises",
        short: "Registre",
        tagline: "Registre officiel SIRENE / RNE, données publiques",
        yields: ["SIREN", "Code NAF", "Effectif", "Dirigeants"],
        speed: "Instantané",
        cost: "Gratuit",
        franceOnly: true,
    },
    {
        id: "apollo",
        label: "Apollo.io",
        short: "Apollo",
        tagline: "Base B2B internationale, PME à grands comptes",
        yields: ["Site web", "Taille", "LinkedIn", "Secteur"],
        speed: "Instantané",
        cost: "Crédits Apollo",
    },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<SourceId, SourceMeta>;

/** INSEE headcount bands (tranche_effectif_salarie). */
export const HEADCOUNT_BANDS: { code: string; label: string }[] = [
    { code: "01", label: "1-2" },
    { code: "02", label: "3-5" },
    { code: "03", label: "6-9" },
    { code: "11", label: "10-19" },
    { code: "12", label: "20-49" },
    { code: "21", label: "50-99" },
    { code: "22", label: "100-199" },
    { code: "31", label: "200-249" },
    { code: "32", label: "250-499" },
    { code: "41", label: "500-999" },
    { code: "42", label: "1000-1999" },
    { code: "51", label: "2000+" },
];

export const HEADCOUNT_LABEL = Object.fromEntries(HEADCOUNT_BANDS.map((b) => [b.code, b.label])) as Record<string, string>;

/**
 * Common prospecting activities. `label` is what Google Maps and Apollo
 * search for; `naf` is what the registry filters on (NAF rév. 2).
 */
export const ACTIVITIES: { label: string; naf: string; nafLabel: string }[] = [
    { label: "Plombier", naf: "43.22A", nafLabel: "Installation d'eau et de gaz" },
    { label: "Chauffagiste", naf: "43.22B", nafLabel: "Installation de chauffage et climatisation" },
    { label: "Électricien", naf: "43.21A", nafLabel: "Installation électrique" },
    { label: "Menuisier", naf: "43.32A", nafLabel: "Menuiserie bois et PVC" },
    { label: "Peintre en bâtiment", naf: "43.34Z", nafLabel: "Peinture et vitrerie" },
    { label: "Couvreur", naf: "43.91B", nafLabel: "Travaux de couverture" },
    { label: "Constructeur de maisons", naf: "41.20A", nafLabel: "Construction de maisons individuelles" },
    { label: "Architecte", naf: "71.11Z", nafLabel: "Activités d'architecture" },
    { label: "Bureau d'études", naf: "71.12B", nafLabel: "Ingénierie, études techniques" },
    { label: "Restaurant", naf: "56.10A", nafLabel: "Restauration traditionnelle" },
    { label: "Restauration rapide", naf: "56.10C", nafLabel: "Restauration de type rapide" },
    { label: "Bar", naf: "56.30Z", nafLabel: "Débits de boissons" },
    { label: "Hôtel", naf: "55.10Z", nafLabel: "Hôtels et hébergement similaire" },
    { label: "Boulangerie", naf: "10.71C", nafLabel: "Boulangerie et boulangerie-pâtisserie" },
    { label: "Supermarché", naf: "47.11D", nafLabel: "Supermarchés" },
    { label: "Fleuriste", naf: "47.76Z", nafLabel: "Commerce de détail de fleurs et plantes" },
    { label: "Magasin de vêtements", naf: "47.71Z", nafLabel: "Commerce de détail d'habillement" },
    { label: "Pharmacie", naf: "47.73Z", nafLabel: "Commerce de détail de produits pharmaceutiques" },
    { label: "Médecin généraliste", naf: "86.21Z", nafLabel: "Activité des médecins généralistes" },
    { label: "Dentiste", naf: "86.23Z", nafLabel: "Pratique dentaire" },
    { label: "Kinésithérapeute", naf: "86.90E", nafLabel: "Rééducation, appareillage, podologie" },
    { label: "Vétérinaire", naf: "75.00Z", nafLabel: "Activités vétérinaires" },
    { label: "EHPAD", naf: "87.10A", nafLabel: "Hébergement médicalisé pour personnes âgées" },
    { label: "Aide à domicile", naf: "88.10A", nafLabel: "Aide à domicile" },
    { label: "Coiffeur", naf: "96.02A", nafLabel: "Coiffure" },
    { label: "Institut de beauté", naf: "96.02B", nafLabel: "Soins de beauté" },
    { label: "Salle de sport", naf: "93.13Z", nafLabel: "Activités des centres de culture physique" },
    { label: "Pompes funèbres", naf: "96.03Z", nafLabel: "Services funéraires" },
    { label: "Avocat", naf: "69.10Z", nafLabel: "Activités juridiques" },
    { label: "Expert-comptable", naf: "69.20Z", nafLabel: "Activités comptables" },
    { label: "Agence immobilière", naf: "68.31Z", nafLabel: "Agences immobilières" },
    { label: "Courtier en assurance", naf: "66.22Z", nafLabel: "Agents et courtiers d'assurances" },
    { label: "Banque", naf: "64.19Z", nafLabel: "Autres intermédiations monétaires" },
    { label: "Cabinet de conseil", naf: "70.22Z", nafLabel: "Conseil pour les affaires et la gestion" },
    { label: "Agence de communication", naf: "73.11Z", nafLabel: "Activités des agences de publicité" },
    { label: "Studio de design", naf: "74.10Z", nafLabel: "Activités spécialisées de design" },
    { label: "Organisateur d'événements", naf: "82.30Z", nafLabel: "Organisation de foires, salons, congrès" },
    { label: "Éditeur de logiciels", naf: "62.01Z", nafLabel: "Programmation informatique" },
    { label: "ESN / Conseil informatique", naf: "62.02A", nafLabel: "Conseil en systèmes informatiques" },
    { label: "Garage automobile", naf: "45.20A", nafLabel: "Entretien et réparation de véhicules légers" },
    { label: "Concessionnaire automobile", naf: "45.11Z", nafLabel: "Commerce de voitures et véhicules légers" },
    { label: "Transporteur routier", naf: "49.41A", nafLabel: "Transports routiers de fret interurbains" },
    { label: "Messagerie / Fret express", naf: "52.29A", nafLabel: "Messagerie, fret express" },
    { label: "Entreprise de nettoyage", naf: "81.21Z", nafLabel: "Nettoyage courant des bâtiments" },
    { label: "Sécurité privée", naf: "80.10Z", nafLabel: "Activités de sécurité privée" },
    { label: "Agence d'intérim", naf: "78.20Z", nafLabel: "Activités des agences de travail temporaire" },
    { label: "Organisme de formation", naf: "85.59A", nafLabel: "Formation continue d'adultes" },
    { label: "Mécanique industrielle", naf: "25.62B", nafLabel: "Mécanique industrielle" },
];

const NAF_RE = /^\d{2}\.\d{2}[A-Z]$/;

/** "43.22a" → "43.22A" when the user typed a raw NAF code. */
export function parseNaf(input: string): string | undefined {
    const v = input.trim().toUpperCase();
    return NAF_RE.test(v) ? v : undefined;
}
