"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Loader2, Phone, UserRound } from "lucide-react";
import { Button, Callout, Checkbox, Drawer, Field, Input, SegmentedControl, Select, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { suggestListName } from "@/lib/sourcing/merge";
import type { CrmMatch, SourcedLead, SourcingImportResult, SourcingQuery } from "@/lib/sourcing/types";

// ============================================
// "Ajouter à une liste": destination, duplicates policy, then a result
// screen that links to the list instead of silently bouncing back.
// Large selections are sent in batches so the old 2 000-row request cap
// never blocks a sourcing run.
// ============================================

const IMPORT_BATCH = 1000;

interface ListOption {
    id: string;
    name: string;
    isArchived?: boolean;
    mission?: { name: string };
    _count?: { companies: number };
}
interface MissionOption {
    id: string;
    name: string;
    client?: { name: string };
}

export function ImportDrawer({
    open,
    onClose,
    leads,
    matches,
    query,
    onImported,
}: {
    open: boolean;
    onClose: () => void;
    leads: SourcedLead[];
    matches: Record<string, CrmMatch>;
    query?: SourcingQuery;
    onImported: (result: SourcingImportResult, importedIds: string[]) => void;
}) {
    const { error: showError } = useToast();
    const [mode, setMode] = useState<"new" | "existing">("new");
    const [lists, setLists] = useState<ListOption[]>([]);
    const [missions, setMissions] = useState<MissionOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [listId, setListId] = useState("");
    const [name, setName] = useState("");
    const [missionId, setMissionId] = useState("");
    const [type, setType] = useState<"SUZALI" | "CLIENT" | "MIXED">("SUZALI");
    const [skipKnown, setSkipKnown] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SourcingImportResult | null>(null);
    const [importLimit, setImportLimit] = useState<number | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [partialError, setPartialError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setResult(null);
        setPartialError(null);
        setProgress(null);
        setImportLimit(null);
        setName(suggestListName(query?.activities.map((a) => a.label) ?? [], query?.locations ?? []));
        setLoading(true);
        Promise.all([
            fetch("/api/lists?limit=200").then((r) => r.json()),
            fetch("/api/missions?isActive=true&limit=100").then((r) => r.json()),
        ])
            .then(([l, m]) => {
                if (l.success) setLists((l.data as ListOption[]).filter((x) => !x.isArchived));
                if (m.success && Array.isArray(m.data)) setMissions(m.data);
            })
            .catch(() => showError("Erreur", "Impossible de charger listes et missions"))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const knownCount = leads.filter((l) => matches[l.id]).length;
    const toImport = useMemo(() => (skipKnown ? leads.filter((l) => !matches[l.id]) : leads), [leads, matches, skipKnown]);
    const available = toImport.length;
    const importCount = available === 0 ? 0 : Math.min(importLimit ?? available, available);
    const selectedForImport = useMemo(() => toImport.slice(0, importCount), [toImport, importCount]);
    const stats = {
        companies: selectedForImport.length,
        phones: selectedForImport.filter((l) => l.phone).length,
        contacts: selectedForImport.reduce((n, l) => n + l.contacts.length, 0),
    };

    const valid = selectedForImport.length > 0 && (mode === "existing" ? !!listId : !!name.trim() && !!missionId);

    const submit = async () => {
        const queue = selectedForImport;
        const total = queue.length;
        let currentListId = mode === "existing" ? listId : undefined;
        let aggregate: SourcingImportResult = { listId: "", listName: "", created: 0, skipped: 0, contacts: 0, phones: 0 };
        const importedIds: string[] = [];
        setSubmitting(true);
        setProgress({ done: 0, total });
        try {
            for (let offset = 0; offset < total; offset += IMPORT_BATCH) {
                const chunk = queue.slice(offset, offset + IMPORT_BATCH);
                const res = await fetch("/api/prospects/sourcing/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...(currentListId ? { listId: currentListId } : { newList: { name: name.trim(), missionId, type } }),
                        leads: chunk,
                        query,
                    }),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Import impossible");
                const data = json.data as SourcingImportResult;
                currentListId = data.listId;
                aggregate = {
                    ...aggregate,
                    listId: data.listId,
                    listName: data.listName,
                    created: aggregate.created + data.created,
                    skipped: aggregate.skipped + data.skipped,
                    contacts: aggregate.contacts + data.contacts,
                    phones: aggregate.phones + data.phones,
                };
                importedIds.push(...chunk.map((l) => l.id));
                setProgress({ done: Math.min(offset + chunk.length, total), total });
            }
            setResult(aggregate);
            onImported(aggregate, importedIds);
        } catch (e) {
            const message = e instanceof Error ? e.message : "Erreur inconnue";
            if (aggregate.created > 0) {
                setResult(aggregate);
                setPartialError(message);
                onImported(aggregate, importedIds);
            } else {
                showError("Import échoué", message);
            }
        } finally {
            setSubmitting(false);
            setProgress(null);
        }
    };

    return (
        <Drawer
            isOpen={open}
            onClose={submitting ? () => {} : onClose}
            size="md"
            title={result ? (partialError ? "Import partiel" : "Import terminé") : "Ajouter à une liste"}
            description={result ? result.listName : `${leads.length} société${leads.length > 1 ? "s" : ""} sélectionnée${leads.length > 1 ? "s" : ""}`}
            footer={
                result ? (
                    <div className="flex w-full gap-2">
                        <Button variant="secondary" className="flex-1" onClick={onClose}>
                            Continuer le sourcing
                        </Button>
                        <Link href={`/manager/lists/${result.listId}`} className="flex-1">
                            <Button className="w-full">
                                Ouvrir la liste <ArrowRight className="size-4" />
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="flex w-full gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={submitting}>
                            Annuler
                        </Button>
                        <Button className="flex-1" onClick={submit} disabled={!valid || submitting}>
                            {submitting && <Loader2 className="size-4 animate-spin" />}
                            {submitting && progress
                                ? `Import en cours… ${progress.done.toLocaleString("fr-FR")} / ${progress.total.toLocaleString("fr-FR")}`
                                : `Importer ${stats.companies.toLocaleString("fr-FR")} société${stats.companies > 1 ? "s" : ""}`}
                        </Button>
                    </div>
                )
            }
        >
            {result ? (
                <div className="space-y-5 p-1">
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <span className="inline-flex size-12 items-center justify-center rounded-full bg-success-soft">
                            <CheckCircle2 className="size-6 text-success" />
                        </span>
                        <p className="text-base font-semibold text-ink">
                            {result.created.toLocaleString("fr-FR")} société{result.created > 1 ? "s" : ""} ajoutée{result.created > 1 ? "s" : ""}
                        </p>
                        {result.skipped > 0 && (
                            <p className="text-sm text-ink-3">
                                {result.skipped} déjà présente{result.skipped > 1 ? "s" : ""} dans la liste, ignorée{result.skipped > 1 ? "s" : ""}
                            </p>
                        )}
                    </div>
                    <Tiles companies={result.created} phones={result.phones} contacts={result.contacts} />
                    {partialError && (
                        <Callout tone="warning" title="Import interrompu">
                            {partialError} Les sociétés déjà ajoutées restent dans la liste ; vous pouvez relancer l&apos;import
                            pour le reste.
                        </Callout>
                    )}
                    <Callout tone="info">
                        La BlackList a été réappliquée à la liste. Pensez à l&apos;assigner aux SDR depuis la mission.
                    </Callout>
                </div>
            ) : (
                <div className="space-y-6 p-1">
                    <Tiles companies={stats.companies} phones={stats.phones} contacts={stats.contacts} />

                    <Field
                        label="Sociétés à importer"
                        hint={
                            available === 0
                                ? "Aucune société à importer avec ce filtre."
                                : `${importCount.toLocaleString("fr-FR")} sur ${available.toLocaleString("fr-FR")} seront ajoutées à la liste.`
                        }
                    >
                        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2">
                            <Input
                                type="number"
                                inputMode="numeric"
                                min={available ? 1 : 0}
                                max={Math.max(available, 1)}
                                value={importCount}
                                disabled={available === 0 || submitting}
                                aria-label="Nombre de sociétés à importer"
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next)) {
                                        setImportLimit(null);
                                        return;
                                    }
                                    setImportLimit(Math.max(1, Math.min(Math.floor(next), available)));
                                }}
                            />
                            <div className="flex flex-wrap gap-1.5">
                                {[100, 500, 1000, 5000]
                                    .filter((n) => n < available)
                                    .map((n) => (
                                        <Button
                                            key={n}
                                            type="button"
                                            variant="soft"
                                            size="xs"
                                            onClick={() => setImportLimit(n)}
                                            disabled={submitting}
                                        >
                                            {n.toLocaleString("fr-FR")}
                                        </Button>
                                    ))}
                                <Button
                                    type="button"
                                    variant={importLimit === null ? "secondary" : "ghost"}
                                    size="xs"
                                    onClick={() => setImportLimit(null)}
                                    disabled={available === 0 || submitting}
                                >
                                    Tout ({available.toLocaleString("fr-FR")})
                                </Button>
                            </div>
                        </div>
                    </Field>

                    {submitting && progress && (
                        <div className="space-y-1.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                                    style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                                />
                            </div>
                            <p className="text-xs tabular-nums text-ink-3">
                                Import en cours : {progress.done.toLocaleString("fr-FR")} / {progress.total.toLocaleString("fr-FR")}
                            </p>
                        </div>
                    )}

                    {knownCount > 0 && (
                        <div className="rounded-panel border border-warning-line bg-warning-soft p-3">
                            <Checkbox
                                checked={skipKnown}
                                onChange={(e) => setSkipKnown(e.target.checked)}
                                label={`Ignorer les ${knownCount} sociétés déjà présentes dans le CRM`}
                                description="Elles sont travaillées dans une autre liste : les réimporter crée des doublons d'appels."
                            />
                        </div>
                    )}

                    <div className="space-y-4">
                        <SegmentedControl
                            fullWidth
                            ariaLabel="Destination"
                            value={mode}
                            onChange={setMode}
                            options={[
                                { value: "new", label: "Nouvelle liste" },
                                { value: "existing", label: "Liste existante" },
                            ]}
                        />

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="size-5 animate-spin text-ink-4" />
                            </div>
                        ) : mode === "new" ? (
                            <div className="space-y-4">
                                <Field label="Nom de la liste" required>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                                </Field>
                                <Field label="Mission" required hint="La liste sera rattachée à cette mission.">
                                    <Select
                                        searchable
                                        placeholder="Choisir une mission…"
                                        value={missionId}
                                        onChange={setMissionId}
                                        options={missions.map((m) => ({
                                            value: m.id,
                                            label: m.client?.name ? `${m.name} — ${m.client.name}` : m.name,
                                        }))}
                                    />
                                </Field>
                                <Field label="Type de fichier">
                                    <SegmentedControl
                                        fullWidth
                                        size="sm"
                                        ariaLabel="Type de liste"
                                        value={type}
                                        onChange={setType}
                                        options={[
                                            { value: "SUZALI", label: "Interne" },
                                            { value: "CLIENT", label: "Client" },
                                            { value: "MIXED", label: "Mixte" },
                                        ]}
                                    />
                                </Field>
                            </div>
                        ) : (
                            <Field label="Liste cible" required hint="Les sociétés déjà présentes (même nom) sont ignorées.">
                                <Select
                                    searchable
                                    placeholder="Choisir une liste…"
                                    value={listId}
                                    onChange={setListId}
                                    maxHeight={320}
                                    options={lists.map((l) => ({
                                        value: l.id,
                                        label: `${l.name}${l.mission?.name ? ` — ${l.mission.name}` : ""} (${l._count?.companies ?? 0})`,
                                    }))}
                                />
                            </Field>
                        )}
                    </div>

                    <p className="text-xs text-ink-3">
                        Enregistré pour chaque société : téléphone, site, adresse, SIREN, code NAF, effectif, note Google et
                        dirigeants, selon les sources.
                    </p>
                </div>
            )}
        </Drawer>
    );
}

function Tiles({ companies, phones, contacts }: { companies: number; phones: number; contacts: number }) {
    const items = [
        { icon: Building2, label: "Sociétés", value: companies },
        { icon: Phone, label: "Avec téléphone", value: phones },
        { icon: UserRound, label: "Contacts", value: contacts },
    ];
    return (
        <div className="grid grid-cols-3 gap-2">
            {items.map(({ icon: Icon, label, value }) => (
                <div key={label} className={cn("rounded-panel border border-line bg-surface-2 p-3")}>
                    <Icon className="mb-2 size-4 text-ink-4" />
                    <div className="text-xl font-bold tabular-nums text-ink">{value.toLocaleString("fr-FR")}</div>
                    <div className="text-xs text-ink-3">{label}</div>
                </div>
            ))}
        </div>
    );
}
