import { integrationKey } from "@/lib/integrations/keys";
/**
 * Pappers API Service
 * Integrates with Pappers.fr API to search and fetch company information
 */

const PAPPERS_API_BASE = "https://api.pappers.fr/v2";

export interface PappersCompany {
    nom_entreprise: string;
    siret: string;
    siren: string;
    numero_tva_intracommunautaire?: string;
    siege: {
        adresse_ligne_1: string;
        code_postal: string;
        ville: string;
        pays?: string;
    };
    email?: string;
    telephone?: string;
    forme_juridique?: string;
    activite_principale?: string;
}

export interface PappersSearchResult {
    resultats: Array<{
        nom_entreprise: string;
        siret: string;
        siren: string;
        numero_tva_intracommunautaire?: string;
        siege: {
            adresse_ligne_1: string;
            code_postal: string;
            ville: string;
            pays?: string;
        };
    }>;
}

export class PappersService {
    // Read on each call: the key can be changed from Paramètres without a restart.
    private get apiKey(): string {
        return integrationKey("PAPPERS_API_KEY") || "";
    }

    /**
     * Search companies by name or SIRET
     */
    async searchCompany(query: string): Promise<PappersCompany[]> {
        if (!this.apiKey) {
            throw new Error("PAPPERS_API_KEY not configured");
        }

        try {
            const url = new URL(`${PAPPERS_API_BASE}/recherche`);
            url.searchParams.set("api_token", this.apiKey);
            url.searchParams.set("q", query);
            url.searchParams.set("par_page", "10");

            const response = await fetch(url.toString());
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Pappers API error: ${response.status}`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    } else if (errorJson.error) {
                        errorMessage = errorJson.error;
                    }
                } catch {
                    // If JSON parsing fails, use the raw text
                    errorMessage = errorText || errorMessage;
                }
                
                const error: any = new Error(errorMessage);
                error.statusCode = response.status;
                error.isQuotaError = response.status === 401;
                throw error;
            }

            const data: PappersSearchResult = await response.json();
            
            return data.resultats.map((result) => ({
                nom_entreprise: result.nom_entreprise,
                siret: result.siret,
                siren: result.siren,
                numero_tva_intracommunautaire: result.numero_tva_intracommunautaire,
                siege: result.siege,
            }));
        } catch (error) {
            console.error("Pappers search error:", error);
            throw error;
        }
    }

    /**
     * Get full company details by SIRET
     */
    async getCompanyDetails(siret: string): Promise<PappersCompany | null> {
        if (!this.apiKey) {
            throw new Error("PAPPERS_API_KEY not configured");
        }

        try {
            const url = new URL(`${PAPPERS_API_BASE}/entreprise`);
            url.searchParams.set("api_token", this.apiKey);
            url.searchParams.set("siret", siret);

            const response = await fetch(url.toString());
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                const errorText = await response.text();
                let errorMessage = `Pappers API error: ${response.status}`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    } else if (errorJson.error) {
                        errorMessage = errorJson.error;
                    }
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                const error: any = new Error(errorMessage);
                error.statusCode = response.status;
                error.isQuotaError = response.status === 401;
                throw error;
            }

            const data: PappersCompany = await response.json();
            return data;
        } catch (error) {
            console.error("Pappers getCompanyDetails error:", error);
            throw error;
        }
    }

    /**
     * Convert Pappers company to BillingClient format
     */
    static toBillingClient(pappersCompany: PappersCompany) {
        return {
            legalName: pappersCompany.nom_entreprise,
            address: pappersCompany.siege.adresse_ligne_1,
            city: pappersCompany.siege.ville,
            postalCode: pappersCompany.siege.code_postal,
            country: pappersCompany.siege.pays || "France",
            siret: pappersCompany.siret,
            vatNumber: pappersCompany.numero_tva_intracommunautaire || null,
            email: pappersCompany.email || null,
            phone: pappersCompany.telephone || null,
        };
    }
}

export const pappersService = new PappersService();
