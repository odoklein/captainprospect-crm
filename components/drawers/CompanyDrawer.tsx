"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Drawer, DrawerSection, DrawerField, Button, Input, Badge, Select, useToast } from "@/components/ui";
import { ACTION_RESULT_LABELS, type ActionResult } from "@/lib/types";
import {
    Building2,
    Globe,
    MapPin,
    Users,
    Briefcase,
    Tag,
    Edit,
    Save,
    X,
    Copy,
    ExternalLink,
    AlertCircle,
    Clock,
    CheckCircle,
    User,
    Mail,
    Phone,
    Linkedin,
    Loader2,
    Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickEmailModal } from "@/components/email/QuickEmailModal";
import { ContactDrawer } from "./ContactDrawer";

// ============================================
// TYPES
// ============================================

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
}

interface Company {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    phone: string | null;
    additionalPhones?: string[] | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    contacts: Contact[];
    _count: {
        contacts: number;
    };
    missionId?: string;
}

interface CompanyDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    company: Company | null;
    onUpdate?: (company: Company) => void;
    onCreate?: (company: Company) => void;
    onContactClick?: (contact: Contact) => void;
    /** When a new contact is created from this drawer (e.g. "Add contact"), call with the new contact so parent can open it */
    onContactCreated?: (contact: Contact & { companyName?: string }) => void;
    isManager?: boolean;
    listId?: string;
    isCreating?: boolean;
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_CONFIG = {
    INCOMPLETE: { label: "Incomplet", color: "text-red-500", bg: "bg-red-50", borderColor: "border-red-200", icon: AlertCircle },
    PARTIAL: { label: "Partiel", color: "text-amber-500", bg: "bg-amber-50", borderColor: "border-amber-200", icon: Clock },
    ACTIONABLE: { label: "Actionnable", color: "text-emerald-500", bg: "bg-emerald-50", borderColor: "border-emerald-200", icon: CheckCircle },
};

const STATUS_HOVER_HINTS: Record<string, string> = {
    RELANCE: "Rappel demandé\nLe prospect attend ton appel\nIl y a un signal d'intérêt",
    RAPPEL: "Rappel à faire\nLe prospect n'a pas encore été joint\nC'est un rappel logistique, pas commercial",
};

// ============================================
// COMPANY DRAWER COMPONENT
// ============================================

export function CompanyDrawer({
    isOpen,
    onClose,
    company,
    onUpdate,
    onCreate,
    onContactClick,
    onContactCreated,
    isManager = false,
    listId,
    isCreating = false,
}: CompanyDrawerProps) {
    const { success, error: showError } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        industry: "",
        country: "",
        website: "",
        size: "",
        phone: "",
    });
    const [actions, setActions] = useState<Array<{ id: string; result: string; note: string | null; createdAt: string; campaign?: { name: string }; sdr?: { id: string; name: string } }>>([]);
    const [actionsLoading, setActionsLoading] = useState(false);
    const lastCompanyIdRef = useRef<string | null>(null);
    const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; mission?: { channel: string } }>>([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [resolvedMissionId, setResolvedMissionId] = useState<string | null>(null);
    const [missionIdLoading, setMissionIdLoading] = useState(false);
    const [newActionResult, setNewActionResult] = useState<string>("");
    const [newActionNote, setNewActionNote] = useState("");
    const [newActionSaving, setNewActionSaving] = useState(false);
    const [newCallbackDateValue, setNewCallbackDateValue] = useState("");
    const [showQuickEmailModal, setShowQuickEmailModal] = useState(false);
    const [missionName, setMissionName] = useState<string>("");
    const [showAddContact, setShowAddContact] = useState(false);
    const [statusConfig, setStatusConfig] = useState<{ statuses: Array<{ code: string; label: string; requiresNote: boolean; triggersCallback?: boolean }> } | null>(null);
    const companyPhones = useMemo(() => {
        if (!company) return [];

        return [company.phone, ...(company.additionalPhones ?? [])]
            .map((value) => value?.trim() ?? "")
            .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
    }, [company]);
    const primaryCompanyPhone = companyPhones[0] ?? null;

    const effectiveMissionId = company?.missionId ?? resolvedMissionId ?? undefined;

    // Resolve missionId when company has no missionId (e.g. opened from list)
    useEffect(() => {
        if (!company?.id || isCreating || company.missionId) {
            setResolvedMissionId(null);
            return;
        }
        setMissionIdLoading(true);
        fetch(`/api/companies/${company.id}/mission`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.missionId) {
                    setResolvedMissionId(json.data.missionId);
                } else {
                    setResolvedMissionId(null);
                }
            })
            .catch(() => setResolvedMissionId(null))
            .finally(() => setMissionIdLoading(false));
    }, [company?.id, company?.missionId, isCreating]);

    // Fetch campaigns when we have missionId (for "add action" form)
    useEffect(() => {
        if (!effectiveMissionId || isCreating) {
            setCampaigns([]);
            setCampaignsLoading(false);
            return;
        }
        setCampaignsLoading(true);
        fetch(`/api/campaigns?missionId=${effectiveMissionId}&isActive=true&limit=50`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setCampaigns(json.data);
                } else {
                    setCampaigns([]);
                }
            })
            .catch(() => setCampaigns([]))
            .finally(() => setCampaignsLoading(false));
    }, [effectiveMissionId, isCreating]);

    // Fetch mission name for QuickEmailModal
    useEffect(() => {
        if (!effectiveMissionId || isCreating) {
            setMissionName("");
            return;
        }
        fetch(`/api/missions/${effectiveMissionId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.name) {
                    setMissionName(json.data.name);
                } else {
                    setMissionName("");
                }
            })
            .catch(() => setMissionName(""));
    }, [effectiveMissionId, isCreating]);

    // Fetch status config when mission is available
    useEffect(() => {
        if (!effectiveMissionId) {
            setStatusConfig(null);
            return;
        }
        fetch(`/api/config/action-statuses?missionId=${effectiveMissionId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.statuses) {
                    setStatusConfig({ statuses: json.data.statuses });
                } else {
                    setStatusConfig(null);
                }
            })
            .catch(() => setStatusConfig(null));
    }, [effectiveMissionId]);

    const getRequiresNote = (code: string) =>
        statusConfig?.statuses?.find((s) => s.code === code)?.requiresNote ??
        ["INTERESTED", "CALLBACK_REQUESTED", "ENVOIE_MAIL"].includes(code);

    const statusOptions = statusConfig?.statuses?.length
        ? statusConfig.statuses.map((s) => ({ value: s.code, label: s.label, title: STATUS_HOVER_HINTS[s.code] }))
        : Object.entries(ACTION_RESULT_LABELS).map(([value, label]) => ({ value, label, title: STATUS_HOVER_HINTS[value] }));

    const statusLabels: Record<string, string> = statusConfig?.statuses?.length
        ? Object.fromEntries(statusConfig.statuses.map((s) => [s.code, s.label]))
        : { ...ACTION_RESULT_LABELS };

    const callbackResultCodes = useMemo(() => {
        const defaults = ["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"];
        if (!statusConfig?.statuses?.length) return new Set<string>(defaults);

        const configured = statusConfig.statuses
            .filter((s) => {
                if (s.triggersCallback === true) return true;
                const haystack = `${s.code} ${s.label}`.toUpperCase();
                return haystack.includes("RAPPEL") || haystack.includes("RELANCE");
            })
            .map((s) => s.code);

        return new Set<string>([...defaults, ...configured]);
    }, [statusConfig]);

    const isCallbackResult = (code: string | null | undefined) => !!code && callbackResultCodes.has(code);

    // Fetch actions history when drawer opens with a company
    useEffect(() => {
        if (!isOpen || isCreating || !company?.id) {
            setActions([]);
            return;
        }
        setActionsLoading(true);
        fetch(`/api/actions?companyId=${company.id}&limit=20`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setActions(
                        (json.data as Array<{ id: string; result: string; note: string | null; createdAt: string; campaign?: { name: string }; sdr?: { id: string; name: string } }>).map(
                            (a) => ({
                                id: a.id,
                                result: a.result,
                                note: a.note ?? null,
                                createdAt: a.createdAt,
                                campaign: a.campaign,
                                sdr: a.sdr,
                            })
                        )
                    );
                } else {
                    setActions([]);
                }
            })
            .catch(() => setActions([]))
            .finally(() => setActionsLoading(false));
    }, [isOpen, isCreating, company?.id]);

    // Reset form only when company *id* changes (not on every parent re-render with new object ref)
    useEffect(() => {
        if (isCreating) {
            lastCompanyIdRef.current = null;
            setFormData({
                name: "",
                industry: "",
                country: "",
                website: "",
                size: "",
                phone: "",
            });
            setIsEditing(true);
        } else if (company) {
            const isNewCompany = lastCompanyIdRef.current !== company.id;
            lastCompanyIdRef.current = company.id;
            if (isNewCompany) {
                setFormData({
                    name: company.name || "",
                    industry: company.industry || "",
                    country: company.country || "",
                    website: company.website || "",
                    size: company.size || "",
                    phone: company.phone || company.additionalPhones?.[0] || "",
                });
                setIsEditing(false);
            }
        } else {
            lastCompanyIdRef.current = null;
        }
    }, [company?.id, isCreating]);

    // ============================================
    // SAVE HANDLER
    // ============================================

    const handleSave = async () => {
        if (isCreating) {
            // Create new company
            if (!listId || !formData.name.trim()) {
                showError("Erreur", "Le nom de la société est requis");
                return;
            }

            setIsSaving(true);
            try {
                const res = await fetch(`/api/lists/${listId}/companies`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: formData.name,
                        industry: formData.industry || undefined,
                        country: formData.country || undefined,
                        website: formData.website || undefined,
                        size: formData.size || undefined,
                    }),
                });

                const json = await res.json();

                if (json.success) {
                    success("Société créée", `${formData.name} a été créée`);
                    if (onCreate) {
                        onCreate(json.data);
                    }
                    onClose();
                } else {
                    showError("Erreur", json.error || "Impossible de créer la société");
                }
            } catch (err) {
                showError("Erreur", "Impossible de créer la société");
            } finally {
                setIsSaving(false);
            }
        } else {
            // Update existing company (listId only required for create)
            if (!company) return;

            setIsSaving(true);
            try {
                const res = await fetch(`/api/companies/${company.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData),
                });

                const json = await res.json();

                if (json.success) {
                    success("Société mise à jour", `${formData.name} a été mis à jour`);
                    setIsEditing(false);
                    if (onUpdate) {
                        onUpdate({ ...company, ...formData });
                    }
                } else {
                    showError("Erreur", json.error || "Impossible de mettre à jour");
                }
            } catch (err) {
                showError("Erreur", "Impossible de mettre à jour la société");
            } finally {
                setIsSaving(false);
            }
        }
    };

    // ============================================
    // COPY TO CLIPBOARD
    // ============================================

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        success("Copié", `${label} copié dans le presse-papier`);
    };

    const recordAction = async (result: string, note?: string, callbackDate?: string) => {
        const campaignId = campaigns[0]?.id;
        if (!company || !campaignId) return false;
        const selectedCampaign = campaigns[0];
        const channel = (selectedCampaign?.mission?.channel ?? "CALL") as "CALL" | "EMAIL" | "LINKEDIN";
        const res = await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                companyId: company.id,
                campaignId,
                channel: result === "ENVOIE_MAIL" ? "EMAIL" : channel,
                result,
                note: note || undefined,
                callbackDate: callbackDate || undefined,
            }),
        });
        const json = await res.json();
        if (json.success) {
            success("Action enregistrée", "L'action a été ajoutée à l'historique");
            setNewActionNote("");
            setNewActionResult("");
            setNewCallbackDateValue("");
            setActions((prev) => [
                {
                    id: json.data.id,
                    result: json.data.result,
                    note: json.data.note ?? null,
                    createdAt: json.data.createdAt,
                    campaign: json.data.campaign,
                },
                ...prev,
            ]);
            return true;
        }
        showError("Erreur", json.error || "Impossible d'enregistrer l'action");
        return false;
    };

    const handleAddAction = async () => {
        const campaignId = campaigns[0]?.id;
        if (!company || !campaignId) {
            showError("Erreur", "Aucune campagne disponible pour cette mission");
            return;
        }
        if (!newActionResult) {
            showError("Erreur", "Sélectionnez un résultat");
            return;
        }
        if (newActionResult === "ENVOIE_MAIL") {
            setShowQuickEmailModal(true);
            return;
        }
        const noteRequired = getRequiresNote(newActionResult);
        if (noteRequired && !newActionNote.trim()) {
            showError("Erreur", "Une note est requise pour ce résultat");
            return;
        }
        setNewActionSaving(true);
        try {
            await recordAction(
                newActionResult,
                newActionNote.trim() || undefined,
                isCallbackResult(newActionResult) && newCallbackDateValue
                    ? new Date(newCallbackDateValue).toISOString()
                    : undefined
            );
        } catch {
            showError("Erreur", "Impossible d'enregistrer l'action");
        } finally {
            setNewActionSaving(false);
        }
    };

    const handleEmailSent = () => {
        recordAction("MAIL_ENVOYE", "Email envoyé via template");
        setShowQuickEmailModal(false);
    };

    if (!isCreating && !company) return null;

    const companyStatusConfig = isCreating ? null : STATUS_CONFIG[company!.status];
    const StatusIcon = companyStatusConfig?.icon;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={isCreating ? "Nouvelle société" : (isEditing ? "Modifier la société" : company!.name)}
            description={isCreating ? "Ajoutez une nouvelle société à la liste" : (isEditing ? "Modifiez les informations de la société" : undefined)}
            size="lg"
            footer={
                isManager && (
                    <div className="flex items-center justify-end gap-3">
                        {isEditing || isCreating ? (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setIsEditing(false);
                                        onClose();
                                    }}
                                    disabled={isSaving}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Annuler
                                </Button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    onClick={handleSave}
                                    disabled={isSaving || !formData.name.trim()}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? (isCreating ? "Création..." : "Enregistrement...") : (isCreating ? "Créer" : "Enregistrer")}
                                </Button>
                            </>
                        ) : (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsEditing(true)}
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Modifier
                            </Button>
                        )}
                    </div>
                )
            }
        >
            <div className="space-y-6">
                {/* Status Badge */}
                {!isEditing && !isCreating && companyStatusConfig && StatusIcon && (
                    <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
                        companyStatusConfig.bg,
                        companyStatusConfig.borderColor,
                        "border"
                    )}>
                        <StatusIcon className={cn("w-4 h-4", companyStatusConfig.color)} />
                        <span className={cn("text-sm font-medium", companyStatusConfig.color)}>
                            {companyStatusConfig.label}
                        </span>
                    </div>
                )}

                {/* Company Info */}
                <DrawerSection title="Informations">
                    {(isEditing || isCreating) ? (
                        <div className="space-y-4">
                            <Input
                                label="Nom de la société *"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                icon={<Building2 className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Industrie"
                                value={formData.industry}
                                onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                                icon={<Briefcase className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Pays"
                                value={formData.country}
                                onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                                icon={<MapPin className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Site web"
                                value={formData.website}
                                onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                                icon={<Globe className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Téléphone"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="Numéro de téléphone principal"
                                icon={<Phone className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Taille"
                                value={formData.size}
                                onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                                placeholder="ex: 50-100, PME, Grande entreprise"
                                icon={<Users className="w-4 h-4 text-slate-400" />}
                            />
                        </div>
                    ) : company ? (
                        <div className="space-y-4">
                            <DrawerField
                                label="Industrie"
                                value={company!.industry}
                                icon={<Briefcase className="w-5 h-5 text-indigo-500" />}
                            />
                            <DrawerField
                                label="Pays"
                                value={company!.country}
                                icon={<MapPin className="w-5 h-5 text-indigo-500" />}
                            />
                            <DrawerField
                                label="Site web"
                                value={
                                    company!.website && (
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={company!.website.startsWith("http") ? company!.website : `https://${company!.website}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 hover:underline truncate max-w-[200px]"
                                            >
                                                {company!.website}
                                            </a>
                                            <button
                                                onClick={() => copyToClipboard(company!.website!, "Site web")}
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                            <a
                                                href={company!.website.startsWith("http") ? company!.website : `https://${company!.website}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    )
                                }
                                icon={<Globe className="w-5 h-5 text-indigo-500" />}
                            />
                            <DrawerField
                                label="Téléphone"
                                value={
                                    companyPhones.length > 0 && (
                                        <div className="space-y-1">
                                            {companyPhones.map((phone, index) => (
                                                <div key={phone} className="flex items-center gap-2">
                                                    <a
                                                        href={`tel:${phone}`}
                                                        className="text-indigo-600 hover:underline font-medium"
                                                    >
                                                        {phone}
                                                    </a>
                                                    {index === 0 ? (
                                                        <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">
                                                            Principal
                                                        </span>
                                                    ) : null}
                                                    <button
                                                        onClick={() => copyToClipboard(phone, index === 0 ? "Téléphone" : "Téléphone suppl.")}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                }
                                icon={<Phone className="w-5 h-5 text-emerald-500" />}
                            />
                            <DrawerField
                                label="Taille"
                                value={company!.size}
                                icon={<Users className="w-5 h-5 text-indigo-500" />}
                            />
                        </div>
                    ) : null}
                </DrawerSection>

                {/* Quick Call Action - Show prominent call button if company has phone */}
                {!isEditing && !isCreating && company && primaryCompanyPhone && (
                    <div className="-mt-2">
                        <a
                            href={`tel:${primaryCompanyPhone}`}
                            className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl font-semibold text-base shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02]"
                        >
                            <Phone className="w-5 h-5" />
                            Appeler {company.name}
                        </a>
                    </div>
                )}

                {/* Contacts List */}
                {!isEditing && !isCreating && company && (
                    <DrawerSection title={`Contacts (${company.contacts.length})`}>
                        <div className="flex justify-end mb-3">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddContact(true)}
                                className="gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Ajouter un contact
                            </Button>
                        </div>
                        {company.contacts.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">Aucun contact</p>
                                <p className="text-xs text-slate-400 mt-1">Utilisez le bouton ci-dessus pour en ajouter un</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {company!.contacts.map((contact) => {
                                    const contactStatus = STATUS_CONFIG[contact.status];
                                    const ContactStatusIcon = contactStatus.icon;

                                    return (
                                        <button
                                            key={contact.id}
                                            onClick={() => onContactClick?.(contact)}
                                            className="w-full text-left p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                                    <User className="w-5 h-5 text-emerald-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                            {contact.firstName || ""} {contact.lastName || ""}
                                                            {!contact.firstName && !contact.lastName && (
                                                                <span className="text-slate-400 italic">Sans nom</span>
                                                            )}
                                                        </p>
                                                        <div className={cn(
                                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                                                            contactStatus.bg
                                                        )}>
                                                            <ContactStatusIcon className={cn("w-3 h-3", contactStatus.color)} />
                                                            <span className={contactStatus.color}>{contactStatus.label}</span>
                                                        </div>
                                                    </div>
                                                    {contact.title && (
                                                        <p className="text-sm text-slate-500 truncate">{contact.title}</p>
                                                    )}
                                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                                                        {contact.email && (
                                                            <span className="flex items-center gap-1">
                                                                <Mail className="w-3 h-3" />
                                                                {isManager ? contact.email : `${contact.email.split("@")[0][0]}***@${contact.email.split("@")[1]}`}
                                                            </span>
                                                        )}
                                                        {contact.phone && (
                                                            <span className="flex items-center gap-1">
                                                                <Phone className="w-3 h-3" />
                                                                {isManager ? contact.phone : `${contact.phone.substring(0, 3)}***`}
                                                            </span>
                                                        )}
                                                        {contact.linkedin && (
                                                            <span className="flex items-center gap-1">
                                                                <Linkedin className="w-3 h-3" />
                                                                LinkedIn
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </DrawerSection>
                )}

                {/* Ajouter une action / note — always show when in view mode so user can leave a note */}
                {!isEditing && !isCreating && company && (
                    <DrawerSection title="Ajouter une action / note">
                        {missionIdLoading ? (
                            <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Chargement...
                            </div>
                        ) : campaignsLoading ? (
                            <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Chargement des campagnes...
                            </div>
                        ) : !effectiveMissionId ? (
                            <p className="text-sm text-slate-500 py-4">Impossible de charger la mission pour cette société.</p>
                        ) : campaigns.length === 0 ? (
                            <p className="text-sm text-slate-500 py-4">Aucune campagne disponible pour cette mission.</p>
                        ) : (
                            <div className="space-y-4">
                                <Select
                                    label="Résultat"
                                    placeholder="Sélectionner un résultat..."
                                    options={statusOptions}
                                    value={newActionResult}
                                    onChange={setNewActionResult}
                                />
                                {/* Envoie mail: ouvrir l'envoi par template */}
                                {newActionResult === "ENVOIE_MAIL" && (
                                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Mail className="w-5 h-5 text-indigo-600" />
                                            <span className="text-sm font-medium text-slate-900">Envoyer un email avec template</span>
                                        </div>
                                        <p className="text-xs text-slate-600 mb-3">
                                            Choisissez un template et envoyez l&apos;email à un contact de la société.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            onClick={() => setShowQuickEmailModal(true)}
                                            className="gap-2"
                                        >
                                            <Mail className="w-4 h-4" />
                                            Envoyer avec template
                                        </Button>
                                    </div>
                                )}
                                {/* Rappel demandé: date de rappel */}
                                {isCallbackResult(newActionResult) && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock className="w-5 h-5 text-amber-600" />
                                            <label className="text-sm font-medium text-slate-900">Date de rappel</label>
                                        </div>
                                        <input
                                            type="datetime-local"
                                            value={newCallbackDateValue}
                                            onChange={(e) => setNewCallbackDateValue(e.target.value)}
                                            min={new Date().toISOString().slice(0, 16)}
                                            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-300"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">
                                            Optionnel. Vous pouvez aussi indiquer la date dans la note.
                                        </p>
                                    </div>
                                )}
                                {newActionResult !== "ENVOIE_MAIL" && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                                            <textarea
                                                value={newActionNote}
                                                onChange={(e) => setNewActionNote(e.target.value)}
                                                placeholder="Ajouter une note (requise pour Intéressé / Rappel demandé)..."
                                                rows={3}
                                                maxLength={500}
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                            />
                                            <p className="text-xs text-slate-400 mt-1 text-right">{newActionNote.length}/500</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            onClick={handleAddAction}
                                            disabled={
                                                newActionSaving ||
                                                !newActionResult ||
                                                (newActionResult && getRequiresNote(newActionResult) && !newActionNote.trim())
                                            }
                                            isLoading={newActionSaving}
                                        >
                                            Enregistrer l&apos;action
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </DrawerSection>
                )}

                {/* Quick Email Modal (ENVOIE_MAIL) */}
                {!isCreating && company && (() => {
                    const firstContactWithEmail = company.contacts?.find((c) => c.email);
                    return (
                        <QuickEmailModal
                            isOpen={showQuickEmailModal}
                            onClose={() => setShowQuickEmailModal(false)}
                            onSent={handleEmailSent}
                            company={{ id: company.id, name: company.name, phone: undefined }}
                            contact={firstContactWithEmail ? {
                                id: firstContactWithEmail.id,
                                firstName: firstContactWithEmail.firstName,
                                lastName: firstContactWithEmail.lastName,
                                email: firstContactWithEmail.email,
                                title: firstContactWithEmail.title,
                                company: { id: company.id, name: company.name },
                            } : undefined}
                            missionId={effectiveMissionId ?? undefined}
                            missionName={missionName || undefined}
                        />
                    );
                })()}

                {/* Historique des actions (result + note) */}
                {!isEditing && !isCreating && company && (
                    <DrawerSection title="Historique des actions">
                        {actionsLoading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                            </div>
                        ) : actions.length === 0 ? (
                            <p className="text-sm text-slate-500 py-4">Aucune action enregistrée</p>
                        ) : (
                            <div className="space-y-3 max-h-[280px] overflow-y-auto">
                                {actions.map((a) => (
                                    <div
                                        key={a.id}
                                        className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-sm"
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-medium text-slate-700">
                                                {statusLabels[a.result] ?? a.result}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {new Date(a.createdAt).toLocaleDateString("fr-FR", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {a.campaign?.name && (
                                <p className="text-xs text-slate-500">{a.campaign.name}</p>
                            )}
                            {a.sdr?.name && (
                                <span className="text-xs text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">
                                    {a.sdr.name}
                                </span>
                            )}
                        </div>
                        {a.note && (
                            <p className="text-slate-600 mt-1 whitespace-pre-wrap">{a.note}</p>
                        )}
                    </div>
                ))}
            </div>
        )}
    </DrawerSection>
)}

                {/* Add contact sub-drawer (when viewing a company, SDR can add a contact) */}
                {company && (
                    <ContactDrawer
                        isOpen={showAddContact}
                        onClose={() => setShowAddContact(false)}
                        contact={null}
                        isCreating={true}
                        companies={[{ id: company.id, name: company.name }]}
                        listId={listId}
                        isManager={isManager}
                        onCreate={(newContact) => {
                            onUpdate?.();
                            onContactCreated?.({ ...newContact, companyName: company.name });
                            setShowAddContact(false);
                        }}
                    />
                )}
            </div>
        </Drawer>
    );
}

export default CompanyDrawer;
