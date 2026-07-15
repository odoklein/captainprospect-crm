"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, Badge, Button, DataTable, ConfirmModal, useToast } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { CompanyDrawer, ContactDrawer } from "@/components/drawers";
import dynamic from "next/dynamic";
import {
    ArrowLeft,
    List,
    Building2,
    Users,
    Edit,
    Trash2,
    Download,
    Mail,
    CheckCircle,
    AlertCircle,
    Clock,
    RefreshCw,
    Plus,
} from "lucide-react";
import Link from "next/link";
import { ProspectionHealthPanel } from "@/components/lists/ProspectionHealthPanel";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false }
);

// ============================================
// TYPES
// ============================================

interface ListDetail {
    id: string;
    name: string;
    type: string;
    source: string;
    mission: {
        id: string;
        name: string;
        client: {
            name: string;
        };
    };
    _count: {
        companies: number;
    };
    createdAt: string;
    updatedAt: string;
}

interface Company {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    phone: string | null;
    size: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    // JSON blob storing any custom fields imported from CSV
    customData?: Record<string, any> | null;
    _count: {
        contacts: number;
    };
    contacts: Contact[];
}

interface Contact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedin: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    companyId: string;
    companyName?: string;
}

interface ClientInterlocuteur {
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
    emails: Array<{ value: string; label: string; isPrimary: boolean }>;
    phones: Array<{ value: string; label: string; isPrimary: boolean }>;
    bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
    isActive: boolean;
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_CONFIG = {
    INCOMPLETE: { label: "Incomplet", color: "text-red-500", bg: "bg-red-50", icon: AlertCircle },
    PARTIAL: { label: "Partiel", color: "text-amber-500", bg: "bg-amber-50", icon: Clock },
    ACTIONABLE: { label: "Actionnable", color: "text-emerald-500", bg: "bg-emerald-50", icon: CheckCircle },
};

// ============================================
// LIST DETAIL PAGE
// ============================================

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { success, error: showError } = useToast();

    const isManager = session?.user?.role === "MANAGER";

    const [listId, setListId] = useState<string>("");
    const [list, setList] = useState<ListDetail | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [view, setView] = useState<"companies" | "contacts">("companies");

    // Bulk selection / deletion (companies or contacts)
    const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

    // Drawer states
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [selectedContact, setSelectedContact] = useState<(Contact & { companyName: string }) | null>(null);
    const [showCompanyDrawer, setShowCompanyDrawer] = useState(false);
    const [showContactDrawer, setShowContactDrawer] = useState(false);
    const [isCreatingCompany, setIsCreatingCompany] = useState(false);
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [unifiedDrawerTarget, setUnifiedDrawerTarget] = useState<{ contactId: string | null; companyId: string } | null>(null);
    const [clientBookingUrl, setClientBookingUrl] = useState("");
    const [clientInterlocuteurs, setClientInterlocuteurs] = useState<ClientInterlocuteur[]>([]);

    const hasAppliedUrlDrawers = useRef(false);

    // Resolve params
    useEffect(() => {
        params.then((p) => setListId(p.id));
    }, [params]);

    // ============================================
    // FETCH LIST
    // ============================================

    const fetchList = async () => {
        if (!listId) return;

        setIsLoading(true);
        try {
            const [listRes, companiesRes] = await Promise.all([
                fetch(`/api/lists/${listId}`),
                fetch(`/api/lists/${listId}/companies`),
            ]);

            const listJson = await listRes.json();
            const companiesJson = await companiesRes.json();

            if (listJson.success) {
                setList(listJson.data);
            } else {
                showError("Erreur", listJson.error || "Liste non trouvée");
                router.push("/manager/lists");
            }

            if (companiesJson.success) {
                setCompanies(companiesJson.data);
            }
        } catch (err) {
            console.error("Failed to fetch list:", err);
            showError("Erreur", "Impossible de charger la liste");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (listId) {
            fetchList();
        }
    }, [listId]);

    // Clear selection when switching between companies/contacts views
    useEffect(() => {
        setSelectedCompanyIds(new Set());
        setSelectedContactIds(new Set());
    }, [view]);

    useEffect(() => {
        const missionId = list?.mission?.id;
        if (!missionId) return;
        let mounted = true;
        (async () => {
            try {
                const res = await fetch(`/api/missions/${missionId}/client-booking`);
                const json = await res.json();
                if (!mounted || !json?.success) return;
                setClientBookingUrl(json.data?.bookingUrl ?? "");
                setClientInterlocuteurs(Array.isArray(json.data?.interlocuteurs) ? json.data.interlocuteurs : []);
            } catch {
                if (!mounted) return;
                setClientBookingUrl("");
                setClientInterlocuteurs([]);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [list?.mission?.id]);

    // Open contact + company drawers from URL (e.g. from global search)
    useEffect(() => {
        const contactId = searchParams.get("contactId");
        const companyId = searchParams.get("companyId");
        if (!contactId || !companyId || isLoading || !list || hasAppliedUrlDrawers.current || companies.length === 0) return;
        const allContacts: (Contact & { companyName: string })[] = companies.flatMap((company) =>
            company.contacts.map((contact) => ({
                ...contact,
                companyId: company.id,
                companyName: company.name,
            }))
        );
        const contact = allContacts.find((c) => c.id === contactId);
        const company = companies.find((c) => c.id === companyId);
        if (contact && company) {
            hasAppliedUrlDrawers.current = true;
            setSelectedCompany(company);
            setSelectedContact(contact);
            setShowCompanyDrawer(true);
            setShowContactDrawer(true);
            router.replace(`/manager/lists/${listId}`, { scroll: false });
        }
    }, [searchParams, isLoading, list, companies, listId, router]);

    // ============================================
    // DRAWER HANDLERS
    // ============================================

    const handleCompanyClick = (company: Company) => {
        setUnifiedDrawerTarget({ contactId: null, companyId: company.id });
    };

    const handleContactClick = (contact: Contact & { companyName: string }) => {
        setUnifiedDrawerTarget({ contactId: contact.id, companyId: contact.companyId });
    };

    const handleCompanyUpdate = (updatedCompany: Company) => {
        setCompanies((prev) =>
            prev.map((c) => (c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c))
        );
        setSelectedCompany((prev) => (prev?.id === updatedCompany.id ? { ...prev, ...updatedCompany } : prev));
        // Refresh list to update counts if needed
        if (updatedCompany._count.contacts !== selectedCompany?._count.contacts) {
            fetchList();
        }
    };

    const handleCompanyCreate = (newCompany: Company) => {
        setCompanies((prev) => [newCompany, ...prev]);
        fetchList(); // Refresh to update counts
    };

    const handleContactCreate = (newContact: Contact & { companyName: string }) => {
        // Find company and add contact
        setCompanies((prev) =>
            prev.map((company) => {
                if (company.id === newContact.companyId) {
                    return {
                        ...company,
                        contacts: [...company.contacts, newContact],
                        _count: {
                            contacts: company._count.contacts + 1,
                        },
                    };
                }
                return company;
            })
        );
        fetchList(); // Refresh to update counts
    };

    const handleContactUpdate = (updatedContact: Contact) => {
        // Update in companies list (nested)
        setCompanies((prev) =>
            prev.map((company) => {
                if (company.id === updatedContact.companyId) {
                    return {
                        ...company,
                        contacts: company.contacts.map((c) =>
                            c.id === updatedContact.id ? { ...c, ...updatedContact } : c
                        ),
                    };
                }
                return company;
            })
        );

        // Update selected contact if open
        if (selectedContact?.id === updatedContact.id) {
            setSelectedContact({
                ...updatedContact,
                companyName: selectedContact.companyName,
            });
        }

        // Update selected company's contacts if open
        if (selectedCompany && selectedCompany.id === updatedContact.companyId) {
            setSelectedCompany(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    contacts: prev.contacts.map(c => c.id === updatedContact.id ? updatedContact : c)
                }
            })
        }
    };

    // Handle contact click from inside CompanyDrawer
    const handleCompanyContactClick = (contact: Contact) => {
        if (!selectedCompany) return;

        setSelectedContact({
            ...contact,
            companyName: selectedCompany.name,
            companyId: selectedCompany.id
        });
        // We keep company drawer open but maybe overlay or switch? 
        // For better UX, let's close company and open contact, or just stack them.
        // Stacking might be complex with current implementation (one z-index).
        // Let's close company drawer and open contact drawer for now.
        setShowCompanyDrawer(false);
        setTimeout(() => setShowContactDrawer(true), 100);
    };

    // ============================================
    // DELETE LIST
    // ============================================

    const handleDelete = async () => {
        if (!list) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "DELETE",
            });

            const json = await res.json();

            if (json.success) {
                success("Liste supprimée", `${list.name} a été supprimée`);
                router.push("/manager/lists");
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de supprimer la liste");
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    // ============================================
    // BULK DELETE (SELECTED COMPANIES OR CONTACTS)
    // ============================================

    const selectedIds = view === "companies" ? selectedCompanyIds : selectedContactIds;

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        setIsBulkDeleting(true);
        try {
            const endpoint = view === "companies" ? "/api/companies" : "/api/contacts";
            let failCount = 0;

            await Promise.all(
                ids.map(async (id) => {
                    try {
                        const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
                        const json = await res.json();
                        if (!json.success) failCount++;
                    } catch {
                        failCount++;
                    }
                })
            );

            if (failCount > 0) {
                showError("Erreur", `${failCount} élément(s) n'ont pas pu être supprimé(s).`);
            } else {
                success("Supprimé", `${ids.length} élément(s) supprimé(s).`);
            }

            setSelectedCompanyIds(new Set());
            setSelectedContactIds(new Set());
            await fetchList();
        } finally {
            setIsBulkDeleting(false);
            setShowBulkDeleteModal(false);
        }
    };

    // ============================================
    // EXPORT CSV
    // ============================================

    const handleExport = () => {
        if (!list) return;
        window.location.href = `/api/lists/${list.id}/export`;
    };

    // ============================================
    // CUSTOM COMPANY FIELDS (FROM CSV IMPORT)
    // ============================================

    // Discover all custom field keys present in this list's companies
    const customCompanyFieldKeys = Array.from(
        new Set(
            companies.flatMap((company) =>
                company.customData ? Object.keys(company.customData) : []
            )
        )
    );

    const formatCustomFieldLabel = (key: string) => {
        // Convert snake_case / camelCase to "Title Case"
        const withSpaces = key
            .replace(/_/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2");
        return withSpaces
            .split(" ")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    // ============================================
    // COMPANY TABLE COLUMNS
    // ============================================

    const companyColumns: Column<Company>[] = [
        {
            key: "name",
            header: "Société",
            sortable: true,
            render: (_, company) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-900">{company.name}</p>
                        {company.website && (
                            <a
                                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline"
                            >
                                {company.website}
                            </a>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: "industry",
            header: "Industrie",
            sortable: true,
            render: (value) => <span className="text-slate-600">{value || "—"}</span>,
        },
        {
            key: "country",
            header: "Pays",
            sortable: true,
            render: (value) => <span className="text-slate-600">{value || "—"}</span>,
        },
        {
            key: "phone",
            header: "Téléphone",
            sortable: true,
            render: (value) => (
                <span className="text-slate-600">
                    {value ? value : "—"}
                </span>
            ),
        },
        {
            key: "contacts",
            header: "Contacts",
            render: (_, company) => (
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700">{company._count.contacts}</span>
                </div>
            ),
        },
        {
            key: "status",
            header: "Statut",
            render: (value) => {
                const config = STATUS_CONFIG[value as keyof typeof STATUS_CONFIG];
                const Icon = config.icon;
                return (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                );
            },
        },
    ];

    // Dynamically build columns for any custom company fields imported from CSV
    const customCompanyColumns: Column<Company>[] = customCompanyFieldKeys.map((fieldKey) => ({
        key: `custom_${fieldKey}`,
        header: formatCustomFieldLabel(fieldKey),
        sortable: false,
        importance: "secondary",
        render: (_, company) => {
            const value = company.customData ? company.customData[fieldKey] : undefined;
            if (value === null || value === undefined || value === "") {
                return <span className="text-slate-400">—</span>;
            }
            return <span className="text-slate-600">{String(value)}</span>;
        },
    }));

    // ============================================
    // CONTACT TABLE COLUMNS
    // ============================================

    // Flatten contacts from all companies
    const allContacts: (Contact & { companyName: string })[] = companies.flatMap((company) =>
        company.contacts.map((contact) => ({
            ...contact,
            companyId: company.id,
            companyName: company.name,
        }))
    );

    const contactColumns: Column<Contact & { companyName: string }>[] = [
        {
            key: "firstName",
            header: "Contact",
            sortable: true,
            render: (_, contact) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                        <Users className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-900">
                            {contact.firstName || ""} {contact.lastName || ""}
                        </p>
                        <p className="text-xs text-slate-500">{contact.title || "—"}</p>
                    </div>
                </div>
            ),
        },
        {
            key: "companyName",
            header: "Société",
            sortable: true,
            render: (value) => <span className="text-slate-700 font-medium">{value}</span>,
        },
        {
            key: "email",
            header: "Email",
            render: (value) => {
                if (!value) return <span className="text-slate-400">—</span>;
                if (!isManager) {
                    const [user, domain] = value.split("@");
                    return <span className="text-slate-500 font-mono text-xs">{user[0]}***@{domain}</span>;
                }
                return (
                    <a href={`mailto:${value}`} className="text-indigo-600 hover:underline text-sm">
                        {value}
                    </a>
                );
            },
        },
        {
            key: "phone",
            header: "Téléphone",
            render: (value) => {
                if (!value) return <span className="text-slate-400">—</span>;
                if (!isManager) {
                    return <span className="text-slate-500 font-mono text-xs">{value.substring(0, 3)}*******</span>;
                }
                return (
                    <a href={`tel:${value}`} className="text-slate-600 text-sm">
                        {value}
                    </a>
                );
            },
        },
        {
            key: "linkedin",
            header: "LinkedIn",
            render: (value) => {
                if (!value) return <span className="text-slate-400">—</span>;
                if (!isManager) {
                    return <span className="text-slate-500 font-mono text-xs">Profil masqué</span>;
                }
                return (
                    <a
                        href={value.startsWith("http") ? value : `https://${value}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline text-sm"
                    >
                        Profil
                    </a>
                );
            },
        },
        {
            key: "status",
            header: "Statut",
            render: (value) => {
                const config = STATUS_CONFIG[value as keyof typeof STATUS_CONFIG];
                const Icon = config.icon;
                return (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                );
            },
        },
    ];

    // ============================================
    // LOADING STATE
    // ============================================

    if (isLoading || !list) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                            <div className="h-16 bg-slate-200 rounded animate-pulse" />
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    const totalContacts = companies.reduce((acc, c) => acc + c._count.contacts, 0);
    const actionableCount = companies.filter((c) => c.status === "ACTIONABLE").length;

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-5">
                    <Link href={isManager ? "/manager/lists" : "/sdr/lists"}>
                        <button className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    </Link>
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center border border-indigo-100/50 shadow-sm">
                            <List className="w-7 h-7 text-indigo-600" />
                        </div>
                        <div className="pt-1">
                            <div className="flex items-center gap-3 mb-1.5">
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{list.name}</h1>
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                    {list.type}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                <Building2 className="w-4 h-4 text-slate-400" />
                                <span>{list.mission.client.name}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600">{list.mission.name}</span>
                                {list.source && (
                                    <>
                                        <span className="text-slate-300">•</span>
                                        <span>Source: {list.source}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchList}
                        title="Rafraîchir"
                        className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    {isManager && (
                        <>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                <Download className="w-4 h-4 text-slate-400" />
                                Exporter
                            </button>
                            <Link
                                href={`/manager/lists/${list.id}/edit`}
                                className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                <Edit className="w-4 h-4 text-slate-400" />
                                Modifier
                            </Link>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="flex items-center justify-center w-10 h-10 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors shadow-sm"
                                title="Supprimer la liste"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{companies.length}</p>
                            <p className="text-sm font-medium text-slate-500">Sociétés</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-sky-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{totalContacts}</p>
                            <p className="text-sm font-medium text-slate-500">Contacts totaux</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{actionableCount}</p>
                            <p className="text-sm font-medium text-slate-500">Qualifiés / Actionnables</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                            <Mail className="w-6 h-6 text-violet-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {companies.reduce((acc, c) => acc + c.contacts.filter((ct) => ct.email).length, 0)}
                            </p>
                            <p className="text-sm font-medium text-slate-500">Avec adresses e-mail</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Prospection Health */}
            <Card className="p-5">
                <div className="mb-3">
                    <h2 className="text-lg font-bold text-slate-900">Santé de prospection</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Indicateurs calculés sur les actions réelles (couverture, cadence, ETA, alertes).
                    </p>
                </div>
                <ProspectionHealthPanel listId={list.id} />
            </Card>

            {/* Data Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col min-h-[500px]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-bold text-slate-900">
                        {view === "companies" ? "Répertoire des Sociétés" : "Annuaire des Contacts"}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                        {isManager && (
                            <>
                                {view === "companies" ? (
                                    <button
                                        onClick={() => {
                                            setIsCreatingCompany(true);
                                            setSelectedCompany(null);
                                            setShowCompanyDrawer(true);
                                        }}
                                        className="mgr-btn-primary flex items-center gap-2 h-10 px-4 text-sm font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Ajouter une société
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setIsCreatingContact(true);
                                            setSelectedContact(null);
                                            setShowContactDrawer(true);
                                        }}
                                        disabled={companies.length === 0}
                                        className="mgr-btn-primary flex items-center gap-2 h-10 px-4 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Ajouter un contact
                                    </button>
                                )}
                            </>
                        )}
                        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner">
                            <button
                                onClick={() => setView("companies")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${view === "companies"
                                    ? "bg-white text-indigo-700 shadow border-b border-indigo-100"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                <Building2 className={`w-4 h-4 ${view === "companies" ? "text-indigo-500" : "text-slate-400"}`} />
                                Sociétés ({companies.length})
                            </button>
                            <button
                                onClick={() => setView("contacts")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${view === "contacts"
                                    ? "bg-white text-indigo-700 shadow border-b border-indigo-100"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                <Users className={`w-4 h-4 ${view === "contacts" ? "text-indigo-500" : "text-slate-400"}`} />
                                Contacts ({totalContacts})
                            </button>
                        </div>
                    </div>
                </div>

                {isManager && selectedIds.size > 0 && (
                    <div className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                        <span className="text-sm font-medium text-indigo-700">
                            {selectedIds.size} {view === "companies" ? "société(s)" : "contact(s)"} sélectionné(e)(s)
                        </span>
                        <button
                            onClick={() => setShowBulkDeleteModal(true)}
                            className="flex items-center gap-2 h-9 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Supprimer la sélection
                        </button>
                    </div>
                )}

                {view === "companies" ? (
                    companies.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center justify-center flex-1">
                            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-6">
                                <Building2 className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Aucune société</h3>
                            <p className="text-slate-500 mt-2 max-w-sm">
                                Cette liste est actuellement vide. Importez des données ou ajoutez une société manuellement pour commencer.
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0">
                            <DataTable
                                data={companies}
                                columns={[...companyColumns, ...customCompanyColumns]}
                                keyField="id"
                                searchable
                                searchPlaceholder="Rechercher une société (nom, industrie, pays)..."
                                searchFields={["name", "industry", "country"]}
                                pagination
                                pageSize={15}
                                onRowClick={handleCompanyClick}
                                enableSecondaryColumnsToggle
                                selectable={isManager}
                                selectedIds={selectedCompanyIds}
                                onSelectionChange={(ids) => setSelectedCompanyIds(new Set(ids))}
                            />
                        </div>
                    )
                ) : (
                    allContacts.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center justify-center flex-1">
                            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-6">
                                <Users className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Aucun contact</h3>
                            <p className="text-slate-500 mt-2 max-w-sm">
                                Aucun contact répertorié. Vous pouvez en ajouter depuis la vue détaillée d&apos;une société ou via un nouvel import.
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0">
                            <DataTable
                                data={allContacts}
                                columns={contactColumns}
                                keyField="id"
                                searchable
                                searchPlaceholder="Rechercher un contact..."
                                searchFields={["firstName", "lastName", "email", "companyName"]}
                                pagination
                                pageSize={15}
                                onRowClick={handleContactClick}
                                selectable={isManager}
                                selectedIds={selectedContactIds}
                                onSelectionChange={(ids) => setSelectedContactIds(new Set(ids))}
                            />
                        </div>
                    )
                )}
            </div>

            {/* Company Drawer */}
            <CompanyDrawer
                isOpen={showCompanyDrawer}
                onClose={() => {
                    setShowCompanyDrawer(false);
                    setIsCreatingCompany(false);
                    setSelectedCompany(null);
                }}
                company={selectedCompany}
                onUpdate={handleCompanyUpdate}
                onCreate={isCreatingCompany ? handleCompanyCreate : undefined}
                onContactClick={handleCompanyContactClick}
                isManager={isManager}
                listId={listId}
                isCreating={isCreatingCompany}
            />

            {/* Contact Drawer */}
            <ContactDrawer
                isOpen={showContactDrawer}
                onClose={() => {
                    setShowContactDrawer(false);
                    setIsCreatingContact(false);
                    setSelectedContact(null);
                }}
                contact={selectedContact}
                onUpdate={handleContactUpdate}
                onCreate={isCreatingContact ? handleContactCreate : undefined}
                isManager={isManager}
                listId={listId}
                companies={companies}
                isCreating={isCreatingContact}
            />

            {/* Unified Action Drawer (open on row click) */}
            {unifiedDrawerTarget && (
                <UnifiedActionDrawer
                    isOpen={!!unifiedDrawerTarget}
                    onClose={() => setUnifiedDrawerTarget(null)}
                    contactId={unifiedDrawerTarget.contactId}
                    companyId={unifiedDrawerTarget.companyId}
                    missionId={list.mission.id}
                    missionName={list.mission.name}
                    clientBookingUrl={clientBookingUrl || undefined}
                    clientInterlocuteurs={clientInterlocuteurs}
                    onActionRecorded={fetchList}
                    onContactSelect={(newContactId) => {
                        setUnifiedDrawerTarget((prev) => (prev ? { ...prev, contactId: newContactId } : prev));
                    }}
                />
            )}

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                title="Supprimer la liste ?"
                message={`Êtes-vous sûr de vouloir supprimer "${list.name}" ? Cette action supprimera également toutes les sociétés et contacts associés.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />

            {/* Bulk Delete Confirmation */}
            <ConfirmModal
                isOpen={showBulkDeleteModal}
                onClose={() => setShowBulkDeleteModal(false)}
                onConfirm={handleBulkDelete}
                title={
                    view === "companies"
                        ? "Supprimer les sociétés sélectionnées ?"
                        : "Supprimer les contacts sélectionnés ?"
                }
                message={
                    view === "companies"
                        ? `Êtes-vous sûr de vouloir supprimer ${selectedIds.size} société(s) ? Les contacts associés seront également supprimés.`
                        : `Êtes-vous sûr de vouloir supprimer ${selectedIds.size} contact(s) ?`
                }
                confirmText="Supprimer"
                variant="danger"
                isLoading={isBulkDeleting}
            />
        </div>
    );
}
