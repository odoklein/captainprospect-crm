"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Card,
    Badge,
    Button,
    Select,
    Input,
    useToast,
    DataTable,
    EmptyState,
    LoadingState,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import {
    Search,
    Filter,
    Building2,
    Globe,
    CheckCircle2,
    RefreshCw,
    MapPin,
    Loader2,
    TrendingDown,
    Database,
    Shield,
    Target,
    Columns,
    Mail,
    User,
} from "lucide-react";
import { LOCATION_DATA } from "@/lib/location-data";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface ListingResult {
    id: string;
    source: string;
    company: {
        name: string;
        domain?: string;
        industry?: string;
        size?: string;
        country?: string;
        state?: string;
        city?: string;
        phone?: string;
        address?: string;
    };
    person?: {
        firstName?: string;
        lastName?: string;
        title?: string;
        email?: string;
        linkedin?: string;
    };
    confidence: number;
    metadata?: {
        rawUrl?: string;
        reviewsCount?: number;
    };
}

type SearchSource = "apollo" | "apify";

interface ListingSearchTabProps {
    onImport: (results: ListingResult[]) => void;
}

// ============================================
// LISTING SEARCH TAB
// ============================================

export function ListingSearchTab({ onImport }: ListingSearchTabProps) {
    const { success, error: showError } = useToast();

    // Source toggle
    const [source, setSource] = useState<SearchSource>("apollo");

    // Common state
    const [results, setResults] = useState<ListingResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<string>>(() => new Set([
        "company", "contact", "industry", "location", "phone", "email", "size", "website", "confidence", "source",
    ]));

    // Apollo Filters
    const [industry, setIndustry] = useState("");
    const [companySize, setCompanySize] = useState("");
    const [country, setCountry] = useState("");
    const [region, setRegion] = useState("");
    const [state, setState] = useState("");
    const [keywords, setKeywords] = useState("");
    const [revenueRange, setRevenueRange] = useState("");
    const [fundingMin, setFundingMin] = useState("");
    const [fundingMax, setFundingMax] = useState("");
    const [latestFundingStage, setLatestFundingStage] = useState("");
    const [yearFoundedMin, setYearFoundedMin] = useState("");
    const [yearFoundedMax, setYearFoundedMax] = useState("");
    const [companyType, setCompanyType] = useState("");
    const [technologies, setTechnologies] = useState("");
    const [isHiring, setIsHiring] = useState(false);
    const [departmentHeadcount, setDepartmentHeadcount] = useState("");
    const [jobPostings, setJobPostings] = useState("");
    const [limit, setLimit] = useState("25");

    // Apify Filters
    const [apifyKeywords, setApifyKeywords] = useState("");
    const [apifyLocation, setApifyLocation] = useState("");
    const [apifyLimit, setApifyLimit] = useState("25");

    // Apify polling state
    const [apifyRunId, setApifyRunId] = useState<string | null>(null);
    const [apifyStatus, setApifyStatus] = useState<string>("");
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const columnPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showColumnPicker) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
                setShowColumnPicker(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showColumnPicker]);

    // Location Logic
    const handleCountryChange = (val: string) => {
        setCountry(val);
        setRegion("");
        setState("");
    };

    const handleRegionChange = (val: string) => {
        setRegion(val);
        setState("");
    };

    // Clear results on source change
    useEffect(() => {
        setResults([]);
        setSelected(new Set());
    }, [source]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // ============================================
    // APOLLO SEARCH
    // ============================================

    const handleApolloSearch = async () => {
        const hasFilter = industry || companySize || country || state || region || keywords ||
            revenueRange || fundingMin || fundingMax || latestFundingStage ||
            yearFoundedMin || yearFoundedMax || companyType || technologies ||
            isHiring || departmentHeadcount || jobPostings;

        if (!hasFilter) {
            showError("Erreur", "Veuillez renseigner au moins un filtre");
            return;
        }

        setIsLoading(true);
        setResults([]);
        setSelected(new Set());

        try {
            const res = await fetch("/api/prospects/listing/apollo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    industry,
                    companySize,
                    country,
                    state,
                    region,
                    keywords,
                    revenueRange,
                    fundingMin: fundingMin ? parseInt(fundingMin) : undefined,
                    fundingMax: fundingMax ? parseInt(fundingMax) : undefined,
                    latestFundingStage,
                    yearFoundedMin: yearFoundedMin ? parseInt(yearFoundedMin) : undefined,
                    yearFoundedMax: yearFoundedMax ? parseInt(yearFoundedMax) : undefined,
                    companyType,
                    technologies: technologies ? technologies.split(",").map(t => t.trim()) : undefined,
                    isHiring,
                    departmentHeadcount,
                    jobPostings,
                    limit: parseInt(limit),
                }),
            });

            const json = await res.json();
            if (json.success) {
                setResults(json.data);
                success("Recherche terminee", `${json.data.length} resultat(s)`);
            } else {
                showError("Erreur", json.error || "Erreur lors de la recherche");
            }
        } catch (err) {
            console.error("Apollo search failed:", err);
            showError("Erreur", "Impossible de rechercher les leads");
        } finally {
            setIsLoading(false);
        }
    };

    // ============================================
    // APIFY SEARCH (Google Maps)
    // ============================================

    const pollApifyStatus = useCallback(async (runId: string) => {
        try {
            const res = await fetch(`/api/prospects/listing/apify/status?runId=${runId}`);
            const json = await res.json();

            if (!json.success) return;

            setApifyStatus(json.status);

            if (json.status === "SUCCEEDED" && json.datasetId) {
                // Stop polling
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }

                // Fetch results
                const resultsRes = await fetch(`/api/prospects/listing/apify/results?datasetId=${json.datasetId}`);
                const resultsJson = await resultsRes.json();

                if (resultsJson.success) {
                    setResults(resultsJson.data);
                    success("Recherche terminee", `${resultsJson.data.length} resultat(s) Google Maps`);
                } else {
                    showError("Erreur", "Impossible de recuperer les resultats");
                }

                setIsLoading(false);
                setApifyRunId(null);
                setApifyStatus("");
            } else if (json.status === "FAILED" || json.status === "ABORTED") {
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
                showError("Erreur", `La recherche a echoue (${json.status})`);
                setIsLoading(false);
                setApifyRunId(null);
                setApifyStatus("");
            }
        } catch (err) {
            console.error("Polling failed:", err);
        }
    }, [success, showError]);

    const handleApifySearch = async () => {
        if (!apifyKeywords || !apifyLocation) {
            showError("Erreur", "Mots-cles et localisation requis");
            return;
        }

        setIsLoading(true);
        setResults([]);
        setSelected(new Set());
        setApifyStatus("STARTING");

        try {
            const res = await fetch("/api/prospects/listing/apify/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keywords: apifyKeywords,
                    location: apifyLocation,
                    limit: parseInt(apifyLimit),
                }),
            });

            const json = await res.json();
            if (json.success && json.runId) {
                setApifyRunId(json.runId);
                setApifyStatus("RUNNING");

                // Start polling
                pollingRef.current = setInterval(() => {
                    pollApifyStatus(json.runId);
                }, 3000);
            } else {
                showError("Erreur", json.error || "Impossible de lancer la recherche");
                setIsLoading(false);
                setApifyStatus("");
            }
        } catch (err) {
            console.error("Apify search failed:", err);
            showError("Erreur", "Impossible de lancer la recherche Google Maps");
            setIsLoading(false);
            setApifyStatus("");
        }
    };

    // ============================================
    // SELECTION
    // ============================================

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selected);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelected(newSelected);
    };

    const toggleSelectAll = () => {
        if (selected.size === results.length) setSelected(new Set());
        else setSelected(new Set(results.map(r => r.id)));
    };

    // ============================================
    // IMPORT
    // ============================================

    const handleImport = () => {
        const selectedResults = results.filter(r => selected.has(r.id));
        if (selectedResults.length === 0) {
            showError("Erreur", "Selectionnez au moins un resultat");
            return;
        }
        onImport(selectedResults);
    };

    // ============================================
    // TABLE COLUMNS (all columns; visibility filtered below)
    // ============================================

    const allColumns: Column<ListingResult>[] = [
        {
            key: "select",
            header: (
                <input
                    type="checkbox"
                    checked={selected.size === results.length && results.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                />
            ),
            render: (_value, result) => (
                <input
                    type="checkbox"
                    checked={selected.has(result.id)}
                    onChange={() => toggleSelection(result.id)}
                    className="rounded border-slate-300"
                />
            ),
        },
        {
            key: "company",
            header: "Entreprise",
            sortable: true,
            sortField: "company.name",
            render: (_value, result) => (
                <div>
                    <div className="font-medium text-slate-900 text-sm flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {result.company.name}
                    </div>
                    {result.company.domain && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3 text-slate-400" />
                            {result.company.domain}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: "contact",
            header: "Contact",
            sortable: true,
            sortField: "person.lastName",
            render: (_value, result) => {
                const name = [result.person?.firstName, result.person?.lastName].filter(Boolean).join(" ") || null;
                return (
                    <div className="flex items-center gap-1.5 text-sm">
                        {name ? (
                            <span className="text-slate-700 flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {name}
                            </span>
                        ) : (
                            <span className="text-slate-400 text-xs">{"\u2014"}</span>
                        )}
                    </div>
                );
            },
        },
        {
            key: "industry",
            header: "Secteur",
            sortable: true,
            sortField: "company.industry",
            render: (_value, result) => (
                <span className={result.company.industry ? "text-slate-700 text-sm" : "text-slate-400 text-xs"}>
                    {result.company.industry || "\u2014"}
                </span>
            ),
        },
        {
            key: "location",
            header: "Localisation",
            sortable: true,
            sortField: "company.country",
            render: (_value, result) => {
                const parts = [result.company.city, result.company.state, result.company.country].filter(Boolean);
                return (
                    <span className={parts.length ? "text-slate-700 text-sm" : "text-slate-400 text-xs"}>
                        {parts.join(", ") || "\u2014"}
                    </span>
                );
            },
        },
        {
            key: "phone",
            header: "Tél.",
            sortable: true,
            sortField: "company.phone",
            render: (_value, result) => (
                <div className="whitespace-nowrap text-sm">
                    {result.company.phone ? (
                        <a href={`tel:${result.company.phone}`} className="text-slate-700 hover:text-primary-600">
                            {result.company.phone}
                        </a>
                    ) : (
                        <span className="text-slate-400 text-xs">{"\u2014"}</span>
                    )}
                </div>
            ),
        },
        {
            key: "email",
            header: "Email",
            sortable: true,
            sortField: "person.email",
            render: (_value, result) => {
                const email = result.person?.email;
                return (
                    <div className="text-sm">
                        {email ? (
                            <a href={`mailto:${email}`} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 truncate max-w-[180px]">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span className="truncate">{email}</span>
                            </a>
                        ) : (
                            <span className="text-slate-400 text-xs">{"\u2014"}</span>
                        )}
                    </div>
                );
            },
        },
        {
            key: "size",
            header: "Taille",
            sortable: true,
            sortField: "company.size",
            render: (_value, result) => (
                <span className={result.company.size ? "text-slate-700 text-sm" : "text-slate-400 text-xs"}>
                    {result.company.size || "\u2014"}
                </span>
            ),
        },
        {
            key: "address",
            header: "Adresse",
            sortable: true,
            sortField: "company.address",
            render: (_value, result) => (
                <span className={result.company.address ? "text-slate-700 text-sm truncate block max-w-[200px]" : "text-slate-400 text-xs"}>
                    {result.company.address || "\u2014"}
                </span>
            ),
        },
        {
            key: "website",
            header: "Site",
            sortable: true,
            sortField: "company.domain",
            render: (_value, result) =>
                result.company.domain ? (
                    <a
                        href={`https://${result.company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 text-sm inline-flex items-center gap-1"
                    >
                        <Globe className="w-3 h-3" />
                        Visiter
                    </a>
                ) : (
                    <span className="text-slate-400 text-xs">{"\u2014"}</span>
                ),
        },
        {
            key: "confidence",
            header: "Score",
            sortable: true,
            sortField: "confidence",
            render: (_value, result) => {
                const color =
                    result.confidence >= 80
                        ? "bg-emerald-100 text-emerald-700"
                        : result.confidence >= 60
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700";
                return (
                    <Badge className={`${color} text-xs font-medium`}>
                        {result.confidence}%
                    </Badge>
                );
            },
        },
        {
            key: "source",
            header: "Source",
            sortable: true,
            sortField: "source",
            render: (_value, result) => (
                <Badge className="bg-slate-100 text-slate-600 text-xs font-medium">
                    {result.source === "apify-google-maps" ? "Google Maps" : result.source}
                </Badge>
            ),
        },
    ];

    const columnPickerOptions: { key: string; label: string }[] = [
        { key: "company", label: "Entreprise" },
        { key: "contact", label: "Contact" },
        { key: "industry", label: "Secteur" },
        { key: "location", label: "Localisation" },
        { key: "phone", label: "Tél." },
        { key: "email", label: "Email" },
        { key: "size", label: "Taille" },
        { key: "address", label: "Adresse" },
        { key: "website", label: "Site" },
        { key: "confidence", label: "Score" },
        { key: "source", label: "Source" },
    ];

    const columns = allColumns.filter(
        (c) => c.key === "select" || visibleColumnKeys.has(c.key)
    );

    // ============================================
    // FILTER OPTIONS
    // ============================================

    const industryOptions = [
        { value: "", label: "Tous les secteurs" },
        { value: "Technology", label: "Technologie" },
        { value: "Finance", label: "Finance" },
        { value: "Healthcare", label: "Sante" },
        { value: "Retail", label: "Commerce" },
        { value: "Manufacturing", label: "Industrie" },
        { value: "Consulting", label: "Conseil" },
    ];

    const sizeOptions = [
        { value: "", label: "Toutes les tailles" },
        { value: "1-10", label: "1-10" },
        { value: "11-50", label: "11-50" },
        { value: "51-200", label: "51-200" },
        { value: "201-500", label: "201-500" },
        { value: "501-1000", label: "501-1000" },
        { value: "1001-5000", label: "1001-5000" },
        { value: "5001+", label: "5001+" },
    ];

    const countryOptions = [
        { value: "", label: "Tous les pays" },
        ...Object.keys(LOCATION_DATA).map(key => ({
            value: key,
            label: LOCATION_DATA[key].label,
        })),
    ];

    const regionOptions = [
        { value: "", label: "Toutes les regions" },
        ...(country && LOCATION_DATA[country]?.regions
            ? Object.keys(LOCATION_DATA[country].regions).map(key => ({
                value: key,
                label: LOCATION_DATA[country].regions[key].label,
            }))
            : []),
    ];

    const stateOptions = [
        { value: "", label: "Tous" },
        ...(country && region && LOCATION_DATA[country]?.regions[region]?.states
            ? LOCATION_DATA[country].regions[region].states
            : []),
    ];

    const limitOptions = [
        { value: "10", label: "10" },
        { value: "25", label: "25" },
        { value: "50", label: "50" },
        { value: "100", label: "100" },
    ];

    const revenueOptions = [
        { value: "", label: "Tous" },
        { value: "0-1M", label: "$0-$1M" },
        { value: "1M-10M", label: "$1M-$10M" },
        { value: "10M-50M", label: "$10M-$50M" },
        { value: "50M-100M", label: "$50M-$100M" },
        { value: "100M-500M", label: "$100M-$500M" },
        { value: "500M-1B", label: "$500M-$1B" },
        { value: "1B+", label: "$1B+" },
    ];

    const fundingStageOptions = [
        { value: "", label: "Tous" },
        { value: "seed", label: "Seed" },
        { value: "series_a", label: "Series A" },
        { value: "series_b", label: "Series B" },
        { value: "series_c", label: "Series C" },
        { value: "series_d", label: "Series D+" },
        { value: "ipo", label: "IPO" },
        { value: "acquired", label: "Acquired" },
    ];

    const companyTypeOptions = [
        { value: "", label: "Tous" },
        { value: "public", label: "Publique" },
        { value: "private", label: "Privee" },
        { value: "nonprofit", label: "Non-profit" },
        { value: "government", label: "Gouvernement" },
    ];

    const pageSize = parseInt(source === "apollo" ? limit : apifyLimit, 10) || 25;

    // ============================================
    // CREDIT USAGE STATE
    // ============================================

    const [creditData, setCreditData] = useState<{
        currentMonthUsed: number;
        currentMonthSaved: number;
        cacheHitRate: number;
        projectedMonthly: number;
        monthlySavings: number;
        savingsPercentage: number;
        recommendations: string[];
    } | null>(null);

    useEffect(() => {
        fetch("/api/prospects/listing/apollo/credits")
            .then((r) => r.json())
            .then((json) => {
                if (json.success) setCreditData(json.data.projection);
            })
            .catch(() => {});
    }, [results]);

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left filter sidebar — mockup 260px */}
            <aside className="w-[260px] min-w-[260px] bg-white border-r border-line flex flex-col overflow-y-auto p-4 shrink-0">
                {/* Source selector — mockup pills */}
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        onClick={() => setSource("apollo")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium border transition-all duration-150",
                            source === "apollo"
                                ? "bg-white border-primary-500/30 text-ink shadow-sm"
                                : "bg-white/50 border-line text-ink-3 hover:bg-white hover:text-ink"
                        )}
                    >
                        <Globe className="w-4 h-4" style={{ color: source === "apollo" ? "#7C5CFC" : undefined }} />
                        <span>Apollo.io</span>
                        {creditData && source === "apollo" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-3 font-semibold">
                                {creditData.currentMonthSaved ?? 0} crédits
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setSource("apify")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium border transition-all duration-150",
                            source === "apify"
                                ? "bg-white border-success/30 text-ink shadow-sm"
                                : "bg-white/50 border-line text-ink-3 hover:bg-white hover:text-ink"
                        )}
                    >
                        <MapPin className="w-4 h-4" style={{ color: source === "apify" ? "#10B981" : undefined }} />
                        <span>Google Maps</span>
                    </button>
                </div>

                {/* Credits — mockup */}
                {source === "apollo" && creditData && (
                    <div className="mb-4 p-3 rounded-xl border border-line bg-surface-2">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Crédits Apollo</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div>
                                <div className="text-[10px] text-ink-3">Utilisés</div>
                                <div className="text-[16px] font-bold text-ink">{creditData.currentMonthUsed}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-ink-3">Restants</div>
                                <div className="text-[16px] font-bold text-success">{creditData.currentMonthSaved}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-3.5 h-3.5 text-ink-3" />
                    <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">Filtres</span>
                </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 text-[13px]">
                        {source === "apollo" ? (
                            <>
                                {/* Apollo: Base */}
                                <div className="space-y-1.5">
                                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">Base</h3>
                                    <div className="space-y-1.5">
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Secteur</label>
                                            <Select options={industryOptions} value={industry} onChange={setIndustry} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Taille</label>
                                            <Select options={sizeOptions} value={companySize} onChange={setCompanySize} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Pays</label>
                                            <Select options={countryOptions} value={country} onChange={handleCountryChange} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Region</label>
                                            <Select options={regionOptions} value={region} onChange={handleRegionChange} disabled={!country} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Etat</label>
                                            <Select options={stateOptions} value={state} onChange={setState} disabled={!region} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Mots-cles</label>
                                            <Input placeholder="SaaS, E-commerce..." value={keywords} onChange={(e) => setKeywords(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                    </div>
                                </div>

                                {/* Apollo: Revenue & Funding */}
                                <div className="space-y-1.5">
                                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">Revenu & financement</h3>
                                    <div className="space-y-1.5">
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Revenu</label>
                                            <Select options={revenueOptions} value={revenueRange} onChange={setRevenueRange} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Financement min ($)</label>
                                            <Input type="number" placeholder="1M" value={fundingMin} onChange={(e) => setFundingMin(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Financement max ($)</label>
                                            <Input type="number" placeholder="10M" value={fundingMax} onChange={(e) => setFundingMax(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Dernier tour</label>
                                            <Select options={fundingStageOptions} value={latestFundingStage} onChange={setLatestFundingStage} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                    </div>
                                </div>

                                {/* Apollo: Company Details */}
                                <div className="space-y-1.5">
                                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">Entreprise</h3>
                                    <div className="space-y-1.5">
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Annee min / max</label>
                                            <div className="flex gap-1">
                                                <Input type="number" placeholder="2000" value={yearFoundedMin} onChange={(e) => setYearFoundedMin(e.target.value)} className="!py-1.5 !text-xs !rounded-lg flex-1" />
                                                <Input type="number" placeholder="2023" value={yearFoundedMax} onChange={(e) => setYearFoundedMax(e.target.value)} className="!py-1.5 !text-xs !rounded-lg flex-1" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Type</label>
                                            <Select options={companyTypeOptions} value={companyType} onChange={setCompanyType} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Technologies</label>
                                            <Input placeholder="Salesforce, AWS..." value={technologies} onChange={(e) => setTechnologies(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                    </div>
                                </div>

                                {/* Apollo: Growth */}
                                <div className="space-y-1.5">
                                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">Croissance</h3>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" id="isHiring" checked={isHiring} onChange={(e) => setIsHiring(e.target.checked)} className="rounded border-slate-300 w-3.5 h-3.5" />
                                            <label htmlFor="isHiring" className="text-[11px] text-slate-500">Recrutent</label>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Effectif dept.</label>
                                            <Input placeholder="Engineering..." value={departmentHeadcount} onChange={(e) => setDepartmentHeadcount(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Offres d&apos;emploi</label>
                                            <Input placeholder="VP Sales..." value={jobPostings} onChange={(e) => setJobPostings(e.target.value)} className="!py-1.5 !text-xs !rounded-lg" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-1.5 border-t border-slate-100">
                                    <label className="block text-[11px] text-slate-500 mb-0.5">Resultats</label>
                                    <Select options={limitOptions} value={limit} onChange={setLimit} className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg" />
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Apify / Google Maps Filters */}
                                <div className="space-y-1.5">
                                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">Google Maps</h3>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Mots-cles *</label>
                                            <Input
                                                placeholder="Restaurant, Plombier..."
                                                value={apifyKeywords}
                                                onChange={(e) => setApifyKeywords(e.target.value)}
                                                className="!py-1.5 !text-xs !rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Localisation *</label>
                                            <Input
                                                placeholder="Paris, France"
                                                value={apifyLocation}
                                                onChange={(e) => setApifyLocation(e.target.value)}
                                                className="!py-1.5 !text-xs !rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-500 mb-0.5">Resultats max</label>
                                            <Select
                                                options={limitOptions}
                                                value={apifyLimit}
                                                onChange={setApifyLimit}
                                                className="[&_button]:!py-2 [&_button]:!text-xs [&_button]:!rounded-lg"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {apifyStatus && (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                                        <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-medium">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            {apifyStatus === "STARTING" && "Lancement..."}
                                            {apifyStatus === "RUNNING" && "Recherche en cours..."}
                                            {apifyStatus === "READY" && "Preparation..."}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                {/* Search button — mockup */}
                <div className="pt-4 mt-2 border-t border-line shrink-0 space-y-2">
                    <button
                        type="button"
                        onClick={source === "apollo" ? handleApolloSearch : handleApifySearch}
                        disabled={isLoading}
                        className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-[13px] font-semibold shadow-sm transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {isLoading ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Recherche...</>
                        ) : (
                            <><Search className="w-3.5 h-3.5" /> Rechercher</>
                        )}
                    </button>
                    <button type="button" className="w-full py-2 text-[12px] text-ink-3 hover:text-ink transition-colors duration-150">
                        Réinitialiser les filtres
                    </button>
                </div>
            </aside>

            {/* Main results area — mockup */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
                {/* Search bar */}
                <div className="px-5 py-3 border-b border-line shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                            <input
                                type="text"
                                placeholder={source === "apollo" ? "Recherche B2B via Apollo.io — Organisation search" : "Recherche locale via Google Maps"}
                                className="w-full pl-10 pr-4 py-2.5 bg-surface-3 border border-line rounded-lg text-[13px] text-ink placeholder-[#B0B3C0] focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 focus:bg-white transition-all duration-150"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-ink-3">
                            <span className="px-2 py-1 bg-surface-3 rounded text-ink-2 font-medium">
                                {source === "apollo" && creditData ? `${creditData.currentMonthSaved ?? 0} crédits` : "Gratuit"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Selection bar — mockup */}
                {selected.size > 0 && (
                    <div className="px-5 py-2.5 bg-primary-50 border-b border-primary-500/15 flex items-center justify-between shrink-0">
                        <span className="text-[12px] font-medium text-primary-600">{selected.size} contact(s) sélectionné(s)</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleImport}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-[11px] font-semibold transition-all duration-150"
                            >
                                <Target className="w-3 h-3" />
                                <span>Ajouter à une mission</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Table container */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {isLoading ? (
                        <LoadingState message={
                            source === "apollo"
                                ? "Recherche en cours sur Apollo.io..."
                                : apifyStatus === "RUNNING"
                                    ? "Scraping Google Maps en cours..."
                                    : "Lancement de la recherche..."
                        } />
                    ) : results.length === 0 ? (
                        <EmptyState
                            icon={source === "apollo" ? Search : MapPin}
                            title="Aucun resultat"
                            description={
                                source === "apollo"
                                    ? "Utilisez les filtres pour rechercher des leads B2B"
                                    : "Entrez des mots-cles et une localisation pour rechercher"
                            }
                        />
                    ) : (
                        <div className="flex flex-col min-h-0 flex-1">
                            <div className="px-5 py-2.5 flex items-center justify-between text-[11px] text-ink-3 border-b border-line bg-surface-2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="font-medium">{results.length} résultats trouvés</span>
                                    <div className="relative" ref={columnPickerRef}>
                                        <button
                                            type="button"
                                            onClick={() => setShowColumnPicker((v) => !v)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                                                showColumnPicker
                                                    ? "bg-primary text-white"
                                                    : "bg-white border border-line text-ink-2 hover:border-primary-500/40 hover:text-primary-600"
                                            )}
                                        >
                                            <Columns className="w-3.5 h-3.5" />
                                            Colonnes
                                        </button>
                                        {showColumnPicker && (
                                            <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] py-1.5 bg-white border border-line rounded-lg shadow-lg">
                                                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                                    Afficher les colonnes
                                                </div>
                                                {columnPickerOptions.map((opt) => (
                                                    <label
                                                        key={opt.key}
                                                        className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-3 cursor-pointer text-[12px] text-slate-700"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleColumnKeys.has(opt.key)}
                                                            onChange={() => {
                                                                const next = new Set(visibleColumnKeys);
                                                                if (next.has(opt.key)) next.delete(opt.key);
                                                                else next.add(opt.key);
                                                                setVisibleColumnKeys(next);
                                                            }}
                                                            className="rounded border-slate-300"
                                                        />
                                                        {opt.label}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <span>{source === "apollo" ? "1 crédit / recherche" : "Gratuit"}</span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">
                                <DataTable
                                    data={results}
                                    columns={columns}
                                    keyField="id"
                                    pagination={true}
                                    pageSize={pageSize}
                                    loading={false}
                                    emptyMessage="Aucune donnee"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
