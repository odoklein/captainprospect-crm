"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Search,
    X,
    Building2,
    User,
    Mail,
    Phone,
    Globe,
    ChevronDown,
    ChevronUp,
    Copy,
    Check,
    Database,
    ShieldAlert,
    ExternalLink,
    RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface EligibleList {
    id: string;
    name: string;
    type: string;
    _count?: {
        companies: number;
    };
}

interface Company {
    id: string;
    name: string;
    industry?: string | null;
    country?: string | null;
    website?: string | null;
    size?: string | null;
    phone?: string | null;
    listId?: string | null;
    list?: {
        id: string;
        name: string;
    } | null;
}

interface Contact {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    company: Company;
}

// ── Copy Button Component ──────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // fallback
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            title={label || "Copier"}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600 transition-colors"
        >
            {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
            ) : (
                <Copy className="w-3 h-3" />
            )}
            {copied && <span className="text-[10px] text-emerald-600 font-medium">Copié</span>}
        </button>
    );
}

// ── Company Card Component ─────────────────────────────────────────────────

function CompanyCard({
    company,
    contacts,
}: {
    company: Company;
    contacts: Contact[];
}) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="bg-white border border-[#E8EBF0] rounded-2xl shadow-sm overflow-hidden transition-all duration-200">
            {/* Header */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#FAFBFF] transition-colors select-none gap-4"
            >
                <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/80 border border-indigo-200/60 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-[#12122A] truncate">
                                {company.name}
                            </h3>
                            {company.list?.name && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                                    <Database className="w-2.5 h-2.5" />
                                    {company.list.name}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[#8B8DAF]">
                            {company.industry && <span>{company.industry}</span>}
                            {company.country && (
                                <span className="inline-flex items-center gap-1">
                                    <Globe className="w-3 h-3 text-[#A0A3BD]" />
                                    {company.country}
                                </span>
                            )}
                            {company.size && <span>{company.size}</span>}
                            {company.phone && (
                                <span className="inline-flex items-center gap-1 text-slate-600 font-mono text-[11px]">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {company.phone}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] font-semibold text-[#6B7194] bg-[#F4F5FA] border border-[#E8EBF0] px-2.5 py-1 rounded-full">
                        {contacts.length} contact{contacts.length > 1 ? "s" : ""}
                    </span>
                    {company.website && (
                        <a
                            href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                        >
                            <span>Site web</span>
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    )}
                    <button
                        type="button"
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        aria-label={isOpen ? "Fermer" : "Ouvrir"}
                    >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Contacts list */}
            {isOpen && (
                <div className="border-t border-[#F0F1F5] divide-y divide-[#F8F8FA]">
                    {contacts.map((c) => {
                        const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact sans nom";
                        return (
                            <div
                                key={c.id}
                                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#FAFBFF] transition-colors flex-wrap sm:flex-nowrap"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200/70 flex items-center justify-center shrink-0">
                                        <User className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold text-[#12122A] truncate">
                                            {fullName}
                                        </p>
                                        {c.title && (
                                            <p className="text-[11.5px] text-[#8B8DAF] truncate">
                                                {c.title}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap">
                                    {c.email && (
                                        <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                            <Mail className="w-3.5 h-3.5 text-indigo-500" />
                                            <a
                                                href={`mailto:${c.email}`}
                                                className="text-slate-700 hover:text-indigo-600 hover:underline"
                                            >
                                                {c.email}
                                            </a>
                                            <CopyButton text={c.email} label="Copier l'email" />
                                        </div>
                                    )}
                                    {c.phone && (
                                        <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                            <a
                                                href={`tel:${c.phone}`}
                                                className="text-slate-700 font-mono text-[11px] hover:text-emerald-700 hover:underline"
                                            >
                                                {c.phone}
                                            </a>
                                            <CopyButton text={c.phone} label="Copier le téléphone" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CommercialContactsPage() {
    const toast = useToast();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [eligibleLists, setEligibleLists] = useState<EligibleList[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [apiMessage, setApiMessage] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedListFilter, setSelectedListFilter] = useState<string>("all");

    // Debounce search query
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const fetchContacts = useCallback(async (q: string) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ limit: "300" });
            if (q) params.set("search", q);
            const res = await fetch(`/api/commercial/contacts?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setContacts(json.data?.contacts ?? []);
                setTotal(json.data?.total ?? 0);
                setEligibleLists(json.data?.eligibleLists ?? []);
                setApiMessage(json.data?.message ?? null);
            } else {
                toast.error("Erreur", json.error || "Impossible de charger les contacts");
            }
        } catch {
            toast.error("Erreur", "Impossible de contacter le serveur");
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchContacts(debouncedSearch);
    }, [fetchContacts, debouncedSearch]);

    // Filter contacts by selected list filter
    const filteredContacts = useMemo(() => {
        if (selectedListFilter === "all") return contacts;
        return contacts.filter((c) => c.company.listId === selectedListFilter);
    }, [contacts, selectedListFilter]);

    // Group contacts by company
    const companiesMap = useMemo(() => {
        const map = new Map<string, { company: Company; contacts: Contact[] }>();
        for (const c of filteredContacts) {
            const companyId = c.company.id;
            if (!map.has(companyId)) {
                map.set(companyId, { company: c.company, contacts: [] });
            }
            map.get(companyId)!.contacts.push(c);
        }
        return Array.from(map.values()).sort((a, b) =>
            a.company.name.localeCompare(b.company.name)
        );
    }, [filteredContacts]);

    const hasNoEligibleBases = !isLoading && (eligibleLists.length === 0 || apiMessage === "aucune base activée pour l'instant");

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-[22px] font-bold text-[#12122A] tracking-tight">
                        Contacts
                    </h1>
                    <p className="text-xs text-[#6B7194] mt-0.5">
                        {hasNoEligibleBases ? (
                            "Accès aux contacts de vos bases référentes"
                        ) : (
                            <>
                                <span className="font-semibold text-slate-800">{total}</span> contact{total > 1 ? "s" : ""} dans vos bases référentes activées
                            </>
                        )}
                    </p>
                </div>

                {eligibleLists.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-[#8B8DAF] uppercase tracking-wider font-semibold">
                            Base{eligibleLists.length > 1 ? "s" : ""} active{eligibleLists.length > 1 ? "s" : ""} :
                        </span>
                        {eligibleLists.map((l) => (
                            <span
                                key={l.id}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200/80 px-2.5 py-1 rounded-lg shadow-2xs"
                            >
                                <Database className="w-3 h-3 text-indigo-500" />
                                {l.name}
                                {typeof l._count?.companies === "number" && (
                                    <span className="text-indigo-400 font-normal">({l._count.companies})</span>
                                )}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Empty state: No eligible base active */}
            {hasNoEligibleBases ? (
                <div className="bg-white border border-amber-200/80 rounded-2xl p-8 md:p-12 text-center max-w-2xl mx-auto shadow-sm my-8">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
                        <ShieldAlert className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-lg font-bold text-[#12122A]">
                        Aucune base activée pour l&apos;instant
                    </h2>
                    <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                        Votre Account Manager n&apos;a pas encore activé l&apos;accès aux contacts de votre base référente.
                        Dès que votre base sera validée et activée par l&apos;équipe, vos contacts apparaîtront automatiquement ici.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50/70 border border-amber-200/80 rounded-xl px-4 py-2">
                        <span>Besoin d&apos;accès rapidement ? Contactez votre Account Manager dédié.</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* Controls bar: search & list filter */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {/* Search input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A3BD]" />
                            <input
                                type="text"
                                placeholder="Rechercher un contact, société, email ou téléphone..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-[#E8EBF0] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 transition-all shadow-2xs"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
                                    title="Effacer la recherche"
                                >
                                    <X className="w-3.5 h-3.5 text-[#A0A3BD] hover:text-[#6B7194]" />
                                </button>
                            )}
                        </div>

                        {/* List filter if multiple eligible bases */}
                        {eligibleLists.length > 1 && (
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-500">Filtrer par base :</span>
                                <select
                                    value={selectedListFilter}
                                    onChange={(e) => setSelectedListFilter(e.target.value)}
                                    className="text-xs font-medium bg-white border border-[#E8EBF0] text-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 shadow-2xs"
                                >
                                    <option value="all">Toutes les bases ({eligibleLists.length})</option>
                                    {eligibleLists.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Content Section */}
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="animate-pulse h-20 bg-white rounded-2xl border border-[#E8EBF0]"
                                />
                            ))}
                        </div>
                    ) : companiesMap.length === 0 ? (
                        <div className="bg-white border border-[#E8EBF0] rounded-2xl py-16 px-6 text-center shadow-sm">
                            <div className="w-14 h-14 rounded-2xl bg-[#F4F6F9] flex items-center justify-center mx-auto mb-4">
                                <Building2 className="w-6 h-6 text-[#A0A3BD]" />
                            </div>
                            <h3 className="text-sm font-bold text-[#12122A]">
                                Aucun contact trouvé
                            </h3>
                            <p className="text-xs text-[#8B8DAF] mt-1 max-w-sm mx-auto">
                                {search
                                    ? "Aucun contact ne correspond à votre recherche. Essayez un autre terme ou réinitialisez le champ."
                                    : "Votre base activée ne contient pas encore de contacts renseignés."}
                            </p>
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Réinitialiser la recherche
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {companiesMap.map(({ company, contacts: companyContacts }) => (
                                <CompanyCard
                                    key={company.id}
                                    company={company}
                                    contacts={companyContacts}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

