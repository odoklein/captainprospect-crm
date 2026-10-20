"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Combine, ListPlus, MapPinned, RotateCcw, ScanSearch, X } from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { QueryComposer } from "@/components/sourcing/QueryComposer";
import { RunStrip } from "@/components/sourcing/RunStrip";
import { ResultsTable } from "@/components/sourcing/ResultsTable";
import { ImportDrawer } from "@/components/sourcing/ImportDrawer";
import { useSourcing } from "@/components/sourcing/useSourcing";
import type { ProvidersStatus, SourcingQuery } from "@/lib/sourcing/types";

// ============================================
// /manager/lists/sourcing — find companies across sources, merge, dedupe
// against the CRM, push the selection into a list.
// ============================================

const EXAMPLES: { title: string; query: Partial<SourcingQuery> }[] = [
    { title: "Experts-comptables à Lyon", query: { activities: [{ label: "Expert-comptable", naf: "69.20Z" }], locations: ["Lyon (69)"] } },
    { title: "Plombiers et chauffagistes en Gironde", query: { activities: [{ label: "Plombier", naf: "43.22A" }, { label: "Chauffagiste", naf: "43.22B" }], locations: ["Gironde (33)"] } },
    { title: "Agences immobilières à Nantes et Rennes", query: { activities: [{ label: "Agence immobilière", naf: "68.31Z" }], locations: ["Nantes (44)", "Rennes (35)"] } },
];

export default function SourcingPage() {
    const s = useSourcing();
    const [providers, setProviders] = useState<ProvidersStatus | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importOpen, setImportOpen] = useState(false);

    useEffect(() => {
        fetch("/api/prospects/sourcing/providers")
            .then((r) => r.json())
            .then((j) => j.success && setProviders(j.data))
            .catch(() => {});
    }, []);

    // Drop the selection when a new run starts.
    const runKey = Object.values(s.runs).map((r) => r?.startedAt).join();
    useEffect(() => setSelected(new Set()), [runKey]);

    const selectedLeads = useMemo(() => s.leads.filter((l) => selected.has(l.id)), [s.leads, selected]);
    const selPhones = selectedLeads.filter((l) => l.phone).length;
    const selContacts = selectedLeads.reduce((n, l) => n + l.contacts.length, 0);
    const hasRun = Object.keys(s.runs).length > 0;
    const multiSource = s.leads.filter((l) => l.sources.length > 1).length;

    return (
        <div className="space-y-6 pb-24">
            <PageHeader
                eyebrow={
                    <Link href="/manager/lists" className="inline-flex items-center gap-1 hover:text-ink">
                        <ArrowLeft className="size-3.5" /> Listes
                    </Link>
                }
                title="Sourcing"
                subtitle="Trouvez des sociétés sur Google Maps, le registre officiel et Apollo, puis versez-les dans une liste."
                icon={<ScanSearch />}
                actions={
                    hasRun && !s.isRunning ? (
                        <Button variant="secondary" onClick={s.reset}>
                            <RotateCcw className="size-4" /> Nouvelle recherche
                        </Button>
                    ) : null
                }
            />

            <div className="grid items-start gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="xl:sticky xl:top-4">
                    <QueryComposer
                        query={s.query}
                        sources={s.sources}
                        providers={providers}
                        isRunning={s.isRunning}
                        onQueryChange={s.setQuery}
                        onSourcesChange={s.setSources}
                        onRun={s.run}
                    />
                </aside>

                <main className="min-w-0 space-y-4">
                    <RunStrip runs={s.runs} onCancelGmaps={s.cancelGmaps} />

                    {s.leads.length > 0 && (
                        <>
                            {multiSource > 0 && (
                                <p className="flex items-center gap-1.5 text-xs text-ink-3">
                                    <Combine className="size-3.5" />
                                    {multiSource} société{multiSource > 1 ? "s" : ""} trouvée{multiSource > 1 ? "s" : ""} par plusieurs
                                    sources, fusionnée{multiSource > 1 ? "s" : ""} en une seule ligne.
                                </p>
                            )}
                            <ResultsTable leads={s.leads} matches={s.matches} selected={selected} onSelectedChange={setSelected} />
                        </>
                    )}

                    {s.leads.length === 0 && s.isRunning && <RunningPlaceholder />}

                    {s.leads.length === 0 && !s.isRunning && hasRun && (
                        <div className="rounded-card border border-line bg-surface px-6 py-14 text-center shadow-card">
                            <p className="text-base font-semibold text-ink">Aucune société trouvée</p>
                            <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">
                                Élargissez la zone (département plutôt que ville), essayez un autre intitulé d&apos;activité ou
                                ajoutez une source.
                            </p>
                        </div>
                    )}

                    {s.hydrated && !hasRun && (
                        <Intro
                            onExample={(q) => {
                                s.setQuery(q);
                            }}
                        />
                    )}
                </main>
            </div>

            {/* Selection bar */}
            {selected.size > 0 && (
                <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
                    <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-card bg-inverse py-2.5 pl-5 pr-2.5 text-inverse-ink shadow-overlay animate-ds-enter">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold tabular-nums">
                                {selected.size.toLocaleString("fr-FR")} société{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
                            </div>
                            <div className="truncate text-xs text-inverse-ink-2 tabular-nums">
                                {selPhones} avec téléphone · {selContacts} contact{selContacts > 1 ? "s" : ""}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            aria-label="Vider la sélection"
                            className={cn("inline-flex size-9 items-center justify-center rounded-control text-inverse-ink-2 hover:bg-inverse-raised hover:text-inverse-ink", FOCUS_RING)}
                        >
                            <X className="size-4" />
                        </button>
                        <Button variant="accent" onClick={() => setImportOpen(true)}>
                            <ListPlus className="size-4" /> Ajouter à une liste
                        </Button>
                    </div>
                </div>
            )}

            <ImportDrawer
                open={importOpen}
                onClose={() => setImportOpen(false)}
                leads={selectedLeads}
                matches={s.matches}
                query={s.ranQuery}
                onImported={(_, ids) => {
                    setSelected((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => next.delete(id));
                        return next;
                    });
                    void s.refreshMatches();
                }}
            />
        </div>
    );
}

function RunningPlaceholder() {
    return (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4 text-sm text-ink-3">
                Les résultats s&apos;affichent dès qu&apos;une source répond. Une recherche longue peut être quittée :
                elle reprendra au retour sur la page.
            </div>
            <div className="divide-y divide-line-subtle">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="size-[18px] rounded-[6px] bg-surface-3" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-3" />
                            <div className="h-2.5 w-1/5 animate-pulse rounded bg-surface-3" />
                        </div>
                        <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
                        <div className="h-3 w-32 animate-pulse rounded bg-surface-3" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function Intro({ onExample }: { onExample: (q: Partial<SourcingQuery>) => void }) {
    const steps = [
        { icon: MapPinned, title: "Décrivez la cible", text: "Une ou plusieurs activités, une ou plusieurs zones. Chaque combinaison devient une recherche." },
        { icon: Combine, title: "Croisez les sources", text: "Maps apporte le standard et le site, le Registre le SIREN et les dirigeants. Une société trouvée deux fois n'apparaît qu'une fois." },
        { icon: ListPlus, title: "Versez dans une liste", text: "Les sociétés déjà au CRM sont signalées. L'import garde téléphone, adresse et contacts." },
    ];
    return (
        <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
            <div className="grid gap-6 md:grid-cols-3">
                {steps.map(({ icon: Icon, title, text }, i) => (
                    <div key={title}>
                        <div className="mb-3 flex items-center gap-2">
                            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100">
                                <Icon className="size-4" />
                            </span>
                            <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4">Étape {i + 1}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-ink">{title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-ink-3">{text}</p>
                    </div>
                ))}
            </div>
            <div className="mt-8 border-t border-line pt-5">
                <div className="mb-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">Essayer avec</div>
                <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((e) => (
                        <button
                            key={e.title}
                            type="button"
                            onClick={() => onExample(e.query)}
                            className={cn(
                                "group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 transition-colors hover:border-primary-300 hover:text-primary-700",
                                FOCUS_RING,
                            )}
                        >
                            {e.title}
                            <ArrowRight className="size-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
