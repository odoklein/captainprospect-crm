"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Ban,
    Building2,
    Globe,
    Plus,
    RotateCcw,
    Search,
    ShieldCheck,
    User,
    Users,
} from "lucide-react";
import {
    Badge,
    Button,
    Card,
    EmptyState,
    Input,
    LoadingState,
    Modal,
    ModalFooter,
    PageHeader,
    StatCard,
    useToast,
} from "@/components/ui";
import {
    EXCLUSION_DURATIONS,
    EXCLUSION_REASON_PRESETS,
    EXCLUSION_SCOPE_LABELS,
    EXCLUSION_SOURCE_LABELS,
    EXCLUSION_TARGET_LABELS,
} from "@/lib/exclusions/constants";
import { cn } from "@/lib/utils";

interface ExclusionRow {
    id: string;
    target: "COMPANY" | "CONTACT";
    scope: "GLOBAL" | "CLIENT" | "MISSION";
    scopeId: string | null;
    scopeName: string | null;
    label: string;
    reason: string;
    source: keyof typeof EXCLUSION_SOURCE_LABELS;
    createdAt: string;
    createdByName: string | null;
    expiresAt: string | null;
    liftedAt: string | null;
    liftedByName: string | null;
    liftReason: string | null;
    appliedCompanies: number;
    appliedContacts: number;
}

type StateFilter = "active" | "lifted" | "all";

const STATE_TABS: Array<{ value: StateFilter; label: string }> = [
    { value: "active", label: "Actives" },
    { value: "lifted", label: "Levées" },
    { value: "all", label: "Tout" },
];

export default function ManagerExclusionsPage() {
    const toast = useToast();
    const [rows, setRows] = useState<ExclusionRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<StateFilter>("active");
    const [search, setSearch] = useState("");
    const [isCreateOpen, setCreateOpen] = useState(false);
    const [liftTarget, setLiftTarget] = useState<ExclusionRow | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ state });
            if (search.trim()) params.set("search", search.trim());
            const res = await fetch(`/api/exclusions?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Chargement impossible");
            setRows(json.data);
        } catch (err) {
            toast.error("Chargement impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setIsLoading(false);
        }
    }, [state, search, toast]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    const stats = useMemo(() => {
        const active = rows.filter((r) => !r.liftedAt);
        return {
            rules: active.length,
            companies: active.reduce((sum, r) => sum + r.appliedCompanies, 0),
            contacts: active.reduce((sum, r) => sum + r.appliedContacts, 0),
            fromClients: active.filter((r) => r.source === "CLIENT_PORTAL").length,
        };
    }, [rows]);

    return (
        <div className="p-6 space-y-6">
            <PageHeader
                title="Ne plus contacter"
                subtitle="Les sociétés et contacts retirés de la prospection, et pourquoi"
                icon={<Ban className="w-6 h-6" />}
                onRefresh={load}
                isRefreshing={isLoading}
                actions={
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Exclure une société
                    </Button>
                }
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Règles actives" value={stats.rules} icon={ShieldCheck} />
                <StatCard label="Sociétés retirées" value={stats.companies} icon={Building2} />
                <StatCard label="Contacts retirés" value={stats.contacts} icon={Users} />
                <StatCard label="Demandes client" value={stats.fromClients} icon={User} />
            </div>

            <Card className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                        {STATE_TABS.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => setState(tab.value)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                                    state === tab.value
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Société, contact ou motif…"
                            className="pl-9"
                        />
                    </div>
                </div>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="Aucune exclusion"
                    description="Personne n'a été retiré de la prospection sur ce périmètre."
                />
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <ExclusionCard key={row.id} row={row} onLift={() => setLiftTarget(row)} />
                    ))}
                </div>
            )}

            <CreateExclusionModal
                isOpen={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                    setCreateOpen(false);
                    load();
                }}
            />

            <LiftExclusionModal
                row={liftTarget}
                onClose={() => setLiftTarget(null)}
                onLifted={() => {
                    setLiftTarget(null);
                    load();
                }}
            />
        </div>
    );
}

// ============================================
// ROW
// ============================================

function ExclusionCard({ row, onLift }: { row: ExclusionRow; onLift: () => void }) {
    const isLifted = !!row.liftedAt;
    const isExpired = !isLifted && !!row.expiresAt && new Date(row.expiresAt) <= new Date();
    const isActive = !isLifted && !isExpired;

    return (
        <Card
            className={cn(
                "p-4 border-l-4",
                isActive ? "border-l-red-400" : "border-l-slate-300 bg-slate-50/60"
            )}
        >
            <div className="flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.target === "COMPANY" ? (
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                            <User className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-900 break-words">{row.label}</span>
                        <Badge variant={isActive ? "danger" : "default"}>
                            {isLifted ? "Levée" : isExpired ? "Expirée" : EXCLUSION_TARGET_LABELS[row.target]}
                        </Badge>
                        <Badge variant="outline">
                            {row.scope === "GLOBAL" && <Globe className="w-3 h-3" />}
                            {EXCLUSION_SCOPE_LABELS[row.scope]}
                            {row.scopeName ? ` · ${row.scopeName}` : ""}
                        </Badge>
                        <Badge variant="outline">{EXCLUSION_SOURCE_LABELS[row.source]}</Badge>
                    </div>

                    <p className="mt-2 text-sm text-slate-700 break-words">{row.reason}</p>

                    <p className="mt-1.5 text-xs text-slate-500">
                        {row.createdByName ? `${row.createdByName} · ` : ""}
                        {format(new Date(row.createdAt), "d MMM yyyy", { locale: fr })}
                        {row.expiresAt && !isLifted
                            ? ` · jusqu'au ${format(new Date(row.expiresAt), "d MMM yyyy", { locale: fr })}`
                            : ""}
                        {isActive
                            ? ` · ${row.appliedCompanies} société(s), ${row.appliedContacts} contact(s) retirés`
                            : ""}
                    </p>

                    {isLifted && (
                        <p className="mt-2 rounded-lg bg-white border border-slate-200 p-2 text-xs text-slate-600">
                            Levée par {row.liftedByName ?? "—"} le{" "}
                            {format(new Date(row.liftedAt!), "d MMM yyyy", { locale: fr })}
                            {row.liftReason ? ` — ${row.liftReason}` : ""}
                        </p>
                    )}
                </div>

                {isActive && (
                    <Button variant="outline" size="sm" onClick={onLift} className="shrink-0">
                        <RotateCcw className="w-4 h-4" />
                        Lever
                    </Button>
                )}
            </div>
        </Card>
    );
}

// ============================================
// CREATE (manual, no prospect row needed)
// ============================================

function CreateExclusionModal({
    isOpen,
    onClose,
    onCreated,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}) {
    const toast = useToast();
    const [companyName, setCompanyName] = useState("");
    const [website, setWebsite] = useState("");
    const [phone, setPhone] = useState("");
    const [reason, setReason] = useState("");
    const [duration, setDuration] = useState("permanent");
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
    const [scopeId, setScopeId] = useState("");
    const [isSaving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setCompanyName("");
        setWebsite("");
        setPhone("");
        setReason("");
        setDuration("permanent");
        setScopeId("");

        fetch("/api/clients?limit=200")
            .then((r) => r.json())
            .then((json) => {
                if (json.success) setClients(json.data ?? []);
            })
            .catch(() => setClients([]));
    }, [isOpen]);

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/exclusions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // No scopeId means every client — the legal-grade level.
                    scope: scopeId ? "CLIENT" : "GLOBAL",
                    scopeId: scopeId || undefined,
                    companyName,
                    website: website || undefined,
                    phone: phone || undefined,
                    reason,
                    duration,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Création impossible");

            toast.success(
                "Exclusion créée",
                `${json.data.appliedCompanies} société(s) et ${json.data.appliedContacts} contact(s) retirés`
            );
            onCreated();
        } catch (err) {
            toast.error("Création impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Exclure une société"
            description="Fonctionne même si la société n'est pas encore dans la base : la règle s'appliquera au prochain import."
            size="lg"
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                        Nom de la société <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="BRAND TO DESIGN"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                        La forme juridique et la casse sont ignorées : « Brand To Design SAS » correspondra aussi.
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-semibold text-slate-800 mb-1.5">Site web</label>
                        <Input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="brandtodesign.fr"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-800 mb-1.5">Standard</label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 23 45 67 89" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Périmètre</label>
                    <select
                        value={scopeId}
                        onChange={(e) => setScopeId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-300"
                    >
                        <option value="">Toutes les missions (tous clients)</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                        Motif <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {EXCLUSION_REASON_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setReason(preset)}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-300"
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Durée</label>
                    <div className="flex flex-wrap gap-2">
                        {EXCLUSION_DURATIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setDuration(option.value)}
                                className={cn(
                                    "rounded-lg border px-3 py-1.5 text-sm",
                                    duration === option.value
                                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                                        : "border-slate-200 text-slate-600"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                    Annuler
                </Button>
                <Button
                    variant="danger"
                    onClick={submit}
                    isLoading={isSaving}
                    disabled={companyName.trim().length < 2 || reason.trim().length < 3 || isSaving}
                >
                    <Ban className="w-4 h-4" />
                    Créer l&apos;exclusion
                </Button>
            </ModalFooter>
        </Modal>
    );
}

// ============================================
// LIFT
// ============================================

function LiftExclusionModal({
    row,
    onClose,
    onLifted,
}: {
    row: ExclusionRow | null;
    onClose: () => void;
    onLifted: () => void;
}) {
    const toast = useToast();
    const [liftReason, setLiftReason] = useState("");
    const [isSaving, setSaving] = useState(false);

    useEffect(() => {
        if (row) setLiftReason("");
    }, [row]);

    const submit = async () => {
        if (!row) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/exclusions/${row.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ liftReason }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Levée impossible");

            toast.success(
                "Exclusion levée",
                `${json.data.releasedCompanies} société(s) et ${json.data.releasedContacts} contact(s) de nouveau contactables`
            );
            onLifted();
        } catch (err) {
            toast.error("Levée impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={!!row}
            onClose={onClose}
            title="Lever l'exclusion"
            description={
                row
                    ? `${row.label} redeviendra contactable, sur tous les canaux.`
                    : undefined
            }
            size="md"
        >
            <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Motif de la levée <span className="text-red-500">*</span>
                </label>
                <textarea
                    value={liftReason}
                    onChange={(e) => setLiftReason(e.target.value)}
                    rows={3}
                    placeholder="Ex : accord écrit du client du 12/09"
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-300"
                />
                <p className="mt-2 text-xs text-slate-500">
                    La règle est conservée dans le journal : elle apparaîtra comme « levée », jamais supprimée.
                </p>
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                    Annuler
                </Button>
                <Button onClick={submit} isLoading={isSaving} disabled={liftReason.trim().length < 3 || isSaving}>
                    <RotateCcw className="w-4 h-4" />
                    Lever
                </Button>
            </ModalFooter>
        </Modal>
    );
}
