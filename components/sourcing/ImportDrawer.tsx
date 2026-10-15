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
// ============================================

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

    useEffect(() => {
        if (!open) return;
        setResult(null);
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
    const stats = {
        companies: toImport.length,
        phones: toImport.filter((l) => l.phone).length,
        contacts: toImport.reduce((n, l) => n + l.contacts.length, 0),
    };

    const valid = toImport.length > 0 && (mode === "existing" ? !!listId : !!name.trim() && !!missionId);

    const submit = async () => {
        setSubmitting(true);
        try {
            const res = await fetch("/api/prospects/sourcing/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(mode === "existing" ? { listId } : { newList: { name: name.trim(), missionId, type } }),
                    leads: toImport,
                    query,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Import impossible");
            setResult(json.data);
            onImported(json.data, toImport.map((l) => l.id));
        } catch (e) {
            showError("Import échoué", e instanceof Error ? e.message : "Erreur inconnue");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Drawer
            isOpen={open}
            onClose={submitting ? () => {} : onClose}
            size="md"
            title={result ? "Import terminé" : "Ajouter à une liste"}
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
                            Importer {stats.companies.toLocaleString("fr-FR")} société{stats.companies > 1 ? "s" : ""}
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
                    <Callout tone="info">
                        La BlackList a été réappliquée à la liste. Pensez à l&apos;assigner aux SDR depuis la mission.
                    </Callout>
                </div>
            ) : (
                <div className="space-y-6 p-1">
                    <Tiles companies={stats.companies} phones={stats.phones} contacts={stats.contacts} />

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
