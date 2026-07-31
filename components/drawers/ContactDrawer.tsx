"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Drawer, DrawerSection, DrawerField, Button, Input, Select, useToast } from "@/components/ui";
import { ACTION_RESULT_LABELS, type ActionResult } from "@/lib/types";
import {
    User,
    Mail,
    Phone,
    Linkedin,
    Briefcase,
    Building2,
    Edit,
    Save,
    X,
    Copy,
    ExternalLink,
    AlertCircle,
    Clock,
    CheckCircle,
    Send,
    PhoneCall,
    Loader2,
    Calendar,
    Plus,
    Trash2,
    Video,
    MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingDrawer } from "@/components/sdr/BookingDrawer";
import { QuickEmailModal } from "@/components/email/QuickEmailModal";
import { GooglePhoneSuggestion } from "@/components/enrichment/GooglePhoneSuggestion";
import { hasUsablePhone } from "@/lib/phone-utils";

// ============================================
// TYPES
// ============================================

interface Contact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    additionalPhones?: string[] | null;
    additionalEmails?: string[] | null;
    title: string | null;
    linkedin: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    companyId: string;
    companyName?: string;
    companyPhone?: string | null;
    missionId?: string;
}

interface ContactDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    contact: Contact | null;
    onUpdate?: (contact: Contact) => void;
    onCreate?: (contact: Contact & { companyName: string }) => void;
    isManager?: boolean;
    listId?: string;
    companies?: Array<{ id: string; name: string }>;
    isCreating?: boolean;
    enableGooglePhoneLookup?: boolean;
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
// CONTACT DRAWER COMPONENT
// ============================================

export function ContactDrawer({
    isOpen,
    onClose,
    contact,
    onUpdate,
    onCreate,
    isManager = false,
    listId,
    companies = [],
    isCreating = false,
    enableGooglePhoneLookup = false,
}: ContactDrawerProps) {
    const { success, error: showError } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        additionalPhones: [] as string[],
        additionalEmails: [] as string[],
        title: "",
        linkedin: "",
    });

    const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
    const [actions, setActions] = useState<Array<{
        id: string;
        result: string;
        note: string | null;
        createdAt: string;
        callbackDate?: string | null;
        campaign?: { name: string };
        sdr?: { id: string; name: string };
    }>>([]);
    const [actionsLoading, setActionsLoading] = useState(false);
    const lastContactIdRef = useRef<string | null>(null);
    const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; mission?: { channel: string } }>>([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [resolvedMissionId, setResolvedMissionId] = useState<string | null>(null);
    const [missionIdLoading, setMissionIdLoading] = useState(false);
    const [newActionResult, setNewActionResult] = useState<string>("");
    const [newActionNote, setNewActionNote] = useState("");
    const [newActionSaving, setNewActionSaving] = useState(false);
    const [clientBookingUrl, setClientBookingUrl] = useState<string>("");
    const [clientInterlocuteurs, setClientInterlocuteurs] = useState<Array<{
        id: string; firstName: string; lastName: string; title?: string;
        emails: Array<{ value: string; label: string; isPrimary: boolean }>;
        phones: Array<{ value: string; label: string; isPrimary: boolean }>;
        bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
        isActive: boolean;
    }>>([]);
    const [showBookingDrawer, setShowBookingDrawer] = useState(false);
    const [rdvDate, setRdvDate] = useState("");
    const [meetingType, setMeetingType] = useState<"VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | "">("");
    const [meetingJoinUrl, setMeetingJoinUrl] = useState("");
    const [meetingAddress, setMeetingAddress] = useState("");
    const [meetingPhone, setMeetingPhone] = useState("");
    const [newCallbackDateValue, setNewCallbackDateValue] = useState("");
    const [showQuickEmailModal, setShowQuickEmailModal] = useState(false);
    const [missionName, setMissionName] = useState<string>("");
    const [statusConfig, setStatusConfig] = useState<{ statuses: Array<{ code: string; label: string; requiresNote: boolean; triggersCallback?: boolean }> } | null>(null);

    // Manager controls for booking / callback dates
    const [managerMeetingResult, setManagerMeetingResult] = useState<'MEETING_BOOKED' | 'MEETING_CANCELLED'>('MEETING_BOOKED');
    const [managerMeetingDate, setManagerMeetingDate] = useState('');
    const [managerCallbackDate, setManagerCallbackDate] = useState('');
    const [managerSaving, setManagerSaving] = useState(false);

    const effectiveMissionId = contact?.missionId ?? resolvedMissionId ?? undefined;

    // Resolve missionId when contact has no missionId (e.g. opened from list)
    useEffect(() => {
        if (!contact?.id || isCreating || contact.missionId) {
            setResolvedMissionId(null);
            return;
        }
        setMissionIdLoading(true);
        fetch(`/api/contacts/${contact.id}/mission`)
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
    }, [contact?.id, contact?.missionId, isCreating]);

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

    // Fetch client booking URL, interlocuteurs, and mission name (for MEETING_BOOKED and QuickEmailModal)
    useEffect(() => {
        if (!effectiveMissionId || isCreating) {
            setClientBookingUrl("");
            setClientInterlocuteurs([]);
            setMissionName("");
            return;
        }
        fetch(`/api/missions/${effectiveMissionId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data) {
                    setClientBookingUrl(json.data.client?.bookingUrl ?? "");
                    setClientInterlocuteurs(
                        Array.isArray(json.data.client?.interlocuteurs) ? json.data.client.interlocuteurs : []
                    );
                    setMissionName(json.data.name ?? "");
                } else {
                    setClientBookingUrl("");
                    setClientInterlocuteurs([]);
                    setMissionName("");
                }
            })
            .catch(() => {
                setClientBookingUrl("");
                setClientInterlocuteurs([]);
                setMissionName("");
            });
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

    // Fetch actions history when drawer opens with a contact
    useEffect(() => {
        if (!isOpen || isCreating || !contact?.id) {
            setActions([]);
            return;
        }
        setActionsLoading(true);
        fetch(`/api/actions?contactId=${contact.id}&limit=20`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setActions(
                        (json.data as Array<{
                            id: string;
                            result: string;
                            note: string | null;
                            createdAt: string;
                            callbackDate?: string | null;
                            campaign?: { name: string };
                            sdr?: { id: string; name: string };
                        }>).map((a) => ({
                            id: a.id,
                            result: a.result,
                            note: a.note ?? null,
                            createdAt: a.createdAt,
                            callbackDate: a.callbackDate ?? null,
                            campaign: a.campaign,
                            sdr: a.sdr,
                        }))
                    );
                } else {
                    setActions([]);
                }
            })
            .catch(() => setActions([]))
            .finally(() => setActionsLoading(false));
    }, [isOpen, isCreating, contact?.id]);

    // Reset form only when contact *id* changes (not on every parent re-render with new object ref)
    useEffect(() => {
        if (isCreating) {
            lastContactIdRef.current = null;
            setFormData({
                firstName: "",
                lastName: "",
                email: "",
                phone: "",
                additionalPhones: [],
                additionalEmails: [],
                title: "",
                linkedin: "",
            });
            setSelectedCompanyId(companies.length > 0 ? companies[0].id : "");
            setIsEditing(true);
        } else if (contact) {
            const isNewContact = lastContactIdRef.current !== contact.id;
            lastContactIdRef.current = contact.id;
            if (isNewContact) {
                const extraPhones = contact.additionalPhones && Array.isArray(contact.additionalPhones) ? contact.additionalPhones : [];
                const extraEmails = contact.additionalEmails && Array.isArray(contact.additionalEmails) ? contact.additionalEmails : [];
                setFormData({
                    firstName: contact.firstName || "",
                    lastName: contact.lastName || "",
                    email: contact.email || "",
                    phone: contact.phone || "",
                    additionalPhones: extraPhones,
                    additionalEmails: extraEmails,
                    title: contact.title || "",
                    linkedin: contact.linkedin || "",
                });
                setSelectedCompanyId(contact.companyId);
                setIsEditing(false);
            }
        } else {
            lastContactIdRef.current = null;
        }
    }, [contact?.id, isCreating, companies.length]);

    // ============================================
    // SAVE HANDLER
    // ============================================

    const handleSave = async () => {
        if (isCreating) {
            // Create new contact
            if (!selectedCompanyId) {
                showError("Erreur", "Veuillez sélectionner une société");
                return;
            }

            setIsSaving(true);
            try {
                const res = await fetch(`/api/contacts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        companyId: selectedCompanyId,
                        firstName: formData.firstName || undefined,
                        lastName: formData.lastName || undefined,
                        email: formData.email || undefined,
                        phone: formData.phone || undefined,
                        additionalPhones: formData.additionalPhones?.filter(Boolean).length ? formData.additionalPhones.filter(Boolean) : undefined,
                        additionalEmails: formData.additionalEmails?.filter(Boolean).length ? formData.additionalEmails.filter(Boolean) : undefined,
                        title: formData.title || undefined,
                        linkedin: formData.linkedin || undefined,
                    }),
                });

                const json = await res.json();

                if (json.success) {
                    const companyName = companies.find(c => c.id === selectedCompanyId)?.name || "";
                    const fullName = `${formData.firstName || ""} ${formData.lastName || ""}`.trim();
                    const displayName = fullName || "Contact créé";
                    success("Contact créé", displayName);
                    if (onCreate) {
                        onCreate({
                            ...json.data,
                            companyName,
                        });
                    }
                    onClose();
                } else {
                    showError("Erreur", json.error || "Impossible de créer le contact");
                }
            } catch (err) {
                showError("Erreur", "Impossible de créer le contact");
            } finally {
                setIsSaving(false);
            }
        } else {
            // Update existing contact
            if (!contact) return;

            setIsSaving(true);
            try {
                const payload = {
                    ...formData,
                    additionalPhones: formData.additionalPhones?.filter(Boolean) ?? [],
                    additionalEmails: formData.additionalEmails?.filter(Boolean) ?? [],
                };
                const res = await fetch(`/api/contacts/${contact.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const json = await res.json();

                if (json.success) {
                    success("Contact mis à jour", `${formData.firstName} ${formData.lastName} a été mis à jour`);
                    setIsEditing(false);
                    if (onUpdate) {
                        onUpdate({
                            ...contact,
                            ...formData,
                            additionalPhones: formData.additionalPhones,
                            additionalEmails: formData.additionalEmails,
                        });
                    }
                } else {
                    showError("Erreur", json.error || "Impossible de mettre à jour");
                }
            } catch (err) {
                showError("Erreur", "Impossible de mettre à jour le contact");
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
        if (!contact || !campaignId) return false;
        const selectedCampaign = campaigns[0];
        const channel = (selectedCampaign?.mission?.channel ?? "CALL") as "CALL" | "EMAIL" | "LINKEDIN";
        const res = await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contactId: contact.id,
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
        if (!contact || !campaignId) {
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

    if (!isCreating && !contact) return null;

    const contactStatusConfig = isCreating ? null : STATUS_CONFIG[contact!.status];
    const StatusIcon = contactStatusConfig?.icon;
    const fullName = isCreating ? "Nouveau contact" : `${contact!.firstName || ""} ${contact!.lastName || ""}`.trim() || "Sans nom";

    // Latest meeting / callback actions for manager controls
    const latestMeetingAction = actions.find(
        (a) => a.result === "MEETING_BOOKED" || a.result === "MEETING_CANCELLED"
    );
    const latestCallbackAction = actions.find((a) => isCallbackResult(a.result));

    const getDateTimeLocalValue = (iso?: string | null) => {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 16);
    };

    const defaultMeetingDateInput = latestMeetingAction
        ? getDateTimeLocalValue(latestMeetingAction.callbackDate || latestMeetingAction.createdAt)
        : "";
    const defaultCallbackDateInput = latestCallbackAction
        ? getDateTimeLocalValue(latestCallbackAction.callbackDate || latestCallbackAction.createdAt)
        : "";

    const effectiveMeetingInput = managerMeetingDate || defaultMeetingDateInput;
    const effectiveCallbackInput = managerCallbackDate || defaultCallbackDateInput;

    const handleManagerSave = async () => {
        if (!contact) return;
        const meetingAction = latestMeetingAction;
        const callbackAction = latestCallbackAction;
        if (!meetingAction && !callbackAction) {
            return;
        }

        setManagerSaving(true);
        try {
            if (meetingAction) {
                const payload: any = {};
                const inputValue = effectiveMeetingInput;
                if (inputValue) {
                    payload.callbackDate = new Date(inputValue).toISOString();
                }
                payload.result = managerMeetingResult || (meetingAction.result as 'MEETING_BOOKED' | 'MEETING_CANCELLED');

                const res = await fetch(`/api/actions/${meetingAction.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Impossible de mettre à jour le rendez-vous");
                }
            } else if (callbackAction) {
                const payload: any = {};
                const inputValue = effectiveCallbackInput;
                if (inputValue) {
                    payload.callbackDate = new Date(inputValue).toISOString();
                }
                const res = await fetch(`/api/actions/${callbackAction.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Impossible de mettre à jour le rappel");
                }
            }

            // Refresh actions after update
            if (contact.id) {
                setActionsLoading(true);
                fetch(`/api/actions?contactId=${contact.id}&limit=20`)
                    .then((res) => res.json())
                    .then((json) => {
                        if (json.success && Array.isArray(json.data)) {
                            setActions(
                                (json.data as Array<{
                                    id: string;
                                    result: string;
                                    note: string | null;
                                    createdAt: string;
                                    callbackDate?: string | null;
                                    campaign?: { name: string };
                                    sdr?: { id: string; name: string };
                                }>).map((a) => ({
                                    id: a.id,
                                    result: a.result,
                                    note: a.note ?? null,
                                    createdAt: a.createdAt,
                                    callbackDate: a.callbackDate ?? null,
                                    campaign: a.campaign,
                                    sdr: a.sdr,
                                }))
                            );
                        } else {
                            setActions([]);
                        }
                    })
                    .catch(() => setActions([]))
                    .finally(() => setActionsLoading(false));
            }

            success(
                "Mise à jour enregistrée",
                latestMeetingAction ? "Le statut et la date du rendez-vous ont été mis à jour" : "La date de rappel a été mise à jour"
            );
        } catch (err) {
            showError("Erreur", "Impossible de sauvegarder les modifications");
        } finally {
            setManagerSaving(false);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={isCreating ? "Nouveau contact" : (isEditing ? "Modifier le contact" : fullName)}
            description={isCreating ? "Ajoutez un nouveau contact à une société" : (isEditing ? "Modifiez les informations du contact" : contact!.companyName)}
            size="lg"
            footer={
                isManager && (
                    <div className="flex items-center justify-end gap-3">
                        {(isEditing || isCreating) ? (
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
                                    disabled={isSaving || (isCreating && !selectedCompanyId)}
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
                {/* Avatar & Status */}
                {!isEditing && !isCreating && StatusIcon && (
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center text-2xl font-bold text-emerald-600">
                            {(contact!.firstName?.[0] || contact!.lastName?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                            <div className={cn(
                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
                                contactStatusConfig!.bg,
                                contactStatusConfig!.borderColor,
                                "border"
                            )}>
                                <StatusIcon className={cn("w-4 h-4", contactStatusConfig!.color)} />
                                <span className={cn("text-sm font-medium", contactStatusConfig!.color)}>
                                    {contactStatusConfig!.label}
                                </span>
                            </div>
                            {contact!.title && (
                                <p className="text-sm text-slate-500 mt-1">{contact!.title}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                {!isEditing && !isCreating && contact && (
                    <>
                        {/* Primary Call Button - Contact or Company Phone */}
                        {(contact.phone || contact.companyPhone) && (
                            <a
                                href={`tel:${contact.phone || contact.companyPhone}`}
                                className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl font-semibold text-base shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02]"
                            >
                                <PhoneCall className="w-5 h-5" />
                                {contact.phone ? (
                                    <span>Appeler {contact.firstName || 'le contact'}</span>
                                ) : (
                                    <span>Appeler {contact.companyName || 'la société'}</span>
                                )}
                            </a>
                        )}

                        {/* Secondary Actions */}
                        {(contact.email || contact.linkedin) && (
                            <div className="flex items-center gap-2">
                                {contact.email && (
                                    <a
                                        href={`mailto:${contact.email}`}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-medium text-sm hover:bg-indigo-100 transition-colors"
                                    >
                                        <Send className="w-4 h-4" />
                                        Email
                                    </a>
                                )}
                                {contact.linkedin && (
                                    <a
                                        href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-600 rounded-xl font-medium text-sm hover:bg-blue-100 transition-colors"
                                    >
                                        <Linkedin className="w-4 h-4" />
                                        LinkedIn
                                    </a>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Contact Info */}
                <DrawerSection title="Informations">
                    {(isEditing || isCreating) ? (
                        <div className="space-y-4">
                            {isCreating && (
                                <Select
                                    label="Société *"
                                    placeholder="Sélectionner une société..."
                                    options={companies.map(c => ({ value: c.id, label: c.name }))}
                                    value={selectedCompanyId}
                                    onChange={setSelectedCompanyId}
                                />
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Prénom"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                    icon={<User className="w-4 h-4 text-slate-400" />}
                                />
                                <Input
                                    label="Nom"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                    icon={<User className="w-4 h-4 text-slate-400" />}
                                />
                            </div>
                            <Input
                                label="Poste"
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                icon={<Briefcase className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                icon={<Mail className="w-4 h-4 text-slate-400" />}
                            />
                            <Input
                                label="Téléphone"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                icon={<Phone className="w-4 h-4 text-slate-400" />}
                            />
                            {/* Additional phone numbers */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Autres numéros</label>
                                {formData.additionalPhones.map((num, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            value={num}
                                            onChange={(e) => {
                                                const next = [...formData.additionalPhones];
                                                next[idx] = e.target.value;
                                                setFormData(prev => ({ ...prev, additionalPhones: next }));
                                            }}
                                            icon={<Phone className="w-4 h-4 text-slate-400" />}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                additionalPhones: prev.additionalPhones.filter((_, i) => i !== idx),
                                            }))}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFormData(prev => ({ ...prev, additionalPhones: [...prev.additionalPhones, ""] }))}
                                    className="gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un numéro
                                </Button>
                            </div>
                            <Input
                                label="LinkedIn"
                                value={formData.linkedin}
                                onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                                icon={<Linkedin className="w-4 h-4 text-slate-400" />}
                            />
                            {/* Additional emails */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Autres emails</label>
                                {formData.additionalEmails.map((em, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            type="email"
                                            value={em}
                                            onChange={(e) => {
                                                const next = [...formData.additionalEmails];
                                                next[idx] = e.target.value;
                                                setFormData(prev => ({ ...prev, additionalEmails: next }));
                                            }}
                                            icon={<Mail className="w-4 h-4 text-slate-400" />}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                additionalEmails: prev.additionalEmails.filter((_, i) => i !== idx),
                                            }))}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFormData(prev => ({ ...prev, additionalEmails: [...prev.additionalEmails, ""] }))}
                                    className="gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un email
                                </Button>
                            </div>
                        </div>
                    ) : contact ? (
                        <div className="space-y-4">
                            <DrawerField
                                label="Société"
                                value={contact.companyName}
                                icon={<Building2 className="w-5 h-5 text-indigo-500" />}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <DrawerField
                                    label="Prénom"
                                    value={contact.firstName}
                                    icon={<User className="w-5 h-5 text-indigo-500" />}
                                />
                                <DrawerField
                                    label="Nom"
                                    value={contact.lastName}
                                    icon={<User className="w-5 h-5 text-indigo-500" />}
                                />
                            </div>
                            <DrawerField
                                label="Poste"
                                value={contact.title}
                                icon={<Briefcase className="w-5 h-5 text-indigo-500" />}
                            />
                            <DrawerField
                                label="Email"
                                value={
                                    contact.email && (
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={`mailto:${contact.email}`}
                                                className="text-indigo-600 hover:underline truncate max-w-[200px]"
                                            >
                                                {contact.email}
                                            </a>
                                            <button
                                                onClick={() => copyToClipboard(contact.email!, "Email")}
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )
                                }
                                icon={<Mail className="w-5 h-5 text-indigo-500" />}
                            />
                            <DrawerField
                                label="Téléphone"
                                value={
                                    (contact.phone || contact.companyPhone) && (
                                        <div className="space-y-2">
                                            {contact.phone && (
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={`tel:${contact.phone}`}
                                                        className="text-emerald-600 hover:underline font-medium"
                                                    >
                                                        {contact.phone}
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(contact.phone!, "Téléphone")}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                            {!contact.phone && contact.companyPhone && (
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={`tel:${contact.companyPhone}`}
                                                        className="text-slate-600 hover:underline"
                                                    >
                                                        {contact.companyPhone}
                                                    </a>
                                                    <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-100 rounded">
                                                        Société
                                                    </span>
                                                    <button
                                                        onClick={() => copyToClipboard(contact.companyPhone!, "Téléphone")}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                                icon={<Phone className="w-5 h-5 text-emerald-500" />}
                            />
                            {enableGooglePhoneLookup &&
                                !hasUsablePhone(contact.phone, contact.additionalPhones ?? []) &&
                                !hasUsablePhone(contact.companyPhone) && (
                                    <GooglePhoneSuggestion
                                        companyId={contact.companyId}
                                        companyName={contact.companyName || "cette société"}
                                        onApplied={(phone) =>
                                            onUpdate?.({
                                                ...contact,
                                                companyPhone: phone,
                                            })
                                        }
                                    />
                                )}
                            {(() => {
                                const extraPhones = contact.additionalPhones && Array.isArray(contact.additionalPhones) ? contact.additionalPhones.filter(Boolean) : [];
                                return extraPhones.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <Phone className="w-3.5 h-3.5 text-emerald-500" />
                                            Autres numéros
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {extraPhones.map((num, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm"
                                                >
                                                    <a href={`tel:${num}`} className="text-emerald-700 hover:underline font-medium">
                                                        {num}
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(num, "Numéro")}
                                                        className="p-1 text-emerald-500 hover:bg-emerald-100 rounded-lg transition-colors"
                                                        aria-label="Copier"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                            {(() => {
                                const extraEmails = contact.additionalEmails && Array.isArray(contact.additionalEmails) ? contact.additionalEmails.filter(Boolean) : [];
                                return extraEmails.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <Mail className="w-3.5 h-3.5 text-indigo-500" />
                                            Autres emails
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {extraEmails.map((em, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100 text-sm"
                                                >
                                                    <a href={`mailto:${em}`} className="text-indigo-700 hover:underline truncate max-w-[180px]">
                                                        {em}
                                                    </a>
                                                    <button
                                                        onClick={() => copyToClipboard(em, "Email")}
                                                        className="p-1 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-colors shrink-0"
                                                        aria-label="Copier"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                            <DrawerField
                                label="LinkedIn"
                                value={
                                    contact.linkedin && (
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 hover:underline truncate max-w-[200px]"
                                            >
                                                {contact.linkedin}
                                            </a>
                                            <button
                                                onClick={() => copyToClipboard(contact.linkedin!, "LinkedIn")}
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                            <a
                                                href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    )
                                }
                                icon={<Linkedin className="w-5 h-5 text-indigo-500" />}
                            />
                        </div>
                    ) : null}
                </DrawerSection>

                {/* Ajouter une action / note — always show when in view mode so user can leave a note */}
                {!isEditing && !isCreating && contact && (
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
                            <p className="text-sm text-slate-500 py-4">Impossible de charger la mission pour ce contact.</p>
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
                                {/* Meeting booké: show client booking drawer */}
                                {newActionResult === "MEETING_BOOKED" && (clientBookingUrl || clientInterlocuteurs.some(i => (i.bookingLinks?.length ?? 0) > 0)) && contact && (
                                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-5 h-5 text-indigo-600" />
                                            <span className="text-sm font-medium text-slate-900">Calendrier client</span>
                                        </div>
                                        <div>
                                            <label
                                                htmlFor="contact-rdv-date"
                                                className="block text-xs font-semibold text-slate-700 mb-1.5"
                                            >
                                                Date et heure du RDV <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="contact-rdv-date"
                                                type="datetime-local"
                                                value={rdvDate}
                                                onChange={(e) => setRdvDate(e.target.value)}
                                                min={new Date().toISOString().slice(0, 16)}
                                                className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Type de RDV <span className="text-red-500">*</span></label>
                                            <div className="flex flex-wrap gap-2">
                                                {(["VISIO", "PHYSIQUE", "TELEPHONIQUE"] as const).map((type) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setMeetingType(type)}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                                                            meetingType === type ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50"
                                                        )}
                                                    >
                                                        {type === "VISIO" && <Video className="w-4 h-4" />}
                                                        {type === "PHYSIQUE" && <MapPin className="w-4 h-4" />}
                                                        {type === "TELEPHONIQUE" && <Phone className="w-4 h-4" />}
                                                        {type === "VISIO" && "Visio"}
                                                        {type === "PHYSIQUE" && "Physique"}
                                                        {type === "TELEPHONIQUE" && "Téléphonique"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {meetingType === "VISIO" && (
                                            <div>
                                                <label htmlFor="contact-meeting-join-url" className="block text-xs font-medium text-slate-700 mb-1">
                                                    Lien de rejoindre <span className="text-slate-400 font-normal">(optionnel)</span>
                                                </label>
                                                <input
                                                    id="contact-meeting-join-url"
                                                    type="url"
                                                    value={meetingJoinUrl}
                                                    onChange={(e) => setMeetingJoinUrl(e.target.value)}
                                                    placeholder="Récupéré automatiquement depuis le calendrier si disponible"
                                                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                                                />
                                                <p className="text-xs text-slate-500 mt-1.5">
                                                    Le lien visio sera auto-renseigné si le calendrier le renvoie après réservation.
                                                </p>
                                            </div>
                                        )}
                                        {meetingType === "PHYSIQUE" && (
                                            <div>
                                                <label htmlFor="contact-meeting-address" className="block text-xs font-medium text-slate-700 mb-1">Adresse <span className="text-red-500">*</span></label>
                                                <input
                                                    id="contact-meeting-address"
                                                    type="text"
                                                    value={meetingAddress}
                                                    onChange={(e) => setMeetingAddress(e.target.value)}
                                                    placeholder="Adresse du rendez-vous"
                                                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                                                />
                                            </div>
                                        )}
                                        {meetingType === "TELEPHONIQUE" && (
                                            <div>
                                                <label htmlFor="contact-meeting-phone" className="block text-xs font-medium text-slate-700 mb-1">Numéro à appeler</label>
                                                <input
                                                    id="contact-meeting-phone"
                                                    type="tel"
                                                    value={meetingPhone || (contact?.phone ?? "")}
                                                    onChange={(e) => setMeetingPhone(e.target.value)}
                                                    placeholder={contact?.phone ?? "Numéro du contact"}
                                                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                                                />
                                            </div>
                                        )}
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => setShowBookingDrawer(true)}
                                            disabled={
                                                !rdvDate ||
                                                !meetingType ||
                                                (meetingType === "PHYSIQUE" && !meetingAddress.trim())
                                            }
                                            className="gap-2"
                                        >
                                            <Calendar className="w-4 h-4" />
                                            Ouvrir le calendrier client
                                        </Button>
                                    </div>
                                )}
                                {/* Envoie mail: ouvrir l'envoi par template */}
                                {newActionResult === "ENVOIE_MAIL" && (
                                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Send className="w-5 h-5 text-indigo-600" />
                                            <span className="text-sm font-medium text-slate-900">Envoyer un email avec template</span>
                                        </div>
                                        <p className="text-xs text-slate-600 mb-3">
                                            Choisissez un template et envoyez l&apos;email directement depuis cette fiche.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            onClick={() => setShowQuickEmailModal(true)}
                                            className="gap-2"
                                        >
                                            <Send className="w-4 h-4" />
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
                                            disabled={Boolean(
                                                newActionSaving ||
                                                !newActionResult ||
                                                (newActionResult && getRequiresNote(newActionResult) && !newActionNote.trim())
                                            )}
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

                {/* Manager-only: manage booking status & date directly */}
                {isManager && !isEditing && !isCreating && contact && (latestMeetingAction || latestCallbackAction) && (
                    <DrawerSection title="Gestion RDV / rappel (Manager)">
                        {latestMeetingAction ? (
                            <div className="space-y-3">
                                <p className="text-xs text-slate-500">
                                    Ajustez manuellement le statut et la date du rendez-vous pour ce contact.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">
                                            Statut du rendez-vous
                                        </label>
                                        <select
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                                            value={managerMeetingResult}
                                            onChange={(e) =>
                                                setManagerMeetingResult(
                                                    e.target.value === "MEETING_CANCELLED"
                                                        ? "MEETING_CANCELLED"
                                                        : "MEETING_BOOKED"
                                                )
                                            }
                                        >
                                            <option value="MEETING_BOOKED">RDV confirmé</option>
                                            <option value="MEETING_CANCELLED">RDV annulé</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">
                                            Date / heure du rendez-vous
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                                            value={effectiveMeetingInput}
                                            onChange={(e) => setManagerMeetingDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleManagerSave}
                                        isLoading={managerSaving}
                                        disabled={managerSaving || !effectiveMeetingInput}
                                    >
                                        Enregistrer les changements
                                    </Button>
                                </div>
                            </div>
                        ) : latestCallbackAction ? (
                            <div className="space-y-3">
                                <p className="text-xs text-slate-500">
                                    Ajustez la date du rappel pour ce contact.
                                </p>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Date / heure du rappel
                                    </label>
                                    <input
                                        type="datetime-local"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg max-w-xs"
                                        value={effectiveCallbackInput}
                                        onChange={(e) => setManagerCallbackDate(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleManagerSave}
                                        isLoading={managerSaving}
                                        disabled={managerSaving || !effectiveCallbackInput}
                                    >
                                        Enregistrer la nouvelle date
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </DrawerSection>
                )}

                {/* Quick Email Modal (ENVOIE_MAIL) */}
                {!isCreating && contact && (
                    <QuickEmailModal
                        isOpen={showQuickEmailModal}
                        onClose={() => setShowQuickEmailModal(false)}
                        onSent={handleEmailSent}
                        contact={{
                            id: contact.id,
                            firstName: contact.firstName,
                            lastName: contact.lastName,
                            email: contact.email,
                            title: contact.title,
                            company: contact.companyId && contact.companyName ? { id: contact.companyId, name: contact.companyName } : undefined,
                        }}
                        missionId={effectiveMissionId ?? undefined}
                        missionName={missionName || undefined}
                    />
                )}

                {/* Booking drawer (MEETING_BOOKED) */}
                {!isCreating && contact && (clientBookingUrl || clientInterlocuteurs.some(i => (i.bookingLinks?.length ?? 0) > 0)) && (
                    <BookingDrawer
                        isOpen={showBookingDrawer}
                        onClose={() => setShowBookingDrawer(false)}
                        bookingUrl={clientBookingUrl || ""}
                        contactId={contact.id}
                        contactName={`${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Contact"}
                        contactInfo={{
                            firstName: contact.firstName,
                            lastName: contact.lastName,
                            email: contact.email,
                            phone: contact.phone,
                            title: contact.title,
                            companyName: contact.companyName ?? undefined,
                        }}
                        rdvDate={rdvDate ? new Date(rdvDate).toISOString() : undefined}
                        meetingType={meetingType || undefined}
                        meetingAddress={meetingType === "PHYSIQUE" ? meetingAddress : undefined}
                        meetingJoinUrl={meetingType === "VISIO" ? meetingJoinUrl : undefined}
                        meetingPhone={meetingType === "TELEPHONIQUE" ? (meetingPhone || contact.phone || undefined) : undefined}
                        interlocuteurs={clientInterlocuteurs}
                        onBookingSuccess={() => {
                            setShowBookingDrawer(false);
                            setRdvDate("");
                            setMeetingType("");
                            setMeetingJoinUrl("");
                            setMeetingAddress("");
                            setMeetingPhone("");
                            fetch(`/api/actions?contactId=${contact.id}&limit=20`)
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
                                    }
                                });
                        }}
                    />
                )}

                {/* Historique des actions (result + note) */}
                {!isEditing && !isCreating && contact && (
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
            </div>
        </Drawer>
    );
}

export default ContactDrawer;
