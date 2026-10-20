// ============================================
// SOURCING — French régions and départements for the location picker.
//
// Picked places travel as location chips (see parseLocation): the registry
// reads the codes, Google Maps / Apollo read the names.
// ============================================

export interface Departement {
    code: string;
    name: string;
}

export interface Region {
    name: string;
    departements: Departement[];
}

const d = (code: string, name: string): Departement => ({ code, name });

export const REGIONS: Region[] = [
    {
        name: "Auvergne-Rhône-Alpes",
        departements: [
            d("01", "Ain"), d("03", "Allier"), d("07", "Ardèche"), d("15", "Cantal"), d("26", "Drôme"), d("38", "Isère"),
            d("42", "Loire"), d("43", "Haute-Loire"), d("63", "Puy-de-Dôme"), d("69", "Rhône"), d("73", "Savoie"), d("74", "Haute-Savoie"),
        ],
    },
    {
        name: "Bourgogne-Franche-Comté",
        departements: [
            d("21", "Côte-d'Or"), d("25", "Doubs"), d("39", "Jura"), d("58", "Nièvre"), d("70", "Haute-Saône"),
            d("71", "Saône-et-Loire"), d("89", "Yonne"), d("90", "Territoire de Belfort"),
        ],
    },
    { name: "Bretagne", departements: [d("22", "Côtes-d'Armor"), d("29", "Finistère"), d("35", "Ille-et-Vilaine"), d("56", "Morbihan")] },
    {
        name: "Centre-Val de Loire",
        departements: [d("18", "Cher"), d("28", "Eure-et-Loir"), d("36", "Indre"), d("37", "Indre-et-Loire"), d("41", "Loir-et-Cher"), d("45", "Loiret")],
    },
    { name: "Corse", departements: [d("2A", "Corse-du-Sud"), d("2B", "Haute-Corse")] },
    {
        name: "Grand Est",
        departements: [
            d("08", "Ardennes"), d("10", "Aube"), d("51", "Marne"), d("52", "Haute-Marne"), d("54", "Meurthe-et-Moselle"),
            d("55", "Meuse"), d("57", "Moselle"), d("67", "Bas-Rhin"), d("68", "Haut-Rhin"), d("88", "Vosges"),
        ],
    },
    { name: "Hauts-de-France", departements: [d("02", "Aisne"), d("59", "Nord"), d("60", "Oise"), d("62", "Pas-de-Calais"), d("80", "Somme")] },
    {
        name: "Île-de-France",
        departements: [
            d("75", "Paris"), d("77", "Seine-et-Marne"), d("78", "Yvelines"), d("91", "Essonne"),
            d("92", "Hauts-de-Seine"), d("93", "Seine-Saint-Denis"), d("94", "Val-de-Marne"), d("95", "Val-d'Oise"),
        ],
    },
    { name: "Normandie", departements: [d("14", "Calvados"), d("27", "Eure"), d("50", "Manche"), d("61", "Orne"), d("76", "Seine-Maritime")] },
    {
        name: "Nouvelle-Aquitaine",
        departements: [
            d("16", "Charente"), d("17", "Charente-Maritime"), d("19", "Corrèze"), d("23", "Creuse"), d("24", "Dordogne"), d("33", "Gironde"),
            d("40", "Landes"), d("47", "Lot-et-Garonne"), d("64", "Pyrénées-Atlantiques"), d("79", "Deux-Sèvres"), d("86", "Vienne"), d("87", "Haute-Vienne"),
        ],
    },
    {
        name: "Occitanie",
        departements: [
            d("09", "Ariège"), d("11", "Aude"), d("12", "Aveyron"), d("30", "Gard"), d("31", "Haute-Garonne"), d("32", "Gers"), d("34", "Hérault"),
            d("46", "Lot"), d("48", "Lozère"), d("65", "Hautes-Pyrénées"), d("66", "Pyrénées-Orientales"), d("81", "Tarn"), d("82", "Tarn-et-Garonne"),
        ],
    },
    {
        name: "Pays de la Loire",
        departements: [d("44", "Loire-Atlantique"), d("49", "Maine-et-Loire"), d("53", "Mayenne"), d("72", "Sarthe"), d("85", "Vendée")],
    },
    {
        name: "Provence-Alpes-Côte d'Azur",
        departements: [
            d("04", "Alpes-de-Haute-Provence"), d("05", "Hautes-Alpes"), d("06", "Alpes-Maritimes"),
            d("13", "Bouches-du-Rhône"), d("83", "Var"), d("84", "Vaucluse"),
        ],
    },
    {
        name: "Outre-mer",
        departements: [d("971", "Guadeloupe"), d("972", "Martinique"), d("973", "Guyane"), d("974", "La Réunion"), d("976", "Mayotte")],
    },
];

export const DEPARTEMENTS: Departement[] = REGIONS.flatMap((r) => r.departements);
export const METRO_DEPARTEMENTS: Departement[] = DEPARTEMENTS.filter((x) => x.code.length === 2);

// ============================================
// Location chips. Locations stay plain strings (session storage, API schema),
// the suffix tells the level:
//   "Rhône (69)"            département
//   "Lyon (69)"             ville, disambiguated by its département
//   "Bretagne (région)"     région
//   "Belgique (pays)"       pays
//   anything else           free text (city, postcode, "33"…)
// ============================================

export interface Country {
    iso: string;
    name: string;
}

export const COUNTRIES: Country[] = [
    { iso: "FR", name: "France" },
    { iso: "BE", name: "Belgique" },
    { iso: "CH", name: "Suisse" },
    { iso: "LU", name: "Luxembourg" },
    { iso: "MC", name: "Monaco" },
    { iso: "CA", name: "Canada" },
    { iso: "MA", name: "Maroc" },
    { iso: "TN", name: "Tunisie" },
    { iso: "DZ", name: "Algérie" },
    { iso: "SN", name: "Sénégal" },
    { iso: "CI", name: "Côte d'Ivoire" },
    { iso: "ES", name: "Espagne" },
    { iso: "PT", name: "Portugal" },
    { iso: "IT", name: "Italie" },
    { iso: "DE", name: "Allemagne" },
    { iso: "NL", name: "Pays-Bas" },
    { iso: "GB", name: "Royaume-Uni" },
    { iso: "IE", name: "Irlande" },
    { iso: "US", name: "États-Unis" },
];

export const deptChip = (x: Departement) => `${x.name} (${x.code})`;
export const villeChip = (name: string, deptCode: string) => `${name} (${deptCode})`;
export const regionChip = (r: Region) => `${r.name} (région)`;
export const countryChip = (c: Country) => `${c.name} (pays)`;

export type ParsedLocation =
    | { kind: "departement"; name: string; code: string }
    | { kind: "ville"; name: string; deptCode: string }
    | { kind: "region"; name: string; region: Region }
    | { kind: "pays"; name: string; iso: string }
    | { kind: "libre"; name: string };

const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();

export function parseLocation(location: string): ParsedLocation {
    const v = location.trim();
    const m = v.match(/^(.+?)\s*\(([^()]+)\)$/);
    if (!m) return { kind: "libre", name: v };
    const [, name, tag] = m;
    if (/^région$/i.test(tag)) {
        const region = REGIONS.find((r) => norm(r.name) === norm(name));
        return region ? { kind: "region", name: region.name, region } : { kind: "libre", name: v };
    }
    if (/^pays$/i.test(tag)) {
        const c = COUNTRIES.find((x) => norm(x.name) === norm(name));
        return c ? { kind: "pays", name: c.name, iso: c.iso } : { kind: "libre", name: v };
    }
    const code = tag.toUpperCase();
    if (/^(\d{2}|2[AB]|97\d)$/.test(code) && DEPT_NAME[code]) {
        return norm(DEPT_NAME[code]) === norm(name)
            ? { kind: "departement", name: DEPT_NAME[code], code }
            : { kind: "ville", name, deptCode: code };
    }
    return { kind: "libre", name: v };
}

/**
 * Google Maps search area + country for a location chip, plus the map zoom
 * that roughly frames that area (Serper needs a GPS viewport past page 1).
 */
export function placeForMaps(location: string): { place: string; iso: string; zoom: number } {
    const p = parseLocation(location);
    switch (p.kind) {
        // Several département names are also towns or rivers (Vienne, Nord, Lot, Var).
        case "departement":
            return { place: `département ${p.name}, France`, iso: "FR", zoom: 10 };
        case "ville":
            return { place: `${p.name} ${p.deptCode}, France`, iso: "FR", zoom: 13 };
        case "region":
            return { place: `région ${p.name}, France`, iso: "FR", zoom: 8 };
        case "pays":
            return { place: p.name, iso: p.iso, zoom: 6 };
        default: {
            // Bare "33" / "2A" typed as free text: still a département for Maps.
            const code = p.name.toUpperCase();
            if (DEPT_NAME[code]) return { place: `département ${DEPT_NAME[code]}, France`, iso: "FR", zoom: 10 };
            if (/^\d{5}$/.test(p.name)) return { place: `${p.name}, France`, iso: "FR", zoom: 13 };
            return { place: p.name, iso: "FR", zoom: 12 };
        }
    }
}

/** Plain place name for providers that take free text (Apollo). */
export function placeName(location: string): string {
    return parseLocation(location).name;
}

/** Postcode → département code ("69003" → "69", "20000" → Corse, "97411" → "974"). */
export function deptFromPostcode(postalCode?: string): string | undefined {
    if (!postalCode || !/^\d{5}$/.test(postalCode)) return undefined;
    if (postalCode.startsWith("97")) return postalCode.slice(0, 3);
    if (postalCode.startsWith("20")) return Number(postalCode) < 20200 ? "2A" : "2B";
    return postalCode.slice(0, 2);
}

export const DEPT_NAME: Record<string, string> = Object.fromEntries(DEPARTEMENTS.map((x) => [x.code, x.name]));
