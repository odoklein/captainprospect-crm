"use client";

import { useState } from "react";
import { Card, Select, Button, Input } from "@/components/ui";
import { Loader2, Users, Building2, Globe, AlertCircle, CheckCircle2, Info, Search, Zap } from "lucide-react";
import { searchCompanies, getMarketStats } from "@/app/actions/mission-wizard";
import { ExploriumSearchFilters, ExploriumSearchResult } from "@/lib/explorium";

interface AudienceFilterProps {
    filters: ExploriumSearchFilters;
    onChange: (filters: ExploriumSearchFilters) => void;
}

export function AudienceFilter({ filters, onChange }: AudienceFilterProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [result, setResult] = useState<ExploriumSearchResult | null>(null);
    const [stats, setStats] = useState<{ totalCount: number; isMock?: boolean; error?: string } | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Manual search/preview function - only called when user clicks button
    const handlePreview = async () => {
        setHasSearched(true);
        
        // Get stats first
        setIsLoadingStats(true);
        try {
            const statsRes = await getMarketStats(filters);
            if (statsRes.success && statsRes.data) {
                setStats(statsRes.data);
            }
        } catch (err) {
            console.error("Stats error", err);
        } finally {
            setIsLoadingStats(false);
        }

        // Then get sample results
        setIsLoading(true);
        try {
            const res = await searchCompanies(filters);
            if (res.success && res.data) {
                setResult(res.data);
            } else {
                setResult({
                    totalMatches: 0,
                    sample: [],
                    isMock: true,
                    error: res.error || "Failed to search"
                });
            }
        } catch (err) {
            console.error("Search error", err);
            setResult({
                totalMatches: 0,
                sample: [],
                isMock: true,
                error: "Failed to search companies"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFilterChange = (key: keyof ExploriumSearchFilters, value: string) => {
        onChange({ ...filters, [key]: value || undefined });
        // Reset search state when filters change
        if (hasSearched) {
            setHasSearched(false);
            setResult(null);
            setStats(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Error/Warning Banner */}
            {result?.error && (
                <Card className="p-4 bg-amber-50 border-amber-200">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <div className="font-medium text-amber-900 mb-1">Attention</div>
                            <div className="text-sm text-amber-700">{result.error}</div>
                            {result.isMock && (
                                <div className="text-xs text-amber-600 mt-2">
                                    Les données affichées sont des données de démonstration. Configurez votre clé API Explorium pour utiliser les données réelles.
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Filters Section */}
                <div className="md:col-span-1 space-y-4">
                    <Card className="p-5 h-full">
                        <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary-600" />
                            Critères de ciblage
                        </h3>

                        <div className="space-y-4">
                            {/* Basic Filters */}
                            <Select
                                label="Pays"
                                placeholder="Tous les pays"
                                options={[
                                    { value: "France", label: "France" },
                                    { value: "USA", label: "États-Unis" },
                                    { value: "UK", label: "Royaume-Uni" },
                                    { value: "Germany", label: "Allemagne" },
                                    { value: "Canada", label: "Canada" },
                                    { value: "Spain", label: "Espagne" },
                                    { value: "Italy", label: "Italie" },
                                ]}
                                value={filters.country || ""}
                                onChange={(val) => handleFilterChange("country", val)}
                            />

                            <Select
                                label="Région/État"
                                placeholder="Toute région"
                                options={[
                                    { value: "ca", label: "Californie (US)" },
                                    { value: "ny", label: "New York (US)" },
                                    { value: "tx", label: "Texas (US)" },
                                    { value: "fl", label: "Floride (US)" },
                                    { value: "il", label: "Illinois (US)" },
                                    { value: "pa", label: "Pennsylvanie (US)" },
                                    { value: "idf", label: "Île-de-France (FR)" },
                                    { value: "ara", label: "Auvergne-Rhône-Alpes (FR)" },
                                    { value: "pdl", label: "Pays de la Loire (FR)" },
                                ]}
                                value={filters.region || ""}
                                onChange={(val) => handleFilterChange("region", val)}
                            />

                            <Input
                                label="Ville"
                                placeholder="Ex: Paris, San Francisco"
                                value={filters.city || ""}
                                onChange={(e) => handleFilterChange("city", e.target.value)}
                            />

                            <Select
                                label="Effectif"
                                placeholder="Tout effectif"
                                options={[
                                    { value: "1-10", label: "1 - 10 employés" },
                                    { value: "11-50", label: "11 - 50 employés" },
                                    { value: "51-200", label: "51 - 200 employés" },
                                    { value: "201-500", label: "201 - 500 employés" },
                                    { value: "501-1000", label: "501 - 1000 employés" },
                                    { value: "1001-5000", label: "1001 - 5000 employés" },
                                    { value: "5001-10000", label: "5001 - 10000 employés" },
                                    { value: "10001+", label: "10001+ employés" },
                                ]}
                                value={filters.headcountRange || ""}
                                onChange={(val) => handleFilterChange("headcountRange", val)}
                            />

                            <Select
                                label="Chiffre d'affaires"
                                placeholder="Tout CA"
                                options={[
                                    { value: "0-500K", label: "< 500K €" },
                                    { value: "500K-1M", label: "500K - 1M €" },
                                    { value: "1M-10M", label: "1M - 10M €" },
                                    { value: "10M-25M", label: "10M - 25M €" },
                                    { value: "25M-50M", label: "25M - 50M €" },
                                    { value: "50M-100M", label: "50M - 100M €" },
                                    { value: "100M-200M", label: "100M - 200M €" },
                                    { value: "200M-500M", label: "200M - 500M €" },
                                    { value: "500M-1B", label: "500M - 1B €" },
                                    { value: "1B-10B", label: "1B - 10B €" },
                                    { value: "10B-100B", label: "10B - 100B €" },
                                ]}
                                value={filters.revenueRange || ""}
                                onChange={(val) => handleFilterChange("revenueRange", val)}
                            />

                            {/* Preview Button */}
                            <Button
                                variant="primary"
                                onClick={handlePreview}
                                disabled={isLoading || isLoadingStats}
                                className="w-full"
                            >
                                {isLoading || isLoadingStats ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Recherche en cours...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4 mr-2" />
                                        Prévisualiser les résultats
                                    </>
                                )}
                            </Button>

                            {/* Info about credits */}
                            {!hasSearched && (
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                                    <Info className="w-3 h-3 inline mr-1" />
                                    Configurez vos filtres puis cliquez sur "Prévisualiser" pour voir les résultats. 
                                    Chaque prévisualisation consomme des crédits Explorium.
                                </div>
                            )}

                            {/* Advanced Filters Toggle */}
                            <div className="pt-2 border-t border-slate-200">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="w-full justify-between"
                                >
                                    <span className="text-sm flex items-center gap-2">
                                        <Zap className="w-3 h-3" />
                                        Filtres avancés
                                    </span>
                                    <span className="text-xs text-slate-400">{showAdvanced ? "Masquer" : "Afficher"}</span>
                                </Button>
                            </div>

                            {/* Advanced Filters */}
                            {showAdvanced && (
                                <div className="space-y-4 pt-2 border-t border-slate-200">
                                    <Select
                                        label="Catégorie LinkedIn"
                                        placeholder="Toute catégorie"
                                        options={[
                                            { value: "software development", label: "Développement logiciel" },
                                            { value: "financial services", label: "Services financiers" },
                                            { value: "hospitals and health care", label: "Hôpitaux et santé" },
                                            { value: "retail", label: "Commerce de détail" },
                                            { value: "management consulting", label: "Conseil en gestion" },
                                            { value: "investment banking", label: "Banque d'investissement" },
                                            { value: "marketing and advertising", label: "Marketing et publicité" },
                                            { value: "information technology and services", label: "IT et services" },
                                            { value: "telecommunications", label: "Télécommunications" },
                                        ]}
                                        value={filters.linkedinCategory || ""}
                                        onChange={(val) => handleFilterChange("linkedinCategory", val)}
                                    />

                                    <Input
                                        label="Code NAICS"
                                        placeholder="Ex: 541512, 62"
                                        value={filters.naicsCategory || ""}
                                        onChange={(e) => handleFilterChange("naicsCategory", e.target.value)}
                                    />

                                    <Input
                                        label="Catégorie Google"
                                        placeholder="Ex: Retail, Paving contractor"
                                        value={filters.googleCategory || ""}
                                        onChange={(e) => handleFilterChange("googleCategory", e.target.value)}
                                    />

                                    <Select
                                        label="Âge de l'entreprise"
                                        placeholder="Tout âge"
                                        options={[
                                            { value: "0-3", label: "0 - 3 ans" },
                                            { value: "3-6", label: "3 - 6 ans" },
                                            { value: "6-10", label: "6 - 10 ans" },
                                            { value: "10-20", label: "10 - 20 ans" },
                                            { value: "20+", label: "20+ ans" },
                                        ]}
                                        value={filters.companyAge || ""}
                                        onChange={(val) => handleFilterChange("companyAge", val)}
                                    />

                                    <Select
                                        label="Nombre de sites"
                                        placeholder="Tout nombre"
                                        options={[
                                            { value: "0-1", label: "1 site" },
                                            { value: "2-5", label: "2 - 5 sites" },
                                            { value: "6-20", label: "6 - 20 sites" },
                                            { value: "21-50", label: "21 - 50 sites" },
                                            { value: "51-100", label: "51 - 100 sites" },
                                            { value: "101-1000", label: "101 - 1000 sites" },
                                            { value: "1001+", label: "1001+ sites" },
                                        ]}
                                        value={filters.numberOfLocations || ""}
                                        onChange={(val) => handleFilterChange("numberOfLocations", val)}
                                    />

                                    <Select
                                        label="Catégorie Tech Stack"
                                        placeholder="Toute catégorie"
                                        options={[
                                            { value: "CRM", label: "CRM" },
                                            { value: "Marketing", label: "Marketing" },
                                            { value: "Cloud Services", label: "Services Cloud" },
                                            { value: "Cybersecurity", label: "Cybersécurité" },
                                            { value: "Business Intelligence And Analytics", label: "BI & Analytics" },
                                            { value: "Devops And Development", label: "DevOps & Développement" },
                                        ]}
                                        value={filters.techStackCategory || ""}
                                        onChange={(val) => handleFilterChange("techStackCategory", val)}
                                    />

                                    <Input
                                        label="Technologie spécifique"
                                        placeholder="Ex: JavaScript, Salesforce, AWS"
                                        value={filters.techStackTech || ""}
                                        onChange={(e) => handleFilterChange("techStackTech", e.target.value)}
                                    />

                                    <Input
                                        label="Mots-clés site web"
                                        placeholder="Ex: machine learning, sustainability"
                                        value={filters.websiteKeywords || ""}
                                        onChange={(e) => handleFilterChange("websiteKeywords", e.target.value)}
                                    />

                                    <Select
                                        label="Industrie (générique)"
                                        placeholder="Toute industrie"
                                        options={[
                                            { value: "Technology", label: "Technologie" },
                                            { value: "Finance", label: "Finance" },
                                            { value: "Healthcare", label: "Santé" },
                                            { value: "Retail", label: "Commerce" },
                                            { value: "Consulting", label: "Conseil" },
                                        ]}
                                        value={filters.industry || ""}
                                        onChange={(val) => handleFilterChange("industry", val)}
                                    />
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Results Section */}
                <div className="md:col-span-2 space-y-4">
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <Card className="p-5 flex flex-col justify-center items-center bg-primary-50 border-primary-100">
                            <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Taille du marché
                            </div>
                            <div className="text-3xl font-bold text-primary-600 flex items-center gap-2">
                                {isLoadingStats ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <>
                                        {stats?.totalCount?.toLocaleString() || "0"}
                                        {stats?.isMock && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
                                                Mock
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="text-xs text-primary-400 mt-2 flex items-center gap-1">
                                {stats?.isMock ? (
                                    <AlertCircle className="w-3 h-3" />
                                ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                )}
                                {stats?.isMock ? "Données de démo" : "Données Explorium"}
                            </div>
                        </Card>
                        <Card className="p-5 flex flex-col justify-center items-center">
                            <div className="text-sm font-medium text-slate-500 mb-1">Aperçu résultats</div>
                            <div className="text-3xl font-bold text-slate-700 flex items-center gap-2">
                                {isLoading ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <>
                                        {result?.sample?.length || 0}
                                        {result?.isMock && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
                                                Mock
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="text-xs text-slate-400 mt-2">Échantillon affiché</div>
                        </Card>
                    </div>

                    {/* Info Banner */}
                    {stats && !stats.isMock && stats.totalCount > 0 && (
                        <Card className="p-3 bg-blue-50 border-blue-100">
                            <div className="flex items-start gap-2">
                                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-blue-700">
                                    <strong>{stats.totalCount.toLocaleString()}</strong> entreprises correspondent à vos critères. 
                                    L'aperçu ci-dessous montre un échantillon de 10 résultats.
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Preview Table */}
                    {!hasSearched ? (
                        <Card className="overflow-hidden">
                            <div className="p-12 text-center">
                                <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="font-medium text-slate-700 mb-2">Aucune recherche effectuée</h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    Configurez vos filtres et cliquez sur "Prévisualiser les résultats" pour voir les entreprises correspondantes.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <Card className="overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <h3 className="font-medium text-sm text-slate-700">Aperçu des résultats</h3>
                                {result && !result.isMock && (
                                    <span className="text-xs text-slate-500">
                                        {result.totalMatches.toLocaleString()} résultats au total
                                    </span>
                                )}
                            </div>
                            <div className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <div className="p-8 flex justify-center text-slate-400">
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                        Recherche en cours...
                                    </div>
                                ) : result?.sample?.length ? (
                                    result.sample.map((company) => (
                                        <div key={company.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex-1">
                                                <div className="font-medium text-slate-900">{company.name}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                    {company.industry && <span>{company.industry}</span>}
                                                    {company.industry && company.revenue && <span>•</span>}
                                                    {company.revenue && <span>{company.revenue}</span>}
                                                    {company.size && (
                                                        <>
                                                            {(company.industry || company.revenue) && <span>•</span>}
                                                            <span>{company.size} employés</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {company.website && (
                                                <a 
                                                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className="text-slate-400 hover:text-primary-600 ml-4"
                                                >
                                                    <Globe className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-slate-400 text-sm">
                                        {result?.error ? (
                                            <div>
                                                <AlertCircle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
                                                {result.error}
                                            </div>
                                        ) : (
                                            "Aucun résultat trouvé pour ces filtres"
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
