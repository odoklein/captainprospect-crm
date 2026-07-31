"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, Badge, Button, DataTable, useToast } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { CompanyDrawer, ContactDrawer } from "@/components/drawers";
import {
    ArrowLeft,
    List as ListIcon,
    Building2,
    Users,
    Mail,
    Phone,
    Linkedin,
    CheckCircle,
    AlertCircle,
    Clock,
    RefreshCw,
    PenLine
} from "lucide-react";
import Link from "next/link";

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

interface Company {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    phone: string | null;
    size: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    customData?: Record<string, any> | null;
    _count: {
        contacts: number;
    };
    contacts: Contact[];
}

const STATUS_CONFIG = {
    INCOMPLETE: { label: "Incomplet", color: "text-red-500", bg: "bg-red-50", icon: AlertCircle },
    PARTIAL: { label: "Partiel", color: "text-amber-500", bg: "bg-amber-50", icon: Clock },
    ACTIONABLE: { label: "Actionnable", color: "text-emerald-500", bg: "bg-emerald-50", icon: CheckCircle },
};

// ============================================
// SDR LIST DETAIL PAGE
// ============================================

export default function SDRListDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { success, error: showError } = useToast();

    const [listId, setListId] = useState<string>("");
    const [list, setList] = useState<ListDetail | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<"companies" | "contacts">("contacts"); // Default to contacts for SDR

    // Drawer state (contact or company fiche — view and edit)
    const [editContact, setEditContact] = useState<Contact | null>(null);
    const [editCompany, setEditCompany] = useState<Company | null>(null);

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
            // Note: Reuse manager API if permissions allow, or existing SDR specific endpoints
            // Assuming permissions valid for READ
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
                router.push("/sdr/lists"); // Redirect to SDR lists if failing
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

    // Open contact + company drawers from URL (e.g. from global search)
    useEffect(() => {
        const contactId = searchParams.get("contactId");
        const companyId = searchParams.get("companyId");
        if (!contactId || !companyId || isLoading || !list || hasAppliedUrlDrawers.current || companies.length === 0) return;
        const allContacts = companies.flatMap((company) =>
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
            setEditCompany({ ...company, missionId: list.mission?.id } as Company & { missionId?: string });
            setEditContact({ ...contact, companyName: company.name, missionId: list.mission?.id } as Contact & { companyName?: string; missionId?: string });
            router.replace(`/sdr/lists/${listId}`, { scroll: false });
        }
    }, [searchParams, isLoading, list, companies, listId, router]);

    // ============================================
    // EDIT HANDLERS
    // ============================================

    const handleEditContact = (contact: Contact | (Contact & { companyName?: string })) => {
        setEditCompany(null);
        setEditContact({ ...(contact as Contact), missionId: list?.mission?.id } as Contact & { missionId?: string });
    };

    const handleEditCompany = (company: Company) => {
        setEditContact(null);
        setEditCompany({ ...company, missionId: list?.mission?.id } as Company & { missionId?: string });
    };

    const handleContactFromCompanyDrawer = (contact: Contact) => {
        setEditCompany(null);
        setEditContact({ ...contact, companyName: editCompany?.name ?? undefined });
    };

    const handleContactCreated = (contact: Contact & { companyName?: string }) => {
        setEditCompany(null);
        setEditContact({ ...contact, companyName: contact.companyName ?? editCompany?.name });
        fetchList();
    };

    // ============================================
    // CUSTOM FIELDS EXTRACTION
    // ============================================

    const customCompanyFieldKeys = Array.from(
        new Set(
            companies.flatMap((company) =>
                company.customData ? Object.keys(company.customData) : []
            )
        )
    );

    const formatCustomFieldLabel = (fieldKey: string): string => {
        return fieldKey
            .replace(/_/g, " ")
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    // ============================================
    // COLUMNS
    // ============================================

    const companyColumns: Column<Company>[] = [
        {
            key: "name",
            header: "Société",
            sortable: true,
            render: (_, company) => (
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => handleEditCompany(company)}>
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{company.name}</p>
                            <PenLine className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {company.website && (
                            <span className="text-xs text-slate-500">{company.website}</span>
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
            key: "contacts",
            header: "Contacts",
            render: (_, company) => (
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700">{company._count.contacts}</span>
                </div>
            ),
        },
    ];

    // Custom company columns for SDR view
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

    const allContacts = companies.flatMap((company) =>
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
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => handleEditContact(contact)}>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                        <Users className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 group-hover:text-emerald-600 transition-colors">
                                {contact.firstName || ""} {contact.lastName || ""}
                            </p>
                            <PenLine className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
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
            render: (value, contact) => (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleEditContact(contact)}>
                    {value ? (
                        <span className="text-sm text-slate-600">{value}</span>
                    ) : (
                        <span className="text-xs text-slate-400 italic">Ajouter email...</span>
                    )}
                </div>
            )
        },
        {
            key: "phone",
            header: "Téléphone",
            render: (value, contact) => (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleEditContact(contact)}>
                    {value ? (
                        <span className="text-sm text-slate-600">{value}</span>
                    ) : (
                        <span className="text-xs text-slate-400 italic">Ajouter tél...</span>
                    )}
                </div>
            )
        },
    ];

    // ============================================
    // RENDER
    // ============================================

    if (isLoading || !list) {
        return (
            <div className="p-6 space-y-6">
                <div className="animate-pulse h-10 w-48 bg-slate-200 rounded"></div>
                <div className="animate-pulse h-96 w-full bg-slate-200 rounded"></div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Back button logic can be handled or removed depending on nav structure */}
                    <Link href="/sdr/action">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{list.name}</h1>
                        <p className="text-slate-500">{list.mission.client.name} - {list.mission.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => setView("contacts")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${view === "contacts" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-50"
                            }`}
                    >
                        Vue Contacts
                    </button>
                    <button
                        onClick={() => setView("companies")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${view === "companies" ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-50"
                            }`}
                    >
                        Vue Sociétés
                    </button>
                    <Button variant="ghost" size="sm" onClick={fetchList}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Table */}
            <Card className="shadow-sm">
                <DataTable
                    data={view === 'companies' ? companies : allContacts as any}
                    columns={view === 'companies' ? [...companyColumns, ...customCompanyColumns] : contactColumns as any}
                    keyField="id"
                    searchable
                    searchPlaceholder={`Rechercher ${view === 'companies' ? 'une société' : 'un contact'}...`}
                    searchFields={view === 'companies' ? ['name', 'industry'] : ['firstName', 'lastName', 'email', 'companyName']}
                    pagination
                    pageSize={20}
                    enableSecondaryColumnsToggle={view === 'companies'}
                />
            </Card>

            {/* Contact drawer — view and edit */}
            <ContactDrawer
                isOpen={!!editContact}
                onClose={() => setEditContact(null)}
                contact={editContact}
                onUpdate={() => fetchList()}
                isManager={true}
                enableGooglePhoneLookup
                listId={listId || undefined}
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            />

            {/* Company drawer — view and edit; SDR can add contacts from here (company-only lists) */}
            <CompanyDrawer
                isOpen={!!editCompany}
                onClose={() => setEditCompany(null)}
                company={editCompany}
                onUpdate={() => fetchList()}
                onContactClick={handleContactFromCompanyDrawer}
                onContactCreated={handleContactCreated}
                isManager={true}
                enableGooglePhoneLookup
                listId={listId || undefined}
            />
        </div>
    );
}
