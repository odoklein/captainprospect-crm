"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Badge, Button, Callout, Checkbox, Drawer, EmptyState, Field, Input, Select, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiJson, errorMessage } from "../api";
import { SKIP_REASON_LABELS, plural, type MissionOption, type SequenceStatus } from "../types";

interface Candidate {
    id: string;
    name: string | null;
    email: string | null;
    title: string | null;
    companyName: string | null;
    skipReason: string | null;
    otherSequence: string | null;
}

interface CandidateMeta {
    total: number;
    eligible: number;
    shown: number;
    skipped: Record<string, number>;
}

interface EnrollDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    sequenceId: string;
    sequenceStatus: SequenceStatus;
    missions: MissionOption[];
    onEnrolled: () => void;
}

export function EnrollDrawer({ isOpen, onClose, sequenceId, sequenceStatus, missions, onEnrolled }: EnrollDrawerProps) {
    const toast = useToast();
    const [missionId, setMissionId] = useState("");
    const [listId, setListId] = useState("");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [rows, setRows] = useState<Candidate[] | null>(null);
    const [meta, setMeta] = useState<CandidateMeta | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<"manual" | "all">("manual");
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);

    const mission = missions.find((m) => m.id === missionId) ?? null;

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // Reset the selection whenever the scope changes.
    useEffect(() => {
        setMode("manual");
        setPicked(new Set());
        setExcluded(new Set());
    }, [missionId, listId, debounced]);

    useEffect(() => {
        if (!isOpen || !missionId) {
            setRows(null);
            setMeta(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        const params = new URLSearchParams({ missionId });
        if (listId) params.set("listId", listId);
        if (debounced) params.set("q", debounced);
        apiJson<Candidate[]>(`/api/email/sequences/${sequenceId}/candidates?${params}`)
            .then(({ data, meta }) => {
                if (cancelled) return;
                setRows(data ?? []);
                setMeta(meta as CandidateMeta);
            })
            .catch((e) => !cancelled && setLoadError(errorMessage(e, "Impossible de charger les contacts")))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [isOpen, sequenceId, missionId, listId, debounced]);

    const eligibleRows = useMemo(() => (rows ?? []).filter((r) => !r.skipReason), [rows]);

    const isChecked = (id: string) => (mode === "all" ? !excluded.has(id) : picked.has(id));
    const selectedCount = mode === "all" ? Math.max(0, (meta?.eligible ?? 0) - excluded.size) : picked.size;
    const allOnPage = eligibleRows.length > 0 && eligibleRows.every((r) => isChecked(r.id));
    const someOnPage = eligibleRows.some((r) => isChecked(r.id));

    const toggle = (id: string) => {
        if (mode === "all") {
            setExcluded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        } else {
            setPicked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        }
    };

    const selectAll = () => {
        setMode("all");
        setExcluded(new Set());
    };
    const clearAll = () => {
        setMode("manual");
        setPicked(new Set());
        setExcluded(new Set());
    };

    const submit = async () => {
        if (selectedCount === 0) return;
        setSubmitting(true);
        try {
            const body =
                mode === "all"
                    ? { selection: { missionId, listId: listId || undefined, q: debounced || undefined }, excludeIds: Array.from(excluded) }
                    : { contactIds: Array.from(picked) };
            const { data } = await apiJson<{ enrolled: number; skipped: Record<string, number> }>(
                `/api/email/sequences/${sequenceId}/enroll`,
                { method: "POST", json: body },
            );
            const skippedTotal = Object.values(data.skipped ?? {}).reduce((a, b) => a + b, 0);
            toast.success(
                `${plural(data.enrolled, "contact inscrit", "contacts inscrits")}`,
                [
                    skippedTotal ? `${skippedTotal} ignoré${skippedTotal > 1 ? "s" : ""}.` : "",
                    sequenceStatus === "ACTIVE" ? "Les envois commencent au prochain créneau." : "Ils recevront le premier email dès l'activation de la séquence.",
                ]
                    .filter(Boolean)
                    .join(" "),
            );
            clearAll();
            onEnrolled();
            onClose();
        } catch (e) {
            toast.error("Inscription impossible", errorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const skippedEntries = Object.entries(meta?.skipped ?? {}).filter(([, n]) => n > 0);

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title="Inscrire des contacts"
            description="Choisissez une mission puis, si besoin, une liste. Les contacts sans email, exclus ou désinscrits sont écartés automatiquement."
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] text-ink-3">
                        {sequenceStatus === "ACTIVE"
                            ? "Le premier email part au prochain créneau d'envoi."
                            : "La séquence n'est pas active : rien ne part avant son activation."}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>Annuler</Button>
                        <Button onClick={submit} isLoading={submitting} disabled={selectedCount === 0}>
                            {selectedCount ? `Inscrire ${plural(selectedCount, "contact")}` : "Inscrire"}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Mission" required>
                        <Select
                            value={missionId}
                            onChange={(v) => {
                                setMissionId(v);
                                setListId("");
                            }}
                            placeholder={missions.length ? "Choisir une mission…" : "Aucune mission active"}
                            searchable
                            options={missions.map((m) => ({ value: m.id, label: m.clientName ? `${m.name} · ${m.clientName}` : m.name }))}
                        />
                    </Field>
                    <Field label="Liste">
                        <Select
                            value={listId}
                            onChange={setListId}
                            disabled={!mission}
                            searchable={(mission?.lists.length ?? 0) > 8}
                            options={[
                                { value: "", label: "Toutes les listes de la mission" },
                                ...(mission?.lists ?? []).map((l) => ({ value: l.id, label: l.name })),
                            ]}
                        />
                    </Field>
                </div>

                {!missionId && (
                    <EmptyState
                        variant="inline"
                        icon={Users}
                        title="Commencez par choisir une mission"
                        description="Vous verrez ses contacts, qui peut recevoir la séquence et pourquoi certains sont écartés."
                    />
                )}

                {missionId && (
                    <>
                        <Input
                            size="sm"
                            placeholder="Filtrer par nom, email, poste ou entreprise…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            icon={<Search className="size-4" />}
                            aria-label="Filtrer les contacts"
                        />

                        {loadError && <Callout tone="danger">{loadError}</Callout>}

                        {meta && (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px]">
                                <span className="font-semibold text-ink">{plural(meta.eligible, "contact inscriptible", "contacts inscriptibles")}</span>
                                <span className="text-ink-3">sur {meta.total.toLocaleString("fr-FR")}</span>
                                {skippedEntries.map(([reason, n]) => (
                                    <Badge key={reason} variant="default" size="sm">
                                        {SKIP_REASON_LABELS[reason] ?? reason} : {n.toLocaleString("fr-FR")}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {loading && !rows && (
                            <div className="space-y-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <Skeleton key={i} className="h-11 w-full rounded-lg" />
                                ))}
                            </div>
                        )}

                        {rows && rows.length === 0 && !loading && (
                            <EmptyState variant="inline" icon={Users} title="Aucun contact" description={debounced ? "Aucun contact ne correspond à ce filtre." : "Cette sélection ne contient aucun contact."} />
                        )}

                        {rows && rows.length > 0 && (
                            <div className={cn("overflow-hidden rounded-xl border border-line", loading && "opacity-60")}>
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
                                    <Checkbox
                                        checked={allOnPage}
                                        indeterminate={!allOnPage && someOnPage}
                                        disabled={eligibleRows.length === 0}
                                        onChange={(e) => (e.target.checked ? selectAll() : clearAll())}
                                        label={
                                            mode === "all"
                                                ? `${plural(selectedCount, "contact sélectionné", "contacts sélectionnés")}`
                                                : `Tout sélectionner (${plural(meta?.eligible ?? 0, "éligible")})`
                                        }
                                    />
                                    {selectedCount > 0 && (
                                        <button type="button" onClick={clearAll} className="text-xs font-medium text-link hover:underline">
                                            Tout désélectionner
                                        </button>
                                    )}
                                </div>
                                <ul className="max-h-[52vh] divide-y divide-line-subtle overflow-y-auto">
                                    {rows.map((c) => {
                                        const disabled = !!c.skipReason;
                                        return (
                                            <li key={c.id} className={cn("flex items-center gap-3 px-3 py-2", disabled ? "bg-surface-2/60" : "hover:bg-surface-2")}>
                                                <Checkbox
                                                    checked={!disabled && isChecked(c.id)}
                                                    disabled={disabled}
                                                    onChange={() => toggle(c.id)}
                                                    aria-label={`Sélectionner ${c.name ?? c.email ?? "ce contact"}`}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className={cn("truncate text-[13px] font-medium", disabled ? "text-ink-3" : "text-ink")}>
                                                        {c.name || "Sans nom"}
                                                        {c.companyName && <span className="font-normal text-ink-3"> · {c.companyName}</span>}
                                                    </p>
                                                    <p className="truncate text-xs text-ink-3">
                                                        {c.email || "Pas d'email"}
                                                        {c.title && <span className="text-ink-4"> · {c.title}</span>}
                                                    </p>
                                                </div>
                                                {c.skipReason ? (
                                                    <Badge variant={c.skipReason === "ALREADY_ENROLLED" ? "info" : "default"} size="sm">
                                                        {SKIP_REASON_LABELS[c.skipReason] ?? c.skipReason}
                                                    </Badge>
                                                ) : c.otherSequence ? (
                                                    <Badge variant="warning" size="sm" title={`Déjà en cours dans « ${c.otherSequence} »`}>
                                                        Dans une autre séquence
                                                    </Badge>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {meta && meta.total > meta.shown && (
                                    <p className="border-t border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
                                        Les {meta.shown} premiers contacts sont affichés. « Tout sélectionner » inclut les {meta.eligible.toLocaleString("fr-FR")} contacts
                                        inscriptibles ; filtrez pour cibler plus finement.
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Drawer>
    );
}
