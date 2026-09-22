"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Ban,
    Building2,
    Plus,
    RotateCcw,
    Search,
    ShieldCheck,
    User,
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
    useToast,
} from "@/components/ui";
import { ExcludeDialog, type ExcludePayload } from "@/components/exclusions/ExcludeDialog";
import { cn } from "@/lib/utils";

interface ClientExclusion {
    id: string;
    target: "COMPANY" | "CONTACT";
    label: string;
    reason: string;
    source: string;
    createdAt: string;
    expiresAt: string | null;
    liftedAt: string | null;
    appliedCompanies: number;
    appliedContacts: number;
    active: boolean;
}

interface PickerCompany {
    id: string;
    name: string;
    excludedAt: string | null;
    contacts: Array<{ id: string; firstName: string | null; lastName: string | null; excludedAt: string | null }>;
}

/**
 * The client's own "ne plus contacter" list.
 *
 * Self-service on purpose: when a client's prospect asks not to be called
 * again, the fix has to land before the next dialling session, not after a
 * support ticket has made its way through a manager.
 */
export default function ClientExclusionsPage() {
    const toast = useToast();
    const [rows, setRows] = useState<ClientExclusion[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [isPickerOpen, setPickerOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/client/exclusions");
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Chargement impossible");
            setRows(json.data);
        } catch (err) {
            toast.error("Chargement impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    const active = useMemo(() => rows.filter((r) => r.active), [rows]);
    const past = useMemo(() => rows.filter((r) => !r.active), [rows]);

    return (
        <div className="p-6 space-y-6">
            <PageHeader
                title="Ne plus contacter"
                subtitle="Les sociétés et personnes que nos équipes ne solliciteront plus pour vous"
                icon={<ShieldCheck className="w-6 h-6" />}
                onRefresh={load}
                isRefreshing={isLoading}
                actions={
                    <Button onClick={() => setPickerOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Ajouter
                    </Button>
                }
            />

            <Card className="p-4 bg-indigo-50/60 border-indigo-200">
                <p className="text-sm text-indigo-900">
                    Une exclusion prend effet <strong>immédiatement</strong> : la fiche sort des files d&apos;appel de
                    nos SDR et les séquences email en cours sont arrêtées. Elle reste active même si la liste est
                    réimportée plus tard.
                </p>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="Aucune exclusion"
                    description="Ajoutez une société ou une personne que nos équipes ne doivent plus contacter."
                    action={
                        <Button onClick={() => setPickerOpen(true)}>
                            <Plus className="w-4 h-4" />
                            Ajouter
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-6">
                    {active.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                                Actives ({active.length})
                            </h2>
                            {active.map((row) => (
                                <ExclusionRow key={row.id} row={row} onChanged={load} />
                            ))}
                        </section>
                    )}

                    {past.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                                Historique ({past.length})
                            </h2>
                            {past.map((row) => (
                                <ExclusionRow key={row.id} row={row} onChanged={load} />
                            ))}
                        </section>
                    )}
                </div>
            )}

            <CompanyPicker
                isOpen={isPickerOpen}
                onClose={() => setPickerOpen(false)}
                onDone={() => {
                    setPickerOpen(false);
                    load();
                }}
            />
        </div>
    );
}

function ExclusionRow({ row, onChanged }: { row: ClientExclusion; onChanged: () => void }) {
    const toast = useToast();
    const [isLifting, setLifting] = useState(false);

    const lift = async () => {
        setLifting(true);
        try {
            const res = await fetch(`/api/exclusions/${row.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ liftReason: "Réactivation demandée depuis le portail client" }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Levée impossible");
            toast.success("Exclusion levée", `${row.label} est de nouveau contactable.`);
            onChanged();
        } catch (err) {
            toast.error("Levée impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setLifting(false);
        }
    };

    return (
        <Card className={cn("p-4 border-l-4", row.active ? "border-l-red-400" : "border-l-slate-300 bg-slate-50/60")}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.target === "COMPANY" ? (
                            <Building2 className="w-4 h-4 text-slate-400" />
                        ) : (
                            <User className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="font-semibold text-slate-900 break-words">{row.label}</span>
                        {row.active ? (
                            <Badge variant="danger">Active</Badge>
                        ) : (
                            <Badge variant="default">Levée</Badge>
                        )}
                        {row.target === "COMPANY" && <Badge variant="outline">Toute la société</Badge>}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700 break-words">{row.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                        Depuis le {format(new Date(row.createdAt), "d MMMM yyyy", { locale: fr })}
                        {row.expiresAt
                            ? ` · jusqu'au ${format(new Date(row.expiresAt), "d MMMM yyyy", { locale: fr })}`
                            : " · définitive"}
                        {row.active && (row.appliedCompanies > 0 || row.appliedContacts > 0)
                            ? ` · ${row.appliedContacts} personne(s) retirée(s)`
                            : ""}
                    </p>
                </div>

                {row.active && (
                    <Button variant="outline" size="sm" onClick={lift} isLoading={isLifting} className="shrink-0">
                        <RotateCcw className="w-4 h-4" />
                        Réactiver
                    </Button>
                )}
            </div>
        </Card>
    );
}

// ============================================
// PICKER — choose a company from the client's own base
// ============================================

function CompanyPicker({
    isOpen,
    onClose,
    onDone,
}: {
    isOpen: boolean;
    onClose: () => void;
    onDone: () => void;
}) {
    const toast = useToast();
    const [companies, setCompanies] = useState<PickerCompany[]>([]);
    const [search, setSearch] = useState("");
    const [isLoading, setLoading] = useState(false);
    const [selected, setSelected] = useState<PickerCompany | null>(null);
    const [isSubmitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSearch("");
        setSelected(null);
        setLoading(true);

        fetch("/api/client/database")
            .then((r) => r.json())
            .then((json) => setCompanies(json.success ? json.data.companies ?? [] : []))
            .catch(() => setCompanies([]))
            .finally(() => setLoading(false));
    }, [isOpen]);

    const results = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const pool = companies.filter((c) => !c.excludedAt);
        if (!needle) return pool.slice(0, 40);
        return pool.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 40);
    }, [companies, search]);

    const submit = async (payload: ExcludePayload) => {
        if (!selected) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/client/exclusions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target: payload.target,
                    companyId: selected.id,
                    reason: payload.reason,
                    duration: payload.duration,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Exclusion impossible");

            toast.success(
                "C'est noté",
                `${json.data.label} ne sera plus contactée. ${json.data.appliedContacts} personne(s) retirée(s).`
            );
            setSelected(null);
            onDone();
        } catch (err) {
            toast.error("Exclusion impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen && !selected}
                onClose={onClose}
                title="Quelle société ne faut-il plus contacter ?"
                size="lg"
            >
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher une société…"
                            className="pl-9"
                            autoFocus
                        />
                    </div>

                    {isLoading ? (
                        <LoadingState />
                    ) : results.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            variant="inline"
                            title="Aucun résultat"
                            description="Aucune société contactable ne correspond à cette recherche."
                        />
                    ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                            {results.map((company) => (
                                <button
                                    key={company.id}
                                    onClick={() => setSelected(company)}
                                    className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-slate-900 break-words">
                                            {company.name}
                                        </span>
                                        <span className="block text-xs text-slate-500">
                                            {company.contacts.length} contact(s)
                                        </span>
                                    </span>
                                    <Ban className="w-4 h-4 text-slate-300 shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <ModalFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Fermer
                    </Button>
                </ModalFooter>
            </Modal>

            {selected && (
                <ExcludeDialog
                    isOpen={!!selected}
                    onClose={() => setSelected(null)}
                    onConfirm={submit}
                    companyName={selected.name}
                    contactName={null}
                    defaultTarget="COMPANY"
                    allowTargetChoice={false}
                    availableScopes={["CLIENT"]}
                    defaultScope="CLIENT"
                    isSubmitting={isSubmitting}
                />
            )}
        </>
    );
}
