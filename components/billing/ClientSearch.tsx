"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Building2, Loader2, Plus, MapPin, Hash, X, UserCheck, Users, Briefcase } from "lucide-react";
import { Input, Button, useToast } from "@/components/ui";

interface BillingClient {
    id?: string;
    legalName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    siret?: string | null;
    vatNumber?: string | null;
    email?: string | null;
    phone?: string | null;
}

/** CRM client (our clients) - no legal billing info */
interface CrmClient {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    industry?: string | null;
}

type SearchSource = "our" | "pappers";

interface ClientSearchProps {
    onSelect: (client: BillingClient) => void;
    selectedClient?: BillingClient | null;
    allowManualEntry?: boolean;
}

const LEGAL_FORM_INIT: Partial<BillingClient> = {
    legalName: "",
    address: "",
    city: "",
    postalCode: "",
    country: "France",
    siret: "",
    vatNumber: "",
    email: "",
    phone: "",
};

export function ClientSearch({ onSelect, selectedClient, allowManualEntry = true }: ClientSearchProps) {
    const { success, error: showError } = useToast();
    const [searchSource, setSearchSource] = useState<SearchSource>("our");
    const [searchQuery, setSearchQuery] = useState("");
    const [pappersResults, setPappersResults] = useState<BillingClient[]>([]);
    const [crmResults, setCrmResults] = useState<CrmClient[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [showManualForm, setShowManualForm] = useState(false);
    const [selectedCrmClient, setSelectedCrmClient] = useState<CrmClient | null>(null);
    const [legalForm, setLegalForm] = useState<Partial<BillingClient>>(LEGAL_FORM_INIT);
    const [isSavingLegal, setIsSavingLegal] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout>();
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [manualClient, setManualClient] = useState<Partial<BillingClient>>({ ...LEGAL_FORM_INIT });

    const hasLegalForm = selectedCrmClient !== null;
    const results = searchSource === "our" ? crmResults : pappersResults;
    const hasResults = searchSource === "our" ? crmResults.length > 0 : pappersResults.length > 0;

    // Search: our clients or Pappers
    useEffect(() => {
        if (searchQuery.length < 2) {
            setPappersResults([]);
            setCrmResults([]);
            setShowResults(false);
            return;
        }

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                if (searchSource === "our") {
                    const res = await fetch(
                        `/api/clients?search=${encodeURIComponent(searchQuery)}&limit=20&page=1`
                    );
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        setCrmResults(json.data);
                        setShowResults(true);
                    } else {
                        setCrmResults([]);
                    }
                } else {
                    const res = await fetch(
                        `/api/billing/clients/search?q=${encodeURIComponent(searchQuery)}`
                    );
                    const json = await res.json();
                    if (json.success) {
                        setPappersResults(json.data);
                        setShowResults(true);
                    } else {
                        setPappersResults([]);
                    }
                }
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [searchQuery, searchSource]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectBillingClient = async (client: BillingClient) => {
        setShowResults(false);
        setSearchQuery("");

        if (client.id) {
            onSelect(client);
        } else {
            try {
                const res = await fetch("/api/billing/clients", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(client),
                });
                const json = await res.json();
                if (json.success) {
                    onSelect(json.data);
                    success("Client enregistré", "Le client a été créé avec succès");
                } else {
                    showError("Erreur", json.error || "Impossible d'enregistrer le client");
                }
            } catch (err) {
                showError("Erreur", "Impossible d'enregistrer le client");
            }
        }
    };

    const handleSelectCrmClient = (crm: CrmClient) => {
        setShowResults(false);
        setSearchQuery("");
        setSelectedCrmClient(crm);
        setLegalForm({
            legalName: crm.name,
            address: "",
            city: "",
            postalCode: "",
            country: "France",
            siret: "",
            vatNumber: "",
            email: crm.email ?? "",
            phone: crm.phone ?? "",
        });
    };

    const handleLegalFormSubmit = async () => {
        if (
            !legalForm.legalName?.trim() ||
            !legalForm.address?.trim() ||
            !legalForm.city?.trim() ||
            !legalForm.postalCode?.trim()
        ) {
            showError("Erreur", "Veuillez remplir les champs obligatoires (nom légal, adresse, ville, code postal)");
            return;
        }
        setIsSavingLegal(true);
        try {
            const res = await fetch("/api/billing/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    legalName: legalForm.legalName,
                    address: legalForm.address,
                    city: legalForm.city,
                    postalCode: legalForm.postalCode,
                    country: legalForm.country || "France",
                    siret: legalForm.siret || undefined,
                    vatNumber: legalForm.vatNumber || undefined,
                    email: legalForm.email || undefined,
                    phone: legalForm.phone || undefined,
                }),
            });
            const json = await res.json();
            if (json.success) {
                onSelect(json.data);
                success("Client configuré", "Les informations légales ont été enregistrées");
                setSelectedCrmClient(null);
                setLegalForm(LEGAL_FORM_INIT);
            } else {
                showError("Erreur", json.error || "Impossible d'enregistrer le client");
            }
        } catch (err) {
            showError("Erreur", "Impossible d'enregistrer le client");
        } finally {
            setIsSavingLegal(false);
        }
    };

    const handleManualSubmit = async () => {
        if (
            !manualClient.legalName ||
            !manualClient.address ||
            !manualClient.city ||
            !manualClient.postalCode
        ) {
            showError("Erreur", "Veuillez remplir les champs obligatoires");
            return;
        }
        await handleSelectBillingClient(manualClient as BillingClient);
        setShowManualForm(false);
    };

    // Selected client display (with optional "Edit legal info" for invoice page)
    if (selectedClient && !hasLegalForm && !showManualForm) {
        return (
            <div className="relative group rounded-xl border border-primary-200 bg-primary-50/50 p-5 transition-all duration-200">
                <div className="absolute top-3 right-3">
                    <button
                        onClick={() => onSelect(null as any)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-all duration-150"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <UserCheck className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-slate-900 text-base">{selectedClient.legalName}</h4>
                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <span>
                                    {selectedClient.address}, {selectedClient.postalCode} {selectedClient.city}
                                </span>
                            </div>
                            {selectedClient.siret && (
                                <div className="flex items-center gap-2">
                                    <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <span className="font-mono text-xs">SIRET {selectedClient.siret}</span>
                                </div>
                            )}
                            {selectedClient.vatNumber && (
                                <div className="flex items-center gap-2">
                                    <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <span className="font-mono text-xs">TVA {selectedClient.vatNumber}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Legal info form when a CRM client was selected (complete / edit then use for invoice)
    if (hasLegalForm && selectedCrmClient) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-600" />
                        <h4 className="font-semibold text-slate-900">
                            Informations légales pour la facturation
                        </h4>
                    </div>
                    <button
                        onClick={() => {
                            setSelectedCrmClient(null);
                            setLegalForm(LEGAL_FORM_INIT);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                    Complétez ou modifiez les informations légales pour <strong>{selectedCrmClient.name}</strong>, puis enregistrez pour utiliser ce client sur la facture.
                </p>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Nom légal *</label>
                        <Input
                            placeholder="Raison sociale"
                            value={legalForm.legalName ?? ""}
                            onChange={(e) => setLegalForm({ ...legalForm, legalName: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Adresse *</label>
                        <Input
                            placeholder="123 rue de la Paix"
                            value={legalForm.address ?? ""}
                            onChange={(e) => setLegalForm({ ...legalForm, address: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Code postal *</label>
                            <Input
                                placeholder="75001"
                                value={legalForm.postalCode ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, postalCode: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Ville *</label>
                            <Input
                                placeholder="Paris"
                                value={legalForm.city ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, city: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">SIRET</label>
                            <Input
                                placeholder="12345678901234"
                                value={legalForm.siret ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, siret: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">TVA intracom.</label>
                            <Input
                                placeholder="FR12345678901"
                                value={legalForm.vatNumber ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, vatNumber: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
                            <Input
                                type="email"
                                placeholder="facturation@..."
                                value={legalForm.email ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Téléphone</label>
                            <Input
                                placeholder="+33..."
                                value={legalForm.phone ?? ""}
                                onChange={(e) => setLegalForm({ ...legalForm, phone: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <Button
                            onClick={handleLegalFormSubmit}
                            disabled={isSavingLegal}
                            size="sm"
                            className="flex-1"
                        >
                            {isSavingLegal ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                            ) : (
                                <Briefcase className="w-4 h-4 mr-1.5" />
                            )}
                            {isSavingLegal ? "Enregistrement..." : "Enregistrer et utiliser pour la facture"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedCrmClient(null);
                                setLegalForm(LEGAL_FORM_INIT);
                            }}
                        >
                            Annuler
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Source tabs */}
            <div className="flex rounded-lg border border-slate-200 p-0.5 mb-3 bg-slate-50/80">
                <button
                    type="button"
                    onClick={() => setSearchSource("our")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        searchSource === "our"
                            ? "bg-white text-primary-600 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                    <Users className="w-4 h-4" />
                    Nos clients
                </button>
                <button
                    type="button"
                    onClick={() => setSearchSource("pappers")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        searchSource === "pappers"
                            ? "bg-white text-primary-600 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                    <Building2 className="w-4 h-4" />
                    Recherche entreprise
                </button>
            </div>

            {/* Search input */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder={
                        searchSource === "our"
                            ? "Rechercher un client (nom)..."
                            : "Rechercher une entreprise par nom ou SIRET..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                        if (hasResults) setShowResults(true);
                    }}
                    className="w-full pl-11 pr-10 py-3 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
                />
                {isSearching && (
                    <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary-400 w-4 h-4 animate-spin" />
                )}
            </div>

            {/* Results dropdown */}
            {showResults && searchSource === "our" && crmResults.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-xs font-medium text-slate-400">
                            {crmResults.length} client{crmResults.length > 1 ? "s" : ""} (complétez les infos légales après sélection)
                        </p>
                    </div>
                    {crmResults.map((crm) => (
                        <button
                            key={crm.id}
                            onClick={() => handleSelectCrmClient(crm)}
                            className="w-full text-left px-4 py-3 hover:bg-primary-50/50 transition-colors duration-100 border-b border-slate-50 last:border-b-0 group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                                    <Users className="w-4 h-4 text-primary-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 text-sm truncate">
                                        {crm.name}
                                    </div>
                                    {(crm.email || crm.industry) && (
                                        <div className="text-xs text-slate-500 truncate mt-0.5">
                                            {[crm.email, crm.industry].filter(Boolean).join(" · ")}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {showResults && searchSource === "pappers" && pappersResults.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-xs font-medium text-slate-400">{pappersResults.length} résultat(s)</p>
                    </div>
                    {pappersResults.map((client, idx) => (
                        <button
                            key={client.id ?? idx}
                            onClick={() => handleSelectBillingClient(client)}
                            className="w-full text-left px-4 py-3 hover:bg-primary-50/50 transition-colors duration-100 border-b border-slate-50 last:border-b-0 group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center flex-shrink-0 transition-colors duration-150">
                                    <Building2 className="w-4 h-4 text-slate-400 group-hover:text-primary-500 transition-colors duration-150" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 text-sm truncate group-hover:text-primary-700 transition-colors duration-150">
                                        {client.legalName}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate mt-0.5">
                                        {client.address}, {client.postalCode} {client.city}
                                    </div>
                                    {client.siret && (
                                        <div className="mt-1">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500">
                                                {client.siret}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Manual entry toggle */}
            {allowManualEntry && !showManualForm && (
                <button
                    onClick={() => setShowManualForm(true)}
                    className="mt-3 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Saisie manuelle
                </button>
            )}

            {/* Manual entry form */}
            {showManualForm && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-slate-900">Nouveau client</h4>
                        <button
                            onClick={() => setShowManualForm(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Nom légal *</label>
                            <Input
                                placeholder="Entreprise SAS"
                                value={manualClient.legalName}
                                onChange={(e) => setManualClient({ ...manualClient, legalName: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Adresse *</label>
                            <Input
                                placeholder="123 rue de la Paix"
                                value={manualClient.address}
                                onChange={(e) => setManualClient({ ...manualClient, address: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Code postal *</label>
                                <Input
                                    placeholder="75001"
                                    value={manualClient.postalCode}
                                    onChange={(e) => setManualClient({ ...manualClient, postalCode: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Ville *</label>
                                <Input
                                    placeholder="Paris"
                                    value={manualClient.city}
                                    onChange={(e) => setManualClient({ ...manualClient, city: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">SIRET</label>
                                <Input
                                    placeholder="12345678901234"
                                    value={manualClient.siret || ""}
                                    onChange={(e) => setManualClient({ ...manualClient, siret: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">TVA intracom.</label>
                                <Input
                                    placeholder="FR12345678901"
                                    value={manualClient.vatNumber || ""}
                                    onChange={(e) => setManualClient({ ...manualClient, vatNumber: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button onClick={handleManualSubmit} size="sm" className="flex-1">
                                <Plus className="w-4 h-4 mr-1.5" />
                                Créer le client
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setShowManualForm(false);
                                    setManualClient({ ...LEGAL_FORM_INIT });
                                }}
                            >
                                Annuler
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
